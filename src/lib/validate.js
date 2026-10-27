import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { convertSchema, toJsonSchemaDocument } from './spec.js';
import { ApiError } from './errors.js';

/**
 * Request validation driven entirely by the OpenAPI document: bodies are
 * checked against the declared request schema, query/path parameters against
 * their declared parameter schemas.
 */
export class Validator {
  constructor(spec) {
    const document = toJsonSchemaDocument(spec);

    this.bodyAjv = new Ajv({ strict: false, allErrors: true, allowUnionTypes: true });
    addFormats(this.bodyAjv);
    // The specification uses a non-standard `format: string` in a few places.
    this.bodyAjv.addFormat('string', () => true);
    this.bodyAjv.addSchema(document);
    // Request bodies validate against a relaxed copy of the same components.
    this.bodyAjv.addSchema(relaxOneOf({ ...document, $id: 'mt-request' }));

    // Query strings arrive as text, so this instance coerces to the declared type.
    this.queryAjv = new Ajv({
      strict: false,
      allErrors: true,
      allowUnionTypes: true,
      coerceTypes: true,
    });
    addFormats(this.queryAjv);
    this.queryAjv.addFormat('string', () => true);
    this.queryAjv.addSchema({ ...document, $id: 'mt-query' });

    this.bodyCache = new Map();
    this.queryCache = new Map();
  }

  bodyValidator(route) {
    if (!route.requestBodySchema) return null;
    if (!this.bodyCache.has(route.operationId)) {
      this.bodyCache.set(
        route.operationId,
        this.bodyAjv.compile(
          rewriteRefs(relaxOneOf(convertSchema(route.requestBodySchema)), 'mt-request')
        )
      );
    }
    return this.bodyCache.get(route.operationId);
  }

  queryValidator(route) {
    if (!this.queryCache.has(route.operationId)) {
      const params = route.parameters.filter((p) => p.in === 'query');
      const properties = {};
      const required = [];
      for (const param of params) {
        properties[param.name] = rewriteRefs(convertSchema(param.schema || {}), 'mt-query');
        if (param.required) required.push(param.name);
      }
      const schema = {
        type: 'object',
        properties,
        required,
        additionalProperties: true,
      };
      this.queryCache.set(route.operationId, this.queryAjv.compile(schema));
    }
    return this.queryCache.get(route.operationId);
  }

  /** Validate a parsed JSON body, throwing an ApiError describing every problem. */
  validateBody(route, body) {
    const validate = this.bodyValidator(route);
    if (!validate) return body;
    if (route.requestBodyRequired && (body === undefined || body === null)) {
      throw new ApiError(422, {
        code: 'parameter_missing',
        message: 'A request body is required',
        parameter: 'body',
      });
    }
    const payload = body ?? {};
    if (validate(payload)) return payload;
    throw toApiError(validate.errors, 'body');
  }

  /** Validate query parameters in place (values are coerced to declared types). */
  validateQuery(route, query) {
    const validate = this.queryValidator(route);
    const copy = { ...query };
    // `metadata[key]=value` style filters are not declared per-key in the spec.
    for (const key of Object.keys(copy)) if (key.includes('[')) delete copy[key];
    if (validate(copy)) return copy;
    throw toApiError(validate.errors, 'query');
  }

  /** Validate a path parameter against its declared enum/format, if any. */
  validatePathParams(route, params) {
    for (const param of route.parameters.filter((p) => p.in === 'path')) {
      const value = params[param.name];
      const schema = param.schema || {};
      if (value === undefined) continue;
      if (schema.enum && !schema.enum.includes(value)) {
        throw new ApiError(404, {
          code: 'resource_not_found',
          message: `\`${param.name}\` must be one of: ${schema.enum.join(', ')}`,
          parameter: param.name,
        });
      }
    }
    return params;
  }
}

/**
 * Request schemas describe alternative payload shapes with `oneOf`, but the
 * branches overlap (a bulk request resource can satisfy several of them at
 * once, with `resource_type` saying which one was meant). Validating those as
 * `anyOf` accepts the payloads the API accepts; response validation keeps the
 * stricter reading.
 */
function relaxOneOf(schema) {
  if (Array.isArray(schema)) return schema.map(relaxOneOf);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key === 'oneOf' ? 'anyOf' : key] = relaxOneOf(value);
  }
  return out;
}

/** Point local refs at one of the registered component documents. */
function rewriteRefs(schema, target) {
  if (Array.isArray(schema)) return schema.map((item) => rewriteRefs(item, target));
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref' && typeof value === 'string' && value.startsWith('mt#')) {
      out.$ref = value.replace(/^mt#/, `${target}#`);
      continue;
    }
    out[key] = rewriteRefs(value, target);
  }
  return out;
}

/** Map Ajv errors onto Modern Treasury error codes. */
function toApiError(errors = [], where) {
  const mapped = [];
  for (const err of errors) {
    const pointer = `${err.instancePath || ''}`.replace(/^\//, '').replace(/\//g, '.');
    if (err.keyword === 'required') {
      const parameter = [pointer, err.params.missingProperty].filter(Boolean).join('.');
      mapped.push({
        code: 'parameter_missing',
        message: `\`${parameter}\` is required`,
        parameter,
      });
      continue;
    }
    const parameter = pointer || where;
    mapped.push({
      code: 'parameter_invalid',
      message: `\`${parameter}\` ${err.message}`,
      parameter,
    });
  }
  if (!mapped.length) {
    mapped.push({ code: 'parameter_invalid', message: 'Request is invalid', parameter: where });
  }
  const status = mapped.every((m) => m.code === 'parameter_missing') ? 422 : 400;
  return new ApiError(status, mapped);
}

/** Compile and cache a validator for an operation's success response. */
Validator.prototype.responseValidator = function responseValidator(route) {
  if (!route.responseSchema) return null;
  const key = `response:${route.operationId}`;
  if (!this.bodyCache.has(key)) {
    this.bodyCache.set(key, this.bodyAjv.compile(convertSchema(route.responseSchema)));
  }
  return this.bodyCache.get(key);
};

/** Check a response body against the schema the spec declares for it. */
Validator.prototype.checkResponse = function checkResponse(route, body) {
  const validate = this.responseValidator(route);
  if (!validate) return [];
  if (validate(body)) return [];
  return validate.errors.map((err) => `${err.instancePath || '/'} ${err.message}`);
};

/** Raw Ajv errors for a request body (used by the test harness). */
Validator.prototype.bodyErrors = function bodyErrors(route, body) {
  const validate = this.bodyValidator(route);
  if (!validate) return [];
  return validate(body ?? {}) ? [] : validate.errors;
};
