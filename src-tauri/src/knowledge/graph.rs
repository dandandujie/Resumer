use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Serialize;

use super::vault;

#[derive(Debug, Clone, Serialize)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub node_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub edge_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

pub fn build(root: &Path) -> Result<KnowledgeGraph, String> {
    let paths = vault::list(root)?
        .into_iter()
        .filter(|path| path.starts_with("wiki/"))
        .collect::<Vec<_>>();
    let pages = paths
        .iter()
        .map(|path| vault::read(root, path).map(|page| (path.clone(), page)))
        .collect::<Result<Vec<_>, _>>()?;
    let known = pages
        .iter()
        .map(|(path, _)| path.as_str())
        .collect::<HashSet<_>>();
    let source_pages = pages
        .iter()
        .flat_map(|(path, page)| {
            page.frontmatter
                .sources
                .iter()
                .map(move |source| (source, path))
        })
        .collect::<HashMap<_, _>>();
    let nodes = pages
        .iter()
        .map(|(path, page)| GraphNode {
            id: path.clone(),
            title: page.frontmatter.title.clone(),
            node_type: page.frontmatter.page_type.clone(),
        })
        .collect::<Vec<_>>();
    let mut edges = Vec::new();
    for (path, page) in &pages {
        for target in vault::wikilinks(&page.body) {
            if known.contains(target.as_str()) && &target != path {
                edges.push(GraphEdge {
                    source: path.clone(),
                    target,
                    edge_type: "wikilink".into(),
                });
            }
        }
        for related in &page.frontmatter.related {
            if known.contains(related.as_str()) {
                edges.push(GraphEdge {
                    source: path.clone(),
                    target: related.clone(),
                    edge_type: "related".into(),
                });
            }
        }
        for source in &page.frontmatter.sources {
            // 每个 source 页自己也声明了 sources，跳过自环。
            if let Some(source_page) = source_pages.get(source).filter(|origin| **origin != path) {
                edges.push(GraphEdge {
                    source: (*source_page).clone(),
                    target: path.clone(),
                    edge_type: "source".into(),
                });
            }
        }
    }
    Ok(KnowledgeGraph { nodes, edges })
}
