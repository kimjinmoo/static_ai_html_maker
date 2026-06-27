import json
import time
import re

from app.model import llama_chat_stream
from app.prompts import MODULAR_PLAN_PROMPT, MODULAR_MODULE_PROMPT, MODULAR_MULTI_PAGE_MODULE_PROMPT
from app.utils import (
    extract_module_html, strip_thinking, parse_multi_page_plan, ensure_complete_html,
    load_scaffold_css, SCAFFOLD_CLASS_REFERENCE, strip_module_wrapper, merge_style_blocks,
)


# 모듈 id별 필수 HTML 태그 검증 규칙. AI가 reasoning 텍스트를 뱉거나
# 잘못된 모듈을 생성한 것을 탐지한다.
_MODULE_TAG_RULES = {
    "head":     (("<head", "<!DOCTYPE"),              "head 모듈에는 <head>가 포함되어야 합니다"),
    "nav":      (("<nav", "<header"),                 "nav 모듈에는 <nav> 또는 <header>가 포함되어야 합니다"),
    "hero":     (("<section",),                        "hero 모듈에는 <section>이 포함되어야 합니다"),
    "footer":   (("<footer",),                         "footer 모듈에는 <footer>가 포함되어야 합니다"),
    "script":   (("<script",),                         "script 모듈에는 <script>가 포함되어야 합니다"),
}


def _validate_module(mod_id, html):
    """모듈 HTML이 해당 모듈의 필수 태그를 포함하는지 검증. 유효하면 True."""
    if not html or len(html.strip()) < 10:
        return False
    rule = _MODULE_TAG_RULES.get(mod_id)
    if not rule:
        # 규칙이 없는 content 모듈: 최소 한 개의 HTML 태그가 있으면 OK
        return bool(re.search(r'<(section|div|article|header|footer|main|nav|aside|ul|ol|table|form)\b', html, re.IGNORECASE))
    tags, _msg = rule
    return any(t.lower() in html.lower() for t in tags)


def _default_footer_html(footer_desc=""):
    """footer 모듈이 실패했을 때 사용할 스캐폴드 기반 폴백."""
    return (
        '<footer class="footer">\n'
        '  <div class="container">\n'
        '    <div class="footer-grid">\n'
        '      <div>\n'
        '        <div class="footer-brand">Brand</div>\n'
        '        <p class="footer-tagline">패키지로 만들어진 정적 페이지입니다.</p>\n'
        '      </div>\n'
        '      <div>\n'
        '        <h4 class="footer-col-title">Product</h4>\n'
        '        <a class="footer-link" href="#">Features</a>\n'
        '        <a class="footer-link" href="#">Pricing</a>\n'
        '      </div>\n'
        '      <div>\n'
        '        <h4 class="footer-col-title">Company</h4>\n'
        '        <a class="footer-link" href="#">About</a>\n'
        '        <a class="footer-link" href="#">Contact</a>\n'
        '      </div>\n'
        '      <div>\n'
        '        <h4 class="footer-col-title">Connect</h4>\n'
        '        <a class="footer-link" href="#">Twitter</a>\n'
        '        <a class="footer-link" href="#">GitHub</a>\n'
        '      </div>\n'
        '    </div>\n'
        '    <div class="footer-bottom">\n'
        '      <span class="footer-copy">&copy; <span id="year"></span> Brand. All rights reserved.</span>\n'
        '      <div class="footer-social">\n'
        '        <a href="#" aria-label="Twitter"><i class="fab fa-twitter"></i></a>\n'
        '        <a href="#" aria-label="GitHub"><i class="fab fa-github"></i></a>\n'
        '      </div>\n'
        '    </div>\n'
        '  </div>\n'
        '</footer>\n'
        '</body>\n</html>'
    )


