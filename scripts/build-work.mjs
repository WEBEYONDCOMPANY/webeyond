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

const demos = JSON.parse(await readFile(join(root, "demos.config.json"), "utf8"));

function renderProject(project, index) {
  if (!project.route.startsWith("/demos/")) {
    throw new Error(`Invalid local path for ${project.name}`);
  }
  const id = `work-project-${index + 1}`;
  const demo = demos.find(d => d.route === project.route);
  if (!demo?.screenshot) throw new Error(`Missing generated preview for ${project.name}`);
  const title = project.workTitle || project.name;
  const number = String(index + 1).padStart(2, "0");
  return `
        <article class="showcase showcase-${index + 1}" id="concept-${index + 1}" aria-labelledby="${id}">
          <div class="showcase-inner wrap">
            <div class="showcase-heading">
              <p class="showcase-category"><span>${number} /</span> ${escape(project.category)}</p>
              <h2 id="${id}">${escape(title)}</h2>
            </div>
            <a class="showcase-preview" href="${escape(project.route)}" aria-label="Open the ${escape(title)} demo">
              <div class="preview-caption"><span>LIVE CONCEPT</span><span aria-hidden="true">↗</span></div>
              <img src="/generated-work/${escape(demo.screenshot.output)}" alt="Desktop preview of the ${escape(title)} concept" width="1440" height="900" loading="${index === 0 ? "eager" : "lazy"}" />
              <span class="preview-invitation" aria-hidden="true">Take a look inside ↗</span>
            </a>
            <div class="showcase-details">
              <p>${escape(project.description)}</p>
              <a class="showcase-link" href="${escape(project.route)}">Open the demo <span aria-hidden="true">↗</span></a>
            </div>
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
