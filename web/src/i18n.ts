import type { TabId } from "./types";

export type Language = "en" | "zh";

export const languageStorageKey = "local-ai-hub-language";

const en = {
  language: {
    current: "English",
    toggle: "中文",
    aria: "Switch language"
  },
  tabs: {
    overview: "Overview",
    import: "Account Import",
    keys: "Local Keys",
    usage: "Usage Stats",
    activity: "Activity",
    settings: "Settings"
  } satisfies Record<TabId, string>,
  pages: {
    overview: {
      title: "Overview",
      subtitle: "Local console for issuing client keys, checking usage, and calling the gateway."
    },
    import: {
      title: "Account Import",
      subtitle: "Import your own authorized upstream accounts by credential form or batch JSON."
    },
    keys: {
      title: "Local Keys",
      subtitle: "Issue local API keys and control model scope, quota, and RPM."
    },
    usage: {
      title: "Usage Stats",
      subtitle: "Total gateway consumption across upstream accounts, keys, and recent proxy activity."
    },
    activity: {
      title: "Activity",
      subtitle: "Review local key changes, proxy requests, probes, and failover results."
    },
    settings: {
      title: "Settings",
      subtitle: "Inspect runtime configuration for this local gateway."
    }
  } satisfies Record<TabId, { title: string; subtitle: string }>,
  common: {
    actions: "Actions",
    boundary: "Boundary",
    cancel: "Cancel",
    clear: "Clear",
    copy: "Copy",
    copied: "Copied to clipboard.",
    create: "Create",
    dataFile: "Data file",
    delete: "Delete",
    disable: "Disable",
    disabled: "Disabled",
    enable: "Enable",
    enabled: "Enabled",
    host: "Host",
    loading: "Loading",
    localIntranetMvp: "Local-only MVP",
    logRetention: "Log retention",
    models: "Models",
    name: "Name",
    noModels: "none",
    notSaved: "Not saved",
    online: "Online",
    port: "Port",
    providerSupport: "Provider support",
    refresh: "Refresh",
    service: "Service",
    storage: "Storage",
    weight: "Weight"
  },
  sidebar: {
    subtitle: "Local gateway console",
    enabledKeys: "Enabled Keys",
    controlPlane: "MVP control plane",
    boundary: "Use only upstream accounts that you own or are explicitly authorized to operate."
  },
  overview: {
    totalIssued: "total issued",
    recentLogs: "Recent Logs",
    latest60: "latest 60 in console",
    requestTemplate: "Client Request Template",
    requestTemplateCopy: "OpenAI-compatible local endpoint.",
    latestActivity: "Latest Activity",
    latestActivityCopy: "Recent local key and proxy events.",
    serviceSnapshot: "Service Snapshot",
    serviceSnapshotCopy: "Runtime basics from the local state endpoint.",
    view: "View"
  },
  importPage: {
    credentialBadge: "Login-style import",
    credentialTitle: "Import by account credential",
    credentialCopy: "For OpenAI-compatible providers, this means entering the provider endpoint and your authorized API key in a password field.",
    openaiLoginTitle: "OpenAI OAuth Login",
    openaiLoginCopy: "Open a local PKCE login flow. The callback uses localhost:1455 and imports only your own authorized account.",
    openaiLoginButton: "Add by OpenAI login",
    openaiLoginStarting: "Opening login",
    openaiLoginRelayTitle: "If the callback page cannot connect",
    openaiLoginRelayCopy: "After login, paste the localhost:1455 callback URL here and submit it manually.",
    callbackUrl: "Callback URL",
    submitCallback: "Submit callback",
    oauthStarted: "OpenAI login window opened. Finish login in the popup.",
    oauthImported: "OpenAI account imported.",
    selfUseHint: "Designed for local self-use: no administrator token is required.",
    visibilityHint: "Saved secrets are never returned to the browser. The console only shows masked identity, health, local usage, and quota signals.",
    baseUrl: "Base URL",
    apiKey: "API Key",
    apiKeyPlaceholder: "sk-... or provider token",
    note: "Note",
    headersJson: "Headers JSON",
    enableAfterImport: "Enable after import",
    saveCredential: "Save account",
    testConnection: "Test connection",
    jsonTitle: "Batch JSON Import",
    jsonCopy: "Paste a JSON array to import multiple upstream accounts at once.",
    importJson: "Import JSON",
    testFirstJson: "Test first item",
    statusTitle: "Import Status",
    statusCopy: "Sanitized account status without exposing raw upstream credentials.",
    importedCount: "Imported accounts",
    enabledCount: "Enabled accounts",
    accountStatusTitle: "Upstream Account Health",
    accountStatusCopy: "View account status, quota signals, local usage, and liveness probe results.",
    noImportedAccounts: "No upstream accounts yet",
    noImportedAccountsCopy: "Import one credential or a JSON batch first, then health and usage cards will appear here.",
    healthCheckAll: "Check all",
    healthChecking: "Checking",
    checkThisAccount: "Probe",
    refreshStatus: "Refresh status",
    healthSummary: (alive: number, dead: number, skipped: number) =>
      `Health check finished. Alive ${alive}, failed ${dead}, skipped ${skipped}.`,
    healthy: "Healthy",
    failed: "Failed",
    untested: "Untested",
    endpoint: "Endpoint",
    accountIdentity: "Identity",
    maskedKey: "Masked key",
    tokenExpires: "Token expires",
    providerQuota: "Provider quota",
    quotaUnknownLabel: "Quota unknown",
    quotaAvailableLabel: "Window available",
    quotaLimitedLabel: "Window limited",
    quotaUnsupportedTitle: "No standard quota endpoint",
    quotaUnsupportedCopy: "OpenAI-compatible providers do not share a universal balance API. The gateway shows local usage now and will display rate-limit windows when upstream headers provide them.",
    quotaFromHeaders: "Inferred from upstream rate-limit headers.",
    quotaFromProvider: "Fetched live from the ChatGPT Codex usage endpoint.",
    refreshQuota: "Refresh quota",
    quotaRefreshed: (name: string) => `Quota refreshed for ${name}.`,
    primaryRateLimit: "Rate limit",
    secondaryRateLimit: "Secondary limit",
    codeReviewRateLimit: "Code review limit",
    additionalRateLimit: "Additional limit",
    used: "used",
    limitReached: "Limit reached",
    quotaOk: "OK",
    planType: "Plan",
    quotaUpdated: "Updated",
    remainingRequests: "Remaining",
    limitRequests: "Limit",
    resetAt: "Reset",
    localUsage: "Local usage",
    requestCount: "Requests",
    usageUnits: "Units",
    lastProbe: "Last probe",
    neverChecked: "Never checked",
    responseStatus: "HTTP",
    latency: "Latency",
    discoveredModels: "Discovered",
    configuredModels: "Configured",
    loginNoteTitle: "About login import",
    loginNoteCopy: "A universal OAuth login is provider-specific. This MVP supports the common credential login pattern now; provider OAuth flows can be added later per provider.",
    defaultAccountName: "OpenAI-compatible account",
    apiKeyRequired: "API key is required.",
    modelsRequired: "At least one model is required.",
    batchMustBeArray: "Batch JSON must be a non-empty array.",
    headersInvalid: "Headers JSON is invalid.",
    headersMustBeObject: "Headers JSON must be an object.",
    showSecret: "Show API key",
    hideSecret: "Hide API key",
    imported: (count: number) => `Imported ${count} upstream account(s).`,
    created: (name: string) => `Upstream account ${name} imported.`,
    deleted: (name: string) => `Upstream account ${name} deleted.`,
    deleteConfirm: (name: string) => `Delete upstream account "${name}"? This only removes it from the local pool.`,
    testPassed: (label: string, status: number | undefined, models: string) =>
      `${label} test passed. Status ${status ?? "-"}. Models: ${models}`,
    testFailed: (label: string, status: number | undefined, error: string | undefined) =>
      `${label} test failed. ${status ? `Status ${status}.` : ""} ${error || ""}`.trim()
  },
  keys: {
    createTitle: "Create Local Key",
    createCopy: "Set model scope, accumulated quota, and per-minute limits.",
    requestsPerMinute: "Requests / Minute",
    allowedModels: "Allowed Models",
    quotaLimit: "Quota Limit",
    note: "Note",
    issuedTitle: "Issued Keys",
    issuedCopy: "Quota use, scope, and client key lifecycle.",
    key: "Key",
    scope: "Scope",
    usage: "Usage",
    unlimited: "unlimited",
    emptyTitle: "No local keys issued",
    emptyBody: "Create a key on the left to let clients call the gateway.",
    ccSwitchTitle: "Import to CCSwitch",
    ccSwitchCopy: "Generate a local CCSwitch import link and hand it to the browser as a ccswitch:// protocol action. CCSwitch must already be installed on this machine.",
    ccNoRawKey: "The import link is generated only when clicked and is not kept visible on the page.",
    ccDialogTitle: "Import to CCSwitch",
    ccDialogApp: "Application",
    ccDialogPrimary: "Primary Model",
    ccDialogHaiku: "Haiku Model",
    ccDialogSonnet: "Sonnet Model",
    ccDialogOpus: "Opus Model",
    ccDialogPlaceholder: "Select or enter model name",
    ccModelDropdownHint: "4 visible, scroll for more",
    ccModelSearchPlaceholder: "Search models",
    ccDialogOpen: "Open CCSwitch",
    ccDialogHint: "Adjust the provider profile before sending the local import link to CCSwitch.",
    ccCodex: "Import Codex",
    ccClaudeCode: "Import Claude Code",
    ccGemini: "Import Gemini",
    ccMissingModel: "At least one model is required before importing to CCSwitch.",
    ccImportOpened: "CCSwitch import link sent to the browser. If nothing opens, check the ccswitch:// protocol registration.",
    created: "Local key created. Raw key is kept hidden.",
    toggled: (enabled: boolean) => `Client key ${enabled ? "enabled" : "disabled"}.`,
    deleted: "Client key deleted."
  },
  usagePage: {
    totalUnits: "Consumed units",
    totalRequests: "Requests",
    averageUnits: "Avg / request",
    activeAccounts: "Active accounts",
    activeKeys: "Active keys",
    quotaAverage: "Quota used",
    limitedAccounts: "Limited accounts",
    recentUnits: "Window units",
    minutes5: "5 min",
    hour1: "1 hour",
    day1: "1 day",
    last6h: "Last 6h",
    last24h: "Last 24h",
    last3d: "Last 3d",
    last7d: "Last 7d",
    last30d: "Last 30d",
    all: "All",
    chartTitle: "Recent Consumption",
    unitsLine: "Usage units",
    requestsLine: "Requests",
    noUsage: "No proxy usage in this window.",
    sourceNote: "Totals use persisted upstream counters; the chart uses the latest proxy logs retained by the console."
  },
  activity: {
    title: "Recent Logs",
    copy: "Local key changes, upstream probes, proxy requests, and failover attempts."
  },
  settings: {
    serviceCopy: "Runtime settings reported by the backend.",
    runtimeMode: "Runtime Mode",
    runtimeModeCopy: "Local-first mode with self-service upstream import.",
    upstreamManagement: "Upstream accounts",
    backendOnly: "Self-service import, sanitized status",
    jsonFile: "JSON file",
    openaiCompatible: "OpenAI-compatible"
  },
  logs: {
    emptyTitle: "No logs yet",
    emptyBody: "Local key changes and proxy requests will appear here.",
    model: "Model",
    client: "Client",
    upstream: "Upstream",
    usage: "Usage",
    request: "Req"
  },
  feedback: {
    refreshFailed: "Failed to refresh state."
  }
};

