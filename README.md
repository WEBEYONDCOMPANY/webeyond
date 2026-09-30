# Web & Beyond

The official Web & Beyond website is a small static site with one Cloudflare Worker for enquiries. It is also the build orchestrator for three independent demo repositories.

## Preview

Run `pnpm install` and `pnpm dev`, then open the local address Wrangler prints. The page itself can also be previewed with any static file server, but the enquiry endpoint requires Wrangler.

## Production build and demo repositories

Run `pnpm build` from this repository. The build reads `demos.config.json`, clones each demo's `main` branch into ignored `.demo-build/`, installs from that demo's lockfile, builds it where needed, and assembles one `public/` artifact. Wrangler deploys that artifact and the root Worker as one Cloudflare deployment. Demo source never belongs in this repository.

| Repository | Route | Build |
| --- | --- | --- |
| `web-and-beyond/demo-veyil` | `/demos/veyil/` | Publish its static files |
| `web-and-beyond/demo-raman-portfolio` | `/demos/raman/` | `npm ci`, `npm run build` (Astro) |
| `web-and-beyond/demo-meera-law` | `/demos/meera/` | `pnpm install --frozen-lockfile`, `pnpm run build` (Next static export) |

The main site remains at `/` and `/work`. The final demo files are generated under `public/demos/` and ignored by Git. To add another demo, add its repository, branch, route, build type, and output directory or publish list to `demos.config.json`. Configure that demo's own base path in its repository. Build access to private repositories must be configured in the build environment before running `pnpm build`.

## Work listing

The homepage links to `/work`. The work page is generated as static HTML, so its project names, descriptions, and demo links are available without JavaScript. To add a project, add one object to `data/projects.mjs` and run `pnpm build:work` for a quick local update, or `pnpm build` for the complete production artifact.

## Enquiry email

The form submits to `/api/enquiry`. The Worker validates fields and sends a text email through Resend. Set these secrets before production use:

- `RESEND_API_KEY`: a Resend API key with sending access.
- `LEAD_FROM_EMAIL`: a sender on a verified domain, for example `Web & Beyond <hello@example.com>`.
- `LEAD_TO_EMAIL`: the inbox that should receive leads; currently intended to be `webeyondcompany@gmail.com`.

For local development, copy `.dev.vars.example` to `.dev.vars` and enter real values. Never commit that file. The form reports a failure until the email settings are configured; it does not pretend to send an enquiry.

See `DEMO-INTEGRATION.md` for the local build workflow and route checks.
