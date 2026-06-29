import app.backends as backends


def _cfg(**over):
    base = {"llm_backend": "ollama", "ollama_host": "http://h:1", "ollama_model": "m1",
            "gemini_api_key": "", "gemini_model": "g", "model_path": ""}
    base.update(over)
    return base


def test_get_backend_ollama_from_settings(monkeypatch):
    monkeypatch.setattr("app.settings.get_effective_config", lambda: _cfg())
    backends.reset_backend()
    try:
        b = backends.get_backend()
        assert type(b).__name__ == "OllamaBackend"
        assert b._model == "m1"
        assert b._host == "http://h:1"
    finally:
        backends.reset_backend()


def test_reset_backend_allows_runtime_switch(monkeypatch):
    state = {"cfg": _cfg(ollama_model="m1")}
    monkeypatch.setattr("app.settings.get_effective_config", lambda: state["cfg"])
    backends.reset_backend()
    try:
        assert backends.get_backend()._model == "m1"
        # 리셋 전엔 캐시 유지
        state["cfg"] = _cfg(ollama_model="m2")
        assert backends.get_backend()._model == "m1"
        # 리셋 후 새 설정 반영
        backends.reset_backend()
        assert backends.get_backend()._model == "m2"
    finally:
        backends.reset_backend()


def test_get_backend_local_default(monkeypatch):
    monkeypatch.setattr("app.settings.get_effective_config",
                        lambda: _cfg(llm_backend="local"))
    backends.reset_backend()
    try:
        b = backends.get_backend()
        assert type(b).__name__ == "LocalLlamaBackend"
    finally:
        backends.reset_backend()
