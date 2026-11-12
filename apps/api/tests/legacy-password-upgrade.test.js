// Fork: passwords stored before the scrypt switch (CryptoJS.SHA3 = Keccak-512 hex)
// must keep working once, then be re-stored with scrypt.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// CryptoJS.SHA3("silo").toString() from crypto-js 4.x (Keccak-512, not FIPS SHA3-512).
const LEGACY_SILO = "95f0556aee3dedc8159d69c121a6b665dd5a68114fb70d4aaf05848a315a4e5fb27595c020a89496b98c9787e0950f18af72585216f91c7414760238596ff6f6";

const { verifyLegacyPassword, isLegacyPasswordHash, verifyPassword, hashPassword } = require("../utils/security");

test("legacy verifier matches CryptoJS.SHA3 (Keccak-512) hashes only", () => {
  assert.notEqual(LEGACY_SILO, require("node:crypto").createHash("sha3-512").update("silo").digest("hex"));
  assert.equal(isLegacyPasswordHash(LEGACY_SILO), true);
  assert.equal(verifyLegacyPassword("silo", LEGACY_SILO), true);
  assert.equal(verifyLegacyPassword("silo", LEGACY_SILO.toUpperCase()), true);
  assert.equal(verifyLegacyPassword("wrong", LEGACY_SILO), false);
  assert.equal(verifyLegacyPassword("", LEGACY_SILO), false);
  assert.equal(verifyLegacyPassword("silo", hashPassword("silo")), false);
  // Upstream verification still refuses legacy hashes on its own.
  assert.equal(verifyPassword("silo", LEGACY_SILO), false);
});

// --- Route-level: real /auth/login with an in-memory app_config row. ---
const row = {
  ID: 1,
  APP_USER: "local-auth",
  APP_PASSWORD: null,
  REQUIRE_LOGIN: true,
  settings: {
    auth: { mode: "local" },
    localUsers: [
      { id: "u1", username: "Kasper56", password: LEGACY_SILO, role: "Admin" },
      { id: "u2", username: "disabled", password: LEGACY_SILO, role: "Disabled" },
    ],
  },
};
const writes = [];
const dbPath = require.resolve(path.join(__dirname, "..", "db"));
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query: async (sql, params = []) => {
      if (/^SELECT \* FROM app_config/i.test(sql)) return { rows: [structuredClone(row)] };
      if (/^UPDATE app_config SET settings=\$1/i.test(sql)) {
        writes.push(sql);
        row.settings = params[0];
        return { rows: [] };
      }
      if (/^UPDATE app_config SET "APP_PASSWORD"=\$1/i.test(sql)) {
        writes.push(sql);
        row.APP_PASSWORD = params[0];
        return { rows: [] };
      }
      return { rows: [] };
    },
  },
};

const originalLog = console.log;
console.log = () => {};
const express = require("express");
const authRouter = require("../routes/auth");
console.log = originalLog;

async function login(username, password) {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.status;
  } finally {
    server.close();
  }
}

test("a legacy local-user hash logs in once and is re-stored with scrypt", async () => {
  console.log = () => {};
  try {
    assert.equal(await login("Kasper56", "wrong"), 401);
    assert.equal(writes.length, 0);

    assert.equal(await login("Kasper56", "silo"), 200);
    const upgraded = row.settings.localUsers.find((user) => user.username === "Kasper56");
    assert.match(upgraded.password, /^scrypt\$/);
    assert.equal(verifyPassword("silo", upgraded.password), true);
    assert.equal(writes.length, 1);

    // Second login goes through the normal scrypt path with no further writes.
    assert.equal(await login("Kasper56", "silo"), 200);
    assert.equal(writes.length, 1);

    // Disabled accounts are never upgraded or logged in.
    assert.equal(await login("disabled", "silo"), 401);
    assert.equal(row.settings.localUsers.find((user) => user.username === "disabled").password, LEGACY_SILO);
  } finally {
    console.log = originalLog;
  }
});

test("a legacy primary-account hash is upgraded in APP_PASSWORD", async () => {
  console.log = () => {};
  try {
    row.APP_PASSWORD = LEGACY_SILO;
    assert.equal(await login("local-auth", "silo"), 200);
    assert.match(row.APP_PASSWORD, /^scrypt\$/);
  } finally {
    console.log = originalLog;
  }
});
