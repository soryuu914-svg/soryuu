// 原生菜单栏已改为 React 自定义菜单（src/components/AppMenuBar.tsx）。
// MenuBuilder / SubmenuBuilder / DialogExt 随之下方注释块一起停用，回滚时从注释块恢复并还原这里的导入：
//   menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder} + use tauri_plugin_dialog::DialogExt;
use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, WindowEvent,
};

/// 自定义命令：前端自定义菜单的「退出」
/// （未安装 tauri-plugin-process，用 app 命令替代；X 关闭走隐藏到托盘，这里才是真退出）
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
  app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // ⚠️ 插件注册顺序有硬约束，勿随意调换：
    //   single-instance 必须第一个注册（官方建议：二次启动时首个实例的后续插件/setup 尚未跑完会漏唤醒）
    //   fs 必须注册在 persisted-scope 之前，否则 persisted-scope 静默失效
    //   （dev 下会打印 "Please make sure to register the 'fs' plugin before the 'persisted-scope' plugin!"）
    //   persisted-scope 依赖 fs 已注册（try_fs_scope() 才拿得到 scope 实例）
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      // 已有实例在运行：把主窗口唤到前台（最小化则还原）
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
      }
    }))
    .plugin(tauri_plugin_store::Builder::new().build()) // 1. 偏好持久化（KV）
    .plugin(tauri_plugin_dialog::init()) // 2. 目录选择器
    .plugin(tauri_plugin_fs::init()) // 3. 文件读写（须在 persisted-scope 之前）
    .plugin(tauri_plugin_persisted_scope::init()) // 4. 运行时授权目录的持久化
    // ⚠️ 原生菜单栏已注释：改为 React 自定义菜单（src/components/AppMenuBar.tsx，暗紫主题与界面一致）。
    // 回滚方式：取消下面两个块的注释，并还原文件顶部被移除的导入（MenuBuilder/SubmenuBuilder/DialogExt）。
    /*
    .menu(|app| {
      let file_menu = SubmenuBuilder::new(app, "文件")
        .text("menu-quit", "退出")
        .build()?;
      // 编辑菜单：撤销/重做在 Windows 上 PredefinedMenuItem 不支持（源码注释 "Windows / Linux: Unsupported"），
      // 改用普通 MenuItem 走 webview 原生 undo 栈；剪贴板四项保留预定义（Windows 经 WM_CUT 等真实生效），传中文文本
      let undo_i = MenuItem::with_id(app, "menu-undo", "撤销", true, None::<&str>)?;
      let redo_i = MenuItem::with_id(app, "menu-redo", "重做", true, None::<&str>)?;
      let edit_menu = SubmenuBuilder::new(app, "编辑")
        .item(&undo_i)
        .item(&redo_i)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("复制"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .build()?;
      // 视图菜单：不提供"重新加载/开发者工具"（发布版有丢数据/暴露调试风险），只留全屏
      let view_menu = SubmenuBuilder::new(app, "视图")
        .text("menu-fullscreen", "切换全屏")
        .build()?;
      let help_menu = SubmenuBuilder::new(app, "帮助")
        .text("menu-about", "关于写作台")
        .build()?;
      MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()
    })
    .on_menu_event(|app, event| match event.id().as_ref() {
      "menu-quit" => app.exit(0),
      "menu-undo" => {
        if let Some(win) = app.get_webview_window("main") {
          // 注意：故意不注册 Ctrl+Z accelerator —— 菜单快捷键会抢先于 webview，
          // 破坏 TipTap 编辑器内的 Mod-z（ProseMirror 自管历史）
          let _ = win.eval("document.execCommand('undo')");
        }
      }
      "menu-redo" => {
        if let Some(win) = app.get_webview_window("main") {
          let _ = win.eval("document.execCommand('redo')");
        }
      }
      "menu-fullscreen" => {
        if let Some(win) = app.get_webview_window("main") {
          let _ = win.set_fullscreen(!win.is_fullscreen().unwrap_or(false));
        }
      }
      "menu-about" => {
        let version = app.package_info().version.clone();
        app
          .dialog()
          .message(format!("写作台 v{version}\n网文创作工作台"))
          .title("关于写作台")
          .show(|_| {});
      }
      _ => {}
    })
    */
    .invoke_handler(tauri::generate_handler![exit_app])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // —— 系统托盘（图标复用应用默认图标）——
      let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
      let settings_i = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
      let sep = PredefinedMenuItem::separator(app)?;
      let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_i, &settings_i, &sep, &quit_i])?;

      let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("写作台")
        .menu(&menu)
        // 左键点图标不弹菜单（左键用于唤起主窗口）
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(win) = app.get_webview_window("main") {
              let _ = win.unminimize();
              let _ = win.show();
              let _ = win.set_focus();
            }
          }
          "settings" => {
            if let Some(win) = app.get_webview_window("main") {
              let _ = win.unminimize();
              let _ = win.show();
              let _ = win.set_focus();
            }
            // 前端 App.tsx 的 TrayNavigate 监听此事件做路由跳转
            let _ = app.emit("tray://navigate", "/settings");
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          // 左键单击托盘图标 → 唤起主窗口
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(win) = app.get_webview_window("main") {
              let _ = win.unminimize();
              let _ = win.show();
              let _ = win.set_focus();
            }
          }
        })
        .build(app)?;

      Ok(())
    })
    // 点 X 不退出，隐藏到托盘（真正退出走托盘菜单"退出"）
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
