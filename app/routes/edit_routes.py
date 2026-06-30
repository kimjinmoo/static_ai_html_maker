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


def _build_prompt(message, el, design_section="", force_html=False, image_url=""):
    design_block = f"\n## 디자인 일관성 참고 (op=html 시 동일 디자인 유지)\n{design_section}\n" if design_section else ""
    img_block = f"\n## 첨부 이미지 URL\n{image_url}\n(이미지 변경이면 op=\"src\" value=이 URL. op=\"html\"이면 <img src=\"{image_url}\" style=\"max-width:100%;height:auto;display:block\">로 사용. 캐션은 별도 <figcaption>/<p>로 분리해 이미지가 캐션을 덮지 않게.)\n" if image_url else ""
    if force_html:
        return f"""선택된 HTML 요소 **하나만** 다시 작성하세요. 페이지의 다른 부분은 절대 포함하지 마세요.

## 선택된 요소
- 태그: {el.get('tag', '')}
- 현재 텍스트: {(el.get('text') or '')[:200]}
- 현재 HTML: {(el.get('html') or '')[:800]}
{design_block}{img_block}
## 사용자 요청
"{message}"

## 출력 (오직 JSON, 다른 텍스트 금지)
{{"op": "html", "html": "<이 요소의 새 outerHTML 전체>"}}

## 규칙
- 반드시 op="html". 같은 태그로 시작하는 이 요소의 새 outerHTML만 "html"에 담으세요.
- 위 디자인 참고의 scaffold 클래스를 사용하고, 색/폰트는 하드코딩하지 말고 기존 디자인을 따르세요.
- 화면에 보이는 텍스트는 **한국어**로 작성하세요(사용자가 다른 언어 명시 시 제외).
- 이 요소 범위만. 페이지 전체·다른 요소 금지. 마크다운 코드블록 금지."""
    return f"""선택된 HTML 요소 **하나만** 변경하는 최소 JSON 패치를 만드세요. 다른 요소·전체 레이아웃은 절대 건드리지 마세요.

## 선택된 요소
- 태그: {el.get('tag', '')}
- 현재 텍스트: {(el.get('text') or '')[:200]}
- 현재 HTML: {(el.get('html') or '')[:800]}
{design_block}{img_block}
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
- 새 텍스트(op=text의 value, op=html의 화면 문구)는 **한국어**로 작성하세요(다른 언어 명시 시 제외).
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


INTENT_SYSTEM = ("You analyze a user's website-editing request and output ONLY a structured "
                 "JSON intent. No prose, no markdown.")

INTENT_ACTIONS = ("ask", "generate", "edit", "delete", "new_page")
INTENT_SCOPES = ("element", "page", "site")
INTENT_OPS = ("text", "style", "href", "src", "html", "none")


def _build_intent_prompt(message, has_element, has_html, el, image_url=""):
    el_info = "없음"
    if has_element and el:
        el_info = f"태그={el.get('tag','')}, 현재텍스트=\"{(el.get('text') or '')[:120]}\""
    img_line = f"\n- 첨부 이미지 URL: {image_url} (이미지 변경/삽입 요청이면 op=\"src\", value=이 URL 사용)" if image_url else ""
    return f"""사용자의 홈페이지 편집 요청을 구조화된 의도(JSON)로 변환하세요.

## 컨텍스트
- 요소 선택됨: {"예" if has_element else "아니오"}
- 현재 페이지 존재: {"예" if has_html else "아니오"}
- 선택된 요소: {el_info}{img_line}

## 사용자 요청
"{message}"

## 출력 (오직 JSON, 다른 텍스트 금지)
{{"action":"ask|generate|edit|delete|new_page","scope":"element|page|site","op":"text|style|href|src|html|none","value":"","styles":{{}},"reason":""}}

## 규칙
- 질문/상담/의견 요청("어때?","추천","어떻게 생각") → action="ask".
- 현재 페이지가 없고 만들기 요청 → action="generate".
- 현재 페이지가 있고 "새 페이지/하위 페이지" 요청 → action="new_page".
- 선택된 요소가 있고 그 요소를 바꾸는 요청 → scope="element":
  - 텍스트 변경 → op="text", value=새 텍스트(요청에서 추출).
  - 색/배경/크기/둥글기/그림자 등 → op="style", styles={{"css속성":"값"}}.
  - 링크 변경 → op="href", value=URL/경로. / 이미지 변경 → op="src", value=URL.
  - 내부 구조/디자인 재작성 → op="html". / 삭제 → action="delete".
