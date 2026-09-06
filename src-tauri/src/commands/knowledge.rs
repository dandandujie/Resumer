use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use super::CommandError;
use crate::ai::provider::{AIConfig, ChatMessage};
use crate::ai::{prompts, provider};
use crate::db::AppDb;
use crate::db::repo::{journal as journal_repo, resume as resume_repo};
use crate::knowledge;

fn error(message: String) -> CommandError {
    CommandError { message }
}

#[tauri::command]
pub fn knowledge_list(
    app: AppHandle,
    kind: Option<String>,
) -> Result<Vec<knowledge::PageSummary>, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::summaries(&root, kind.as_deref()).map_err(error)
}

#[tauri::command]
pub fn knowledge_read(app: AppHandle, path: String) -> Result<String, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let page = knowledge::vault::read(&root, &path).map_err(error)?;
    Ok(knowledge::vault::serialize_page(
        &page.frontmatter,
        &page.body,
    ))
}

#[tauri::command]
pub fn knowledge_write(
    app: AppHandle,
    db: State<'_, AppDb>,
    path: String,
    content: String,
) -> Result<(), CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::write_page(&db, &root, &path, &content).map_err(error)
}

#[tauri::command]
pub fn knowledge_search(
    app: AppHandle,
    db: State<'_, AppDb>,
    query: String,
    kind: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<knowledge::fts::SearchHit>, CommandError> {
    knowledge::ensure(&app).map_err(error)?;
    let conn = db
        .conn
        .lock()
        .map_err(|error| error.to_string())
        .map_err(error)?;
    knowledge::fts::search(&conn, &query, kind.as_deref(), limit.unwrap_or(8)).map_err(error)
}

#[tauri::command]
pub fn knowledge_reindex(app: AppHandle, db: State<'_, AppDb>) -> Result<usize, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let count = knowledge::reindex(&db, &root).map_err(error)?;
    knowledge::index::rebuild_from_disk(&root).map_err(error)?;
    Ok(count)
}

#[tauri::command]
pub async fn knowledge_ingest_file(
    app: AppHandle,
    db: State<'_, AppDb>,
    config: Value,
    bytes: Vec<u8>,
    filename: String,
) -> Result<knowledge::IngestResult, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let cfg: AIConfig = serde_json::from_value(config)
        .map_err(|error| error.to_string())
        .map_err(error)?;
    knowledge::ingest_with_generator(&db, &root, &bytes, &filename, move |text| async move {
        let schema = "{title, tags, summary, entities:[{type, title, content}]}";
        let prompt = format!(
            "请从以下资料生成严格 JSON {schema}，entities.type 只能是 company、role 或 market。\n资料：\n{text}"
        );
        let request = provider::GenerateRequest {
            config: &cfg,
            system: Some("你是知识库整理助手，只输出 JSON，不要编造资料外的信息。"),
            messages: &[ChatMessage {
                role: "user".into(),
                content: prompt,
            }],
            tools: None,
            json_mode: true,
            max_tokens: Some(2048),
        };
        let generated = provider::generate(request)
            .await
            .map_err(|error| error.to_string())?;
        serde_json::from_str::<knowledge::SourceSummary>(&generated.text)
            .map_err(|error| format!("知识库摘要 JSON 无效: {error}"))
    })
    .await
    .map_err(error)
}

#[tauri::command]
pub fn knowledge_graph(app: AppHandle) -> Result<knowledge::graph::KnowledgeGraph, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::graph::build(&root).map_err(error)
}

fn emit_proposals(app: &AppHandle, proposals: &[knowledge::KnowledgeProposal], application_id: Option<&str>) {
    for proposal in proposals {
        let _ = app.emit(
            "ai-chat-event",
            json!({
                "streamId": "",
                "event": {
                    "type": "knowledgeProposal",
                    "path": proposal.path,
                    "content": proposal.new_content,
                    "reason": proposal.reason,
                    "proposalId": uuid::Uuid::new_v4().to_string(),
                    "applicationId": application_id
                }
            }),
        );
    }
}

