@echo off
REM ============================================
REM Windows GPU Video Renderer
REM ============================================
REM 
REM Prerequisites:
REM 1. Install Node.js on Windows: https://nodejs.org/
REM 2. Install FFmpeg on Windows and add to PATH
REM 3. Run this from Windows (not WSL)
REM
REM Usage:
REM   windows-render.bat <scenes-json> <output-filename>
REM
REM Example:
REM   windows-render.bat scenes.json "My Video.mp4"
REM
REM ============================================

setlocal

REM Set paths
set "SCRIPT_DIR=%~dp0"
set "WSL_PATH=\\wsl$\Ubuntu\home\nadim\ytautomation"
set "PUBLIC_PATH=%WSL_PATH%\public"

REM Check if scenes JSON is provided
if "%~1"=="" (
    echo Usage: windows-render.bat ^<scenes-json^> ^<output-filename^>
    echo.
    echo Example:
    echo   windows-render.bat scenes.json "My Video.mp4"
    exit /b 1
)

set "SCENES_FILE=%~1"
set "OUTPUT_NAME=%~2"

if not exist "%SCENES_FILE%" (
    echo Error: Scenes file not found: %SCENES_FILE%
    exit /b 1
)

echo ============================================
echo Windows GPU Video Renderer
echo ============================================
echo Scenes file: %SCENES_FILE%
echo Output: %OUTPUT_NAME%
echo.
echo GPU Rendering with FFmpeg (NVENC/AMD VCE)
echo ============================================

REM Check for FFmpeg
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo Error: FFmpeg not found. Please install FFmpeg and add to PATH.
    exit /b 1
)

REM Create output directory in WSL
set "OUTPUT_DIR=%WSL_PATH%\public\generations\temp"
echo Creating output directory...

REM For now, let's use a simple FFmpeg-based approach
REM This is a basic example - the full implementation would use Remotion

echo.
echo To enable GPU rendering, you need:
echo 1. FFmpeg compiled with NVENC (NVIDIA) or AMF (AMD) support
echo 2. Node.js installed on Windows
echo.
echo Alternative: Use the WSL server for rendering (slower but works)
echo.

echo NOTE: This is a placeholder. The full GPU rendering requires:
echo - Node.js packages: @remotion/bundler @remotion/renderer
echo - GPU drivers installed on Windows
echo - FFmpeg with hardware acceleration
echo.
echo Current limitation: AMD RX560 may not have full WSL2 support
echo but should work for local Windows rendering.

pause
