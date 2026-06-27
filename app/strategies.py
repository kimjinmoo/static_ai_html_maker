import json
import re
import time

from app.model import llama_chat
from app.utils import strip_thinking
from app.prompts import STRATEGY_PROMPT


NEW_PAGE_KEYWORDS = [
    # === \ud398\uc774\uc9c0 \uc0dd\uc131 (\ud398\uc774\uc9c0 \uc0dd\uc131 / \ucd94\uac00) ===
    "\uc0c8 \ud398\uc774\uc9c0", "\uc0c8\ud398\uc774\uc9c0",
    "\uc2e0\uaddc \ud398\uc774\uc9c0", "\uc2e0\uaddc\ud398\uc774\uc9c0",
    "\uc0c8\ub85c\uc6b4 \ud398\uc774\uc9c0",
    "\ud398\uc774\uc9c0\ub97c \ub9cc\ub4e4", "\ud398\uc774\uc9c0\ub97c\ub9cc\ub4e4",
    "\ud398\uc774\uc9c0 \ub9cc\ub4e4", "\ud398\uc774\uc9c0\ub9cc\ub4e4\uc5b4",
    "\ud398\uc774\uc9c0 \ub9cc\ub4e4\uc5b4",
    "\ud398\uc774\uc9c0 \uc0dd\uc131", "\ud398\uc774\uc9c0\uc0dd\uc131",
    "\ud398\uc774\uc9c0 \uc0dd\uc131\ud574",
    "\ud398\uc774\uc9c0\ub97c \ucd94\uac00", "\ud398\uc774\uc9c0\ucd94\uac00",
    "\ud398\uc774\uc9c0 \ucd94\uac00",
    "\ucd94\uac00\ud560 \ud398\uc774\uc9c0",
    "\ucd94\uac00\ud398\uc774\uc9c0",

    # === \ud398\uc774\uc9c0 \ud558\ub098 \ub354 / \ub2e4\ub978 \ud398\uc774\uc9c0 ===
    "\ud398\uc774\uc9c0 \ud558\ub098", "\ud398\uc774\uc9c0 \ud55c \uac1c",
    "\ud398\uc774\uc9c0 \ub354", "\ub2e4\ub978 \ud398\uc774\uc9c0",
    "\ub2e4\ub978\ud398\uc774\uc9c0",
    "\ud398\uc774\uc9c0\ub97c \ud558\ub098",

    # === \uc11c\ube0c \ud398\uc774\uc9c0 (\ud558\uc704 / \uc11c\ube0c) ===
    "\ud558\uc704 \ud398\uc774\uc9c0",
    "\uc11c\ube0c \ud398\uc774\uc9c0", "\uc11c\ube0c\ud398\uc774\uc9c0",
    "\ud558\uc704\ud398\uc774\uc9c0",

    # === \ub9c1\ud06c \uad00\ub828 ===
    "\ub9c1\ud06c \uac78\uc5b4", "\ub9c1\ud06c\uac78\uc5b4",
    "\ub9c1\ud06c \uac78\uc5b4\uc918", "\ub9c1\ud06c\ub97c \uac78",
    "\ub9c1\ud06c \uac78\uc5b4\uc8fc", "\ub9c1\ud06c\uac78\uc5b4\uc8fc",
    "\ub9c1\ud06c \ub9cc\ub4e4", "\ub9c1\ud06c\ub97c \ub9cc\ub4e4",
    "\ub9c1\ud06c\ub9cc\ub4e4",
    "\ub9c1\ud06c \ucd94\uac00", "\ub9c1\ud06c\ub97c \ucd94\uac00",
    "\ub9c1\ud06c \uc5f0\uacb0", "\ub9c1\ud06c\uc5f0\uacb0",
    "\ub9c1\ud06c\ub97c \ub2e4\uba58",
    "\ub9c1\ud06c\ub97c \ub9cc\ub4e4\uc5b4",

    # === \ud398\uc774\uc9c0 \uc5f0\uacb0 / \uc774\ub3d9 ===
    "\uc774\ub3d9\ud560 \uc218 \uc788\uac8c",
    "\ud398\uc774\uc9c0\ub85c \uc774\ub3d9", "\ud398\uc774\uc9c0 \uc774\ub3d9",
    "\ud398\uc774\uc9c0\ub85c \uac00",
    "\ud398\uc774\uc9c0 \uc5f4", "\ud398\uc774\uc9c0\ub97c \uc5f4",
    "\ud398\uc774\uc9c0 \uc5f0\uacb0", "\ud398\uc774\uc9c0\uc5f0\uacb0",
    "\ud398\uc774\uc9c0\ub97c \uc5f0\uacb0",
    "\uc5f0\uacb0\ud560 \ud398\uc774\uc9c0",
    "\ud398\uc774\uc9c0 \ub9c1\ud06c", "\ud398\uc774\uc9c0\ub9c1\ud06c",
    "\ud398\uc774\uc9c0\uc5d0 \ub9c1\ud06c",
    "\ud558\uc774\ud37c\ub9c1\ud06c",

    # === \uba54\ub274 / \ub124\ube44\uac8c\uc774\uc158 \uad00\ub828 ===
    "\uba54\ub274\uc5d0 \ucd94\uac00", "\uba54\ub274 \ucd94\uac00",
    "\uba54\ub274 \uc0dd\uc131", "\uba54\ub274\uc5d0 \ub9cc\ub4e4",
    "\ub124\ube44\uc5d0 \ucd94\uac00",
    "\ub124\ube44\uac8c\uc774\uc158\uc5d0 \ucd94\uac00",
    "\uba54\ub274 \ub9c1\ud06c",

    # === \ubc84\ud2bc \uc0dd\uc131 (\ub9c1\ud06c\uc6a9 \ubc84\ud2bc) ===
    "\ubc84\ud2bc \ub9cc\ub4e4", "\ubc84\ud2bc\uc744 \ub9cc\ub4e4",
    "\ubc84\ud2bc \ucd94\uac00", "\ubc84\ud2bc\uc744 \ucd94\uac00",
    "\ubc84\ud2bc \uc0dd\uc131",

    # === \ud398\uc774\uc9c0 \uc774\ub984 \ud328\ud134 (X\ud398\uc774\uc9c0 \ub97c \ub9cc\ub4e4) ===
    "\ud398\uc774\uc9c0\ub97c \ub9cc\ub4e4\uc5b4",
    "\ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud558",
    "\ud398\uc774\uc9c0\ub97c \ucd94\uac00\ud558",
    "\uc0c8\ub85c\uc6b4 \ud399\uc9c0",
    "\uc0c8 \ud399\uc9c0", "\uc2e0\uaddc \ud399\uc9c0",
    "\ud398\uc774\uc9c0 \ud55c\uc7a5", "\ud398\uc774\uc9c0 \ud55c \uc7a5",

    # === \uae30\ud0c0 \uc790\uc8fc \uc0ac\uc6a9\ub418\ub294 \ud45c\ud604 ===
    "\ub9c1\ud06c\ub97c \ud574\uc918", "\ub9c1\ud06c\ud574\uc918",
    "\uc774\ub3d9\ud560 \uc218 \uc788\ub3c4\ub85d",
    "\ud074\ub9ad\ud558\uba74 \uc774\ub3d9",
    "\ud074\ub9ad\ud558\uba74 \uac00",
    "\ud398\uc774\uc9c0\uac00 \uc0dd\uc131", "\ud398\uc774\uc9c0 \uc0dd\uc131\ub418",
    "\ud398\uc774\uc9c0 \uc0dd\uaca8",
]


