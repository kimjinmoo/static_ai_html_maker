#!/bin/bash
# PyInstaller로 빌드하는 스크립트

echo "🔧 의존성 설치 중..."
pip install -r requirements.txt

echo "📦 PyInstaller 빌드 중..."
pyinstaller WebGenAI.spec --clean

echo ""
echo "✅ 빌드 완료!"
echo "실행 파일: dist/WebGenAI/WebGenAI"
echo ""
read -p "실행하시겠습니까? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./dist/WebGenAI/WebGenAI
fi
