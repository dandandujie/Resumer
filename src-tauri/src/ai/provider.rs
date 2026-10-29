use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIConfig {
    pub provider: String,
    pub api_key: String,
    #[serde(alias = "baseURL")]
    pub base_url: String,
    pub model: String,
    /// off | native | free | bing | google | baidu | tavily | grok | doubao | deepseek | deepseek-api
    #[serde(default)]
    pub web_search_mode: String,
    #[serde(default)]
    pub tavily_api_key: String,
    #[serde(default)]
    pub grok_api_key: String,
    #[serde(default)]
    pub grok_base_url: String,
    #[serde(default)]
    pub grok_model: String,
    #[serde(default)]
    pub doubao_api_key: String,
    #[serde(default)]
    pub doubao_base_url: String,
    #[serde(default)]
    pub doubao_model: String,
    #[serde(default)]
    pub deepseek_api_key: String,
    #[serde(default)]
    pub deepseek_base_url: String,
    #[serde(default)]
    pub deepseek_model: String,
    #[serde(default)]
    pub deepseek_search_url: String,
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            provider: "openai".into(),
            api_key: String::new(),
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4o".into(),
            web_search_mode: "off".into(),
            tavily_api_key: String::new(),
            grok_api_key: String::new(),
            grok_base_url: String::new(),
            grok_model: String::new(),
            doubao_api_key: String::new(),
            doubao_base_url: String::new(),
            doubao_model: String::new(),
            deepseek_api_key: String::new(),
            deepseek_base_url: String::new(),
            deepseek_model: String::new(),
            deepseek_search_url: String::new(),
        }
    }
}

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("API key is required. Please configure it in Settings.")]
    MissingApiKey,
    #[error("HTTP error: {0}")]
    Http(reqwest::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("AI error: {0}")]
    Api(String),
    #[error("Parse error: {0}")]
    Parse(String),
}

impl From<reqwest::Error> for ProviderError {
    fn from(error: reqwest::Error) -> Self {
        // Gemini 等渠道会把 Key 放在查询参数里，错误不应携带请求 URL。
        Self::Http(error.without_url())
    }
}

pub(crate) fn api_error(
    status: reqwest::StatusCode,
    body: &str,
    config: &AIConfig,
) -> ProviderError {
    let mut message = body.to_owned();
    for key in [
        &config.api_key,
        &config.tavily_api_key,
        &config.grok_api_key,
        &config.doubao_api_key,
        &config.deepseek_api_key,
    ] {
        if !key.is_empty() {
            message = message.replace(key, "[已隐藏]");
            message = message.replace(urlencoding::encode(key).as_ref(), "[已隐藏]");
        }
    }
    // 部分服务商只回显 Key 的首尾片段，不能仅靠完整字符串替换。
    let echoed = regex::Regex::new(r"(?i)(incorrect api key provided:\s*)[^\s]+")
        .expect("固定的凭据回显规则");
    message = echoed.replace_all(&message, "${1}[已隐藏]").into_owned();
    ProviderError::Api(format!("{status} {message}"))
}

impl serde::Serialize for ProviderError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

pub struct GenerateRequest<'a> {
    pub config: &'a AIConfig,
    pub system: Option<&'a str>,
    pub messages: &'a [ChatMessage],
    pub tools: Option<&'a [ToolSpec]>,
    pub json_mode: bool,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Default)]
pub struct GenerateResponse {
    pub text: String,
    // Populated by all provider parsers for wire-format parity; only the
    // streaming path consumes tool calls today.
    #[allow(dead_code)]
    pub tool_calls: Vec<ToolCall>,
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("reseumer-tauri/1.0")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

pub async fn generate(req: GenerateRequest<'_>) -> Result<GenerateResponse, ProviderError> {
    if req.config.api_key.is_empty() {
        return Err(ProviderError::MissingApiKey);
    }

    match req.config.provider.as_str() {
        "anthropic" => generate_anthropic(req).await,
        "gemini" => generate_gemini(req).await,
        _ => generate_openai(req).await,
    }
}

async fn generate_openai(req: GenerateRequest<'_>) -> Result<GenerateResponse, ProviderError> {
    let client = http_client();
    let url = format!(
        "{}/chat/completions",
        req.config.base_url.trim_end_matches('/')
    );

    let mut messages: Vec<Value> = Vec::new();
    if let Some(sys) = req.system {
        messages.push(json!({ "role": "system", "content": sys }));
    }
    for m in req.messages {
        messages.push(json!({ "role": m.role, "content": m.content }));
    }

    let mut body = json!({
        "model": req.config.model,
        "messages": messages,
        "stream": false,
    });

    if let Some(max) = req.max_tokens {
        body["max_tokens"] = json!(max);
    }

    if req.json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }

