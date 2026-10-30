use serde_json::Value;
use tauri::State;

use super::CommandError;
use crate::db::AppDb;
use crate::db::repo::resume as repo;
use crate::db::repo::version as version_repo;

fn parse_sections_payload(
    sections: Option<Value>,
) -> Result<Option<Vec<SectionInput>>, CommandError> {
    let Some(value) = sections else {
        return Ok(None);
    };

    let items = value.as_array().ok_or_else(|| CommandError {
        message: "sections must be an array".into(),
    })?;

    let mut parsed = Vec::with_capacity(items.len());
    for item in items {
        parsed.push(parse_section_input(item)?);
    }

    Ok(Some(parsed))
}

/// 只更新 payload 里给出的字段：重命名这类只带 title 的请求不能把模板和主题
/// 重置成默认值（这正是之前工作台改名后模板"跳回 classic"的原因）。
struct UpdateResumePayload {
    id: String,
    user_id: String,
    title: String,
    template: Option<String>,
    theme_config: Option<Value>,
    sections: Option<Vec<SectionInput>>,
}

fn parse_update_resume_payload(payload: Value) -> Result<UpdateResumePayload, CommandError> {
    let obj = payload.as_object().ok_or_else(|| CommandError {
        message: "update_resume payload must be an object".into(),
    })?;

    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "update_resume payload.id is required".into(),
        })?
        .to_string();

    let user_id = obj
        .get("userId")
        .or_else(|| obj.get("user_id"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "update_resume payload.userId is required".into(),
        })?
        .to_string();

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "update_resume payload.title is required".into(),
        })?
        .to_string();

    let template = obj
        .get("template")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .map(str::to_string);

    let theme_config = obj
        .get("themeConfig")
        .or_else(|| obj.get("theme_config"))
        .filter(|v| v.is_object())
        .cloned();

    let sections = parse_sections_payload(obj.get("sections").cloned())?;

    Ok(UpdateResumePayload {
        id,
        user_id,
        title,
        template,
        theme_config,
        sections,
    })
}

