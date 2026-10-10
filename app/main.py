"""Flask 应用入口：提供静态页面与 QBT 推送 API。"""
import re

from flask import Flask, jsonify, request, send_from_directory

from .config import DEFAULT_CONFIG, load_config, save_config
from .qbt_client import QBTClient

app = Flask(__name__, static_folder="static", static_url_path="")

MAGNET_RE = re.compile(r"^magnet:\?xt=urn:btih:", re.IGNORECASE)
URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def is_valid_link(link):
    return bool(MAGNET_RE.match(link) or URL_RE.match(link))


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/settings", methods=["GET"])
def get_settings():
    cfg = load_config()
    out = {k: v for k, v in cfg.items() if k != "qbt_password"}
    out["qbt_password"] = "******" if cfg.get("qbt_password") else ""
    return jsonify({"ok": True, "data": out})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    body = request.get_json(silent=True) or {}
    old = load_config()
    cfg = dict(old)
    for key in ("qbt_host", "qbt_username", "save_path"):
        if key in body:
            cfg[key] = body[key]
    if "download_limit" in body:
        try:
            cfg["download_limit"] = int(body["download_limit"])
        except (TypeError, ValueError):
            cfg["download_limit"] = 0
    # 密码为掩码时保留旧值
    pwd = body.get("qbt_password")
    if pwd is not None and pwd != "******":
        cfg["qbt_password"] = pwd
    save_config(cfg)
    return jsonify({"ok": True, "message": "配置已保存"})


@app.route("/api/qbt/test", methods=["POST"])
def test_qbt():
    body = request.get_json(silent=True) or {}
    saved = load_config()
    host = body.get("qbt_host") or saved.get("qbt_host", "")
    user = body.get("qbt_username") or saved.get("qbt_username", "")
    pwd = body.get("qbt_password") or saved.get("qbt_password", "")
    if pwd == "******":
        pwd = saved.get("qbt_password", "")
    client = QBTClient(host, user, pwd)
    ok, msg = client.test_connection()
    return jsonify({"ok": ok, "message": msg})


@app.route("/api/torrent/add", methods=["POST"])
def add_torrent():
    body = request.get_json(silent=True) or {}
    link = (body.get("link") or "").strip()
    if not link:
        return jsonify({"ok": False, "message": "链接不能为空"})
    # 支持粘贴时混入换行的多链接，逐行校验
    lines = [l.strip() for l in re.split(r"[\r\n]+", link) if l.strip()]
    if not lines:
        return jsonify({"ok": False, "message": "链接不能为空"})
    invalid = [l for l in lines if not is_valid_link(l)]
    if invalid:
        return jsonify({"ok": False, "message": "存在无效链接，请输入磁力链接或 http(s) 种子URL"})
    cfg = load_config()
    client = QBTClient(cfg["qbt_host"], cfg["qbt_username"], cfg["qbt_password"])
    joined = "\n".join(lines)
    ok, msg = client.add_torrent(
        joined,
        save_path=cfg.get("save_path") or None,
        download_limit=cfg.get("download_limit"),
    )
    return jsonify({"ok": ok, "message": msg})


@app.route("/api/torrents", methods=["GET"])
def list_torrents():
    """获取 QBT 当前下载任务列表与进度。"""
    cfg = load_config()
    client = QBTClient(cfg["qbt_host"], cfg["qbt_username"], cfg["qbt_password"])
    ok, data = client.get_torrents()
    return jsonify({"ok": ok, "data": data, "message": "" if ok else data})


def _client_from_config():
    cfg = load_config()
    return QBTClient(cfg["qbt_host"], cfg["qbt_username"], cfg["qbt_password"])


@app.route("/api/torrents/pause", methods=["POST"])
def pause_torrent():
    body = request.get_json(silent=True) or {}
    h = (body.get("hash") or "").strip()
    if not h:
        return jsonify({"ok": False, "message": "缺少任务 hash"})
    ok, msg = _client_from_config().pause(h)
    return jsonify({"ok": ok, "message": msg})


@app.route("/api/torrents/resume", methods=["POST"])
def resume_torrent():
    body = request.get_json(silent=True) or {}
    h = (body.get("hash") or "").strip()
    if not h:
        return jsonify({"ok": False, "message": "缺少任务 hash"})
    ok, msg = _client_from_config().resume(h)
    return jsonify({"ok": ok, "message": msg})


@app.route("/api/torrents/delete", methods=["POST"])
def delete_torrent():
    body = request.get_json(silent=True) or {}
    h = (body.get("hash") or "").strip()
    if not h:
        return jsonify({"ok": False, "message": "缺少任务 hash"})
    delete_files = bool(body.get("delete_files"))
    ok, msg = _client_from_config().delete(h, delete_files=delete_files)
    return jsonify({"ok": ok, "message": msg})


@app.route("/api/sites", methods=["GET"])
def get_sites():
    cfg = load_config()
    return jsonify({"ok": True, "data": cfg.get("sites", [])})


@app.route("/api/sites", methods=["POST"])
def upsert_site():
    body = request.get_json(silent=True) or {}
    cfg = load_config()
    sites = list(cfg.get("sites", []))
    name = (body.get("name") or "").strip()
    url = (body.get("url") or "").strip()
    desc = (body.get("desc") or "").strip()
    idx = body.get("id")
    if not name or not url:
        return jsonify({"ok": False, "message": "名称和URL不能为空"})
    item = {"name": name, "url": url, "desc": desc}
    if isinstance(idx, int) and 0 <= idx < len(sites):
        sites[idx] = item
    else:
        sites.append(item)
    cfg["sites"] = sites
    save_config(cfg)
    return jsonify({"ok": True, "data": sites})


@app.route("/api/sites/<int:idx>", methods=["DELETE"])
def delete_site(idx):
    cfg = load_config()
    sites = list(cfg.get("sites", []))
    if 0 <= idx < len(sites):
        sites.pop(idx)
    cfg["sites"] = sites
    save_config(cfg)
    return jsonify({"ok": True, "data": sites})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
