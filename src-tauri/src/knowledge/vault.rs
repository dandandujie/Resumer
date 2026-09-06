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

pub fn parse_page(path: &str, content: &str) -> Result<Page, String> {
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
        "# 求职目标\n\n- 目标岗位：\n- 目标城市：\n- 目标行业：\n- 薪资与硬约束：\n",
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

fn seed_pages(root: &Path) -> Result<(), String> {
    let seeds = [
        ("profile-finance.md", "skill"),
        ("profile-foreign.md", "skill"),
        ("profile-internet-tech.md", "skill"),
        ("profile-manufacturing.md", "skill"),
        ("profile-product-ops.md", "skill"),
        ("profile-soe.md", "skill"),
        ("sop-application-form.md", "sop"),
        ("sop-jd-tailoring.md", "sop"),
        ("sop-resume-diagnosis.md", "sop"),
    ];
    for (filename, page_type) in seeds {
        let source = include_str!(concat!("../../skills/", "profile-finance.md"));
        let source = match filename {
            "profile-finance.md" => source,
            "profile-foreign.md" => include_str!("../../skills/profile-foreign.md"),
            "profile-internet-tech.md" => include_str!("../../skills/profile-internet-tech.md"),
            "profile-manufacturing.md" => include_str!("../../skills/profile-manufacturing.md"),
            "profile-product-ops.md" => include_str!("../../skills/profile-product-ops.md"),
            "profile-soe.md" => include_str!("../../skills/profile-soe.md"),
            "sop-application-form.md" => include_str!("../../skills/sop-application-form.md"),
            "sop-jd-tailoring.md" => include_str!("../../skills/sop-jd-tailoring.md"),
            _ => include_str!("../../skills/sop-resume-diagnosis.md"),
        };
        let relative = if page_type == "skill" {
            format!("wiki/skills/{filename}")
        } else {
            format!("wiki/sops/{filename}")
        };
        if !root.join(&relative).exists() {
            let title = filename.trim_end_matches(".md").replace('-', " ");
            let meta = Frontmatter {
                title,
                page_type: page_type.to_string(),
                ..Frontmatter::default()
            };
            fs::write(root.join(relative), serialize_page(&meta, source))
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn read(root: &Path, relative: &str) -> Result<Page, String> {
    let path = root_file(root, relative)?;
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    parse_page(relative, &content)
}

pub fn write(root: &Path, relative: &str, content: &str) -> Result<Page, String> {
    let path = root_file(root, relative)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, content).map_err(|error| error.to_string())?;
    parse_page(relative, content)
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
