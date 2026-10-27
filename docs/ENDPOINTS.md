# Endpoint catalog

Generated from `spec/mt_openapi_spec_v1.yaml` by `npm run catalog`.

- **186** operations across **111** paths
- **48** API groups, **47** stored collections
- **20** operations have purpose-written handlers; the rest are driven generically from the specification

`handler` says how the operation is served: `list`/`get`/`create`/`update`/`delete` are the
generic spec-driven handlers, `special` means a named handler in `src/routes/special.js`.

## AccountCapability (1)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| PATCH | `/api/internal_accounts/{internal_account_id}/account_capabilities/{id}` | updateAccountCapability | 200 | update |

## AccountCollectionFlow (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/account_collection_flows` | listAccountCollectionFlows | 200 | list |
| POST | `/api/account_collection_flows` | createAccountCollectionFlow | 201 | create |
| GET | `/api/account_collection_flows/{id}` | getAccountCollectionFlow | 200 | get |
| PATCH | `/api/account_collection_flows/{id}` | updateAccountCollectionFlow | 200 | update |

## AccountDetail (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/{accounts_type}/{account_id}/account_details` | listAccountDetails | 200 | list |
| POST | `/api/{accounts_type}/{account_id}/account_details` | createAccountDetail | 201 | create |
| GET | `/api/{accounts_type}/{account_id}/account_details/{id}` | getAccountDetail | 200 | get |
| DELETE | `/api/{accounts_type}/{account_id}/account_details/{id}` | deleteAccountDetail | 204 | delete |

## BalanceReport (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/internal_accounts/{internal_account_id}/balance_reports` | listBalanceReports | 200 | list |
| POST | `/api/internal_accounts/{internal_account_id}/balance_reports` | createBalanceReport | 201 | create |
| GET | `/api/internal_accounts/{internal_account_id}/balance_reports/{id}` | getBalanceReport | 200 | get |
| DELETE | `/api/internal_accounts/{internal_account_id}/balance_reports/{id}` | deleteBalanceReport | 204 | delete |

## BulkRequest (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/bulk_requests` | listBulkRequests | 200 | list |
| POST | `/api/bulk_requests` | createBulkRequest | 201 | create |
| GET | `/api/bulk_requests/{id}` | getBulkRequest | 200 | get |

## BulkResult (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/bulk_results` | listBulkResults | 200 | list |
| GET | `/api/bulk_results/{id}` | getBulkResult | 200 | get |

## Case (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/cases` | listCases | 200 | list |
| GET | `/api/cases/{id}` | getCase | 200 | get |

## Connection (1)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/connections` | listConnections | 200 | list |

## ConnectionLegalEntity (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/connection_legal_entities` | listConnectionLegalEntities | 200 | list |
| POST | `/api/connection_legal_entities` | createConnectionLegalEntity | 201 | create |
| GET | `/api/connection_legal_entities/{id}` | getConnectionLegalEntity | 200 | get |
| PATCH | `/api/connection_legal_entities/{id}` | updateConnectionLegalEntity | 200 | update |

## Counterparty (6)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/counterparties` | listCounterparties | 200 | list |
| POST | `/api/counterparties` | createCounterparty | 201 | create |
| GET | `/api/counterparties/{id}` | getCounterparty | 200 | get |
| PATCH | `/api/counterparties/{id}` | updateCounterparty | 200 | update |
| DELETE | `/api/counterparties/{id}` | deleteCounterparty | 204 | delete |
| POST | `/api/counterparties/{id}/collect_account` | collectAccountDetails | 200 | special |

## Document (8)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/documents` | listDocuments | 200 | list |
| POST | `/api/documents` | createDocument | 201 | create |
| GET | `/api/documents/{id}` | getDocument | 200 | get |
| GET | `/api/documents/{id}/download` | downloadDocument | 200 | special |
| GET | `/api/{documentable_type}/{documentable_id}/documents` | listDocumentsNested | 200 | list |
| POST | `/api/{documentable_type}/{documentable_id}/documents` | createDocumentNested | 201 | create |
| GET | `/api/{documentable_type}/{documentable_id}/documents/{id}` | getDocumentNested | 200 | get |
| GET | `/api/{documentable_type}/{documentable_id}/documents/{id}/download` | downloadDocumentNested | 200 | special |

## Event (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/events` | listEvents | 200 | list |
| GET | `/api/events/{id}` | getEvent | 200 | get |

## ExpectedPayment (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/expected_payments` | listExpectedPayments | 200 | list |
| POST | `/api/expected_payments` | createExpectedPayment | 201 | create |
| GET | `/api/expected_payments/{id}` | getExpectedPayment | 200 | get |
| PATCH | `/api/expected_payments/{id}` | updateExpectedPayment | 200 | update |
| DELETE | `/api/expected_payments/{id}` | deleteExpectedPayment | 200 | delete |

