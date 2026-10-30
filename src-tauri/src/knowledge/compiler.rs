//! Wiki 更新是带来源指纹与页面前置版本的文件批次；冲突时整批拒绝。
use super::{fts, index, vault};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedPage {
    pub path: String,
    pub title: String,
    pub kind: String,
    pub body: String,
    pub before: Option<String>,
    pub sources: Vec<String>,
    pub stamp: String,
}
pub fn digest(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub fn collection_state(conn: &Connection, id: &str) -> Result<String, String> {
    let meta: (String, String, String, bool) = conn
        .query_row(
            "SELECT title,purpose,category,enabled FROM knowledge_collections WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id,sha256,status,text FROM knowledge_assets WHERE collection_id=?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let values = stmt
        .query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(digest(
        &serde_json::to_string(&(meta, super::library::collection_tags(conn, id)?, values))
            .map_err(|e| e.to_string())?,
    ))
}
pub fn secure_path(root: &Path, path: &str) -> Result<PathBuf, String> {
    vault::validate_path(path)?;
    if !path.starts_with("wiki/") || path.split('/').count() < 3 {
        return Err("只能生成wiki中的内容页".into());
    }
    let candidate = root.join(path);
    let mut existing = candidate.as_path();
    while !existing.exists() {
        existing = existing.parent().ok_or("页面目录无效")?;
    }
    if !existing
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(root.canonicalize().map_err(|e| e.to_string())?)
    {
        return Err("页面路径不能指向知识库之外".into());
    }
    Ok(candidate)
}
pub fn plan(
    root: &Path,
    path: &str,
    title: &str,
    kind: &str,
    body: &str,
    sources: Vec<String>,
) -> Result<PlannedPage, String> {
    let file = secure_path(root, path)?;
    if body.trim().is_empty() || body.chars().count() > 120_000 {
        return Err("Wiki页面为空或过长".into());
    }
    let before = if file.exists() {
        Some(std::fs::read_to_string(file).map_err(|e| e.to_string())?)
    } else {
        None
    };
    Ok(PlannedPage {
        path: path.into(),
        title: title.into(),
        kind: kind.into(),
        body: body.into(),
        before,
        sources,
        stamp: vault::now_stamp(),
    })
}
pub fn rendered(page: &PlannedPage) -> String {
    let mut meta = page
        .before
        .as_deref()
        .and_then(|s| vault::parse_page(&page.path, s).ok())
        .map(|p| p.frontmatter)
        .unwrap_or_default();
    if meta.created.is_empty() {
        meta.created = page.stamp.clone()
    }
    meta.updated = page.stamp.clone();
    meta.title = page.title.clone();
    meta.page_type = page.kind.clone();
    for source in &page.sources {
        if !meta.sources.contains(source) {
            meta.sources.push(source.clone());
        }
    }
    let generated = vault::serialize_page(&meta, &page.body);
    // 只更新编译器拥有的元信息；Obsidian 的自定义字段和多行配置原样保留。
    if let Some(before) = page.before.as_deref() {
        let normalized = before.replace("\r\n", "\n");
        if let Some((raw, _)) = normalized
            .strip_prefix("---\n")
            .and_then(|s| s.split_once("\n---\n"))
        {
            let generated_raw = generated
                .strip_prefix("---\n")
                .unwrap()
                .split_once("\n---\n")
                .unwrap()
                .0;
            let owned = ["title", "type", "created", "updated", "sources"];
            let mut replacements = generated_raw
                .lines()
                .filter_map(|line| {
                    line.split_once(':')
                        .filter(|(key, _)| owned.contains(key))
                        .map(|(key, _)| (key.to_string(), line.to_string()))
                })
                .collect::<BTreeMap<_, _>>();
            // 读取外部编辑器常用的多行来源列表，新增来源时不丢掉旧来源。
            let mut multiline = false;
            let mut all_sources = meta.sources.clone();
            for line in raw.lines() {
                if !line.starts_with(char::is_whitespace) {
                    multiline = line.trim() == "sources:";
                } else if multiline && let Some(value) = line.trim().strip_prefix("- ") {
                    let value = value.trim().trim_matches(['\"', '\'']).to_string();
                    if !all_sources.contains(&value) {
                        all_sources.push(value)
                    }
                }
            }
            replacements.insert(
                "sources".into(),
                format!("sources: {}", serde_json::to_string(&all_sources).unwrap()),
            );
            let mut kept = Vec::new();
            let mut skip = false;
            for line in raw.lines() {
                if !line.starts_with(char::is_whitespace) {
                    skip = false;
                    if let Some((key, _)) = line.split_once(':')
                        && let Some(new) = replacements.remove(key)
                    {
                        kept.push(new);
                        skip = true;
                        continue;
                    }
                }
                if !skip {
                    kept.push(line.to_string());
                }
            }
            kept.extend(replacements.into_values());
            return format!("---\n{}\n---\n{}", kept.join("\n"), page.body);
        }
    }
    generated
}
static APPLY_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
pub fn apply(
    conn: &mut Connection,
    root: &Path,
    pages: &[PlannedPage],
) -> Result<Vec<String>, String> {
    let _guard = APPLY_LOCK
        .get_or_init(Default::default)
        .lock()
        .map_err(|e| e.to_string())?;
    if !pages.is_empty()
        && pages.iter().all(|p| {
            std::fs::read_to_string(root.join(&p.path)).ok().as_deref()
                == Some(rendered(p).as_str())
        })
    {
        return Ok(pages.iter().map(|p| p.path.clone()).collect());
    }
    let mut paths = BTreeMap::new();
    for page in pages {
        let file = secure_path(root, &page.path)?;
        let current = if file.exists() {
            Some(std::fs::read_to_string(&file).map_err(|e| e.to_string())?)
        } else {
            None
        };
        if current != page.before {
            return Err(format!(
                "{}已被修改，请重新生成Wiki更新，未写入任何页面",
                page.title
            ));
        }
        if paths.insert(page.path.clone(), file).is_some() {
            return Err("同一批次包含重复页面".into());
        }
    }
    let backup = root.join(".history").join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&backup).map_err(|e| e.to_string())?;
    for (i, p) in pages.iter().enumerate() {
        std::fs::write(
            backup.join(format!("{i}.txt")),
            p.before.as_deref().unwrap_or(""),
        )
        .map_err(|e| e.to_string())?;
    }
    std::fs::write(
        backup.join("manifest.json"),
        serde_json::to_string(pages).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let mut written = vec![];
    let old_index = std::fs::read_to_string(root.join("index.md")).ok();
    let result = (|| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for page in pages {
            let file = paths.get(&page.path).unwrap();
            std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
            let content = rendered(page);
            let temporary = file.with_extension(format!("md.{}.tmp", uuid::Uuid::new_v4()));
            std::fs::write(&temporary, &content).map_err(|e| e.to_string())?;
            std::fs::rename(&temporary, file).map_err(|e| {
                let _ = std::fs::remove_file(&temporary);
                e.to_string()
            })?;
            written.push(page);
            fts::upsert(&tx, &vault::parse_page(&page.path, &content)?)?;
        }
        index::rebuild_from_disk(root)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(e) = result {
        for page in written.into_iter().rev() {
            let file = paths.get(&page.path).unwrap();
            if let Some(before) = &page.before {
                let _ = std::fs::write(file, before);
            } else {
                let _ = std::fs::remove_file(file);
            }
        }
        if let Some(before) = old_index {
            let _ = std::fs::write(root.join("index.md"), before);
        }
        return Err(e);
    }
    Ok(pages.iter().map(|p| p.path.clone()).collect())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn conflict_refuses_entire_batch_and_protects_raw() {
        let root = std::env::temp_dir().join(format!("wiki-plan-{}", uuid::Uuid::new_v4()));
        vault::initialize(&root).unwrap();
        let mut c = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&c).unwrap();
        let a = plan(
            &root,
            "wiki/concepts/a.md",
            "A",
            "concept",
            "# A\n原稿",
            vec![],
        )
        .unwrap();
        apply(&mut c, &root, &[a]).unwrap();
        let one = plan(
            &root,
            "wiki/concepts/a.md",
            "A",
            "concept",
            "# A\nAI提案",
            vec![],
        )
        .unwrap();
        let two = plan(&root, "wiki/concepts/b.md", "B", "concept", "# B", vec![]).unwrap();
        std::fs::write(root.join("wiki/concepts/a.md"), "# A\n用户新编辑").unwrap();
        assert!(apply(&mut c, &root, &[one, two]).is_err());
        assert!(!root.join("wiki/concepts/b.md").exists());
        assert!(plan(&root, "raw/a.md", "x", "source", "x", vec![]).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn retries_are_idempotent_and_failed_indexing_rolls_back_files() {
        let root = std::env::temp_dir().join(format!("wiki-atomic-{}", uuid::Uuid::new_v4()));
        vault::initialize(&root).unwrap();
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        let page = plan(
            &root,
            "wiki/concepts/retry.md",
            "重试",
            "concept",
            "# 已确认的知识",
            vec![],
        )
        .unwrap();
        let first = apply(&mut conn, &root, std::slice::from_ref(&page)).unwrap();
        assert_eq!(first, apply(&mut conn, &root, &[page]).unwrap());
        let before = std::fs::read_to_string(root.join("wiki/concepts/retry.md")).unwrap();
        let update = plan(
            &root,
            "wiki/concepts/retry.md",
            "重试",
            "concept",
            "# 不应保存的变更",
            vec![],
        )
        .unwrap();
        conn.execute_batch("CREATE TRIGGER fail_wiki BEFORE UPDATE ON knowledge_pages BEGIN SELECT RAISE(ABORT,'test disk failure'); END;").unwrap();
        assert!(apply(&mut conn, &root, &[update]).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("wiki/concepts/retry.md")).unwrap(),
            before
        );
        #[cfg(unix)]
        {
            let outside = std::env::temp_dir().join(format!("outside-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&outside).unwrap();
            std::os::unix::fs::symlink(&outside, root.join("wiki/escape")).unwrap();
            assert!(plan(&root, "wiki/escape/x.md", "x", "concept", "x", vec![]).is_err());
            std::fs::remove_dir_all(outside).unwrap();
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn compiler_preserves_obsidian_properties_and_multiline_sources() {
        let page=PlannedPage{path:"wiki/concepts/custom.md".into(),title:"更新标题".into(),kind:"concept".into(),body:"新正文".into(),before:Some("---\ntitle: 原标题\ntype: concept\ncustom:\n  mode: keep\ntags: [old]\nsources:\n  - wiki/sources/old.md\ncreated: yesterday\n---\n旧正文".into()),sources:vec!["wiki/sources/new.md".into()],stamp:"today".into()};
        let text = rendered(&page);
        assert!(text.contains("custom:\n  mode: keep"));
        assert!(text.contains("tags: [old]"));
        assert!(text.contains("created: yesterday"));
        let parsed = vault::parse_page(&page.path, &text).unwrap();
        assert!(
            parsed
                .frontmatter
                .sources
                .contains(&"wiki/sources/old.md".into())
        );
        assert!(
            parsed
                .frontmatter
                .sources
                .contains(&"wiki/sources/new.md".into())
        );
        assert_eq!(parsed.body, "新正文");
    }
}
