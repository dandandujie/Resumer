//! 全量备份与恢复：SQLite + 知识库 vault + 前端设置打成一个 zip。
//! 恢复时不直接覆盖正在使用的数据库，而是写成 `reseumer.db.pending`，重启时替换——
//! 这样恢复失败也不会留下半个库；恢复前会先把当前数据自动备份到 backups/。

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::CommandError;
use crate::db::AppDb;

const DB_FILE: &str = "reseumer.db";
const PENDING_DB_FILE: &str = "reseumer.db.pending";
const MANIFEST_FILE: &str = "manifest.json";
const SETTINGS_FILE: &str = "settings.json";
const KNOWLEDGE_DIR: &str = "knowledge";
const BACKUPS_DIR: &str = "backups";
const BACKUP_FORMAT: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format: u32,
    pub app_version: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    /// 备份里带的前端设置 JSON（API Key 等在 localStorage），由前端写回后重启。
    pub settings: Option<String>,
    /// 恢复前自动生成的当前数据备份路径。
    pub safety_backup: String,
    pub manifest: BackupManifest,
}

fn error(message: impl Into<String>) -> CommandError {
    CommandError {
        message: message.into(),
    }
}

fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, CommandError> {
    app.path()
        .app_data_dir()
        .map_err(|e| error(format!("无法定位数据目录: {e}")))
}

/// 在连接持锁期间用 VACUUM INTO 复制数据库：WAL 模式下直接拷文件会丢掉未 checkpoint 的写入。
fn snapshot_database(db: &AppDb, target: &Path) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| error(e.to_string()))?;
    if target.exists() {
        fs::remove_file(target).map_err(|e| error(format!("清理临时文件失败: {e}")))?;
    }
    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().to_string()])
        .map_err(|e| error(format!("复制数据库失败: {e}")))?;
    Ok(())
}

fn add_directory(
    zip: &mut ZipWriter<File>,
    options: FileOptions,
    root: &Path,
    directory: &Path,
    prefix: &str,
) -> Result<(), CommandError> {
    for entry in fs::read_dir(directory)
        .map_err(|e| error(format!("读取 {} 失败: {e}", directory.display())))?
    {
        let entry = entry.map_err(|e| error(e.to_string()))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|e| error(e.to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        let name = format!("{prefix}/{relative}");
        if path.is_dir() {
            add_directory(zip, options, root, &path, prefix)?;
        } else {
            zip.start_file(name, options)
                .map_err(|e| error(e.to_string()))?;
            // 原始面试录音可能较大，边读边压缩，避免备份时整段驻留内存。
            let mut source = File::open(&path)
                .map_err(|e| error(format!("读取 {} 失败: {e}", path.display())))?;
            std::io::copy(&mut source, zip).map_err(|e| error(e.to_string()))?;
        }
    }
    Ok(())
}

fn write_backup(
    app: &AppHandle,
    db: &AppDb,
    settings: Option<&str>,
    target: &Path,
) -> Result<(), CommandError> {
    let dir = data_dir(app)?;
    let temp_db = dir.join(format!("backup-{}.db", stamp()));
    snapshot_database(db, &temp_db)?;
    let result = (|| -> Result<(), CommandError> {
        let file = File::create(target).map_err(|e| error(format!("创建备份文件失败: {e}")))?;
        let mut zip = ZipWriter::new(file);
        let options = FileOptions::default().compression_method(CompressionMethod::Deflated);
        let manifest = BackupManifest {
            format: BACKUP_FORMAT,
            app_version: app.package_info().version.to_string(),
            created_at: chrono::Local::now().to_rfc3339(),
        };
        zip.start_file(MANIFEST_FILE, options)
            .map_err(|e| error(e.to_string()))?;
        zip.write_all(
            serde_json::to_string_pretty(&manifest)
                .unwrap_or_default()
                .as_bytes(),
        )
        .map_err(|e| error(e.to_string()))?;
        zip.start_file(DB_FILE, options)
            .map_err(|e| error(e.to_string()))?;
        zip.write_all(&fs::read(&temp_db).map_err(|e| error(e.to_string()))?)
            .map_err(|e| error(e.to_string()))?;
        if let Some(settings) = settings {
            zip.start_file(SETTINGS_FILE, options)
                .map_err(|e| error(e.to_string()))?;
            zip.write_all(settings.as_bytes())
                .map_err(|e| error(e.to_string()))?;
        }
        let knowledge = dir.join(KNOWLEDGE_DIR);
        if knowledge.is_dir() {
            add_directory(&mut zip, options, &knowledge, &knowledge, KNOWLEDGE_DIR)?;
        }
        zip.finish().map_err(|e| error(e.to_string()))?;
        Ok(())
    })();
    let _ = fs::remove_file(&temp_db);
    result
}

#[tauri::command]
pub async fn backup_create(
    app: AppHandle,
    db: State<'_, AppDb>,
    settings: Option<String>,
) -> Result<Option<String>, CommandError> {
    let default_name = format!("Resumer-backup-{}.zip", stamp());
    let Some(target) = super::export::pick_save_path(&app, &default_name, "zip").await else {
        return Ok(None);
    };
    write_backup(&app, &db, settings.as_deref(), &target)?;
    Ok(Some(target.to_string_lossy().to_string()))
}

/// zip 里的路径必须是相对且不含 `..`，否则备份文件可以把文件写到数据目录之外。
fn safe_relative(name: &str) -> Result<PathBuf, CommandError> {
    let path = Path::new(name);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(error(format!("备份包含非法路径: {name}")));
    }
    Ok(path.to_path_buf())
}

