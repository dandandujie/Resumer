//! DOCX 导出：只消费前端传来的完整主题（含 Office 字体名），Rust 侧不设默认值、不维护第二份映射。
//! 排版靠样式表（Title / Heading1 / Heading2 / ResumeBody / ListBullet），Run 级只写粗斜下划线，
//! 这样用户在 WPS/Word 里改样式能全局生效。

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use docx_rs::{
    AlignmentType, BreakType, Docx, LineSpacing, LineSpacingType, Paragraph, ParagraphBorder,
    ParagraphBorderPosition, ParagraphBorders, Pic, Run, RunFonts, Shading, Style, StyleType, Tab,
    TabValueType, Table, TableCell, TableCellMargins, TableLayoutType, TableRow, VAlignType,
    WidthType,
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
    #[serde(default)]
    pub template: String,
    #[serde(skip)]
    column_width: Option<usize>,
    #[serde(skip)]
    dark: bool,
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
    /// 内联标记 `{{font=<id>}}` 用的中文字体 Office 名表（由前端字体表给出）。
    pub cjk_font_names: HashMap<String, String>,
    #[serde(default)]
    pub latin_font_names: HashMap<String, String>,
    #[serde(default)]
    pub qr_images: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ThemeMargin {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Debug, Clone, Deserialize)]
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
    let hex = value.trim_start_matches('#');
    if hex.len() == 3 {
        hex.chars().flat_map(|ch| [ch, ch]).collect()
    } else {
        hex.to_string()
    }
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
    if let Some(width) = theme.column_width {
        return width;
    }
    (A4_W as i32 - twips(theme.margin.left) - twips(theme.margin.right)).max(4000) as usize
}

fn spacing(theme: &ResolvedTheme, before: u32, after: u32, font_px: f64) -> LineSpacing {
    LineSpacing::new()
        .line((TWIPS_PER_PX * font_px * theme.line_spacing).round() as i32)
        .line_rule(LineSpacingType::Exact)
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
    let mut style = Style::new(id, StyleType::Paragraph)
        .name(name)
        .fonts(fonts.clone())
        .size(size)
        .color(color(color_value))
        .line_spacing(spacing);
    // WPS 的中文文档网格会把同一份行距吸附成更高的行，导致一页简历变两页。
    style.paragraph_property = style.paragraph_property.snap_to_grid(false);
    style
}

/// 段距语义与预览一致：模块之间留 sectionSpacing，模块内部段落不额外加段后距。
fn styles(theme: &ResolvedTheme, fonts: &RunFonts) -> Vec<Style> {
    let body_size = half_points(theme.font_size);
    let section_gap = px_twips(theme.section_spacing);
    let normal = style(
        "ResumeBody",
        "正文",
        body_size,
        &theme.body_color,
        fonts,
        spacing(theme, 0, 0, theme.font_size),
    );
    let mut heading1 = style(
        "Heading1",
        "模块标题",
        half_points(theme.font_size * 1.15),
        &theme.primary_color,
        fonts,
        spacing(
            theme,
            section_gap,
            HEADING_AFTER_TWIPS,
            theme.font_size * 1.15,
        ),
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
        spacing(theme, ITEM_HEADING_BEFORE_TWIPS, 0, theme.font_size),
    )
    .bold();
    let title = style(
        "Title",
        "姓名",
        half_points(theme.font_size * 1.6),
        &theme.primary_color,
        fonts,
        spacing(theme, 0, 0, theme.font_size * 1.6),
    )
    .bold();
    let bullet = style(
        "ListBullet",
        "项目符号",
        body_size,
        &theme.body_color,
        fonts,
        spacing(theme, 0, 0, theme.font_size),
    );
    let base = vec![title, heading1, heading2, normal, bullet];
    let mut result = base.clone();
    for mut style in base {
        style.style_id = format!("Sidebar{}", style.style_id);
        // Office 会按显示名称合并样式，侧栏必须同时使用独立的 ID 和名称。
        let name = format!("侧栏{}", style.style_id);
        style = style.name(name).color("FFFFFF");
        style.paragraph_property = style
            .paragraph_property
            .set_borders(ParagraphBorders::with_empty());
        result.push(style);
    }
    result
}

