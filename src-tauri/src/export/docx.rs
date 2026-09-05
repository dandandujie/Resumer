use docx_rs::{Docx, Paragraph, Run, RunFonts, LineSpacing, AlignmentType, PageMargin};
use serde_json::Value;
use std::path::Path;
use super::date::{format_range, DateStyle};

// A4 page in twips (1/1440 inch): 210mm x 297mm. Set explicitly so Microsoft
// Office (which defaults to US Letter) and WPS (which defaults to A4) produce
// an identical page — otherwise the same .docx paginates differently in each.
const A4_W: u32 = 11906;
const A4_H: u32 = 16838;
const MARGIN: i32 = 1440; // 1 inch, the value both Office and WPS treat as default

/// RunFonts applied to EVERY run. Setting ascii/hi_ansi (Latin) AND east_asia
/// (CJK) plus hint="eastAsia" makes both Office and WPS render Chinese with
/// SimSun and Latin with Arial; relying on doc defaults alone leaves some
/// WPS/Office versions rendering CJK in the Latin font (□□□ / wrong glyphs).
fn fonts() -> RunFonts {
    RunFonts::new()
        .ascii("Arial")
        .hi_ansi("Arial")
        .east_asia("SimSun")
        .hint("eastAsia")
}

/// A run pre-populated with the compatibility fonts + size.
fn run(text: &str, size: usize) -> Run {
    Run::new().fonts(fonts()).add_text(text).size(size)
}

fn gstr<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

fn garr<'a>(v: &'a Value, key: &str) -> Vec<&'a Value> {
    v.get(key).and_then(|x| x.as_array()).map(|a| a.iter().collect()).unwrap_or_default()
}

fn garr_str(v: &Value, key: &str) -> Vec<String> {
    v.get(key).and_then(|x| x.as_array()).map(|a| {
        a.iter().filter_map(|x| x.as_str().map(String::from)).collect()
    }).unwrap_or_default()
}

fn heading(text: &str) -> Paragraph {
    Paragraph::new()
        .add_run(run(text, 28).bold())
        .line_spacing(LineSpacing::new().before(120).after(60))
}

fn subheading(text: &str) -> Paragraph {
    Paragraph::new()
        .add_run(run(text, 24).bold())
        .line_spacing(LineSpacing::new().before(60).after(40))
}

fn para(text: &str) -> Paragraph {
    Paragraph::new().add_run(run(text, 20))
}

fn bullet(text: &str) -> Paragraph {
    Paragraph::new().add_run(run(&format!("• {}", text), 20))
}

