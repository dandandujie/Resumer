pub mod date;
pub mod docx;
mod docx_fonts;
pub mod inline;
pub mod md;
pub mod pdf;
pub mod txt;

#[cfg(test)]
mod coverage_tests {
    use super::*;
    use serde_json::json;

    /// 输入来自 App 导出对话框的请求快照，不在测试里另造 Word 文档。
    #[test]
    fn export_app_acceptance_capture() {
        let Ok(dir) = std::env::var("RESUMER_APP_EXPORT_DIR") else {
            return;
        };
        let dir = std::path::PathBuf::from(dir);
        let capture: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.join("app-export.json")).unwrap()).unwrap();
        let resume = &capture["resume"];
        let sections = resume["sections"].as_array().unwrap();
        let mut theme: docx::ResolvedTheme =
            serde_json::from_value(capture["requests"]["export_docx"]["theme"].clone()).unwrap();
        theme.template = resume["template"].as_str().unwrap().into();
        docx::generate_docx(
            sections,
            resume["language"].as_str().unwrap(),
            &theme,
            &dir.join("Resumer-完整简历.docx"),
        )
        .unwrap();
        for template in ["classic", "modern"] {
            theme.template = template.into();
            docx::generate_docx(
                sections,
                resume["language"].as_str().unwrap(),
                &theme,
                &dir.join(format!("{template}-final.docx")),
            )
            .unwrap();
        }
        theme.office_fonts.east_asia = "Noto Sans SC".into();
        for template in ["classic", "modern"] {
            theme.template = template.into();
            docx::generate_docx(
                sections,
                resume["language"].as_str().unwrap(),
                &theme,
                &dir.join(format!("{template}-embedded.docx")),
            )
            .unwrap();
        }
        let fonts = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fonts");
        pdf::generate_pdf_from_html(
            capture["requests"]["export_pdf"]["options"]["html"]
                .as_str()
                .unwrap(),
            &dir.join("Resumer-完整简历.pdf"),
            Some(&fonts),
        )
        .unwrap();
    }

    #[test]
    fn text_exports_keep_every_module_and_do_not_consume_bullets() {
        let sections = vec![
            json!({"type":"work_experience","title":"工作","content":{"items":[{"position":"开发","company":"示例","technologies":["Rust"],"highlights":["**第一条**","第二条"]}]}}),
            json!({"type":"projects","title":"项目","content":{"items":[{"name":"项目名","url":"https://example.com/p","startDate":"2022-01","endDate":"2023-02"}]}}),
            json!({"type":"github","title":"开源","content":{"items":[{"name":"repo名","repoUrl":"https://github.com/example/repo","description":"{{spacing=1}}**描述**{{/spacing}}","language":"TypeScript","stars":12}]}}),
            json!({"type":"qr_codes","title":"二维码","content":{"items":[{"label":"作品","url":"https://example.com/qr"}]}}),
        ];
        let txt = txt::generate_plain_text(&sections, date::DateStyle::Dot, "zh");
        let md = md::generate_markdown(&sections, date::DateStyle::Dot, "zh");
        for text in [&txt, &md] {
            for expected in [
                "Rust",
                "第一条",
                "第二条",
                "2022.01",
                "2023.02",
                "repo名",
                "https://github.com/example/repo",
                "描述",
                "TypeScript",
                "12",
                "作品",
                "https://example.com/qr",
            ] {
                assert!(text.contains(expected), "遗漏 {expected}: {text}");
            }
            assert!(!text.contains("{{spacing"));
        }
        assert!(txt.contains("* 第一条\n  * 第二条"));
        assert!(!txt.contains("**"));
        assert!(md.contains("**描述**"));
    }
}
