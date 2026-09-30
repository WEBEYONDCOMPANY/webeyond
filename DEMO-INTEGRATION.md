# Demo integration

`pnpm build` is the production build. It clones the repositories listed in `demos.config.json`, builds each with its own package manager and lockfile, and publishes only the output into `public/demos/`. `.demo-build/` is temporary and ignored. `public/demos/` is generated and ignored too. A failed demo build leaves the currently assembled `public/demos/` in place.

The main Worker and these static assets form one Cloudflare deployment. `/work` is generated from `data/projects.mjs`; its links point to `/demos/veyil/`, `/demos/raman/`, and `/demos/meera/`. VEYIL uses relative links and assets. Raman uses Astro's `base` and a shared path helper for internal links. Meera's current pages export statically with Next's `basePath`, with one helper for plain links and public images.

For a local build from the sibling project folders, set `DEMO_SOURCE_ROOT` to the parent `projects` directory. `DEMO_SKIP_INSTALL=1` is available only when dependencies are already installed there. The normal build fetches the repositories and installs locked dependencies. The deployed build environment needs Git access to any private demo repository.

Before deployment, check direct loads and refreshes of `/`, `/work`, every demo root, Raman's `/work/` and detail routes, and Meera's `/insights/` article routes. Check that each demo's CSS, JavaScript, images, and fonts load under its own `/demos/<id>/` path.