/// Run 只承载内联标记：粗斜下划线，以及用户对选区显式指定的颜色/字号/字体。
/// 没有显式指定的属性留给样式表，用户在 Word 里改样式才会全局生效。
fn run(span: &Span, theme: &ResolvedTheme) -> Run {
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
    if let Some(color_value) = &span.color {
        value = value.color(color(color_value));
    } else if theme.dark {
        value = value.color("FFFFFF");
    }
    if let Some(pt) = span.size_pt {
        value = value.size((pt * 2.0).round().max(1.0) as usize);
    }
    if let Some(spacing) = span.spacing_pt {
        value = value.character_spacing((spacing * 20.0).round() as i32);
    }
    if let Some(font) = &span.font
        && let Some(east_asia) = theme.cjk_font_names.get(font)
    {
        value = value.fonts(
            RunFonts::new()
                .east_asia(east_asia)
                .ascii(east_asia)
                .hi_ansi(east_asia)
                .hint("eastAsia"),
        );
    }
    if let Some(font) = &span.font
        && let Some(latin) = theme.latin_font_names.get(font)
    {
        value = value.fonts(
            RunFonts::new()
                .east_asia(&theme.office_fonts.east_asia)
                .ascii(latin)
                .hi_ansi(latin),
        );
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
        // Word 的文本节点不把换行当换行，必须生成 w:br；片段样式在各行延续。
        for (index, line) in span.text.split('\n').enumerate() {
            let mut value = run(
                &Span {
                    text: line.to_string(),
                    ..span.clone()
                },
                theme,
            );
            if index > 0 {
                paragraph = paragraph.add_run(Run::new().add_break(BreakType::TextWrapping));
            }
            if filled_heading {
                value = value
                    .shading(Shading::new().fill(color(&theme.accent_color)))
                    .color("FFFFFF");
            }
            paragraph = paragraph.add_run(value);
        }
    }
    paragraph
}

fn paragraph(text: &str, style_id: &str, theme: &ResolvedTheme) -> Paragraph {
    let filled = style_id == "Heading1" && theme.heading_style == "filled";
    let id = if theme.dark {
        format!("Sidebar{style_id}")
    } else {
        style_id.to_string()
    };
    let mut paragraph = Paragraph::new().style(&id).snap_to_grid(false);
    let spans = parse(text);
    let base_size = theme.font_size
        * match style_id {
            "Title" => 1.6,
            "Heading1" => 1.15,
            _ => 1.0,
        };
    let max_pt = spans
        .iter()
        .filter_map(|span| span.size_pt)
        .fold(base_size * 0.75, f64::max);
    let parts = spans.iter().find_map(|span| {
        span.paragraph
            .as_deref()
            .and_then(super::inline::paragraph_values)
    });
    // Office 的倍数行距依赖字体内部度量，和 CSS 的字号倍数不等价。
    // 使用实际高度，同时容纳局部放大的字号，避免嵌入中文字体后意外增页。
    let multiplier = parts.and_then(|p| p[2]).unwrap_or(theme.line_spacing);
    let mut line = LineSpacing::new()
        .line((max_pt * 20.0 * multiplier).round() as i32)
        .line_rule(LineSpacingType::Exact);
    if let Some(parts) = parts {
        if let Some(before) = parts[0] {
            line = line.before((before * 20.0).round() as u32);
        }
        if let Some(after) = parts[1] {
            line = line.after((after * 20.0).round() as u32);
        }
    }
    paragraph = paragraph.line_spacing(line);
    add_spans(paragraph, text, theme, filled)
}

fn bullet(text: &str, theme: &ResolvedTheme) -> Paragraph {
    paragraph(&format!("• {}", text), "ListBullet", theme)
}

