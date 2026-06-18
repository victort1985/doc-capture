@echo off
setlocal
cd /d "%~dp0app"

if not exist ".env" (
  echo [Setup] .env not found - creating from .env.example
  copy /Y ".env.example" ".env" >nul
  echo [Setup] Edit app\.env to set DB_* credentials and JWT_SECRET, then restart.
)

echo Starting Doc Capture server on http://localhost:3000 ...
echo Admin panel:  http://localhost:3000/
echo API base:     http://localhost:3000/api
echo.
echo Requires Node.js (https://nodejs.org) and a reachable PostgreSQL database.
echo Press Ctrl+C to stop the server.
echo.

node dist\main.js
pause
