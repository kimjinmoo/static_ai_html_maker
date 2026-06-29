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


def test_generate_mode_strips_content_start_marker_no_stray_char(monkeypatch):
    # ===CONTENT_START=== 는 19자 — off-by-one이면 body가 '='로 시작
    monkeypatch.setattr(sr, "llama_chat_stream",
                        lambda messages: iter([
                            "===CONTENT_START===\n",
                            '<section class="hero"><h1 class="hero-title">카페</h1></section>',
                            "\n===CONTENT_END===",
                        ]))
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()
    resp = client.post("/api/chat/stream/v2", json={
        "message": "카페 만들어줘", "design_system": {
            "template": "minimal_clean", "page_type": "company",
            "scaffold_css": ".hero{}", "design_content": "", "brand": "B", "menu_items": []},
        "history": [],
    })
    evts = _events(resp)
    html_evt = next(e for e in evts if e["type"] == "html")
    html = html_evt["payload"] if isinstance(html_evt["payload"], str) else html_evt["payload"]["html"]
    # body 콘텐츠가 정확히 <section 으로 시작, 앞에 stray '=' 없음
    body = html.split("{CONTENT}")[0] if "{CONTENT}" in html else html
    assert "=<section" not in html
    assert "===" not in html.split("</head>")[-1]  # body에 마커 잔재 없음


def test_edit_mode_emits_single_html_event(monkeypatch):
    edited = "<!DOCTYPE html><html><body><p>edited</p></body></html>"
    monkeypatch.setattr(sr, "llama_chat_stream",
                        lambda messages: iter([
                            "===HTML_START===", edited, "===HTML_END===",
                        ]))
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()
    resp = client.post("/api/chat/stream/v2", json={
        "message": "문구 바꿔", "mode": "edit",
        "design_system": {"template": "minimal_clean", "page_type": "company",
                          "scaffold_css": ".x{}", "design_content": "", "brand": "B", "menu_items": []},
        "current_html": "<!DOCTYPE html><html><body><p>old</p></body></html>",
        "history": [],
    })
    evts = _events(resp)
    html_evts = [e for e in evts if e["type"] == "html"]
    assert len(html_evts) == 1
    assert "edited" in (html_evts[0]["payload"] if isinstance(html_evts[0]["payload"], str) else html_evts[0]["payload"]["html"])


def test_edit_malformed_output_falls_back_to_current_html(monkeypatch):
    # 마커/DOCTYPE 없는 횡설수설 → html 이벤트 없이 error + done{html: current}
    monkeypatch.setattr(sr, "llama_chat_stream",
                        lambda messages: iter(["수정했습니다 어쩌고 설명만 잔뜩"]))
    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()
    current = "<!DOCTYPE html><html><body><p>keep me</p></body></html>"
    resp = client.post("/api/chat/stream/v2", json={
        "message": "배경 바꿔", "mode": "edit",
        "design_system": {"template": "minimal_clean", "page_type": "company",
                          "scaffold_css": ".x{}", "design_content": "", "brand": "B", "menu_items": []},
        "current_html": current, "history": [],
    })
    evts = _events(resp)
    types = [e["type"] for e in evts]
    assert "error" in types
    assert "html" not in types  # 원시 텍스트를 html로 덤프하지 않음
    done = next(e for e in evts if e["type"] == "done")
    assert done["payload"]["html"] == current
