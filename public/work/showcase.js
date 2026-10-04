const panels = document.querySelectorAll('.showcase-inner');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let observer;
function configure() {
  observer?.disconnect();
  panels.forEach(panel => panel.classList.remove('showcase-ready', 'showcase-visible'));
  if (preference.matches || !('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    entries.forEach(({target, isIntersecting, boundingClientRect}) => {
      if (isIntersecting) target.classList.add('showcase-visible');
      else if (boundingClientRect.bottom < 0 || boundingClientRect.top > innerHeight)
        target.classList.remove('showcase-visible');
    });
  }, {threshold: 0, rootMargin: '0px 0px -40px 0px'});
  panels.forEach(panel => { panel.classList.add('showcase-ready'); observer.observe(panel); });
}
configure();
preference.addEventListener('change', configure);