- 선택 요소 없이 현재 페이지 일부(섹션/문구) 추가·수정·삭제 → action="edit"/"delete", scope="page", op="none".
- "전체/사이트 전부 다시/싹 다" → scope="site".
- "리팩토링/재구성/디자인 새로/다시 디자인/처음부터/갈아엎/리뉴얼/새롭게" 등 **페이지 전체를 다시 디자인**하는 요청 → action="edit", scope="site".
- value는 사용자가 의도한 **새 텍스트/URL**만 넣으세요. 요소의 **클래스명·태그명·기존 속성값을 value로 절대 쓰지 마세요**. 추출 못 하면 빈 문자열.
- 예: "자전거로 text 수정"(h1 선택) → {{"action":"edit","scope":"element","op":"text","value":"자전거"}}
JSON만 출력."""


def _parse_intent(raw):
    raw = strip_thinking(raw or "").strip()
    a = raw.find("{")
    b = raw.rfind("}")
    if a == -1 or b <= a:
        return {"action": "edit", "scope": "page", "op": "none"}
    try:
        obj = json.loads(raw[a:b + 1])
    except Exception:
        return {"action": "edit", "scope": "page", "op": "none"}
    action = (obj.get("action") or "edit").lower().strip()
    if action not in INTENT_ACTIONS:
        action = "edit"
    scope = (obj.get("scope") or "page").lower().strip()
    if scope not in INTENT_SCOPES:
        scope = "page"
    op = (obj.get("op") or "none").lower().strip()
    if op not in INTENT_OPS:
        op = "none"
    return {
        "action": action, "scope": scope, "op": op,
        "value": obj.get("value", "") or "",
        "styles": obj.get("styles", {}) or {},
        "reason": obj.get("reason", "") or "",
    }


@edit_bp.route("/api/intent", methods=["POST"])
def intent():
    data = request.json or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"action": "ask", "scope": "page", "op": "none"})
    has_element = bool(data.get("has_element"))
    has_html = bool(data.get("has_html"))
    el = data.get("element") or {}
    image_url = data.get("image_url") or ""
    try:
        raw = llama_chat([
            {"role": "system", "content": INTENT_SYSTEM},
            {"role": "user", "content": _build_intent_prompt(message, has_element, has_html, el, image_url)},
        ])
        return jsonify(_parse_intent(raw))
    except Exception as e:
        print(f"[Intent] error: {e}", flush=True)
        return jsonify({"action": "edit", "scope": "page", "op": "none"})


DIFF_SYSTEM = ("You edit HTML by emitting SEARCH/REPLACE blocks only. "
               "Never rewrite the whole document. Output only the blocks, no prose.")


def _build_diff_prompt(message, html, design_section, image_url=""):
    img_block = f"\n## 첨부 이미지 URL\n{image_url}\n(이미지 삽입/변경이면 <img src=\"{image_url}\" style=\"max-width:100%;height:auto;display:block\"> 형태로 사용. 캐션은 별도 <figcaption>/<p>로 분리해 이미지가 캐션을 덮지 않게.)\n" if image_url else ""
    return f"""현재 HTML을 사용자 요청대로 수정하세요. **변경되는 부분만** SEARCH/REPLACE 블록으로 출력하세요. 전체 HTML 재작성 절대 금지.
{img_block}

## 출력 형식 (이것만, 다른 텍스트·설명 금지)
<<<<<<< SEARCH
(현재 HTML에서 그대로 복사한 기존 코드 — 공백/들여쓰기까지 정확히 일치)
=======
(교체할 새 코드)
>>>>>>> REPLACE

- 여러 곳 변경 시 블록을 여러 개 출력하세요.
- **삭제**: REPLACE 부분을 비우세요(아무것도 안 씀).
- **추가**: 적절한 앵커(예: 특정 섹션의 닫는 태그 `</section>`)를 SEARCH로 잡고, REPLACE에 그 앵커 + 새 코드를 함께 넣어 삽입하세요.

## 규칙
- SEARCH 스니펫은 현재 HTML에 **정확히 1번만** 나타나도록 충분한 앞뒤 맥락을 포함하세요.
- 기존 디자인/클래스/구조를 최대한 유지하세요.
- 새로 작성하거나 변경하는 **화면 텍스트는 한국어**로 쓰세요(사용자가 다른 언어를 명시하지 않는 한). 클래스명·속성은 영어 유지.
- 마크다운 코드펜스(```) 금지. 오직 블록만.

## 디자인 참고
{(design_section or '')[:1200]}

## 현재 HTML
{html}

## 사용자 요청
{message}"""


def _parse_diff_blocks(raw):
    import re
    blocks = []
    pattern = re.compile(
        r"<<<<<<<\s*SEARCH\s*\n(.*?)\n?=======\s*\n(.*?)\n?>>>>>>>\s*REPLACE",
        re.DOTALL,
    )
    for m in pattern.finditer(raw or ""):
        blocks.append({"search": m.group(1), "replace": m.group(2)})
    return blocks


@edit_bp.route("/api/edit/diff", methods=["POST"])
def edit_diff():
    data = request.json or {}
    message = (data.get("message") or "").strip()
    html = data.get("html") or ""
    if not message or not html:
        return jsonify({"blocks": []})
    try:
        raw = llama_chat([
            {"role": "system", "content": DIFF_SYSTEM},
            {"role": "user", "content": _build_diff_prompt(message, html, _design_section(data), data.get("image_url") or "")},
        ])
        # strip_thinking은 '=======' 구분선을 노이즈로 제거하므로 적용하지 않는다.
        # 블록 마커는 추론 텍스트와 겹치지 않아 raw에서 바로 파싱한다.
        return jsonify({"blocks": _parse_diff_blocks(raw or "")})
    except Exception as e:
        print(f"[EditDiff] error: {e}", flush=True)
        return jsonify({"blocks": []})


@edit_bp.route("/api/edit/patch", methods=["POST"])
def edit_patch():
    data = request.json or {}
    message = (data.get("message") or "").strip()
    el = data.get("element") or {}
    if not message or not el:
        return jsonify({"op": "complex"})
    force_html = bool(data.get("force_html"))
    image_url = data.get("image_url") or ""
    try:
        raw = llama_chat([
            {"role": "system", "content": PATCH_SYSTEM},
            {"role": "user", "content": _build_prompt(message, el, _design_section(data), force_html, image_url)},
        ])
        return jsonify(_parse_patch(raw))
    except Exception as e:
        print(f"[EditPatch] error: {e}", flush=True)
        return jsonify({"op": "complex"})
