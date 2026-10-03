import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("legacy Cloudflare builds stop before fetching or generating previews", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./build.mjs", import.meta.url))], {
    env: { ...process.env, WORKERS_CI: "1" }, encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production builds run in GitHub Actions/);
  assert.doesNotMatch(result.stdout, /Fetching|Capturing|Starting preview server/);
});
