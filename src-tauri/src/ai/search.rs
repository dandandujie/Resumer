//! Web search backends for the agent's webSearch tool.
//!
//! - free  : DuckDuckGo HTML (no key, best-effort scrape)
//! - tavily: Tavily API (user-provided key)
//! - grok / doubao: Responses API 服务端搜索，返回摘要及引用。
//!
//! "native" mode is handled in stream.rs by injecting the provider's own
//! search tool (Gemini googleSearch / Anthropic web_search; for a Grok main
//! model, xAI search_parameters) instead.

use serde_json::{Value, json};

use super::provider::AIConfig;

pub fn tool_enabled(cfg: &AIConfig) -> bool {
    matches!(
        cfg.web_search_mode.as_str(),
        "free"
            | "bing"
            | "google"
            | "baidu"
            | "tavily"
            | "grok"
            | "doubao"
            | "deepseek"
            | "deepseek-api"
    )
}

/// A realistic browser UA — the default client UA gets rejected by Bing/Google/Baidu.
const BROWSER_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let res = client
        .get(url)
        .header("User-Agent", BROWSER_UA)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("搜索引擎返回 {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

pub async fn web_search(cfg: &AIConfig, query: &str) -> Result<Value, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("query 不能为空".into());
    }
    match cfg.web_search_mode.as_str() {
        "tavily" => tavily_search(cfg, query).await,
        "free" => duckduckgo_search(query).await,
        "bing" => bing_search(query).await,
        "google" => google_search(query).await,
        "baidu" => baidu_search(query).await,
        "deepseek" | "deepseek-api" => deepseek_search(cfg, query).await,
        "grok" | "doubao" => responses_search(cfg, query, &cfg.web_search_mode).await,
        _ => Err("联网搜索未开启（设置 → 通用设置 → 联网搜索）".into()),
    }
}

