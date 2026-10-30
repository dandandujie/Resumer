use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};

use super::{CommandError, cfg_from};
use crate::ai::provider::ChatMessage;
use crate::ai::{prompts, provider};
use crate::db::AppDb;
use crate::db::repo::{journal as journal_repo, resume as resume_repo, version as version_repo};
use crate::knowledge;

/// 送给摘要模型的最大字符数（约 8–10K token）；原始资料本身不截断。
const INGEST_TEXT_CHARS: usize = 12_000;

fn error(message: String) -> CommandError {
    CommandError { message }
}

#[tauri::command]
pub fn knowledge_list(
    app: AppHandle,
    kind: Option<String>,
) -> Result<Vec<knowledge::PageSummary>, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::summaries(&root, kind.as_deref()).map_err(error)
}

#[tauri::command]
pub fn knowledge_read(app: AppHandle, path: String) -> Result<String, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::vault::read_raw(&root, &path).map_err(error)
}

#[tauri::command]
pub fn knowledge_write(
    app: AppHandle,
    db: State<'_, AppDb>,
    path: String,
    content: String,
    expected: Option<String>,
) -> Result<(), CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    if let Some(expected) = expected {
        let current = knowledge::vault::read_raw(&root, &path).map_err(error)?;
        if current != expected {
            return Err(error(
                "笔记已在其他编辑器更新，请重新读取后再保存；当前草稿仍保留".into(),
            ));
        }
    }
    knowledge::write_page(&db, &root, &path, &content).map_err(error)
}

/// 由前端表单/实体提案新建页面：frontmatter 与时间戳由 Rust 统一生成，前端不拼 YAML。
#[tauri::command]
pub fn knowledge_create_page(
    app: AppHandle,
    db: State<'_, AppDb>,
    path: String,
    title: String,
    kind: String,
    body: String,
    sources: Option<Vec<String>>,
) -> Result<(), CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    if root.join(&path).exists() {
        return Err(error(format!("页面已存在：{path}")));
    }
    let now = knowledge::vault::now_stamp();
    let meta = knowledge::vault::Frontmatter {
        title: title.trim().to_string(),
        page_type: kind,
        sources: sources.unwrap_or_default(),
        created: now.clone(),
        updated: now,
        ..knowledge::vault::Frontmatter::default()
    };
    let content = knowledge::vault::serialize_page(&meta, body.trim_start());
    knowledge::write_page(&db, &root, &path, &content).map_err(error)
}

#[tauri::command]
pub fn knowledge_search(
    app: AppHandle,
    db: State<'_, AppDb>,
    query: String,
    kind: Option<String>,
    limit: Option<usize>,
    expand: Option<bool>,
) -> Result<Vec<knowledge::fts::SearchHit>, CommandError> {
    knowledge::ensure(&app).map_err(error)?;
    let conn = db
        .conn
        .lock()
        .map_err(|error| error.to_string())
        .map_err(error)?;
    knowledge::fts::search_with_options(
        &conn,
        &query,
        kind.as_deref(),
        limit.unwrap_or(8),
        expand.unwrap_or(true),
    )
    .map_err(error)
}

#[tauri::command]
pub fn knowledge_reindex(app: AppHandle, db: State<'_, AppDb>) -> Result<usize, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let count = knowledge::reindex(&db, &root).map_err(error)?;
    knowledge::index::rebuild_from_disk(&root).map_err(error)?;
    Ok(count)
}

#[tauri::command]
pub async fn knowledge_ingest_file(
    app: AppHandle,
    db: State<'_, AppDb>,
    config: Value,
    bytes: Vec<u8>,
    filename: String,
) -> Result<knowledge::IngestResult, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let cfg = cfg_from(config)?;
    let _queue = knowledge::ingest_queue().lock().await;
    knowledge::ingest_with_generator(&db, &root, &bytes, &filename, move |text| async move {
        let schema = "{title, tags, summary, entities:[{type, title, content}]}";
        // 原文完整保存在 raw/，送模型的只截前 INGEST_TEXT_CHARS 字符：摘要不需要全文，超长会撑爆上下文。
        let excerpt: String = text.chars().take(INGEST_TEXT_CHARS).collect();
        let truncated = if excerpt.chars().count() < text.chars().count() {
            "\n（资料过长，以上为节选）"
        } else {
            ""
        };
        let prompt = format!(
            "请从以下资料生成严格 JSON {schema}，entities.type 只能是 company、role 或 market。\n资料：\n{excerpt}{truncated}"
        );
        let request = provider::GenerateRequest {
            config: &cfg,
            system: Some("你是知识库整理助手，只输出 JSON，不要编造资料外的信息。"),
            messages: &[ChatMessage {
                role: "user".into(),
                content: prompt,
            }],
            tools: None,
            json_mode: true,
            max_tokens: Some(2048),
        };
        let generated = provider::generate(request)
            .await
            .map_err(|error| error.to_string())?;
        serde_json::from_str::<knowledge::SourceSummary>(&generated.text)
            .map_err(|error| format!("知识库摘要 JSON 无效: {error}"))
    })
    .await
    .map_err(error)
}

