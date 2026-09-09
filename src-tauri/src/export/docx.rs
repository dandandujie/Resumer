//! DOCX 导出：只消费前端传来的完整主题（含 Office 字体名），Rust 侧不设默认值、不维护第二份映射。
//! 排版靠样式表（Title / Heading1 / Heading2 / Normal / ListBullet），Run 级只写粗斜下划线，
//! 这样用户在 WPS/Word 里改样式能全局生效。

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use docx_rs::{
    AlignmentType, Docx, LineSpacing, LineSpacingType, Paragraph, ParagraphBorder,
    ParagraphBorderPosition, ParagraphBorders, Pic, Run, RunFonts, Shading, Style, StyleType, Tab,
    TabValueType, Table, TableCell, TableRow, WidthType,
};
use serde::Deserialize;
use serde_json::Value;
use std::io::Cursor;
use std::path::Path;

use super::date::{DateStyle, format_month, format_range};
use super::inline::{Span, parse};

const A4_W: u32 = 11906;
const A4_H: u32 = 16838;
const TWIPS_PER_MM: f64 = 56.7;
/// CSS 参考像素换 twips：1px = 0.75pt = 15twips。
const TWIPS_PER_PX: f64 = 15.0;
const EMU_PER_MM: u32 = 36000;
/// 一寸照 25×35mm；圆形头像 18mm 直径。
const AVATAR_ONE_INCH: (u32, u32) = (EMU_PER_MM * 25, EMU_PER_MM * 35);
const AVATAR_CIRCLE: (u32, u32) = (EMU_PER_MM * 18, EMU_PER_MM * 18);
const AVATAR_COLUMN_TWIPS: usize = 2000;
const ITEM_HEADING_BEFORE_TWIPS: u32 = 100;
const HEADING_AFTER_TWIPS: u32 = 40;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
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
    pub office_fonts: OfficeFonts,
}

