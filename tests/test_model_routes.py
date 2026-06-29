import app.routes.model_routes as mr


def _client(monkeypatch, cfg):
    monkeypatch.setattr(mr, "get_effective_config", lambda: cfg)
    return __import__("app", fromlist=["create_app"]).create_app().test_client()


def test_ollama_backend_reports_ready(monkeypatch):
    c = _client(monkeypatch, {"llm_backend": "ollama", "ollama_host": "http://h",
                              "ollama_model": "m", "gemini_api_key": "", "gemini_model": "g",
                              "model_path": ""})
    body = c.get("/api/models").get_json()
    assert body["status"] == "ready"
    assert body["backend"] == "ollama"


def test_gemini_with_key_ready_without_key_no_model(monkeypatch):
    c = _client(monkeypatch, {"llm_backend": "gemini", "gemini_api_key": "k",
                              "gemini_model": "g", "ollama_host": "", "ollama_model": "",
                              "model_path": ""})
    assert c.get("/api/models").get_json()["status"] == "ready"

    c2 = _client(monkeypatch, {"llm_backend": "gemini", "gemini_api_key": "",
                               "gemini_model": "g", "ollama_host": "", "ollama_model": "",
                               "model_path": ""})
    assert c2.get("/api/models").get_json()["status"] == "no_model"
