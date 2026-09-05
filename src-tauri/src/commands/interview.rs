//! 模拟面试：不落库，前端每轮传完整历史。流式输出与 ai_chat 一致，
//! 但用面试官人设，不带任何简历修改工具。

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::ai::provider::{AIConfig, ChatMessage};
use crate::ai::{prompts, stream};
use crate::db::AppDb;
use crate::db::repo::resume as resume_repo;
use super::CommandError;

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

    let resume_context = if let Some(rid) = &resume_id {
        let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
        match resume_repo::find_by_id_any(&conn, rid) {
            Ok(Some(r)) => serde_json::to_string(&r.sections).unwrap_or_default(),
            _ => String::new(),
        }
    } else {
        String::new()
    };

    let system_prompt = prompts::interview_system_prompt(
        &resume_context,
        company.as_deref().unwrap_or(""),
        role.as_deref().unwrap_or(""),
        jd.as_deref().unwrap_or(""),
        round.as_deref().unwrap_or(""),
    );

    let chat_msgs: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| ChatMessage { role: m.role, content: m.content })
        .collect();

    let res = match stream::stream_chat(&app, &stream_id, &cfg, &system_prompt, &chat_msgs, None).await {
        Ok(r) => r,
        Err(e) => {
            let msg = e.to_string();
            log::error!("interview_chat stream failed: {msg}");
            let _ = app.emit("ai-chat-event", json!({
                "streamId": &stream_id,
                "event": { "type": "error", "message": msg }
            }));
            return Err(CommandError { message: msg });
        }
    };

    stream::clear_cancel(&stream_id);
    let _ = app.emit("ai-chat-event", json!({
        "streamId": &stream_id,
        "event": { "type": "finish", "finalText": res.text }
    }));

    Ok(json!({
        "text": res.text,
        "usage": {
            "promptTokens": res.usage.prompt_tokens,
            "completionTokens": res.usage.completion_tokens,
            "totalTokens": res.usage.total_tokens,
        },
    }))
}
