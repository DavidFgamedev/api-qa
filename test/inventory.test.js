"use strict";
const { startService, makeValidator, expectValid, newPlayer } = require("./helpers");
const { schemas } = require("../contracts");

let svc, ajv, playerId;
beforeAll(async () => { svc = await startService(); ajv = makeValidator(); });
afterAll(async () => { await svc.close(); });
beforeEach(async () => {
  svc.reset();
  playerId = (await svc.call("POST", "/players", { body: newPlayer() })).body.id;
});

describe("inventory", () => {
  test("granting an item matches the item contract", async () => {
    const r = await svc.call("PUT", `/players/${playerId}/inventory/health-potion`, { body: { quantity: 2 } });
    expect(r.status).toBe(200);
    expectValid(ajv, schemas.item, r.body);
    expect(r.body.quantity).toBe(2);
  });

  test("repeating the same write is idempotent: it sets, it does not accumulate", async () => {
    const body = { quantity: 2 };
    await svc.call("PUT", `/players/${playerId}/inventory/health-potion`, { body });
    const second = await svc.call("PUT", `/players/${playerId}/inventory/health-potion`, { body });
    expect(second.body.quantity).toBe(2);
    expect((await svc.call("GET", `/players/${playerId}/inventory`)).body.total).toBe(1);
  });

  test("an invalid slug is rejected", async () => {
    const r = await svc.call("PUT", `/players/${playerId}/inventory/Health_Potion`, { body: { quantity: 1 } });
    expect(r.status).toBe(422);
    expectValid(ajv, schemas.error, r.body);
  });

  test("a negative quantity is rejected", async () => {
    const r = await svc.call("PUT", `/players/${playerId}/inventory/health-potion`, { body: { quantity: -1 } });
    expect(r.status).toBe(422);
  });

  test("inventory for an absent player is 404, not an empty list", async () => {
    const r = await svc.call("GET", "/players/does-not-exist/inventory");
    expect(r.status).toBe(404);
  });

  test("deleting a player removes their inventory", async () => {
    await svc.call("PUT", `/players/${playerId}/inventory/health-potion`, { body: { quantity: 1 } });
    await svc.call("DELETE", `/players/${playerId}`);
    expect((await svc.call("GET", `/players/${playerId}/inventory`)).status).toBe(404);
  });
});
