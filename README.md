# Local AI Hub

[中文文档](./README.zh-CN.md)

Local AI Hub is a local-first OpenAI-compatible gateway for personal use. It lets you import upstream accounts that you own or are explicitly authorized to use, issue local API keys, route requests through those upstreams, and track local quota usage from one web console.

The project is intentionally small and self-contained: an Express/TypeScript backend, a React/Tailwind frontend, and a local JSON state store. It is designed for local development and personal workstation workflows, not as a public multi-tenant service.

## At a Glance

| Icon | Area | What it gives you |
| --- | --- | --- |
| 🖥️ | Desktop App | Windows users can launch `LocalAIHub.exe` as a desktop-style app window. |
| 🔐 | Local-first | Credentials and state stay on your machine under `.env` and `data/state.json`. |
| 🔁 | API Gateway | Exposes OpenAI-compatible local endpoints such as `/v1/chat/completions`, `/v1/responses`, and `/v1/messages`. |
| 🧭 | Account Routing | Health checks, quota signals, cooldowns, and failover help choose usable upstream accounts. |
| 📊 | Usage Insight | Shows request count, token usage, cache hit tokens, quota windows, and reset times. |
| 🔌 | Tool Import | Generates `ccswitch://` imports for Codex, Claude Code, and Gemini profiles. |

## What You Get

- Import upstream accounts with an API-key form, batch JSON, or the local OpenAI OAuth flow.
- Issue local client keys with model allowlists, per-minute request limits, and quota caps.
- Proxy OpenAI-compatible `POST /v1/chat/completions`, `POST /v1/responses`, and `GET /v1/models`.
- Proxy OpenAI OAuth accounts through the ChatGPT Codex backend for Codex/Claude Code style local use, including `POST /v1/messages`.
- Support HTTP SSE and WebSocket transport for Codex-shaped requests that need server-side continuation.
- Rotate across healthy upstream accounts, skip limited or cooling-down accounts, and classify upstream failures for safer failover.
- Support non-streaming requests and basic `stream: true` passthrough.
- Track local request count, local usage units, probe status, and rate-limit signals inferred from upstream headers.
- Show sanitized upstream account status without returning raw upstream secrets to the browser.
- Probe upstream account health and discovered model lists.
- Import generated local keys into CCSwitch through a configurable `ccswitch://` launch dialog.
- Provide a focused GPT model catalog with mainstream GPT-5, GPT-4, GPT-4o, GPT-4.1, GPT-3.5, mini, turbo, and Codex variants.

## Console Map

| Icon | Page | Main job |
| --- | --- | --- |
| 🔐 | Account Import | Add API-key accounts, batch JSON, or OpenAI OAuth accounts. Login actions stay as buttons and open focused modal cards. |
| 🧭 | Account Status | Surface usable accounts first, including health, plan, quota windows, reset times, and cooldown signals. |
| 📊 | Usage Stats | Use compact account cards to show request totals, token totals, input/output split, cache hit tokens, and quota percentages. |
| 🔑 | Local Keys | Create local client keys with quota, RPM limits, and a focused mainstream model allowlist. |
| 🔌 | CCSwitch Import | Generate Codex, Claude Code, or Gemini provider profiles from a local key. |

## Desktop App Experience

The Windows launcher is now a desktop-app style entry point:

1. Double-click `LocalAIHub.exe`.
2. A compact preparation window appears while dependencies, build output, and the local runtime are checked.
3. The local service starts in the background.
4. Local AI Hub opens in a dedicated desktop app window.
5. Closing that app window stops the service that was started by the EXE.

This keeps the familiar web UI while removing the old "black console window + browser tab" workflow for normal Windows users.

## Current Scope

- Default host is `127.0.0.1`.
- The UI has no administrator login layer because this MVP is meant for local self-use.
- Raw upstream credentials are stored in the local JSON state file and are not returned by the frontend state API.
- `data/state.json`, `.env`, `dist`, `public`, and `node_modules` are ignored by Git.
- Do not expose this service directly to the public internet without adding authentication, encrypted secret storage, and network hardening.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- Optional: CCSwitch installed locally if you want to use the one-click import flow.

## Quick Start

### 🖥️ Platform Packages

Download the matching artifact from GitHub Releases:

