'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const TOKEN_NAME = 'MCP Viz playground';
const TOKEN_FILE = path.join(__dirname, '.mcp-token');

const ARTICLES = [
  { title: 'The future of headless CMS', body: 'A look at what comes next.', status: 'published', views: 342, author: 'Ada' },
  { title: 'Strapi 5 in production', body: 'Scaling tips from real deployments.', status: 'published', views: 812, author: 'Grace' },
  { title: 'Draft: agent tooling survey', body: 'Notes for an upcoming article.', status: 'draft', views: 0, author: 'Ada' },
  { title: 'MCP for content teams', body: 'How model context protocol helps editors.', status: 'review', views: 25, author: 'Linus' },
  { title: 'Review: vector search options', body: 'Comparing pgvector and Meilisearch.', status: 'review', views: 41, author: 'Grace' },
  { title: 'Draft: SEO checklist 2026', body: 'An internal checklist.', status: 'draft', views: 0, author: 'Linus' },
];

const readDisplayedContentTypeUids = (strapi) =>
  Object.entries(strapi.contentTypes)
    .filter(([uid]) => uid.startsWith('api::'))
    .map(([uid]) => uid);

async function ensureAdminUser(strapi) {
  const userService = strapi.admin.services.user;
  const existing = await userService.exists({ email: 'admin@mcpviz.local' });
  if (existing) {
    return userService.findOneByEmail('admin@mcpviz.local');
  }
  const superAdminRole = await strapi.admin.services.role.getSuperAdmin();
  return userService.create({
    email: 'admin@mcpviz.local',
    firstname: 'MCP',
    lastname: 'Viz',
    password: 'McpViz!12345',
    isActive: true,
    roles: superAdminRole ? [superAdminRole.id] : [],
  });
}

async function ensureAdminToken(strapi, owner) {
  const tokenService = strapi.admin.services['api-token-admin'];
  const existing = await tokenService.exists({ name: TOKEN_NAME });
  if (existing) {
    const plaintext = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : '';
    if (plaintext) {
      console.log('[seed] admin token already exists, reusing stored key');
      return plaintext;
    }
    throw new Error(`Token "${TOKEN_NAME}" exists but its plaintext key is not stored. Delete it and re-run.`);
  }

  const uids = readDisplayedContentTypeUids(strapi);
  const adminPermissions = uids.map((subject) => ({
    action: 'plugin::content-manager.explorer.read',
    subject,
  }));

  const created = await tokenService.create(
    {
      kind: 'admin',
      name: TOKEN_NAME,
      description: 'Read-only access for MCP Viz playground',
      lifespan: null,
      adminPermissions,
    },
    owner,
  );

  fs.writeFileSync(TOKEN_FILE, created.accessKey);
  console.log('[seed] created admin API token');
  return created.accessKey;
}

async function ensureArticles(strapi) {
  const count = await strapi.db.query('api::article.article').count();
  if (count > 0) {
    console.log('[seed] articles already present');
    return;
  }
  for (const data of ARTICLES) {
    await strapi.entityService.create('api::article.article', { data });
  }
  console.log(`[seed] seeded ${ARTICLES.length} articles`);
}

/** Configures MCP Viz (mcpUrl + adminToken) so the plugin works out of the box. */
async function ensureVizSettings(strapi, token) {
  const mcpUrl = `http://localhost:${strapi.config.get('server.port', 1337)}/mcp`;
  const plugin = strapi.plugin('strapi-mcp-viz');
  if (plugin?.service('config')?.set) {
    await plugin.service('config').set({ mcpUrl, adminToken: token });
    console.log(`[seed] configured MCP Viz settings (mcpUrl=${mcpUrl})`);
  }
  writeEnvToken(token);
}

const ENV_FILE = path.join(__dirname, '.env');
const ENV_EXAMPLE_FILE = path.join(__dirname, '.env.example');

/** Ensures .env exists, then pins MCP_VIZ_ADMIN_TOKEN so env never overrides with a stale value. */
function writeEnvToken(token) {
  if (!fs.existsSync(ENV_FILE)) {
    fs.copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
    console.log('[seed] created .env from .env.example');
  }
  const line = `MCP_VIZ_ADMIN_TOKEN=${token}`;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  const index = lines.findIndex((l) => l.startsWith('MCP_VIZ_ADMIN_TOKEN='));
  if (index >= 0) {
    lines[index] = line;
  } else {
    lines.push(line);
  }
  fs.writeFileSync(ENV_FILE, `${lines.join('\n')}\n`);
  console.log('[seed] pinned MCP_VIZ_ADMIN_TOKEN in .env');
}

async function main() {
  const strapi = await createStrapi({ autoReload: false, serveAdminPanel: false }).load();
  try {
    const admin = await ensureAdminUser(strapi);
    const token = await ensureAdminToken(strapi, admin);
    await ensureArticles(strapi);
    await ensureVizSettings(strapi, token);
    console.log(`[seed] done. MCP token: ${token}`);
  } finally {
    await strapi.destroy();
  }
}

main().catch((error) => {
  console.error('[seed] failed', error);
  process.exit(1);
});