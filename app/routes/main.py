import json
import re
import time
from flask import Blueprint, render_template, request, jsonify, Response

from app.model import llama_chat, llama_chat_stream_with_reasoning
from app.chat import build_messages
from app.modular import generate_single_page, generate_multi_page
from app.thinking import filter_thinking_stream
from app.strategies import decide_strategy, classify_edit
from app.utils import sanitize_surrogates
from app.model import llama_chat_stream
from app.utils import strip_thinking, ensure_complete_html, load_scaffold_css, build_fallback_html, build_scaffold_frame, SCAFFOLD_CLASS_REFERENCE, _remove_truncated_lines
from app.prompts import CONTENT_ONLY_PROMPT


main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    if not data.get("message", "").strip():
        return jsonify({"error": "\uba54\uc2dc\uc9c0\uac00 \ube44\uc5b4\uc788\uc2b5\ub2c8\ub2e4."}), 400

    messages = build_messages(data)
    try:
        start_time = time.time()
        assistant_message = llama_chat(messages)
        if '===HTML_START===' in assistant_message or '<!DOCTYPE html>' in assistant_message:
            assistant_message = ensure_complete_html(assistant_message)
        token_count = len(assistant_message) // 4
        elapsed = time.time() - start_time
        speed = token_count / elapsed if elapsed > 0 else 0
        print(f"  [Chat] {token_count} tokens, {elapsed:.1f}s, {speed:.1f} tok/s", flush=True)
        return jsonify({"role": "assistant", "content": assistant_message})
    except Exception as e:
        return jsonify({"error": f"\ubaa8\ub378 \uc751\ub2f5 \uc624\ub958: {str(e)}"}), 500


