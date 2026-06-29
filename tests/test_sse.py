import json
from app.sse import sse_event, EventType


def test_sse_event_shape():
    line = sse_event(EventType.CHAT, "안녕", phase="ask")
    assert line.startswith("data: ")
    assert line.endswith("\n\n")
    payload = json.loads(line[len("data: "):].strip())
    assert payload == {"phase": "ask", "type": "chat", "payload": "안녕"}


def test_sse_event_handles_surrogates():
    bad = "test\ud83d"  # lone surrogate
    line = sse_event(EventType.HTML, bad, phase="generate")
    # 인코딩 에러 없이 직렬화돼야 함
    line.encode("utf-8")


def test_done_event():
    line = sse_event(EventType.DONE, {"html": "<p>x</p>"}, phase="generate")
    payload = json.loads(line[len("data: "):].strip())
    assert payload["type"] == "done"
    assert payload["payload"]["html"] == "<p>x</p>"
