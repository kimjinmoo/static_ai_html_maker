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

REM Install core dependencies first (flask, etc.)
echo [3/4] Installing core dependencies...
pip install -q flask==3.0.0 markdown==3.5.1 "huggingface-hub>=0.20.0" "pywebview>=5.0"

REM Install CUDA 12.x runtime DLLs via pip (compatible with CUDA 13.0 systems)
echo Installing CUDA 12.x runtime libraries...
pip install -q nvidia-cuda-runtime-cu12==12.4.127 nvidia-cublas-cu12 nvidia-cuda-nvrtc-cu12 nvidia-cufft-cu12 nvidia-curand-cu12 nvidia-cusolver-cu12 nvidia-cusparse-cu12 2>nul

REM Install llama-cpp-python with CUDA 12.4 pre-built wheel
echo Installing llama-cpp-python (CUDA 12.4)...
pip install -q llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124
if not errorlevel 1 goto llama_done
echo [WARN] llama-cpp-python CUDA install failed. Falling back to CPU-only build...
if not exist "C:\tmp" mkdir C:\tmp 2>nul
set "TMP=C:\tmp"
set "TEMP=C:\tmp"
pip install --upgrade --force-reinstall --no-cache-dir llama-cpp-python
if not errorlevel 1 goto llama_done
echo [WARN] CPU build also failed. Install VS Build Tools + C++ workload,
echo        or use Ollama / Gemini backend via web UI (gear icon, no llama-cpp needed).
:llama_done

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
