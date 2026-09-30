const buildMap = document.querySelector(".build-map");

if (buildMap) {
  const hub = buildMap.querySelector(".build-hub");
  const connectors = buildMap.querySelector(".build-connectors");
  const needs = [...buildMap.querySelectorAll(".build-need")];
  const svgNamespace = "http://www.w3.org/2000/svg";
  let scheduledFrame = 0;

  function drawConnectors() {
    scheduledFrame = 0;
    const mapRect = buildMap.getBoundingClientRect();
    const hubRect = hub.getBoundingClientRect();
    if (!mapRect.width || !mapRect.height) return;

    connectors.setAttribute("viewBox", `0 0 ${mapRect.width} ${mapRect.height}`);
    connectors.setAttribute("preserveAspectRatio", "none");

    const corners = {
      top: {
        x: hubRect.left - mapRect.left + 1,
        y: hubRect.top - mapRect.top + 1,
      },
      bottom: {
        x: hubRect.right - mapRect.left - 1,
        y: hubRect.bottom - mapRect.top - 1,
      },
    };

    const paths = needs.map((need) => {
      const needRect = need.getBoundingClientRect();
      const corner = corners[need.dataset.corner];
      const dotX = needRect.left - mapRect.left + 2;
      const dotY = needRect.top - mapRect.top + needRect.height / 2;
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute(
        "d",
        `M ${dotX.toFixed(1)} ${dotY.toFixed(1)} L ${corner.x.toFixed(1)} ${corner.y.toFixed(1)}`,
      );
      return path;
    });

    connectors.replaceChildren(...paths);
  }

  function scheduleDraw() {
    if (!scheduledFrame) scheduledFrame = requestAnimationFrame(drawConnectors);
  }

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(buildMap);
    observer.observe(hub);
    needs.forEach((need) => observer.observe(need));
  }

  window.addEventListener("resize", scheduleDraw, { passive: true });
  if (document.fonts) document.fonts.ready.then(scheduleDraw);
  scheduleDraw();
}
