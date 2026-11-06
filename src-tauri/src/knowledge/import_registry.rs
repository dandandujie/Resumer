//! 旧知识导入的身份登记。检索重建不拥有、也不清理这些事实。
use super::{raw_sha256, vault};
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

pub fn contains(conn: &Connection, root: &Path, digest: &str) -> Result<bool, String> {
    let path: Option<String> = conn
        .query_row(
            "SELECT source_path FROM knowledge_imports WHERE digest=?1",
            [digest],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(path) = path else {
        return Ok(false);
    };
    if vault::root_file(root, &path)?.is_file() {
        return Ok(true);
    }
    // 用户删除来源页表示可以重新导入；仅编辑来源正文不改变导入身份。
    conn.execute("DELETE FROM knowledge_imports WHERE digest=?1", [digest])
        .map_err(|e| e.to_string())?;
    Ok(false)
}
pub fn register(conn: &Connection, digest: &str, path: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO knowledge_imports(digest,source_path) VALUES (?1,?2)",
        params![digest, path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
/// 兼容升级前已被 reindex 清掉指纹的库，从保留原件恢复身份。
/// 只用于启动恢复，不把重建搜索索引变成导入身份的所有者。
pub fn recover(conn: &Connection, root: &Path) -> Result<(), String> {
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for path in vault::list(root)?
        .into_iter()
        .filter(|p| p.starts_with("wiki/sources/"))
    {
        let registered: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM knowledge_imports WHERE source_path=?1)",
                [&path],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if registered {
            continue;
        }
        let page = vault::read(root, &path)?;
        if page.frontmatter.page_type != "source" {
            continue;
        }
        for source in page
            .frontmatter
            .sources
            .iter()
            .filter(|p| p.starts_with("raw/"))
        {
            let raw = vault::root_file(root, source)?;
            let Ok(raw) = raw.canonicalize() else {
                continue;
            };
            if !raw.starts_with(&canonical_root) || !raw.is_file() {
                continue;
            }
            register(
                &tx,
                &raw_sha256(&std::fs::read(raw).map_err(|e| e.to_string())?),
                &path,
            )?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_known_imports_before_the_projection_is_rebuilt() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/006_knowledge.sql"))
            .unwrap();
        conn.execute_batch(include_str!(
            "../../migrations/007_knowledge_raw_sha256.sql"
        ))
        .unwrap();
        conn.execute("INSERT INTO knowledge_pages(path,type,title,raw_sha256) VALUES ('wiki/sources/old.md','source','旧资料','known')", []).unwrap();
        conn.execute_batch(include_str!(
            "../../migrations/017_knowledge_import_registry.sql"
        ))
        .unwrap();
        conn.execute("DELETE FROM knowledge_pages", []).unwrap();
        let path: String = conn
            .query_row(
                "SELECT source_path FROM knowledge_imports WHERE digest='known'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(path, "wiki/sources/old.md");
    }
}