fn reflect_context(db: &AppDb, application_id: &str) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|error| error.to_string())?;
    let application = journal_repo::find_application(&conn, application_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "投递记录不存在".to_string())?;
    let snapshot = if !application.applied_date.trim().is_empty() {
        conn.query_row(
            "SELECT snapshot FROM resume_versions WHERE resume_id = ?1 AND created_at <= unixepoch(?2) ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![application.resume_id, application.applied_date],
            |row| row.get::<_, String>(0),
        ).ok()
    } else {
        None
    };
    let current = application.resume_id.as_deref().and_then(|id| {
        resume_repo::find_by_id_any(&conn, id)
            .ok()
            .flatten()
            .and_then(|resume| serde_json::to_string(&resume).ok())
    });
    let search_text = format!("{} {}", application.company, application.role);
    let local_hits = knowledge::fts::search(&conn, &search_text, None, 8)
        .map(|hits| serde_json::to_string(&hits).unwrap_or_default())
        .unwrap_or_default();
    Ok(format!(
        "投递记录：{}\n简历快照：{}\n当前简历：{}\n面试与结果：{}\n相关知识：{}",
        serde_json::to_string(&application).unwrap_or_default(),
        snapshot.unwrap_or_default(),
        current.unwrap_or_default(),
        application.interviews,
        local_hits
    ))
}

async fn generate_json(config: Value, system: String, prompt: String) -> Result<String, String> {
    let cfg: AIConfig = serde_json::from_value(config).map_err(|error| error.to_string())?;
    let request = provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &[ChatMessage {
            role: "user".into(),
            content: prompt,
        }],
        tools: None,
        json_mode: true,
        max_tokens: Some(4096),
    };
    provider::generate(request)
        .await
        .map(|response| response.text)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn knowledge_reflect(
    app: AppHandle,
    db: State<'_, AppDb>,
    application_id: String,
    config: Value,
) -> Result<knowledge::ReflectOutput, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let context = reflect_context(&db, &application_id).map_err(error)?;
    let (system, prompt) = prompts::knowledge_reflect_prompt(&context);
    let raw = generate_json(config, system, prompt).await.map_err(error)?;
    let output = knowledge::reflect_from_json(&root, &raw).map_err(error)?;
    emit_proposals(&app, &output.proposals, Some(&application_id));
    Ok(output)
}

#[tauri::command]
pub async fn knowledge_strategy_review(
    app: AppHandle,
    db: State<'_, AppDb>,
    config: Value,
) -> Result<knowledge::StrategyOutput, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let (applications, pages) = {
        let conn = db
            .conn
            .lock()
            .map_err(|error| error.to_string())
            .map_err(error)?;
        let applications = journal_repo::list_applications(&conn)
            .map_err(|error| error.to_string())
            .map_err(error)?;
        let finished = applications
            .iter()
            .filter(|application| {
                matches!(
                    application.status.as_str(),
                    "offer" | "rejected" | "declined" | "ghosted"
                )
            })
            .count();
        if finished < 5 {
            return Err(error("至少需要 5 条已结束投递才能生成策略回顾".into()));
        }
        let pages = knowledge::vault::list(&root)
            .map_err(error)?
            .into_iter()
            .filter(|path| path.starts_with("wiki/experiences/"))
            .map(|path| {
                knowledge::vault::read(&root, &path).map(|page| format!("{}\n{}", path, page.body))
            })
            .collect::<Result<Vec<_>, _>>()?;
        (applications, pages)
    };
    let context = format!(
        "投递统计：{}\n经验页：{}",
        serde_json::to_string(&applications).unwrap_or_default(),
        pages.join("\n\n")
    );
    let (system, prompt) = prompts::knowledge_strategy_review_prompt(&context);
    let output = generate_json(config, system, prompt)
        .await
        .map_err(error)
        .and_then(|text| {
            serde_json::from_str::<knowledge::StrategyOutput>(&text).map_err(|error| CommandError {
                message: format!("策略回顾 JSON 无效: {error}"),
            })
        })?;
    knowledge::write_strategy(&root, &output).map_err(error)?;
    emit_proposals(&app, std::slice::from_ref(&output.purpose_proposal), None);
    Ok(output)
}

#[tauri::command]
pub fn knowledge_purpose(app: AppHandle) -> Result<String, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    std::fs::read_to_string(root.join("purpose.md"))
        .map_err(|error| error.to_string())
        .map_err(error)
}

#[cfg(test)]
mod tests {
    use super::reflect_context;
    use crate::db::AppDb;

    #[test]
    fn reflect_context_collects_application_facts() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute("INSERT INTO users (id) VALUES ('user-1')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO resumes (id, user_id, title) VALUES ('resume-1', 'user-1', '简历')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO applications (id, resume_id, company, role, jd, interviews, outcome, applied_date)
             VALUES ('app-1', 'resume-1', '星河科技', '后端工程师', 'JD事实', '[{\"round\":\"一面\"}]', '{\"result\":\"rejected\"}', '2025-01-01')",
            [],
        ).unwrap();
        let db = AppDb {
            conn: std::sync::Mutex::new(conn),
        };
        let context = reflect_context(&db, "app-1").unwrap();
        assert!(context.contains("星河科技"));
        assert!(context.contains("JD事实"));
        assert!(context.contains("一面"));
    }
}
