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


def test_diff_parses_blocks(monkeypatch):
    reply = (
        "<<<<<<< SEARCH\n<h1>Old</h1>\n=======\n<h1>New</h1>\n>>>>>>> REPLACE\n"
        "<<<<<<< SEARCH\n<p>x</p>\n=======\n>>>>>>> REPLACE\n"
    )
    monkeypatch.setattr(er, "llama_chat", lambda messages: reply)
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    body = c.post("/api/edit/diff", json={"message": "제목 바꾸고 문단 삭제", "html": "<h1>Old</h1><p>x</p>"}).get_json()
    assert len(body["blocks"]) == 2
    assert body["blocks"][0]["search"] == "<h1>Old</h1>"
    assert body["blocks"][0]["replace"] == "<h1>New</h1>"
    assert body["blocks"][1]["replace"] == ""  # 삭제


def test_diff_empty_when_no_html(monkeypatch):
    monkeypatch.setattr(er, "llama_chat", lambda messages: "x")
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    assert c.post("/api/edit/diff", json={"message": "수정"}).get_json()["blocks"] == []


def test_intent_ask(monkeypatch):
    monkeypatch.setattr(er, "llama_chat", lambda m: '{"action":"ask","scope":"page","op":"none"}')
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    assert c.post("/api/intent", json={"message": "이 색 어때?", "has_html": True}).get_json()["action"] == "ask"


def test_intent_element_text(monkeypatch):
    monkeypatch.setattr(er, "llama_chat", lambda m: '{"action":"edit","scope":"element","op":"text","value":"자전거 여행"}')
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    b = c.post("/api/intent", json={"message": "자전거 여행으로 바꿔줘", "has_element": True, "has_html": True,
                                    "element": {"tag": "h1", "text": "옛 제목"}}).get_json()
    assert b["action"] == "edit" and b["scope"] == "element" and b["op"] == "text"
    assert b["value"] == "자전거 여행"


def test_intent_invalid_defaults(monkeypatch):
    monkeypatch.setattr(er, "llama_chat", lambda m: 'garbage no json')
    c = __import__("app", fromlist=["create_app"]).create_app().test_client()
    b = c.post("/api/intent", json={"message": "음", "has_html": True}).get_json()
    assert b["action"] == "edit" and b["scope"] == "page"