## ExternalAccount (7)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/external_accounts` | listExternalAccounts | 200 | list |
| POST | `/api/external_accounts` | createExternalAccount | 201 | create |
| GET | `/api/external_accounts/{id}` | getExternalAccount | 200 | get |
| PATCH | `/api/external_accounts/{id}` | updateExternalAccount | 200 | update |
| DELETE | `/api/external_accounts/{id}` | deleteExternalAccount | 204 | delete |
| POST | `/api/external_accounts/{id}/complete_verification` | completeVerificationExternalAccount | 200 | special |
| POST | `/api/external_accounts/{id}/verify` | verifyExternalAccount | 200 | special |

## ForeignExchangeQuote (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/foreign_exchange_quotes` | listQuotes | 200 | list |
| POST | `/api/foreign_exchange_quotes` | createQuote | 201 | create |
| GET | `/api/foreign_exchange_quotes/{id}` | getQuote | 200 | get |

## Hold (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/holds` | listHolds | 200 | list |
| POST | `/api/holds` | createHold | 201 | create |
| GET | `/api/holds/{id}` | showHold | 200 | get |
| PATCH | `/api/holds/{id}` | updateHold | 200 | update |

## Identification (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| POST | `/api/identifications` | createIdentification | 201 | create |
| GET | `/api/identifications/{id}` | getIdentification | 200 | get |
| PATCH | `/api/identifications/{id}` | updateIdentification | 200 | update |

## IncomingPaymentDetail (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/incoming_payment_details` | listIncomingPaymentDetails | 200 | list |
| GET | `/api/incoming_payment_details/{id}` | getIncomingPaymentDetail | 200 | get |
| PATCH | `/api/incoming_payment_details/{id}` | updateIncomingPaymentDetail | 200 | update |
| POST | `/api/simulations/incoming_payment_details/create_async` | createAsyncIncomingPaymentDetail | 202 | special |

## InternalAccount (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/internal_accounts` | listInternalAccounts | 200 | list |
| POST | `/api/internal_accounts` | createInternalAccount | 201 | create |
| GET | `/api/internal_accounts/{id}` | getInternalAccount | 200 | get |
| PATCH | `/api/internal_accounts/{id}` | updateInternalAccount | 200 | update |
| POST | `/api/internal_accounts/{id}/request_closure` | requestInternalAccountClosure | 200 | special |

## Invoice (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/invoices` | listInvoices | 200 | list |
| POST | `/api/invoices` | createInvoice | 200 | create |
| GET | `/api/invoices/{id}` | getInvoice | 200 | get |
| PATCH | `/api/invoices/{id}` | updateInvoice | 200 | update |

## InvoiceLineItem (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/invoices/{invoice_id}/invoice_line_items` | listInvoiceLineItems | 200 | list |
| POST | `/api/invoices/{invoice_id}/invoice_line_items` | createInvoiceLineItem | 200 | create |
| GET | `/api/invoices/{invoice_id}/invoice_line_items/{id}` | getInvoiceLineItem | 200 | get |
| PATCH | `/api/invoices/{invoice_id}/invoice_line_items/{id}` | updateInvoiceLineItem | 200 | update |
| DELETE | `/api/invoices/{invoice_id}/invoice_line_items/{id}` | deleteInvoiceLineItem | 200 | delete |

## JournalEntry (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/journal_entries` | listJournalEntries | 200 | list |
| GET | `/api/journal_entries/{id}` | getJournalEntry | 200 | get |

## JournalReport (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/journal_reports` | listJournalReports | 200 | list |
| GET | `/api/journal_reports/{id}` | getJournalReport | 200 | get |
| PATCH | `/api/journal_reports/{id}` | updateJournalReport | 200 | update |

## JournalSource (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/journal_sources` | listJournalSources | 200 | list |
| GET | `/api/journal_sources/{id}` | getJournalSource | 200 | get |

## Ledger (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledgers` | listLedgers | 200 | list |
| POST | `/api/ledgers` | createLedger | 201 | create |
| GET | `/api/ledgers/{id}` | getLedger | 200 | get |
| PATCH | `/api/ledgers/{id}` | updateLedger | 200 | update |
| DELETE | `/api/ledgers/{id}` | deleteLedger | 200 | delete |

## LedgerAccount (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledger_accounts` | listLedgerAccounts | 200 | list |
| POST | `/api/ledger_accounts` | createLedgerAccount | 201 | create |
| GET | `/api/ledger_accounts/{id}` | getLedgerAccount | 200 | get |
| PATCH | `/api/ledger_accounts/{id}` | updateLedgerAccount | 200 | update |
| DELETE | `/api/ledger_accounts/{id}` | deleteLedgerAccount | 200 | delete |

