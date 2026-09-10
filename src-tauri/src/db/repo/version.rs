//! 简历版本快照：每次保存/导出/投递/AI 采纳/恢复前都留一份完整简历 JSON。
//! 快照是"投给 XX 的那一版"和复盘"当时简历"的唯一数据来源。

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::resume::{self, ResumeWithSections};

/// 连续自动保存在这个窗口内只更新同一个 `save` 版本，避免每敲几个字就多一条历史。
pub const SAVE_COALESCE_SECS: i64 = 10 * 60;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResumeVersionSummary {
    pub id: String,
    pub resume_id: String,
    pub event: String,
    pub label: String,
    pub resume_title: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResumeVersion {
    #[serde(flatten)]
    pub summary: ResumeVersionSummary,
    pub snapshot: Value,
}

/// 只对影响"简历长什么样"的字段做哈希：updated_at 每次保存都变，不能参与。
pub fn content_hash(resume: &ResumeWithSections) -> String {
    let sections: Vec<Value> = resume
        .sections
        .iter()
        .map(|section| {
            json!({
                "id": section.id,
                "type": section.section_type,
                "title": section.title,
                "sortOrder": section.sort_order,
                "visible": section.visible,
                "content": section.content,
            })
        })
        .collect();
    let payload = json!({
        "title": resume.resume.title,
        "template": resume.resume.template,
        "language": resume.resume.language,
        "themeConfig": resume.resume.theme_config,
        "sections": sections,
    });
    format!("{:x}", Sha256::digest(payload.to_string().as_bytes()))
}

struct LatestVersion {
    id: String,
    event: String,
    label: String,
    content_hash: String,
    created_at: i64,
}

fn latest(conn: &Connection, resume_id: &str) -> Result<Option<LatestVersion>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, event, label, content_hash, created_at FROM resume_versions
         WHERE resume_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 1",
        params![resume_id],
        |row| {
            Ok(LatestVersion {
                id: row.get(0)?,
                event: row.get(1)?,
                label: row.get(2)?,
                content_hash: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .optional()
}

/// 写一条版本。返回 `Ok(None)` 表示内容没变且无需记录（未带 label 的重复保存）。
///
/// - 带 label 的事件（导出/投递/AI 采纳/恢复前）总是新建一行，它们是事实记录；
/// - 无 label 的 `save`：内容未变则跳过；与上一条 `save` 间隔小于 `coalesce_secs` 则原地更新。
pub fn create_snapshot(
    conn: &Connection,
    resume_id: &str,
    user_id: &str,
    event: &str,
    label: &str,
    coalesce_secs: Option<i64>,
) -> Result<Option<String>, rusqlite::Error> {
    let Some(current) = resume::find_by_id(conn, resume_id, user_id)? else {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    };
    let hash = content_hash(&current);
    let snapshot = serde_json::to_string(&current)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    let label = label.trim();
    let previous = latest(conn, resume_id)?;

    if label.is_empty()
        && let Some(prev) = &previous
    {
        if prev.content_hash == hash {
            return Ok(None);
        }
        let now = chrono::Utc::now().timestamp();
        let within_window = coalesce_secs.is_some_and(|window| now - prev.created_at < window);
        if prev.event == event && prev.label.is_empty() && within_window {
            conn.execute(
                "UPDATE resume_versions SET snapshot = ?2, content_hash = ?3, resume_title = ?4,
                    created_at = unixepoch() WHERE id = ?1",
                params![prev.id, snapshot, hash, current.resume.title],
            )?;
            return Ok(Some(prev.id.clone()));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO resume_versions (id, resume_id, user_id, event, label, content_hash, resume_title, snapshot)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            resume_id,
            user_id,
            event,
            label,
            hash,
            current.resume.title,
            snapshot
        ],
    )?;
    Ok(Some(id))
}

pub fn list(
    conn: &Connection,
    resume_id: &str,
    user_id: &str,
) -> Result<Vec<ResumeVersionSummary>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, event, label, resume_title, created_at FROM resume_versions
         WHERE resume_id = ?1 AND user_id = ?2 ORDER BY created_at DESC, rowid DESC",
    )?;
    let rows = stmt.query_map(params![resume_id, user_id], |row| {
        Ok(ResumeVersionSummary {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            event: row.get(2)?,
            label: row.get(3)?,
            resume_title: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn find(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Option<ResumeVersion>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, resume_id, event, label, resume_title, created_at, snapshot FROM resume_versions
         WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
        |row| {
            let raw: String = row.get(6)?;
            Ok(ResumeVersion {
                summary: ResumeVersionSummary {
                    id: row.get(0)?,
                    resume_id: row.get(1)?,
                    event: row.get(2)?,
                    label: row.get(3)?,
                    resume_title: row.get(4)?,
                    created_at: row.get(5)?,
                },
                snapshot: serde_json::from_str(&raw).unwrap_or(Value::Null),
            })
        },
    )
    .optional()
}

/// 复盘用：某条投递"当时的简历"。有明确关联版本时用它，否则退回投递日期之前最近的一条。
pub fn snapshot_for_application(
    conn: &Connection,
    resume_id: &str,
    version_id: Option<&str>,
    applied_date: &str,
) -> Result<Option<String>, rusqlite::Error> {
    if let Some(version_id) = version_id {
        let direct: Option<String> = conn
            .query_row(
                "SELECT snapshot FROM resume_versions WHERE id = ?1",
                params![version_id],
                |row| row.get(0),
            )
            .optional()?;
        if direct.is_some() {
            return Ok(direct);
        }
    }
    if applied_date.trim().is_empty() {
        return Ok(None);
    }
    conn.query_row(
        "SELECT snapshot FROM resume_versions
         WHERE resume_id = ?1 AND created_at <= unixepoch(?2, '+1 day')
         ORDER BY created_at DESC LIMIT 1",
        params![resume_id, applied_date],
        |row| row.get(0),
    )
    .optional()
}

/// 用快照整体覆盖简历（标题/模板/主题/语言/全部模块）。调用方负责事务与"恢复前"快照。
pub fn restore(
    conn: &Connection,
    version: &ResumeVersion,
    user_id: &str,
) -> Result<(), rusqlite::Error> {
    let snapshot: ResumeWithSections =
        serde_json::from_value(version.snapshot.clone()).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?;
    let resume_id = &version.summary.resume_id;
    conn.execute(
        "UPDATE resumes SET title = ?1, template = ?2, theme_config = ?3, language = ?4, updated_at = unixepoch()
         WHERE id = ?5 AND user_id = ?6",
        params![
            snapshot.resume.title,
            snapshot.resume.template,
            serde_json::to_string(&snapshot.resume.theme_config).unwrap_or_else(|_| "{}".into()),
            snapshot.resume.language,
            resume_id,
            user_id
        ],
    )?;
    conn.execute(
        "DELETE FROM resume_sections WHERE resume_id = ?1",
        params![resume_id],
    )?;
    for section in &snapshot.sections {
        resume::create_section_with_id(
            conn,
            &section.id,
            resume_id,
            &section.section_type,
            &section.title,
            section.sort_order,
            section.visible,
            &section.content,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO users (id, fingerprint, settings) VALUES ('u1', 'f1', '{}')",
            [],
        )
        .unwrap();
        let resume_id = resume::create(&conn, "u1", "简历", "classic", "zh", &json!({})).unwrap();
        resume::create_section(
            &conn,
            &resume_id,
            "summary",
            "简介",
            0,
            true,
            &json!({"text":"v1"}),
        )
        .unwrap();
        (conn, resume_id)
    }

    #[test]
    fn unchanged_save_is_skipped_and_labeled_events_always_recorded() {
        let (conn, resume_id) = setup();
        let first = create_snapshot(
            &conn,
            &resume_id,
            "u1",
            "save",
            "",
            Some(SAVE_COALESCE_SECS),
        )
        .unwrap();
        assert!(first.is_some());
        let again = create_snapshot(
            &conn,
            &resume_id,
            "u1",
            "save",
            "",
            Some(SAVE_COALESCE_SECS),
        )
        .unwrap();
        assert!(again.is_none(), "内容未变不应新建版本");
        let exported = create_snapshot(&conn, &resume_id, "u1", "export", "PDF", None).unwrap();
        assert!(exported.is_some());
        assert_eq!(list(&conn, &resume_id, "u1").unwrap().len(), 2);
    }

    #[test]
    fn rapid_saves_coalesce_into_one_version() {
        let (conn, resume_id) = setup();
        let first = create_snapshot(
            &conn,
            &resume_id,
            "u1",
            "save",
            "",
            Some(SAVE_COALESCE_SECS),
        )
        .unwrap()
        .unwrap();
        let section_id = resume::find_sections_by_resume_id(&conn, &resume_id).unwrap()[0]
            .id
            .clone();
        resume::update_section(&conn, &section_id, "简介", 0, true, &json!({"text":"v2"})).unwrap();
        let second = create_snapshot(
            &conn,
            &resume_id,
            "u1",
            "save",
            "",
            Some(SAVE_COALESCE_SECS),
        )
        .unwrap()
        .unwrap();
        assert_eq!(first, second, "十分钟内的连续保存应合并到同一版本");
        let version = find(&conn, &first, "u1").unwrap().unwrap();
        assert_eq!(version.snapshot["sections"][0]["content"]["text"], "v2");
        // 窗口为 0 时不合并
        resume::update_section(&conn, &section_id, "简介", 0, true, &json!({"text":"v3"})).unwrap();
        let third = create_snapshot(&conn, &resume_id, "u1", "save", "", Some(0))
            .unwrap()
            .unwrap();
        assert_ne!(first, third);
    }

    #[test]
    fn restore_replaces_sections_and_title() {
        let (conn, resume_id) = setup();
        let version_id = create_snapshot(&conn, &resume_id, "u1", "save", "", None)
            .unwrap()
            .unwrap();
        resume::update(&conn, &resume_id, "u1", "改过的标题", None, None).unwrap();
        let section_id = resume::find_sections_by_resume_id(&conn, &resume_id).unwrap()[0]
            .id
            .clone();
        resume::update_section(
            &conn,
            &section_id,
            "简介",
            0,
            true,
            &json!({"text":"changed"}),
        )
        .unwrap();

        let version = find(&conn, &version_id, "u1").unwrap().unwrap();
        restore(&conn, &version, "u1").unwrap();
        let restored = resume::find_by_id(&conn, &resume_id, "u1")
            .unwrap()
            .unwrap();
        assert_eq!(restored.resume.title, "简历");
        assert_eq!(restored.sections.len(), 1);
        assert_eq!(restored.sections[0].content["text"], "v1");
        assert_eq!(
            restored.sections[0].id, section_id,
            "恢复保留模块 id，投递/提案引用不断链"
        );
    }

    #[test]
    fn application_snapshot_prefers_linked_version() {
        let (conn, resume_id) = setup();
        let linked = create_snapshot(&conn, &resume_id, "u1", "apply", "字节跳动 · 后端", None)
            .unwrap()
            .unwrap();
        let found = snapshot_for_application(&conn, &resume_id, Some(&linked), "").unwrap();
        assert!(found.is_some());
        let by_date = snapshot_for_application(&conn, &resume_id, None, "2099-01-01").unwrap();
        assert!(by_date.is_some());
        let none = snapshot_for_application(&conn, &resume_id, None, "2000-01-01").unwrap();
        assert!(none.is_none());
    }
}
