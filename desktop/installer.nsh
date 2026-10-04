; Remove only shipped runtime files. The database, WAL, backups and profiles
; belong to the author and must survive both uninstall and an in-place upgrade.
!macro customRemoveFiles
  SetOutPath $TEMP
  Delete "$INSTDIR\WritingWorkbench.exe"
  Delete "$INSTDIR\Uninstall 写作台.exe"
  Delete "$INSTDIR\Uninstall WritingWorkbench.exe"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\default_app.asar"
  Delete "$INSTDIR\resources\elevate.exe"
  Delete "$INSTDIR\locales\*.pak"
  RMDir "$INSTDIR\resources"
  RMDir "$INSTDIR\locales"
  RMDir "$INSTDIR"
!macroend

!macro customInstall
  ; Refuse directories where the installed application cannot create its DB.
  ClearErrors
  FileOpen $0 "$INSTDIR\.writing-workbench-permission-check" w
  IfErrors workbench_no_write
  FileClose $0
  Delete "$INSTDIR\.writing-workbench-permission-check"
  Goto workbench_write_ok
  workbench_no_write:
    MessageBox MB_OK|MB_ICONSTOP "所选安装目录不可写，请选择当前用户可写的目录。数据库需要保存在软件旁边。"
    Abort
  workbench_write_ok:
!macroend
