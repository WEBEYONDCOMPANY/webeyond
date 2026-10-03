// Progressive enhancement: content stays visible without JavaScript or motion.
(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;
  const groups = [
    ['.delivery-phrase-stage', ['.delivery-statements span:nth-child(1)', '.delivery-ghost-sooner', '.delivery-statements span:nth-child(2)', '.delivery-ghost-better', '.delivery-statements span:nth-child(3)']],
    ['.process-list li', ['span', 'h3', 'p']],
    ['.process-conclusion', ['p:first-child', 'p:nth-child(2)', 'a']],
    ['.capability-inner', ['.capability-eyebrow', 'h2', '.capability-body']],
    ['.capability-final', null],
    ['.language-lines', ['.language-english', '.language-tamil', '.language-yours:not(.language-any)', '.language-any']],
    ['.language-copy', null],
  ];
  const targets = [];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.intersectionRatio >= 0.16) entry.target.classList.add('middle-visible');
      else if (!entry.isIntersecting && !entry.target.contains(document.activeElement)) entry.target.classList.remove('middle-visible');
    }
  }, {threshold: [0, 0.16]});
  for (const [selector, children] of groups) for (const target of document.querySelectorAll(selector)) {
    const items = children ? children.map(child => target.querySelector(child)).filter(Boolean) : [target];
    items.forEach((item, index) => {
      item.classList.add('middle-item');
      item.style.setProperty('--middle-delay', `${250 + index * 130}ms`);
    });
    target.classList.add('middle-ready');
    targets.push(target);
    observer.observe(target);
  }
  // Keyboard focus must never land on an invisible link.
  document.addEventListener('focusin', event => event.target.closest('.middle-ready')?.classList.add('middle-visible'));
  preference.addEventListener('change', () => {
    if (preference.matches) { targets.forEach(target => target.classList.add('middle-visible')); observer.disconnect(); }
  });
})();
