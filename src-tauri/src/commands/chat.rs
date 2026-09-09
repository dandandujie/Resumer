use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use super::{CommandError, cfg_from};
use crate::ai::provider::{ChatMessage, ToolCall};
use crate::ai::{prompts, search, stream, tools};
use crate::db::AppDb;
use crate::db::repo::{chat as chat_repo, journal as journal_repo, resume as resume_repo};
use crate::knowledge;

const MAX_ROUNDS: usize = 10;
const MAX_STEPS: usize = 25;

#[tauri::command]
pub async fn list_chat_sessions(
    db: State<'_, AppDb>,
    resume_id: String,
) -> Result<Vec<chat_repo::ChatSession>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    chat_repo::find_sessions_by_resume_id(&conn, &resume_id).map_err(Into::into)
}

#[tauri::command]
pub async fn get_chat_session(
    db: State<'_, AppDb>,
    session_id: String,
) -> Result<Option<chat_repo::ChatSession>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    chat_repo::find_session(&conn, &session_id).map_err(Into::into)
}

#[tauri::command]
pub async fn list_chat_messages(
    db: State<'_, AppDb>,
    session_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Value, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let total = chat_repo::count_messages(&conn, &session_id)?;
    let messages = chat_repo::find_messages(&conn, &session_id, limit, offset)?;
    Ok(json!({ "total": total, "messages": messages }))
}

#[tauri::command]
pub async fn create_chat_session(
    db: State<'_, AppDb>,
    resume_id: String,
    title: Option<String>,
) -> Result<String, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let t = title.unwrap_or_else(|| "新对话".into());
    chat_repo::create_session(&conn, &resume_id, &t).map_err(Into::into)
}

#[tauri::command]
pub async fn delete_chat_session(
    db: State<'_, AppDb>,
    session_id: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    chat_repo::delete_session(&conn, &session_id).map_err(Into::into)
}

#[tauri::command]
pub fn cancel_ai_stream(stream_id: String) {
    stream::request_cancel(&stream_id);
}

