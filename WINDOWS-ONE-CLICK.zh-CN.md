# Windows 一键启动说明

这个项目已经提供 Windows 启动器：`LocalAIHub.exe`。

## 给普通用户

1. 打开 GitHub Releases。
2. 下载 `LocalAIHub.exe`。
3. 双击 `LocalAIHub.exe`。
4. 第一次启动会自动准备环境，可能需要等待几分钟。
5. 浏览器自动打开 `http://127.0.0.1:4100` 后即可使用。

使用过程中不要关闭黑色启动窗口。需要停止服务时，在启动窗口里按 `Ctrl+C`。

## 第一次启动会自动做什么

- 如果 EXE 不在源码目录中，会自动下载它对应版本的项目源码到 `%LOCALAPPDATA%\LocalAIHub\app`。
- 如果没有 `.env`，会从 `.env.example` 复制一份。
- 如果电脑已经安装 Node.js 20 或更高版本，会直接使用。
- 如果没有合适的 Node.js，会下载便携版 Node.js 到 `.local-runtime`。
- 自动安装项目依赖。
- 自动构建前端和后端。
- 自动启动本地服务并打开浏览器。

## 常用参数

```powershell
.\LocalAIHub.exe --prepare-only
.\LocalAIHub.exe --reinstall
.\LocalAIHub.exe --rebuild
.\LocalAIHub.exe --no-open
.\LocalAIHub.exe --update-app
.\LocalAIHub.exe --launcher-info
```

- `--prepare-only`：只准备环境和构建，不启动服务。
- `--reinstall`：重新安装依赖。
- `--rebuild`：重新构建项目。
- `--no-open`：启动后不自动打开浏览器。
- `--update-app`：重新下载并安装 EXE 对应版本的项目源码。
- `--launcher-info`：查看 EXE 内置的版本号、仓库和源码下载地址。

## 给维护者

修改 `launcher/LocalAIHubLauncher.cs` 后，运行下面命令重新生成 EXE：

```powershell
npm run build:launcher
```

如果希望其他人不克隆项目也能使用，推送 `v*` tag 后到 GitHub Release 下载自动构建出的 `LocalAIHub.exe` 即可。
