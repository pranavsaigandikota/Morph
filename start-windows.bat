@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  WorldShift AI - Windows quick start
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not found. Install LTS from https://nodejs.org and reopen this window.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm not found. Reinstall Node.js LTS.
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

if not exist "public\data\rescue\manifest.json" (
  echo WARNING: public\data\rescue\manifest.json missing.
  echo Copy the rescue data handoff into public\data\rescue\ then re-run.
  echo Rescue Lab will not load until that package is present.
  echo.
)

echo.
echo Starting app...
echo   UI:            http://127.0.0.1:4821
echo   Rescue Lab:    static JSON ^(no GPU / Python needed^)
echo   World Explorer: needs Codex Waypoint on http://127.0.0.1:8000 for real frames
echo.
echo Press Ctrl+C to stop.
echo.

call npm run dev
pause
