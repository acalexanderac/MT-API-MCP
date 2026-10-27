import { flatten } from './spec.js';
import { allowsNull, matchEnumValue, singularize, synth, typeMatches } from './synth.js';
import { representable } from './formats.js';
import { newUuid, seededUuid } from './rand.js';

const now = () => new Date().toISOString();

/** Shape used for resources the spec documents without a response schema. */
const genericShape = (objectName) => ({
  id: newUuid(),
  object: objectName,
  live_mode: false,
  created_at: now(),
  updated_at: now(),
});

/**
 * Merge a request body onto a synthesized record, following the response
 * schema: nested objects merge field by field, arrays of objects merge onto a
 * complete synthesized item (so a submitted ledger entry still comes back with
 * its `id`, `object` and balances), and fields the response schema does not
 * declare are dropped when it forbids extras.
 */
export function overlay(spec, rawSchema, base, body, options = {}) {
  if (body === undefined) return base;
  if (body === null && base === undefined) return null;
  const schema = flatten(spec, rawSchema) || {};

  if (body === null) return allowsNull(schema) ? null : base;

  // Polymorphic fields (`receiving_account` can be an external account, an
  // internal account, ...) are merged against the branch the body fits best.
  const branches = (schema.oneOf || schema.anyOf || [])
    .map((branch) => flatten(spec, branch))
    .filter((branch) => branch && branch.type !== 'null');
  if (branches.length && body && typeof body === 'object' && !Array.isArray(body)) {
    const keys = Object.keys(body);
    const score = (branch) =>
      keys.filter((key) => Object.hasOwn(branch.properties || {}, key)).length;
    const chosen = branches.reduce((best, branch) => (score(branch) > score(best) ? branch : best));
    const chosenBase =
      chosen === branches[0] && base !== undefined ? base : synth(spec, chosen, options);
    return overlay(spec, chosen, chosenBase, body, options);
  }

  if (Array.isArray(body)) {
    if (!schema.items) return body;
    return body.map((element, index) => {
      if (!element || typeof element !== 'object' || Array.isArray(element)) {
        return overlay(spec, schema.items, undefined, element, options);
      }
      const itemBase =
        (Array.isArray(base) && base[index]) ||
        (Array.isArray(base) && base[0]) ||
        synth(spec, schema.items, { ...options, index });
      return overlay(spec, schema.items, itemBase, element, options);
    });
  }

  if (typeof body === 'object') {
    const properties = schema.properties;
    if (!properties) return { ...(base && typeof base === 'object' ? base : {}), ...body };

    const out = { ...(base && typeof base === 'object' ? base : {}) };
    for (const [key, value] of Object.entries(body)) {
      if (!Object.hasOwn(properties, key)) {
        if (schema.additionalProperties === false) continue;
        out[key] = value;
        continue;
      }
      out[key] = overlay(spec, properties[key], out[key], value, options);
    }
    return out;
  }

  // Scalars: the response schema decides what it is able to represent, so a
  // resource type spelled another way is translated and a value the schema
  // cannot hold (a malformed timestamp, say) leaves the stored value alone.
  if (schema.enum) return matchEnumValue(schema, body);
  if (!representable(schema, body)) return base;
  return body;
}

/** Foreign-key fields to populate when a record is created under a parent. */
export function parentLinkFields(spec, schema, record, parent) {
  if (!parent) return {};
  const properties = (flatten(spec, schema) || {}).properties || {};
  const fields = {};
  const foreignKey = `${singularize(parent.type || '')}_id`;

  if (foreignKey in record) fields[foreignKey] = parent.id;
  if ('documentable_id' in record) {
    fields.documentable_id = parent.id;
    if ('documentable_type' in record) {
      fields.documentable_type = matchEnumValue(
        flatten(spec, properties.documentable_type),
        parent.type
      );
    }
  }
  if ('itemizable_id' in record) {
    fields.itemizable_id = parent.id;
    if ('itemizable_type' in record) {
      fields.itemizable_type = matchEnumValue(
        flatten(spec, properties.itemizable_type),
        parent.type
      );
    }
  }
  if ('account_id' in record && /accounts$/.test(parent.type || '')) {
    fields.account_id = parent.id;
  }
  return fields;
}

