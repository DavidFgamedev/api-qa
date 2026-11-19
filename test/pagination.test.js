"use strict";
const { startService, makeValidator, expectValid, newPlayer } = require("./helpers");
const { schemas } = require("../contracts");

let svc, ajv;
beforeAll(async () => { svc = await startService(); ajv = makeValidator(); });
afterAll(async () => { await svc.close(); });
beforeEach(async () => {
  svc.reset();
  for (let i = 0; i < 5; i++) {
    await svc.call("POST", "/players", { body: newPlayer({ displayName: `p${i}`, level: i + 1 }) });
  }
});

describe("pagination boundaries", () => {
  test("first page returns pageSize items and the true total", async () => {
    const r = await svc.call("GET", "/players?page=1&pageSize=2");
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.total).toBe(5);
    expect(r.body.page).toBe(1);
  });

  test("the last partial page returns the remainder, not a full page", async () => {
    const r = await svc.call("GET", "/players?page=3&pageSize=2");
    expect(r.body.items).toHaveLength(1);
  });

  test("a page past the end is empty rather than an error", async () => {
    const r = await svc.call("GET", "/players?page=99&pageSize=2");
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(0);
    expect(r.body.total).toBe(5);
  });

  test("pages do not overlap and cover every record exactly once", async () => {
    const a = (await svc.call("GET", "/players?page=1&pageSize=2")).body.items.map((x) => x.id);
    const b = (await svc.call("GET", "/players?page=2&pageSize=2")).body.items.map((x) => x.id);
    const c = (await svc.call("GET", "/players?page=3&pageSize=2")).body.items.map((x) => x.id);
    const all = [...a, ...b, ...c];
    expect(new Set(all).size).toBe(5);
  });

  test("the page envelope matches its contract [drift: renameField, missingProperty]", async () => {
    const r = await svc.call("GET", "/players?page=1&pageSize=2");
    expectValid(ajv, {
      type: "object",
      required: ["items", "page", "pageSize", "total"],
      additionalProperties: false,
      properties: {
        items: { type: "array", items: schemas.player },
        page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" },
      },
    }, r.body);
  });

  test("leaderboard is ordered by level, highest first", async () => {
    const r = await svc.call("GET", "/leaderboard?page=1&pageSize=10");
    const levels = r.body.items.map((p) => p.level);
    expect(levels).toEqual([...levels].sort((x, y) => y - x));
  });
});
