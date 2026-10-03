# Web & Beyond

The official Web & Beyond website is a small static site with one Cloudflare Worker for enquiries. It is also the build orchestrator for three independent demo repositories.

## Preview

Run `pnpm install` and `pnpm dev`, then open the local address Wrangler prints. The page itself can also be previewed with any static file server, but the enquiry endpoint requires Wrangler.

## Production build and demo repositories

Production CI/CD is prepared in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
It builds and deploys on pushes to `main` using GitHub Actions. See
[WORK-PREVIEWS.md](WORK-PREVIEWS.md) for required secrets and the reviewed cutover
from Cloudflare Workers Builds. Local builds require a preinstalled Playwright
Chromium browser or `PREVIEW_BROWSER_EXECUTABLE`.

Desktop portfolio previews are now generated automatically from the same freshly
assembled demos during `pnpm build`. See [WORK-PREVIEWS.md](WORK-PREVIEWS.md) for
capture settings, browser installation, output paths and failure behavior.

Run `pnpm build` from this repository. The build reads `demos.config.json`, clones each demo's `main` branch into ignored `.demo-build/`, installs from that demo's lockfile, builds it where needed, and assembles one `public/` artifact. Wrangler deploys that artifact and the root Worker as one Cloudflare deployment. Demo source never belongs in this repository.

| Repository | Route | Build |
| --- | --- | --- |
| `web-and-beyond/demo-veyil` | `/demos/veyil/` | Publish its static files |
| `web-and-beyond/demo-raman-portfolio` | `/demos/raman/` | `npm ci`, `npm run build` (Astro) |
| `web-and-beyond/demo-meera-law` | `/demos/meera/` | `pnpm install --frozen-lockfile`, `pnpm run build` (Next static export) |

The main site remains at `/` and `/work`. The final demo files are generated under `public/demos/` and ignored by Git. To add another demo, add its repository, branch, route, build type, and output directory or publish list to `demos.config.json`. Configure that demo's own base path in its repository. For private demo repositories, provide a build-time `GITHUB_TOKEN` with read access to those repositories. The token is passed through a temporary askpass script and is never put in clone URLs or output files.

## Work listing

The homepage links to `/work`. The work page is generated as static HTML, so its project names, descriptions, and demo links are available without JavaScript. To add a project, add one object to `data/projects.mjs` and run `pnpm build:work` for a quick local update, or `pnpm build` for the complete production artifact.

## Enquiry storage

The existing form submits to `/api/enquiry`. The Worker validates the request and writes the five form fields to the `enquiries` D1 table. Blank optional fields become `NULL`; D1 supplies `id` and `created_at`. The schema is in `migrations/0001_create_enquiries.sql`.

Bind the production `webeyond-enquiries` database as `DB` in `wrangler.jsonc`, then apply the migration with `wrangler d1 migrations apply webeyond-enquiries --remote` before deploying the Worker. Local Wrangler development uses a local D1 database by default. The form reports an error if the binding or write is unavailable.

See `DEMO-INTEGRATION.md` for the local build workflow and route checks.