async fn bing_search(query: &str) -> Result<Value, String> {
    let client = super::provider::http_client();
    let url = format!(
        "https://www.bing.com/search?q={}",
        urlencoding::encode(query)
    );
    let html = fetch_html(&client, &url).await?;

    let tag_re = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;
    // Bing wraps each organic result title in <h2><a href="...">…</a></h2> and the
    // snippet in a following <p>. Split on the result container so the first h2/p in
    // each chunk belong to the same result.
    let link_re = regex::Regex::new(r#"(?s)<h2>.*?<a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>"#)
        .map_err(|e| e.to_string())?;
    let snip_re = regex::Regex::new(r#"(?s)<p[^>]*>(.*?)</p>"#).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for chunk in html.split("<li class=\"b_algo\"").skip(1) {
        if results.len() >= 5 {
            break;
        }
        if let Some(l) = link_re.captures(chunk) {
            let url = l[1].to_string();
            let title = tag_re.replace_all(&l[2], "").trim().to_string();
            if title.is_empty() {
                continue;
            }
            let content = snip_re
                .captures(chunk)
                .map(|c| tag_re.replace_all(&c[1], "").trim().to_string())
                .unwrap_or_default();
            results.push(json!({
                "title": title,
                "url": url,
                "content": content.chars().take(400).collect::<String>(),
            }));
        }
    }
    if results.is_empty() {
        return Err(
            "Bing 未返回结果（可能被限流或页面结构变化），可改用 DuckDuckGo 或 Tavily".into(),
        );
    }
    Ok(json!({ "engine": "bing", "results": results }))
}

async fn google_search(query: &str) -> Result<Value, String> {
    let client = super::provider::http_client();
    let url = format!(
        "https://www.google.com/search?q={}&num=10&hl=zh-CN",
        urlencoding::encode(query)
    );
    let html = fetch_html(&client, &url).await?;

    let tag_re = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;
    // Organic results: <a href="/url?q=<ACTUAL>&sa=…"> … <h3>title</h3>.
    let re =
        regex::Regex::new(r#"(?s)<a href="/url\?q=([^&"]+)[^"]*"[^>]*>.*?<h3[^>]*>(.*?)</h3>"#)
            .map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for cap in re.captures_iter(&html) {
        if results.len() >= 5 {
            break;
        }
        let url = urlencoding::decode(&cap[1])
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| cap[1].to_string());
        if !url.starts_with("http") || url.contains("google.com") {
            continue;
        }
        if !seen.insert(url.clone()) {
            continue;
        }
        let title = tag_re.replace_all(&cap[2], "").trim().to_string();
        if title.is_empty() {
            continue;
        }
        results.push(json!({ "title": title, "url": url, "content": "" }));
    }
    if results.is_empty() {
        return Err(
            "Google 未返回结果（常见于反爬拦截，建议改用 Bing / DuckDuckGo 或 Tavily）".into(),
        );
    }
    Ok(json!({ "engine": "google", "results": results }))
}

async fn baidu_search(query: &str) -> Result<Value, String> {
    let client = super::provider::http_client();
    let url = format!("https://www.baidu.com/s?wd={}", urlencoding::encode(query));
    let html = fetch_html(&client, &url).await?;

    let tag_re = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;
    // Baidu result titles: <h3 ...><a href="<baidu redirect>" ...>title</a></h3>.
    let re = regex::Regex::new(r#"(?s)<h3[^>]*>\s*<a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>"#)
        .map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for cap in re.captures_iter(&html) {
        if results.len() >= 5 {
            break;
        }
        let url = cap[1].to_string();
        if !seen.insert(url.clone()) {
            continue;
        }
        let title = tag_re.replace_all(&cap[2], "").trim().to_string();
        if title.is_empty() {
            continue;
        }
        results.push(json!({ "title": title, "url": url, "content": "" }));
    }
    if results.is_empty() {
        return Err(
            "百度未返回结果（可能被反爬拦截，建议改用 Bing / DuckDuckGo 或 Tavily）".into(),
        );
    }
    Ok(json!({ "engine": "baidu", "results": results }))
}

fn search_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(90))
        .user_agent("Resumer/0.7")
        .build()
        .map_err(|_| "无法创建搜索客户端".into())
}

async fn search_json(request: reqwest::RequestBuilder, cfg: &AIConfig) -> Result<Value, String> {
    let res = request
        .send()
        .await
        .map_err(|error| format!("搜索请求失败: {}", error.without_url()))?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(super::provider::api_error(status, &text, cfg).to_string());
    }
    res.json()
        .await
        .map_err(|_| "搜索服务返回的响应不是有效 JSON".into())
}

/// 与官方 Harness 的两种 DeepSeek 搜索提供方保持协议一致。
async fn deepseek_search(cfg: &AIConfig, query: &str) -> Result<Value, String> {
    let key = cfg.deepseek_api_key.trim();
    if key.is_empty() {
        return Err("未配置 DeepSeek 搜索 API Key（设置 → 通用设置 → 联网搜索）".into());
    }
    let direct = cfg.web_search_mode == "deepseek-api";
    let base = if direct {
        cfg.deepseek_search_url.trim()
    } else {
        cfg.deepseek_base_url.trim()
    };
    let base = if base.is_empty() {
        if direct {
            "https://api.deepseek.com/v1/tools"
        } else {
            "https://api.deepseek.com/anthropic/v1"
        }
    } else {
        base
    };
    let suffix = if direct { "/search" } else { "/messages" };
    let url = if base.trim_end_matches('/').ends_with(suffix) {
        base.trim_end_matches('/').to_owned()
    } else {
        format!("{}{suffix}", base.trim_end_matches('/'))
    };
    let mut request = search_client()?.post(url).bearer_auth(key);
    let body = if direct {
        json!({"query":query,"count":5,"need_content":false})
    } else {
        let model = if cfg.deepseek_model.trim().is_empty() {
            "deepseek-v4-flash"
        } else {
            cfg.deepseek_model.trim()
        };
        request = request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01");
        json!({"model":model,"max_tokens":4096,"thinking":{"type":"disabled"},
            "messages":[{"role":"user","content":[{"type":"text","text":format!("Perform a web search for the query: {query}")}]}],
            "tools":[{"type":"web_search_20250305","name":"web_search","max_uses":5}]})
    };
    let data = search_json(request.json(&body), cfg).await?;
    parse_deepseek_search(&data, direct)
}

