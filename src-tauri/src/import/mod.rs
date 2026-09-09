use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};
use std::io::{Cursor, Read};
use zip::ZipArchive;

use crate::db::repo::resume as resume_repo;
#[derive(Debug)]
pub(crate) struct ImportAssets {
    pub(crate) text: String,
    pub(crate) avatar: Option<String>,
    /// 只包含从文件里推断出来的字段（fontScheme / fontSize / margin），由调用方与基底合并。
    pub(crate) inferred_theme: Value,
}

/// 导入的主题 = 前端传入的基底（唯一默认主题）⊕ 从文件推断出的字段。Rust 侧不保存默认值。
pub(crate) fn merge_theme(mut base: Value, inferred: &Value) -> Value {
    if let (Some(target), Some(extra)) = (base.as_object_mut(), inferred.as_object()) {
        for (key, value) in extra {
            target.insert(key.clone(), value.clone());
        }
    }
    base
}

pub(crate) fn pick_avatar_candidate(images: Vec<(u32, u32, Vec<u8>)>) -> Option<Vec<u8>> {
    images
        .into_iter()
        .filter(|(width, height, _)| {
            let short = (*width).min(*height);
            let ratio = (*width as f32 / *height as f32).min(*height as f32 / *width as f32);
            short >= 120 && ratio >= 0.6 && ratio <= 1.0
        })
        .max_by_key(|(width, height, _)| width.saturating_mul(*height))
        .map(|(_, _, bytes)| bytes)
}

fn image_data_url(bytes: Vec<u8>) -> Result<String, String> {
    let format = image::guess_format(&bytes).map_err(|e| format!("无法识别头像格式: {}", e))?;
    let mime = match format {
        image::ImageFormat::Png => "image/png",
        image::ImageFormat::Jpeg => "image/jpeg",
        image::ImageFormat::WebP => "image/webp",
        _ => return Err("头像只支持 PNG、JPEG 或 WebP".into()),
    };
    Ok(format!("data:{};base64,{}", mime, BASE64.encode(bytes)))
}

fn xml_attr<'a>(xml: &'a str, key: &str) -> Option<&'a str> {
    let marker = format!("{}=\"", key);
    let start = xml.find(&marker)? + marker.len();
    Some(&xml[start..].split('"').next()?)
}

fn xml_text(xml: &str) -> String {
    let mut out = String::new();
    let mut rest = xml;
    while let Some(start) = [rest.find("<w:t>"), rest.find("<w:t ")]
        .into_iter()
        .flatten()
        .min()
    {
        rest = &rest[start..];
        let Some(open_end) = rest.find('>') else {
            break;
        };
        rest = &rest[open_end + 1..];
        let Some(end) = rest.find("</w:t>") else {
            break;
        };
        out.push_str(&rest[..end]);
        rest = &rest[end + 6..];
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn paragraph_texts(xml: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<w:p") {
        rest = &rest[start..];
        let Some(end) = rest.find("</w:p>") else {
            break;
        };
        let block = &rest[..end + 6];
        let value = xml_text(block);
        if !value.trim().is_empty() {
            result.push(if block.contains("<w:numPr") {
                format!("- {}", value)
            } else {
                value
            });
        }
        rest = &rest[end + 6..];
    }
    result
}

fn docx_reader_text(value: &Value, output: &mut String) {
    let Some(object) = value.as_object() else {
        if let Some(items) = value.as_array() {
            for item in items {
                docx_reader_text(item, output);
            }
        }
        return;
    };
    if object.get("type").and_then(Value::as_str) == Some("text") {
        if let Some(text) = object
            .get("data")
            .and_then(|data| data.get("text"))
            .and_then(Value::as_str)
        {
            output.push_str(text);
        }
    }
    if let Some(children) = object.get("children") {
        docx_reader_text(children, output);
    }
    if let Some(data) = object.get("data") {
        docx_reader_text(data, output);
    }
}

fn docx_text(xml: &str) -> String {
    let mut output = Vec::new();
    let mut cursor = 0;
    while let Some(relative) = xml[cursor..].find("<w:tr") {
        let start = cursor + relative;
        output.extend(paragraph_texts(&xml[cursor..start]));
        let Some(end_relative) = xml[start..].find("</w:tr>") else {
            break;
        };
        let end = start + end_relative + 7;
        let row = &xml[start..end];
        let mut cells = Vec::new();
        let mut cell_cursor = 0;
        while let Some(cell_relative) = row[cell_cursor..].find("<w:tc") {
            let cell_start = cell_cursor + cell_relative;
            let Some(cell_end_relative) = row[cell_start..].find("</w:tc>") else {
                break;
            };
            let cell_end = cell_start + cell_end_relative + 7;
            let cell = xml_text(&row[cell_start..cell_end]);
            if !cell.trim().is_empty() {
                cells.push(cell);
            }
            cell_cursor = cell_end;
        }
        if !cells.is_empty() {
            output.push(format!("| {} |", cells.join(" | ")));
        }
        cursor = end;
    }
    output.extend(paragraph_texts(&xml[cursor..]));
    output.join("\n")
}

fn infer_font_scheme(name: &str) -> Option<&'static str> {
    let lower = name.to_lowercase();
    if lower.contains("song") || lower.contains("simsun") || name.contains("宋") {
        Some("songti")
    } else if lower.contains("kai") || name.contains("楷") {
        Some("kaiti")
    } else if lower.contains("fang") || name.contains("仿") {
        Some("fangsong")
    } else if lower.contains("yahei") || name.contains("雅黑") {
        Some("yahei")
    } else if lower.contains("hei") || lower.contains("sans") || name.contains("黑") {
        Some("heiti")
    } else {
        None
    }
}

