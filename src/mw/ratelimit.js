import { tooManyRequests } from '../lib/errors.js';

/**
 * Per-second request limits, mirroring the published numbers:
 *
 * | bucket            | live mode | sandbox |
 * | ----------------- | --------- | ------- |
 * | list endpoints    | 20/s      | 5/s     |
 * | everything else   | 100/s     | 25/s    |
 * | create bulk requests | 1/s    | 1/s     |
 *
 * Limits are cumulative across API keys for an organization, as documented.
 */
export function rateLimitConfig({ liveMode = false } = {}) {
  return {
    list: liveMode ? 20 : 5,
    default: liveMode ? 100 : 25,
    bulk: 1,
  };
}

export function bucketFor(descriptor) {
  if (!descriptor) return 'default';
  if (descriptor.operationId === 'createBulkRequest') return 'bulk';
  if (descriptor.kind === 'collection' && descriptor.method === 'get') return 'list';
  return 'default';
}

export function rateLimiter({ limits, enabled = true, windowMs = 1000, clock = Date.now }) {
  const counters = new Map();

  return (req, res, next) => {
    if (!enabled) return next();
    const bucket = bucketFor(req.mtRoute);
    const limit = limits[bucket] ?? limits.default;
    const organization = req.auth?.organizationId || 'anonymous';
    const window = Math.floor(clock() / windowMs);
    const key = `${organization}:${bucket}:${window}`;

    const used = (counters.get(key) || 0) + 1;
    counters.set(key, used);

    // Drop expired windows so the map does not grow without bound.
    if (counters.size > 1000) {
      for (const existing of counters.keys()) {
        if (!existing.endsWith(`:${window}`)) counters.delete(existing);
      }
    }

    res.set({
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(0, limit - used)),
      'X-RateLimit-Reset': String((window + 1) * (windowMs / 1000)),
    });

    if (used > limit) {
      res.set('Retry-After', '1');
      throw tooManyRequests(
        `Rate limit of ${limit} requests per second exceeded for ${bucket} endpoints`
      );
    }
    return next();
  };
}
