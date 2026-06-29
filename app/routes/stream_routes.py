"""통일 스트림 엔드포인트. 모드 분류 → DesignSystem 기반 결정적 조립 →
통일 SSE 이벤트. ASK는 chat만, 생성/수정은 html+done."""

import re

from flask import Blueprint, request, jsonify, Response

from app.model import llama_chat_stream
from app.design_system import DesignSystem
from app.generation import build_generation_prompt, Mode
from app.mode import classify_mode
from app.sse import sse_event, EventType
from app.thinking import filter_thinking_stream
from app.utils import (sanitize_surrogates, ensure_complete_html,
                       strip_thinking, _remove_truncated_lines)

stream_bp = Blueprint("stream", __name__)

ASK_SYSTEM = ("당신은 홈페이지 제작을 도와주는 AI 컨설턴트입니다. 사용자의 질문에 "
              "친절하고 구체적으로 답하고, 필요하면 디자인/구성 의견을 제안하세요. "
              "HTML 코드는 생성하지 말고 한국어 텍스트로만 답하세요.")


def _extract_content_sections(raw):
    """AI 응답에서 body 콘텐츠 섹션만 추출 (===CONTENT_START/END=== 또는 body)."""
    if not raw:
        return ""
    _START = "===CONTENT_START==="  # 19자 — 길이를 직접 계산해 off-by-one 방지
    si = raw.find(_START)
    ei = raw.find("===CONTENT_END===", si + 1) if si != -1 else -1
    if si != -1 and ei != -1:
        content = raw[si + len(_START):ei].strip()
    elif si != -1:
        content = raw[si + len(_START):].strip()
    else:
        body_m = re.search(r'<body[^>]*>([\s\S]*)</body>', raw, re.IGNORECASE)
        content = body_m.group(1).strip() if body_m else raw.strip()
    content = strip_thinking(content)
    content = content.replace('```html', '').replace('```', '')
    content = re.sub(r'<head[^>]*>[\s\S]*?</head>', '', content, flags=re.IGNORECASE)
    content = re.sub(r'^\s*<(meta|link|title|style)[^>]*>[\s\S]*?(?:</\1>)?\s*', '',
                     content, flags=re.IGNORECASE | re.MULTILINE)
    if not re.search(r'<(section|div|header|main|article|footer|nav|p|h[1-6]|ul|ol|table|form|aside)\b',
                     content, re.IGNORECASE):
        return ""
    return content.strip()


def _extract_full_html(raw):
    """EDIT/DELETE 응답에서 ===HTML_START/END=== 또는 <!DOCTYPE> 전체 HTML 추출."""
    si = raw.find("===HTML_START===")
    ei = raw.find("===HTML_END===")
    if si != -1 and ei != -1:
        html = raw[si + 16:ei].strip()
    elif "<!DOCTYPE" in raw:
        html = raw[raw.find("<!DOCTYPE"):].strip()
        if "===HTML_END===" in html:
            html = html[:html.find("===HTML_END===")].strip()
    else:
        return ""
    html = strip_thinking(html)
    html = html.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    return ensure_complete_html(html)


@stream_bp.route("/api/chat/stream/v2", methods=["POST"])
def chat_stream_v2():
    data = request.json or {}
    message = data.get("message", "").strip()
    if not message:
        return jsonify({"error": "메시지가 비어있습니다."}), 400

    has_html = bool(data.get("current_html"))
    has_element = bool(data.get("element_context"))
    override = data.get("mode")  # UI 드롭다운 수동 지정 (선택)

    if override in (m.value for m in Mode):
        mode = Mode(override)
    else:
        mode = classify_mode(message, has_html, has_element)

    ds_data = data.get("design_system")
    ds = DesignSystem.from_dict(ds_data) if ds_data else DesignSystem.create(
        template=data.get("template", ""), page_type=data.get("page_type", ""),
        design_content=data.get("design_content", ""))

    if not ds.scaffold_css or not ds.scaffold_css.strip():
        ds = DesignSystem.create(template=ds.template, page_type=ds.page_type,
                                 design_content=ds.design_content, brand=ds.brand,
                                 menu_items=ds.menu_items)

    history = data.get("history", [])
    current_html = data.get("current_html", "")
    element_context = data.get("element_context") or None
    phase = mode.value

    if mode == Mode.ASK:
        def gen_ask():
            try:
                yield sse_event(EventType.STATUS, "상담 중...", phase=phase)
                messages = [{"role": "system", "content": ASK_SYSTEM}]
                messages.extend(history[-5:])
                messages.append({"role": "user", "content": message})
                for tok in llama_chat_stream(messages):
                    tok = filter_thinking_stream(sanitize_surrogates(tok))
                    if tok:
                        yield sse_event(EventType.CHAT, tok, phase=phase)
                yield sse_event(EventType.DONE, {}, phase=phase)
            except Exception as e:
                yield sse_event(EventType.ERROR, str(e), phase=phase)
        return Response(gen_ask(), mimetype="text/event-stream")

    if mode == Mode.GENERATE and data.get("multi_page"):
        from app.multipage import default_plan, generate_pages
        menu, pages = default_plan(ds.page_type)
        ds.menu_items = menu

        def gen_multi():
            try:
                yield sse_event(EventType.STATUS,
                                {"menu_items": menu, "pages": [p["file"] for p in pages]},
                                phase="generate")
                for result in generate_pages(ds, pages, message, history):
                    yield sse_event(EventType.STATUS, f"{result['title']} 완료", phase="generate")
                    yield sse_event(EventType.HTML,
                                    {"file": result["file"], "html": result["html"]},
                                    phase="generate")
                yield sse_event(EventType.DONE, {"multi": True, "menu_items": menu},
                                phase="generate")
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield sse_event(EventType.ERROR, str(e), phase="generate")
        return Response(gen_multi(), mimetype="text/event-stream")

    messages = build_generation_prompt(ds, mode, message, history=history,
                                       current_html=current_html or None,
                                       element_context=element_context)

    def gen_build():
        try:
            yield sse_event(EventType.STATUS,
                            "생성 중..." if mode == Mode.GENERATE else "수정 중...",
                            phase=phase)
            full = ""
            for tok in llama_chat_stream(messages):
                tok = sanitize_surrogates(tok)
                full += tok  # 추출은 원본 누적분에서 — 마커/콘텐츠 보존
                shown = filter_thinking_stream(tok)  # 모달에는 추론 과정 숨김
                if shown:
                    yield sse_event(EventType.STATUS, shown, phase=phase)

            if mode == Mode.GENERATE:
                content = _remove_truncated_lines(_extract_content_sections(full))
                if not content.strip():
                    content = ('<section class="hero"><div class="container">'
                               '<div class="hero-content"><h1 class="hero-title">'
                               f'{message[:50]}</h1></div></div></section>')
                html = ds.build_frame(title=message[:50] or "Page").replace("{CONTENT}", content)
                html = ensure_complete_html(html)
            else:  # EDIT / DELETE
                html = _extract_full_html(full)
                if not html:
                    yield sse_event(EventType.ERROR,
                                    "수정 결과를 해석하지 못했습니다. 다시 시도해 주세요.",
                                    phase=phase)
                    yield sse_event(EventType.DONE, {"html": current_html}, phase=phase)
                    return

            yield sse_event(EventType.HTML, html, phase=phase)
            yield sse_event(EventType.DONE, {"html": html}, phase=phase)
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield sse_event(EventType.ERROR, str(e), phase=phase)

    return Response(gen_build(), mimetype="text/event-stream")
