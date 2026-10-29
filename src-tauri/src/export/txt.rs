use super::date::{DateStyle, format_month, format_range};
use super::inline::strip;
use serde_json::Value;

fn safe(v: Option<&str>) -> String {
    v.unwrap_or("").to_string()
}

fn gstr<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

fn garr<'a>(v: &'a Value, key: &str) -> Vec<&'a Value> {
    v.get(key)
        .and_then(|x| x.as_array())
        .map(|a| a.iter().collect())
        .unwrap_or_default()
}

fn garr_str(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(|x| x.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Generate plain text from a resume's sections array.
pub fn generate_plain_text(sections: &[Value], style: DateStyle, lang: &str) -> String {
    // 先清理字段，再添加项目符号；对整篇成品解析会误把两行的 * 当作斜体标记。
    fn clean(value: &Value) -> Value {
        match value {
            Value::String(text) => Value::String(strip(text)),
            Value::Array(values) => Value::Array(values.iter().map(clean).collect()),
            Value::Object(values) => Value::Object(
                values
                    .iter()
                    .map(|(key, value)| (key.clone(), clean(value)))
                    .collect(),
            ),
            _ => value.clone(),
        }
    }
    let sections: Vec<_> = sections.iter().map(clean).collect();
    let mut lines: Vec<String> = Vec::new();

    for section in &sections {
        if section.get("visible").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }
        let section_type = gstr(section, "type");
        let title = gstr(section, "title");
        let content = section.get("content").cloned().unwrap_or(Value::Null);

        match section_type {
            "personal_info" => {
                let name = gstr(&content, "fullName");
                if !name.is_empty() {
                    lines.push(name.into());
                }
                let job = gstr(&content, "jobTitle");
                if !job.is_empty() {
                    lines.push(job.into());
                }

                let info_keys = [
                    "age",
                    "gender",
                    "politicalStatus",
                    "ethnicity",
                    "hometown",
                    "maritalStatus",
                    "yearsOfExperience",
                    "educationLevel",
                ];
                let info_parts: Vec<String> = info_keys
                    .iter()
                    .filter_map(|k| {
                        let s = gstr(&content, k);
                        if s.is_empty() {
                            None
                        } else {
                            Some(s.to_string())
                        }
                    })
                    .collect();
                if !info_parts.is_empty() {
                    lines.push(info_parts.join(" | "));
                }

                let contact_keys = ["email", "phone", "wechat", "location", "linkedin", "github"];
                let contact_parts: Vec<String> = contact_keys
                    .iter()
                    .filter_map(|k| {
                        let s = gstr(&content, k);
                        if s.is_empty() {
                            None
                        } else {
                            Some(s.to_string())
                        }
                    })
                    .collect();
                if !contact_parts.is_empty() {
                    lines.push(contact_parts.join(" | "));
                }

                let website = gstr(&content, "website");
                if !website.is_empty() {
                    lines.push(website.into());
                }
                for link in garr(&content, "customLinks") {
                    lines.push(format!("{}: {}", gstr(link, "label"), gstr(link, "url")));
                }
                lines.push("".into());
            }
            "summary" => {
                lines.push(format!("== {} ==", title));
                let text = gstr(&content, "text");
                if !text.is_empty() {
                    lines.push(text.into());
                }
                lines.push("".into());
            }
            "work_experience" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    lines.push(format!(
                        "- {} at {}",
                        safe(item.get("position").and_then(|v| v.as_str())),
                        safe(item.get("company").and_then(|v| v.as_str()))
                    ));
                    let start = gstr(item, "startDate");
                    let end = gstr(item, "endDate");
                    let location = gstr(item, "location");
                    lines.push(format!(
                        "  {}{}",
                        format_range(
                            start,
                            end,
                            item.get("current")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            style,
                            lang
                        ),
                        if !location.is_empty() {
                            format!(" | {}", location)
                        } else {
                            "".into()
                        }
                    ));
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        lines.push(format!("  {}", desc));
                    }
                    let techs = garr_str(item, "technologies");
                    if !techs.is_empty() {
                        lines.push(format!("  Technologies: {}", techs.join(", ")));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            lines.push(format!("  * {}", h));
                        }
                    }
                }
                lines.push("".into());
            }
            "education" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    let degree = gstr(item, "degree");
                    let field = gstr(item, "field");
                    let inst = gstr(item, "institution");
                    lines.push(format!("- {} in {}, {}", degree, field, inst));
                    let start = gstr(item, "startDate");
                    let end = gstr(item, "endDate");
                    let location = gstr(item, "location");
                    lines.push(format!(
                        "  {}{}",
                        format_range(
                            start,
                            end,
                            item.get("current")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                            style,
                            lang
                        ),
                        if !location.is_empty() {
                            format!(" | {}", location)
                        } else {
                            "".into()
                        }
                    ));
                    let gpa = gstr(item, "gpa");
                    if !gpa.is_empty() {
                        lines.push(format!("  GPA: {}", gpa));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            lines.push(format!("  * {}", h));
                        }
                    }
                }
                lines.push("".into());
            }
            "skills" => {
                lines.push(format!("== {} ==", title));
                for cat in garr(&content, "categories") {
                    let name = gstr(cat, "name");
                    let skills = garr_str(cat, "skills");
                    lines.push(format!("- {}: {}", name, skills.join(", ")));
                }
                lines.push("".into());
            }
            "projects" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    let name = gstr(item, "name");
                    let url = gstr(item, "url");
                    let suffix = if !url.is_empty() {
                        format!(" ({})", url)
                    } else {
                        "".into()
                    };
                    lines.push(format!("- {}{}", name, suffix));
                    let dates = format_range(
                        gstr(item, "startDate"),
                        gstr(item, "endDate"),
                        item.get("current")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        style,
                        lang,
                    );
                    if !dates.is_empty() {
                        lines.push(format!("  {}", dates));
                    }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        lines.push(format!("  {}", desc));
                    }
                    let techs = garr_str(item, "technologies");
                    if !techs.is_empty() {
                        lines.push(format!("  Technologies: {}", techs.join(", ")));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            lines.push(format!("  * {}", h));
                        }
                    }
                }
                lines.push("".into());
            }
            "certifications" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    let url = gstr(item, "url");
                    if !url.is_empty() {
                        lines.push(url.into());
                    }
                    let name = gstr(item, "name");
                    let issuer = gstr(item, "issuer");
                    let date = format_month(gstr(item, "date"), style, lang);
                    let issuer_s = if !issuer.is_empty() {
                        format!(", {}", issuer)
                    } else {
                        "".into()
                    };
                    let date_s = if !date.is_empty() {
                        format!(" ({})", date)
                    } else {
                        "".into()
                    };
                    lines.push(format!("- {}{}{}", name, issuer_s, date_s));
                }
                lines.push("".into());
            }
            "languages" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    let description = gstr(item, "description");
                    if !description.is_empty() {
                        lines.push(description.into());
                    }
                    lines.push(format!(
                        "- {}: {}",
                        gstr(item, "language"),
                        gstr(item, "proficiency")
                    ));
                }
                lines.push("".into());
            }
            "github" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    lines.push(format!("- {}", gstr(item, "name")));
                    for key in ["repoUrl", "language", "description"] {
                        let value = gstr(item, key);
                        if !value.is_empty() {
                            lines.push(format!("  {}", value));
                        }
                    }
                    if let Some(stars) = item.get("stars").and_then(Value::as_u64) {
                        lines.push(format!("  ★ {}", stars));
                    }
                }
                lines.push(String::new());
            }
            "qr_codes" => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    lines.push(format!("- {}: {}", gstr(item, "label"), gstr(item, "url")));
                }
                lines.push(String::new());
            }
            _ => {
                lines.push(format!("== {} ==", title));
                for item in garr(&content, "items") {
                    let i_title = gstr(item, "title");
                    let subtitle = gstr(item, "subtitle");
                    let subtitle_s = if !subtitle.is_empty() {
                        format!(" - {}", subtitle)
                    } else {
                        "".into()
                    };
                    lines.push(format!("- {}{}", i_title, subtitle_s));
                    let date = format_month(gstr(item, "date"), style, lang);
                    if !date.is_empty() {
                        lines.push(format!("  {}", date));
                    }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        lines.push(format!("  {}", desc));
                    }
                }
                lines.push("".into());
            }
        }
    }

    lines.join("\n")
}
