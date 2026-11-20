@echo off
setlocal
title ARA Studio - keep this window open
set "ARA_STUDIO_FOLDER=%~dp0"
if not exist "%ARA_STUDIO_FOLDER%app\studio\login\page.tsx" (
  echo The ARA Studio project could not be found.
  pause
  exit /b 1
)
cd /d "%ARA_STUDIO_FOLDER%"
set "NODE_ENV=development"
set "STUDIO_LOCAL_PREVIEW=false"
set "STUDIO_ORIGIN=http://127.0.0.1:4173"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js and npm could not be found. Reopen this window after checking the Node.js installation.
  pause
  exit /b 1
)
echo Starting ARA Studio with normal staff sign-in.
echo Keep this window open while using Studio.
echo Open http://127.0.0.1:4173/studio/login after the server reports Ready.
echo.
call npm.cmd run dev
set "ARA_STUDIO_EXIT=%ERRORLEVEL%"
echo.
echo Studio has stopped. Any startup error is shown above.
echo If port 4173 is already in use, close the previous Studio server window before restarting.
pause
exit /b %ARA_STUDIO_EXIT%