## LedgerAccountBalanceMonitor (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledger_account_balance_monitors` | listLedgerAccountBalanceMonitors | 200 | list |
| POST | `/api/ledger_account_balance_monitors` | createLedgerAccountBalanceMonitor | 201 | create |
| GET | `/api/ledger_account_balance_monitors/{id}` | getLedgerAccountBalanceMonitor | 200 | get |
| PATCH | `/api/ledger_account_balance_monitors/{id}` | updateLedgerAccountBalanceMonitor | 200 | update |
| DELETE | `/api/ledger_account_balance_monitors/{id}` | deleteLedgerAccountBalanceMonitor | 200 | delete |

## LedgerAccountCategory (9)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledger_account_categories` | listLedgerAccountCategories | 200 | list |
| POST | `/api/ledger_account_categories` | createLedgerAccountCategory | 201 | create |
| GET | `/api/ledger_account_categories/{id}` | getLedgerAccountCategory | 200 | get |
| PATCH | `/api/ledger_account_categories/{id}` | updateLedgerAccountCategory | 200 | update |
| DELETE | `/api/ledger_account_categories/{id}` | deleteLedgerAccountCategory | 200 | delete |
| PUT | `/api/ledger_account_categories/{id}/ledger_account_categories/{sub_category_id}` | addLedgerAccountCategoryToLedgerAccountCategory | 200 | special |
| DELETE | `/api/ledger_account_categories/{id}/ledger_account_categories/{sub_category_id}` | deleteLedgerAccountCategoryFromLedgerAccountCategory | 200 | special |
| PUT | `/api/ledger_account_categories/{id}/ledger_accounts/{ledger_account_id}` | addLedgerAccountToLedgerAccountCategory | 200 | special |
| DELETE | `/api/ledger_account_categories/{id}/ledger_accounts/{ledger_account_id}` | removeLedgerAccountFromLedgerAccountCategory | 200 | special |

## LedgerAccountSettlement (6)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledger_account_settlements` | listLedgerAccountSettlements | 200 | list |
| POST | `/api/ledger_account_settlements` | createLedgerAccountSettlement | 201 | create |
| GET | `/api/ledger_account_settlements/{id}` | getLedgerAccountSettlement | 200 | get |
| PATCH | `/api/ledger_account_settlements/{id}` | updateLedgerAccountSettlement | 200 | update |
| PATCH | `/api/ledger_account_settlements/{id}/ledger_entries` | patchLedgerAccountSettlementEntries | 200 | special |
| DELETE | `/api/ledger_account_settlements/{id}/ledger_entries` | deleteLedgerAccountSettlementEntries | 200 | special |

## LedgerAccountStatement (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| POST | `/api/ledger_account_statements` | createLedgerAccountStatement | 201 | create |
| GET | `/api/ledger_account_statements/{id}` | getLedgerAccountStatement | 200 | get |

## LedgerEntry (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledger_entries` | listLedgerEntries | 200 | list |
| GET | `/api/ledger_entries/{id}` | getLedgerEntry | 200 | get |
| PATCH | `/api/ledger_entries/{id}` | updateLedgerEntry | 200 | update |

## LedgerTransaction (8)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ledger_transaction_versions` | listLedgerTransactionVersions | 200 | list |
| GET | `/api/ledger_transactions` | listLedgerTransactions | 200 | list |
| POST | `/api/ledger_transactions` | createLedgerTransaction | 201 | create |
| GET | `/api/ledger_transactions/{id}` | getLedgerTransaction | 200 | get |
| PATCH | `/api/ledger_transactions/{id}` | updateLedgerTransaction | 200 | update |
| POST | `/api/ledger_transactions/{id}/partial_post` | CreateLedgerTransactionPartialPost | 201 | special |
| POST | `/api/ledger_transactions/{id}/reversal` | CreateLedgerTransactionReversal | 201 | special |
| GET | `/api/ledger_transactions/{id}/versions` | listLedgerTransactionVersionsNested | 200 | list |

## LegalEntity (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/legal_entities` | listLegalEntities | 200 | list |
| POST | `/api/legal_entities` | createLegalEntity | 201 | create |
| GET | `/api/legal_entities/{id}` | getLegalEntity | 200 | get |
| PATCH | `/api/legal_entities/{id}` | updateLegalEntity | 200 | update |
| PATCH | `/api/simulations/legal_entities/{id}/update_status` | updateLegalEntityStatus | 202 | special |

## LegalEntityAssociation (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| POST | `/api/legal_entity_associations` | createLegalEntityAssociation | 201 | create |
| DELETE | `/api/legal_entity_associations/{id}` | deleteLegalEntityAssociation | 200 | delete |

