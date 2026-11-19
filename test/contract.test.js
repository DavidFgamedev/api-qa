"use strict";
const { startService, makeValidator, expectValid, newPlayer } = require("./helpers");
const { CONTRACTS } = require("../contracts");

/**
 * Drives every row of the contract table against the live service.
 *
 * The per-endpoint suites assert behaviour; this one asserts that the table itself is
 * honest, so the Postman collection generated from it describes a service that really
 * answers that way. Without this, the table could drift from the service and only the
 * generated collection would notice, in CI, as a confusing Newman failure.
 */
let svc, ajv;
beforeAll(async () => { svc = await startService(); ajv = makeValidator(); });
afterAll(async () => { await svc.close(); });

const fill = async (path) => {
  if (!path.includes("{playerId}")) return path;
  const id = (await svc.call("POST", "/players", { body: newPlayer() })).body.id;
  return path.replace("{playerId}", id).replace("{slug}", "health-potion");
};

describe("every contract row matches the live service", () => {
  for (const c of CONTRACTS) {
    test(`${c.method} ${c.path} :: ${c.name}`, async () => {
      svc.reset();
      const path = await fill(c.path);
      const qs = c.query ? "?" + new URLSearchParams(c.query) : "";
      const headers = c.auth ? { "x-session-key": svc.sessionKey } : {};
      const r = await svc.call(c.method, path + qs, { body: c.body, headers });
      expect(r.status).toBe(c.expect.status);
      if (c.expect.schema) expectValid(ajv, c.expect.schema, r.body);
      else expect(r.body).toBeUndefined();
    });
  }
});
