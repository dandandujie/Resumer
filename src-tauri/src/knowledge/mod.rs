pub mod fts;
pub mod index;
pub mod vault;

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::db::AppDb;

#[derive(Debug, Clone, Serialize)]
pub struct PageSummary {
    pub path: String,
    pub title: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub updated: String,
}

pub fn prompt_context(app: &AppHandle) -> Result<String, String> {
    let root = ensure(app)?;
    let purpose = std::fs::read_to_string(root.join("purpose.md"))
        .map_err(|error| error.to_string())?
        .chars()
        .take(2048)
        .collect::<String>();
    let index = std::fs::read_to_string(root.join("index.md"))
        .map_err(|error| error.to_string())?
        .lines()
        .take(60)
        .collect::<Vec<_>>()
        .join("\n");
    Ok(format!(
        concat!(
            "\n\n## 知识库上下文\n### 求职目标\n{}\n### 索引\n{}\n\n",
            "定向优化、JD 匹配或面试准备前，先使用 searchKnowledge 查询相关公司、岗位或 SOP；",
            "引用知识页时标注 [[path]]。"
        ),
        purpose,
        index
    ))
}

pub fn root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("knowledge"))
}

pub fn ensure(app: &AppHandle) -> Result<PathBuf, String> {
    let root = root(app)?;
    vault::initialize(&root)?;
    Ok(root)
}

pub fn reindex(db: &AppDb, root: &Path) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|error| error.to_string())?;
    fts::reindex(&conn, root)
}

pub fn summaries(root: &Path, kind: Option<&str>) -> Result<Vec<PageSummary>, String> {
    vault::list(root)?
        .into_iter()
        .filter(|path| path.starts_with("wiki/") || path == "purpose.md")
        .map(|path| {
            let page = vault::read(root, &path)?;
            if kind.is_some_and(|value| value != page.frontmatter.page_type) {
                return Ok(None);
            }
            let summary = page
                .body
                .lines()
                .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
                .unwrap_or("")
                .chars()
                .take(240)
                .collect();
            Ok(Some(PageSummary {
                path,
                title: page.frontmatter.title,
                page_type: page.frontmatter.page_type,
                tags: page.frontmatter.tags,
                summary,
                updated: page.frontmatter.updated,
            }))
        })
        .filter_map(|result| result.transpose())
        .collect()
}

pub fn write_page(db: &AppDb, root: &Path, path: &str, content: &str) -> Result<(), String> {
    let page = vault::write(root, path, content)?;
    let conn = db.conn.lock().map_err(|error| error.to_string())?;
    fts::upsert(&conn, &page)?;
    append_log(root, &format!("write {path}"))?;
    index::rebuild_from_disk(root)?;
    Ok(())
}

pub fn append_log(root: &Path, message: &str) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let path = root.join("log.md");
    let existing = std::fs::read_to_string(&path).unwrap_or_else(|_| "# 知识库日志\n\n".into());
    std::fs::write(path, format!("{existing}- {now} {message}\n"))
        .map_err(|error| error.to_string())
}

pub fn ingest(
    db: &AppDb,
    root: &Path,
    bytes: &[u8],
    filename: &str,
) -> Result<PageSummary, String> {
    let safe_name = filename
        .replace(['/', '\\'], "_")
        .trim_end_matches(".md")
        .to_string();
    let raw_path = format!("raw/{safe_name}.md");
    let text = String::from_utf8_lossy(bytes).to_string();
    vault::write(root, &raw_path, &text)?;
    let slug = safe_name
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let wiki_path = format!("wiki/sources/{slug}.md");
    let now = format!(
        "{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );
    let meta = vault::Frontmatter {
        title: safe_name.clone(),
        page_type: "source".into(),
        sources: vec![raw_path.clone()],
        created: now.clone(),
        updated: now,
        ..vault::Frontmatter::default()
    };
    let body = format!(
        "原始资料：[[{raw_path}]]\n\n{}",
        text.chars().take(4000).collect::<String>()
    );
    let page = vault::write(root, &wiki_path, &vault::serialize_page(&meta, &body))?;
    let conn = db.conn.lock().map_err(|error| error.to_string())?;
    fts::upsert(&conn, &page)?;
    append_log(root, &format!("ingest {raw_path} → {wiki_path}"))?;
    index::rebuild_from_disk(root)?;
    Ok(PageSummary {
        path: wiki_path,
        title: page.frontmatter.title,
        page_type: page.frontmatter.page_type,
        tags: page.frontmatter.tags,
        summary: body.chars().take(240).collect(),
        updated: page.frontmatter.updated,
    })
}
