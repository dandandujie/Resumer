pub mod fts;
pub mod graph;
pub mod index;
pub mod vault;

use std::future::Future;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::db::AppDb;
use crate::import;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SourceEntity {
    #[serde(rename = "type")]
    pub entity_type: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SourceSummary {
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub summary: String,
    #[serde(default)]
    pub entities: Vec<SourceEntity>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IngestResult {
    pub source: PageSummary,
    pub entities: Vec<SourceEntity>,
}

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
            "定向优化、JD 匹配或面试准备前，先使用 searchKnowledge 查询相关公司、岗位或 ",
            "SOP；",
            "引用知识页时标注 [[path]]。"
        ),
        purpose, index
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

pub fn extract_text(filename: &str, bytes: &[u8]) -> Result<String, String> {
    import::extract_knowledge_text(filename, bytes)
}

pub async fn ingest_with_generator<F, Fut>(
    db: &AppDb,
    root: &Path,
    bytes: &[u8],
    filename: &str,
    generator: F,
) -> Result<IngestResult, String>
where
    F: FnOnce(String) -> Fut,
    Fut: Future<Output = Result<SourceSummary, String>>,
{
    let text = extract_text(filename, bytes)?;
    let summary = generator(text).await?;
    ingest_with_summary(db, root, bytes, filename, summary)
}

pub fn ingest_with_summary(
    db: &AppDb,
    root: &Path,
    bytes: &[u8],
    filename: &str,
    source_summary: SourceSummary,
) -> Result<IngestResult, String> {
    let safe_name = filename
        .replace(['/', '\\'], "_")
        .trim_end_matches(".md")
        .to_string();
    let extension = filename.rsplit('.').next().unwrap_or("bin");
    let raw_path = format!("raw/{safe_name}.{extension}");
    std::fs::write(root.join(&raw_path), bytes).map_err(|error| error.to_string())?;
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
        title: if source_summary.title.trim().is_empty() {
            safe_name.clone()
        } else {
            source_summary.title.clone()
        },
        page_type: "source".into(),
        tags: source_summary.tags.clone(),
        sources: vec![raw_path.clone()],
        created: now.clone(),
        updated: now,
        ..vault::Frontmatter::default()
    };
    let body = format!("原始资料：[[{raw_path}]]\n\n{}", source_summary.summary);
    let source_page = vault::serialize_page(&meta, &body);
    let page = vault::write(root, &wiki_path, &source_page)?;
    let conn = db.conn.lock().map_err(|error| error.to_string())?;
    fts::upsert(&conn, &page)?;
    append_log(root, &format!("ingest {raw_path} → {wiki_path}"))?;
    index::rebuild_from_disk(root)?;
    Ok(IngestResult {
        source: PageSummary {
            path: wiki_path,
            title: page.frontmatter.title,
            page_type: page.frontmatter.page_type,
            tags: page.frontmatter.tags,
            summary: body.chars().take(240).collect(),
            updated: page.frontmatter.updated,
        },
        entities: source_summary.entities,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingest_markdown_writes_raw_and_source_page() {
        let root = std::env::temp_dir().join(format!("resumer-knowledge-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        let db = AppDb {
            conn: std::sync::Mutex::new(conn),
        };
        vault::initialize(&root).unwrap();
        let result = ingest_with_summary(
            &db,
            &root,
            b"# Acme\n\nA company profile.",
            "acme.md",
            SourceSummary {
                title: "Acme".into(),
                tags: vec!["company".into()],
                summary: "# Acme\n\nA company profile.".into(),
                entities: vec![],
            },
        )
        .unwrap();
        assert_eq!(result.source.title, "Acme");
        assert_eq!(
            std::fs::read(root.join("raw/acme.md")).unwrap(),
            b"# Acme\n\nA company profile."
        );
        assert!(root.join("wiki/sources/acme.md").exists());
        let _ = std::fs::remove_dir_all(root);
    }
}
