# MCP Viz

Natural-language chat over your Strapi content, inside the Strapi admin. Ask a
question in plain English and get tables, charts, and text answers — without
writing queries.

MCP Viz connects the Strapi admin to Strapi's built-in **MCP server** (`/mcp`).
An LLM turns your question into a plan of MCP tool calls; a deterministic
pipeline fetches the data, aggregates it client-side, and renders it as
dependency-free SVG charts. The pipeline is **strictly read-only** — it can only
use Strapi's read methods (find / findOne) and never writes.

## Requirements

- Strapi `>= 5.52` (needs the built-in MCP server and the `/admin/login`
  session flow)
- Node `>= 20`
- An OpenAI-compatible LLM endpoint (base URL + API key + model id) for the
  natural-language layer

## Installation

```bash
npm install strapi-mcp-viz
```

Then in your Strapi app:

1. **Publish the plugin** — in the admin, open _MCP Viz → Settings_ and fill in:
   - `MCP URL` — your Strapi MCP endpoint (defaults to `{server.url}/mcp`;
     set `server.url` in `config/server.js` so the URL is absolute).
   - `MCP admin token` — a read-only **Admin API token** created in
     _Settings → API Tokens_ (given the plugin is read-only, restrict the token
     to `find`/`findOne` permissions if you want a tighter surface).
   - `LLM base URL` / `LLM API key` / `LLM model` — an OpenAI-compatible
     `/chat/completions` endpoint.
   - Secrets (`adminToken`, `llmApiKey`) are stored encrypted and masked in the
     UI; leaving the field blank keeps the stored value.

2. **Permissions** — grant the `MCP Viz` role permission to the plugin
   (read-only by design). Unauthorized users get an explicit error.

Alternatively, set the same values via the environment variables the plugin
reads at boot: `MCP_VIZ_MCP_URL`, `MCP_VIZ_ADMIN_TOKEN`,
`MCP_VIZ_LLM_BASE_URL`, `MCP_VIZ_LLM_API_KEY`, `MCP_VIZ_LLM_MODEL`.

## Usage

- **Ask your data** — type a question like _"how many articles were published
  last month, by category?"_. The assistant streams its plan, the MCP tool calls
  it makes, and the resulting text/table/chart blocks.
- **Save answers** — a finished answer can be saved as a query.
- **Pin** — pinned saved queries appear as a widget on the Strapi admin
  homepage; clicking one jumps straight to a fresh run.

## Development

This monorepo contains `@mcp-viz/core` (pipeline, rendering, SSE contract) and
the `strapi-mcp-viz` plugin. From the repo root:

```bash
npm install
npm run build --workspace strapi-mcp-viz   # compile the plugin to dist/
npm run typecheck --workspace strapi-mcp-viz
npm run lint
npx vitest run                              # core + plugin tests
```

Run the included playground app to try it end-to-end (it's a standalone app,
so install inside it first):

```bash
cd playground
npm install
node seed.js          # admin user + read-only API token + sample articles
cp .env.example .env  # then set MCP_VIZ_LLM_*
npm run develop
```

Then set `MCP_VIZ_LLM_*` in `playground/.env` to point at your LLM endpoint,
log in to the admin (`admin@mcpviz.local` / `McpViz!12345`) and open
**MCP Viz**.

## Security notes

- The agent pipeline never issues write MCP calls; every tool is a read.
- Secrets are stored via Strapi's encrypted config storage and never returned
  in full by the settings API.
- The admin UI and plugin routes are same-origin, so no extra CORS config is
  needed.

## License

MIT