/// 条目标题行：左侧标题，右侧日期靠右制表位——与预览里"标题 …… 日期"同一行的观感一致。
fn item_heading(left: &str, right: &str, theme: &ResolvedTheme) -> Paragraph {
    let mut result = paragraph(left, "Heading2", theme);
    if !right.is_empty() {
        result = result
            .add_tab(
                Tab::new()
                    .val(TabValueType::Right)
                    .pos(content_width_twips(theme)),
            )
            .add_run(Run::new().add_tab());
        result = add_spans(result, right, theme, false);
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
    if language == "zh" {
        "技术栈"
    } else {
        "Tech"
    }
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
    let mut identity = TableCell::new().vertical_align(VAlignType::Center);
    let name = text(content, "fullName");
    let job = text(content, "jobTitle");
    for (value, style) in [(&name, "Title"), (&job, "ResumeBody")] {
        if !value.is_empty() {
            identity =
                identity.add_paragraph(paragraph(value, style, theme).align(AlignmentType::Center));
        }
    }
    let mut contacts: Vec<String> = PERSONAL_INFO_KEYS
        .iter()
        .map(|key| text(content, key))
        .filter(|value| !value.trim().is_empty())
        .collect();
    contacts.extend(
        values(content, "customLinks")
            .iter()
            .map(|link| join_present(vec![text(link, "label"), text(link, "url")], ": ")),
    );
    let mut contact_cell = TableCell::new();
    if theme.info_layout == "grid" {
        for pair in contacts.chunks(2) {
            contact_cell = contact_cell.add_paragraph(
                paragraph(&pair.join("    "), "ResumeBody", theme).align(AlignmentType::Center),
            );
        }
    } else {
        contact_cell = contact_cell.add_paragraph(
            paragraph(&contacts.join(" | "), "ResumeBody", theme).align(AlignmentType::Center),
        );
    }
    let content_width = content_width_twips(theme);
    let bytes = content
        .get("avatar")
        .and_then(Value::as_str)
        .map(avatar_bytes)
        .transpose()?
        .flatten();
    let Some(bytes) = bytes else {
        return Ok(Table::without_borders(vec![
            TableRow::new(vec![identity]),
            TableRow::new(vec![contact_cell]),
        ])
        .width(content_width, WidthType::Dxa));
    };
    let ((width, height), bytes) = if theme.avatar_style == "circle" {
        (AVATAR_CIRCLE, circle_avatar_png(&bytes)?)
    } else {
        (AVATAR_ONE_INCH, bytes)
    };
    let portrait = TableCell::new()
        .vertical_align(VAlignType::Center)
        .add_paragraph(
            // 图片段落按图片高度扩展；固定正文行高会裁掉证件照。
            Paragraph::new()
                .snap_to_grid(false)
                .align(AlignmentType::Center)
                .add_run(Run::new().add_image(Pic::new(&bytes).size(width, height))),
        );
    // 两侧等宽留白使照片和姓名作为一组居中，联系方式独占下一行。
    // 按纯文本估算姓名列宽，避免短姓名占满半页、把照片推到纸张边缘。
    let estimate = |value: &str, font_px: f64| -> usize {
        let units: f64 = parse(value)
            .iter()
            .flat_map(|span| span.text.chars())
            .map(|ch| if ch.is_ascii() { 0.6 } else { 1.0 })
            .sum();
        (units * font_px * TWIPS_PER_PX).ceil() as usize + 240
    };
    let identity_width = estimate(&name, theme.font_size * 1.6)
        .max(estimate(&job, theme.font_size))
        .max(1800)
        .min(content_width.saturating_sub(AVATAR_COLUMN_TWIPS + 2));
    let space = (content_width - AVATAR_COLUMN_TWIPS - identity_width) / 2;
    let empty = || TableCell::new().add_paragraph(Paragraph::new());
    Ok(Table::without_borders(vec![
        TableRow::new(vec![empty(), portrait, identity, empty()]),
        TableRow::new(vec![contact_cell.grid_span(4)]),
    ])
    .set_grid(vec![
        space,
        AVATAR_COLUMN_TWIPS,
        identity_width,
        content_width - space - AVATAR_COLUMN_TWIPS - identity_width,
    ])
    .layout(TableLayoutType::Fixed)
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
            body.push(paragraph(&description, "ResumeBody", theme));
        }
    };
    let push_technologies = |body: &mut Vec<Paragraph>, item: &Value| {
        let technologies = strings(item, "technologies");
        if !technologies.is_empty() {
            let line = format!("**{}**: {}", tech_label(language), technologies.join(", "));
            body.push(paragraph(&line, "ResumeBody", theme));
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
                body.push(paragraph(&value, "ResumeBody", theme));
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
                if theme.template == "modern" {
                    body.push(item_heading(
                        &text(item, "position"),
                        &range(item, style, language),
                        theme,
                    ));
                    body.push(paragraph(
                        &join_present(vec![text(item, "company"), text(item, "location")], " · "),
                        "ResumeBody",
                        theme,
                    ));
                } else {
                    body.push(item_heading(&heading, &range(item, style, language), theme));
                }
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
                if theme.template == "modern" {
                    body.push(item_heading(
                        &text(item, "degree"),
                        &range(item, style, language),
                        theme,
                    ));
                    body.push(paragraph(
                        &join_present(vec![text(item, "institution"), text(item, "field")], " · "),
                        "ResumeBody",
                        theme,
                    ));
                } else {
                    body.push(item_heading(&heading, &range(item, style, language), theme));
                }
                let gpa = text(item, "gpa");
                let location = text(item, "location");
                if !location.is_empty() {
                    body.push(paragraph(&location, "ResumeBody", theme));
                }
                if !gpa.is_empty() {
                    body.push(paragraph(&format!("GPA: {}", gpa), "ResumeBody", theme));
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
                body.push(paragraph(&line, "ResumeBody", theme));
            }
        }
        "projects" => {
            for item in items {
                body.push(item_heading(
                    &text(item, "name"),
                    &range(item, style, language),
                    theme,
                ));
                let url = text(item, "url");
                if !url.is_empty() {
                    body.push(paragraph(&url, "ResumeBody", theme));
                }
                push_description(&mut body, item);
                push_technologies(&mut body, item);
                push_highlights(&mut body, item);
            }
        }
        "certifications" => {
            for item in items {
                let url = text(item, "url");
                if !url.is_empty() {
                    body.push(paragraph(&url, "ResumeBody", theme));
                }
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
                push_description(&mut body, item);
            }
        }
        "github" => {
            for item in items {
                let meta = join_present(vec![text(item, "language"), text(item, "repoUrl")], " · ");
                body.push(item_heading(&text(item, "name"), &meta, theme));
                if let Some(stars) = item.get("stars").and_then(Value::as_u64) {
                    body.push(paragraph(&format!("★ {stars}"), "ResumeBody", theme));
                }
                push_description(&mut body, item);
            }
        }
        "qr_codes" => {
            for item in items {
                if let Some(data) = theme.qr_images.get(&text(item, "id"))
                    && let Ok(Some(bytes)) = avatar_bytes(data)
                {
                    body.push(
                        Paragraph::new()
                            .align(AlignmentType::Center)
                            .add_run(Run::new().add_image(Pic::new(&bytes).size(762000, 762000))),
                    );
                }
                // 没有图像时也保留链接，避免内容静默丢失。
                let label = text(item, "label");
                if !label.is_empty() {
                    body.push(paragraph(&label, "ResumeBody", theme).align(AlignmentType::Center));
                }
                let url = text(item, "url");
                if !url.is_empty() {
                    body.push(paragraph(&url, "ResumeBody", theme).align(AlignmentType::Center));
                }
            }
        }
        _ => {
            for item in items {
                let heading =
                    join_present(vec![text(item, "title"), text(item, "subtitle")], " · ");
                body.push(item_heading(
                    &heading,
                    &format_month(&text(item, "date"), style, language),
                    theme,
                ));
                push_description(&mut body, item);
            }
        }
    }
    body
}

