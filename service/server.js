"use strict";
const { createApp, DRIFTS } = require("./app");

/** Run the service. DRIFT=all, or DRIFT=renameField,wrongStatus to pick specific ones. */
const requested = (process.env.DRIFT || "").trim();
const drift = {};
if (requested === "all") for (const k of Object.keys(DRIFTS)) drift[k] = true;
else for (const k of requested.split(",").filter(Boolean)) drift[k] = true;

const { server } = createApp({ drift });
const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  const on = Object.keys(drift);
  console.log(`api-qa fixture service on http://localhost:${port}${on.length ? ` [drift: ${on.join(", ")}]` : ""}`);
});
