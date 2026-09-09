use super::date::{DateStyle, format_range};
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
    let mut lines: Vec<String> = Vec::new();

    for section in sections {
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

                let contact_keys = ["email", "phone", "wechat", "location"];
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
                    let name = gstr(item, "name");
                    let issuer = gstr(item, "issuer");
                    let date = gstr(item, "date");
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
                    lines.push(format!(
                        "- {}: {}",
                        gstr(item, "language"),
                        gstr(item, "proficiency")
                    ));
                }
                lines.push("".into());
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
                    let date = gstr(item, "date");
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

    strip(&lines.join("\n"))
}
