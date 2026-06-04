(function () {
  const ASSETS_CATALOG_URL = 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-AssetPacks/main/catalog.json';
  const CACHE_KEY = 'ghostesp-assets-catalog';
  const CACHE_TTL = 5 * 60 * 1000;

  let assetPacks = [];

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

    const response = await fetch(ASSETS_CATALOG_URL);
    if (!response.ok) throw new Error('Failed to load catalog');
    const catalog = await response.json();

    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data: catalog,
      timestamp: Date.now()
    }));

    return catalog;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderPack(pack) {
    const authors = Array.isArray(pack.authors) && pack.authors.length ? pack.authors : ['Unknown'];

    return `<article class="market-app-card">
      ${pack.preview ? `<div class="market-pack-preview"><img src="${escapeHtml(pack.preview)}" alt="${escapeHtml(pack.name)} preview" loading="lazy"></div>` : ''}
      <div class="market-app-head">
        <div>
          <h3 class="market-app-title">${escapeHtml(pack.name)}</h3>
          <div class="market-app-id">${escapeHtml(pack.id)} v${escapeHtml(pack.version)}</div>
          <div class="market-app-authors"><span>Authors:</span> ${escapeHtml(authors.join(', '))}</div>
        </div>
        <span class="market-reviewed">${escapeHtml(pack.reviewed ? 'Approved' : 'Pending')}</span>
      </div>
      <p class="market-app-description">${escapeHtml(pack.description)}</p>
      <div class="market-downloads">
        <a class="market-download" href="${escapeHtml(pack.url)}" download>
          <span>${escapeHtml(pack.file || 'Download pack')}</span>
          <span>${escapeHtml(pack.size || '')}</span>
        </a>
      </div>
    </article>`;
  }

  function render() {
    const grid = document.getElementById('asset-market-grid');
    const meta = document.getElementById('asset-market-meta');
    if (!grid || !meta) return;

    if (state.loading) {
      grid.innerHTML = '<div class="market-empty">Loading asset packs...</div>';
      meta.textContent = '';
      return;
    }

    if (state.error) {
      grid.innerHTML = `<div class="market-empty">${escapeHtml(state.error)}</div>`;
      meta.textContent = '';
      return;
    }

    meta.textContent = `${assetPacks.length} asset pack${assetPacks.length === 1 ? '' : 's'} available`;

    if (!assetPacks.length) {
      grid.innerHTML = '<div class="market-empty">No asset packs are available yet.</div>';
      return;
    }

    grid.innerHTML = assetPacks.map(renderPack).join('');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    render();

    try {
      const catalog = await fetchCatalog();
      assetPacks = (catalog.assets || []).filter((asset) => asset.reviewed);
    } catch (err) {
      state.error = 'Failed to load asset packs. Please try again later.';
      console.error('Catalog fetch error:', err);
    } finally {
      state.loading = false;
      render();
    }
  });
})();
