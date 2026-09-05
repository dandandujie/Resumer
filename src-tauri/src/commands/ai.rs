use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

use crate::ai::{self, provider::{AIConfig, ChatMessage}};
use crate::db::AppDb;
use crate::db::repo::{resume as resume_repo, analysis as analysis_repo};
use crate::export::date::normalize_value_fields;
use super::CommandError;

fn cfg_from(config: Value) -> AIConfig {
    serde_json::from_value(config).unwrap_or_default()
}

#[tauri::command]
pub async fn ai_list_models(config: Value) -> Result<Vec<ai::provider::AiModel>, CommandError> {
    let cfg = cfg_from(config);
    ai::provider::list_models(&cfg).await.map_err(|e| CommandError { message: e.to_string() })
}

#[tauri::command]
pub async fn ai_test_connection(config: Value) -> Result<ai::provider::AiConnectionTest, CommandError> {
    let cfg = cfg_from(config);
    ai::provider::test_connection(&cfg).await.map_err(|e| CommandError { message: e.to_string() })
}

#[tauri::command]
pub async fn ai_grammar_check(
    db: State<'_, AppDb>,
    config: Value,
    resume_id: String,
    language: Option<String>,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config);
    let lang = language.unwrap_or_else(|| "en".into());
    let lang_name = if lang == "zh" { "Simplified Chinese" } else { "English" };

    let resume_ctx = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let resume = resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?;
        serde_json::to_string(&resume.sections).unwrap_or_default()
    };

    let (system, prompt) = ai::prompts::grammar_check_prompt(&resume_ctx, lang_name);
    let messages = vec![ChatMessage { role: "user".into(), content: prompt }];
    let req = ai::provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &messages,
        tools: None,
        json_mode: true,
        max_tokens: Some(8192),
    };
    let res = ai::provider::generate(req).await.map_err(|e| CommandError { message: e.to_string() })?;
    let parsed = ai::extract_json::extract_json(&res.text).map_err(|e| CommandError { message: e })?;

    // Persist grammar check result
    let score = parsed.get("overallScore").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let issue_count = parsed.get("issues").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0) as i32;
    {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let _ = analysis_repo::save_grammar_check(&conn, &resume_id, &parsed, score, issue_count);
    }

    Ok(parsed)
}

#[tauri::command]
pub async fn ai_cover_letter(
    db: State<'_, AppDb>,
    config: Value,
    resume_id: String,
    job_description: Option<String>,
    style: String,
    language: Option<String>,
) -> Result<String, CommandError> {
    let cfg = cfg_from(config);
    let lang = language.unwrap_or_else(|| "zh".into());

    let resume_ctx = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let resume = resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?;
        serde_json::to_string(&resume.sections).unwrap_or_default()
    };

    let (system, prompt) = ai::prompts::cover_letter_prompt(
        &resume_ctx,
        job_description.as_deref().unwrap_or(""),
        &style,
        &lang,
    );
    let messages = vec![ChatMessage { role: "user".into(), content: prompt }];
    let req = ai::provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &messages,
        tools: None,
        json_mode: false,
        max_tokens: Some(2048),
    };
    let res = ai::provider::generate(req).await.map_err(|e| CommandError { message: e.to_string() })?;
    Ok(res.text.trim().to_string())
}

#[tauri::command]
pub async fn ai_jd_analysis(
    db: State<'_, AppDb>,
    config: Value,
    resume_id: String,
    job_description: String,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config);

    let resume_ctx = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let resume = resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?;
        serde_json::to_string(&resume.sections).unwrap_or_default()
    };

    let (system, prompt) = ai::prompts::jd_analysis_prompt(&resume_ctx, &job_description);
    let messages = vec![ChatMessage { role: "user".into(), content: prompt }];
    let req = ai::provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &messages,
        tools: None,
        json_mode: true,
        max_tokens: Some(8192),
    };
    let res = ai::provider::generate(req).await.map_err(|e| CommandError { message: e.to_string() })?;
    let parsed = ai::extract_json::extract_json(&res.text).map_err(|e| CommandError { message: e })?;

    let overall = parsed.get("overallScore").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let ats = parsed.get("atsScore").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let _ = analysis_repo::save_jd_analysis(&conn, &resume_id, &job_description, &parsed, overall, ats);
    }

    Ok(parsed)
}

#[tauri::command]
pub async fn list_grammar_checks(db: State<'_, AppDb>, resume_id: String) -> Result<Vec<analysis_repo::GrammarCheck>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    analysis_repo::list_grammar_checks(&conn, &resume_id).map_err(Into::into)
}

