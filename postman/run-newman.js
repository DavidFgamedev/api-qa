"use strict";
const newman = require("newman");
const path = require("node:path");
const { createApp } = require("../service/app");

/**
 * Boots the fixture service on an ephemeral port and runs the generated collection
 * against it. No external service, no fixed port, nothing to leave running.
 *
 * DRIFT is honoured so the same collection can be pointed at the broken build, which is
 * how the self-check proves Newman would actually catch a regression.
 */
const drift = {};
const requested = (process.env.DRIFT || "").trim();
if (requested === "all") for (const k of ["renameField", "wrongStatus", "missingProperty", "brokenAuth"]) drift[k] = true;
else for (const k of requested.split(",").filter(Boolean)) drift[k] = true;

const { server } = createApp({ drift });
server.listen(0, () => {
  const baseUrl = `http://localhost:${server.address().port}`;
  newman.run(
    {
      collection: require(path.join(__dirname, "api-qa.postman_collection.json")),
      envVar: [{ key: "baseUrl", value: baseUrl }, { key: "sessionKey", value: "test-session-key" }],
      reporters: ["cli"],
      bail: false,
    },
    (err, summary) => {
      server.close();
      if (err) { console.error(err); process.exit(2); }
      const failed = summary.run.failures.length;
      console.log(`\nnewman: ${summary.run.stats.assertions.total} assertions, ${failed} failure(s)${requested ? ` [drift: ${requested}]` : ""}`);
      process.exit(failed ? 1 : 0);
    },
  );
});
