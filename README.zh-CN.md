# Local AI Hub

[English README](./README.md)

Local AI Hub 是一个本地优先、面向个人使用的 OpenAI-compatible 中转网关。它可以导入你自己拥有或被明确授权使用的上游账号，在本地签发客户端 API Key，通过本地网关转发请求，并在同一个网页控制台里查看用量、测活状态和模型范围。

这个项目刻意保持轻量：后端是 Express/TypeScript，前端是 React/Tailwind，状态存储是本地 JSON 文件。它适合本机开发、个人工作站和本地工具链联动，不是面向公网的多租户服务。

## 一眼看懂

| 图标 | 模块 | 说明 |
| --- | --- | --- |
| 🖥️ | 桌面 App | Windows 用户可以直接双击 `LocalAIHub.exe`，以独立应用窗口使用。 |
| 🔐 | 本地优先 | 上游凭据、本地 Key、用量状态都保存在本机，不上传到外部服务。 |
| 🔁 | 本地网关 | 提供 OpenAI-compatible 的 `/v1/chat/completions`、`/v1/responses`、`/v1/messages` 等接口。 |
| 🧭 | 账号调度 | 支持账号测活、额度窗口、冷却、限额跳过和失败回退。 |
| 📊 | 用量统计 | 展示请求数、Token 消耗、缓存命中、额度窗口和重置时间。 |
| 🔌 | 工具导入 | 一键生成 `ccswitch://` 导入链接，给 Codex、Claude Code、Gemini 使用。 |

## 功能特性

- 通过 API Key 表单、批量 JSON 或本地 OpenAI OAuth 流程导入上游账号。
- 签发本地客户端 Key，并配置模型允许范围、每分钟请求数和累计额度上限。
- 转发 OpenAI-compatible 的 `POST /v1/chat/completions`、`POST /v1/responses` 和 `GET /v1/models`。
- OAuth 导入的 OpenAI 账号会通过 ChatGPT Codex 后端转发，支持 Codex / Claude Code 本地使用方式，包括 `POST /v1/messages`。
- Codex 形态请求支持 HTTP SSE 和 WebSocket 两种传输方式，便于处理需要服务端续接的会话。
- 在健康账号之间轮换，跳过已限额或处于短暂冷却中的账号，并对上游失败做分类以便安全回退。
- 支持非流式请求和基础 `stream: true` 流式透传。
- 记录本地请求次数、用量单位、账号测活状态，以及从上游响应头推断到的限速窗口信号。
- 前端只展示脱敏后的上游账号状态，不回传真实上游密钥。
- 支持上游账号测活和模型发现。
- 支持通过可配置弹窗生成 `ccswitch://` 导入链接，把本地 Key 一键导入 CCSwitch。
- 内置更克制的主流模型候选目录，保留 GPT-5、GPT-4、GPT-4o、GPT-4.1、GPT-3.5、mini、turbo 和 Codex 类型，避免日期版、preview、pro 等模型把下拉框撑乱。

## 控制台地图

| 图标 | 页面 | 重点能力 |
| --- | --- | --- |
| 🔐 | 账号导入 | 支持 API Key、批量 JSON、OpenAI OAuth 导入；右侧登录入口只保留按钮，点击后再弹出对应登录卡片。 |
| 🧭 | 账号状态 | 优先突出账号是否可用、套餐、额度窗口、重置时间、冷却状态和失败回退信息。 |
| 📊 | 用量统计 | 使用紧凑账号卡片展示请求数、Token 总量、输入/输出拆分、缓存命中和额度百分比。 |
| 🔑 | 本地 Key | 创建本地客户端 Key，配置额度、RPM 限制和主流模型允许范围。 |
| 🔌 | CCSwitch 导入 | 基于本地 Key 生成 Codex、Claude Code、Gemini 的 Provider 配置。 |

## 桌面 App 体验

Windows 版启动器已经从“黑窗口 + 浏览器标签页”改成“桌面 App 壳 + 后台本地服务”：

1. 双击 `LocalAIHub.exe`。
2. 先出现一个小的准备窗口，用来显示依赖安装、构建、启动进度。
3. 准备完成后自动打开 Local AI Hub 应用窗口。
4. 用户直接在这个窗口里操作，界面和网页端一致。
5. 关闭应用窗口后，由这个 EXE 启动的本地服务会自动停止。

这个实现复用了现有 React UI 和本地 API，不需要用户手动打开浏览器，也不需要保留命令行窗口。

## 当前边界

- 默认只监听 `127.0.0.1`。
- 当前 MVP 面向本地自用，因此页面没有单独的管理员登录层。
- 真实上游凭据存放在本地 JSON 状态文件中，前端状态接口不会返回明文密钥。
- `data/state.json`、`.env`、`dist`、`public` 和 `node_modules` 都已被 Git 忽略。
- 不建议直接暴露到公网；如果要公网部署，需要额外加入认证、密钥加密存储和网络访问控制。

