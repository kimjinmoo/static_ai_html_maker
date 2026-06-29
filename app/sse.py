"""통일 SSE 이벤트 직렬화. 모든 스트림 엔드포인트가 이걸 쓴다.

이벤트 스키마: {"phase": <str>, "type": <EventType>, "payload": <any>}
클라는 type으로만 라우팅한다 (html→미리보기, chat→채팅창).
"""

import json
from enum import Enum

from app.utils import sanitize_surrogates


class EventType(str, Enum):
    STATUS = "status"        # 모달 진행상황
    REASONING = "reasoning"  # 추론 과정 (클라에서 숨김)
    CHAT = "chat"            # 채팅창에만 표시
    HTML = "html"            # 미리보기 iframe에만 반영 (스트리밍 조각)
    DONE = "done"            # 완료 (payload에 최종 html 포함 가능)
    ERROR = "error"


def _sanitize(value):
    if isinstance(value, str):
        return sanitize_surrogates(value)
    if isinstance(value, dict):
        return {k: _sanitize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v) for v in value]
    return value


def sse_event(event_type, payload, phase=""):
    et = event_type.value if isinstance(event_type, EventType) else str(event_type)
    obj = {"phase": phase, "type": et, "payload": _sanitize(payload)}
    try:
        body = json.dumps(obj, ensure_ascii=True)
    except Exception:
        obj["payload"] = repr(obj["payload"])
        body = json.dumps(obj, ensure_ascii=True)
    return f"data: {body}\n\n"