#[tauri::command]
pub fn knowledge_lint(app: AppHandle) -> Result<knowledge::KnowledgeLintOutput, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let output = knowledge::lint(&root).map_err(error)?;
    emit_proposals(&app, &output.proposals, None);
    Ok(output)
}

#[tauri::command]
pub fn knowledge_graph(app: AppHandle) -> Result<knowledge::graph::KnowledgeGraph, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    knowledge::graph::build(&root).map_err(error)
}

fn emit_proposals(
    app: &AppHandle,
    proposals: &[knowledge::KnowledgeProposal],
    application_id: Option<&str>,
) {
    for proposal in proposals {
        let _ = app.emit(
            "ai-chat-event",
            json!({
                "streamId": "",
                "event": {
                    "type": "knowledgeProposal",
                    "path": proposal.path,
                    "content": proposal.new_content,
                    "reason": proposal.reason,
                    "proposalId": uuid::Uuid::new_v4().to_string(),
                    "applicationId": application_id,
                    "source": if application_id.is_none() { Some("knowledge") } else { None }
                }
            }),
        );
    }
}

fn reflect_context(db: &AppDb, application_id: &str) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|error| error.to_string())?;
    let application = journal_repo::find_application(&conn, application_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "投递记录不存在".to_string())?;
    // 优先用投递时关联的版本；旧数据没有关联则退回投递日期前最近的快照。
    let snapshot = match application.resume_id.as_deref() {
        Some(resume_id) => version_repo::snapshot_for_application(
            &conn,
            resume_id,
            application.resume_version_id.as_deref(),
            &application.applied_date,
        )
        .map_err(|error| error.to_string())?,
        None => None,
    };
    let current = application.resume_id.as_deref().and_then(|id| {
        resume_repo::find_by_id_any(&conn, id)
            .ok()
            .flatten()
            .and_then(|resume| serde_json::to_string(&resume).ok())
    });
    let search_text = format!("{} {}", application.company, application.role);
    let local_hits = knowledge::fts::search(&conn, &search_text, None, 8)
        .map(|hits| serde_json::to_string(&hits).unwrap_or_default())
        .unwrap_or_default();
    Ok(format!(
        "投递记录：{}\n简历快照：{}\n当前简历：{}\n面试与结果：{}\n相关知识：{}",
        serde_json::to_string(&application).unwrap_or_default(),
        snapshot.unwrap_or_default(),
        current.unwrap_or_default(),
        format_args!(
            "{}\n录音原始素材（识别稿须审慎引用）：{}",
            application.interviews,
            super::recordings::context(&conn, application_id).unwrap_or_default()
        ),
        format_args!(
            "{}\n资料原文：{}",
            local_hits,
            serde_json::to_string(
                &knowledge::library::search(&conn, &search_text, None, None, None, 8)
                    .unwrap_or_default()
            )
            .unwrap_or_default()
        )
    ))
}

async fn generate_json(config: Value, system: String, prompt: String) -> Result<String, String> {
    let cfg = cfg_from(config).map_err(|error| error.message)?;
    let request = provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &[ChatMessage {
            role: "user".into(),
            content: prompt,
        }],
        tools: None,
        json_mode: true,
        max_tokens: Some(4096),
    };
    provider::generate(request)
        .await
        .map(|response| response.text)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn knowledge_reflect(
    app: AppHandle,
    db: State<'_, AppDb>,
    application_id: String,
    config: Value,
) -> Result<knowledge::ReflectOutput, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let context = reflect_context(&db, &application_id).map_err(error)?;
    let (system, prompt) = prompts::knowledge_reflect_prompt(&context);
    let raw = generate_json(config, system, prompt).await.map_err(error)?;
    let output = knowledge::reflect_from_json(&db, &root, &raw).map_err(error)?;
    emit_proposals(&app, &output.proposals, Some(&application_id));
    Ok(output)
}

