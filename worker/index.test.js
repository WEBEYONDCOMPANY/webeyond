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

function database() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              calls.push({ sql, values });
            },
          };
        },
      };
    },
  };
}

test("valid enquiry inserts only the five allowed fields", async () => {
  const DB = database();
  const response = await worker.fetch(request(validLead), { DB });
  assert.equal(response.status, 200);
  assert.deepEqual(DB.calls, [{
    sql: "INSERT INTO enquiries (name, phone, business_name, email, message) VALUES (?, ?, ?, ?, ?)",
    values: ["Test Person", "+91 9876543210", "Example Shop", "test@example.com", "I need a small website."],
  }]);
});

test("blank optional fields are stored as NULL", async () => {
  const DB = database();
  const response = await worker.fetch(request({
    ...validLead, business: "  ", email: "", message: "  ",
  }), { DB });
  assert.equal(response.status, 200);
  assert.deepEqual(DB.calls[0].values.slice(2), [null, null, null]);
});

test("missing required details do not reach the database", async () => {
  const DB = database();
  const response = await worker.fetch(request({ ...validLead, phone: "" }), { DB });
  assert.equal(response.status, 400);
  assert.equal(DB.calls.length, 0);
});

test("enquiry does not claim success without D1", async () => {
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
