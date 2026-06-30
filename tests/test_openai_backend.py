import io
import json
import app.backends.openai_compat as ob


class _R(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_chat(monkeypatch):
    def fake(req, timeout=None):
        assert req.full_url.endswith("/chat/completions")
        assert req.headers.get("Authorization") == "Bearer k"
        return _R(json.dumps({"choices": [{"message": {"content": "안녕"}}]}).encode())
    monkeypatch.setattr(ob.urllib.request, "urlopen", fake)
    b = ob.OpenAICompatBackend(api_key="k", base_url="https://api.openai.com/v1", model="gpt-4o-mini")
    assert b.chat([{"role": "user", "content": "hi"}]) == "안녕"


def test_stream(monkeypatch):
    sse = 'data: {"choices":[{"delta":{"content":"A"}}]}\n\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n'
    monkeypatch.setattr(ob.urllib.request, "urlopen", lambda req, timeout=None: _R(sse.encode()))
    b = ob.OpenAICompatBackend(api_key="k")
    assert list(b.chat_stream([{"role": "user", "content": "x"}])) == ["A", "B"]
