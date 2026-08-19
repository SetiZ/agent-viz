# PLAN: `mcp-viz` — ask-your-Strapi-data chat with tables & charts, in the admin

Status: Approved — pending implementation
Date: 2026-08-14

## Goal

Build a library that integrates into a Strapi admin dashboard. An admin types a
question ("top-selling articles this month"), a server-side agent answers by
calling Strapi's **built-in MCP server** (`/mcp`) and replies with **structured
JSON blocks** (text, KPIs, tables, charts) rendered in the admin — plus
**saved questions** that can be **pinned to a homepage widget** for reuse.

## Decisions (confirmed)

| Decision            | Choice                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Host location       | Strapi admin plugin (full page + homepage widget)                 |
| LLM orchestration   | Server-side in the plugin (LLM API key never reaches the browser) |
| Block format        | Structured JSON blocks + React renderer                           |
| Data access         | Strapi built-in CRUD MCP tools + client-side aggregation          |
| Repo layout         | Monorepo: framework-agnostic core lib + Strapi plugin             |
| Chart library       | ECharts (via `echarts-for-react`), lazy-loaded                    |
| MCP token           | Manual config in plugin settings (read-only admin token)          |
| Saved queries store | Plugin content type `plugin::mcp-viz.saved-query`                 |

## Architecture

```
User → Strapi admin chat page
         │ POST /mcp-viz/run (SSE stream)
         ▼
strapi-mcp-viz plugin (server)
   agent service ── LLM provider (OpenAI-compatible, config'd) ──► provider API
        │  tool calls (find_article, ...)
        ▼
   MCP client (Node) ── POST /mcp (Bearer admin token from settings) ──► Strapi MCP server
        │  raw records
        ▼
   agent aggregates → emits JSON blocks  ──SSE──►  BlockRenderer (DS tables + ECharts)
```

The plugin server holds the LLM API key and the MCP admin token; the browser
only talks to the plugin's own admin API routes (same-origin, no CORS issue).

## Repo layout (npm workspaces monorepo)

```
agent-viz/
  packages/
    core/          @mcp-viz/core       framework-agnostic lib
    plugin/        strapi-mcp-viz      the Strapi plugin (admin + server)
  playground/                          a throwaway Strapi app w/ sample content to dogfood
  package.json     (workspaces, TS, vitest, eslint, prettier)
```

`@mcp-viz/core` — multi-entry ESM build (tsup):

| Entry    | Contents                                           | Runs in                     |
| -------- | -------------------------------------------------- | --------------------------- |
| `spec`   | Block types + Zod validators + JSON Schema         | browser + Node (isomorphic) |
| `client` | Node MCP client wrapper (Streamable HTTP + Bearer) | Node                        |
| `agent`  | Agent loop + LLM provider interface + SSE format   | Node                        |
| `react`  | BlockRenderer + table/chart/KPI components         | browser                     |

### Block spec (`spec`)

```ts
type Block =
  | { type: 'text'; text: string }
  | { type: 'kpi'; label: string; value: string | number; delta?: number }
  | {
      type: 'table';
      title?: string;
      columns: { key: string; label: string }[];
      rows: Record<string, unknown>[];
    }
  | {
      type: 'bar_chart';
      title?: string;
      x: (string | number)[];
      series: { name: string; data: number[] }[];
      stacked?: boolean;
      horizontal?: boolean;
    }
  | {
      type: 'line_chart';
      title?: string;
      x: (string | number)[];
      series: { name: string; data: number[] }[];
    }
  | { type: 'pie_chart'; title?: string; data: { name: string; value: number }[] };

type AgentAnswer = { summary: string; blocks: Block[] };
```

Zod schemas for each block + a schema-level discriminator validator. Also
export JSON Schema so the LLM can be shown a machine-readable spec in the
system prompt.

### MCP client (`client`)

- `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport` against
  `${STRAPI_URL}/mcp` with the configured Bearer admin token.
- API:
  - `listTools()` — cached (`tools/list`).
  - `callTool(name, args)` — wraps errors, truncates/summarizes very large
    results before handing back to the LLM.
- Strapi's MCP server is stateless (one POST per request); reuse a transport
  across tool calls within a single agent run, tear down after.

### Agent (`agent`)

