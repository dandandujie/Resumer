use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GrammarCheck {
    pub id: String,
    pub resume_id: String,
    pub result: Value,
    pub score: i32,
    pub issue_count: i32,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JdAnalysis {
    pub id: String,
    pub resume_id: String,
    pub job_description: String,
    pub result: Value,
    pub overall_score: i32,
    pub ats_score: i32,
    pub created_at: i64,
}

pub fn list_grammar_checks(
    conn: &Connection,
    resume_id: &str,
) -> Result<Vec<GrammarCheck>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, result, score, issue_count, created_at FROM grammar_checks WHERE resume_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![resume_id], |row| {
        Ok(GrammarCheck {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            result: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or_default(),
            score: row.get(3)?,
            issue_count: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn save_grammar_check(
    conn: &Connection,
    resume_id: &str,
    result: &Value,
    score: i32,
    issue_count: i32,
) -> Result<String, rusqlite::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO grammar_checks (id, resume_id, result, score, issue_count) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, resume_id, serde_json::to_string(result).unwrap_or_default(), score, issue_count],
    )?;
    Ok(id)
}

pub fn get_grammar_check(
    conn: &Connection,
    id: &str,
) -> Result<Option<GrammarCheck>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, result, score, issue_count, created_at FROM grammar_checks WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(GrammarCheck {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            result: serde_json::from_str(&row.get::<_, String>(2)?).unwrap_or_default(),
            score: row.get(3)?,
            issue_count: row.get(4)?,
            created_at: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_grammar_check(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM grammar_checks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_jd_analyses(
    conn: &Connection,
    resume_id: &str,
) -> Result<Vec<JdAnalysis>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, job_description, result, overall_score, ats_score, created_at FROM jd_analyses WHERE resume_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![resume_id], |row| {
        Ok(JdAnalysis {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            job_description: row.get(2)?,
            result: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
            overall_score: row.get(4)?,
            ats_score: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn save_jd_analysis(
    conn: &Connection,
    resume_id: &str,
    job_description: &str,
    result: &Value,
    overall_score: i32,
    ats_score: i32,
) -> Result<String, rusqlite::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO jd_analyses (id, resume_id, job_description, result, overall_score, ats_score) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, resume_id, job_description, serde_json::to_string(result).unwrap_or_default(), overall_score, ats_score],
    )?;
    Ok(id)
}

pub fn get_jd_analysis(conn: &Connection, id: &str) -> Result<Option<JdAnalysis>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, job_description, result, overall_score, ats_score, created_at FROM jd_analyses WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(JdAnalysis {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            job_description: row.get(2)?,
            result: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
            overall_score: row.get(4)?,
            ats_score: row.get(5)?,
            created_at: row.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_jd_analysis(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM jd_analyses WHERE id = ?1", params![id])?;
    Ok(())
}
