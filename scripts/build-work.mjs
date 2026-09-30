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
