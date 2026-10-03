import { scrypt, timingSafeEqual } from "node:crypto";

// OWASP's scrypt option using 16 MiB, suitable for Workers' memory limit.
const PARAMETERS = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const FORMAT = /^scrypt\$16384\$8\$5\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const encoder = new TextEncoder();

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, PARAMETERS, (error, key) => error ? reject(error) : resolve(key));
  });
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(value) {
  return Uint8Array.from(value.match(/../g), (pair) => parseInt(pair, 16));
}

export function isPasswordHashConfigured(value) {
  return typeof value === "string" && FORMAT.test(value);
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 16 || encoder.encode(password).length > 1024) {
    throw new Error("Use a password of at least 16 characters and at most 1024 UTF-8 bytes.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt);
  return `scrypt$16384$8$5$${hex(salt)}$${hex(key)}`;
}

export async function verifyPassword(password, encoded) {
  const parts = typeof encoded === "string" && encoded.match(FORMAT);
  if (!parts) throw new Error("Admin password hash is not configured.");
  if (typeof password !== "string" || !password || encoder.encode(password).length > 1024) return false;
  const actual = await derive(password, unhex(parts[1]));
  return timingSafeEqual(actual, unhex(parts[2]));
}
