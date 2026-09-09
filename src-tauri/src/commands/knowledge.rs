use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use super::{CommandError, cfg_from};
use crate::ai::provider::ChatMessage;
use crate::ai::{prompts, provider};
use crate::db::AppDb;
use crate::db::repo::{journal as journal_repo, resume as resume_repo, version as version_repo};
use crate::knowledge;

/// 送给摘要模型的最大字符数（约 8–10K token）；原始资料本身不截断。
const INGEST_TEXT_CHARS: usize = 12_000;

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
    knowledge::vault::read_raw(&root, &path).map_err(error)
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

/// 由前端表单/实体提案新建页面：frontmatter 与时间戳由 Rust 统一生成，前端不拼 YAML。
#[tauri::command]
pub fn knowledge_create_page(
    app: AppHandle,
    db: State<'_, AppDb>,
    path: String,
    title: String,
    kind: String,
    body: String,
    sources: Option<Vec<String>>,
) -> Result<(), CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    if root.join(&path).exists() {
        return Err(error(format!("页面已存在：{path}")));
    }
    let now = knowledge::vault::now_stamp();
    let meta = knowledge::vault::Frontmatter {
        title: title.trim().to_string(),
        page_type: kind,
        sources: sources.unwrap_or_default(),
        created: now.clone(),
        updated: now,
        ..knowledge::vault::Frontmatter::default()
    };
    let content = knowledge::vault::serialize_page(&meta, body.trim_start());
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
    let cfg = cfg_from(config)?;
    let _queue = knowledge::ingest_queue().lock().await;
    knowledge::ingest_with_generator(&db, &root, &bytes, &filename, move |text| async move {
        let schema = "{title, tags, summary, entities:[{type, title, content}]}";
        // 原文完整保存在 raw/，送模型的只截前 INGEST_TEXT_CHARS 字符：摘要不需要全文，超长会撑爆上下文。
        let excerpt: String = text.chars().take(INGEST_TEXT_CHARS).collect();
        let truncated = if excerpt.chars().count() < text.chars().count() {
            "\n（资料过长，以上为节选）"
        } else {
            ""
        };
        let prompt = format!(
            "请从以下资料生成严格 JSON {schema}，entities.type 只能是 company、role 或 market。\n资料：\n{excerpt}{truncated}"
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
pub fn knowledge_lint(app: AppHandle) -> Result<knowledge::KnowledgeLintOutput, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let output = knowledge::lint(&root).map_err(error)?;
    emit_proposals(&app, &output.proposals, None);
    Ok(output)
}

#[tauri::command]
pub fn knowledge_graph(app: AppHandle) -> Result<knowledge::graph::KnowledgeGraph, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::graph::build(&root).map_err(error)
}

fn emit_proposals(
    app: &AppHandle,
    proposals: &[knowledge::KnowledgeProposal],
    application_id: Option<&str>,
) {
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
                    "applicationId": application_id,
                    "source": if application_id.is_none() { Some("knowledge") } else { None }
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
    // 优先用投递时关联的版本；旧数据没有关联则退回投递日期前最近的快照。
    let snapshot = match application.resume_id.as_deref() {
        Some(resume_id) => version_repo::snapshot_for_application(
            &conn,
            resume_id,
            application.resume_version_id.as_deref(),
            &application.applied_date,
        )
        .map_err(|error| error.to_string())?,
        None => None,
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
    let cfg = cfg_from(config).map_err(|error| error.message)?;
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
    let output = knowledge::reflect_from_json(&db, &root, &raw).map_err(error)?;
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
    knowledge::write_strategy(&db, &root, &output).map_err(error)?;
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
