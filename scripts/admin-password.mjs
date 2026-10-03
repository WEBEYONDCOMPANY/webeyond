import { emitKeypressEvents } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../worker/password.js";

function promptSecret(label) {
  if (!process.stdin.isTTY) throw new Error("Run this tool in an interactive terminal. Do not put a password in command arguments.");
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.removeListener("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        finish(); reject(new Error("Cancelled."));
      } else if (key.name === "return" || key.name === "enter") {
        finish(); resolve(value);
      } else if (key.name === "backspace") {
        value = Array.from(value).slice(0, -1).join("");
      } else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) {
        value += text;
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

try {
  if (process.argv.slice(2).some((arg) => arg !== "--local")) throw new Error("Usage: node scripts/admin-password.mjs [--local]");
  const password = await promptSecret("Choose admin password (hidden, at least 16 characters): ");
  const confirmation = await promptSecret("Confirm password (hidden): ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const hash = await hashPassword(password);
  if (process.argv.includes("--local")) {
    const path = fileURLToPath(new URL("../.dev.vars", import.meta.url));
    let existing = "";
    try { existing = await readFile(path, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const lines = existing.split(/\r?\n/).filter((line) => !/^\s*ADMIN_PASSWORD_HASH\s*=/.test(line));
    await writeFile(path, `${lines.join("\n").trimEnd()}\nADMIN_PASSWORD_HASH="${hash}"\n`, { mode: 0o600 });
    console.log("Local password hash saved to ignored .dev.vars. Restart the local Worker.");
  } else {
    console.log("Set this entire value as the encrypted Worker secret ADMIN_PASSWORD_HASH. Keep it out of chat and Git:\n");
    console.log(hash);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
