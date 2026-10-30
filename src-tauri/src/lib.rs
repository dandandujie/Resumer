// Tauri 命令天然是平铺参数，参数数量由前端契约决定，不为此拆结构体。
#![allow(clippy::too_many_arguments)]

mod ai;
mod commands;
mod db;
mod export;
mod import;
mod knowledge;

use db::AppDb;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("reseumer_lib=info"),
    )
    .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            // 上一次「从备份恢复」留下的待替换数据库要在打开连接前换上
            match commands::backup::apply_pending_restore(&app_data_dir) {
                Ok(true) => log::info!("restored database from pending backup"),
                Ok(false) => {}
                Err(error) => log::error!("pending restore failed: {error}"),
            }
            let db_path = app_data_dir.join("reseumer.db");
            let db = AppDb::new(&db_path).expect("failed to initialize database");
            let root =
                knowledge::ensure(app.handle()).expect("failed to initialize knowledge vault");
            knowledge::reindex(&db, &root).expect("failed to index knowledge vault");
            knowledge::index::rebuild_from_disk(&root).expect("failed to write knowledge index");
            app.manage(db);
            app.manage(commands::lifecycle::ExitGuard::default());
            #[cfg(target_os = "macos")]
            commands::lifecycle::install_macos_guard(app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<commands::lifecycle::ExitGuard>();
                if state.ready.load(Ordering::SeqCst) && !state.allowed.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("app-close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::lifecycle::set_exit_guard_ready,
            commands::lifecycle::finish_app_exit,
            commands::document::import_original_docx,
            commands::document::get_original_docx,
            commands::document::save_original_docx,
            commands::document::export_original_docx,
            commands::document::save_docx_copy,
            commands::resume::list_resumes,
            commands::resume::get_resume,
            commands::resume::create_resume,
            commands::resume::update_resume,
            commands::resume::delete_resume,
            commands::resume::duplicate_resume,
            commands::resume::list_resume_versions,
            commands::resume::get_resume_version,
            commands::resume::create_resume_version,
            commands::resume::restore_resume_version,
            commands::resume::rename_resume_version,
            commands::resume::delete_resume_version,
            commands::user::ensure_user,
            commands::user::get_settings,
            commands::user::update_settings,
            commands::ai::ai_list_models,
            commands::ai::ai_test_connection,
            commands::ai::ai_test_search,
            commands::ai::ai_grammar_check,
            commands::ai::ai_cover_letter,
            commands::ai::ai_jd_analysis,
            commands::ai::ai_translate,
            commands::ai::ai_generate_resume,
            commands::ai::ai_fetch_github_repo,
            commands::ai::list_grammar_checks,
            commands::ai::get_grammar_check,
            commands::ai::delete_grammar_check,
            commands::ai::list_jd_analyses,
            commands::ai::get_jd_analysis,
            commands::ai::delete_jd_analysis,
            commands::ai::parse_resume_file,
            commands::chat::list_chat_sessions,
            commands::chat::get_chat_session,
            commands::chat::list_chat_messages,
            commands::chat::create_chat_session,
            commands::chat::delete_chat_session,
            commands::chat::ai_chat,
            commands::chat::cancel_ai_stream,
            commands::chat::truncate_chat_messages,
            commands::interview::interview_chat,
            commands::recordings::recording_list,
            commands::recordings::recording_import,
            commands::recordings::recording_save,
            commands::recordings::recording_open,
            commands::recordings::recording_delete,
            commands::recordings::recording_transcribe,
            commands::recordings::recording_publish,
            commands::recordings::intake_extract,
            commands::workspace::workspace_assist,
            commands::knowledge_ai::library_audio_state,
            commands::knowledge_ai::library_audio_save,
            commands::knowledge_ai::library_audio_transcribe,
            commands::knowledge_ai::knowledge_distill_prepare,
            commands::knowledge_ai::knowledge_drafts,
            commands::knowledge_ai::knowledge_discard_draft,
            commands::knowledge_ai::knowledge_update_draft,
            commands::knowledge_wiki::knowledge_compile_prepare,
            commands::knowledge_wiki::knowledge_apply_draft,
            commands::knowledge_wiki::knowledge_save_answer,
            commands::knowledge_wiki::knowledge_maintain_prepare,
            commands::knowledge_wiki::knowledge_open_vault,
            commands::knowledge_wiki::knowledge_propose_edit,
            commands::journal::list_applications,
            commands::journal::save_application,
            commands::journal::delete_application,
            commands::journal::import_legacy_journal,
            commands::journal::list_mock_interviews,
            commands::journal::create_mock_interview,
            commands::journal::delete_mock_interview,
            commands::export::export_pdf,
            commands::export::export_html,
            commands::export::export_txt,
            commands::export::export_markdown,
            commands::export::export_json,
            commands::export::export_docx,
            commands::backup::backup_create,
            commands::backup::backup_restore,
            commands::backup::app_restart,
            commands::knowledge::library_choose_files,
            commands::knowledge::library_release_picks,
            commands::knowledge::library_import_picked_file,
            commands::knowledge::library_collections,
            commands::knowledge::library_put_collection,
            commands::knowledge::library_assets,
            commands::knowledge::library_import_file,
            commands::knowledge::library_read_asset,
            commands::knowledge::library_search,
            commands::knowledge::library_open_original,
            commands::knowledge_files::knowledge_folders,
            commands::knowledge_files::knowledge_create_folder,
            commands::knowledge_files::knowledge_update_properties,
            commands::knowledge_files::knowledge_open_file,
            commands::knowledge::knowledge_list,
            commands::knowledge::knowledge_read,
            commands::knowledge::knowledge_write,
            commands::knowledge::knowledge_create_page,
            commands::knowledge::knowledge_search,
            commands::knowledge::knowledge_reindex,
            commands::knowledge::knowledge_ingest_file,
            commands::knowledge::knowledge_graph,
            commands::knowledge::knowledge_lint,
            commands::knowledge::knowledge_reflect,
            commands::knowledge::knowledge_strategy_review,
            commands::knowledge::knowledge_interview_prep,
            commands::knowledge::knowledge_purpose,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<commands::lifecycle::ExitGuard>();
                if state.ready.load(Ordering::SeqCst) && !state.allowed.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("app-close-requested", ());
                }
            }
        });
}
