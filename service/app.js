"use strict";
const http = require("node:http");

/**
 * Ids are sequential per service instance rather than random.
 *
 * A fixture wants reproducible ids: a failing assertion that names p-3 is easier to read
 * than one naming a UUID, and nothing here needs unguessability. It also keeps the
 * service free of any import a vocabulary sweep has to be told to ignore.
 */
let nextId = 0;
const newId = (prefix) => `${prefix}-${++nextId}`;

/**
 * A small game-services API: players, inventory, leaderboard.
 *
 * Plain Node, no framework, so the thing under test is the HTTP behaviour itself and not
 * a framework's conventions. State is in memory and reset between tests, which is what
 * makes isolation assertable rather than hoped for.
 *
 * `drift` deliberately breaks the contract in named ways. The drifted build is the
 * failing fixture: a suite that only ever sees a correct service proves nothing about
 * whether it would notice an incorrect one.
 */

const SESSION_KEY = "test-session-key";   // fixture credential, not a secret

const DRIFTS = {
  renameField: "player.displayName is returned as player.name",
  wrongStatus: "POST /players returns 200 instead of 201",
  missingProperty: "player.createdAt is omitted from responses",
  brokenAuth: "/admin/reset accepts any session header, or none",
};

function createApp({ drift = {} } = {}) {
  let players = new Map();
  let items = new Map();
  nextId = 0;

  const reset = () => { players = new Map(); items = new Map(); nextId = 0; };

  const serialisePlayer = (p) => {
    const out = { id: p.id, displayName: p.displayName, level: p.level, createdAt: p.createdAt };
    if (drift.renameField) { out.name = out.displayName; delete out.displayName; }
    if (drift.missingProperty) delete out.createdAt;
    return out;
  };

  const send = (res, status, body) => {
    if (body === undefined) { res.writeHead(status); return res.end(); }
    const payload = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
    res.end(payload);
  };
  const fail = (res, status, error, message, details) =>
    send(res, status, details ? { error, message, details } : { error, message });

  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });

  const paginate = (all, url) => {
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
  };

  const validatePlayer = (b, partial) => {
    const details = [];
    if (!partial || b.displayName !== undefined) {
      if (typeof b.displayName !== "string" || b.displayName.length < 1 || b.displayName.length > 32)
        details.push("displayName must be a string of 1 to 32 characters");
    }
    if (!partial || b.level !== undefined) {
      if (!Number.isInteger(b.level) || b.level < 1 || b.level > 999)
        details.push("level must be an integer between 1 and 999");
    }
    return details;
  };

  const handler = async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const seg = url.pathname.split("/").filter(Boolean);
    const m = req.method;

    try {
      // ---- authenticated route -------------------------------------------------
      if (seg[0] === "admin" && seg[1] === "reset" && m === "POST") {
        const key = req.headers["x-session-key"];
        const ok = drift.brokenAuth ? true : key === SESSION_KEY;
        if (!ok) return fail(res, 401, "unauthorized", "A valid session key is required.");
        reset();
        return send(res, 204, undefined);
      }

      // ---- players -------------------------------------------------------------
      if (seg[0] === "players" && seg.length === 1) {
        if (m === "GET") {
          const all = [...players.values()].map(serialisePlayer);
          return send(res, 200, paginate(all, url));
        }
        if (m === "POST") {
          const body = await readBody(req);
          if (body === null) return fail(res, 422, "validation_failed", "Body is not valid JSON.");
          const details = validatePlayer(body, false);
          if (details.length) return fail(res, 422, "validation_failed", "Player is not valid.", details);
          const p = {
            id: newId("p"),
            displayName: body.displayName,
            level: body.level,
            createdAt: new Date().toISOString(),
          };
          players.set(p.id, p);
          return send(res, drift.wrongStatus ? 200 : 201, serialisePlayer(p));
        }
      }

      if (seg[0] === "players" && seg.length === 2) {
        const p = players.get(seg[1]);
        if (m === "GET") {
          if (!p) return fail(res, 404, "not_found", "No player with that id.");
          return send(res, 200, serialisePlayer(p));
        }
        if (m === "PATCH") {
          if (!p) return fail(res, 404, "not_found", "No player with that id.");
          const body = await readBody(req);
          if (body === null) return fail(res, 422, "validation_failed", "Body is not valid JSON.");
          const details = validatePlayer(body, true);
          if (details.length) return fail(res, 422, "validation_failed", "Player is not valid.", details);
          Object.assign(p, body);
          return send(res, 200, serialisePlayer(p));
        }
        if (m === "DELETE") {
          /* Idempotent on purpose: deleting an absent player is still 204, so a retried
             write after a dropped response does not surface as a spurious 404. */
          players.delete(seg[1]);
          for (const [k, v] of items) if (v.playerId === seg[1]) items.delete(k);
          return send(res, 204, undefined);
        }
      }

      // ---- inventory -----------------------------------------------------------
      if (seg[0] === "players" && seg[2] === "inventory") {
        const p = players.get(seg[1]);
        if (!p) return fail(res, 404, "not_found", "No player with that id.");
        if (seg.length === 3 && m === "GET") {
          const all = [...items.values()].filter((i) => i.playerId === seg[1]);
          return send(res, 200, paginate(all, url));
        }
        if (seg.length === 4 && m === "PUT") {
          const slug = seg[3];
          if (!/^[a-z0-9-]+$/.test(slug))
            return fail(res, 422, "validation_failed", "Item slug is not valid.", ["slug must match ^[a-z0-9-]+$"]);
          const body = await readBody(req);
          if (body === null) return fail(res, 422, "validation_failed", "Body is not valid JSON.");
          if (!Number.isInteger(body.quantity) || body.quantity < 0)
            return fail(res, 422, "validation_failed", "Item is not valid.", ["quantity must be an integer of 0 or more"]);
          /* PUT, so repeating it sets rather than adds. Same request, same end state. */
          const key = `${seg[1]}:${slug}`;
          const it = { id: key, playerId: seg[1], slug, quantity: body.quantity };
          items.set(key, it);
          return send(res, 200, it);
        }
      }

      // ---- leaderboard ---------------------------------------------------------
      if (seg[0] === "leaderboard" && m === "GET") {
        const all = [...players.values()]
          .sort((a, b) => b.level - a.level || a.displayName.localeCompare(b.displayName))
          .map(serialisePlayer);
        return send(res, 200, paginate(all, url));
      }

      return fail(res, 404, "not_found", "No such route.");
    } catch (err) {
      return fail(res, 422, "validation_failed", `Request could not be handled: ${err.message}`);
    }
  };

  const server = http.createServer(handler);
  return { server, reset, SESSION_KEY };
}

module.exports = { createApp, DRIFTS, SESSION_KEY };
