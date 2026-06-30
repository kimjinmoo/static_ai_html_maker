"""웹 백엔드 설정 API. settings.json에 저장하고 reset_backend로 즉시 적용.

GET  /api/settings        현재 유효 설정 (gemini_api_key는 값 대신 설정여부만)
POST /api/settings        부분 저장 + 백엔드 리셋 (빈 api_key는 기존 유지)
POST /api/settings/test   현재(또는 요청) 백엔드 연결 테스트
"""

import json
import urllib.request

from flask import Blueprint, request, jsonify

from app.settings import get_effective_config, save_settings
from app.backends import reset_backend

settings_bp = Blueprint("settings", __name__)


def _masked(cfg):
    """api_key 값을 숨기고 설정 여부만 노출한다."""
    out = {
        "llm_backend": cfg.get("llm_backend", "local"),
        "ollama_host": cfg.get("ollama_host", ""),
        "ollama_model": cfg.get("ollama_model", ""),
        "gemini_model": cfg.get("gemini_model", ""),
        "model_path": cfg.get("model_path", ""),
        "gemini_api_key_set": bool(cfg.get("gemini_api_key")),
        "openai_base_url": cfg.get("openai_base_url", ""),
        "openai_model": cfg.get("openai_model", ""),
        "openai_api_key_set": bool(cfg.get("openai_api_key")),
    }
    return out


@settings_bp.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify(_masked(get_effective_config()))


@settings_bp.route("/api/settings", methods=["POST"])
def update_settings():
    data = request.json or {}
    partial = {}
    for k in ("llm_backend", "ollama_host", "ollama_model", "gemini_model", "model_path",
              "openai_base_url", "openai_model"):
        if k in data:
            partial[k] = data[k]
    # 빈 api_key는 "기존 유지"로 간주(매 저장 시 마스킹된 빈값으로 덮어쓰지 않도록)
    if data.get("gemini_api_key"):
        partial["gemini_api_key"] = data["gemini_api_key"]
    if data.get("openai_api_key"):
        partial["openai_api_key"] = data["openai_api_key"]

    save_settings(partial)
    reset_backend()  # 재시작 없이 즉시 적용
    return jsonify({"status": "ok", "settings": _masked(get_effective_config())})


def _test_ollama(host):
    url = host.rstrip("/") + "/api/tags"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    models = [m.get("name", "") for m in data.get("models", [])]
    return {"ok": True, "message": f"Ollama 연결 성공 (모델 {len(models)}개)", "models": models}


@settings_bp.route("/api/settings/test", methods=["POST"])
def test_settings():
    data = request.json or {}
    cfg = get_effective_config()
    backend = (data.get("llm_backend") or cfg.get("llm_backend") or "local").lower().strip()
    try:
        if backend == "ollama":
            host = data.get("ollama_host") or cfg.get("ollama_host")
            return jsonify(_test_ollama(host))
        if backend == "openai":
            key = data.get("openai_api_key") or cfg.get("openai_api_key")
            base = (data.get("openai_base_url") or cfg.get("openai_base_url") or "").rstrip("/")
            if not key:
                return jsonify({"ok": False, "message": "API 키가 설정되지 않았습니다."})
            try:
                req = urllib.request.Request(base + "/models", headers={"Authorization": "Bearer " + key}, method="GET")
                with urllib.request.urlopen(req, timeout=8) as resp:
                    d = json.loads(resp.read().decode("utf-8"))
                n = len(d.get("data", []) if isinstance(d, dict) else [])
                return jsonify({"ok": True, "message": f"연결 성공 (모델 {n}개 조회됨)"})
            except Exception as e:
                return jsonify({"ok": False, "message": f"연결 실패: {e}"})
        if backend == "gemini":
            key = data.get("gemini_api_key") or cfg.get("gemini_api_key")
            if not key:
                return jsonify({"ok": False, "message": "Gemini API 키가 설정되지 않았습니다."})
            try:
                from google import genai  # noqa: F401
            except Exception:
                return jsonify({"ok": False, "message": "google-genai 패키지가 설치되지 않았습니다."})
            return jsonify({"ok": True, "message": "Gemini API 키가 설정되어 있습니다."})
        # local
        from app.utils import find_model_file
        path = data.get("model_path") or cfg.get("model_path") or find_model_file()
        if path:
            return jsonify({"ok": True, "message": f"로컬 모델 확인: {path}"})
        return jsonify({"ok": False, "message": "GGUF 모델 파일을 찾을 수 없습니다."})
    except Exception as e:
        return jsonify({"ok": False, "message": f"연결 실패: {e}"})
