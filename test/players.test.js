"use strict";
const { startService, makeValidator, expectValid, newPlayer } = require("./helpers");
const { schemas } = require("../contracts");

let svc, ajv;
beforeAll(async () => { svc = await startService(); ajv = makeValidator(); });
afterAll(async () => { await svc.close(); });
beforeEach(() => svc.reset());

describe("players", () => {
  test("create returns 201 [drift: wrongStatus]", async () => {
    const r = await svc.call("POST", "/players", { body: newPlayer() });
    expect(r.status).toBe(201);
  });

  test("created player matches the player contract [drift: renameField, missingProperty]", async () => {
    const r = await svc.call("POST", "/players", { body: newPlayer() });
    expectValid(ajv, schemas.player, r.body);
  });

  test("created player echoes the submitted fields [drift: renameField]", async () => {
    const r = await svc.call("POST", "/players", { body: newPlayer({ displayName: "Grace", level: 9 }) });
    expect(r.body.displayName).toBe("Grace");
    expect(r.body.level).toBe(9);
  });

  test("read returns the created player", async () => {
    const c = await svc.call("POST", "/players", { body: newPlayer() });
    const r = await svc.call("GET", `/players/${c.body.id}`);
    expect(r.status).toBe(200);
    expectValid(ajv, schemas.player, r.body);
    expect(r.body.id).toBe(c.body.id);
  });

  test("read of an absent id is 404 in the standard error shape", async () => {
    const r = await svc.call("GET", "/players/does-not-exist");
    expect(r.status).toBe(404);
    expectValid(ajv, schemas.error, r.body);
    expect(r.body.error).toBe("not_found");
  });

  test("update changes only what was sent", async () => {
    const c = await svc.call("POST", "/players", { body: newPlayer({ displayName: "Ada", level: 3 }) });
    const r = await svc.call("PATCH", `/players/${c.body.id}`, { body: { level: 7 } });
    expect(r.status).toBe(200);
    expectValid(ajv, schemas.player, r.body);
    expect(r.body.level).toBe(7);
    expect(r.body.displayName).toBe("Ada");
  });

  test("delete is idempotent: repeating it is still 204", async () => {
    const c = await svc.call("POST", "/players", { body: newPlayer() });
    expect((await svc.call("DELETE", `/players/${c.body.id}`)).status).toBe(204);
    expect((await svc.call("DELETE", `/players/${c.body.id}`)).status).toBe(204);
    expect((await svc.call("GET", `/players/${c.body.id}`)).status).toBe(404);
  });

  describe("validation", () => {
    test.each([
      ["empty displayName", { displayName: "", level: 3 }],
      ["level below range", { displayName: "Ada", level: 0 }],
      ["level above range", { displayName: "Ada", level: 1000 }],
      ["level not an integer", { displayName: "Ada", level: 1.5 }],
      ["displayName too long", { displayName: "x".repeat(33), level: 3 }],
    ])("%s is 422 with the error contract", async (_label, body) => {
      const r = await svc.call("POST", "/players", { body });
      expect(r.status).toBe(422);
      expectValid(ajv, schemas.error, r.body);
      expect(r.body.error).toBe("validation_failed");
      expect(Array.isArray(r.body.details)).toBe(true);
    });

    test("a malformed JSON body is rejected, not crashed on", async () => {
      const res = await fetch(`${svc.base}/players`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{not json",
      });
      expect(res.status).toBe(422);
    });
  });

  describe("state isolation", () => {
    test("first test creates two players", async () => {
      await svc.call("POST", "/players", { body: newPlayer() });
      await svc.call("POST", "/players", { body: newPlayer() });
      expect((await svc.call("GET", "/players")).body.total).toBe(2);
    });
    test("second test sees none of them", async () => {
      expect((await svc.call("GET", "/players")).body.total).toBe(0);
    });
  });
});
