use std::fs;
use std::path::Path;

use super::vault::{self, Page};

pub fn rebuild(root: &Path, pages: &[Page]) -> Result<(), String> {
    let mut body = String::from(
        "# 知识库索引\n\n按主题逐层阅读；来源页链接到保留的原件，综合页引用来源页。\n\n",
    );
    let mut sorted = pages
        .iter()
        .filter(|p| p.path.starts_with("wiki/"))
        .collect::<Vec<_>>();
    sorted.sort_by(|a, b| {
        (&a.frontmatter.page_type, &a.frontmatter.title)
            .cmp(&(&b.frontmatter.page_type, &b.frontmatter.title))
    });
    let mut group = String::new();
    for page in sorted {
        if group != page.frontmatter.page_type {
            group = page.frontmatter.page_type.clone();
            body.push_str(&format!("\n## {group}\n\n"));
        }
        let summary = page
            .body
            .lines()
            .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
            .unwrap_or("");
        body.push_str(&format!(
            "- [[{}|{}]] — {} · {}个来源 · {}\n",
            page.path,
            page.frontmatter.title.replace(['|', '\n'], " "),
            summary.chars().take(120).collect::<String>(),
            page.frontmatter.sources.len(),
            page.frontmatter.updated
        ));
    }
    fs::write(root.join("index.md"), body).map_err(|error| error.to_string())
}

pub fn rebuild_from_disk(root: &Path) -> Result<usize, String> {
    let pages = vault::list(root)?
        .into_iter()
        .filter(|path| path.starts_with("wiki/"))
        .map(|path| vault::read(root, &path))
        .collect::<Result<Vec<_>, _>>()?;
    rebuild(root, &pages)?;
    Ok(pages.len())
}
