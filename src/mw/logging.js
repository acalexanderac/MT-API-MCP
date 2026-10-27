import crypto from 'node:crypto';

/** Attach a request id (echoed as `X-Request-Id`) and log one line per request. */
export function requestLogging({ logger = console, enabled = true } = {}) {
  return (req, res, next) => {
    const requestId = req.get('x-request-id') || crypto.randomUUID();
    req.requestId = requestId;
    res.set('X-Request-Id', requestId);

    if (!enabled) return next();
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms` +
          `${req.mtRoute ? ` [${req.mtRoute.operationId}]` : ''}`
      );
    });
    return next();
  };
}
