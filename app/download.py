import os
import json
import threading
import time
import urllib.request
from flask import Response
from huggingface_hub import hf_hub_url

from app.config import DEFAULT_MODEL, DEFAULT_MODEL_REPO
from app.utils import find_model_file


download_status = {
    "downloading": False,
    "progress": 0,
    "downloaded_mb": 0,
    "total_mb": 0,
    "speed": ""
}
download_lock = threading.Lock()


def download_model_stream(repo_id, filename):
    def generate():
        import time
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            model_dir = os.path.join(base_dir, "models")
            os.makedirs(model_dir, exist_ok=True)

            with download_lock:
                download_status["downloading"] = True
                download_status["progress"] = 0
                download_status["downloaded_mb"] = 0
                download_status["total_mb"] = 0
                download_status["speed"] = ""
                download_status["error"] = ""

            download_start_time = time.time()

            def run_download():
                try:
                    url = hf_hub_url(repo_id=repo_id, filename=filename)
                    tmp_path = os.path.join(model_dir, filename + ".part")
                    final_path = os.path.join(model_dir, filename)

                    req = urllib.request.Request(url)
                    req.add_header("User-Agent", "WebGenAI/1.0")
                    with urllib.request.urlopen(req, timeout=300) as resp:
                        total = int(resp.headers.get("Content-Length", 0))
                        with download_lock:
                            download_status["total_mb"] = round(total / (1024 * 1024), 1)

                        downloaded = 0
                        chunk_size = 8 * 1024 * 1024
                        with open(tmp_path, "wb") as f:
                            while True:
                                chunk = resp.read(chunk_size)
                                if not chunk:
                                    break
                                f.write(chunk)
                                downloaded += len(chunk)
                                progress = (downloaded / total * 100) if total > 0 else 0
                                with download_lock:
                                    download_status["progress"] = round(progress, 1)
                                    download_status["downloaded_mb"] = round(downloaded / (1024 * 1024), 1)
                                    elapsed = time.time() - download_start_time
                                    if elapsed > 0:
                                        speed = (downloaded / elapsed) / (1024 * 1024)
                                        download_status["speed"] = f"{speed:.1f} MB/s"

                    os.rename(tmp_path, final_path)
                    with download_lock:
                        download_status["progress"] = 100
                        download_status["downloading"] = False
                except Exception as e:
                    with download_lock:
                        download_status["downloading"] = False
                        download_status["error"] = str(e)
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass

            thread = threading.Thread(target=run_download, daemon=True)
            thread.start()

            last_progress = -1
            while True:
                with download_lock:
                    current_progress = download_status["progress"]
                    downloading = download_status["downloading"]
                    error = download_status.get("error", "")
                    speed = download_status.get("speed", "")
                    downloaded_mb = download_status.get("downloaded_mb", 0)
                    total_mb = download_status.get("total_mb", 0)

                if current_progress != last_progress:
                    pkt = {"progress": current_progress}
                    if speed:
                        pkt["speed"] = speed
                    if total_mb:
                        pkt["speed"] = f"{downloaded_mb:.1f} / {total_mb:.1f} MB ({speed})" if speed else f"{downloaded_mb:.1f} / {total_mb:.1f} MB"
                    yield f"data: {json.dumps(pkt)}\n\n"
                    last_progress = current_progress

                if current_progress == 100:
                    yield f"data: {json.dumps({'status': 'complete', 'progress': 100, 'model': filename})}\n\n"
                    break
                if error:
                    yield f"data: {json.dumps({'status': 'error', 'error': error})}\n\n"
                    break
                if not downloading and current_progress == 0:
                    yield f"data: {json.dumps({'status': 'error', 'error': '\ub2e4\uc6b4\ub85c\ub4dc \uc911\ub2e8'})}\n\n"
                    break

                time.sleep(0.5)

        except Exception as e:
            with download_lock:
                download_status["downloading"] = False
            yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

    return Response(generate(), mimetype="text/event-stream")