    if let Some(tools) = req.tools
        && !tools.is_empty()
    {
        body["tools"] = json!(
            tools
                .iter()
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

    let res = client
        .post(&url)
        .bearer_auth(&req.config.api_key)
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(api_error(status, &txt, req.config));
    }

    let data: Value = res.json().await?;
    let choice = data
        .get("choices")
        .and_then(|c| c.get(0))
        .ok_or_else(|| ProviderError::Parse("no choices".into()))?;
    let msg = choice.get("message").cloned().unwrap_or(Value::Null);
    let text = msg
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut tool_calls = Vec::new();
    if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array()) {
        for tc in tcs {
            let id = tc
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let func = tc.get("function").cloned().unwrap_or(Value::Null);
            let name = func
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args_str = func
                .get("arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("{}");
            let arguments =
                serde_json::from_str(args_str).unwrap_or(Value::Object(Default::default()));
            tool_calls.push(ToolCall {
                id,
                name,
                arguments,
            });
        }
    }

    Ok(GenerateResponse { text, tool_calls })
}

async fn generate_anthropic(req: GenerateRequest<'_>) -> Result<GenerateResponse, ProviderError> {
    let client = http_client();
    let url = format!(
        "{}/v1/messages",
        req.config
            .base_url
            .trim_end_matches('/')
            .trim_end_matches("/v1")
    );

    let mut body = json!({
        "model": req.config.model,
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "messages": req.messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect::<Vec<_>>(),
    });

    if let Some(sys) = req.system {
        body["system"] = json!(sys);
    }

    if let Some(tools) = req.tools
        && !tools.is_empty()
    {
        body["tools"] = json!(
            tools
                .iter()
                .map(|t| json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                }))
                .collect::<Vec<_>>()
        );
    }

    let res = client
        .post(&url)
        .header("x-api-key", &req.config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(api_error(status, &txt, req.config));
    }

    let data: Value = res.json().await?;
    let content = data
        .get("content")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut text = String::new();
    let mut tool_calls = Vec::new();

    for part in content {
        match part.get("type").and_then(|v| v.as_str()) {
            Some("text") => {
                if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                    text.push_str(t);
                }
            }
            Some("tool_use") => {
                let id = part
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = part
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let arguments = part
                    .get("input")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default()));
                tool_calls.push(ToolCall {
                    id,
                    name,
                    arguments,
                });
            }
            _ => {}
        }
    }

    Ok(GenerateResponse { text, tool_calls })
}

