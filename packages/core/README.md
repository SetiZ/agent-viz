# @mcp-viz/core

Framework-agnostic core for **MCP Viz**: an ask-your-Strapi-data chat that
produces tables and charts. The core is where the intelligence lives; the
Strapi plugin is just the UI shell.

## Design principle

The LLM is used **only** to parse intent and choose MCP tools. Everything else —
planning, fetching, aggregating, and rendering — is deterministic and auditable.
The pipeline is strictly **read-only**: every tool call is one of Strapi's MCP
read methods (`find` / `findOne`). No writes, no mutations, ever.

This split means the hard parts (aggregation, chart math) are unit-testable
without any LLM, and the same core drives the admin UI and any external MCP
client.

## Pipeline stages

```
question
  → [intent]  LLM parses intent (filters, time range, aggregate intent) — JSON, zod-validated
  → [plan]    intent → ordered list of MCP tool calls (deterministic)
  → [fetch]   each tool call runs against Strapi's MCP server (find/findOne)
  → [aggregate]  raw records → client-side aggregation (group-by, time buckets, sums)
  → [render]  aggregation → typed blocks (text, kpi, table, charts)
```

Each stage emits a typed SSE event so the UI can stream progress live.

## SSE event contract

Events are framed as `event: <type>\ndata: <json>\n\n` and stream in execution
order:

```
meta → intent → plan → tool_call → tool_result → block* → done|error
```

| Event         | Payload                     | Meaning                                                 |
| ------------- | --------------------------- | ------------------------------------------------------- |
| `meta`        | `runId`, `question`, `user` | Run starts                                              |
| `intent`      | `Intent`                    | Parsed filters/time/aggregate intent                    |
| `plan`        | `QueryPlan`                 | Ordered list of tool calls                              |
| `tool_call`   | `id`, `tool`, `args`        | A read call is about to run                             |
| `tool_result` | `id`, `ok`, `records`       | A read call completed                                   |
| `block`       | `Block`                     | A renderable output block                               |
| `done`        | `runId`, `response`         | Final `AnalyticalResponse` (summary + blocks + sources) |
| `error`       | `runId`, `code`, `message`  | A run failed (e.g. `CONFIG_INCOMPLETE`)                 |

## Block types

Blocks are the only shapes the renderer accepts. Every value is attributable via
`sources` references into the response's `sources` array. Free text is always
rendered as plain text — never HTML, never executed.

- `text` — plain paragraph
- `kpi` — single value with optional delta and direction
- `table` — columns + rows (row/column alignment validated by zod)
- `line_chart` / `bar_chart` — category axis + one or more series
- `pie_chart` — name/value slices
- `error` — structured error with code + message

## Package exports

| Export                 | Contents                                             |
| ---------------------- | ---------------------------------------------------- |
| `@mcp-viz/core/agent`  | SSE event types, stream orchestration, run service   |
| `@mcp-viz/core/spec`   | zod schemas and types for blocks, filters, responses |
| `@mcp-viz/core/client` | MCP client wiring, data fetching, user context       |
| `@mcp-viz/core/react`  | `BlockRenderer` React component for the block schema |

## Extension points

- **Add a block type** — extend `spec/blocks.ts` with a zod schema, add it to
  `blockSchema` + `BLOCK_TYPES`, and teach the renderer (`react`) and the
  aggregation builder how to emit it.
- **Add an MCP tool** — register it in `client/registry.ts`; the planner and
  prompt builder pick it up automatically.
- **Swap the LLM provider** — `intent/` only needs an OpenAI-compatible
  `/chat/completions` endpoint.

## Tests

```bash
npm test                       # vitest across the workspace
npx vitest run packages/core   # core only
```

Core tests run under Node (no jsdom) and cover the aggregation engine,
time-bucketing, filters, block validation, the data client, and the
orchestrator.
