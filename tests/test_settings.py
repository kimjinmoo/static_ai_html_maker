import json
import os

import app.settings as settings


def test_effective_config_uses_env_defaults_when_no_file(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "_settings_path", lambda: str(tmp_path / "settings.json"))
    cfg = settings.get_effective_config()
    assert cfg["llm_backend"]  # 기본값 존재
    assert "ollama_host" in cfg
    assert "gemini_api_key" in cfg


def test_save_and_override(monkeypatch, tmp_path):
    p = str(tmp_path / "settings.json")
    monkeypatch.setattr(settings, "_settings_path", lambda: p)
    settings.save_settings({"llm_backend": "ollama", "ollama_model": "llama3"})
    cfg = settings.get_effective_config()
    assert cfg["llm_backend"] == "ollama"
    assert cfg["ollama_model"] == "llama3"
    # 파일에 실제 저장
    with open(p, encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["llm_backend"] == "ollama"


def test_empty_value_does_not_override_default(monkeypatch, tmp_path):
    p = str(tmp_path / "settings.json")
    monkeypatch.setattr(settings, "_settings_path", lambda: p)
    settings.save_settings({"gemini_api_key": "secret"})
    # 빈 문자열 저장 시도 → 무시되지 않고 저장은 되나 effective에선 빈값 무시
    settings.save_settings({"ollama_host": ""})
    cfg = settings.get_effective_config()
    assert cfg["gemini_api_key"] == "secret"
    assert cfg["ollama_host"]  # 빈값 대신 env 기본 유지


def test_save_partial_keeps_existing(monkeypatch, tmp_path):
    p = str(tmp_path / "settings.json")
    monkeypatch.setattr(settings, "_settings_path", lambda: p)
    settings.save_settings({"llm_backend": "gemini", "gemini_api_key": "k1"})
    settings.save_settings({"gemini_model": "gemini-2.5-pro"})  # 부분 업데이트
    cfg = settings.get_effective_config()
    assert cfg["llm_backend"] == "gemini"
    assert cfg["gemini_api_key"] == "k1"  # 유지
    assert cfg["gemini_model"] == "gemini-2.5-pro"


def test_backend_normalized_lowercase(monkeypatch, tmp_path):
    p = str(tmp_path / "settings.json")
    monkeypatch.setattr(settings, "_settings_path", lambda: p)
    settings.save_settings({"llm_backend": "  OLLAMA  "})
    assert settings.get_effective_config()["llm_backend"] == "ollama"
