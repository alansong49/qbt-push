#!/bin/sh
# =============================================================
# 种子推送 QBT 下载网站 —— NAS 一键部署脚本
# 兼容群晖 / 威联通 / 绿联 / 飞牛等所有带 Docker 的 NAS（SSH 执行）
#
# 用法:
#   sh install.sh            # 默认：国内代理拉取 Docker Hub 镜像（最快，推荐）
#   sh install.sh --hub      # 直连 Docker Hub 拉取
#   sh install.sh --ghcr     # 走 GHCR（国内代理）
#   sh install.sh --build    # 本地构建模式（NAS 自己构建镜像）
#   sh install.sh --build --cn   # 本地构建 + 国内源加速
# =============================================================
set -e

# Docker Hub 镜像（国内代理生态最成熟，NAS 可秒拉）
IMAGE="docker.1ms.run/jockersilas/qbt-push:latest"
IMAGE_HUB="jockersilas/qbt-push:latest"
IMAGE_GHCR="docker.m.daocloud.io/ghcr.io/alansong49/qbt-push:latest"

print_done() {
  echo ""
  echo "============================================"
  echo "  部署完成！"
  echo "  访问: http://<NAS局域网IP>:5000"
  echo "  首次使用: 右上角设置 -> 填写 QBT 参数 -> 测试连接 -> 保存"
  echo "============================================"
}

MODE="pull"          # pull=拉镜像 / build=本地构建
USE_CN=0
for arg in "$@"; do
  case "$arg" in
    --build) MODE="build" ;;
    --cn)    USE_CN=1 ;;
    --hub)   IMAGE="$IMAGE_HUB" ;;
    --ghcr)  IMAGE="$IMAGE_GHCR" ;;
  esac
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

# ---------- 3. 拉取现成镜像模式（默认） ----------
if [ "$MODE" = "pull" ]; then
  echo "==> 拉取镜像: $IMAGE"
  if ! docker pull "$IMAGE"; then
    echo "[错误] 拉取失败。备选方案:"
    echo "  1. 重试一次：sh install.sh"
    echo "  2. 换国内 Docker Hub 代理（偶尔某个代理不通）："
    echo "       IMAGE=docker.m.daocloud.io/jockersilas/qbt-push:latest docker compose up -d"
    echo "  3. 改用 GHCR 代理：sh install.sh --ghcr"
    echo "  4. 本地构建：sh install.sh --build --cn"
    exit 1
  fi

  echo "==> 启动容器..."
  $COMPOSE up -d
  print_done
  exit 0
fi

# ---------- 4. 本地构建模式 ----------
PYTHON_IMAGE="python:3.12-alpine"
PIP_INDEX_URL="https://pypi.org/simple"
if [ "$USE_CN" = "1" ]; then
  # 实测 1ms.run 拉取响应最快（~250ms），daocloud 作为备选
  PYTHON_IMAGE="docker.1ms.run/library/python:3.12-alpine"
  PIP_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple"
  echo "==> 已启用国内镜像源加速（1ms.run 基础镜像 + 清华 pip 源）"
fi

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

echo "==> 构建镜像并启动容器（首次构建需 1-3 分钟）..."
PYTHON_IMAGE="$PYTHON_IMAGE" PIP_INDEX_URL="$PIP_INDEX_URL" $COMPOSE up -d --build
print_done