- **LLM provider interface**: `stream(messages, tools) → AsyncIterable<Delta>`
  (deltas: text, tool calls, final structured JSON).
  - Primary adapter: raw `fetch` against any OpenAI-compatible
    `/chat/completions` with `stream: true` (OpenAI, Groq, OpenRouter, Ollama,
    LM Studio, ...). Keeps deps minimal.
  - Optional later: Anthropic adapter.
- **Tool loop**: build system prompt from `tools/list` (+ schemas + block spec)
  → LLM decides tool calls → run them via the MCP client → feed results back →
  repeat until the LLM emits a final `AgentAnswer`. Cap iterations (default 8).
- **Client-side aggregation**: system prompt instructs the model to fetch
  records via `find_*` tools and aggregate them itself, within limits:
  - ≤ 200 table rows, ≤ 6 series, ≤ 12 x-categories, numbers rounded.
  - Prefer the read-only `find_*`/`find_one_*` tools; the configured token's
    permissions define which tools are visible at all.
- **Validation & repair**: zod-validate the final `AgentAnswer`; one repair pass
  on failure; degrade to a `text` block if still invalid (never crash the chat).
- **SSE stream events** (plugin `/run` endpoint → browser):
  - `meta` — run id, tool count
  - `tool_call` / `tool_result` — progress (name, args / truncated result)
  - `block` — one JSON block (incremental; appended to the message)
  - `done` — final, with run id
  - `error` — failure with message

## Plugin: server (`packages/plugin/server`)

- **Content type** `plugin::mcp-viz.saved-query` (collection type):
  - `title` (string)
  - `question` (text)
  - `resultBlocks` (json snapshot of last run)
  - `isPinned` (boolean, used by the homepage widget)
  - timestamps + creator fields via `setCreatorFields`
  - Native Strapi RBAC + visible in Content Manager.
- **Single type** `plugin::mcp-viz.settings`:
  - `mcpUrl` (default `${server.url}/mcp`), `adminToken`
  - `llmBaseUrl`, `llmApiKey`, `llmModel`
  - Secrets masked on read; optional env overrides:
    `MCP_VIZ_ADMIN_TOKEN`, `MCP_VIZ_LLM_API_KEY`, `MCP_VIZ_LLM_BASE_URL`,
    `MCP_VIZ_LLM_MODEL`.
- **Admin routes** (with plugin permissions):
  - `POST /mcp-viz/run` — SSE stream; body `{ question, savedQueryId?, maxIterations? }`
  - `GET/POST /mcp-viz/queries`, `PUT/DELETE /mcp-viz/queries/:id` — saved queries
  - `GET /mcp-viz/config` (masked) / `PUT /mcp-viz/config` — settings
  - `GET /mcp-viz/tools` — cached `tools/list` output (autocomplete / debug)
- **Services**: `agent` (orchestration), `mcp-client`, `config` (settings +
  env merge + masking).
- **Permissions** registered via the plugin's permission provider:
  - `mcp-viz.configure` (settings)
  - `mcp-viz.run` (run queries)
  - `mcp-viz.saved-query.*` (manage saved queries, from content type)
- Strapi version floor: **≥ 5.49** (MCP server GA in 5.47/5.49). Peer dep
  `@strapi/strapi: ^5.49.0`. Widget API needs ≥ 5.13.

## Plugin: admin (`packages/plugin/admin`)

- **Menu page** (`addMenuLink`, plugin icon):
  - Chat thread: user / assistant messages.
  - Streaming via `fetch` + ReadableStream SSE parsing (auth via the admin
    fetch client headers).
  - Right-hand **Saved queries** panel: list, search, re-run, pin, delete,
    "save current".
  - Streaming cursor + "agent is thinking" state while tool calls happen
    (`tool_call`/`tool_result` events can be shown as progress lines).
- **BlockRenderer** (from `@mcp-viz/core/react`):
  - `text` → Typography
  - `table` → Strapi Design System `Table`
  - `bar_chart` / `line_chart` / `pie_chart` → `echarts-for-react`,
    **lazy-loaded** via dynamic import (keeps admin bundle lean)
  - `kpi` → KPI card (Design System)
  - Unknown/invalid block → safe fallback (raw JSON + warning).
- **Settings page** (`addSettingsLink`): token + LLM provider form, masked
  secret fields.
