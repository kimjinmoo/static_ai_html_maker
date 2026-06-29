"""Fast-edit: 선택 요소 1개에 대한 사용자 요청을 최소 JSON 패치로 변환.

전체 HTML 재생성 대신 작은 LLM 호출로 {op, text, href, src, styles}만 받아
클라이언트가 data-wgen-id 노드에 직접 적용한다. 단순 패치로 표현 불가하면
op="complex"를 반환하고 클라가 전체 재생성으로 폴백한다.
"""

import json

from flask import Blueprint, request, jsonify

from app.model import llama_chat
from app.utils import strip_thinking, SCAFFOLD_CLASS_REFERENCE

edit_bp = Blueprint("edit", __name__)

PATCH_SYSTEM = ("You convert an edit request on ONE selected HTML element into a minimal "
                "JSON patch that changes ONLY that element. Output ONLY JSON, no prose, no markdown.")

VALID_OPS = ("text", "delete", "style", "href", "src", "html")


def _build_prompt(message, el, design_section="", force_html=False):
    design_block = f"\n## 디자인 일관성 참고 (op=html 시 동일 디자인 유지)\n{design_section}\n" if design_section else ""
    if force_html:
        return f"""선택된 HTML 요소 **하나만** 다시 작성하세요. 페이지의 다른 부분은 절대 포함하지 마세요.

## 선택된 요소
- 태그: {el.get('tag', '')}
- 현재 텍스트: {(el.get('text') or '')[:200]}
- 현재 HTML: {(el.get('html') or '')[:800]}
{design_block}
## 사용자 요청
"{message}"

## 출력 (오직 JSON, 다른 텍스트 금지)
{{"op": "html", "html": "<이 요소의 새 outerHTML 전체>"}}

## 규칙
- 반드시 op="html". 같은 태그로 시작하는 이 요소의 새 outerHTML만 "html"에 담으세요.
- 위 디자인 참고의 scaffold 클래스를 사용하고, 색/폰트는 하드코딩하지 말고 기존 디자인을 따르세요.
- 이 요소 범위만. 페이지 전체·다른 요소 금지. 마크다운 코드블록 금지."""
    return f"""선택된 HTML 요소 **하나만** 변경하는 최소 JSON 패치를 만드세요. 다른 요소·전체 레이아웃은 절대 건드리지 마세요.

## 선택된 요소
- 태그: {el.get('tag', '')}
- 현재 텍스트: {(el.get('text') or '')[:200]}
- 현재 HTML: {(el.get('html') or '')[:800]}
{design_block}
## 사용자 요청
"{message}"

## 출력 (오직 JSON, 다른 텍스트 금지)
{{"op": "text|delete|style|href|src|html|complex", "text": "<새 텍스트>", "href": "<URL>", "src": "<이미지 URL>", "styles": {{"<css>": "<값>"}}, "html": "<이 요소의 새 outerHTML 전체>"}}

## op 선택 규칙 (우선순위)
- op="text": 보이는 텍스트만 변경.
- op="delete": 요소 삭제.
- op="href": 링크 대상 변경. / op="src": 이미지 소스 변경.
- op="style": 색/배경/크기/여백/그림자/둥글기/정렬 등 **인라인 CSS로 표현 가능한** 디자인 변경. "styles"에 필요한 CSS 속성 모두 넣으세요. 예: {{"border-radius":"12px","box-shadow":"0 4px 16px rgba(0,0,0,.15)","padding":"16px 24px"}}.
- op="html": 요소 **내부 구조/디자인을 다시 짜야** 하는 경우(자식 재배치, 새 마크업 등). 그 요소의 **새 outerHTML 전체**를 "html"에 넣으세요. 같은 태그로 시작하고, 위 디자인 참고의 scaffold 클래스를 사용하며, 색/폰트는 하드코딩하지 말고 기존 디자인을 따르세요. 이 요소 범위만 작성(페이지 전체 금지).
- op="complex": **다른 요소까지** 함께 바꿔야 하거나 형제/부모 구조 변경이 필요한 경우에만.

**디자인 요청은 거의 항상 op="style" 또는 op="html"로 처리 가능합니다. op="complex"는 정말 다른 요소가 얽힐 때만 쓰세요.**
필요한 키만 포함. 최소 JSON. 마크다운 코드블록 금지."""


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


def _design_section(data):
    ds = data.get("design_system")
    if not ds:
        return SCAFFOLD_CLASS_REFERENCE
    try:
        from app.design_system import DesignSystem
        return DesignSystem.from_dict(ds).design_prompt_section()
    except Exception:
        return SCAFFOLD_CLASS_REFERENCE


@edit_bp.route("/api/edit/patch", methods=["POST"])
def edit_patch():
    data = request.json or {}
    message = (data.get("message") or "").strip()
    el = data.get("element") or {}
    if not message or not el:
        return jsonify({"op": "complex"})
    force_html = bool(data.get("force_html"))
    try:
        raw = llama_chat([
            {"role": "system", "content": PATCH_SYSTEM},
            {"role": "user", "content": _build_prompt(message, el, _design_section(data), force_html)},
        ])
        return jsonify(_parse_patch(raw))
    except Exception as e:
        print(f"[EditPatch] error: {e}", flush=True)
        return jsonify({"op": "complex"})
