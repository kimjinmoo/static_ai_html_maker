import os
import sys
import builtins
from flask import Flask

from app.routes.main import main_bp
from app.routes.model_routes import model_bp
from app.routes.project_routes import project_bp
from app.routes.design_routes import design_bp

# Patch print to always go to stderr + log file
_log_file = None
_original_print = builtins.print


def _ensure_log():
    global _log_file
    if _log_file is None:
        try:
            base = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
            d = os.path.join(base, "logs")
            os.makedirs(d, exist_ok=True)
            _log_file = open(os.path.join(d, "webgen.log"), "a", encoding="utf-8")
        except Exception:
            pass


def _patched_print(*args, **kwargs):
    kwargs.setdefault("file", sys.stderr)
    kwargs.setdefault("flush", True)
    _original_print(*args, **kwargs)
    _ensure_log()
    if _log_file:
        try:
            _log_file.write(" ".join(str(a) for a in args) + "\n")
            _log_file.flush()
        except Exception:
            pass


builtins.print = _patched_print


def create_app():
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    flask_app = Flask(
        __name__,
        template_folder=os.path.join(_root, "templates"),
        static_folder=os.path.join(_root, "static"),
        static_url_path="/static",
    )

    flask_app.register_blueprint(main_bp)
    flask_app.register_blueprint(model_bp)
    flask_app.register_blueprint(project_bp)
    flask_app.register_blueprint(design_bp)

    from app.routes.stream_routes import stream_bp
    flask_app.register_blueprint(stream_bp)

    from app.routes.settings_routes import settings_bp
    flask_app.register_blueprint(settings_bp)

    from app.routes.edit_routes import edit_bp
    flask_app.register_blueprint(edit_bp)

    from app.vulkan import auto_detect_vulkan_sdk
    auto_detect_vulkan_sdk()

    return flask_app


app = create_app()