def _default_script_html():
    """script 모듈이 실패했을 때 사용할 폴백 (scroll reveal + mobile menu + faq + footer year)."""
    return (
        '<script>\n'
        '(function(){\n'
        '  // footer year\n'
        '  var y=document.getElementById("year"); if(y) y.textContent=new Date().getFullYear();\n'
        '  // scroll reveal\n'
        '  if("IntersectionObserver" in window){\n'
        '    var io=new IntersectionObserver(function(entries){\n'
        '      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("visible"); io.unobserve(e.target); } });\n'
        '    },{threshold:0.1});\n'
        '    document.querySelectorAll("[data-animate]").forEach(function(el){ io.observe(el); });\n'
        '  }\n'
        '  // mobile nav toggle\n'
        '  var t=document.querySelector(".nav-toggle"); var m=document.querySelector(".nav-menu");\n'
        '  if(t&&m){ t.addEventListener("click",function(){ m.classList.toggle("open"); }); }\n'
        '  // nav scroll bg\n'
        '  var nav=document.querySelector(".nav");\n'
        '  if(nav){ window.addEventListener("scroll",function(){ if(window.scrollY>20){ nav.classList.add("scrolled"); } else { nav.classList.remove("scrolled"); } }); }\n'
        '  // faq toggle\n'
        '  document.querySelectorAll(".faq-question").forEach(function(q){\n'
        '    q.addEventListener("click",function(){ var item=q.closest(".faq-item"); item.classList.toggle("open"); });\n'
        '  });\n'
        '})();\n'
        '</script>\n</body>\n</html>'
    )


def _module_fallback(mod_id):
    """모듈 id별 폴백 HTML 반환. 없으면 빈 문자열."""
    if mod_id == "footer":
        return _default_footer_html()
    if mod_id == "script":
        return _default_script_html()
    return ""


def _finalize_module(mod_id, raw_module_content, scaffold_css="", *, on_retry=None):
    """모듈 raw 출력에서 HTML을 추출하고 검증. 실패 시 on_retry 콜백으로 1회 재생성 시도.
    최종 실패 시 footer/script는 폴백, content는 빈 문자열 반환.
    반환: (html, status) — status는 'ok' | 'retried' | 'fallback' | 'empty' | 'invalid'.
    """
    mod_html = extract_module_html(raw_module_content) or ""

    if _validate_module(mod_id, mod_html):
        return mod_html, "ok"

    if mod_html:
        print(f"  [Validate] {mod_id}: invalid (no required tag), retrying...", flush=True)

    if on_retry is not None:
        retried_raw = on_retry()
        if retried_raw:
            mod_html2 = extract_module_html(retried_raw) or ""
            if _validate_module(mod_id, mod_html2):
                return mod_html2, "retried"
            print(f"  [Validate] {mod_id}: retry still invalid", flush=True)

    fb = _module_fallback(mod_id)
    if fb:
        print(f"  [Validate] {mod_id}: using scaffold fallback", flush=True)
        return fb, "fallback"
    # content/nav/hero 등 fallback이 없는 모듈: 빈 문자열 반환(조립 시 건너뜀)
    print(f"  [Validate] {mod_id}: no fallback, emitting empty (will be skipped)", flush=True)
    return mod_html or "", "empty" if not mod_html else "invalid"