fn docx_theme(styles: &str, document: &str) -> Value {
    let mut inferred = serde_json::Map::new();
    if let Some(name) = xml_attr(styles, "w:eastAsia") {
        if let Some(scheme) = infer_font_scheme(name) {
            inferred.insert("fontScheme".into(), json!(scheme));
        }
    }
    if let Some(size) = xml_attr(styles, "w:sz") {
        if let Ok(half_points) = size.parse::<f64>() {
            inferred.insert("fontSize".into(), json!((half_points / 2.0 / 0.75).round()));
        }
    }
    if let Some(margin_start) = document.find("<w:pgMar") {
        let margin_end = document[margin_start..]
            .find("/>")
            .map(|offset| margin_start + offset)
            .unwrap_or(document.len());
        let margin = &document[margin_start..margin_end];
        let mut object = serde_json::Map::new();
        for (key, name) in [
            ("top", "w:top"),
            ("right", "w:right"),
            ("bottom", "w:bottom"),
            ("left", "w:left"),
        ] {
            if let Some(value) = xml_attr(margin, name).and_then(|v| v.parse::<f64>().ok()) {
                object.insert(key.into(), json!((value / 56.7 * 10.0).round() / 10.0));
            }
        }
        if object.len() == 4 {
            inferred.insert("margin".into(), Value::Object(object));
        }
    }
    Value::Object(inferred)
}

pub(crate) fn parse_docx_assets(bytes: &[u8]) -> Result<ImportAssets, String> {
    let reader = docx_rs::read_docx(bytes).map_err(|e| format!("DOCX 读取失败: {}", e))?;
    let reader_json: Value = serde_json::from_str(&reader.json())
        .map_err(|e| format!("DOCX 文档结构读取失败: {}", e))?;
    let mut reader_text = String::new();
    docx_reader_text(&reader_json, &mut reader_text);
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("DOCX 压缩包读取失败: {}", e))?;
    let mut document = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|e| format!("DOCX 缺少正文: {}", e))?
        .read_to_string(&mut document)
        .map_err(|e| format!("DOCX 正文读取失败: {}", e))?;
    let mut styles = String::new();
    if let Ok(mut file) = archive.by_name("word/styles.xml") {
        file.read_to_string(&mut styles)
            .map_err(|e| format!("DOCX 样式读取失败: {}", e))?;
    }
    let mut images = Vec::new();
    for index in 0..archive.len() {
        let name = archive
            .by_index(index)
            .map_err(|e| e.to_string())?
            .name()
            .to_string();
        if !name.starts_with("word/media/") {
            continue;
        }
        let mut file = archive.by_name(&name).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if let Ok(reader) = image::ImageReader::new(Cursor::new(&bytes)).with_guessed_format() {
            if let Ok((width, height)) = reader.into_dimensions() {
                images.push((width, height, bytes));
            }
        }
    }
    let avatar = pick_avatar_candidate(images)
        .map(image_data_url)
        .transpose()?;
    let inferred_theme = docx_theme(&styles, &document);
    let structured_text = docx_text(&document);
    let text = if structured_text.trim().is_empty() {
        reader_text
    } else {
        structured_text
    };
    Ok(ImportAssets {
        text,
        avatar,
        inferred_theme,
    })
}