/// Modern 使用可编辑的双栏表格；列宽、内边距和侧栏模块与前端保持一致。
fn modern_table(
    sections: &[Value],
    language: &str,
    theme: &ResolvedTheme,
) -> Result<Table, String> {
    let width = content_width_twips(theme);
    let left_width = width * 35 / 100;
    let right_width = width - left_width;
    let mut left_theme = theme.clone();
    left_theme.column_width = Some(left_width.saturating_sub(720));
    left_theme.dark = true;
    left_theme.heading_style = "plain".into();
    let mut right_theme = theme.clone();
    right_theme.column_width = Some(right_width.saturating_sub(960));
    let mut left = TableCell::new()
        .width(left_width, WidthType::Dxa)
        .shading(Shading::new().fill("1E293B"));
    let mut right = TableCell::new().width(right_width, WidthType::Dxa);
    left.property = left
        .property
        .margin_top(360, WidthType::Dxa)
        .margin_bottom(360, WidthType::Dxa)
        .margin_left(360, WidthType::Dxa)
        .margin_right(360, WidthType::Dxa);
    right.property = right
        .property
        .margin_top(480, WidthType::Dxa)
        .margin_bottom(480, WidthType::Dxa)
        .margin_left(480, WidthType::Dxa)
        .margin_right(480, WidthType::Dxa);
    let style = DateStyle::parse(Some(&theme.date_style));
    for section in sections {
        if section.get("visible").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        let kind = text(section, "type");
        let content = section.get("content").unwrap_or(&Value::Null);
        if kind == "personal_info" {
            if let Some(bytes) = avatar_bytes(&text(content, "avatar"))? {
                let ((w, h), bytes) = if theme.avatar_style == "circle" {
                    (AVATAR_CIRCLE, circle_avatar_png(&bytes)?)
                } else {
                    (AVATAR_ONE_INCH, bytes)
                };
                left = left.add_paragraph(
                    Paragraph::new()
                        .align(AlignmentType::Center)
                        .add_run(Run::new().add_image(Pic::new(&bytes).size(w, h))),
                );
            }
            left = left.add_paragraph(
                paragraph(&text(content, "fullName"), "Title", &left_theme)
                    .align(AlignmentType::Center),
            );
            left = left.add_paragraph(
                paragraph(&text(content, "jobTitle"), "ResumeBody", &left_theme)
                    .align(AlignmentType::Center),
            );
            for key in PERSONAL_INFO_KEYS {
                let value = text(content, key);
                if !value.is_empty() {
                    left = left.add_paragraph(paragraph(&value, "ResumeBody", &left_theme));
                }
            }
            for link in values(content, "customLinks") {
                left = left.add_paragraph(paragraph(
                    &join_present(vec![text(link, "label"), text(link, "url")], ": "),
                    "ResumeBody",
                    &left_theme,
                ));
            }
            continue;
        }
        let sidebar = matches!(
            kind.as_str(),
            "skills" | "languages" | "certifications" | "qr_codes"
        );
        let column_theme = if sidebar { &left_theme } else { &right_theme };
        let paragraphs = item_paragraphs(&kind, content, style, language, column_theme);
        if paragraphs.is_empty() {
            continue;
        }
        let title = paragraph(&text(section, "title"), "Heading1", column_theme);
        if sidebar {
            left = left.add_paragraph(title);
            for paragraph in paragraphs {
                left = left.add_paragraph(paragraph);
            }
        } else {
            right = right.add_paragraph(title);
            for paragraph in paragraphs {
                right = right.add_paragraph(paragraph);
            }
        }
    }
    Ok(
        Table::without_borders(vec![TableRow::new(vec![left, right])])
            .set_grid(vec![left_width, right_width])
            .width(width, WidthType::Dxa)
            .layout(TableLayoutType::Fixed)
            .margins(TableCellMargins::new().margin(0, 0, 0, 0)),
    )
}

