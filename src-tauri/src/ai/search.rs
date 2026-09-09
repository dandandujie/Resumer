//! Web search backends for the agent's webSearch tool.
//!
//! - free  : DuckDuckGo HTML (no key, best-effort scrape)
//! - tavily: Tavily API (user-provided key)
//! - grok  : Grok (xAI) Live Search — the model searches AND summarizes in one
//!   background call; we return its answer + citations to the main model.
//!
//! "native" mode is handled in stream.rs by injecting the provider's own
//! search tool (Gemini googleSearch / Anthropic web_search; for a Grok main
//! model, xAI search_parameters) instead.

use serde_json::{Value, json};

use super::provider::AIConfig;

pub fn tool_enabled(cfg: &AIConfig) -> bool {
    matches!(
        cfg.web_search_mode.as_str(),
        "free" | "bing" | "google" | "baidu" | "tavily" | "grok"
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
        "tavily" => tavily_search(&cfg.tavily_api_key, query).await,
        "free" => duckduckgo_search(query).await,
        "bing" => bing_search(query).await,
        "google" => google_search(query).await,
        "baidu" => baidu_search(query).await,
        "grok" => grok_search(cfg, query).await,
        _ => Err("联网搜索未开启（设置 → AI 配置 → 联网搜索）".into()),
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

/// Route the webSearch tool through Grok (xAI) Live Search. Grok performs the
/// web search server-side and returns a synthesized answer plus citation URLs,
/// which we hand back to whatever main model requested the search.
async fn grok_search(cfg: &AIConfig, query: &str) -> Result<Value, String> {
    let api_key = cfg.grok_api_key.trim();
    if api_key.is_empty() {
        return Err("未配置 Grok API Key（设置 → AI 配置 → 联网搜索 → Grok）".into());
    }
    let base = {
        let b = cfg.grok_base_url.trim().trim_end_matches('/');
        if b.is_empty() {
            "https://api.x.ai/v1"
        } else {
            b
        }
    };
    let model = {
        let m = cfg.grok_model.trim();
        if m.is_empty() { "grok-4-fast" } else { m }
    };
    let url = format!("{base}/chat/completions");
    let client = super::provider::http_client();
    let res = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": [
                { "role": "system", "content": "你是联网搜索助手。请使用实时联网搜索回答用户查询，输出准确、简洁的事实性摘要，保留关键数据、时间与结论。只依据搜索到的可靠来源，不要编造，不确定就说明。" },
                { "role": "user", "content": query }
            ],
            // Force live search so the tool always actually searches.
            "search_parameters": {
                "mode": "on",
                "return_citations": true,
                "max_search_results": 8
            },
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| format!("Grok 请求失败: {e}"))?;
    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(format!(
            "Grok {status}: {}",
            txt.chars().take(200).collect::<String>()
        ));
    }
    let data: Value = res.json().await.map_err(|e| e.to_string())?;
    let answer = data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    // xAI returns citations as a top-level array of URL strings.
    let results: Vec<Value> = data
        .get("citations")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .take(8)
                .filter_map(|u| u.as_str())
                .map(|u| json!({ "title": "", "url": u, "content": "" }))
                .collect()
        })
        .unwrap_or_default();
    if answer.trim().is_empty() && results.is_empty() {
        return Err("Grok 未返回搜索结果".into());
    }
    Ok(json!({
        "engine": "grok",
        "answer": answer,
        "results": results,
    }))
}

async fn tavily_search(api_key: &str, query: &str) -> Result<Value, String> {
    if api_key.trim().is_empty() {
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
        return Err(format!(
            "Tavily {status}: {}",
            txt.chars().take(200).collect::<String>()
        ));
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
