# Local AI Hub Design

## 目标

做一个本地可用、结构清晰、可继续演进的 AI 中转项目，用来统一处理：

- 上游账号导入
- 下游客户端 Key
- 模型路由
- 请求限额
- 使用量累计

MVP 解决最小闭环：

1. 本地使用者导入自己拥有或被授权的上游账号。
2. 本地页面签发客户端 Key。
3. 下游通过本地 Key 请求模型。
4. 系统自动选择可用上游并转发。
5. 系统记录使用量、请求次数和最近日志。

## 角色

- 本地使用者：下载并运行这个项目的人，负责导入自己的上游账号并签发本地 Key。
- 下游客户端：拿本地 Key 调用网关的人或程序。
- 本地网关：`Local AI Hub`。
- 上游账号：本地使用者拥有或被授权使用的 OpenAI-compatible 账号。

## 前端暴露边界

当前前端支持自助导入上游账号，但不做完整上游账号管理后台：

- 可以通过凭据表单导入单个上游账号
- 可以通过批量 JSON 导入多个上游账号
- 可以通过 OpenAI OAuth PKCE 登录导入账号，回调端口固定为 `localhost:1455`
- 可以测试草稿上游连接
- 展示脱敏后的上游账号状态卡片
- 展示最近测活结果、延迟、HTTP 状态、发现的模型、本地请求数和本地使用量
- 如果上游响应头提供 `x-ratelimit-*` 信息，展示可推断的速率窗口额度
- 不展示真实密钥、headers 和完整上游管理表单
- 不提供前端删除/启停上游账号表格

这样保证下载项目的用户可以自己完成初始化和测活，同时避免已保存的上游凭据长期暴露在浏览器页面中。

## 核心原则

- 本地优先：默认只监听回环地址。
- 自助可用：下载项目后可以通过页面完成账号导入和本地 Key 创建。
- 明确边界：只支持授权账号，不做任何规避平台规则的设计。
- 敏感最小展示：导入时需要输入密钥，但保存后只返回脱敏身份与运行状态。
- 先做通用：MVP 只实现 OpenAI-compatible adaptor。
- 可替换：后续可以替换存储层、计费层、路由层。

## 导入方式

### 凭据表单

适合单账号导入，字段包括：

- `name`
- `baseUrl`
- `apiKey`
- `models`
- `enabled`
- `weight`
- `headers`
- `note`

对 OpenAI-compatible Provider 来说，“登录式导入”当前指凭据式导入：填写 Provider 的 Base URL 和自己的 API Key。

### OpenAI OAuth 登录

适合导入 OpenAI 登录态账号。它不是直接打开 `https://auth.openai.com/log-in`，而是先进入 OAuth `authorize` 地址：

- `code_challenge`：由本地生成的 `code_verifier` 推导而来，用于 PKCE 防截获。
- `state`：一次性随机值，用于防 CSRF 和关联本地会话。
- `redirect_uri`：默认固定为 `http://localhost:1455/auth/callback`，与这个公开 OAuth client 的回调白名单保持一致；除非换成自己的 OAuth client，否则随意换端口通常会失败。
- `scope`：请求 `openid profile email offline_access`，其中 `offline_access` 用于获得 refresh token。

登录成功后，本地服务使用回调里的 `code` 和本地保存的 `code_verifier` 换 token，再以 `openai-oauth` 类型写入本地账号池。

### 批量 JSON

适合批量迁移和一次导入多个账号。JSON 数组中的每一项对应一个 `UpstreamAccount`。

后续如果某个 Provider 支持标准 OAuth 或专属登录流程，可以在此基础上增加 Provider-specific OAuth flow。

## 请求链路

1. 下游带本地 Key 调用 `/v1/chat/completions`。
2. 网关校验本地 Key 是否存在、是否启用、是否超过频率限制。
3. 网关检查该 Key 是否允许访问请求模型。
4. 网关从启用的上游账号中选择一个支持该模型的目标。
5. 网关把用户请求转发到上游。
6. 网关读取上游响应和 usage。
7. 网关更新本地 Key 的使用量。
8. 网关更新命中的上游账号本地请求数、使用量和可推断 quota 响应头。
9. 网关写入最近日志。
10. 网关把响应返回给下游。

## 数据模型

### UpstreamAccount

- `name`
- `baseUrl`
- `apiKey`
- `refreshToken`
- `tokenExpiresAt`
- `accountEmail`
- `accountSubject`
- `models`
- `enabled`
- `weight`
- `headers`
- `note`
- `lastProbeAt`
- `lastProbeOk`
- `lastProbeStatusCode`
- `lastProbeLatencyMs`
- `lastProbeError`
- `discoveredModels`
- `requestCount`
- `usedQuota`
- `lastUsedAt`
- `quota`

### ClientKey

- `name`
- `key`
- `allowedModels`
- `enabled`
- `quotaLimit`
- `usedQuota`
- `requestsPerMinute`
- `currentWindowStart`
- `currentWindowCount`
- `note`

### AuditLogEntry

- `kind`
- `message`
- `requestId`
- `clientKey`
- `upstream`
- `model`
- `statusCode`
- `usageUnits`
- `latencyMs`

## 路由策略

MVP 使用简单的加权轮询：

- 只在启用的上游里选
- 只在声明支持该模型的上游里选
- 通过 `weight` 放大命中概率
- 每个模型维护自己的轮询游标

后续可替换为：

- 熔断优先
- 延迟优先
- 预算优先
- 按租户分组

## 限额策略

MVP 限额是轻量的：

- 每个本地 Key 有 `requestsPerMinute`
- 每个本地 Key 有累计 `quotaLimit`
- 使用量优先读 `usage.total_tokens`
- 如果没有 usage，降级记 `1`
- 上游账号卡片展示的是本地累计用量和可推断的速率窗口，不等同于 Provider 账单余额

这适合本地项目验证，不适合账单级精度。

## 存储

当前使用 JSON 文件，原因是：

- 启动成本低
- 便于阅读和调试
- 不需要迁移脚本
- 结构稳定后再切 SQLite 更稳

后续需要并发写入、更长历史日志、更细报表时，应升级到 SQLite。

## 风险与限制

- 当前不支持流式响应
- 当前不支持真实账单级结算
- 通用 OpenAI-compatible Provider 没有统一额度查询接口，Provider 真实余额需要后续按平台单独适配
- 当前没有熔断和自动禁用上游
- 当前没有加密存储上游密钥
- 当前默认是单机本地 MVP，不适合直接公网暴露

## 演进路线

### Phase 1

- 本地控制台
- 页面自助上游导入
- 本地 Key 签发
- `models` / `chat/completions` / `responses`

### Phase 2

- SQLite
- 流式转发
- Claude/Gemini adaptor
- Provider-specific OAuth 登录导入
- 失败重试
- 熔断

### Phase 3

- 配额预扣与结算
- 用户体系
- 分组与多租户
- 仪表盘
- 告警通知