export type Messages = typeof en;

const zh = {
  language: {
    current: "中文",
    toggle: "EN",
    aria: "切换语言"
  },
  tabs: {
    overview: "总览",
    import: "账号导入",
    keys: "本地 Key",
    activity: "活动日志",
    settings: "设置"
  },
  pages: {
    overview: {
      title: "总览",
      subtitle: "本地控制台，用于签发客户端 Key、查看用量，并调用网关。"
    },
    import: {
      title: "账号导入",
      subtitle: "通过凭据表单或批量 JSON 导入你自己的授权上游账号。"
    },
    keys: {
      title: "本地 Key",
      subtitle: "签发本地 API Key，并控制模型范围、额度和 RPM。"
    },
    activity: {
      title: "活动日志",
      subtitle: "查看本地 Key 变更、代理请求、上游探测和失败切换结果。"
    },
    settings: {
      title: "设置",
      subtitle: "查看这个本地网关的运行配置。"
    }
  },
  common: {
    actions: "操作",
    boundary: "边界",
    cancel: "取消",
    clear: "清空",
    copy: "复制",
    copied: "已复制到剪贴板。",
    create: "创建",
    dataFile: "数据文件",
    delete: "删除",
    disable: "停用",
    disabled: "已停用",
    enable: "启用",
    enabled: "已启用",
    host: "主机",
    loading: "加载中",
    localIntranetMvp: "本地运行 MVP",
    logRetention: "日志保留",
    models: "模型",
    name: "名称",
    noModels: "无",
    notSaved: "未保存",
    online: "在线",
    port: "端口",
    providerSupport: "Provider 支持",
    refresh: "刷新",
    service: "服务",
    storage: "存储",
    weight: "权重"
  },
  sidebar: {
    subtitle: "本地网关控制台",
    enabledKeys: "已启用 Key",
    controlPlane: "MVP 控制台",
    boundary: "只使用你拥有或被明确授权操作的上游账号。"
  },
  overview: {
    totalIssued: "个已签发",
    recentLogs: "最近日志",
    latest60: "控制台最近 60 条",
    requestTemplate: "客户端请求模板",
    requestTemplateCopy: "OpenAI-compatible 本地端点。",
    latestActivity: "最新活动",
    latestActivityCopy: "最近的本地 Key 和代理事件。",
    serviceSnapshot: "服务快照",
    serviceSnapshotCopy: "来自本地状态接口的运行基础信息。",
    view: "查看"
  },
  importPage: {
    credentialBadge: "登录式导入",
    credentialTitle: "通过账号凭据导入",
    credentialCopy: "对 OpenAI-compatible Provider 来说，这里就是填写 Provider 端点和你已授权的 API Key，并用密码框保护输入。",
    openaiLoginTitle: "OpenAI OAuth 登录",
    openaiLoginCopy: "打开本地 PKCE 登录流程。回调地址使用 localhost:1455，只导入你自己的授权账号。",
    openaiLoginButton: "通过 OpenAI 登录添加",
    openaiLoginStarting: "正在打开登录",
    openaiLoginRelayTitle: "如果回调页无法连接",
    openaiLoginRelayCopy: "登录后把浏览器地址栏里的 localhost:1455 回调 URL 粘贴到这里，再手动提交。",
    callbackUrl: "回调 URL",
    submitCallback: "提交回调",
    oauthStarted: "OpenAI 登录窗口已打开，请在弹窗里完成登录。",
    oauthImported: "OpenAI 账号已导入。",
    selfUseHint: "面向本地自用：不需要单独的管理员 Token。",
    visibilityHint: "已保存的密钥不会返回浏览器；控制台只展示脱敏身份、健康状态、本地用量和额度信号。",
    baseUrl: "Base URL",
    apiKey: "API Key",
    apiKeyPlaceholder: "sk-... 或 Provider Token",
    note: "备注",
    headersJson: "Headers JSON",
    enableAfterImport: "导入后立即启用",
    saveCredential: "保存账号",
    testConnection: "测试连接",
    jsonTitle: "批量 JSON 导入",
    jsonCopy: "粘贴 JSON 数组，一次性导入多个上游账号。",
    importJson: "导入 JSON",
    testFirstJson: "测试第一项",
    statusTitle: "导入状态",
    statusCopy: "展示脱敏后的账号状态，不暴露真实上游凭据。",
    importedCount: "已导入账号",
    enabledCount: "已启用账号",
    accountStatusTitle: "上游账号健康",
    accountStatusCopy: "展示账号状态、额度信号、本地用量和测活结果。",
    noImportedAccounts: "还没有上游账号",
    noImportedAccountsCopy: "先通过凭据或 JSON 导入账号，之后这里会出现健康状态和用量卡片。",
    healthCheckAll: "全部测活",
    healthChecking: "测活中",
    checkThisAccount: "测活",
    refreshStatus: "刷新状态",
    healthSummary: (alive: number, dead: number, skipped: number) =>
      `测活完成。可用 ${alive}，失败 ${dead}，跳过 ${skipped}。`,
    healthy: "可用",
    failed: "失败",
    untested: "未检测",
    endpoint: "端点",
    accountIdentity: "身份",
    maskedKey: "脱敏 Key",
    tokenExpires: "Token 过期",
    providerQuota: "Provider 额度",
    quotaUnknownLabel: "额度未知",
    quotaAvailableLabel: "窗口可用",
    quotaLimitedLabel: "窗口受限",
    quotaUnsupportedTitle: "暂无统一额度接口",
    quotaUnsupportedCopy: "通用 OpenAI-compatible Provider 没有统一余额 API。当前网关会展示本地用量；当上游响应头提供速率窗口时，会自动展示可推断额度。",
    quotaFromHeaders: "根据上游 rate-limit 响应头推断。",
    quotaFromProvider: "实时读取自 ChatGPT Codex 用量接口。",
    refreshQuota: "刷新额度",
    quotaRefreshed: (name: string) => `${name} 的额度已刷新。`,
    primaryRateLimit: "主额度窗口",
    secondaryRateLimit: "次级额度窗口",
    codeReviewRateLimit: "Code Review 额度",
    additionalRateLimit: "附加额度",
    used: "已用",
    limitReached: "已达上限",
    quotaOk: "OK",
    planType: "套餐",
    quotaUpdated: "更新时间",
    remainingRequests: "剩余",
    limitRequests: "上限",
    resetAt: "重置",
    localUsage: "本地用量",
    requestCount: "请求数",
    usageUnits: "单位",
    lastProbe: "最近测活",
    neverChecked: "尚未检测",
    responseStatus: "HTTP",
    latency: "延迟",
    discoveredModels: "探测模型",
    configuredModels: "配置模型",
    loginNoteTitle: "关于登录导入",
    loginNoteCopy: "通用 OAuth 登录通常是 Provider 专属能力。当前 MVP 先支持最通用的凭据登录式导入；后续可以按 Provider 增加 OAuth 流程。",
    defaultAccountName: "OpenAI-compatible 账号",
    apiKeyRequired: "API Key 不能为空。",
    modelsRequired: "至少需要填写一个模型。",
    batchMustBeArray: "批量 JSON 必须是非空数组。",
    headersInvalid: "Headers JSON 格式不正确。",
    headersMustBeObject: "Headers JSON 必须是对象。",
    showSecret: "显示 API Key",
    hideSecret: "隐藏 API Key",
    imported: (count: number) => `已导入 ${count} 个上游账号。`,
    created: (name: string) => `上游账号 ${name} 已导入。`,
    deleted: (name: string) => `上游账号 ${name} 已删除。`,
    deleteConfirm: (name: string) => `确认删除上游账号“${name}”？这只会从本地账号池移除它。`,
    testPassed: (label: string, status: number | undefined, models: string) =>
      `${label} 测试通过。状态 ${status ?? "-"}。模型：${models}`,
    testFailed: (label: string, status: number | undefined, error: string | undefined) =>
      `${label} 测试失败。${status ? `状态 ${status}。` : ""} ${error || ""}`.trim()
  },
  keys: {
    createTitle: "创建本地 Key",
    createCopy: "设置模型范围、累计额度和每分钟请求限制。",
    requestsPerMinute: "每分钟请求数",
    allowedModels: "允许模型",
    quotaLimit: "额度上限",
    note: "备注",
    issuedTitle: "已签发 Key",
    issuedCopy: "查看额度使用、范围和客户端 Key 生命周期。",
    key: "Key",
    scope: "范围",
    usage: "用量",
    unlimited: "无限制",
    emptyTitle: "还没有本地 Key",
    emptyBody: "在左侧创建一个 Key 后，下游客户端就能调用网关。",
    ccSwitchTitle: "导入到 CCSwitch",
    ccSwitchCopy: "由本地后端生成 CCSwitch 导入链接，并交给浏览器触发 ccswitch:// 协议。本机需要已安装 CCSwitch。",
    ccNoRawKey: "导入链接只在点击时生成，不会常驻展示在页面里。",
    ccDialogTitle: "填入 CCSwitch",
    ccDialogApp: "应用",
    ccDialogPrimary: "主模型",
    ccDialogHaiku: "Haiku 模型",
    ccDialogSonnet: "Sonnet 模型",
    ccDialogOpus: "Opus 模型",
    ccDialogPlaceholder: "选择或输入模型名称",
    ccModelDropdownHint: "默认显示 4 个，可滚动",
    ccModelSearchPlaceholder: "搜索模型",
    ccDialogOpen: "打开 CCSwitch",
    ccDialogHint: "先调整 Provider 配置，再把本地导入链接交给 CCSwitch。",
    ccCodex: "导入 Codex",
    ccClaudeCode: "导入 Claude Code",
    ccGemini: "导入 Gemini",
    ccMissingModel: "导入 CCSwitch 前至少需要一个模型。",
    ccImportOpened: "已把 CCSwitch 导入链接交给浏览器。如果没有弹出，请检查 ccswitch:// 协议注册。",
    created: "本地 Key 已创建，原始 Key 已隐藏保存。",
    toggled: (enabled: boolean) => `客户端 Key 已${enabled ? "启用" : "停用"}。`,
    deleted: "客户端 Key 已删除。"
  },
  activity: {
    title: "最近日志",
    copy: "本地 Key 变更、上游探测、代理请求和失败切换记录。"
  },
  settings: {
    serviceCopy: "后端报告的运行配置。",
    runtimeMode: "运行模式",
    runtimeModeCopy: "本地优先模式，支持自助导入上游账号。",
    upstreamManagement: "上游账号",
    backendOnly: "自助导入，脱敏状态",
    jsonFile: "JSON 文件",
    openaiCompatible: "OpenAI-compatible"
  },
  logs: {
    emptyTitle: "暂无日志",
    emptyBody: "本地 Key 变更和代理请求会显示在这里。",
    model: "模型",
    client: "客户端",
    upstream: "上游",
    usage: "用量",
    request: "请求"
  },
  feedback: {
    refreshFailed: "刷新状态失败。"
  }
};

