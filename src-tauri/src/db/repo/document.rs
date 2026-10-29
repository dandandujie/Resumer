//! 原 DOCX 是编辑和导出的事实来源。结构化模块仅保留本地提取文本供检索与 AI 使用。
use super::{resume, version};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Cursor, Read};

pub const TEMPLATE: &str = "original-docx";
pub const MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRef {
    pub filename: String,
    pub original_hash: String,
    pub current_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentData {
    pub filename: String,
    pub revision: i64,
    pub bytes: Vec<u8>,
}

pub fn reference(conn: &Connection, id: &str) -> rusqlite::Result<Option<DocumentRef>> {
    conn.query_row(
        "SELECT filename, original_hash, current_hash FROM resume_documents WHERE resume_id=?1",
        [id],
        |r| {
            Ok(DocumentRef {
                filename: r.get(0)?,
                original_hash: r.get(1)?,
                current_hash: r.get(2)?,
            })
        },
    )
    .optional()
}

pub fn get(conn: &Connection, id: &str, user_id: &str) -> rusqlite::Result<DocumentData> {
    conn.query_row("SELECT d.filename, d.revision, b.bytes FROM resume_documents d JOIN resumes r ON r.id=d.resume_id JOIN document_blobs b ON b.hash=d.current_hash WHERE r.id=?1 AND r.user_id=?2 AND r.template=?3", params![id,user_id,TEMPLATE], |r| {
        Ok(DocumentData { filename:r.get(0)?, revision:r.get(1)?, bytes:r.get(2)? })
    })
}

/// 先检查压缩体与展开大小，再读取正文，避免损坏文件或压缩炸弹进入持久化层。
pub fn validate(bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("DOCX 文件须小于 64 MB".into());
    }
    let mut zip =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "文件不是有效的 DOCX 压缩包")?;
    if zip.len() > 10000 {
        return Err("DOCX 内部文件数量超出限制".into());
    }
    let mut expanded = 0u64;
    for i in 0..zip.len() {
        let f = zip.by_index(i).map_err(|e| e.to_string())?;
        expanded = expanded.saturating_add(f.size());
        if expanded > 100 * 1024 * 1024 {
            return Err("DOCX 展开大小超出 100 MB 限制".into());
        }
    }
    for required in ["[Content_Types].xml", "_rels/.rels"] {
        zip.by_name(required)
            .map_err(|_| format!("DOCX 缺少 {required}"))?;
    }
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|_| "DOCX 缺少正文")?
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    validate_main_xml(&xml)?;
    Ok(crate::import::docx_text(&xml))
}

