import { applyFilters, paginate } from '../lib/query.js';
import { ApiError, notFound } from '../lib/errors.js';
import {
  applyUpdate,
  belongsToParent,
  buildResource,
  now,
  orderKeys,
} from '../lib/resources.js';

/**
 * Resolve the parent scope of a nested route (`/api/invoices/{invoice_id}/...`),
 * verifying the parent record exists.
 */
export function resolveParent(descriptor, req, ctx) {
  if (!descriptor.parent) return null;
  const type = descriptor.parent.type || req.params[descriptor.parent.typeParam];
  const id = req.params[descriptor.parent.idParam];
  if (!type || !id) return null;

  if (ctx.resources.has(type)) {
    const exists = ctx.store.get(type, id);
    if (!exists) {
      throw notFound(
        descriptor.parent.idParam,
        `Couldn't find ${type.replace(/_/g, ' ')} with id ${id}`
      );
    }
  }
  return { type, id };
}

function entryFor(descriptor, req, ctx, parent) {
  const id = req.params[descriptor.idParam];
  const entry = ctx.store.getEntry(descriptor.resource, id);
  if (!entry) throw notFound(descriptor.idParam, `Couldn't find record with id ${id}`);
  if (!belongsToParent(entry, parent)) {
    throw notFound(descriptor.idParam, `Couldn't find record with id ${id}`);
  }
  return entry;
}

export function listHandler(descriptor, ctx) {
  return (req, res) => {
    const parent = resolveParent(descriptor, req, ctx);
    const query = ctx.validator.validateQuery(descriptor, req.query);
    const all = ctx.store.entries(descriptor.resource);
    const base = parent ? all.filter((entry) => belongsToParent(entry, parent)) : all;
    const scoped = ctx.preFilter ? ctx.preFilter(descriptor, base, req.query) : base;
    const filtered = applyFilters(scoped, req.query);
    const { page, headers } = paginate(filtered, query);
    res.set(headers);
    res.status(descriptor.successStatus).json(page.map((entry) => entry.record));
  };
}

export function showHandler(descriptor, ctx) {
  return (req, res) => {
    const parent = resolveParent(descriptor, req, ctx);
    const entry = entryFor(descriptor, req, ctx, parent);
    res.status(descriptor.successStatus).json(entry.record);
  };
}

export function createHandler(descriptor, ctx) {
  return (req, res) => {
    const parent = resolveParent(descriptor, req, ctx);
    const body = ctx.validator.validateBody(descriptor, req.body);
    const record = buildResource(ctx.spec, descriptor, {
      body,
      parent,
      liveMode: ctx.config.liveMode,
      index: ctx.store.count(descriptor.resource),
    });
    ctx.store.insert(descriptor.resource, record, parent);
    ctx.events.emit(descriptor.resource, 'created', record);
    res.status(descriptor.successStatus).json(record);
  };
}

export function updateHandler(descriptor, ctx) {
  return (req, res) => {
    const parent = resolveParent(descriptor, req, ctx);
    const entry = entryFor(descriptor, req, ctx, parent);
    const body = ctx.validator.validateBody(descriptor, req.body);
    const updated = orderKeys(
      applyUpdate(entry.record, body, { spec: ctx.spec, schema: descriptor.responseSchema })
    );
    ctx.store.update(descriptor.resource, updated.id, updated);
    ctx.events.emit(descriptor.resource, 'updated', updated);
    res.status(descriptor.successStatus).json(updated);
  };
}

export function deleteHandler(descriptor, ctx) {
  return (req, res) => {
    const parent = resolveParent(descriptor, req, ctx);
    const entry = entryFor(descriptor, req, ctx, parent);
    const removed = ctx.store.remove(descriptor.resource, entry.record.id);
    const timestamp = now();
    const discarded = orderKeys({
      ...removed,
      ...('discarded_at' in removed ? { discarded_at: timestamp } : {}),
      updated_at: timestamp,
    });
    ctx.events.emit(descriptor.resource, 'deleted', discarded);

    // Some deletes answer 204, others 200 with the discarded record, and a few
    // answer 200 with no body at all — the spec says which.
    if (!descriptor.producesJson) {
      res.status(descriptor.successStatus).end();
      return;
    }
    res.status(descriptor.successStatus).json(discarded);
  };
}

/** Routes the spec declares but that have no documented body or semantics. */
export function notImplementedHandler(descriptor) {
  return () => {
    throw new ApiError(501, {
      code: 'parameter_invalid',
      message: `${descriptor.operationId} is not implemented by this server`,
    });
  };
}

export function genericHandler(descriptor, ctx) {
  if (descriptor.kind === 'collection' && descriptor.method === 'get') {
    return listHandler(descriptor, ctx);
  }
  if (descriptor.isCreate) return createHandler(descriptor, ctx);
  if (descriptor.isShow) return showHandler(descriptor, ctx);
  if (descriptor.isUpdate) return updateHandler(descriptor, ctx);
  if (descriptor.isDelete) return deleteHandler(descriptor, ctx);
  return notImplementedHandler(descriptor);
}
