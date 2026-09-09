//! 求职动态仓储：投递记录（含面试轮次与结果）与模拟面试存档。
//! 面试轮次/结果以 JSON 整体存取，读写单位始终是"一条投递"。

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Application {
    pub id: String,
    pub resume_id: Option<String>,
    #[serde(default)]
    pub company: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub channel: String,
    #[serde(default)]
    pub applied_date: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub hr_name: String,
    #[serde(default)]
    pub hr_contact: String,
    #[serde(default)]
    pub jd: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub next_follow_up: String,
    #[serde(default = "empty_array")]
    pub interviews: Value,
    #[serde(default)]
    pub outcome: Option<Value>,
    /// unix 秒；导入旧数据时由前端传入，否则由数据库生成。
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

fn default_status() -> String {
    "submitted".into()
}

fn empty_array() -> Value {
    Value::Array(Vec::new())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MockInterview {
    pub id: String,
    pub resume_id: Option<String>,
    pub application_id: Option<String>,
    #[serde(default)]
    pub company: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub feedback: String,
    #[serde(default)]
    pub transcript: String,
    #[serde(default)]
    pub created_at: i64,
}

const APPLICATION_COLUMNS: &str = "id, resume_id, company, role, channel, applied_date, status, hr_name, hr_contact, jd, notes, next_follow_up, interviews, outcome, created_at, updated_at";

fn map_application(row: &rusqlite::Row) -> Result<Application, rusqlite::Error> {
    let interviews: String = row.get(12)?;
    let outcome: Option<String> = row.get(13)?;
    Ok(Application {
        id: row.get(0)?,
        resume_id: row.get(1)?,
        company: row.get(2)?,
        role: row.get(3)?,
        channel: row.get(4)?,
        applied_date: row.get(5)?,
        status: row.get(6)?,
        hr_name: row.get(7)?,
        hr_contact: row.get(8)?,
        jd: row.get(9)?,
        notes: row.get(10)?,
        next_follow_up: row.get(11)?,
        interviews: serde_json::from_str(&interviews).unwrap_or_else(|_| empty_array()),
        outcome: outcome.and_then(|s| serde_json::from_str(&s).ok()),
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

pub fn list_applications(conn: &Connection) -> Result<Vec<Application>, rusqlite::Error> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {APPLICATION_COLUMNS} FROM applications ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map([], map_application)?;
    rows.collect()
}

pub fn list_applications_by_resume(
    conn: &Connection,
    resume_id: &str,
) -> Result<Vec<Application>, rusqlite::Error> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {APPLICATION_COLUMNS} FROM applications WHERE resume_id = ?1 ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map(params![resume_id], map_application)?;
    rows.collect()
}

pub fn find_application(
    conn: &Connection,
    id: &str,
) -> Result<Option<Application>, rusqlite::Error> {
    conn.query_row(
        &format!("SELECT {APPLICATION_COLUMNS} FROM applications WHERE id = ?1"),
        params![id],
        map_application,
    )
    .optional()
}

/// 整条覆盖式保存：新记录插入，已有记录更新全部字段并刷新 updated_at。
pub fn save_application(
    conn: &Connection,
    app: &Application,
) -> Result<Application, rusqlite::Error> {
    let interviews = serde_json::to_string(&app.interviews).unwrap_or_else(|_| "[]".into());
    let outcome = app
        .outcome
        .as_ref()
        .map(|o| serde_json::to_string(o).unwrap_or_default());
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM applications WHERE id = ?1",
        params![app.id],
        |row| row.get::<_, i64>(0),
    )? > 0;

    if exists {
        conn.execute(
            "UPDATE applications SET resume_id = ?2, company = ?3, role = ?4, channel = ?5, applied_date = ?6,
                status = ?7, hr_name = ?8, hr_contact = ?9, jd = ?10, notes = ?11, next_follow_up = ?12,
                interviews = ?13, outcome = ?14, updated_at = unixepoch()
             WHERE id = ?1",
            params![
                app.id, app.resume_id, app.company, app.role, app.channel, app.applied_date, app.status,
                app.hr_name, app.hr_contact, app.jd, app.notes, app.next_follow_up, interviews, outcome
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO applications (id, resume_id, company, role, channel, applied_date, status, hr_name, hr_contact,
                jd, notes, next_follow_up, interviews, outcome)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                app.id, app.resume_id, app.company, app.role, app.channel, app.applied_date, app.status,
                app.hr_name, app.hr_contact, app.jd, app.notes, app.next_follow_up, interviews, outcome
            ],
        )?;
    }
    find_application(conn, &app.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn delete_application(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM applications WHERE id = ?1", params![id])?;
    Ok(())
}

/// 旧版 localStorage 数据一次性导入：保留原始时间戳，已存在的 id 跳过。
/// 引用了已不存在简历的记录把 resume_id 置空，而不是丢弃。
pub fn import_applications(
    conn: &Connection,
    apps: &[Application],
) -> Result<usize, rusqlite::Error> {
    let mut imported = 0usize;
    for app in apps {
        let resume_id = existing_resume_id(conn, app.resume_id.as_deref())?;
        let interviews = serde_json::to_string(&app.interviews).unwrap_or_else(|_| "[]".into());
        let outcome = app
            .outcome
            .as_ref()
            .map(|o| serde_json::to_string(o).unwrap_or_default());
        let created_at = if app.created_at > 0 {
            app.created_at
        } else {
            now_secs()
        };
        let updated_at = if app.updated_at > 0 {
            app.updated_at
        } else {
            created_at
        };
        imported += conn.execute(
            "INSERT OR IGNORE INTO applications (id, resume_id, company, role, channel, applied_date, status, hr_name,
                hr_contact, jd, notes, next_follow_up, interviews, outcome, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                app.id, resume_id, app.company, app.role, app.channel, app.applied_date, app.status, app.hr_name,
                app.hr_contact, app.jd, app.notes, app.next_follow_up, interviews, outcome, created_at, updated_at
            ],
        )?;
    }
    Ok(imported)
}

pub fn list_mock_interviews(conn: &Connection) -> Result<Vec<MockInterview>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, application_id, company, role, feedback, transcript, created_at
         FROM mock_interviews ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_mock)?;
    rows.collect()
}

fn map_mock(row: &rusqlite::Row) -> Result<MockInterview, rusqlite::Error> {
    Ok(MockInterview {
        id: row.get(0)?,
        resume_id: row.get(1)?,
        application_id: row.get(2)?,
        company: row.get(3)?,
        role: row.get(4)?,
        feedback: row.get(5)?,
        transcript: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub fn create_mock_interview(
    conn: &Connection,
    mock: &MockInterview,
) -> Result<MockInterview, rusqlite::Error> {
    let id = if mock.id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        mock.id.clone()
    };
    let resume_id = existing_resume_id(conn, mock.resume_id.as_deref())?;
    let created_at = if mock.created_at > 0 {
        mock.created_at
    } else {
        now_secs()
    };
    conn.execute(
        "INSERT OR IGNORE INTO mock_interviews (id, resume_id, application_id, company, role, feedback, transcript, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, resume_id, mock.application_id, mock.company, mock.role, mock.feedback, mock.transcript, created_at],
    )?;
    conn.query_row(
        "SELECT id, resume_id, application_id, company, role, feedback, transcript, created_at FROM mock_interviews WHERE id = ?1",
        params![id],
        map_mock,
    )
}

pub fn delete_mock_interview(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM mock_interviews WHERE id = ?1", params![id])?;
    Ok(())
}

/// 外键约束下，指向不存在简历的 id 会让插入失败；导入旧数据时统一置空。
fn existing_resume_id(
    conn: &Connection,
    resume_id: Option<&str>,
) -> Result<Option<String>, rusqlite::Error> {
    let Some(rid) = resume_id.filter(|r| !r.trim().is_empty()) else {
        return Ok(None);
    };
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM resumes WHERE id = ?1",
        params![rid],
        |row| row.get(0),
    )?;
    Ok(if count > 0 {
        Some(rid.to_string())
    } else {
        None
    })
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 给简历 AI 助手的投递上下文：这份简历投了哪些岗位、进展到哪一步，
/// 以及最近一条进行中投递的 JD（供定向优化/面试准备时引用）。
pub fn context_for_resume(conn: &Connection, resume_id: &str) -> Result<String, rusqlite::Error> {
    const MAX_LISTED: usize = 8;
    const MAX_JD_CHARS: usize = 1500;
    let apps = list_applications_by_resume(conn, resume_id)?;
    if apps.is_empty() {
        return Ok(String::new());
    }
    let mut lines = vec![format!("这份简历共投递 {} 个岗位：", apps.len())];
    for app in apps.iter().take(MAX_LISTED) {
        let rounds = app.interviews.as_array().map(|a| a.len()).unwrap_or(0);
        let outcome = app
            .outcome
            .as_ref()
            .and_then(|o| o.get("result"))
            .and_then(|v| v.as_str())
            .map(|r| format!("，结果：{r}"))
            .unwrap_or_default();
        let rounds_text = if rounds > 0 {
            format!("，已面 {rounds} 轮")
        } else {
            String::new()
        };
        lines.push(format!(
            "- {} · {}（{}，状态：{}{}{}）",
            non_empty(&app.company, "未填公司"),
            non_empty(&app.role, "未填岗位"),
            non_empty(&app.applied_date, "日期未填"),
            app.status,
            rounds_text,
            outcome
        ));
    }
    if let Some(active) = apps.iter().find(|a| {
        matches!(a.status.as_str(), "submitted" | "screening" | "interview")
            && !a.jd.trim().is_empty()
    }) {
        let jd: String = active.jd.trim().chars().take(MAX_JD_CHARS).collect();
        lines.push(format!(
            "\n最近进行中的目标岗位 JD（{} · {}），定向优化时优先对齐它的原词：\n{}",
            non_empty(&active.company, "未填公司"),
            non_empty(&active.role, "未填岗位"),
            jd
        ));
    }
    Ok(lines.join("\n"))
}

fn non_empty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value.trim()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO users (id, fingerprint, settings) VALUES ('u1', 'fp', '{}')",
            [],
        )
        .unwrap();
        conn
    }

    fn sample(id: &str, resume_id: Option<&str>) -> Application {
        Application {
            id: id.into(),
            resume_id: resume_id.map(String::from),
            company: "字节跳动".into(),
            role: "后端工程师".into(),
            channel: "Boss直聘".into(),
            applied_date: "2026-09-01".into(),
            status: "interview".into(),
            hr_name: String::new(),
            hr_contact: String::new(),
            jd: "负责推荐系统后端，熟悉 Go 与 Kafka".into(),
            notes: String::new(),
            next_follow_up: String::new(),
            interviews: json!([{ "id": "r1", "round": "一面", "location": "线上" }]),
            outcome: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn save_then_update_keeps_created_at_and_round_trips_json() {
        let conn = setup();
        let rid = crate::db::repo::resume::create(&conn, "u1", "简历", "classic", "zh", &json!({}))
            .unwrap();
        let saved = save_application(&conn, &sample("a1", Some(&rid))).unwrap();
        assert_eq!(saved.interviews[0]["location"], "线上");
        assert!(saved.created_at > 0);

        let mut next = saved.clone();
        next.status = "offer".into();
        next.outcome = Some(json!({ "result": "offer" }));
        let updated = save_application(&conn, &next).unwrap();
        assert_eq!(updated.created_at, saved.created_at);
        assert_eq!(updated.status, "offer");
        assert_eq!(updated.outcome.unwrap()["result"], "offer");
        assert_eq!(list_applications(&conn).unwrap().len(), 1);
    }

    #[test]
    fn deleting_resume_keeps_application_with_null_resume() {
        let conn = setup();
        let rid = crate::db::repo::resume::create(&conn, "u1", "简历", "classic", "zh", &json!({}))
            .unwrap();
        save_application(&conn, &sample("a1", Some(&rid))).unwrap();
        crate::db::repo::resume::delete(&conn, &rid, "u1").unwrap();
        let apps = list_applications(&conn).unwrap();
        assert_eq!(apps.len(), 1);
        assert!(apps[0].resume_id.is_none());
    }

    #[test]
    fn import_skips_duplicates_and_orphans_missing_resume() {
        let conn = setup();
        let mut legacy = sample("legacy-1", Some("no-such-resume"));
        legacy.created_at = 1_700_000_000;
        assert_eq!(import_applications(&conn, &[legacy.clone()]).unwrap(), 1);
        assert_eq!(import_applications(&conn, &[legacy]).unwrap(), 0);
        let apps = list_applications(&conn).unwrap();
        assert!(apps[0].resume_id.is_none());
        assert_eq!(apps[0].created_at, 1_700_000_000);
    }

    #[test]
    fn context_lists_applications_and_active_jd() {
        let conn = setup();
        let rid = crate::db::repo::resume::create(&conn, "u1", "简历", "classic", "zh", &json!({}))
            .unwrap();
        save_application(&conn, &sample("a1", Some(&rid))).unwrap();
        let ctx = context_for_resume(&conn, &rid).unwrap();
        assert!(ctx.contains("字节跳动 · 后端工程师"));
        assert!(ctx.contains("已面 1 轮"));
        assert!(ctx.contains("Kafka"));
        assert_eq!(context_for_resume(&conn, "other").unwrap(), "");
    }
}
