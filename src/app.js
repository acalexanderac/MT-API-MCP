import fs from 'node:fs';
import express from 'express';

import { buildRouteTable, loadSpec, SPEC_PATH } from './lib/spec.js';
import { classifyAll } from './routes/classify.js';
import { registerRoutes } from './routes/register.js';
import { Store } from './lib/store.js';
import { Validator } from './lib/validate.js';
import { EventBus } from './lib/events.js';
import { errorHandler, notFound } from './lib/errors.js';
import { multipartBody } from './lib/multipart.js';
import { basicAuth } from './mw/auth.js';
import { idempotency } from './mw/idempotency.js';
import { rateLimitConfig, rateLimiter } from './mw/ratelimit.js';
import { requestLogging } from './mw/logging.js';
import { seedStore } from './seed.js';

const MAX_BODY_BYTES = 25 * 1024 * 1024;

export function resolveConfig(overrides = {}) {
  const env = process.env;
  const apiKeys = (overrides.apiKeys || env.MT_API_KEYS || 'test-api-key')
    .toString()
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  return {
    organizationId: overrides.organizationId || env.MT_ORGANIZATION_ID || 'test-organization',
    apiKeys: new Set(apiKeys),
    requireAuth: overrides.requireAuth ?? env.MT_REQUIRE_AUTH !== 'false',
    liveMode: overrides.liveMode ?? env.MT_LIVE_MODE === 'true',
    rateLimits: overrides.rateLimits ?? env.MT_RATE_LIMITS !== 'off',
    logging: overrides.logging ?? env.MT_LOGGING !== 'off',
    seed: overrides.seed ?? env.MT_SEED !== 'off',
    seedCount: Number(overrides.seedCount ?? env.MT_SEED_COUNT ?? 3),
    webhookUrl: overrides.webhookUrl ?? env.MT_WEBHOOK_URL ?? null,
    webhookKey: overrides.webhookKey ?? env.MT_WEBHOOK_KEY ?? 'webhook-key',
    persistPath: overrides.persistPath ?? env.MT_PERSIST_PATH ?? null,
    specPath: overrides.specPath ?? env.MT_SPEC_PATH ?? SPEC_PATH,
    port: Number(overrides.port ?? env.PORT ?? 4010),
  };
}

/**
 * Membership relationships that are tracked outside the resource schemas
 * (ledger account categories, settlement entries) still need to answer the
 * list filters that reference them.
 */
function buildPreFilter(ctx) {
  const members = (type, id) => ctx.links.get(`${type}:${id}`) || new Set();

  return (descriptor, entries, query) => {
    if (descriptor.resource === 'ledger_accounts' && query.ledger_account_category_id) {
      const ids = members('category_accounts', query.ledger_account_category_id);
      return entries.filter((entry) => ids.has(entry.id));
    }
    if (descriptor.resource === 'ledger_account_categories' && query.parent_ledger_account_category_id) {
      const ids = members('category_categories', query.parent_ledger_account_category_id);
      return entries.filter((entry) => ids.has(entry.id));
    }
    if (descriptor.resource === 'ledger_entries' && query.ledger_account_settlement_id) {
      const ids = members('settlement_entries', query.ledger_account_settlement_id);
      return entries.filter((entry) => ids.has(entry.id));
    }
    return entries;
  };
}

/** Build the API server. Returns the Express app plus everything it runs on. */
export function buildApp(overrides = {}) {
  const config = resolveConfig(overrides);
  const spec = overrides.spec || loadSpec(config.specPath);
  const descriptors = classifyAll(buildRouteTable(spec));

  const logger = overrides.logger || console;
  const store = new Store({ persistPath: config.persistPath });
  const validator = new Validator(spec);
  const events = new EventBus({
    store,
    webhookUrl: config.webhookUrl,
    webhookKey: config.webhookKey,
    liveMode: config.liveMode,
    logger,
  });

  const ctx = {
    spec,
    store,
    validator,
    events,
    config,
    descriptors,
    logger,
    links: new Map(),
    resources: new Set(descriptors.filter((d) => !d.special).map((d) => d.resource)),
  };
  ctx.preFilter = buildPreFilter(ctx);

  const restored = config.persistPath ? store.load() : false;
  if (!restored && config.seed) seedStore(ctx, { perResource: config.seedCount });

  const app = express();
  app.disable('x-powered-by');
  app.set('json spaces', 0);

  app.use(requestLogging({ logger, enabled: config.logging }));
  app.use(multipartBody({ limit: MAX_BODY_BYTES }));
  app.use(express.json({ limit: MAX_BODY_BYTES, type: ['application/json', 'application/*+json'] }));

  mountMetaRoutes(app, ctx);

  app.use('/api', basicAuth(config));
  app.use('/api', idempotency(new Map()));

  const limiter = rateLimiter({
    limits: rateLimitConfig({ liveMode: config.liveMode }),
    enabled: config.rateLimits,
  });
  const mounted = registerRoutes(app, descriptors, ctx, {
    rateLimit: config.rateLimits ? limiter : null,
  });

  app.use((req, res, next) => {
    next(notFound('path', `Unknown endpoint: ${req.method} ${req.path}`));
  });
  app.use(errorHandler(logger));

  return { app, ctx, config, spec, descriptors: mounted, store };
}

