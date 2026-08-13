(function () {
  const APPS_CATALOG_URL = 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Apps/main/catalog.json';
  const APP_MANIFEST_BASE_URL = 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Apps/main/apps';
  const ASSETS_CATALOG_URL = 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Assets/main/catalog.json';
  const CACHE_KEY = 'ghostesp-apps-catalog-v2';

  let apps = [];

  const state = {
    query: '',
    target: '',
    expanded: new Set(),
    loading: true,
    error: null
  };

  async function fetchCatalog() {
    const cached = sessionStorage.getItem(CACHE_KEY);
    try {
      const url = `${APPS_CATALOG_URL}?t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load catalog');
      const catalog = await response.json();
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: catalog }));
      return catalog;
    } catch (error) {
      if (cached) {
        try {
          return JSON.parse(cached).data;
        } catch (e) {}
      }
      throw error;
    }
  }

  const escapeHtml = components.escapeHtml.bind(components);

  function appMatches(app) {
    if (state.target && !app.targets.some((t) => t === state.target)) return false;
    if (!state.query) return true;

    const haystack = [
      app.id,
      app.name,
      app.version,
      ...(app.authors || []),
      app.category,
      app.description,
      ...(app.targets || [])
    ].join(' ').toLowerCase();

    return haystack.includes(state.query);
  }

  function renderTargets() {
    const select = document.getElementById('market-target');
    if (!select) return;

    const targets = [...new Set(apps.flatMap((app) => app.targets || []))].sort();
    select.innerHTML = '<option value="">All targets</option>' + targets.map((target) => (
      `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`
    )).join('');
  }

  function renderDownloads(app) {
    const targets = state.target ? (app.targets || []).filter((t) => t === state.target) : (app.targets || []);
    const isExpanded = state.expanded.has(app.id);
    const label = targets.length === 1 ? `Download ${targets[0]}` : `Download (${targets.length} targets)`;

    const downloads = app.downloads || {};
    const canInstall = window.MarketplaceInstall && window.MarketplaceInstall.supported && Object.keys(downloads).length > 0;

    return `<button class="market-download-toggle" type="button" data-download-toggle="${escapeHtml(app.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
      ${escapeHtml(isExpanded ? 'Hide downloads' : label)}
    </button>
    ${isExpanded ? `<div class="market-download-targets">
      ${targets.map((target) => {
        const url = downloads[target] || '#';
        const filename = url.split('/').pop();
        return `<a class="market-download" href="${escapeHtml(url)}" download>
          <span>${escapeHtml(filename)}</span>
          <span>${escapeHtml(target)}</span>
        </a>`;
      }).join('')}
    </div>` : ''}
    ${canInstall ? `<button class="market-install-btn" type="button" data-install="${escapeHtml(app.id)}" ${window.MarketplaceInstall.isBusy() ? 'disabled' : ''}>
      Install to device
    </button>` : ''}
    ${canInstall ? `<p class="market-install-status" data-install-status="${escapeHtml(app.id)}"></p>` : ''}`;
  }

  function getSourceUrl(app) {
    if (!app.source_repo) return '';

    const repository = app.source_repo.replace(/\.git\/?$/, '').replace(/\/$/, '');
    const branch = app.source_branch || 'main';
    const subdir = app.source_subdir ? `/${app.source_subdir.replace(/^\/+/, '')}` : '';
    return `${repository}/tree/${branch}${subdir}`;
  }

  function getIconUrl(app) {
    if (!app.icon) return '';

    if (/^https?:\/\//.test(app.icon)) return app.icon;

    return `https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Apps/main/apps/${encodeURIComponent(app.id)}/${encodeURIComponent(app.icon)}`;
  }

  function renderApp(app) {
    const authors = Array.isArray(app.authors) && app.authors.length ? app.authors : ['Unknown'];
    const sourceUrl = getSourceUrl(app);
    const inputs = Array.isArray(app.inputs) && app.inputs.length ? app.inputs : [];
    const iconUrl = getIconUrl(app);
    const screenshots = Array.isArray(app.screenshots)
      ? app.screenshots.filter((item) => item && typeof item.url === 'string' && item.url.trim())
      : (typeof app.preview === 'string' && app.preview.trim()
          ? [{ url: app.preview.trim(), alt: `${app.name} screenshot` }]
          : []);

    return `<article class="market-app-card">
      ${screenshots.length ? `<div class="market-app-screenshots" aria-label="${escapeHtml(app.name)} screenshots">
        ${screenshots.map((item) => {
          const alt = item.alt || item.caption || `${app.name} screenshot`;
          return `<figure class="market-app-screenshot">
          <img src="${escapeHtml(item.url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
          <button class="market-screenshot-eyebtn" type="button" data-eyebtn aria-expanded="false" title="Show screenshot description">
            <i class="bi bi-eye" aria-hidden="true"></i><span>Alt text</span>
          </button>
          <figcaption class="market-screenshot-caption" hidden>${escapeHtml(alt)}</figcaption>
        </figure>`;
        }).join('')}
      </div>` : ''}
      <div class="market-app-head">
        ${iconUrl ? `<img class="market-app-icon" src="${escapeHtml(iconUrl)}" alt="" loading="lazy">` : ''}
        <div>
          <h3 class="market-app-title">${escapeHtml(app.name)}</h3>
          <div class="market-app-id">${escapeHtml(app.id)} v${escapeHtml(app.version)}</div>
          <div class="market-app-authors"><span>Authors:</span> ${escapeHtml(authors.join(', '))}</div>
        </div>
      </div>
      <p class="market-app-description">${escapeHtml(app.description)}</p>
      <div class="market-chip-row">
        <span class="market-chip">${escapeHtml(app.category)}</span>
        ${(app.targets || []).map((t) => `<span class="market-chip">${escapeHtml(t)}</span>`).join('')}
      </div>
      ${inputs.length ? `<div class="market-input-row">
        <span class="market-input-label">Inputs:</span>
        ${inputs.map((input) => `<span class="market-chip">${escapeHtml(input)}</span>`).join('')}
      </div>` : ''}
      <div class="market-downloads">${renderDownloads(app)}</div>
      ${sourceUrl ? `<a class="market-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">View source code</a>` : ''}
    </article>`;
  }

  async function addSourceDetails() {
    const manifests = await Promise.all(apps.map(async (app) => {
      if (!app.id || (app.source_repo && app.inputs && app.icon)) return app;

      try {
        const response = await fetch(`${APP_MANIFEST_BASE_URL}/${encodeURIComponent(app.id)}/manifest.json`);
        if (!response.ok) return app;

        const manifest = await response.json();
        return {
          ...app,
          source_repo: manifest.source_repo,
          source_branch: manifest.source_branch,
          source_subdir: manifest.source_subdir,
          inputs: Array.isArray(manifest.inputs) ? manifest.inputs : app.inputs,
          icon: manifest.icon || app.icon || ''
        };
      } catch (error) {
        return app;
      }
    }));

    apps = manifests;
  }

  function render() {
    const grid = document.getElementById('market-grid');
    const meta = document.getElementById('market-meta');
    if (!grid || !meta) return;

    if (state.loading) {
      grid.innerHTML = '<div class="market-empty">Loading apps...</div>';
      meta.textContent = '';
      return;
    }

    if (state.error) {
      grid.innerHTML = `<div class="market-empty">${escapeHtml(state.error)}</div>`;
      meta.textContent = '';
      return;
    }

    const visibleApps = apps.filter(appMatches);
    meta.textContent = `${visibleApps.length} app${visibleApps.length === 1 ? '' : 's'} available`;

    if (!visibleApps.length) {
      grid.innerHTML = '<div class="market-empty">No apps match this filter yet.</div>';
      return;
    }

    grid.innerHTML = visibleApps.map(renderApp).join('');
  }

  function bindFilters() {
    const search = document.getElementById('market-search');
    const target = document.getElementById('market-target');
    const grid = document.getElementById('market-grid');

    if (search) {
      search.addEventListener('input', () => {
        state.query = search.value.trim().toLowerCase();
        render();
      });
    }

    if (target) {
      target.addEventListener('change', () => {
        state.target = target.value;
        render();
      });
    }

    if (grid) {
      grid.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-download-toggle]');
        if (toggle) {
          const appId = toggle.getAttribute('data-download-toggle');
          if (state.expanded.has(appId)) {
            state.expanded.delete(appId);
          } else {
            state.expanded.add(appId);
          }
          render();
          return;
        }

        const eye = event.target.closest('[data-eyebtn]');
        if (eye) {
          const figure = eye.closest('figure');
          const caption = figure && figure.querySelector('.market-screenshot-caption');
          const icon = eye.querySelector('i');
          if (caption) {
            const hidden = caption.hidden;
            caption.hidden = !hidden;
            eye.setAttribute('aria-expanded', String(!hidden));
            if (icon) {
              icon.classList.toggle('bi-eye', hidden);
              icon.classList.toggle('bi-eye-slash', !hidden);
            }
          }
          return;
        }

        const install = event.target.closest('[data-install]');
        if (install && window.MarketplaceInstall) {
          const appId = install.getAttribute('data-install');
          window.MarketplaceInstall.install(appId);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindFilters();
    render();

    if (window.MarketplaceInstall) {
      window.MarketplaceInstall.setAppResolver((appId) => apps.find((app) => app.id === appId));
    }

    try {
      const catalog = await fetchCatalog();
      apps = catalog.apps || [];
      await addSourceDetails();
      renderTargets();
    } catch (err) {
      state.error = 'Failed to load apps. Please try again later.';
      console.error('Catalog fetch error:', err);
    } finally {
      state.loading = false;
      render();
    }
  });
})();
