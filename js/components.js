// reusable components
const components = {
  nav() {
    // check if we're on index page or not
    const isIndex = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/v2');
    const isFlasher = window.location.pathname.endsWith('/flasher') || window.location.pathname.endsWith('flasher.html');
    const prefix = isIndex ? '' : '/';
    const navLinksClass = isFlasher ? 'nav-links flasher-nav-links' : 'nav-links';
    
    return `
      <div class="container">
        <a href="/" class="nav-logo">
          <img src="images/ghostespdotnet.webp" alt="Ghost ESP">
        </a>
        <button class="mobile-menu-toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="nav-links"> 
          <span></span>
          <span></span>
          <span></span>
        </button>
        <ul id="nav-links" class="${navLinksClass}">
          <li><a href="/boards">Boards</a></li>
          <li><a href="/printables">Printables</a></li>
          <li><a href="/flasher">Flasher</a></li>
          <li><a href="/dashboard">Dashboard</a></li>
          <li><a href="/dashboard?tab=store" data-track="nav_apps_store">Apps</a></li>
          <li><a href="https://docs.ghostesp.net" target="_blank" rel="noopener">Docs</a></li>
          <li><a href="/donate">Donate</a></li>
          <li class="nav-dropdown">
            <button class="nav-dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="nav-resources-menu">Resources</button>
            <ul class="nav-dropdown-menu" id="nav-resources-menu">
              <li><a href="/features">Features</a></li>
              <li><a href="/blog">Blog</a></li>
              <li><a href="/changelog">Changelog</a></li>
              <li><a href="/isprereleasethelatest">Release Check</a></li>
              <li><a href="/asset-pack-builder">Pack Builder</a></li>
              <li><a href="/openwd">WDMap</a></li>
              <li><a href="/companion">Companion App</a></li>
            </ul>
          </li>
          <li class="nav-dropdown">
            <button class="nav-dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="nav-community-menu">Community</button>
            <ul class="nav-dropdown-menu" id="nav-community-menu">
              <li><a href="https://shop.ghostesp.net" target="_blank" rel="noopener">Merch</a></li>
              <li><a href="/brand-assets">Brand Assets</a></li>
              <li><a href="/brand-guidelines">Brand Guidelines</a></li>
              <li><a href="/feedback">Feedback</a></li>
            </ul>
          </li>
          <li id="nav-star-count">
            <a href="https://github.com/GhostESP-Revival/GhostESP" target="_blank" rel="noopener" class="nav-star-btn" title="Star GhostESP on GitHub" aria-label="Star GhostESP on GitHub, loading star count" data-github-cta data-cta-location="nav" data-cta-variant="default">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              <span data-star-count aria-live="polite">★ …</span>
            </a>
          </li>
        </ul>
      </div>
    `;
  },

  // sitewide dismissible v2.0 launch banner
  ANNOUNCE_KEY: 'ghostesp_v2_1_announce_dismissed',

  renderAnnounceBar() {
    try {
      if (localStorage.getItem(this.ANNOUNCE_KEY) === '1') return;
    } catch (e) {}
    if (document.querySelector('.announce-bar')) return;

    const bar = document.createElement('div');
    bar.className = 'announce-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Announcement');
    bar.innerHTML = `
      <a href="/changelog" class="announce-bar-link">
        <strong>GhostESP v2.1 is here.</strong>
        <span class="announce-bar-cta">See what's new &rarr;</span>
      </a>
      <button class="announce-bar-close" type="button" aria-label="Dismiss announcement">&times;</button>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    bar.querySelector('.announce-bar-close').addEventListener('click', () => {
      try { localStorage.setItem(this.ANNOUNCE_KEY, '1'); } catch (e) {}
      bar.remove();
      document.documentElement.style.setProperty('--announce-height', '0px');
      window.dispatchEvent(new Event('resize'));
    });
  },

  loading() {
    return `
      <div class="loading">
        <span class="spinner"></span>
        Loading...
      </div>
    `;
  },

  releaseCard(release, containerId) {
    const date = new Date(release.published_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const downloads = release.assets.reduce((sum, asset) => sum + asset.download_count, 0);

    // parse markdown body
    let body = release.body || '';
    if (body.length > 500) {
      body = body.substring(0, 500) + '...';
    }

    const initialAssets = release.assets.slice(0, 5);
    const hasMore = release.assets.length > 5;

    return `
      <div class="release-card">
        <div class="release-header">
          <div>
            <h3 class="release-title">${this.escapeHtml(release.name || release.tag_name)}</h3>
            <div class="release-meta">
              <span>${date}</span>
              <span>•</span>
              <span>${downloads.toLocaleString()} downloads</span>
              <span>•</span>
              <span><code>${this.escapeHtml(release.tag_name)}</code></span>
            </div>
          </div>
          <a href="${this.escapeHtml(release.html_url)}" class="btn btn-small btn-secondary" target="_blank">View on GitHub</a>
        </div>
        ${body ? `<div class="release-body">${this.parseMarkdown(body)}</div>` : ''}
        ${release.assets.length ? this.assetList(initialAssets, `${containerId}-assets`) : ''}
        ${hasMore ? `<div style="display: flex; justify-content: center;"><button class="btn btn-small btn-show-all" onclick="components.showAllAssets('${containerId}', ${JSON.stringify(release.assets).replace(/"/g, '&quot;')}, this)">Show All Downloads</button></div>` : ''}
      </div>
    `;
  },

  showAllAssets(containerId, allAssets, button) {
    const container = document.getElementById(`${containerId}-assets`);
    if (container) {
      container.innerHTML = allAssets.map(asset => `
        <a href="${this.escapeHtml(asset.browser_download_url)}" class="asset-link" download>
          <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(asset.name)}</span>
          <span style="margin-left: auto; flex-shrink: 0; opacity: 0.5; font-size: 0.85em">${this.formatSize(asset.size)}</span>
        </a>
      `).join('');
      
      // hide the show all button
      if (button) button.style.display = 'none';
    }
  },

  assetList(assets, id) {
    return `
      <div class="release-assets" id="${id}">
        ${assets.map(asset => `
          <a href="${this.escapeHtml(asset.browser_download_url)}" class="asset-link" download>
            <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(asset.name)}</span>
            <span style="margin-left: auto; flex-shrink: 0; opacity: 0.5; font-size: 0.85em">${this.formatSize(asset.size)}</span>
          </a>
        `).join('')}
      </div>
    `;
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // simple markdown parser for release notes
  parseMarkdown(text) {
    return this.escapeHtml(text)
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^\* (.*)$/gim, '<li>$1</li>')
      .replace(/^- (.*)$/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[h|ul|li])(.+)/gim, '<p>$1</p>')
      .replace(/<\/p><p><\/p>/g, '</p>');
  }
};

// render components on load
document.addEventListener('DOMContentLoaded', () => {
  components.renderAnnounceBar();

  // engagement analytics — only fires after GA consent, matching the boards.js pattern
  document.addEventListener('click', (e) => {
    if (window.__gaLoaded !== true || typeof window.gtag !== 'function') return;

    // GitHub star CTA clicks. This tracks OUTBOUND CLICKS only — a click
    // is not a star. Measure repo impact separately via star growth.
    const githubCta = e.target.closest('[data-github-cta]');
    if (githubCta) {
      window.gtag('event', 'github_cta_click', {
        cta_location: githubCta.dataset.ctaLocation || 'unknown',
        source_path: window.location.pathname || '',
        after_flash: githubCta.dataset.afterFlash === 'true' ? 'yes' : 'no',
        variant: githubCta.dataset.ctaVariant || 'default',
        link_url: githubCta.href || ''
      });
      return;
    }

    const tracked = e.target.closest('[data-track]');
    if (tracked) {
      window.gtag('event', tracked.getAttribute('data-track'), {
        link_url: tracked.href || '',
        link_text: (tracked.textContent || '').trim().substring(0, 100)
      });
      return;
    }

    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.href || '';

    if (link.classList.contains('asset-link')) {
      const label = link.querySelector('span');
      window.gtag('event', 'download_click', {
        file_name: label ? label.textContent.trim() : href
      });
    } else if (href.indexOf('discord.gg') !== -1 || href.indexOf('discord.com/invite') !== -1) {
      window.gtag('event', 'discord_join', { link_url: href });
    } else if (href.indexOf('docs.ghostesp.net') !== -1) {
      window.gtag('event', 'docs_click', { link_url: href });
    }
  });

  const nav = document.getElementById('nav');
  if (nav) {
    nav.innerHTML = components.nav();

    // Keep the GitHub action live on pages that do not include github.js
    // directly (the shared nav is used by every route).
    const hydrateNavStars = () => {
      if (window.GhostStar && typeof window.GhostStar.hydrate === 'function') {
        window.GhostStar.hydrate(nav);
        return;
      }

      if (document.querySelector('script[data-ghoststar-loader]')) return;
      const script = document.createElement('script');
      script.src = '/js/github.js?v=3';
      script.dataset.ghoststarLoader = 'true';
      script.onload = () => {
        if (window.GhostStar && typeof window.GhostStar.hydrate === 'function') {
          window.GhostStar.hydrate();
        }
      };
      document.head.appendChild(script);
    };
    hydrateNavStars();

    const updateNavHeight = () => {
      const navElement = document.querySelector('nav');
      if (!navElement) return;
      const announceBar = document.querySelector('.announce-bar');
      const announceHeight = announceBar ? announceBar.offsetHeight : 0;
      document.documentElement.style.setProperty('--announce-height', `${announceHeight}px`);
      // --nav-height covers the full fixed header stack so content clears both
      document.documentElement.style.setProperty('--nav-height', `${announceHeight + navElement.offsetHeight}px`);
    };

    updateNavHeight();
    window.addEventListener('resize', updateNavHeight);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateNavHeight).catch(() => {});
    }
    
    // initialize mobile menu after nav is rendered
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (menuToggle && navLinks) {
      const setMenuState = (open) => {
        menuToggle.classList.toggle('active', open);
        navLinks.classList.toggle('active', open);
        menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) {
          const firstLink = navLinks.querySelector('a');
          if (firstLink) firstLink.focus();
        } else {
          menuToggle.focus();
        }
      };

      menuToggle.addEventListener('click', () => {
        setMenuState(!navLinks.classList.contains('active'));
      });

      // close menu when clicking links
      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          setMenuState(false);
        });
      });

      // close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
          setMenuState(false);
        }
      });

      // close menu with Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
          setMenuState(false);
        }
      });
    }

    // Dropdowns work with mouse, keyboard, and touch. Keep the ARIA state in
    // sync so the menu is understandable to assistive technology as well.
    const dropdowns = nav.querySelectorAll('.nav-dropdown');
    dropdowns.forEach((dropdown) => {
      const button = dropdown.querySelector('.nav-dropdown-toggle');
      const menu = dropdown.querySelector('.nav-dropdown-menu');
      if (!button || !menu) return;

      const setDropdownState = (open) => {
        dropdown.classList.toggle('open', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = !dropdown.classList.contains('open');
        dropdowns.forEach((other) => {
          if (other !== dropdown) {
            other.classList.remove('open');
            const otherButton = other.querySelector('.nav-dropdown-toggle');
            if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
          }
        });
        setDropdownState(open);
      });

      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setDropdownState(true);
          const firstLink = menu.querySelector('a');
          if (firstLink) firstLink.focus();
        } else if (event.key === 'Escape') {
          setDropdownState(false);
        }
      });

      dropdown.addEventListener('focusout', (event) => {
        if (!dropdown.contains(event.relatedTarget)) setDropdownState(false);
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.nav-dropdown')) {
        dropdowns.forEach((dropdown) => {
          dropdown.classList.remove('open');
          const button = dropdown.querySelector('.nav-dropdown-toggle');
          if (button) button.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }
});
