use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub fingerprint: Option<String>,
    pub settings: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn find_by_id(conn: &Connection, id: &str) -> Result<Option<User>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, avatar_url, fingerprint, settings, created_at, updated_at
         FROM users WHERE id = ?1",
    )?;
    match stmt.query_row(params![id], map_user) {
        Ok(user) => Ok(Some(user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// 桌面端只有一个本地用户。以前按 localStorage 指纹建用户，WebView 存储一旦
/// 被清空就会凭空多出一个"新用户"、旧简历全部"消失"。现在以数据库里最早的
/// 用户为准，并把历史上误建用户名下的资料一并归并过来。
pub fn ensure_local_user(conn: &Connection) -> Result<User, rusqlite::Error> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM users ORDER BY created_at ASC, rowid ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    let id = match existing {
        Some(id) => id,
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO users (id, name) VALUES (?1, 'User')",
                params![id],
            )?;
            id
        }
    };
    conn.execute(
        "UPDATE resumes SET user_id = ?1 WHERE user_id <> ?1",
        params![id],
    )?;
    conn.execute(
        "UPDATE resume_versions SET user_id = ?1 WHERE user_id <> ?1",
        params![id],
    )?;
    conn.execute("DELETE FROM users WHERE id <> ?1", params![id])?;
    find_by_id(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_settings(conn: &Connection, id: &str) -> Result<Value, rusqlite::Error> {
    let settings_str: String = conn.query_row(
        "SELECT settings FROM users WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(serde_json::from_str(&settings_str).unwrap_or_default())
}

pub fn update_settings(
    conn: &Connection,
    id: &str,
    settings: &Value,
) -> Result<(), rusqlite::Error> {
    let existing = get_settings(conn, id)?;
    let merged = merge_json(existing, settings.clone());
    conn.execute(
        "UPDATE users SET settings = ?1, updated_at = unixepoch() WHERE id = ?2",
        params![serde_json::to_string(&merged).unwrap_or_default(), id],
    )?;
    Ok(())
}

fn map_user(row: &rusqlite::Row) -> Result<User, rusqlite::Error> {
    Ok(User {
        id: row.get(0)?,
        name: row.get(1)?,
        avatar_url: row.get(2)?,
        fingerprint: row.get(3)?,
        settings: serde_json::from_str::<Value>(&row.get::<_, String>(4)?).unwrap_or_default(),
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn merge_json(mut base: Value, patch: Value) -> Value {
    if let (Value::Object(base_map), Value::Object(patch_map)) = (&mut base, patch) {
        for (key, value) in patch_map {
            base_map.insert(key, value);
        }
    }
    base
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn
    }

    #[test]
    fn ensure_local_user_creates_one_and_is_stable() {
        let conn = setup();
        let first = ensure_local_user(&conn).unwrap();
        let second = ensure_local_user(&conn).unwrap();
        assert_eq!(first.id, second.id);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn ensure_local_user_merges_resumes_from_stray_users() {
        let conn = setup();
        conn.execute(
            "INSERT INTO users (id, fingerprint, created_at) VALUES ('old', 'fp-old', 100)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, fingerprint, created_at) VALUES ('stray', 'fp-new', 200)",
            [],
        )
        .unwrap();
        crate::db::repo::resume::create(
            &conn,
            "stray",
            "误入名下的简历",
            "classic",
            "zh",
            &json!({}),
        )
        .unwrap();

        let user = ensure_local_user(&conn).unwrap();
        assert_eq!(user.id, "old");
        let resumes = crate::db::repo::resume::find_all_by_user_id(&conn, "old").unwrap();
        assert_eq!(resumes.len(), 1);
        let users: i64 = conn
            .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .unwrap();
        assert_eq!(users, 1);
    }
}
