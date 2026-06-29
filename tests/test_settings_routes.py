import json

import app.settings as settings
import app.routes.settings_routes as sr


def _client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "_settings_path", lambda: str(tmp_path / "settings.json"))
    monkeypatch.setattr(sr, "reset_backend", lambda: None)  # 부수효과 차단
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    return flask_app.test_client()


def test_get_settings_masks_api_key(monkeypatch, tmp_path):
    settings.save_settings  # ensure import
    monkeypatch.setattr(settings, "_settings_path", lambda: str(tmp_path / "settings.json"))
    settings.save_settings({"gemini_api_key": "secret123"})
    monkeypatch.setattr(sr, "reset_backend", lambda: None)
    client = __import__("app", fromlist=["create_app"]).create_app().test_client()
    resp = client.get("/api/settings")
    body = resp.get_json()
    assert resp.status_code == 200
    assert "gemini_api_key" not in body          # 값 노출 금지
    assert body["gemini_api_key_set"] is True


def test_post_settings_saves_and_resets(monkeypatch, tmp_path):
    called = {"reset": False}
    monkeypatch.setattr(settings, "_settings_path", lambda: str(tmp_path / "settings.json"))
    monkeypatch.setattr(sr, "reset_backend", lambda: called.__setitem__("reset", True))
    client = __import__("app", fromlist=["create_app"]).create_app().test_client()
    resp = client.post("/api/settings", json={"llm_backend": "ollama", "ollama_model": "qwen"})
    assert resp.status_code == 200
    assert called["reset"] is True
    saved = json.load(open(str(tmp_path / "settings.json"), encoding="utf-8"))
    assert saved["llm_backend"] == "ollama"
    assert saved["ollama_model"] == "qwen"


def test_post_empty_api_key_keeps_existing(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "_settings_path", lambda: str(tmp_path / "settings.json"))
    settings.save_settings({"gemini_api_key": "keepme"})
    monkeypatch.setattr(sr, "reset_backend", lambda: None)
    client = __import__("app", fromlist=["create_app"]).create_app().test_client()
    client.post("/api/settings", json={"llm_backend": "gemini", "gemini_api_key": ""})
    assert settings.get_effective_config()["gemini_api_key"] == "keepme"


def test_test_ollama_endpoint(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "_settings_path", lambda: str(tmp_path / "settings.json"))
    monkeypatch.setattr(sr, "reset_backend", lambda: None)
    monkeypatch.setattr(sr, "_test_ollama",
                        lambda host: {"ok": True, "message": "ok", "models": ["m"]})
    client = __import__("app", fromlist=["create_app"]).create_app().test_client()
    resp = client.post("/api/settings/test", json={"llm_backend": "ollama", "ollama_host": "http://x"})
    body = resp.get_json()
    assert body["ok"] is True