## LineItem (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/{itemizable_type}/{itemizable_id}/line_items` | listLineItems | 200 | list |
| GET | `/api/{itemizable_type}/{itemizable_id}/line_items/{id}` | getLineItem | 200 | get |
| PATCH | `/api/{itemizable_type}/{itemizable_id}/line_items/{id}` | updateLineItem | 200 | update |

## PaymentAction (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/payment_actions` | listPaymentActions | 200 | list |
| POST | `/api/payment_actions` | createPaymentAction | 201 | create |
| GET | `/api/payment_actions/{id}` | getPaymentAction | 200 | get |
| PATCH | `/api/payment_actions/{id}` | updatePaymentAction | 200 | update |

## PaymentFlow (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/payment_flows` | listPaymentFlows | 200 | list |
| POST | `/api/payment_flows` | createPaymentFlow | 201 | create |
| GET | `/api/payment_flows/{id}` | getPaymentFlow | 200 | get |
| PATCH | `/api/payment_flows/{id}` | updatePaymentFlow | 200 | update |

## PaymentOrder (6)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| PUT | `/api/invoices/{id}/payment_orders/{payment_order_id}` | addPaymentOrderToInvoice | 200 | special |
| GET | `/api/payment_orders` | listPaymentOrders | 200 | list |
| POST | `/api/payment_orders` | createPaymentOrder | 201 | create |
| POST | `/api/payment_orders/create_async` | createAsyncPaymentOrder | 202 | special |
| GET | `/api/payment_orders/{id}` | getPaymentOrder | 200 | get |
| PATCH | `/api/payment_orders/{id}` | updatePaymentOrder | 200 | update |

## PaymentReference (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/payment_references` | listPaymentReferences | 200 | list |
| GET | `/api/payment_references/{id}` | getPaymentReference | 200 | get |

## Ping (1)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/ping` | pingAPI | 200 | special |

## Return (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/returns` | listReturns | 200 | list |
| POST | `/api/returns` | createReturn | 201 | create |
| GET | `/api/returns/{id}` | getReturn | 200 | get |

## Reversal (3)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/payment_orders/{payment_order_id}/reversals` | listReversals | 200 | list |
| POST | `/api/payment_orders/{payment_order_id}/reversals` | createReversal | 201 | create |
| GET | `/api/payment_orders/{payment_order_id}/reversals/{reversal_id}` | getReversal | 200 | get |

## RoutingDetail (4)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/{accounts_type}/{account_id}/routing_details` | listRoutingDetails | 200 | list |
| POST | `/api/{accounts_type}/{account_id}/routing_details` | createRoutingDetail | 201 | create |
| GET | `/api/{accounts_type}/{account_id}/routing_details/{id}` | getRoutingDetail | 200 | get |
| DELETE | `/api/{accounts_type}/{account_id}/routing_details/{id}` | deleteRoutingDetail | 204 | delete |

## Transaction (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/transactions` | listTransactions | 200 | list |
| POST | `/api/transactions` | createTransaction | 201 | create |
| GET | `/api/transactions/{id}` | getTransaction | 200 | get |
| PATCH | `/api/transactions/{id}` | updateTransaction | 200 | update |
| DELETE | `/api/transactions/{id}` | deleteTransaction | 204 | delete |

## TransactionLineItem (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/transaction_line_items` | listTransactionLineItems | 200 | list |
| POST | `/api/transaction_line_items` | createTransactionLineItem | 201 | create |
| GET | `/api/transaction_line_items/{id}` | listTransactionLineItem | 200 | get |
| DELETE | `/api/transaction_line_items/{id}` | deleteTransactionLineItem | 200 | delete |
| GET | `/api/transactions/{transaction_id}/line_items` | listTransactionLineItemsNested | 200 | list |

## Validation (1)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/validations/routing_numbers` | validateRoutingNumber | 200 | special |

## VirtualAccount (5)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/virtual_accounts` | listVirtualAccounts | 200 | list |
| POST | `/api/virtual_accounts` | createVirtualAccount | 201 | create |
| GET | `/api/virtual_accounts/{id}` | getVirtualAccount | 200 | get |
| PATCH | `/api/virtual_accounts/{id}` | updateVirtualAccount | 200 | update |
| DELETE | `/api/virtual_accounts/{id}` | deleteVirtualAccount | 200 | delete |

## VirtualAccountSetting (2)

| Method | Path | Operation | Status | Handler |
| --- | --- | --- | --- | --- |
| GET | `/api/virtual_account_settings` | listVirtualAccountSettings | 200 | list |
| POST | `/api/virtual_account_settings` | createVirtualAccountSetting | 201 | create |

