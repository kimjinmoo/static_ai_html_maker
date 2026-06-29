import os
import json
import uuid
import datetime
import time
import shutil
import io
import zipfile
import re
from flask import Blueprint, request, jsonify, send_file

from app.utils import get_projects_dir, ensure_complete_html


project_bp = Blueprint("project", __name__)


def _extract_assets(project_dir, html, file_path="index.html"):
    """Extract inline CSS/JS from HTML to separate files and return HTML with external links."""
    css_dir = os.path.join(project_dir, "assets", "css")
    js_dir = os.path.join(project_dir, "assets", "js")
    os.makedirs(css_dir, exist_ok=True)
    os.makedirs(js_dir, exist_ok=True)

    # Calculate correct relative path for assets
    depth = file_path.count("/")
    prefix = "../" * depth if depth > 0 else ""

    css_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html, re.IGNORECASE)
    if css_blocks:
        combined = "\n".join(css_blocks)
        with open(os.path.join(css_dir, "style.css"), 'w', encoding='utf-8') as f:
            f.write(combined)
        html = re.sub(r'<style[^>]*>[\s\S]*?</style>\s*', '', html, flags=re.IGNORECASE)
        head_close = html.rfind('</head>')
        if head_close != -1:
            link_tag = f'    <link rel="stylesheet" href="{prefix}assets/css/style.css">\n'
            html = html[:head_close] + link_tag + html[head_close:]

    js_blocks = []
    for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.IGNORECASE | re.DOTALL):
        src = re.search(r'src\s*=\s*["\']([^"\']+)["\']', m.group(0))
        if not src:
            js_blocks.append(m.group(1))
    if js_blocks:
        combined = "\n".join(js_blocks)
        with open(os.path.join(js_dir, "main.js"), 'w', encoding='utf-8') as f:
            f.write(combined)
        html = re.sub(r'<script(?!\s+src)[^>]*>[\s\S]*?</script>\s*', '', html, flags=re.IGNORECASE)
        body_end = html.rfind('</body>')
        if body_end != -1:
            script_tag = f'    <script src="{prefix}assets/js/main.js"></script>\n'
            html = html[:body_end] + script_tag + html[body_end:]

    return html