fn pdf_font_scheme(document: &lopdf::Document, page_id: lopdf::ObjectId) -> Option<String> {
    document
        .get_page_fonts(page_id)
        .ok()?
        .values()
        .find_map(|font| {
            let name = font.get(b"BaseFont").ok()?.as_name().ok()?;
            infer_font_scheme(&String::from_utf8_lossy(name)).map(str::to_string)
        })
}

pub(crate) fn parse_pdf_assets(bytes: &[u8]) -> Result<ImportAssets, String> {
    let document = lopdf::Document::load_mem(bytes).map_err(|e| format!("PDF 读取失败: {}", e))?;
    let page_id = *document.get_pages().values().next().ok_or("PDF 没有页面")?;
    let mut images = Vec::new();
    for image in document
        .get_page_images(page_id)
        .map_err(|e| format!("PDF 图片读取失败: {}", e))?
    {
        let filters = image.filters.clone().unwrap_or_default();
        let bytes = if filters.iter().any(|filter| filter == "DCTDecode") {
            Some(image.content.to_vec())
        } else if filters.iter().any(|filter| filter == "FlateDecode") {
            let raw = document
                .get_object(image.id)
                .and_then(|object| object.as_stream())
                .and_then(|stream| stream.decompressed_content())
                .ok();
            raw.and_then(|raw| {
                if image.bits_per_component != Some(8) {
                    return None;
                }
                let width = image.width as u32;
                let height = image.height as u32;
                let dynamic = match image.color_space.as_deref() {
                    Some("DeviceGray") => image::GrayImage::from_raw(width, height, raw)
                        .map(image::DynamicImage::ImageLuma8),
                    Some("DeviceRGB") => image::RgbImage::from_raw(width, height, raw)
                        .map(image::DynamicImage::ImageRgb8),
                    _ => None,
                }?;
                let mut output = Cursor::new(Vec::new());
                dynamic
                    .write_to(&mut output, image::ImageFormat::Png)
                    .ok()?;
                Some(output.into_inner())
            })
        } else {
            None
        };
        if let Some(bytes) = bytes {
            images.push((image.width as u32, image.height as u32, bytes));
        }
    }
    let avatar = pick_avatar_candidate(images)
        .map(image_data_url)
        .transpose()?;
    let mut inferred_theme = json!({});
    if let Some(scheme) = pdf_font_scheme(&document, page_id) {
        inferred_theme["fontScheme"] = json!(scheme);
    }
    let text = pdf_extract::extract_text_from_mem(bytes)
        .map_err(|e| format!("PDF 文本读取失败: {}", e))?;
    Ok(ImportAssets {
        text,
        avatar,
        inferred_theme,
    })
}

pub(crate) fn extract_knowledge_text(filename: &str, bytes: &[u8]) -> Result<String, String> {
    let extension = filename
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" | "txt" => String::from_utf8(bytes.to_vec())
            .map_err(|error| format!("文本编码不是 UTF-8: {error}")),
        "pdf" => parse_pdf_assets(bytes).map(|assets| assets.text),
        "docx" => parse_docx_assets(bytes).map(|assets| assets.text),
        "png" | "jpg" | "jpeg" | "webp" => {
            image::guess_format(bytes).map_err(|error| format!("图片格式无法识别: {error}"))?;
            Ok(format!(
                "图片资料：{filename}（当前导入链路未启用 OCR，请结合图片内容补充摘要）"
            ))
        }
        _ => Err("知识库仅支持 Markdown、TXT、PDF、DOCX 和常见图片".into()),
    }
}

