# Contributing

Thanks for helping with MCP Viz. This guide covers the commands and conventions
you'll need.

## Prerequisites

- Node `>= 20`
- npm workspaces (run everything from the repo root)

## Setup

```bash
npm install
npm run build --workspace @mcp-viz/core
npm run build --workspace strapi-mcp-viz
```

The plugin must be rebuilt (`dist/`) before the playground or a Strapi app will
pick up admin/server changes — `config/plugins.js` resolves it by path.

The **playground is a separate npm install** — root `npm install` does not cover
it. On a fresh clone, run `npm install` inside `playground/` too, then
`node seed.js` and `cp .env.example .env` (see the playground README).

## Commands

| Command                                        | What it does                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `npm test`                                     | Runs all vitest suites (core + plugin admin).                       |
| `npx vitest run packages/core`                 | Core tests only (Node env).                                         |
| `npx vitest run packages/strapi-mcp-viz/admin` | Admin UI tests only (jsdom).                                        |
| `npm run typecheck`                            | Core typecheck.                                                     |
| `npm run typecheck --workspace strapi-mcp-viz` | Plugin server + admin typecheck.                                    |
| `npm run lint`                                 | ESLint across the repo.                                             |
| `npm run format:check` / `npm run format`      | Prettier check / write.                                             |
| `npm run develop --prefix playground`          | Boot the Strapi playground (or `cd playground && npm run develop`). |

## Conventions

- **No comments unless they earn their place** — prefer expressive names and
  small functions.
- **All user-facing strings are i18n'd** — admin components use `useIntl` with a
  `defaultMessage`; keys live in `packages/strapi-mcp-viz/admin/src/translations/en.json`.
- **Tests mirror the layout** — a `__tests__` folder next to the code it tests
  (`*.test.ts` / `*.test.tsx`).
- **Admin tests** need the `// @vitest-environment jsdom` docblock and mock
  `@strapi/design-system`, `@strapi/admin`, and `react-intl`. See
  `vitest.config.ts` — do not add to the inline/alias lists casually; those
  keep React 19 consistent between the root workspace and the plugin's nested
  React 18 copy.
- **The core is read-only by contract** — new tools/plans must only use MCP read
  methods.
- **Charts are dependency-free SVG** — keep it that way.

## Verifying a change

Before opening a PR, make sure all of these pass locally:

```bash
npm run typecheck
npm run typecheck --workspace strapi-mcp-viz
npm run lint
npm run format:check
npm test
npm run build --workspace strapi-mcp-viz
```

The full workflow (typecheck, lint, format, tests, build) must be green on the
`main` branch.

## Branching & commits

- Branch off `main`; keep changes small and focused.
- Commit messages follow the conventional style used in the log
  (e.g. `feat(plugin): …`, `fix(core): …`, `docs: …`).
- Push your branch and open a PR; tests run on CI.

## Reporting issues

Include: the Strapi version, the Node version, what you asked, and the SSE
stream you got back (or the admin console errors). If the run didn't reach the
LLM, that's usually a config issue — check the **Settings** page and
`server.url`.
