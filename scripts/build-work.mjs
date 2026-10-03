import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { projects } from "../data/projects.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const escape = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

function renderProject(project, index) {
  if (!project.route.startsWith("/demos/")) {
    throw new Error(`Invalid local path for ${project.name}`);
  }
  const id = `work-project-${index + 1}`;
  return `
        <article class="work-card" aria-labelledby="${id}">
          <div class="work-card-copy">
            <p class="work-card-category">${escape(project.category)}</p>
            <h2 id="${id}">${escape(project.name)}</h2>
            <p>${escape(project.description)}</p>
            <a class="work-card-link" href="${escape(project.route)}">Explore the site <span aria-hidden="true">↗</span></a>
          </div>
        </article>`;
}

const template = await readFile(join(root, "scripts", "work.template.html"), "utf8");
const marker = "<!-- PROJECTS -->";
if (template.split(marker).length !== 2) throw new Error("Missing unique project marker");
const output = template.replace(marker, projects.map(renderProject).join("\n"));
const directory = join(root, "public", "work");
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "index.html"), output);
console.log(`Built work page with ${projects.length} projects`);

// The same demo manifest controls which generated previews fill the two slots.
const demos = JSON.parse(await readFile(join(root, "demos.config.json"), "utf8"));
const teaser = demos.filter(d => d.screenshot?.teaser);
if (teaser.length !== 2) throw new Error("Homepage requires exactly two teaser demos");
const homepage = join(root, "public", "index.html");
const html = await readFile(homepage, "utf8");
const images = teaser.map(demo => {
  const project = projects.find(project => project.route === demo.route);
  if (!project) throw new Error(`Missing portfolio description: ${demo.id}`);
  return `<img src="/generated-work/${escape(demo.screenshot.output)}" alt="${escape(project.name)} desktop website preview" width="1440" height="900" loading="lazy" />`;
}).join("");
const slots = /(<a class="work-peek"[^>]*>)[\s\S]*?(<\/a>)/;
if (!slots.test(html)) throw new Error("Homepage preview slots were not found");
await writeFile(homepage, html.replace(slots, `$1${images}$2`));
