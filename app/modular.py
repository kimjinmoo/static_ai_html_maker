import json
import time
import re

from app.model import llama_chat_stream
from app.prompts import MODULAR_PLAN_PROMPT, MODULAR_MODULE_PROMPT, MODULAR_MULTI_PAGE_MODULE_PROMPT
from app.utils import extract_module_html, strip_thinking, parse_multi_page_plan


def _review_html(html_content):
    """Send assembled HTML to AI for final review and fixes."""
    if not html_content or len(html_content) < 50:
        return html_content
    # Pre-clean thinking tags and HTML entities
    html_content = strip_thinking(html_content)
    html_content = html_content.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    messages = [
        {"role": "system", "content": "You are an HTML fixer. Fix all issues in the HTML below. Rules: 1) Convert &lt; to < and &gt; to >  2) Remove <thinking>, <reasoning>, <think> tags  3) Fix unclosed tags  4) Remove duplicate doctype/html/head/body  5) Keep CSS in <style> and JS in <script>  6) Return ONLY the fixed HTML, no explanation."},
        {"role": "user", "content": html_content}
    ]
    try:
        result = ""
        for token in llama_chat_stream(messages):
            result += token
        if not result:
            return html_content
        result = result.strip()
        # Extract code block if present anywhere in the response
        code_start = result.find("```")
        if code_start != -1:
            lines = result[code_start:].split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            result = "\n".join(lines).strip()
        # Also check for <!DOCTYPE as fallback
        di = result.find("<!DOCTYPE html>")
        if di != -1:
            result = result[di:].strip()
        if result and len(result) > 50:
            result = strip_thinking(result)
            result = result.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
            print(f"  [Review] Fixed: {len(html_content)} -> {len(result)} chars")
            return result
    except Exception as e:
        print(f"  [Review] Error: {e}")
    return html_content


def _deduplicate_html(html):
    """Remove duplicate doctype/html/head/body tags, keeping only the first occurrence."""
    lines = html.split('\n')
    seen_doctype = seen_html = seen_head = seen_body = seen_body_end = False
    cleaned = []
    for line in lines:
        low = line.strip().lower()
        if low.startswith('<!doctype'):
            if not seen_doctype: seen_doctype = True; cleaned.append(line)
        elif low == '<html>' or low.startswith('<html '):
            if not seen_html: seen_html = True; cleaned.append(line)
        elif low == '<head>' if not seen_head else False:
            if not seen_head: seen_head = True; cleaned.append(line)
        elif low == '<head>':
            continue
        elif low == '</head>':
            cleaned.append(line)
        elif low == '<body>':
            if not seen_body: seen_body = True; cleaned.append(line)
        elif low == '</body>':
            seen_body_end = True; cleaned.append(line)
        elif low == '</html>':
            if seen_body_end: cleaned.append(line)
        else:
            cleaned.append(line)
    return '\n'.join(cleaned)