#[cfg(test)]
pub fn generate_docx(
    sections: &[Value],
    language: &str,
    theme: &ResolvedTheme,
    output_path: &Path,
) -> Result<(), String> {
    let fonts = Path::new(env!("CARGO_MANIFEST_DIR")).join("fonts");
    generate_docx_with_fonts(sections, language, theme, output_path, Some(&fonts))
}

pub fn generate_docx_with_fonts(
    sections: &[Value],
    language: &str,
    theme: &ResolvedTheme,
    output_path: &Path,
    font_dir: Option<&Path>,
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
    if theme.template == "modern" {
        docx = docx.add_table(modern_table(sections, language, theme)?);
    } else {
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
    }

    let mut file = Cursor::new(Vec::new());
    docx.build()
        .pack(&mut file)
        .map_err(|e| format!("生成 DOCX 失败: {}", e))?;
    let bytes = super::docx_fonts::embed_fonts(file.into_inner(), font_dir)?;
    std::fs::write(output_path, bytes).map_err(|e| format!("保存 DOCX 失败: {e}"))?;
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
            "officeFonts":{"eastAsia":"宋体","latin":"Times New Roman"},
            "cjkFontNames":{"songti":"宋体","yahei":"微软雅黑"}
        });
        for (key, value) in overrides.as_object().unwrap() {
            base[key] = value.clone();
        }
        serde_json::from_value(base).unwrap()
    }

    fn build(sections: Vec<Value>, theme: &ResolvedTheme, name: &str) -> (Vec<u8>, String) {
        let out =
            std::env::temp_dir().join(format!("reseumer-docx-{name}-{}.docx", std::process::id()));
        generate_docx(&sections, "zh", theme, &out).unwrap();
        let mut bytes = Vec::new();
        std::fs::File::open(&out)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        // 手工 Office 验收时显式指定目录，正常测试不留下样本文件。
        if let Ok(dir) = std::env::var("RESUMER_DOCX_FIXTURE_DIR") {
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(Path::new(&dir).join(format!("{name}.docx")), &bytes).unwrap();
        }
        let _ = std::fs::remove_file(&out);
        let json = read_docx(&bytes).unwrap().json();
        (bytes, json)
    }

    #[test]
    fn exported_style_ids_and_names_are_unique() {
        let (bytes, _) = build(vec![], &theme(json!({})), "unique-styles");
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        zip.by_name("word/styles.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        let mut reader = quick_xml::Reader::from_str(&xml);
        let mut ids = std::collections::HashSet::new();
        let mut names = std::collections::HashSet::new();
        loop {
            use quick_xml::events::Event;
            match reader.read_event().unwrap() {
                Event::Start(node) | Event::Empty(node) => {
                    for attr in node.attributes().map(Result::unwrap) {
                        let value = attr
                            .decode_and_unescape_value(reader.decoder())
                            .unwrap()
                            .into_owned();
                        if node.local_name().as_ref() == b"style"
                            && attr.key.local_name().as_ref() == b"styleId"
                        {
                            assert!(ids.insert(value));
                        } else if node.local_name().as_ref() == b"name"
                            && attr.key.local_name().as_ref() == b"val"
                        {
                            assert!(names.insert(value));
                        }
                    }
                }
                Event::Eof => break,
                _ => {}
            }
        }
    }

    #[test]
    fn paragraph_spacing_is_saved_in_docx() {
        let sections = vec![
            json!({"type":"summary","visible":true,"title":"简介","content":{"text":"{{paragraph=6,8,1.75}}正文{{/paragraph}}"}}),
        ];
        let (bytes, _) = build(sections, &theme(json!({})), "paragraph-spacing");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("word/document.xml").unwrap(), &mut xml)
            .unwrap();
        assert!(xml.contains("w:before=\"120\""));
        assert!(xml.contains("w:after=\"160\""));
        assert!(xml.contains("w:line=\"368\""));
        assert!(xml.contains("w:lineRule=\"exact\""));
        assert!(!xml.contains("{{paragraph"));
    }

    #[test]
    fn large_inline_text_expands_exported_line_height() {
        let (bytes, _) = build(
            vec![
                json!({"type":"summary","title":"简介","content":{"text":"{{size=30}}大字{{/size}}正文"}}),
            ],
            &theme(json!({})),
            "large-inline-height",
        );
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        zip.by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(xml.contains("w:line=\"810\""));
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
    fn classic_header_centers_identity_with_contacts_below() {
        for avatar in ["", AVATAR] {
            let (bytes, _) = build(
                vec![json!({"type":"personal_info","content":{
                    "fullName":"测试姓名","jobTitle":"前端工程师","email":"layout@example.com","avatar":avatar
                }})],
                &theme(json!({})),
                if avatar.is_empty() {
                    "header-no-photo"
                } else {
                    "header-photo"
                },
            );
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
            let mut xml = String::new();
            archive
                .by_name("word/document.xml")
                .unwrap()
                .read_to_string(&mut xml)
                .unwrap();
            let rows: Vec<_> = xml.split("</w:tr>").collect();
            assert!(rows[0].contains("测试姓名") && !rows[0].contains("layout@example.com"));
            assert!(rows[1].contains("layout@example.com"));
            assert!(rows[0].contains("<w:jc w:val=\"center\""));
            assert!(rows[1].contains("<w:jc w:val=\"center\""));
            if !avatar.is_empty() {
                assert!(rows[0].find("<w:drawing>").unwrap() < rows[0].find("测试姓名").unwrap());
                assert!(rows[1].contains("<w:gridSpan w:val=\"4\""));
            }
        }
    }

    #[test]
    fn runs_do_not_carry_color_so_styles_stay_editable() {
        let sections =
            vec![json!({"type":"summary","visible":true,"title":"简介","content":{"text":"正文"}})];
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
    fn selection_markers_become_run_properties() {
        let sections = vec![
            json!({"type":"summary","visible":true,"title":"简介","content":{
                "text":"{{color=#c00}}{{size=14}}{{font=yahei}}重点{{/font}}{{/size}}{{/color}}普通"
            }}),
        ];
        let (_, json) = build(sections, &theme(json!({})), "spans");
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
        let styled = runs
            .iter()
            .find(|run| json_text(run).contains("重点"))
            .expect("styled run");
        assert_eq!(styled["data"]["runProperty"]["color"], "cc0000");
        assert_eq!(styled["data"]["runProperty"]["sz"], 28);
        assert_eq!(
            styled["data"]["runProperty"]["fonts"]["eastAsia"],
            "微软雅黑"
        );
        let plain = runs
            .iter()
            .find(|run| json_text(run).contains("普通"))
            .expect("plain run");
        assert!(plain["data"]["runProperty"]["color"].is_null());
        assert!(!json.contains("{{color"));
    }

    fn json_text(run: &Value) -> String {
        run["data"]["children"]
            .as_array()
            .map(|children| {
                children
                    .iter()
                    .filter_map(|child| child["data"]["text"].as_str())
                    .collect::<String>()
            })
            .unwrap_or_default()
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

    #[test]
    fn modern_keeps_editable_columns_fonts_spacing_breaks_and_images() {
        let sections = vec![
            json!({"type":"personal_info","content":{"fullName":"林{{font=calibri}}{{size=13.5}}{{spacing=-0.5}}Alice{{/spacing}}{{/size}}{{/font}}晴","jobTitle":"前端工程师","email":"alice@example.com","avatar":AVATAR}}),
            json!({"type":"summary","title":"个人总结","content":{"text":"{{color=#c00}}跨团队协作{{/color}}\n持续交付高质量产品"}}),
            json!({"type":"work_experience","title":"工作经历","content":{"items":[{"position":"高级工程师","company":"鲸跃科技","location":"上海","startDate":"2022-07","endDate":"2026-09","technologies":["React","TypeScript"],"highlights":["负责复杂编辑器","改进性能与稳定性"]}]}}),
            json!({"type":"skills","title":"专业技能","content":{"categories":[{"name":"开发","skills":["React","Rust"]}]}}),
            json!({"type":"qr_codes","title":"作品集","content":{"items":[{"id":"qr1","label":"个人网站","url":"https://example.com"}]}}),
        ];
        let (bytes, _) = build(
            sections,
            &theme(
                json!({"template":"modern","latinFontNames":{"calibri":"Calibri"},"qrImages":{"qr1":AVATAR}}),
            ),
            "modern",
        );
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(xml.contains("<w:tbl>"), "必须是可编辑表格");
        assert!(xml.contains("w:type=\"fixed\""));
        assert_eq!(xml.matches("<w:gridCol ").count(), 2);
        assert!(xml.contains("1E293B"));
        assert!(xml.contains("SidebarTitle"));
        assert!(xml.contains("Calibri"));
        assert!(xml.contains("<w:sz w:val=\"27\""));
        assert!(xml.contains("<w:spacing w:val=\"-10\""));
        assert!(xml.contains("<w:br"));
        assert!(xml.contains("cc0000"));
        assert!(xml.contains("<w:drawing>"));
        for value in ["专业技能", "个人网站", "工作经历", "鲸跃科技", "React"] {
            assert!(xml.contains(value), "遗漏 {value}");
        }
        assert!(!xml.contains("{{"));
    }
}