fn parse_section_input(value: &Value) -> Result<SectionInput, CommandError> {
    let obj = value.as_object().ok_or_else(|| CommandError {
        message: "section item must be an object".into(),
    })?;

    let section_type = obj
        .get("type")
        .or_else(|| obj.get("sectionType"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "section.type is required".into(),
        })?
        .to_string();

    let title = obj
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| CommandError {
            message: "section.title is required".into(),
        })?
        .to_string();

    let sort_order = obj
        .get("sortOrder")
        .or_else(|| obj.get("sort_order"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let visible = obj.get("visible").and_then(|v| v.as_bool());
    let content = obj.get("content").cloned();
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    Ok(SectionInput {
        id,
        section_type,
        title,
        sort_order,
        visible,
        content,
    })
}

fn sync_sections(
    conn: &rusqlite::Connection,
    resume_id: &str,
    incoming: &[SectionInput],
) -> Result<(), rusqlite::Error> {
    let existing = repo::find_sections_by_resume_id(conn, resume_id)?;
    let existing_ids: std::collections::HashSet<&str> =
        existing.iter().map(|s| s.id.as_str()).collect();
    let incoming_ids: std::collections::HashSet<&str> = incoming
        .iter()
        .filter_map(|s| s.id.as_deref())
        .filter(|id| !id.trim().is_empty())
        .collect();

    // 删除已经不存在的区块，保持前后端状态一致。
    for ex in &existing {
        if !incoming_ids.contains(ex.id.as_str()) {
            repo::delete_section(conn, &ex.id)?;
        }
    }

    for (i, sec) in incoming.iter().enumerate() {
        let sort_order = sec.sort_order.unwrap_or(i as i32);
        let visible = sec.visible.unwrap_or(true);
        let content = sec
            .content
            .clone()
            .unwrap_or(Value::Object(Default::default()));

        match sec.id.as_deref().filter(|id| !id.trim().is_empty()) {
            Some(sec_id) if existing_ids.contains(sec_id) => {
                repo::update_section(conn, sec_id, &sec.title, sort_order, visible, &content)?;
            }
            Some(sec_id) => {
                repo::create_section_with_id(
                    conn,
                    sec_id,
                    resume_id,
                    &sec.section_type,
                    &sec.title,
                    sort_order,
                    visible,
                    &content,
                )?;
            }
            None => {
                repo::create_section(
                    conn,
                    resume_id,
                    &sec.section_type,
                    &sec.title,
                    sort_order,
                    visible,
                    &content,
                )?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn list_resumes(db: State<AppDb>, user_id: String) -> Result<Vec<Value>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let resumes = repo::find_all_by_user_id(&conn, &user_id)?;

    // Attach a lightweight content summary per resume so the dashboard cards
    // show real information instead of a decorative placeholder.
    let mut out = Vec::with_capacity(resumes.len());
    for r in resumes {
        let summary = build_card_summary(&conn, &r.id);
        let mut v = serde_json::to_value(&r).unwrap_or_default();
        if let Value::Object(ref mut map) = v {
            map.insert("summary".into(), summary);
        }
        out.push(v);
    }
    Ok(out)
}

/// Extract card-level highlights: name/job title, latest experience, a few
/// skills, and how many sections have real content.
fn build_card_summary(conn: &rusqlite::Connection, resume_id: &str) -> Value {
    let mut full_name = String::new();
    let mut job_title = String::new();
    let mut latest_company = String::new();
    let mut latest_position = String::new();
    let mut skills: Vec<String> = Vec::new();
    let mut filled_sections = 0i64;
    let mut section_count = 0i64;

    let rows: Vec<(String, String)> = conn
        .prepare("SELECT type, content FROM resume_sections WHERE resume_id = ?1 AND visible = 1 ORDER BY sort_order")
        .and_then(|mut stmt| {
            stmt.query_map([resume_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .and_then(|r| r.collect())
        })
        .unwrap_or_default();

    for (sec_type, content_str) in &rows {
        section_count += 1;
        let content: Value = serde_json::from_str(content_str).unwrap_or_default();
        let has_content = match sec_type.as_str() {
            "personal_info" => {
                full_name = content
                    .get("fullName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                job_title = content
                    .get("jobTitle")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                !full_name.is_empty() || !job_title.is_empty()
            }
            "summary" => content
                .get("text")
                .and_then(|v| v.as_str())
                .map(|t| !t.trim().is_empty())
                .unwrap_or(false),
            "work_experience" => {
                if let Some(item) = content
                    .get("items")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                {
                    latest_company = item
                        .get("company")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    latest_position = item
                        .get("position")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                }
                !latest_company.is_empty() || !latest_position.is_empty()
            }
            "skills" => {
                if let Some(cats) = content.get("categories").and_then(|v| v.as_array()) {
                    for cat in cats {
                        if let Some(list) = cat.get("skills").and_then(|v| v.as_array()) {
                            for s in list {
                                if let Some(name) = s.as_str() {
                                    let name = name.trim();
                                    if !name.is_empty() && skills.len() < 6 {
                                        skills.push(name.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                !skills.is_empty()
            }
            _ => content
                .get("items")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false),
        };
        if has_content {
            filled_sections += 1;
        }
    }

    serde_json::json!({
        "fullName": full_name,
        "jobTitle": job_title,
        "latestCompany": latest_company,
        "latestPosition": latest_position,
        "skills": skills,
        "sectionCount": section_count,
        "filledSections": filled_sections,
    })
}

#[tauri::command]
pub fn get_resume(
    db: State<AppDb>,
    id: String,
    user_id: String,
) -> Result<Option<repo::ResumeWithSections>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::find_by_id(&conn, &id, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn create_resume(
    db: State<AppDb>,
    user_id: String,
    title: String,
    template: Option<String>,
    language: Option<String>,
    theme_config: Option<Value>,
    sections: Option<Value>,
) -> Result<String, CommandError> {
    let mut conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let tmpl = template.as_deref().unwrap_or("classic");
    let lang = language.as_deref().unwrap_or("zh");
    let config = theme_config.unwrap_or(Value::Object(Default::default()));
    let tx = conn.transaction()?;
    let resume_id = repo::create(&tx, &user_id, &title, tmpl, lang, &config)?;

    if let Some(secs) = parse_sections_payload(sections)? {
        for (i, sec) in secs.iter().enumerate() {
            repo::create_section(
                &tx,
                &resume_id,
                &sec.section_type,
                &sec.title,
                sec.sort_order.unwrap_or(i as i32),
                sec.visible.unwrap_or(true),
                &sec.content
                    .clone()
                    .unwrap_or(Value::Object(Default::default())),
            )?;
        }
    }
    tx.commit()?;

    Ok(resume_id)
}

#[tauri::command]
pub fn update_resume(db: State<AppDb>, payload: Value) -> Result<(), CommandError> {
    let mut conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let language = payload
        .get("language")
        .and_then(Value::as_str)
        .map(String::from);
    let input = parse_update_resume_payload(payload)?;
    let current =
        repo::find_by_id(&conn, &input.id, &input.user_id)?.ok_or("简历不存在".to_owned())?;
    if current.resume.template == crate::db::repo::document::TEMPLATE
        && (input.sections.is_some() || input.template.is_some() || input.theme_config.is_some())
    {
        return Err("原文档请在原文档编辑器中修改，不能以结构化字段覆盖"
            .to_owned()
            .into());
    }
    let tx = conn.transaction()?;
    repo::update(
        &tx,
        &input.id,
        &input.user_id,
        &input.title,
        input.template.as_deref(),
        input.theme_config.as_ref(),
    )?;

    if let Some(incoming) = input.sections {
        sync_sections(&tx, &input.id, &incoming)?;
    }
    if let Some(language) = language {
        repo::update_language(&tx, &input.id, &language)?;
    }
    // 保存仅更新工作稿，历史由导出、投递、手动留档和覆盖保护生成。
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn list_resume_versions(
    db: State<AppDb>,
    resume_id: String,
    user_id: String,
) -> Result<Vec<version_repo::ResumeVersionSummary>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    version_repo::list(&conn, &resume_id, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn get_resume_version(
    db: State<AppDb>,
    id: String,
    user_id: String,
) -> Result<Option<version_repo::ResumeVersion>, CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    version_repo::find(&conn, &id, &user_id).map_err(Into::into)
}

/// 由前端在导出 / 投递 / AI 采纳等事件点显式调用；带 label 的事件总会记录一条。
#[tauri::command]
pub fn create_resume_version(
    db: State<AppDb>,
    resume_id: String,
    user_id: String,
    event: String,
    label: Option<String>,
) -> Result<Option<String>, CommandError> {
    if event == "manual"
        && label
            .as_deref()
            .is_none_or(|value| value.trim().is_empty() || value.trim().chars().count() > 80)
    {
        return Err(CommandError {
            message: "版本名称须为 1–80 个字符".into(),
        });
    }
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    version_repo::create_snapshot(
        &conn,
        &resume_id,
        &user_id,
        &event,
        label.as_deref().unwrap_or(""),
        None,
    )
    .map_err(Into::into)
}

/// 重命名只修改用户名称，保留事件类型、时间和投递凭据。
#[tauri::command]
pub fn rename_resume_version(
    db: State<AppDb>,
    id: String,
    user_id: String,
    name: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(CommandError {
            message: "版本名称须为 1–80 个字符".into(),
        });
    }
    version_repo::rename(&conn, &id, &user_id, name)?;
    Ok(())
}

#[tauri::command]
pub fn delete_resume_version(
    db: State<AppDb>,
    id: String,
    user_id: String,
) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    version_repo::delete(&conn, &id, &user_id).map_err(|message| CommandError { message })
}

/// 恢复与保护当前草稿必须在同一事务内完成。
#[tauri::command]
pub fn restore_resume_version(
    db: State<AppDb>,
    version_id: String,
    user_id: String,
    label: String,
) -> Result<(), CommandError> {
    let mut conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let version = {
        let conn: &rusqlite::Connection = &conn;
        version_repo::find(conn, &version_id, &user_id)?.ok_or(CommandError {
            message: "版本不存在".into(),
        })?
    };
    let tx = conn.transaction()?;
    version_repo::create_snapshot(
        &tx,
        &version.summary.resume_id,
        &user_id,
        "restore",
        &label,
        None,
    )?;
    version_repo::restore(&tx, &version, &user_id)?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn delete_resume(db: State<AppDb>, id: String, user_id: String) -> Result<(), CommandError> {
    let conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    repo::delete(&conn, &id, &user_id).map_err(Into::into)
}

#[tauri::command]
pub fn duplicate_resume(
    db: State<AppDb>,
    id: String,
    user_id: String,
) -> Result<String, CommandError> {
    let mut conn = db.conn.lock().map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let tx = conn.transaction()?;
    let new_id = repo::duplicate(&tx, &id, &user_id)?;
    tx.commit()?;
    Ok(new_id)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionInput {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub section_type: String,
    pub title: String,
    pub sort_order: Option<i32>,
    pub visible: Option<bool>,
    pub content: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{Connection, params};
    use serde_json::json;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(include_str!("../../migrations/001_initial.sql"))
            .unwrap();
        conn.execute(
            "INSERT INTO users (id, fingerprint, settings) VALUES (?1, ?2, ?3)",
            params!["user-1", "fingerprint-1", "{}"],
        )
        .unwrap();
        conn
    }

    #[test]
    fn sync_sections_creates_new_section_when_client_supplies_id() {
        let conn = setup_conn();
        let resume_id =
            repo::create(&conn, "user-1", "测试简历", "classic", "zh", &json!({})).unwrap();

        let incoming = vec![SectionInput {
            id: Some("section-from-client".into()),
            section_type: "summary".into(),
            title: "个人简介".into(),
            sort_order: Some(0),
            visible: Some(true),
            content: Some(json!({ "text": "hello world" })),
        }];

        sync_sections(&conn, &resume_id, &incoming).unwrap();

        let sections = repo::find_sections_by_resume_id(&conn, &resume_id).unwrap();
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].id, "section-from-client");
        assert_eq!(sections[0].title, "个人简介");
        assert_eq!(sections[0].content, json!({ "text": "hello world" }));
    }

    #[test]
    fn parse_sections_payload_supports_camel_case_fields() {
        let parsed = parse_sections_payload(Some(json!([
            {
                "id": "client-section-1",
                "type": "personal_info",
                "title": "个人信息",
                "sortOrder": 0,
                "visible": true,
                "content": {
                    "fullName": "张三",
                    "jobTitle": "工程师"
                }
            }
        ])))
        .unwrap()
        .unwrap();

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id.as_deref(), Some("client-section-1"));
        assert_eq!(parsed[0].section_type, "personal_info");
        assert_eq!(parsed[0].sort_order, Some(0));
        assert_eq!(parsed[0].visible, Some(true));
        assert_eq!(
            parsed[0].content,
            Some(json!({
                "fullName": "张三",
                "jobTitle": "工程师"
            }))
        );
    }

    #[test]
    fn parse_update_resume_payload_reads_nested_sections_from_single_payload() {
        let input = parse_update_resume_payload(json!({
            "id": "resume-1",
            "userId": "user-1",
            "title": "测试简历",
            "template": "modern",
            "themeConfig": { "primaryColor": "#111111" },
            "sections": [
                {
                    "id": "section-1",
                    "type": "summary",
                    "title": "个人简介",
                    "sortOrder": 0,
                    "visible": true,
                    "content": { "text": "hello" }
                }
            ]
        }))
        .unwrap();

        assert_eq!(input.id, "resume-1");
        assert_eq!(input.user_id, "user-1");
        assert_eq!(input.title, "测试简历");
        assert_eq!(input.template.as_deref(), Some("modern"));
        assert_eq!(
            input.theme_config,
            Some(json!({ "primaryColor": "#111111" }))
        );
        assert_eq!(input.sections.unwrap()[0].section_type, "summary");
    }

    #[test]
    fn rename_only_payload_keeps_template_and_theme() {
        let mut conn = setup_conn();
        let resume_id = repo::create(
            &conn,
            "user-1",
            "测试简历",
            "modern",
            "zh",
            &json!({ "primaryColor": "#123456" }),
        )
        .unwrap();
        let input = parse_update_resume_payload(json!({
            "id": resume_id,
            "userId": "user-1",
            "title": "改名后",
        }))
        .unwrap();
        assert!(input.template.is_none());
        assert!(input.theme_config.is_none());

        let tx = conn.transaction().unwrap();
        repo::update(
            &tx,
            &input.id,
            &input.user_id,
            &input.title,
            input.template.as_deref(),
            input.theme_config.as_ref(),
        )
        .unwrap();
        tx.commit().unwrap();

        let stored = repo::find_by_id(&conn, &resume_id, "user-1")
            .unwrap()
            .unwrap();
        assert_eq!(stored.resume.title, "改名后");
        assert_eq!(stored.resume.template, "modern");
        assert_eq!(
            stored.resume.theme_config,
            json!({ "primaryColor": "#123456" })
        );
    }

    #[test]
    fn full_save_syncs_sections_and_theme() {
        let mut conn = setup_conn();
        let resume_id =
            repo::create(&conn, "user-1", "测试简历", "classic", "zh", &json!({})).unwrap();
        let input = parse_update_resume_payload(json!({
            "id": resume_id,
            "userId": "user-1",
            "title": "测试简历 v2",
            "template": "modern",
            "themeConfig": { "accentColor": "#abcdef" },
            "sections": [
                {
                    "id": "section-1",
                    "type": "summary",
                    "title": "个人简介",
                    "sortOrder": 0,
                    "visible": true,
                    "content": { "text": "第二版" }
                }
            ]
        }))
        .unwrap();
        let tx = conn.transaction().unwrap();
        repo::update(
            &tx,
            &input.id,
            &input.user_id,
            &input.title,
            input.template.as_deref(),
            input.theme_config.as_ref(),
        )
        .unwrap();
        sync_sections(&tx, &input.id, &input.sections.unwrap()).unwrap();
        tx.commit().unwrap();

        let stored = repo::find_by_id(&conn, &resume_id, "user-1")
            .unwrap()
            .unwrap();
        assert_eq!(stored.resume.template, "modern");
        assert_eq!(
            stored.resume.theme_config,
            json!({ "accentColor": "#abcdef" })
        );
        assert_eq!(stored.sections.len(), 1);
        assert_eq!(stored.sections[0].content, json!({ "text": "第二版" }));
    }
}