const zhUsageOverrides = {
  tabs: {
    usage: "用量统计"
  },
  pages: {
    usage: {
      title: "用量统计",
      subtitle: "汇总上游账号、本地 Key 和最近代理请求的整体消耗。"
    }
  },
  usagePage: {
    totalUnits: "消耗单位",
    totalRequests: "请求数",
    averageUnits: "平均 / 请求",
    activeAccounts: "活跃账号",
    activeKeys: "活跃 Key",
    quotaAverage: "额度已用",
    limitedAccounts: "受限账号",
    recentUnits: "窗口单位",
    minutes5: "5 分钟",
    hour1: "1 小时",
    day1: "1 天",
    last6h: "最近 6h",
    last24h: "最近 24h",
    last3d: "最近 3 天",
    last7d: "最近 7 天",
    last30d: "最近 30 天",
    all: "全部",
    chartTitle: "最近消耗",
    unitsLine: "用量单位",
    requestsLine: "请求数",
    noUsage: "当前时间窗口内暂无代理用量。",
    sourceNote: "总量来自已持久化的上游计数；曲线来自控制台保留的最近代理日志。"
  }
};

function mergeMessages<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }

  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    merged[key] =
      baseValue &&
      value &&
      typeof baseValue === "object" &&
      typeof value === "object" &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value)
        ? mergeMessages(baseValue, value)
        : value;
  }
  return merged as T;
}

export const dictionaries: Record<Language, Messages> = {
  en,
  zh: mergeMessages(mergeMessages(en, zh), zhUsageOverrides)
};
