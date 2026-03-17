@echo off
echo ================================================
echo   UBUZIMA CONNECT - Monorepo Setup
echo ================================================
echo.

REM Step 1: Create the monorepo folder
mkdir "%USERPROFILE%\Downloads\ubuzima"
echo Created folder: ubuzima/

REM Step 2: Copy backend
echo Copying backend...
xcopy /E /I /Y "%USERPROFILE%\Downloads\ubuzima-backend" "%USERPROFILE%\Downloads\ubuzima\backend"
echo Done: ubuzima/backend/

REM Step 3: Copy frontend
echo Copying frontend...
xcopy /E /I /Y "%USERPROFILE%\Downloads\ubuzima-connect" "%USERPROFILE%\Downloads\ubuzima\frontend"
echo Done: ubuzima/frontend/

echo.
echo ================================================
echo   Structure created:
echo   ubuzima/
echo     backend/   (FastAPI)
echo     frontend/  (React)
echo ================================================
pause