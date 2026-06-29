import json
import os

import app.routes.project_routes as pr


def test_save_persists_design_system(monkeypatch, tmp_path):
    monkeypatch.setattr(pr, "get_projects_dir", lambda: str(tmp_path))

    flask_app = __import__("app", fromlist=["create_app"]).create_app()
    client = flask_app.test_client()

    ds = {"template": "bold_modern", "page_type": "landing",
          "design_content": "primary=#abc", "scaffold_css": ".x{}",
          "brand": "ACME", "menu_items": ["홈"]}
    resp = client.post("/api/projects", json={
        "id": "proj1", "title": "T", "page_type": "landing",
        "template": "bold_modern", "html": "<!DOCTYPE html><html><body><p>x</p></body></html>",
        "history": [], "design_content": "primary=#abc", "design_system": ds,
    })
    assert resp.status_code == 200

    with open(os.path.join(tmp_path, "proj1.json"), encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["design_system"]["template"] == "bold_modern"
    assert saved["design_system"]["scaffold_css"] == ".x{}"
