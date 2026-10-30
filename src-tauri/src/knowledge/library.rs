//! 资料集保存原件、完整解析文本与可检索分块。Skill 单独存储，只读取资料而不执行脚本。
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::{Cursor, Read},
    path::Path,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub title: String,
    pub purpose: String,
    pub category: String,
    pub tags: Vec<String>,
    pub kind: String,
    pub enabled: bool,
    pub asset_count: i64,
    pub ready_count: i64,
    pub updated_at: i64,
}
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub collection_id: String,
    pub filename: String,
    pub extension: String,
    pub status: String,
    pub error: String,
    pub characters: i64,
}
pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "wav", "mp4", "webm", "ogg", "flac"];
pub fn is_audio(filename: &str) -> bool {
    AUDIO_EXTENSIONS.contains(
        &filename
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
    )
}
pub fn file_limit(filename: &str) -> usize {
    if is_audio(filename) {
        250 * 1024 * 1024
    } else {
        30 * 1024 * 1024
    }
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn normalize_tags(tags: &[String]) -> Result<Vec<String>, String> {
    if tags.len() > 50 {
        return Err("每个资料集最多50个标签".into());
    }
    let mut out = Vec::new();
    let mut keys = std::collections::HashSet::new();
    for tag in tags {
        let tag = tag.trim().trim_start_matches('#').trim();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > 80 || tag.contains(['\n', '\r']) {
            return Err("标签应为1–80字的单行文字".into());
        }
        if keys.insert(tag.to_lowercase()) {
            out.push(tag.to_owned())
        }
    }
    Ok(out)
}
pub fn collection_tags(conn: &Connection, id: &str) -> Result<Vec<String>, String> {
    conn.prepare("SELECT tag FROM knowledge_collection_tags WHERE collection_id=?1 ORDER BY rowid")
        .map_err(err)?
        .query_map([id], |r| r.get(0))
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)
}
pub fn collections(conn: &Connection, ai: bool) -> Result<Vec<Collection>, String> {
    let mut rows=conn.prepare("SELECT c.id,c.title,c.purpose,c.category,c.kind,c.enabled,COUNT(a.id),COALESCE(SUM(a.status='ready'),0),c.updated_at
 FROM knowledge_collections c LEFT JOIN knowledge_assets a ON a.collection_id=c.id
 WHERE (?1=0 OR c.enabled=1) GROUP BY c.id ORDER BY c.updated_at DESC,c.rowid DESC").map_err(err)?
 .query_map([ai],|r|Ok(Collection{id:r.get(0)?,title:r.get(1)?,purpose:r.get(2)?,category:r.get(3)?,tags:vec![],kind:r.get(4)?,enabled:r.get(5)?,asset_count:r.get(6)?,ready_count:r.get(7)?,updated_at:r.get(8)?})).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    for row in &mut rows {
        row.tags = collection_tags(conn, &row.id)?
    }
    Ok(rows)
}
#[cfg(test)]
pub fn put_collection(
    conn: &Connection,
    id: Option<&str>,
    title: &str,
    purpose: &str,
    category: &str,
    kind: &str,
    enabled: bool,
) -> Result<String, String> {
    put_collection_tags(
        conn,
        id,
        title,
        purpose,
        category,
        kind,
        enabled,
        Some(&if category.trim().is_empty() {
            vec![]
        } else {
            vec![category.to_string()]
        }),
    )
}
pub fn put_collection_tags(
    conn: &Connection,
    id: Option<&str>,
    title: &str,
    purpose: &str,
    category: &str,
    kind: &str,
    enabled: bool,
    tags: Option<&[String]>,
) -> Result<String, String> {
    if title.trim().is_empty() || title.chars().count() > 120 {
        return Err("请填写 1–120 字的资料集名称".into());
    }
    if !matches!(kind, "document" | "skill") {
        return Err("资料集类型无效".into());
    }
    if purpose.chars().count() > 2000 || category.chars().count() > 80 {
        return Err("用途或分类过长".into());
    }
    let id = id
        .map(String::from)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    // 类型决定存储位置，已有资料集不能在两种类型之间切换。
    if let Some(old) = conn
        .query_row(
            "SELECT kind FROM knowledge_collections WHERE id=?1",
            [&id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(err)?
        && old != kind
    {
        return Err("不能更改资料集类型".into());
    }
    let tags = match tags {
        Some(tags) => normalize_tags(tags)?,
        None => {
            let existing = collection_tags(conn, &id)?;
            if existing.is_empty()
                && !category.trim().is_empty()
                && conn
                    .query_row(
                        "SELECT COUNT(*) FROM knowledge_collections WHERE id=?1",
                        [&id],
                        |r| r.get::<_, i64>(0),
                    )
                    .map_err(err)?
                    == 0
            {
                normalize_tags(&[category.into()])?
            } else {
                existing
            }
        }
    };
    // 单分类字段仅为旧接口保留镜像，所有新筛选与目录使用规范化标签表。
    let tx = conn.unchecked_transaction().map_err(err)?;
    tx.execute("INSERT INTO knowledge_collections(id,title,purpose,category,kind,enabled) VALUES (?1,?2,?3,?4,?5,?6)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,purpose=excluded.purpose,category=excluded.category,enabled=excluded.enabled,updated_at=unixepoch()",
 params![id,title.trim(),purpose.trim(),tags.first().map(String::as_str).unwrap_or(""),kind,enabled]).map_err(err)?;
    tx.execute(
        "DELETE FROM knowledge_collection_tags WHERE collection_id=?1",
        [&id],
    )
    .map_err(err)?;
    for tag in &tags {
        tx.execute(
            "INSERT INTO knowledge_collection_tags(collection_id,tag) VALUES(?1,?2)",
            params![id, tag],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)?;
    Ok(id)
}
pub fn assets(conn: &Connection, id: &str) -> Result<Vec<Asset>, String> {
    conn.prepare("SELECT id,collection_id,filename,extension,status,error,length(text) FROM knowledge_assets WHERE collection_id=?1 ORDER BY created_at,rowid").map_err(err)?
 .query_map([id],|r|Ok(Asset{id:r.get(0)?,collection_id:r.get(1)?,filename:r.get(2)?,extension:r.get(3)?,status:r.get(4)?,error:r.get(5)?,characters:r.get(6)?})).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)
}
pub fn decode(bytes: &[u8]) -> Result<String, String> {
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let codec = if bytes[0] == 0xff {
            encoding_rs::UTF_16LE
        } else {
            encoding_rs::UTF_16BE
        };
        let (text, _, bad) = codec.decode(bytes);
        if bad {
            return Err("文本编码损坏".into());
        }
        return Ok(text.into_owned());
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.trim_start_matches('\u{feff}').to_owned());
    }
    let (text, _, bad) = encoding_rs::GB18030.decode(bytes);
    if bad {
        Err("请将文件另存为 UTF-8 后重试".into())
    } else {
        Ok(text.into_owned())
    }
}
pub fn parse(filename: &str, bytes: &[u8]) -> Result<String, String> {
    let ext = filename
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let text = match ext.as_str() {
        "md" | "txt" => decode(bytes)?,
        "csv" => {
            let text = decode(bytes)?;
            let mut reader = csv::ReaderBuilder::new()
                .has_headers(false)
                .from_reader(text.as_bytes());
            let mut output = String::new();
            for (i, row) in reader.records().enumerate() {
                let row = row.map_err(|e| format!("CSV 第 {} 行：{e}", i + 1))?;
                output.push_str(&format!(
                    "行 {}：{}\n",
                    i + 1,
                    row.iter().collect::<Vec<_>>().join(" | ")
                ));
            }
            output
        }
        "xlsx" => {
            use calamine::Reader;
            let mut workbook: calamine::Xlsx<_> =
                calamine::open_workbook_from_rs(Cursor::new(bytes.to_vec())).map_err(err)?;
            let mut output = String::new();
            for name in workbook.sheet_names().to_vec() {
                let range = workbook.worksheet_range(&name).map_err(err)?;
                if range.get_size().0.saturating_mul(range.get_size().1) > 1_000_000 {
                    return Err(format!("工作表 {name} 超过一百万单元格，请拆分后导入"));
                }
                output.push_str(&format!("\n工作表：{name}\n"));
                for (i, row) in range.rows().enumerate() {
                    output.push_str(&format!(
                        "行 {}：{}\n",
                        i + 1,
                        row.iter()
                            .map(ToString::to_string)
                            .collect::<Vec<_>>()
                            .join(" | ")
                    ));
                }
            }
            output
        }
        "pdf" | "docx" => crate::import::extract_knowledge_text(filename, bytes)?,
        _ => return Err("支持 PDF、DOCX、CSV、XLSX、MD、TXT".into()),
    };
    if text.chars().count() > 5_000_000 {
        return Err("解析文本超过五百万字，请拆分文件后重试，避免遗漏内容".into());
    }
    Ok(text)
}
fn skill_text(bytes: &[u8], filename: &str, dir: &Path) -> Result<String, String> {
    if filename.eq_ignore_ascii_case("skill.md") {
        return decode(bytes);
    }
    if !filename.to_lowercase().ends_with(".zip") {
        return Err("Skill 请上传 SKILL.md 或包含它的 ZIP 包".into());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(err)?;
    if zip.len() > 500 {
        return Err("Skill 包最多支持 500 个文件".into());
    }
    let mut total = 0u64;
    let mut files = Vec::new();
    let mut has_entry = false;
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(err)?;
        let path = entry
            .enclosed_name()
            .ok_or("Skill 包包含不安全的文件路径")?
            .to_path_buf();
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            return Err("Skill 包不能包含符号链接".into());
        }
        if entry.is_dir() {
            continue;
        }
        total = total.saturating_add(entry.size());
        if total > 50 * 1024 * 1024 {
            return Err("Skill 包解压后不能超过 50 MB".into());
        }
        let mut data = Vec::new();
        entry
            .take(50 * 1024 * 1024 + 1)
            .read_to_end(&mut data)
            .map_err(err)?;
        if path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("SKILL.md"))
        {
            has_entry = true;
        }
        files.push((path, data));
    }
    if !has_entry {
        return Err("Skill 包内没有 SKILL.md".into());
    }
    let mut output = String::new();
    files.sort_by_key(|(path, _)| {
        !path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("SKILL.md"))
    });
    for (path, data) in files {
        let target = dir.join("package").join(&path);
        std::fs::create_dir_all(target.parent().unwrap()).map_err(err)?;
        std::fs::write(target, &data).map_err(err)?;
        let name = path.to_string_lossy();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        // 引用资料与脚本文本可供模型阅读，上传的脚本不会被执行。
        let text = if matches!(
            ext.as_str(),
            "md" | "txt" | "json" | "yaml" | "yml" | "py" | "js" | "sh"
        ) {
            decode(&data).ok()
        } else {
            parse(&name, &data).ok()
        };
        output.push_str(&format!(
            "\n## 文件：{name}\n{}\n",
            text.unwrap_or_else(|| "[二进制资源，原件已保存]".into())
        ));
    }
    if output.chars().count() > 5_000_000 {
        return Err("Skill 文本过大，请拆分".into());
    }
    Ok(output)
}
pub fn import(
    conn: &mut Connection,
    root: &Path,
    collection_id: &str,
    filename: &str,
    bytes: &[u8],
) -> Result<Asset, String> {
    if bytes.len() > file_limit(filename) {
        return Err("文档最大30 MB，录音最大250 MB".into());
    }
    let kind: String = conn
        .query_row(
            "SELECT kind FROM knowledge_collections WHERE id=?1",
            [collection_id],
            |r| r.get(0),
        )
        .map_err(err)?;
    let hash = format!("{:x}", Sha256::digest(bytes));
    let previous_id: Option<String> = conn
        .query_row(
            "SELECT id FROM knowledge_assets WHERE collection_id=?1 AND sha256=?2",
            params![collection_id, hash],
            |r| r.get(0),
        )
        .optional()
        .map_err(err)?;
    let previous = if let Some(id) = previous_id {
        assets(conn, collection_id)?
            .into_iter()
            .find(|asset| asset.id == id)
    } else {
        None
    };
    if let Some(asset) = &previous
        && (asset.status == "ready" || is_audio(filename))
    {
        return Ok(asset.clone());
    }
    let filename = previous
        .as_ref()
        .map(|asset| asset.filename.as_str())
        .unwrap_or(filename);
    let clean = Path::new(filename)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .ok_or("文件名无效")?;
    let ext = clean.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if kind == "document"
        && !matches!(ext.as_str(), "pdf" | "docx" | "csv" | "xlsx" | "md" | "txt")
        && !is_audio(clean)
    {
        return Err("此资料集支持 PDF、DOCX、CSV、XLSX、MD、TXT及录音；Skill 请单独上传".into());
    }
    let id = previous
        .as_ref()
        .map(|asset| asset.id.clone())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let relative = format!(
        "{}/{collection_id}/{id}",
        if kind == "skill" {
            "skills"
        } else {
            "materials"
        }
    );
    let dir = root.join(&relative);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.join(clean);
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let original_write =
        std::fs::write(&temporary, bytes).and_then(|_| std::fs::rename(&temporary, &path));
    if let Err(e) = original_write {
        let _ = std::fs::remove_file(&temporary);
        if previous.is_none() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        return Err(err(e));
    }
    let parsed = if is_audio(clean) {
        Ok(String::new())
    } else if kind == "skill" {
        skill_text(bytes, clean, &dir)
    } else {
        parse(clean, bytes)
    };
    let (text, status, error) = match parsed {
        Ok(text) if is_audio(clean) => (text, "needs_transcription", String::new()),
        Ok(text) if text.trim().is_empty() => (
            text,
            "needs_ocr",
            "未提取到文本，请上传可复制文字的文件或先进行 OCR".to_owned(),
        ),
        Ok(text) => (text, "ready", String::new()),
        Err(error) => (String::new(), "error", error),
    };
    let result = (|| {
        let tx = conn.transaction().map_err(err)?;
        tx.execute("INSERT INTO knowledge_assets(id,collection_id,filename,extension,storage_path,sha256,status,text,error) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET status=excluded.status,text=excluded.text,error=excluded.error",params![id,collection_id,clean,ext,format!("{relative}/{clean}"),hash,status,text,error]).map_err(err)?;
        tx.execute("DELETE FROM knowledge_chunks WHERE asset_id=?1", [&id])
            .map_err(err)?;
        let chars: Vec<char> = text.chars().collect();
        let mut start = 0;
        while start < chars.len() {
            let end = (start + 2000).min(chars.len());
            let body: String = chars[start..end].iter().collect();
            tx.execute(
                "INSERT INTO knowledge_chunks(asset_id,position,title,body) VALUES (?1,?2,?3,?4)",
                params![id, start as i64, clean, body],
            )
            .map_err(err)?;
            if end == chars.len() {
                break;
            }
            start = end - 200;
        }
        tx.execute(
            "UPDATE knowledge_collections SET updated_at=unixepoch() WHERE id=?1",
            [collection_id],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    })();
    if let Err(error) = result {
        if previous.is_none() {
            let _ = std::fs::remove_dir_all(dir);
        }
        return Err(error);
    }
    Ok(Asset {
        id,
        collection_id: collection_id.into(),
        filename: clean.into(),
        extension: ext,
        status: status.into(),
        error,
        characters: text.chars().count() as i64,
    })
}
pub fn read(
    conn: &Connection,
    id: &str,
    offset: usize,
    limit: usize,
    ai: bool,
) -> Result<Value, String> {
    let (filename,text,status,error):(String,String,String,String)=conn.query_row("SELECT a.filename,a.text,a.status,a.error FROM knowledge_assets a JOIN knowledge_collections c ON c.id=a.collection_id WHERE a.id=?1 AND (?2=0 OR c.enabled=1)",params![id,ai],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(err)?;
    let total = text.chars().count();
    let offset = offset.min(total);
    let limit = limit.clamp(1, 12000);
    let content: String = text.chars().skip(offset).take(limit).collect();
    let next = offset + content.chars().count();
    Ok(
        json!({"assetId":id,"filename":filename,"status":status,"error":error,"content":content,"offset":offset,"total":total,"nextOffset":if next<total{Some(next)}else{None}}),
    )
}
pub fn search(
    conn: &Connection,
    query: &str,
    collection: Option<&str>,
    category: Option<&str>,
    kind: Option<&str>,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let tags = category
        .filter(|s| !s.is_empty())
        .map(|s| vec![s.to_owned()])
        .unwrap_or_default();
    search_tagged(
        conn,
        query,
        collection,
        &tags,
        "all",
        category == Some(""),
        kind,
        limit,
    )
}
pub fn search_tagged(
    conn: &Connection,
    query: &str,
    collection: Option<&str>,
    tags: &[String],
    tag_match: &str,
    untagged: bool,
    kind: Option<&str>,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let tags = normalize_tags(tags)?;
    if !matches!(tag_match, "all" | "any") {
        return Err("标签匹配方式无效".into());
    }
    let terms: Vec<_> = query
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .take(12)
        .collect();
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let mut args: Vec<rusqlite::types::Value> = vec![
        collection.map(String::from).into(),
        kind.map(String::from).into(),
        serde_json::to_string(&tags).map_err(err)?.into(),
        tag_match.to_string().into(),
        (untagged as i64).into(),
    ];
    let mut predicates = Vec::new();
    for term in &terms {
        let like = format!(
            "%{}%",
            term.replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        // 长词走 trigram 索引，中文双字公司名等短词用参数化 LIKE 兜底。
        let body = if term.chars().count() >= 3 {
            args.push(format!("\"{}\"", term.replace('"', "\"\"")).into());
            "k.rowid IN (SELECT rowid FROM knowledge_chunks WHERE knowledge_chunks MATCH ?)"
        } else {
            args.push(like.clone().into());
            "k.body LIKE ? ESCAPE '\\'"
        };
        predicates.push(format!("({body} OR c.title LIKE ? ESCAPE '\\' OR a.filename LIKE ? ESCAPE '\\' OR c.purpose LIKE ? ESCAPE '\\')"));
        for _ in 0..3 {
            args.push(like.clone().into());
        }
    }
    let predicate = predicates.join(" OR ");
    let sql=format!("SELECT a.id,a.filename,c.id,c.title,c.category,c.kind,k.position,k.body,(SELECT json_group_array(tag) FROM knowledge_collection_tags WHERE collection_id=c.id) FROM knowledge_chunks k JOIN knowledge_assets a ON a.id=k.asset_id JOIN knowledge_collections c ON c.id=a.collection_id
 WHERE c.enabled=1 AND a.status='ready' AND (?1 IS NULL OR c.id=?1) AND (?2 IS NULL OR c.kind=?2)
 AND (?5=0 OR NOT EXISTS(SELECT 1 FROM knowledge_collection_tags ut WHERE ut.collection_id=c.id))
 AND (json_array_length(?3)=0 OR (?4='any' AND EXISTS(SELECT 1 FROM knowledge_collection_tags t JOIN json_each(?3) j ON t.tag=j.value COLLATE NOCASE WHERE t.collection_id=c.id))
 OR (?4='all' AND NOT EXISTS(SELECT 1 FROM json_each(?3) j WHERE NOT EXISTS(SELECT 1 FROM knowledge_collection_tags t WHERE t.collection_id=c.id AND t.tag=j.value COLLATE NOCASE)))) AND ({predicate}) ORDER BY c.updated_at DESC,k.position LIMIT ?");
    args.push((limit.clamp(1, 20) as i64).into());
    conn.prepare(&sql).map_err(err)?.query_map(rusqlite::params_from_iter(args),|r|Ok(json!({"assetId":r.get::<_,String>(0)?,"filename":r.get::<_,String>(1)?,"collectionId":r.get::<_,String>(2)?,"collection":r.get::<_,String>(3)?,"category":r.get::<_,String>(4)?,"kind":r.get::<_,String>(5)?,"offset":r.get::<_,i64>(6)?,"excerpt":r.get::<_,String>(7)?,"tags":serde_json::from_str::<Vec<String>>(&r.get::<_,String>(8)?).unwrap_or_default()}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)
}
pub fn catalog(conn: &Connection) -> Result<String, String> {
    let mut items = collections(conn, true)?;
    let total = items.len();
    items.truncate(40);
    for item in &mut items {
        item.purpose = item.purpose.chars().take(200).collect();
    }
    serde_json::to_string(
        &json!({"total":total,"preview":items,"more":"使用 listKnowledgeCollections 查看完整目录"}),
    )
    .map_err(err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn setup() -> (Connection, std::path::PathBuf, String) {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        let root =
            std::env::temp_dir().join(format!("resumer-library-test-{}", uuid::Uuid::new_v4()));
        let id = put_collection(
            &conn,
            None,
            "星河面试",
            "准备系统设计与算法面试",
            "目标公司",
            "document",
            true,
        )
        .unwrap();
        (conn, root, id)
    }
    fn package(files: &[(&str, &str)]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, text) in files {
            zip.start_file(*name, zip::write::FileOptions::default())
                .unwrap();
            zip.write_all(text.as_bytes()).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }
    #[test]
    fn full_text_batch_dedup_and_paged_read() {
        let (mut conn, root, id) = setup();
        let text = format!("{}唯一尾部考点Rust所有权", "开头资料".repeat(2000));
        let first = import(&mut conn, &root, &id, "面经.md", text.as_bytes()).unwrap();
        assert_eq!(first.status, "ready");
        let again = import(&mut conn, &root, &id, "同内容另一名字.md", text.as_bytes()).unwrap();
        assert_eq!(first.id, again.id);
        let csv = import(
            &mut conn,
            &root,
            &id,
            "题目.csv",
            "题目,难度\n动态规划,困难\n".as_bytes(),
        )
        .unwrap();
        assert_eq!(csv.status, "ready");
        assert_eq!(collections(&conn, false).unwrap()[0].asset_count, 2);
        let hits = search(
            &conn,
            "唯一尾部考点",
            None,
            Some("目标公司"),
            Some("document"),
            5,
        )
        .unwrap();
        assert!(!hits.is_empty());
        assert!(
            hits.iter()
                .any(|hit| hit["excerpt"].as_str().unwrap().contains("Rust所有权"))
        );
        let read = read(&conn, &first.id, 6000, 6000, true).unwrap();
        assert!(read["content"].as_str().unwrap().contains("唯一尾部考点"));
        assert_eq!(read["nextOffset"], Value::Null);
        assert!(
            search(&conn, "不存在", None, None, None, 5)
                .unwrap()
                .is_empty()
        );
        assert!(search(&conn, "%", None, None, None, 5).unwrap().is_empty());
        assert!(root.join("materials").join(&id).exists());
        let _ = std::fs::remove_dir_all(root);
    }
    #[test]
    fn xlsx_all_sheets_and_chinese_encoding() {
        let data = package(&[
            (
                "[Content_Types].xml",
                r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>"#,
            ),
            (
                "_rels/.rels",
                r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#,
            ),
            (
                "xl/workbook.xml",
                r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="笔试" sheetId="1" r:id="rId1"/><sheet name="面试" sheetId="2" r:id="rId2"/></sheets></workbook>"#,
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>"#,
            ),
            (
                "xl/worksheets/sheet1.xml",
                r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>动态规划</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>"#,
            ),
            (
                "xl/worksheets/sheet2.xml",
                r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>系统设计</t></is></c></row></sheetData></worksheet>"#,
            ),
        ]);
        let result = parse("题库.xlsx", &data).unwrap();
        assert!(result.contains("工作表：笔试"));
        assert!(result.contains("工作表：面试"));
        assert!(result.contains("动态规划 | 42"));
        assert!(result.contains("系统设计"));
        let (data, _, _) = encoding_rs::GBK.encode("公司,题目\n腾讯,并发\n");
        assert!(parse("中文.csv", &data).unwrap().contains("腾讯 | 并发"));
        assert!(parse("坏表格.xlsx", b"not-xlsx").is_err());
    }
    #[test]
    fn skill_is_separate_and_disabled_is_inaccessible_to_ai() {
        let (mut conn, root, _) = setup();
        let id = put_collection(
            &conn,
            None,
            "面试教练",
            "指导行为面试",
            "教练",
            "skill",
            true,
        )
        .unwrap();
        let data = package(&[
            (
                "coach/SKILL.md",
                "---\nname: coach\n---\n先读 references/questions.md",
            ),
            (
                "coach/references/questions.md",
                "行为面试考点：用事实讲结果",
            ),
        ]);
        let asset = import(&mut conn, &root, &id, "coach.zip", &data).unwrap();
        assert_eq!(asset.status, "ready");
        assert!(root.join("skills").join(&id).exists());
        assert!(
            read(&conn, &asset.id, 0, 12000, true).unwrap()["content"]
                .as_str()
                .unwrap()
                .contains("用事实讲结果")
        );
        put_collection(&conn, Some(&id), "教练", "用途", "分类", "skill", false).unwrap();
        assert!(collections(&conn, true).unwrap().iter().all(|c| c.id != id));
        assert!(read(&conn, &asset.id, 0, 100, true).is_err());
        assert!(
            search(&conn, "行为面试", None, None, None, 5)
                .unwrap()
                .is_empty()
        );
        assert!(read(&conn, &asset.id, 0, 100, false).is_ok());
        let unsafe_data = package(&[("../escape.md", "bad"), ("SKILL.md", "entry")]);
        let unsafe_asset = import(&mut conn, &root, &id, "unsafe.zip", &unsafe_data).unwrap();
        assert_eq!(unsafe_asset.status, "error");
        assert!(!root.join("escape.md").exists());
        let _ = std::fs::remove_dir_all(root);
    }
    #[test]
    fn docx_preserves_content_and_invalid_inputs_show_errors() {
        let (mut conn, root, id) = setup();
        let bytes = include_bytes!("../../../scripts/fixtures/original-document.docx");
        let file = import(&mut conn, &root, &id, "原文.docx", bytes).unwrap();
        assert_eq!(file.status, "ready");
        assert!(file.characters > 50);
        let invalid = import(&mut conn, &root, &id, "坏文件.pdf", b"not-pdf").unwrap();
        assert_eq!(invalid.status, "error");
        assert!(!invalid.error.is_empty());
        assert_eq!(invalid.characters, 0);
        assert!(import(&mut conn, &root, &id, "程序.exe", b"hello").is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}

#[cfg(test)]
mod pdf_tests {
    use super::*;
    use lopdf::{Document, Object, Stream, dictionary};
    fn pdf(text: &str) -> Vec<u8> {
        let mut document = Document::with_version("1.5");
        let pages = document.new_object_id();
        let font = document
            .add_object(dictionary! {"Type"=>"Font","Subtype"=>"Type1","BaseFont"=>"Helvetica"});
        let content = document.add_object(Stream::new(
            dictionary! {},
            format!("BT /F1 14 Tf 50 780 Td ({text}) Tj ET").into_bytes(),
        ));
        let page=document.add_object(dictionary!{"Type"=>"Page","Parent"=>pages,"MediaBox"=>vec![0.into(),0.into(),595.into(),842.into()],"Resources"=>dictionary!{"Font"=>dictionary!{"F1"=>font}},"Contents"=>content});
        document.objects.insert(
            pages,
            Object::Dictionary(dictionary! {"Type"=>"Pages","Kids"=>vec![page.into()],"Count"=>1}),
        );
        let catalog = document.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages});
        document.trailer.set("Root", catalog);
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        bytes
    }
    #[test]
    fn image_free_pdf_and_retry_of_previously_failed_asset() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        let root = std::env::temp_dir().join(format!("resumer-pdf-test-{}", uuid::Uuid::new_v4()));
        let collection = put_collection(&conn, None, "PDF测试", "", "", "document", true).unwrap();
        let bytes = pdf("cache consistency interview");
        assert!(
            crate::import::parse_pdf_assets(&bytes)
                .unwrap()
                .avatar
                .is_none()
        );
        let first = import(&mut conn, &root, &collection, "reference.pdf", &bytes).unwrap();
        assert_eq!(first.status, "ready");
        assert!(
            read(&conn, &first.id, 0, 6000, true).unwrap()["content"]
                .as_str()
                .unwrap()
                .contains("cache consistency")
        );
        conn.execute(
            "UPDATE knowledge_assets SET status='error',text='',error='旧解析器错误' WHERE id=?1",
            [&first.id],
        )
        .unwrap();
        let retried = import(&mut conn, &root, &collection, "reference.pdf", &bytes).unwrap();
        assert_eq!(retried.id, first.id);
        assert_eq!(retried.status, "ready");
        assert_eq!(assets(&conn, &collection).unwrap().len(), 1);
        let empty = import(&mut conn, &root, &collection, "empty.pdf", &pdf("")).unwrap();
        assert_eq!(empty.status, "needs_ocr");
        let _ = std::fs::remove_dir_all(root);
    }
}

/// 更新的是可检索知识层。录音原件/校对稿另存，不把无筛选的对话混入默认索引。
pub fn set_indexed_text(
    conn: &Connection,
    id: &str,
    text: &str,
    status: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE knowledge_assets SET text=?2,status=?3,error='' WHERE id=?1",
        params![id, text, status],
    )
    .map_err(err)?;
    conn.execute("DELETE FROM knowledge_chunks WHERE asset_id=?1", [id])
        .map_err(err)?;
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + 2000).min(chars.len());
        let body: String = chars[start..end].iter().collect();
        conn.execute("INSERT INTO knowledge_chunks(asset_id,position,title,body) SELECT id,?2,filename,?3 FROM knowledge_assets WHERE id=?1",params![id,start as i64,body]).map_err(err)?;
        if end == chars.len() {
            break;
        }
        start = end - 200;
    }
    conn.execute("UPDATE knowledge_collections SET updated_at=unixepoch() WHERE id=(SELECT collection_id FROM knowledge_assets WHERE id=?1)",[id]).map_err(err)?;
    Ok(())
}

#[cfg(test)]
mod tag_tests {
    use super::*;
    #[test]
    fn legacy_categories_migrate_as_one_tag_and_repeated_migration_is_safe() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute_batch("DROP TABLE knowledge_collection_tags;DELETE FROM _migrations WHERE version=15;INSERT INTO knowledge_collections(id,title,category,kind) VALUES('old','旧资料集','公司,面试准备','document'),('empty','未分类','','document'),('hash','带标签符号',' #React ','document');").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        assert_eq!(
            collection_tags(&conn, "old").unwrap(),
            vec!["公司,面试准备"]
        );
        assert!(collection_tags(&conn, "empty").unwrap().is_empty());
        assert_eq!(collection_tags(&conn, "hash").unwrap(), vec!["React"]);
        crate::db::migrate::run(&conn).unwrap();
        assert_eq!(collection_tags(&conn, "old").unwrap().len(), 1);
    }
    #[test]
    fn multi_tag_search_is_exact_case_insensitive_and_supports_all_any_and_untagged() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrate::run(&conn).unwrap();
        let root = std::env::temp_dir().join(format!("multi-tags-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        for (id, tags) in [
            ("a", vec!["前端", "React"]),
            ("b", vec!["前端", "面试"]),
            ("c", vec!["面试"]),
            ("empty", vec![]),
        ] {
            let tags = tags.into_iter().map(String::from).collect::<Vec<_>>();
            put_collection_tags(&conn, Some(id), id, "", "", "document", true, Some(&tags))
                .unwrap();
            import(&mut conn, &root, id, "资料.md", "缓存知识全文".as_bytes()).unwrap();
        }
        let selected = vec!["前端".into(), "面试".into()];
        let all = search_tagged(
            &conn,
            "缓存",
            None,
            &selected,
            "all",
            false,
            Some("document"),
            20,
        )
        .unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0]["collectionId"], "b");
        assert_eq!(
            search_tagged(&conn, "缓存", None, &selected, "any", false, None, 20)
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            search_tagged(&conn, "缓存", None, &[], "all", true, None, 20).unwrap()[0]["collectionId"],
            "empty"
        );
        assert_eq!(
            search_tagged(
                &conn,
                "缓存",
                None,
                &["react".into()],
                "all",
                false,
                None,
                20
            )
            .unwrap()
            .len(),
            1
        );
        assert!(
            search_tagged(&conn, "缓存", None, &["前".into()], "all", false, None, 20)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            normalize_tags(&[" #React ".into(), "react".into(), "前端".into()]).unwrap(),
            vec!["React", "前端"]
        );
        assert!(
            put_collection_tags(
                &conn,
                Some("a"),
                "a",
                "",
                "",
                "document",
                true,
                Some(&["x".repeat(81)])
            )
            .is_err()
        );
        assert_eq!(collection_tags(&conn, "a").unwrap().len(), 2);
        put_collection_tags(&conn, Some("a"), "a", "", "", "document", true, Some(&[])).unwrap();
        put_collection_tags(
            &conn,
            Some("a"),
            "a",
            "",
            "默认标签",
            "document",
            true,
            None,
        )
        .unwrap();
        assert!(collection_tags(&conn, "a").unwrap().is_empty());
        conn.execute("DELETE FROM knowledge_collections WHERE id='b'", [])
            .unwrap();
        assert!(collection_tags(&conn, "b").unwrap().is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
