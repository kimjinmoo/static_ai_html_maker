#!/bin/bash
# 빠른 실행 스크립트

echo "🚀 WebGen AI 시작 중..."

# 가상환경이 없으면 생성
if [ ! -d ".venv" ]; then
    echo "📦 가상환경 생성 중..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# 의존성 설치
pip install -q -r requirements.txt

# 실행
python3 run_desktop.py
