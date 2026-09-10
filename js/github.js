// github api utilities + reusable GitHub star CTA component.
//
// Convention (do NOT conflate):
//   - website conversion metric = outbound GitHub CTA clicks
//     (events: github_cta_impression / github_cta_click)
//   - a click is NOT a star. Evaluate overall impact separately via
//     GitHub star growth on the repo.
//
// Usage: add data-github-cta + data-cta-location to any anchor, and
// (optionally) a child [data-star-count] span for the live count:
//   <a href="https://github.com/GhostESP-Revival/GhostESP"
//      target="_blank" rel="noopener"
//      data-github-cta data-cta-location="hero" data-cta-variant="default">
//     Star on GitHub <span data-star-count>...</span>
//   </a>
const github = {
  STAR_OWNER: 'GhostESP-Revival',
  STAR_REPO: 'GhostESP',
  STAR_CACHE_KEY: 'ghostesp-star-count',
  STAR_CACHE_TTL: 60 * 60 * 1000, // 1h
  _starCount: null,
  _starPromise: null,
  _impressionSeen: new WeakSet(),

  formatStars(n) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  },

  // Live star count, cached in memory + localStorage. Never throws.
  async fetchStarCount() {
    if (typeof this._starCount === 'number') return this._starCount;
    if (this._starPromise) return this._starPromise;

    try {
      const raw = localStorage.getItem(this.STAR_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.count === 'number' && Date.now() - parsed.ts < this.STAR_CACHE_TTL) {
          this._starCount = parsed.count;
          return this._starCount;
        }
      }
    } catch (e) {}

    this._starPromise = (async () => {
      // Prefer the Netlify proxy (avoids API rate limits); fall back to direct API.
      const urls = [
        `/.netlify/functions/github-stars?owner=${this.STAR_OWNER}&repo=${this.STAR_REPO}`,
        `https://api.github.com/repos/${this.STAR_OWNER}/${this.STAR_REPO}`
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) continue;
          const data = await res.json();
          if (data && typeof data.stargazers_count === 'number') {
            this._starCount = data.stargazers_count;
            try {
              localStorage.setItem(this.STAR_CACHE_KEY, JSON.stringify({ count: this._starCount, ts: Date.now() }));
            } catch (e) {}
            return this._starCount;
          }
        } catch (e) {}
      }
      return null;
    })();

    const result = await this._starPromise;
    this._starPromise = null;
    return result;
  },

  trackGithub(eventName, el) {
    if (window.__gaLoaded !== true || typeof window.gtag !== 'function') return;
    const dataset = (el && el.dataset) || {};
    window.gtag('event', eventName, {
      cta_location: dataset.ctaLocation || dataset.githubCta || 'unknown',
      source_path: window.location.pathname || '',
      after_flash: dataset.afterFlash === 'true' ? 'yes' : 'no',
      variant: dataset.ctaVariant || 'default',
      link_url: el && el.href ? el.href : ''
    });
  },

  hydrateStarCounts(root) {
    const scope = root || document;
    const spots = scope.querySelectorAll ? scope.querySelectorAll('[data-star-count]') : [];
    if (!spots.length) return;
    this.fetchStarCount().then((count) => {
      if (typeof count !== 'number') return;
      const formatted = this.formatStars(count);
      spots.forEach((spot) => {
        spot.textContent = '★ ' + formatted;
        spot.setAttribute('aria-label', count.toLocaleString() + ' GitHub stars');
        const cta = spot.closest('[data-github-cta]');
        if (cta) cta.setAttribute('aria-label', 'Star GhostESP on GitHub, ' + count.toLocaleString() + ' stars');
      });
      // Keep the nav star button in sync if social-proof rendered it first.
      if (window.SocialProof && typeof window.SocialProof.renderNavStars === 'function') {
        try { window.SocialProof.renderNavStars(count); } catch (e) {}
      }
    });
  },

  observeImpressions(root) {
    const scope = root || document;
    const ctas = scope.querySelectorAll ? scope.querySelectorAll('[data-github-cta]') : [];
    if (!ctas.length) return;
    const fire = (el) => {
      if (this._impressionSeen.has(el)) return;
      this._impressionSeen.add(el);
      this.trackGithub('github_cta_impression', el);
    };
    if (!('IntersectionObserver' in window)) {
      ctas.forEach(fire);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          fire(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    ctas.forEach((el) => observer.observe(el));
  },

  hydrate(root) {
    this.hydrateStarCounts(root);
    this.observeImpressions(root);
  },

  async fetchLatestRelease(owner, repo) {
    const query = `?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
    let response = await fetch(`/.netlify/functions/github-release${query}`, {
      headers: { Accept: 'application/json' }
    });

    // Keep local static-server development working when Netlify Functions are unavailable.
    if (response.status === 404) {
      response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    }

    if (!response.ok) throw new Error(`GitHub release request failed (${response.status})`);
    return await response.json();
  },

  async renderRelease(containerId, owner, repo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = components.loading();

    try {
      const release = await this.fetchLatestRelease(owner, repo);
      container.innerHTML = components.releaseCard(release, containerId);
      if (window.lucide) {
        window.lucide.createIcons();
      }
    } catch (error) {
      container.innerHTML = `
        <div class="card" style="text-align: center; color: var(--text-dim);">
          <p>Release details are temporarily unavailable.</p>
          <a href="https://github.com/${owner}/${repo}/releases" target="_blank" rel="noopener">View releases on GitHub</a>
        </div>
      `;
    }
  }
};

if (typeof window !== 'undefined') {
  window.GhostStar = github;
  document.addEventListener('DOMContentLoaded', () => github.hydrate());
}
