"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { CONTRACTS, schemas } = require("../contracts");

/**
 * Generates the Postman collection FROM the contract table.
 *
 * Writing the collection by hand would make it a second copy of every schema, and two
 * copies of one contract diverge the first time an endpoint changes, with both still
 * green. Here the table is the only source: each request's status assertion and its
 * JSON Schema check are emitted from the same row the Jest suite reads.
 *
 *   node postman/generate.js           rewrite the collection
 *   node postman/generate.js --check   fail if it is out of date (CI uses this)
 */
const OUT = path.join(__dirname, "api-qa.postman_collection.json");

const script = (c) => {
  const lines = [
    `pm.test("status is ${c.expect.status}", function () {`,
    `  pm.response.to.have.status(${c.expect.status});`,
    `});`,
  ];
  if (c.expect.schema) {
    lines.push(
      `pm.test("body matches its contract", function () {`,
      `  const schema = ${JSON.stringify(c.expect.schema)};`,
      `  const defs = ${JSON.stringify(schemas)};`,
      `  pm.response.to.have.jsonSchema(resolve(schema, defs));`,
      `});`,
      `function resolve(node, defs) {`,
      `  if (Array.isArray(node)) return node.map(function (n) { return resolve(n, defs); });`,
      `  if (node && typeof node === "object") {`,
      `    if (typeof node.$ref === "string" && defs[node.$ref]) return resolve(defs[node.$ref], defs);`,
      `    const out = {};`,
      `    Object.keys(node).forEach(function (k) { if (k !== "$id") out[k] = resolve(node[k], defs); });`,
      `    return out;`,
      `  }`,
      `  return node;`,
      `}`,
    );
  } else {
    lines.push(`pm.test("body is empty", function () { pm.expect(pm.response.text()).to.eql(""); });`);
  }
  return lines;
};

const item = (c) => ({
  name: `${c.method} ${c.path} :: ${c.name}`,
  event: [{ listen: "test", script: { type: "text/javascript", exec: script(c) } }],
  request: {
    method: c.method,
    header: [
      ...(c.body ? [{ key: "Content-Type", value: "application/json" }] : []),
      ...(c.auth ? [{ key: "X-Session-Key", value: "{{sessionKey}}" }] : []),
    ],
    ...(c.body ? { body: { mode: "raw", raw: JSON.stringify(c.body, null, 2) } } : {}),
    url: {
      raw: `{{baseUrl}}${c.path}${c.query ? "?" + new URLSearchParams(c.query) : ""}`,
      host: ["{{baseUrl}}"],
      path: c.path.split("/").filter(Boolean).map((s) => s.replace(/^\{(.+)\}$/, "{{$1}}")),
      ...(c.query ? { query: Object.entries(c.query).map(([key, value]) => ({ key, value: String(value) })) } : {}),
    },
  },
});

const collection = {
  info: {
    name: "api-qa",
    description:
      "Generated from contracts/index.js. Do not edit by hand: run `npm run postman:generate`. " +
      "The collection and the Jest suite read the same contract table, so there is one copy of each schema.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000" },
    { key: "sessionKey", value: "test-session-key" },
    { key: "playerId", value: "" },
    { key: "slug", value: "health-potion" },
  ],
  item: CONTRACTS.filter((c) => !c.path.includes("{playerId}")).map(item),
};

const text = JSON.stringify(collection, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== text) {
    console.error("The Postman collection is out of date with contracts/index.js.");
    console.error("Run `npm run postman:generate` and commit the result.");
    process.exit(1);
  }
  console.log(`Postman collection is in sync with the contract table (${collection.item.length} requests).`);
} else {
  fs.writeFileSync(OUT, text);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} with ${collection.item.length} requests.`);
}