def generate_single_page(context, user_message, history):
    plan_messages = [
        {"role": "system", "content": MODULAR_PLAN_PROMPT},
    ]
    if history:
        plan_messages.extend(history[-6:])
    plan_messages.append({
        "role": "user",
        "content": f"{context}\n\n---\n\n{user_message}"
    })

    def generate():
        try:
            start_time = time.time()

            # Phase 1: Plan
            plan_content = ""
            for token in llama_chat_stream(plan_messages):
                plan_content += token
                yield f"data: {json.dumps({'type': 'plan_token', 'content': token})}\n\n"

            modules = _parse_modules(plan_content)
            if not modules:
                modules = [
                    {"id": "head", "description": "meta, title, font, CSS variables, global style"},
                    {"id": "hero", "description": "full-screen hero section"},
                    {"id": "content", "description": "main content section"},
                    {"id": "footer", "description": "footer"},
                    {"id": "script", "description": "JavaScript"},
                ]
                yield f"data: {json.dumps({'type': 'plan_token', 'content': '\n[default modules]\n'})}\n\n"

            print(f"\n[Modular] Plan: {len(modules)} modules")
            yield f"data: {json.dumps({'type': 'plan', 'modules': modules})}\n\n"

            # Phase 2: Generate modules
            generated_modules = {}
            for i, mod in enumerate(modules):
                mod_id = mod["id"]
                mod_desc = mod["description"]

                prev_html = ""
                for pid, phtml in generated_modules.items():
                    truncated = phtml[:500] + ("..." if len(phtml) > 500 else "")
                    prev_html += f"\n<!-- {pid} -->\n{truncated}\n"

                user_msg = f"""{context}

## \uc791\uc5c5: {mod_id} ({mod_desc}), {i + 1}/{len(modules)}
## \uc694\uccad: {user_message}

'{mod_id}' \ubaa8\ub4c8 HTML\ub9cc \uc0dd\uc131\ud558\uc138\uc694.

{prev_html and f'## \uc774\uc804 \ubaa8\ub4c8 (\uc2a4\ud0c0\uc77c \uc77c\uad00\uc6a9, \uc694\uc57d):\n{prev_html}' or ''}"""

                module_messages = [
                    {"role": "system", "content": MODULAR_MODULE_PROMPT},
                    {"role": "user", "content": user_msg}
                ]

                yield f"data: {json.dumps({'type': 'module_start', 'id': mod_id, 'index': i, 'total': len(modules)})}\n\n"

                module_content = ""
                token_count = 0
                mod_start = time.time()

                for token in llama_chat_stream(module_messages):
                    module_content += token
                    token_count += 1
                    yield f"data: {json.dumps({'type': 'module_token', 'id': mod_id, 'content': token})}\n\n"

                mod_html = extract_module_html(module_content) or strip_thinking(module_content.strip())
                mod_elapsed = time.time() - mod_start
                mod_speed = token_count / mod_elapsed if mod_elapsed > 0 else 0
                print(f"  [Mod-Done] {mod_id}: {token_count} tok, {mod_elapsed:.1f}s, {mod_speed:.1f} tok/s", flush=True)

                generated_modules[mod_id] = mod_html
                yield f"data: {json.dumps({'type': 'module_complete', 'id': mod_id, 'index': i, 'total': len(modules), 'tokens': token_count, 'speed': round(mod_speed, 1)})}\n\n"

            # Phase 3: Assemble
            assembled_parts = []
            for mod in modules:
                if mod["id"] in generated_modules:
                    assembled_parts.append(generated_modules[mod["id"]])
            assembled = "\n".join(assembled_parts)
            assembled = strip_thinking(assembled)
            assembled = _deduplicate_html(assembled)
            lines = assembled.split('\n')
            seen_doctype = False
            seen_html = False
            seen_head = False
            seen_body = False
            seen_body_end = False
            cleaned = []
            for line in lines:
                low = line.strip().lower()
                if low.startswith('<!doctype') and not seen_doctype:
                    seen_doctype = True
                    cleaned.append(line)
                elif low.startswith('<!doctype'):
                    continue
                elif low == '<html>' or low.startswith('<html ') and not seen_html:
                    seen_html = True
                    cleaned.append(line)
                elif low == '<html>' or low.startswith('<html '):
                    continue
                elif low == '<head>' and not seen_head:
                    seen_head = True
                    cleaned.append(line)
                elif low == '<head>' and seen_head:
                    continue
                elif low == '</head>' and not seen_body:
                    cleaned.append(line)
                elif low == '</head>' and seen_body:
                    continue
                elif low == '<body>' and not seen_body:
                    seen_body = True
                    cleaned.append(line)
                elif low == '<body>' and seen_body:
                    continue
                elif low == '</body>' and not seen_body_end:
                    seen_body_end = True
                    cleaned.append(line)
                elif low == '</body>' and seen_body_end:
                    continue
                elif low == '</html>' and seen_body_end:
                    cleaned.append(line)
                elif low == '</html>':
                    continue
                else:
                    cleaned.append(line)
            assembled = '\n'.join(cleaned)

            has_doctype = '<!DOCTYPE html>' in assembled or '<!doctype html>' in assembled.lower()
            print(f"\n[Modular] Assembled: {len(assembled)} chars, DOCTYPE: {has_doctype}, modules: {len(generated_modules)}\n", flush=True)

            # Phase 4: AI Review
            yield f"data: {json.dumps({'type': 'plan_token', 'content': '\u270f\ufe0f HTML \uac80\ud1a0 \ubc0f \ubcf4\uc815 \uc911...\n'})}\n\n"
            assembled = _review_html(assembled)

            yield f"data: {json.dumps({'type': 'done', 'html': assembled})}\n\n"
            print(f"[Modular] Total time: {time.time() - start_time:.1f}s\n")

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return generate()


