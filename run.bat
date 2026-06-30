@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - Windows Run Script (CPU / AMD Vulkan)
REM ============================================

echo.
echo ========================================
echo   WebGen AI Starting
echo ========================================
echo.

REM Set Vulkan SDK path (AMD GPU)
for /f "delims=" %%v in ('dir /b /ad /o-n "C:\VulkanSDK" 2^>nul') do (
    set "VULKAN_SDK=C:\VulkanSDK\%%v"
    set "CMAKE_PREFIX_PATH=C:\VulkanSDK\%%v\Lib\cmake"
    echo [GPU] Vulkan SDK: %%v
    goto skip_vulkan
)
:skip_vulkan

REM Create virtual environment
if not exist ".venv" (
    echo [1/3] Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
echo [2/3] Activating virtual environment...
call .venv\Scripts\activate.bat

REM Install core dependencies
echo [3/3] Installing dependencies...
pip install -q "flask==3.0.0" "markdown==3.5.1" "huggingface-hub>=0.20.0" "pywebview>=5.0" "google-genai>=0.3.0"

REM Install CUDA 12.x runtime DLLs (needed for pre-built CUDA wheel)
pip install -q nvidia-cuda-runtime-cu12==12.4.127 nvidia-cublas-cu12 nvidia-cuda-nvrtc-cu12 nvidia-cufft-cu12 nvidia-curand-cu12 nvidia-cusolver-cu12 nvidia-cusparse-cu12 2>nul

REM Install llama-cpp-python (try CUDA 12.4 pre-built wheel, fall back to CPU)
REM goto 기반 평탄화 — 중첩 if 괄호블록은 cmd 파서 오류("was unexpected at this time") 유발
echo Installing llama-cpp-python...
pip install -q llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124 2>nul
if not errorlevel 1 goto llama_done

echo [INFO] CUDA wheel unavailable. Trying CPU pre-built wheel...
pip install -q llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu 2>nul
if not errorlevel 1 goto llama_done

echo [WARN] Pre-built wheel not available for this Python version.
echo Building from source (may fail on Windows due to MAX_PATH)...
if not exist "C:\tmp" mkdir C:\tmp 2>nul
set "TMP=C:\tmp"
set "TEMP=C:\tmp"
pip install --upgrade --force-reinstall --no-cache-dir llama-cpp-python
if not errorlevel 1 goto llama_done
echo [WARN] llama-cpp build failed. Use Ollama or Gemini backend instead
echo        (web UI: gear icon, no llama-cpp needed).

:llama_done

REM Check model
echo.
if not exist "models\*.gguf" (
    echo [WARN] models/ folder has no GGUF model file.
    echo [INFO] Set MODEL_PATH or download from web UI.
    echo.
)

REM Run
echo [Run] Starting WebGen AI...
python run_desktop.py

pause