#[tauri::command]
pub async fn truncate_chat_messages(
    db: State<'_, AppDb>,
    session_id: String,
    message_id: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    chat_repo::truncate_from_message(&conn, &session_id, &message_id).map_err(Into::into)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInputMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    db: State<'_, AppDb>,
    stream_id: String,
    config: Value,
    messages: Vec<ChatInputMessage>,
    resume_id: String,
    session_id: Option<String>,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config)?;

    // Persist the user message; the first message names the session.
    if let (Some(sid), Some(last)) = (&session_id, messages.last()) {
        if last.role == "user" && !last.content.is_empty() {
            let conn = db.conn.lock().map_err(|e| CommandError {
                message: e.to_string(),
            })?;
            let existing = chat_repo::find_messages(&conn, sid, 1, 0).unwrap_or_default();
            if existing.is_empty() {
                let title: String = last.content.chars().take(50).collect();
                let _ = chat_repo::update_session_title(&conn, sid, &title);
            }
            let _ = chat_repo::add_message(&conn, sid, "user", &last.content, &json!({}));
        }
    }

    let (resume_context, applications_context) = {
        let conn = db.conn.lock().map_err(|e| CommandError {
            message: e.to_string(),
        })?;
        let resume = resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError {
                message: e.to_string(),
            })?
            .ok_or(CommandError {
                message: "Resume not found".into(),
            })?;
        let applications = journal_repo::context_for_resume(&conn, &resume_id).unwrap_or_default();
        (
            serde_json::to_string(&resume.sections).unwrap_or_default(),
            applications,
        )
    };

    let mut system_prompt = prompts::with_response_format(prompts::get_system_prompt(
        &resume_context,
        &applications_context,
    ));
    if let Ok(context) = knowledge::prompt_context(&app) {
        system_prompt.push_str(&context);
    }
    let tool_specs = tools::tool_specs(search::tool_enabled(&cfg));

    let mut chat_msgs: Vec<ChatMessage> = messages
        .into_iter()
        .rev()
        .take(MAX_ROUNDS * 2)
        .map(|m| ChatMessage {
            role: m.role,
            content: m.content,
        })
        .collect();
    chat_msgs.reverse();

    let mut ordered_parts: Vec<Value> = Vec::new();
    let mut final_text = String::new();
    let mut usage_total = stream::Usage::default();

    for _step in 0..MAX_STEPS {
        let res = match stream::stream_chat(
            &app,
            &stream_id,
            &cfg,
            &system_prompt,
            &chat_msgs,
            Some(tool_specs.as_slice()),
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                // Persist whatever already streamed so it survives reloads.
                if let Some(sid) = &session_id {
                    if !final_text.is_empty() || !ordered_parts.is_empty() {
                        if let Ok(conn) = db.conn.lock() {
                            let metadata =
                                json!({ "orderedParts": ordered_parts, "partial": true });
                            let _ = chat_repo::add_message(
                                &conn,
                                sid,
                                "assistant",
                                &final_text,
                                &metadata,
                            );
                        }
                    }
                }
                let msg = e.to_string();
                log::error!("ai_chat stream failed: {}", msg);
                let _ = app.emit(
                    "ai-chat-event",
                    json!({
                        "streamId": &stream_id,
                        "event": { "type": "error", "message": msg }
                    }),
                );
                return Err(CommandError { message: msg });
            }
        };

        usage_total.add(&res.usage);

        if !res.text.is_empty() {
            ordered_parts.push(json!({ "type": "text", "text": res.text }));
            final_text.push_str(&res.text);
        }

        // User pressed stop — keep what we have, skip further rounds.
        if stream::is_cancelled(&stream_id) {
            let notice = "\n\n> ⏹ 已停止生成";
            final_text.push_str(notice);
            ordered_parts.push(json!({ "type": "text", "text": notice }));
            let _ = app.emit(
                "ai-chat-event",
                json!({
                    "streamId": &stream_id,
                    "event": { "type": "textDelta", "text": notice }
                }),
            );
            break;
        }

        if res.tool_calls.is_empty() {
            break;
        }

        let mut tool_results: Vec<(ToolCall, Value)> = Vec::new();
        for tc in &res.tool_calls {
            let result = if tc.name == "searchKnowledge" {
                let query = tc
                    .arguments
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let kind = tc.arguments.get("type").and_then(|v| v.as_str());
                let limit = tc
                    .arguments
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(8) as usize;
                knowledge::ensure(&app).map_err(|message| CommandError { message })?;
                let conn = db.conn.lock().map_err(|e| CommandError {
                    message: e.to_string(),
                })?;
                match knowledge::fts::search(&conn, query, kind, limit) {
                    Ok(hits) => serde_json::to_value(hits).unwrap_or_else(|_| json!([])),
                    Err(error) => json!({ "success": false, "error": error }),
                }
            } else if tc.name == "readKnowledge" {
                let path = tc
                    .arguments
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let root = knowledge::ensure(&app).map_err(|message| CommandError { message })?;
                match knowledge::vault::read(&root, path) {
                    Ok(page) => json!({
                        "path": path,
                        "content": knowledge::vault::serialize_page(&page.frontmatter, &page.body)
                    }),
                    Err(error) => json!({ "success": false, "error": error }),
                }
            } else if tc.name == "proposeKnowledgeUpdate" {
                let proposal_id = uuid::Uuid::new_v4().to_string();
                let _ = app.emit(
                    "ai-chat-event",
                    json!({
                        "streamId": &stream_id,
                        "event": {
                            "type": "knowledgeProposal",
                            "path": tc.arguments.get("path"),
                            "content": tc.arguments.get("content"),
                            "reason": tc.arguments.get("reason"),
                            "proposalId": proposal_id,
                        }
                    }),
                );
                json!({ "message": "提案已展示给用户，等待采纳。" })
            } else if tc.name == "webSearch" {
                let query = tc
                    .arguments
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match search::web_search(&cfg, query).await {
                    Ok(data) => data,
                    Err(error) => json!({ "success": false, "error": error }),
                }
            } else {
                let conn = db.conn.lock().map_err(|e| CommandError {
                    message: e.to_string(),
                })?;
                tools::execute_tool(&conn, &resume_id, &tc.name, &tc.arguments)
            };
            let _ = app.emit(
                "ai-chat-event",
                json!({
                    "streamId": &stream_id,
                    "event": {
                        "type": "toolResult",
                        "id": tc.id,
                        "name": tc.name,
                        "result": result,
                    }
                }),
            );
            ordered_parts.push(json!({
                "type": "tool",
                "toolName": tc.name,
                "args": tc.arguments,
                "result": result,
            }));
            tool_results.push((tc.clone(), result));
        }

        // Append assistant tool-use message and tool results to chat history
        if cfg.provider == "anthropic" {
            // Anthropic needs the assistant message with tool_use content
            let tool_uses: Vec<Value> = res
                .tool_calls
                .iter()
                .map(|tc| {
                    json!({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments,
                    })
                })
                .collect();
            let assistant_content = if res.text.is_empty() {
                Value::Array(tool_uses)
            } else {
                let mut parts = vec![json!({ "type": "text", "text": res.text })];
                parts.extend(tool_uses);
                Value::Array(parts)
            };
            chat_msgs.push(ChatMessage {
                role: "assistant".into(),
                content: assistant_content.to_string(),
            });

            let user_content: Vec<Value> = tool_results
                .iter()
                .map(|(tc, r)| {
                    json!({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": r.to_string(),
                    })
                })
                .collect();
            chat_msgs.push(ChatMessage {
                role: "user".into(),
                content: Value::Array(user_content).to_string(),
            });
        } else {
            // OpenAI-compatible: a bare role:"tool" message without tool_call_id
            // is rejected (400) by strict endpoints. Feed results back as a
            // plain user block instead — provider-agnostic and always valid.
            let assistant_text = if res.text.trim().is_empty() {
                "（调用工具中）".to_string()
            } else {
                res.text.clone()
            };
            chat_msgs.push(ChatMessage {
                role: "assistant".into(),
                content: assistant_text,
            });
            let blocks = tool_results
                .iter()
                .map(|(tc, r)| format!("Tool {} returned: {}", tc.name, r))
                .collect::<Vec<_>>()
                .join("\n");
            chat_msgs.push(ChatMessage {
                role: "user".into(),
                content: format!("[工具执行结果，继续你的任务]\n{}", blocks),
            });
        }
    }

    // Persist assistant message
    if let Some(sid) = &session_id {
        if !final_text.is_empty()
            || ordered_parts
                .iter()
                .any(|p| p.get("type").and_then(|v| v.as_str()) == Some("tool"))
        {
            let conn = db.conn.lock().map_err(|e| CommandError {
                message: e.to_string(),
            })?;
            let metadata = json!({ "orderedParts": ordered_parts });
            let _ = chat_repo::add_message(&conn, sid, "assistant", &final_text, &metadata);
        }
    }

    stream::clear_cancel(&stream_id);

    let _ = app.emit(
        "ai-chat-event",
        json!({
            "streamId": &stream_id,
            "event": { "type": "finish", "finalText": final_text }
        }),
    );

    Ok(json!({
        "text": final_text,
        "orderedParts": ordered_parts,
        "usage": {
            "promptTokens": usage_total.prompt_tokens,
            "completionTokens": usage_total.completion_tokens,
            "totalTokens": usage_total.total_tokens,
        },
    }))
}
