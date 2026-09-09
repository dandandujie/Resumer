use rusqlite::{Connection, params};
use serde::Serialize;

use super::vault::Page;

#[derive(Debug, Clone, Serialize)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub summary: String,
    pub excerpt: String,
}

const EXCERPT_CHARS: usize = 360;
const SUMMARY_CHARS: usize = 240;
/// trigram 分词器无法匹配少于 3 个字符的词；这类词（腾讯、华为、Go）走 LIKE 兜底。
const TRIGRAM_MIN_CHARS: usize = 3;

pub fn summary_of(body: &str) -> String {
    body.lines()
        .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .unwrap_or("")
        .chars()
        .take(SUMMARY_CHARS)
        .collect()
}

pub fn upsert(conn: &Connection, page: &Page) -> Result<(), String> {
    conn.execute(
        "INSERT INTO knowledge_pages(path,type,title,tags,summary,body,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,datetime('now'))
         ON CONFLICT(path) DO UPDATE SET type=excluded.type,title=excluded.title,
         tags=excluded.tags,summary=excluded.summary,body=excluded.body,updated_at=excluded.updated_at",
        params![
            page.path,
            page.frontmatter.page_type,
            page.frontmatter.title,
            page.frontmatter.tags.join(","),
            summary_of(&page.body),
            page.body
        ],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "DELETE FROM knowledge_fts WHERE path = ?1",
        params![page.path],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO knowledge_fts(path,title,tags,body) VALUES (?1,?2,?3,?4)",
        params![
            page.path,
            page.frontmatter.title,
            page.frontmatter.tags.join(" "),
            page.body
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn reindex(conn: &Connection, root: &std::path::Path) -> Result<usize, String> {
    let paths = super::vault::list(root)?;
    let transaction = conn
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM knowledge_pages", [])
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM knowledge_fts", [])
        .map_err(|error| error.to_string())?;
    for path in &paths {
        let page = super::vault::read(root, path)?;
        upsert(&transaction, &page)?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(paths.len())
}

/// 把自然语言查询切成词；每个词都是独立的匹配单元（OR），而不是整句 AND。
/// 「字节跳动 后端 岗位要求 面试」这种预检索查询只要命中公司或岗位就应返回。
pub fn query_terms(query: &str) -> Vec<String> {
    let mut terms: Vec<String> = Vec::new();
    for raw in query.split(|c: char| c.is_whitespace() || "，。、,.;:()（）[]【】\"'“”|/\\".contains(c)) {
        let term = raw.trim().trim_matches(['-', '*', '^', '+']);
        if term.is_empty() || terms.iter().any(|existing| existing == term) {
            continue;
        }
        terms.push(term.to_string());
    }
    terms
}

fn fts_expression(terms: &[String]) -> String {
    terms
        .iter()
        .filter(|term| term.chars().count() >= TRIGRAM_MIN_CHARS)
        .map(|term| format!("\"{}\"", term.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" OR ")
}

fn row_hit(row: &rusqlite::Row<'_>) -> rusqlite::Result<SearchHit> {
    Ok(SearchHit {
        path: row.get(0)?,
        title: row.get(1)?,
        page_type: row.get(2)?,
        summary: row.get(3)?,
        excerpt: row.get::<_, String>(4)?.chars().take(EXCERPT_CHARS).collect(),
    })
}

fn push_unique(hits: &mut Vec<SearchHit>, hit: SearchHit, page_type: Option<&str>) {
    if page_type.is_some_and(|kind| kind != hit.page_type) {
        return;
    }
    if hits.iter().any(|existing| existing.path == hit.path) {
        return;
    }
    hits.push(hit);
}

pub fn search(
    conn: &Connection,
    query: &str,
    page_type: Option<&str>,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let terms = query_terms(query);
    if terms.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }
    let mut hits: Vec<SearchHit> = Vec::new();

    let expression = fts_expression(&terms);
    if !expression.is_empty() {
        let mut statement = conn
            .prepare(
                "SELECT p.path,p.title,p.type,p.summary,substr(p.body,1,1200)
                 FROM knowledge_fts f JOIN knowledge_pages p ON p.path=f.path
                 WHERE knowledge_fts MATCH ?1 ORDER BY rank LIMIT ?2",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![expression, limit as i64], row_hit)
            .map_err(|error| error.to_string())?;
        for row in rows {
            push_unique(&mut hits, row.map_err(|error| error.to_string())?, page_type);
        }
    }

    // 短词（< 3 字符）trigram 无法命中，用 LIKE 在标题/标签/正文上兜底；命中标题的排前面。
    let short_terms: Vec<&String> = terms
        .iter()
        .filter(|term| term.chars().count() < TRIGRAM_MIN_CHARS)
        .collect();
    if !short_terms.is_empty() && hits.len() < limit {
        let mut statement = conn
            .prepare(
                "SELECT path,title,type,summary,substr(body,1,1200) FROM knowledge_pages
                 WHERE title LIKE ?1 OR tags LIKE ?1 OR body LIKE ?1
                 ORDER BY CASE WHEN title LIKE ?1 THEN 0 ELSE 1 END, updated_at DESC LIMIT ?2",
            )
            .map_err(|error| error.to_string())?;
        for term in short_terms {
            let pattern = format!("%{}%", term.replace(['%', '_'], ""));
            let rows = statement
                .query_map(params![pattern, limit as i64], row_hit)
                .map_err(|error| error.to_string())?;
            for row in rows {
                push_unique(&mut hits, row.map_err(|error| error.to_string())?, page_type);
            }
        }
    }

    // 一跳扩展：直接命中页里的 wikilink 目标也带上，让公司页顺带把岗位页/SOP 带出来。
    let mut related: Vec<String> = Vec::new();
    for hit in &hits {
        let body: String = conn
            .query_row(
                "SELECT body FROM knowledge_pages WHERE path = ?1",
                params![hit.path],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        for link in super::vault::wikilinks(&body) {
            if link.starts_with("wiki/") && !related.contains(&link) {
                related.push(link);
            }
        }
    }
    for path in related {
        if hits.len() >= limit {
            break;
        }
        let found = conn
            .query_row(
                "SELECT path,title,type,summary,substr(body,1,1200) FROM knowledge_pages WHERE path = ?1",
                params![path],
                row_hit,
            );
        match found {
            Ok(hit) => push_unique(&mut hits, hit, page_type),
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    hits.truncate(limit);
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::vault::{Frontmatter, Page};

    fn page(path: &str, title: &str, body: &str) -> Page {
        Page {
            path: path.into(),
            frontmatter: Frontmatter {
                title: title.into(),
                page_type: "company".into(),
                ..Frontmatter::default()
            },
            body: body.into(),
        }
    }

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn
    }

    #[test]
    fn sqlite_supports_trigram() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE VIRTUAL TABLE t USING fts5(path, body, tokenize='trigram')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn splits_query_into_terms_and_strips_fts_operators() {
        assert_eq!(query_terms("字节跳动 后端开发 岗位要求 面试"), vec!["字节跳动", "后端开发", "岗位要求", "面试"]);
        assert_eq!(query_terms("Java/后端（北京）-上海 C++"), vec!["Java", "后端", "北京", "上海", "C"]);
        assert!(query_terms("   ").is_empty());
    }

    #[test]
    fn matches_any_term_and_short_company_names() {
        let conn = connection();
        upsert(&conn, &page("wiki/companies/bytedance.md", "字节跳动", "互联网大厂，后端岗位看重高并发经验。见 [[wiki/roles/backend.md]]")).unwrap();
        upsert(&conn, &page("wiki/companies/tencent.md", "腾讯", "社交与游戏。")).unwrap();
        upsert(&conn, &page("wiki/roles/backend.md", "后端工程师", "岗位要求：Go、Java。")).unwrap();

        let hits = search(&conn, "字节跳动 后端开发 岗位要求 面试", None, 8).unwrap();
        let paths: Vec<&str> = hits.iter().map(|hit| hit.path.as_str()).collect();
        assert!(paths.contains(&"wiki/companies/bytedance.md"), "{paths:?}");
        assert!(paths.contains(&"wiki/roles/backend.md"), "{paths:?}");

        let hits = search(&conn, "腾讯", None, 8).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "wiki/companies/tencent.md");

        assert!(search(&conn, "Java/后端(北京)", None, 8).is_ok());
        assert!(search(&conn, "不存在的内容xyz", Some("company"), 8).unwrap().is_empty());
    }
}
