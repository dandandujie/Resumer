use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Frontmatter {
    pub title: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub tags: Vec<String>,
    pub sources: Vec<String>,
    pub related: Vec<String>,
    pub created: String,
    pub updated: String,
    pub confidence: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Page {
    pub path: String,
    pub frontmatter: Frontmatter,
    pub body: String,
}

/// 页面 frontmatter 与日志统一用本地时间 `YYYY-MM-DDTHH:MM`，Obsidian 里可读、可排序。
pub fn now_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string()
}

/// 文件名只保留字母数字（含中文）与连字符；空结果退回 untitled。
pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for character in value.trim().chars() {
        if character.is_alphanumeric() {
            slug.extend(character.to_lowercase());
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug = slug.trim_end_matches('-').to_string();
    if slug.is_empty() {
        "untitled".into()
    } else {
        slug
    }
}

pub fn validate_path(path: &str) -> Result<(), String> {
    let candidate = Path::new(path);
    if candidate.is_absolute() || path.is_empty() {
        return Err("知识库路径必须是相对路径".into());
    }
    if !path.starts_with("raw/") && !path.ends_with(".md") {
        return Err("wiki 路径必须是 .md 文件".into());
    }
    if candidate
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("知识库路径不允许包含 ..".into());
    }
    let root_page = matches!(path, "purpose.md" | "schema.md" | "index.md" | "log.md");
    if !(root_page || path.starts_with("wiki/") || path.starts_with("raw/")) {
        return Err("知识库路径只能位于根模板、wiki/ 或 raw/".into());
    }
    Ok(())
}

pub fn root_file(root: &Path, relative: &str) -> Result<PathBuf, String> {
    validate_path(relative)?;
    Ok(root.join(relative))
}

/// 提取正文里的 `[[wikilink]]`，去掉 `|别名` 与 `#锚点`，补齐 `.md`。
/// FTS 一跳扩展、图谱、lint 只能用这一份解析，规则才不会漂移。
pub fn wikilinks(body: &str) -> Vec<String> {
    let mut links = Vec::new();
    for part in body.split("[[").skip(1) {
        let Some(raw) = part.split("]]").next() else {
            continue;
        };
        let target = raw.split(['|', '#']).next().unwrap_or("").trim();
        if target.is_empty() || target.contains("..") {
            continue;
        }
        let link = if target.ends_with(".md") || target.starts_with("raw/") {
            target.to_string()
        } else {
            format!("{target}.md")
        };
        if !links.contains(&link) {
            links.push(link);
        }
    }
    links
}

pub fn parse_page(path: &str, content: &str) -> Result<Page, String> {
    // Windows / Obsidian 写出的 CRLF 文件同样要能识别 frontmatter。
    let content = content.replace("\r\n", "\n");
    let (frontmatter, body) = if let Some(rest) = content.strip_prefix("---\n") {
        let (raw, body) = rest
            .split_once("\n---\n")
            .ok_or_else(|| "frontmatter 缺少结束标记".to_string())?;
        (parse_frontmatter(raw), body.to_string())
    } else {
        (Frontmatter::default(), content.to_string())
    };
    Ok(Page {
        path: path.to_string(),
        frontmatter,
        body,
    })
}

fn has_frontmatter(content: &str) -> bool {
    content.starts_with("---\n") || content.starts_with("---\r\n")
}

pub fn parse_frontmatter(raw: &str) -> Frontmatter {
    let mut meta = Frontmatter::default();
    for line in raw.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim().trim_matches('"');
        match key.trim() {
            "title" => meta.title = value.to_string(),
            "type" => meta.page_type = value.to_string(),
            "tags" => meta.tags = parse_list(value),
            "sources" => meta.sources = parse_list(value),
            "related" => meta.related = parse_list(value),
            "created" => meta.created = value.to_string(),
            "updated" => meta.updated = value.to_string(),
            "confidence" => meta.confidence = Some(value.to_string()),
            _ => {}
        }
    }
    meta
}

