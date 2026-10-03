import { createServer } from "node:http";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import sharp from "sharp";

export const viewport = { width: 1440, height: 900 };
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json" };

export async function serveDemos(directory) {
  const base = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (!url.pathname.startsWith("/demos/")) { response.writeHead(404).end(); return; }
      let file = resolve(base, `.${decodeURIComponent(url.pathname.slice(6))}`);
      if (!file.startsWith(base + sep)) { response.writeHead(403).end(); return; }
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  if (await page.evaluate(() => [...document.fonts].some(font => font.status === "error"))) throw new Error("A page font failed to load");
  await page.waitForFunction(() => Array.from(document.images).filter(image => {
    const r = image.getBoundingClientRect();
    return r.width && r.height && r.top < innerHeight && r.bottom > 0;
  }).every(image => image.complete && image.naturalWidth > 0), null, { timeout: 20000 });
  await page.waitForFunction(() => document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .every(a => ["finished", "idle", "paused"].includes(a.playState)), null, { timeout: 20000 });
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).filter(i => i.complete && i.naturalWidth).map(i => i.decode().catch(() => {})));
  });
  // Observe real layout/visual stability; don't sleep for an arbitrary long delay.
  await page.waitForFunction(() => {
    const sample = [...document.querySelectorAll('h1, header, img')].map(e => {
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      return [r.x, r.y, r.width, r.height, c.opacity, c.transform].join(',');
    }).join('|');
    const state = window.__previewStability ||= { sample: '', since: performance.now() };
    if (sample !== state.sample) { state.sample = sample; state.since = performance.now(); }
    return performance.now() - state.since > 700;
  }, null, { timeout: 20000 });
}

export async function generateWorkPreviews({ demoDirectory, output, manifest }) {
  await mkdir(output, { recursive: true });
  const configured = manifest.filter(d => d.screenshot);
  for (const demo of configured) if (!/^[a-z0-9-]+-desktop\.webp$/.test(demo.screenshot.output)) throw new Error(`Invalid screenshot output: ${demo.id}`);
  if (!process.env.PREVIEW_BROWSER_EXECUTABLE) {
    console.log("[work-previews] Installing Chromium...");
    const install = spawnSync(process.execPath, [join(root, "node_modules/playwright/cli.js"), "install", ...(process.platform === "linux" ? ["--with-deps"] : []), "chromium"], { stdio: "inherit" });
    if (install.status !== 0) throw new Error("Playwright browser installation failed. Prepare Chromium dependencies in CI before building; no partial previews were published.");
  }
  console.log("[work-previews] Starting preview server...");
  const server = await serveDemos(demoDirectory);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PREVIEW_BROWSER_EXECUTABLE || undefined });
    for (const demo of configured) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US" });
      try {
        console.log(`[work-previews] Capturing ${demo.id[0].toUpperCase() + demo.id.slice(1)} at ${viewport.width}x${viewport.height}...`);
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(server.origin + demo.route, { waitUntil: "networkidle", timeout: 45000 });
        if (!response?.ok()) throw new Error(`Page returned ${response?.status()}`);
        if (demo.screenshot.readySelector) await page.locator(demo.screenshot.readySelector).waitFor({state: "visible"});
        await settle(page);
        if (errors.length) throw new Error(`Page error: ${errors[0]}`);
        const png = await page.screenshot({ type: "png", fullPage: false, animations: "disabled" });
        const webp = await sharp(png).webp({ quality: 86 }).toBuffer();
        const metadata = await sharp(webp).metadata();
        if (metadata.width !== viewport.width || metadata.height !== viewport.height) throw new Error("Unexpected preview dimensions");
        await writeFile(join(output, demo.screenshot.output), webp);
        console.log(`[work-previews] Saved ${demo.screenshot.output}`);
      } catch (error) { throw new Error(`[work-previews] Preview failed for ${demo.id}: ${error.message}`, { cause: error }); }
      finally { await context.close(); }
    }
  } finally { await browser?.close(); await server.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await readFile(join(root, "demos.config.json"), "utf8"));
  await generateWorkPreviews({ demoDirectory: join(root, "public/demos"), output: join(root, "public/generated-work"), manifest });
}
