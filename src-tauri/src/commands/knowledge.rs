use tauri::{AppHandle, State};

use super::CommandError;
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
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::reindex(&db, &root).map_err(error)?;
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
pub fn knowledge_ingest_file(
    app: AppHandle,
    db: State<'_, AppDb>,
    bytes: Vec<u8>,
    filename: String,
) -> Result<knowledge::PageSummary, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::ingest(&db, &root, &bytes, &filename).map_err(error)
}

#[tauri::command]
pub fn knowledge_purpose(app: AppHandle) -> Result<String, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    std::fs::read_to_string(root.join("purpose.md"))
        .map_err(|error| error.to_string())
        .map_err(error)
}
