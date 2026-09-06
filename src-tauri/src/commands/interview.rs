//! 模拟面试：不落库，前端每轮传完整历史。流式输出与 ai_chat 一致，
//! 但用面试官人设，不带任何简历修改工具。

use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use super::CommandError;
use crate::ai::provider::{AIConfig, ChatMessage};
use crate::ai::{prompts, stream};
use crate::db::AppDb;
use crate::db::repo::resume as resume_repo;

fn cfg_from(config: Value) -> AIConfig {
    serde_json::from_value(config).unwrap_or_default()
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn interview_chat(
    app: AppHandle,
    db: State<'_, AppDb>,
    stream_id: String,
    config: Value,
    messages: Vec<InterviewMessage>,
    resume_id: Option<String>,
    company: Option<String>,
    role: Option<String>,
    jd: Option<String>,
    round: Option<String>,
) -> Result<Value, CommandError> {
    let cfg = cfg_from(config);
    let should_prefetch = messages.is_empty();

    let resume_context = if let Some(rid) = &resume_id {
        let conn = db.conn.lock().map_err(|e| CommandError {
            message: e.to_string(),
        })?;
        match resume_repo::find_by_id_any(&conn, rid) {
            Ok(Some(r)) => serde_json::to_string(&r.sections).unwrap_or_default(),
            _ => String::new(),
        }
    } else {
        String::new()
    };

    let company = company.as_deref().unwrap_or("");
    let role = role.as_deref().unwrap_or("");
    let jd = jd.as_deref().unwrap_or("");
    let query = format!("{company} {role} 面试流程 面经");
    let external = if should_prefetch && (!company.is_empty() || !role.is_empty()) {
        crate::commands::ai::prefetch_context(&app, &db, &cfg, &query).await
    } else {
        String::new()
    };
    let mut system_prompt = prompts::interview_system_prompt(
        &resume_context,
        company,
        role,
        jd,
        round.as_deref().unwrap_or(""),
    );
    if let Ok(context) = crate::knowledge::prompt_context(&app) {
        system_prompt.push_str(&context);
    }
    if !external.is_empty() {
        system_prompt.push_str("\n\n## 外部参考\n");
        system_prompt.push_str(&external);
    }

    let chat_msgs: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| ChatMessage {
            role: m.role,
            content: m.content,
        })
        .collect();

    let res =
        match stream::stream_chat(&app, &stream_id, &cfg, &system_prompt, &chat_msgs, None).await {
            Ok(r) => r,
            Err(e) => {
                let msg = e.to_string();
                log::error!("interview_chat stream failed: {msg}");
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

    stream::clear_cancel(&stream_id);
    let _ = app.emit(
        "ai-chat-event",
        json!({
            "streamId": &stream_id,
            "event": { "type": "finish", "finalText": res.text }
        }),
    );

    Ok(json!({
        "text": res.text,
        "usage": {
            "promptTokens": res.usage.prompt_tokens,
            "completionTokens": res.usage.completion_tokens,
            "totalTokens": res.usage.total_tokens,
        },
    }))
}
