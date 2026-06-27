#!/bin/bash
# ============================================
# WebGenAI - macOS Run Script (Metal 가속, 웹 서버)
# ============================================

set -e

echo ""
echo "========================================"
echo "  WebGenAI Starting (macOS Metal)"
echo "========================================"
echo ""

# Create virtual environment
if [ ! -d ".venv-mac" ]; then
    echo "[1/4] Creating virtual environment..."
    python3 -m venv .venv-mac
fi

# Activate
echo "[2/4] Activating virtual environment..."
source .venv-mac/bin/activate

# Install llama-cpp-python with Metal
echo "[3/4] Installing llama-cpp-python with Metal..."
CMAKE_ARGS="-DGGML_METAL=on" pip install -q --upgrade --force-reinstall --no-cache-dir llama-cpp-python
pip install -q -r requirements.txt

# Check model
echo ""
if ls models/*.gguf 1> /dev/null 2>&1; then
    :
else
    echo "[WARN] models/ folder has no GGUF model file."
fi

# Run
echo "[4/4] Starting WebGenAI web server..."
echo ""
echo "Open http://localhost:5080 in your browser."
echo ""
python3 app.py
