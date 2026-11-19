# api-qa

[![api-qa](https://github.com/DavidFgamedev/api-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/DavidFgamedev/api-qa/actions/workflows/ci.yml)

API and contract testing for a small game-services API. **Jest** drives a real HTTP
service, responses are validated against **JSON Schema** contracts, and a **Postman**
collection generated from those same contracts runs in CI through **Newman**.

A deliberately drifted build of the service ships as the failing fixture.

```bash
npm ci
npm test                  # Jest, 44 tests, over real HTTP
npm run newman            # the generated collection against the fixture service
npm run test:drifted      # the same suite against the broken build: must fail
```

## What is under test

A plain-Node service, no framework, so what is being tested is HTTP behaviour rather
than a framework's conventions. Players, inventory and a leaderboard, with create, read,
update, delete, pagination, validation errors, and one authenticated route. State is in
memory and reset between tests.

## What the suite checks

- **Status codes**, per endpoint, from the contract table.
- **Response bodies against JSON Schema**, with `additionalProperties: false`, so an
  extra field is a failure rather than a shrug.
- **One error shape** for every failure: `{ error, message, details? }`, with `error`
  constrained to a fixed set. Clients can branch on it.
- **Auth rejection**: absent, wrong, and empty session keys are each rejected, and a
  rejected request is checked to have performed no work.
- **Pagination boundaries**: a full page, a partial last page, a page past the end
  returning empty rather than erroring, and pages that cover every record exactly once
  without overlap.
- **Idempotency**: `DELETE` twice is still 204, and `PUT` of the same item sets rather
  than accumulates.
- **State isolation**: one test creates records and the next asserts it sees none of them.

## One contract, two consumers

`contracts/index.js` is the only copy of any schema. The Jest suite validates live
responses against it, and `npm run postman:generate` emits the Postman collection from the
same table.

A hand-written collection beside a hand-written suite is two copies of one contract, and
the copies diverge the first time an endpoint changes, with both still green. CI runs
`npm run postman:check` and fails if the collection is out of date before Newman gets a
chance to report a misleading pass.

`test/contract.test.js` drives every row of the table against the live service, so the
table itself is checked for honesty rather than trusted.

## The drifted build

`DRIFT=all` starts a service that breaks its contract in four named ways:

| drift | what it does |
|---|---|
| `renameField` | returns `name` where the contract says `displayName` |
| `wrongStatus` | `POST /players` answers 200 instead of 201 |
| `missingProperty` | omits the required `createdAt` |
| `brokenAuth` | the authenticated route accepts any session key, or none |

Each is caught by at least one named test, and CI asserts that per drift, not just in
aggregate. A suite that has only ever seen a correct service proves nothing about whether
it would notice an incorrect one.

```
DRIFT=renameField      8 failed, 36 passed
DRIFT=wrongStatus      2 failed, 42 passed
DRIFT=missingProperty  7 failed, 37 passed
DRIFT=brokenAuth       5 failed, 39 passed
```

## What this deliberately does not do

**No database, no network, no auth provider.** The service is in-memory and the session
key is a fixture value, so there is nothing to provision and nothing to leak. This tests
contract and HTTP behaviour, not persistence, concurrency under real load, or a real
identity system.

**No performance or load testing.** Response times here mean nothing: the service is a
few hundred lines in the same process.

**The service is a fixture, not a product.** It exists to be tested. Judge the tests.

## CI

Three jobs. Jest on Node 18, 20 and 22. Newman against the generated collection, gated on
the collection being in sync. And a drift job asserting that both Jest and Newman exit
non-zero against the broken build, and that every individual drift is caught by name.

## Licence

MIT
