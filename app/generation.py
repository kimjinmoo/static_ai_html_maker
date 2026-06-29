"""단일 생성/수정 프롬프트 빌더. 모든 경로가 이 함수를 통해 프롬프트를 만든다.
AI는 body 콘텐츠만 생성하고 골격은 DesignSystem.build_frame이 조립한다."""

from enum import Enum

from app.prompts import CONTENT_ONLY_PROMPT, SYSTEM_PROMPT

HISTORY_TURNS = 5


class Mode(str, Enum):
    ASK = "ask"
    GENERATE = "generate"
    EDIT = "edit"
    DELETE = "delete"


def _design_system_prompt(ds):
    return CONTENT_ONLY_PROMPT + "\n\n" + ds.design_prompt_section()


def build_generation_prompt(ds, mode, user_message, history=None,
                            current_html=None, element_context=None):
    """모드별 messages 리스트를 만든다.

    GENERATE: 새 페이지 콘텐츠 생성(body 섹션만).
    EDIT/DELETE: 현재 HTML 전체를 주고 수정/삭제. element_context가 있으면
                 data-wgen-id로 대상 요소를 명시 타겟팅.
    """
    history = history or []

    if mode in (Mode.EDIT, Mode.DELETE):
        system = SYSTEM_PROMPT + "\n\n" + ds.design_prompt_section()
        user = _build_edit_user_message(mode, user_message, current_html, element_context)
    else:  # GENERATE
        system = _design_system_prompt(ds)
        user = f"## 요청\n{user_message}"

    messages = [{"role": "system", "content": system}]
    for msg in history[-HISTORY_TURNS:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user})
    return messages


def _build_edit_user_message(mode, user_message, current_html, element_context):
    parts = []
    if element_context:
        wid = element_context.get("wgen_id", "")
        parts.append("## 수정 대상 요소 (이 요소만 변경)")
        parts.append(f"- data-wgen-id: {wid}")
        parts.append(f"- 태그: {element_context.get('tag','')}")
        if element_context.get("text"):
            parts.append(f"- 현재 텍스트: {element_context['text'][:300]}")
        parts.append("")
    if current_html:
        parts.append("## 현재 전체 HTML (수정 대상)")
        parts.append("```html")
        parts.append(current_html)   # 절단 없음 — 전체
        parts.append("```")
        parts.append("")
    action = "삭제" if mode == Mode.DELETE else "수정"
    parts.append(f"## 사용자 요청 ({action})")
    parts.append(user_message)
    parts.append("")
    parts.append("## 규칙 (반드시 준수)")
    if element_context:
        parts.append(f"1. data-wgen-id='{element_context.get('wgen_id','')}' 요소만 {action}하고 나머지는 그대로 유지.")
    else:
        parts.append(f"1. 요청에 해당하는 부분만 {action}하고 나머지 구조는 그대로 유지.")
    parts.append("2. 수정된 완전한 HTML 파일 전체를 출력.")
    parts.append("3. 반드시 ===HTML_START=== 로 시작하여 ===HTML_END=== 로 끝낼 것.")
    parts.append("4. 마크다운 코드블록(```)·설명·변경사항 리스트를 절대 출력하지 말 것.")
    return "\n".join(parts)
