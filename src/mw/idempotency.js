import { conflict, headerInvalid } from '../lib/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LENGTH = 180;

/**
 * `Idempotency-Key` support, matching the documented behaviour:
 *
 * - honoured on POST and PATCH, ignored on GET/PUT/DELETE
 * - keys are scoped to the API key and independent of the route
 * - successful responses are replayed for 24 hours
 * - a second request arriving while the first is in flight gets a 409
 */
export function idempotency(cache = new Map(), { ttlMs = DAY_MS } = {}) {
  return (req, res, next) => {
    const key = req.get('idempotency-key');
    if (!key) return next();
    if (!['POST', 'PATCH'].includes(req.method)) return next();
    if (key.length > MAX_KEY_LENGTH) {
      throw headerInvalid(
        `Idempotency-Key may not exceed ${MAX_KEY_LENGTH} characters`,
        'Idempotency-Key'
      );
    }

    const scope = req.auth?.apiKey || 'anonymous';
    const cacheKey = `${scope}:${key}`;
    const existing = cache.get(cacheKey);

    if (existing && existing.expiresAt < Date.now()) {
      cache.delete(cacheKey);
    } else if (existing?.pending) {
      throw conflict(
        'A request with this Idempotency-Key is already in progress',
        'Idempotency-Key'
      );
    } else if (existing) {
      res.set(existing.headers);
      res.set('Idempotent-Replayed', 'true');
      res.status(existing.status);
      return existing.body === undefined ? res.end() : res.json(existing.body);
    }

    cache.set(cacheKey, { pending: true, expiresAt: Date.now() + ttlMs });

    // Capture the response so the next request with this key can replay it.
    const originalJson = res.json.bind(res);
    let captured;
    res.json = (body) => {
      captured = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      const successful = res.statusCode >= 200 && res.statusCode < 300;
      if (!successful) {
        cache.delete(cacheKey);
        return;
      }
      cache.set(cacheKey, {
        pending: false,
        status: res.statusCode,
        body: captured,
        headers: { 'Content-Type': res.get('Content-Type') || 'application/json' },
        expiresAt: Date.now() + ttlMs,
      });
    });

    return next();
  };
}
