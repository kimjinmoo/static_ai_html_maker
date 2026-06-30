import os
import json
from flask import Blueprint, jsonify, Response

from app.config import N_CTX, N_GPU_LAYERS, N_BATCH, DEFAULT_MODEL, DEFAULT_MODEL_REPO
from app.utils import find_model_file
from app.download import download_model_stream, download_status, download_lock
from app.settings import get_effective_config


model_bp = Blueprint("model", __name__)


@model_bp.route("/api/models", methods=["GET"])
def list_models():
    try:
        cfg = get_effective_config()
        backend = cfg.get("llm_backend", "local")

        # 외부 백엔드는 GGUF 다운로드 불필요 — 설정만 되어 있으면 ready
        if backend == "ollama":
            return jsonify({
                "models": [cfg.get("ollama_model", "")],
                "status": "ready",
                "backend": "ollama",
                "host": cfg.get("ollama_host", ""),
            })
        if backend == "openai":
            if cfg.get("openai_api_key"):
                return jsonify({
                    "models": [cfg.get("openai_model", "")],
                    "status": "ready",
                    "backend": "openai",
                    "host": cfg.get("openai_base_url", ""),
                })
            return jsonify({
                "models": [], "status": "no_model", "backend": "openai",
                "hint": "OpenAI 호환 API 키를 설정하세요 (⚙️ 설정)",
            })
        if backend == "gemini":
            if cfg.get("gemini_api_key"):
                return jsonify({
                    "models": [cfg.get("gemini_model", "")],
                    "status": "ready",
                    "backend": "gemini",
                })
            return jsonify({
                "models": [],
                "status": "no_model",
                "backend": "gemini",
                "hint": "Gemini API 키를 설정하세요 (⚙️ 설정)",
            })

        # local (llama-cpp)
        model_path = find_model_file()
        if model_path:
            model_name = os.path.basename(model_path)
            file_size = os.path.getsize(model_path)
            return jsonify({
                "models": [model_name],
                "model_path": model_path,
                "status": "ready",
                "backend": "llama-cpp-python",
                "file_size_mb": round(file_size / (1024 * 1024), 1),
                "n_ctx": N_CTX,
                "n_gpu_layers": N_GPU_LAYERS,
                "n_batch": N_BATCH,
            })
        return jsonify({
            "models": [],
            "status": "no_model",
            "backend": "llama-cpp-python",
            "hint": "models/ \ud3f4\ub354\uc5d0 GGUF \ud30c\uc77c\uc744 \ubc30\uce58\ud558\uac70\ub098 MODEL_PATH \ud658\uacbd \ubcc0\uc218 \uc124\uc815",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@model_bp.route("/api/download_default_model", methods=["POST", "GET"])
def download_default_model():
    try:
        if find_model_file():
            return jsonify({"status": "exists", "model": os.path.basename(find_model_file())})

        repo_id = os.environ.get("MODEL_REPO", DEFAULT_MODEL_REPO)
        filename = os.environ.get("MODEL_FILE", DEFAULT_MODEL)

        return download_model_stream(repo_id, filename)
    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)}), 500


@model_bp.route("/api/download_status", methods=["GET"])
def get_download_status():
    with download_lock:
        return jsonify({
            "downloading": download_status["downloading"],
            "progress": download_status["progress"],
            "downloaded_mb": download_status["downloaded_mb"],
            "total_mb": download_status["total_mb"],
            "speed": download_status["speed"]
        })
