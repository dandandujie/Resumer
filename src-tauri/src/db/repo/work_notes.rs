use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};

pub fn get(conn: &Connection, id: &str) -> Result<Value, String> {
    conn.query_row("SELECT id,body,context,occurred_on,revision,analysis,created_at,experience_id FROM work_notes WHERE id=?1", [id], row).map_err(|e|e.to_string())
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let analysis: Option<String> = r.get(5)?;
    Ok(
        json!({"id":r.get::<_,String>(0)?,"body":r.get::<_,String>(1)?,"context":r.get::<_,String>(2)?,"occurredOn":r.get::<_,String>(3)?,"revision":r.get::<_,i64>(4)?,"analysis":analysis.and_then(|s|serde_json::from_str::<Value>(&s).ok()),"createdAt":r.get::<_,i64>(6)?,"experienceId":r.get::<_,Option<String>>(7)?}),
    )
}
#[cfg(test)]
pub fn list(
    conn: &Connection,
    query: &str,
    context: Option<&str>,
    offset: usize,
) -> Result<Vec<Value>, String> {
    list_for_experience(conn, query, context, offset, None)
}
pub fn list_for_experience(
    conn: &Connection,
    query: &str,
    context: Option<&str>,
    offset: usize,
    experience_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    conn.prepare("SELECT id,body,context,occurred_on,revision,analysis,created_at,experience_id FROM work_notes WHERE (?1='' OR instr(lower(body || ' ' || context),lower(?1))>0) AND (?2 IS NULL OR context=?2) AND (?4 IS NULL OR experience_id=?4 OR (?4='__unassigned__' AND experience_id IS NULL)) ORDER BY occurred_on DESC,created_at DESC,rowid DESC LIMIT 100 OFFSET ?3").map_err(|e|e.to_string())?.query_map(params![query,context,offset,experience_id],row).map_err(|e|e.to_string())?.map(|r|r.map_err(|e|e.to_string())).collect()
}

