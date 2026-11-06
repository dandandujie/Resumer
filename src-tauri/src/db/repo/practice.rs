//! 每轮先落库再返回。revision 防止慢响应覆盖，requestId 使网络重试不重复追加。
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

pub fn get(conn: &Connection, id: &str) -> Result<Value, String> {
    let data: String = conn
        .query_row(
            "SELECT data FROM interview_practice WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}
pub fn existing(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let data: Option<String> = conn
        .query_row(
            "SELECT data FROM interview_practice WHERE id=?1",
            [id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    data.map(|raw| serde_json::from_str(&raw).map_err(|e| e.to_string()))
        .transpose()
}
pub fn list_filtered(
    conn: &Connection,
    resume_id: Option<&str>,
    application_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    conn.prepare("SELECT data FROM interview_practice WHERE (?1 IS NULL OR resume_id=?1) AND (?2 IS NULL OR application_id=?2) ORDER BY updated_at DESC,rowid DESC").map_err(|e|e.to_string())?
        .query_map(params![resume_id,application_id], |r| r.get::<_,String>(0)).map_err(|e|e.to_string())?
        .map(|row| serde_json::from_str(&row.map_err(|e|e.to_string())?).map_err(|e|e.to_string())).collect()
}
pub fn insert(conn: &Connection, session: &Value) -> Result<(), String> {
    conn.execute("INSERT INTO interview_practice(id,resume_id,application_id,version_id,data) VALUES(?1,?2,?3,?4,?5)", params![session["id"].as_str(),session["resumeId"].as_str(),session["applicationId"].as_str(),session["resumeVersionId"].as_str(),session.to_string()]).map(|_|()).map_err(|e|e.to_string())
}
pub fn save(conn: &Connection, session: &mut Value, revision: i64) -> Result<(), String> {
    session["revision"] = (revision + 1).into();
    session["updatedAt"] = chrono::Utc::now().timestamp().into();
    let changed = conn.execute("UPDATE interview_practice SET data=?1,revision=?2,updated_at=unixepoch() WHERE id=?3 AND revision=?4",params![session.to_string(),revision+1,session["id"].as_str(),revision]).map_err(|e|e.to_string())?;
    if changed == 0 {
        return Err("练习已在另一处更新，请重新打开后继续；本轮未覆盖已保存内容".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn failed_start_rolls_back_version_and_deleted_resume_keeps_practice_evidence() {
        use crate::db::repo::{resume, version};
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO users(id,fingerprint,settings) VALUES('u','f','{}')",
            [],
        )
        .unwrap();
        let resume_id =
            resume::create(&conn, "u", "事实依据", "classic", "zh", &json!({})).unwrap();
        conn.execute_batch("CREATE TRIGGER reject_practice BEFORE INSERT ON interview_practice BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        {
            let tx = conn.transaction().unwrap();
            let version_id =
                version::create_snapshot(&tx, &resume_id, "u", "interview", "练习依据", None)
                    .unwrap()
                    .unwrap();
            assert!(
                insert(
                    &tx,
                    &json!({"id":"failed","resumeId":resume_id,"resumeVersionId":version_id})
                )
                .is_err()
            );
            // 与开始命令相同：任何一步失败，事务丢弃，不能留下孤立版本。
        }
        assert_eq!(
            conn.query_row("SELECT count(*) FROM resume_versions", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        conn.execute_batch("DROP TRIGGER reject_practice").unwrap();
        let version_id =
            version::create_snapshot(&conn, &resume_id, "u", "interview", "练习依据", None)
                .unwrap()
                .unwrap();
        let long_answer = "原始回答，不可截断。".repeat(1500);
        insert(&conn,&json!({"id":"saved","resumeId":resume_id,"resumeVersionId":version_id,"resumeSnapshot":{"title":"事实依据"},"rounds":[{"answer":long_answer}]})).unwrap();
        assert!(version::delete(&conn, &version_id, "u").is_err());
        resume::delete(&conn, &resume_id, "u").unwrap();
        let retained = list_filtered(&conn, None, None).unwrap();
        assert_eq!(retained.len(), 1);
        assert_eq!(retained[0]["rounds"][0]["answer"], long_answer);
        assert_eq!(retained[0]["resumeSnapshot"]["title"], "事实依据");
    }
    #[test]
    fn stale_round_cannot_overwrite_and_snapshot_is_retained() {
        let conn = Connection::open_in_memory().unwrap();
        // 迁移单独可执行，旧数据不需要转换。
        conn.execute_batch(include_str!(
            "../../../migrations/018_interview_practice.sql"
        ))
        .unwrap();
        let mut a = json!({"id":"s","resumeId":"r","resumeVersionId":"v","revision":0,"resumeSnapshot":{"sections":[{"content":"原始经历"}]},"rounds":[]});
        insert(&conn, &a).unwrap();
        let mut stale = a.clone();
        a["rounds"] = json!([{"answer":"完整回答"}]);
        save(&conn, &mut a, 0).unwrap();
        stale["rounds"] = json!([{"answer":"旧响应"}]);
        assert!(save(&conn, &mut stale, 0).is_err());
        assert_eq!(get(&conn, "s").unwrap()["rounds"][0]["answer"], "完整回答");
        assert_eq!(
            list_filtered(&conn, Some("r"), None).unwrap()[0]["resumeSnapshot"]["sections"][0]["content"],
            "原始经历"
        );
    }
}
