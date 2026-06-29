import app.routes.edit_routes as er


def _client(monkeypatch, reply):
    monkeypatch.setattr(er, "llama_chat", lambda messages: reply)
    return __import__("app", fromlist=["create_app"]).create_app().test_client()


def test_text_patch(monkeypatch):
    c = _client(monkeypatch, '{"op":"text","text":"새 제목"}')
    body = c.post("/api/edit/patch", json={"message": "제목을 새 제목으로", "element": {"tag": "h1", "text": "옛 제목"}}).get_json()
    assert body["op"] == "text"
    assert body["text"] == "새 제목"


def test_delete_patch(monkeypatch):
    c = _client(monkeypatch, 'sure: {"op":"delete"} done')
    body = c.post("/api/edit/patch", json={"message": "이거 삭제", "element": {"tag": "div"}}).get_json()
    assert body["op"] == "delete"


def test_style_patch(monkeypatch):
    c = _client(monkeypatch, '{"op":"style","styles":{"color":"#ff0000"}}')
    body = c.post("/api/edit/patch", json={"message": "글자 빨갛게", "element": {"tag": "p"}}).get_json()
    assert body["op"] == "style"
    assert body["styles"]["color"] == "#ff0000"


def test_invalid_op_becomes_complex(monkeypatch):
    c = _client(monkeypatch, '{"op":"rebuild everything"}')
    body = c.post("/api/edit/patch", json={"message": "전체 레이아웃 바꿔", "element": {"tag": "section"}}).get_json()
    assert body["op"] == "complex"


def test_non_json_becomes_complex(monkeypatch):
    c = _client(monkeypatch, "I cannot do that as a patch.")
    body = c.post("/api/edit/patch", json={"message": "음", "element": {"tag": "div"}}).get_json()
    assert body["op"] == "complex"


def test_missing_element_complex(monkeypatch):
    c = _client(monkeypatch, '{"op":"text","text":"x"}')
    body = c.post("/api/edit/patch", json={"message": "바꿔"}).get_json()
    assert body["op"] == "complex"


def test_html_patch_for_design_request(monkeypatch):
    c = _client(monkeypatch, '{"op":"html","html":"<button class=\\"btn btn-primary btn-pill\\">눌러요</button>"}')
    body = c.post("/api/edit/patch", json={"message": "이 버튼 더 둥글게 디자인 바꿔", "element": {"tag": "button", "html": "<button>눌러요</button>"}}).get_json()
    assert body["op"] == "html"
    assert "btn-pill" in body["html"]


def test_design_section_used_when_design_system_present(monkeypatch):
    captured = {}
    def fake(messages):
        captured["user"] = messages[-1]["content"]
        return '{"op":"style","styles":{"border-radius":"12px"}}'
    monkeypatch.setattr(er, "llama_chat", fake)
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    c.post("/api/edit/patch", json={"message": "둥글게", "element": {"tag": "div"},
                                    "design_system": {"template": "minimal_clean", "page_type": "company",
                                                      "scaffold_css": ".x{}", "design_content": "primary=#123", "brand": "B", "menu_items": []}})
    assert "primary=#123" in captured["user"] or ".container" in captured["user"]


def test_force_html_prompt(monkeypatch):
    captured = {}
    def fake(messages):
        captured["user"] = messages[-1]["content"]
        return '{"op":"html","html":"<div>x</div>"}'
    monkeypatch.setattr(er, "llama_chat", fake)
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    body = c.post("/api/edit/patch", json={"message": "복잡", "element": {"tag": "div", "html": "<div>y</div>"}, "force_html": True}).get_json()
    assert body["op"] == "html"
    assert '반드시 op="html"' in captured["user"]
