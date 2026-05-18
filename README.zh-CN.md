# Local AI Hub

[English README](./README.md)

Local AI Hub 是一个本地优先、面向个人使用的 OpenAI-compatible 中转网关。它可以导入你自己拥有或被明确授权使用的上游账号，在本地签发客户端 API Key，通过本地网关转发请求，并在同一个网页控制台里查看用量、测活状态和模型范围。

这个项目刻意保持轻量：后端是 Express/TypeScript，前端是 React/Tailwind，状态存储是本地 JSON 文件。它适合本机开发、个人工作站和本地工具链联动，不是面向公网的多租户服务。

## 功能特性

- 通过 API Key 表单、批量 JSON 或本地 OpenAI OAuth 流程导入上游账号。
- 签发本地客户端 Key，并配置模型允许范围、每分钟请求数和累计额度上限。
- 转发 OpenAI-compatible 的 `POST /v1/chat/completions`、`POST /v1/responses` 和 `GET /v1/models`。
- OAuth 导入的 OpenAI 账号会通过 ChatGPT Codex 后端转发，支持 Codex / Claude Code 本地使用方式，包括 `POST /v1/messages`。
- 支持非流式请求和基础 `stream: true` 流式透传。
- 记录本地请求次数、用量单位、账号测活状态，以及从上游响应头推断到的限速窗口信号。
- 前端只展示脱敏后的上游账号状态，不回传真实上游密钥。
- 支持上游账号测活和模型发现。
- 支持通过可配置弹窗生成 `ccswitch://` 导入链接，把本地 Key 一键导入 CCSwitch。
- 内置较完整的 GPT 模型候选目录，包括 GPT-5.5、GPT-5.4、GPT-5.3 Codex、GPT-5.2、GPT-5、GPT-4.1、GPT-4o、GPT-4、GPT-3.5、GPT-3 base 替代模型、图片模型和 GPT-OSS ID。

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

## 使用流程

1. 启动服务。
2. 打开本地控制台。
3. 在“账号导入”页面导入一个或多个上游账号。
4. 执行测活，确认账号是否可用以及可发现哪些模型。
5. 在“本地 Key”页面创建客户端 Key。
6. 在客户端、CLI、脚本或 CCSwitch 中使用这个本地 Key。

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

## License

尚未选择开源许可证。
