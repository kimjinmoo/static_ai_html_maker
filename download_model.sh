#!/bin/bash
# GGUF 모델 다운로드 스크립트 (llama-cpp-python용)

MODEL_DIR="./models"
MODEL_REPO="deepreinforce-ai/Ornith-1.0-9B-GGUF"
MODEL_FILE="ornith-1.0-9b-Q4_K_M.gguf"
MODEL_PATH="${MODEL_DIR}/${MODEL_FILE}"

echo "💻 GGUF Ornith-1.0-9B Q4_K_M 모델 다운로드"
echo "   모델: ${MODEL_REPO}"
echo "   저장: ${MODEL_PATH}"

mkdir -p "${MODEL_DIR}"

if [ -f "${MODEL_PATH}" ]; then
    echo "✅ 모델이 이미 존재합니다."
    echo "   실행: python app.py"
    exit 0
fi

pip install -q huggingface_hub

echo "⬇️  huggingface-cli로 다운로드 중..."
python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download('${MODEL_REPO}', '${MODEL_FILE}', local_dir='${MODEL_DIR}')
"

if [ -f "${MODEL_PATH}" ]; then
    echo "✅ 다운로드 완료!"
    echo "   실행: python app.py"
else
    echo "❌ 다운로드 실패"
    exit 1
fi