fn parse_deepseek_search(data: &Value, direct: bool) -> Result<Value, String> {
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push = |item: &Value, snippet: &str| {
        let url = item.get("url").and_then(Value::as_str).unwrap_or("");
        if results.len() >= 5
            || !(url.starts_with("https://") || url.starts_with("http://"))
            || !seen.insert(url.to_owned())
        {
            return;
        }
        results.push(json!({"url":url,"title":item.get("title").and_then(Value::as_str).unwrap_or(url),
            "content":item.get("summary").and_then(Value::as_str).filter(|text| !text.is_empty())
                .or_else(||item.get("snippet").and_then(Value::as_str)).unwrap_or(snippet).chars().take(2000).collect::<String>(),
            "publishedAt":item.get("date").or_else(|| item.get("page_age"))}));
    };
    if direct {
        let items = data
            .get("results")
            .and_then(Value::as_array)
            .ok_or("DeepSeek Search API 未返回有效的 results 数组")?;
        for item in items {
            push(item, "");
        }
    } else {
        let blocks = data
            .get("content")
            .and_then(Value::as_array)
            .ok_or("DeepSeek 未返回搜索结果块")?;
        let snippets: std::collections::HashMap<&str, &str> = blocks
            .iter()
            .filter(|block| block["type"] == "text")
            .flat_map(|block| {
                block
                    .get("citations")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(|cite| {
                Some((
                    cite.get("url")?.as_str()?,
                    cite.get("cited_text")?.as_str()?,
                ))
            })
            .collect();
        let mut found = false;
        for block in blocks
            .iter()
            .filter(|block| block["type"] == "web_search_tool_result")
        {
            found = true;
            let items = block
                .get("content")
                .and_then(Value::as_array)
                .ok_or("DeepSeek 原生搜索未完成，请检查搜索工具权限")?;
            for item in items
                .iter()
                .filter(|item| item["type"] == "web_search_result")
            {
                push(
                    item,
                    snippets
                        .get(item["url"].as_str().unwrap_or(""))
                        .copied()
                        .unwrap_or(""),
                );
            }
        }
        if !found {
            return Err("DeepSeek 未执行原生搜索，请检查搜索地址、模型和接口权限".into());
        }
    }
    Ok(json!({"engine":if direct {"deepseek-api"} else {"deepseek"},"results":results}))
}

/// xAI 和火山方舟均通过 Responses API 暴露服务端搜索工具。
async fn responses_search(cfg: &AIConfig, query: &str, engine: &str) -> Result<Value, String> {
    let (key, base, model) = if engine == "doubao" {
        (
            cfg.doubao_api_key.trim(),
            cfg.doubao_base_url.trim(),
            cfg.doubao_model.trim(),
        )
    } else {
        (
            cfg.grok_api_key.trim(),
            cfg.grok_base_url.trim(),
            cfg.grok_model.trim(),
        )
    };
    let name = if engine == "doubao" { "豆包" } else { "Grok" };
    if key.is_empty() {
        return Err(format!(
            "未配置 {name} API Key（设置 → 通用设置 → 联网搜索）"
        ));
    }
    let base = if base.is_empty() {
        if engine == "doubao" {
            "https://ark.cn-beijing.volces.com/api/v3"
        } else {
            "https://api.x.ai/v1"
        }
    } else {
        base
    };
    let model = if model.is_empty() {
        if engine == "doubao" {
            return Err("请填写支持联网搜索的豆包模型 ID 或推理接入点".into());
        }
        "grok-4.7"
    } else {
        model
    };
    let url = responses_url(base);
    let body = responses_body(model, query, engine);
    let mut request = search_client()?.post(url).bearer_auth(key);
    if engine == "doubao" {
        request = request.header("ark-beta-web-search", "true");
    }
    let data = search_json(request.json(&body), cfg).await?;
    parse_responses_search(&data, engine)
}

fn responses_url(base: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.ends_with("/responses") {
        base.into()
    } else {
        format!("{base}/responses")
    }
}

fn responses_body(model: &str, query: &str, engine: &str) -> Value {
    let tool = if engine == "doubao" {
        // 方舟官方 SDK 将 sources 标为必填；只搜索通用网页，不混入天气/短视频源。
        json!({"type":"web_search", "sources":["search_engine"], "limit":5})
    } else {
        json!({"type":"web_search"})
    };
    json!({
        "model":model,
        "input":[{"role":"user", "content":format!("请调用联网搜索工具查询以下内容，基于真实来源给出简明摘要并引用来源：\n{query}")}],
        "tools":[tool],
        "stream":false
    })
}

fn parse_responses_search(data: &Value, engine: &str) -> Result<Value, String> {
    if matches!(
        data.get("status").and_then(Value::as_str),
        Some("failed" | "incomplete")
    ) || data.get("error").is_some_and(|error| !error.is_null())
    {
        return Err("搜索服务未完成请求，请检查模型权限或稍后重试".into());
    }
    let mut answer = Vec::new();
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut searched = false;
    for item in data
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if item.get("type").and_then(Value::as_str) == Some("web_search_call")
            && item.get("status").and_then(Value::as_str) == Some("completed")
        {
            searched = true;
        }
        for content in item
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if content.get("type").and_then(Value::as_str) != Some("output_text") {
                continue;
            }
            if let Some(text) = content.get("text").and_then(Value::as_str) {
                answer.push(text);
            }
            for citation in content
                .get("annotations")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if citation.get("type").and_then(Value::as_str) != Some("url_citation") {
                    continue;
                }
                let url = citation.get("url").and_then(Value::as_str).unwrap_or("");
                if !(url.starts_with("https://") || url.starts_with("http://"))
                    || !seen.insert(url.to_owned())
                    || results.len() >= 8
                {
                    continue;
                }
                results.push(json!({"title":citation.get("title").and_then(Value::as_str).unwrap_or(url), "url":url, "content":citation.get("summary").and_then(Value::as_str).unwrap_or("")}));
            }
        }
    }
    let answer = answer.join("\n");
    if answer.trim().is_empty() && results.is_empty() {
        return Err("搜索服务未返回结果".into());
    }
    if !searched && results.is_empty() {
        return Err("模型未执行联网搜索，请检查模型是否支持 web_search 工具".into());
    }
    Ok(json!({"engine":engine,"answer":answer,"results":results}))
}

