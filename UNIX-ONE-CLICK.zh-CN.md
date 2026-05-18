# Linux / macOS 一键启动说明

GitHub Release 会提供两个跨平台启动包：

- Linux：`LocalAIHub-linux-universal.tar.gz`
- macOS：`LocalAIHub-macos-universal.zip`

它们和 Windows 的 `LocalAIHub.exe` 一样，都会在首次运行时自动下载对应版本源码、准备 Node.js、安装依赖、构建项目，并启动本地 proxy。

## Linux

解压后进入目录：

```bash
tar -xzf LocalAIHub-linux-universal.tar.gz -C LocalAIHub-linux
cd LocalAIHub-linux
./LocalAIHub.sh
```

部分桌面环境可以双击 `LocalAIHub.sh` 运行。包内也提供 `LocalAIHub.desktop`，如果系统提示需要信任或允许执行，请按系统提示确认。

## macOS

解压后双击：

```text
LocalAIHub.command
```

也可以在终端运行：

```bash
chmod +x LocalAIHub.command
./LocalAIHub.command
```

如果 macOS Gatekeeper 提示来自未知开发者，可以在“系统设置 > 隐私与安全性”中允许，或右键文件选择“打开”。

## 默认安装位置

Linux：

```text
~/.local/share/LocalAIHub/app
```

macOS：

```text
~/Library/Application Support/LocalAIHub/app
```

`.env`、`data`、`.local-runtime` 会保留，后续升级不会覆盖本地配置和账号状态。

## 访问地址

启动完成后浏览器会打开：

```text
http://127.0.0.1:4100
```

使用过程中保持终端窗口打开。需要停止服务时按 `Ctrl+C`。

## 常用参数

```bash
./LocalAIHub.sh --launcher-info
./LocalAIHub.sh --update-app
./LocalAIHub.sh --reinstall
./LocalAIHub.sh --rebuild
./LocalAIHub.sh --prepare-only
./LocalAIHub.sh --no-open
./LocalAIHub.sh --app-dir "$HOME/LocalAIHub/app"
```

macOS 把 `./LocalAIHub.sh` 换成 `./LocalAIHub.command`。

## 首次运行需要网络

首次运行需要访问：

- GitHub：下载对应版本源码
- nodejs.org：没有 Node.js 20+ 时下载便携版 Node.js
- npm registry：安装项目依赖
