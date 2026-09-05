use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Resume {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub template: String,
    pub theme_config: Value,
    pub is_default: bool,
    pub language: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResumeSection {
    pub id: String,
    pub resume_id: String,
    #[serde(rename = "type")]
    pub section_type: String,
    pub title: String,
    pub sort_order: i32,
    pub visible: bool,
    pub content: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeWithSections {
    #[serde(flatten)]
    pub resume: Resume,
    pub sections: Vec<ResumeSection>,
}

pub fn find_all_by_user_id(conn: &Connection, user_id: &str) -> Result<Vec<Resume>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, template, theme_config, is_default, language, created_at, updated_at
         FROM resumes WHERE user_id = ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(Resume {
            id: row.get(0)?,
            user_id: row.get(1)?,
            title: row.get(2)?,
            template: row.get(3)?,
            theme_config: serde_json::from_str::<Value>(&row.get::<_, String>(4)?).unwrap_or_default(),
            is_default: row.get(5)?,
            language: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn find_by_id(conn: &Connection, id: &str, user_id: &str) -> Result<Option<ResumeWithSections>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, template, theme_config, is_default, language, created_at, updated_at
         FROM resumes WHERE id = ?1 AND user_id = ?2",
    )?;
    let resume = stmt
        .query_row(params![id, user_id], |row| {
            Ok(Resume {
                id: row.get(0)?,
                user_id: row.get(1)?,
                title: row.get(2)?,
                template: row.get(3)?,
                theme_config: serde_json::from_str::<Value>(&row.get::<_, String>(4)?).unwrap_or_default(),
                is_default: row.get(5)?,
                language: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .optional()?;

    match resume {
        Some(r) => {
            let sections = find_sections_by_resume_id(conn, &r.id)?;
            Ok(Some(ResumeWithSections {
                resume: r,
                sections,
            }))
        }
        None => Ok(None),
    }
}

pub fn find_sections_by_resume_id(conn: &Connection, resume_id: &str) -> Result<Vec<ResumeSection>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, resume_id, type, title, sort_order, visible, content, created_at, updated_at
         FROM resume_sections WHERE resume_id = ?1 ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map(params![resume_id], |row| {
        Ok(ResumeSection {
            id: row.get(0)?,
            resume_id: row.get(1)?,
            section_type: row.get(2)?,
            title: row.get(3)?,
            sort_order: row.get(4)?,
            visible: row.get(5)?,
            content: serde_json::from_str::<Value>(&row.get::<_, String>(6)?).unwrap_or_default(),
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn find_by_id_any(conn: &Connection, id: &str) -> Result<Option<ResumeWithSections>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, template, theme_config, is_default, language, created_at, updated_at
         FROM resumes WHERE id = ?1",
    )?;
    let resume = stmt
        .query_row(params![id], |row| {
            Ok(Resume {
                id: row.get(0)?,
                user_id: row.get(1)?,
                title: row.get(2)?,
                template: row.get(3)?,
                theme_config: serde_json::from_str::<Value>(&row.get::<_, String>(4)?).unwrap_or_default(),
                is_default: row.get(5)?,
                language: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .optional()?;
    match resume {
        Some(r) => {
            let sections = find_sections_by_resume_id(conn, &r.id)?;
            Ok(Some(ResumeWithSections { resume: r, sections }))
        }
        None => Ok(None),
    }
}

pub fn update_language(conn: &Connection, id: &str, language: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE resumes SET language = ?1, updated_at = unixepoch() WHERE id = ?2",
        params![language, id],
    )?;
    Ok(())
}

pub fn create(conn: &Connection, user_id: &str, title: &str, template: &str, language: &str, theme_config: &Value) -> Result<String, rusqlite::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO resumes (id, user_id, title, template, language, theme_config) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, user_id, title, template, language, serde_json::to_string(theme_config).unwrap_or_default()],
    )?;
    Ok(id)
}

/// template / theme_config 为 None 时保持原值不动。
pub fn update(
    conn: &Connection,
    id: &str,
    user_id: &str,
    title: &str,
    template: Option<&str>,
    theme_config: Option<&Value>,
) -> Result<(), rusqlite::Error> {
    let theme_json = theme_config.map(|t| serde_json::to_string(t).unwrap_or_default());
    conn.execute(
        "UPDATE resumes SET title = ?1, template = COALESCE(?2, template), theme_config = COALESCE(?3, theme_config), updated_at = unixepoch()
         WHERE id = ?4 AND user_id = ?5",
        params![title, template, theme_json, id, user_id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str, user_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM resumes WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
    )?;
    // chat_sessions lost its FK cascade in migration 003 — clean up manually
    // (chat_messages still cascade from chat_sessions).
    super::chat::delete_sessions_for_resume(conn, id)?;
    Ok(())
}

pub fn duplicate(conn: &Connection, id: &str, user_id: &str) -> Result<String, rusqlite::Error> {
    let source = find_by_id(conn, id, user_id)?;
    match source {
        Some(src) => {
            let new_id = create(
                conn,
                user_id,
                &format!("{} (Copy)", src.resume.title),
                &src.resume.template,
                &src.resume.language,
                &src.resume.theme_config,
            )?;
            for section in &src.sections {
                create_section(
                    conn,
                    &new_id,
                    &section.section_type,
                    &section.title,
                    section.sort_order,
                    section.visible,
                    &section.content,
                )?;
            }
            Ok(new_id)
        }
        None => Err(rusqlite::Error::QueryReturnedNoRows),
    }
}

pub fn create_section(
    conn: &Connection,
    resume_id: &str,
    section_type: &str,
    title: &str,
    sort_order: i32,
    visible: bool,
    content: &Value,
) -> Result<String, rusqlite::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    insert_section(conn, &id, resume_id, section_type, title, sort_order, visible, content)
}

pub fn create_section_with_id(
    conn: &Connection,
    section_id: &str,
    resume_id: &str,
    section_type: &str,
    title: &str,
    sort_order: i32,
    visible: bool,
    content: &Value,
) -> Result<String, rusqlite::Error> {
    insert_section(conn, section_id, resume_id, section_type, title, sort_order, visible, content)
}

fn insert_section(
    conn: &Connection,
    section_id: &str,
    resume_id: &str,
    section_type: &str,
    title: &str,
    sort_order: i32,
    visible: bool,
    content: &Value,
) -> Result<String, rusqlite::Error> {
    conn.execute(
        "INSERT INTO resume_sections (id, resume_id, type, title, sort_order, visible, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![section_id, resume_id, section_type, title, sort_order, visible, serde_json::to_string(content).unwrap_or_default()],
    )?;
    // Update resume timestamp
    conn.execute(
        "UPDATE resumes SET updated_at = unixepoch() WHERE id = ?1",
        params![resume_id],
    )?;
    Ok(section_id.to_string())
}

pub fn update_section(conn: &Connection, section_id: &str, title: &str, sort_order: i32, visible: bool, content: &Value) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE resume_sections SET title = ?1, sort_order = ?2, visible = ?3, content = ?4, updated_at = unixepoch() WHERE id = ?5",
        params![title, sort_order, visible, serde_json::to_string(content).unwrap_or_default(), section_id],
    )?;
    // Update parent resume timestamp
    conn.execute(
        "UPDATE resumes SET updated_at = unixepoch() WHERE id = (SELECT resume_id FROM resume_sections WHERE id = ?1)",
        params![section_id],
    )?;
    Ok(())
}

pub fn delete_section(conn: &Connection, section_id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM resume_sections WHERE id = ?1", params![section_id])?;
    Ok(())
}

// Make rusqlite::Error optional return work
trait OptionalRow {
    fn optional(self) -> Result<Option<Resume>, rusqlite::Error>;
}

impl OptionalRow for Result<Resume, rusqlite::Error> {
    fn optional(self) -> Result<Option<Resume>, rusqlite::Error> {
        match self {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
