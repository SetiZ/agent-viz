# Playground

A throwaway Strapi 5 app used to develop and verify the **MCP Viz** plugin. It
ships a seeded `article` content type, enables Strapi's built-in MCP server, and
resolves `strapi-mcp-viz` straight from the monorepo (`config/plugins.js`) so you
always test the current source.

## Boot

The playground is a **standalone Strapi app** — it is not part of the root npm
workspace, so it has its own `node_modules` and needs its own install. From the
repo root, build the plugin first (the playground loads it from `dist/`), then
prepare and boot the playground from inside its directory:

```bash
# repo root: build the plugin the playground will load
npm run build --workspace @mcp-viz/core
npm run build --workspace strapi-mcp-viz

# playground dir: separate install + env + seed
cd playground
npm install
cp .env.example .env        # then set real secrets + MCP_VIZ_LLM_*
node seed.js                # admin user + read-only API token + sample articles
npm run develop
```

Strapi serves on `http://localhost:1337` (admin at `/admin`). The SQLite
database is created in `.tmp/` on first boot.

Log in to the admin (`admin@mcpviz.local` / `McpViz!12345`) and open **MCP Viz**
(or Settings → MCP Viz to configure the plugin).

> `playground/server.js` is a minimal headless launcher (`serveAdminPanel:
false`, `autoReload: false`) used for scripted runs against the plugin's HTTP
> routes without the admin UI.

## Configuration

Copy `.env.example` to `.env` and fill in at minimum the app secrets. The MCP
server is controlled by `MCP_ENABLED` (`config/server.js`).

MCP Viz reads its settings from the plugin's config store (seeded by
`seed.js`), which falls back to these env overrides:

| Variable               | Meaning                                              |
| ---------------------- | ---------------------------------------------------- |
| `MCP_VIZ_MCP_URL`      | Strapi MCP endpoint (defaults to `{server.url}/mcp`) |
| `MCP_VIZ_ADMIN_TOKEN`  | Read-only admin API token                            |
| `MCP_VIZ_LLM_BASE_URL` | OpenAI-compatible `/chat/completions` base URL       |
| `MCP_VIZ_LLM_API_KEY`  | LLM provider key                                     |
| `MCP_VIZ_LLM_MODEL`    | LLM model id                                         |

`server.url` is set to `http://localhost:1337` in `config/server.js` — required
so the plugin can build an absolute MCP URL.

## Seeded content

`seed.js` creates a set of `article` entries (published/unpublished, mixed
categories and publish dates) so there is real data to ask about. It is
idempotent — safe to re-run.

It also creates a super-admin user (`admin@mcpviz.local` / `McpViz!12345`) and a
read-only **admin API token**, and **configures MCP Viz automatically** — it
stores `mcpUrl` + `adminToken` in the plugin's settings **and pins the token
into `.env`** (`MCP_VIZ_ADMIN_TOKEN`), so the plugin works right after seeding
with no manual copy. Re-running `seed.js` after a reset refreshes the pinned
token in `.env`.

## Using the MCP server externally

Strapi exposes its MCP server at `http://localhost:1337/mcp`. Any MCP client can
point at it (the plugin is just one consumer). For example, in Claude Desktop:

```json
{
  "mcpServers": {
    "strapi": {
      "url": "http://localhost:1337/mcp",
      "headers": { "Authorization": "Bearer <admin-api-token>" }
    }
  }
}
```

Note the MCP endpoint requires `Accept: application/json, text/event-stream`
(the MCP SDK transports send this; raw curl needs it too).

## Debugging

The plugin logs each step of a run through Strapi's logger at `debug` level
(question received, parsed intent, plan, each `tool_call`/`tool_result`, blocks,
completion, and errors). To see them, enable verbose logging before boot:

```bash
STRAPI_LOG_LEVEL=debug npm run develop
```

You should then see lines like `run: intent parsed`, `run: plan`,
`mcp: tools/list`, and `run: error` in the console. A failed request such as
`Error: INTENT_PARSE_FAILED` in the UI now includes the first validation problem
with the model and a raw excerpt of the output to help tune the LLM settings in
Settings → MCP Viz.
