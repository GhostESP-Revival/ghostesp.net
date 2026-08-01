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
          <img src="images/ghostespdotnet.png" alt="Ghost ESP">
        </a>
        <button class="mobile-menu-toggle" aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <ul class="${navLinksClass}">
          <li class="nav-dropdown">
            <button class="nav-dropdown-toggle" type="button" aria-haspopup="true">Getting Started</button>
            <ul class="nav-dropdown-menu">
              <li><a href="${prefix}#getting-started">Get Started</a></li>
              <li><a href="${prefix}#capabilities">Features</a></li>
              <li><a href="/boards">Boards</a></li>
            </ul>
          </li>
          <li class="nav-dropdown">
            <button class="nav-dropdown-toggle" type="button" aria-haspopup="true">Utilities</button>
            <ul class="nav-dropdown-menu">
              <li><a href="/flasher">Flasher</a></li>
              <li><a href="/serial">Serial</a></li>
              <li><a href="/openwd">WDMap</a></li>
              <li><a href="/companion">Companion App</a></li>
            </ul>
          </li>
          <li class="nav-dropdown">
            <button class="nav-dropdown-toggle" type="button" aria-haspopup="true">Downloads</button>
            <ul class="nav-dropdown-menu">
              <li><a href="/marketplace">Apps</a></li>
              <li><a href="/asset-marketplace">Asset Packs</a></li>
              <li><a href="/scripts-marketplace">Scripts</a></li>
              <li><a href="/asset-pack-builder">Pack Builder</a></li>
              <li><a href="/irdb">IRDB</a></li>
            </ul>
          </li>
          <li class="nav-dropdown">
            <button class="nav-dropdown-toggle" type="button" aria-haspopup="true">Resources</button>
            <ul class="nav-dropdown-menu">
              <li><a href="https://docs.ghostesp.net" target="_blank" rel="noopener">Docs</a></li>
              <li><a href="https://shop.ghostesp.net" target="_blank" rel="noopener">Merch</a></li>
              <li><a href="/blog">Blog</a></li>
              <li><a href="/changelog">Changelog</a></li>
              <li><a href="/showcase">Showcase</a></li>
              <li><a href="/brand-assets">Brand Assets</a></li>
              <li><a href="/brand-guidelines">Brand Guidelines</a></li>
              <li><a href="/feedback">Feedback</a></li>
            </ul>
          </li>
          <li id="nav-star-count"></li>
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
      <a href="/#capabilities" class="announce-bar-link">
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

  // mobile-only sticky conversion CTA (hidden on the flasher itself)
  STICKY_CTA_KEY: 'ghostesp_sticky_cta_dismissed',

  renderStickyCta() {
    try {
      if (localStorage.getItem(this.STICKY_CTA_KEY) === '1') return;
    } catch (e) {}
    if (document.querySelector('.sticky-cta')) return;
    const path = window.location.pathname;
    if (path.endsWith('/flasher') || path.endsWith('flasher.html')) return;

    const bar = document.createElement('div');
    bar.className = 'sticky-cta';
    bar.innerHTML = `
      <a href="/flasher" class="btn btn-primary sticky-cta-btn" data-track="cta_sticky_flash">Flash Now</a>
      <button class="sticky-cta-close" type="button" aria-label="Dismiss">&times;</button>
    `;
    document.body.appendChild(bar);

    bar.querySelector('.sticky-cta-close').addEventListener('click', () => {
      try { localStorage.setItem(this.STICKY_CTA_KEY, '1'); } catch (e) {}
      bar.remove();
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
        ${hasMore ? `<div style="display: flex; justify-content: center;"><button class="btn btn-small btn-show-all" onclick="components.showAllAssets('${containerId}', ${JSON.stringify(release.assets).replace(/"/g, '&quot;')})">Show All Downloads</button></div>` : ''}
      </div>
    `;
  },

  showAllAssets(containerId, allAssets) {
    const container = document.getElementById(`${containerId}-assets`);
    if (container) {
      container.innerHTML = allAssets.map(asset => `
        <a href="${this.escapeHtml(asset.browser_download_url)}" class="asset-link" download>
          <span>${this.escapeHtml(asset.name)}</span>
          <span style="margin-left: auto; opacity: 0.5; font-size: 0.85em">${this.formatSize(asset.size)}</span>
        </a>
      `).join('');
      
      // hide the show all button
      const btn = event.target;
      if (btn) btn.style.display = 'none';
    }
  },

  assetList(assets, id) {
    return `
      <div class="release-assets" id="${id}">
        ${assets.map(asset => `
          <a href="${this.escapeHtml(asset.browser_download_url)}" class="asset-link" download>
            <span>${this.escapeHtml(asset.name)}</span>
            <span style="margin-left: auto; opacity: 0.5; font-size: 0.85em">${this.formatSize(asset.size)}</span>
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
  components.renderStickyCta();

  // engagement analytics — only fires after GA consent, matching the boards.js pattern
  document.addEventListener('click', (e) => {
    if (window.__gaLoaded !== true || typeof window.gtag !== 'function') return;

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
      menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        navLinks.classList.toggle('active');
      });

      // close menu when clicking links
      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          menuToggle.classList.remove('active');
          navLinks.classList.remove('active');
        });
      });

      // close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!menuToggle.contains(e.target) && !navLinks.contains(e.target)) {
          menuToggle.classList.remove('active');
          navLinks.classList.remove('active');
        }
      });
    }
  }
});