## 环境要求

- 推荐 Node.js 20 或更高版本。
- npm。
- 如果要使用 CCSwitch 一键导入，需要本机已安装并注册 CCSwitch 协议。

## 快速启动

### 🖥️ 普通用户：下载一键包

从 GitHub Releases 下载对应平台的包：

- Windows：`LocalAIHub-v26.1.1.1-win-x64.exe`
- Linux：`LocalAIHub-v26.1.1.1-linux-x86_64.AppImage`，或对应架构的 `.tar.gz`
- macOS：`LocalAIHub-v26.1.1.1-mac-x64.dmg`、`LocalAIHub-v26.1.1.1-mac-arm64.dmg`，或对应 `.zip`
- Docker：`LocalAIHub-v26.1.1.1-docker-image.tar.gz` 或 `ghcr.io/supadll/local-ai-hub:v26.1.1.1`

平台启动方式：

| 图标 | 平台 | 运行体验 |
| --- | --- | --- |
| 🪟 | Windows | 双击 EXE，自动准备环境、后台启动本地服务，并打开独立桌面 App 窗口。 |
| 🧱 | Linux | 运行 AppImage 或 `LocalAIHub.sh`，自动准备环境并打开本地浏览器地址。 |
| ⌘ | macOS | 运行 `.command`、`.dmg` 或 `.zip` 包，自动准备环境并打开本地浏览器地址。 |
| 📦 | Docker | 加载或拉取镜像，启动容器后访问映射出来的本地地址。 |

Windows 用户直接双击 EXE 即可。首次启动会自动准备 Node.js、安装依赖、构建前后端并打开桌面应用窗口。

Linux/macOS 也是一键启动包，但目前不是 Windows 这种独立桌面壳；它们会启动本地服务并打开 `http://127.0.0.1:4100`，使用过程中保持启动终端运行即可。

### 🛠️ 开发者：源码启动

```bash
npm install
copy .env.example .env
npm run dev
```

访问地址：

- 本地控制台：`http://127.0.0.1:4100`
- Vite 开发服务：`http://127.0.0.1:5174`
- 健康检查：`http://127.0.0.1:4100/health`

如果要用构建后的本地运行方式：

```bash
npm install
npm run build
npm start
```

## 环境变量

参考 [.env.example](./.env.example)。

- `HOST`：后端监听主机，默认 `127.0.0.1`
- `PORT`：后端端口，默认 `4100`
- `DATA_FILE`：本地状态文件路径
- `LOG_RETENTION`：保留的审计日志数量
- `OPENAI_OAUTH_CLIENT_ID`：本地登录流程使用的 OAuth client ID
- `OPENAI_OAUTH_AUTH_ENDPOINT`：授权端点
- `OPENAI_OAUTH_TOKEN_ENDPOINT`：换取 token 的端点
- `OPENAI_OAUTH_CALLBACK_PORT`：本地回调监听端口，默认 `1455`
- `CODEX_TRANSPORT`：Codex 传输模式，默认 `auto`，可选 `auto`、`http` 或 `websocket`

## 使用流程

1. 🖥️ 启动桌面 App 或本地服务。
2. 🔐 在“账号导入”页面导入一个或多个上游账号。
3. 🧪 执行测活，确认账号是否可用以及可发现哪些模型。
4. 🔑 在“本地 Key”页面创建客户端 Key。
5. 📊 在“用量统计”和账号卡片中查看 Token、缓存命中和额度窗口。
6. 🔌 在客户端、CLI、脚本或 CCSwitch 中使用这个本地 Key。

## 架构速览

```text
桌面 App / 浏览器 UI
        |
        v
Express 管理 API + 本地 OpenAI-compatible API
        |
        +--> 本地 JSON 状态文件
        +--> OpenAI-compatible 上游 Provider
        +--> OpenAI OAuth / ChatGPT Codex 后端
        +--> CCSwitch 导入链接
```

## 导入上游账号

### 凭据表单

对 OpenAI-compatible Provider，填写：

- `name`
- `baseUrl`，例如 `https://api.openai.com`
- `apiKey`，你自己的授权上游 Key 或 token
- `models`，精确模型 ID 或通配规则
- `weight`
- `headers`
- `note`

页面会用密码框保护输入，后端状态接口只返回脱敏后的账号信息。

### 批量 JSON

```json
[
  {
    "name": "OpenAI Main",
    "baseUrl": "https://api.openai.com",
    "apiKey": "sk-your-own-upstream-key",
    "models": ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2", "gpt-5*", "gpt-4.1", "gpt-4o", "gpt-3.5-turbo"],
    "enabled": true,
    "weight": 1,
    "headers": {},
    "note": "primary route"
  }
]
```

