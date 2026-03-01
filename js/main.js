// main initialization
document.addEventListener('DOMContentLoaded', () => {
  // initialize lenis smooth scroll if available
  if (typeof Lenis !== 'undefined') {
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

    // handle anchor clicks
    document.addEventListener('click', function(e) {
      const anchor = e.target.closest('a[href^="#"]');
      if (!anchor) return;
      
      e.preventDefault();
      const targetId = anchor.getAttribute('href').substring(1);
      if (!targetId) return;
      
      const target = document.getElementById(targetId);
      if (target) {
        lenis.scrollTo(target, { offset: -80 });
      }
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
    lucide.createIcons();
  }
});
