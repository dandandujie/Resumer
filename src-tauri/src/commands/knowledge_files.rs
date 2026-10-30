//! Wiki 工作区的目录与属性操作。路径限制在知识库，更新时核对用户实际读取的版本。
use super::CommandError;
use crate::{
    db::AppDb,
    knowledge::{self, compiler, vault},
};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
fn err(e: impl std::fmt::Display) -> CommandError {
    CommandError {
        message: e.to_string(),
    }
}
fn directory(root: &Path, path: &str) -> Result<PathBuf, CommandError> {
    if path != "wiki" && !path.starts_with("wiki/") {
        return Err(err("文件夹只能位于Wiki目录"));
    }
    if path.contains('\\')
        || path
            .split('/')
            .any(|p| p.is_empty() || p.starts_with('.') || p.chars().any(char::is_control))
    {
        return Err(err("文件夹名称无效"));
    }
    if path == "wiki" {
        return Ok(root.join("wiki"));
    }
    compiler::secure_path(root, &format!("{path}/placeholder.md"))
        .map_err(err)
        .map(|p| p.parent().unwrap().to_path_buf())
}
fn folders(root: &Path) -> Result<Vec<String>, CommandError> {
    fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), CommandError> {
        for entry in std::fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            if entry.file_type().map_err(err)?.is_dir()
                && !entry.file_name().to_string_lossy().starts_with('.')
            {
                if out.len() > 5000 {
                    return Err(err("文件夹数量过多，请在外部编辑器整理"));
                }
                let path = entry.path();
                out.push(
                    path.strip_prefix(root)
                        .map_err(err)?
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
                walk(root, &path, out)?;
            }
        }
        Ok(())
    }
    let mut out = vec!["wiki".into()];
    walk(root, &root.join("wiki"), &mut out)?;
    out.sort();
    Ok(out)
}
#[tauri::command]
pub fn knowledge_folders(app: AppHandle) -> Result<Vec<String>, CommandError> {
    let root = knowledge::ensure(&app).map_err(err)?;
    folders(&root)
}
#[tauri::command]
pub fn knowledge_create_folder(app: AppHandle, path: String) -> Result<(), CommandError> {
    let root = knowledge::ensure(&app).map_err(err)?;
    let path = directory(&root, &path)?;
    if path.exists() {
        return Err(err("同名文件夹已存在"));
    }
    std::fs::create_dir_all(path).map_err(err)
}
pub(crate) fn properties(raw: &str, title: &str, tags: &[String]) -> Result<String, CommandError> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 160 || title.contains(['\n', '\r']) {
        return Err(err("标题应为1–160字的单行文字"));
    }
    let tags = knowledge::library::normalize_tags(tags).map_err(err)?;
    let normalized = raw.replace("\r\n", "\n");
    let (front, body) = if let Some(s) = normalized.strip_prefix("---\n") {
        s.split_once("\n---\n")
            .ok_or_else(|| err("属性区格式不完整"))?
    } else {
        ("", normalized.as_str())
    };
    let mut kept = vec![];
    let mut skip = false;
    for line in front.lines() {
        if !line.starts_with(char::is_whitespace) {
            skip = false;
            if let Some((key, _)) = line.split_once(':')
                && ["title", "tags", "updated"].contains(&key)
            {
                skip = true;
                continue;
            }
        }
        if !skip {
            kept.push(line.to_string());
        }
    }
    kept.push(format!(
        "title: {}",
        serde_json::to_string(title).map_err(err)?
    ));
    kept.push(format!(
        "tags: {}",
        serde_json::to_string(&tags).map_err(err)?
    ));
    kept.push(format!("updated: {}", vault::now_stamp()));
    let old_title = vault::parse_page("wiki/note.md", raw)
        .map_err(err)?
        .frontmatter
        .title;
    let old_heading = format!("# {old_title}\n");
    let body = if !old_title.is_empty() && body.starts_with(&old_heading) {
        body.replacen(&old_heading, &format!("# {title}\n"), 1)
    } else {
        body.to_string()
    };
    Ok(format!("---\n{}\n---\n{body}", kept.join("\n")))
}
#[tauri::command]
pub fn knowledge_update_properties(
    app: AppHandle,
    db: State<AppDb>,
    path: String,
    title: String,
    tags: Vec<String>,
    expected: String,
) -> Result<(), CommandError> {
    let root = knowledge::ensure(&app).map_err(err)?;
    let current = vault::read_raw(&root, &path).map_err(err)?;
    if current != expected {
        return Err(err("页面已被其他编辑器更新，请重新读取后再修改属性"));
    }
    let content = properties(&current, &title, &tags)?;
    knowledge::write_page(&db, &root, &path, &content).map_err(err)
}
#[tauri::command]
pub fn knowledge_open_file(app: AppHandle, path: String) -> Result<(), CommandError> {
    use tauri_plugin_shell::ShellExt;
    let root = knowledge::ensure(&app).map_err(err)?;
    if !["raw/", "materials/", "skills/"]
        .iter()
        .any(|prefix| path.starts_with(prefix))
        || Path::new(&path).components().any(|p| {
            matches!(
                p,
                std::path::Component::ParentDir | std::path::Component::RootDir
            )
        })
    {
        return Err(err("原件路径无效"));
    }
    let file = root.join(&path).canonicalize().map_err(err)?;
    if !file.starts_with(root.canonicalize().map_err(err)?) || !file.is_file() {
        return Err(err("文件不在知识库中"));
    }
    #[allow(deprecated)]
    app.shell()
        .open(file.to_string_lossy().to_string(), None)
        .map_err(err)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn properties_keep_body_and_custom_fields() {
        let raw = "---\ntitle: 旧标题\ntags:\n  - 旧标签\ncustom:\n  setting: keep\ntype: concept\n---\n# 正文\n原文";
        let text = properties(raw, "带\"引号\"的标题", &["前端".into(), "React".into()]).unwrap();
        assert!(text.contains("custom:\n  setting: keep"));
        let page = vault::parse_page("wiki/concepts/a.md", &text).unwrap();
        assert_eq!(page.body, "# 正文\n原文");
        assert_eq!(page.frontmatter.title, "带\"引号\"的标题");
        assert_eq!(page.frontmatter.tags, vec!["前端", "React"]);
        assert!(properties(raw, "", &[]).is_err());
    }
    #[test]
    fn folders_are_contained_and_include_empty_directories() {
        let root = std::env::temp_dir().join(format!("wiki-folders-{}", uuid::Uuid::new_v4()));
        vault::initialize(&root).unwrap();
        let dir = directory(&root, "wiki/我的面经/待整理").unwrap();
        std::fs::create_dir_all(dir).unwrap();
        assert!(
            folders(&root)
                .unwrap()
                .contains(&"wiki/我的面经/待整理".into())
        );
        assert!(directory(&root, "wiki/../raw").is_err());
        assert!(directory(&root, "raw/source").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