@project_bp.route("/api/projects/init", methods=["POST"])
def init_project():
    data = request.json
    project_id = data.get("id", "") or str(uuid.uuid4())[:8]
    title = data.get("title", "\uc81c\ubaa9 \uc5c6\uc74c")
    page_type = data.get("page_type", "")
    template = data.get("template", "")

    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    os.makedirs(project_dir, exist_ok=True)

    for subdir in ["assets/images", "pages"]:
        os.makedirs(os.path.join(project_dir, subdir), exist_ok=True)

    empty_html = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\uc0dd\uc131 \uc911...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f0f0f; color: #e8e8e8; font-family: system-ui, sans-serif; }
    .loading { text-align: center; }
    .loading h2 { margin-bottom: 16px; color: #6366f1; }
    .loading p { color: #666; }
  </style>
</head>
<body>
  <div class="loading">
    <h2>\u23f3 \uc0dd\uc131 \uc911...</h2>
    <p>AI\uac00 \ud648\ud398\uc774\uc9c0\ub97c \ub9cc\ub4e4\uace0 \uc788\uc2b5\ub2c8\ub2e4</p>
  </div>
</body>
</html>"""
    with open(os.path.join(project_dir, "index.html"), 'w', encoding='utf-8') as f:
        f.write(empty_html)

    project_meta = {
        "id": project_id,
        "title": title,
        "page_type": page_type,
        "template": template,
        "html": "",
        "history": [],
        "design_content": "",
        "design_system": None,
        "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "status": "generating"
    }
    meta_path = os.path.join(projects_dir, f"{project_id}.json")
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(project_meta, f, ensure_ascii=False, indent=2)

    print(f"\n[Init] \ube48 \ud504\ub85c\uc81d\ud2b8 \uc0dd\uc131: {project_id} ({title})")
    return jsonify({"id": project_id, "status": "initialized"})


@project_bp.route("/api/projects", methods=["GET"])
def list_projects():
    projects_dir = get_projects_dir()
    if not os.path.exists(projects_dir):
        return jsonify({"projects": []})

    projects = []
    for filename in os.listdir(projects_dir):
        if filename.endswith('.json'):
            filepath = os.path.join(projects_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    project = json.load(f)
                projects.append(project)
            except (json.JSONDecodeError, IOError):
                continue

    projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return jsonify({"projects": projects})


@project_bp.route("/api/projects", methods=["POST"])
def save_project():
    data = request.json
    project_id = data.get("id", "") or str(uuid.uuid4())[:8]
    title = data.get("title", "\uc81c\ubaa9 \uc5c6\uc74c")
    page_type = data.get("page_type", "")
    template = data.get("template", "")
    html = data.get("html", "")
    history = data.get("history", [])
    design_content = data.get("design_content", "")
    design_system = data.get("design_system", None)

    projects_dir = get_projects_dir()
    os.makedirs(projects_dir, exist_ok=True)
    print(f"\n[Save] \ud504\ub85c\uc81d\ud2b8 \uc800\uc7a5: {project_id} ({title})")

    html = ensure_complete_html(html)

    html_path = os.path.join(projects_dir, f"{project_id}.html")
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"  [File] {html_path}")

    project_dir = os.path.join(projects_dir, project_id)
    print(f"  [Dir]  {project_dir}/")
    for subdir in ["assets/images", "pages"]:
        dir_path = os.path.join(project_dir, subdir)
        os.makedirs(dir_path, exist_ok=True)

    index_path = os.path.join(project_dir, "index.html")
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"  [File] {index_path}")

    page_matches = re.findall(r'<!--\s*page:\s*(\S+)\s*-->([\s\S]*?)<!--\s*end-page\s*-->', html)
    for page_name, page_html in page_matches:
        if page_name.endswith('.html'):
            page_path = os.path.join(project_dir, "pages", page_name)
            with open(page_path, 'w', encoding='utf-8') as f:
                f.write(page_html.strip())
            print(f"  [File] {page_path}")

    pages_dir = os.path.join(project_dir, "pages")
    disk_pages = []
    if os.path.exists(pages_dir):
        for fname in sorted(os.listdir(pages_dir)):
            if fname.endswith(".html"):
                rel_path = os.path.join("pages", fname).replace(os.sep, "/")
                disk_pages.append(rel_path)

    existing_meta = {}
    existing_json_path = os.path.join(projects_dir, f"{project_id}.json")
    if os.path.exists(existing_json_path):
        try:
            with open(existing_json_path, 'r', encoding='utf-8') as f:
                existing_meta = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass

    project_data = {
        "id": project_id,
        "title": title,
        "page_type": page_type,
        "template": template,
        "history": history,
        "design_content": design_content,
        "design_system": design_system if design_system is not None else existing_meta.get("design_system"),
        "created_at": existing_meta.get("created_at", time.strftime("%Y-%m-%d %H:%M")),
        "updated_at": time.strftime("%Y-%m-%d %H:%M"),
        "html_path": html_path,
        "status": "completed",
        "multi_page": existing_meta.get("multi_page", False),
        "menu_items": existing_meta.get("menu_items", []),
        "pages": disk_pages
    }
    json_path = os.path.join(projects_dir, f"{project_id}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(project_data, f, ensure_ascii=False, indent=2)
    print(f"  [File] {json_path}")

    return jsonify({"status": "success", "id": project_id})


@project_bp.route("/api/projects/<project_id>", methods=["GET"])
def load_project(project_id):
    projects_dir = get_projects_dir()
    json_path = os.path.join(projects_dir, f"{project_id}.json")

    if not os.path.exists(json_path):
        return jsonify({"error": "\ud504\ub85c\uc81d\ud2b8\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."}), 404

    with open(json_path, 'r', encoding='utf-8') as f:
        project = json.load(f)

    html_path = os.path.join(projects_dir, f"{project_id}.html")
    if os.path.exists(html_path):
        with open(html_path, 'r', encoding='utf-8') as f:
            project["html"] = f.read()
        print(f"  [Load] {project_id}: read html from flat file ({len(project.get('html', ''))} chars)")
    else:
        project_dir = os.path.join(projects_dir, project_id)
        index_path = os.path.join(project_dir, "index.html")
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                project["html"] = f.read()
            print(f"  [Load] {project_id}: read html from dir/index.html ({len(project.get('html', ''))} chars)")
        else:
            print(f"  [Load] {project_id}: NO HTML FILE FOUND (flat={os.path.exists(html_path)}, dir/index={os.path.exists(index_path)})")

    print(f"  [Load] Response has 'html' key: {'html' in project}, truthy: {bool(project.get('html'))}")
    return jsonify(project)


@project_bp.route("/api/projects/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    projects_dir = get_projects_dir()
    json_path = os.path.join(projects_dir, f"{project_id}.json")
    html_path = os.path.join(projects_dir, f"{project_id}.html")

    deleted = False
    for path in [json_path, html_path]:
        if os.path.exists(path):
            print(f"  [Del]  {path}")
            os.remove(path)
            deleted = True

    project_dir = os.path.join(projects_dir, project_id)
    if os.path.exists(project_dir):
        print(f"  [Del]  {project_dir}/")
        shutil.rmtree(project_dir)
        deleted = True

    if not deleted:
        return jsonify({"error": "\ud504\ub85c\uc81d\ud2b8\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."}), 404

    return jsonify({"status": "success"})


@project_bp.route("/api/projects/<project_id>/delete_file", methods=["POST"])
def delete_project_file(project_id):
    data = request.json or {}
    filepath = data.get("path", "").replace("/", os.sep)

    if not filepath:
        return jsonify({"error": "파일 경로가 필요합니다."}), 400

    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    file_path = os.path.join(project_dir, filepath)
    abs_path = os.path.abspath(file_path)
    abs_proj = os.path.abspath(project_dir)

    if not abs_path.startswith(abs_proj):
        return jsonify({"error": "잘못된 경로입니다."}), 400
    if not os.path.exists(abs_path):
        return jsonify({"error": "파일을 찾을 수 없습니다."}), 404
    if os.path.isdir(abs_path):
        return jsonify({"error": "디렉토리는 삭제할 수 없습니다."}), 400

    os.remove(abs_path)
    print(f"  [DelFile] {filepath}")
    return jsonify({"status": "success"})


@project_bp.route("/api/projects/<project_id>/tree", methods=["GET"])
def project_tree(project_id):
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)

    is_generating = False
    json_path = os.path.join(projects_dir, f"{project_id}.json")
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            is_generating = meta.get("status") == "generating"
        except (json.JSONDecodeError, Exception):
            is_generating = False

    tree = []
    if os.path.exists(project_dir):
        for root, dirs, files in os.walk(project_dir):
            rel_root = os.path.relpath(root, project_dir)
            for d in sorted(dirs):
                rel_path = os.path.join(rel_root, d).replace(os.sep, "/") if rel_root != "." else d
                tree.append({"name": d, "path": rel_path, "type": "folder", "depth": rel_path.count("/")})
            for f in sorted(files):
                if f.startswith(".") and f.endswith(".gitkeep"):
                    continue
                rel_path = os.path.join(rel_root, f).replace(os.sep, "/") if rel_root != "." else f
                ext = os.path.splitext(f)[1].lower()
                pending = is_generating and f == "index.html"
                tree.append({"name": f, "path": rel_path, "type": "file", "ext": ext, "depth": rel_path.count("/"), "pending": pending})
    else:
        html_path = os.path.join(projects_dir, f"{project_id}.html")
        if os.path.exists(html_path):
            with open(html_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            images = re.findall(r'src=["\']([^"\']+)["\']', html_content)
            images = [img for img in images if not img.startswith("http") and not img.startswith("data:")]
            sections = re.findall(r'<section[^>]*id=["\']?([^"\'>]*)["\']?[^>]*>', html_content)

            tree.append({"name": "index.html", "path": "index.html", "type": "file", "ext": ".html", "depth": 0})
            for folder in ["assets", "assets/images", "pages"]:
                d = folder.count("/")
                tree.append({"name": folder.split("/")[-1], "path": folder, "type": "folder", "depth": d})

            for img in list(dict.fromkeys(images))[:10]:
                img_name = os.path.basename(img)
                tree.append({"name": img_name, "path": f"assets/images/{img_name}", "type": "file", "ext": os.path.splitext(img_name)[1].lower(), "depth": 2, "referenced": True})

            for sec in list(dict.fromkeys(sections))[:5]:
                if sec:
                    tree.append({"name": f"{sec}.html", "path": f"pages/{sec}.html", "type": "file", "ext": ".html", "depth": 1, "pending": True})

    return jsonify({"tree": tree})


@project_bp.route("/api/projects/<project_id>/save_file", methods=["POST"])
def save_project_file(project_id):
    data = request.json
    filepath = data.get("path", "").replace("/", os.sep)
    content = data.get("content", "")

    if not filepath:
        return jsonify({"error": "\ud30c\uc77c \uacbd\ub85c\uac00 \ud544\uc694\ud569\ub2c8\ub2e4."}), 400

    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    full_path = os.path.join(project_dir, filepath)
    abs_full = os.path.abspath(full_path)
    abs_proj = os.path.abspath(project_dir)

    if not abs_full.startswith(abs_proj):
        return jsonify({"error": "\ud5c8\uc6a9\ub418\uc9c0 \uc54a\uc740 \ud30c\uc77c \uacbd\ub85c\uc785\ub2c8\ub2e4."}), 403

    os.makedirs(os.path.dirname(abs_full), exist_ok=True)
    if filepath.endswith('.html'):
        content = ensure_complete_html(content)
    with open(abs_full, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  [File] {abs_full}")

    # CSS/JS는 HTML에 인라인으로 유지 (분리하지 않음)

    if filepath.startswith("pages") and filepath.endswith(".html"):
        json_path = os.path.join(projects_dir, f"{project_id}.json")
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                pages = meta.get("pages", [])
                if filepath not in pages:
                    pages.append(filepath)
                    meta["pages"] = pages
                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(meta, f, ensure_ascii=False, indent=2)
                    print(f"  [Meta] pages +{filepath}")
            except (json.JSONDecodeError, IOError):
                pass

    return jsonify({"status": "ok", "path": filepath})


@project_bp.route("/api/projects/<project_id>/save_multipage", methods=["POST"])
def save_multipage_project(project_id):
    data = request.json
    pages = data.get("pages", {})
    title = data.get("title", "\uc81c\ubaa9 \uc5c6\uc74c")
    page_type = data.get("page_type", "")
    template = data.get("template", "")
    history = data.get("history", [])
    design_content = data.get("design_content", "")
    menu_items = data.get("menu_items", [])
    design_system = data.get("design_system", None)

    if not pages:
        return jsonify({"error": "\ud398\uc774\uc9c0 \ub370\uc774\ud130\uac00 \ud544\uc694\ud569\ub2c8\ub2e4."}), 400

    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    os.makedirs(project_dir, exist_ok=True)

    for subdir in ["assets/images", "pages"]:
        os.makedirs(os.path.join(project_dir, subdir), exist_ok=True)

    saved_files = []
    for file_path, html in pages.items():
        html = ensure_complete_html(html)
        full_path = os.path.join(project_dir, file_path)
        abs_full = os.path.abspath(full_path)
        abs_proj = os.path.abspath(project_dir)
        if not abs_full.startswith(abs_proj):
            continue
        os.makedirs(os.path.dirname(abs_full), exist_ok=True)
        with open(abs_full, 'w', encoding='utf-8') as f:
            f.write(html)
        saved_files.append(file_path)
        print(f"  [File] {abs_full}")

    # CSS/JS는 HTML에 인라인으로 유지 (분리하지 않음)
    index_html = pages.get("index.html", "")
    if index_html:
        projects_dir_for_html = get_projects_dir()
        html_path = os.path.join(projects_dir_for_html, f"{project_id}.html")
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(index_html)

    pages_dir = os.path.join(project_dir, "pages")
    disk_pages = []
    if os.path.exists(pages_dir):
        for fname in sorted(os.listdir(pages_dir)):
            if fname.endswith(".html"):
                disk_pages.append(os.path.join("pages", fname).replace(os.sep, "/"))

    all_pages = list(dict.fromkeys(saved_files + disk_pages))

    project_data = {
        "id": project_id,
        "title": title,
        "page_type": page_type,
        "template": template,
        "history": history,
        "design_content": design_content,
        "design_system": design_system,
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
        "updated_at": time.strftime("%Y-%m-%d %H:%M"),
        "status": "completed",
        "multi_page": True,
        "menu_items": menu_items,
        "pages": all_pages
    }
    json_path = os.path.join(projects_dir, f"{project_id}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(project_data, f, ensure_ascii=False, indent=2)

    print(f"\n[Save-MultiPage] {len(saved_files)} pages saved: {saved_files}\n")
    return jsonify({"status": "success", "id": project_id, "files": saved_files})


@project_bp.route("/api/projects/<project_id>/read_file", methods=["GET"])
def read_project_file(project_id):
    filepath = request.args.get("path", "").replace("/", os.sep)
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    full_path = os.path.join(project_dir, filepath)

    if not os.path.abspath(full_path).startswith(os.path.abspath(project_dir)):
        return jsonify({"error": "\uc798\ubabb\ub41c \uacbd\ub85c\uc785\ub2c8\ub2e4."}), 400
    if not os.path.exists(full_path):
        return jsonify({"error": "\ud30c\uc77c\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."}), 404

    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return jsonify({"path": filepath, "content": content})


@project_bp.route("/api/projects/<project_id>/upload_image", methods=["POST"])
def upload_project_image(project_id):
    if 'image' not in request.files:
        return jsonify({"error": "\uc774\ubbf8\uc9c0 \ud30c\uc77c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4."}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "\ud30c\uc77c\uc774 \uc120\ud0dd\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4."}), 400

    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    images_dir = os.path.join(project_dir, "assets", "images")
    os.makedirs(images_dir, exist_ok=True)

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'):
        return jsonify({"error": "\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uc774\ubbf8\uc9c0 \ud615\uc2dd\uc785\ub2c8\ub2e4."}), 400

    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    save_path = os.path.join(images_dir, filename)
    file.save(save_path)

    image_url = f"/api/projects/{project_id}/assets/images/{filename}"
    print(f"  [Image] \uc5c5\ub85c\ub4dc: {save_path}")
    return jsonify({"url": image_url, "path": f"assets/images/{filename}"})


@project_bp.route("/api/projects/<project_id>/assets/<path:filename>")
def serve_project_asset(project_id, filename):
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)
    file_path = os.path.join(project_dir, "assets", filename)
    abs_path = os.path.abspath(file_path)
    abs_proj = os.path.abspath(project_dir)

    if not abs_path.startswith(abs_proj):
        return jsonify({"error": "\uc798\ubabb\ub41c \uacbd\ub85c\uc785\ub2c8\ub2e4."}), 400
    if not os.path.exists(abs_path):
        return jsonify({"error": "\ud30c\uc77c\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."}), 404

    return send_file(abs_path)


@project_bp.route("/api/projects/<project_id>/export", methods=["GET"])
def export_project(project_id):
    projects_dir = get_projects_dir()
    project_dir = os.path.join(projects_dir, project_id)

    if not os.path.exists(project_dir):
        html_path = os.path.join(projects_dir, f"{project_id}.html")
        if not os.path.exists(html_path):
            return jsonify({"error": "\ud504\ub85c\uc81d\ud2b8\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."}), 404

        print(f"\n[Export] \ud504\ub85c\uc81d\ud2b8 \ub0b4\ubcf4\ub0b4\uae30: {project_id}.zip")
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            with open(html_path, 'r', encoding='utf-8') as f:
                zf.writestr("index.html", f.read())
            for d in ["assets/images/.gitkeep", "pages/.gitkeep"]:
                zf.writestr(d, "")

        zip_buffer.seek(0)
        return send_file(zip_buffer, mimetype='application/zip', as_attachment=True, download_name=f"{project_id}.zip")

    print(f"\n[Export] \ud504\ub85c\uc81d\ud2b8 \ub0b4\ubcf4\ub0b4\uae30: {project_id}.zip")
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(project_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, project_dir)
                zf.write(file_path, arcname)

    zip_buffer.seek(0)
    return send_file(zip_buffer, mimetype='application/zip', as_attachment=True, download_name=f"{project_id}.zip")