#[tauri::command]
pub async fn get_grammar_check(db: State<'_, AppDb>, id: String) -> Result<Option<analysis_repo::GrammarCheck>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    analysis_repo::get_grammar_check(&conn, &id).map_err(Into::into)
}

#[tauri::command]
pub async fn delete_grammar_check(db: State<'_, AppDb>, id: String) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    analysis_repo::delete_grammar_check(&conn, &id).map_err(Into::into)
}

#[tauri::command]
pub async fn list_jd_analyses(db: State<'_, AppDb>, resume_id: String) -> Result<Vec<analysis_repo::JdAnalysis>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    analysis_repo::list_jd_analyses(&conn, &resume_id).map_err(Into::into)
}

#[tauri::command]
pub async fn get_jd_analysis(db: State<'_, AppDb>, id: String) -> Result<Option<analysis_repo::JdAnalysis>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    analysis_repo::get_jd_analysis(&conn, &id).map_err(Into::into)
}

#[tauri::command]
pub async fn delete_jd_analysis(db: State<'_, AppDb>, id: String) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    analysis_repo::delete_jd_analysis(&conn, &id).map_err(Into::into)
}

#[tauri::command]
pub async fn ai_translate(
    app: AppHandle,
    db: State<'_, AppDb>,
    config: Value,
    resume_id: String,
    target_language: String,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config);
    let lang_name = if target_language == "zh" { "Simplified Chinese" } else { "English" };

    let sections = {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let resume = resume_repo::find_by_id_any(&conn, &resume_id)
            .map_err(|e| CommandError { message: e.to_string() })?
            .ok_or(CommandError { message: "Resume not found".into() })?;
        resume.sections
    };

    let total = sections.len();
    let _ = app.emit("ai-translate-progress", json!({ "total": total, "done": 0 }));

    let mut succeeded = 0usize;
    let mut failed = 0usize;

    // Translate sequentially to avoid overwhelming the API
    for (i, section) in sections.iter().enumerate() {
        let section_obj = json!({
            "sectionId": section.id,
            "type": section.section_type,
            "title": section.title,
            "content": section.content,
        });
        let section_json = serde_json::to_string(&section_obj).unwrap_or_default();

        let (system, prompt) = ai::prompts::translate_prompt(&section_json, lang_name);
        let messages = vec![ChatMessage { role: "user".into(), content: prompt }];
        let req = ai::provider::GenerateRequest {
            config: &cfg,
            system: Some(&system),
            messages: &messages,
            tools: None,
            json_mode: true,
            max_tokens: Some(4096),
        };

        let translation_result = ai::provider::generate(req).await;
        match translation_result {
            Ok(r) => {
                if let Ok(parsed) = ai::extract_json::extract_json(&r.text) {
                    let sec_id = parsed.get("sectionId").and_then(|v| v.as_str()).unwrap_or(&section.id).to_string();
                    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or(&section.title).to_string();
                    let content = parsed.get("content").cloned().unwrap_or(section.content.clone());
                    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
                    if resume_repo::update_section(&conn, &sec_id, &title, section.sort_order, section.visible, &content).is_ok() {
                        succeeded += 1;
                    } else {
                        failed += 1;
                    }
                } else {
                    failed += 1;
                }
            }
            Err(_) => {
                failed += 1;
            }
        }

        let _ = app.emit("ai-translate-progress", json!({ "total": total, "done": i + 1 }));
    }

    {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        let _ = resume_repo::update_language(&conn, &resume_id, &target_language);
    }

    Ok(json!({
        "success": true,
        "language": target_language,
        "translatedSections": succeeded,
        "failedSections": failed,
    }))
}

