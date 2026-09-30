import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const endpoint = "https://web-and-beyond.example/api/enquiry";
const validLead = {
  name: "Test Person",
  phone: "+91 9876543210",
  business: "Example Shop",
  email: "test@example.com",
  message: "I need a small website.",
  website: "",
};

function request(body) {
  return new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://web-and-beyond.example" },
    body: JSON.stringify(body),
  });
}

test("valid enquiry sends the supplied details to the configured inbox", async () => {
  const originalFetch = globalThis.fetch;
  let emailRequest;
  globalThis.fetch = async (url, options) => {
    emailRequest = { url, options };
    return new Response(JSON.stringify({ id: "test-id" }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request(validLead), {
      RESEND_API_KEY: "test-key",
      LEAD_FROM_EMAIL: "Web & Beyond <hello@example.com>",
      LEAD_TO_EMAIL: "webeyondcompany@gmail.com",
    });
    assert.equal(response.status, 200);
    assert.equal(emailRequest.url, "https://api.resend.com/emails");
    const payload = JSON.parse(emailRequest.options.body);
    assert.deepEqual(payload.to, ["webeyondcompany@gmail.com"]);
    assert.equal(payload.reply_to, "test@example.com");
    assert.match(payload.text, /Example Shop/);
    assert.match(payload.text, /9876543210/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enquiry does not claim success while email is unconfigured", async () => {
  const response = await worker.fetch(request(validLead), {});
  assert.equal(response.status, 503);
});

test("/work resolves the static work page without changing the visible route", async () => {
  let assetUrl;
  const response = await worker.fetch(new Request("https://web-and-beyond.example/work"), {
    ASSETS: {
      fetch(request) {
        assetUrl = request.url;
        return new Response("work page");
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(assetUrl, "https://web-and-beyond.example/work/");
});