- Windows: `LocalAIHub-v26.1.1.1-win-x64.exe`
- Linux: `LocalAIHub-v26.1.1.1-linux-x86_64.AppImage`, `LocalAIHub-v26.1.1.1-linux-x64.tar.gz`, or `LocalAIHub-v26.1.1.1-linux-arm64.tar.gz`
- macOS: `LocalAIHub-v26.1.1.1-mac-x64.dmg`, `LocalAIHub-v26.1.1.1-mac-arm64.dmg`, or the matching `.zip`
- Docker: `LocalAIHub-v26.1.1.1-docker-image.tar.gz` or `ghcr.io/supadll/local-ai-hub:v26.1.1.1`

Platform behavior:

| Icon | Platform | Run experience |
| --- | --- | --- |
| 🪟 | Windows | Double-click the EXE. It prepares the app, starts the local service in the background, and opens a desktop-style app window. |
| 🧱 | Linux | Run the AppImage or `LocalAIHub.sh`. It prepares the app, starts the local service, and opens the local browser URL. |
| ⌘ | macOS | Run the `.command`, `.dmg`, or `.zip` package. It prepares the app, starts the local service, and opens the local browser URL. |
| 📦 | Docker | Load or pull the image, run the container, then open the mapped local service URL. |

The Windows EXE can run from any local folder, or from the project root during development. On the first run it creates `.env` from `.env.example`, uses an existing Node.js 20+ installation or downloads a portable Node.js runtime, installs npm dependencies, builds the app, starts the local service, and opens Local AI Hub in a desktop app window.

Linux and macOS launchers follow the same prepare/install/build flow, then open `http://127.0.0.1:4100` in the browser. Keep the launcher terminal open on those platforms while the service is running.

Releases are created from version tags. The first release tag should be `v26.1.1.1`; future releases increment the final number, for example `v26.1.1.2`. Release assets only include runnable platform packages.

When the EXE is launched outside a source checkout, it downloads the matching source archive embedded at build time and installs the app under `%LOCALAPPDATA%\LocalAIHub\app`. Local runtime files stay in `.local-runtime`, while `.env` and `data` are preserved across app updates.

On Windows the EXE runs as a desktop app: a small preparation window appears first, then the Local AI Hub app window opens. Closing the app window stops the service started by that EXE.

Useful Windows launcher flags:

```powershell
.\LocalAIHub.exe --prepare-only
.\LocalAIHub.exe --reinstall
.\LocalAIHub.exe --rebuild
.\LocalAIHub.exe --no-open
.\LocalAIHub.exe --update-app
.\LocalAIHub.exe --launcher-info
```

To rebuild the launcher after changing `launcher/LocalAIHubLauncher.cs`:

```powershell
npm run build:launcher
```

The first run needs internet access if dependencies or the portable Node.js runtime are not already present.

Chinese step-by-step guides:

- [WINDOWS-ONE-CLICK.zh-CN.md](./WINDOWS-ONE-CLICK.zh-CN.md)
- [UNIX-ONE-CLICK.zh-CN.md](./UNIX-ONE-CLICK.zh-CN.md)
- [DOCKER.zh-CN.md](./DOCKER.zh-CN.md)
- [RELEASE.zh-CN.md](./RELEASE.zh-CN.md)

### 🛠️ Developer Startup

```bash
npm install
copy .env.example .env
npm run dev
```

Open:

- Local console: `http://127.0.0.1:4100`
- Vite dev server: `http://127.0.0.1:5174`
- Health check: `http://127.0.0.1:4100/health`

For a production-style local run:

```bash
npm install
npm run build
npm start
```

## Environment Variables

See [.env.example](./.env.example).

- `HOST`: backend bind host, default `127.0.0.1`
- `PORT`: backend port, default `4100`
- `DATA_FILE`: local state file path
- `LOG_RETENTION`: retained audit log count
- `OPENAI_OAUTH_CLIENT_ID`: OAuth client ID used by the local login flow
- `OPENAI_OAUTH_AUTH_ENDPOINT`: authorization endpoint
- `OPENAI_OAUTH_TOKEN_ENDPOINT`: token endpoint
- `OPENAI_OAUTH_CALLBACK_PORT`: local callback listener port, default `1455`
- `CODEX_TRANSPORT`: Codex transport mode, `auto` by default; accepts `auto`, `http`, or `websocket`

## Workflow

1. 🖥️ Start the desktop app or local service.
2. 🔐 Import one or more upstream accounts on the Account Import page.
3. 🧪 Run a health check to confirm which accounts are alive and which models are visible.
4. 🔑 Create a local client key on the Local Keys page.
5. 📊 Watch local usage, token totals, cache hit tokens, and quota windows.
6. 🔌 Use the local key from a client, CLI, script, or CCSwitch profile.