`models` 支持：

- 精确 ID：`gpt-5.5`
- 前缀通配：`gpt-5*`
- 全通配：`*`

### OpenAI OAuth 登录

登录导入流程会创建本地 PKCE 会话，打开 OpenAI 授权 URL，并监听 `http://localhost:1455/auth/callback`。

`1455` 不是随便选的端口：Codex 风格的公开 OpenAI client 通常要求这个 callback URI。如果浏览器无法打开回调页，页面也提供了手动粘贴完整 callback URL 的兜底方式。

OAuth 导入的账号会以 `openai-oauth` 类型进入本地账号池。它不是普通的 `api.openai.com/v1` API Key：Local AI Hub 会把本地 OpenAI / Anthropic 形态的请求翻译到 ChatGPT Codex 后端 `/backend-api/codex/responses`。

当请求包含 `previous_response_id` 时，网关会使用 WebSocket 传输以保留服务端续接能力。其他 Codex 请求默认使用 HTTP SSE，除非设置 `CODEX_TRANSPORT=websocket`。

上游失败会被分类为鉴权、额度、限速、请求校验、服务繁忙、网络和路径可用性等类型。可重试失败会尝试切换到另一个符合条件的账号，并给失败账号设置一个短暂的本地冷却时间。

## 本地客户端 Key

在“本地 Key”页面创建本地 Key。每个 Key 包含：

- 允许调用的模型范围
- 累计额度上限
- 每分钟请求限制
- 启用/停用状态
- 本地用量计数

调用示例：

```bash
curl http://127.0.0.1:4100/v1/chat/completions ^
  -H "Authorization: Bearer lah_xxx" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"gpt-5.5\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}"
```

## CCSwitch 导入

创建本地 Key 后，可以点击“导入 Codex / Claude Code / Gemini”。页面会先打开配置弹窗：

- 选择目标应用。
- 设置 Provider 名称。
- 从可搜索、可滚动的模型列表中选择主模型。
- 对 Claude 形态配置，可选填 `haikuModel`、`sonnetModel`、`opusModel`。

模型下拉列表默认只显示约 4 行，超过后可以滚动选择。主模型不主动选择时默认使用 `gpt-5.5`。

确认后，后端会生成 `ccswitch://v1/import?...` 链接，并交给浏览器触发本机协议处理器。本机需要已经安装并注册 CCSwitch。

## API 接口

管理接口：

- `GET /api/admin/state`
- `POST /api/admin/upstreams`
- `POST /api/admin/upstreams/import`
- `POST /api/admin/upstreams/test`
- `POST /api/admin/upstreams/:id/test`
- `DELETE /api/admin/upstreams/:id`
- `POST /api/admin/upstreams/health-check`
- `POST /api/admin/upstreams/oauth/login-start`
- `POST /api/admin/upstreams/oauth/code-relay`
- `POST /api/admin/client-keys`
- `PUT /api/admin/client-keys/:id`
- `DELETE /api/admin/client-keys/:id`
- `POST /api/admin/client-keys/:id/ccswitch/open`

代理接口：

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`

## 模型目录说明

内置模型目录主要用于前端选择和通配符展开。Codex/OAuth 账号在测活时也会从 Codex 后端刷新可见模型列表。实际能否调用成功，仍然取决于你的上游账号、Provider 权限、账号套餐和测活结果。

`gpt-5.5-pro` 不再作为可选模型展示；历史请求如果传入这个 ID，会被归一化到 `gpt-5.5`。

## 测试与构建

```bash
npm test
npm run build
```

## 安全说明

- 只导入你拥有或被明确授权使用的账号和密钥。
- 不要公开 `.env` 和 `data/state.json`。
- 当前状态存储是本地 JSON 文件，不是生产级加密密钥存储。
- 前端只展示脱敏后的上游凭据。
- 如果要暴露到本机之外，请先增加认证、密钥加密和访问控制。

## 鸣谢

Local AI Hub 在实现过程中参考并使用了以下开源项目中的部分思路、实现细节和 UI 展示方式：

- [`icebear0828/codex-proxy`](https://github.com/icebear0828/codex-proxy)：参考了 Codex/ChatGPT 账号登录流程、Responses API 转发、协议兼容思路、账号健康与额度处理、Token/缓存命中统计概念，以及本地桌面网关体验。
- [`QuantumNous/new-api`](https://github.com/QuantumNous/new-api)：参考了多 Provider 网关设计、账号/渠道管理模式、用量统计展示、额度展示方式，以及管理控制台的信息组织方式。

感谢以上项目的维护者和贡献者。后续分发本项目或继续引入上游内容时，应保留对应鸣谢，并按上游项目许可证要求处理版权与许可声明。

## License

尚未选择开源许可证。
