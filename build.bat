@echo off
REM ============================================
REM WebGenAI - Windows 빌드 스크립트
REM Windows 10/11에서 실행해야 합니다.
REM ============================================

echo.
echo ========================================
echo   WebGenAI Windows 빌드
echo ========================================
echo.

REM Python 버전 확인
python --version
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo Python 3.9+를 설치하세요: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 가상환경 생성
if not exist ".venv" (
    echo [1/4] 가상환경 생성 중...
    python -m venv .venv
)

REM 가상환경 활성화
echo [2/4] 가상환경 활성화 중...
call .venv\Scripts\activate.bat

REM 의존성 설치 (mlx 제외)
echo [3/4] 의존성 설치 중...
pip install --upgrade pip
pip install flask==3.0.0 llama-cpp-python[huggingface-hub] markdown==3.5.1 pyinstaller>=6.15.0 gunicorn==21.2.0

REM 빌드
echo [4/4] PyInstaller 빌드 중...
pyinstaller WebGenAI.spec --clean

echo.
echo ========================================
echo   빌드 완료!
echo ========================================
echo.
echo 실행 파일 위치: dist\WebGenAI\WebGenAI.exe
echo.
echo 실행 방법:
echo   1. dist\WebGenAI\WebGenAI.exe 실행
echo   2. 브라우저에서 http://localhost:5080 접속
echo   3. 첫 실행 시 모델 자동 다운로드
echo.
echo CUDA 가속 사용 (NVIDIA GPU):
echo   set GGML_CUDA=1
echo   dist\WebGenAI\WebGenAI.exe
echo.
pause
