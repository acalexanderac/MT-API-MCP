/**
 * Exercises every operation in the catalog against the running server and
 * checks each response against the schema the OpenAPI document declares, then
 * runs focused checks for the API's cross-cutting behaviour (auth, pagination,
 * idempotency, metadata, rate limits, webhooks).
 *
 *   npm run smoke
 */
import { buildApp } from '../src/app.js';
import { belongsToParent } from '../src/lib/resources.js';
import { synth } from '../src/lib/synth.js';

const ORG = 'test-organization';
const KEY = 'test-api-key';
const AUTH = `Basic ${Buffer.from(`${ORG}:${KEY}`).toString('base64')}`;

const METHOD_ORDER = { get: 0, post: 1, put: 2, patch: 3, delete: 4 };

/** Bodies that must reference records that really exist. */
const BODY_OVERRIDES = {
  patchLedgerAccountSettlementEntries: (ctx) => ({
    ledger_entry_ids: [firstId(ctx, 'ledger_entries')],
  }),
  deleteLedgerAccountSettlementEntries: (ctx) => ({
    ledger_entry_ids: [firstId(ctx, 'ledger_entries')],
  }),
  completeVerificationExternalAccount: () => ({ amounts: [32, 45] }),
  verifyExternalAccount: (ctx) => ({
    originating_account_id: firstId(ctx, 'internal_accounts'),
    payment_type: 'ach',
  }),
  createBulkRequest: (ctx) => ({
    action_type: 'create',
    resource_type: 'payment_order',
    resources: [
      {
        type: 'ach',
        amount: 5000,
        direction: 'credit',
        originating_account_id: firstId(ctx, 'internal_accounts'),
        receiving_account_id: firstId(ctx, 'external_accounts'),
      },
    ],
  }),
  createDocument: (ctx) => ({
    document_type: 'invoice',
    documentable_id: firstId(ctx, 'counterparties'),
    documentable_type: 'counterparty',
    file: { filename: 'invoice.pdf', content_type: 'application/pdf', size: 1024 },
  }),
  createDocumentNested: () => ({
    document_type: 'invoice',
    file: { filename: 'invoice.pdf', content_type: 'application/pdf', size: 2048 },
  }),
};

/** Query strings for operations with required or meaningful filters. */
const QUERY_OVERRIDES = {
  validateRoutingNumber: { routing_number: '021000021', routing_number_type: 'aba' },
};

const firstId = (ctx, resource) => ctx.store.entries(resource)[0]?.id ?? null;
const nthId = (ctx, resource, n) => ctx.store.entries(resource)[n]?.id ?? null;

function pluralize(word) {
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** Pick the polymorphic type whose records actually have children here. */
function resolveTypeParam(descriptor, param, ctx) {
  const options = param.schema?.enum?.length ? param.schema.enum : ['external_accounts'];
  const entries = ctx.store.entries(descriptor.resource);

  const linked = options.find((option) => {
    const parentId = firstId(ctx, option);
    return (
      parentId && entries.some((entry) => belongsToParent(entry, { type: option, id: parentId }))
    );
  });
  return linked || options.find((option) => ctx.store.count(option) > 0) || options[0];
}

/** Resolve the path parameters of a route to ids of seeded records. */
function resolvePath(descriptor, ctx) {
  const params = {};
  const pathParams = descriptor.parameters.filter((param) => param.in === 'path');
  const parent = descriptor.parent;

  // Polymorphic type segments first: the ids below depend on them.
  for (const param of pathParams) {
    if (!param.name.endsWith('_type')) continue;
    params[param.name] = resolveTypeParam(descriptor, param, ctx);
  }

  const parentType = parent ? parent.type || params[parent.typeParam] : null;
  if (parent?.idParam) params[parent.idParam] = firstId(ctx, parentType);

  for (const param of pathParams) {
    if (params[param.name] !== undefined) continue;

    if (param.name === descriptor.idParam) {
      const scope = parentType ? { type: parentType, id: params[parent.idParam] } : null;
      const entries = ctx.store.entries(descriptor.resource);
      const match = scope ? entries.find((entry) => belongsToParent(entry, scope)) : entries[0];
      params[param.name] = (match || entries[0])?.id ?? null;
      continue;
    }

    // Paired polymorphic ids: documentable_id, itemizable_id, account_id.
    const pairedType = params[param.name.replace(/_id$/, '_type')];
    if (pairedType) {
      params[param.name] = firstId(ctx, pairedType);
      continue;
    }

    // Everything else names its collection: sub_category_id, payment_order_id.
    const collection = pluralize(param.name.replace(/^sub_/, '').replace(/_id$/, ''));
    params[param.name] = firstId(ctx, collection);
  }

  // A route that takes two ids of the same collection needs two records.
  const seen = new Set();
  for (const param of pathParams) {
    const value = params[param.name];
    if (!value || !seen.has(value)) {
      if (value) seen.add(value);
      continue;
    }
    const collection =
      param.name === descriptor.idParam
        ? descriptor.resource
        : pluralize(param.name.replace(/^sub_/, '').replace(/_id$/, ''));
    const alternative = ctx.store
      .entries(collection)
      .map((entry) => entry.id)
      .find((id) => !seen.has(id));
    if (alternative) {
      params[param.name] = alternative;
      seen.add(alternative);
    }
  }
  return params;
}

/** Drop nulls a synthesized body cannot legally carry. */
function pruneNulls(value) {
  if (Array.isArray(value)) return value.map(pruneNulls);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, inner]) => inner !== null)
      .map(([key, inner]) => [key, pruneNulls(inner)])
  );
}

