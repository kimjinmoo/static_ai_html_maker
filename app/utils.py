import re


def strip_thinking(text):
    if not text:
        return text
    text = re.sub(r'<thinking>[\s\S]*?</thinking>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<reasoning>[\s\S]*?</reasoning>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<think>[\s\S]*?</think>', '', text)
    for marker in ["Thinking Process:", "생각 과정:"]:
        idx = text.find(marker)
        while idx != -1:
            end_match = re.search(r'</think>|---\s*\n|===HTML|===MODULE|===PLAN', text[idx + len(marker):])
            if end_match:
                text = text[:idx] + text[idx + len(marker) + end_match.end():]
            else:
                text = text[:idx]
            idx = text.find(marker)
    return text.strip()


def extract_module_html(module_content):
    mod_html = None
    ms = module_content.find("===MODULE_START===")
    if ms != -1:
        start_offset = ms + 19
        me = module_content.find("===MODULE_END===")
        raw = module_content[start_offset:]
        if me != -1:
            raw = raw[:me - start_offset].strip()
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw = "\n".join(lines).strip()
        if raw:
            mod_html = raw

    if not mod_html:
        mod_html = module_content.strip()
        ms2 = mod_html.find("===MODULE_START===")
        if ms2 != -1:
            mod_html = mod_html[ms2 + 19:]
        me2 = mod_html.find("===MODULE_END===")
        if me2 != -1:
            mod_html = mod_html[:me2].strip()

    if mod_html:
        mod_html = strip_thinking(mod_html)
        for marker in ["Thinking Process:", "생각 과정:"]:
            idx = mod_html.find(marker)
            if idx != -1:
                after = mod_html[idx:]
                end_match = re.search(r'</think>|---\s*\n|===HTML', after)
                if end_match:
                    end_idx = idx + end_match.end()
                    mod_html = mod_html[:idx] + mod_html[end_idx:]
                else:
                    mod_html = mod_html[:idx]
        mod_html = mod_html.strip()

    return mod_html


def find_model_file():
    from app.config import MODEL_PATH, DEFAULT_MODEL
    import os

    if MODEL_PATH and os.path.exists(MODEL_PATH):
        return MODEL_PATH

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_dir = os.path.join(base_dir, "models")

    if os.path.exists(model_dir):
        gguf_files = [f for f in os.listdir(model_dir) if f.endswith('.gguf')]
        if gguf_files:
            if DEFAULT_MODEL in gguf_files:
                path = os.path.join(model_dir, DEFAULT_MODEL)
                print(f"  [Auto] \xeb\xaa\xa8\xeb\x8d\xb8 \xec\x9e\x90\xeb\x8f\x99 \xea\xb0\x90\xec\xa7\x80: {DEFAULT_MODEL}")
                return path
            gguf_files.sort(reverse=True)
            path = os.path.join(model_dir, gguf_files[0])
            print(f"  [Auto] \xeb\xaa\xa8\xeb\x8d\xb8 \xec\x9e\x90\xeb\x8f\x99 \xea\xb0\x90\xec\xa7\x80: {gguf_files[0]}")
            return path

    return None


def get_projects_dir():
    import os
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "projects")


def parse_multi_page_plan(plan_content):
    import re
    menu_items = []
    pages = []

    plan_content = strip_thinking(plan_content)
    plan_content = re.sub(r'^```[\w]*\s*\n?', '', plan_content, flags=re.MULTILINE)
    plan_content = re.sub(r'\n?```\s*$', '', plan_content, flags=re.MULTILINE)
    plan_content = plan_content.strip()

    plan_upper = plan_content.upper()
    plan_start = plan_upper.find("===PLAN_START===")
    plan_end = plan_upper.find("===PLAN_END===")

    if plan_start != -1:
        plan_text = plan_content[plan_start + 16:]
        if plan_end != -1 and plan_end > plan_start:
            plan_text = plan_text[:plan_end - plan_start - 16].strip()
    else:
        print(f"\n[ParsePlan] WARN: No PLAN_START markers, trying fallback parse on:\n{plan_content[:500]}\n")
        plan_text = plan_content

    current_page = None
    for line in plan_text.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.upper().startswith("==="):
            continue

        m = re.match(r'menu_items:\s*\[(.*?)\]', stripped, re.IGNORECASE)
        if m:
            menu_items = [item.strip().strip('"\'') for item in m.group(1).split(",") if item.strip()]
            continue

        if re.match(r'^pages\s*:', stripped, re.IGNORECASE):
            continue

        m = re.match(r'^-\s*name:\s*(\S+)', stripped)
        if m:
            if current_page:
                pages.append(current_page)
            current_page = {"name": m.group(1), "file": "", "title": "", "sections": []}
            continue

        if current_page:
            m = re.match(r'^\s*file:\s*(\S+)', stripped)
            if m:
                current_page["file"] = m.group(1)
                continue

            m = re.match(r'^\s*title:\s*(.*)', stripped)
            if m:
                current_page["title"] = m.group(1).strip().strip('"\'')
                continue

            m = re.match(r'^\s*sections:\s*\[(.*?)\]', stripped, re.IGNORECASE)
            if m:
                current_page["sections"] = [s.strip().strip('"\'') for s in m.group(1).split(",") if s.strip()]
                continue

    if current_page:
        pages.append(current_page)

    for p in pages:
        if not p["file"]:
            if p["name"] == "index":
                p["file"] = "index.html"
            else:
                p["file"] = f"pages/{p['name']}.html"
        if not p["title"]:
            p["title"] = p["name"].capitalize()

    return menu_items, pages
