use serde_json::Value;
use tauri::State;

use crate::db::AppDb;
use crate::db::repo::user as repo;
use super::CommandError;

#[tauri::command]
pub fn ensure_user(db: State<AppDb>) -> Result<repo::User, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::ensure_local_user(&conn).map_err(Into::into)
}

#[tauri::command]
pub fn get_settings(db: State<AppDb>, user_id: String) -> Result<Value, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::get_settings(&conn, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn update_settings(db: State<AppDb>, user_id: String, settings: Value) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError { message: e.to_string() })?;
    repo::update_settings(&conn, &user_id, &settings).map_err(Into::into)
}
