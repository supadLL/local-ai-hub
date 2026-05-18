# GitHub 自动构建与发布说明

项目已加入 GitHub Actions：`.github/workflows/release-artifacts.yml`。

## 自动构建

每次推送分支、创建 Pull Request，或者手动运行 workflow，GitHub 都会执行：

1. 安装 npm 依赖。
2. 运行测试。
3. 构建前端和后端。
4. 编译 Windows 小白版 `LocalAIHub-v版本号-win-x64.exe`。
5. 生成 Linux `x64`、`arm64` 启动包和 `x86_64.AppImage`。
6. 生成 macOS `x64`、`arm64` 的 `.dmg` 和 `.zip`。
7. 构建 Docker 镜像并导出 `LocalAIHub-v26.1.1.1-docker-image.tar.gz`。
8. 上传所有构建产物。

构建出来的 Windows / Linux / macOS 启动器都会写入当前 commit 对应的源码压缩包地址。用户只下载对应平台产物，运行后它会自动下载这个版本的项目源码、安装依赖、构建并启动本地 proxy。

本地生成的 `LocalAIHub.exe` 已被 Git 忽略；正式分发以 GitHub Actions/Release 产物为准，避免提交过期二进制文件。

## 版本规则

Release 版本号使用四段式，初始版本为：

```text
v26.1.1.1
```

每次推送到 `main` 分支时，workflow 会读取已有 Release，自动递增最后一段，例如：

```text
v26.1.1.1 -> v26.1.1.2 -> v26.1.1.3
```

也可以手动运行 workflow 并填写指定版本号。版本号必须符合 `v数字.数字.数字.数字` 的格式。

## 发布正式版本

创建并推送 tag 即可自动发布 GitHub Release：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

workflow 会把这些文件上传到 Release：

- `LocalAIHub-v26.1.1.1-win-x64.exe`
- `WINDOWS-ONE-CLICK.zh-CN.md`
- `LocalAIHub-v26.1.1.1-linux-x86_64.AppImage`
- `LocalAIHub-v26.1.1.1-linux-x64.tar.gz`
- `LocalAIHub-v26.1.1.1-linux-arm64.tar.gz`
- `LocalAIHub-v26.1.1.1-mac-x64.dmg`
- `LocalAIHub-v26.1.1.1-mac-x64.zip`
- `LocalAIHub-v26.1.1.1-mac-arm64.dmg`
- `LocalAIHub-v26.1.1.1-mac-arm64.zip`
- `LocalAIHub-v26.1.1.1-docker-image.tar.gz`
- `latest.yml`
- `latest-linux.yml`
- `latest-mac.yml`
- `version.json`
- `SHA256SUMS.txt`
- `version-windows.json`
- `version-docker.json`

## 用户侧使用方式

1. 打开 GitHub Releases。
2. Windows 下载 `LocalAIHub-v26.1.1.1-win-x64.exe`，双击运行。
3. Linux 下载 `LocalAIHub-v26.1.1.1-linux-x86_64.AppImage` 直接运行，或下载对应架构 `.tar.gz` 后运行 `./LocalAIHub.sh`。
4. macOS 下载对应架构 `.dmg` 或 `.zip`，解压后双击 `LocalAIHub.command`。
5. Docker 使用 GHCR 镜像，或下载 `LocalAIHub-v26.1.1.1-docker-image.tar.gz` 后 `docker load`。
6. 浏览器打开 `http://127.0.0.1:4100` 后开始使用。

EXE 单独运行时默认把项目安装到：

```text
%LOCALAPPDATA%\LocalAIHub\app
```

`.env`、`data` 和 `.local-runtime` 会保留，方便后续版本更新时保留本地配置、账号状态和便携 Node 缓存。

Linux 默认安装到：

```text
~/.local/share/LocalAIHub/app
```

macOS 默认安装到：

```text
~/Library/Application Support/LocalAIHub/app
```

## 常用维护参数

```powershell
.\LocalAIHub.exe --launcher-info
.\LocalAIHub.exe --update-app
.\LocalAIHub.exe --reinstall
.\LocalAIHub.exe --rebuild
.\LocalAIHub.exe --app-dir "D:\LocalAIHub\app"
```

- `--launcher-info`：查看 EXE 内置版本、仓库和源码下载地址。
- `--update-app`：重新下载并安装 EXE 对应版本的源码。
- `--reinstall`：重新安装 npm 依赖。
- `--rebuild`：重新构建前端和后端。
- `--app-dir`：指定安装和运行目录。

## 注意事项

- 首次运行需要网络访问 GitHub、nodejs.org 和 npm registry。
- 如果用户电脑已经安装 Node.js 20 或更高版本，启动器会优先使用系统 Node.js。
- 如果没有合适的 Node.js，启动器会下载便携版 Node.js 到 `.local-runtime`。
- EXE 没有代码签名时，Windows 可能提示未知发布者，这是未签名本地工具的正常提示。
- macOS 未签名脚本可能触发 Gatekeeper，需要右键打开或在隐私与安全性里允许。
- Linux 桌面双击行为取决于桌面环境；终端执行 `./LocalAIHub.sh` 是最稳定的方式。