- **Homepage widget** (`app.widgets.register()`, Strapi ≥ 5.13):
  - Compact render of the pinned saved query's KPIs / mini-chart.
  - `link` → plugin page.
  - Uses `Widget.Loading` / `Widget.Error` / `Widget.NoData` helpers.
- `registerTrads` for i18n; `BlockRenderer` re-exported so a custom dashboard
  (non-Strapi) can reuse it.

## Request/response flows

**Ask a question:**

1. User types a question → `POST /mcp-viz/run` (SSE).
2. Plugin `agent` service builds system prompt (tool list + schemas + block spec
   - aggregation rules) and starts the LLM loop.
3. Agent calls `find_*` tools through the MCP client against Strapi `/mcp`,
   aggregates client-side.
4. Agent emits `AgentAnswer`; plugin streams `block`/`done` events over SSE.
5. Browser appends blocks to the message; BlockRenderer renders them.
6. User may "save" the question (+ result snapshot) to a saved query.

**Pin & reuse:**

1. User pins a saved query (`isPinned: true`).
2. Homepage widget queries the pinned saved query and renders its `resultBlocks`
   compactly (KPI cards / mini chart), linking back to the chat page.

## Testing

| Area            | Tool                                   | What                                                       |
| --------------- | -------------------------------------- | ---------------------------------------------------------- |
| `core/spec`     | vitest                                 | Validators, aggregation helpers, prompt building           |
| `core/agent`    | vitest                                 | Unit with mocked LLM + mocked MCP; validation/repair paths |
| `core/client`   | vitest + playground                    | Integration vs. a running Strapi `/mcp`                    |
| `plugin/server` | vitest/jest + Strapi test harness      | Routes, permissions, RBAC, settings masking                |
| `plugin/admin`  | vitest + React Testing Library + jsdom | Chat, BlockRenderer, saved queries panel, widget           |

## Milestones

1. **Scaffold** — monorepo (workspaces), plugin skeleton (Strapi Plugin SDK
   CLI), core package init, block spec + Zod validators + JSON Schema (+ tests).
   ✅ done — repo layout per above; `@mcp-viz/core` has `spec`, `client`,
   `agent` ESM entries (tsup) + the block spec in `packages/core/src/spec`.
2. **MCP client** — `client` entry; `listTools` cache + `callTool`; integration
   test vs. running Strapi. ✅ done — `packages/core/src/client` wraps
   `@modelcontextprotocol/sdk` `Client` + `StreamableHttpMcpTransport` (Bearer),
   tool cache with 60s TTL.
3. **Agent** — provider interface + OpenAI-compatible adapter, tool loop, SSE
   format, validation/repair (+ mocked tests). ✅ done — `packages/core/src/agent`
   (deterministic planning/retrieval pipeline; LLM used only as intent parser);
   `run.ts` streams ordered SSE events.
4. **Plugin server** — settings single type, saved-query content type, routes,
   permissions. ✅ done — `packages/strapi-mcp-viz/server`: settings single type
   (mcpUrl default `${server.url}/mcp`, masked secrets, env overrides), routes
   (`run`, `queries*`, `config`, `tools`), permissions `run` + `configure`,
   config service, MCP client service, agent wiring. Unit tests in
   `server/tests/` (config/mcp-client/run). **Verified in playground**: MCP
   `tools/list` (`list_article`, `get_article`), `GET config` (masked),
   `GET tools` via plugin transport, and `POST run` SSE → `error` event with
   code `CONFIG_INCOMPLETE` when no LLM is configured (full chain works end to
   end). Green: typecheck, lint, prettier, 173 tests, plugin build.
5. **Plugin admin** — chat page, BlockRenderer (DS tables + lazy ECharts),
   SSE streaming client, saved queries panel, settings page. ✅ done —
   `packages/strapi-mcp-viz/admin`: `./strapi-admin` export + menu link
   (ChartBubble icon), `api/` (getFetchClient wrappers for `queries*`,
   `config`, `tools`; token from localStorage/cookie `jwtToken`; native-fetch
   SSE client `streamRun` + incremental `createSseParser`), `HomePage` (chat
   with streaming, saved-queries panel), `SettingsPage` (LLM + MCP settings
   with masked config), `AssistantMessage`/`ProgressLines` render via core
   `BlockRenderer`. Green: typecheck (server + admin), lint, prettier, 189
   tests (incl. 16 new admin tests), plugin build. **Notes:** admin routes
   mount at `/strapi-mcp-viz/*`; `server.url` + `config/admin.js`
   (`admin.auth.secret`) required; RRD v6 JSX typecheck workaround avoids
   `<Routes>`/`<Route>`; vitest config aliases react/react-dom → root and
   inlines `@strapi/*`+`lodash`+`@radix-ui/*` (design-system ships CJS under
   `type: module`); admin tsconfig `paths` point `react*` to root
   `@types/react` so tests typecheck.