/// 面试准备包：与复盘共用一套事实收集，只是提示词与落点不同。写入 wiki/experiences/prep-*.md 并进 FTS。
#[tauri::command]
pub async fn knowledge_interview_prep(
    app: AppHandle,
    db: State<'_, AppDb>,
    application_id: String,
    config: Value,
    language: Option<String>,
) -> Result<knowledge::ExperiencePage, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let application = {
        let conn = db.conn.lock().map_err(|e| error(e.to_string()))?;
        journal_repo::find_application(&conn, &application_id)
            .map_err(|e| error(e.to_string()))?
            .ok_or_else(|| error("投递记录不存在".to_string()))?
    };
    let context = reflect_context(&db, &application_id).map_err(error)?;
    let lang = language.unwrap_or_else(|| "zh".into());
    let (system, prompt) = prompts::interview_prep_prompt(&context, &lang);
    let cfg = cfg_from(config)?;
    let request = provider::GenerateRequest {
        config: &cfg,
        system: Some(&system),
        messages: &[ChatMessage {
            role: "user".into(),
            content: prompt,
        }],
        tools: None,
        json_mode: false,
        max_tokens: Some(4096),
    };
    let body = provider::generate(request)
        .await
        .map_err(|e| error(e.to_string()))?
        .text;
    let body = body
        .trim()
        .trim_start_matches("```markdown")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    if body.is_empty() {
        return Err(error("模型没有返回准备单内容".to_string()));
    }
    let target = [application.company.as_str(), application.role.as_str()]
        .iter()
        .filter(|part| !part.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(" · ");
    let slug = knowledge::vault::slugify(&format!(
        "prep-{}-{}",
        target,
        chrono::Local::now().format("%Y%m%d")
    ));
    let path = format!("wiki/experiences/{slug}.md");
    let title = if lang == "en" {
        format!("Interview prep: {target}")
    } else {
        format!("面试准备：{target}")
    };
    let now = knowledge::vault::now_stamp();
    let meta = knowledge::vault::Frontmatter {
        title,
        page_type: "experience".into(),
        tags: vec!["interview-prep".into()],
        sources: vec![format!("application:{application_id}")],
        created: now.clone(),
        updated: now,
        ..knowledge::vault::Frontmatter::default()
    };
    let content = knowledge::vault::serialize_page(&meta, &format!("{body}\n"));
    knowledge::write_page(&db, &root, &path, &content).map_err(error)?;
    Ok(knowledge::ExperiencePage { path, content })
}

#[tauri::command]
pub async fn knowledge_strategy_review(
    app: AppHandle,
    db: State<'_, AppDb>,
    config: Value,
) -> Result<knowledge::StrategyOutput, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    let (applications, pages) = {
        let conn = db
            .conn
            .lock()
            .map_err(|error| error.to_string())
            .map_err(error)?;
        let applications = journal_repo::list_applications(&conn)
            .map_err(|error| error.to_string())
            .map_err(error)?;
        let finished = applications
            .iter()
            .filter(|application| {
                matches!(
                    application.status.as_str(),
                    "offer" | "rejected" | "declined" | "ghosted"
                )
            })
            .count();
        if finished < 5 {
            return Err(error("至少需要 5 条已结束投递才能生成策略回顾".into()));
        }
        let pages = knowledge::vault::list(&root)
            .map_err(error)?
            .into_iter()
            .filter(|path| path.starts_with("wiki/experiences/"))
            .map(|path| {
                knowledge::vault::read(&root, &path).map(|page| format!("{}\n{}", path, page.body))
            })
            .collect::<Result<Vec<_>, _>>()?;
        (applications, pages)
    };
    let context = format!(
        "投递统计：{}\n经验页：{}",
        serde_json::to_string(&applications).unwrap_or_default(),
        pages.join("\n\n")
    );
    let (system, prompt) = prompts::knowledge_strategy_review_prompt(&context);
    let output = generate_json(config, system, prompt)
        .await
        .map_err(error)
        .and_then(|text| {
            serde_json::from_str::<knowledge::StrategyOutput>(&text).map_err(|error| CommandError {
                message: format!("策略回顾 JSON 无效: {error}"),
            })
        })?;
    knowledge::write_strategy(&db, &root, &output).map_err(error)?;
    emit_proposals(&app, std::slice::from_ref(&output.purpose_proposal), None);
    Ok(output)
}

