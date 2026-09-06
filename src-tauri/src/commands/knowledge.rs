use serde_json::Value;
use tauri::{AppHandle, State};

use super::CommandError;
use crate::ai::provider::{self, AIConfig, ChatMessage};
use crate::db::AppDb;
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

#[tauri::command]
pub fn knowledge_purpose(app: AppHandle) -> Result<String, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    std::fs::read_to_string(root.join("purpose.md"))
        .map_err(|error| error.to_string())
        .map_err(error)
}
