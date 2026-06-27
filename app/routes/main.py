import json
import time
from flask import Blueprint, render_template, request, jsonify, Response

from app.model import llama_chat, llama_chat_stream_with_reasoning
from app.chat import build_messages
from app.modular import generate_single_page, generate_multi_page
from app.thinking import filter_thinking_stream
from app.strategies import classify_intent, decide_strategy
from app.prompts import MODULAR_MULTI_PAGE_PLAN_PROMPT
from app.model import llama_chat_stream
from app.utils import parse_multi_page_plan


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
    if chat_only:
        user_message = data.get("message", "")
        history = data.get("history", [])
        messages = [{"role": "system", "content": "\ub2f9\uc2e0\uc740 \ud648\ud398\uc774\uc9c0 \uc81c\uc791\uc744 \ub3c4\uc640\uc8fc\ub294 AI \uc5b4\uc2dc\uc2a4\ud134\ud2b8\uc785\ub2c8\ub2e4. \uc0ac\uc6a9\uc790\uc758 \uc9c8\ubb38\uc5d0 \uce5c\uc808\ud558\uac8c \ub2f5\ubcc0\ud558\uc138\uc694. HTML \ucf54\ub4dc\ub294 \uc0dd\uc131\ud558\uc9c0 \ub9d0\uace0 \ud14d\uc2a4\ud2b8\ub85c\ub9cc \ub2f5\ubcc0\ud558\uc138\uc694."}]
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
                token_text = item["text"]
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

                yield f"data: {json.dumps({'content': token_text, 'type': token_type})}\n\n"

                if not chat_only and "===HTML_END===" in accumulated:
                    print("  [Stream] HTML_END detected, stopping early", flush=True)
                    yield f"data: [DONE]\n\n"
                    return

            total_time = time.time() - start_time
            avg_speed = token_count / total_time if total_time > 0 else 0
            print(f"  [Done] Total: {token_count} tokens, {total_time:.1f}s, {avg_speed:.1f} tok/s\n", flush=True)
            yield f"data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

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
    is_new_page = data.get("is_new_page", False)
    multi_page = data.get("multi_page", False)

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
        context += f"\n\n## \ucc38\uace0: \ud604\uc7ac \uba54\uc778 \ud398\uc774\uc9c0 HTML (\ub514\uc790\uc778 \ud1b5\uc77c\uc6a9)\n```html\n{current_html[:20000]}\n```"

    if current_html and not is_new_page:
        context += f"\n\n## \ud604\uc7ac \ud398\uc774\uc9c0 HTML (\uc218\uc815 \uae30\uc900)\n```html\n{current_html[:20000]}\n```"

    if multi_page:
        plan_messages = [
            {"role": "system", "content": MODULAR_MULTI_PAGE_PLAN_PROMPT},
        ]
        if history:
            plan_messages.extend(history[-6:])
        plan_messages.append({
            "role": "user",
            "content": f"{context}\n\n---\n\n{user_message}\n\n## \uacc4\ud68d \uc2dc \uc8fc\uc758\n- \uc0ac\uc6a9\uc790\uac00 \uba85\uc2dc\ud55c \uba54\ub274/\ud398\uc774\uc9c0\ub9cc \uc0dd\uc131\ud558\uc138\uc694. \uc694\uccad\uc5d0 \uc5c6\ub294 \ud398\uc774\uc9c0\ub294 \ub9cc\ub4e4\uc9c0 \ub9c8\uc138\uc694.\n- \uc0ac\uc6a9\uc790\uac00 \ud398\uc774\uc9c0 \uc218\ub97c \uc9c0\uc815\ud558\uc9c0 \uc54a\uc558\ub2e4\uba74 index 1\uac1c\ub9cc \uacc4\ud68d\ud558\uc138\uc694.\n- \ubd88\ud544\uc694\ud55c \ud398\uc774\uc9c0(\ud300, \ud1b5\uacc4, FAQ \ub4f1)\ub97c \uc784\uc758\ub85c \ucd94\uac00\ud558\uc9c0 \ub9c8\uc138\uc694."
        })

        def generate():
            try:
                start_time = time.time()

                plan_content = ""
                for token in llama_chat_stream(plan_messages):
                    plan_content += token
                    yield f"data: {json.dumps({'type': 'plan_token', 'content': token})}\n\n"

                print(f"\n[ParsePlan] Raw AI output ({len(plan_content)} chars):\n{plan_content[:1000]}\n")
                menu_items, pages = parse_multi_page_plan(plan_content)
                print(f"[ParsePlan] Result: {len(menu_items)} menu items, {len(pages)} pages")

                if not pages:
                    print(f"[ParsePlan] ERROR: No pages parsed!\n{plan_content}\n")
                    yield f"data: {json.dumps({'type': 'error', 'content': '\ud398\uc774\uc9c0 \uacc4\ud68d\uc744 \ud30c\uc2f1\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. ' + plan_content[:200]})}\n\n"
                    return

                if not menu_items:
                    menu_items = ["\ud648"]

                print(f"\n[MultiPage] Plan: {len(pages)} pages, menu: {menu_items}")
                for p in pages:
                    print(f"  [Page] {p['name']} ({p['file']}): {p.get('sections', [])}")

                multi_gen = generate_multi_page(context, user_message, history, menu_items, pages, design_content)
                for chunk in multi_gen:
                    yield chunk

                total_time = time.time() - start_time
                print(f"[MultiPage] Total time: {total_time:.1f}s\n")

            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

        return Response(generate(), mimetype="text/event-stream")
    else:
        gen = generate_single_page(context, user_message, history)
        return Response(gen, mimetype="text/event-stream")


@main_bp.route("/api/chat/test", methods=["POST"])
def chat_test():
    try:
        messages = [{"role": "user", "content": "\uc548\ub155"}]
        result = llama_chat(messages)
        return jsonify({"role": "assistant", "content": result[:200]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@main_bp.route("/api/classify_intent", methods=["POST"])
def api_classify_intent():
    data = request.json
    message = data.get("message", "").strip()
    history = data.get("history", [])
    has_html = data.get("has_html", False)
    has_element = data.get("has_element", False)

    action, reason = classify_intent(message, history, has_html, has_element)
    return jsonify({"action": action, "reason": reason})


@main_bp.route("/api/decide_strategy", methods=["POST"])
def api_decide_strategy():
    data = request.json
    message = data.get("message", "").strip()
    has_html = data.get("has_html", False)
    has_element = data.get("has_element", False)

    strategy, reason, elapsed = decide_strategy(message, has_html, has_element)
    return jsonify({"strategy": strategy, "reason": reason, "elapsed": elapsed})


@main_bp.route("/api/generate_preview", methods=["POST"])
def generate_preview():
    data = request.json
    code = data.get("code", "")
    return jsonify({"html": code})
