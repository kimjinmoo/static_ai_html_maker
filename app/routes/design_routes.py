import os
import urllib.request
import re
import json
from flask import Blueprint, request, jsonify

from app.utils import get_projects_dir


design_bp = Blueprint("design", __name__)


@design_bp.route("/api/generate_design_from_url", methods=["POST"])
def generate_design_from_url():
    data = request.json
    url = data.get("url", "")

    if not url:
        return jsonify({"status": "error", "error": "URL\uc744 \uc785\ub825\ud574\uc8fc\uc138\uc694."}), 400

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
        })
        with urllib.request.urlopen(req, timeout=15) as response:
            html_content = response.read().decode('utf-8', errors='ignore')

        colors = re.findall(r'#[0-9a-fA-F]{6}\b', html_content)
        fonts = re.findall(r"font-family:\s*'([^']+)'", html_content)
        fonts += re.findall(r'font-family:\s"([^"]+)"', html_content)
        css_vars = re.findall(r'--[\w-]+:\s*([^;]+);', html_content)

        unique_colors = list(dict.fromkeys(colors))[:8]
        unique_fonts = list(dict.fromkeys([f.strip() for f in fonts]))[:4]
        bg_match = re.search(r'background(?:-color)?:\s*(#[0-9a-fA-F]{6}|white|#[fF]{6})', html_content)
        text_match = re.search(r'color:\s*(#[0-9a-fA-F]{6}|black|#[0-9a-fA-F]{3})', html_content)

        design_content = "# Design Token - URL \uae30\ubc18 \ubd84\uc11d\n\n"
        design_content += f"## Source URL\n- {url}\n\n"
        design_content += "## Color Palette\n"
        for i, c in enumerate(unique_colors[:6]):
            labels = ['Primary', 'Secondary', 'Accent', 'Background', 'Surface', 'Text']
            label = labels[i] if i < len(labels) else f'Color {i+1}'
            design_content += f"- {label}: `{c}`\n"
        if bg_match:
            design_content += f"- Background (detected): `{bg_match.group(1)}`\n"
        if text_match:
            design_content += f"- Text (detected): `{text_match.group(1)}`\n"

        design_content += "\n## Typography\n"
        if unique_fonts:
            design_content += f"- Heading Font: `{unique_fonts[0]}`\n"
            if len(unique_fonts) > 1:
                design_content += f"- Body Font: `{unique_fonts[1]}`\n"
        else:
            design_content += "- Font Family: system-ui, sans-serif\n"
        design_content += "- H1: 48px / 700 / 1.1\n- Body: 16px / 400 / 1.6\n"
        design_content += "\n## Style Notes\n- \uc704 URL\uc758 \ub514\uc790\uc778\uc744 \ucc38\uace0\ud558\uc5ec \ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud558\uc138\uc694.\n- \uac10\uc9c0\ub41c \uceec\ub7ec\uc640 \ud3f0\ud2b8\ub97c \ud65c\uc6a9\ud558\uc5ec \uc77c\uad00\ub41c \ub514\uc790\uc778\uc744 \uc801\uc6a9\ud558\uc138\uc694.\n"

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        design_dir = os.path.join(base_dir, "models", "custom_designs")
        os.makedirs(design_dir, exist_ok=True)
        design_path = os.path.join(design_dir, "custom_design.md")
        with open(design_path, 'w', encoding='utf-8') as f:
            f.write(design_content)

        return jsonify({"status": "success", "design": design_content, "path": design_path})
    except Exception as e:
        return jsonify({"status": "error", "error": f"URL \ubd84\uc11d \uc2e4\ud328: {str(e)}"}), 500


@design_bp.route("/api/design_template/<template_name>", methods=["GET"])
def get_design_template(template_name):
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    template_dir = os.path.join(base_dir, "templates", "designs")
    template_path = os.path.join(template_dir, f"{template_name}.md")

    if not os.path.exists(template_path):
        return jsonify({"error": f"\ud15c\ud50c\ub9bf\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4: {template_name}"}), 404

    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()

    return jsonify({"name": template_name, "content": content})


@design_bp.route("/api/design_templates", methods=["GET"])
def list_design_templates():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    template_dir = os.path.join(base_dir, "templates", "designs")
    templates = []

    if os.path.exists(template_dir):
        for filename in os.listdir(template_dir):
            if filename.endswith('.md'):
                name = filename[:-3]
                filepath = os.path.join(template_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                title = content.split('\n')[0].replace('# ', '') if content else name
                templates.append({"name": name, "title": title, "preview": content[:200] + "..." if len(content) > 200 else content})

    return jsonify({"templates": templates})
