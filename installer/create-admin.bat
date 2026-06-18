@echo off
setlocal
cd /d "%~dp0app"

if "%~1"=="" (
  echo Usage: create-admin.bat ^<username^> ^<password^> [language]
  echo Example: create-admin.bat admin admin123 he
  pause
  exit /b 1
)

node scripts\create-admin.js %*
pause
