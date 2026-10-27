import { genericHandler } from './handlers.js';
import { SPECIAL_HANDLERS } from './special.js';

/** Routes with more literal segments are more specific and must match first. */
const specificity = (route) =>
  route.path.split('/').filter((segment) => segment && !segment.startsWith('{')).length;

/**
 * Mount every operation in the catalog on the Express app.
 *
 * Each route runs: route tagging -> path-parameter checks -> rate limiting ->
 * its handler (a generic CRUD handler, or a named handler for the operations
 * that are not plain CRUD).
 */
export function registerRoutes(app, descriptors, ctx, { rateLimit } = {}) {
  const ordered = [...descriptors].sort(
    (a, b) => specificity(b) - specificity(a) || b.path.length - a.path.length
  );

  const mounted = [];
  for (const descriptor of ordered) {
    const factory = descriptor.special ? SPECIAL_HANDLERS[descriptor.operationId] : null;
    if (descriptor.special && !factory) {
      throw new Error(`no handler registered for special operation ${descriptor.operationId}`);
    }
    const handler = factory ? factory(descriptor, ctx) : genericHandler(descriptor, ctx);

    const chain = [tagRoute(descriptor, ctx)];
    if (rateLimit) chain.push(rateLimit);
    chain.push(handler);

    app[descriptor.method](descriptor.expressPath, ...chain);
    mounted.push(descriptor);
  }
  return mounted;
}

function tagRoute(descriptor, ctx) {
  return (req, res, next) => {
    req.mtRoute = descriptor;
    ctx.validator.validatePathParams(descriptor, req.params);
    next();
  };
}
