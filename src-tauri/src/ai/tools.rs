use rusqlite::Connection;
use serde_json::{json, Value};

use super::provider::ToolSpec;
use crate::db::repo::resume as resume_repo;

/// 简历 AI 助手可用的工具：只做"改这份简历"这一件事。
pub fn tool_specs() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "updateSection".into(),
            description: "Update a specific field in a resume section. Use field=\"items\" for list sections or field=\"categories\" for skills. For complex values pass JSON strings.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sectionId": { "type": "string", "description": "The ID of the section to update" },
                    "field": { "type": "string", "description": "The field within the section to update" },
                    "value": { "type": "string", "description": "The new value. For arrays/objects, pass JSON string." },
                },
                "required": ["sectionId", "field", "value"]
            }),
        },
        ToolSpec {
            name: "addSection".into(),
            description: "Add a new section to the resume.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "type": { "type": "string", "description": "Section type (work_experience, education, skills, etc.)" },
                    "title": { "type": "string" },
                    "content": { "type": "string", "description": "Initial content as JSON string (optional)" },
                },
                "required": ["type", "title"]
            }),
        },
        ToolSpec {
            name: "removeSection".into(),
            description: "Remove a section from the resume by its ID. Only when the user explicitly asks.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sectionId": { "type": "string", "description": "The ID of the section to remove" },
                },
                "required": ["sectionId"]
            }),
        },
        ToolSpec {
            name: "rewriteText".into(),
            description: "Rewrite a plain-text field (e.g. summary.text) to improve impact and clarity.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sectionId": { "type": "string" },
                    "field": { "type": "string" },
                    "improvedText": { "type": "string" },
                },
                "required": ["sectionId", "field", "improvedText"]
            }),
        },
        ToolSpec {
            name: "suggestSkills".into(),
            description: "Add suggested skills to the skills section under a category.".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "skills": { "type": "array", "items": { "type": "string" } },
                    "category": { "type": "string" },
                },
                "required": ["skills", "category"]
            }),
        },
    ]
}

fn ensure_id(mut v: Value) -> Value {
    if let Value::Object(ref mut obj) = v {
        if !obj.contains_key("id") {
            obj.insert("id".into(), Value::String(uuid::Uuid::new_v4().to_string()));
        }
    }
    v
}

fn ensure_item_ids(value: Value) -> Value {
    match value {
        Value::Array(arr) => Value::Array(arr.into_iter().map(ensure_id).collect()),
        other => other,
    }
}

/// Parse AI-provided value. Accepts strings that may be JSON.
fn parse_value(raw: &Value) -> Value {
    if let Some(s) = raw.as_str() {
        if let Ok(parsed) = serde_json::from_str::<Value>(s) {
            return parsed;
        }
        return Value::String(s.to_string());
    }
    raw.clone()
}

pub fn exec_update_section(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let section_id = args.get("sectionId").and_then(|v| v.as_str()).ok_or("sectionId required")?;
    let field = args.get("field").and_then(|v| v.as_str()).ok_or("field required")?;
    let value = args.get("value").cloned().ok_or("value required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    let section = resume.sections.iter().find(|s| s.id == section_id)
        .ok_or("Section not found")?;

    let mut parsed_value = parse_value(&value);
    let item_sections = ["work_experience", "education", "projects", "certifications", "languages", "github", "custom"];
    let mut actual_field = field.to_string();

    if item_sections.contains(&section.section_type.as_str()) && field != "items" {
        if let Value::String(s) = &parsed_value {
            parsed_value = json!([{ "id": uuid::Uuid::new_v4().to_string(), "title": "", "description": s }]);
        } else if !parsed_value.is_array() {
            if let Some(items) = parsed_value.get("items").cloned() {
                parsed_value = items;
            }
        }
        actual_field = if section.section_type == "skills" { "categories".into() } else { "items".into() };
    }
    if section.section_type == "skills" && field != "categories" {
        actual_field = "categories".into();
    }

    if parsed_value.is_null() {
        return Err(format!("Invalid value: {} cannot be null", actual_field));
    }

    if parsed_value.is_array() {
        parsed_value = ensure_item_ids(parsed_value);
    }

    let mut updated_content = section.content.clone();
    if let Value::Object(ref mut obj) = updated_content {
        obj.insert(actual_field.clone(), parsed_value);
    } else {
        let mut obj = serde_json::Map::new();
        obj.insert(actual_field.clone(), parsed_value);
        updated_content = Value::Object(obj);
    }

    resume_repo::update_section(conn, &section.id, &section.title, section.sort_order, section.visible, &updated_content)
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "success": true,
        "sectionType": section.section_type,
        "field": actual_field,
        "updatedContent": updated_content
    }))
}

