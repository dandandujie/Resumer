use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use docx_rs::{
    Docx, LineSpacing, LineSpacingType, Paragraph, ParagraphBorder, ParagraphBorderPosition,
    ParagraphBorders, Pic, Run, RunFonts, Shading, Style, StyleType, Table, TableCell, TableRow,
};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

use super::date::{DateStyle, format_month, format_range};
use super::inline::{Span, parse};

const A4_W: u32 = 11906;
const A4_H: u32 = 16838;
const TWIPS_PER_MM: f64 = 56.7;
const EMU_PER_INCH: u32 = 914400;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
    pub font_scheme: String,
    pub body_color: String,
    pub primary_color: String,
    pub accent_color: String,
    pub font_size: f64,
    pub line_spacing: f64,
    pub section_spacing: f64,
    pub margin: ThemeMargin,
    pub date_style: String,
    pub heading_style: String,
    pub avatar_style: String,
    pub info_layout: String,
}

#[derive(Debug, Deserialize)]
pub struct ThemeMargin {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

fn office_fonts(theme: &ResolvedTheme) -> Result<RunFonts, String> {
    let (east_asia, latin) = match theme.font_scheme.as_str() {
        "songti" => ("宋体", "Times New Roman"),
        "heiti" => ("黑体", "Arial"),
        "yahei" => ("微软雅黑", "Calibri"),
        "kaiti" => ("楷体", "Times New Roman"),
        "fangsong" => ("仿宋", "Times New Roman"),
        "latin-arial" => ("微软雅黑", "Arial"),
        "latin-times" => ("宋体", "Times New Roman"),
        "latin-calibri" => ("微软雅黑", "Calibri"),
        other => return Err(format!("未知字体方案: {}", other)),
    };
    Ok(RunFonts::new()
        .ascii(latin)
        .hi_ansi(latin)
        .east_asia(east_asia)
        .hint("eastAsia"))
}

fn color(value: &str) -> String {
    value.trim_start_matches('#').to_string()
}

fn half_points(px: f64) -> usize {
    (px * 0.75 * 2.0).round().max(1.0) as usize
}

fn twips(mm: f64) -> i32 {
    (mm * TWIPS_PER_MM).round() as i32
}

fn line_spacing(value: f64, paragraph_spacing: f64) -> LineSpacing {
    LineSpacing::new()
        .line((240.0 * value).round() as i32)
        .after((paragraph_spacing * 14.0).round().max(0.0) as u32)
        .line_rule(LineSpacingType::Auto)
}

fn style(
    id: &str,
    name: &str,
    size: usize,
    color_value: &str,
    fonts: &RunFonts,
    spacing: LineSpacing,
) -> Style {
    Style::new(id, StyleType::Paragraph)
        .name(name)
        .fonts(fonts.clone())
        .size(size)
        .color(color(color_value))
        .line_spacing(spacing)
}

fn styles(theme: &ResolvedTheme, fonts: &RunFonts) -> Vec<Style> {
    let body_size = half_points(theme.font_size);
    let h1_size = half_points(theme.font_size * 1.15);
    let h2_size = half_points(theme.font_size);
    let title_size = half_points(theme.font_size * 1.6);
    let normal = style(
        "Normal",
        "正文",
        body_size,
        &theme.body_color,
        fonts,
        line_spacing(theme.line_spacing, theme.section_spacing),
    );
    let mut heading1 = style(
        "Heading1",
        "模块标题",
        h1_size,
        &theme.primary_color,
        fonts,
        line_spacing(theme.line_spacing, theme.section_spacing),
    );
    if theme.heading_style == "underline" {
        let border = ParagraphBorder::new(ParagraphBorderPosition::Bottom)
            .size(6)
            .color(color(&theme.accent_color));
        heading1.paragraph_property = heading1
            .paragraph_property
            .set_borders(ParagraphBorders::with_empty().set(border));
    }
    let heading2 = style(
        "Heading2",
        "条目标题",
        h2_size,
        &theme.primary_color,
        fonts,
        line_spacing(theme.line_spacing, theme.section_spacing),
    )
    .bold();
    let title = style(
        "Title",
        "简历标题",
        title_size,
        &theme.primary_color,
        fonts,
        line_spacing(theme.line_spacing, theme.section_spacing),
    )
    .bold();
    let bullet = style(
        "ListBullet",
        "项目符号",
        body_size,
        &theme.body_color,
        fonts,
        line_spacing(theme.line_spacing, theme.section_spacing),
    );
    vec![title, heading1, heading2, normal, bullet]
}

fn run(text: &str, span: &Span, theme: &ResolvedTheme) -> Run {
    let mut value = Run::new().add_text(text).color(color(&theme.body_color));
    if span.bold {
        value = value.bold();
    }
    if span.italic {
        value = value.italic();
    }
    if span.underline {
        value = value.underline("single");
    }
    value
}

fn paragraph(text: &str, style_id: &str, theme: &ResolvedTheme, bullet: bool) -> Paragraph {
    let mut result = Paragraph::new().style(style_id);
    let value = if bullet {
        format!("• {}", text)
    } else {
        text.to_string()
    };
    for span in parse(&value) {
        let mut value = run(&span.text, &span, theme);
        if style_id == "Heading1" && theme.heading_style == "filled" {
            value = value.shading(Shading::new().fill(color(&theme.accent_color)));
        }
        result = result.add_run(value);
    }
    result
}

fn current(item: &Value) -> bool {
    item.get("current")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn values<'a>(value: &'a Value, key: &str) -> Vec<&'a Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

fn strings(value: &Value, key: &str) -> Vec<String> {
    values(value, key)
        .into_iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
}

fn add_paragraph(docx: &mut Docx, value: Paragraph) {
    let current = std::mem::replace(docx, Docx::new());
    *docx = current.add_paragraph(value);
}

fn avatar_bytes(value: &str) -> Result<Option<Vec<u8>>, String> {
    let Some((_, encoded)) = value.split_once(",") else {
        return Ok(None);
    };
    BASE64
        .decode(encoded)
        .map(Some)
        .map_err(|e| format!("头像不是有效的 base64 图片: {}", e))
}

fn personal_info_table(content: &Value, theme: &ResolvedTheme) -> Result<Table, String> {
    let mut left = TableCell::new();
    let name = text(content, "fullName");
    let job = text(content, "jobTitle");
    if !name.is_empty() {
        left = left.add_paragraph(paragraph(&name, "Title", theme, false));
    }
    if !job.is_empty() {
        left = left.add_paragraph(paragraph(&job, "Normal", theme, false));
    }

    let labels = [
        ("age", "年龄", "Age"),
        ("gender", "性别", "Gender"),
        ("politicalStatus", "政治面貌", "Political status"),
        ("ethnicity", "民族", "Ethnicity"),
        ("hometown", "籍贯", "Hometown"),
        ("maritalStatus", "婚姻状况", "Marital status"),
        ("yearsOfExperience", "工作年限", "Experience"),
        ("educationLevel", "学历", "Education"),
        ("email", "邮箱", "Email"),
        ("phone", "电话", "Phone"),
        ("wechat", "微信", "WeChat"),
        ("location", "所在地", "Location"),
        ("website", "网站", "Website"),
        ("linkedin", "领英", "LinkedIn"),
        ("github", "GitHub", "GitHub"),
    ];
    let zh = theme.font_scheme != "latin-arial"
        && theme.font_scheme != "latin-times"
        && theme.font_scheme != "latin-calibri";
    let contacts: Vec<String> = labels
        .iter()
        .filter_map(|(key, zh_label, en_label)| {
            let value = text(content, key);
            if value.is_empty() {
                None
            } else {
                Some(format!(
                    "{}: {}",
                    if zh { zh_label } else { en_label },
                    value
                ))
            }
        })
        .collect();
    if !contacts.is_empty() {
        let separator = if theme.info_layout == "grid" {
            "\n"
        } else {
            " | "
        };
        left = left.add_paragraph(paragraph(&contacts.join(separator), "Normal", theme, false));
    }

    let Some(avatar) = content.get("avatar").and_then(Value::as_str) else {
        return Ok(Table::without_borders(vec![TableRow::new(vec![left])]));
    };
    let Some(bytes) = avatar_bytes(avatar)? else {
        return Ok(Table::without_borders(vec![TableRow::new(vec![left])]));
    };
    let (width, height) = if theme.avatar_style == "circle" {
        (EMU_PER_INCH * 7 / 10, EMU_PER_INCH * 7 / 10)
    } else {
        (EMU_PER_INCH / 2, EMU_PER_INCH * 7 / 10)
    };
    let pic = Pic::new(&bytes).size(width, height);
    let right = TableCell::new().add_paragraph(
        Paragraph::new()
            .style("Normal")
            .add_run(Run::new().add_image(pic)),
    );
    Ok(Table::without_borders(vec![TableRow::new(vec![left, right])]).set_grid(vec![7000, 2000]))
}

pub fn generate_docx(
    resume_title: &str,
    sections: &[Value],
    language: &str,
    theme: &ResolvedTheme,
    output_path: &Path,
) -> Result<(), String> {
    let fonts = office_fonts(theme)?;
    let mut docx = Docx::new()
        .default_fonts(fonts.clone())
        .default_size(half_points(theme.font_size))
        .page_size(A4_W, A4_H)
        .page_margin(
            docx_rs::PageMargin::new()
                .top(twips(theme.margin.top))
                .bottom(twips(theme.margin.bottom))
                .left(twips(theme.margin.left))
                .right(twips(theme.margin.right)),
        );
    for item in styles(theme, &fonts) {
        docx = docx.add_style(item);
    }

    add_paragraph(&mut docx, paragraph(resume_title, "Title", theme, false));
    let style = DateStyle::parse(Some(&theme.date_style));
    for section in sections {
        if section.get("visible").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        let section_type = text(section, "type");
        let title = text(section, "title");
        let content = section.get("content").cloned().unwrap_or(Value::Null);
        match section_type.as_str() {
            "personal_info" => {
                let table = personal_info_table(&content, theme)?;
                docx = docx.add_table(table);
            }
            "summary" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                let value = text(&content, "text");
                if !value.is_empty() {
                    add_paragraph(&mut docx, paragraph(&value, "Normal", theme, false));
                }
            }
            "work_experience" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for item in values(&content, "items") {
                    let heading = format!("{} — {}", text(item, "position"), text(item, "company"));
                    add_paragraph(&mut docx, paragraph(&heading, "Heading2", theme, false));
                    let range = format_range(
                        &text(item, "startDate"),
                        &text(item, "endDate"),
                        current(item),
                        style,
                        language,
                    );
                    let location = text(item, "location");
                    let meta = if location.is_empty() {
                        range
                    } else {
                        format!("{} | {}", range, location)
                    };
                    if !meta.is_empty() {
                        add_paragraph(&mut docx, paragraph(&meta, "Normal", theme, false));
                    }
                    let description = text(item, "description");
                    if !description.is_empty() {
                        add_paragraph(&mut docx, paragraph(&description, "Normal", theme, false));
                    }
                    for highlight in strings(item, "highlights")
                        .into_iter()
                        .filter(|value| !value.is_empty())
                    {
                        add_paragraph(&mut docx, paragraph(&highlight, "ListBullet", theme, true));
                    }
                }
            }
            "education" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for item in values(&content, "items") {
                    let heading = if language == "zh" {
                        [
                            text(item, "institution"),
                            text(item, "field"),
                            text(item, "degree"),
                        ]
                        .into_iter()
                        .filter(|v| !v.is_empty())
                        .collect::<Vec<_>>()
                        .join(" · ")
                    } else {
                        [
                            text(item, "degree"),
                            text(item, "field"),
                            text(item, "institution"),
                        ]
                        .into_iter()
                        .filter(|v| !v.is_empty())
                        .collect::<Vec<_>>()
                        .join(" in ")
                    };
                    add_paragraph(&mut docx, paragraph(&heading, "Heading2", theme, false));
                    let range = format_range(
                        &text(item, "startDate"),
                        &text(item, "endDate"),
                        current(item),
                        style,
                        language,
                    );
                    if !range.is_empty() {
                        add_paragraph(&mut docx, paragraph(&range, "Normal", theme, false));
                    }
                    let gpa = text(item, "gpa");
                    if !gpa.is_empty() {
                        add_paragraph(
                            &mut docx,
                            paragraph(&format!("GPA: {}", gpa), "Normal", theme, false),
                        );
                    }
                    for highlight in strings(item, "highlights")
                        .into_iter()
                        .filter(|value| !value.is_empty())
                    {
                        add_paragraph(&mut docx, paragraph(&highlight, "ListBullet", theme, true));
                    }
                }
            }
            "skills" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for category in values(&content, "categories") {
                    let line = format!(
                        "{}: {}",
                        text(category, "name"),
                        strings(category, "skills").join(", ")
                    );
                    add_paragraph(&mut docx, paragraph(&line, "Normal", theme, false));
                }
            }
            "projects" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for item in values(&content, "items") {
                    add_paragraph(
                        &mut docx,
                        paragraph(&text(item, "name"), "Heading2", theme, false),
                    );
                    let range = format_range(
                        &text(item, "startDate"),
                        &text(item, "endDate"),
                        current(item),
                        style,
                        language,
                    );
                    if !range.is_empty() {
                        add_paragraph(&mut docx, paragraph(&range, "Normal", theme, false));
                    }
                    let description = text(item, "description");
                    if !description.is_empty() {
                        add_paragraph(&mut docx, paragraph(&description, "Normal", theme, false));
                    }
                    for highlight in strings(item, "highlights")
                        .into_iter()
                        .filter(|value| !value.is_empty())
                    {
                        add_paragraph(&mut docx, paragraph(&highlight, "ListBullet", theme, true));
                    }
                }
            }
            "certifications" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for item in values(&content, "items") {
                    let date = text(item, "date");
                    let date = format_month(&date, style, language);
                    let suffix = if date.is_empty() {
                        String::new()
                    } else {
                        format!(" ({})", date)
                    };
                    add_paragraph(
                        &mut docx,
                        paragraph(
                            &format!(
                                "{} — {}{}",
                                text(item, "name"),
                                text(item, "issuer"),
                                suffix
                            ),
                            "ListBullet",
                            theme,
                            true,
                        ),
                    );
                }
            }
            "languages" => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for item in values(&content, "items") {
                    add_paragraph(
                        &mut docx,
                        paragraph(
                            &format!("{}: {}", text(item, "language"), text(item, "proficiency")),
                            "ListBullet",
                            theme,
                            true,
                        ),
                    );
                }
            }
            _ => {
                add_paragraph(&mut docx, paragraph(&title, "Heading1", theme, false));
                for item in values(&content, "items") {
                    let heading = [text(item, "title"), text(item, "subtitle")]
                        .into_iter()
                        .filter(|v| !v.is_empty())
                        .collect::<Vec<_>>()
                        .join(" - ");
                    add_paragraph(&mut docx, paragraph(&heading, "Heading2", theme, false));
                    let description = text(item, "description");
                    if !description.is_empty() {
                        add_paragraph(&mut docx, paragraph(&description, "Normal", theme, false));
                    }
                }
            }
        }
    }

    let file = std::fs::File::create(output_path).map_err(|e| format!("创建 DOCX 失败: {}", e))?;
    docx.build()
        .pack(file)
        .map_err(|e| format!("生成 DOCX 失败: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use docx_rs::read_docx;
    use serde_json::json;
    use std::io::Read;

    fn theme() -> ResolvedTheme {
        serde_json::from_value(json!({
            "fontScheme":"songti", "bodyColor":"1a1a1a", "primaryColor":"1a1a1a", "accentColor":"1a1a1a",
            "fontSize":14, "lineSpacing":1.35, "sectionSpacing":6,
            "margin":{"top":18,"right":18,"bottom":18,"left":18}, "dateStyle":"dot",
            "headingStyle":"underline", "avatarStyle":"oneInch", "infoLayout":"inline"
        })).unwrap()
    }

    #[test]
    fn missing_theme_fields_are_rejected() {
        assert!(serde_json::from_value::<ResolvedTheme>(json!({})).is_err());
    }

    #[test]
    fn generates_styles_inline_runs_and_avatar() {
        let sections = vec![
            json!({"type":"personal_info","visible":true,"title":"","content":{
                "fullName":"张三","jobTitle":"软件工程师","email":"a@b.com","phone":"13800000000",
                "avatar":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            }}),
            json!({"type":"summary","visible":true,"title":"简介","content":{"text":"**加粗** *斜体* __下划线__ `代码`"}}),
        ];
        let out = std::env::temp_dir().join("reseumer-docx-wp2-test.docx");
        generate_docx("测试简历", &sections, "zh", &theme(), &out).unwrap();
        let mut bytes = Vec::new();
        std::fs::File::open(&out)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        let json = read_docx(&bytes).unwrap().json();
        assert!(json.contains("Heading1"));
        assert!(json.contains("宋体"));
        assert!(!json.contains("**加粗**"));
        let archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        assert!(
            archive
                .file_names()
                .any(|name| name.starts_with("word/media/"))
        );
    }
}
