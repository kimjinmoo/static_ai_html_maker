#!/bin/bash
set -e

OS_TYPE=$(uname -s)

echo ""
echo "========================================"
echo "  WebGenAI Build"
echo "  Platform: $OS_TYPE"
echo "========================================"
echo ""

# macOS detection
if [ "$OS_TYPE" = "Darwin" ]; then
    echo "[1/4] Installing llama-cpp-python with Metal support..."
    CMAKE_ARGS="-DGGML_METAL=on" pip install --upgrade --force-reinstall --no-cache-dir llama-cpp-python
else
    echo "[1/4] Installing dependencies..."
    pip install -r requirements.txt
fi

echo "[2/4] Installing other dependencies..."
pip install flask==3.0.0 gunicorn==21.2.0 pyinstaller>=6.15.0 markdown==3.5.1 huggingface-hub>=0.20.0

echo "[3/4] Building with PyInstaller..."
pyinstaller WebGenAI.spec --clean

echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo ""
echo "Executable: dist/WebGenAI/WebGenAI"
echo ""

if [ "$OS_TYPE" = "Darwin" ]; then
    read -p "Run now? (y/n) " -n 1 -r
else
    read -p "실행하시겠습니까? (y/n) " -n 1 -r
fi
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./dist/WebGenAI/WebGenAI
fi
