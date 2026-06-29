import json

import app.routes.stream_routes as sr


def _events(resp):
    out = []
    for raw in resp.data.decode("utf-8").split("\n\n"):
        raw = raw.strip()
        if raw.startswith("data: "):
            out.append(json.loads(raw[len("data: "):]))
    return out


def test_ask_mode_emits_only_chat_no_html(monkeypatch):
    monkeypatch.setattr(sr, "llama_chat_stream",
                        lambda messages: iter(["좋은", " 질문", "이네요"]))
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()
    resp = client.post("/api/chat/stream/v2", json={
        "message": "어떤 색이 좋을까?", "has_html": True, "has_element": False,
        "design_system": {"template": "minimal_clean", "page_type": "company",
                          "scaffold_css": ".x{}", "design_content": "", "brand": "B",
                          "menu_items": []},
        "current_html": "<!DOCTYPE html><html><body></body></html>",
        "history": [],
    })
    evts = _events(resp)
    types = {e["type"] for e in evts}
    assert "chat" in types
    assert "html" not in types  # ASK는 미리보기 절대 안 건드림


def test_generate_mode_emits_html_and_done(monkeypatch):
    # AI가 body 섹션을 반환하도록 모킹
    monkeypatch.setattr(sr, "llama_chat_stream",
                        lambda messages: iter([
                            "===CONTENT_START===",
                            '<section class="hero"><div class="container">',
                            '<h1 class="hero-title">카페</h1></div></section>',
                            "===CONTENT_END===",
                        ]))
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()
    resp = client.post("/api/chat/stream/v2", json={
        "message": "카페 홈페이지 만들어줘", "has_html": False, "has_element": False,
        "design_system": {"template": "minimal_clean", "page_type": "company",
                          "scaffold_css": ".hero{}", "design_content": "", "brand": "B",
                          "menu_items": []},
        "history": [],
    })
    evts = _events(resp)
    types = [e["type"] for e in evts]
    assert "html" in types
    assert "done" in types
    html_evt = next(e for e in evts if e["type"] == "html")
    html = html_evt["payload"] if isinstance(html_evt["payload"], str) else html_evt["payload"].get("html", "")
    assert "<!DOCTYPE html>" in html
    assert "카페" in html
