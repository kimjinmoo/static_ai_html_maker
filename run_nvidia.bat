@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - NVIDIA Run Script (CUDA 가속, 웹 서버)
REM ============================================

echo.
echo ========================================
echo   WebGenAI Starting (NVIDIA CUDA)
echo ========================================
echo.

REM Create virtual environment
if not exist ".venv-nvidia" (
    echo [1/4] Creating virtual environment...
    python -m venv .venv-nvidia
)

REM Activate virtual environment
echo [2/4] Activating virtual environment...
call .venv-nvidia\Scripts\activate.bat

REM Install llama-cpp-python with CUDA
echo [3/4] Installing llama-cpp-python with CUDA...
set CMAKE_ARGS=-DGGML_CUDA=on
pip install -q --upgrade --force-reinstall --no-cache-dir llama-cpp-python
pip install -q -r requirements.txt

REM Check model
echo.
if not exist "models\*.gguf" (
    echo [WARN] models/ folder has no GGUF model file.
)

REM Run
echo [4/4] Starting WebGenAI web server...
echo.
echo Open http://localhost:5080 in your browser.
echo.
python app.py

pause
