"""웹에서 설정한 백엔드 구성의 영속 저장소.

settings.json(레포 루트, projects/ 밖)에 저장하고 env 기본값 위에 덮어쓴다.
get_effective_config()가 백엔드 선택·연결 파라미터의 단일 진실원이다.
"""

import json
import os

from app import config

# 웹에서 설정 가능한 필드 (env 기본값을 덮어쓴다)
FIELDS = [
    "llm_backend",
    "ollama_host",
    "ollama_model",
    "gemini_api_key",
    "gemini_model",
    "model_path",
]


def _settings_path():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "settings.json")


def _env_defaults():
    return {
        "llm_backend": config.LLM_BACKEND,
        "ollama_host": config.OLLAMA_HOST,
        "ollama_model": config.OLLAMA_MODEL,
        "gemini_api_key": config.GEMINI_API_KEY,
        "gemini_model": config.GEMINI_MODEL,
        "model_path": config.MODEL_PATH,
    }


def load_settings():
    """settings.json 원본(부분 가능)을 반환. 없으면 빈 dict."""
    path = _settings_path()
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f) or {}
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def get_effective_config():
    """env 기본값 + 저장된 설정(빈 값은 무시)을 병합한 유효 구성."""
    cfg = _env_defaults()
    saved = load_settings()
    for k in FIELDS:
        v = saved.get(k)
        if v is not None and v != "":
            cfg[k] = v
    cfg["llm_backend"] = (cfg.get("llm_backend") or "local").lower().strip()
    return cfg


def save_settings(partial):
    """부분 설정을 병합 저장. None 값은 무시(기존 유지). 저장본 반환."""
    current = load_settings()
    for k in FIELDS:
        if k in partial and partial[k] is not None:
            current[k] = partial[k]
    path = _settings_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)
    return current
