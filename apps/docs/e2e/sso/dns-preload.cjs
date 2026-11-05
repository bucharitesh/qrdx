// Test only: points node:dns's resolver (resolveTxt and friends, not
// dns.lookup) at e2e/sso/dns-stub.mjs, for SSO domain verification runs.
// Loaded with NODE_OPTIONS="--require ./e2e/sso/dns-preload.cjs"; refuses to
// run in production.
if (process.env.NODE_ENV === "production") {
  throw new Error("e2e/sso/dns-preload.cjs is for local tests only");
}
const dns = require("node:dns");
const server = process.env.QRDX_TEST_DNS_SERVER || "127.0.0.1:5399";
dns.setServers([server]);
dns.promises.setServers([server]);
console.log(`[dns-preload] pid ${process.pid} resolves TXT via ${server}`);