pub fn save(conn: &Connection, note: &Value, expected: Option<i64>) -> Result<Value, String> {
    let id = note["id"].as_str().unwrap_or("");
    let values = (
        note["body"].as_str().unwrap_or(""),
        note["context"].as_str().unwrap_or(""),
        note["occurredOn"].as_str().unwrap_or(""),
    );
    let experience_id = note["experienceId"].as_str();
    if let Some(experience_id) = experience_id {
        let exists = conn
            .query_row(
                "SELECT 1 FROM work_experiences WHERE id=?1 AND started_on<=?2",
                params![experience_id, values.2],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err("请先开始这段经历，再记录发生的工作".into());
        }
    }
    if let Some(revision) = expected {
        let changed = conn.execute("UPDATE work_notes SET body=?1,context=?2,occurred_on=?3,revision=revision+1,analysis=NULL,experience_id=?6 WHERE id=?4 AND revision=?5",params![values.0,values.1,values.2,id,revision,experience_id]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("这条随记已经变化，请刷新后再改；你的输入仍保留着".into());
        }
    } else {
        if let Ok(old) = get(conn, id) {
            if old["body"] == note["body"]
                && old["context"] == note["context"]
                && old["occurredOn"] == note["occurredOn"]
                && old["experienceId"] == note["experienceId"]
            {
                return Ok(old);
            }
            return Err("这条随记已保存，请刷新后继续".into());
        }
        conn.execute(
            "INSERT INTO work_notes(id,body,context,occurred_on,experience_id) VALUES(?1,?2,?3,?4,?5)",
            params![id, values.0, values.1, values.2,experience_id],
        )
        .map_err(|e| e.to_string())?;
    }
    get(conn, id)
}
pub fn analyzed(
    conn: &Connection,
    id: &str,
    revision: i64,
    analysis: &Value,
) -> Result<Value, String> {
    let changed = conn
        .execute(
            "UPDATE work_notes SET analysis=?1 WHERE id=?2 AND revision=?3",
            params![analysis.to_string(), id, revision],
        )
        .map_err(|e| e.to_string())?;
    if changed != 1 {
        return Err("原话已修改或删除，这次整理没有覆盖它".into());
    }
    get(conn, id)
}
pub fn sources_current(conn: &Connection, sources: &[Value]) -> bool {
    sources.iter().all(|source| {
        get(conn, source["id"].as_str().unwrap_or("")).is_ok_and(|current| {
            current["revision"] == source["revision"] && current["body"] == source["body"]
        })
    })
}
pub fn draft(conn: &Connection, slot: &str) -> Result<Option<Value>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT data FROM work_note_drafts WHERE slot=?1",
            [slot],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    raw.map(|raw| {
        let mut data: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        data["stale"] = json!(!sources_current(
            conn,
            data["sources"].as_array().map(Vec::as_slice).unwrap_or(&[])
        ));
        Ok(data)
    })
    .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&c).unwrap();
        c
    }
    fn note() -> Value {
        json!({"id":"a","body":"参与排查，100% 不是我的个人成果","context":"实习","occurredOn":"2026-11-02"})
    }
    #[test]
    fn local_first_idempotent_save_and_literal_search() {
        let c = db();
        let n = note();
        let first = save(&c, &n, None).unwrap();
        assert_eq!(save(&c, &n, None).unwrap(), first);
        assert_eq!(list(&c, "%", Some("实习"), 0).unwrap().len(), 1);
        assert!(list(&c, "_", None, 0).unwrap().is_empty());
        assert_eq!(list(&c, "个人成果", None, 0).unwrap().len(), 1);
        assert!(list(&c, "", None, 100).unwrap().is_empty());
    }
    #[test]
    fn edits_and_deletes_invalidate_slow_analysis_and_drafts() {
        let c = db();
        let mut n = note();
        let first = save(&c, &n, None).unwrap();
        analyzed(&c, "a", 0, &json!({"reply":"ok"})).unwrap();
        n["body"] = json!("更正：只是旁听");
        save(&c, &n, Some(0)).unwrap();
        assert!(save(&c, &n, Some(0)).is_err());
        assert!(analyzed(&c, "a", 0, &json!({"reply":"stale"})).is_err());
        assert!(get(&c, "a").unwrap()["analysis"].is_null());
        assert!(!sources_current(&c, &[first]));
        c.execute("DELETE FROM work_notes WHERE id='a'", [])
            .unwrap();
        assert!(analyzed(&c, "a", 1, &json!({})).is_err());
    }
    #[test]
    fn old_long_notes_remain_searchable_beyond_the_first_page() {
        let c = db();
        let mut old = note();
        old["occurredOn"] = json!("2020-01-01");
        old["body"] = json!(format!("{}\n老项目回滚详情", "原始记录".repeat(2000)));
        save(&c, &old, None).unwrap();
        for index in 0..125 {
            let mut recent = note();
            recent["id"] = json!(format!("recent-{index}"));
            save(&c, &recent, None).unwrap();
        }
        assert_eq!(list(&c, "", None, 0).unwrap().len(), 100);
        assert_eq!(list(&c, "", None, 100).unwrap().len(), 26);
        let found = list(&c, "老项目回滚", None, 0).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0]["body"], old["body"]);
    }
    #[test]
    fn migration_preserves_existing_records_and_write_failure_returns_error() {
        let c = db();
        save(&c, &note(), None).unwrap();
        crate::db::migrate::run(&c).unwrap();
        assert_eq!(get(&c, "a").unwrap()["body"], note()["body"]);
        c.execute_batch("CREATE TRIGGER fail_update BEFORE UPDATE ON work_notes BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        assert!(save(&c, &note(), Some(0)).is_err());
        assert_eq!(get(&c, "a").unwrap()["revision"], 0);
    }
}
