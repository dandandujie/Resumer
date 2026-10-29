use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};

use super::provider::{AIConfig, ChatMessage, ProviderError, ToolSpec};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    TextDelta {
        text: String,
    },
    ReasoningDelta {
        text: String,
    },
    ToolCallStart {
        id: String,
        name: String,
    },
    ToolCallArgs {
        id: String,
        args: Value,
    },
    ToolResult {
        id: String,
        name: String,
        result: Value,
    },
    Finish {
        final_text: String,
    },
    Error {
        message: String,
    },
}

/// Cooperative cancellation — the stop button inserts a stream_id here and
/// every chunk loop polls it between chunks.
static CANCEL_SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn cancel_set() -> &'static Mutex<HashSet<String>> {
    CANCEL_SET.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn request_cancel(stream_id: &str) {
    cancel_set().lock().unwrap().insert(stream_id.to_string());
}

pub fn is_cancelled(stream_id: &str) -> bool {
    cancel_set().lock().unwrap().contains(stream_id)
}

pub fn clear_cancel(stream_id: &str) {
    cancel_set().lock().unwrap().remove(stream_id);
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

impl Usage {
    pub fn add(&mut self, other: &Usage) {
        self.prompt_tokens += other.prompt_tokens;
        self.completion_tokens += other.completion_tokens;
        self.total_tokens += other.total_tokens;
    }
}

pub struct ChatStreamResult {
    pub text: String,
    pub tool_calls: Vec<super::provider::ToolCall>,
    pub usage: Usage,
}

fn is_native_search_error(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    m.contains("search")
        || m.contains("google_search")
        || m.contains("web_search")
        || m.contains("grounding")
        || m.contains("tool_config")
        || m.contains("server_side_tool")
        || m.contains("server-side tool")
        || m.contains("built-in tool")
        || m.contains("builtin tool")
        || m.contains("live search")
        || m.contains("search_parameters")
}

pub async fn stream_chat(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let result = stream_dispatch(app, stream_id, config, system, messages, tools).await;
    if config.web_search_mode == "native"
        && let Err(error) = &result
        && is_native_search_error(&error.to_string())
    {
        log::warn!("native search rejected ({error}); retrying without built-in search");
        let mut fallback = config.clone();
        fallback.web_search_mode = "off".into();
        return stream_dispatch(app, stream_id, &fallback, system, messages, tools).await;
    }
    result
}

async fn stream_dispatch(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    match config.provider.as_str() {
        "anthropic" => stream_anthropic(app, stream_id, config, system, messages, tools).await,
        "gemini" => stream_gemini(app, stream_id, config, system, messages, tools).await,
        _ => {
            // GPT models default to the OpenAI Responses protocol; if that endpoint
            // is unavailable (e.g. a relay that only speaks chat/completions), the
            // request fails before anything streams, so we fall back to chat.
            if config.model.to_ascii_lowercase().contains("gpt") {
                match stream_openai_responses(app, stream_id, config, system, messages, tools).await
                {
                    Ok(r) => Ok(r),
                    Err(e) => {
                        log::warn!(
                            "responses API unavailable ({e}); falling back to chat/completions"
                        );
                        stream_openai(app, stream_id, config, system, messages, tools).await
                    }
                }
            } else {
                stream_openai(app, stream_id, config, system, messages, tools).await
            }
        }
    }
}

fn emit(app: &AppHandle, stream_id: &str, event: StreamEvent) {
    let payload = json!({ "streamId": stream_id, "event": event });
    let _ = app.emit("ai-chat-event", payload);
}

async fn stream_openai(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

    let mut msgs: Vec<Value> = Vec::new();
    if !system.is_empty() {
        msgs.push(json!({ "role": "system", "content": system }));
    }
    for m in messages {
        msgs.push(json!({ "role": m.role, "content": m.content }));
    }

    let mut body = json!({
        "model": config.model,
        "messages": msgs,
        "stream": true,
        // Ask the server to append a final chunk carrying token usage.
        "stream_options": { "include_usage": true },
    });

    // Many OpenAI-compatible endpoints default to a tiny completion budget
    // (e.g. 1024) and silently cut replies mid-sentence — always be explicit.
    // o-series / gpt-5 家族 reject max_tokens and want max_completion_tokens.
    let ml = config.model.to_ascii_lowercase();
    if ml.starts_with("o1") || ml.starts_with("o3") || ml.starts_with("o4") || ml.contains("gpt-5")
    {
        body["max_completion_tokens"] = json!(8192);
    } else {
        body["max_tokens"] = json!(8192);
    }

    if let Some(ts) = tools
        && !ts.is_empty()
    {
        body["tools"] = json!(
            ts.iter()
                .map(|t| json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                }))
                .collect::<Vec<_>>()
        );
    }

    if config.web_search_mode == "native" {
        let is_grok = config.base_url.to_ascii_lowercase().contains("x.ai")
            || config.model.to_ascii_lowercase().contains("grok");
        if is_grok {
            body["search_parameters"] = json!({ "mode": "auto", "return_citations": true });
        }
    }

    let res = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(super::provider::api_error(status, &txt, config));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut byte_buf: Vec<u8> = Vec::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    // Accumulate tool-call argument strings by index
    let mut pending_tc: std::collections::HashMap<u32, (String, String, String)> =
        std::collections::HashMap::new();
    // Wire-tap diagnostics: figure out WHY a stream ended.
    let mut frame_count: u64 = 0;
    let mut last_finish_reason: Option<String> = None;
    let mut saw_done = false;
    let mut last_raw_tail = String::new();
    let mut citations: Vec<String> = Vec::new();
    let mut usage = Usage::default();

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        let chunk = chunk?;
        // UTF-8-safe accumulation: a multi-byte char split across network
        // chunks must not be lossy-replaced.
        byte_buf.extend_from_slice(&chunk);
        match std::str::from_utf8(&byte_buf) {
            Ok(text) => {
                buffer.push_str(text);
                byte_buf.clear();
            }
            Err(e) => {
                let valid = e.valid_up_to();
                buffer.push_str(std::str::from_utf8(&byte_buf[..valid]).unwrap_or(""));
                byte_buf.drain(..valid);
            }
        }
        // Normalize CRLF so \r\n\r\n event delimiters parse too.
        if buffer.contains('\r') {
            buffer = buffer.replace("\r\n", "\n");
        }

        while let Some(idx) = buffer.find("\n\n") {
            let line = buffer[..idx].to_string();
            buffer.drain(..idx + 2);

            for l in line.lines() {
                if let Some(data) = l.strip_prefix("data: ").or_else(|| l.strip_prefix("data:")) {
                    frame_count += 1;
                    if data.len() < 400 {
                        last_raw_tail = data.to_string();
                    }
                    if data.trim() == "[DONE]" {
                        saw_done = true;
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        if let Some(cits) = v.get("citations").and_then(|c| c.as_array()) {
                            citations = cits
                                .iter()
                                .filter_map(|c| c.as_str().map(str::to_string))
                                .collect();
                        }
                        if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
                            let p = u.get("prompt_tokens").and_then(|x| x.as_u64()).unwrap_or(0);
                            let c = u
                                .get("completion_tokens")
                                .and_then(|x| x.as_u64())
                                .unwrap_or(0);
                            let tot = u
                                .get("total_tokens")
                                .and_then(|x| x.as_u64())
                                .unwrap_or(p + c);
                            if p + c + tot > 0 {
                                usage = Usage {
                                    prompt_tokens: p,
                                    completion_tokens: c,
                                    total_tokens: tot,
                                };
                            }
                        }
                        let choice = v
                            .get("choices")
                            .and_then(|c| c.get(0))
                            .cloned()
                            .unwrap_or(Value::Null);
                        if let Some(fr) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                            last_finish_reason = Some(fr.to_string());
                        }
                        if choice.get("finish_reason").and_then(|f| f.as_str()) == Some("length") {
                            let notice = "\n\n> ⚠️ 输出达到长度上限被截断，可回复“继续”接着生成。";
                            text_out.push_str(notice);
                            emit(
                                app,
                                stream_id,
                                StreamEvent::TextDelta {
                                    text: notice.to_string(),
                                },
                            );
                        }
                        let delta = choice.get("delta").cloned().unwrap_or(Value::Null);

                        if let Some(content) = delta.get("content").and_then(|c| c.as_str())
                            && !content.is_empty()
                        {
                            text_out.push_str(content);
                            emit(
                                app,
                                stream_id,
                                StreamEvent::TextDelta {
                                    text: content.to_string(),
                                },
                            );
                        }

                        // Reasoning models (DeepSeek-R1 / QwQ / etc.) stream the
                        // chain-of-thought in reasoning_content (or reasoning);
                        // surface it so the UI can show a collapsible think block.
                        if let Some(reasoning) = delta
                            .get("reasoning_content")
                            .and_then(|c| c.as_str())
                            .or_else(|| delta.get("reasoning").and_then(|c| c.as_str()))
                            && !reasoning.is_empty()
                        {
                            emit(
                                app,
                                stream_id,
                                StreamEvent::ReasoningDelta {
                                    text: reasoning.to_string(),
                                },
                            );
                        }

                        if let Some(tcs) = delta.get("tool_calls").and_then(|a| a.as_array()) {
                            for tc in tcs {
                                let idx =
                                    tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                                let entry = pending_tc.entry(idx).or_insert_with(|| {
                                    (String::new(), String::new(), String::new())
                                });
                                if let Some(id) = tc.get("id").and_then(|v| v.as_str())
                                    && entry.0.is_empty()
                                {
                                    entry.0 = id.to_string();
                                }
                                if let Some(f) = tc.get("function") {
                                    if let Some(name) = f.get("name").and_then(|v| v.as_str())
                                        && entry.1.is_empty()
                                    {
                                        entry.1 = name.to_string();
                                        emit(
                                            app,
                                            stream_id,
                                            StreamEvent::ToolCallStart {
                                                id: entry.0.clone(),
                                                name: name.to_string(),
                                            },
                                        );
                                    }
                                    if let Some(args) = f.get("arguments").and_then(|v| v.as_str())
                                    {
                                        entry.2.push_str(args);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // End-of-stream forensics: always log how the stream terminated.
    log::info!(
        "openai stream ended: frames={} finish_reason={:?} done_marker={} text_len={} tool_calls={} tail={}",
        frame_count,
        last_finish_reason,
        saw_done,
        text_out.chars().count(),
        pending_tc.len(),
        &last_raw_tail.chars().take(200).collect::<String>()
    );
    // A stream that ends with no finish_reason and no [DONE] was cut upstream
    // (proxy timeout / connection drop) — tell the user instead of silence.
    if !saw_done && last_finish_reason.is_none() && pending_tc.is_empty() && !text_out.is_empty() {
        let notice =
            "\n\n> ⚠️ 上游连接中断，回复不完整（可能是代理/网关超时）。可回复“继续”接着生成。";
        text_out.push_str(notice);
        emit(
            app,
            stream_id,
            StreamEvent::TextDelta {
                text: notice.to_string(),
            },
        );
    }
    // Content-filter style stops are otherwise invisible.
    if let Some(fr) = &last_finish_reason
        && fr != "stop"
        && fr != "length"
        && fr != "tool_calls"
        && fr != "function_call"
    {
        let notice = format!("\n\n> ⚠️ 生成被上游终止（finish_reason: {fr}）。");
        text_out.push_str(&notice);
        emit(app, stream_id, StreamEvent::TextDelta { text: notice });
    }

    if !citations.is_empty() && pending_tc.is_empty() {
        let mut footer = String::from("\n\n---\n**参考来源**\n");
        for (index, citation) in citations.iter().enumerate() {
            footer.push_str(&format!("{}. {}\n", index + 1, citation));
        }
        text_out.push_str(&footer);
        emit(app, stream_id, StreamEvent::TextDelta { text: footer });
    }

    // Finalize tool calls
    let mut indices: Vec<u32> = pending_tc.keys().copied().collect();
    indices.sort();
    for idx in indices {
        let (id, name, args_str) = pending_tc.remove(&idx).unwrap();
        let args: Value =
            serde_json::from_str(&args_str).unwrap_or(Value::Object(Default::default()));
        emit(
            app,
            stream_id,
            StreamEvent::ToolCallArgs {
                id: id.clone(),
                args: args.clone(),
            },
        );
        tool_calls.push(super::provider::ToolCall {
            id,
            name,
            arguments: args,
        });
    }

    Ok(ChatStreamResult {
        text: text_out,
        tool_calls,
        usage,
    })
}

/// OpenAI Responses API (`/responses`) streaming. Returns Err *before emitting
/// anything* when the endpoint is unavailable, so the caller can fall back to
/// chat/completions without duplicating output. Once streaming starts it always
/// returns Ok (mid-stream drops just end the turn early).
async fn stream_openai_responses(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let url = format!("{}/responses", config.base_url.trim_end_matches('/'));

    // chat.rs feeds tool results back as plain string messages, so every message
    // maps cleanly to a Responses input item.
    let input: Vec<Value> = messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let mut body = json!({
        "model": config.model,
        "input": input,
        "stream": true,
        "max_output_tokens": 8192,
    });
    if !system.is_empty() {
        body["instructions"] = json!(system);
    }
    if let Some(ts) = tools
        && !ts.is_empty()
    {
        body["tools"] = json!(
            ts.iter()
                .map(|t| json!({
                    "type": "function",
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                }))
                .collect::<Vec<_>>()
        );
    }

    let res = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(super::provider::api_error(status, &txt, config));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut byte_buf: Vec<u8> = Vec::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    let mut usage = Usage::default();
    // item_id -> (call_id, name, accumulated args)
    let mut fn_calls: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        // Post-2xx: never propagate errors (would risk duplicate fallback output).
        let chunk = match chunk {
            Ok(c) => c,
            Err(_) => break,
        };
        byte_buf.extend_from_slice(&chunk);
        match std::str::from_utf8(&byte_buf) {
            Ok(text) => {
                buffer.push_str(text);
                byte_buf.clear();
            }
            Err(e) => {
                let valid = e.valid_up_to();
                buffer.push_str(std::str::from_utf8(&byte_buf[..valid]).unwrap_or(""));
                byte_buf.drain(..valid);
            }
        }
        if buffer.contains('\r') {
            buffer = buffer.replace("\r\n", "\n");
        }

        while let Some(idx) = buffer.find("\n\n") {
            let block = buffer[..idx].to_string();
            buffer.drain(..idx + 2);
            for l in block.lines() {
                let Some(data) = l.strip_prefix("data: ").or_else(|| l.strip_prefix("data:"))
                else {
                    continue;
                };
                if data.trim() == "[DONE]" {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<Value>(data) else {
                    continue;
                };
                let ev = v.get("type").and_then(|s| s.as_str()).unwrap_or("");
                match ev {
                    "response.output_text.delta" => {
                        if let Some(t) = v.get("delta").and_then(|d| d.as_str()) {
                            text_out.push_str(t);
                            emit(
                                app,
                                stream_id,
                                StreamEvent::TextDelta {
                                    text: t.to_string(),
                                },
                            );
                        }
                    }
                    "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
                        if let Some(t) = v.get("delta").and_then(|d| d.as_str()) {
                            emit(
                                app,
                                stream_id,
                                StreamEvent::ReasoningDelta {
                                    text: t.to_string(),
                                },
                            );
                        }
                    }
                    "response.output_item.added" => {
                        if let Some(item) = v.get("item")
                            && item.get("type").and_then(|t| t.as_str()) == Some("function_call")
                        {
                            let item_id = item
                                .get("id")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            let call_id = item
                                .get("call_id")
                                .and_then(|x| x.as_str())
                                .unwrap_or(&item_id)
                                .to_string();
                            let name = item
                                .get("name")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            emit(
                                app,
                                stream_id,
                                StreamEvent::ToolCallStart {
                                    id: call_id.clone(),
                                    name: name.clone(),
                                },
                            );
                            fn_calls.insert(item_id, (call_id, name, String::new()));
                        }
                    }
                    "response.function_call_arguments.delta" => {
                        let item_id = v.get("item_id").and_then(|x| x.as_str()).unwrap_or("");
                        if let Some((_, _, acc)) = fn_calls.get_mut(item_id)
                            && let Some(part) = v.get("delta").and_then(|x| x.as_str())
                        {
                            acc.push_str(part);
                        }
                    }
                    "response.output_item.done" => {
                        if let Some(item) = v.get("item")
                            && item.get("type").and_then(|t| t.as_str()) == Some("function_call")
                        {
                            let item_id = item
                                .get("id")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            let (call_id, name, acc) =
                                fn_calls.remove(&item_id).unwrap_or_else(|| {
                                    let call_id = item
                                        .get("call_id")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let name = item
                                        .get("name")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    (call_id, name, String::new())
                                });
                            // Prefer the complete arguments on the done item.
                            let args_str = item
                                .get("arguments")
                                .and_then(|x| x.as_str())
                                .filter(|s| !s.is_empty())
                                .map(|s| s.to_string())
                                .unwrap_or(acc);
                            let args: Value = serde_json::from_str(&args_str)
                                .unwrap_or(Value::Object(Default::default()));
                            emit(
                                app,
                                stream_id,
                                StreamEvent::ToolCallArgs {
                                    id: call_id.clone(),
                                    args: args.clone(),
                                },
                            );
                            tool_calls.push(super::provider::ToolCall {
                                id: call_id,
                                name,
                                arguments: args,
                            });
                        }
                    }
                    "response.completed" | "response.incomplete" => {
                        if let Some(u) = v.pointer("/response/usage") {
                            let p = u.get("input_tokens").and_then(|x| x.as_u64()).unwrap_or(0);
                            let c = u.get("output_tokens").and_then(|x| x.as_u64()).unwrap_or(0);
                            let tot = u
                                .get("total_tokens")
                                .and_then(|x| x.as_u64())
                                .unwrap_or(p + c);
                            usage = Usage {
                                prompt_tokens: p,
                                completion_tokens: c,
                                total_tokens: tot,
                            };
                        }
                    }
                    "response.failed" | "error" => {
                        let msg = v
                            .pointer("/response/error/message")
                            .or_else(|| v.get("message"))
                            .and_then(|m| m.as_str())
                            .unwrap_or("responses stream error");
                        return Err(super::provider::api_error(
                            reqwest::StatusCode::BAD_GATEWAY,
                            msg,
                            config,
                        ));
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(ChatStreamResult {
        text: text_out,
        tool_calls,
        usage,
    })
}

async fn stream_anthropic(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let url = format!(
        "{}/v1/messages",
        config
            .base_url
            .trim_end_matches('/')
            .trim_end_matches("/v1")
    );

    let mut body = json!({
        "model": config.model,
        "max_tokens": 4096,
        "stream": true,
        // Content that parses as a JSON array is passed through as structured
        // blocks (tool_use / tool_result rounds); plain strings stay strings.
        "messages": messages.iter().map(|m| {
            let content = serde_json::from_str::<Value>(&m.content)
                .ok()
                .filter(|v| v.is_array())
                .unwrap_or_else(|| json!(m.content));
            json!({ "role": m.role, "content": content })
        }).collect::<Vec<_>>(),
    });

    if !system.is_empty() {
        body["system"] = json!(system);
    }
    {
        let mut tool_list: Vec<Value> = tools
            .map(|ts| {
                ts.iter()
                    .map(|t| {
                        json!({
                            "name": t.name,
                            "description": t.description,
                            "input_schema": t.parameters,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        if config.web_search_mode == "native" {
            tool_list.push(json!({
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 3,
            }));
        }
        if !tool_list.is_empty() {
            body["tools"] = json!(tool_list);
        }
    }

    let res = client
        .post(&url)
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(super::provider::api_error(status, &txt, config));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    let mut current_tool: Option<(String, String, String)> = None;
    let mut usage = Usage::default();

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        let chunk = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buffer.find("\n\n") {
            let event_block = buffer[..idx].to_string();
            buffer.drain(..idx + 2);

            for l in event_block.lines() {
                if let Some(data) = l.strip_prefix("data: ")
                    && let Ok(v) = serde_json::from_str::<Value>(data)
                {
                    let ev_type = v.get("type").and_then(|s| s.as_str()).unwrap_or("");
                    // Anthropic reports input tokens on message_start and
                    // output tokens (cumulative) on message_delta.
                    if let Some(iu) = v
                        .pointer("/message/usage/input_tokens")
                        .and_then(|x| x.as_u64())
                    {
                        usage.prompt_tokens = iu;
                    }
                    if let Some(ou) = v.pointer("/usage/output_tokens").and_then(|x| x.as_u64()) {
                        usage.completion_tokens = ou;
                    }
                    match ev_type {
                        "content_block_start" => {
                            if let Some(block) = v.get("content_block")
                                && block.get("type").and_then(|v| v.as_str()) == Some("tool_use")
                            {
                                let id = block
                                    .get("id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let name = block
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                emit(
                                    app,
                                    stream_id,
                                    StreamEvent::ToolCallStart {
                                        id: id.clone(),
                                        name: name.clone(),
                                    },
                                );
                                current_tool = Some((id, name, String::new()));
                            }
                        }
                        "content_block_delta" => {
                            if let Some(delta) = v.get("delta") {
                                let dt = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                if dt == "text_delta" {
                                    if let Some(t) = delta.get("text").and_then(|v| v.as_str()) {
                                        text_out.push_str(t);
                                        emit(
                                            app,
                                            stream_id,
                                            StreamEvent::TextDelta {
                                                text: t.to_string(),
                                            },
                                        );
                                    }
                                } else if dt == "thinking_delta" {
                                    if let Some(t) = delta.get("thinking").and_then(|v| v.as_str())
                                    {
                                        emit(
                                            app,
                                            stream_id,
                                            StreamEvent::ReasoningDelta {
                                                text: t.to_string(),
                                            },
                                        );
                                    }
                                } else if dt == "input_json_delta"
                                    && let Some(part) =
                                        delta.get("partial_json").and_then(|v| v.as_str())
                                    && let Some((_, _, ref mut acc)) = current_tool
                                {
                                    acc.push_str(part);
                                }
                            }
                        }
                        "content_block_stop" => {
                            if let Some((id, name, args_str)) = current_tool.take() {
                                let args: Value = serde_json::from_str(&args_str)
                                    .unwrap_or(Value::Object(Default::default()));
                                emit(
                                    app,
                                    stream_id,
                                    StreamEvent::ToolCallArgs {
                                        id: id.clone(),
                                        args: args.clone(),
                                    },
                                );
                                tool_calls.push(super::provider::ToolCall {
                                    id,
                                    name,
                                    arguments: args,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    Ok(ChatStreamResult {
        text: text_out,
        tool_calls,
        usage,
    })
}

async fn stream_gemini(
    app: &AppHandle,
    stream_id: &str,
    config: &AIConfig,
    system: &str,
    messages: &[ChatMessage],
    tools: Option<&[ToolSpec]>,
) -> Result<ChatStreamResult, ProviderError> {
    let client = super::provider::http_client();
    let base = config.base_url.trim_end_matches('/');
    let url = format!(
        "{}/models/{}:streamGenerateContent?alt=sse&key={}",
        base,
        config.model,
        urlencoding::encode(&config.api_key)
    );

    let mut contents: Vec<Value> = Vec::new();
    for m in messages {
        let role = if m.role == "assistant" {
            "model"
        } else {
            "user"
        };
        contents.push(json!({ "role": role, "parts": [{ "text": m.content }] }));
    }

    let mut body = json!({ "contents": contents });
    if !system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }
    let ml = config.model.to_ascii_lowercase();
    let thinking_capable = ml.contains("2.5")
        || ml.contains("thinking")
        || ml.contains("gemini-3")
        || ml.contains("gemini-exp");
    if thinking_capable {
        // Gemini only returns chain-of-thought when explicitly asked.
        body["generationConfig"] = json!({
            "maxOutputTokens": 8192,
            "thinkingConfig": { "includeThoughts": true }
        });
    } else {
        body["generationConfig"] = json!({ "maxOutputTokens": 8192 });
    }
    {
        let mut tool_list: Vec<Value> = Vec::new();
        let mut has_functions = false;
        if let Some(ts) = tools
            && !ts.is_empty()
        {
            has_functions = true;
            tool_list.push(json!({
                "functionDeclarations": ts.iter().map(|t| json!({
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                })).collect::<Vec<_>>()
            }));
        }
        if config.web_search_mode == "native" {
            tool_list.push(json!({ "google_search": {} }));
            if has_functions {
                body["toolConfig"] = json!({ "includeServerSideToolInvocations": true });
            }
        }
        if !tool_list.is_empty() {
            body["tools"] = json!(tool_list);
        }
    }

    let res = client
        .post(&url)
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(super::provider::api_error(status, &txt, config));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    let mut byte_buf: Vec<u8> = Vec::new();
    let mut text_out = String::new();
    let mut tool_calls: Vec<super::provider::ToolCall> = Vec::new();
    let mut usage = Usage::default();
    let mut chunk_count = 0u32;

    // Line-based SSE parser — robust to \n vs \r\n vs missing trailing newline.
    let process_data = |data: &str,
                        text_out: &mut String,
                        tool_calls: &mut Vec<super::provider::ToolCall>,
                        usage: &mut Usage| {
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            return;
        }
        let Ok(v) = serde_json::from_str::<Value>(data) else {
            eprintln!(
                "[gemini stream] failed to parse JSON: {}",
                data.chars().take(120).collect::<String>()
            );
            return;
        };
        // usageMetadata is cumulative across chunks; keep the latest.
        if let Some(um) = v.get("usageMetadata") {
            let p = um
                .get("promptTokenCount")
                .and_then(|x| x.as_u64())
                .unwrap_or(0);
            let c = um
                .get("candidatesTokenCount")
                .and_then(|x| x.as_u64())
                .unwrap_or(0);
            let tot = um
                .get("totalTokenCount")
                .and_then(|x| x.as_u64())
                .unwrap_or(p + c);
            if p + c + tot > 0 {
                *usage = Usage {
                    prompt_tokens: p,
                    completion_tokens: c,
                    total_tokens: tot,
                };
            }
        }
        if let Some(fr) = v
            .pointer("/candidates/0/finishReason")
            .and_then(|f| f.as_str())
        {
            if fr != "STOP" {
                let notice = if fr == "MAX_TOKENS" {
                    "\n\n> ⚠️ 输出达到长度上限被截断，可回复“继续”接着生成。".to_string()
                } else {
                    format!("\n\n> ⚠️ 生成被上游终止（finishReason: {fr}）。")
                };
                text_out.push_str(&notice);
                emit(app, stream_id, StreamEvent::TextDelta { text: notice });
            }
            log::info!("gemini stream finishReason={fr}");
        }
        if let Some(parts) = v
            .pointer("/candidates/0/content/parts")
            .and_then(|p| p.as_array())
        {
            for part in parts {
                if let Some(t) = part.get("text").and_then(|v| v.as_str())
                    && !t.is_empty()
                {
                    // Gemini marks chain-of-thought parts with thought=true.
                    if part
                        .get("thought")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        emit(
                            app,
                            stream_id,
                            StreamEvent::ReasoningDelta {
                                text: t.to_string(),
                            },
                        );
                    } else {
                        text_out.push_str(t);
                        emit(
                            app,
                            stream_id,
                            StreamEvent::TextDelta {
                                text: t.to_string(),
                            },
                        );
                    }
                }
                if let Some(fc) = part.get("functionCall") {
                    let name = fc
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let arguments = fc
                        .get("args")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default()));
                    let id = uuid::Uuid::new_v4().to_string();
                    emit(
                        app,
                        stream_id,
                        StreamEvent::ToolCallStart {
                            id: id.clone(),
                            name: name.clone(),
                        },
                    );
                    emit(
                        app,
                        stream_id,
                        StreamEvent::ToolCallArgs {
                            id: id.clone(),
                            args: arguments.clone(),
                        },
                    );
                    tool_calls.push(super::provider::ToolCall {
                        id,
                        name,
                        arguments,
                    });
                }
            }
        }
    };

    while let Some(chunk) = stream.next().await {
        if is_cancelled(stream_id) {
            break;
        }
        let chunk = chunk?;
        // UTF-8-safe accumulation: a CJK char split across network chunks
        // must not be lossy-corrupted.
        byte_buf.extend_from_slice(&chunk);
        let s: String = match std::str::from_utf8(&byte_buf) {
            Ok(text) => {
                let t = text.to_string();
                byte_buf.clear();
                t
            }
            Err(e) => {
                let valid = e.valid_up_to();
                let t = std::str::from_utf8(&byte_buf[..valid])
                    .unwrap_or("")
                    .to_string();
                byte_buf.drain(..valid);
                t
            }
        };
        buffer.push_str(&s);
        chunk_count += 1;
        if chunk_count <= 2 {
            // GOTCHA: never byte-slice streamed text — CJK chars are 3 bytes
            // and a raw &s[..160] panics on a char boundary, killing the
            // whole stream task (this exact bug truncated every 中文 reply).
            let preview: String = s.chars().take(60).collect();
            log::info!(
                "gemini stream chunk #{} len={} preview={:?}",
                chunk_count,
                s.len(),
                preview
            );
        }

        // Process every complete line in the buffer.
        while let Some(nl) = buffer.find('\n') {
            let line = buffer[..nl].trim_end_matches('\r').to_string();
            buffer.drain(..nl + 1);
            if let Some(data) = line
                .strip_prefix("data: ")
                .or_else(|| line.strip_prefix("data:"))
            {
                process_data(data, &mut text_out, &mut tool_calls, &mut usage);
            }
        }
    }

    // Tail: handle any remaining buffer that didn't end with a newline.
    if !buffer.is_empty() {
        let line = buffer.trim_end_matches('\r');
        if let Some(data) = line
            .strip_prefix("data: ")
            .or_else(|| line.strip_prefix("data:"))
        {
            process_data(data, &mut text_out, &mut tool_calls, &mut usage);
        }
    }

    if text_out.is_empty() && tool_calls.is_empty() {
        eprintln!("[gemini stream] empty result after {} chunks", chunk_count);
    }

    Ok(ChatStreamResult {
        text: text_out,
        tool_calls,
        usage,
    })
}
