; Doc Capture Server — Windows installer
; Built with NSIS (makensis). Produces Setup.exe.
;
; Payload (server/payload-windows/app) must be built first via:
;   server/scripts/package-windows.sh
; which compiles the NestJS server, installs win32/x64-targeted production
; dependencies (so sharp's native binding matches Windows, not the build
; machine), and copies the admin-panel production build into app/public
; so the same process serves both the API and the admin web UI.

!define APP_NAME "Doc Capture Server"
!define APP_DIR_NAME "DocCapture"
!define COMPANY "Doc Capture"
!define VERSION "0.1.0"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_DIR_NAME}"

Name "${APP_NAME}"
OutFile "Setup.exe"
InstallDir "$PROGRAMFILES64\${APP_DIR_NAME}"
InstallDirRegKey HKLM "Software\${APP_DIR_NAME}" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

Page directory
Page instfiles

UninstPage uninstConfirm
UninstPage instfiles

Function .onInit
  ; Warn (non-blocking) if Node.js isn't on PATH — we can't bundle the
  ; Node runtime itself here (sandbox build environment has no access to
  ; nodejs.org), so the target machine needs it installed separately.
  nsExec::ExecToStack 'cmd /c node --version'
  Pop $0
  Pop $1
  StrCmp $0 "0" node_found node_missing

  node_missing:
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
      "Node.js was not found on this machine.$\r$\n$\r$\nDoc Capture Server requires Node.js (LTS) to run.$\r$\nYou can continue installing the app files now and install Node.js afterwards from https://nodejs.org.$\r$\n$\r$\nContinue installation?" \
      IDOK node_found
    Quit

  node_found:
    ; If a server from a previous install is still running, overwriting
    ; its files mid-process can fail or leave a half-updated install on
    ; Windows (native modules / the running main.js can be file-locked).
    ; netstat is built into Windows, no extra plugin needed.
    nsExec::ExecToStack 'cmd /c netstat -ano ^| findstr ":3000.*LISTENING"'
    Pop $2
    Pop $3
    StrCmp $2 "0" port_busy port_free

    port_busy:
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
        "Doc Capture Server appears to already be running (something is listening on port 3000).$\r$\n$\r$\nPlease close the server window (or stop the process) before continuing, otherwise some files may fail to update.$\r$\n$\r$\nContinue anyway?" \
        IDOK port_free
      Quit

  port_free:
FunctionEnd

Section "Doc Capture Server (required)" SEC_MAIN
  SectionIn RO
  SetOutPath "$INSTDIR\app"
  File /r "..\server\payload-windows\app\*.*"

  SetOutPath "$INSTDIR"
  File "start-server.bat"
  File "create-admin.bat"
  File "start-tunnel.bat"
  File "README-FIRST.txt"

  ; .env from template on first install only — never overwrite an existing config
  IfFileExists "$INSTDIR\app\.env" env_exists env_create
  env_create:
    CopyFiles "$INSTDIR\app\.env.example" "$INSTDIR\app\.env"
  env_exists:

  FileOpen $4 "$INSTDIR\open-admin-panel.url" w
  FileWrite $4 "[InternetShortcut]$\r$\nURL=http://localhost:3000$\r$\n"
  FileClose $4

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Start Doc Capture Server.lnk" "$INSTDIR\start-server.bat" "" "" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Create Admin User.lnk" "cmd.exe" '/k "$INSTDIR\create-admin.bat"' "" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Start Remote Access Tunnel.lnk" "$INSTDIR\start-tunnel.bat" "" "" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Open Admin Panel.lnk" "$INSTDIR\open-admin-panel.url"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Read Me.lnk" "$INSTDIR\README-FIRST.txt"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKLM "Software\${APP_DIR_NAME}" "InstallDir" "$INSTDIR"

  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ; Preserve DB credentials / JWT_SECRET — back up app\.env to a location
  ; OUTSIDE the app\ folder before it gets wiped by RMDir /r below.
  IfFileExists "$INSTDIR\app\.env" 0 no_env_backup
    CopyFiles /SILENT "$INSTDIR\app\.env" "$INSTDIR\.env.backup"
  no_env_backup:

  Delete "$INSTDIR\open-admin-panel.url"
  Delete "$INSTDIR\start-server.bat"
  Delete "$INSTDIR\create-admin.bat"
  Delete "$INSTDIR\start-tunnel.bat"
  Delete "$INSTDIR\README-FIRST.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\app"

  IfFileExists "$INSTDIR\.env.backup" 0 no_backup_notice
    MessageBox MB_OK|MB_ICONINFORMATION \
      "Your previous configuration (database credentials, JWT secret) was kept at:$\r$\n$\r$\n$INSTDIR\.env.backup$\r$\n$\r$\nCopy it back to app\.env after reinstalling if you want to keep using the same database/session secret."
  no_backup_notice:

  ; Only removes $INSTDIR if it's now empty — if .env.backup is still
  ; sitting there, this is a harmless no-op and the backup survives.
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${APP_NAME}\Start Doc Capture Server.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Create Admin User.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Start Remote Access Tunnel.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Open Admin Panel.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Read Me.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\${APP_DIR_NAME}"
SectionEnd
