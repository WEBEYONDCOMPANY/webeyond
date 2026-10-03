import { isPasswordHashConfigured, verifyPassword } from "./password.js";
import { isIP } from "node:net";

const ADMIN_EMAIL = "webeyondcompany@gmail.com";
const COOKIE = "__Host-webeyond_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 10 * 60;
const LOGIN_LIMIT = 5;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: {
    "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers,
  } });
}

function database(env) {
  if (!env.DB) throw new Error("Admin storage unavailable");
  // A fresh primary read prevents a replica from accepting a revoked session.
  return env.DB.withSession("first-primary");
}

function tokenFrom(request) {
  const matches = (request.headers.get("cookie") || "").split(";")
    .map((part) => part.trim()).filter((part) => part.startsWith(`${COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isAuthenticated(request, env) {
  if (!isPasswordHashConfigured(env.ADMIN_PASSWORD_HASH)) return false;
  const token = tokenFrom(request);
  if (!token) return false;
  const row = await database(env).prepare(
    "SELECT expires_at FROM admin_sessions WHERE token_hash = ?",
  ).bind(await hashSessionToken(token)).first();
  const expiry = row && Date.parse(row.expires_at);
  return Number.isFinite(expiry) && expiry > Date.now();
}

function validateMutation(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return json({ error: "HTTPS required" }, 403);
  }
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Forbidden" }, 403);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Expected JSON" }, 415);
  }
  return null;
}

async function clientIdentifier(request, env, now) {
  // Only Cloudflare's edge-provided address; never X-Forwarded-For or browser input.
  const raw = request.headers.get("cf-connecting-ip");
  const version = typeof raw === "string" ? isIP(raw) : 0;
  if (!version) throw new Error("Cloudflare client identity unavailable");
  const ip = version === 6 ? new URL(`https://[${raw}]/`).hostname : raw;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.ADMIN_PASSWORD_HASH),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  // Daily rotation limits linkability. The existing secret prevents IP enumeration.
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(
    `webeyond-login-throttle:v1:${Math.floor(now / 86400)}:${ip}`,
  ));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cleanupLoginThrottle(env) {
  await database(env).prepare("DELETE FROM admin_login_throttle WHERE expires_at <= ?")
    .bind(Math.floor(Date.now() / 1000)).run();
}

async function reserveLoginAttempt(db, request, env) {
  const now = Math.floor(Date.now() / 1000);
  const clientHash = await clientIdentifier(request, env, now);
  await db.prepare("DELETE FROM admin_login_throttle WHERE expires_at <= ?").bind(now).run();
  // One atomic statement keeps each client's budget consistent across instances.
  const slot = await db.prepare(
    `INSERT INTO admin_login_throttle (client_hash, expires_at, attempts) VALUES (?, ?, 1)
     ON CONFLICT(client_hash) DO UPDATE SET
       attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
       expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
     WHERE attempts < ? OR expires_at <= ?
     RETURNING expires_at`,
  ).bind(clientHash, now + LOGIN_WINDOW_SECONDS, now, now, LOGIN_LIMIT, now).first();
  if (slot) return 0;
  const row = await db.prepare("SELECT expires_at FROM admin_login_throttle WHERE client_hash = ?").bind(clientHash).first();
  return Math.max(1, (row?.expires_at ?? now + LOGIN_WINDOW_SECONDS) - now);
}

export async function handleLogin(request, env, readSmallJson) {
  const invalid = validateMutation(request);
  if (invalid) return invalid;
  if (!isPasswordHashConfigured(env.ADMIN_PASSWORD_HASH)) return json({ error: "Admin login unavailable" }, 503);
  try {
    const body = await readSmallJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request" }, 400);
    const db = database(env);
    const retry = await reserveLoginAttempt(db, request, env);
    if (retry) return json({ error: "Too many login attempts. Please try again later." }, 429, { "retry-after": String(retry) });
    const email = typeof body.email === "string" && body.email.length <= 254 ? body.email.trim().toLowerCase() : "";
    // Verify the password even for the wrong email to keep failures indistinguishable.
    const passwordMatches = await verifyPassword(body.password, env.ADMIN_PASSWORD_HASH);
    if (!passwordMatches || email !== ADMIN_EMAIL) return json({ error: "Invalid email or password." }, 401);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_SECONDS * 1000);
    await db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
    await db.prepare("INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)")
      .bind(await hashSessionToken(token), expires.toISOString()).run();
    return json({ ok: true }, 200, {
      "set-cookie": `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}; Expires=${expires.toUTCString()}`,
    });
  } catch {
    return json({ error: "Admin login unavailable" }, 503);
  }
}

export async function handleLogout(request, env) {
  const invalid = validateMutation(request);
  if (invalid) return invalid;
  try {
    const token = tokenFrom(request);
    if (token) await database(env).prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
      .bind(await hashSessionToken(token)).run();
    return json({ ok: true }, 200, {
      "set-cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    });
  } catch {
    return json({ error: "Could not log out. Please try again." }, 503);
  }
}
