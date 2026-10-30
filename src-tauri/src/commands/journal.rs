use tauri::State;

use super::CommandError;
use crate::db::AppDb;
use crate::db::repo::journal as repo;

#[tauri::command]
pub fn list_applications(db: State<AppDb>) -> Result<Vec<repo::Application>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::list_applications(&conn).map_err(Into::into)
}

#[tauri::command]
pub fn save_application(
    db: State<AppDb>,
    application: repo::Application,
) -> Result<repo::Application, CommandError> {
    if application.id.trim().is_empty() {
        return Err(CommandError {
            message: "application.id is required".into(),
        });
    }
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::save_application(&conn, &application).map_err(Into::into)
}

#[tauri::command]
pub fn delete_application(
    app: tauri::AppHandle,
    db: State<AppDb>,
    id: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let root = crate::knowledge::ensure(&app).map_err(CommandError::from)?;
    let paths = super::recordings::application_paths(&conn, &root, &id)?;
    repo::delete_application(&conn, &id)?;
    for path in paths {
        if path.exists()
            && let Err(e) = std::fs::remove_file(&path)
        {
            log::warn!("删除投递后清理录音失败：{e}");
        }
    }
    Ok(())
}

/// 旧版本把求职数据存在 WebView 的 localStorage 里；前端首次启动时把它们一次性搬进库。
#[tauri::command]
pub fn import_legacy_journal(
    db: State<AppDb>,
    applications: Vec<repo::Application>,
    mock_interviews: Vec<repo::MockInterview>,
) -> Result<usize, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let mut imported = repo::import_applications(&conn, &applications)?;
    for mock in &mock_interviews {
        repo::create_mock_interview(&conn, mock)?;
        imported += 1;
    }
    Ok(imported)
}

#[tauri::command]
pub fn list_mock_interviews(db: State<AppDb>) -> Result<Vec<repo::MockInterview>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::list_mock_interviews(&conn).map_err(Into::into)
}

#[tauri::command]
pub fn create_mock_interview(
    db: State<AppDb>,
    mock: repo::MockInterview,
) -> Result<repo::MockInterview, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::create_mock_interview(&conn, &mock).map_err(Into::into)
}

#[tauri::command]
pub fn delete_mock_interview(db: State<AppDb>, id: String) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::delete_mock_interview(&conn, &id).map_err(Into::into)
}
