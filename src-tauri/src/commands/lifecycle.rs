use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, State};

#[derive(Default)]
pub struct ExitGuard {
    pub ready: AtomicBool,
    pub allowed: AtomicBool,
}
#[tauri::command]
pub fn set_exit_guard_ready(state: State<ExitGuard>, ready: bool) {
    state.ready.store(ready, Ordering::SeqCst);
}
#[tauri::command]
pub fn finish_app_exit(app: AppHandle, state: State<ExitGuard>) {
    state.allowed.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// macOS 的系统「退出」直接调用 NSApplication.terminate，不经过 Tauri 的 ExitRequested。
/// 在现有应用委托上补上标准的 applicationShouldTerminate:，覆盖菜单、Cmd+Q 和 Dock 退出。
#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::{
        ffi::{c_char, c_void},
        sync::OnceLock,
    };
    use tauri::{Emitter, Manager};
    static APP: OnceLock<AppHandle> = OnceLock::new();
    #[link(name = "objc")]
    unsafe extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn object_getClass(object: *mut c_void) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
        fn class_addMethod(
            class: *mut c_void,
            selector: *mut c_void,
            implementation: *const c_void,
            types: *const c_char,
        ) -> bool;
    }
    extern "C" fn should_terminate(_: *mut c_void, _: *mut c_void, _: *mut c_void) -> usize {
        if let Some(app) = APP.get() {
            let state = app.state::<ExitGuard>();
            if state.ready.load(Ordering::SeqCst) && !state.allowed.load(Ordering::SeqCst) {
                let _ = app.emit("app-close-requested", ());
                return 0; // NSTerminateCancel；确认后由 finish_app_exit 重新发起受控退出。
            }
        }
        1 // NSTerminateNow
    }
    pub fn install(app: &AppHandle) -> Result<(), String> {
        APP.set(app.clone())
            .map_err(|_| "退出保护已经安装".to_string())?;
        // setup 在主线程执行；仅发送无参数、返回 Objective-C 对象的标准消息。
        unsafe {
            let send: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            let application = send(
                objc_getClass(c"NSApplication".as_ptr()),
                sel_registerName(c"sharedApplication".as_ptr()),
            );
            if application.is_null() {
                return Err("无法取得 macOS 应用实例".into());
            }
            let delegate = send(application, sel_registerName(c"delegate".as_ptr()));
            if delegate.is_null() {
                return Err("无法取得 macOS 应用委托".into());
            }
            let installed = class_addMethod(
                object_getClass(delegate),
                sel_registerName(c"applicationShouldTerminate:".as_ptr()),
                should_terminate as *const () as *const c_void,
                c"Q@:@".as_ptr(),
            );
            if !installed {
                return Err("无法安装 macOS 退出确认".into());
            }
        }
        Ok(())
    }
}
#[cfg(target_os = "macos")]
pub use macos::install as install_macos_guard;