#[tauri::command]
pub fn knowledge_purpose(app: AppHandle) -> Result<String, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    std::fs::read_to_string(root.join("purpose.md"))
        .map_err(|error| error.to_string())
        .map_err(error)
}

#[cfg(test)]
mod tests {
    use super::reflect_context;
    use crate::db::AppDb;

    #[test]
    fn reflect_context_collects_application_facts() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate::run(&conn).unwrap();
        conn.execute("INSERT INTO users (id) VALUES ('user-1')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO resumes (id, user_id, title) VALUES ('resume-1', 'user-1', '简历')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO applications (id, resume_id, company, role, jd, interviews, outcome, applied_date)
             VALUES ('app-1', 'resume-1', '星河科技', '后端工程师', 'JD事实', '[{\"round\":\"一面\"}]', '{\"result\":\"rejected\"}', '2025-01-01')",
            [],
        ).unwrap();
        let db = AppDb {
            conn: std::sync::Mutex::new(conn),
        };
        let context = reflect_context(&db, "app-1").unwrap();
        assert!(context.contains("星河科技"));
        assert!(context.contains("JD事实"));
        assert!(context.contains("一面"));
    }
}

#[tauri::command]
pub fn library_collections(
    db: State<AppDb>,
) -> Result<Vec<knowledge::library::Collection>, CommandError> {
    knowledge::library::collections(&*db.conn.lock().map_err(|e| error(e.to_string()))?, false)
        .map_err(error)
}
#[tauri::command]
pub fn library_put_collection(
    db: State<AppDb>,
    id: Option<String>,
    title: String,
    purpose: String,
    category: String,
    kind: String,
    enabled: bool,
    tags: Option<Vec<String>>,
) -> Result<String, CommandError> {
    knowledge::library::put_collection_tags(
        &*db.conn.lock().map_err(|e| error(e.to_string()))?,
        id.as_deref(),
        &title,
        &purpose,
        &category,
        &kind,
        enabled,
        Some(&tags.unwrap_or_else(|| {
            if category.trim().is_empty() {
                vec![]
            } else {
                vec![category.clone()]
            }
        })),
    )
    .map_err(error)
}
#[tauri::command]
pub fn library_assets(
    db: State<AppDb>,
    collection_id: String,
) -> Result<Vec<knowledge::library::Asset>, CommandError> {
    knowledge::library::assets(
        &*db.conn.lock().map_err(|e| error(e.to_string()))?,
        &collection_id,
    )
    .map_err(error)
}
#[tauri::command]
pub async fn library_import_file(
    app: AppHandle,
    collection_id: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<knowledge::library::Asset, CommandError> {
    let root = knowledge::ensure(&app).map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let db = app.state::<AppDb>();
        let mut conn = db.conn.lock().map_err(|e| error(e.to_string()))?;
        knowledge::library::import(&mut conn, &root, &collection_id, &filename, &bytes)
            .map_err(error)
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
#[tauri::command]
pub fn library_read_asset(
    db: State<AppDb>,
    asset_id: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Value, CommandError> {
    knowledge::library::read(
        &*db.conn.lock().map_err(|e| error(e.to_string()))?,
        &asset_id,
        offset.unwrap_or(0),
        limit.unwrap_or(6000),
        false,
    )
    .map_err(error)
}
#[tauri::command]
pub fn library_search(
    db: State<AppDb>,
    query: String,
    collection_id: Option<String>,
    category: Option<String>,
    kind: Option<String>,
    tags: Option<Vec<String>>,
    tag_match: Option<String>,
    untagged: Option<bool>,
) -> Result<Vec<Value>, CommandError> {
    knowledge::library::search_tagged(
        &*db.conn.lock().map_err(|e| error(e.to_string()))?,
        &query,
        collection_id.as_deref(),
        &tags.unwrap_or_else(|| {
            category
                .as_ref()
                .filter(|s| !s.is_empty())
                .cloned()
                .into_iter()
                .collect()
        }),
        tag_match.as_deref().unwrap_or("all"),
        untagged.unwrap_or(category.as_deref() == Some("")),
        kind.as_deref(),
        12,
    )
    .map_err(error)
}
#[tauri::command]
pub fn library_open_original(
    app: AppHandle,
    db: State<AppDb>,
    asset_id: String,
) -> Result<(), CommandError> {
    use tauri_plugin_shell::ShellExt;
    let root = knowledge::ensure(&app).map_err(error)?;
    let conn = db.conn.lock().map_err(|e| error(e.to_string()))?;
    let path: String = conn.query_row(
        "SELECT storage_path FROM knowledge_assets WHERE id=?1",
        [asset_id],
        |r| r.get(0),
    )?;
    let path = root
        .join(path)
        .canonicalize()
        .map_err(|e| error(e.to_string()))?;
    if !path.starts_with(root.canonicalize().map_err(|e| error(e.to_string()))?) {
        return Err(error("文件路径无效".into()));
    }
    #[allow(deprecated)]
    app.shell()
        .open(path.to_string_lossy().to_string(), None)
        .map_err(|e| error(e.to_string()))
}

// 原生选择器返回临时票据，不把任意磁盘路径读取能力暴露给前端。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedLibraryFile {
    token: String,
    name: String,
    size: u64,
    last_modified: u64,
}
static LIBRARY_PICKS: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, std::path::PathBuf>>,
> = std::sync::OnceLock::new();
fn library_picks()
-> &'static std::sync::Mutex<std::collections::HashMap<String, std::path::PathBuf>> {
    LIBRARY_PICKS.get_or_init(Default::default)
}
#[tauri::command]
pub async fn library_choose_files(
    app: AppHandle,
    kind: String,
) -> Result<Vec<PickedLibraryFile>, CommandError> {
    use tauri_plugin_dialog::DialogExt;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let extensions = match kind.as_str() {
        "skill" => vec!["md", "zip"],
        "document" => vec![
            "pdf", "docx", "csv", "xlsx", "md", "txt", "mp3", "m4a", "wav", "mp4", "webm", "ogg",
            "flac",
        ],
        _ => return Err(error("资料类型无效".into())),
    };
    app.dialog()
        .file()
        .set_title("选择同一主题的资料（可多选）")
        .add_filter("支持的资料", &extensions)
        .pick_files(move |files| {
            let _ = sender.send(files);
        });
    let selected = receiver
        .await
        .map_err(|e| error(e.to_string()))?
        .unwrap_or_default();
    if selected.len() > 100 {
        return Err(error("一次最多选择 100 个文件".into()));
    }
    let mut files = Vec::new();
    let mut picks = library_picks().lock().map_err(|e| error(e.to_string()))?;
    if picks.len() + selected.len() > 300 {
        return Err(error("待处理文件过多，请完成当前导入再继续".into()));
    }
    for file in selected {
        let path = file.into_path().map_err(|e| error(e.to_string()))?;
        let metadata = std::fs::metadata(&path).map_err(|e| error(e.to_string()))?;
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| error("文件名无法识别".into()))?
            .to_string();
        let token = uuid::Uuid::new_v4().to_string();
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|time| time.as_millis() as u64)
            .unwrap_or(0);
        files.push(PickedLibraryFile {
            token: token.clone(),
            name,
            size: metadata.len(),
            last_modified,
        });
        picks.insert(token, path);
    }
    Ok(files)
}
#[tauri::command]
pub fn library_release_picks(tokens: Vec<String>) {
    if let Ok(mut picks) = library_picks().lock() {
        for token in tokens {
            picks.remove(&token);
        }
    }
}
#[tauri::command]
pub async fn library_import_picked_file(
    app: AppHandle,
    collection_id: String,
    token: String,
) -> Result<knowledge::library::Asset, CommandError> {
    let path = library_picks()
        .lock()
        .map_err(|e| error(e.to_string()))?
        .get(&token)
        .cloned()
        .ok_or_else(|| error("文件选择已失效，请重新选择".into()))?;
    let root = knowledge::ensure(&app).map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        use tauri::Manager;
        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| error("文件名无效".into()))?;
        let mut bytes = Vec::new();
        std::fs::File::open(&path)
            .map_err(|e| error(e.to_string()))?
            .take((knowledge::library::file_limit(filename) + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|e| error(e.to_string()))?;
        if bytes.len() > knowledge::library::file_limit(filename) {
            return Err(error("文档最大30 MB，录音最大250 MB".into()));
        }
        let db = app.state::<AppDb>();
        let mut conn = db.conn.lock().map_err(|e| error(e.to_string()))?;
        let result = knowledge::library::import(&mut conn, &root, &collection_id, filename, &bytes)
            .map_err(error)?;
        if matches!(
            result.status.as_str(),
            "ready" | "needs_transcription" | "needs_distillation"
        ) && let Ok(mut picks) = library_picks().lock()
        {
            picks.remove(&token);
        }
        Ok(result)
    })
    .await
    .map_err(|e| error(e.to_string()))?
}
