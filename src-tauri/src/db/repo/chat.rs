use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub resume_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub metadata: Value,
    pub created_at: i64,
}

pub fn find_sessions_by_resume_id(
    conn: &Connection,
    resume_id: &str,
) -> Result<Vec<ChatSession>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, title, created_at, updated_at FROM chat_sessions WHERE resume_id = ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![resume_id], |row| {
        Ok(ChatSession {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn find_session(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<ChatSession>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, title, created_at, updated_at FROM chat_sessions WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![session_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(ChatSession {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn find_messages(
    conn: &Connection,
    session_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<ChatMessage>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, metadata, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY created_at ASC LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(params![session_id, limit, offset], |row| {
        Ok(ChatMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            metadata: serde_json::from_str(&row.get::<_, String>(4).unwrap_or_default())
                .unwrap_or_default(),
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn count_messages(conn: &Connection, session_id: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(
        "SELECT COUNT(*) FROM chat_messages WHERE session_id = ?1",
        params![session_id],
        |row| row.get(0),
    )
}

pub fn create_session(
    conn: &Connection,
    resume_id: &str,
    title: &str,
) -> Result<String, rusqlite::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO chat_sessions (id, resume_id, title) VALUES (?1, ?2, ?3)",
        params![id, resume_id, title],
    )?;
    Ok(id)
}

pub fn add_message(
    conn: &Connection,
    session_id: &str,
    role: &str,
    content: &str,
    metadata: &Value,
) -> Result<String, rusqlite::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO chat_messages (id, session_id, role, content, metadata) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, session_id, role, content, serde_json::to_string(metadata).unwrap_or_default()],
    )?;
    conn.execute(
        "UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?1",
        params![session_id],
    )?;
    Ok(id)
}

pub fn update_session_title(
    conn: &Connection,
    session_id: &str,
    title: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE chat_sessions SET title = ?1, updated_at = unixepoch() WHERE id = ?2",
        params![title, session_id],
    )?;
    Ok(())
}

pub fn delete_session(conn: &Connection, session_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM chat_sessions WHERE id = ?1",
        params![session_id],
    )?;
    Ok(())
}

/// Since migration 003 chat_sessions no longer FK-cascades from resumes;
/// call this when deleting a resume.
pub fn delete_sessions_for_resume(
    conn: &Connection,
    resume_id: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM chat_sessions WHERE resume_id = ?1",
        params![resume_id],
    )?;
    Ok(())
}

/// Delete a message and everything after it (rowid order = insertion order).
/// Powers conversation rollback / edit-and-resend.
pub fn truncate_from_message(
    conn: &Connection,
    session_id: &str,
    message_id: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM chat_messages
         WHERE session_id = ?1
           AND rowid >= (SELECT rowid FROM chat_messages WHERE id = ?2 AND session_id = ?1)",
        params![session_id, message_id],
    )?;
    conn.execute(
        "UPDATE chat_sessions SET updated_at = unixepoch() WHERE id = ?1",
        params![session_id],
    )?;
    Ok(())
}
