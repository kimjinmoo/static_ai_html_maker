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
