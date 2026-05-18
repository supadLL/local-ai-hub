# Docker 运行说明

GitHub Actions 会自动构建 Docker 镜像，并在非 Pull Request 构建时推送到 GHCR。

默认镜像名：

```text
ghcr.io/supadll/local-ai-hub
```

## 直接运行 GHCR 镜像

```bash
docker run --rm -it \
  --name local-ai-hub \
  -p 4100:4100 \
  -e HOST=0.0.0.0 \
  -e PORT=4100 \
  -e DATA_FILE=/app/data/state.json \
  -v local-ai-hub-data:/app/data \
  ghcr.io/supadll/local-ai-hub:latest
```

访问：

```text
http://127.0.0.1:4100
```

## 使用 docker compose

```bash
docker compose up --build
```

默认会把本地 `./data` 挂载到容器的 `/app/data`，用于保存账号、密钥和用量状态。

## 下载镜像文件后导入

GitHub Release 会附带：

```text
local-ai-hub-docker-image.tar.gz
```

下载后导入：

```bash
gzip -dc local-ai-hub-docker-image.tar.gz | docker load
```

然后按 `docker images` 中显示的镜像名运行。

## 本地脚本

Linux / macOS：

```bash
./scripts/run-docker.sh
```

Windows PowerShell：

```powershell
.\scripts\run-docker.ps1
```

可以通过环境变量指定镜像、端口和数据目录：

```bash
LOCAL_AI_HUB_IMAGE=ghcr.io/supadll/local-ai-hub:v0.1.0 PORT=4100 LOCAL_AI_HUB_DATA_DIR=./data ./scripts/run-docker.sh
```
