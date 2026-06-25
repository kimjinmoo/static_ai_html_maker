#!/bin/bash
# PyInstaller로 EXE 빌드하는 스크립트

echo "🔧 의존성 설치 중..."
pip install -r requirements.txt

echo "📦 PyInstaller 빌드 중..."
pyinstaller WebGenAI.spec --clean

echo ""
echo "✅ 빌드 완료!"
echo "실행 파일 위치: dist/WebGenAI/"
echo ""
echo "실행 방법:"
echo "  1. Ollama가 실행중인지 확인: ollama serve"
echo "  2. 모델 다운로드: ollama pull gemma4:12b"
echo "  3. 실행: ./dist/WebGenAI/WebGenAI"
echo "  4. 브라우저에서 http://localhost:5080 접속"