/** Walk a JSON pointer, returning the container and key it addresses. */
function locate(root, pointer) {
  const parts = pointer.split('/').slice(1).map((part) => part.replace(/~1/g, '/'));
  let node = root;
  for (const part of parts.slice(0, -1)) {
    if (node === undefined || node === null) return null;
    node = node[Array.isArray(node) ? Number(part) : part];
  }
  const key = parts[parts.length - 1];
  if (!node || typeof node !== 'object' || key === undefined) return null;
  return { container: node, key: Array.isArray(node) ? Number(key) : key };
}

/**
 * Request schemas for recursive resources (a legal entity inside a legal
 * entity association inside a legal entity) cannot be filled in completely, so
 * drop whatever the schema rejects until the body validates.
 */
function sanitize(ctx, descriptor, body) {
  let candidate = body;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const errors = ctx.validator.bodyErrors(descriptor, candidate);
    if (!errors.length) return candidate;

    const error = errors[0];
    const pointer =
      error.keyword === 'required'
        ? error.instancePath
        : error.instancePath || `/${error.params?.missingProperty || ''}`;
    const target = locate(candidate, pointer);
    if (!target) return candidate;

    if (Array.isArray(target.container)) target.container.splice(target.key, 1);
    else delete target.container[target.key];
  }
  return candidate;
}

function buildBody(descriptor, ctx) {
  if (BODY_OVERRIDES[descriptor.operationId]) {
    return BODY_OVERRIDES[descriptor.operationId](ctx);
  }
  if (!descriptor.requestBodySchema) {
    return ['post', 'patch', 'put'].includes(descriptor.method) ? {} : undefined;
  }
  const generated = pruneNulls(
    synth(ctx.spec, descriptor.requestBodySchema, {
      seed: `request:${descriptor.operationId}`,
      objectName: descriptor.objectName,
    })
  );
  return sanitize(ctx, descriptor, generated);
}

function buildQuery(descriptor, ctx) {
  const override = QUERY_OVERRIDES[descriptor.operationId];
  if (override) return new URLSearchParams(override).toString();

  const required = descriptor.parameters.filter((p) => p.in === 'query' && p.required);
  if (!required.length) return '';
  const query = new URLSearchParams();
  for (const param of required) {
    const value = synth(ctx.spec, param.schema || { type: 'string' }, {
      seed: `query:${descriptor.operationId}:${param.name}`,
      objectName: param.name,
    });
    query.set(param.name, String(value));
  }
  return query.toString();
}