pub fn exec_add_section(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let sec_type = args.get("type").and_then(|v| v.as_str()).ok_or("type required")?;
    let title = args.get("title").and_then(|v| v.as_str()).ok_or("title required")?;
    let content_str = args.get("content").and_then(|v| v.as_str());

    let existing = resume_repo::find_sections_by_resume_id(conn, resume_id).map_err(|e| e.to_string())?;
    let max_order = existing.iter().map(|s| s.sort_order).max().unwrap_or(-1);

    let parsed_content = if let Some(c) = content_str {
        serde_json::from_str::<Value>(c).unwrap_or_else(|_| default_content(sec_type))
    } else {
        default_content(sec_type)
    };

    let section_id = resume_repo::create_section(conn, resume_id, sec_type, title, max_order + 1, true, &parsed_content)
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "success": true,
        "sectionType": sec_type,
        "sectionId": section_id
    }))
}

fn default_content(sec_type: &str) -> Value {
    match sec_type {
        "skills" => json!({ "categories": [] }),
        "summary" => json!({ "text": "" }),
        "personal_info" => json!({ "fullName": "", "jobTitle": "", "email": "", "phone": "", "location": "" }),
        _ => json!({ "items": [] }),
    }
}

pub fn exec_rewrite_text(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let section_id = args.get("sectionId").and_then(|v| v.as_str()).ok_or("sectionId required")?;
    let field = args.get("field").and_then(|v| v.as_str()).ok_or("field required")?;
    let improved = args.get("improvedText").and_then(|v| v.as_str()).ok_or("improvedText required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    let section = resume.sections.iter().find(|s| s.id == section_id)
        .ok_or("Section not found")?;

    // rewriteText 只适用于纯文本字段；列表类字段走 updateSection，否则会把数组整个覆盖成字符串。
    if let Some(existing) = section.content.get(field) {
        if existing.is_array() || existing.is_object() {
            return Err(format!(
                "field \"{field}\" is structured (array/object) — use updateSection with a JSON value instead"
            ));
        }
    }

    let mut updated = section.content.clone();
    if let Value::Object(ref mut obj) = updated {
        obj.insert(field.to_string(), Value::String(improved.to_string()));
    }

    resume_repo::update_section(conn, &section.id, &section.title, section.sort_order, section.visible, &updated)
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "sectionType": section.section_type, "field": field, "improvedText": improved }))
}

pub fn exec_suggest_skills(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let skills: Vec<String> = args.get("skills")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .ok_or("skills required")?;
    let category = args.get("category").and_then(|v| v.as_str()).ok_or("category required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    let skills_section = resume.sections.iter().find(|s| s.section_type == "skills")
        .ok_or("Skills section not found")?;

    let mut content = skills_section.content.clone();
    let categories = content.get_mut("categories").and_then(|v| v.as_array_mut()).cloned()
        .unwrap_or_default();

    let mut categories: Vec<Value> = categories;
    let existing_idx = categories.iter().position(|c|
        c.get("name").and_then(|v| v.as_str()) == Some(category)
    );

    if let Some(idx) = existing_idx {
        let mut existing_skills: Vec<String> = categories[idx].get("skills")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
            .unwrap_or_default();
        for s in &skills {
            if !existing_skills.contains(s) {
                existing_skills.push(s.clone());
            }
        }
        categories[idx]["skills"] = json!(existing_skills);
    } else {
        categories.push(json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "name": category,
            "skills": skills,
        }));
    }

    if let Value::Object(ref mut obj) = content {
        obj.insert("categories".into(), Value::Array(categories));
    }

    resume_repo::update_section(conn, &skills_section.id, &skills_section.title, skills_section.sort_order, skills_section.visible, &content)
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "category": category, "skills": skills, "sectionId": skills_section.id }))
}

pub fn exec_remove_section(conn: &Connection, resume_id: &str, args: &Value) -> Result<Value, String> {
    let section_id = args.get("sectionId").and_then(|v| v.as_str()).ok_or("sectionId required")?;

    let resume = resume_repo::find_by_id_any(conn, resume_id)
        .map_err(|e| e.to_string())?
        .ok_or("Resume not found")?;

    // Verify the section exists
    let _section = resume.sections.iter().find(|s| s.id == section_id)
        .ok_or("Section not found")?;

    resume_repo::delete_section(conn, section_id)
        .map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "sectionId": section_id }))
}

pub fn execute_tool(conn: &Connection, resume_id: &str, name: &str, args: &Value) -> Value {
    let result = match name {
        "updateSection" => exec_update_section(conn, resume_id, args),
        "addSection" => exec_add_section(conn, resume_id, args),
        "removeSection" => exec_remove_section(conn, resume_id, args),
        "rewriteText" => exec_rewrite_text(conn, resume_id, args),
        "suggestSkills" => exec_suggest_skills(conn, resume_id, args),
        _ => Err(format!("Unknown tool: {}", name)),
    };
    match result {
        Ok(v) => v,
        Err(e) => json!({ "success": false, "error": e }),
    }
}
