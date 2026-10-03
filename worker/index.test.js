import test, { before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "./index.js";
import { hashPassword } from "./password.js";
import { hashSessionToken } from "./auth.js";

const origin = "https://webeyond.example";
const email = "webeyondcompany@gmail.com";
const password = crypto.randomUUID() + crypto.randomUUID();
let passwordHash;
const schema = await Promise.all(["0001_create_enquiries.sql", "0002_admin_auth.sql", "0003_client_login_throttle.sql"].map((name) => readFile(new URL("../migrations/" + name, import.meta.url), "utf8")));
before(async () => { passwordHash = await hashPassword(password); });

function setup(t) {
  const sqlite = new DatabaseSync(":memory:");
  schema.forEach((sql) => sqlite.exec(sql));
  t.after(() => sqlite.close());
  const calls = [];
  const DB = {
    withSession(constraint) { assert.equal(constraint, "first-primary"); return this; },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (values = []) => ({
        bind(...args) { return bound(args); },
        async run() { calls.push({ sql, values }); return statement.run(...values); },
        async first() { calls.push({ sql, values }); return statement.get(...values) ?? null; },
        async all() { calls.push({ sql, values }); return { results: statement.all(...values) }; },
      });
      return bound();
    },
  };
  return { sqlite, calls, env: {
    DB, ADMIN_PASSWORD_HASH: passwordHash,
    ASSETS: { fetch: async (request) => new Response("Asset: " + new URL(request.url).pathname) },
  } };
}