pub(crate) fn crop_avatar_from_box(
    parsed: &mut Value,
    bytes: &[u8],
) -> Result<Option<String>, String> {
    let box_value = parsed
        .get("sections")
        .and_then(Value::as_array)
        .and_then(|sections| {
            sections.iter().find(|section| {
                section.get("type").and_then(Value::as_str) == Some("personal_info")
            })
        })
        .and_then(|section| section.get("content"))
        .and_then(|content| content.get("avatarBox"))
        .and_then(Value::as_array);
    let Some(box_value) = box_value else {
        return Ok(None);
    };
    let values: Option<Vec<f32>> = box_value
        .iter()
        .map(Value::as_f64)
        .map(|value| value.map(|number| number as f32))
        .collect();
    let Some(values) = values else {
        return Ok(None);
    };
    if values.len() != 4 || values[2] <= 0.0 || values[3] <= 0.0 {
        return Ok(None);
    }
    let source = image::load_from_memory(bytes).map_err(|e| format!("图片读取失败: {}", e))?;
    let (width, height) = image::GenericImageView::dimensions(&source);
    let x = (values[0].clamp(0.0, 1.0) * width as f32) as u32;
    let y = (values[1].clamp(0.0, 1.0) * height as f32) as u32;
    let crop_width = (values[2].clamp(0.0, 1.0) * width as f32) as u32;
    let crop_height = (values[3].clamp(0.0, 1.0) * height as f32) as u32;
    if x >= width || y >= height || crop_width == 0 || crop_height == 0 {
        return Ok(None);
    }
    let crop = source.crop_imm(x, y, crop_width.min(width - x), crop_height.min(height - y));
    let mut output = Cursor::new(Vec::new());
    crop.write_to(&mut output, image::ImageFormat::Png)
        .map_err(|e| format!("头像裁剪失败: {}", e))?;
    Ok(Some(image_data_url(output.into_inner())?))
}

pub(crate) fn add_avatar(parsed: &mut Value, avatar: Option<String>) {
    let Some(avatar) = avatar else {
        return;
    };
    if let Some(section) = parsed
        .get_mut("sections")
        .and_then(Value::as_array_mut)
        .and_then(|sections| {
            sections.iter_mut().find(|section| {
                section.get("type").and_then(Value::as_str) == Some("personal_info")
            })
        })
    {
        section["content"]["avatar"] = json!(avatar);
    }
}

/// 视觉模型返回的 avatarBox 只用于裁剪，不属于简历数据，落库前删掉。
pub(crate) fn strip_avatar_box(parsed: &mut Value) {
    if let Some(sections) = parsed.get_mut("sections").and_then(Value::as_array_mut) {
        for section in sections {
            if let Some(content) = section.get_mut("content").and_then(Value::as_object_mut) {
                content.remove("avatarBox");
            }
        }
    }
}

