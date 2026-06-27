import os
import sys
import threading
import time
import webview

from app import app


def run_flask(port=5080):
    app.run(host="127.0.0.1", port=port, debug=False)


def wait_for_server(port, timeout=30):
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}", timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def main():
    port = int(os.environ.get("PORT", 5080))

    flask_thread = threading.Thread(target=run_flask, args=(port,), daemon=True)
    flask_thread.start()

    if not wait_for_server(port):
        print("서버 시작 실패")
        sys.exit(1)

    print(f"WebGen AI 실행 중: http://127.0.0.1:{port}")

    webview.create_window(
        "WebGen AI - 홈페이지 마법사",
        f"http://127.0.0.1:{port}",
        width=1400,
        height=900,
        min_size=(1000, 600),
    )
    webview.start()


if __name__ == "__main__":
    main()