#[derive(Debug, Deserialize)]
pub struct ThemeMargin {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeFonts {
    pub east_asia: String,
    pub latin: String,
}

fn office_fonts(theme: &ResolvedTheme) -> Result<RunFonts, String> {
    let fonts = &theme.office_fonts;
    if fonts.east_asia.trim().is_empty() || fonts.latin.trim().is_empty() {
        return Err("主题缺少 Office 字体名".into());
    }
    Ok(RunFonts::new()
        .ascii(&fonts.latin)
        .hi_ansi(&fonts.latin)
        .east_asia(&fonts.east_asia)
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

fn px_twips(px: f64) -> u32 {
    (px * TWIPS_PER_PX).round().max(0.0) as u32
}

fn content_width_twips(theme: &ResolvedTheme) -> usize {
    (A4_W as i32 - twips(theme.margin.left) - twips(theme.margin.right)).max(4000) as usize
}

fn spacing(theme: &ResolvedTheme, before: u32, after: u32) -> LineSpacing {
    LineSpacing::new()
        .line((240.0 * theme.line_spacing).round() as i32)
        .line_rule(LineSpacingType::Auto)
        .before(before)
        .after(after)
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

/// 段距语义与预览一致：模块之间留 sectionSpacing，模块内部段落不额外加段后距。
fn styles(theme: &ResolvedTheme, fonts: &RunFonts) -> Vec<Style> {
    let body_size = half_points(theme.font_size);
    let section_gap = px_twips(theme.section_spacing);
    let normal = style(
        "Normal",
        "正文",
        body_size,
        &theme.body_color,
        fonts,
        spacing(theme, 0, 0),
    );
    let mut heading1 = style(
        "Heading1",
        "模块标题",
        half_points(theme.font_size * 1.15),
        &theme.primary_color,
        fonts,
        spacing(theme, section_gap, HEADING_AFTER_TWIPS),
    )
    .bold();
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
        body_size,
        &theme.primary_color,
        fonts,
        spacing(theme, ITEM_HEADING_BEFORE_TWIPS, 0),
    )
    .bold();
    let title = style(
        "Title",
        "姓名",
        half_points(theme.font_size * 1.6),
        &theme.primary_color,
        fonts,
        spacing(theme, 0, 0),
    )
    .bold();
    let bullet = style(
        "ListBullet",
        "项目符号",
        body_size,
        &theme.body_color,
        fonts,
        spacing(theme, 0, 0),
    );
    vec![title, heading1, heading2, normal, bullet]
}

/// Run 只承载内联标记；颜色/字号/字体全部留给样式表，用户改样式才会全局生效。
fn run(span: &Span) -> Run {
    let mut value = Run::new().add_text(&span.text);
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

fn add_spans(
    mut paragraph: Paragraph,
    text: &str,
    theme: &ResolvedTheme,
    filled_heading: bool,
) -> Paragraph {
    for span in parse(text) {
        let mut value = run(&span);
        if filled_heading {
            value = value
                .shading(Shading::new().fill(color(&theme.accent_color)))
                .color("FFFFFF");
        }
        paragraph = paragraph.add_run(value);
    }
    paragraph
}

fn paragraph(text: &str, style_id: &str, theme: &ResolvedTheme) -> Paragraph {
    let filled = style_id == "Heading1" && theme.heading_style == "filled";
    add_spans(Paragraph::new().style(style_id), text, theme, filled)
}

fn bullet(text: &str, theme: &ResolvedTheme) -> Paragraph {
    paragraph(&format!("• {}", text), "ListBullet", theme)
}

/// 条目标题行：左侧标题，右侧日期靠右制表位——与预览里"标题 …… 日期"同一行的观感一致。
fn item_heading(left: &str, right: &str, theme: &ResolvedTheme) -> Paragraph {
    let mut result = add_spans(Paragraph::new().style("Heading2"), left, theme, false);
    if !right.is_empty() {
        result = result
            .add_tab(
                Tab::new()
                    .val(TabValueType::Right)
                    .pos(content_width_twips(theme)),
            )
            .add_run(Run::new().add_tab().add_text(right));
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
        .filter(|item| !item.trim().is_empty())
        .collect()
}

fn range(item: &Value, style: DateStyle, language: &str) -> String {
    format_range(
        &text(item, "startDate"),
        &text(item, "endDate"),
        current(item),
        style,
        language,
    )
}

fn join_present(parts: Vec<String>, separator: &str) -> String {
    parts
        .into_iter()
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join(separator)
}

fn tech_label(language: &str) -> &'static str {
    if language == "zh" { "技术栈" } else { "Tech" }
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

/// 圆形头像：先居中裁成正方形，再把圆外像素置为透明。Word 没有稳定的图形裁剪 API，
/// 直接给它一张带透明角的 PNG 最可靠。
pub(crate) fn circle_avatar_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let source = image::load_from_memory(bytes).map_err(|e| format!("头像解码失败: {}", e))?;
    let (width, height) = (source.width(), source.height());
    let side = width.min(height);
    let square = source
        .crop_imm((width - side) / 2, (height - side) / 2, side, side)
        .to_rgba8();
    let radius = side as f32 / 2.0;
    let mut out = image::RgbaImage::new(side, side);
    for (x, y, pixel) in out.enumerate_pixels_mut() {
        let dx = x as f32 + 0.5 - radius;
        let dy = y as f32 + 0.5 - radius;
        let distance = (dx * dx + dy * dy).sqrt();
        let mut value = *square.get_pixel(x, y);
        // 边缘 1px 线性过渡，避免锯齿圆。
        let alpha = (radius - distance + 0.5).clamp(0.0, 1.0);
        value.0[3] = (value.0[3] as f32 * alpha).round() as u8;
        *pixel = value;
    }
    let mut buffer = Cursor::new(Vec::new());
    out.write_to(&mut buffer, image::ImageFormat::Png)
        .map_err(|e| format!("头像编码失败: {}", e))?;
    Ok(buffer.into_inner())
}

/// 与预览同序：基本信息 → 联系方式 → 链接；值直接展示不加标签（中文简历习惯，也与 app 一致）。
const PERSONAL_INFO_KEYS: [&str; 15] = [
    "age",
    "politicalStatus",
    "gender",
    "ethnicity",
    "hometown",
    "maritalStatus",
    "yearsOfExperience",
    "educationLevel",
    "email",
    "phone",
    "wechat",
    "location",
    "website",
    "linkedin",
    "github",
];

fn personal_info_table(content: &Value, theme: &ResolvedTheme) -> Result<Table, String> {
    let mut left = TableCell::new();
    let name = text(content, "fullName");
    let job = text(content, "jobTitle");
    if !name.is_empty() {
        left = left.add_paragraph(paragraph(&name, "Title", theme));
    }
    if !job.is_empty() {
        left = left.add_paragraph(paragraph(&job, "Normal", theme));
    }
    let contacts: Vec<String> = PERSONAL_INFO_KEYS
        .iter()
        .map(|key| text(content, key))
        .filter(|value| !value.trim().is_empty())
        .collect();
    if theme.info_layout == "grid" {
        // 两列网格：每行两个值，各占一段，Word 里才是真正的换行。
        for pair in contacts.chunks(2) {
            left = left.add_paragraph(paragraph(&pair.join("    "), "Normal", theme));
        }
    } else if !contacts.is_empty() {
        left = left.add_paragraph(paragraph(&contacts.join(" | "), "Normal", theme));
    }

    let Some(avatar) = content.get("avatar").and_then(Value::as_str) else {
        return Ok(Table::without_borders(vec![TableRow::new(vec![left])]));
    };
    let Some(bytes) = avatar_bytes(avatar)? else {
        return Ok(Table::without_borders(vec![TableRow::new(vec![left])]));
    };
    let ((width, height), bytes) = if theme.avatar_style == "circle" {
        (AVATAR_CIRCLE, circle_avatar_png(&bytes)?)
    } else {
        (AVATAR_ONE_INCH, bytes)
    };
    let pic = Pic::new(&bytes).size(width, height);
    let right = TableCell::new()
        .width(AVATAR_COLUMN_TWIPS, WidthType::Dxa)
        .add_paragraph(
            Paragraph::new()
                .style("Normal")
                .align(AlignmentType::Right)
                .add_run(Run::new().add_image(pic)),
        );
    let content_width = content_width_twips(theme);
    Ok(Table::without_borders(vec![TableRow::new(vec![left, right])])
        .set_grid(vec![
            content_width - AVATAR_COLUMN_TWIPS,
            AVATAR_COLUMN_TWIPS,
        ])
        .width(content_width, WidthType::Dxa))
}

fn item_paragraphs(
    section_type: &str,
    content: &Value,
    style: DateStyle,
    language: &str,
    theme: &ResolvedTheme,
) -> Vec<Paragraph> {
    let items = values(content, "items");
    let mut body: Vec<Paragraph> = Vec::new();
    let push_description = |body: &mut Vec<Paragraph>, item: &Value| {
        let description = text(item, "description");
        if !description.is_empty() {
            body.push(paragraph(&description, "Normal", theme));
        }
    };
    let push_technologies = |body: &mut Vec<Paragraph>, item: &Value| {
        let technologies = strings(item, "technologies");
        if !technologies.is_empty() {
            let line = format!("**{}**: {}", tech_label(language), technologies.join(", "));
            body.push(paragraph(&line, "Normal", theme));
        }
    };
    let push_highlights = |body: &mut Vec<Paragraph>, item: &Value| {
        for highlight in strings(item, "highlights") {
            body.push(bullet(&highlight, theme));
        }
    };
    match section_type {
        "summary" => {
            let value = text(content, "text");
            if !value.is_empty() {
                body.push(paragraph(&value, "Normal", theme));
            }
        }
        "work_experience" => {
            for item in items {
                let heading = join_present(
                    vec![
                        text(item, "position"),
                        text(item, "company"),
                        text(item, "location"),
                    ],
                    " · ",
                );
                body.push(item_heading(&heading, &range(item, style, language), theme));
                push_description(&mut body, item);
                push_technologies(&mut body, item);
                push_highlights(&mut body, item);
            }
        }
        "education" => {
            for item in items {
                let heading = if language == "zh" {
                    join_present(
                        vec![
                            text(item, "institution"),
                            text(item, "field"),
                            text(item, "degree"),
                        ],
                        " · ",
                    )
                } else {
                    join_present(
                        vec![
                            text(item, "degree"),
                            text(item, "field"),
                            text(item, "institution"),
                        ],
                        ", ",
                    )
                };
                body.push(item_heading(&heading, &range(item, style, language), theme));
                let gpa = text(item, "gpa");
                if !gpa.is_empty() {
                    body.push(paragraph(&format!("GPA: {}", gpa), "Normal", theme));
                }
                push_highlights(&mut body, item);
            }
        }
        "skills" => {
            for category in values(content, "categories") {
                let skills = strings(category, "skills");
                if skills.is_empty() {
                    continue;
                }
                let name = text(category, "name");
                let line = if name.is_empty() {
                    skills.join(", ")
                } else {
                    format!("**{}**: {}", name, skills.join(", "))
                };
                body.push(paragraph(&line, "Normal", theme));
            }
        }
        "projects" => {
            for item in items {
                body.push(item_heading(
                    &text(item, "name"),
                    &range(item, style, language),
                    theme,
                ));
                push_description(&mut body, item);
                push_technologies(&mut body, item);
                push_highlights(&mut body, item);
            }
        }
        "certifications" => {
            for item in items {
                let date = format_month(&text(item, "date"), style, language);
                let mut line = join_present(vec![text(item, "name"), text(item, "issuer")], " — ");
                if !date.is_empty() {
                    line.push_str(&format!(" ({})", date));
                }
                body.push(bullet(&line, theme));
            }
        }
        "languages" => {
            for item in items {
                let line = join_present(
                    vec![text(item, "language"), text(item, "proficiency")],
                    ": ",
                );
                body.push(bullet(&line, theme));
            }
        }
        "github" => {
            for item in items {
                let meta = join_present(vec![text(item, "language"), text(item, "repoUrl")], " · ");
                body.push(item_heading(&text(item, "name"), &meta, theme));
                push_description(&mut body, item);
            }
        }
        "qr_codes" => {}
        _ => {
            for item in items {
                let heading = join_present(vec![text(item, "title"), text(item, "subtitle")], " · ");
                body.push(item_heading(&heading, &text(item, "date"), theme));
                push_description(&mut body, item);
            }
        }
    }
    body
}

pub fn generate_docx(
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

    let style = DateStyle::parse(Some(&theme.date_style));
    for section in sections {
        if section.get("visible").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        let section_type = text(section, "type");
        let content = section.get("content").cloned().unwrap_or(Value::Null);
        if section_type == "personal_info" {
            docx = docx.add_table(personal_info_table(&content, theme)?);
            continue;
        }
        let body = item_paragraphs(&section_type, &content, style, language, theme);
        // 空模块不导出标题，避免 Word 里出现孤零零的"项目经历"。
        if body.is_empty() {
            continue;
        }
        docx = docx.add_paragraph(paragraph(&text(section, "title"), "Heading1", theme));
        for item in body {
            docx = docx.add_paragraph(item);
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

    const AVATAR: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    fn theme(overrides: Value) -> ResolvedTheme {
        let mut base = json!({
            "fontScheme":"songti", "bodyColor":"#1a1a1a", "primaryColor":"#1f3a5f", "accentColor":"#1f3a5f",
            "fontSize":14, "lineSpacing":1.35, "sectionSpacing":6, "marginUnit":"mm",
            "margin":{"top":18,"right":18,"bottom":18,"left":18}, "dateStyle":"dot",
            "headingStyle":"underline", "avatarStyle":"oneInch", "infoLayout":"inline",
            "officeFonts":{"eastAsia":"宋体","latin":"Times New Roman"}
        });
        for (key, value) in overrides.as_object().unwrap() {
            base[key] = value.clone();
        }
        serde_json::from_value(base).unwrap()
    }

    fn build(sections: Vec<Value>, theme: &ResolvedTheme, name: &str) -> (Vec<u8>, String) {
        let out = std::env::temp_dir().join(format!(
            "reseumer-docx-{name}-{}.docx",
            std::process::id()
        ));
        generate_docx(&sections, "zh", theme, &out).unwrap();
        let mut bytes = Vec::new();
        std::fs::File::open(&out)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        let _ = std::fs::remove_file(&out);
        let json = read_docx(&bytes).unwrap().json();
        (bytes, json)
    }

    #[test]
    fn missing_theme_fields_are_rejected() {
        assert!(serde_json::from_value::<ResolvedTheme>(json!({})).is_err());
        // 没有 officeFonts 也必须拒绝：Rust 侧不再有字体映射表可兜底。
        let without_fonts = json!({
            "fontScheme":"songti", "bodyColor":"#1a1a1a", "primaryColor":"#1a1a1a", "accentColor":"#1a1a1a",
            "fontSize":14, "lineSpacing":1.35, "sectionSpacing":6,
            "margin":{"top":18,"right":18,"bottom":18,"left":18}, "dateStyle":"dot",
            "headingStyle":"underline", "avatarStyle":"oneInch", "infoLayout":"inline"
        });
        assert!(serde_json::from_value::<ResolvedTheme>(without_fonts).is_err());
    }

    #[test]
    fn generates_styles_inline_runs_and_avatar() {
        let sections = vec![
            json!({"type":"personal_info","visible":true,"title":"","content":{
                "fullName":"张三","jobTitle":"软件工程师","email":"a@b.com","phone":"13800000000","avatar":AVATAR
            }}),
            json!({"type":"summary","visible":true,"title":"简介","content":{"text":"**加粗** *斜体* __下划线__ `代码`"}}),
            json!({"type":"work_experience","visible":true,"title":"工作经历","content":{"items":[{
                "position":"后端","company":"字节跳动","startDate":"2022-07","endDate":"2024-06","current":false,
                "highlights":["主导重构"]
            }]}}),
            json!({"type":"projects","visible":true,"title":"项目经历","content":{"items":[]}}),
        ];
        let (bytes, json) = build(sections, &theme(json!({})), "basic");
        assert!(json.contains("Heading1"));
        assert!(json.contains("宋体"));
        assert!(json.contains("Times New Roman"));
        assert!(!json.contains("**加粗**"));
        assert!(json.contains("2022.07 - 2024.06"));
        assert!(json.contains("1f3a5f"));
        // 空模块不导出标题
        assert!(!json.contains("项目经历"));
        let archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        assert!(
            archive
                .file_names()
                .any(|name| name.starts_with("word/media/"))
        );
    }

    #[test]
    fn runs_do_not_carry_color_so_styles_stay_editable() {
        let sections = vec![json!({"type":"summary","visible":true,"title":"简介","content":{"text":"正文"}})];
        let (_, json) = build(sections, &theme(json!({"bodyColor":"#123456"})), "color");
        let value: Value = serde_json::from_str(&json).unwrap();
        let runs = value["document"]["children"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|child| {
                child["data"]["children"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
            })
            .filter(|child| child["type"] == "run")
            .collect::<Vec<_>>();
        assert!(!runs.is_empty());
        for run in runs {
            assert!(run["data"]["runProperty"]["color"].is_null(), "{run}");
        }
    }

    #[test]
    fn circle_avatar_is_cropped_to_transparent_circle() {
        let source = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            40,
            60,
            image::Rgb([200, 40, 40]),
        ));
        let mut bytes = Cursor::new(Vec::new());
        source
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        let png = circle_avatar_png(&bytes.into_inner()).unwrap();
        let out = image::load_from_memory(&png).unwrap().to_rgba8();
        assert_eq!(out.dimensions(), (40, 40));
        assert_eq!(out.get_pixel(0, 0).0[3], 0, "角上应透明");
        assert_eq!(out.get_pixel(20, 20).0[3], 255, "圆心应不透明");
    }
}