def decide_strategy(message, has_html, has_element):
    if not message:
        return "chat", "\ube48 \uba54\uc2dc\uc9c0", 0

    if has_element:
        return "edit", "\uc694\uc18c\uac00 \uc120\ud0dd\ub428", 0

    msg_lower = message.lower()

    if has_html and any(k in msg_lower for k in NEW_PAGE_KEYWORDS):
        return "new_page", "\ud398\uc774\uc9c0 \uc0dd\uc131 \ud0a4\uc6cc\ub4dc \uac10\uc9c0", 0

    simple_keywords = ["\uc18c\uac1c", "1\uc7a5", "1 \uc7a5", "\ud55c\uc7a5", "\ud55c \uc7a5", "\uac04\ub2e8", "\uc2ec\ud50c"]
    complex_keywords = ["\ud68c\uc0ac", "\uae30\uc5c5", "\ub79c\ub529", "\ud504\ub85c\ubaa8\uc158", "\uc1fc\ud551\ubab0", "\ube14\ub85c\uadf8", "\uc5ec\ub7ec", "\ub2e4\uc591\ud55c"]

    if not has_html:
        has_simple = any(k in msg_lower for k in simple_keywords)
        has_complex = any(k in msg_lower for k in complex_keywords)
        if has_simple and not has_complex:
            return "direct", "\ub2e8\uc21c \ud398\uc774\uc9c0 \ud0a4\uc6cc\ub4dc \uac10\uc9c0", 0

    if not has_html:
        strategy_message = f"""Analyze this request and choose the best strategy.

Request: "{message}"

Respond with ONLY valid JSON (no other text):
{{"strategy": "modular"|"direct", "reason": "short reason in Korean"}}"""
    else:
        strategy_message = f"""Analyze this request and choose the best strategy.

Request: "{message}"

Respond with ONLY valid JSON (no other text):
{{"strategy": "modular"|"edit"|"chat", "reason": "short reason in Korean"}}"""

    ai_messages = [
        {"role": "system", "content": STRATEGY_PROMPT},
        {"role": "user", "content": strategy_message}
    ]

    try:
        start = time.time()
        result = llama_chat(ai_messages)
        result = strip_thinking(result)
        result = result.strip()

        if result.startswith('<') or 'DOCTYPE' in result.upper()[:100]:
            fallback = "direct" if not has_html else "edit"
            print(f"  [Strategy] Got HTML instead of JSON, defaulting to {fallback}", flush=True)
            return fallback, "AI\uac00 HTML\uc744 \ubc18\ud658\ud568, \uae30\ubcf8\uac12 \uc0ac\uc6a9", round(time.time() - start, 1)

        brace_start = result.find('{')
        brace_end = result.rfind('}')
        if brace_start != -1 and brace_end > brace_start:
            json_str = result[brace_start:brace_end + 1]
            parsed = json.loads(json_str)
            strategy = parsed.get("strategy", "").lower().strip()
            reason = parsed.get("reason", "")
            if strategy in ("modular", "direct", "edit", "chat"):
                elapsed = time.time() - start
                print(f"  [Strategy] {message[:50]} => {strategy} ({reason}) ({elapsed:.1f}s)", flush=True)
                return strategy, reason, round(elapsed, 1)

        if not has_html:
            fallback = "direct"
            if any(k in msg_lower for k in complex_keywords):
                fallback = "modular"
        else:
            fallback = "edit"
        print(f"  [Strategy] JSON parse failed, defaulting to {fallback}", flush=True)
        return fallback, "AI \ud310\ub2e8 \uc2e4\ud328, \ud0a4\uc6cc\ub4dc \uae30\ubc18 \uc120\ud0dd", round(time.time() - start, 1)
    except Exception as e:
        fallback = "direct" if not has_html else "edit"
        print(f"  [Strategy] Error: {e}, defaulting to {fallback}", flush=True)
        return fallback, f"\uc624\ub958: {str(e)}", 0
