# WEBEYOND single-admin authentication

This document describes the single-admin deployment and maintenance procedure.
Cloudflare Access is not used. Never include passwords or password hashes in Git.

The only account is `webeyondcompany@gmail.com`, checked in `worker/auth.js`.
There are no signup, user-management, recovery, OAuth, or role features.

## Storage and secrets

Apply `migrations/0002_admin_auth.sql` and `0003_client_login_throttle.sql` to the existing `webeyond-enquiries` D1
database. It adds:

- `admin_sessions`: token_hash, expires_at, created_at, plus an expiry index.
- `admin_login_throttle`: temporary client_hash, expires_at and attempts.
  Migration 0003 replaces only the old shared throttle table; sessions and
  enquiries are untouched. It stores no raw IP addresses, emails or passwords.

The existing `enquiries` table and its migration are unchanged.

The only required Worker secret is **ADMIN_PASSWORD_HASH**. Use an encrypted
Worker secret, never a plaintext `vars` entry in Wrangler configuration. Its
format contains the scrypt parameters, random 16-byte salt, and 32-byte derived
key. Parameters are N=16384, r=8, p=5 (OWASP's 16 MiB scrypt option). Verification
uses the Workers-compatible native `node:crypto` implementation and a constant
time key comparison. Use a unique password/passphrase of at least 16 characters;
the helper refuses shorter passwords. Maximum size is 1024 UTF-8 bytes.

Generate the hash in your own interactive terminal:

```text
node scripts/admin-password.mjs
```

It prompts twice without echoing the password. Only the hash is printed. Keep
both password and hash out of chat, Git, and shell arguments/history. The hash
belongs in the encrypted Worker secret. No session-signing secret is needed.

## Local setup

```text
node scripts/admin-password.mjs --local
npx wrangler d1 migrations apply webeyond-enquiries --local
```

`--local` saves only the hash to the existing ignored `.dev.vars`, preserving
other entries. Restart the local Worker and open `/admin/login`. The Secure
cookie is retained during local testing; loopback HTTP was tested in Chromium.
Use local HTTPS if your browser does not accept Secure cookies on loopback.

## Production steps after review and authorization

1. Apply the migration to the production D1 database:
   `npx wrangler d1 migrations apply webeyond-enquiries --remote`.
2. Set the encrypted `ADMIN_PASSWORD_HASH` secret on Worker `webeyond`, through
   Cloudflare's Worker settings or `npx wrangler secret put ADMIN_PASSWORD_HASH`.
   Paste the generated hash at that command's prompt, never the raw password.
   Secret updates can create a new deployment/version: do not run this until
   the production change is reviewed and authorized.
3. Confirm HTTPS and enough Worker CPU time for the scrypt login check. The
   local runtime test verifies compatibility, not the production account's CPU
   allowance; Free-plan CPU limits may be insufficient for password hashing.
4. Deploy only after approval, then verify a real login, enquiry loading,
   unauthorized denial, logout, and the public form on the actual hostname.
   Confirm the configured ten-minute cleanup Cron Trigger is active.

No Zero Trust application, Access policy, custom domain change, or identity
provider is needed.

## Session and route behavior

- Successful login issues a new 256-bit random token only through a cookie.
  D1 stores its SHA-256 hash. The cookie is `__Host-webeyond_admin`, HttpOnly,
  Secure, SameSite=Strict, Path=/, host-only, with an eight-hour expiry.
- Server-side D1 expiry is checked on every protected request. Authentication
  reads use `withSession("first-primary")` so replica lag cannot preserve a
  revoked session. Logout deletes the row and clears the cookie.
- All `/admin`, `/admin/*`, `/api/admin`, and `/api/admin/*` requests go through
  the Worker. Browser pages/assets redirect to `/admin/login` without a valid
  session; protected APIs return 401 JSON. The login page and its two dedicated
  assets, and POST `/api/admin/login`, are the only public admin exceptions.
- POST `/api/admin/login` and POST `/api/admin/logout` require same-origin
  Origin and JSON requests. Cross-origin mutations are rejected. Production
  login requires HTTPS; no insecure production cookie or auth bypass exists.
- Password/email failures return `Invalid email or password.`. Missing secrets,
  migration failures, and D1 errors fail closed. Tokens/password hashes are not
  returned as JSON or logged. Admin responses use no-store; the pages also have
  a restrictive CSP and frame protection.
- GET `/api/admin/enquiries` returns the original columns plus Lead with
  `created_at DESC, id DESC`. The public website and POST `/api/enquiry` remain
  public. Table sorting, expandable messages and mobile scrolling are preserved.
  Authenticated creation and deletion are documented in `ENQUIRIES.md`.

## Throttling and limitations

An atomic D1 statement reserves at most five login attempts per client IP per
ten minutes, shared across Worker instances. Attempts include successes to limit
hashing cost as well as guessing. The next attempt returns 429 with Retry-After.
Only Cloudflare's CF-Connecting-IP header is used; missing or invalid values fail
closed. There is no fallback to browser-supplied forwarded headers.

The temporary identifier is HMAC-SHA-256, keyed with the existing password-hash
secret and rotated daily. D1 receives only the hash, never the raw IP. No new
secret is needed. Rotation can reset a budget at the UTC day boundary. Records
expire after ten minutes and are deleted on subsequent login requests and by a
ten-minute scheduled cleanup, including when there are no login requests.
Physical deletion depends on the cleanup schedule running successfully.

Different IPs have independent budgets. Visitors sharing a public IP still share
a budget. This is not a complete defense against distributed guessing or DDoS.

There is no password reset or MFA. Changing the password secret does not revoke
existing sessions automatically. For a manual password change, generate a new
hash and clear `admin_sessions` as part of the authorized maintenance operation.
Expired rows are removed at the next successful login. A stolen raw cookie
remains usable until expiry or revocation; protect your browser and device.

## Verification

Use Node 22.13+ (the bundled Node 24 runtime was used here):

```text
pnpm test
pnpm test:runtime
```

The first suite applies the actual migrations to in-memory SQLite. The second
performs a local dry-run build and exercises login, scrypt, D1, protected assets,
throttling, enquiries and logout in Wrangler's isolated Cloudflare runtime.
It does not access production D1 or deploy.

Optional browser verification uses `WEBEYOND_PLAYWRIGHT_MODULE` (a path to an
installed Playwright module) and `WEBEYOND_BROWSER_PATH` (a browser executable).
It checks the actual login page, wrong-login message, HttpOnly/Secure cookie,
table sorting and expansion, 390px horizontal table scrolling, and logout.
Synthetic random passwords and enquiry rows exist only in the isolated test.

References:
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- https://developers.cloudflare.com/d1/best-practices/read-replication/