async function main() {
  // Explicit credentials keep the suite independent of .env / the environment.
  const built = buildApp({
    organizationId: ORG,
    apiKeys: KEY,
    logging: false,
    rateLimits: false,
    seedCount: 3,
  });
  const { ctx, descriptors } = built;
  const server = built.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { body, headers = {}, auth = true } = {}) => {
    const init = { method: method.toUpperCase(), headers: { ...headers } };
    if (auth) init.headers.Authorization = AUTH;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, init);
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, body: json, text };
  };

  const failures = [];
  const results = [];

  // ---- 1. every operation in the catalog ----------------------------------
  const ordered = [...descriptors].sort(
    (a, b) => METHOD_ORDER[a.method] - METHOD_ORDER[b.method] || a.path.localeCompare(b.path)
  );

  for (const descriptor of ordered) {
    const params = resolvePath(descriptor, ctx);
    let path = descriptor.path;
    let missing = null;
    for (const [name, value] of Object.entries(params)) {
      if (value === null || value === undefined) missing = name;
      path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
    }
    const query = buildQuery(descriptor, ctx);
    if (query) path += `?${query}`;

    if (missing) {
      failures.push(`${descriptor.operationId}: no seeded record for path param ${missing}`);
      results.push({ descriptor, status: 'skipped' });
      continue;
    }

    const body = buildBody(descriptor, ctx);
    const response = await call(descriptor.method, path, { body });

    const expected = descriptor.successStatus || 200;
    const statusOk =
      response.status === expected ||
      // `downloadDocument` has no declared 2xx; 200 is the real behaviour.
      (!descriptor.producesJson && response.status === 200);

    if (!statusOk) {
      failures.push(
        `${descriptor.method.toUpperCase()} ${descriptor.path} -> ${response.status} ` +
          `(expected ${expected}) ${JSON.stringify(response.body)?.slice(0, 220)}`
      );
      results.push({ descriptor, status: 'failed' });
      continue;
    }

    const schemaErrors =
      descriptor.producesJson && response.body !== undefined
        ? ctx.validator.checkResponse(descriptor, response.body)
        : [];
    if (schemaErrors.length) {
      failures.push(
        `${descriptor.method.toUpperCase()} ${descriptor.path} response does not match schema: ` +
          schemaErrors.slice(0, 3).join('; ')
      );
      results.push({ descriptor, status: 'schema' });
      continue;
    }
    results.push({ descriptor, status: 'passed' });
  }

  // ---- 2. cross-cutting behaviour ----------------------------------------
  const checks = [];
  const check = (name, condition, detail = '') => {
    checks.push({ name, ok: Boolean(condition), detail });
    if (!condition) failures.push(`behaviour: ${name} ${detail}`);
  };

  const unauthorized = await call('get', '/api/ping', { auth: false });
  check('401 without credentials', unauthorized.status === 401, `got ${unauthorized.status}`);
  check(
    '401 body uses the documented error shape',
    unauthorized.body?.errors?.code === 'invalid_key' && Array.isArray(unauthorized.body?.error_list)
  );

  const badKey = await fetch(`${base}/api/ping`, {
    headers: { Authorization: `Basic ${Buffer.from(`${ORG}:nope`).toString('base64')}` },
  });
  check('401 with a wrong API key', badKey.status === 401, `got ${badKey.status}`);

  const ping = await call('get', '/api/ping');
  check('ping returns pong', ping.body?.ping === 'pong');

  const missing = await call('get', '/api/payment_orders/3fa85f64-5717-4562-b3fc-2c963f66afa6');
  check('404 for an unknown id', missing.status === 404, `got ${missing.status}`);
  check('404 error code', missing.body?.errors?.code === 'resource_not_found');

  const invalid = await call('post', '/api/counterparties', { body: { name: 42 } });
  check('400 for an invalid parameter type', invalid.status === 400, `got ${invalid.status}`);
  check(
    'invalid parameter names the field',
    invalid.body?.errors?.parameter === 'name',
    JSON.stringify(invalid.body?.errors)
  );

  const missingParam = await call('post', '/api/ledger_transactions', { body: {} });
  check(
    '422 when a required parameter is missing',
    missingParam.status === 422,
    `got ${missingParam.status} ${JSON.stringify(missingParam.body?.errors)}`
  );

  const page1 = await call('get', '/api/payment_orders?per_page=1');
  check('pagination returns per_page records', page1.body?.length === 1, `got ${page1.body?.length}`);
  check('X-Per-Page header', page1.headers.get('x-per-page') === '1');
  const cursor = page1.headers.get('x-after-cursor');
  check('X-After-Cursor header present mid-list', Boolean(cursor));
  const page2 = await call('get', `/api/payment_orders?per_page=1&after_cursor=${cursor}`);
  check(
    'cursor advances to the next record',
    page2.body?.[0]?.id && page2.body[0].id !== page1.body[0].id
  );
  const bigPage = await call('get', '/api/payment_orders?per_page=500');
  check('per_page is capped at 100', bigPage.headers.get('x-per-page') === '100');

  const created = await call('post', '/api/counterparties', {
    body: { name: 'Acme Corp', metadata: { team: 'treasury', temp: 'remove-me' } },
  });
  check('create returns 201', created.status === 201, `got ${created.status}`);
  check('create echoes submitted fields', created.body?.name === 'Acme Corp');
  check('create sets object and live_mode', created.body?.object === 'counterparty' && created.body?.live_mode === false);

  const fetched = await call('get', `/api/counterparties/${created.body.id}`);
  check('created record is retrievable', fetched.body?.id === created.body.id);

  const patched = await call('patch', `/api/counterparties/${created.body.id}`, {
    body: { metadata: { temp: '', region: 'us-west' } },
  });
  check('metadata merges on update', patched.body?.metadata?.team === 'treasury' && patched.body?.metadata?.region === 'us-west');
  check('metadata unsets keys set to an empty string', patched.body?.metadata?.temp === undefined);

  const filtered = await call('get', '/api/counterparties?metadata[region]=us-west');
  check('metadata filtering works', filtered.body?.some((row) => row.id === created.body.id));

  const idemKey = `smoke-${Date.now()}`;
  const first = await call('post', '/api/counterparties', {
    body: { name: 'Idempotent Co' },
    headers: { 'Idempotency-Key': idemKey },
  });
  const replay = await call('post', '/api/counterparties', {
    body: { name: 'Idempotent Co' },
    headers: { 'Idempotency-Key': idemKey },
  });
  check('idempotent replay returns the first record', replay.body?.id === first.body?.id);
  check('replay is flagged', replay.headers.get('idempotent-replayed') === 'true');

  const longKey = await call('post', '/api/counterparties', {
    body: { name: 'x' },
    headers: { 'Idempotency-Key': 'k'.repeat(181) },
  });
  check('over-long idempotency keys are rejected', longKey.status === 400, `got ${longKey.status}`);

  const eventsBefore = await call('get', '/api/events?per_page=100');
  await call('post', '/api/ledgers', { body: { name: 'Events ledger' } });
  const eventsAfter = await call('get', '/api/events?per_page=100');
  check(
    'creating a resource appends an event',
    eventsAfter.body.length > eventsBefore.body.length,
    `${eventsBefore.body.length} -> ${eventsAfter.body.length}`
  );
  check(
    'event names follow <resource>.<action>',
    eventsAfter.body.some((event) => event.event_name === 'ledger.created')
  );

  const categoryId = firstId(ctx, 'ledger_account_categories');
  const accountId = firstId(ctx, 'ledger_accounts');
  await call('put', `/api/ledger_account_categories/${categoryId}/ledger_accounts/${accountId}`);
  const inCategory = await call('get', `/api/ledger_accounts?ledger_account_category_id=${categoryId}`);
  check(
    'category membership drives the list filter',
    inCategory.body?.length === 1 && inCategory.body[0].id === accountId,
    `got ${inCategory.body?.length}`
  );
  await call('delete', `/api/ledger_account_categories/${categoryId}/ledger_accounts/${accountId}`);
  const afterRemoval = await call('get', `/api/ledger_accounts?ledger_account_category_id=${categoryId}`);
  check('membership removal is reflected', afterRemoval.body?.length === 0);

  const documentId = firstId(ctx, 'documents');
  const download = await call('get', `/api/documents/${documentId}/download`);
  check('document download returns bytes', download.status === 200 && download.text.startsWith('%PDF'));
  check(
    'download sets Content-Disposition',
    (download.headers.get('content-disposition') || '').includes('attachment')
  );

  const documentOwner = await call('post', '/api/counterparties', { body: { name: 'Doc Owner' } });
  const nestedDocument = await call('post', `/api/counterparties/${documentOwner.body.id}/documents`, {
    body: {
      document_type: 'invoice',
      file: { filename: 'statement.pdf', content_type: 'application/pdf', size: 512 },
    },
  });
  check('nested create attaches to its parent', nestedDocument.status === 201, `got ${nestedDocument.status}`);
  check(
    'nested create records the documentable',
    nestedDocument.body?.documentable_id === documentOwner.body.id &&
      nestedDocument.body?.documentable_type === 'counterparty'
  );
  const nestedList = await call('get', `/api/counterparties/${documentOwner.body.id}/documents`);
  check(
    'polymorphic nested list resolves',
    nestedList.body?.length === 1 && nestedList.body[0].id === nestedDocument.body.id,
    `got ${nestedList.body?.length}`
  );

  const asyncOrder = await call('post', '/api/payment_orders/create_async', {
    body: {
      type: 'ach',
      amount: 1000,
      direction: 'credit',
      originating_account_id: firstId(ctx, 'internal_accounts'),
      receiving_account_id: firstId(ctx, 'external_accounts'),
    },
  });
  check('async create returns 202 + async_response', asyncOrder.status === 202 && asyncOrder.body?.object === 'async_response');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const asyncFetched = await call('get', `/api/payment_orders/${asyncOrder.body.id}`);
  check('async payment order lands in the store', asyncFetched.status === 200);

  const reversalTarget = firstId(ctx, 'ledger_transactions');
  const reversal = await call('post', `/api/ledger_transactions/${reversalTarget}/reversal`, { body: {} });
  check('ledger transaction reversal links back', reversal.body?.reverses_ledger_transaction_id === reversalTarget);
  const reversed = await call('get', `/api/ledger_transactions/${reversalTarget}`);
  check('original records the reversal', reversed.body?.reversed_by_ledger_transaction_id === reversal.body?.id);

  const deleted = await call('delete', `/api/counterparties/${created.body.id}`);
  check('delete returns 204 when the spec says so', deleted.status === 204, `got ${deleted.status}`);
  const afterDelete = await call('get', `/api/counterparties/${created.body.id}`);
  check('deleted records are gone', afterDelete.status === 404);

  const unknown = await call('get', '/api/not_a_real_endpoint');
  check('unknown endpoints 404 in the API error shape', unknown.status === 404 && unknown.body?.errors?.code === 'resource_not_found');

  server.close();

  // ---- 3. rate limiting (its own server, limits enabled) -----------------
  const limited = buildApp({
    organizationId: ORG,
    apiKeys: KEY,
    logging: false,
    rateLimits: true,
    seed: false,
  });
  const limitedServer = limited.app.listen(0);
  await new Promise((resolve) => limitedServer.once('listening', resolve));
  const limitedBase = `http://127.0.0.1:${limitedServer.address().port}`;
  const statuses = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await fetch(`${limitedBase}/api/payment_orders`, { headers: { Authorization: AUTH } });
    statuses.push(res.status);
  }
  check(
    'sandbox list rate limit is 5/s',
    statuses.filter((status) => status === 429).length >= 2,
    statuses.join(',')
  );
  const limitedPing = await fetch(`${limitedBase}/api/ping`, { headers: { Authorization: AUTH } });
  check('non-list endpoints keep their own budget', limitedPing.status === 200, `got ${limitedPing.status}`);
  limitedServer.close();

  // ---- report ------------------------------------------------------------
  const passed = results.filter((r) => r.status === 'passed').length;
  const behaviourPassed = checks.filter((c) => c.ok).length;

  console.log('');
  console.log(`catalog:   ${passed}/${results.length} operations responded as specified`);
  console.log(`behaviour: ${behaviourPassed}/${checks.length} checks passed`);

  for (const failed of checks.filter((c) => !c.ok)) {
    console.log(`  x ${failed.name} ${failed.detail}`);
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    for (const failure of failures.slice(0, 40)) console.log(`  - ${failure}`);
    if (failures.length > 40) console.log(`  ... ${failures.length - 40} more`);
    process.exitCode = 1;
    return;
  }
  console.log('\nall checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
