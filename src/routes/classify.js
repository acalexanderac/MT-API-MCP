import { singularize } from '../lib/synth.js';

/**
 * Operations that are not plain CRUD on a collection. Each is implemented by a
 * named handler in `src/routes/special.js`.
 */
export const SPECIAL_OPERATIONS = new Set([
  'pingAPI',
  'validateRoutingNumber',
  'downloadDocument',
  'downloadDocumentNested',
  'collectAccountDetails',
  'verifyExternalAccount',
  'completeVerificationExternalAccount',
  'requestInternalAccountClosure',
  'createAsyncPaymentOrder',
  'createAsyncIncomingPaymentDetail',
  'updateLegalEntityStatus',
  'CreateLedgerTransactionPartialPost',
  'CreateLedgerTransactionReversal',
  'addPaymentOrderToInvoice',
  'addLedgerAccountToLedgerAccountCategory',
  'removeLedgerAccountFromLedgerAccountCategory',
  'addLedgerAccountCategoryToLedgerAccountCategory',
  'deleteLedgerAccountCategoryFromLedgerAccountCategory',
  'patchLedgerAccountSettlementEntries',
  'deleteLedgerAccountSettlementEntries',
]);

/** Operations whose URL segment does not match the storage collection. */
const RESOURCE_OVERRIDES = {
  listLedgerTransactionVersionsNested: 'ledger_transaction_versions',
  listTransactionLineItemsNested: 'transaction_line_items',
};

/** `payment_reference_object` is the schema name; the resource is a reference. */
function objectNameFromSchema(schema) {
  if (!schema) return null;
  const ref = schema.$ref || schema.items?.$ref;
  if (!ref) return null;
  return ref.split('/').pop().replace(/_object$/, '');
}

const bare = (segment) => segment.replace(/^\{|\}$/g, '');
const isParam = (segment) => segment.startsWith('{');

/**
 * Work out what a catalog path operates on: which collection, whether it
 * addresses the collection or a single record, and what parent scopes it.
 */
export function classify(route) {
  const special = SPECIAL_OPERATIONS.has(route.operationId);
  const segments = route.path.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  let lastLiteral = -1;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (!isParam(segments[i])) {
      lastLiteral = i;
      break;
    }
  }

  const resource =
    RESOURCE_OVERRIDES[route.operationId] ||
    (lastLiteral >= 0 ? segments[lastLiteral] : 'unknown');

  const trailing = segments.slice(lastLiteral + 1).map(bare);
  const kind = special ? 'action' : trailing.length ? 'item' : 'collection';
  const idParam = trailing[trailing.length - 1] || null;

  let parent = null;
  if (lastLiteral >= 2) {
    const parentIdSegment = segments[lastLiteral - 1];
    const parentTypeSegment = segments[lastLiteral - 2];
    if (isParam(parentIdSegment)) {
      parent = {
        idParam: bare(parentIdSegment),
        type: isParam(parentTypeSegment) ? null : parentTypeSegment,
        typeParam: isParam(parentTypeSegment) ? bare(parentTypeSegment) : null,
      };
    }
  }

  const schemaObject = objectNameFromSchema(route.responseSchema);
  const objectName = schemaObject || singularize(resource);
  const isList =
    kind === 'collection' &&
    route.method === 'get' &&
    route.responseSchema?.type === 'array';

  return {
    ...route,
    special,
    kind,
    resource,
    idParam,
    parent,
    objectName,
    isList,
    /** `collection` operation that creates a record. */
    isCreate: kind === 'collection' && route.method === 'post',
    isUpdate: kind === 'item' && (route.method === 'patch' || route.method === 'put'),
    isDelete: kind === 'item' && route.method === 'delete',
    isShow: kind === 'item' && route.method === 'get',
  };
}

export function classifyAll(routes) {
  return routes.map(classify);
}
