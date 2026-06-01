(function () {
  const apps = [
    {
      id: 'device_inspector',
      name: 'Device Inspector',
      version: '1.0.0',
      authors: ['GhostESP'],
      category: 'System',
      description: 'Comprehensive hardware and API test suite with responsive native UI. Tests WiFi, BLE, GPS, RGB, storage, canvas drawing, input events, and theme inspection.',
      reviewed: 'Approved',
      targets: [
        { target: 'esp32',   file: 'device_inspector-1.0.0-esp32.gapp',   url: 'downloads/apps/device_inspector/v1.0.0/device_inspector-1.0.0-esp32.gapp' },
        { target: 'esp32s2', file: 'device_inspector-1.0.0-esp32s2.gapp', url: 'downloads/apps/device_inspector/v1.0.0/device_inspector-1.0.0-esp32s2.gapp' },
        { target: 'esp32s3', file: 'device_inspector-1.0.0-esp32s3.gapp', url: 'downloads/apps/device_inspector/v1.0.0/device_inspector-1.0.0-esp32s3.gapp' },
        { target: 'esp32c5', file: 'device_inspector-1.0.0-esp32c5.gapp', url: 'downloads/apps/device_inspector/v1.0.0/device_inspector-1.0.0-esp32c5.gapp' },
        { target: 'esp32c6', file: 'device_inspector-1.0.0-esp32c6.gapp', url: 'downloads/apps/device_inspector/v1.0.0/device_inspector-1.0.0-esp32c6.gapp' }
      ]
    },
    {
      id: 'esp32_finder',
      name: 'ESP32 Finder',
      version: '1.0.0',
      authors: ['GhostESP'],
      category: 'Tools',
      description: 'Continuous WiFi OUI scanner with canvas dashboard and RGB blink.',
      reviewed: 'Approved',
      targets: [
        { target: 'esp32',   file: 'esp32_finder-1.0.0-esp32.gapp',   url: 'downloads/apps/esp32_finder/v1.0.0/esp32_finder-1.0.0-esp32.gapp' },
        { target: 'esp32s2', file: 'esp32_finder-1.0.0-esp32s2.gapp', url: 'downloads/apps/esp32_finder/v1.0.0/esp32_finder-1.0.0-esp32s2.gapp' },
        { target: 'esp32s3', file: 'esp32_finder-1.0.0-esp32s3.gapp', url: 'downloads/apps/esp32_finder/v1.0.0/esp32_finder-1.0.0-esp32s3.gapp' },
        { target: 'esp32c5', file: 'esp32_finder-1.0.0-esp32c5.gapp', url: 'downloads/apps/esp32_finder/v1.0.0/esp32_finder-1.0.0-esp32c5.gapp' },
        { target: 'esp32c6', file: 'esp32_finder-1.0.0-esp32c6.gapp', url: 'downloads/apps/esp32_finder/v1.0.0/esp32_finder-1.0.0-esp32c6.gapp' }
      ]
    }
  ];

  const state = {
    query: '',
    target: '',
    expanded: new Set()
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function appMatches(app) {
    if (state.target && !app.targets.some((pkg) => pkg.target === state.target)) return false;
    if (!state.query) return true;

    const haystack = [
      app.id,
      app.name,
      app.version,
      ...app.authors,
      app.category,
      app.description,
      ...app.targets.map((pkg) => pkg.target)
    ].join(' ').toLowerCase();

    return haystack.includes(state.query);
  }

  function renderTargets() {
    const select = document.getElementById('market-target');
    if (!select) return;

    const targets = [...new Set(apps.flatMap((app) => app.targets.map((pkg) => pkg.target)))].sort();
    select.innerHTML = '<option value="">All targets</option>' + targets.map((target) => (
      `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`
    )).join('');
  }

  function renderDownloads(app) {
    const targets = state.target ? app.targets.filter((pkg) => pkg.target === state.target) : app.targets;
    const isExpanded = state.expanded.has(app.id);
    const label = targets.length === 1 ? `Download ${targets[0].target}` : `Download (${targets.length} targets)`;

    return `<button class="market-download-toggle" type="button" data-download-toggle="${escapeHtml(app.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
      ${escapeHtml(isExpanded ? 'Hide downloads' : label)}
    </button>
    ${isExpanded ? `<div class="market-download-targets">
      ${targets.map((pkg) => `<a class="market-download" href="${escapeHtml(pkg.url)}" download>
        <span>${escapeHtml(pkg.file)}</span>
        <span>${escapeHtml(pkg.target)}</span>
      </a>`).join('')}
    </div>` : ''}`;
  }

  function renderApp(app) {
    const authors = Array.isArray(app.authors) && app.authors.length ? app.authors : ['Unknown'];

    return `<article class="market-app-card">
      <div class="market-app-head">
        <div>
          <h3 class="market-app-title">${escapeHtml(app.name)}</h3>
          <div class="market-app-id">${escapeHtml(app.id)} v${escapeHtml(app.version)}</div>
          <div class="market-app-authors"><span>Authors:</span> ${escapeHtml(authors.join(', '))}</div>
        </div>
        <span class="market-reviewed">${escapeHtml(app.reviewed)}</span>
      </div>
      <p class="market-app-description">${escapeHtml(app.description)}</p>
      <div class="market-chip-row">
        <span class="market-chip">${escapeHtml(app.category)}</span>
        ${app.targets.map((pkg) => `<span class="market-chip">${escapeHtml(pkg.target)}</span>`).join('')}
      </div>
      <div class="market-downloads">${renderDownloads(app)}</div>
    </article>`;
  }

  function render() {
    const grid = document.getElementById('market-grid');
    const meta = document.getElementById('market-meta');
    if (!grid || !meta) return;

    const visibleApps = apps.filter(appMatches);
    meta.textContent = `${visibleApps.length} beta app${visibleApps.length === 1 ? '' : 's'} available`;

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
        const button = event.target.closest('[data-download-toggle]');
        if (!button) return;

        const appId = button.getAttribute('data-download-toggle');
        if (state.expanded.has(appId)) {
          state.expanded.delete(appId);
        } else {
          state.expanded.add(appId);
        }
        render();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderTargets();
    bindFilters();
    render();
  });
})();
