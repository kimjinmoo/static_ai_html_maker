@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - NVIDIA Build Script (CUDA 가속)
REM ============================================

echo.
echo ========================================
echo   WebGenAI Build (NVIDIA CUDA)
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
if not exist ".venv-nvidia" (
    echo [1/5] Creating virtual environment...
    python -m venv .venv-nvidia
)

REM Activate virtual environment
echo [2/5] Activating virtual environment...
call .venv-nvidia\Scripts\activate.bat

REM Upgrade pip
echo [3/5] Upgrading pip...
python -m pip install --upgrade pip

REM Install llama-cpp-python with CUDA support
echo [4/5] Installing llama-cpp-python with CUDA...
set CMAKE_ARGS=-DGGML_CUDA=on
pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir

REM Install remaining dependencies
echo [5/5] Installing other dependencies...
pip install flask==3.0.0 gunicorn==21.2.0 pyinstaller>=6.15.0 markdown==3.5.1 pywebview>=5.0 huggingface-hub>=0.20.0

REM Build
echo.
echo [Build] Building with PyInstaller...
set BUILD_NAME=WebGenAI-NVIDIA
pyinstaller WebGenAI.spec --clean

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Executable: dist\WebGenAI-NVIDIA\WebGenAI-NVIDIA.exe
echo.
set /p RUN="Run now? (y/n) "
if /i "%RUN%"=="y" (
    echo.
    start "" dist\WebGenAI-NVIDIA\WebGenAI-NVIDIA.exe
)

pause