def generate_multi_page(context, user_message, history, menu_items, pages, design_content):
    start_time = time.time()
    page_file_map = {p["name"]: p["file"] for p in pages}

    def generate():
        nonlocal context, user_message, menu_items, pages
        try:
            yield f"data: {json.dumps({'type': 'multi_plan', 'menu_items': menu_items, 'pages': pages})}\n\n"

            all_pages_html = {}
            total_pages = len(pages)
            shared_head_html = ""

            for p_idx, page in enumerate(pages):
                try:
                    page_name = page["name"]
                    page_file = page["file"]
                    page_title = page.get("title", page_name)
                    sections = page.get("sections", [])

                    yield f"data: {json.dumps({'type': 'page_start', 'name': page_name, 'file': page_file, 'index': p_idx, 'total': total_pages})}\n\n"

                    modules = []
                    if p_idx == 0:
                        modules.append({"id": "head", "description": f"meta, title({page_title}), font, CSS \ubcc0\uc218, \uc804\uc5ed \uc2a4\ud0c0\uc77c"})
                    modules.append({"id": "nav", "description": f"\uace0\uc815 \ub124\ube44\uac8c\uc774\uc158 (\uba54\ub274: {', '.join(menu_items)}), \ud604\uc7ac \ud398\uc774\uc9c0: {page_name}"})
                    for sec in sections:
                        modules.append({"id": sec, "description": f"{sec} \uc139\uc158"})
                    modules.append({"id": "footer", "description": f"\ud478\ud130 (\uba54\ub274: {', '.join(menu_items)})"})
                    if p_idx == 0:
                        modules.append({"id": "script", "description": "JavaScript (scroll reveal, \uba54\ub274 \ud1a0\uae00)"})

                    generated_modules = {}
                    for i, mod in enumerate(modules):
                        mod_id = mod["id"]
                        mod_desc = mod["description"]

                        prev_html = ""
                        for pid, phtml in generated_modules.items():
                            truncated = phtml[:500] + ("..." if len(phtml) > 500 else "")
                            prev_html += f"\n<!-- {pid} -->\n{truncated}\n"

                        if shared_head_html and mod_id != "head":
                            prev_html += f"\n<!-- shared head (\uc2a4\ud0c0\uc77c \ud1b5\uc77c\uc6a9) -->\n{shared_head_html[:1000]}\n"

                        system_prompt = MODULAR_MULTI_PAGE_MODULE_PROMPT.format(
                            page_name=page_name,
                            page_file=page_file,
                            menu_items=", ".join(menu_items),
                            mod_id=mod_id,
                            mod_desc=mod_desc
                        )

                        user_msg = f"""{context}

## \uc791\uc5c5: {page_name} > {mod_id} ({mod_desc}), \ubaa8\ub4c8 {i + 1}/{len(modules)}, \ud398\uc774\uc9c0 {p_idx + 1}/{total_pages}
## \uc694\uccad: {user_message}

'{mod_id}' \ubaa8\ub4c8 HTML\ub9cc \uc0dd\uc131\ud558\uc138\uc694.

{prev_html and f'## \uc774\uc804 \ubaa8\ub4c8 (\uc2a4\ud0c0\uc77c \uc77c\uad00\uc6a9, \uc694\uc57d):\n{prev_html}' or ''}"""

                        module_messages = [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_msg}
                        ]

                        yield f"data: {json.dumps({'type': 'module_start', 'page': page_name, 'id': mod_id, 'index': i, 'total': len(modules)})}\n\n"

                        module_content = ""
                        token_count = 0
                        mod_start = time.time()

                        try:
                            for token in llama_chat_stream(module_messages):
                                module_content += token
                                token_count += 1
                                yield f"data: {json.dumps({'type': 'module_token', 'page': page_name, 'id': mod_id, 'content': token})}\n\n"
                        except Exception as me:
                            print(f"  [MultiPage] {page_name}/{mod_id} error: {me}", flush=True)
                            module_content = f"<!-- {mod_id} module generation failed, using placeholder -->"

                        mod_html = extract_module_html(module_content) or strip_thinking(module_content.strip())
                        mod_elapsed = time.time() - mod_start
                        mod_speed = token_count / mod_elapsed if mod_elapsed > 0 else 0
                        print(f"  [MultiPage] {page_name}/{mod_id}: {token_count} tok, {mod_elapsed:.1f}s, {mod_speed:.1f} tok/s", flush=True)

                        generated_modules[mod_id] = mod_html
                        yield f"data: {json.dumps({'type': 'module_complete', 'page': page_name, 'id': mod_id, 'index': i, 'total': len(modules), 'tokens': token_count, 'speed': round(mod_speed, 1)})}\n\n"

                    # Assemble page
                    assembled_parts = []
                    for mod in modules:
                        if mod["id"] in generated_modules:
                            assembled_parts.append(generated_modules[mod["id"]])
                    assembled = "\n".join(assembled_parts)
                    assembled = strip_thinking(assembled)
                    assembled = _deduplicate_html(assembled)

                    if p_idx == 0 and "head" in generated_modules:
                        shared_head_html = generated_modules["head"]

                    all_pages_html[page_file] = assembled
                    print(f"  [MultiPage] {page_name} assembled: {len(assembled)} chars, DOCTYPE: {'<!DOCTYPE html>' in assembled}", flush=True)
                except Exception as pe:
                    print(f"  [MultiPage] Page {page.get('name', '?')} failed: {pe}", flush=True)
                    all_pages_html[page_file] = f"<!-- {page_file} generation failed -->"
                    yield f"data: {json.dumps({'type': 'plan_token', 'content': f'\u26a0\ufe0f {page_name} \ud398\uc774\uc9c0 \uc0dd\uc131 \uc2e4\ud328, \uac74\ub108\ub6d0...\n'})}\n\n"

                yield f"data: {json.dumps({'type': 'page_complete', 'name': page_name, 'file': page_file, 'index': p_idx, 'total': total_pages, 'html': assembled})}\n\n"

            total_time = time.time() - start_time
            print(f"\n[MultiPage] All {total_pages} pages done in {total_time:.1f}s\n")
            print(f"  [MultiPage] Sending multi_done with {len(all_pages_html)} pages: {list(all_pages_html.keys())}", flush=True)
            yield f"data: {json.dumps({'type': 'multi_done', 'pages': all_pages_html})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return generate()


