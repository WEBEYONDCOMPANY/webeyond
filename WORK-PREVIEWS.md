# Generated desktop portfolio previews

`pnpm build` fetches the latest `main` commits from the repositories in
`demos.config.json`, builds each in a disposable `.demo-build/` checkout, captures
the assembled demo pages, then publishes demos and previews into `public/`.
No developer demo folders are used. Even the optional `DEMO_SOURCE_ROOT` test
override copies inputs before building. Demo repositories are never written or pushed.

The single manifest defines repository, branch, deployed route, screenshot filename,
optional visible `readySelector`, and `teaser: true` for the two homepage slots.
Captures are 1440 × 900, top viewport only, optimized WebP. The homepage keeps its
existing two-slot layout and `/work` link. The current text-only Our Work page stays
text-only; there are no manual screenshots in its rendered HTML to replace.

## Build environment

Main tooling: Playwright and Sharp, locked in `pnpm-lock.yaml`. Use the package's
`pnpm@11.19.0`; production uses Node 24.18.0 on GitHub Actions Ubuntu 24.04.
The production workflow is `.github/workflows/deploy.yml`, triggered only by
pushes to `main`. It installs dependencies and Chromium, runs `pnpm build` once,
then tests, a Worker dry run and isolated runtime/browser checks. Finally it
deploys the already-built assets with `pnpm exec wrangler deploy`.

Browser installation is an explicit CI step: `pnpm exec playwright install
--with-deps chromium`. The generator no longer installs browsers or OS packages.
For a local bundled-browser build, run `pnpm exec playwright install chromium`
first. Cloudflare Workers Builds cannot perform the privileged Linux dependency
installation. `WORKERS_CI=1` now stops the legacy build before any demo fetch or
screenshot generation; it does not publish incomplete assets.

All three configured demo repositories are public and use ordinary read-only HTTPS
clones. No cross-repository GitHub credential is required. A future private demo
would require a fine-grained token with Contents: Read for only that repository,
or an equivalently restricted GitHub App installation token. The main repository's
default GITHUB_TOKEN must not be assumed to grant cross-repository access.

## Production cutover review

Set repository Actions secrets `CLOUDFLARE_ACCOUNT_ID` (the WEBEYOND company
account) and `CLOUDFLARE_API_TOKEN`. Create a custom token with Account / Workers
Scripts / Edit, restricted to that company account. This deployment preserves the
existing DB binding; it does not apply migrations or need D1 write, DNS edit,
account-wide administration, or Git build-management permissions. Current config
has no zone routes to create. Account-level script permission is not a
single-Worker restriction: use a Worker-specific resource restriction if Cloudflare
offers it for this token type. Review the token scope before enabling deployment.
Secrets are passed only to the final deploy step, not demo install/build commands.
Never paste the API token into chat or commit it. Existing Worker runtime secrets
remain in Cloudflare and are not copied into the repository.

Do not push this workflow until the workflow and repository secrets are reviewed.
Keep the deferred admin/referral changes out of the release commit. After the first
successful Actions production deployment, disconnect the Git integration under
Cloudflare / Workers & Pages / webeyond / Settings / Builds. This disables the
redundant hosted build without deleting the Worker, domain, D1 binding or secrets.
Until then, the legacy build fails closed and cannot deploy a second version.
No Cloudflare settings or production deployment have been changed during preparation.

For local builds with an existing compatible browser, set
`PREVIEW_BROWSER_EXECUTABLE` to its absolute path. This override is unnecessary
in ordinary CI. `pnpm build:previews` recaptures already assembled `public/demos/`
for local checks; use the complete `pnpm build` to fetch fresh GitHub commits.

The capture waits for network idle, fonts, visible images, finite animations,
image decoding and stable heading/header/image geometry. Missing visible images,
page exceptions, timeouts or invalid screenshot dimensions fail clearly with the
demo name. Generated files are ignored by Git. Builds fail rather than silently
falling back to stale or empty previews; previous published production assets are
unaffected because deployment never begins after a failed build. Browser/server
resources and disposable clones are cleaned in `finally` blocks.

Output: `public/generated-work/{veyil,raman,meera}-desktop.webp`.
Only another WEBEYOND build triggers refresh; a demo-only push does not trigger it.
