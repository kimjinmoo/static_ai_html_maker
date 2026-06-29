"""Fast-edit: 선택 요소 1개에 대한 사용자 요청을 최소 JSON 패치로 변환.

전체 HTML 재생성 대신 작은 LLM 호출로 {op, text, href, src, styles}만 받아
클라이언트가 data-wgen-id 노드에 직접 적용한다. 단순 패치로 표현 불가하면
op="complex"를 반환하고 클라가 전체 재생성으로 폴백한다.
"""

import json

from flask import Blueprint, request, jsonify

from app.model import llama_chat
from app.utils import strip_thinking

edit_bp = Blueprint("edit", __name__)

PATCH_SYSTEM = ("You convert an edit request on ONE selected HTML element into a minimal "
                "JSON patch. Output ONLY JSON, no prose, no markdown.")

VALID_OPS = ("text", "delete", "style", "href", "src")


def _build_prompt(message, el):
    return f"""선택된 HTML 요소 하나에 대한 사용자 수정 요청을 최소 JSON 패치로 변환하세요.

## 요소 정보
- 태그: {el.get('tag', '')}
- 현재 텍스트: {(el.get('text') or '')[:200]}
- HTML: {(el.get('html') or '')[:300]}

## 사용자 요청
"{message}"

## 출력 (오직 JSON, 다른 텍스트 금지)
{{"op": "text|delete|style|href|src|complex", "text": "<op=text일 때 새 텍스트>", "href": "<op=href일 때 URL/경로>", "src": "<op=src일 때 이미지 URL/경로>", "styles": {{"<css-속성>": "<값>"}}}}

## 규칙
- op="text": 요소의 보이는 텍스트만 변경. 새 텍스트를 "text"에 넣으세요.
- op="delete": 요소 삭제.
- op="style": 색/배경/크기/폰트 등 인라인 스타일 변경. "styles"에 CSS 넣으세요. 예: {{"color":"#ff0000"}}.
- op="href": 링크 대상 변경. URL/경로를 "href"에 넣으세요.
- op="src": 이미지 소스 변경. URL/경로를 "src"에 넣으세요.
- op="complex": 자식 추가/삭제, 레이아웃 변경 등 단순 패치로 불가능한 경우.
- 필요한 키만 포함. 최소 JSON. 마크다운 코드블록 금지."""


def _parse_patch(raw):
    raw = strip_thinking(raw or "").strip()
    a = raw.find("{")
    b = raw.rfind("}")
    if a == -1 or b <= a:
        return {"op": "complex"}
    try:
        obj = json.loads(raw[a:b + 1])
    except Exception:
        return {"op": "complex"}
    op = (obj.get("op") or "").lower().strip()
    if op not in VALID_OPS:
        return {"op": "complex"}
    obj["op"] = op
    return obj


@edit_bp.route("/api/edit/patch", methods=["POST"])
def edit_patch():
    data = request.json or {}
    message = (data.get("message") or "").strip()
    el = data.get("element") or {}
    if not message or not el:
        return jsonify({"op": "complex"})
    try:
        raw = llama_chat([
            {"role": "system", "content": PATCH_SYSTEM},
            {"role": "user", "content": _build_prompt(message, el)},
        ])
        return jsonify(_parse_patch(raw))
    except Exception as e:
        print(f"[EditPatch] error: {e}", flush=True)
        return jsonify({"op": "complex"})
