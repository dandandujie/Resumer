use std::fs;
use std::path::Path;

use super::vault::{self, Page};

pub fn rebuild(root: &Path, pages: &[Page]) -> Result<(), String> {
    let mut body = String::from("# 知识库索引\n\n");
    for page in pages {
        if page.path.starts_with("wiki/") {
            let summary = page
                .body
                .lines()
                .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
                .unwrap_or("");
            body.push_str(&format!(
                "- [[{}]] — {} — {}\n",
                page.path,
                page.frontmatter.page_type,
                summary.chars().take(120).collect::<String>()
            ));
        }
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
