import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorkPreviews } from "./generate-work-previews.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(root, ".demo-build");
const output = resolve(root, "public", "demos");
const manifest = JSON.parse(await readFile(join(root, "demos.config.json"), "utf8"));

function inside(base, target) {
  return target.startsWith(`${base}${sep}`);
}

function run(command, args, cwd, env = process.env) {
  const needsCmd = process.platform === "win32" && ["npm", "pnpm"].includes(command);
  const executable = needsCmd ? "cmd.exe" : command;
  const commandArgs = needsCmd ? ["/d", "/s", "/c", `${command} ${args.join(" ")}`] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed in ${cwd}`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function runNpm(args, cwd) {
  if (process.platform === "win32" && spawnSync("where.exe", ["npm.cmd"], { stdio: "ignore" }).status !== 0) {
    run("pnpm", ["dlx", "npm@11.6.2", ...args], cwd);
  } else {
    run("npm", args, cwd);
  }
}

if (!Array.isArray(manifest) || manifest.length === 0) {
  throw new Error("demos.config.json must contain at least one demo");
}
const ids = new Set();
for (const demo of manifest) {
  if (!/^[a-z0-9-]+$/.test(demo.id) || ids.has(demo.id)) {
    throw new Error(`Invalid or duplicate demo id: ${demo.id}`);
  }
  if (demo.route !== `/demos/${demo.id}/`) {
    throw new Error(`Route must match demo id: ${demo.id}`);
  }
  if (!/^[-\w]+\/[-\w]+$/.test(demo.repository) || !/^[-\w./]+$/.test(demo.branch)) {
    throw new Error(`Invalid repository or branch: ${demo.id}`);
  }
  ids.add(demo.id);
}

if (!inside(root, workspace) || !inside(root, output)) {
  throw new Error("Build paths must stay inside the main project");
}
await rm(workspace, { recursive: true, force: true });
await mkdir(workspace, { recursive: true });

try {
  let cloneEnv = process.env;
  if (process.env.GITHUB_TOKEN) {
    const askpass = join(workspace, "git-askpass.mjs");
    await writeFile(askpass,
      'const prompt = (process.argv[2] || "").toLowerCase();\n' +
      'process.stdout.write(prompt.includes("username") ? "x-access-token" : process.env.GITHUB_TOKEN || "");\n');
    const launcher = join(workspace, process.platform === "win32" ? "git-askpass.cmd" : "git-askpass.sh");
    const node = process.execPath.replaceAll('"', '\\"');
    const script = askpass.replaceAll('"', '\\"');
    await writeFile(launcher, process.platform === "win32"
      ? `@echo off\r\n"${node}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${node}" "${script}" "$@"\n`);
    if (process.platform !== "win32") await chmod(launcher, 0o700);
    cloneEnv = { ...process.env, GIT_ASKPASS: launcher, GIT_TERMINAL_PROMPT: "0" };
  }
  const assembled = join(workspace, "assembled-demos");
  await mkdir(assembled);
  for (const demo of manifest) {
    console.log(`[work-previews] Fetching ${demo.repository.split("/")[1]}...`);
    const source = join(workspace, `checkout-${demo.id}`);
    if (process.env.DEMO_SOURCE_ROOT) {
      // Even explicit local test inputs are copied before install/build.
      await cp(resolve(process.env.DEMO_SOURCE_ROOT, demo.repository.split("/")[1]), source, { recursive: true });
    } else {
      run("git", [...(process.platform === "win32" ? ["-c", "http.sslBackend=openssl"] : []),
        ...(process.env.GITHUB_TOKEN ? ["-c", "credential.helper="] : []),
        "clone", "--depth", "1", "--branch", demo.branch,
        `https://github.com/${demo.repository}.git`, source], root, cloneEnv);
    }
    if (!(await exists(source))) throw new Error(`Missing source for ${demo.id}: ${source}`);
    const destination = join(assembled, demo.id);
    await mkdir(destination);
    console.log(`[work-previews] Building ${demo.id[0].toUpperCase() + demo.id.slice(1)}...`);

    if (demo.kind === "static-files") {
      for (const entry of demo.publish ?? []) {
        if (entry.includes("/") || entry.includes("\\") || entry.startsWith(".")) {
          throw new Error(`Invalid publish entry for ${demo.id}: ${entry}`);
        }
        await cp(join(source, entry), join(destination, entry), { recursive: true });
      }
    } else if (demo.kind === "built") {
      if (demo.output !== "dist" && demo.output !== "out") {
        throw new Error(`Unexpected output directory for ${demo.id}`);
      }
      if (process.env.DEMO_SKIP_INSTALL !== "1") {
        if (demo.packageManager === "npm") runNpm(["ci"], source);
        else if (demo.packageManager === "pnpm") run("pnpm", ["install", "--frozen-lockfile"], source);
        else throw new Error(`Unsupported package manager for ${demo.id}`);
      }
      if (process.platform === "win32" && demo.windowsBuild) {
        run(demo.windowsBuild[0], demo.windowsBuild.slice(1), source);
      } else if (demo.packageManager === "npm") {
        runNpm(["run", "build"], source);
      } else {
        run("pnpm", ["run", "build"], source);
      }
      await cp(join(source, demo.output), destination, { recursive: true });
    } else {
      throw new Error(`Unsupported demo kind: ${demo.kind}`);
    }
    if (!(await exists(join(destination, "index.html")))) {
      throw new Error(`Demo ${demo.id} did not produce index.html`);
    }
    console.log(`Assembled ${demo.route}`);
  }

  // Capture the same built bytes that will be deployed, before publishing assets.
  const previews = join(workspace, "generated-work");
  await generateWorkPreviews({ demoDirectory: assembled, output: previews, manifest });
  // Build the main site's generated work listing only after every demo succeeds.
  run("node", ["scripts/build-work.mjs"], root);
  await rm(output, { recursive: true, force: true });
  await rename(assembled, output);
  await rm(join(root, "public", "generated-work"), { recursive: true, force: true });
  await rename(previews, join(root, "public", "generated-work"));
  console.log("Production assets are ready in public/");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