#[tauri::command]
pub async fn ai_generate_resume(
    db: State<'_, AppDb>,
    config: Value,
    user_id: String,
    description: String,
    language: Option<String>,
) -> Result<String, CommandError> {
    let cfg = cfg_from(config);
    let lang = language.unwrap_or_else(|| "en".into());

    let (system, prompt) = ai::prompts::generate_resume_prompt(&description, &lang);
    let messages = vec![ChatMessage { role: "user".into(), content: prompt }];
    let req = ai::provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &messages,
        tools: None,
        json_mode: true,
        max_tokens: Some(8192),
    };
    let res = ai::provider::generate(req).await.map_err(|e| CommandError { message: e.to_string() })?;
    let parsed = ai::extract_json::extract_json(&res.text).map_err(|e| CommandError { message: e })?;

    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("AI Generated Resume").to_string();
    let sections = parsed.get("sections").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let theme = json!({"fontScheme":"yahei","fontSize":14,"lineSpacing":1.35,"sectionSpacing":6,"margin":{"top":18,"right":18,"bottom":18,"left":18},"primaryColor":"#1a1a1a","accentColor":"#1a1a1a","bodyColor":"#1a1a1a","dateStyle":"dot","headingStyle":"underline","avatarStyle":"oneInch","infoLayout":"inline"});
    let resume_id = resume_repo::create(&conn, &user_id, &title, "classic", &lang, &theme)
        .map_err(|e| CommandError { message: e.to_string() })?;

    for (i, sec) in sections.iter().enumerate() {
        let sec_type = sec.get("type").and_then(|v| v.as_str()).unwrap_or("custom").to_string();
        let sec_title = sec.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let content = sec.get("content").cloned().unwrap_or(Value::Object(Default::default()));
        resume_repo::create_section(&conn, &resume_id, &sec_type, &sec_title, i as i32, true, &content)
            .map_err(|e| CommandError { message: e.to_string() })?;
    }

    Ok(resume_id)
}

#[tauri::command]
pub async fn ai_fetch_github_repo(url: String) -> Result<Value, CommandError> {
    let re = regex::Regex::new(r"github\.com/([^/]+)/([^/]+)").unwrap();
    let caps = re.captures(&url).ok_or(CommandError { message: "Invalid GitHub URL".into() })?;
    let owner = &caps[1];
    let repo = caps[2].trim_end_matches(".git");

    let client = ai::provider::http_client();
    let api_url = format!("https://api.github.com/repos/{}/{}", owner, repo);
    let res = client
        .get(&api_url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "reseumer-tauri")
        .send()
        .await
        .map_err(|e| CommandError { message: e.to_string() })?;

    if !res.status().is_success() {
        return Err(CommandError { message: format!("GitHub API error: {}", res.status()) });
    }

    let data: Value = res.json().await.map_err(|e| CommandError { message: e.to_string() })?;
    Ok(json!({
        "name": data.get("full_name"),
        "stars": data.get("stargazers_count"),
        "language": data.get("language"),
        "description": data.get("description"),
        "url": data.get("html_url"),
    }))
}

#[tauri::command]
pub async fn parse_resume_file(
    db: State<'_, AppDb>,
    config: Value,
    user_id: String,
    file_data: Vec<u8>,
    file_type: String,
    language: Option<String>,
) -> Result<String, CommandError> {
    let cfg = cfg_from(config);
    let lang = language.unwrap_or_else(|| "zh".into());

    let extracted_text = if file_type == "application/pdf" {
        let text = pdf_extract::extract_text_from_mem(&file_data)
            .map_err(|e| CommandError { message: format!("PDF extraction failed: {}", e) })?;
        if text.trim().len() < 200 {
            return Err(CommandError {
                message: "PDF has little extractable text. Scanned/image PDFs are not supported — please upload an image (PNG/JPG/WebP) directly.".into(),
            });
        }
        let (system, prompt) = ai::prompts::parse_resume_prompt(&text, &lang);
        let messages = vec![ChatMessage { role: "user".into(), content: prompt }];
        let req = ai::provider::GenerateRequest {
            config: &cfg,
            system: Some(&system),
            messages: &messages,
            tools: None,
            json_mode: true,
            max_tokens: Some(16384),
        };
        ai::provider::generate(req)
            .await
            .map_err(|e| CommandError { message: e.to_string() })?
            .text
    } else if ["image/png", "image/jpeg", "image/webp"].contains(&file_type.as_str()) {
        let base64_data = BASE64.encode(&file_data);
        generate_vision(&cfg, &lang, &file_type, &base64_data)
            .await
            .map_err(|e| CommandError { message: e })?
    } else {
        return Err(CommandError {
            message: format!("Unsupported file type: {}. Supported: application/pdf, image/png, image/jpeg, image/webp", file_type),
        });
    };

    let mut parsed = ai::extract_json::extract_json(&extracted_text)
        .map_err(|e| CommandError { message: e })?;
    normalize_value_fields(&mut parsed);

    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("未命名简历").to_string();
    let sections = parsed.get("sections").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    let theme = json!({"fontScheme":"yahei","fontSize":14,"lineSpacing":1.35,"sectionSpacing":6,"margin":{"top":18,"right":18,"bottom":18,"left":18},"primaryColor":"#1a1a1a","accentColor":"#1a1a1a","bodyColor":"#1a1a1a","dateStyle":"dot","headingStyle":"underline","avatarStyle":"oneInch","infoLayout":"inline"});
    let resume_id = resume_repo::create(&conn, &user_id, &title, "classic", &lang, &theme)
        .map_err(|e| CommandError { message: e.to_string() })?;

    for (i, sec) in sections.iter().enumerate() {
        let sec_type = sec.get("type").and_then(|v| v.as_str()).unwrap_or("custom").to_string();
        let sec_title = sec.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let content = sec.get("content").cloned().unwrap_or(Value::Object(Default::default()));
        resume_repo::create_section(&conn, &resume_id, &sec_type, &sec_title, i as i32, true, &content)
            .map_err(|e| CommandError { message: e.to_string() })?;
    }

    Ok(resume_id)
}

