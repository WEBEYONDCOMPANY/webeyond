const form = document.querySelector("#lead-form");
const status = document.querySelector("#form-status");
const submitButton = form.querySelector("button[type='submit']");

function showError(field, message) {
  const input = form.elements.namedItem(field);
  const error = document.querySelector(`#${field}-error`);
  if (error) error.textContent = message;
  input.setAttribute("aria-invalid", String(Boolean(message)));
  if (message && error) input.setAttribute("aria-describedby", error.id);
  else input.removeAttribute("aria-describedby");
}

function validate(payload) {
  const errors = {};
  if (payload.name.length < 2) errors.name = "Please enter your name.";
  const digits = payload.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15)
    errors.phone = "Enter a phone number we can reach.";
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))
    errors.email = "Enter a valid email address or leave this blank.";
  for (const field of ["name", "phone", "email"])
    showError(field, errors[field] || "");
  return Object.keys(errors).length === 0;
}

for (const field of ["name", "phone", "email"]) {
  form.elements
    .namedItem(field)
    .addEventListener("input", () => showError(field, ""));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  status.removeAttribute("data-state");
  const values = Object.fromEntries(new FormData(form).entries());
  const payload = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value).trim()]),
  );
  if (!validate(payload)) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Sending your enquiry…";
  try {
    const response = await fetch("/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Request failed");
    status.textContent =
      "Thank you. Your enquiry is on its way, and we’ll be in touch.";
    status.dataset.state = "success";
    form.reset();
  } catch {
    status.textContent =
      "We couldn’t send that just now. Please email webeyondcompany@gmail.com directly.";
    status.dataset.state = "error";
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Send your enquiry";
  }
});
