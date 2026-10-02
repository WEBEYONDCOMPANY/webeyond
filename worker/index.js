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

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
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
