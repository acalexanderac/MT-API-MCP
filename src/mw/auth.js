import { invalidKey, headerInvalid } from '../lib/errors.js';

/**
 * HTTP basic auth, the scheme the API uses: the username is the organization
 * id and the password is a production or sandbox API key.
 */
export function basicAuth(config) {
  return (req, res, next) => {
    if (!config.requireAuth) return next();

    const header = req.get('authorization');
    if (!header) {
      res.set('WWW-Authenticate', 'Basic realm="Modern Treasury API"');
      throw invalidKey('Missing Authorization header');
    }
    const [scheme, encoded] = header.split(' ');
    if (!/^basic$/i.test(scheme || '') || !encoded) {
      throw headerInvalid('Authorization header must use HTTP basic auth', 'Authorization');
    }

    let decoded;
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      throw headerInvalid('Authorization header is not valid base64', 'Authorization');
    }

    const separator = decoded.indexOf(':');
    const organizationId = separator === -1 ? decoded : decoded.slice(0, separator);
    const apiKey = separator === -1 ? '' : decoded.slice(separator + 1);

    if (organizationId !== config.organizationId || !config.apiKeys.has(apiKey)) {
      throw invalidKey('Invalid organization id or API key');
    }

    req.auth = { organizationId, apiKey, liveMode: config.liveMode };
    return next();
  };
}
