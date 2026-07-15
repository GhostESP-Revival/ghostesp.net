(function () {
  const SCRIPTS_CATALOG_URL = 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Scripts/main/catalog.json';
  const CACHE_KEY = 'ghostesp-scripts-catalog';
  const CACHE_TTL = 5 * 60 * 1000;

  let scripts = [];

  const state = {
    loading: true,
    error: null
  };

  async function fetchCatalog() {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) return data;
      } catch (e) {}
    }

    const response = await fetch(SCRIPTS_CATALOG_URL);
    if (!response.ok) throw new Error('Failed to load catalog');
    const catalog = await response.json();

    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data: catalog,
      timestamp: Date.now()
    }));

    return catalog;
  }

  const escapeHtml = components.escapeHtml.bind(components);

  function renderScript(script) {
    const authors = Array.isArray(script.authors) && script.authors.length ? script.authors : ['Unknown'];
    const permissions = Array.isArray(script.permissions) ? script.permissions : [];

    return `<article class="market-app-card">
      <div class="market-app-head">
        <div>
          <h3 class="market-app-title">${escapeHtml(script.name)}</h3>
          <div class="market-app-id">${escapeHtml(script.id)} v${escapeHtml(script.version)}</div>
          <div class="market-app-authors"><span>Authors:</span> ${escapeHtml(authors.join(', '))}</div>
        </div>
        <span class="market-reviewed">${escapeHtml(script.reviewed ? 'Approved' : 'Pending')}</span>
      </div>
      <p class="market-app-description">${escapeHtml(script.description)}</p>
      ${permissions.length ? `<div class="market-chips">${permissions.map(p => `<span class="market-chip market-chip--perm">${escapeHtml(p)}</span>`).join('')}</div>` : ''}
      <div class="market-downloads">
        <a class="market-download" href="${escapeHtml(script.download)}" download>
          <span>${escapeHtml(script.id + '-' + script.version + '.gsb')}</span>
          <span>${escapeHtml(script.category || '')}</span>
        </a>
      </div>
    </article>`;
  }

  function render() {
    const grid = document.getElementById('scripts-market-grid');
    const meta = document.getElementById('scripts-market-meta');
    if (!grid || !meta) return;

    if (state.loading) {
      grid.innerHTML = '<div class="market-empty">Loading scripts...</div>';
      meta.textContent = '';
      return;
    }

    if (state.error) {
      grid.innerHTML = `<div class="market-empty">${escapeHtml(state.error)}</div>`;
      meta.textContent = '';
      return;
    }

    meta.textContent = `${scripts.length} script${scripts.length === 1 ? '' : 's'} available`;

    if (!scripts.length) {
      grid.innerHTML = '<div class="market-empty">No scripts are available yet.</div>';
      return;
    }

    grid.innerHTML = scripts.map(renderScript).join('');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    render();

    try {
      const catalog = await fetchCatalog();
      scripts = (catalog.scripts || []).filter((s) => s.reviewed);
    } catch (err) {
      state.error = 'Failed to load scripts. Please try again later.';
      console.error('Catalog fetch error:', err);
    } finally {
      state.loading = false;
      render();
    }
  });
})();