/** Merge metadata the way the API does: merge keys, unset on `""` or `null`. */
export function mergeMetadata(existing = {}, incoming) {
  if (!incoming || typeof incoming !== 'object') return existing || {};
  const out = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === '') delete out[key];
    else out[key] = value;
  }
  return out;
}

/**
 * Apply an update body to a stored record. Nested objects merge through the
 * response schema (so a partial address update keeps the rest of the address),
 * metadata merges key by key, and identity fields are never writable.
 */
export function applyUpdate(record, body = {}, { spec = null, schema = null } = {}) {
  const writable = { ...body };
  for (const key of ['id', 'object', 'created_at']) delete writable[key];
  const hasMetadata = Object.hasOwn(writable, 'metadata');
  const metadata = writable.metadata;
  delete writable.metadata;

  const next =
    spec && schema
      ? overlay(spec, schema, record, writable)
      : { ...record, ...stripUndefined(writable) };

  if (hasMetadata) next.metadata = mergeMetadata(record.metadata, metadata);
  next.updated_at = now();
  return next;
}

function stripUndefined(body) {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

/**
 * Build a complete resource: every field the response schema declares, taken
 * from the request body where it was provided and synthesized otherwise.
 */
export function buildResource(
  spec,
  descriptor,
  { body = {}, parent = null, seed, index = 0, liveMode = false } = {}
) {
  const schema =
    descriptor.responseSchema?.type === 'array'
      ? descriptor.responseSchema.items
      : descriptor.responseSchema;

  const id = seed ? seededUuid(`${descriptor.resource}:${seed}`) : newUuid();
  const synthOptions = {
    seed: seed || id,
    objectName: descriptor.objectName,
    index,
    liveMode,
  };

  const base = schema ? synth(spec, schema, synthOptions) : genericShape(descriptor.objectName);
  const withBody = overlay(spec, schema, base, body || {}, synthOptions);
  const record = { ...withBody, ...parentLinkFields(spec, schema, withBody, parent) };

  if (body && Object.hasOwn(body, 'metadata')) {
    record.metadata = mergeMetadata({}, body.metadata);
  }

  const timestamp = now();
  record.id = id;
  if ('object' in record || !schema) record.object = descriptor.objectName;
  if ('live_mode' in record || !schema) record.live_mode = liveMode;
  if ('created_at' in record || !schema) record.created_at = timestamp;
  if ('updated_at' in record || !schema) record.updated_at = timestamp;
  if ('discarded_at' in record) record.discarded_at = record.discarded_at ?? null;

  return orderKeys(record);
}

/** Keep `id` and `object` first, then alphabetical — as the API returns them. */
export function orderKeys(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const out = {};
  for (const key of ['id', 'object']) if (key in record) out[key] = record[key];
  for (const key of Object.keys(record).sort()) {
    if (key === 'id' || key === 'object') continue;
    out[key] = record[key];
  }
  return out;
}

/**
 * Does a stored entry belong to the parent a nested route addresses?
 *
 * Records created through a nested route remember their parent directly;
 * records created at the top level are matched on the foreign-key field their
 * schema declares (`documentable_id`, `itemizable_id`, `<parent>_id`). Type
 * fields are compared loosely because the API spells them several ways.
 */
export function belongsToParent(entry, parent) {
  if (!parent) return true;
  const record = entry.record || {};
  const owner = entry.parent;
  if (owner && owner.type === parent.type && owner.id === parent.id) return true;

  const foreignKey = `${singularize(parent.type || '')}_id`;
  if (record[foreignKey] && record[foreignKey] === parent.id) return true;

  for (const [idField, typeField] of [
    ['documentable_id', 'documentable_type'],
    ['itemizable_id', 'itemizable_type'],
  ]) {
    if (record[idField] !== parent.id) continue;
    if (!record[typeField] || typeMatches(record[typeField], parent.type)) return true;
  }

  return Boolean(record.account_id) && record.account_id === parent.id;
}

export { now };
