import { ApiError, notFound, parameterMissing } from '../lib/errors.js';
import { applyUpdate, buildResource, now, orderKeys } from '../lib/resources.js';
import { synth } from '../lib/synth.js';
import { newUuid } from '../lib/rand.js';

/** Fetch a record or raise the API's 404 shape. */
function must(ctx, resource, id, parameter = 'id') {
  const record = ctx.store.get(resource, id);
  if (!record) {
    throw notFound(parameter, `Couldn't find ${resource.replace(/_/g, ' ')} with id ${id}`);
  }
  return record;
}

/** Build a record for a schema that is not the route's own resource. */
function recordFor(ctx, resource, objectName, ref, body = {}, parent = null) {
  return buildResource(
    ctx.spec,
    { resource, objectName, responseSchema: { $ref: `#/components/schemas/${ref}` } },
    { body, parent, liveMode: ctx.config.liveMode, index: ctx.store.count(resource) }
  );
}

function save(ctx, resource, record, parent = null, action = 'created') {
  ctx.store.insert(resource, record, parent);
  ctx.events.emit(resource, action, record);
  return record;
}

function persistUpdate(ctx, resource, record, patch, action = 'updated') {
  const updated = orderKeys(applyUpdate(record, patch));
  ctx.store.update(resource, updated.id, updated);
  ctx.events.emit(resource, action, updated);
  return updated;
}

function linkSet(ctx, type, id) {
  const key = `${type}:${id}`;
  if (!ctx.links.has(key)) ctx.links.set(key, new Set());
  return ctx.links.get(key);
}

/** Use a caller-supplied redirect only when it is a usable URL. */
function safeUrl(value, fallback = 'https://app.moderntreasury.com') {
  try {
    const url = new URL(String(value));
    if (!/^https?:$/.test(url.protocol)) return fallback;
    return url.origin + url.pathname.replace(/[/]+$/, '');
  } catch {
    return fallback;
  }
}

function sendDocument(res, document) {
  const filename = document?.file?.filename || `${document.id}.pdf`;
  const contentType = document?.file?.content_type || 'application/pdf';
  const body = Buffer.from(
    `%PDF-1.4\n% Modern Treasury document ${document.id}\n% ${filename}\n`,
    'utf8'
  );
  res.status(200);
  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(body.length),
  });
  res.end(body);
}

