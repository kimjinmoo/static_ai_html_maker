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

REM Install non-llama dependencies first
echo [4/5] Installing core dependencies...
pip install -q flask==3.0.0 gunicorn==21.2.0 pyinstaller>=6.15.0 markdown==3.5.1 pywebview>=5.0 huggingface-hub>=0.20.0

REM Install CUDA 12.x runtime DLLs via pip
echo Installing CUDA 12.x runtime libraries...
pip install -q nvidia-cuda-runtime-cu12==12.4.127 nvidia-cublas-cu12 nvidia-cuda-nvrtc-cu12 nvidia-cufft-cu12 nvidia-curand-cu12 nvidia-cusolver-cu12 nvidia-cusparse-cu12 2>nul

REM Install llama-cpp-python with CUDA 12.4 pre-built wheel
echo Installing llama-cpp-python (CUDA 12.4)...
pip install -q llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124
if %errorlevel% neq 0 (
    echo [WARN] llama-cpp-python CUDA install failed. Building from source...
    if not exist "C:\tmp" mkdir C:\tmp 2>nul
    set TMP=C:\tmp
    set TEMP=C:\tmp
    set CMAKE_ARGS=-DGGML_CUDA=on
    pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
    if %errorlevel% neq 0 (
        echo [WARN] Source build failed. Install VS Build Tools + C++ workload, then retry.
    )
)

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
