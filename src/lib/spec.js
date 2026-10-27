import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH =
  process.env.MT_SPEC_PATH || path.join(here, '..', '..', 'spec', 'mt_openapi_spec_v1.yaml');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Load and parse the OpenAPI document. */
export function loadSpec(specPath = SPEC_PATH) {
  const raw = fs.readFileSync(specPath, 'utf8');
  return YAML.parse(raw);
}

/**
 * Resolve a local $ref (`#/components/schemas/foo`) against the spec document.
 */
export function refTarget(spec, ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  let node = spec;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (node === undefined) throw new Error(`unresolvable $ref: ${ref}`);
  }
  return node;
}

/** Follow $ref chains one level deep (returns the concrete schema object). */
export function deref(spec, schema, seen = new Set()) {
  let node = schema;
  while (node && node.$ref) {
    if (seen.has(node.$ref)) return { circular: node.$ref };
    seen.add(node.$ref);
    node = refTarget(spec, node.$ref);
  }
  return node;
}

/** Merge allOf members into a single object schema (shallow, good enough here). */
export function flatten(spec, schema, depth = 0) {
  const node = deref(spec, schema);
  if (!node || depth > 12) return node || {};
  if (!node.allOf) return node;
  const out = { type: 'object', properties: {}, required: [] };
  for (const part of node.allOf) {
    const flat = flatten(spec, part, depth + 1);
    Object.assign(out.properties, flat.properties || {});
    if (flat.required) out.required.push(...flat.required);
    for (const key of ['description', 'additionalProperties']) {
      if (flat[key] !== undefined && out[key] === undefined) out[key] = flat[key];
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'allOf') continue;
    if (k === 'properties') Object.assign(out.properties, v);
    else if (k === 'required') out.required.push(...v);
    else out[k] = v;
  }
  out.required = [...new Set(out.required)];
  return out;
}

function jsonBody(obj) {
  return obj?.content?.['application/json']?.schema;
}

/**
 * Build the flat route table: one entry per operation in the catalog.
 */
export function buildRouteTable(spec) {
  const routes = [];
  for (const [specPath, item] of Object.entries(spec.paths)) {
    const shared = item.parameters || [];
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const responses = op.responses || {};
      const successCodes = Object.keys(responses)
        .filter((c) => /^2\d\d$/.test(c))
        .sort();
      const status = Number(successCodes[0] || (method === 'post' ? 201 : 200));
      routes.push({
        method,
        path: specPath,
        expressPath: specPath.replace(/\{(\w+)\}/g, ':$1'),
        operationId: op.operationId || `${method}${specPath}`,
        tag: (op.tags || ['Untagged'])[0],
        summary: op.summary || '',
        description: op.description || '',
        parameters: [...shared, ...(op.parameters || [])],
        requestBodySchema: jsonBody(op.requestBody),
        requestBodyRequired: Boolean(op.requestBody?.required),
        successStatus: status,
        responseSchema: jsonBody(responses[successCodes[0]]),
        producesJson: Boolean(jsonBody(responses[successCodes[0]])),
      });
    }
  }
  return routes;
}

/**
 * Convert an OpenAPI 3.0 document into something Ajv (draft 2020/07) accepts:
 * `nullable: true` becomes a union type and OpenAPI-only keywords are dropped.
 */
const OPENAPI_ONLY_KEYWORDS = new Set([
  'example',
  'examples',
  'discriminator',
  'xml',
  'externalDocs',
  'deprecated',
  'readOnly',
  'writeOnly',
  'x-stainless-const',
]);

/**
 * Convert an OpenAPI 3.0 schema into one Ajv accepts: `nullable: true` becomes
 * a type union and OpenAPI-only keywords are dropped. Local `$ref`s are
 * rewritten to point at the registered `mt` document.
 */
export function convertSchema(node) {
  if (Array.isArray(node)) return node.map(convertSchema);
  if (!node || typeof node !== 'object') return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (OPENAPI_ONLY_KEYWORDS.has(key)) continue;
    if (key === '$ref' && typeof value === 'string' && value.startsWith('#/')) {
      out.$ref = `mt${value}`;
      continue;
    }
    out[key] = convertSchema(value);
  }

  if (out.nullable) {
    delete out.nullable;
    // A nullable schema that composes others ($ref, allOf, oneOf) cannot simply
    // gain a "null" type: the composed members would still reject null. Wrap
    // the whole schema in an anyOf against null instead.
    const composes = out.$ref || out.allOf || out.oneOf || out.anyOf;
    if (composes) {
      const inner = { ...out };
      for (const key of Object.keys(out)) delete out[key];
      out.anyOf = [{ type: 'null' }, inner];
    } else if (typeof out.type === 'string') {
      out.type = [out.type, 'null'];
    } else if (Array.isArray(out.type) && !out.type.includes('null')) {
      out.type.push('null');
    } else if (out.enum && !out.enum.includes(null)) {
      out.enum = [...out.enum, null];
    } else {
      out.type = ['object', 'array', 'string', 'number', 'boolean', 'null'];
    }
  }
  if (Array.isArray(out.enum) && Array.isArray(out.type) && out.type.includes('null')) {
    if (!out.enum.includes(null)) out.enum = [...out.enum, null];
  }
  return out;
}

/** The spec's `components` section, registered with Ajv under `$id: 'mt'`. */
export function toJsonSchemaDocument(spec) {
  return { $id: 'mt', ...convertSchema({ components: spec.components }) };
}