pub fn generate_docx(resume_title: &str, sections: &[Value], language: &str, output_path: &Path) -> Result<(), String> {
    let mut docx = Docx::new()
        .default_fonts(fonts())
        .default_size(20)
        .page_size(A4_W, A4_H)
        .page_margin(PageMargin::new().top(MARGIN).bottom(MARGIN).left(MARGIN).right(MARGIN));

    // Add title
    docx = docx.add_paragraph(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(run(resume_title, 36).bold())
    );

    for section in sections {
        if section.get("visible").and_then(|v| v.as_bool()) == Some(false) { continue; }
        let section_type = gstr(section, "type");
        let title = gstr(section, "title");
        let content = section.get("content").cloned().unwrap_or(Value::Null);

        match section_type {
            "personal_info" => {
                let name = gstr(&content, "fullName");
                let job = gstr(&content, "jobTitle");
                if !name.is_empty() {
                    docx = docx.add_paragraph(
                        Paragraph::new().align(AlignmentType::Center)
                            .add_run(run(name, 32).bold())
                    );
                }
                if !job.is_empty() {
                    docx = docx.add_paragraph(
                        Paragraph::new().align(AlignmentType::Center)
                            .add_run(run(job, 24).italic())
                    );
                }
                let contact_keys = ["email", "phone", "location", "website"];
                let parts: Vec<String> = contact_keys.iter()
                    .filter_map(|k| {
                        let s = gstr(&content, k);
                        if s.is_empty() { None } else { Some(s.to_string()) }
                    })
                    .collect();
                if !parts.is_empty() {
                    docx = docx.add_paragraph(
                        Paragraph::new().align(AlignmentType::Center)
                            .add_run(run(&parts.join(" | "), 20))
                    );
                }
            }
            "summary" => {
                docx = docx.add_paragraph(heading(title));
                let text = gstr(&content, "text");
                if !text.is_empty() {
                    docx = docx.add_paragraph(para(text));
                }
            }
            "work_experience" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let pos = gstr(item, "position");
                    let company = gstr(item, "company");
                    docx = docx.add_paragraph(subheading(&format!("{} — {}", pos, company)));

                    let start = gstr(item, "startDate");
                    let end = if item.get("current").and_then(|v| v.as_bool()) == Some(true) {
                        "Present".to_string()
                    } else { gstr(item, "endDate").into() };
                    let location = gstr(item, "location");
                    let range = format_range(start, &end, item.get("current").and_then(|v| v.as_bool()).unwrap_or(false), DateStyle::Dot, language);
                    let date_line = if location.is_empty() {
                        range
                    } else {
                        format!("{} | {}", range, location)
                    };
                    docx = docx.add_paragraph(para(&date_line));

                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        docx = docx.add_paragraph(para(desc));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            docx = docx.add_paragraph(bullet(&h));
                        }
                    }
                }
            }
            "education" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let degree = gstr(item, "degree");
                    let field = gstr(item, "field");
                    let inst = gstr(item, "institution");
                    docx = docx.add_paragraph(subheading(&format!("{} in {}, {}", degree, field, inst)));
                    let start = gstr(item, "startDate");
                    let end = gstr(item, "endDate");
                    docx = docx.add_paragraph(para(&format_range(start, end, false, DateStyle::Dot, language)));
                    let gpa = gstr(item, "gpa");
                    if !gpa.is_empty() {
                        docx = docx.add_paragraph(para(&format!("GPA: {}", gpa)));
                    }
                }
            }
            "skills" => {
                docx = docx.add_paragraph(heading(title));
                for cat in garr(&content, "categories") {
                    let name = gstr(cat, "name");
                    let skills = garr_str(cat, "skills");
                    docx = docx.add_paragraph(para(&format!("{}: {}", name, skills.join(", "))));
                }
            }
            "projects" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let name = gstr(item, "name");
                    docx = docx.add_paragraph(subheading(name));
                    let desc = gstr(item, "description");
                    if !desc.is_empty() {
                        docx = docx.add_paragraph(para(desc));
                    }
                    let techs = garr_str(item, "technologies");
                    if !techs.is_empty() {
                        docx = docx.add_paragraph(para(&format!("Technologies: {}", techs.join(", "))));
                    }
                    for h in garr_str(item, "highlights") {
                        if !h.is_empty() {
                            docx = docx.add_paragraph(bullet(&h));
                        }
                    }
                }
            }
            "certifications" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let name = gstr(item, "name");
                    let issuer = gstr(item, "issuer");
                    let date = gstr(item, "date");
                    let mut line = name.to_string();
                    if !issuer.is_empty() { line.push_str(&format!(", {}", issuer)); }
                    if !date.is_empty() { line.push_str(&format!(" ({})", date)); }
                    docx = docx.add_paragraph(bullet(&line));
                }
            }
            "languages" => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let lang = gstr(item, "language");
                    let prof = gstr(item, "proficiency");
                    docx = docx.add_paragraph(bullet(&format!("{}: {}", lang, prof)));
                }
            }
            _ => {
                docx = docx.add_paragraph(heading(title));
                for item in garr(&content, "items") {
                    let i_title = gstr(item, "title");
                    let subtitle = gstr(item, "subtitle");
                    let head = if subtitle.is_empty() { i_title.to_string() } else { format!("{} - {}", i_title, subtitle) };
                    docx = docx.add_paragraph(subheading(&head));
                    let date = gstr(item, "date");
                    if !date.is_empty() { docx = docx.add_paragraph(para(date)); }
                    let desc = gstr(item, "description");
                    if !desc.is_empty() { docx = docx.add_paragraph(para(desc)); }
                }
            }
        }
    }

    let file = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    docx.build().pack(file).map_err(|e| format!("Failed to build DOCX: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generates_valid_docx_with_cjk() {
        let sections = vec![
            json!({"type":"personal_info","visible":true,"title":"","content":{
                "fullName":"张三","jobTitle":"软件工程师","email":"a@b.com","phone":"13800000000"}}),
            json!({"type":"work_experience","visible":true,"title":"工作经历","content":{"items":[
                {"position":"后端工程师","company":"某科技公司","startDate":"2020","current":true,
                 "description":"负责分布式系统开发。","highlights":["优化性能 30%","主导架构升级"]}]}}),
        ];
        let out = std::env::temp_dir().join("reseumer-docx-test.docx");
        generate_docx("测试简历 Resume", &sections, "zh", &out).expect("generate_docx failed");
        assert!(out.exists());
        // A valid .docx is a non-trivial zip.
        assert!(std::fs::metadata(&out).unwrap().len() > 500);
    }
}
