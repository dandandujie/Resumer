mod ai;
mod commands;
mod db;
mod export;
mod import;
mod knowledge;

use db::AppDb;
use tauri::Manager;

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

            let db_path = app_data_dir.join("reseumer.db");
            let db = AppDb::new(&db_path).expect("failed to initialize database");
            let root =
                knowledge::ensure(&app.handle()).expect("failed to initialize knowledge vault");
            knowledge::reindex(&db, &root).expect("failed to index knowledge vault");
            knowledge::index::rebuild_from_disk(&root).expect("failed to write knowledge index");
            app.manage(db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::resume::list_resumes,
            commands::resume::get_resume,
            commands::resume::create_resume,
            commands::resume::update_resume,
            commands::resume::delete_resume,
            commands::resume::duplicate_resume,
            commands::user::ensure_user,
            commands::user::get_settings,
            commands::user::update_settings,
            commands::ai::ai_list_models,
            commands::ai::ai_test_connection,
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
            commands::knowledge::knowledge_list,
            commands::knowledge::knowledge_read,
            commands::knowledge::knowledge_write,
            commands::knowledge::knowledge_search,
            commands::knowledge::knowledge_reindex,
            commands::knowledge::knowledge_ingest_file,
            commands::knowledge::knowledge_graph,
            commands::knowledge::knowledge_lint,
            commands::knowledge::knowledge_reflect,
            commands::knowledge::knowledge_strategy_review,
            commands::knowledge::knowledge_purpose,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