async fn generate_vision(cfg: &AIConfig, language: &str, mime_type: &str, base64_data: &str) -> Result<String, String> {
    if cfg.api_key.is_empty() {
        return Err("API key is required. Please configure it in Settings.".into());
    }
    let client = ai::provider::http_client();
    let lang_name = if language == "zh" { "Simplified Chinese" } else { "English" };
    let system = format!(
        "You are a resume parsing expert. Extract structured data from the given resume image in {}.\n\
        CRITICAL: Return a single valid JSON object. No markdown, no code fences.\n\
        Structure: {{ \"title\": \"\", \"sections\": [{{\"type\": \"\", \"title\": \"\", \"content\": {{...}}}}] }}\n\
        Section types: personal_info, summary, work_experience, education, skills, projects, certifications, languages, custom.\n\n\
        {}",
        lang_name,
        ai::prompts::resume_content_schema()
    );
    let instruction = "Extract all resume information from this image into the required JSON structure.".to_string();

    match cfg.provider.as_str() {
        "anthropic" => {
            let url = format!("{}/v1/messages", cfg.base_url.trim_end_matches('/').trim_end_matches("/v1"));
            let body = json!({
                "model": cfg.model,
                "max_tokens": 16384,
                "system": system,
                "messages": [{
                    "role": "user",
                    "content": [
                        { "type": "image", "source": { "type": "base64", "media_type": mime_type, "data": base64_data } },
                        { "type": "text", "text": instruction },
                    ],
                }],
            });
            let res = client
                .post(&url)
                .header("x-api-key", &cfg.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().await.unwrap_or_default();
                return Err(format!("{} {}", status, txt));
            }
            let data: Value = res.json().await.map_err(|e| e.to_string())?;
            let text = data
                .get("content")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.iter().find(|p| p.get("type").and_then(|v| v.as_str()) == Some("text")))
                .and_then(|p| p.get("text").and_then(|v| v.as_str()))
                .unwrap_or("")
                .to_string();
            Ok(text)
        }
        "gemini" => {
            let base = cfg.base_url.trim_end_matches('/');
            let url = format!("{}/models/{}:generateContent?key={}", base, cfg.model, urlencoding::encode(&cfg.api_key));
            let body = json!({
                "systemInstruction": { "parts": [{ "text": system }] },
                "contents": [{
                    "role": "user",
                    "parts": [
                        { "inline_data": { "mime_type": mime_type, "data": base64_data } },
                        { "text": instruction },
                    ],
                }],
                "generationConfig": {
                    "maxOutputTokens": 16384,
                    "responseMimeType": "application/json",
                },
            });
            let res = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().await.unwrap_or_default();
                return Err(format!("{} {}", status, txt));
            }
            let data: Value = res.json().await.map_err(|e| e.to_string())?;
            let text = data
                .pointer("/candidates/0/content/parts/0/text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(text)
        }
        _ => {
            // OpenAI-compatible vision
            let url = format!("{}/chat/completions", cfg.base_url.trim_end_matches('/'));
            let body = json!({
                "model": cfg.model,
                "max_tokens": 16384,
                "response_format": { "type": "json_object" },
                "messages": [
                    { "role": "system", "content": system },
                    {
                        "role": "user",
                        "content": [
                            { "type": "image_url", "image_url": { "url": format!("data:{};base64,{}", mime_type, base64_data) } },
                            { "type": "text", "text": instruction },
                        ],
                    },
                ],
            });
            let res = client
                .post(&url)
                .bearer_auth(&cfg.api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().await.unwrap_or_default();
                return Err(format!("{} {}", status, txt));
            }
            let data: Value = res.json().await.map_err(|e| e.to_string())?;
            let text = data
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(text)
        }
    }
}