/// ZIP 合法不代表正文可读；损坏的 XML 不得覆盖上一个可恢复版本。
fn validate_main_xml(xml: &str) -> Result<(), String> {
    use quick_xml::{NsReader, events::Event, name::ResolveResult};
    let mut reader = NsReader::from_str(xml);
    let mut depth = 0usize;
    let mut roots = 0usize;
    let mut body = false;
    loop {
        let (namespace, event) = reader
            .read_resolved_event()
            .map_err(|e| format!("DOCX 正文 XML 损坏：{e}"))?;
        match event {
            Event::Start(ref element) | Event::Empty(ref element) => {
                let is_word = matches!(namespace, ResolveResult::Bound(ns) if ns.as_ref() == b"http://schemas.openxmlformats.org/wordprocessingml/2006/main");
                if depth == 0 {
                    roots += 1;
                    if roots != 1 || !is_word || element.local_name().as_ref() != b"document" {
                        return Err("DOCX 正文根元素无效".into());
                    }
                }
                if depth == 1 && is_word && element.local_name().as_ref() == b"body" {
                    body = true;
                }
                if matches!(event, Event::Start(_)) {
                    depth += 1;
                }
            }
            Event::End(_) => {
                depth = depth.checked_sub(1).ok_or("DOCX 正文元素未配对")?;
            }
            Event::DocType(_) => return Err("DOCX 正文不允许 DTD".into()),
            Event::Text(ref text) if depth == 0 && !text.iter().all(u8::is_ascii_whitespace) => {
                return Err("DOCX 正文根元素外存在内容".into());
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if depth != 0 || roots != 1 || !body {
        return Err("DOCX 正文不完整".into());
    }
    Ok(())
}

fn store_blob(conn: &Connection, bytes: &[u8]) -> rusqlite::Result<String> {
    let hash = format!("{:x}", Sha256::digest(bytes));
    conn.execute(
        "INSERT OR IGNORE INTO document_blobs(hash,bytes) VALUES (?1,?2)",
        params![hash, bytes],
    )?;
    Ok(hash)
}

fn sync_text(conn: &Connection, id: &str, text: &str) -> rusqlite::Result<()> {
    let section_id = format!("{id}-document-text");
    let content = serde_json::json!({"text":text});
    conn.execute("DELETE FROM resume_sections WHERE resume_id=?1", [id])?;
    resume::create_section_with_id(
        conn,
        &section_id,
        id,
        "summary",
        "原文档正文",
        0,
        true,
        &content,
    )?;
    Ok(())
}

pub fn import(
    conn: &mut Connection,
    user: &str,
    filename: &str,
    bytes: &[u8],
    target: Option<&str>,
) -> Result<String, String> {
    let text = validate(bytes)?;
    let filename = filename.rsplit(['/', '\\']).next().unwrap_or("简历.docx");
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let result = (|| -> rusqlite::Result<String> {
        let id = if let Some(id) = target {
            resume::find_by_id(&tx,id,user)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            version::create_snapshot(&tx,id,user,"restore","导入原文档前",None)?;
            resume::update(&tx,id,user,filename.strip_suffix(".docx").unwrap_or(filename),Some(TEMPLATE),None)?;
            id.to_owned()
        } else {
            resume::create(&tx,user,filename.strip_suffix(".docx").unwrap_or(filename),TEMPLATE,"zh",&serde_json::json!({}))?
        };
        let hash = store_blob(&tx,bytes)?;
        tx.execute("INSERT INTO resume_documents(resume_id,filename,original_hash,current_hash) VALUES (?1,?2,?3,?3) ON CONFLICT(resume_id) DO UPDATE SET filename=excluded.filename,original_hash=excluded.original_hash,current_hash=excluded.current_hash,revision=resume_documents.revision+1",params![id,filename,hash])?;
        sync_text(&tx,&id,&text)?;
        version::create_snapshot(&tx,&id,user,"save","导入原文档",None)?;
        Ok(id)
    })().map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn save(
    conn: &mut Connection,
    id: &str,
    user: &str,
    revision: i64,
    bytes: &[u8],
) -> Result<i64, String> {
    let text = validate(bytes)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let current = get(&tx, id, user).map_err(|e| e.to_string())?;
    if current.revision != revision {
        return Err("文档已在其他窗口更新，请先另存当前修改，再重新打开。".into());
    }
    if current.bytes == bytes {
        return Ok(revision);
    }
    let hash = store_blob(&tx, bytes).map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE resume_documents SET current_hash=?2,revision=revision+1 WHERE resume_id=?1",
        params![id, hash],
    )
    .map_err(|e| e.to_string())?;
    sync_text(&tx, id, &text).map_err(|e| e.to_string())?;
    version::create_snapshot(&tx, id, user, "save", "", Some(version::SAVE_COALESCE_SECS))
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(revision + 1)
}

/// 恢复引用时仍增加 revision，阻止恢复前尚未完成的编辑请求覆盖历史版本。
pub fn restore(conn: &Connection, id: &str, reference: &DocumentRef) -> rusqlite::Result<()> {
    conn.execute("INSERT INTO resume_documents(resume_id,filename,original_hash,current_hash) VALUES (?1,?2,?3,?4) ON CONFLICT(resume_id) DO UPDATE SET filename=excluded.filename,original_hash=excluded.original_hash,current_hash=excluded.current_hash,revision=resume_documents.revision+1",params![id,reference.filename,reference.original_hash,reference.current_hash])?;
    Ok(())
}

/// 删除简历后清理已无当前文档、导入原件或历史版本引用的内容。
pub fn prune_unreferenced(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM document_blobs WHERE hash NOT IN (
        SELECT current_hash FROM resume_documents UNION SELECT original_hash FROM resume_documents
        UNION SELECT json_extract(snapshot,'$.originalDocument.currentHash') FROM resume_versions WHERE json_extract(snapshot,'$.originalDocument.currentHash') IS NOT NULL
        UNION SELECT json_extract(snapshot,'$.originalDocument.originalHash') FROM resume_versions WHERE json_extract(snapshot,'$.originalDocument.originalHash') IS NOT NULL
    )", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    const FIXTURE: &[u8] = include_bytes!("../../../../scripts/fixtures/original-document.docx");

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO users(id,fingerprint,settings) VALUES('u','u','{}')",
            [],
        )
        .unwrap();
        conn
    }

    fn edited() -> Vec<u8> {
        let mut input = zip::ZipArchive::new(Cursor::new(FIXTURE)).unwrap();
        let mut output = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for i in 0..input.len() {
            let mut file = input.by_index(i).unwrap();
            let mut data = Vec::new();
            file.read_to_end(&mut data).unwrap();
            if file.name() == "word/document.xml" {
                data = String::from_utf8(data)
                    .unwrap()
                    .replace("2026-09-01", "2026-10-02")
                    .into_bytes();
            }
            output
                .start_file(file.name(), zip::write::FileOptions::default())
                .unwrap();
            output.write_all(&data).unwrap();
        }
        output.finish().unwrap().into_inner()
    }

    #[test]
    fn import_edit_reopen_duplicate_restore_and_conflict() {
        let mut conn = setup();
        let id = import(&mut conn, "u", "原文件.docx", FIXTURE, None).unwrap();
        assert_eq!(
            get(&conn, &id, "u").unwrap().bytes,
            FIXTURE,
            "未编辑保留原始字节"
        );
        assert!(get(&conn, &id, "another-user").is_err());
        let applied = version::create_snapshot(&conn, &id, "u", "apply", "投递版", None)
            .unwrap()
            .unwrap();
        let edit = edited();
        assert_eq!(save(&mut conn, &id, "u", 1, &edit).unwrap(), 2);
        assert_eq!(get(&conn, &id, "u").unwrap().bytes, edit);
        assert!(
            save(&mut conn, &id, "u", 1, FIXTURE).is_err(),
            "旧请求不能覆盖新文档"
        );
        let copied = resume::duplicate(&conn, &id, "u").unwrap();
        assert_eq!(get(&conn, &copied, "u").unwrap().bytes, edit);
        let historical = version::find(&conn, &applied, "u").unwrap().unwrap();
        version::restore(&conn, &historical, "u").unwrap();
        let restored = get(&conn, &id, "u").unwrap();
        assert_eq!(restored.bytes, FIXTURE);
        assert!(restored.revision > 2, "恢复使旧请求失效");
        assert_eq!(get(&conn, &copied, "u").unwrap().bytes, edit, "副本独立");
        assert!(
            resume::find_by_id(&conn, &id, "u")
                .unwrap()
                .unwrap()
                .sections[0]
                .content["text"]
                .as_str()
                .unwrap()
                .contains("2026-09-01")
        );
        resume::delete(&conn, &id, "u").unwrap();
        assert!(reference(&conn, &id).unwrap().is_none());
        assert_eq!(get(&conn, &copied, "u").unwrap().bytes, edit);
        resume::delete(&conn, &copied, "u").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM document_blobs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0, "最后的简历与版本删除后，不遗留原件二进制");
    }

    #[test]
    fn invalid_import_and_save_leave_previous_document_intact() {
        let mut conn = setup();
        let id = import(&mut conn, "u", "原文件.docx", FIXTURE, None).unwrap();
        assert!(import(&mut conn, "u", "坏文件.docx", b"not a zip", Some(&id)).is_err());
        assert!(save(&mut conn, &id, "u", 1, b"not a zip").is_err());
        assert_eq!(get(&conn, &id, "u").unwrap().bytes, FIXTURE);
        assert_eq!(get(&conn, &id, "u").unwrap().revision, 1);
    }

    #[test]
    fn malformed_main_xml_is_rejected() {
        let ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        assert!(
            validate_main_xml(&format!(
                r#"<w:document xmlns:w="{ns}"><w:body/></w:document>"#
            ))
            .is_ok()
        );
        for xml in [
            "",
            "<html/>",
            "<document><body/></document>",
            &format!(r#"<w:document xmlns:w="{ns}"><w:body>"#),
            &format!(r#"<w:document xmlns:w="{ns}"><w:body/></w:document><extra/>"#),
            &format!(r#"<!DOCTYPE document><w:document xmlns:w="{ns}"><w:body/></w:document>"#),
        ] {
            assert!(validate_main_xml(xml).is_err(), "不得接受损坏正文: {xml}");
        }
    }

    #[test]
    fn replace_structured_resume_and_restore_both_modes() {
        let mut conn = setup();
        let id = resume::create(
            &conn,
            "u",
            "结构化简历",
            "classic",
            "zh",
            &serde_json::json!({}),
        )
        .unwrap();
        let original = version::create_snapshot(&conn, &id, "u", "save", "结构化原版", None)
            .unwrap()
            .unwrap();
        import(&mut conn, "u", "原文件.docx", FIXTURE, Some(&id)).unwrap();
        let doc_version = version::create_snapshot(&conn, &id, "u", "apply", "原文档投递", None)
            .unwrap()
            .unwrap();
        let structured = version::find(&conn, &original, "u").unwrap().unwrap();
        version::restore(&conn, &structured, "u").unwrap();
        assert!(get(&conn, &id, "u").is_err());
        assert!(
            save(&mut conn, &id, "u", 1, &edited()).is_err(),
            "旧原文档保存不能覆盖结构化恢复"
        );
        let doc = version::find(&conn, &doc_version, "u").unwrap().unwrap();
        version::restore(&conn, &doc, "u").unwrap();
        assert_eq!(get(&conn, &id, "u").unwrap().bytes, FIXTURE);
        assert!(
            save(&mut conn, &id, "u", 1, &edited()).is_err(),
            "跨模式恢复不能复用旧窗口的 revision"
        );
    }
}
