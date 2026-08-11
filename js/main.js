// main initialization
document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // initialize lenis smooth scroll if available
  if (typeof Lenis !== 'undefined' && !prefersReducedMotion) {
    const lenis = new Lenis({
      duration: 0.8,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.2,
      touchMultiplier: 2,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // handle in-page anchor clicks (#id, /#id, /path#id on the current page)
    document.addEventListener('click', function(e) {
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;

      let url;
      try { url = new URL(anchor.href); } catch (err) { return; }
      if (url.pathname !== window.location.pathname) return;
      if (!url.hash || url.hash === '#') return;

      const target = document.getElementById(url.hash.substring(1));
      if (!target) return;

      e.preventDefault();
      const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 80;
      lenis.scrollTo(target, { offset: -navHeight });
    });
  }

  // load releases if elements exist
  if (document.getElementById('latest-release')) {
    github.renderRelease('latest-release', 'GhostESP-Revival', 'GhostESP');
  }
  if (document.getElementById('flipper-release')) {
    github.renderRelease('flipper-release', 'GhostESP-Revival', 'GhostESP-FlipperCompanion');
  }

  // initialize lucide icons if available
  if (typeof lucide !== 'undefined') {
    // decorative icons should be invisible to assistive tech
    document.querySelectorAll('i[data-lucide]').forEach(function (icon) {
      icon.setAttribute('aria-hidden', 'true');
    });
    lucide.createIcons();
    document.querySelectorAll('svg.lucide').forEach(function (svg) {
      if (!svg.hasAttribute('aria-hidden')) svg.setAttribute('aria-hidden', 'true');
    });
  }
});
