# 轻量基础镜像，适配 NAS 通用 Docker 架构
FROM python:3.12-alpine

WORKDIR /app

# 先拷贝依赖清单，利用 Docker 层缓存加速构建
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝应用源码
COPY app ./app

# 配置持久化目录（需挂载到宿主机卷）
RUN mkdir -p /app/data
ENV CONFIG_DIR=/app/data

EXPOSE 5000

# 单 worker 多线程：保证配置写入与 QBT 会话简单可靠，资源占用极低
CMD ["gunicorn", "-w", "1", "--threads", "4", "-b", "0.0.0.0:5000", "app.main:app"]
