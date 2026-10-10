# 种子推送 · QBT 下载

专为 NAS 设备 Docker 部署优化的轻量化种子推送 Web 应用。输入磁力链接或种子 URL，一键推送到本地 qBittorrent（QBT）客户端自动下载。

## 功能特性

- 极简界面，自适应电脑与手机端浏览器
- 支持磁力链接与 `.torrent` 直链，多行批量推送
- 一键复制优质种子站点网址
- QBT 连接参数可视化配置，支持测试连接
- 配置持久化，容器重启/更新/重建后不丢失
- 全程 QBT 官方 Web API 对接，稳定可靠
- 极低资源占用，适配群晖 / 威联通 / 绿联等主流 NAS

## 项目结构

```
.
├── app/
│   ├── main.py            # Flask 应用与 API 路由
│   ├── config.py          # 配置持久化管理
│   ├── qbt_client.py      # QBT Web API 客户端
│   └── static/            # 前端页面（HTML/CSS/JS）
├── data/                  # 配置持久化目录（需挂载）
├── Dockerfile
├── docker-compose.yml
├── install.sh            # 一键部署脚本（全 NAS 通用）
└── requirements.txt
```

## 部署方式〇：一键脚本（所有 NAS 通用 · 最推荐）

适用于群晖 / 威联通 / 绿联 / 飞牛等一切带 Docker 且支持 SSH 的 NAS。**默认直接拉取官方现成镜像启动，NAS 上完全无需构建**，几十秒即可完成部署。

### 1. 下载项目到 NAS（只需 compose 文件和脚本）

```bash
git clone https://github.com/alansong49/qbt-push.git
cd qbt-push
```

### 2. 一键部署

```bash
sh install.sh            # 拉取现成镜像并启动（推荐，无需构建）
sh install.sh --cn       # GHCR 拉取超时（国内网络）时，走国内代理拉取
sh install.sh --build    # NAS 本地构建模式（拉不到镜像时的备选）
sh install.sh --build --cn   # 本地构建 + 国内源加速
```

脚本自动完成：拉取 `ghcr.io/alansong49/qbt-push:latest` 多架构镜像（amd64/arm64 自适应）、compose 新旧版本兼容、失败时给出明确下一步指引。

### 3. 访问

浏览器打开 `http://<NAS局域网IP>:5000` 即可使用。

> 说明：镜像由 GitHub Actions 在代码推送时自动构建发布，包含 amd64 与 arm64 双架构。
> 如拉取提示未授权（镜像刚发布还未设为公开），到 GitHub 仓库页 → 右侧 Packages → qbt-push → Package settings → Change visibility → Public 一次即可。

## 部署方式一：docker compose

### 1. 上传项目到 NAS

将整个项目目录上传到 NAS，例如放到 `/volume1/docker/qbt-push/`。

### 2. 启动容器

在项目目录下执行：

```bash
docker compose up -d --build
```

> 国内 NAS 若拉取 `python:3.12-alpine` 超时，执行 `sh install.sh --cn`（等同下面手动方式）：
>
> ```bash
> PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.12-alpine \
> PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
> docker compose up -d --build
> ```

### 3. 访问

浏览器打开 `http://<NAS局域网IP>:5000` 即可使用。

## 部署方式二：群晖 Container Manager（图形界面）

### 1. 上传项目

将项目目录上传到群晖，例如 `docker/qbt-push/`。

### 2. 打开 Container Manager → 项目 → 新建

- 项目名称：`qbt-push`
- 路径：选择上传的 `docker/qbt-push` 目录
- 来源：选择 `docker-compose.yml`

### 3. 下一步 → 构建并启动

等待镜像构建完成，容器自动启动。

### 4. 访问

`http://<群晖IP>:5000`

## 部署方式三：威联通 / 绿联 Container Station

### 1. 上传项目到 NAS

### 2. 创建应用

在 Container Station 中选择「创建应用」，粘贴 `docker-compose.yml` 内容，或直接选择项目目录构建。

### 3. 启动并访问

`http://<NAS_IP>:5000`

## 端口映射与目录挂载说明

`docker-compose.yml` 已配置：

| 配置项 | 宿主机 | 容器内 | 说明 |
|--------|--------|--------|------|
| 端口 | `5000` | `5000` | Web 访问端口，可自行修改左侧端口 |
| 卷 | `./data` | `/app/data` | 配置持久化目录，**必须挂载**，否则容器重建后配置丢失 |

如需修改访问端口，编辑 `docker-compose.yml`：

```yaml
ports:
  - "8088:5000"   # 左侧改为你想要的端口
```

## 开机自启设置

`docker-compose.yml` 中已设置 `restart: unless-stopped`，容器会在 NAS 开机后自动启动，无需额外配置。

如需确保 Docker 服务本身开机自启，请在 NAS 系统设置中开启 Docker/Container Manager 的开机启动（群晖/威联通默认已开启）。

## 首次使用配置

1. 打开网页后，点击右上角**设置图标**
2. 填写 QBT 连接参数：
   - **QBT 服务地址**：`http://<QBT所在NAS的IP>:<QBT WebUI端口>`（例如 `http://192.168.1.10:8080`）
   - **登录用户名/密码**：QBT WebUI 的账号密码
   - **默认保存路径**（可选）：留空使用 QBT 默认下载目录
   - **下载限速**（可选）：0 为不限速，单位 KB/s
3. 点击**测试连接**，提示「QBT连接正常」后点击**保存**
4. 返回主页面，粘贴磁力链接即可推送下载

> 注意：如果 QBT 与本应用不在同一台 NAS，需确保 QBT 所在设备允许本应用 IP 访问其 WebUI（在 QBT 的「工具 → 选项 → Web UI → 绕过本地主机认证」或 IP 白名单中配置）。

## QBT 对接 API 说明

本应用使用 qBittorrent 官方 Web API v2：

- `POST /api/v2/auth/login` — 登录获取会话
- `POST /api/v2/torrents/add` — 添加种子/磁力/URL

无需在 QBT 中安装任何插件。

## 推荐站点自定义

推荐站点支持后台 API 增删改（预留接口），可直接编辑 `data/config.json` 中的 `sites` 数组，或调用接口：

```bash
# 新增站点
curl -X POST http://<NAS_IP>:5000/api/sites \
  -H "Content-Type: application/json" \
  -d '{"name":"站点名","url":"https://...","desc":"简介"}'

# 删除站点（id 为数组下标）
curl -X DELETE http://<NAS_IP>:5000/api/sites/0
```

## 常见问题

**Q：测试连接提示「无法访问QBT服务」**
A：检查 QBT 地址端口是否正确、QBT WebUI 是否启用、QBT 所在设备防火墙是否放行该端口。

**Q：推送成功但 QBT 没反应**
A：确认 QBT 登录账号密码正确，且 QBT 未开启「对本地主机上的客户端跳过身份验证」以外的 IP 限制。

**Q：容器重建后配置丢失**
A：确认已挂载 `./data` 目录到 `/app/data`。配置保存在 `data/config.json`。

## 技术栈

- 后端：Python + Flask + gunicorn
- 前端：原生 HTML/CSS/JavaScript（零第三方依赖）
- 镜像：python:3.12-alpine（轻量化）
