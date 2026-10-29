use super::{CommandError, export::pick_save_path};
use crate::db::{
    AppDb,
    repo::{document as repo, version},
};
use tauri::State;

#[tauri::command]
pub fn import_original_docx(
    db: State<AppDb>,
    user_id: String,
    filename: String,
    bytes: Vec<u8>,
    target_resume_id: Option<String>,
) -> Result<String, CommandError> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    repo::import(
        &mut conn,
        &user_id,
        &filename,
        &bytes,
        target_resume_id.as_deref(),
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn get_original_docx(
    db: State<AppDb>,
    user_id: String,
    resume_id: String,
    version_id: Option<String>,
) -> Result<repo::DocumentData, CommandError> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    if let Some(id) = version_id {
        let version = version::find(&conn, &id, &user_id)?.ok_or("版本不存在".to_owned())?;
        if version.summary.resume_id != resume_id {
            return Err("版本不属于该简历".to_owned().into());
        }
        let reference: repo::DocumentRef =
            serde_json::from_value(version.snapshot["originalDocument"].clone())
                .map_err(|e| e.to_string())?;
        let bytes = conn.query_row(
            "SELECT bytes FROM document_blobs WHERE hash=?1",
            [reference.current_hash],
            |r| r.get(0),
        )?;
        return Ok(repo::DocumentData {
            filename: reference.filename,
            revision: 0,
            bytes,
        });
    }
    repo::get(&conn, &resume_id, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn save_original_docx(
    db: State<AppDb>,
    user_id: String,
    resume_id: String,
    revision: i64,
    bytes: Vec<u8>,
) -> Result<i64, CommandError> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    repo::save(&mut conn, &resume_id, &user_id, revision, &bytes).map_err(Into::into)
}

#[tauri::command]
pub async fn export_original_docx(
    app: tauri::AppHandle,
    db: State<'_, AppDb>,
    user_id: String,
    resume_id: String,
) -> Result<Option<String>, CommandError> {
    let data = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        repo::get(&conn, &resume_id, &user_id)?
    };
    let Some(path) = pick_save_path(&app, &data.filename, "docx").await else {
        return Ok(None);
    };
    std::fs::write(&path, &data.bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// 即使数据库写入失败，也允许用户经保存对话框抢救当前编辑内容。
#[tauri::command]
pub async fn save_docx_copy(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, CommandError> {
    repo::validate(&bytes)?;
    let Some(path) = pick_save_path(&app, &filename, "docx").await else {
        return Ok(None);
    };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}
