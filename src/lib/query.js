/** Query-string keys that control pagination rather than filtering. */
const PAGINATION_KEYS = new Set(['per_page', 'after_cursor', 'page', 'page_size']);

export const DEFAULT_PER_PAGE = 25;
export const MAX_PER_PAGE = 100;

const dateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function comparable(recordValue, filterValue) {
  if (recordValue === null || recordValue === undefined) return null;
  if (dateOnly(filterValue) && typeof recordValue === 'string' && recordValue.length > 10) {
    return recordValue.slice(0, 10);
  }
  return String(recordValue);
}

function matchesValue(recordValue, filterValue) {
  if (Array.isArray(recordValue)) {
    return recordValue.map(String).includes(String(filterValue));
  }
  if (typeof recordValue === 'boolean') {
    return recordValue === (filterValue === true || filterValue === 'true');
  }
  if (recordValue === null || recordValue === undefined) return false;
  return String(recordValue) === String(filterValue);
}

/**
 * Apply Modern Treasury list-filter conventions to stored records:
 * `field=value`, `field_start`/`field_end` ranges, and `metadata[key]=value`.
 * Parameters that do not correspond to a field on the record are ignored,
 * which matches the API's tolerant behaviour for unrelated filters.
 */
export function applyFilters(entries, query = {}) {
  const predicates = [];

  for (const [rawKey, rawValue] of Object.entries(query)) {
    if (PAGINATION_KEYS.has(rawKey)) continue;
    if (rawValue === undefined || rawValue === '') continue;

    const metadataMatch = /^metadata\[(.+)\]$/.exec(rawKey);
    if (metadataMatch) {
      const key = metadataMatch[1];
      predicates.push((rec) => String(rec?.metadata?.[key]) === String(rawValue));
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    if (rawKey.endsWith('_start') || rawKey.endsWith('_end')) {
      const isStart = rawKey.endsWith('_start');
      const field = rawKey.slice(0, isStart ? -6 : -4);
      predicates.push((rec) => {
        if (!(field in rec)) return true;
        const left = comparable(rec[field], values[0]);
        if (left === null) return false;
        return isStart ? left >= String(values[0]) : left <= String(values[0]);
      });
      continue;
    }

    const field = rawKey.replace(/\[\]$/, '');
    predicates.push((rec) => {
      if (!(field in rec)) return true;
      return values.some((value) => matchesValue(rec[field], value));
    });
  }

  if (!predicates.length) return entries;
  return entries.filter((entry) => predicates.every((p) => p(entry.record)));
}

/**
 * Cursor pagination: `after_cursor` is the id of the last record of the
 * previous page. Returns the page plus the headers the API sends alongside it.
 */
export function paginate(entries, query = {}) {
  const requested = Number(query.per_page);
  const perPage = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), MAX_PER_PAGE)
    : DEFAULT_PER_PAGE;

  let start = 0;
  if (query.after_cursor) {
    const index = entries.findIndex((entry) => entry.id === query.after_cursor);
    start = index === -1 ? entries.length : index + 1;
  }

  const page = entries.slice(start, start + perPage);
  const hasMore = start + perPage < entries.length;
  const headers = { 'X-Per-Page': String(perPage) };
  if (hasMore && page.length) headers['X-After-Cursor'] = page[page.length - 1].id;

  return { page, headers, perPage, hasMore };
}
