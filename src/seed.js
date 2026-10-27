import { buildResource } from './lib/resources.js';
import { flatten } from './lib/spec.js';
import { matchEnumValue } from './lib/synth.js';

/** Fields whose name does not imply the collection they point at. */
const FOREIGN_KEY_ALIASES = {
  originating_account_id: 'internal_accounts',
  receiving_account_id: 'external_accounts',
  parent_account_id: 'internal_accounts',
  contra_ledger_account_id: 'ledger_accounts',
  partially_posts_ledger_transaction_id: null,
  reversed_by_ledger_transaction_id: null,
  reverses_ledger_transaction_id: null,
  service_provider_legal_entity_id: 'legal_entities',
  child_legal_entity_id: 'legal_entities',
  parent_legal_entity_id: 'legal_entities',
  entity_id: null,
  vendor_id: null,
  batch_id: null,
  card_id: null,
  request_id: 'bulk_requests',
  subject_id: 'payment_orders',
  target_id: 'payment_orders',
};

/** Resources seeded first, so later records can reference them. */
const SEED_ORDER = [
  'ledgers',
  'legal_entities',
  'counterparties',
  'internal_accounts',
  'external_accounts',
  'ledger_accounts',
  'ledger_account_categories',
  'ledger_transactions',
  'ledger_entries',
  'virtual_accounts',
  'payment_orders',
  'expected_payments',
  'transactions',
  'invoices',
];

function pluralize(word) {
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

function pickCanonical(routes) {
  return (
    routes.find((route) => route.isShow && route.responseSchema) ||
    routes.find((route) => route.isCreate && route.responseSchema) ||
    routes.find((route) => route.responseSchema?.type === 'array') ||
    routes[0]
  );
}

function parentTypesFor(routes) {
  const types = new Set();
  for (const route of routes) {
    if (!route.parent) continue;
    if (route.parent.type) {
      types.add(route.parent.type);
      continue;
    }
    const param = route.parameters.find(
      (candidate) => candidate.in === 'path' && candidate.name === route.parent.typeParam
    );
    for (const value of param?.schema?.enum || []) types.add(value);
  }
  return [...types];
}

/** Group the route table by storage collection. */
export function resourceIndex(descriptors) {
  const index = new Map();
  for (const descriptor of descriptors) {
    if (descriptor.special) continue;
    const bucket = index.get(descriptor.resource) || { resource: descriptor.resource, routes: [] };
    bucket.routes.push(descriptor);
    index.set(descriptor.resource, bucket);
  }
  for (const bucket of index.values()) {
    bucket.canonical = pickCanonical(bucket.routes);
    bucket.parentTypes = parentTypesFor(bucket.routes);
    bucket.topLevel = bucket.routes.some((route) => !route.parent);
    bucket.listable = bucket.routes.some(
      (route) => route.kind === 'collection' && route.method === 'get'
    );
  }
  return index;
}

function seedRecords(ctx, bucket, count, parent) {
  const created = [];
  for (let i = 0; i < count; i += 1) {
    const seed = `${bucket.resource}:${parent ? `${parent.type}:${parent.id}:` : ''}${i}`;
    const record = buildResource(ctx.spec, bucket.canonical, {
      body: {},
      parent,
      seed,
      index: i,
      liveMode: ctx.config.liveMode,
    });
    ctx.store.insert(bucket.resource, record, parent);
    created.push(record);
  }
  return created;
}

/**
 * Point every `*_id` field at a record that actually exists, so the seeded
 * dataset is referentially consistent (an invoice's `counterparty_id` really
 * resolves through `GET /api/counterparties/{id}`).
 */
function relink(ctx, index) {
  const firstId = (resource) => ctx.store.entries(resource)[0]?.id || null;

  for (const bucket of index.values()) {
    for (const entry of ctx.store.entries(bucket.resource)) {
      const record = entry.record;
      for (const field of Object.keys(record)) {
        if (!field.endsWith('_id') || field === 'id' || record[field] === null) continue;

        let target = FOREIGN_KEY_ALIASES[field];
        if (target === null) continue;
        if (target === undefined) {
          const candidate = pluralize(field.slice(0, -3));
          target = index.has(candidate) ? candidate : null;
        }
        if (!target || target === bucket.resource) continue;

        const replacement = firstId(target);
        if (replacement) record[field] = replacement;
      }
      if (record.documentable_type && index.has(record.documentable_type)) {
        record.documentable_id = firstId(record.documentable_type) || record.documentable_id;
      }
      if (record.itemizable_type && index.has(record.itemizable_type)) {
        record.itemizable_id = firstId(record.itemizable_type) || record.itemizable_id;
      }
    }
  }
}

/**
 * Populate the store with a deterministic dataset: a handful of records for
 * every collection in the catalog, children attached to real parents.
 */
export function seedStore(ctx, { perResource = 3, perParent = 2 } = {}) {
  const index = resourceIndex(ctx.descriptors);
  const ordered = [
    ...SEED_ORDER.filter((name) => index.has(name)),
    ...[...index.keys()].filter((name) => !SEED_ORDER.includes(name)).sort(),
  ];

  for (const name of ordered) {
    const bucket = index.get(name);
    if (!bucket.topLevel || !bucket.canonical) continue;
    seedRecords(ctx, bucket, perResource, null);
  }

  for (const name of ordered) {
    const bucket = index.get(name);
    if (bucket.topLevel || !bucket.canonical) continue;
    for (const parentType of bucket.parentTypes) {
      const parents = ctx.store.entries(parentType).slice(0, 1);
      for (const parentEntry of parents) {
        seedRecords(ctx, bucket, perParent, { type: parentType, id: parentEntry.id });
      }
    }
  }

  relink(ctx, index);

  // Documents and line items hang off polymorphic parents, so point them at a
  // real record and spell the type the way their own schema expects.
  attachPolymorphic(ctx, index, 'documents', 'documentable', 'counterparties');
  attachPolymorphic(ctx, index, 'line_items', 'itemizable', 'payment_orders');

  return ctx.store.stats();
}

/** Link every record of `resource` to the first record of `parentType`. */
function attachPolymorphic(ctx, index, resource, prefix, parentType) {
  const parent = ctx.store.entries(parentType)[0];
  const bucket = index.get(resource);
  if (!parent || !bucket) return;

  const declared = flatten(ctx.spec, bucket.canonical.responseSchema);
  const schema = declared?.type === 'array' ? flatten(ctx.spec, declared.items) : declared;
  const typeSchema = flatten(ctx.spec, schema?.properties?.[`${prefix}_type`]);
  const typeValue = matchEnumValue(typeSchema, parentType);

  for (const entry of ctx.store.entries(resource)) {
    entry.record[`${prefix}_type`] = typeValue;
    entry.record[`${prefix}_id`] = parent.id;
  }
}
