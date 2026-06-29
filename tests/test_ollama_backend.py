import io
import json

import app.backends.ollama as ob


class _FakeResp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _ndjson(lines):
    return _FakeResp(("\n".join(json.dumps(x) for x in lines)).encode("utf-8"))


def test_chat_concatenates_message_content(monkeypatch):
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return _ndjson([
            {"message": {"content": "안녕"}, "done": False},
            {"message": {"content": "하세요"}, "done": True},
        ])

    monkeypatch.setattr(ob.urllib.request, "urlopen", fake_urlopen)
    backend = ob.OllamaBackend()
    out = backend.chat([{"role": "user", "content": "hi"}])
    assert out == "안녕하세요"
    assert captured["url"].endswith("/api/chat")
    assert captured["body"]["stream"] is True


def test_chat_stream_yields_tokens(monkeypatch):
    def fake_urlopen(req, timeout=None):
        return _ndjson([
            {"message": {"content": "A"}, "done": False},
            {"message": {"content": "B"}, "done": True},
        ])
    monkeypatch.setattr(ob.urllib.request, "urlopen", fake_urlopen)
    backend = ob.OllamaBackend()
    assert list(backend.chat_stream([{"role": "user", "content": "x"}])) == ["A", "B"]


def test_reasoning_maps_thinking_field(monkeypatch):
    def fake_urlopen(req, timeout=None):
        return _ndjson([
            {"message": {"thinking": "생각", "content": ""}, "done": False},
            {"message": {"content": "답"}, "done": True},
        ])
    monkeypatch.setattr(ob.urllib.request, "urlopen", fake_urlopen)
    backend = ob.OllamaBackend()
    events = list(backend.chat_stream_with_reasoning([{"role": "user", "content": "x"}]))
    assert {"type": "reasoning", "text": "생각"} in events
    assert {"type": "content", "text": "답"} in events
