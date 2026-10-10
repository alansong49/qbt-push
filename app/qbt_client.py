"""qBittorrent Web API v2 客户端。

仅使用官方 API：
  - POST /api/v2/auth/login        登录获取 SID
  - POST /api/v2/torrents/add      添加种子/磁力/URL
  - GET  /api/v2/torrents/info     获取任务列表与进度
  - POST /api/v2/torrents/pause    暂停任务
  - POST /api/v2/torrents/resume   继续任务
  - POST /api/v2/torrents/delete   删除任务
"""
import re
from urllib.parse import urljoin

import requests

MAGNET_HASH_RE = re.compile(r"xt=urn:btih:([a-zA-Z0-9]{32,40})", re.IGNORECASE)


class QBTClient:
    def __init__(self, host, username, password, timeout=10):
        self.base = (host or "").rstrip("/")
        self.username = username or ""
        self.password = password or ""
        self.timeout = timeout

    def _api(self, path):
        return urljoin(self.base + "/", "api/v2/" + path.lstrip("/"))

    def _login(self, session):
        """登录并返回是否成功。"""
        r = session.post(
            self._api("auth/login"),
            data={"username": self.username, "password": self.password},
            timeout=self.timeout,
        )
        return r.status_code == 200 and r.text.strip() == "Ok."

    def test_connection(self):
        """测试 QBT 连接，返回 (ok, message)。"""
        try:
            s = requests.Session()
            if self._login(s):
                return True, "QBT连接正常"
            return False, "连接失败：账号或密码错误"
        except requests.exceptions.ConnectionError:
            return False, "连接失败：无法访问QBT服务，请检查地址/端口或服务是否启动"
        except requests.exceptions.Timeout:
            return False, "连接失败：请求超时，请检查网络"
        except Exception as e:
            return False, f"连接失败：{e}"

    def add_torrent(self, urls, save_path=None, download_limit=None):
        """添加种子/磁力/URL 到 QBT，返回 (ok, message)。"""
        try:
            s = requests.Session()
            if not self._login(s):
                return False, "登录QBT失败，请检查账号密码"
            data = {"urls": urls}
            if save_path:
                data["savepath"] = save_path
            if download_limit and int(download_limit) > 0:
                # QBT 限速单位为字节/秒，前端按 KB/s 输入
                data["dlLimit"] = str(int(download_limit) * 1024)
            r = s.post(self._api("torrents/add"), data=data, timeout=self.timeout)
            if r.status_code == 200 and r.text.strip() == "Ok.":
                return True, "已成功添加到QBT下载列表"
            # QBT 对重复添加返回 Fails.，此时检查任务是否已存在
            if r.status_code == 200 and r.text.strip() == "Fails.":
                hashes = [m.group(1).lower() for m in MAGNET_HASH_RE.finditer(urls)]
                if hashes:
                    try:
                        r2 = s.get(self._api("torrents/info"), timeout=self.timeout)
                        existing = {t.get("hash", "").lower() for t in r2.json()}
                        if all(h in existing for h in hashes):
                            return True, "该任务已存在于QBT列表，无需重复添加"
                        if any(h in existing for h in hashes):
                            return True, "任务已存在（重复部分已跳过），未新增内容"
                    except Exception:
                        pass
                return False, "添加失败：QBT拒绝了该链接，请确认链接有效且未与现有任务重复"
            return False, f"添加失败：{r.text.strip() or ('HTTP ' + str(r.status_code))}"
        except requests.exceptions.ConnectionError:
            return False, "QBT服务无法连接，请检查地址端口或服务状态"
        except requests.exceptions.Timeout:
            return False, "请求超时，请检查网络"
        except Exception as e:
            return False, f"添加失败：{e}"

    # QBT 任务状态码映射
    STATE_MAP = {
        "error": "出错",
        "missingFiles": "文件缺失",
        "uploading": "做种中",
        "pausedUP": "暂停-已完成",
        "queuedUP": "排队-做种",
        "stalledUP": "等待-做种",
        "checkingUP": "校验中",
        "forcedUP": "强制做种",
        "allocating": "分配空间",
        "downloading": "下载中",
        "metaDL": "获取元数据",
        "pausedDL": "已暂停",
        "queuedDL": "排队中",
        "stalledDL": "等待下载",
        "checkingDL": "校验中",
        "forcedDL": "强制下载",
        "checkingResumeData": "校验恢复数据",
        "moving": "移动中",
    }

    def get_torrents(self):
        """获取 QBT 下载任务列表，返回 (ok, data_or_message)。

        data 为精简后的任务列表，每项包含：
          name, progress(0~1), state(中文), size, downloaded,
          dlspeed, upspeed, eta, save_path
        """
        try:
            s = requests.Session()
            if not self._login(s):
                return False, "登录QBT失败，请检查账号密码"
            r = s.get(self._api("torrents/info"), timeout=self.timeout)
            if r.status_code != 200:
                return False, f"获取任务列表失败：HTTP {r.status_code}"
            items = r.json()
            result = []
            for t in items:
                raw_state = t.get("state", "")
                result.append({
                    "name": t.get("name", ""),
                    "progress": round(t.get("progress", 0), 4),
                    "state": self.STATE_MAP.get(raw_state, raw_state or "未知"),
                    "raw_state": raw_state,
                    "size": t.get("size", 0),
                    "downloaded": t.get("downloaded", 0),
                    "dlspeed": t.get("dlspeed", 0),
                    "upspeed": t.get("upspeed", 0),
                    "eta": t.get("eta", 0),
                    "save_path": t.get("save_path", ""),
                    "hash": t.get("hash", ""),
                    "num_seeds": t.get("num_seeds", 0),       # 已连接做种者
                    "num_leechs": t.get("num_leechs", 0),     # 已连接下载节点
                    "num_complete": t.get("num_complete", 0), # 全网可用做种者
                    "num_incomplete": t.get("num_incomplete", 0),
                })
            # 按进度升序，未完成的排前面
            result.sort(key=lambda x: x["progress"])
            return True, result
        except requests.exceptions.ConnectionError:
            return False, "QBT服务无法连接"
        except requests.exceptions.Timeout:
            return False, "请求超时，请检查网络"
        except Exception as e:
            return False, f"获取任务列表失败：{e}"

    def pause(self, hashes):
        """暂停任务，hashes 为 hash 字符串（多个用 | 分隔）。"""
        return self._action("torrents/pause", {"hashes": hashes}, "任务已暂停")

    def resume(self, hashes):
        """继续任务。"""
        return self._action("torrents/resume", {"hashes": hashes}, "任务已继续")

    def delete(self, hashes, delete_files=False):
        """删除任务，delete_files=True 时同时删除下载文件。"""
        msg = "任务已删除（文件保留）" if not delete_files else "任务及文件已删除"
        return self._action(
            "torrents/delete",
            {"hashes": hashes, "deleteFiles": "true" if delete_files else "false"},
            msg,
        )

    def _action(self, path, data, success_msg):
        """通用任务操作。"""
        try:
            s = requests.Session()
            if not self._login(s):
                return False, "登录QBT失败，请检查账号密码"
            r = s.post(self._api(path), data=data, timeout=self.timeout)
            if r.status_code == 200:
                return True, success_msg
            return False, f"操作失败：HTTP {r.status_code}"
        except requests.exceptions.ConnectionError:
            return False, "QBT服务无法连接，请检查地址端口或服务状态"
        except requests.exceptions.Timeout:
            return False, "请求超时，请检查网络"
        except Exception as e:
            return False, f"操作失败：{e}"
