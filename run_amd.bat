@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - AMD Run Script (Vulkan 가속, 웹 서버)
REM ============================================

echo.
echo ========================================
echo   WebGenAI Starting (AMD Vulkan)
echo ========================================
echo.

REM Set Vulkan SDK path
for /f "delims=" %%v in ('dir /b /ad /o-n "C:\VulkanSDK" 2^>nul') do (
    set "VULKAN_SDK=C:\VulkanSDK\%%v"
    set "CMAKE_PREFIX_PATH=C:\VulkanSDK\%%v\Lib\cmake"
    echo [GPU] Vulkan SDK: %%v
    goto skip_vulkan
)
:skip_vulkan

REM Create virtual environment
if not exist ".venv-amd" (
    echo [1/4] Creating virtual environment...
    python -m venv .venv-amd
)

REM Activate virtual environment
echo [2/4] Activating virtual environment...
call .venv-amd\Scripts\activate.bat

REM Install core dependencies first (flask, etc.)
echo [3/4] Installing core dependencies...
pip install -q flask==3.0.0 markdown==3.5.1 huggingface-hub>=0.20.0 pywebview>=5.0

REM Install llama-cpp-python with Vulkan support
REM Use a short TMP path to avoid Windows MAX_PATH (260 char) limit during source build
echo Installing llama-cpp-python with Vulkan...
if not exist "C:\tmp" mkdir C:\tmp 2>nul
set TMP=C:\tmp
set TEMP=C:\tmp
set CMAKE_ARGS=-DGGML_VULKAN=on
pip install --upgrade --force-reinstall --no-cache-dir llama-cpp-python
if %errorlevel% neq 0 (
    echo [WARN] Vulkan build failed. Install Vulkan SDK from https://vulkan.lunarg.com/
    echo.
    echo Possible fixes:
    echo   1. Install Vulkan SDK: https://vulkan.lunarg.com/sdk/home
    echo   2. Use CPU-only: pip install llama-cpp-python
    echo   3. Use Gemini backend: set LLM_BACKEND=gemini ^& set GEMINI_API_KEY=your-key
    echo.
    echo Starting with core deps only...
)

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
