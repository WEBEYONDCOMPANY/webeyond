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
`pnpm@11.19.0`; Node 22 or 24 is supported. The production command remains
`pnpm build`, followed by the existing Wrangler deployment command.

Chromium is automatically installed by the build. On Linux the standard Playwright
`install --with-deps chromium` prepares OS dependencies as well. Cloudflare Workers
Builds currently documents Ubuntu 24.04 x86_64, compatible with Playwright. The
actual Cloudflare account build must still verify its ability to install OS packages;
local Windows success does not verify hosted Linux permissions. If unavailable,
use a GitHub Actions Ubuntu runner with the same `pnpm build` pipeline and deploy
its complete artifact; do not screenshot a different demo revision in a second stage.
No deployment settings or external CI were changed by this implementation.

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
