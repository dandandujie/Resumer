//! 简历历史：仅保留关键节点，相同内容复用快照并保留事件事实。
//! 快照是"投给 XX 的那一版"和复盘"当时简历"的唯一数据来源。

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::resume::{self, ResumeWithSections};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VersionEvent {
    pub event: String,
    pub label: String,
    pub created_at: i64,
}
fn events(conn: &Connection, id: &str) -> Result<Vec<VersionEvent>, rusqlite::Error> {
    conn.prepare("SELECT event,label,created_at FROM resume_version_events WHERE version_id=?1 ORDER BY created_at,id")?
      .query_map([id], |r| Ok(VersionEvent{event:r.get(0)?,label:r.get(1)?,created_at:r.get(2)?}))?.collect()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResumeVersionSummary {
    pub id: String,
    pub resume_id: String,
    pub event: String,
    pub label: String,
    #[serde(default)]
    pub name: String,
    pub resume_title: String,
    pub created_at: i64,
    #[serde(default)]
    pub events: Vec<VersionEvent>,
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

/// 工作稿保存不留历史；关键事件复用相同内容，并另外保留事件事实。
pub fn create_snapshot(
    conn: &Connection,
    resume_id: &str,
    user_id: &str,
    event: &str,
    label: &str,
    _coalesce_secs: Option<i64>,
) -> Result<Option<String>, rusqlite::Error> {
    if matches!(event, "save" | "ai_accept") {
        return Ok(None);
    }
    let Some(current) = resume::find_by_id(conn, resume_id, user_id)? else {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    };
    let mut snapshot_value = serde_json::to_value(&current)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    let mut hash = content_hash(&current);
    if current.resume.template == super::document::TEMPLATE {
        let document = super::document::reference(conn, resume_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        hash = format!(
            "{:x}",
            Sha256::digest(format!("{hash}:{}", document.current_hash).as_bytes())
        );
        snapshot_value["originalDocument"] = serde_json::to_value(document)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    }
    let snapshot = snapshot_value.to_string();
    let label = label.trim();
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM resume_versions WHERE resume_id=?1 AND user_id=?2 AND content_hash=?3
          AND (?4 != 'manual' OR name=?5) ORDER BY created_at DESC,rowid DESC LIMIT 1",
            params![resume_id, user_id, hash, event, label],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = existing {
        conn.execute(
            "INSERT OR IGNORE INTO resume_version_events(version_id,event,label) VALUES (?1,?2,?3)",
            params![id, event, label],
        )?;
        return Ok(Some(id));
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO resume_versions (id, resume_id, user_id, event, label, content_hash, resume_title, snapshot, name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            resume_id,
            user_id,
            event,
            label,
            hash,
            current.resume.title,
            snapshot,
            if event == "manual" { label } else { "" }
        ],
    )?;
    conn.execute(
        "INSERT INTO resume_version_events(version_id,event,label) VALUES (?1,?2,?3)",
        params![id, event, label],
    )?;
    Ok(Some(id))
}

pub fn list(
    conn: &Connection,
    resume_id: &str,
    user_id: &str,
) -> Result<Vec<ResumeVersionSummary>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, event, label, resume_title, created_at, name FROM resume_versions
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
            name: row.get(6)?,
            events: events(conn, &row.get::<_, String>(0)?)?,
        })
    })?;
    rows.collect()
}

pub fn rename(
    conn: &Connection,
    id: &str,
    user_id: &str,
    name: &str,
) -> Result<(), rusqlite::Error> {
    let changed = conn.execute(
        "UPDATE resume_versions SET name=?3 WHERE id=?1 AND user_id=?2",
        params![id, user_id, name],
    )?;
    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

pub fn delete(conn: &Connection, id: &str, user_id: &str) -> Result<(), String> {
    if find(conn, id, user_id)
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("版本不存在".into());
    }
    let linked: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM applications WHERE resume_version_id=?1)",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if linked {
        return Err("此版本已关联投递记录，请保留投递时的简历凭据".into());
    }
    let changed = conn
        .execute(
            "DELETE FROM resume_versions WHERE id=?1 AND user_id=?2",
            params![id, user_id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("版本不存在".into());
    }
    Ok(())
}

