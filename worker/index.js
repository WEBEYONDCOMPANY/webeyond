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
    business: clean(data.business, 100),
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
  if (!env.RESEND_API_KEY || !env.LEAD_FROM_EMAIL || !env.LEAD_TO_EMAIL) {
    console.error(JSON.stringify({ event: "enquiry_email_unconfigured" }));
    return json({ error: "Email is not configured" }, 503);
  }
  const lines = [
    "New Web & Beyond enquiry",
    "",
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Business: ${lead.business || "Not provided"}`,
    `Email: ${lead.email || "Not provided"}`,
    "",
    "What they have in mind:",
    lead.message || "Not provided",
  ];
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.LEAD_FROM_EMAIL,
        to: [env.LEAD_TO_EMAIL],
        subject: `New enquiry from ${lead.name.replace(/[\r\n]/g, " ")}`,
        text: lines.join("\n"),
        ...(lead.email ? { reply_to: lead.email } : {}),
      }),
    });
    if (!sent.ok) {
      console.error(
        JSON.stringify({ event: "enquiry_email_failed", status: sent.status }),
      );
      return json({ error: "Could not send enquiry" }, 502);
    }
    return json({ ok: true });
  } catch (error) {
    console.error(
      JSON.stringify({ event: "enquiry_email_error", message: String(error) }),
    );
    return json({ error: "Could not send enquiry" }, 502);
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
