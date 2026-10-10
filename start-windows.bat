@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  WorldShift AI - Windows quick start
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not found. Install LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" if exist ".env.example" (
  echo Creating .env from .env.example
  copy /Y ".env.example" ".env" >nul
)

if not exist "public\data\rescue\manifest.json" (
  echo WARNING: public\data\rescue\manifest.json missing — Rescue Lab needs the data handoff.
  echo.
)

echo UI:              http://127.0.0.1:4821
echo World Explorer:  needs Codex Waypoint at http://127.0.0.1:8000
echo Rescue Lab:      static JSON ^(no Python^)
echo.
echo If Waypoint is not running, the UI will show connection unavailable / MOCK.
echo Press Ctrl+C to stop.
echo.

REM Prefer real Codex; set USE_MOCK_ENGINE=1 to force protocol mock
if "%USE_MOCK_ENGINE%"=="1" (
  call npm run dev -- --mock
) else (
  call npm run dev
)
pause
