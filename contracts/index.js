/**
 * The contract table. One definition per endpoint, and the only copy of any schema.
 *
 * Both consumers read from here: the Jest suite validates live responses against these
 * schemas, and the Postman collection is GENERATED from this table rather than written
 * by hand. That is the whole point. A hand-maintained collection beside a hand-maintained
 * test suite is two copies of one contract, and the copies diverge the first time an
 * endpoint changes, with both still green.
 *
 * `npm run postman:generate` rewrites the collection; CI fails if it is out of date.
 */

const player = {
  $id: "player",
  type: "object",
  required: ["id", "displayName", "level", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    displayName: { type: "string", minLength: 1, maxLength: 32 },
    level: { type: "integer", minimum: 1, maximum: 999 },
    createdAt: { type: "string", format: "date-time" },
  },
};

const item = {
  $id: "item",
  type: "object",
  required: ["id", "playerId", "slug", "quantity"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    playerId: { type: "string", minLength: 1 },
    slug: { type: "string", pattern: "^[a-z0-9-]+$" },
    quantity: { type: "integer", minimum: 0 },
  },
};

const page = (itemsSchema) => ({
  type: "object",
  required: ["items", "page", "pageSize", "total"],
  additionalProperties: false,
  properties: {
    items: { type: "array", items: itemsSchema },
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
    total: { type: "integer", minimum: 0 },
  },
});

/** Every failure on this service looks like this. One shape, so clients can rely on it. */
const error = {
  $id: "error",
  type: "object",
  required: ["error", "message"],
  additionalProperties: false,
  properties: {
    error: { type: "string", enum: ["validation_failed", "not_found", "unauthorized"] },
    message: { type: "string", minLength: 1 },
    details: { type: "array", items: { type: "string" } },
  },
};

const CONTRACTS = [
  {
    name: "list players",
    method: "GET",
    path: "/players",
    query: { page: 1, pageSize: 2 },
    auth: false,
    expect: { status: 200, schema: page({ $ref: "player" }) },
  },
  {
    name: "create player",
    method: "POST",
    path: "/players",
    auth: false,
    body: { displayName: "Ada", level: 3 },
    expect: { status: 201, schema: player },
  },
  {
    name: "create player, invalid body",
    method: "POST",
    path: "/players",
    auth: false,
    body: { displayName: "", level: 0 },
    expect: { status: 422, schema: error },
  },
  {
    name: "read player",
    method: "GET",
    path: "/players/{playerId}",
    auth: false,
    expect: { status: 200, schema: player },
  },
  {
    name: "read player, absent",
    method: "GET",
    path: "/players/does-not-exist",
    auth: false,
    expect: { status: 404, schema: error },
  },
  {
    name: "update player",
    method: "PATCH",
    path: "/players/{playerId}",
    auth: false,
    body: { level: 7 },
    expect: { status: 200, schema: player },
  },
  {
    name: "delete player",
    method: "DELETE",
    path: "/players/{playerId}",
    auth: false,
    expect: { status: 204, schema: null },
  },
  {
    name: "list inventory",
    method: "GET",
    path: "/players/{playerId}/inventory",
    auth: false,
    expect: { status: 200, schema: page({ $ref: "item" }) },
  },
  {
    name: "grant item",
    method: "PUT",
    path: "/players/{playerId}/inventory/{slug}",
    auth: false,
    body: { quantity: 2 },
    expect: { status: 200, schema: item },
  },
  {
    name: "leaderboard",
    method: "GET",
    path: "/leaderboard",
    query: { page: 1, pageSize: 10 },
    auth: false,
    expect: { status: 200, schema: page({ $ref: "player" }) },
  },
  {
    name: "admin reset, authenticated",
    method: "POST",
    path: "/admin/reset",
    auth: true,
    expect: { status: 204, schema: null },
  },
  {
    name: "admin reset, no session",
    method: "POST",
    path: "/admin/reset",
    auth: false,
    expect: { status: 401, schema: error },
  },
];

module.exports = { CONTRACTS, schemas: { player, item, error } };
