use std::path::PathBuf;
use std::process::Command;

/// Detect a Chromium-family executable able to run `--headless --print-to-pdf`.
/// Any Chromium fork works, so probe broadly (Chrome, Edge, Brave, Vivaldi,
/// Opera, Arc, Chromium) before giving up.
pub fn find_chrome() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        // 国内 Windows 上 Chrome/Edge 多数是按用户安装在 %LOCALAPPDATA%，不能只看 Program Files。
        let roots: Vec<PathBuf> = ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"]
            .iter()
            .filter_map(|key| std::env::var_os(key).map(PathBuf::from))
            .chain([
                PathBuf::from(r"C:\Program Files"),
                PathBuf::from(r"C:\Program Files (x86)"),
            ])
            .collect();
        let relative = [
            r"Google\Chrome\Application\chrome.exe",
            r"Microsoft\Edge\Application\msedge.exe",
            r"BraveSoftware\Brave-Browser\Application\brave.exe",
            r"Vivaldi\Application\vivaldi.exe",
            r"Programs\Opera\opera.exe",
            r"Opera\opera.exe",
            r"Chromium\Application\chrome.exe",
        ];
        roots
            .iter()
            .flat_map(|root| relative.iter().map(move |path| root.join(path)))
            .collect()
    } else if cfg!(target_os = "macos") {
        vec![
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into(),
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge".into(),
            "/Applications/Chromium.app/Contents/MacOS/Chromium".into(),
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser".into(),
            "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi".into(),
            "/Applications/Opera.app/Contents/MacOS/Opera".into(),
            "/Applications/Arc.app/Contents/MacOS/Arc".into(),
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary".into(),
        ]
    } else {
        vec![
            "/usr/bin/google-chrome".into(),
            "/usr/bin/google-chrome-stable".into(),
            "/usr/bin/chromium".into(),
            "/usr/bin/chromium-browser".into(),
            "/usr/bin/microsoft-edge".into(),
            "/usr/bin/brave-browser".into(),
            "/usr/bin/vivaldi".into(),
            "/usr/bin/opera".into(),
            "/snap/bin/chromium".into(),
        ]
    };

    for c in candidates {
        if c.exists() {
            return Some(c);
        }
    }

    // Fallback: try PATH
    for name in [
        "google-chrome",
        "chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "msedge",
        "brave-browser",
        "vivaldi",
        "opera",
    ] {
        if let Ok(path) = which::which(name) {
            return Some(path);
        }
    }
    None
}

/// 为主题引用的内置字体提供离线资源；字体优先级与 App 预览相同。
/// 系统字体的 PDF 表示由打印引擎决定，不能仅凭嵌入成功推断 Office 可编辑性。
fn build_local_font_css(font_dir: &std::path::Path, temp_dir: &std::path::Path) -> Option<String> {
    // (css family name, regular file, optional bold file)
    let families: [(&str, &str, Option<&str>); 3] = [
        (
            "Reseumer Hei",
            "NotoSansSC-Regular.woff2",
            Some("NotoSansSC-Bold.woff2"),
        ),
        (
            "Reseumer Song",
            "NotoSerifSC-Regular.woff2",
            Some("NotoSerifSC-Bold.woff2"),
        ),
        ("Reseumer Kai", "LXGWWenKai-Regular.woff2", None),
    ];
    // Require at least the sans regular; otherwise skip injection entirely.
    if !font_dir.join("NotoSansSC-Regular.woff2").exists() {
        return None;
    }
    let copy_font = |file: &str| -> Option<String> {
        let src = font_dir.join(file);
        if !src.exists() {
            return None;
        }
        let dst = temp_dir.join(format!("reseumer-{}", file));
        std::fs::copy(&src, &dst).ok()?;
        Some(format!(
            "file://{}",
            dst.to_string_lossy().replace('\\', "/")
        ))
    };
    let mut css = String::from("<style>\n");
    for (family, regular, bold) in families {
        let Some(reg_url) = copy_font(regular) else {
            continue;
        };
        css.push_str(&format!(
            "@font-face{{font-family:'{family}';font-weight:100 500;font-style:normal;src:url('{reg_url}') format('woff2');}}\n"
        ));
        // Use a real bold file when available; otherwise reuse regular (Chrome
        // synthesizes bold) so 600-900 weights still resolve to this family.
        let bold_url = bold.and_then(copy_font).unwrap_or_else(|| reg_url.clone());
        css.push_str(&format!(
            "@font-face{{font-family:'{family}';font-weight:600 900;font-style:normal;src:url('{bold_url}') format('woff2');}}\n"
        ));
    }
    css.push_str("</style>");
    Some(css)
}

pub fn generate_pdf_from_html(
    html: &str,
    output_path: &std::path::Path,
    font_dir: Option<&std::path::Path>,
) -> Result<(), String> {
    // Stable CHROME_NOT_FOUND prefix lets the frontend detect this case and
    // show a localized, actionable message.
    let chrome = find_chrome().ok_or_else(|| {
        "CHROME_NOT_FOUND: no Chromium-family browser found for PDF rendering.".to_string()
    })?;

    // Write HTML to a temp file
    let temp_dir = std::env::temp_dir();

    // Inject local embeddable CJK fonts into <head> (see build_local_font_css).
    let html = match font_dir.and_then(|d| build_local_font_css(d, &temp_dir)) {
        Some(font_css) => {
            if let Some(pos) = html.find("</head>") {
                let mut out = String::with_capacity(html.len() + font_css.len());
                out.push_str(&html[..pos]);
                out.push_str(&font_css);
                out.push_str(&html[pos..]);
                out
            } else {
                format!("{}{}", font_css, html)
            }
        }
        None => html.to_string(),
    };
    let html = html.as_str();

    let html_path = temp_dir.join(format!("reseumer-{}.html", uuid::Uuid::new_v4()));
    std::fs::write(&html_path, html).map_err(|e| format!("Failed to write temp HTML: {}", e))?;

    let file_url = format!("file://{}", html_path.to_string_lossy().replace('\\', "/"));
    let pdf_arg = format!("--print-to-pdf={}", output_path.to_string_lossy());

    let mut command = Command::new(&chrome);
    // Windows 上从 GUI 进程 spawn 子进程会闪出一个黑色控制台窗口。
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .args([
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--hide-scrollbars",
            "--print-to-pdf-no-header",
            // Wait for the (embeddable) web fonts to finish loading before
            // printing. Without this, Chrome prints too early and falls back to
            // the OS system font, which it CANNOT embed → it rasterizes text as
            // Type3 fonts (uneditable). Advancing virtual time + draining the
            // compositor makes the real fonts load and embed as proper TrueType.
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=10000",
            "--font-render-hinting=none",
            // Allow the file:// export HTML to load the sibling font files.
            "--allow-file-access-from-files",
            &pdf_arg,
            &file_url,
        ])
        .output()
        .map_err(|e| format!("Failed to launch Chrome: {}", e))?;

    let _ = std::fs::remove_file(&html_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Chrome export failed: {}", stderr));
    }

    if !output_path.exists() {
        return Err("PDF was not generated".into());
    }

    Ok(())
}
