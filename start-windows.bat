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
echo World Explorer:  http://127.0.0.1:4821/world
echo Rescue Lab:      http://127.0.0.1:4821/simulation
echo Codex Waypoint:  http://127.0.0.1:8000
echo.
echo Default: connects to real :8000 only. No silent mock fallback.
echo Explicit mock: set USE_MOCK_ENGINE=1 or run npm run dev:mock
echo See docs\WINDOWS_VERIFY.md for GPU acceptance tests.
echo Press Ctrl+C to stop.
echo.

if "%USE_MOCK_ENGINE%"=="1" (
  call npm run dev:mock
) else (
  call npm run dev
)
pause
