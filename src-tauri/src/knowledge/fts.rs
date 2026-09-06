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

pub fn upsert(conn: &Connection, page: &Page) -> Result<(), String> {
    let summary = page
        .body
        .lines()
        .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .unwrap_or("")
        .chars()
        .take(240)
        .collect::<String>();
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
            summary,
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

pub fn search(
    conn: &Connection,
    query: &str,
    page_type: Option<&str>,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let query = query.trim().replace('"', " ");
    if query.is_empty() || query.chars().count() < 3 {
        return Ok(Vec::new());
    }
    let mut statement = conn
        .prepare(
            "SELECT p.path,p.title,p.type,p.summary,substr(p.body,1,360)
             FROM knowledge_fts f JOIN knowledge_pages p ON p.path=f.path
             WHERE knowledge_fts MATCH ?1 ORDER BY rank LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let mut rows = statement
        .query(params![query, limit as i64])
        .map_err(|error| error.to_string())?;
    let mut hits = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let hit = SearchHit {
            path: row.get(0).map_err(|error| error.to_string())?,
            title: row.get(1).map_err(|error| error.to_string())?,
            page_type: row.get(2).map_err(|error| error.to_string())?,
            summary: row.get(3).map_err(|error| error.to_string())?,
            excerpt: row.get(4).map_err(|error| error.to_string())?,
        };
        if page_type.is_none_or(|kind| kind == hit.page_type) {
            hits.push(hit);
        }
    }
    drop(rows);
    drop(statement);
    let direct_paths = hits.iter().map(|hit| hit.path.clone()).collect::<Vec<_>>();
    let mut related_paths = Vec::new();
    for path in direct_paths {
        let body: String = conn
            .query_row(
                "SELECT body FROM knowledge_pages WHERE path = ?1",
                params![path],
                |row| row.get(0),
            )
            .unwrap_or_default();
        for part in body.split("[[").skip(1) {
            let link = part.split("]]").next().unwrap_or("").trim();
            if validate_related_path(link) && !related_paths.iter().any(|item| item == link) {
                related_paths.push(link.to_string());
            }
        }
    }
    for path in related_paths {
        if hits.iter().any(|hit| hit.path == path) {
            continue;
        }
        let result = conn.query_row(
            "SELECT path,title,type,summary,substr(body,1,360) FROM knowledge_pages WHERE path = ?1",
            params![path],
            |row| Ok(SearchHit {
                path: row.get(0)?, title: row.get(1)?, page_type: row.get(2)?,
                summary: row.get(3)?, excerpt: row.get(4)?,
            }),
        );
        if let Ok(hit) = result {
            if page_type.is_none_or(|kind| kind == hit.page_type) {
                hits.push(hit);
            }
        }
    }
    hits.truncate(limit);
    Ok(hits)
}

fn validate_related_path(path: &str) -> bool {
    !path.is_empty() && path.ends_with(".md") && !path.contains("..") && path.starts_with("wiki/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_supports_trigram() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE VIRTUAL TABLE knowledge_fts USING fts5(path, body, tokenize='trigram')",
            [],
        )
        .unwrap();
    }
}
