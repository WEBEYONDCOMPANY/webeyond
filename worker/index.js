import { isAuthenticated, handleLogin, handleLogout, cleanupLoginThrottle } from "./auth.js";

const MAX_BODY_BYTES = 4096;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function readSmallJson(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const lead = {
    name: clean(data.name, 80),
    phone: clean(data.phone, 25),
    business_name: clean(data.business, 100),
    email: clean(data.email, 160),
    message: clean(data.message, 1200),
    website: clean(data.website, 120),
  };
  const digits = lead.phone.replace(/\D/g, "");
  if (lead.name.length < 2 || digits.length < 7 || digits.length > 15)
    return null;
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return null;
  return lead;
}

async function handleEnquiry(request, env) {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Forbidden" }, 403);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return json({ error: "Expected JSON" }, 415);
  const body = await readSmallJson(request);
  if (!body) return json({ error: "Invalid request" }, 400);
  const lead = validate(body);
  if (!lead) return json({ error: "Please check your details" }, 400);
  if (lead.website) return json({ ok: true });
  if (!env.DB) return json({ error: "Enquiries are unavailable" }, 503);
  try {
    await env.DB.prepare(
      "INSERT INTO enquiries (name, phone, business_name, email, message) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        lead.name,
        lead.phone,
        lead.business_name || null,
        lead.email || null,
        lead.message || null,
      )
      .run();
    return json({ ok: true });
  } catch {
    console.error(JSON.stringify({ event: "enquiry_storage_failed" }));
    return json({ error: "Could not save enquiry" }, 503);
  }
}

async function handleAdminEnquiries(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DB) return json({ error: "Enquiries are unavailable" }, 503);
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, phone, business_name, email, message, created_at FROM enquiries ORDER BY created_at DESC, id DESC",
    ).all();
    return json({ enquiries: results });
  } catch {
    console.error(JSON.stringify({ event: "admin_enquiries_read_failed" }));
    return json({ error: "Could not load enquiries" }, 503);
  }
}

export default {
  async scheduled(_controller, env) {
    await cleanupLoginThrottle(env);
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const adminPath = path === "/admin" || path.startsWith("/admin/");
    const adminApiPath = path === "/api/admin" || path.startsWith("/api/admin/");
    if (adminPath || adminApiPath) {
      if (path === "/api/admin/login") return handleLogin(request, env, readSmallJson);
      const loginAsset = ["/admin/login", "/admin/login/", "/admin/login/index.html", "/admin/login/login.css", "/admin/login/login.js"].includes(path);
      let authenticated = false;
      try {
        if (!loginAsset) authenticated = await isAuthenticated(request, env);
      } catch {
        return json({ error: "Admin unavailable" }, 503);
      }
      if (!loginAsset && !authenticated) {
        if (adminApiPath) return json({ error: "Unauthorized" }, 401);
        return new Response(null, { status: 302, headers: {
          location: "/admin/login", "cache-control": "private, no-store",
        } });
      }
      if (path === "/api/admin/logout") return handleLogout(request, env);
      if (path === "/api/admin/enquiries") return handleAdminEnquiries(request, env);
      if (adminApiPath) return json({ error: "Not found" }, 404);
      if (path === "/admin" || path === "/admin/") {
        return new Response(null, { status: 302, headers: {
          location: new URL("/admin/enquiries", request.url).href,
          "cache-control": "private, no-store",
        } });
      }
      const assetRequest = ["/admin/enquiries", "/admin/login"].includes(path)
        ? new Request(new URL(`${path}/`, request.url), request)
        : request;
      const asset = await env.ASSETS.fetch(assetRequest);
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "private, no-store");
      headers.set("x-content-type-options", "nosniff");
      headers.set("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      headers.set("x-frame-options", "DENY");
      headers.set("referrer-policy", "no-referrer");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    if (path === "/api/enquiry") return handleEnquiry(request, env);
    if (path.startsWith("/api/")) return json({ error: "Not found" }, 404);
    if (path === "/work") {
      const index = new URL("/work/", request.url);
      return env.ASSETS.fetch(new Request(index, request));
    }
    if (path.startsWith("/demos/veyil/")) {
      const asset = await env.ASSETS.fetch(request);
      if (
        asset.status !== 404 ||
        !request.headers.get("accept")?.includes("text/html")
      )
        return asset;
      const index = new URL("/demos/veyil/", request.url);
      return env.ASSETS.fetch(new Request(index, request));
    }
    return env.ASSETS.fetch(request);
  },
};