fn parse_list(value: &str) -> Vec<String> {
    value
        .trim_matches(['[', ']'])
        .split(',')
        .map(|item| item.trim().trim_matches('"').trim_matches('\'').to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

pub fn serialize_page(frontmatter: &Frontmatter, body: &str) -> String {
    let list = |values: &[String]| {
        format!(
            "[{}]",
            values
                .iter()
                .map(|value| format!("\"{}\"", value.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    let confidence = frontmatter
        .confidence
        .as_deref()
        .map(|value| format!("\nconfidence: {value}"))
        .unwrap_or_default();
    format!(
        "---\ntitle: {}\ntype: {}\ntags: {}\nsources: {}\nrelated: {}\ncreated: {}\nupdated: {}{}\n---\n{}",
        frontmatter.title,
        frontmatter.page_type,
        list(&frontmatter.tags),
        list(&frontmatter.sources),
        list(&frontmatter.related),
        frontmatter.created,
        frontmatter.updated,
        confidence,
        body
    )
}

pub fn initialize(root: &Path) -> Result<(), String> {
    for directory in [
        "raw",
        "wiki/skills",
        "wiki/sops",
        "wiki/companies",
        "wiki/roles",
        "wiki/market",
        "wiki/experiences",
        "wiki/sources",
    ] {
        fs::create_dir_all(root.join(directory)).map_err(|error| error.to_string())?;
    }
    write_if_missing(
        root,
        "purpose.md",
        "# 求职目标\n\n## 目标岗位\n\n## 期望城市\n\n## 目标行业\n\n## 硬约束\n\n## 其他\n",
    )?;
    write_if_missing(
        root,
        "schema.md",
        "# 知识库规范\n\n页面使用 YAML-like frontmatter；正文中的 `[[wiki/path]]` 表示关联页面。\
AI 只能提出修改，用户采纳后才写盘。\n",
    )?;
    write_if_missing(root, "index.md", "# 知识库索引\n\n")?;
    write_if_missing(root, "log.md", "# 知识库日志\n\n")?;
    seed_pages(root)?;
    Ok(())
}

fn write_if_missing(root: &Path, relative: &str, content: &str) -> Result<(), String> {
    let path = root.join(relative);
    if !path.exists() {
        fs::write(path, content).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// 种子页标题取正文第一个 `# ` 标题，没有才退回文件名。
fn heading_title(source: &str, filename: &str) -> String {
    source
        .lines()
        .find_map(|line| {
            line.strip_prefix("# ")
                .map(|title| title.trim().to_string())
        })
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| filename.trim_end_matches(".md").replace('-', " "))
}

fn seed_pages(root: &Path) -> Result<(), String> {
    let seeds: [(&str, &str, &str); 9] = [
        (
            "profile-finance.md",
            "skill",
            include_str!("../../skills/profile-finance.md"),
        ),
        (
            "profile-foreign.md",
            "skill",
            include_str!("../../skills/profile-foreign.md"),
        ),
        (
            "profile-internet-tech.md",
            "skill",
            include_str!("../../skills/profile-internet-tech.md"),
        ),
        (
            "profile-manufacturing.md",
            "skill",
            include_str!("../../skills/profile-manufacturing.md"),
        ),
        (
            "profile-product-ops.md",
            "skill",
            include_str!("../../skills/profile-product-ops.md"),
        ),
        (
            "profile-soe.md",
            "skill",
            include_str!("../../skills/profile-soe.md"),
        ),
        (
            "sop-application-form.md",
            "sop",
            include_str!("../../skills/sop-application-form.md"),
        ),
        (
            "sop-jd-tailoring.md",
            "sop",
            include_str!("../../skills/sop-jd-tailoring.md"),
        ),
        (
            "sop-resume-diagnosis.md",
            "sop",
            include_str!("../../skills/sop-resume-diagnosis.md"),
        ),
    ];
    let now = now_stamp();
    for (filename, page_type, source) in seeds {
        let relative = if page_type == "skill" {
            format!("wiki/skills/{filename}")
        } else {
            format!("wiki/sops/{filename}")
        };
        if root.join(&relative).exists() {
            continue;
        }
        let meta = Frontmatter {
            title: heading_title(source, filename),
            page_type: page_type.to_string(),
            created: now.clone(),
            updated: now.clone(),
            ..Frontmatter::default()
        };
        fs::write(root.join(relative), serialize_page(&meta, source))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn read(root: &Path, relative: &str) -> Result<Page, String> {
    let path = root_file(root, relative)?;
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    parse_page(relative, &content)
}

/// 原文读取：编辑器展示/保存必须用原文，否则 Obsidian 写的未知 frontmatter 键会在往返中丢失。
pub fn read_raw(root: &Path, relative: &str) -> Result<String, String> {
    let path = root_file(root, relative)?;
    fs::read_to_string(path).map_err(|error| error.to_string())
}

/// 写入页面。若新内容不带 frontmatter 而旧文件带，则保留旧 frontmatter（只刷新 updated）——
/// AI 提案与 lint 修复只给正文，不能因此把页面元信息抹掉。
pub fn write(root: &Path, relative: &str, content: &str) -> Result<Page, String> {
    let path = root_file(root, relative)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let is_wiki = relative.starts_with("wiki/");
    let content = if is_wiki && !has_frontmatter(content) {
        let mut meta = fs::read_to_string(&path)
            .ok()
            .and_then(|existing| parse_page(relative, &existing).ok())
            .map(|page| page.frontmatter)
            .unwrap_or_default();
        if meta.created.is_empty() {
            meta.created = now_stamp();
        }
        if meta.page_type.is_empty() {
            meta.page_type = infer_type_from_path(relative).to_string();
        }
        meta.updated = now_stamp();
        serialize_page(&meta, content)
    } else {
        content.to_string()
    };
    fs::write(&path, &content).map_err(|error| error.to_string())?;
    parse_page(relative, &content)
}

/// `wiki/<目录>/x.md` 的目录名即页面类型（companies → company）。
pub fn infer_type_from_path(relative: &str) -> &'static str {
    match relative.split('/').nth(1) {
        Some("skills") => "skill",
        Some("sops") => "sop",
        Some("companies") => "company",
        Some("roles") => "role",
        Some("market") => "market",
        Some("experiences") => "experience",
        Some("sources") => "source",
        _ => "note",
    }
}

pub fn list(root: &Path) -> Result<Vec<String>, String> {
    let mut result = vec![
        "purpose.md".to_string(),
        "schema.md".to_string(),
        "index.md".to_string(),
    ];
    for base in ["wiki", "raw"] {
        collect_markdown(&root.join(base), base, &mut result)?;
    }
    result.sort();
    Ok(result)
}

fn collect_markdown(
    directory: &Path,
    prefix: &str,
    result: &mut Vec<String>,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let relative = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() {
            collect_markdown(&path, &relative, result)?;
        } else if path.extension().is_some_and(|extension| extension == "md") {
            result.push(relative);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_crlf_frontmatter() {
        let page = parse_page(
            "wiki/companies/a.md",
            "---\r\ntitle: 字节跳动\r\ntype: company\r\ntags: [\"互联网\"]\r\n---\r\n正文\r\n",
        )
        .unwrap();
        assert_eq!(page.frontmatter.title, "字节跳动");
        assert_eq!(page.frontmatter.tags, vec!["互联网"]);
        assert_eq!(page.body, "正文\n");
    }

    #[test]
    fn extracts_wikilinks_with_alias_anchor_and_missing_extension() {
        let links = wikilinks(
            "见 [[wiki/companies/a.md|字节]] 与 [[wiki/roles/b#要求]]，重复 [[wiki/companies/a.md]]，坏 [[../x]]",
        );
        assert_eq!(links, vec!["wiki/companies/a.md", "wiki/roles/b.md"]);
    }

    #[test]
    fn rejects_paths_outside_vault() {
        assert!(validate_path("../etc/passwd").is_err());
        assert!(validate_path("/tmp/x.md").is_err());
        assert!(validate_path("notes/x.md").is_err());
        assert!(validate_path("wiki/companies/x.md").is_ok());
        assert!(validate_path("raw/a.pdf").is_ok());
    }

    #[test]
    fn body_only_write_keeps_existing_frontmatter() {
        let root = std::env::temp_dir().join(format!("resumer-vault-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("wiki/sops")).unwrap();
        let meta = Frontmatter {
            title: "JD 定制".into(),
            page_type: "sop".into(),
            tags: vec!["sop".into()],
            ..Frontmatter::default()
        };
        write(&root, "wiki/sops/a.md", &serialize_page(&meta, "旧正文")).unwrap();
        let page = write(&root, "wiki/sops/a.md", "新正文").unwrap();
        assert_eq!(page.frontmatter.title, "JD 定制");
        assert_eq!(page.frontmatter.tags, vec!["sop"]);
        assert_eq!(page.body, "新正文");
        assert!(!page.frontmatter.updated.is_empty());
        let fresh = write(&root, "wiki/companies/new.md", "只有正文").unwrap();
        assert_eq!(fresh.frontmatter.page_type, "company");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn slugify_keeps_cjk_and_collapses_separators() {
        assert_eq!(
            slugify("prep-字节跳动 · 后端-20260910"),
            "prep-字节跳动-后端-20260910"
        );
        assert_eq!(slugify("  Acme Corp / Backend  "), "acme-corp-backend");
        assert_eq!(slugify("///"), "untitled");
    }

    #[test]
    fn seed_title_uses_first_heading() {
        assert_eq!(
            heading_title(
                "# 岗位画像：互联网技术岗\n\n正文",
                "profile-internet-tech.md"
            ),
            "岗位画像：互联网技术岗"
        );
        assert_eq!(heading_title("没有标题", "sop-x.md"), "sop x");
    }
}
