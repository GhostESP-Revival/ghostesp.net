// irdb.js — Infrared Remote Database, embedded in the GhostESP Dashboard.
// Renders into #irdbRoot. Browse/search works without a connection; "Send to
// device" reuses the dashboard's open console connection when available.
(function () {
  const DB_URL = 'flipper_irdb_database.json';
  const REPO_URL = 'https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/';
  const REMOTES_DIR = '/mnt/ghostesp/infrared/remotes';

  let database = [];
  let currentPage = 1;
  let itemsPerPage = 20;
  let currentResults = [];
  let debounceTimer;
  let root = null;
  let els = {};

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function buildShell() {
    root = document.getElementById('irdbRoot');
    if (!root) return false;

    const placeholder = document.getElementById('irdb-placeholder');
    if (placeholder) placeholder.remove();

    root.innerHTML = `
      <div class="irdb-tab-header">
        <h1><i class="bi bi-broadcast"></i> IRDB</h1>
        <p class="header-description">Search, download, and send infrared remote files to your GhostESP device.</p>
      </div>
      <div class="irdb-main">
        <div class="search-section">
          <div class="search-bar">
            <input type="text" id="irdb-search" placeholder="Search by brand, model, or device type...">
            <button id="irdb-search-btn" aria-label="Search"><i class="bi bi-search"></i></button>
          </div>
          <div class="filters">
            <select id="irdb-type" aria-label="Filter by device type"><option value="">All Types</option></select>
            <select id="irdb-brand" aria-label="Filter by brand"><option value="">All Brands</option></select>
            <select id="irdb-page-size" aria-label="Results per page">
              <option value="10">10 / page</option>
              <option value="20" selected>20 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
          <div id="irdb-stats" class="stats"></div>
          <div id="irdb-updated" class="last-updated"></div>
        </div>
        <div id="irdb-loading" class="loading"><div class="spinner"></div><p>Loading database...</p></div>
        <div id="irdb-results" class="results"></div>
        <div id="irdb-pagination" class="pagination">
          <button id="irdb-prev" class="page-nav" aria-label="Previous page"><i class="bi bi-chevron-left"></i></button>
          <span id="irdb-current"></span>
          <button id="irdb-next" class="page-nav" aria-label="Next page"><i class="bi bi-chevron-right"></i></button>
        </div>
      </div>
      <div class="irdb-footer">
        Data from <a href="https://github.com/Lucaslhm/Flipper-IRDB" target="_blank" rel="noopener">Flipper-IRDB</a>
      </div>`;

    els = {
      search: root.querySelector('#irdb-search'),
      searchBtn: root.querySelector('#irdb-search-btn'),
      type: root.querySelector('#irdb-type'),
      brand: root.querySelector('#irdb-brand'),
      pageSize: root.querySelector('#irdb-page-size'),
      stats: root.querySelector('#irdb-stats'),
      updated: root.querySelector('#irdb-updated'),
      loading: root.querySelector('#irdb-loading'),
      results: root.querySelector('#irdb-results'),
      pagination: root.querySelector('#irdb-pagination'),
      prev: root.querySelector('#irdb-prev'),
      next: root.querySelector('#irdb-next'),
      current: root.querySelector('#irdb-current')
    };

    if (els.search) els.search.addEventListener('input', debounceSearch);
    if (els.searchBtn) els.searchBtn.addEventListener('click', instantSearch);
    if (els.type) els.type.addEventListener('change', instantSearch);
    if (els.brand) els.brand.addEventListener('change', instantSearch);
    if (els.pageSize) els.pageSize.addEventListener('change', () => {
      itemsPerPage = parseInt(els.pageSize.value, 10) || 20;
      currentPage = 1;
      displayResults();
    });
    return true;
  }

  function debounceSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(instantSearch, 300);
  }

  function instantSearch() {
    searchDatabase();
  }

  async function loadDatabase() {
    if (els.loading) els.loading.style.display = 'flex';
    try {
      const dbResponse = await fetch(DB_URL);
      if (!dbResponse.ok) throw new Error(`DB fetch failed (HTTP ${dbResponse.status})`);
      const data = await dbResponse.json();
      database = data;

      // Best-effort "last updated" — never block the database on this.
      try {
        const commitsResponse = await fetch('https://api.github.com/repos/Lucaslhm/Flipper-IRDB/commits?path=&per_page=1');
        if (commitsResponse.ok) {
          const commits = await commitsResponse.json();
          const lastCommit = commits && commits[0] && commits[0].commit && commits[0].commit.committer && commits[0].commit.committer.date;
          if (lastCommit && els.updated) {
            const lastUpdated = new Date(lastCommit);
            els.updated.innerHTML = `<span class="update-badge"><i class="bi bi-arrow-repeat"></i> Last updated: ${lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`;
          }
        }
      } catch (e) {}

      if (els.loading) els.loading.style.display = 'none';
      populateFilters();
      searchDatabase();
    } catch (error) {
      console.error('IRDB load error:', error);
      if (els.loading) els.loading.style.display = 'none';
      if (els.results) els.results.innerHTML = `<p class="error">Error loading the IR database (${error.message || 'unknown'}). Please try again later.</p>`;
    }
  }

  function populateSelect(select, options) {
    if (!select) return;
    const defaultText = select === els.type ? 'All Types' : 'All Brands';
    select.innerHTML = `<option value="">${defaultText}</option>`;
    Array.from(options).forEach(function (option) {
      if (option) {
        const el = document.createElement('option');
        el.value = option;
        el.textContent = option;
        select.appendChild(el);
      }
    });
  }

  function populateFilters() {
    const deviceTypes = new Set(database.map((item) => item.device_type));
    const brands = new Set(database.map((item) => {
      if (!item.brand || item.brand.trim() === '' || ['unknown', 'n/a', 'none'].includes(item.brand.toLowerCase()) ||
        item.brand.includes('/') || item.brand.includes('\\') || item.brand.length < 2 ||
        /^[0-9.]+$/.test(item.brand) || item.brand.includes('.ir')) return null;
      let brand = item.brand.trim();
      brand = brand.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      brand = brand.replace(/\.(txt|ir|json)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      return brand;
    }).filter(Boolean));

    populateSelect(els.type, deviceTypes);
    populateSelect(els.brand, Array.from(brands).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  }

  function searchDatabase() {
    if (!els.search || !els.type || !els.brand) return;
    const searchTerms = els.search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const deviceType = els.type.value;
    const brand = els.brand.value;

    currentResults = database.filter((item) => {
      const itemString = `${item.brand} ${item.model} ${item.device_type} ${item.additional_info || ''}`.toLowerCase();
      return searchTerms.every((term) => itemString.includes(term)) &&
        (deviceType === '' || item.device_type === deviceType) &&
        (brand === '' || item.brand === brand);
    });
    currentPage = 1;
    displayResults();
    updateStats(currentResults.length);
  }

  async function sendToDevice(item, downloadUrl, button, status) {
    const SC = window.SerialCore;
    if (!SC || !SC.supported()) {
      status.textContent = 'Web Serial not supported — use Chrome, Edge, or Opera.';
      status.className = 'send-status error';
      return;
    }
    let session = null;
    let own = false;
    try {
      if (window.serialConsole && window.serialConsole.isConnected) {
        const sc = window.serialConsole;
        session = {
          link: {
            sendCommand: (cmd, markers, timeoutMs) =>
              sc.requestCommandResponse(cmd, markers, timeoutMs || 15000).then((t) => ({
                text: t,
                matched: (Array.isArray(markers) ? markers : [markers]).some((m) => t.includes(m)),
                garbled: false,
                closed: false
              }))
          }
        };
      } else {
        session = await SC.connect(() => {});
        own = true;
      }

      status.textContent = 'Downloading IR file...';
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Failed to download file');
      const text = await response.text();
      const bytes = new TextEncoder().encode(text);

      status.textContent = 'Preparing infrared folder...';
      await SC.ensureDir(session.link, REMOTES_DIR);

      status.textContent = 'Sending to device...';
      await SC.uploadFile(session.link, REMOTES_DIR, item.filename, bytes, () => {});

      status.textContent = 'Successfully sent to device!';
      status.className = 'send-status success';
      setTimeout(() => {
        status.style.display = 'none';
        button.classList.remove('sending');
        button.disabled = false;
      }, 3000);
    } catch (error) {
      console.error('IR send error:', error);
      status.textContent = `Error: ${error.message || 'failed'}`;
      status.className = 'send-status error';
      button.classList.remove('sending');
      button.disabled = false;
    } finally {
      if (own) SC.closeSession(session);
    }
  }

  function displayResults() {
    if (!els.results) return;
    els.results.innerHTML = '';

    if (currentResults.length === 0) {
      els.results.innerHTML = '<p class="no-results">No results found.</p>';
      updatePagination(0);
      return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageResults = currentResults.slice(startIndex, startIndex + itemsPerPage);

    pageResults.forEach((item) => {
      const downloadUrl = REPO_URL + String(item.path).replace(/\\/g, '/');
      const itemEl = document.createElement('div');
      itemEl.className = 'result-item';

      let additionalInfoHtml = '';
      if (item.additional_info) {
        if (item.additional_info.length > 50) {
          additionalInfoHtml = `<p><strong>Info:</strong> <span class="info-text">${esc(item.additional_info.substring(0, 50))}<span class="more-text" style="display:none">${esc(item.additional_info.substring(50))}</span></span> <button class="read-more">Read More</button></p>`;
        } else {
          additionalInfoHtml = `<p><strong>Info:</strong> ${esc(item.additional_info)}</p>`;
        }
      }

      itemEl.innerHTML = `
        <h3>${esc(item.brand)} ${esc(item.model)}</h3>
        <div class="content-wrapper">
          <p><strong>Type:</strong> ${esc(item.device_type)}</p>
          <p><strong>File:</strong> ${esc(item.filename)}</p>
          ${additionalInfoHtml}
        </div>
        <div class="button-group">
          <button class="download-button"><i class="bi bi-download"></i> Download</button>
          <button class="send-button"><i class="bi bi-send"></i> Send to Device</button>
        </div>
        <div class="send-status" style="display: none;"></div>`;

      const downloadButton = itemEl.querySelector('.download-button');
      downloadButton.addEventListener('click', () => downloadFile(downloadUrl, item.filename));

      const sendButton = itemEl.querySelector('.send-button');
      const sendStatus = itemEl.querySelector('.send-status');
      sendButton.addEventListener('click', async () => {
        sendButton.disabled = true;
        sendButton.classList.add('sending');
        sendStatus.style.display = 'block';
        sendStatus.textContent = 'Connecting to device...';
        sendStatus.className = 'send-status';
        await sendToDevice(item, downloadUrl, sendButton, sendStatus);
      });

      const readMoreButton = itemEl.querySelector('.read-more');
      if (readMoreButton) {
        readMoreButton.addEventListener('click', function () {
          const moreText = this.parentNode.querySelector('.more-text');
          if (moreText.style.display === 'none') { moreText.style.display = 'inline'; this.textContent = 'Read Less'; }
          else { moreText.style.display = 'none'; this.textContent = 'Read More'; }
        });
      }

      els.results.appendChild(itemEl);
    });

    updatePagination(currentResults.length);
  }

  function updatePagination(totalResults) {
    if (!els.pagination || !els.prev || !els.next || !els.current) return;
    const totalPages = Math.ceil(totalResults / itemsPerPage);
    if (totalPages <= 1) { els.pagination.style.display = 'none'; return; }
    els.pagination.style.display = 'flex';
    els.current.textContent = `Page ${currentPage} of ${totalPages}`;
    els.prev.disabled = currentPage === 1;
    els.next.disabled = currentPage === totalPages;
    els.prev.onclick = () => { if (currentPage > 1) { currentPage--; displayResults(); } };
    els.next.onclick = () => { if (currentPage < totalPages) { currentPage++; displayResults(); } };
  }

  function updateStats(resultCount) {
    if (!els.stats) return;
    els.stats.innerHTML = `<span class="stat-item"><strong>${resultCount.toLocaleString()}</strong> results found</span><span class="stat-item"><strong>${database.length.toLocaleString()}</strong> total IR files</span>`;
  }

  function downloadFile(url, filename) {
    fetch(url)
      .then((response) => { if (!response.ok) throw new Error('Network error'); return response.blob(); })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(blobUrl); document.body.removeChild(a); }, 100);
      })
      .catch(() => alert('Download failed. Please try again.'));
  }

  async function boot() {
    if (!buildShell()) return;
    await loadDatabase();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();