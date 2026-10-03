const body = document.querySelector("#enquiries-body");
const tableWrap = document.querySelector("#table-wrap");
const status = document.querySelector("#status");
const count = document.querySelector("#count");
const headers = [...document.querySelectorAll("th[data-key]")];
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
let enquiries = [];
let sortKey = "created_at";
let direction = "desc";
const expanded = new Set();

document.querySelector("#logout").addEventListener("click", async (event) => {
  event.target.disabled = true;
  try {
    const response = await fetch("/api/admin/logout", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: "{}",
    });
    if (response.ok || response.status === 401) {
      location.replace("/admin/login");
      return;
    }
    throw new Error("Could not log out. Please try again.");
  } catch {
    status.hidden = false;
    status.textContent = "Could not log out. Please try again.";
    status.classList.add("error");
    event.target.disabled = false;
  }
});

function compare(a, b, key) {
  if (key === "id") return Number(a.id) - Number(b.id);
  return collator.compare(String(a[key] ?? ""), String(b[key] ?? ""));
}

function sortedRows() {
  return [...enquiries].sort((a, b) => {
    const result = compare(a, b, sortKey) * (direction === "asc" ? 1 : -1);
    return result || Number(b.id) - Number(a.id);
  });
}

function cell(value) {
  const td = document.createElement("td");
  if (value === null || value === undefined || value === "") {
    td.textContent = "—";
    td.className = "empty";
  } else {
    td.textContent = String(value);
  }
  return td;
}

function render() {
  body.replaceChildren();
  for (const item of sortedRows()) {
    const row = document.createElement("tr");
    for (const key of ["id", "name", "phone", "business_name", "email"]) row.append(cell(item[key]));
    const message = document.createElement("td");
    if (item.message) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "message-toggle";
      button.setAttribute("aria-expanded", String(expanded.has(item.id)));
      button.setAttribute("aria-label", `${expanded.has(item.id) ? "Hide" : "Show"} full message from ${item.name}`);
      const preview = document.createElement("span");
      preview.className = "message-preview";
      preview.textContent = item.message;
      button.append(preview);
      button.addEventListener("click", () => {
        expanded.has(item.id) ? expanded.delete(item.id) : expanded.add(item.id);
        render();
      });
      message.append(button);
    } else {
      message.textContent = "—";
      message.className = "empty";
    }
    row.append(message, cell(item.created_at));
    body.append(row);
    if (expanded.has(item.id) && item.message) {
      const detail = document.createElement("tr");
      detail.className = "message-detail";
      const td = document.createElement("td");
      td.colSpan = 7;
      const full = document.createElement("p");
      full.textContent = item.message;
      td.append(full);
      detail.append(td);
      body.append(detail);
    }
  }
  for (const th of headers) {
    const active = th.dataset.key === sortKey;
    th.setAttribute("aria-sort", active ? (direction === "asc" ? "ascending" : "descending") : "none");
    th.querySelector("span").textContent = active ? (direction === "asc" ? "↑" : "↓") : "";
  }
}

for (const th of headers) {
  th.querySelector("button").addEventListener("click", () => {
    if (sortKey === th.dataset.key) direction = direction === "asc" ? "desc" : "asc";
    else {
      sortKey = th.dataset.key;
      direction = sortKey === "created_at" ? "desc" : "asc";
    }
    render();
  });
}

try {
  const response = await fetch("/api/admin/enquiries", { cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    location.replace("/admin/login");
    throw new Error("Please log in again.");
  }
  if (!response.ok) throw new Error("Could not load enquiries. Please try again.");
  const data = await response.json();
  if (!Array.isArray(data.enquiries)) throw new Error("Could not load enquiries. Please try again.");
  enquiries = data.enquiries;
  count.textContent = `${enquiries.length} ${enquiries.length === 1 ? "enquiry" : "enquiries"}`;
  status.hidden = true;
  tableWrap.hidden = false;
  render();
} catch (error) {
  status.textContent = error.message;
  status.classList.add("error");
}
