@echo off
chcp 65001 >nul
REM ============================================
REM WebGenAI - Windows Run Script (llama-cpp-python)
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

REM Install dependencies
echo [3/3] Checking dependencies...
pip install -q -r requirements.txt

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