## Architecture Snapshot

```text
Desktop App / Browser UI
        |
        v
Express admin API + local OpenAI-compatible API
        |
        +--> Local JSON state store
        +--> OpenAI-compatible upstream providers
        +--> OpenAI OAuth / ChatGPT Codex backend
        +--> CCSwitch import links
```

## Importing Upstream Accounts

### Credential Form

For OpenAI-compatible providers, fill in:

- `name`
- `baseUrl`, for example `https://api.openai.com`
- `apiKey`, your authorized upstream key or token
- `models`, exact model IDs or wildcard rules
- `weight`
- `headers`
- `note`

The UI keeps the secret in a password field and the backend only returns masked account identity in state responses.

### Batch JSON

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

Model rules support:

- Exact ID: `gpt-5.5`
- Prefix wildcard: `gpt-5*`
- Full wildcard: `*`

### OpenAI OAuth Login

The login flow creates a local PKCE session, opens an OpenAI authorization URL, and listens for the callback on `http://localhost:1455/auth/callback`.

The `1455` port is not arbitrary in practice: the public OpenAI client used by Codex-style login flows expects that callback URI. If your browser cannot reach the callback page, the UI also lets you paste the full callback URL manually.

OAuth-imported accounts are saved in the local pool as `openai-oauth` accounts. They are not the same thing as a normal `api.openai.com/v1` API key: Local AI Hub translates local OpenAI/Anthropic-shaped requests to the ChatGPT Codex backend at `/backend-api/codex/responses`.

When a request includes `previous_response_id`, the gateway uses WebSocket transport so server-side continuation can be preserved. Other Codex requests default to HTTP SSE unless `CODEX_TRANSPORT=websocket` is set.

Upstream failures are classified into categories such as auth, quota, rate limit, validation, overloaded, network, and path availability. Retryable failures can move traffic to another eligible account and place the failing account into a short local cooldown.

## Local Client Keys

Create local keys from the Local Keys page. Each key has:

- Allowed models
- Quota limit
- Requests-per-minute limit
- Enabled/disabled state
- Local usage counter

Example API call:

```bash
curl http://127.0.0.1:4100/v1/chat/completions ^
  -H "Authorization: Bearer lah_xxx" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"gpt-5.5\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}"
```

## CCSwitch Import

After creating a local key, click Import Codex, Import Claude Code, or Import Gemini. The UI opens a configuration dialog first:

- Choose the target app.
- Set the provider name.
- Select the primary model from a searchable, scrollable model list.
- For Claude-shaped profiles, optionally set `haikuModel`, `sonnetModel`, and `opusModel`.

Only four model rows are shown at once in the dropdown; scroll to see the rest. If you do not choose a primary model, the default is `gpt-5.5`.

When confirmed, the backend generates a `ccswitch://v1/import?...` URL and the browser hands it to the local protocol handler. CCSwitch must already be installed and registered on the machine.


## Model Catalog Notes

The built-in catalog is a convenience list for selection and wildcard expansion. Codex/OAuth accounts also refresh their visible model list from the Codex backend during health checks. Actual model availability still depends on your upstream account, provider, entitlement, and probe results.


## Testing

```bash
npm test
npm run build
```

## Security Notes

- Only import accounts and keys that you own or are explicitly authorized to use.
- Keep `.env` and `data/state.json` private.
- The current state store is a local JSON file, not encrypted production secret storage.
- The web UI intentionally shows masked upstream credentials only.
- Add authentication and encrypted storage before exposing this beyond your local machine.

## Acknowledgements

Local AI Hub uses and adapts ideas, implementation details, and UI references from the following open-source projects:

- [`icebear0828/codex-proxy`](https://github.com/icebear0828/codex-proxy): Codex/ChatGPT account login flow, Responses API proxying, protocol compatibility ideas, account health/quota handling, token/cache usage concepts, and local desktop gateway experience.
- [`QuantumNous/new-api`](https://github.com/QuantumNous/new-api): multi-provider gateway concepts, account/channel management patterns, usage statistics presentation, quota display ideas, and admin console organization.

Thanks to the maintainers and contributors of both projects. When redistributing this project or further adapting upstream content, keep the upstream attribution and review the corresponding licenses.

## License

No license has been selected yet.