@main_bp.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    data = request.json
    if not data.get("message", "").strip():
        return jsonify({"error": "\uba54\uc2dc\uc9c0\uac00 \ube44\uc5b4\uc788\uc2b5\ub2c8\ub2e4."}), 400

    chat_only = data.get("chat_only", False)
    strategy = data.get("strategy", "")
    page_type = data.get("page_type", "")
    template = data.get("template", "")
    if chat_only:
        user_message = data.get("message", "")
        history = data.get("history", [])
        messages = [{"role": "system", "content": "당신은 홈페이지 제작을 도와주는 AI 어시스턴트입니다. 사용자의 질문에 친절하게 답변하세요. HTML 코드는 생성하지 말고 텍스트로만 답변하세요."}]
        if history:
            messages.extend(history[-6:])
        messages.append({"role": "user", "content": user_message})
    else:
        messages = build_messages(data)

    def generate():
        try:
            token_count = 0
            start_time = time.time()
            last_log_time = start_time
            last_token_count = 0
            accumulated = ""

            for item in llama_chat_stream_with_reasoning(messages):
                token_count += 1
                token_text = sanitize_surrogates(item["text"])
                token_type = item["type"]
                accumulated += token_text
                now = time.time()

                if now - last_log_time >= 1.0:
                    interval = now - last_log_time
                    tokens_in_interval = token_count - last_token_count
                    speed = tokens_in_interval / interval if interval > 0 else 0
                    print(f"  [Token] #{token_count} - {speed:.1f} tok/s", flush=True)
                    last_log_time = now
                    last_token_count = token_count

                if token_type == "content":
                    token_text = filter_thinking_stream(token_text)
                    if not token_text:
                        continue

                token_text = sanitize_surrogates(token_text)
                try:
                    sse_text = json.dumps({'content': token_text, 'type': token_type}, ensure_ascii=True)
                    sse_line = f"data: {sse_text}\n\n"
                    sse_line.encode('utf-8')
                except (UnicodeEncodeError, ValueError):
                    token_text = sanitize_surrogates(token_text)
                    try:
                        sse_text = json.dumps({'content': token_text, 'type': token_type}, ensure_ascii=True)
                    except (UnicodeEncodeError, ValueError):
                        sse_text = json.dumps({'content': repr(token_text), 'type': token_type}, ensure_ascii=True)
                    sse_line = f"data: {sse_text}\n\n"
                    print(f"  [SANITIZE] Caught surrogate at token #{token_count}, text={token_text[:50]}", flush=True)
                yield sse_line

                if not chat_only and "===HTML_END===" in accumulated:
                    print("  [Stream] HTML_END detected, stopping early", flush=True)
                    break

            total_time = time.time() - start_time
            avg_speed = token_count / total_time if total_time > 0 else 0
            print(f"  [Done] Total: {token_count} tokens, {total_time:.1f}s, {avg_speed:.1f} tok/s\n", flush=True)

            # Validate and fix direct mode HTML output
            if strategy == "direct" and ('===HTML_END===' in accumulated or '<!DOCTYPE html>' in accumulated):
                try:
                    si = accumulated.find("===HTML_START===")
                    ei = accumulated.find("===HTML_END===")
                    raw_html = ""
                    if si != -1 and ei != -1:
                        raw_html = accumulated[si + 16:ei].strip()
                    elif '<!DOCTYPE html>' in accumulated:
                        di = accumulated.index('<!DOCTYPE html>')
                        raw_html = accumulated[di:].strip()
                        if '===HTML_END===' in raw_html:
                            raw_html = raw_html[:raw_html.index('===HTML_END===')].strip()
                    if raw_html:
                        # Check if AI generated valid body content
                        body_m = re.search(r'<body[^>]*>([\s\S]*)</body>', raw_html, re.IGNORECASE)
                        has_valid_body = body_m is not None and bool(re.search(r'<(section|div|header|main|article|footer|nav|p|h[1-6]|ul|ol|table|form|aside|span|img|a)\b', body_m.group(1), re.IGNORECASE))
                        print(f"\n[Direct] AI output len={len(raw_html)}, has_valid_body={has_valid_body}", flush=True)
                        if has_valid_body:
                            print(f"[Direct] AI content valid, preserving AI's design", flush=True)
                            fixed_html = ensure_complete_html(raw_html)
                        else:
                            print(f"[Direct] AI content invalid, wrapping in scaffold", flush=True)
                            from app.modular import _extract_content_sections
                            scaffold_css = load_scaffold_css(template)
                            title_m = re.search(r'<title[^>]*>(.*?)</title>', raw_html, re.IGNORECASE)
                            page_title = title_m.group(1).strip() if title_m else "Page"
                            frame = build_scaffold_frame(scaffold_css, template, page_title)
                            ai_content = _extract_content_sections(raw_html)
                            ai_content = _remove_truncated_lines(ai_content)
                            if not ai_content or not ai_content.strip():
                                ai_content = '<section class="hero"><div class="hero-content"><h1>Welcome</h1><p>Your content goes here.</p></div></section>'
                            fixed_html = frame.replace("{CONTENT}", ai_content)
                            fixed_html = ensure_complete_html(fixed_html)
                        yield f"data: {json.dumps({'type': 'html_fix', 'content': sanitize_surrogates(fixed_html)})}\n\n"
                except Exception as e:
                    print(f"  [HTML Fix Error] {e}", flush=True)

            yield f"data: [DONE]\n\n"
        except Exception as e:
            err_msg = sanitize_surrogates(str(e))
            yield f"data: {json.dumps({'error': err_msg})}\n\n"

    return Response(generate(), mimetype="text/event-stream")


