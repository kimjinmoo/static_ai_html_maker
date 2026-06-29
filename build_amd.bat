@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - AMD Build Script (Vulkan 가속)
REM ============================================

echo.
echo ========================================
echo   WebGenAI Build (AMD Vulkan)
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
if not exist ".venv-amd" (
    echo [1/5] Creating virtual environment...
    python -m venv .venv-amd
)

REM Activate virtual environment
echo [2/5] Activating virtual environment...
call .venv-amd\Scripts\activate.bat

REM Upgrade pip
echo [3/5] Upgrading pip...
python -m pip install --upgrade pip

REM Install non-llama dependencies first
echo [4/5] Installing core dependencies...
pip install flask==3.0.0 gunicorn==21.2.0 "pyinstaller>=6.15.0" markdown==3.5.1 "pywebview>=5.0" "huggingface-hub>=0.20.0"

REM Install llama-cpp-python with Vulkan support
echo Installing llama-cpp-python with Vulkan...
if not exist "C:\tmp" mkdir C:\tmp 2>nul
set TMP=C:\tmp
set TEMP=C:\tmp
set CMAKE_ARGS=-DGGML_VULKAN=on
pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
if %errorlevel% neq 0 (
    echo [WARN] Vulkan build failed. Install Vulkan SDK from https://vulkan.lunarg.com/
)

REM Build
echo.
echo [Build] Building with PyInstaller...
set BUILD_NAME=WebGenAI-AMD
pyinstaller WebGenAI.spec --clean

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Executable: dist\WebGenAI-AMD\WebGenAI-AMD.exe
echo.
set /p RUN="Run now? (y/n) "
if /i "%RUN%"=="y" (
    echo.
    start "" dist\WebGenAI-AMD\WebGenAI-AMD.exe
)

pause
