const form = document.querySelector("#login-form");
const status = document.querySelector("#login-status");
const button = form.querySelector("button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.hidden = true;
  button.disabled = true;
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.email.value, password: form.password.value }),
    });
    form.password.value = "";
    if (response.ok) {
      location.replace("/admin/enquiries");
      return;
    }
    status.textContent = response.status === 401
      ? "Invalid email or password."
      : response.status === 429
        ? "Too many login attempts. Please try again later."
        : "Login is unavailable. Please try again later.";
  } catch {
    form.password.value = "";
    status.textContent = "Could not connect. Please try again.";
  }
  status.hidden = false;
  button.disabled = false;
});
