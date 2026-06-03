(function () {
  const assetPacks = [
    {
      id: 'dedsec',
      name: 'DedSec',
      version: '1',
      authors: ['GhostESP'],
      category: 'Theme',
      type: 'GTheme',
      description: 'Dark DedSec-inspired GhostESP theme with purple accents, skull app icons, and a full-screen menu background.',
      reviewed: 'Approved',
      contents: ['Icons', 'Background', 'Colors'],
      preview: 'downloads/assets/dedsec/screenshot.png',
      file: 'dedsec.gtheme',
      size: '488.6 KB',
      url: 'downloads/assets/dedsec/dist/dedsec.gtheme'
    }
  ];

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
        <span class="market-reviewed">${escapeHtml(pack.reviewed || 'Approved')}</span>
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

    meta.textContent = `${assetPacks.length} asset pack${assetPacks.length === 1 ? '' : 's'} available`;

    if (!assetPacks.length) {
      grid.innerHTML = '<div class="market-empty">No asset packs are available yet.</div>';
      return;
    }

    grid.innerHTML = assetPacks.map(renderPack).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
  });
})();
