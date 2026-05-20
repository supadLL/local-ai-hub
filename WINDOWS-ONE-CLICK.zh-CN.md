# Windows 一键启动说明

这个项目已经提供 Windows 启动器，例如：`LocalAIHub-v26.1.1.1-win-x64.exe`。

## 给普通用户

1. 打开 GitHub Releases。
2. 下载最新版本的 `LocalAIHub-v版本号-win-x64.exe`。
3. 双击这个 `.exe` 文件。
4. 第一次启动会自动准备环境，可能需要等待几分钟。
5. 准备完成后会打开 Local AI Hub 桌面应用窗口，直接在这个窗口里使用。

Windows 版不再要求用户保留黑色命令行窗口。关闭 Local AI Hub 应用窗口后，由这个 EXE 启动的本地服务会自动停止。

## 第一次启动会自动做什么

- 如果 EXE 不在源码目录中，会自动下载它对应版本的项目源码到 `%LOCALAPPDATA%\LocalAIHub\app`。
- 如果没有 `.env`，会从 `.env.example` 复制一份。
- 如果电脑已经安装 Node.js 20 或更高版本，会直接使用。
- 如果没有合适的 Node.js，会下载便携版 Node.js 到 `.local-runtime`。
- 自动安装项目依赖。
- 自动构建前端和后端。
- 自动启动本地服务并打开桌面应用窗口。

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
- `--no-open`：启动后不自动打开应用窗口，只保留本地服务和准备窗口。
- `--update-app`：重新下载并安装 EXE 对应版本的项目源码。
- `--launcher-info`：查看 EXE 内置的版本号、仓库和源码下载地址。

## 给维护者

修改 `launcher/LocalAIHubLauncher.cs` 后，运行下面命令重新生成 EXE：

```powershell
npm run build:launcher
```

如果希望其他人不克隆项目也能使用，创建并推送 `v*` 版本 tag 后，到 GitHub Release 下载自动构建出的 `LocalAIHub-v版本号-win-x64.exe` 即可。首次版本号从 `v26.1.1.1` 开始，后续递增最后一段。