pub(crate) fn persist_import(
    conn: &mut rusqlite::Connection,
    user_id: &str,
    parsed: &Value,
    language: &str,
    theme: &Value,
    target_resume_id: Option<&str>,
) -> Result<String, rusqlite::Error> {
    let title = parsed
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(if language == "zh" { "未命名简历" } else { "Untitled Resume" });
    let sections = parsed
        .get("sections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let tx = conn.transaction()?;
    let resume_id = if let Some(id) = target_resume_id {
        resume_repo::find_by_id(&tx, id, user_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        tx.execute(
            "DELETE FROM resume_sections WHERE resume_id = ?1",
            rusqlite::params![id],
        )?;
        resume_repo::update(&tx, id, user_id, title, None, None)?;
        id.to_string()
    } else {
        resume_repo::create(&tx, user_id, title, "classic", language, theme)?
    };
    for (index, section) in sections.iter().enumerate() {
        let section_type = section
            .get("type")
            .and_then(Value::as_str)
            .ok_or(rusqlite::Error::InvalidQuery)?;
        let section_title = section.get("title").and_then(Value::as_str).unwrap_or("");
        let content = section.get("content").cloned().unwrap_or_else(|| json!({}));
        resume_repo::create_section(
            &tx,
            &resume_id,
            section_type,
            section_title,
            index as i32,
            true,
            &content,
        )?;
    }
    tx.commit()?;
    Ok(resume_id)
}

#[cfg(test)]
mod import_tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
    use lopdf::{
        Document, Object, Stream,
        content::{Content, Operation},
        dictionary,
    };
    use std::io::Cursor;

    fn portrait() -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(120, 120, Rgb([80, 120, 160])));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Jpeg).unwrap();
        bytes.into_inner()
    }

    #[test]
    fn picks_the_largest_eligible_portrait() {
        let picked = pick_avatar_candidate(vec![
            (300, 1000, vec![1]),
            (120, 120, vec![2]),
            (240, 220, vec![3]),
        ]);
        assert_eq!(picked, Some(vec![3]));
    }

    #[test]
    fn crops_avatar_from_normalized_box() {
        let mut parsed = json!({"sections":[{"type":"personal_info","content":{"avatarBox":[0.1,0.1,0.5,0.5]}}]});
        let avatar = crop_avatar_from_box(&mut parsed, &portrait()).unwrap();
        assert!(avatar.is_some());
    }

    #[test]
    fn reads_programmatic_docx_text_and_avatar() {
        let image = portrait();
        let document = docx_rs::Docx::new()
            .add_paragraph(
                docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text("Jane Doe")),
            )
            .add_paragraph(
                docx_rs::Paragraph::new().add_run(docx_rs::Run::new().add_text("Said \"hi\"")),
            )
            .add_paragraph(docx_rs::Paragraph::new().add_run(
                docx_rs::Run::new().add_image(docx_rs::Pic::new(&image).size(1000000, 1000000)),
            ));
        let mut bytes = Cursor::new(Vec::new());
        document.build().pack(&mut bytes).unwrap();
        let assets = parse_docx_assets(&bytes.into_inner()).unwrap();
        assert!(assets.text.contains("Jane Doe"));
        assert!(assets.avatar.is_some());
        // 段落之间是真实换行，不是字面量 \n；引号还原为 "
        assert!(assets.text.contains("Jane Doe\nSaid \"hi\""), "{:?}", assets.text);
    }

    #[test]
    fn reads_programmatic_pdf_image_and_base_font() {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "SimSun",
        });
        let image_id = document.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject", "Subtype" => "Image", "Width" => 120, "Height" => 120,
                "ColorSpace" => "DeviceRGB", "BitsPerComponent" => 8, "Filter" => "DCTDecode",
            },
            portrait(),
        ));
        let resources_id = document.add_object(dictionary! {
            "Font" => dictionary! { "F1" => font_id },
            "XObject" => dictionary! { "Im1" => image_id },
        });
        let content = Content {
            operations: vec![Operation::new("Do", vec![Object::Name(b"Im1".to_vec())])],
        };
        let content_id =
            document.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page_id = document.add_object(dictionary! {
            "Type" => "Page", "Parent" => pages_id, "Resources" => resources_id, "Contents" => content_id,
            "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        });
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1,
            }),
        );
        let catalog_id =
            document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        document.trailer.set("Root", catalog_id);
        let mut bytes = Cursor::new(Vec::new());
        document.save_to(&mut bytes).unwrap();
        let assets = parse_pdf_assets(&bytes.into_inner()).unwrap();
        assert!(assets.avatar.is_some());
        assert_eq!(assets.inferred_theme["fontScheme"], "songti");
    }

    #[test]
    fn merges_inferred_theme_over_base_and_strips_avatar_box() {
        let merged = merge_theme(json!({"fontScheme":"yahei","fontSize":14}), &json!({"fontScheme":"songti"}));
        assert_eq!(merged, json!({"fontScheme":"songti","fontSize":14}));
        let mut parsed = json!({"sections":[{"type":"personal_info","content":{"avatarBox":[0,0,1,1],"fullName":"x"}}]});
        strip_avatar_box(&mut parsed);
        assert_eq!(parsed["sections"][0]["content"], json!({"fullName":"x"}));
    }

    #[test]
    fn import_transaction_rolls_back_invalid_section() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        let parsed = json!({"title":"测试","sections":[
            {"type":"summary","title":"简介","content":{"text":"ok"}},
            {"title":"坏模块","content":{}}
        ]});
        assert!(
            persist_import(
                &mut conn,
                "user",
                &parsed,
                "zh",
                &json!({"fontScheme":"yahei"}),
                None
            )
            .is_err()
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM resumes", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
