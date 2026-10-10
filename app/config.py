"""配置持久化管理。

所有 QBT 绑定参数与推荐站点均保存为 JSON 文件，
挂载到 Docker 卷后可保证容器重启/更新/重建后配置不丢失。
"""
import json
import os
import threading
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("CONFIG_DIR", "/app/data"))
CONFIG_FILE = CONFIG_DIR / "config.json"

_lock = threading.Lock()

DEFAULT_CONFIG = {
    "qbt_host": "http://127.0.0.1:18580",
    "qbt_username": "admin",
    "qbt_password": "adminadmin",
    "save_path": "",
    "download_limit": 0,
    "sites": [
        {
            "name": "Seeduck",
            "url": "https://seeduck.cc/",
            "desc": "种子搜索引擎，磁力资源快速检索"
        },
        {
            "name": "Knaben",
            "url": "https://knaben.org/",
            "search": "https://knaben.org/search/{q}",
            "desc": "聚合多站资源的元搜索引擎"
        },
        {
            "name": "LimeTorrents",
            "url": "https://www.limetorrents.fun/",
            "search": "https://www.limetorrents.fun/search/all/{q}/",
            "desc": "老牌综合 BT 站，影视资源丰富"
        },
        {
            "name": "The Pirate Bay",
            "url": "https://thepiratebay.org/",
            "search": "https://thepiratebay.org/search/{q}/0/99/0",
            "desc": "全球最知名的老牌 BT 资源站"
        },
        {
            "name": "YTS",
            "url": "https://yts.gg/",
            "search": "https://yts.gg/browse-movies/{q}/all/all/0/latest",
            "desc": "高清电影站，体积小画质优"
        },
        {
            "name": "Zamunda",
            "url": "https://zamunda.life/",
            "desc": "综合种子资源站，分类齐全"
        }
    ]
}


def ensure_config_file():
    """确保配置目录与文件存在，不存在则写入默认配置。"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=2)


def load_config():
    """读取配置，失败时返回默认配置。"""
    ensure_config_file()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        # 合并默认值，保证新增字段兼容
        merged = dict(DEFAULT_CONFIG)
        merged.update(cfg)
        return merged
    except Exception:
        return dict(DEFAULT_CONFIG)


def save_config(cfg):
    """原子写入配置，避免并发写入导致文件损坏。"""
    with _lock:
        ensure_config_file()
        tmp = CONFIG_FILE.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        os.replace(tmp, CONFIG_FILE)