6. **Homepage widget** — `app.widgets.register()`, pinning flow, widget UI.
   ✅ done — widget registered in `admin/src/index.ts` (PuzzlePiece icon, menu
   link, `component` lazy-loads `HomepageWidget`); `HomepageWidget` lists
   pinned saved queries (via `listQueries`) and navigates to the chat page
   with `?question=…&savedQueryId=…`; `HomePage` auto-runs that query on
   arrival and clears the params. 192 tests green (3 new: widget empty
   state, widget navigation, HomePage auto-run), typecheck + lint + prettier
   green, plugin build green.
7. **Polish** — i18n, empty/error states, retry, docs (README), playground app,
   marketplace metadata.
   ✅ done — all user-facing admin strings moved to `useIntl`/`translations/en.json`
   (react-intl added as an externalized dependency; components use
   `formatMessage` with `defaultMessage`s); **Retry** button on failed runs
   (re-runs the question); empty/loading states in thread, saved panel, and
   homepage widget; `README.md` covering setup, env vars, permissions, security,
   and dev workflow; marketplace metadata in `package.json` (keywords, `engines`,
   `strapi.required: false`, `react-intl` dep). Tests mock `react-intl` (its
   nested copy bundles React 18 elements) — `IntlProvider` passthrough +
   `useIntl` returning `defaultMessage`. 193 tests green (1 new retry test),
   typecheck + lint + prettier green, plugin build green.

Notes recorded while verifying M4 (playground):

- Strapi mounts plugin **admin** routes under the plugin name
  (`/strapi-mcp-viz/*`), not `/mcp-viz/*` — PLAN route paths are schematic; the
  real admin-UI base URL is `/strapi-mcp-viz/run`, `/config`, `/tools`,
  `/queries`.
- The host app **must set `server.url`** in `config/server.js`; otherwise
  `server.url` is empty and the default `mcpUrl` becomes a relative `/mcp`,
  which `new StreamableHttpMcpTransport({ url })` rejects with `Invalid URL`.
- Strapi's own `/mcp` requires the client to send
  `Accept: application/json, text/event-stream` (SDK transport does this;
  raw curl without it gets HTTP 406 / `-32000 Not Acceptable`).
- Strapi ≥ 5.52 admin login needs `admin.auth.secret` (JWT) for its refresh
  sessions — `config/admin.js` with `ADMIN_JWT_SECRET` is required or
  `POST /admin/login` 500s.
- M4's `/run` guard: without `llmApiKey` configured the agent service emits an
  SSE `error` event with code `CONFIG_INCOMPLETE` (validates routing +
  permissions + SSE without needing an LLM).
- **Auth footguns (fixed post-M7)**: Strapi's admin API tokens are 256 chars but
  Strapi `string` attributes cap at 255 — `settings` secrets are now `text`.
  `seed.js` writes `mcpUrl` + `adminToken` straight into the plugin's settings
  store so a fresh clone needs no manual token copy; the agent service now
  fails fast with a readable `CONFIG_INCOMPLETE` when `adminToken` is missing
  instead of surfacing the raw MCP `-32000 Authentication required` 401.

## Risks & notes

- **Bundle size**: ECharts is lazy-loaded (dynamic import) so it doesn't bloat
  the initial admin bundle.
- **LLM JSON reliability**: zod validation + one repair pass + graceful
  degradation to a text block.
- **Same-origin**: admin UI ↔ plugin routes need no CORS; the core `client`
  used outside Strapi would require CORS enabled on `/mcp`.
- **Plugin URL**: the agent needs Strapi's own URL (`server.url` /
  `STRAPI_URL`) to reach `/mcp`.
- **Large datasets**: client-side aggregation is bounded (limits above); a
  future custom MCP aggregation tool (server-side group-by/sum) is a known
  extension point if datasets outgrow it.