def _assemble_modules(modules, generated_modules):
    """모듈 HTML 조각을 하나의 완전한 HTML로 조립한다.
    head 모듈은 전체 문서 시작을 담당하고, content 모듈은 본문만,
    footer/script 모듈은 닫는 태그를 담당한다."""
    head_html = ""
    body_parts = []
    tail_html = ""

    for mod in modules:
        mod_id = mod["id"]
        # 멀티페이지의 *_shared placeholder는 base id로 매핑
        lookup_id = mod_id[:-7] if mod_id.endswith("_shared") else mod_id
        html = (generated_modules.get(lookup_id) or generated_modules.get(mod_id) or "").strip()
        if not html:
            continue
        # 검증 실패한 모듈(reasoning 텍스트 등)은 조립에서 제외. 단 폴백은 이미 _finalize_module에서 주입됨.
        check_id = lookup_id
        if check_id in _MODULE_TAG_RULES and not _validate_module(check_id, html):
            print(f"  [Assemble] skip invalid module: {mod_id}", flush=True)
            continue
        # content/nav/hero 등은 최소한 HTML 태그가 있는지 재확인
        if check_id not in _MODULE_TAG_RULES and not re.search(r'<[\w/!?][^>]*>', html):
            print(f"  [Assemble] skip non-HTML module: {mod_id}", flush=True)
            continue
        if mod_id == "head" or mod_id == "head_shared":
            head_html = html
        elif mod_id in ("footer", "script", "footer_shared", "script_shared"):
            tail_html += "\n" + html
        else:
            # content/nav/hero 모듈: 전체 문서 래퍼가 있으면 본문만 추출
            html = strip_module_wrapper(html)
            body_parts.append(html)

    if head_html and (body_parts or tail_html):
        # head에 <body>가 닫혀 있으면 풀고 body_parts를 끼워넣는다
        body_open_idx = re.search(r'<body[^>]*>', head_html, re.IGNORECASE)
        if body_open_idx:
            head_close_body = head_html.find('</body>', body_open_idx.end(), re.IGNORECASE)
            if head_close_body == -1:
                # head에 열린 <body>만 있는 경우 (정상)
                assembled = head_html + "\n" + "\n".join(body_parts) + "\n" + tail_html
                # </html> 보정
                if not re.search(r'</html\s*>', assembled, re.IGNORECASE):
                    assembled = assembled.rstrip() + "\n</html>"
            else:
                # head가 이미 닫힌 body를 가질 경우 body 내부에 삽입
                before = head_html[:body_open_idx.end()]
                after = head_html[body_open_idx.end():head_close_body]
                tail_doc = head_html[head_close_body:]
                assembled = before + "\n" + "\n".join(body_parts) + "\n" + after + tail_doc
        else:
            # head에 <body>가 없으면 직접 구성
            assembled = head_html + "\n<body>\n" + "\n".join(body_parts) + "\n</body>\n" + tail_html
    else:
        assembled = "\n".join([head_html] + body_parts + [tail_html]).strip()

    assembled = strip_thinking(assembled)
    assembled = assembled.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    # 여러 <style> 블록을 하나로 병합
    assembled = merge_style_blocks(assembled)
# 정형화 및 누락 태그 보정
    assembled = ensure_complete_html(assembled)
    return assembled


