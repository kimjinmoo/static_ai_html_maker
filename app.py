import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

from app import app
from app.config import PORT

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, debug=True, use_reloader=False)
