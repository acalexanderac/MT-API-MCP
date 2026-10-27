import { flatten } from './spec.js';
import { rngFor, seededUuid } from './rand.js';

const MAX_DEPTH = 12;
/** How many times one schema may reappear in a chain before it is cut off. */
const MAX_REF_REPEATS = 1;

const DAY = 86_400_000;
const BASE_TIME = Date.parse('2026-01-05T17:30:00.000Z');

const isoAt = (offsetDays = 0) => new Date(BASE_TIME + offsetDays * DAY).toISOString();
const dateAt = (offsetDays = 0) => isoAt(offsetDays).slice(0, 10);

/** Fields that mean "this has not happened", so they stay null when allowed. */
const PREFER_NULL = new Set([
  'discarded_at',
  'deleted_at',
  'archived_at',
  'archived_reason',
  'decided_at',
  'failure_reason',
  'rejection_reason',
]);

const NAME_VALUES = {
  object: (ctx) => ctx.objectName || 'object',
  live_mode: (ctx) => ctx.liveMode ?? false,
  metadata: () => ({}),
  currency: (ctx, schema) => chooseEnum(schema, 'USD'),
  // A fresh record is more usefully "pending" than whatever the enum lists first.
  status: (ctx, schema) => chooseEnum(schema, 'pending'),
  currency_exponent: () => 2,
  amount: () => 10_000,
  unit_amount: () => 2_500,
  unit_amount_decimal: () => '2500.0',
  quantity: () => 1,
  version: () => 1,
  routing_number: () => '021000021',
  routing_number_type: (ctx, schema) => chooseEnum(schema, 'aba'),
  account_number: () => '123456789',
  account_number_safe: () => '6789',
  email: () => 'treasury-ops@example.com',
  website: () => 'https://example.com',
  country: () => 'US',
  region: () => 'CA',
  locality: () => 'San Francisco',
  postal_code: () => '94103',
  line1: () => '100 Market Street',
  line2: () => 'Suite 400',
  phone_number: () => '+14155550123',
  ping: () => 'pong',
  bank_name: () => 'JPMORGAN CHASE BANK, NA',
  description: (ctx) => `${(ctx.objectName || 'record').replace(/_/g, ' ')} description`,
  name: (ctx) => ctx.displayName || `${(ctx.objectName || 'record').replace(/_/g, ' ')} name`,
  reference_number: (ctx) => `REF-${String(ctx.index ?? 0).padStart(5, '0')}`,
  external_id: (ctx) => `ext-${ctx.objectName || 'record'}-${ctx.index ?? 0}`,
};

function chooseEnum(schema, preferred) {
  const values = (schema?.enum || []).filter((value) => value !== null);
  if (!values.length) return preferred;
  return values.includes(preferred) ? preferred : values[0];
}

function typeSet(schema) {
  if (!schema) return new Set();
  if (Array.isArray(schema.type)) return new Set(schema.type);
  return new Set(schema.type ? [schema.type] : []);
}

/** Does the schema accept `null`? (OpenAPI `nullable`, or a `null` type union.) */
export function allowsNull(schema) {
  if (!schema) return true;
  return Boolean(schema.nullable) || typeSet(schema).has('null');
}

function stringForFormat(format, field, ctx, rng) {
  switch (format) {
    case 'uuid':
      return seededUuid(`${ctx.seed}:${field}`);
    case 'date':
      return dateAt(Math.floor(rng() * 5));
    case 'date-time':
      return isoAt(Math.floor(rng() * 5));
    case 'time':
      return '17:30:00+00:00';
    case 'uri':
    case 'url':
      return 'https://example.com/resource';
    case 'email':
      return 'treasury-ops@example.com';
    case 'binary':
    case 'byte':
      return 'ZmlsZS1jb250ZW50cw==';
    case 'decimal':
      return '100.00';
    default:
      return undefined;
  }
}

/**
 * Build a representative instance of an OpenAPI schema.
 *
 * Values are deterministic for a given `seed`, so the seeded dataset (and the
 * tests built on it) stay stable between restarts. Recursive schemas — a
 * payment order's `current_return` is a return, which has its own
 * `current_return` — are cut off at the first repeat.
 */