function request(path, { method = "GET", body, cookie, headers = {} } = {}) {
  return new Request(origin + path, { method,
    headers: { "cf-connecting-ip": "198.51.100.10", ...(method === "POST" ? { origin, "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function logIn(env, body = { email, password }) {
  return worker.fetch(request("/api/admin/login", { method: "POST", body }), env);
}

function sessionCookie(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("unauthenticated admin pages and direct assets redirect to login", async (t) => {
  const { env, calls } = setup(t);
  for (const path of ["/admin", "/admin/", "/admin/enquiries", "/admin/enquiries/index.html", "/admin/enquiries/enquiries.js", "/admin/enquiries/admin.css", "/admin/future"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/admin/login");
  }
  assert.equal(calls.length, 0);
});

test("unauthenticated APIs return JSON and never read enquiries", async (t) => {
  const { env, calls } = setup(t);
  for (const path of ["/api/admin", "/api/admin/enquiries", "/api/admin/logout", "/api/admin/future"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls.length, 0);
});

test("login page and its assets remain accessible without credentials or configuration", async () => {
  const env = { ASSETS: { fetch: async () => new Response("login") } };
  for (const path of ["/admin/login", "/admin/login/", "/admin/login/index.html", "/admin/login/login.css", "/admin/login/login.js"]) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("wrong email and password fail with the same generic error", async (t) => {
  const { env, sqlite } = setup(t);
  for (const body of [{ email, password: "incorrect-password" }, { email: "wrong@example.com", password }]) {
    const response = await logIn(env, body);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Invalid email or password." });
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_sessions").get().n, 0);
});

test("correct login stores only a token hash and sets a finite secure cookie", async (t) => {
  const { env, sqlite } = setup(t);
  const response = await logIn(env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const cookie = response.headers.get("set-cookie");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=28800", "Expires="]) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes("Domain="));
  const token = cookie.split(";")[0].split("=")[1];
  assert.match(token, /^[a-f0-9]{64}$/);
  const row = sqlite.prepare("SELECT * FROM admin_sessions").get();
  assert.equal(row.token_hash, await hashSessionToken(token));
  assert.notEqual(row.token_hash, token);
  assert.ok(Date.parse(row.expires_at) > Date.now());
  assert.ok(!JSON.stringify(row).includes(password));
});

test("valid session allows pages, redirect and seven-column D1 read in newest order", async (t) => {
  const { env, sqlite } = setup(t);
  sqlite.prepare("INSERT INTO enquiries (name, phone, created_at) VALUES (?, ?, ?)").run("Older", "1234567890", "2026-01-01 00:00:00");
  sqlite.prepare("INSERT INTO enquiries (name, phone, message, created_at) VALUES (?, ?, ?, ?)").run("Newer", "9876543210", "Synthetic enquiry", "2026-10-03 00:00:00");
  const cookie = sessionCookie(await logIn(env));
  const redirect = await worker.fetch(request("/admin", { cookie }), env);
  assert.equal(redirect.status, 302);
  assert.equal(new URL(redirect.headers.get("location"), origin).pathname, "/admin/enquiries");
  const page = await worker.fetch(request("/admin/enquiries", { cookie }), env);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "Asset: /admin/enquiries/");
  assert.equal(page.headers.get("cache-control"), "private, no-store");
  const response = await worker.fetch(request("/api/admin/enquiries", { cookie }), env);
  assert.equal(response.status, 200);
  const { enquiries } = await response.json();
  assert.deepEqual(enquiries.map((row) => row.name), ["Newer", "Older"]);
  assert.deepEqual(Object.keys(enquiries[0]), ["id", "name", "phone", "business_name", "email", "message", "created_at"]);
  assert.equal(enquiries[0].email, null);
});

test("expired, unknown, malformed and duplicate session cookies are rejected", async (t) => {
  const { env, sqlite, calls } = setup(t);
  const cookie = sessionCookie(await logIn(env));
  sqlite.prepare("UPDATE admin_sessions SET expires_at = ?").run("2000-01-01T00:00:00.000Z");
  calls.length = 0;
  for (const value of [cookie, "__Host-webeyond_admin=" + "a".repeat(64), "__Host-webeyond_admin=invalid", cookie + "; " + cookie]) {
    const response = await worker.fetch(request("/api/admin/enquiries", { cookie: value }), env);
    assert.equal(response.status, 401);
  }
  assert.ok(!calls.some((call) => call.sql.includes("FROM enquiries")));
});

test("logout deletes the session, clears its cookie, and prevents replay", async (t) => {
  const { env, sqlite } = setup(t);
  const cookie = sessionCookie(await logIn(env));
  const response = await worker.fetch(request("/api/admin/logout", { method: "POST", cookie, body: {} }), env);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("set-cookie").includes("Max-Age=0"));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_sessions").get().n, 0);
  assert.equal((await worker.fetch(request("/api/admin/enquiries", { cookie }), env)).status, 401);
});

test("per-client login budget blocks after five while another client can log in", async (t) => {
  const { env, sqlite } = setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await logIn(env, { email, password: "wrong" })).status, 401);
  const response = await logIn(env);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  const other = await worker.fetch(request("/api/admin/login", { method: "POST", body: { email, password }, headers: { "cf-connecting-ip": "198.51.100.11" } }), env);
  assert.equal(other.status, 200);
  assert.equal((await logIn(env)).status, 429);
  const rows = sqlite.prepare("SELECT * FROM admin_login_throttle").all();
  assert.equal(rows.length, 2);
  for (const row of rows) assert.match(row.client_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(rows).includes("198.51.100"));
  sqlite.prepare("UPDATE admin_login_throttle SET expires_at = ?").run(Math.floor(Date.now() / 1000) - 1);
  assert.equal((await logIn(env)).status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_login_throttle").get().n, 1);
});

test("scheduled cleanup removes expired identifiers without touching sessions or enquiries", async (t) => {
  const { env, sqlite } = setup(t);
  await logIn(env);
  const expiry = Math.floor(Date.now() / 1000) - 1;
  sqlite.prepare("INSERT INTO admin_login_throttle VALUES (?, ?, ?)").run("a".repeat(64), expiry, 5);
  await worker.scheduled({}, env);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_login_throttle").get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_sessions").get().n, 1);
});

test("missing or invalid Cloudflare IP fails closed without trusting forwarded headers", async (t) => {
  const { env, sqlite } = setup(t);
  for (const value of ["", "invalid", "198.51.100.1, 198.51.100.2"]) {
    const response = await worker.fetch(request("/api/admin/login", { method: "POST", body: { email, password }, headers: { "cf-connecting-ip": value, "x-forwarded-for": "198.51.100.10" } }), env);
    assert.equal(response.status, 503);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_login_throttle").get().n, 0);
});

test("equivalent IPv6 spellings share a client budget", async (t) => {
  const { env, sqlite } = setup(t);
  for (const ip of ["2001:db8::1", "2001:0db8:0000:0000:0000:0000:0000:0001"]) {
    const response = await worker.fetch(request("/api/admin/login", { method: "POST", body: { email, password: "wrong" }, headers: { "cf-connecting-ip": ip } }), env);
    assert.equal(response.status, 401);
  }
  const rows = sqlite.prepare("SELECT * FROM admin_login_throttle").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attempts, 2);
});

test("cross-origin and missing-origin mutations are rejected", async (t) => {
  const { env, calls } = setup(t);
  for (const value of ["https://attacker.example", ""]) {
    const response = await worker.fetch(request("/api/admin/login", { method: "POST", body: { email, password }, headers: { origin: value } }), env);
    assert.equal(response.status, 403);
  }
  assert.equal(calls.length, 0);
  const cookie = sessionCookie(await logIn(env));
  const response = await worker.fetch(request("/api/admin/logout", { method: "POST", cookie, body: {}, headers: { origin: "https://attacker.example" } }), env);
  assert.equal(response.status, 403);
  assert.equal((await worker.fetch(request("/api/admin/enquiries", { cookie }), env)).status, 200);
});

test("login enforces POST, JSON, bounded bodies and required fields", async (t) => {
  const { env } = setup(t);
  assert.equal((await worker.fetch(request("/api/admin/login"), env)).status, 405);
  assert.equal((await worker.fetch(request("/api/admin/login", { method: "POST", body: {}, headers: { "content-type": "text/plain" } }), env)).status, 415);
  assert.equal((await logIn(env, { email, password: "x".repeat(5000) })).status, 400);
  assert.equal((await logIn(env, {})).status, 401);
  assert.equal((await logIn(env, { email, password: 42 })).status, 401);
});

test("missing hash or storage fails closed", async (t) => {
  const { env } = setup(t);
  assert.equal((await logIn({ ...env, ADMIN_PASSWORD_HASH: "" })).status, 503);
  assert.equal((await logIn({ ...env, ADMIN_PASSWORD_HASH: "plaintext-is-not-a-hash" })).status, 503);
  assert.equal((await logIn({ ...env, DB: undefined })).status, 503);
  const cookie = sessionCookie(await logIn(env));
  assert.equal((await worker.fetch(request("/api/admin/enquiries", { cookie }), { ...env, DB: undefined })).status, 503);
});

test("admin APIs stay read-only except login/logout", async (t) => {
  const { env } = setup(t);
  const cookie = sessionCookie(await logIn(env));
  assert.equal((await worker.fetch(request("/api/admin/enquiries", { cookie, method: "POST", body: {} }), env)).status, 405);
  assert.equal((await worker.fetch(request("/api/admin/future", { cookie }), env)).status, 404);
});

test("public homepage and work page remain public", async (t) => {
  const { env } = setup(t);
  assert.equal((await worker.fetch(request("/"), env)).status, 200);
  const work = await worker.fetch(request("/work"), env);
  assert.equal(work.status, 200);
  assert.equal(await work.text(), "Asset: /work/");
});

test("public enquiry submissions store just five fields with optional NULL values", async (t) => {
  const { env, sqlite, calls } = setup(t);
  const response = await worker.fetch(request("/api/enquiry", { method: "POST", body: { name: "Synthetic public test", phone: "+91 9876543210", business: " ", email: "", message: "" } }), env);
  assert.equal(response.status, 200);
  const row = sqlite.prepare("SELECT * FROM enquiries").get();
  assert.equal(row.name, "Synthetic public test");
  assert.equal(row.business_name, null);
  assert.equal(row.email, null);
  assert.equal(row.message, null);
  assert.equal(calls[0].sql, "INSERT INTO enquiries (name, phone, business_name, email, message) VALUES (?, ?, ?, ?, ?)");
});

test("invalid public enquiry never reaches D1 and missing DB never reports success", async (t) => {
  const { env, calls } = setup(t);
  const response = await worker.fetch(request("/api/enquiry", { method: "POST", body: { name: "Test", phone: "" } }), env);
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await worker.fetch(request("/api/enquiry", { method: "POST", body: { name: "Test", phone: "1234567890" } }), { ...env, DB: undefined })).status, 503);
});