def _parse_modules(plan_content):
    plan_content = strip_thinking(plan_content)
    modules = []
    plan_upper = plan_content.upper()
    plan_start = plan_upper.find("===PLAN_START===")
    plan_end = plan_upper.find("===PLAN_END===")

    if plan_start != -1:
        plan_text = plan_content[plan_start + 16:]
        if plan_end != -1 and plan_end > plan_start:
            plan_text = plan_text[:plan_end - plan_start - 16].strip()
        elif plan_end == -1:
            plan_text = plan_text.strip()
    else:
        return modules

    for line in plan_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.upper().startswith("==="):
            continue
        m = re.match(r'\d+\.\s*(\S+)\s*[-\u2013\u2014]\s*(.*)', line)
        if m:
            mod_id = m.group(1).lower().strip().strip('[]')
            mod_desc = m.group(2).strip()
            modules.append({"id": mod_id, "description": mod_desc})
        elif len(line) > 80:
            continue
        elif line and not line.upper().startswith("==="):
            first = line.lower().split()[0].strip('.').strip()
            if first in ("i", "we", "the", "this", "that", "it", "you", "please", "here", "first", "next", "then", "finally", "will", "create", "make", "use", "using"):
                continue
            mod_id = first
            modules.append({"id": mod_id, "description": line})

    return modules[:20]