/**
 * Server-level helpers that are not part of the API catalog. They live under
 * `/__meta` so they cannot collide with a real endpoint.
 */
function mountMetaRoutes(app, ctx) {
  const { descriptors, config, store } = ctx;

  app.get('/', (req, res) => {
    res.type('html').send(indexPage(ctx));
  });

  app.get('/__meta/health', (req, res) => {
    res.json({
      status: 'ok',
      live_mode: config.liveMode,
      operations: descriptors.length,
      paths: new Set(descriptors.map((d) => d.path)).size,
      resources: ctx.resources.size,
      records: Object.values(store.stats()).reduce((sum, count) => sum + count, 0),
    });
  });

  app.get('/__meta/routes', (req, res) => {
    res.json(
      descriptors.map((d) => ({
        method: d.method.toUpperCase(),
        path: d.path,
        operation_id: d.operationId,
        tag: d.tag,
        summary: d.summary,
        resource: d.resource,
        kind: d.kind,
        status: d.successStatus,
        handler: handlerName(d),
      }))
    );
  });

  app.get('/__meta/store', (req, res) => {
    res.json(store.stats());
  });

  app.get('/openapi.yaml', (req, res) => {
    res.type('text/yaml').send(fs.readFileSync(config.specPath, 'utf8'));
  });

  app.get('/openapi.json', (req, res) => {
    res.json(ctx.spec);
  });

  app.post('/__meta/reset', (req, res) => {
    store.collections.clear();
    store.seq = 0;
    ctx.links.clear();
    if (config.seed) seedStore(ctx, { perResource: config.seedCount });
    res.json({ status: 'reset', collections: store.stats() });
  });
}

/** How an operation is served — matches the `handler` column in docs/ENDPOINTS.md. */
function handlerName(descriptor) {
  if (descriptor.special) return 'special';
  if (descriptor.kind === 'collection' && descriptor.method === 'get') return 'list';
  if (descriptor.isCreate) return 'create';
  if (descriptor.isShow) return 'get';
  if (descriptor.isUpdate) return 'update';
  if (descriptor.isDelete) return 'delete';
  return descriptor.method;
}

function indexPage(ctx) {
  const { descriptors, config } = ctx;
  const byTag = new Map();
  for (const descriptor of descriptors) {
    if (!byTag.has(descriptor.tag)) byTag.set(descriptor.tag, []);
    byTag.get(descriptor.tag).push(descriptor);
  }
  const sections = [...byTag.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, routes]) => {
      const rows = routes
        .map(
          (route) =>
            `<tr><td class="m">${route.method.toUpperCase()}</td><td><code>${route.path}</code></td><td>${
              route.summary || route.operationId
            }</td></tr>`
        )
        .join('');
      return `<h2>${tag} <span class="count">${routes.length}</span></h2><table>${rows}</table>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Modern Treasury API (local)</title>
<style>
 :root{color-scheme:light dark;--fg:#111;--muted:#666;--line:#e3e3e3;--bg:#fff}
 @media (prefers-color-scheme:dark){:root{--fg:#eee;--muted:#9a9a9a;--line:#333;--bg:#121212}}
 body{margin:0 auto;padding:2rem 1.25rem 4rem;max-width:62rem;font:15px/1.55 ui-sans-serif,system-ui,sans-serif;color:var(--fg);background:var(--bg)}
 h1{font-size:1.4rem;margin:0 0 .25rem}h2{font-size:1rem;margin:2rem 0 .5rem;border-bottom:1px solid var(--line);padding-bottom:.3rem}
 p{color:var(--muted)}table{width:100%;border-collapse:collapse;font-size:13px}
 td{padding:.3rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}
 td.m{width:4.5rem;font-weight:600;font-family:ui-monospace,monospace}
 code{font-family:ui-monospace,SFMono-Regular,monospace}
 .count{color:var(--muted);font-weight:400}
 pre{background:color-mix(in srgb,var(--fg) 7%,transparent);padding:.75rem;border-radius:6px;overflow-x:auto}
</style></head><body>
<h1>Modern Treasury API &mdash; local implementation</h1>
<p>${descriptors.length} operations across ${new Set(descriptors.map((d) => d.path)).size} paths, generated from the published OpenAPI specification.
Authenticate with HTTP basic auth: <code>${config.organizationId}</code> / <code>${[...config.apiKeys][0]}</code>.</p>
<pre>curl -u ${config.organizationId}:${[...config.apiKeys][0]} http://localhost:${config.port}/api/ping</pre>
<p>Server helpers: <code>/__meta/health</code>, <code>/__meta/routes</code>, <code>/__meta/store</code>, <code>/__meta/reset</code>, <code>/openapi.json</code>.</p>
${sections}
</body></html>`;
}

