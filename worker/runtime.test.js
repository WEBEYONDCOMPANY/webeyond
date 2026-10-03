import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./password.js";
import { hashSessionToken } from "./auth.js";

// Use the runtime supplied with Wrangler; no separate application dependency.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, "public");

test("Cloudflare runtime completes password login, D1 access, throttling and session revocation", { timeout: 60000 }, async () => {
  const password = crypto.randomUUID() + crypto.randomUUID();
  const runtime = new Miniflare(convertV4MiniflareOptions({
    host: "127.0.0.1", port: 0,
    workers: [{ name: "webeyond-auth-test", modules: true, scriptPath: resolve(root, ".wrangler/auth-review/index.js"),
    compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
    bindings: { ADMIN_PASSWORD_HASH: await hashPassword(password) },
    d1Databases: { DB: "isolated-admin-auth-test" },
    assets: { directory: publicRoot, binding: "ASSETS", run_worker_first: ["/api/*", "/admin", "/admin/*", "/work", "/demos/veyil/*"], routerConfig: { has_user_worker: true } }, }],
  }));
  try {
    const db = await runtime.getD1Database("DB", "webeyond-auth-test");
    for (const name of ["0001_create_enquiries.sql", "0002_admin_auth.sql", "0003_client_login_throttle.sql"]) {
      const sql = await readFile(resolve(root, "migrations", name), "utf8");
      // D1 exec treats each line as a statement; use complete migration statements.
      for (const statement of sql.replace(/--[^\n]*/g, "").split(";").map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const origin = "https://webeyond.example";
    const post = (path, body, cookie, ip = "198.51.100.10") => runtime.dispatchFetch(origin + path, {
      method: "POST", redirect: "manual",
      headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const get = (path, cookie) => runtime.dispatchFetch(origin + path, {
      redirect: "manual", headers: cookie ? { cookie } : {},
    });
    assert.equal((await get("/admin/enquiries")).status, 302);
    assert.equal((await get("/admin/enquiries/enquiries.js")).status, 302);
    assert.equal((await get("/api/admin/enquiries")).status, 401);
    assert.equal((await get("/admin/login")).status, 200);
    assert.equal((await get("/")).status, 200);
    assert.equal((await post("/api/enquiry", { name: "Runtime synthetic test", phone: "1234567890", message: "Synthetic message" })).status, 200);
    assert.equal((await post("/api/admin/login", { email: "webeyondcompany@gmail.com", password: "incorrect" })).status, 401);
    const login = await post("/api/admin/login", { email: "webeyondcompany@gmail.com", password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const row = await db.prepare("SELECT * FROM admin_sessions").first();
    assert.equal(row.token_hash, await hashSessionToken(cookie.split("=")[1]));
    assert.equal((await get("/admin/enquiries", cookie)).status, 200);
    const response = await get("/api/admin/enquiries", cookie);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).enquiries[0].name, "Runtime synthetic test");
    assert.equal((await post("/api/admin/logout", {}, cookie)).status, 200);
    assert.equal((await get("/api/admin/enquiries", cookie)).status, 401);
    for (let i = 0; i < 3; i++) assert.equal((await post("/api/admin/login", { email: "webeyondcompany@gmail.com", password: "incorrect" })).status, 401);
    assert.equal((await post("/api/admin/login", { email: "webeyondcompany@gmail.com", password })).status, 429);
    assert.equal((await post("/api/admin/login", { email: "webeyondcompany@gmail.com", password }, undefined, "198.51.100.11")).status, 200);
    const clients = (await db.prepare("SELECT * FROM admin_login_throttle").all()).results;
    assert.equal(clients.length, 2);
    assert.ok(!JSON.stringify(clients).includes("198.51.100"));
    await db.prepare("UPDATE admin_login_throttle SET expires_at = ? WHERE client_hash = ?").bind(Math.floor(Date.now() / 1000) - 1, clients[0].client_hash).run();
    await (await runtime.getWorker("webeyond-auth-test")).scheduled();
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM admin_login_throttle").first()).n, 1);
    if (process.env.WEBEYOND_PLAYWRIGHT_MODULE) {
      const { chromium } = require(process.env.WEBEYOND_PLAYWRIGHT_MODULE);
      await db.prepare("DELETE FROM admin_login_throttle").run();
      const longMessage = "A synthetic long message. ".repeat(30);
      await db.prepare("INSERT INTO enquiries (name, phone, message) VALUES (?, ?, ?)")
        .bind("A synthetic customer", "9876543210", longMessage).run();
      const browser = await chromium.launch({ executablePath: process.env.WEBEYOND_BROWSER_PATH, headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const base = String(await runtime.ready).replace(/\/$/, "");
        await page.goto(base + "/admin/enquiries");
        await page.waitForURL("**/admin/login");
        await page.locator("#email").fill("webeyondcompany@gmail.com");
        await page.locator("#password").fill("incorrect");
        await page.getByRole("button", { name: "Log in", exact: true }).click();
        await page.getByText("Invalid email or password.", { exact: true }).waitFor();
        await page.screenshot({ path: resolve(root, ".wrangler/auth-review/login-mobile.png"), fullPage: true });
        await page.locator("#password").fill(password);
        await page.getByRole("button", { name: "Log in", exact: true }).click();
        await page.waitForURL("**/admin/enquiries");
        await page.getByText("2 enquiries", { exact: true }).waitFor();
        const cookies = await page.context().cookies();
        const adminCookie = cookies.find((value) => value.name === "__Host-webeyond_admin");
        assert.ok(adminCookie?.httpOnly && adminCookie.secure && adminCookie.sameSite === "Strict");
        assert.equal(await page.evaluate(() => document.cookie), "");
        await page.getByRole("button", { name: "Name", exact: true }).click();
        assert.equal(await page.locator("#enquiries-body tr:first-child td:nth-child(2)").textContent(), "A synthetic customer");
        await page.getByRole("button", { name: "Name", exact: true }).click();
        assert.equal(await page.locator("#enquiries-body tr:first-child td:nth-child(2)").textContent(), "Runtime synthetic test");
        await page.getByRole("button", { name: "Show full message from A synthetic customer", exact: true }).click();
        assert.equal(await page.locator(".message-detail p").textContent(), longMessage);
        assert.ok(await page.locator(".table-wrap").evaluate((element) => element.scrollWidth > element.clientWidth));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: resolve(root, ".wrangler/auth-review/enquiries-mobile.png"), fullPage: true });
        await page.getByRole("button", { name: "Log out", exact: true }).click();
        await page.waitForURL("**/admin/login");
        assert.equal((await page.request.get(base + "/api/admin/enquiries")).status(), 401);
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await runtime.dispose();
  }
});