async fn tavily_search(cfg: &AIConfig, query: &str) -> Result<Value, String> {
    let api_key = cfg.tavily_api_key.trim();
    if api_key.is_empty() {
        return Err("未配置 Tavily API Key".into());
    }
    let client = super::provider::http_client();
    let res = client
        .post("https://api.tavily.com/search")
        .json(&json!({
            "api_key": api_key,
            "query": query,
            "max_results": 5,
            "include_answer": true,
        }))
        .send()
        .await
        .map_err(|e| format!("Tavily 请求失败: {e}"))?;
    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(super::provider::api_error(status, &txt, cfg).to_string());
    }
    let data: Value = res.json().await.map_err(|e| e.to_string())?;
    let results: Vec<Value> = data
        .get("results")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .take(5)
                .map(|r| {
                    json!({
                        "title": r.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                        "url": r.get("url").and_then(|v| v.as_str()).unwrap_or(""),
                        "content": r.get("content").and_then(|v| v.as_str()).unwrap_or("")
                            .chars().take(500).collect::<String>(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({
        "engine": "tavily",
        "answer": data.get("answer").cloned().unwrap_or(Value::Null),
        "results": results,
    }))
}

async fn duckduckgo_search(query: &str) -> Result<Value, String> {
    let client = super::provider::http_client();
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(query)
    );
    let res = client
        .get(&url)
        .header("Accept", "text/html")
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("搜索引擎返回 {}", res.status()));
    }
    let html = res.text().await.map_err(|e| e.to_string())?;

    let link_re =
        regex::Regex::new(r#"(?s)<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#)
            .map_err(|e| e.to_string())?;
    let snippet_re = regex::Regex::new(r#"(?s)<a[^>]*class="result__snippet"[^>]*>(.*?)</a>"#)
        .map_err(|e| e.to_string())?;
    let tag_re = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;

    let snippets: Vec<String> = snippet_re
        .captures_iter(&html)
        .map(|c| tag_re.replace_all(&c[1], "").trim().to_string())
        .collect();

    let mut results = Vec::new();
    for (i, cap) in link_re.captures_iter(&html).enumerate() {
        if results.len() >= 5 {
            break;
        }
        let raw_href = &cap[1];
        // DDG wraps targets in a redirect: //duckduckgo.com/l/?uddg=<encoded>
        let url = raw_href
            .split("uddg=")
            .nth(1)
            .and_then(|part| {
                let enc = part.split('&').next().unwrap_or(part);
                urlencoding::decode(enc).ok().map(|c| c.into_owned())
            })
            .unwrap_or_else(|| raw_href.to_string());
        let title = tag_re.replace_all(&cap[2], "").trim().to_string();
        if title.is_empty() {
            continue;
        }
        results.push(json!({
            "title": title,
            "url": url,
            "content": snippets.get(i).cloned().unwrap_or_default().chars().take(400).collect::<String>(),
        }));
    }

    if results.is_empty() {
        return Err("免费搜索引擎未返回结果（可能被限流），可稍后重试或改用 Tavily".into());
    }
    Ok(json!({ "engine": "duckduckgo", "results": results }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn mock_service(
        status: &str,
        response: Value,
    ) -> (String, std::thread::JoinHandle<(String, Value)>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let status = status.to_owned();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(10)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut chunk = [0; 4096];
            let (header_end, length) = loop {
                let count = stream.read(&mut chunk).unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
                if let Some(end) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                    let length = header
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length:").map(str::trim))
                        .unwrap()
                        .parse::<usize>()
                        .unwrap();
                    break (end + 4, length);
                }
            };
            while bytes.len() < header_end + length {
                let count = stream.read(&mut chunk).unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
            }
            let header = String::from_utf8_lossy(&bytes[..header_end]).into_owned();
            let body: Value =
                serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap();
            let response = response.to_string();
            write!(stream,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}",response.len()).unwrap();
            (header, body)
        });
        (url, handle)
    }

    #[tokio::test]
    async fn search_requests_follow_official_provider_protocols() {
        for engine in ["deepseek", "deepseek-api", "doubao", "grok"] {
            let payload = match engine {
                "deepseek" => {
                    json!({"content":[{"type":"web_search_tool_result","content":[{"type":"web_search_result","title":"来源","url":"https://example.com"}]},{"type":"text","citations":[{"url":"https://example.com","cited_text":"摘录"}]}]})
                }
                "deepseek-api" => {
                    json!({"results":[{"url":"https://example.com","title":"来源","snippet":"摘录","summary":"检索摘要","date":null}]})
                }
                _ => {
                    json!({"status":"completed","output":[{"type":"web_search_call","status":"completed"},{"type":"message","content":[{"type":"output_text","text":"搜索摘要","annotations":[{"type":"url_citation","url":"https://example.com","title":"来源"}]}]}]})
                }
            };
            let (base, capture) = mock_service("200 OK", payload);
            let cfg = AIConfig {
                web_search_mode: engine.into(),
                api_key: "unrelated-main-key".into(),
                deepseek_api_key: "search-key".into(),
                deepseek_base_url: base.clone(),
                deepseek_search_url: base.clone(),
                deepseek_model: "deepseek-v4-flash".into(),
                doubao_api_key: "search-key".into(),
                doubao_base_url: base.clone(),
                doubao_model: "ep-test".into(),
                grok_api_key: "search-key".into(),
                grok_base_url: base,
                ..AIConfig::default()
            };
            assert!(tool_enabled(&cfg));
            let result = web_search(&cfg, "中文岗位查询").await.unwrap();
            assert_eq!(result["results"][0]["url"], "https://example.com");
            assert_eq!(result["engine"], engine);
            let (headers, body) = capture.join().unwrap();
            let lower = headers.to_lowercase();
            assert!(lower.contains("authorization: bearer search-key"));
            assert!(!lower.contains("unrelated-main-key"));
            match engine {
                "deepseek" => {
                    assert!(headers.starts_with("POST /messages "));
                    assert!(lower.contains("x-api-key: search-key"));
                    assert!(lower.contains("anthropic-version: 2023-06-01"));
                    assert_eq!(body["tools"][0]["type"], "web_search_20250305");
                    assert_eq!(body["thinking"]["type"], "disabled");
                    assert_eq!(result["results"][0]["content"], "摘录");
                }
                "deepseek-api" => {
                    assert!(headers.starts_with("POST /search "));
                    assert_eq!(body["query"], "中文岗位查询");
                    assert_eq!(body["need_content"], false);
                    assert_eq!(body["count"], 5);
                    assert_eq!(result["results"][0]["content"], "检索摘要");
                }
                _ => {
                    assert!(headers.starts_with("POST /responses "));
                    assert_eq!(body["tools"][0]["type"], "web_search");
                    assert!(body.get("search_parameters").is_none());
                    if engine == "doubao" {
                        assert!(lower.contains("ark-beta-web-search: true"));
                        assert_eq!(body["tools"][0]["sources"], json!(["search_engine"]));
                        assert_eq!(body["model"], "ep-test");
                    }
                }
            }
        }
    }

    #[test]
    fn unsearched_prose_and_failed_results_are_not_search_success() {
        assert!(
            parse_responses_search(
                &json!({"output":[{"content":[{"type":"output_text","text":"普通模型回答"}]}]}),
                "grok"
            )
            .is_err()
        );
        assert!(
            parse_responses_search(&json!({"status":"incomplete","output":[]}), "doubao").is_err()
        );
        assert!(
            parse_deepseek_search(
                &json!({"content":[{"type":"text","text":"普通模型回答"}]}),
                false
            )
            .is_err()
        );
        assert!(parse_deepseek_search(&json!({"results":[]}), true).is_ok());
        assert!(parse_deepseek_search(&json!({"results":null}), true).is_err());
        assert_eq!(
            responses_url("https://api.x.ai/v1/responses/"),
            "https://api.x.ai/v1/responses"
        );
    }

    #[tokio::test]
    async fn search_errors_hide_provider_credentials() {
        let (base, capture) = mock_service(
            "401 Unauthorized",
            json!({"error":{"message":"bad deepseek-secret"}}),
        );
        let cfg = AIConfig {
            web_search_mode: "deepseek-api".into(),
            deepseek_api_key: "deepseek-secret".into(),
            deepseek_search_url: base,
            ..AIConfig::default()
        };
        let error = web_search(&cfg, "test").await.unwrap_err();
        capture.join().unwrap();
        assert!(error.contains("401"));
        assert!(!error.contains("deepseek-secret"));
    }
}
