#!/bin/sh
# =============================================================
# 种子推送 QBT 下载网站 —— NAS 一键部署脚本
# 兼容群晖 / 威联通 / 绿联 / 飞牛等所有带 Docker 的 NAS（SSH 执行）
#
# 用法:
#   sh install.sh          # 正常部署（官方源）
#   sh install.sh --cn     # 国内网络优化（基础镜像/pip 走国内源）
# =============================================================
set -e

# ---------- 国内源参数 ----------
PYTHON_IMAGE="python:3.12-alpine"
PIP_INDEX_URL="https://pypi.org/simple"
for arg in "$@"; do
  if [ "$arg" = "--cn" ]; then
    PYTHON_IMAGE="docker.m.daocloud.io/library/python:3.12-alpine"
    PIP_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"
    echo "==> 已启用国内镜像源加速"
  fi
done

# ---------- 1. 检查 Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未检测到 Docker，请先在 NAS 套件中心安装 Docker / Container Manager"
  exit 1
fi

# ---------- 2. 兼容新版/旧版 compose 命令 ----------
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "[错误] 未检测到 Docker Compose，请更新 NAS 的 Docker 套件"
  exit 1
fi

# ---------- 3. 文件完整性检查（防止上传不全导致构建失败） ----------
echo "==> 检查项目文件完整性..."
MISSING=0
for f in Dockerfile requirements.txt docker-compose.yml app/main.py app/qbt_client.py app/config.py app/static/index.html app/static/app.js app/static/style.css; do
  if [ ! -f "$f" ]; then
    echo "    缺少: $f"
    MISSING=1
  fi
done
if [ "$MISSING" = "1" ]; then
  echo "[错误] 项目文件不完整！请上传完整项目目录，或执行:"
  echo "       git clone https://github.com/alansong49/qbt-push.git"
  exit 1
fi
echo "    文件完整"

# ---------- 4. 构建并启动 ----------
echo "==> 构建镜像并启动容器（首次构建需 1-3 分钟）..."
PYTHON_IMAGE="$PYTHON_IMAGE" PIP_INDEX_URL="$PIP_INDEX_URL" $COMPOSE up -d --build

echo ""
echo "============================================"
echo "  部署完成！"
echo "  访问: http://<NAS局域网IP>:5000"
echo "  首次使用: 右上角设置 -> 填写 QBT 参数 -> 测试连接 -> 保存"
echo "============================================"