def generate_single_page(context, user_message, history, scaffold_css="", template_name=""):
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

                # head 모듈에는 스캐폴드 CSS를 주입, 이후 모듈엔 클래스 레퍼런스만 제공
                if mod_id == "head" and scaffold_css:
                    system_prompt = MODULAR_MODULE_PROMPT + "\n\n" + SCAFFOLD_CLASS_REFERENCE + (
                        f"\n\n## 📦 주입할 스캐폴드 CSS (이 CSS를 `<style>` 안에 그대로 복사)\n"
                        f"반드시 아래 CSS 블록 전체를 `<style>`에 포함. 수정/축약 금지.\n"
                        f"```css\n{scaffold_css}\n```"
                    )
                else:
                    system_prompt = MODULAR_MODULE_PROMPT + "\n\n" + SCAFFOLD_CLASS_REFERENCE
                    # head가 이미 생성됐으면 그 head를 스타일 참조로 전달
                    if "head" in generated_modules:
                        head_ref = generated_modules["head"]
                        # <style> 블록만 발췌해서 참조로 전달 (이미 정의된 클래스 목록 파악용)
                        style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', head_ref, flags=re.IGNORECASE)
                        if style_blocks:
                            system_prompt += "\n\n## head 모듈에 정의된 스캐폴드(이미 있음, 재정의 금지)\n```css\n" + "\n".join(style_blocks)[:3000] + "\n```"

                prev_html = ""
                for pid, phtml in generated_modules.items():
                    truncated = phtml[:500] + ("..." if len(phtml) > 500 else "")
                    prev_html += f"\n<!-- {pid} -->\n{truncated}\n"

                user_msg = f"""{context}

## {mod_id}: {i + 1}/{len(modules)} 모듈
## 요청: {user_message[:200]}

'{mod_id}' 모듈 HTML만 생성하세요. 스캐폴드의 클래스를 사용하세요.

{prev_html and f'## 이전 모듈 (참고):\n{prev_html}' or ''}"""

                module_messages = [
                    {"role": "system", "content": system_prompt},
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

                mod_elapsed = time.time() - mod_start
                mod_speed = token_count / mod_elapsed if mod_elapsed > 0 else 0
                print(f"  [Mod-Done] {mod_id}: {token_count} tok, {mod_elapsed:.1f}s, {mod_speed:.1f} tok/s", flush=True)

                # 검증 + 1회 재시도 + 폴백
                def _retry_single():
                    retry_msg = module_messages[:-1] + [{"role": "user", "content": (
                        f"{module_messages[-1]['content']}\n\n"
                        f"## ⚠️ 이전 출력은 '{mod_id}' 모듈의 필수 태그(<{('footer' if mod_id=='footer' else 'script' if mod_id=='script' else 'section')}>)가 없거나 설명 텍스트만 포함되어 있었습니다.\n"
                        f"오직 ===MODULE_START=== 와 ===MODULE_END=== 사이에 HTML 코드만 출력하세요. 설명/생각/분석 절대 금지."
                    )}]
                    retry_content = ""
                    rc = 0
                    rs = time.time()
                    try:
                        for tok in llama_chat_stream(retry_msg):
                            retry_content += tok
                            rc += 1
                    except Exception as e:
                        print(f"  [Retry] {mod_id} failed: {e}", flush=True)
                        return ""
                    re_elapsed = time.time() - rs
                    re_speed = rc / re_elapsed if re_elapsed > 0 else 0
                    print(f"  [Retry-Done] {mod_id}: {rc} tok, {re_elapsed:.1f}s, {re_speed:.1f} tok/s", flush=True)
                    return retry_content

                mod_html, status = _finalize_module(mod_id, module_content, scaffold_css, on_retry=_retry_single)
                print(f"  [Finalize] {mod_id}: {status}", flush=True)

                generated_modules[mod_id] = mod_html
                yield f"data: {json.dumps({'type': 'module_complete', 'id': mod_id, 'index': i, 'total': len(modules), 'tokens': token_count, 'speed': round(mod_speed, 1), 'status': status})}\n\n"

            # Phase 3: Assemble (결정적 조립 + 자동 보정)
            assembled = _assemble_modules(modules, generated_modules)
            has_doctype = '<!DOCTYPE html>' in assembled or '<!doctype html>' in assembled.lower()
            print(f"\n[Modular] Assembled: {len(assembled)} chars, DOCTYPE: {has_doctype}, modules: {len(generated_modules)}\n", flush=True)

            yield f"data: {json.dumps({'type': 'done', 'html': assembled, 'reviewed': True})}\n\n"
            print(f"[Modular] Total time: {time.time() - start_time:.1f}s\n")

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return generate()


def generate_multi_page(context, user_message, history, menu_items, pages, design_content, scaffold_css=""):
    start_time = time.time()
    page_file_map = {p["name"]: p["file"] for p in pages}

    def generate():
        nonlocal context, user_message, menu_items, pages
        try:
            yield f"data: {json.dumps({'type': 'multi_plan', 'menu_items': menu_items, 'pages': pages})}\n\n"

            all_pages_html = {}
            total_pages = len(pages)

            # Shared modules captured from first page
            shared = {"head": "", "nav": "", "footer": "", "script": ""}

            # Module mapping: shared modules (not regenerated for each page)
            SHARED_IDS = {"head", "nav", "footer", "script"}

            for p_idx, page in enumerate(pages):
                try:
                    page_name = page["name"]
                    page_file = page["file"]
                    page_title = page.get("title", page_name)
                    sections = page.get("sections", [])

                    yield f"data: {json.dumps({'type': 'page_start', 'name': page_name, 'file': page_file, 'index': p_idx, 'total': total_pages})}\n\n"

                    # Build module list: shared modules only on first page, content sections on every page
                    modules = []
                    if p_idx == 0:
                        modules.append({"id": "head", "description": f"meta, title({page_title}), font, CSS, global style"})
                        modules.append({"id": "nav", "description": f"fixed nav (menu: {', '.join(menu_items)}), current: {page_name}"})
                    for sec in sections:
                        modules.append({"id": sec, "description": f"{sec} section"})
                    if p_idx == 0:
                        modules.append({"id": "footer", "description": f"footer (menu: {', '.join(menu_items)})"})
                        modules.append({"id": "script", "description": "JavaScript (scroll reveal, menu toggle)"})
                    # For non-first pages, add placeholder entries for assembly ordering
                    shared_order = []
                    if p_idx > 0:
                        shared_order = [("head_shared", "head"), ("nav_shared", "nav")]
                    modules = (
                        [{"id": sid, "description": f"shared {mid}"} for sid, mid in shared_order] +
                        modules +
                        ([{"id": "footer_shared", "description": "shared footer"}, {"id": "script_shared", "description": "shared script"}] if p_idx > 0 else [])
                    )

                    generated_modules = {}
                    for i, mod in enumerate(modules):
                        mod_id = mod["id"]
                        is_shared = mod_id.endswith("_shared")

                        # Reuse shared module (skip AI call)
                        if is_shared:
                            base_id = mod_id.replace("_shared", "")
                            if shared.get(base_id):
                                mod_html = _adjust_nav_hrefs(shared["nav"], page_name, page_file, menu_items) if base_id == "nav" else shared[base_id]
                                generated_modules[base_id] = mod_html
                                yield f"data: {json.dumps({'type': 'module_start', 'page': page_name, 'id': mod_id, 'index': i, 'total': len(modules)})}\n\n"
                                yield f"data: {json.dumps({'type': 'module_complete', 'page': page_name, 'id': base_id, 'index': i, 'total': len(modules)})}\n\n"
                                continue

                        # Generate via AI
                        prev_html = ""
                        for pid, phtml in generated_modules.items():
                            truncated = phtml[:500] + ("..." if len(phtml) > 500 else "")
                            prev_html += f"\n<!-- {pid} -->\n{truncated}\n"
                        if shared["head"] and mod_id != "head":
                            prev_html += f"\n<!-- shared head (style ref) -->\n{shared['head'][:1000]}\n"

                        # head 모듈에는 스캐폴드 CSS 주입, 이후 모듈엔 클래스 레퍼런스 + head 스타일 참조 제공
                        if mod_id == "head" and scaffold_css:
                            system_prompt = MODULAR_MULTI_PAGE_MODULE_PROMPT.format(
                                page_name=page_name, page_file=page_file,
                                menu_items=", ".join(menu_items),
                                mod_id=mod_id, mod_desc=mod["description"]
                            ) + "\n\n" + SCAFFOLD_CLASS_REFERENCE + (
                                f"\n\n## 📦 주입할 스캐폴드 CSS (이 CSS를 `<style>` 안에 그대로 복사)\n"
                                f"반드시 아래 CSS 블록 전체를 `<style>`에 포함. 수정/축약 금지.\n"
                                f"```css\n{scaffold_css}\n```"
                            )
                        else:
                            system_prompt = MODULAR_MULTI_PAGE_MODULE_PROMPT.format(
                                page_name=page_name, page_file=page_file,
                                menu_items=", ".join(menu_items),
                                mod_id=mod_id, mod_desc=mod["description"]
                            ) + "\n\n" + SCAFFOLD_CLASS_REFERENCE
                            if shared.get("head"):
                                style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', shared["head"], flags=re.IGNORECASE)
                                if style_blocks:
                                    system_prompt += "\n\n## head 모듈에 정의된 스캐폴드(재정의 금지)\n```css\n" + "\n".join(style_blocks)[:3000] + "\n```"
                        user_msg = f"""{context}

## {page_name} > {mod_id}, module {i + 1}/{len(modules)} (page {p_idx + 1}/{total_pages})
## request: {user_message[:200]}

Generate ONLY the '{mod_id}' module HTML.
{prev_html and f'## previous modules (style ref):\n{prev_html}' or ''}"""

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
                            module_content = f"<!-- {mod_id} module generation failed -->"

                        # 검증 + 1회 재시도 + 폴백 (멀티페이지)
                        def _retry_multi(_msgs=module_messages, _mid=mod_id):
                            retry_msg = _msgs[:-1] + [{"role": "user", "content": (
                                f"{_msgs[-1]['content']}\n\n"
                                f"## ⚠️ 이전 출력은 '{_mid}' 모듈의 필수 HTML 태그가 없거나 설명 텍스트만 포함되어 있었습니다.\n"
                                f"오직 ===MODULE_START=== 와 ===MODULE_END=== 사이에 HTML 코드만 출력하세요. 설명/생각/분석 절대 금지."
                            )}]
                            rc = ""
                            try:
                                for tok in llama_chat_stream(retry_msg):
                                    rc += tok
                            except Exception as e:
                                print(f"  [MultiPage-Retry] {page_name}/{mod_id} failed: {e}", flush=True)
                                return ""
                            return rc

                        mod_html, status = _finalize_module(mod_id, module_content, scaffold_css, on_retry=_retry_multi)
                        mod_elapsed = time.time() - mod_start
                        mod_speed = token_count / mod_elapsed if mod_elapsed > 0 else 0
                        print(f"  [MultiPage] {page_name}/{mod_id}: {token_count} tok, {mod_elapsed:.1f}s, {mod_speed:.1f} tok/s, {status}", flush=True)

                        generated_modules[mod_id] = mod_html
                        yield f"data: {json.dumps({'type': 'module_complete', 'page': page_name, 'id': mod_id, 'index': i, 'total': len(modules), 'tokens': token_count, 'speed': round(mod_speed, 1)})}\n\n"

                    # Capture shared modules from first page
                    if p_idx == 0:
                        for k in shared:
                            if k in generated_modules:
                                shared[k] = generated_modules[k]

                    # Assemble: head + nav + content + footer + script (_assemble_modules가 shared 처리)
                    assembled = _assemble_modules(modules, generated_modules)
                    if assembled.strip() == "" or "<!-- assembly failed" in assembled:
                            assembled = ensure_complete_html(assembled)
                    all_pages_html[page_file] = assembled
                    print(f"  [MultiPage] {page_name} assembled: {len(assembled)} chars", flush=True)

                except Exception as pe:
                    import traceback
                    traceback.print_exc()
                    print(f"  [MultiPage] Page {page.get('name', '?')} failed: {pe}", flush=True)
                    all_pages_html[page_file] = f"<!-- {page_file} generation failed -->"
                    yield f"data: {json.dumps({'type': 'plan_token', 'content': f'⚠️ {page_name} page failed, skipped...\n'})}\n\n"

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


def _adjust_nav_hrefs(nav_html, page_name, page_file, menu_items):
    """Reuse shared nav HTML, fixing href paths and active state for the current page."""
    import re
    # Map page names to expected hrefs
    href_map = {
        "index": "index.html",
        "index.html": "index.html",
    }
    for item in menu_items:
        slug = item.lower().replace(" ", "-").replace("/", "-")
        href_map[slug] = f"pages/{slug}.html"
        href_map[item] = f"pages/{slug}.html"

    current_file = page_file

    # Replace href="#" with actual page paths in the nav
    # This is a best-effort replacement; the AI generates nav links with various href values
    lines = nav_html.split('\n')
    adjusted = []
    for line in lines:
        # Remove any active class from all links first
        line = re.sub(r'\bactive\b', '', line, flags=re.IGNORECASE)
        # Add active class to the current page's link
        if f'href="{current_file}"' in line or f"href='{current_file}'" in line:
            line = re.sub(r'(class\s*=\s*["\'])([^"\']*)', r'\1\2 active', line)
        adjusted.append(line)
    return '\n'.join(adjusted)


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
