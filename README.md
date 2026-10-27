<div align="center">

# Modern Treasury Platform — MCP + a working local API

**A complete, runnable implementation of Modern Treasury's Platform API — all 186 endpoints — generated from the official OpenAPI specification. Plus the MCP configuration that lets an AI editor read the real API reference while you work.**

[![Node](https://img.shields.io/badge/Node.js-%E2%89%A5%2020.12-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![OpenAPI](https://img.shields.io/badge/spec--driven-OpenAPI%203-6BA539?logo=openapiinitiative&logoColor=white)](spec/mt_openapi_spec_v1.yaml)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-D97757)](https://modelcontextprotocol.io)

[![Operations](https://img.shields.io/badge/operations-186%20%2F%20186-brightgreen)](docs/ENDPOINTS.md)
[![Paths](https://img.shields.io/badge/paths-111-blue)](docs/ENDPOINTS.md)
[![Tests](https://img.shields.io/badge/tests-186%20catalog%20%2B%2042%20behaviour-brightgreen)](scripts/smoke.js)
[![Runtime deps](https://img.shields.io/badge/runtime%20deps-4-informational)](package.json)
[![License](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

</div>

```sh
npm install
npm start      # http://localhost:4010
npm test       # 186/186 operations + 42 behaviour checks
```

---

## In plain English

> *For anyone reading this who doesn't write code — this section is for you. Everything after it is engineering detail.*

Modern Treasury sells software that moves money between bank accounts. Companies connect to it through an **API**: a catalog of 186 operations — *create a payment*, *list invoices*, *reconcile a ledger* — that one program calls on another.

Building against a payments API is slow and risky. You cannot test "what happens when this transfer fails" against a real bank, and you cannot hand a new developer a live account on day one.

**This project solves that in two ways:**

| | What it does | Why it matters |
| --- | --- | --- |
| **A local copy of the whole API** | Every one of the 186 operations runs on your own machine. It accepts requests, stores records, returns realistic responses, and enforces the same rules as the real service — authentication, validation, rate limits, pagination, webhooks. | A developer can build and test a full integration in minutes: no account, no database, no bank involved, and no chance of moving real money by accident. |
| **AI editor integration (MCP)** | One configuration file connects AI coding tools (Claude Code, Cursor, Windsurf, Claude Desktop) to Modern Treasury's official documentation server. | Ask "what fields does a payment order need?" and the answer comes from the live, authoritative reference instead of the model's guesswork. |

**The part worth noticing:** none of the 186 endpoints were written by hand. The project reads Modern Treasury's own published specification — the machine-readable contract describing every endpoint — and *builds itself* from it at startup. Point it at a newer specification and the implementation follows. There is nothing to keep in sync, which is the usual reason this kind of tool rots within a quarter.

**It is verified, not just claimed.** An automated test suite calls all 186 operations and checks each response against the shape the specification demands, then runs 42 further checks on the behaviours above. The numbers in the badges at the top of this page are that suite's output.

<details>
<summary><strong>What this project demonstrates</strong> (click to expand)</summary>

<br>

| Area | Evidence in the code |
| --- | --- |
| API design & HTTP semantics | Correct status codes, a consistent error envelope, cursor pagination, idempotency keys, rate-limit headers |
| Working from a specification | A 186-operation OpenAPI document parsed into a live route table; its schemas reused for both request validation and response assertions |
| Code economy | ~20 purpose-written handlers cover the non-CRUD operations; the other 166 are served generically. 4 runtime dependencies, no database, no Docker |
| Testing | Full-catalog coverage with schema assertions, plus targeted behavioural tests; hermetic, so local environment cannot skew a result |
| Domain literacy | Payments vocabulary — ACH, payment orders, reversals, ledgers, counterparties, webhooks — modelled coherently |
| Developer experience | One command to run, seeded data whose references all resolve, generated endpoint docs, an HTML index of every route |
| AI tooling | Model Context Protocol configuration across four editors, with a curl-level verification path |
| Honest engineering | A specific, written [Known limits](#known-limits) section and a prioritised list of what to build next |

</details>

---

## MCP server

Remote, HTTP, no credentials.

**Claude Code** — `.mcp.json` already declares it:

```json
{
  "mcpServers": {
    "moderntreasury-platform": {
      "type": "http",
      "url": "https://docs.moderntreasury.com/mcp"
    }
  }
}
```

Project-scoped servers need a one-time approval: start `claude` in this
directory and accept the prompt (`claude mcp list` shows the status). To
register it for every project instead:

```sh
claude mcp add --transport http --scope user moderntreasury-platform https://docs.moderntreasury.com/mcp
```

**Cursor, Windsurf, Claude Desktop** — copy the matching file from `mcp/`:

| Tool | Destination | File |
| --- | --- | --- |
| Cursor | `~/.cursor/mcp.json` | `mcp/cursor.mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcp/windsurf_mcp_config.json` |
| Claude Desktop | `claude_desktop_config.json` | `mcp/claude_desktop_config.json` |

If a server you add later needs credentials, pass them as headers the way your
client supports (Claude Code: `claude mcp add --header "Authorization: Bearer …"`).

It exposes `list-specs`, `list-endpoints`, `search-endpoints`, `get-endpoint`
and `search-docs`, so "show me the create payment order request body" resolves
against the live reference. Verifying it by hand needs nothing but curl:

```sh
curl -sX POST https://docs.moderntreasury.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Using the API

Requires Node ≥ 20.12 (the start script uses Node's built-in
`--env-file-if-exists`). No database, no Docker, no account.

```text
Modern Treasury API listening on http://localhost:4010
  mode:        sandbox (test)
  catalog:     186 operations / 111 paths
  credentials: test-organization:test-api-key
  seeded:      136 records
```

HTTP basic auth: organization id as the username, API key as the password.

```sh
curl -u test-organization:test-api-key http://localhost:4010/api/ping
# {"ping":"pong"}
```

Create a payment order — submitted fields come back, the rest are filled in:

```sh
curl -u test-organization:test-api-key \
  -X POST http://localhost:4010/api/payment_orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 8f2b1c90' \
  -d '{
    "type": "ach",
    "amount": 125000,
    "direction": "credit",
    "originating_account_id": "<internal account id>",
    "receiving_account_id": "<external account id>",
    "metadata": { "invoice": "INV-2026-0042" }
  }'
```

```jsonc
{
  "id": "dcb75a83-cf91-4026-84ac-1d3f8375a8e6",
  "object": "payment_order",
  "amount": 125000,
  "currency": "USD",
  "direction": "credit",
  "status": "pending",
  "metadata": { "invoice": "INV-2026-0042" },
  "live_mode": false
  // …every other field the payment_order schema declares
}
```

Records stay put for the life of the process (or on disk, see
`MT_PERSIST_PATH`), so that order comes back from
`GET /api/payment_orders/{id}`, shows up in list results, filters on its
metadata, and can be updated or reversed. The server boots with a deterministic
dataset whose foreign keys point at records that really exist, so
`GET /api/invoices/{id}` → `counterparty_id` → `GET /api/counterparties/{id}`
all resolve.

Cursor pagination:

```sh
curl -u test-organization:test-api-key -D - \
  'http://localhost:4010/api/ledger_accounts?per_page=2'
# X-Per-Page: 2
# X-After-Cursor: 9be7d41a-d373-415b-9d08-895419f69fec
```

Filtering, including on metadata:

```sh
curl -u test-organization:test-api-key \
  'http://localhost:4010/api/payment_orders?direction=credit&created_at_start=2026-01-01&metadata[invoice]=INV-2026-0042'
```

The event log fills as you write, and `MT_WEBHOOK_URL` gets the same events
signed with `X-Signature` (HMAC-SHA256 of the body using `MT_WEBHOOK_KEY`):

```sh
curl -u test-organization:test-api-key 'http://localhost:4010/api/events?per_page=5'
# [{ "object": "event", "event_name": "payment_order.created", "data": { … } }, …]
```

`docs/ENDPOINTS.md` lists all 186 operations with the handler each one uses;
`npm run catalog` regenerates it.

### What it reproduces

| Area | Behaviour |
| --- | --- |
| Authentication | HTTP basic auth, organization id as username and API key as password; `401` with `invalid_key` otherwise |
| Errors | `{ "errors": { code, message, parameter }, "error_list": [ … ] }`, with `parameter_invalid` / `parameter_missing` / `resource_not_found` / `conflict` / `too_many_requests` |
| Validation | Bodies and query parameters are checked against the specification's own schemas, so a wrong type is a `400` naming the field and a missing required field is a `422` |
| Pagination | `per_page` (default 25, max 100) and `after_cursor`, with `X-Per-Page` and `X-After-Cursor`; the cursor header disappears on the last page |
| Filtering | `field=value`, `field_start` / `field_end` ranges, `metadata[key]=value`, repeated parameters as OR |
| Idempotency | `Idempotency-Key` on `POST`/`PATCH`, scoped to the API key, route-independent, replayed for 24 hours with `Idempotent-Replayed: true`; `409` while the first request is in flight; `400` over 180 characters |
| Rate limits | 100 req/s general and 20 req/s for lists in live mode, 25/5 in sandbox, 1/s for creating bulk requests; `429` with `Retry-After` and `X-RateLimit-*` headers |
| Metadata | Merged on update, with `""` or `null` unsetting a key |
| Events & webhooks | Every create/update/delete appends an `event` readable through `GET /api/events`, and is delivered to `MT_WEBHOOK_URL` signed with `X-Signature` |
| Nested resources | `/api/invoices/{id}/invoice_line_items`, `/api/payment_orders/{id}/reversals`, and the polymorphic `{documentable_type}` / `{itemizable_type}` / `{accounts_type}` families resolve their parent and `404` when it does not exist |
| Documents | `POST /api/documents` accepts `multipart/form-data`; `GET /api/documents/{id}/download` returns the file with `Content-Disposition` |

### Configuration

Copy `.env.example` to `.env` and set what you need: `npm start` and `npm run dev`
load it with Node's own `--env-file-if-exists`, so a missing file is fine and
anything already in the environment still wins. `.env` is gitignored.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4010` | Listen port |
| `MT_ORGANIZATION_ID` | `test-organization` | Basic auth username |
| `MT_API_KEYS` | `test-api-key` | Comma-separated accepted keys |
| `MT_REQUIRE_AUTH` | `true` | `false` disables the auth check |
| `MT_LIVE_MODE` | `false` | `true` sets `live_mode` on records and raises the rate limits |
| `MT_RATE_LIMITS` | `on` | `off` disables per-second limits |
| `MT_SEED` / `MT_SEED_COUNT` | `on` / `3` | Seeded records per collection |
| `MT_LOGGING` | `on` | Per-request log line |
| `MT_WEBHOOK_URL` / `MT_WEBHOOK_KEY` | – / `webhook-key` | Webhook delivery and signing |
| `MT_PERSIST_PATH` | – | Snapshot the store to this path on shutdown, reload it at boot |
| `MT_SPEC_PATH` | `spec/mt_openapi_spec_v1.yaml` | Serve a different specification |

These are the credentials the **server accepts** from callers — this project
*is* the API, so no real Modern Treasury key is involved anywhere.

### Server helpers

Outside the catalog, under a prefix no real endpoint can collide with:

| Route | Purpose |
| --- | --- |
| `GET /` | HTML index of every mounted operation |
| `GET /__meta/health` | Counts: operations, paths, collections, records |
| `GET /__meta/routes` | The route table as JSON, with the handler each operation uses |
| `GET /__meta/store` | Record count per collection |
| `POST /__meta/reset` | Clear and re-seed |
| `GET /openapi.json`, `/openapi.yaml` | The specification being served |

---

## How it works

Nothing is hand-written per endpoint. `spec/mt_openapi_spec_v1.yaml` (vendored
from [Modern-Treasury/modern-treasury-openapi](https://github.com/Modern-Treasury/modern-treasury-openapi))
is parsed into a route table at boot, each path is classified, and generic
handlers serve it — so the catalog cannot drift from the spec it ships with.

```text
spec/mt_openapi_spec_v1.yaml
          │
          ▼
  parse + route table            186 operations, their parameters, request
  (src/lib/spec.js)              and response schemas, success statuses
          │
          ▼
  classify each path             collection │ single record │ action,
  (src/routes/classify.js)       its storage collection, the parent that scopes it
          │
          ├─── 166 operations ──▶ generic list / get / create / update / delete
          │                       (src/routes/handlers.js)
          └───  20 operations ──▶ purpose-written handlers: verify, complete_verification,
                                  request_closure, partial_post, reversal, create_async,
                                  category memberships, document download, routing number
                                  validation, ping  (src/routes/special.js)
```

| | |
| --- | --- |
| Operations implemented | 186 / 186 (111 paths, 48 API groups) |
| Stored collections | 47, seeded with referentially consistent records |
| Purpose-written handlers | 20; the other 166 are driven generically from the spec |
| Tests | 186 catalog operations + 42 behaviour checks, all passing |
| Runtime dependencies | 4 — `express`, `ajv`, `ajv-formats`, `yaml` |

Records are synthesized from the response schema, then the request body is
merged **through** that schema: nested objects merge field by field, arrays of
objects merge onto a complete item, fields the schema does not declare are
dropped, and resource type names are translated to whichever spelling the
schema expects (`payment_orders` / `payment_order` / `PaymentOrder`). Generation
is deterministic and cycle-safe, so a payment order's `current_return` — itself
a return, with its own `current_return` — terminates instead of recursing.

<details>
<summary><strong>Source layout</strong> (click to expand)</summary>

```text
spec/mt_openapi_spec_v1.yaml   the published specification (the source of truth)
src/server.js                  entry point
src/app.js                     config, middleware order, /__meta helpers
src/seed.js                    deterministic starting dataset
src/lib/spec.js                parse the spec, build the route table, convert schemas for Ajv
src/lib/synth.js               schema-driven value generation (deterministic, cycle-safe)
src/lib/resources.js           build records, merge request bodies through the response schema
src/lib/store.js               in-memory collections with parent links and snapshots
src/lib/query.js               filtering and cursor pagination
src/lib/validate.js            request and response validation
src/lib/events.js              event log and webhook delivery
src/lib/errors.js              the API error shape
src/lib/multipart.js           document uploads
src/lib/formats.js             what a field can actually hold
src/mw/                        auth, idempotency, rate limiting, logging
src/routes/classify.js         what each path operates on
src/routes/handlers.js         generic list / get / create / update / delete
src/routes/special.js          the 20 non-CRUD operations
src/routes/register.js         mounting, most specific path first
scripts/smoke.js               the test suite
scripts/catalog.js             regenerate docs/ENDPOINTS.md
```

</details>

---

## Tests

`npm test` starts the server in-process, calls **every** operation in the
catalog with path parameters resolved to real records, and validates each
response against the schema the specification declares for it — then runs 42
focused checks on auth, errors, pagination, filtering, idempotency, metadata,
events, memberships, downloads, async creation, reversals, and rate limiting.

```text
catalog:   186/186 operations responded as specified
behaviour: 42/42 checks passed

all checks passed
```

Credentials are passed explicitly when the suite builds the app, so it stays
hermetic no matter what is in `.env` or the environment.

---

## Known limits

A faithful local implementation, not a payments system.

* Data lives in memory (optionally snapshotted to JSON), and generated field
  values are plausible rather than real — no bank is contacted, nothing settles.
* Business state machines are simplified: payment orders do not advance through
  processing on their own, `verify` records an attempt and
  `complete_verification` accepts any positive amounts, and balances are
  synthesized rather than computed from ledger entries.
* Request bodies are validated with `oneOf` read as `anyOf`, because the
  specification's alternative payload shapes overlap (a bulk request resource
  satisfies several at once, with `resource_type` saying which was meant).
  Response validation keeps the stricter reading.
* A submitted value the response schema could not return — a malformed
  timestamp into a `format: time` field — is not echoed back; the stored value
  stays.
* `journal_entries`, `journal_reports`, and `journal_sources` are served with a
  minimal record shape because the specification documents no schema for them.
* Uploaded document bytes are not retained: the field values and file metadata
  are, and downloads return a small placeholder file.
* Webhook delivery is fire-and-forget with no retries.

The next things worth building, in order: ledger account balances computed from
posted entries, a payment order lifecycle that actually ticks
(`pending → processing → completed`, with returns and reversals driving status),
webhook retries with backoff, and running the official Modern Treasury SDKs
against this server as a conformance check.

---

MIT licensed — see `LICENSE`. `spec/mt_openapi_spec_v1.yaml` is vendored from
Modern Treasury and remains Copyright (c) 2022 Modern Treasury, MIT licensed.

Made with love by [alexanderac.dev](https://alexanderac.dev)
