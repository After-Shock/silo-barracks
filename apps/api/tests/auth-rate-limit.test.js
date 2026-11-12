// Fork regression: the auth rate limiter is applied once, at the /auth mount in
// server.js, which exempts GET /auth/isConfigured (the SPA calls it on every
// full page load). The router must not add its own limiter: doing so blanked
// the whole app after ~20 page reloads per IP and double-counted logins.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const configPath = require.resolve(path.join(__dirname, "..", "classes", "config"));
class FakeConfig {
  async getConfig() {
    return { state: 2, REQUIRE_LOGIN: true, APP_USER: "local-auth", settings: { auth: { mode: "local" } } };
  }
  clearCache() {}
}
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: FakeConfig };

test("routes/auth.js does not rate-limit by itself", async () => {
  const originalLog = console.log;
  console.log = () => {};
  const express = require("express");
  const authRouter = require("../routes/auth");
  console.log = originalLog;

  const app = express();
  app.use("/auth", authRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    for (let index = 0; index < 150; index += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/auth/isConfigured`);
      assert.notEqual(response.status, 429, `request ${index + 1} was rate limited by the router`);
      await response.arrayBuffer();
    }
  } finally {
    server.close();
  }
});

test("server.js mounts the auth limiter once with the isConfigured exemption", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const auth = fs.readFileSync(path.join(__dirname, "..", "routes", "auth.js"), "utf8");
  assert.match(server, /app\.use\(`\/auth`, authRateLimitUnlessPublicStatus, authRouter/);
  assert.match(server, /req\.method === "GET" && req\.path === "\/isConfigured"/);
  assert.doesNotMatch(auth, /router\.use\(authRateLimit\)/);
});
