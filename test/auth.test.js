"use strict";
const { startService, makeValidator, expectValid } = require("./helpers");
const { schemas } = require("../contracts");

let svc, ajv;
beforeAll(async () => { svc = await startService(); ajv = makeValidator(); });
afterAll(async () => { await svc.close(); });
beforeEach(() => svc.reset());

describe("authenticated route", () => {
  test("a valid session key is accepted", async () => {
    const r = await svc.call("POST", "/admin/reset", { headers: { "x-session-key": svc.sessionKey } });
    expect(r.status).toBe(204);
  });

  test("no session key is rejected with 401 [drift: brokenAuth]", async () => {
    const r = await svc.call("POST", "/admin/reset");
    expect(r.status).toBe(401);
    expectValid(ajv, schemas.error, r.body);
    expect(r.body.error).toBe("unauthorized");
  });

  test("a wrong session key is rejected with 401 [drift: brokenAuth]", async () => {
    const r = await svc.call("POST", "/admin/reset", { headers: { "x-session-key": "not-the-key" } });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("unauthorized");
  });

  test("an empty session key is rejected, not treated as absent-and-allowed [drift: brokenAuth]", async () => {
    const r = await svc.call("POST", "/admin/reset", { headers: { "x-session-key": "" } });
    expect(r.status).toBe(401);
  });

  test("rejection does not perform the action", async () => {
    await svc.call("POST", "/players", { body: { displayName: "Ada", level: 3 } });
    await svc.call("POST", "/admin/reset");                       // unauthorised
    expect((await svc.call("GET", "/players")).body.total).toBe(1); // state survived
  });
});
