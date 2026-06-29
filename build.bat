@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - Windows Build Script (CPU)
REM ============================================

echo.
echo ========================================
echo   WebGenAI Windows Build (CPU)
echo ========================================
echo.

REM Check Python version
python --version
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    echo Install Python 3.9+: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Create virtual environment
if not exist ".venv" (
    echo [1/4] Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo [2/4] Activating virtual environment...
call .venv\Scripts\activate.bat

REM Install dependencies
echo [3/4] Installing dependencies...
python -m pip install --upgrade pip
pip install flask==3.0.0 gunicorn==21.2.0 "pyinstaller>=6.15.0" markdown==3.5.1 "pywebview>=5.0" "huggingface-hub>=0.20.0"

REM Install llama-cpp-python (try pre-built CUDA wheel, fall back to CPU)
echo Installing llama-cpp-python...
pip install -q llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124 2>nul
if %errorlevel% neq 0 (
    pip install -q llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu 2>nul
)
if %errorlevel% neq 0 (
    echo [WARN] Pre-built wheel unavailable. Building from source...
    if not exist "C:\tmp" mkdir C:\tmp 2>nul
    set TMP=C:\tmp
    set TEMP=C:\tmp
    pip install --upgrade --force-reinstall --no-cache-dir llama-cpp-python
)

REM Build
echo [4/4] Building with PyInstaller...
pyinstaller WebGenAI.spec --clean

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Executable: dist\WebGenAI\WebGenAI.exe
echo.
set /p RUN="Run now? (y/n) "
if /i "%RUN%"=="y" (
    echo.
    start "" dist\WebGenAI\WebGenAI.exe
)

pause