export function synth(spec, schema, options = {}) {
  const ctx = {
    seed: options.seed || 'mt',
    objectName: options.objectName,
    displayName: options.displayName,
    liveMode: options.liveMode ?? false,
    index: options.index ?? 0,
  };
  const rng = rngFor(`${ctx.seed}:${ctx.objectName || ''}`);
  return build(spec, schema, '', ctx, rng, 0, new Map());
}

/** The schema this node points at, directly or through an allOf wrapper. */
function schemaRef(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.$ref) return schema.$ref;
  if (Array.isArray(schema.allOf)) return schema.allOf.find((part) => part?.$ref)?.$ref || null;
  return null;
}

function build(spec, rawSchema, field, ctx, rng, depth, refCounts) {
  if (depth > MAX_DEPTH) return null;

  let counts = refCounts;
  let localCtx = ctx;
  // `current_return` is `{nullable, allOf: [{$ref: return}]}`, so wrappers
  // count as references too — otherwise recursive schemas never terminate.
  const ref = schemaRef(rawSchema);
  if (ref) {
    const seen = refCounts.get(ref) || 0;
    if (seen >= MAX_REF_REPEATS) return null;
    counts = new Map(refCounts).set(ref, seen + 1);
    // A $ref names the embedded resource, so nested objects report their own
    // `object` value rather than inheriting the parent's.
    const refName = ref.split('/').pop();
    if (depth > 0 && refName && refName !== ctx.objectName) {
      localCtx = { ...ctx, objectName: refName };
    }
  }

  const schema = flatten(spec, rawSchema);
  if (!schema || schema.circular) return null;

  const types = typeSet(schema);
  const nullable = allowsNull(schema);

  if (field && PREFER_NULL.has(field) && nullable) return null;

  if (schema.oneOf || schema.anyOf) {
    const branches = (schema.oneOf || schema.anyOf).filter(
      (branch) => branch && branch.type !== 'null'
    );
    if (!branches.length) return null;
    return build(spec, branches[0], field, localCtx, rng, depth + 1, counts);
  }

  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;

  if (field && Object.hasOwn(NAME_VALUES, field)) {
    const candidate = NAME_VALUES[field](localCtx, schema);
    const fitsShape =
      candidate !== undefined &&
      (candidate === null
        ? nullable
        : typeof candidate === 'object'
          ? types.has('object') || !types.size
          : !types.has('object'));
    if (fitsShape) return schema.enum ? chooseEnum(schema, candidate) : candidate;
  }

  if (types.has('object') || schema.properties || schema.additionalProperties) {
    if (!schema.properties) return {};
    const out = {};
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      out[key] = build(spec, propertySchema, key, localCtx, rng, depth + 1, counts);
    }
    return out;
  }

  if (types.has('array')) {
    if (!schema.items) return [];
    const value = build(spec, schema.items, singularize(field), localCtx, rng, depth + 1, counts);
    return value === null || value === undefined ? [] : [value];
  }

  if (types.has('boolean')) return false;

  if (types.has('integer') || types.has('number')) {
    return /amount|balance|total|cents/.test(field || '') ? 10_000 : 1;
  }

  if (types.has('string') || schema.enum) {
    if (schema.enum) return chooseEnum(schema, undefined);
    const formatted = stringForFormat(schema.format, field, localCtx, rng);
    if (formatted !== undefined) return formatted;
    if (/_id$/.test(field || '')) return seededUuid(`${localCtx.seed}:${field}`);
    if (/_at$/.test(field || '')) return isoAt(0);
    if (/_date$/.test(field || '')) return dateAt(0);
    if (/url|link/.test(field || '')) return 'https://example.com/resource';
    return field ? field.replace(/_/g, ' ') : 'value';
  }

  return null;
}

export function singularize(word = '') {
  if (!word) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/**
 * Compare resource type names that the API spells differently in different
 * places: `payment_orders` (URL), `payment_order` (field value), and
 * `PaymentOrder` (polymorphic enum).
 */
export function typeMatches(a, b) {
  const normalize = (value) =>
    singularize(
      String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
    );
  return Boolean(a) && Boolean(b) && normalize(a) === normalize(b);
}

/** The spelling of a resource type that a schema's enum expects. */
export function matchEnumValue(schema, value) {
  const values = (schema?.enum || []).filter(Boolean);
  if (!values.length) return value;
  return values.find((candidate) => typeMatches(candidate, value)) || values[0];
}

export { isoAt, dateAt };
