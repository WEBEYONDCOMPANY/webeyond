const menuToggle = document.querySelector(".nav-toggle");
const navigation = document.querySelector(".header-nav");
function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  navigation.classList.remove("menu-open");
}
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  navigation.classList.toggle("menu-open", open);
});
document.addEventListener("click", event => {
  if (!navigation.contains(event.target) || event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    closeMenu(); menuToggle.focus();
  }
});
const map = document.querySelector(".build-map");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
if (map && !motion.matches && "IntersectionObserver" in window) {
  map.classList.add("reveal-ready");
  map.querySelectorAll(".build-need").forEach((label, index) => label.style.setProperty("--reveal-delay", `${410 + index * 45}ms`));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.intersectionRatio >= 0.2) map.classList.add("revealed");
      else if (!entry.isIntersecting) map.classList.remove("revealed");
    }
  }, { threshold: [0, 0.2] });
  observer.observe(map);
  motion.addEventListener("change",()=> { if(motion.matches) { map.classList.add("revealed"); observer.disconnect(); } });
}
