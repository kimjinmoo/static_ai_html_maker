from app.prompts import SYSTEM_PROMPT


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


def build_messages(data):
    user_message = data.get("message", "")
    history = data.get("history", [])
    page_type = data.get("page_type", "")
    template = data.get("template", "")
    current_html = data.get("current_html", "")
    current_css = data.get("current_css", "")
    current_js = data.get("current_js", "")
    design_content = data.get("design_content", "")
    element_context = data.get("element_context", "")
    is_new_page = data.get("is_new_page", False)
    strategy = data.get("strategy", "")

    context = f"\ud398\uc774\uc9c0 \uc720\ud615: {TYPE_NAMES.get(page_type, page_type)}\n\ub514\uc790\uc778 \ud15c\ud50c\ub9bf: {TEMPLATE_NAMES.get(template, template)}"

    if design_content:
        context += f"\n\n## \ub514\uc790\uc778 \ud1a0\ud070\n{design_content[:500]}"

    if current_html:
        html_trunc = current_html[:20000] + ("...(truncated)" if len(current_html) > 20000 else "")
        context += f"\n\n\ud604\uc7ac \uba54\uc778 \ud398\uc774\uc9c0 HTML (\ub514\uc790\uc778 \ucc38\uace0\uc6a9, \uc77c\ubd80):\n{html_trunc}"
        if current_css:
            context += f"\n\n## \ud604\uc7ac CSS (assets/css/style.css)\n{current_css[:5000]}"
        if current_js:
            context += f"\n\n## \ud604\uc7ac JavaScript (assets/js/main.js)\n{current_js[:5000]}"
        if is_new_page:
            final_message = f"""{user_message}

## \uc911\uc694: \uc0c8 \ud398\uc774\uc9c0 \uc0dd\uc131 \uc694\uccad\uc785\ub2c8\ub2e4.
- \ud604\uc7ac \uba54\uc778 \ud398\uc774\uc9c0\uc758 \ub514\uc790\uc778, \uc0c9\uc0c1, \ud3f0\ud2b8, \ub808\uc774\uc544\uc6c3 \uc2a4\ud0c0\uc77c\uc744 **\ucc38\uace0**\ud558\uc5ec \uc0c8\ub85c\uc6b4 \ud558\uc704 \ud398\uc774\uc9c0\uc758 \uc644\uc804\ud55c HTML\uc744 \uc0dd\uc131\ud558\uc138\uc694.
- \uba54\uc778 \ud398\uc774\uc9c0\ub97c \uc218\uc815\ud558\uac70\ub098 \ub300\uccb4\ud558\ub294 \uac83\uc774 **\uc544\ub2d9\ub2c8\ub2e4**. \uc644\uc804\ud788 \ub3c5\ub9bd\uc801\uc778 \uc0c8 \ud398\uc774\uc9c0\uc785\ub2c8\ub2e4.
- `<!DOCTYPE html>`\ub85c \uc2dc\uc791\ud558\uace0, `<head>`, `<body>`, CSS, JS\ub97c \ubaa8\ub450 \ud3ec\ud568\ud558\uc138\uc694.
- \ub124\ube44\uac8c\uc774\uc158 \ubc14\ub294 \uba54\uc778 \ud398\uc774\uc9c0\uc640 \ub3d9\uc77c\ud558\uac8c \uc720\uc9c0\ud558\uc138\uc694.
- \ucf58\ud150\uce20 \uc601\uc5ed\ub9cc \uc0c8\ub85c \uc0dd\uc131\ud558\uc138\uc694.
- **\uc911\uc694**: HTML \ucf54\ub4dc\ub294 \ubc18\ub4dc\uc2dc ===HTML_START=== \uc640 ===HTML_END=== \uc0ac\uc774\uc5d0 \ucd9c\ub825\ud558\uc138\uc694. \uadf8 \uc678 \uc124\uba85\uc740 \ucd5c\uc18c\ud654\ud558\uc138\uc694."""
        elif element_context:
            element_context = element_context[:2000]
            final_message = f"""{element_context}

\uc704 \uc694\uccad\uc5d0 \ub530\ub77c \ud604\uc7ac HTML\uc758 \ud574\ub2f9 \uc694\uc18c\ub9cc \uc218\uc815\ud558\uac70\ub098 \uc0ad\uc81c\ud558\uc138\uc694. \ub9cc\uc57d \uc0ad\uc81c \uc694\uccad\uc774\uba74 \ud574\ub2f9 \uc694\uc18c\ub97c \uc644\uc804\ud788 \uc81c\uac70\ud558\uace0, \ub098\uba38\uc9c0 HTML\uc740 \uadf8\ub300\ub85c \uc720\uc9c0\ud558\uc138\uc694. \uc218\uc815\ub41c \uc644\uc804\ud55c HTML\uc744 ===HTML_START=== \uc640 ===HTML_END=== \uc0ac\uc774\uc5d0 \ucd9c\ub825\ud558\uc138\uc694."""
        else:
            final_message = f"""{user_message}

## \uc911\uc694: HTML \uc218\uc815 \uaddc\uce59 (\ubc18\ub4dc\uc2dc \uc9c0\ud0a4\uc57c \ud568)
- **\uc218\uc815\ub41c \uc644\uc804\ud55c HTML \ud30c\uc77c \uc804\uccb4**\ub97c \ucd9c\ub825\ud558\uc138\uc694. \uc77c\ubd80\ub9cc \ucd9c\ub825\ud558\uc9c0 \ub9c8\uc138\uc694.
- \ubc18\ub4dc\uc2dc `===HTML_START===` \ub85c \uc2dc\uc791\ud558\uace0 `===HTML_END===` \ub85c \ub05d\ub0b4\uc138\uc694.
- \ub9c8\ud06c\ub2e4\uc6b4 \ucf54\ub4dc\ube14\ub85d(```html ... ```)\uc744 \uc0ac\uc6a9\ud558\uc9c0 \ub9c8\uc138\uc694. \uc624\uc9c1 ===HTML_START===/===HTML_END=== \ub9c8\ucee4\ub9cc \uc0ac\uc6a9\ud558\uc138\uc694.
- \uc704 \ud604\uc7ac \ud398\uc774\uc9c0 HTML\uc744 \ucc38\uace0\ud558\uc5ec \uc694\uccad\uc0ac\ud56d\uc744 \ubc18\uc601\ud55c **\uc644\uc804\ud55c HTML**\uc744 \uc0dd\uc131\ud558\uc138\uc694.
- \uc124\uba85, \uc694\uc57d, \ubcc0\uacbd\uc0ac\ud56d \ub9ac\uc2a4\ud2b8\ub97c \uc808\ub300 \ucd9c\ub825\ud558\uc9c0 \ub9c8\uc138\uc694. \uc624\uc9c1 HTML\ub9cc \ucd9c\ub825\ud558\uc138\uc694."""
    else:
        if strategy == "direct":
            final_message = f"""\ub2e4\uc74c \ub0b4\uc6a9\uc744 \ubc14\ud0d5\uc73c\ub85c **\ub2e8\uc21c\ud55c \ud55c \uc7a5\uc9dc\ub9ac HTML \ud398\uc774\uc9c0**\ub97c \uc0dd\uc131\ud558\uc138\uc694.

{user_message}

## \uc911\uc694 \uaddc\uce59
- **header \ub124\ube44\uac8c\uc774\uc158(\uba54\ub274)\ub97c \uc808\ub300 \uc0dd\uc131\ud558\uc9c0 \ub9c8\uc138\uc694.** \ucf58\ud150\uce20\ub294 \ubc14\ub85c body\ubd80\ud130 \uc2dc\uc791\ud558\uc138\uc694.
- hero \uc139\uc158 \u2192 \ub0b4\uc6a9 \u2192 footer \uc21c\uc11c\ub85c \uac04\ub2e8\ud558\uac8c \uad6c\uc131\ud558\uc138\uc694.
- **\uc694\uccad\ud55c \ub0b4\uc6a9\ub9cc** \uc0dd\uc131\ud558\uace0 \ubd88\ud544\uc694\ud55c \uc139\uc158(FAQ, \ud300, \ud1b5\uacc4 \ub4f1)\uc744 \ucd94\uac00\ud558\uc9c0 \ub9c8\uc138\uc694.
- \ud398\uc774\uc9c0 \uc81c\ubaa9, hero \ubb38\uad6c, \uc124\uba85 \ub4f1\uc740 \ud55c\uad6d\uc5b4\ub85c \uc790\uc5f0\uc2a4\ub7fd\uac8c \uc791\uc131\ud558\uc138\uc694.

\ubc18\ub4dc\uc2dc ===HTML_START=== \ub85c \uc2dc\uc791\ud558\uc5ec <!DOCTYPE html>\ub85c \uc774\uc5b4\uc9c0\ub294 HTML\uc744 \uc0dd\uc131\ud558\uc138\uc694. head/body, CSS, JS\ub97c \ubaa8\ub450 \ud3ec\ud568\ud558\uace0 ===HTML_END=== \ub85c \ub05d\ub0b4\uc138\uc694. \ub9c8\ucee4 \ubc16\uc5d0\ub294 \uc544\ubb34 \uc124\uba85\ub3c4 \uc4f0\uc9c0 \ub9c8\uc138\uc694."""
        else:
            final_message = f"""\ub2e4\uc74c \ub0b4\uc6a9\uc744 \ubc14\ud0d5\uc73c\ub85c \ud648\ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud558\uc138\uc694.

{user_message}

\ubc18\ub4dc\uc2dc ===HTML_START=== \ub85c \uc2dc\uc791\ud558\uc5ec <!DOCTYPE html>\ub85c \uc774\uc5b4\uc9c0\ub294 HTML\uc744 \uc0dd\uc131\ud558\uc138\uc694. head/body, CSS, JS\ub97c \ubaa8\ub450 \ud3ec\ud568\ud558\uace0 ===HTML_END=== \ub85c \ub05d\ub0b4\uc138\uc694. \ub9c8\ucee4 \ubc16\uc5d0\ub294 \uc544\ubb34 \uc124\uba85\ub3c4 \uc4f0\uc9c0 \ub9c8\uc138\uc694."""

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history[-5:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": f"{context}\n\n---\n\n{final_message}"})
    return messages
