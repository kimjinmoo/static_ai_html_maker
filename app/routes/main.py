import json
import re
import time
from flask import Blueprint, render_template, request, jsonify, Response

from app.model import llama_chat, llama_chat_stream_with_reasoning
from app.chat import build_messages
from app.thinking import filter_thinking_stream
from app.strategies import decide_strategy
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
                except Exception:
                    safe = sanitize_surrogates(token_text)
                    try:
                        sse_text = json.dumps({'content': safe, 'type': token_type}, ensure_ascii=True)
                    except Exception:
                        sse_text = json.dumps({'content': repr(safe), 'type': token_type}, ensure_ascii=True)
                    sse_line = f"data: {sse_text}\n\n"
                    print(f"  [SANITIZE] Caught encode error at token #{token_count}, text={repr(token_text[:80])}", flush=True)
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
    # 레거시 라우트: classify_edit 미구현(제거됨). 항상 full 편집으로 폴백.
    return jsonify({"edit_type": "full", "new_text": "", "attrs": {}})


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