@main_bp.route("/api/chat/stream/modular", methods=["POST"])
def chat_stream_modular():
    data = request.json
    if not data.get("message", "").strip():
        return jsonify({"error": "\uba54\uc2dc\uc9c0\uac00 \ube44\uc5b4\uc788\uc2b5\ub2c8\ub2e4."}), 400

    page_type = data.get("page_type", "")
    template = data.get("template", "")
    design_content = data.get("design_content", "")
    user_message = data.get("message", "")
    history = data.get("history", [])
    current_html = data.get("current_html", "")
    current_css = data.get("current_css", "")
    current_js = data.get("current_js", "")
    is_new_page = data.get("is_new_page", False)
    multi_page = data.get("multi_page", False)
    direct_mode = data.get("direct_mode", True)

    TYPE_NAMES = {
        "company": "\ud68c\uc0ac \uc0ac\uc774\ud2b8 (\uc815\uc801 \uc6f9\uc0ac\uc774\ud2b8)",
        "landing": "\ub79c\ub529 \ud398\uc774\uc9c0 (\uc81c\ud488/\uc11c\ube44\uc2a4 \uc18c\uac1c)",
        "promotion": "\ud504\ub85c\ubaa8\uc158 \ud398\uc774\uc9c0 (\uc774\ubca4\ud2b8/\ucea0\ud398\uc778)",
    }
    TEMPLATE_NAMES = {
        "minimal_clean": "Minimal Clean (\uae4c\ub05d\ud55c \ubbf8\ub2c8\ubaac)",
        "bold_modern": "Bold Modern (\uac15\ub82c\ud55c \ub2e4\ud06c)",
        "elegant_warm": "Elegant Warm (\uc138\ub828\ub41c \ub530\ub77b\ud55c)",
        "custom": "URL \uae30\ubc18 \ucee4\uc2a4\ud140 \ub514\uc9c0\uc778",
    }

    context = f"\ud398\uc774\uc9c0 \uc720\ud615: {TYPE_NAMES.get(page_type, page_type)}\n\ub514\uc790\uc778 \ud15c\ud50c\ub9bf: {TEMPLATE_NAMES.get(template, template)}"
    if design_content:
        context += f"\n\n## \ub514\uc790\uc778 \ud1a0\ud070\n{design_content}"

    if is_new_page and current_html:
        context += f"\n\n## \ucc38\uace0: \ud604\uc7ac \uba54\uc778 \ud398\uc774\uc9c0 HTML (\ub514\uc790\uc778 \ud1b5\uc77c\uc6a9)\n```html\n{current_html}\n```"

    if current_html and not is_new_page:
        context += f"\n\n## \ud604\uc7ac \ud398\uc774\uc9c0 HTML (\uc218\uc815 \uae30\uc900)\n```html\n{current_html}\n```"

    scaffold_css_value = load_scaffold_css(template)

    if multi_page:
        def _default_multi_page_plan(pt):
            base = {"menu_items": ["\ud648"], "pages": [{"name": "index", "file": "index.html", "title": "\ud648", "sections": ["hero"]}]}
            if pt == "company":
                base = {"menu_items": ["\ud648", "\uc18c\uac1c", "\uc11c\ube44\uc2a4", "\uc5f0\ub77d\ucc98"], "pages": [
                    {"name": "index", "file": "index.html", "title": "\ud648", "sections": ["hero", "about", "services", "contact"]},
                    {"name": "about", "file": "pages/about.html", "title": "\uc18c\uac1c", "sections": ["hero", "intro", "team"]},
                    {"name": "services", "file": "pages/services.html", "title": "\uc11c\ube44\uc2a4", "sections": ["hero", "service_cards"]},
                    {"name": "contact", "file": "pages/contact.html", "title": "\uc5f0\ub77d\ucc98", "sections": ["hero", "form"]}]}
            elif pt == "landing":
                base = {"menu_items": ["\ud648", "\uae30\ub2a5", "\ud6c4\uae30", "\ubb38\uc758"], "pages": [
                    {"name": "index", "file": "index.html", "title": "\ud648", "sections": ["hero", "features", "testimonials", "cta"]},
                    {"name": "features", "file": "pages/features.html", "title": "\uae30\ub2a5", "sections": ["hero", "features"]},
                    {"name": "testimonials", "file": "pages/testimonials.html", "title": "\ud6c4\uae30", "sections": ["hero", "testimonials"]},
                    {"name": "contact", "file": "pages/contact.html", "title": "\ubb38\uc758", "sections": ["hero", "form"]}]}
            elif pt == "promotion":
                base = {"menu_items": ["\ud648", "\ud61c\ud0dd", "CTA"], "pages": [
                    {"name": "index", "file": "index.html", "title": "\ud648", "sections": ["hero", "offer", "features"]},
                    {"name": "offer", "file": "pages/offer.html", "title": "\ud61c\ud0dd", "sections": ["hero", "offer"]},
                    {"name": "cta", "file": "pages/cta.html", "title": "CTA", "sections": ["hero", "cta"]}]}
            return base["menu_items"], base["pages"]

        menu_items, pages = _default_multi_page_plan(page_type)

        def generate():
            try:
                start_time = time.time()

                print(f"\n[MultiPage] Using fallback plan: {len(pages)} pages, menu: {menu_items}")
                for p in pages:
                    print(f"  [Page] {p['name']} ({p['file']}): {p.get('sections', [])}")
                yield f"data: {json.dumps({'type': 'multi_plan', 'menu_items': menu_items, 'pages': pages})}\n\n"

                multi_gen = generate_multi_page(context, user_message, history, menu_items, pages, design_content, scaffold_css=scaffold_css_value, direct_mode=direct_mode, template_name=template)
                for chunk in multi_gen:
                    yield chunk

                total_time = time.time() - start_time
                print(f"[MultiPage] Total time: {total_time:.1f}s\n")

            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

        return Response(generate(), mimetype="text/event-stream")
    elif direct_mode:
        template_names = {"minimal_clean": "Minimal Clean", "bold_modern": "Bold Modern", "elegant_warm": "Elegant Warm", "custom": "Custom"}
        design_ref = f"\n## 디자인 템플릿: {template_names.get(template, template)}\n{design_content and f'\n## 디자인 토큰\n{design_content}\n' or ''}"

        def _extract_content_sections(raw):
            if not raw:
                return ""
            si = raw.find("===CONTENT_START===")
            ei = raw.find("===CONTENT_END===", si + 1) if si != -1 else -1
            if si != -1 and ei != -1:
                content = raw[si + 18:ei].strip()
            elif si != -1:
                content = raw[si + 18:].strip()
            else:
                body_m = re.search(r'<body[^>]*>([\s\S]*)</body>', raw, re.IGNORECASE)
                if body_m:
                    content = body_m.group(1).strip()
                else:
                    idx = _find_first_html_tag_fn(raw)
                    if idx != -1:
                        content = raw[idx:].strip()
                    else:
                        content = raw.strip()
            content = strip_thinking(content)
            content = content.replace('```html', '').replace('```', '')
            content = re.sub(r'^[^<]*?(?=<)', '', content)
            content = re.sub(r'<head[^>]*>[\s\S]*?</head>', '', content, flags=re.IGNORECASE)
            content = re.sub(r'^\s*<meta[^>]*>\s*', '', content, flags=re.MULTILINE)
            content = re.sub(r'^\s*<link[^>]*>\s*', '', content, flags=re.MULTILINE)
            content = re.sub(r'^\s*<title[^>]*>.*?</title>\s*', '', content, flags=re.IGNORECASE | re.MULTILINE)
            content = re.sub(r'^\s*<style[^>]*>[\s\S]*?</style>\s*', '', content, flags=re.IGNORECASE | re.MULTILINE)
            if not re.search(r'<(section|div|header|main|article|footer|nav|p|h[1-6]|ul|ol|table|form|aside)\b', content, re.IGNORECASE):
                return ""
            return content.strip()

        def _find_first_html_tag_fn(text):
            for pat in [r'<section[\s>]', r'<div[\s>]', r'<header[\s>]', r'<main[\s>]', r'<article[\s>]']:
                m = re.search(pat, text, re.IGNORECASE)
                if m:
                    return m.start()
            return -1

        scaffold_frame = build_scaffold_frame(scaffold_css_value, template, user_message[:50] or "Page")

        def generate():
            try:
                start_time = time.time()
                yield f"data: {json.dumps({'type': 'plan_token', 'content': '✨ 페이지 프레임 생성 완료, 콘텐츠 생성 중...\n'})}\n\n"
                yield f"data: {json.dumps({'type': 'plan', 'modules': [{'id': 'full_page', 'description': 'complete page'}]})}\n\n"
                yield f"data: {json.dumps({'type': 'module_start', 'id': 'full_page', 'index': 0, 'total': 1})}\n\n"

                system_prompt = CONTENT_ONLY_PROMPT + "\n\n" + SCAFFOLD_CLASS_REFERENCE + f"\n\n{design_ref}"
                if current_html:
                    style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', current_html, flags=re.IGNORECASE)
                    if style_blocks:
                        system_prompt += "\n\n## 📋 참조 페이지 CSS 구조 유지\n```css\n" + "\n".join(s.strip() for s in style_blocks)[:4000] + "\n```"

                messages = [{"role": "system", "content": system_prompt}]
                if history:
                    messages.extend(history[-4:])
                messages.append({"role": "user", "content": f"{context}\n\n## 요청\n{user_message}"})

                full_content = ""
                for token in llama_chat_stream(messages):
                    token = sanitize_surrogates(token)
                    full_content += token
                    try:
                        yield f"data: {json.dumps({'type': 'module_token', 'id': 'full_page', 'content': token})}\n\n"
                    except (UnicodeEncodeError, ValueError):
                        safe_token = sanitize_surrogates(token)
                        yield f"data: {json.dumps({'type': 'module_token', 'id': 'full_page', 'content': repr(safe_token)})}\n\n"

                ai_content = _extract_content_sections(full_content)
                ai_content = _remove_truncated_lines(ai_content)
                if not ai_content.strip():
                    ai_content = f'  <section class="hero"><div class="container"><div class="hero-content"><h1 class="hero-title">{user_message[:50] or "Page"}</h1></div></div></section>'
                html = scaffold_frame.replace("{CONTENT}", ai_content)
                html = html.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
                html = ensure_complete_html(html)

                print(f"\n[FastSingle] Frame: {len(scaffold_frame)} chars + Content: {len(ai_content)} chars", flush=True)
                yield f"data: {json.dumps({'type': 'module_complete', 'id': 'full_page', 'index': 0, 'total': 1})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'html': html, 'reviewed': True})}\n\n"
                print(f"[FastSingle] Total time: {time.time() - start_time:.1f}s\n")

            except Exception as e:
                import traceback
                traceback.print_exc()
                err_msg = str(e)
                yield f"data: {json.dumps({'type': 'error', 'content': err_msg})}\n\n"
                fallback = build_fallback_html(scaffold_css_value, title=user_message[:50] or "Page", page_title="Page", description=f"Error: {err_msg[:80]}", template_name=template)
                yield f"data: {json.dumps({'type': 'done', 'html': fallback, 'reviewed': True})}\n\n"

        return Response(generate(), mimetype="text/event-stream")
    else:
        gen = generate_single_page(context, user_message, history, scaffold_css=scaffold_css_value, template_name=template)
        return Response(gen, mimetype="text/event-stream")


