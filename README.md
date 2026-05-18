# Local AI Hub

[中文文档](./README.zh-CN.md)

Local AI Hub is a local-first OpenAI-compatible gateway for personal use. It lets you import upstream accounts that you own or are explicitly authorized to use, issue local API keys, route requests through those upstreams, and track local quota usage from one web console.

The project is intentionally small and self-contained: an Express/TypeScript backend, a React/Tailwind frontend, and a local JSON state store. It is designed for local development and personal workstation workflows, not as a public multi-tenant service.

## Features

- Import upstream accounts with an API-key form, batch JSON, or the local OpenAI OAuth flow.
- Issue local client keys with model allowlists, per-minute request limits, and quota caps.
- Proxy OpenAI-compatible `POST /v1/chat/completions`, `POST /v1/responses`, and `GET /v1/models`.
- Support non-streaming requests and basic `stream: true` passthrough.
- Track local request count, local usage units, probe status, and rate-limit signals inferred from upstream headers.
- Show sanitized upstream account status without returning raw upstream secrets to the browser.
- Probe upstream account health and discovered model lists.
- Import generated local keys into CCSwitch through a configurable `ccswitch://` launch dialog.
- Provide a broad GPT model catalog, including GPT-5.5, GPT-5.4, GPT-5.3 Codex, GPT-5.2, GPT-5, GPT-4.1, GPT-4o, GPT-4, GPT-3.5, GPT-3 base replacements, image models, and GPT-OSS IDs.

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

## Workflow

1. Start the service.
2. Open the local console.
3. Import one or more upstream accounts on the Account Import page.
4. Run a health check to confirm which accounts are alive and which models are visible.
5. Create a local client key on the Local Keys page.
6. Use the local key from a client, CLI, script, or CCSwitch profile.

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

OAuth-imported accounts are saved in the local pool as `openai-oauth` accounts. They are useful for Codex-style backend access and probing, but they are not the same thing as a normal `api.openai.com/v1` API key.

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

## API Surface

Admin endpoints:

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

Proxy endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`

## Model Catalog Notes

The built-in catalog is a convenience list for selection and wildcard expansion. It is based on OpenAI model docs plus project-specific Codex-compatible IDs. Actual model availability still depends on your upstream account, provider, entitlement, and probe results.

For example, the catalog can include `gpt-5.5-pro`, but a request will only succeed if the selected upstream account can actually access that model.

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

## License

No license has been selected yet.
