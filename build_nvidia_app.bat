@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - NVIDIA App Build Script (CUDA 가속, 웹 서버 모드)
REM ============================================

echo.
echo ========================================
echo   WebGenAI App Build (NVIDIA CUDA)
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
if not exist ".venv-nvidia-app" (
    echo [1/5] Creating virtual environment...
    python -m venv .venv-nvidia-app
)

REM Activate virtual environment
echo [2/5] Activating virtual environment...
call .venv-nvidia-app\Scripts\activate.bat

REM Upgrade pip
echo [3/5] Upgrading pip...
python -m pip install --upgrade pip

REM Install llama-cpp-python with CUDA support
echo [4/5] Installing llama-cpp-python with CUDA...
set CMAKE_ARGS=-DGGML_CUDA=on
pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir

REM Install remaining dependencies
echo [5/5] Installing other dependencies...
pip install flask==3.0.0 gunicorn==21.2.0 pyinstaller>=6.15.0 markdown==3.5.1 huggingface-hub>=0.20.0

REM Build
echo.
echo [Build] Building with PyInstaller (app.py)...
set BUILD_NAME=WebGenAI-App-NVIDIA
pyinstaller --clean --name WebGenAI-App-NVIDIA --add-data "templates;templates" --add-data "static;static" --add-data "app;app" --hidden-import flask --hidden-import markdown --hidden-import jinja2 --hidden-import werkzeug --hidden-import click --hidden-import markupsafe --hidden-import llama_cpp --hidden-import llama_cpp.llama_cpp --hidden-import huggingface_hub --hidden-import app --hidden-import app.config --hidden-import app.model --hidden-import app.thinking --hidden-import app.chat --hidden-import app.modular --hidden-import app.download --hidden-import app.strategies --hidden-import app.vulkan --hidden-import app.prompts --hidden-import app.utils --hidden-import app.backends --hidden-import app.backends.base --hidden-import app.backends.local --hidden-import app.backends.gemini --hidden-import app.routes --hidden-import app.routes.main --hidden-import app.routes.model_routes --hidden-import app.routes.project_routes --hidden-import app.routes.design_routes --exclude-module mlx_lm --exclude-module mlx --console app.py

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Executable: dist\WebGenAI-App-NVIDIA\WebGenAI-App-NVIDIA.exe
echo.

pause
