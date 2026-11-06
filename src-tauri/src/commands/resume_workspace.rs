use super::CommandError;
use crate::db::{AppDb, repo::resume_workspace as repo};
use tauri::State;

#[tauri::command]
pub fn resume_workspace_list(
    db: State<AppDb>,
    user_id: String,
) -> Result<Vec<repo::Metadata>, CommandError> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repo::list(&conn, &user_id).map_err(Into::into)
}
#[tauri::command]
pub fn resume_workspace_get(
    db: State<AppDb>,
    user_id: String,
    resume_id: String,
) -> Result<repo::Detail, CommandError> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repo::get(&conn, &user_id, &resume_id).map_err(Into::into)
}
#[tauri::command]
pub fn resume_workspace_derive(
    db: State<AppDb>,
    user_id: String,
    request: repo::DeriveRequest,
) -> Result<String, CommandError> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    repo::derive(&mut conn, &user_id, &request).map_err(Into::into)
}
#[tauri::command]
pub fn resume_workspace_update(
    db: State<AppDb>,
    user_id: String,
    resume_id: String,
    context: repo::Context,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    repo::update(&conn, &user_id, &resume_id, &context).map_err(Into::into)
}
