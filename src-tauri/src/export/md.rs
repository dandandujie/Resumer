use super::date::{DateStyle, format_month, format_range};
use super::inline::{strip, strip_attr_markers};
use serde_json::Value;

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

fn date_range(item: &Value, style: DateStyle, lang: &str) -> String {
    let start = gstr(item, "startDate");
    let end = if item.get("current").and_then(|v| v.as_bool()) == Some(true) {
        "至今".to_string()
    } else {
        gstr(item, "endDate").to_string()
    };
    format_range(
        start,
        &end,
        item.get("current")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        style,
        lang,
    )
}

/// Generate GitHub-flavored Markdown from a resume's sections array.
/// Markdown 保留 `**`/`*`/`__` 这类 Markdown 本身能表达的标记，颜色/字号/字体标记剥掉。
pub fn generate_markdown(sections: &[Value], style: DateStyle, lang: &str) -> String {
    strip_attr_markers(&generate_markdown_raw(sections, style, lang))
}

fn generate_markdown_raw(sections: &[Value], style: DateStyle, lang: &str) -> String {
    let mut out: Vec<String> = Vec::new();

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
                    out.push(format!("# {}", name));
                }
                let job = gstr(&content, "jobTitle");
                if !job.is_empty() {
                    out.push(format!("**{}**", job));
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
                    out.push(info_parts.join(" · "));
                }

                let contact_keys = [
                    "email", "phone", "wechat", "location", "linkedin", "github", "website",
                ];
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
                    out.push(contact_parts.join(" · "));
                }
                for link in garr(&content, "customLinks") {
                    out.push(format!("{}: {}", gstr(link, "label"), gstr(link, "url")));
                }
                out.push(String::new());
            }
            "summary" => {
                out.push(format!("## {}", title));
                let text = gstr(&content, "text");
                if !text.is_empty() {
                    out.push(text.into());
                }
                out.push(String::new());
            }
            "work_experience" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    let position = gstr(item, "position");
                    let company = gstr(item, "company");
                    let range = date_range(item, style, lang);
                    let location = gstr(item, "location");
                    let mut head = format!("### {}", position);
                    if !company.is_empty() {
                        head.push_str(&format!(" · {}", company));
                    }
                    out.push(head);
                    let meta: Vec<String> = [range, location.to_string()]
                        .into_iter()
                        .filter(|s| !s.is_empty())
                        .collect();
                    if !meta.is_empty() {
                        out.push(format!("*{}*", meta.join(" · ")));
                    }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        out.push(desc.into());
                    }
                    let techs = garr_str(item, "technologies");
                    if !techs.is_empty() {
                        out.push(format!("**技术栈:** {}", techs.join(", ")));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            out.push(format!("- {}", h));
                        }
                    }
                    out.push(String::new());
                }
            }
            "education" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    let inst = gstr(item, "institution");
                    let degree = gstr(item, "degree");
                    let field = gstr(item, "field");
                    let head: Vec<String> = [inst, degree, field]
                        .into_iter()
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                        .collect();
                    out.push(format!("### {}", head.join(" · ")));
                    let range = date_range(item, style, lang);
                    let location = gstr(item, "location");
                    let meta: Vec<String> = [range, location.to_string()]
                        .into_iter()
                        .filter(|s| !s.is_empty())
                        .collect();
                    if !meta.is_empty() {
                        out.push(format!("*{}*", meta.join(" · ")));
                    }
                    let gpa = gstr(item, "gpa");
                    if !gpa.is_empty() {
                        out.push(format!("GPA: {}", gpa));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            out.push(format!("- {}", h));
                        }
                    }
                    out.push(String::new());
                }
            }
            "skills" => {
                out.push(format!("## {}", title));
                for cat in garr(&content, "categories") {
                    let name = gstr(cat, "name");
                    let skills = garr_str(cat, "skills");
                    out.push(format!("- **{}:** {}", name, skills.join(", ")));
                }
                out.push(String::new());
            }
            "projects" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    let name = gstr(item, "name");
                    let url = gstr(item, "url");
                    if !url.is_empty() {
                        out.push(format!("### {}\n{}", name, strip(url)));
                    } else {
                        out.push(format!("### {}", name));
                    }
                    let dates = date_range(item, style, lang);
                    if !dates.is_empty() {
                        out.push(dates);
                    }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        out.push(desc.into());
                    }
                    let techs = garr_str(item, "technologies");
                    if !techs.is_empty() {
                        out.push(format!("**技术栈:** {}", techs.join(", ")));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            out.push(format!("- {}", h));
                        }
                    }
                    out.push(String::new());
                }
            }
            "certifications" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    let url = gstr(item, "url");
                    if !url.is_empty() {
                        out.push(url.into());
                    }
                    let name = gstr(item, "name");
                    let issuer = gstr(item, "issuer");
                    let date = format_month(gstr(item, "date"), style, lang);
                    let extra: Vec<String> = [issuer, &date]
                        .into_iter()
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                        .collect();
                    if extra.is_empty() {
                        out.push(format!("- {}", name));
                    } else {
                        out.push(format!("- **{}** — {}", name, extra.join(", ")));
                    }
                }
                out.push(String::new());
            }
            "languages" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    let description = gstr(item, "description");
                    if !description.is_empty() {
                        out.push(description.into());
                    }
                    out.push(format!(
                        "- **{}:** {}",
                        gstr(item, "language"),
                        gstr(item, "proficiency")
                    ));
                }
                out.push(String::new());
            }
            "github" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    out.push(format!("### {}", gstr(item, "name")));
                    for key in ["repoUrl", "language", "description"] {
                        let value = gstr(item, key);
                        if !value.is_empty() {
                            out.push(value.into());
                        }
                    }
                    if let Some(stars) = item.get("stars").and_then(Value::as_u64) {
                        out.push(format!("★ {}", stars));
                    }
                    out.push(String::new());
                }
            }
            "qr_codes" => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    out.push(format!(
                        "- {}: {}",
                        gstr(item, "label"),
                        strip(gstr(item, "url"))
                    ));
                }
                out.push(String::new());
            }
            _ => {
                out.push(format!("## {}", title));
                for item in garr(&content, "items") {
                    let i_title = gstr(item, "title");
                    let subtitle = gstr(item, "subtitle");
                    let mut head = format!("### {}", i_title);
                    if !subtitle.is_empty() {
                        head.push_str(&format!(" — {}", subtitle));
                    }
                    out.push(head);
                    let date = format_month(gstr(item, "date"), style, lang);
                    if !date.is_empty() {
                        out.push(format!("*{}*", date));
                    }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        out.push(desc.into());
                    }
                    out.push(String::new());
                }
            }
        }
    }

    // Collapse trailing blank lines to a single newline.
    while out.last().map(|s| s.is_empty()).unwrap_or(false) {
        out.pop();
    }
    out.push(String::new());
    out.join("\n")
}
