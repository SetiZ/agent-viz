# agent-viz

Natural-language chat over your Strapi content, inside the Strapi admin. Ask a
question in plain English and get tables, charts, and text answers — without
writing queries.

`agent-viz` is a monorepo that ships two packages plus a development playground:

| Package                           | What it is                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (`@mcp-viz/core`) | Deterministic, **read-only** agent pipeline: LLM intent parsing → MCP tool plan → data fetch → client-side aggregation → dependency-free SVG charts. Shared SSE contract and React block renderer. |
| `packages/strapi-mcp-viz`         | The Strapi plugin: admin chat UI, settings (MCP + LLM), saved queries, homepage widget, i18n, marketplace metadata.                                                                                |
| `playground`                      | A throwaway Strapi 5 app with seed content, MCP enabled, and env overrides for the plugin.                                                                                                         |

## How it works

The LLM is used **only** to parse intent and pick which MCP tools to call. The
pipeline that plans, fetches, aggregates, and renders the answer is deterministic
and strictly read-only — it only ever calls Strapi's MCP read methods
(`find` / `findOne`) and never writes. The admin UI streams the answer over SSE:

```
meta → intent → plan → tool_call → tool_result → block* → done|error
```

Charts are rendered as inline SVG (no chart library), so the admin bundle stays
small.

## Getting started

```bash
npm install
npm run build --workspace @mcp-viz/core
npm run build --workspace strapi-mcp-viz   # compile the plugin to dist/
```

### Run the playground

```bash
npm run develop --workspace playground
```

The playground boots Strapi on `http://localhost:1337`, seeds sample articles,
and enables the MCP server. Log in to the admin and open **MCP Viz**.

Point the plugin at your LLM by setting these in `playground/.env` (see
`playground/.env.example`):

```bash
MCP_VIZ_LLM_BASE_URL=https://api.openai.com/v1
MCP_VIZ_LLM_API_KEY=sk-...
MCP_VIZ_LLM_MODEL=gpt-4o-mini
```

The MCP endpoint URL and admin token can be set in the plugin's **Settings**
page, or via `MCP_VIZ_MCP_URL` / `MCP_VIZ_ADMIN_TOKEN`.

## Development

```bash
npm test                  # vitest (core + plugin tests)
npm run typecheck         # core typecheck
npm run typecheck --workspace strapi-mcp-viz   # server + admin typecheck
npm run lint
npm run format:check
```

### Testing the admin UI

Admin tests need a jsdom environment (`// @vitest-environment jsdom` docblock)
and mock `@strapi/design-system`, `@strapi/admin`, and `react-intl` — see
`vitest.config.ts` for the aliases and dependency inlining that keep React 19
consistent between the root workspace and the plugin's nested React 18 copy.

## Documentation

- Plugin setup, permissions, and security notes: `packages/strapi-mcp-viz/README.md`
- Core architecture, SSE contract, block schema, and extension points: `packages/core/README.md`
- Playground setup, env vars, and connecting external MCP clients: `playground/README.md`
- Contribution workflow, commands, and conventions: `CONTRIBUTING.md`
- Full build history and design decisions: `PLAN.md`

## License

MIT
