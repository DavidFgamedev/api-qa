"use strict";
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const { createApp, DRIFTS, SESSION_KEY } = require("../service/app");
const { schemas } = require("../contracts");

/**
 * One server per test file, torn down after. State is reset before every test, which is
 * what makes "isolation between tests" something the suite asserts rather than assumes.
 *
 * DRIFT=all runs the whole suite against the deliberately broken build. Every test that
 * fails there names the drift it caught.
 */
const driftFromEnv = () => {
  const requested = (process.env.DRIFT || "").trim();
  const drift = {};
  if (requested === "all") for (const k of Object.keys(DRIFTS)) drift[k] = true;
  else for (const k of requested.split(",").filter(Boolean)) drift[k] = true;
  return drift;
};

function makeValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const s of Object.values(schemas)) ajv.addSchema(s, s.$id);
  return ajv;
}

/** Validates a body against a contract schema and fails with the actual errors, not a boolean. */
function expectValid(ajv, schema, body) {
  const validate = ajv.compile(schema);
  if (!validate(body)) {
    const why = validate.errors.map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ");
    throw new Error(`response does not match its contract: ${why}\nbody: ${JSON.stringify(body)}`);
  }
}

async function startService() {
  const { server, reset } = createApp({ drift: driftFromEnv() });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, { body, headers } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  return {
    base, call, reset,
    sessionKey: SESSION_KEY,
    close: () => new Promise((r) => server.close(r)),
  };
}

const newPlayer = (over = {}) => ({ displayName: "Ada", level: 3, ...over });

module.exports = { startService, makeValidator, expectValid, newPlayer, driftFromEnv };