fn read_entry(archive: &mut ZipArchive<File>, name: &str) -> Result<Option<Vec<u8>>, CommandError> {
    let mut entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(error(e.to_string())),
    };
    let mut bytes = Vec::new();
    entry
        .read_to_end(&mut bytes)
        .map_err(|e| error(e.to_string()))?;
    Ok(Some(bytes))
}

#[tauri::command]
pub async fn backup_restore(
    app: AppHandle,
    db: State<'_, AppDb>,
    current_settings: Option<String>,
) -> Result<Option<RestoreResult>, CommandError> {
    let Some(source) = pick_open_path(&app).await else {
        return Ok(None);
    };
    let file = File::open(&source).map_err(|e| error(format!("打开备份失败: {e}")))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| error(format!("备份不是有效的 zip: {e}")))?;
    let manifest: BackupManifest = read_entry(&mut archive, MANIFEST_FILE)?
        .ok_or_else(|| error("备份缺少 manifest.json，不是 Resumer 备份"))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes).map_err(|e| error(format!("manifest 无效: {e}")))
        })?;
    if manifest.format > BACKUP_FORMAT {
        return Err(error(format!(
            "备份格式 {} 比当前应用支持的 {} 新，请先升级应用",
            manifest.format, BACKUP_FORMAT
        )));
    }
    let database = read_entry(&mut archive, DB_FILE)?.ok_or_else(|| error("备份缺少数据库文件"))?;
    if !database.starts_with(b"SQLite format 3\0") {
        return Err(error("备份里的数据库文件已损坏"));
    }
    let settings = read_entry(&mut archive, SETTINGS_FILE)?
        .map(|bytes| {
            String::from_utf8(bytes).map_err(|e| error(format!("settings.json 不是 UTF-8: {e}")))
        })
        .transpose()?;

    // 先把当前数据存一份，恢复永远可回退
    let dir = data_dir(&app)?;
    let backups = dir.join(BACKUPS_DIR);
    fs::create_dir_all(&backups).map_err(|e| error(e.to_string()))?;
    let safety = backups.join(format!("pre-restore-{}.zip", stamp()));
    write_backup(&app, &db, current_settings.as_deref(), &safety)?;

    // 知识库：先解压到临时目录，全部成功后再整体替换
    let staging = dir.join(format!("restore-{}", stamp()));
    fs::create_dir_all(&staging).map_err(|e| error(e.to_string()))?;
    let knowledge_prefix = format!("{KNOWLEDGE_DIR}/");
    let mut has_knowledge = false;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| error(e.to_string()))?;
        let name = entry.name().to_string();
        if !name.starts_with(&knowledge_prefix) || entry.is_dir() {
            continue;
        }
        let relative = safe_relative(&name)?;
        let target = staging.join(&relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| error(e.to_string()))?;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| error(e.to_string()))?;
        fs::write(&target, bytes).map_err(|e| error(e.to_string()))?;
        has_knowledge = true;
    }
    if has_knowledge {
        let current = dir.join(KNOWLEDGE_DIR);
        if current.exists() {
            let parked = dir.join(format!("{KNOWLEDGE_DIR}.pre-restore-{}", stamp()));
            fs::rename(&current, &parked).map_err(|e| error(format!("移走当前知识库失败: {e}")))?;
        }
        fs::rename(staging.join(KNOWLEDGE_DIR), &current)
            .map_err(|e| error(format!("放置知识库失败: {e}")))?;
    }
    let _ = fs::remove_dir_all(&staging);

    fs::write(dir.join(PENDING_DB_FILE), database)
        .map_err(|e| error(format!("写入待恢复数据库失败: {e}")))?;
    Ok(Some(RestoreResult {
        settings,
        safety_backup: safety.to_string_lossy().to_string(),
        manifest,
    }))
}

async fn pick_open_path(app: &AppHandle) -> Option<PathBuf> {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Resumer backup", &["zip"])
        .pick_file(move |path| {
            let _ = tx.send(path.and_then(|p| p.as_path().map(|p| p.to_path_buf())));
        });
    rx.recv().unwrap_or(None)
}

#[tauri::command]
pub fn app_restart(app: AppHandle) {
    app.restart();
}

/// 启动时（打开数据库之前）调用：有待恢复的库就原子替换。
pub fn apply_pending_restore(dir: &Path) -> Result<bool, String> {
    let pending = dir.join(PENDING_DB_FILE);
    if !pending.exists() {
        return Ok(false);
    }
    for suffix in ["", "-wal", "-shm"] {
        let stale = dir.join(format!("{DB_FILE}{suffix}"));
        if stale.exists() {
            fs::remove_file(&stale).map_err(|e| format!("清理旧数据库失败: {e}"))?;
        }
    }
    fs::rename(&pending, dir.join(DB_FILE)).map_err(|e| format!("替换数据库失败: {e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_escaping_the_data_dir() {
        assert!(safe_relative("knowledge/wiki/a.md").is_ok());
        assert!(safe_relative("../etc/passwd").is_err());
        assert!(safe_relative("/tmp/x").is_err());
        assert!(safe_relative("knowledge/../../x").is_err());
    }

    #[test]
    fn pending_database_replaces_current_on_startup() {
        let dir = std::env::temp_dir().join(format!("resumer-restore-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(DB_FILE), b"old").unwrap();
        fs::write(dir.join(format!("{DB_FILE}-wal")), b"wal").unwrap();
        fs::write(dir.join(PENDING_DB_FILE), b"new").unwrap();
        assert!(apply_pending_restore(&dir).unwrap());
        assert_eq!(fs::read(dir.join(DB_FILE)).unwrap(), b"new");
        assert!(!dir.join(format!("{DB_FILE}-wal")).exists());
        assert!(!dir.join(PENDING_DB_FILE).exists());
        assert!(!apply_pending_restore(&dir).unwrap());
        let _ = fs::remove_dir_all(&dir);
    }
}