export const SPECIAL_HANDLERS = {
  /** GET /api/ping */
  pingAPI: (descriptor) => (req, res) => {
    res.status(descriptor.successStatus).json({ ping: 'pong' });
  },

  /** GET /api/validations/routing_numbers */
  validateRoutingNumber: (descriptor, ctx) => (req, res) => {
    const query = ctx.validator.validateQuery(descriptor, req.query);
    if (!query.routing_number) throw parameterMissing('routing_number');
    if (!query.routing_number_type) throw parameterMissing('routing_number_type');
    if (query.routing_number_type === 'aba' && !/^\d{9}$/.test(String(query.routing_number))) {
      throw notFound('routing_number', 'Routing number could not be found');
    }
    const lookup = synth(
      ctx.spec,
      { $ref: '#/components/schemas/routing_number_lookup_request' },
      { seed: `routing:${query.routing_number}`, objectName: 'routing_number_lookup_request' }
    );
    res.status(descriptor.successStatus).json({
      ...lookup,
      routing_number: String(query.routing_number),
      routing_number_type: query.routing_number_type,
    });
  },

  /** GET /api/documents/{id}/download */
  downloadDocument: (descriptor, ctx) => (req, res) => {
    const document = must(ctx, 'documents', req.params[descriptor.parent.idParam], 'id');
    sendDocument(res, document);
  },

  /** GET /api/{documentable_type}/{documentable_id}/documents/{id}/download */
  downloadDocumentNested: (descriptor, ctx) => (req, res) => {
    const document = must(ctx, 'documents', req.params.id, 'id');
    sendDocument(res, document);
  },

  /** POST /api/counterparties/{id}/collect_account */
  collectAccountDetails: (descriptor, ctx) => (req, res) => {
    const counterpartyId = req.params[descriptor.parent.idParam];
    must(ctx, 'counterparties', counterpartyId, 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);

    const flow = recordFor(
      ctx,
      'account_collection_flows',
      'account_collection_flow',
      'account_collection_flow',
      {
        counterparty_id: counterpartyId,
        payment_types: body.payment_types || ['ach'],
        status: 'pending',
      }
    );
    const isResend = ctx.store
      .entries('account_collection_flows')
      .some((entry) => entry.record.counterparty_id === counterpartyId);
    save(ctx, 'account_collection_flows', flow);

    const redirect = safeUrl(body.custom_redirect);
    res.status(descriptor.successStatus).json({
      form_link: `${redirect}/forms/${encodeURIComponent(flow.id)}`,
      id: counterpartyId,
      is_resend: isResend,
    });
  },

  /** POST /api/external_accounts/{id}/verify */
  verifyExternalAccount: (descriptor, ctx) => (req, res) => {
    const externalAccountId = req.params[descriptor.parent.idParam];
    const account = must(ctx, 'external_accounts', externalAccountId, 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);

    // Already-verified accounts echo the account back rather than re-verifying.
    if (account.verification_status === 'verified') {
      res.status(descriptor.successStatus).json(account);
      return;
    }

    const attempt = recordFor(
      ctx,
      'external_account_verification_attempts',
      'external_account_verification_attempt',
      'external_account_verification_attempt',
      {
        external_account_id: externalAccountId,
        originating_account_id: body.originating_account_id,
        payment_type: body.payment_type,
        priority: body.priority ?? null,
        status: 'pending_verification',
      }
    );
    save(ctx, 'external_account_verification_attempts', attempt);
    persistUpdate(ctx, 'external_accounts', account, {
      verification_status: 'pending_verification',
    });
    res.status(descriptor.successStatus).json(attempt);
  },

  /** POST /api/external_accounts/{id}/complete_verification */
  completeVerificationExternalAccount: (descriptor, ctx) => (req, res) => {
    const externalAccountId = req.params[descriptor.parent.idParam];
    const account = must(ctx, 'external_accounts', externalAccountId, 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);
    const amounts = body.amounts || [];
    const verified = amounts.length > 0 && amounts.every((amount) => Number(amount) > 0);
    const updated = persistUpdate(ctx, 'external_accounts', account, {
      verification_status: verified ? 'verified' : 'unverified',
      verification_source: 'microdeposits',
    });
    res.status(descriptor.successStatus).json(updated);
  },

  /** POST /api/internal_accounts/{id}/request_closure */
  requestInternalAccountClosure: (descriptor, ctx) => (req, res) => {
    const internalAccountId = req.params[descriptor.parent.idParam];
    const account = must(ctx, 'internal_accounts', internalAccountId, 'id');
    const updated = persistUpdate(ctx, 'internal_accounts', account, {
      status: 'pending_closure',
    });
    res.status(descriptor.successStatus).json(updated);
  },

  /** POST /api/payment_orders/create_async */
  createAsyncPaymentOrder: (descriptor, ctx) => (req, res) => {
    const body = ctx.validator.validateBody(descriptor, req.body);
    const order = recordFor(ctx, 'payment_orders', 'payment_order', 'payment_order', {
      ...body,
      status: 'pending',
    });
    // The real API accepts the request and creates the order out of band.
    setTimeout(() => save(ctx, 'payment_orders', order), 0);
    res.status(descriptor.successStatus).json({ id: order.id, object: 'async_response' });
  },

  /** POST /api/simulations/incoming_payment_details/create_async */
  createAsyncIncomingPaymentDetail: (descriptor, ctx) => (req, res) => {
    const body = ctx.validator.validateBody(descriptor, req.body);
    const detail = recordFor(
      ctx,
      'incoming_payment_details',
      'incoming_payment_detail',
      'incoming_payment_detail',
      { ...body, status: 'completed' }
    );
    save(ctx, 'incoming_payment_details', detail);
    res.status(descriptor.successStatus).json(detail);
  },

  /** PATCH /api/simulations/legal_entities/{id}/update_status */
  updateLegalEntityStatus: (descriptor, ctx) => (req, res) => {
    const legalEntityId = req.params[descriptor.parent.idParam];
    const entity = must(ctx, 'legal_entities', legalEntityId, 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);
    if (!body.status) throw parameterMissing('status');
    const updated = persistUpdate(ctx, 'legal_entities', entity, { status: body.status });
    res.status(descriptor.successStatus).json(updated);
  },

  /** POST /api/ledger_transactions/{id}/partial_post */
  CreateLedgerTransactionPartialPost: (descriptor, ctx) => (req, res) => {
    const original = must(ctx, 'ledger_transactions', req.params[descriptor.parent.idParam], 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);
    const posted = recordFor(ctx, 'ledger_transactions', 'ledger_transaction', 'ledger_transaction', {
      description: body.description ?? original.description,
      effective_at: body.effective_at ?? original.effective_at,
      ledger_id: original.ledger_id,
      ledger_entries: body.posted_ledger_entries ?? original.ledger_entries,
      metadata: body.metadata ?? {},
      partially_posts_ledger_transaction_id: original.id,
      posted_at: now(),
      status: 'posted',
    });
    save(ctx, 'ledger_transactions', posted);
    res.status(descriptor.successStatus).json(posted);
  },

  /** POST /api/ledger_transactions/{id}/reversal */
  CreateLedgerTransactionReversal: (descriptor, ctx) => (req, res) => {
    const original = must(ctx, 'ledger_transactions', req.params[descriptor.parent.idParam], 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);
    const reversedEntries = (original.ledger_entries || []).map((entry) => ({
      ...entry,
      id: newUuid(),
      direction: entry?.direction === 'credit' ? 'debit' : 'credit',
    }));
    const reversal = recordFor(ctx, 'ledger_transactions', 'ledger_transaction', 'ledger_transaction', {
      description: body.description ?? `Reversal of ${original.id}`,
      effective_at: body.effective_at ?? now(),
      external_id: body.external_id ?? null,
      ledger_id: original.ledger_id,
      ledger_entries: reversedEntries,
      ledgerable_id: body.ledgerable_id ?? original.ledgerable_id,
      ledgerable_type: body.ledgerable_type ?? original.ledgerable_type,
      metadata: body.metadata ?? {},
      reverses_ledger_transaction_id: original.id,
      status: body.status ?? 'posted',
    });
    save(ctx, 'ledger_transactions', reversal);
    persistUpdate(ctx, 'ledger_transactions', original, {
      reversed_by_ledger_transaction_id: reversal.id,
    });
    res.status(descriptor.successStatus).json(reversal);
  },

  /** PUT /api/invoices/{id}/payment_orders/{payment_order_id} */
  addPaymentOrderToInvoice: (descriptor, ctx) => (req, res) => {
    const invoice = must(ctx, 'invoices', req.params.id, 'id');
    const order = must(ctx, 'payment_orders', req.params.payment_order_id, 'payment_order_id');
    const existing = Array.isArray(invoice.payment_orders) ? invoice.payment_orders : [];
    if (!existing.some((po) => po?.id === order.id)) {
      persistUpdate(ctx, 'invoices', invoice, { payment_orders: [...existing, order] });
    }
    res.status(descriptor.successStatus).json({});
  },

  /** PUT /api/ledger_account_categories/{id}/ledger_accounts/{ledger_account_id} */
  addLedgerAccountToLedgerAccountCategory: (descriptor, ctx) => (req, res) => {
    must(ctx, 'ledger_account_categories', req.params.id, 'id');
    must(ctx, 'ledger_accounts', req.params.ledger_account_id, 'ledger_account_id');
    linkSet(ctx, 'category_accounts', req.params.id).add(req.params.ledger_account_id);
    res.status(descriptor.successStatus).json({});
  },

  /** DELETE /api/ledger_account_categories/{id}/ledger_accounts/{ledger_account_id} */
  removeLedgerAccountFromLedgerAccountCategory: (descriptor, ctx) => (req, res) => {
    must(ctx, 'ledger_account_categories', req.params.id, 'id');
    must(ctx, 'ledger_accounts', req.params.ledger_account_id, 'ledger_account_id');
    linkSet(ctx, 'category_accounts', req.params.id).delete(req.params.ledger_account_id);
    res.status(descriptor.successStatus).json({});
  },

  /** PUT /api/ledger_account_categories/{id}/ledger_account_categories/{sub_category_id} */
  addLedgerAccountCategoryToLedgerAccountCategory: (descriptor, ctx) => (req, res) => {
    must(ctx, 'ledger_account_categories', req.params.id, 'id');
    must(ctx, 'ledger_account_categories', req.params.sub_category_id, 'sub_category_id');
    if (req.params.id === req.params.sub_category_id) {
      throw new ApiError(409, {
        code: 'conflict',
        message: 'A ledger account category cannot contain itself',
        parameter: 'sub_category_id',
      });
    }
    linkSet(ctx, 'category_categories', req.params.id).add(req.params.sub_category_id);
    res.status(descriptor.successStatus).json({});
  },

  /** DELETE /api/ledger_account_categories/{id}/ledger_account_categories/{sub_category_id} */
  deleteLedgerAccountCategoryFromLedgerAccountCategory: (descriptor, ctx) => (req, res) => {
    must(ctx, 'ledger_account_categories', req.params.id, 'id');
    must(ctx, 'ledger_account_categories', req.params.sub_category_id, 'sub_category_id');
    linkSet(ctx, 'category_categories', req.params.id).delete(req.params.sub_category_id);
    res.status(descriptor.successStatus).json({});
  },

  /** PATCH /api/ledger_account_settlements/{id}/ledger_entries */
  patchLedgerAccountSettlementEntries: (descriptor, ctx) => (req, res) => {
    const settlement = must(ctx, 'ledger_account_settlements', req.params.id, 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);
    const members = linkSet(ctx, 'settlement_entries', settlement.id);
    for (const id of body.ledger_entry_ids || []) {
      must(ctx, 'ledger_entries', id, 'ledger_entry_ids');
      members.add(id);
    }
    res.status(descriptor.successStatus).json({});
  },

  /** DELETE /api/ledger_account_settlements/{id}/ledger_entries */
  deleteLedgerAccountSettlementEntries: (descriptor, ctx) => (req, res) => {
    const settlement = must(ctx, 'ledger_account_settlements', req.params.id, 'id');
    const body = ctx.validator.validateBody(descriptor, req.body);
    const members = linkSet(ctx, 'settlement_entries', settlement.id);
    for (const id of body.ledger_entry_ids || []) members.delete(id);
    res.status(descriptor.successStatus).json({});
  },
};
