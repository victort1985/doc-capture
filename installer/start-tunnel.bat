@echo off
setlocal

if "%PORT%"=="" set PORT=3000

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared is not installed.
  echo Download it from: https://github.com/cloudflare/cloudflared/releases
  echo ^(grab cloudflared-windows-amd64.exe, rename to cloudflared.exe, put it on PATH^)
  pause
  exit /b 1
)

if not "%TUNNEL_TOKEN%"=="" (
  echo Starting named tunnel...
  cloudflared tunnel run --token "%TUNNEL_TOKEN%"
) else (
  echo No TUNNEL_TOKEN set - starting a free quick tunnel ^(random URL, changes every restart^).
  echo For a stable URL + email-gated access, see docs\installation-guide.md.
  cloudflared tunnel --url http://localhost:%PORT%
)
