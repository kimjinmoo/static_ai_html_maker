#!/bin/bash
# 기본 모델 다운로드 스크립트

MODEL_DIR="./models"

# Apple Silicon 감지
if [[ "$(uname)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    # MLX 모델 다운로드 (Apple Silicon)
    MLX_REPO="mlx-community/gemma-4-12b-it-4bit"
    MLX_DIR="${MODEL_DIR}/gemma-4-12b-it-4bit"

    echo "🍎 Apple Silicon 감지됨 - MLX gemma-4-12b 모델 다운로드"
    echo "   모델: ${MLX_REPO}"
    echo "   저장: ${MLX_DIR}"

    if [ -d "${MLX_DIR}" ] && [ -f "${MLX_DIR}/model.safetensors" ]; then
        echo "✅ MLX 모델이 이미 존재합니다."
        exit 0
    fi

    mkdir -p "${MODEL_DIR}"
    echo "⬇️  huggingface-cli로 MLX 모델 다운로드 중..."
    pip install -q huggingface_hub
    python3 -c "
from huggingface_hub import snapshot_download
snapshot_download('${MLX_REPO}', local_dir='${MLX_DIR}', local_dir_use_symlinks=False)
"

    if [ -d "${MLX_DIR}" ]; then
        echo "✅ MLX 모델 다운로드 완료!"
        echo "   실행: python3 app.py"
    else
        echo "❌ 다운로드 실패"
        exit 1
    fi
else
    # GGUF 모델 다운로드 (기타 플랫폼)
    MODEL_REPO="unsloth/gemma-4-E4B-it-GGUF"
    MODEL_FILE="gemma-4-E4B-it-Q4_K_M.gguf"
    MODEL_PATH="${MODEL_DIR}/${MODEL_FILE}"

    echo "💻 일반 PC - GGUF gemma-4-4b 모델 다운로드"
    echo "   모델: ${MODEL_REPO}"
    echo "   크기: ~4.7GB"
    echo "   저장: ${MODEL_PATH}"

    mkdir -p "${MODEL_DIR}"

    if [ -f "${MODEL_PATH}" ]; then
        echo "✅ 모델이 이미 존재합니다."
        echo "   MODEL_PATH=${MODEL_PATH} python3 app.py"
        exit 0
    fi

    if command -v huggingface-cli &> /dev/null; then
        echo "⬇️  huggingface-cli로 다운로드 중..."
        huggingface-cli download "${MODEL_REPO}" "${MODEL_FILE}" --local-dir "${MODEL_DIR}"
    else
        echo "⬇️  curl로 다운로드 중..."
        curl -L -o "${MODEL_PATH}" \
            "https://huggingface.co/${MODEL_REPO}/resolve/main/${MODEL_FILE}"
    fi

    if [ -f "${MODEL_PATH}" ]; then
        echo "✅ 다운로드 완료!"
        echo "   실행: MODEL_PATH=${MODEL_PATH} python3 app.py"
    else
        echo "❌ 다운로드 실패"
        exit 1
    fi
fi
