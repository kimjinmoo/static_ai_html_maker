#!/bin/bash
# ============================================
# WebGenAI - macOS Build Script (Metal 가속)
# ============================================

set -e

echo ""
echo "========================================"
echo "  WebGenAI macOS Build (Metal)"
echo "========================================"
echo ""

# Check Python version
python3 --version || { echo "[ERROR] Python is not installed."; exit 1; }

# Create virtual environment
if [ ! -d ".venv-mac" ]; then
    echo "[1/5] Creating virtual environment..."
    python3 -m venv .venv-mac
fi

# Activate virtual environment
echo "[2/5] Activating virtual environment..."
source .venv-mac/bin/activate

# Upgrade pip
echo "[3/5] Upgrading pip..."
python3 -m pip install --upgrade pip

# Install llama-cpp-python with Metal support
echo "[4/5] Installing llama-cpp-python with Metal..."
CMAKE_ARGS="-DGGML_METAL=on" pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir

# Install remaining dependencies
echo "[5/5] Installing other dependencies..."
pip install flask==3.0.0 gunicorn==21.2.0 pyinstaller>=6.15.0 markdown==3.5.1 huggingface-hub>=0.20.0

# Build
echo ""
echo "[Build] Building with PyInstaller (app.py)..."
BUILD_NAME="WebGenAI-Mac"
pyinstaller --clean --name "$BUILD_NAME" \
    --add-data "templates:templates" \
    --add-data "static:static" \
    --add-data "app:app" \
    --hidden-import flask \
    --hidden-import markdown \
    --hidden-import jinja2 \
    --hidden-import werkzeug \
    --hidden-import click \
    --hidden-import markupsafe \
    --hidden-import llama_cpp \
    --hidden-import llama_cpp.llama_cpp \
    --hidden-import huggingface_hub \
    --hidden-import app \
    --hidden-import app.config \
    --hidden-import app.model \
    --hidden-import app.thinking \
    --hidden-import app.chat \
    --hidden-import app.modular \
    --hidden-import app.download \
    --hidden-import app.strategies \
    --hidden-import app.vulkan \
    --hidden-import app.prompts \
    --hidden-import app.utils \
    --hidden-import app.backends \
    --hidden-import app.backends.base \
    --hidden-import app.backends.local \
    --hidden-import app.backends.gemini \
    --hidden-import app.routes \
    --hidden-import app.routes.main \
    --hidden-import app.routes.model_routes \
    --hidden-import app.routes.project_routes \
    --hidden-import app.routes.design_routes \
    --console app.py

echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo ""
echo "Executable: dist/$BUILD_NAME/$BUILD_NAME"
echo ""