@main_bp.route("/api/chat/test", methods=["POST"])
def chat_test():
    try:
        messages = [{"role": "user", "content": "\uc548\ub155"}]
        result = llama_chat(messages)
        return jsonify({"role": "assistant", "content": result[:200]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@main_bp.route("/api/decide_strategy", methods=["POST"])
def api_decide_strategy():
    data = request.json
    message = data.get("message", "").strip()
    has_html = data.get("has_html", False)
    has_element = data.get("has_element", False)

    strategy, reason, elapsed = decide_strategy(message, has_html, has_element)
    return jsonify({"strategy": strategy, "reason": reason, "elapsed": elapsed})


@main_bp.route("/api/classify_edit", methods=["POST"])
def api_classify_edit():
    data = request.json
    message = data.get("message", "").strip()
    element_context = data.get("element_context", "")
    if not message or not element_context:
        return jsonify({"edit_type": "full", "new_text": "", "attrs": {}})
    edit_type, new_text, attrs = classify_edit(message, element_context)
    return jsonify({"edit_type": edit_type, "new_text": new_text, "attrs": attrs})


@main_bp.route("/api/review_code", methods=["POST"])
def api_review_code():
    data = request.json
    html = data.get("html", "")

    # Pre-clean
    html = strip_thinking(html)
    html = html.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    html = ensure_complete_html(html)

    if not html or len(html) < 50:
        return jsonify({"html": html})

    msg = "Fix all HTML issues. Rules: 1) Convert &lt; to < and &gt; to >  2) Remove <thinking>/<reasoning>  3) Fix unclosed/broken tags  4) Remove duplicate doctype/html/head/body  5) Return ONLY fixed HTML.\n\n```html\n" + html + "\n```"

    try:
        result = ""
        for token in llama_chat_stream([
            {"role": "system", "content": "You fix HTML. Return ONLY the fixed code, no explanation."},
            {"role": "user", "content": msg},
        ]):
            result += token
        if not result:
            return jsonify({"html": html})
        result = result.strip()
        code_start = result.find("```")
        if code_start != -1:
            lines = result[code_start:].split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            result = "\n".join(lines).strip()
        di = result.find("<!DOCTYPE html>")
        if di != -1:
            result = result[di:].strip()
        if result and len(result) > 50:
            result = strip_thinking(result)
            result = result.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
            result = ensure_complete_html(result)
            return jsonify({"html": result, "original": html})
    except Exception as e:
        print(f"[Review] Error: {e}")
    return jsonify({"html": html})


@main_bp.route("/api/generate_preview", methods=["POST"])
def generate_preview():
    data = request.json
    code = data.get("code", "")
    return jsonify({"html": code})
