/**
 * Format checks used when deciding whether a submitted value can be stored in
 * the field the response schema declares. The specification is occasionally
 * looser on the request side than on the response side (a `string` going into
 * a `format: time` field, for example); values that could not be returned are
 * not accepted into the record.
 */
const CHECKS = {
  uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
  'date-time': (value) =>
    /^\d{4}-\d{2}-\d{2}[Tt]/.test(value) && !Number.isNaN(Date.parse(value)),
  time: (value) => /^\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(value),
  email: (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  uri: (value) => URL.canParse(value),
  url: (value) => URL.canParse(value),
};

/** Can this value be stored in — and returned from — the given schema? */
export function representable(schema, value) {
  if (typeof value !== 'string' || !schema) return true;

  if (schema.pattern) {
    try {
      if (!new RegExp(schema.pattern).test(value)) return false;
    } catch {
      // An unparseable pattern is the specification's problem, not the value's.
    }
  }
  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) return false;

  const check = schema.format && CHECKS[schema.format];
  return check ? check(value) : true;
}