async fn generate_gemini(req: GenerateRequest<'_>) -> Result<GenerateResponse, ProviderError> {
    let client = http_client();
    let base = req.config.base_url.trim_end_matches('/');
    let url = format!(
        "{}/models/{}:generateContent?key={}",
        base,
        req.config.model,
        urlencoding::encode(&req.config.api_key)
    );

    let mut contents: Vec<Value> = Vec::new();
    for m in req.messages {
        let role = if m.role == "assistant" {
            "model"
        } else {
            "user"
        };
        contents.push(json!({ "role": role, "parts": [{ "text": m.content }] }));
    }

    let mut body = json!({ "contents": contents });
    if let Some(sys) = req.system {
        body["systemInstruction"] = json!({ "parts": [{ "text": sys }] });
    }
    if let Some(max) = req.max_tokens {
        body["generationConfig"] = json!({ "maxOutputTokens": max });
    }
    if req.json_mode {
        let mut gc = body.get("generationConfig").cloned().unwrap_or(json!({}));
        gc["responseMimeType"] = json!("application/json");
        body["generationConfig"] = gc;
    }

    if let Some(tools) = req.tools
        && !tools.is_empty()
    {
        body["tools"] = json!([{
            "functionDeclarations": tools.iter().map(|t| json!({
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            })).collect::<Vec<_>>()
        }]);
    }

    let res = client.post(&url).json(&body).send().await?;

    if !res.status().is_success() {
        let status = res.status();
        let txt = res.text().await.unwrap_or_default();
        return Err(api_error(status, &txt, req.config));
    }

    let data: Value = res.json().await?;
    let mut text = String::new();
    let mut tool_calls = Vec::new();

    if let Some(candidates) = data.get("candidates").and_then(|v| v.as_array())
        && let Some(first) = candidates.first()
        && let Some(parts) = first.pointer("/content/parts").and_then(|v| v.as_array())
    {
        for part in parts {
            if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                text.push_str(t);
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
                tool_calls.push(ToolCall {
                    id: uuid::Uuid::new_v4().to_string(),
                    name,
                    arguments,
                });
            }
        }
    }

    Ok(GenerateResponse { text, tool_calls })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModel {
    pub id: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionTest {
    pub provider: String,
    pub current_model: String,
    pub current_model_available: bool,
    pub model_count: usize,
    pub models: Vec<AiModel>,
}

pub async fn list_models(config: &AIConfig) -> Result<Vec<AiModel>, ProviderError> {
    if config.api_key.is_empty() {
        return Err(ProviderError::MissingApiKey);
    }
    let client = http_client();

    match config.provider.as_str() {
        "anthropic" => {
            let url = format!(
                "{}/v1/models",
                config
                    .base_url
                    .trim_end_matches('/')
                    .trim_end_matches("/v1")
            );
            let res = client
                .get(&url)
                .header("x-api-key", &config.api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await?;
            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().await.unwrap_or_default();
                return Err(api_error(status, &txt, config));
            }
            let data: Value = res.json().await?;
            let mut out = Vec::new();
            if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
                for m in arr {
                    if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                        let label = m
                            .get("display_name")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        out.push(AiModel {
                            id: id.to_string(),
                            label,
                        });
                    }
                }
            }
            Ok(out)
        }
        "gemini" => {
            let url = format!(
                "{}/models?key={}",
                config.base_url.trim_end_matches('/'),
                urlencoding::encode(&config.api_key)
            );
            let res = client.get(&url).send().await?;
            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().await.unwrap_or_default();
                return Err(api_error(status, &txt, config));
            }
            let data: Value = res.json().await?;
            let mut out = Vec::new();
            if let Some(arr) = data.get("models").and_then(|v| v.as_array()) {
                for m in arr {
                    if let Some(name) = m.get("name").and_then(|v| v.as_str()) {
                        let id = name.strip_prefix("models/").unwrap_or(name).to_string();
                        let label = m
                            .get("displayName")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        out.push(AiModel { id, label });
                    }
                }
            }
            Ok(out)
        }
        _ => {
            let url = format!("{}/models", config.base_url.trim_end_matches('/'));
            let res = client.get(&url).bearer_auth(&config.api_key).send().await?;
            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().await.unwrap_or_default();
                return Err(api_error(status, &txt, config));
            }
            let data: Value = res.json().await?;
            let mut out = Vec::new();
            if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
                for m in arr {
                    if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                        out.push(AiModel {
                            id: id.to_string(),
                            label: None,
                        });
                    }
                }
            }
            Ok(out)
        }
    }
}

pub async fn test_connection(config: &AIConfig) -> Result<AiConnectionTest, ProviderError> {
    let models = list_models(config).await?;
    let current_model = config.model.clone();
    let current_model_available = if current_model.is_empty() {
        false
    } else {
        models.iter().any(|model| model.id == current_model)
    };

    Ok(AiConnectionTest {
        provider: config.provider.clone(),
        current_model,
        current_model_available,
        model_count: models.len(),
        models,
    })
}

#[cfg(test)]
mod error_tests {
    use super::*;

    #[test]
    fn provider_error_redacts_full_and_partial_credentials() {
        let config = AIConfig {
            api_key: "test-secret+value".into(),
            ..AIConfig::default()
        };
        for body in [
            "Incorrect API key provided: test...value. Invalid API key",
            "invalid_api_key: test-secret+value",
            "key=test-secret%2Bvalue",
        ] {
            let error = api_error(reqwest::StatusCode::UNAUTHORIZED, body, &config).to_string();
            assert!(error.contains("401"));
            assert!(error.contains("[已隐藏]"));
            assert!(!error.contains("test-secret"));
            assert!(!error.contains("test...value"));
        }
    }
}