pub fn find(
    conn: &Connection,
    id: &str,
    user_id: &str,
) -> Result<Option<ResumeVersion>, rusqlite::Error> {
    conn.query_row(
        "SELECT id, resume_id, event, label, resume_title, created_at, snapshot, name FROM resume_versions
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
                    name: row.get(7)?,
                    events: events(conn, &row.get::<_,String>(0)?)?,
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
                "SELECT snapshot FROM resume_versions WHERE id = ?1 AND resume_id = ?2",
                params![version_id, resume_id],
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
    if snapshot.resume.template == super::document::TEMPLATE {
        let reference = serde_json::from_value::<super::document::DocumentRef>(
            version.snapshot["originalDocument"].clone(),
        )
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        super::document::restore(conn, resume_id, &reference)?;
    } else {
        // 保留停用的文件引用并推进 revision：切回 DOCX 时不能复用旧窗口的版本号。
        // get_original_docx 同时检查模板，结构化模式不能读取或写入停用文件。
        conn.execute(
            "UPDATE resume_documents SET revision=revision+1 WHERE resume_id=?1",
            [resume_id],
        )?;
    }
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
    fn only_milestones_retain_immutable_content() {
        let (conn, rid) = setup();
        for _ in 0..5 {
            assert!(
                create_snapshot(&conn, &rid, "u1", "save", "", None)
                    .unwrap()
                    .is_none()
            );
        }
        assert!(list(&conn, &rid, "u1").unwrap().is_empty());
        let a = create_snapshot(&conn, &rid, "u1", "export", "PDF", None)
            .unwrap()
            .unwrap();
        assert_eq!(
            Some(a.clone()),
            create_snapshot(&conn, &rid, "u1", "apply", "星河 · 开发", None).unwrap()
        );
        assert_eq!(
            Some(a.clone()),
            create_snapshot(&conn, &rid, "u1", "export", "PDF", None).unwrap()
        );
        assert_eq!(list(&conn, &rid, "u1").unwrap().len(), 1);
        assert_eq!(
            find(&conn, &a, "u1").unwrap().unwrap().summary.events.len(),
            2
        );
        let section = resume::find_sections_by_resume_id(&conn, &rid).unwrap()[0]
            .id
            .clone();
        resume::update_section(&conn, &section, "简介", 0, true, &json!({"text":"v2"})).unwrap();
        let b = create_snapshot(&conn, &rid, "u1", "export", "PDF", None)
            .unwrap()
            .unwrap();
        assert_ne!(a, b);
        assert_eq!(
            find(&conn, &a, "u1").unwrap().unwrap().snapshot["sections"][0]["content"]["text"],
            "v1"
        );
        rename(&conn, &a, "u1", "第一版").unwrap();
        assert!(rename(&conn, &a, "other", "错误").is_err());
        assert!(delete(&conn, &a, "other").is_err());
        delete(&conn, &b, "u1").unwrap();
        assert!(resume::find_by_id(&conn, &rid, "u1").unwrap().is_some());
    }

    #[test]
    fn linked_versions_cannot_be_deleted() {
        let (conn, rid) = setup();
        let v = create_snapshot(&conn, &rid, "u1", "apply", "公司 · 岗位", None)
            .unwrap()
            .unwrap();
        conn.execute(
            "INSERT INTO applications (id,resume_id,resume_version_id) VALUES ('a',?1,?2)",
            params![rid, v],
        )
        .unwrap();
        assert!(delete(&conn, &v, "u1").unwrap_err().contains("投递"));
        assert!(find(&conn, &v, "u1").unwrap().is_some());
        rename(&conn, &v, "u1", "重要投递").unwrap();
        assert_eq!(
            snapshot_for_application(&conn, &rid, Some(&v), "")
                .unwrap()
                .unwrap(),
            find(&conn, &v, "u1").unwrap().unwrap().snapshot.to_string()
        );
    }

    #[test]
    fn restore_replaces_sections_and_title() {
        let (conn, resume_id) = setup();
        let version_id = create_snapshot(&conn, &resume_id, "u1", "manual", "测试留档", None)
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
        assert!(
            snapshot_for_application(&conn, "other-resume", Some(&linked), "")
                .unwrap()
                .is_none()
        );
        let by_date = snapshot_for_application(&conn, &resume_id, None, "2099-01-01").unwrap();
        assert!(by_date.is_some());
        let none = snapshot_for_application(&conn, &resume_id, None, "2000-01-01").unwrap();
        assert!(none.is_none());
    }
}
