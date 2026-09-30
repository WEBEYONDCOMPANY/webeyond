const snapRoot = document.documentElement;
const snapSections = Array.from(
  document.querySelectorAll("#main > .landing-stage, #main > section"),
);
const snapFooter = document.querySelector(".site-footer");
const snapTargets = snapFooter ? [...snapSections, snapFooter] : snapSections;
const snapForm = document.querySelector("#lead-form");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let animationFrame = 0;
let wheelGesture = false;
let wheelTimer = 0;
let touchGesture = null;

function maximumScroll() {
  return Math.max(
    0,
    document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
}

function snapPosition(element) {
  if (element === snapSections[0]) return 0;
  if (element === snapFooter) return maximumScroll();
  return Math.min(
    maximumScroll(),
    window.scrollY + element.getBoundingClientRect().top,
  );
}

function nearestSnapIndex() {
  let nearest = 0;
  let distance = Infinity;

  snapTargets.forEach((element, index) => {
    const difference = Math.abs(window.scrollY - snapPosition(element));
    if (difference < distance) {
      distance = difference;
      nearest = index;
    }
  });

  return nearest;
}

function formIsActive(target) {
  return (
    snapForm?.contains(document.activeElement) ||
    (target instanceof Element && Boolean(target.closest("#lead-form")))
  );
}

function canControl(index, direction, target) {
  if (reduceMotion.matches || formIsActive(target)) return false;
  if (index + direction < 0 || index + direction >= snapTargets.length) {
    return false;
  }

  const section = snapTargets[index];
  return (
    section === snapFooter ||
    section.getBoundingClientRect().height <= window.innerHeight + 32
  );
}

function stopAnimation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  snapRoot.classList.remove("snap-driving");
}

function animateTo(index) {
  stopAnimation();
  const from = window.scrollY;
  const to = snapPosition(snapTargets[index]);
  if (Math.abs(to - from) < 2) return;

  const duration = 280;
  const started = performance.now();
  snapRoot.classList.add("snap-driving");

  function frame(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    window.scrollTo(0, from + (to - from) * eased);

    if (progress < 1) {
      animationFrame = requestAnimationFrame(frame);
    } else {
      window.scrollTo(0, to);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        snapRoot.classList.remove("snap-driving");
      });
    }
  }

  animationFrame = requestAnimationFrame(frame);
}

window.addEventListener(
  "wheel",
  (event) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (reduceMotion.matches || formIsActive(event.target)) return;

    if (wheelGesture) {
      event.preventDefault();
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelGesture = false;
      }, 360);
      return;
    }

    const direction = Math.sign(event.deltaY);
    const current = nearestSnapIndex();
    if (!canControl(current, direction, event.target)) return;

    event.preventDefault();
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => {
      wheelGesture = false;
    }, 360);
    wheelGesture = true;
    animateTo(current + direction);
  },
  { passive: false },
);

window.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1 || reduceMotion.matches) return;
    const current = nearestSnapIndex();
    if (formIsActive(event.target)) return;

    const touch = event.touches[0];
    touchGesture = {
      index: current,
      startX: touch.clientX,
      startY: touch.clientY,
      startScroll: window.scrollY,
      claimed: false,
    };
  },
  { passive: true },
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (!touchGesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchGesture.startX;
    const dy = touch.clientY - touchGesture.startY;

    if (!touchGesture.claimed) {
      if (Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        touchGesture = null;
        return;
      }

      const direction = -Math.sign(dy);
      if (!canControl(touchGesture.index, direction, event.target)) {
        touchGesture = null;
        return;
      }

      stopAnimation();
      snapRoot.classList.add("snap-driving");
      touchGesture.claimed = true;
    }

    event.preventDefault();
    window.scrollTo(0, touchGesture.startScroll - dy);
  },
  { passive: false },
);

function finishTouch(event) {
  if (!touchGesture) return;
  const gesture = touchGesture;
  touchGesture = null;
  if (!gesture.claimed) return;

  const finalY = event.changedTouches[0]?.clientY ?? gesture.startY;
  const distance = gesture.startY - finalY;
  const direction = Math.sign(distance);
  const target = Math.abs(distance) >= 18 ? gesture.index + direction : gesture.index;
  animateTo(Math.max(0, Math.min(target, snapTargets.length - 1)));
}

window.addEventListener("touchend", finishTouch, { passive: true });
window.addEventListener("touchcancel", () => {
  touchGesture = null;
  stopAnimation();
});

document.addEventListener("focusin", (event) => {
  if (formIsActive(event.target)) stopAnimation();
});

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest('a[href^="#"]')) {
    stopAnimation();
  }
});

window.addEventListener("hashchange", stopAnimation);
window.addEventListener("popstate", stopAnimation);
reduceMotion.addEventListener("change", stopAnimation);
