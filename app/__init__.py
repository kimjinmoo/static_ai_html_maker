import os
from flask import Flask

from app.routes.main import main_bp
from app.routes.model_routes import model_bp
from app.routes.project_routes import project_bp
from app.routes.design_routes import design_bp


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

    from app.vulkan import auto_detect_vulkan_sdk
    auto_detect_vulkan_sdk()

    return flask_app


app = create_app()
