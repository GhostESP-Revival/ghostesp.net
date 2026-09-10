// store.js — GhostESP Store (apps + asset packs + scripts).
// Runs standalone at /marketplace OR embedded inside the Serial Console
// page (dashboard.html #storeRoot). When embedded, installs reuse the console's
// already-open Web Serial connection; standalone it manages its own.
(function () {
  const CATALOGS = {
    apps: {
      url: 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Apps/main/catalog.json',
      cacheKey: 'ghostesp-store-apps-v3',
      items: (c) => c.apps || [],
      reviewedOnly: false
    },
    assets: {
      url: 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-AssetPacks/main/catalog.json',
      cacheKey: 'ghostesp-store-assets-v2',
      items: (c) => c.assets || [],
      reviewedOnly: true
    },
    scripts: {
      url: 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Scripts/main/catalog.json',
      cacheKey: 'ghostesp-store-scripts-v2',
      items: (c) => c.scripts || [],
      reviewedOnly: true
    }
  };

  const TAB_ICONS = { apps: 'bi-grid', assets: 'bi-palette', scripts: 'bi-file-code' };

  // Per-app catalog manifests (apps/<id>/manifest.json) are the source of
  // truth for source_repo / source_branch / source_subdir. The aggregated
  // catalog.json strips those fields, so enrich from here at runtime.
  const APPS_MANIFEST_BASE = 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Apps/main/apps';
  const APPS_CATALOG_DIR_BASE = 'https://github.com/GhostESP-Revival/GhostESP-Apps/tree/main/apps';
  const ORG_URL = 'https://github.com/GhostESP-Revival';
  const APP_SOURCE_CACHE_KEY = 'ghostesp-store-app-sources-v1';

  const TARGET_LABELS = {
    esp32: 'ESP32',
    esp32s2: 'ESP32-S2',
    esp32s3: 'ESP32-S3',
    esp32c3: 'ESP32-C3',
    esp32c5: 'ESP32-C5',
    esp32c6: 'ESP32-C6',
    esp32p4: 'ESP32-P4'
  };

  const proxyBase = () => {
    const path = '/.netlify/functions/app-proxy';
    if (location.protocol.startsWith('http')) return `${location.origin}${path}`;
    return `https://ghostesp.net${path}`;
  };

  const state = {
    tab: 'apps',
    query: '',
    target: '',
    expanded: new Set(),
    details: new Set(),
    busy: false,
    session: null, // only used standalone
    catalogs: { apps: [], assets: [], scripts: [] },
    error: null,
    installedApps: {}, // app id -> { version }
    installedCount: 0,
    updateCount: 0,
    showAllApps: false,
    chipKey: '',
    view: 'grid',
    sort: 'recent',
    category: '',
    dates: {},            // download url -> publish timestamp (ms)
    datesAttempted: new Set(), // urls we have already asked the proxy about
    datesPending: new Set(),
    datesError: false
  };

  const VIEW_KEY = 'ghostesp-store-view';
  const SORT_KEY = 'ghostesp-store-sort';
  const NOTICE_KEY = 'ghostesp-store-notice-dismissed';
  const DATES_KEY = 'ghostesp-store-dates-v1';
  const SORTS = ['recent', 'name'];

  // Prefs are purely cosmetic, so a storage failure (private mode, disabled
  // storage) falls back to defaults instead of breaking boot.
  function readPref(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function writePref(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  let root = null;
  let els = {};
  let isEmbedded = false;
  let tabsHost = null;

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function normalizeChip(model) {
    const lower = String(model || '').toLowerCase().replace(/\s+/g, '');
    if (lower === 'esp32') return 'esp32';
    if (lower.startsWith('esp32') && lower.includes('-')) return lower.replace(/-/g, '');
    return lower;
  }

  function targetLabel(target) {
    const normalized = normalizeChip(target);
    return TARGET_LABELS[normalized] || String(target || '').toUpperCase();
  }

  // The chip of the currently connected device, when known: { chip, label } or null.
  function connectedChip() {
    if (isEmbedded) {
      const sc = window.serialConsole;
      const info = sc && sc.chipInfo;
      if (info && info.model) {
        return { chip: normalizeChip(info.model), label: info.model };
      }
      return null;
    }
    const s = state.session;
    if (s && s.model) return { chip: normalizeChip(s.model), label: s.model };
    return null;
  }

  // Compatibility: S3-family chips can run plain-ESP32 apps and vice versa.
  function targetMatches(normalizedTarget, chip) {
    if (normalizedTarget === chip) return true;
    if (normalizedTarget === 'esp32' && chip.startsWith('esp32')) return true;
    if (chip === 'esp32' && normalizedTarget.startsWith('esp32')) return true;
    return false;
  }

  function versionFromName(name) {
    if (!name) return null;
    const base = String(name).replace(/\.gapp$/i, '');
    const m = base.match(/(?:^|[-_ ])v?(\d+(?:\.\d+){1,3})$/i);
    if (m) return m[1];
    const alt = base.match(/(?:^|[-_ ])v?(\d+(?:\.\d+)+)/i);
    return alt ? alt[1] : null;
  }

  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  // A small serial "talker" for the connected device: the dashboard console
  // connection when embedded, or the standalone session on /marketplace.
  function serialTalk() {
    if (isEmbedded) {
      const sc = window.serialConsole;
      if (sc && sc.isConnected && sc.port && typeof sc.requestCommandResponse === 'function') {
        return { send: (cmd, markers, timeout) => sc.requestCommandResponse(cmd, markers, timeout || 5000) };
      }
      return null;
    }
    const s = state.session;
    if (s && s.link && !s.link.closed && typeof s.link.sendCommand === 'function') {
      return {
        send: async (cmd, markers, timeout) => {
          const res = await s.link.sendCommand(cmd, markers, timeout || 5000);
          return (res && res.text) || '';
        }
      };
    }
    return null;
  }

  // Lists /mnt/ghostesp/apps and matches each installed file (<id>-<version>.gapp)
  // back to a catalog app to detect installs, versions, and available updates.
  async function detectInstalledApps() {
    const talk = serialTalk();
    if (!talk) {
      state.installedApps = {};
      state.installedCount = 0;
      state.updateCount = 0;
      return;
    }
    try {
      const text = await talk.send('sd list /mnt/ghostesp/apps', ['SD:OK', 'SD:ERR'], 12000);
      const names = [];
      const fileRe = /^SD:FILE:\[\d+\]\s+(.+?)\s+\d+$/gm;
      let m;
      while ((m = fileRe.exec(text))) names.push(m[1].trim());

      const map = {};
      (state.catalogs.apps || []).forEach((item) => {
        const expected = [
          ...Object.values(item.downloads || {}).map((u) => (u || '').split('/').pop()),
          `${item.id}-${item.version}.gapp`
        ].filter(Boolean).map((n) => n.toLowerCase().trim());
        const installed = names.find((n) => {
          const low = n.toLowerCase().trim();
          if (expected.includes(low)) return true;
          if (low === `${item.id}.gapp`) return true;
          return low.startsWith(`${item.id}-`) || low.startsWith(`${item.id} `) ||
                 low.startsWith(`${item.id}_`) || low.startsWith(`${item.id} v`);
        });
        if (installed) {
          map[item.id] = { version: versionFromName(installed) || item.version };
        }
      });
      state.installedApps = map;
      state.installedCount = (state.catalogs.apps || []).filter((i) => map[i.id]).length;
      state.updateCount = (state.catalogs.apps || []).filter((i) => map[i.id] && compareVersions(i.version, map[i.id].version) > 0).length;
    } catch (error) {
      state.installedApps = {};
      state.installedCount = 0;
      state.updateCount = 0;
    }
  }

  function consoleConnected() {
    return !!(window.serialConsole && window.serialConsole.isConnected && window.serialConsole.port);
  }

  function getConnectionInfo() {
    if (isEmbedded) {
      return { connected: consoleConnected(), label: consoleConnected() ? 'Connected — one-click install is ready' : 'Connect your device in the header to enable one-click install' };
    }
    const open = state.session && state.session.link && !state.session.link.closed;
    return { connected: !!open, label: open ? 'Connected' : 'Not connected' };
  }

  // Builds a serial "link" backed by the serial console's open connection.
  async function makeConsoleSession() {
    const sc = window.serialConsole;
    const link = {
      sendCommand: (cmd, markers, timeoutMs) =>
        sc.requestCommandResponse(cmd, markers, timeoutMs || 5000)
          .then((text) => ({
            text,
            matched: (Array.isArray(markers) ? markers : [markers]).some((m) => text.includes(m)),
            garbled: false,
            closed: false
          }))
    };
    let model = null;
    const cached = window.serialConsole && window.serialConsole.chipInfo;
    if (cached && cached.model) {
      model = cached.model;
    } else {
      try {
        const res = await link.sendCommand('chipinfo', ['[CHIPINFO_END]'], 5000);
        const m = res.text.match(/Model\s*:\s*([^\r\n]+)/i);
        if (m) model = normalizeChip(m[1]);
      } catch (error) {}
    }
    return { link, model, baud: (sc.baudSelect && sc.baudSelect.value) || 115200, owner: 'console' };
  }

  // Returns a session for install() to use, or null to let install auto-connect.
  async function resolveInstallSession() {
    if (isEmbedded) {
      if (consoleConnected()) return await makeConsoleSession();
      return null; // SerialCore will auto-connect its own port
    }
    if (state.session && state.session.link && !state.session.link.closed) return state.session;
    return null;
  }

  // Security notice. Muted, one line of copy, dismissible — the previous
  // centered amber pill shouted at every visitor on every visit.
  function noticeHtml() {
    return `
      <div class="store-notice" id="store-notice" role="note">
        <i class="bi bi-shield-exclamation" aria-hidden="true"></i>
        <p>Only install items from sources you trust. Packages from outside this store may contain malware or damage your device.</p>
        <button class="store-notice-dismiss" type="button" aria-label="Dismiss this warning"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>`;
  }

  // Closing note on the listing. Collapsed by default to a single slim bar so it
  // stays discoverable without eating a chunk of the viewport; the toggle reveals
  // the guide copy and the build commands.
  function devNoteHtml() {
    const guide = `${ORG_URL}/GhostESP-Apps/blob/main/docs/CREATE_AN_APP.md`;
    return `
      <aside class="store-dev" aria-labelledby="store-dev-title">
        <div class="store-dev-bar">
          <h2 class="store-dev-title" id="store-dev-title"><i class="bi bi-git" aria-hidden="true"></i>Build your own app</h2>
          <p class="store-dev-lead">Every app here lives in a public repo.</p>
          <button class="store-dev-toggle" type="button" data-dev-toggle aria-expanded="false" aria-controls="store-dev-more">
            <span>Details</span><i class="bi bi-chevron-down" aria-hidden="true"></i>
          </button>
        </div>
        <div class="store-dev-more" id="store-dev-more">
          <div class="store-dev-main">
            <p class="store-dev-text">
              The catalog only keeps a manifest that points at the source. Scaffold a project, build a
              <code>.gapp</code> for each target, then open a pull request. CI builds it, uploads it, and
              it shows up in this list.
            </p>
            <div class="store-dev-links">
              <a href="${esc(guide)}" target="_blank" rel="noopener">Step-by-step guide</a>
              <a href="${esc(ORG_URL)}/GhostESP-Apps" target="_blank" rel="noopener">Catalog repo</a>
              <a href="https://docs.ghostesp.net" target="_blank" rel="noopener">Developer docs</a>
            </div>
          </div>
          <div class="store-dev-term" aria-hidden="true">
            <div class="store-dev-term-bar">
              <span class="store-dev-dot"></span><span class="store-dev-dot"></span><span class="store-dev-dot"></span>
              <span class="store-dev-term-label">PowerShell</span>
            </div>
            <pre><code><span class="store-dev-cmt"># build tool + ESP-IDF for your target</span>
pip install ghostbt
gbt create my_app --name "My App"

<span class="store-dev-cmt"># package and test it on hardware</span>
gbt dist . --target esp32s3 --gapp</code></pre>
          </div>
        </div>
      </aside>`;
  }

  // Category tabs. On the dashboard these mount into the page header
  // (#storeTabsSlot) so they read as part of the chrome; if that slot is absent
  // they fall back to the top of the store body.
  function tabsHtml() {
    return `
      <div class="store-tabs" role="tablist" aria-label="Store categories">
        <button class="store-tab active" type="button" data-tab="apps" role="tab" aria-selected="true"><i class="bi bi-grid"></i> Apps <span class="store-tab-count" data-tab="apps"></span></button>
        <button class="store-tab" type="button" data-tab="assets" role="tab" aria-selected="false"><i class="bi bi-palette"></i> Asset Packs <span class="store-tab-count" data-tab="assets"></span></button>
        <button class="store-tab" type="button" data-tab="scripts" role="tab" aria-selected="false"><i class="bi bi-file-code"></i> Scripts <span class="store-tab-count" data-tab="scripts"></span></button>
      </div>`;
  }

  function buildShell() {
    const container = isEmbedded
      ? document.getElementById('storeRoot')
      : document.getElementById('store-app');
    if (!container) { root = null; return false; }
    root = container;

    const placeholder = document.getElementById('store-placeholder');
    if (placeholder) placeholder.remove();

    const deviceBar = isEmbedded ? '' : `
      <div class="store-device-bar">
        <div class="store-device-status">
          <span class="store-status-dot" id="store-status-dot"></span>
          <span id="store-device-meta">Not connected</span>
        </div>
        <div class="store-device-actions">
          <button id="store-connect-btn" class="btn btn-primary"><i class="bi bi-usb-plug"></i> Connect Device</button>
          <button id="store-disconnect-btn" class="btn btn-secondary" style="display:none;"><i class="bi bi-x-circle"></i> Disconnect</button>
        </div>
        <div class="store-status-line" id="store-status-line">Connect once, then install across all tabs.</div>
      </div>`;

    // The tabs normally render into the header slot, which lives outside
    // #storeRoot, so they are built separately from the body markup.
    const tabsSlot = document.getElementById('storeTabsSlot');
    if (tabsSlot) tabsSlot.innerHTML = tabsHtml();
    tabsHost = tabsSlot || root;

    root.innerHTML = `
      ${deviceBar}
      ${tabsSlot ? '' : tabsHtml()}
      <div class="store-toolbar">
        <label class="store-search">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input id="store-search" class="store-input" type="search" placeholder="Search the store…" autocomplete="off" aria-label="Search the store">
        </label>
        <div class="store-toolbar-end">
          <select id="store-category" class="store-select" aria-label="Filter by category"><option value="">All categories</option></select>
          <select id="store-target" class="store-select" aria-label="Filter by target"><option value="">All targets</option></select>
          <label class="store-sort">
            <i class="bi bi-sort-down" aria-hidden="true"></i>
            <select id="store-sort" class="store-select" aria-label="Sort results">
              <option value="recent">Recently updated</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <div class="store-view-switch" role="group" aria-label="Result layout">
            <button class="store-view-btn" type="button" data-view="grid" title="Grid view" aria-pressed="true">
              <i class="bi bi-grid-3x3-gap-fill" aria-hidden="true"></i><span>Grid</span>
            </button>
            <button class="store-view-btn" type="button" data-view="list" title="Detail view" aria-pressed="false">
              <i class="bi bi-list-ul" aria-hidden="true"></i><span>Detail</span>
            </button>
          </div>
        </div>
      </div>
      <div class="store-chip-filter" id="store-chip-filter" style="display:none;">
        <label class="store-show-all-label">
          <input type="checkbox" id="store-show-all-apps">
          <span>Showing apps for <strong class="store-chip-filter-name"></strong> · <em>Show all apps</em></span>
        </label>
      </div>
      ${noticeHtml()}
      <div id="store-meta" class="store-list-meta">Loading store…</div>
      <div class="store-scroll">
        <div id="store-grid" class="store-grid" aria-live="polite"></div>
      </div>
      ${devNoteHtml()}`;

    els = {
      // Select the buttons, not [data-tab]: the count spans carry data-tab too,
      // so an attribute query also matched them and marked the counts "active".
      tabs: Array.prototype.slice.call((tabsHost || root).querySelectorAll('.store-tab')),
      search: root.querySelector('#store-search'),
      category: root.querySelector('#store-category'),
      target: root.querySelector('#store-target'),
      sort: root.querySelector('#store-sort'),
      grid: root.querySelector('#store-grid'),
      meta: root.querySelector('#store-meta'),
      status: root.querySelector('#store-status'),
      connectBtn: root.querySelector('#store-connect-btn'),
      disconnectBtn: root.querySelector('#store-disconnect-btn'),
      chipFilter: root.querySelector('#store-chip-filter'),
      showAll: root.querySelector('#store-show-all-apps'),
      viewBtns: Array.prototype.slice.call(root.querySelectorAll('.store-view-btn'))
    };

    if (els.tabs.length) {
      els.tabs.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    }
    if (els.search) els.search.addEventListener('input', () => { state.query = els.search.value.trim().toLowerCase(); render(); });
    if (els.category) els.category.addEventListener('change', () => {
      state.category = els.category.value;
      render();
    });
    if (els.target) els.target.addEventListener('change', () => { state.target = els.target.value; render(); });
    if (els.sort) els.sort.addEventListener('change', () => {
      state.sort = els.sort.value;
      writePref(SORT_KEY, state.sort);
      render();
    });
    if (els.grid) els.grid.addEventListener('click', onGridClick);
    if (els.showAll) els.showAll.addEventListener('change', () => { state.showAllApps = els.showAll.checked; render(); });
    if (els.viewBtns.length) {
      els.viewBtns.forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
      syncViewButtons();
    }

    const notice = root.querySelector('#store-notice');
    if (notice) {
      if (readPref(NOTICE_KEY) === '1') {
        notice.remove();
      } else {
        const dismiss = notice.querySelector('.store-notice-dismiss');
        if (dismiss) {
          dismiss.addEventListener('click', () => {
            writePref(NOTICE_KEY, '1');
            notice.remove();
          });
        }
      }
    }

    const devNote = root.querySelector('.store-dev');
    if (devNote) {
      const devToggle = devNote.querySelector('[data-dev-toggle]');
      if (devToggle) {
        devToggle.addEventListener('click', () => {
          const open = devNote.classList.toggle('expanded');
          devToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          devToggle.querySelector('span').textContent = open ? 'Hide' : 'Details';
        });
      }
    }

    if (!isEmbedded && els.connectBtn) {
      els.connectBtn.addEventListener('click', async () => {
        if (state.busy) return;
        state.busy = true;
        try {
          const session = await window.SerialCore.connect(() => {});
          state.session = session;
          await detectInstalledApps();
        } catch (error) {
          state.errorNotice = error && error.message ? error.message : 'Connection failed';
          setTimeout(() => { state.errorNotice = null; render(); }, 4000);
        } finally {
          state.busy = false;
          render();
        }
      });
      if (els.disconnectBtn) {
        els.disconnectBtn.addEventListener('click', () => {
          if (state.session) window.SerialCore.closeSession(state.session);
          state.session = null;
          state.installedApps = {};
          state.installedCount = 0;
          state.updateCount = 0;
          render();
        });
      }
    }
    return true;
  }

  function updateDeviceBar() {
    if (isEmbedded || !els.connectBtn) return;
    const open = state.session && state.session.link && !state.session.link.closed;
    const dot = root.querySelector('#store-status-dot');
    const meta = root.querySelector('#store-device-meta');
    const line = root.querySelector('#store-status-line');
    if (open && dot && meta) {
      dot.className = 'store-status-dot connected';
      const chip = state.session.model ? String(state.session.model).toUpperCase() : 'GhostESP device';
      meta.textContent = `Connected · ${chip} · ${state.session.baud} baud`;
      if (line) line.textContent = 'Install anything below — one session, no reconnecting.';
      els.connectBtn.style.display = 'none';
      if (els.disconnectBtn) els.disconnectBtn.style.display = '';
    } else if (dot && meta) {
      dot.className = 'store-status-dot';
      meta.textContent = 'Not connected';
      if (line) line.textContent = 'Connect once, then install across all tabs.';
      els.connectBtn.style.display = '';
      if (els.disconnectBtn) els.disconnectBtn.style.display = 'none';
    }
  }

  function syncViewButtons() {
    (els.viewBtns || []).forEach((btn) => {
      const on = btn.dataset.view === state.view;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setView(view) {
    state.view = view === 'list' ? 'list' : 'grid';
    writePref(VIEW_KEY, state.view);
    syncViewButtons();
    render();
  }

  async function fetchCatalog(key) {
    const spec = CATALOGS[key];
    const cached = sessionStorage.getItem(spec.cacheKey);
    try {
      const response = await fetch(spec.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load catalog');
      const catalog = await response.json();
      sessionStorage.setItem(spec.cacheKey, JSON.stringify({ data: catalog }));
      return catalog;
    } catch (directError) {
      try {
        const meta = await fetch(`${proxyBase()}?url=${encodeURIComponent(spec.url)}`);
        if (meta.ok) {
          const info = await meta.json();
          const chunk = await fetch(`${proxyBase()}?url=${encodeURIComponent(spec.url)}&start=0&length=${info.total || 1048576}`);
          if (chunk.ok) {
            const part = await chunk.json();
            if (part.ok && part.data) {
              const binary = atob(part.data);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              return JSON.parse(new TextDecoder().decode(bytes));
            }
          }
        }
      } catch (proxyError) {}
      if (cached) {
        try { return JSON.parse(cached).data; } catch (e) {}
      }
      throw directError;
    }
  }

  async function loadAll() {
    await Promise.all(Object.keys(CATALOGS).map(async (key) => {
      const catalog = await fetchCatalog(key);
      const spec = CATALOGS[key];
      let items = spec.items(catalog) || [];
      if (spec.reviewedOnly) items = items.filter((item) => item.reviewed);
      state.catalogs[key] = items;
    }));
  }

  function itemMatches(item, key) {
    const haystack = [item.id, item.name, item.version, item.category, item.description, ...(item.authors || [])].join(' ').toLowerCase();
    if (state.query && !haystack.includes(state.query)) return false;
    if (state.category && categoryOf(item) !== state.category) return false;
    if (state.target) {
      if (key === 'apps') return (item.targets || []).includes(state.target);
      return true;
    }
    return true;
  }

  function categoryOf(item) {
    return String(item.category || item.type || '').trim();
  }

  const byName = (a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, { sensitivity: 'base' });

  // "Recently updated" needs a publish date per package. The catalog carries
  // only a catalog-wide generated_at, and the CDN's Last-Modified cannot be read
  // from the browser (no CORS header), so dates come from the proxy in one batch.
  function packageUrls(item, key) {
    return Object.values(downloadsFor(item, key)).filter((u) => typeof u === 'string' && u);
  }

  function itemTimestamp(item, key) {
    return packageUrls(item, key).reduce((best, u) => Math.max(best, state.dates[u] || 0), 0);
  }

  function datesResolved(items, key) {
    return items.every((item) => packageUrls(item, key).every(
      (u) => state.dates[u] !== undefined || state.datesAttempted.has(u)
    ));
  }

  function readCachedDates() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(DATES_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  async function loadDates(items, key) {
    const urls = [];
    items.forEach((item) => packageUrls(item, key).forEach((u) => {
      // Skip in-flight urls too: a re-render during the request would otherwise
      // fire a second identical batch for the same packages.
      if (state.dates[u] === undefined && !state.datesAttempted.has(u) && !state.datesPending.has(u)) {
        urls.push(u);
      }
    }));
    if (!urls.length) return false;

    urls.forEach((u) => state.datesPending.add(u));
    let changed = false;
    let resolved = 0;
    for (let i = 0; i < urls.length; i += 100) {
      const chunk = urls.slice(i, i + 100);
      try {
        const response = await fetch(`${proxyBase()}?heads=${encodeURIComponent(JSON.stringify(chunk))}`);
        if (!response.ok) throw new Error('Date lookup failed');
        const payload = await response.json();
        (payload.items || []).forEach((entry) => {
          const stamp = Date.parse(entry.lastModified);
          state.dates[entry.url] = Number.isFinite(stamp) ? stamp : 0;
          resolved += 1;
          changed = true;
        });
      } catch (error) {
        state.datesError = true;
      } finally {
        // Mark every url as attempted so a failure cannot retrigger the fetch on
        // each render, and so the order falls back to catalog order honestly.
        chunk.forEach((u) => state.datesAttempted.add(u));
      }
    }
    state.datesPending.clear();
    // A 200 carrying no dates (e.g. the endpoint is not deployed, or every
    // upstream HEAD failed) is still a failure from the user's point of view:
    // say so rather than presenting catalog order as "recently updated".
    if (!resolved) state.datesError = true;
    if (changed) {
      try { sessionStorage.setItem(DATES_KEY, JSON.stringify(state.dates)); } catch (e) {}
    }
    return changed;
  }

  // Returns a sorted copy of `items`. `fullItems` is the unsorted catalog list,
  // used to keep undated entries in catalog order instead of shuffling them.
  function sortItems(items, sort, key, fullItems) {
    if (sort !== 'recent') return items.slice().sort(byName);
    const catalogIndex = new Map();
    (fullItems || []).forEach((item, i) => catalogIndex.set(item, i));
    return items.slice().sort((a, b) => {
      const ta = itemTimestamp(a, key);
      const tb = itemTimestamp(b, key);
      // Items without a resolved date sink below dated ones.
      if (ta && tb) return (tb - ta) || byName(a, b);
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return (catalogIndex.get(a) || 0) - (catalogIndex.get(b) || 0);
    });
  }

  function renderFilters() {
    if (els.target) els.target.style.display = state.tab === 'apps' ? '' : 'none';

    // Category filter applies to every tab; values come from the current tab.
    if (els.category) {
      const categories = [...new Set((state.catalogs[state.tab] || []).map(categoryOf).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      if (state.category && !categories.includes(state.category)) state.category = '';
      els.category.innerHTML = '<option value="">All categories</option>' + categories.map((c) =>
        `<option value="${esc(c)}" ${c === state.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
      els.category.value = state.category;
    }

    if (state.tab !== 'apps' || !els.target) return;
    const items = state.catalogs.apps || [];
    const chip = connectedChip();
    const chipActive = !!chip && !state.showAllApps;
    // When a chip filter is active, only list targets that can run on that chip
    // and that actually exist among the visible apps.
    const pool = chipActive
      ? items.filter((item) => (item.targets || []).some((t) => targetMatches(normalizeChip(t), chip.chip)))
      : items;
    const targets = [...new Set(pool.flatMap((item) => item.targets || []))]
      .filter((t) => !chipActive || targetMatches(normalizeChip(t), chip.chip))
      .sort();
    // Keep the current selection valid — drop it if the chip filter removed it.
    if (state.target && !targets.includes(state.target)) {
      state.target = '';
    }
    els.target.innerHTML = '<option value="">All targets</option>' + targets.map((t) =>
      `<option value="${esc(t)}" ${t === state.target ? 'selected' : ''}>${esc(targetLabel(t))}</option>`).join('');
  }

  function downloadsFor(item, key) {
    if (key === 'apps') return item.downloads || {};
    if (key === 'assets') return (item.url ? { [item.category || 'asset']: item.url } : {});
    if (key === 'scripts') return (item.download ? { [item.category || 'script']: item.download } : {});
    return {};
  }

  function fileNameFor(item, key) {
    if (key === 'apps') {
      const url = Object.values(item.downloads || {})[0];
      return url ? url.split('/').pop() : `${item.id}-${item.version}.gapp`;
    }
    if (key === 'assets') return item.file || `${item.id}.gtheme`;
    if (key === 'scripts') {
      const url = item.download || '';
      return url ? url.split('/').pop() : `${item.id}.gsb`;
    }
    return '';
  }

  function canInstall(key) {
    if (!window.SerialCore || !window.SerialCore.supported()) return false;
    if (key === 'apps') return getConnectionInfo().connected; // apps need the shared session
    if (isEmbedded) return getConnectionInfo().connected; // dashboard store reuses the Console connection
    return true; // standalone themes/scripts auto-connect on click
  }

  // Decides whether a card shows an install button, and in what state. When
  // disconnected we still render the button so users can see the action is
  // available — just gated behind a connection, with a hint explaining how.
  function installControl(key) {
    const supported = !!(window.SerialCore && window.SerialCore.supported());
    if (!supported) return { show: false };
    if (key === 'apps' || isEmbedded) {
      if (getConnectionInfo().connected) return { show: true };
      return {
        show: true,
        disabled: true,
        hint: isEmbedded
          ? 'Connect your device in the header to install'
          : 'Connect with the button above to install'
      };
    }
    return { show: true };
  }

  function installLabel(key) {
    return key === 'apps' ? 'Install to device' : key === 'assets' ? 'Install pack' : 'Install script';
  }

  // Context-aware button label: "Install", "Reinstall", or "Update to vX.Y.Z".
  function labelFor(item, key) {
    if (key === 'apps') {
      const inst = state.installedApps[item.id];
      if (inst) {
        if (compareVersions(item.version, inst.version) > 0) return `Update to v${item.version}`;
        return 'Reinstall';
      }
    }
    return installLabel(key);
  }

  function humanSize(bytes) {
    const n = Number(bytes);
    if (!n || n < 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1048576) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  // catalog.json exposes `preview` for every kind, and the first app screenshot
  // is emitted as `preview` too — so one image treatment covers all three tabs.
  function renderMedia(item, variant) {
    const url = item.preview;
    if (url) {
      return `<div class="store-media store-media-${variant}">
        <img src="${esc(url)}" alt="${esc(item.name)} preview" loading="lazy" decoding="async">
      </div>`;
    }
    const initial = String(item.name || item.id || '?').trim().charAt(0).toUpperCase() || '?';
    return `<div class="store-media store-media-${variant} store-media-empty" aria-hidden="true"><span>${esc(initial)}</span></div>`;
  }

  function statusChipsFor(item, key) {
    if (key !== 'apps') return '';
    const inst = state.installedApps[item.id] || null;
    if (!inst) return '';
    const hasUpdate = compareVersions(item.version, inst.version) > 0;
    return `<span class="store-chip store-installed-chip"><i class="bi bi-check-circle-fill" aria-hidden="true"></i> Installed${inst.version ? ' v' + esc(inst.version) : ''}</span>` +
      (hasUpdate ? `<span class="store-chip store-update-chip">Update to v${esc(item.version)}</span>` : '');
  }

  function metaChipsFor(item, key, limit) {
    let values;
    if (key === 'apps') values = { list: item.targets || [], cls: '' };
    else if (key === 'scripts') values = { list: item.permissions || [], cls: ' store-permission-chip' };
    else values = { list: item.contents || [], cls: '' };
    const list = limit ? values.list.slice(0, limit) : values.list;
    const extra = limit && values.list.length > limit
      ? `<span class="store-chip store-chip-more">+${values.list.length - limit}</span>` : '';
    return list.map((v) => `<span class="store-chip${values.cls}">${esc(v)}</span>`).join('') + extra;
  }

  function renderActions(item, key) {
    const entries = Object.entries(downloadsFor(item, key));
    if (!entries.length) return '';
    const expandedKey = `${key}:${item.id}`;
    const isExpanded = state.expanded.has(expandedKey);
    const install = installControl(key);
    return `
      <div class="store-actions-row">
        <div class="store-action-buttons">
          ${install.show ? `
            <button class="store-install-btn" type="button" data-install="${esc(expandedKey)}" ${install.disabled ? 'disabled' : ''}>
              ${install.disabled ? 'Connect to install' : esc(labelFor(item, key))}
            </button>` : ''}
          <button class="store-download-toggle" type="button" data-toggle="${esc(expandedKey)}" aria-expanded="${isExpanded}">
            <i class="bi bi-download" aria-hidden="true"></i>${isExpanded ? 'Hide files' : 'Download'}
          </button>
        </div>
        <p class="store-install-status">${install.show && install.disabled ? esc(install.hint) : ''}</p>
        ${isExpanded ? `<div class="store-download-targets">
          ${entries.map(([target, url]) => `<a class="store-download" href="${esc(url)}" download>
            <span>${esc(url.split('/').pop())}</span><span>${esc(targetLabel(target))}</span>
          </a>`).join('')}
        </div>` : ''}
      </div>`;
  }

  function categoryChip(item) {
    const value = item.category || (item.type ? String(item.type) : '');
    return value ? `<span class="store-chip store-chip-accent">${esc(value)}</span>` : '';
  }

  function authorLine(item, key) {
    const authors = (item.authors || []).length ? item.authors : ['Unknown'];
    return authors.map((name) => {
      const url = authorProfileUrl(name, item, key);
      return url
        ? `<a class="store-author-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`
        : esc(name);
    }).join(', ');
  }

  // catalog `authors` is free text (schema: "array of author names"), so there is
  // no handle to link to. The one GitHub identity the catalog does ship is the
  // app's source repo, so an author links to that repo's owner when the names
  // agree: "Billi-Green" -> /Billi-Green, and the project's own name expands to
  // its org, "GhostESP" -> /GhostESP-Revival (github.com/GhostESP is a 404).
  // Assets and scripts carry no repo, so their authors stay plain text.
  function githubOwnerFor(item, key) {
    const repo = normalizeRepoUrl(item.source_repo || item.sourceRepo || '');
    if (!repo) return '';
    let parsed;
    try { parsed = new URL(repo); } catch (e) { return ''; }
    if (parsed.hostname.toLowerCase() !== 'github.com') return '';
    const owner = parsed.pathname.split('/').filter(Boolean)[0];
    return owner && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner) ? owner : '';
  }

  function authorProfileUrl(name, item, key) {
    const owner = githubOwnerFor(item, key);
    if (!owner) return '';
    const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const author = norm(name);
    const login = norm(owner);
    // Exact handle, or the project's name prefixing its org login.
    if (author && (author === login || login.startsWith(author))) {
      return `https://github.com/${owner}`;
    }
    return '';
  }

  function sourceLink(item, key) {
    return `<a class="store-source-link" href="${esc(sourceUrlFor(item, key))}" target="_blank" rel="noopener">
      <i class="bi bi-code-slash" aria-hidden="true"></i>View source
    </a>`;
  }

  // Changelogs are long and only matter to someone deciding whether to update,
  // so they stay collapsed behind a per-item disclosure.
  function detailsKey(item, key) {
    return `details:${key}:${item.id}`;
  }

  function detailsToggle(item, key) {
    if (!item.changelog) return '';
    const id = detailsKey(item, key);
    const open = state.details.has(id);
    return `<button class="store-details-toggle" type="button" data-details="${esc(id)}" aria-expanded="${open}">
      <i class="bi bi-chevron-${open ? 'up' : 'down'}" aria-hidden="true"></i>${open ? 'Hide details' : 'Details'}
    </button>`;
  }

  function detailsPanel(item, key) {
    if (!item.changelog || !state.details.has(detailsKey(item, key))) return '';
    return `<div class="store-details">
      <span class="store-details-label">Changelog</span>
      <p class="store-details-text">${esc(item.changelog)}</p>
    </div>`;
  }

  function renderCard(item, key) {
    return `<article class="store-card" data-key="${key}" data-id="${esc(item.id)}">
      <div class="store-card-media">
        ${renderMedia(item, 'card')}
        <div class="store-card-tags">${statusChipsFor(item, key)}</div>
      </div>
      <div class="store-card-body">
        <div class="store-card-head">
          <h3 class="store-card-title">${esc(item.name)}</h3>
          <span class="store-card-version">v${esc(item.version)}</span>
        </div>
        <div class="store-card-id">${esc(item.id)}</div>
        <p class="store-card-description">${esc(item.description)}</p>
        <div class="store-chip-row">${categoryChip(item)}${metaChipsFor(item, key, 4)}</div>
      </div>
      <div class="store-card-foot">
        <div class="store-card-by"><i class="bi bi-person" aria-hidden="true"></i>${authorLine(item, key)}</div>
        ${renderActions(item, key)}
        <div class="store-card-links">${sourceLink(item, key)}${detailsToggle(item, key)}</div>
        ${detailsPanel(item, key)}
      </div>
    </article>`;
  }

  // Detail view: the same record, laid out as a full-width row so the license,
  // full permission/target lists and the change history stay readable.
  function renderRow(item, key) {
    const facts = [];
    if (item.license) facts.push(`<span class="store-fact"><i class="bi bi-shield-check" aria-hidden="true"></i>${esc(item.license)}</span>`);
    if (item.memory_limit) facts.push(`<span class="store-fact"><i class="bi bi-cpu" aria-hidden="true"></i>${esc(humanSize(item.memory_limit))} limit</span>`);
    const files = Object.keys(downloadsFor(item, key)).length;
    if (files) facts.push(`<span class="store-fact"><i class="bi bi-box-seam" aria-hidden="true"></i>${files} file${files > 1 ? 's' : ''}</span>`);

    return `<article class="store-row" data-key="${key}" data-id="${esc(item.id)}">
      ${renderMedia(item, 'row')}
      <div class="store-row-body">
        <div class="store-row-head">
          <h3 class="store-row-title">${esc(item.name)}</h3>
          <span class="store-row-version">v${esc(item.version)}</span>
          ${statusChipsFor(item, key)}
        </div>
        <p class="store-row-description">${esc(item.description)}</p>
        ${detailsPanel(item, key)}
        <div class="store-row-meta">
          <span class="store-row-by">${authorLine(item, key)}</span>
          <span class="store-row-id">${esc(item.id)}</span>
          ${facts.join('')}
        </div>
        <div class="store-chip-row">${categoryChip(item)}${metaChipsFor(item, key, 8)}</div>
      </div>
      <div class="store-row-side">
        ${renderActions(item, key)}
        <div class="store-row-links">${sourceLink(item, key)}${detailsToggle(item, key)}</div>
      </div>
    </article>`;
  }

  function renderItem(item, key) {
    return state.view === 'list' ? renderRow(item, key) : renderCard(item, key);
  }

  function isValidAppId(id) {
    return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(String(id || ''));
  }

  function normalizeRepoUrl(url) {
    const raw = String(url || '').trim();
    if (!/^https?:\/\//i.test(raw)) return '';
    return raw.replace(/\.git\/?$/, '').replace(/\/+$/, '');
  }

  function normalizeSourceSubdir(subdir) {
    const raw = String(subdir || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!raw || raw === '.' || raw === './') return '';
    return raw.replace(/^\.\//, '');
  }

  function sourceUrlFor(item, key) {
    const branch = String(item.source_branch || item.sourceBranch || item.branch || 'main').trim() || 'main';
    const subdir = normalizeSourceSubdir(item.source_subdir || item.sourceSubdir || item.subdir || '');
    const withBranch = (repo) => (subdir ? `${repo}/tree/${branch}/${subdir}` : `${repo}/tree/${branch}`);
    const candidates = [
      item.source_repo,
      item.sourceRepo,
      item.source_url,
      item.sourceUrl,
      item.repository,
      item.repo,
      item.source
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      const trimmed = candidate.trim();
      // Already a deep link into a repo — use as-is.
      if (/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/(tree|blob)\//i.test(trimmed)) {
        return normalizeRepoUrl(trimmed) || trimmed;
      }
      // Bare `owner/repo` shorthand.
      if (/^[^/\s]+\/[^/\s]+$/.test(trimmed) && !/[:\s]/.test(trimmed)) {
        return withBranch(`https://github.com/${trimmed.replace(/\.git\/?$/, '')}`);
      }
      const repo = normalizeRepoUrl(trimmed);
      if (!repo) continue;
      return withBranch(repo);
    }
    // catalog.json drops source_* fields, so fall back to the per-app catalog
    // manifest directory (which points at the true source repo) instead of the
    // generic org page. Enrichment in enrichAppsWithSource() replaces this
    // with the direct source_repo link once manifests load.
    if ((key || 'apps') === 'apps' && isValidAppId(item && item.id)) {
      return `${APPS_CATALOG_DIR_BASE}/${encodeURIComponent(item.id)}`;
    }
    return ORG_URL;
  }

  function readCachedAppSources() {
    try {
      const raw = sessionStorage.getItem(APP_SOURCE_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeCachedAppSource(id, source) {
    try {
      const cache = readCachedAppSources();
      cache[id] = { ...source, cachedAt: Date.now() };
      sessionStorage.setItem(APP_SOURCE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  async function fetchAppManifest(id) {
    const url = `${APPS_MANIFEST_BASE}/${encodeURIComponent(id)}/manifest.json`;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return await response.json();
    } catch (e) {}
    try {
      const proxied = await fetch(`${proxyBase()}?url=${encodeURIComponent(url)}`);
      if (proxied.ok) {
        const info = await proxied.json();
        const chunk = await fetch(`${proxyBase()}?url=${encodeURIComponent(url)}&start=0&length=${info.total || 65536}`);
        if (chunk.ok) {
          const part = await chunk.json();
          if (part.ok && part.data) {
            const binary = atob(part.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return JSON.parse(new TextDecoder().decode(bytes));
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // catalog.json carries no source_repo fields (see the Apps build workflow),
  // so hydrate apps from their catalog manifests (apps/<id>/manifest.json).
  // Failures are silent — cards fall back to the manifest directory link.
  async function enrichAppsWithSource() {
    const apps = state.catalogs.apps || [];
    const pending = apps.filter((item) => item && !item.source_repo && isValidAppId(item.id));
    if (!pending.length) return false;
    const cache = readCachedAppSources();
    let changed = false;
    await Promise.all(pending.map(async (item) => {
      const cached = cache[item.id];
      if (cached && cached.source_repo) {
        item.source_repo = cached.source_repo;
        if (cached.source_branch) item.source_branch = cached.source_branch;
        if (cached.source_subdir) item.source_subdir = cached.source_subdir;
        changed = true;
        return;
      }
      const manifest = await fetchAppManifest(item.id);
      if (manifest && typeof manifest.source_repo === 'string' && manifest.source_repo.trim()) {
        item.source_repo = manifest.source_repo.trim();
        if (manifest.source_branch) item.source_branch = manifest.source_branch;
        if (manifest.source_subdir) item.source_subdir = manifest.source_subdir;
        writeCachedAppSource(item.id, {
          source_repo: item.source_repo,
          source_branch: item.source_branch,
          source_subdir: item.source_subdir
        });
        changed = true;
      }
    }));
    return changed;
  }

  function render() {
    if (!els.grid || !els.meta) return;
        updateDeviceBar();

    if (state.error) {
      els.grid.innerHTML = `<div class="store-empty">${esc(state.error)}</div>`;
      els.meta.textContent = '';
      return;
    }
    if (state.loading) {
      els.grid.innerHTML = '<div class="store-empty">Loading…</div>';
      els.meta.textContent = '';
      return;
    }

    const items = state.catalogs[state.tab] || [];
    let visible = items.filter((item) => itemMatches(item, state.tab));
    const chip = connectedChip();
    const chipFiltering = state.tab === 'apps' && chip && !state.showAllApps;
    if (chipFiltering) {
      visible = visible.filter((item) => (item.targets || []).some((t) => targetMatches(normalizeChip(t), chip.chip)));
    }
    // Resolve publish dates once, then re-render in place when they arrive.
    let datesLoading = false;
    if (state.sort === 'recent') {
      if (!datesResolved(visible, state.tab)) {
        datesLoading = true;
        loadDates(visible, state.tab)
          .then((changed) => { if (changed) render(); })
          .catch(() => {});
      }
    }
    visible = sortItems(visible, state.sort, state.tab, items);
    const label = state.tab === 'apps' ? 'apps' : state.tab === 'assets' ? 'packs' : 'scripts';
    let metaText = `${visible.length} ${label} available`;
    if (chipFiltering) {
      metaText = `${visible.length} of ${items.length} ${label} for ${chip.label}`;
    }
    if (isEmbedded && !getConnectionInfo().connected) {
      metaText += ' · connect your device in the header to enable installs';
    } else if (state.tab === 'apps' && !canInstall('apps')) {
      metaText += ' · connect to enable installs';
    }
    if (state.tab === 'apps' && getConnectionInfo().connected) {
      if (state.installedCount) metaText += ` · ${state.installedCount} installed`;
      if (state.updateCount) metaText += ` · ${state.updateCount} update${state.updateCount > 1 ? 's' : ''} available`;
    }
    // Say what the order actually is when a date fetch fails, rather than
    // showing a "recently updated" label over catalog order.
    if (state.sort === 'recent') {
      if (datesLoading) metaText += ' · loading update dates…';
      else if (state.datesError) metaText += ' · update dates unavailable, showing catalog order';
    }
    els.meta.textContent = metaText;

    if (els.chipFilter && els.showAll) {
      const showBar = state.tab === 'apps' && !!chip;
      els.chipFilter.style.display = showBar ? '' : 'none';
      if (showBar) {
        const nameEl = els.chipFilter.querySelector('.store-chip-filter-name');
        if (nameEl) nameEl.textContent = chip.label;
      }
      els.showAll.checked = state.showAllApps;
    }

    els.grid.classList.toggle('store-grid-list', state.view === 'list');
    els.grid.innerHTML = visible.length
      ? visible.map((item) => renderItem(item, state.tab)).join('')
      : (chipFiltering
          ? `<div class="store-empty">No apps for ${esc(chip.label)} yet — tick “Show all apps” to browse everything.</div>`
          : '<div class="store-empty">Nothing matches this filter yet.</div>');

    els.tabs.forEach((btn) => {
      const on = btn.dataset.tab === state.tab;
      btn.classList.toggle('active', on);
      // aria-selected was only ever correct in the initial markup.
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function switchTab(tab) {
    if (!CATALOGS[tab]) tab = 'apps';
    state.tab = tab;
    state.query = '';
    state.target = '';
    state.category = '';
    if (els.search) els.search.value = '';
    renderFilters();
    render();
    // Standalone only — when embedded, leave the URL alone so
    // dashboard-level params like ?tab=irdb survive.
    if (!isEmbedded) {
      try { history.replaceState(null, '', location.pathname + `?tab=${tab}`); } catch (e) {}
    }
  }

  function onGridClick(event) {
    const details = event.target.closest('[data-details]');
    if (details) {
      const id = details.getAttribute('data-details');
      if (state.details.has(id)) state.details.delete(id);
      else state.details.add(id);
      render();
      return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.getAttribute('data-toggle');
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      render();
      return;
    }
    const install = event.target.closest('[data-install]');
    if (install) {
      const [key, id] = install.getAttribute('data-install').split(':');
      const item = (state.catalogs[key] || []).find((i) => i.id === id);
      if (item) doInstall(item, key);
    }
  }

  async function doInstall(item, key) {
    if (!window.SerialCore) return;
    if (state.busy) return;
    const downloads = downloadsFor(item, key);
    const url = Object.values(downloads)[0];
    if (!url) { statusFor(item, key, 'No downloadable package yet.'); return; }
    const fileName = fileNameFor(item, key);

    state.busy = true;
    buttonFor(item, key, true);
    statusFor(item, key, 'Preparing…');

    let session = null;
    let busySession = null;
    try {
      session = await resolveInstallSession();
      // Tell the serial console's background chipinfo poller to back off while
      // we drive the shared connection through an install.
      if (session && session.owner === 'console' && window.serialConsole &&
          typeof window.serialConsole.setBusy === 'function') {
        window.serialConsole.setBusy(true);
        busySession = window.serialConsole;
      }
    } catch (error) {
      statusFor(item, key, error && error.message ? error.message : 'Could not reach the device');
      state.busy = false;
      buttonFor(item, key, false);
            return;
    }

    const makeManifest = key === 'scripts' ? () => ({
      id: item.id,
      name: item.name,
      entry: fileName,
      memory_limit: item.memory_limit,
      permissions: item.permissions || []
    }) : null;

    try {
      await window.SerialCore.install({
        kind: key,
        session,
        downloadUrl: url,
        filename: fileName,
        packageId: item.id,
        makeManifest,
        onStatus: (msg) => statusFor(item, key, msg),
        onProgress: (done, total) => {
          const pct = total ? `${Math.round((done / total) * 100)}%` : window.SerialCore.formatSize(done);
          statusFor(item, key, `Uploading (${pct})…`);
        }
      });
      statusFor(item, key, 'Done ✓');
      if (key === 'apps') {
        detectInstalledApps().then(() => render()).catch(() => {});
      }
    } catch (error) {
      statusFor(item, key, error && error.message ? error.message : 'Install failed');
    } finally {
      if (busySession && typeof busySession.setBusy === 'function') busySession.setBusy(false);
      state.busy = false;
      buttonFor(item, key, false);
          }
  }

  function buttonFor(item, key, busy) {
    const btn = root && root.querySelector(`.store-card[data-key="${key}"][data-id="${esc(item.id)}"] .store-install-btn`);
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('store-install-busy', busy);
    btn.innerHTML = busy ? 'Installing…' : labelFor(item, key);
  }

  function statusFor(item, key, text) {
    const el = root && root.querySelector(`.store-card[data-key="${key}"][data-id="${esc(item.id)}"] .store-install-status`);
    if (el) el.textContent = text || '';
  }

  async function boot() {
    isEmbedded = !!document.getElementById('storeRoot');
    state.view = readPref(VIEW_KEY) === 'list' ? 'list' : 'grid';
    state.dates = readCachedDates();
    const savedSort = readPref(SORT_KEY);
    if (SORTS.includes(savedSort)) state.sort = savedSort;
    if (!buildShell()) return;
    if (els.sort) els.sort.value = state.sort;

    render();

    function onConnChange(e) {
      if (!isEmbedded) return;
      state.installedApps = {};
      state.installedCount = 0;
      state.updateCount = 0;
      if (e.detail.connected) {
        detectInstalledApps().then(() => render()).catch(() => {});
      } else {
        render();
      }
    }
    document.addEventListener('serial-connection-change', onConnChange);

    // Re-filter + re-scan once the chip model arrives (chipinfo is fetched
    // async right after connecting, so the first serial-connection-change
    // event usually fires without it). The chipinfo poller re-dispatches this
    // every ~45s — only react when the chip identity actually changes.
    document.addEventListener('chip-info-updated', () => {
      if (!isEmbedded) return;
      const c = connectedChip();
      const key = c ? c.chip : '';
      if (key === state.chipKey) return;
      state.chipKey = key;
      if (!key) {
        state.showAllApps = false;
        render();
        return;
      }
      detectInstalledApps().then(() => render()).catch(() => {});
    });

    try {
      await loadAll();
      state.loading = false;
      const params = new URLSearchParams(window.location.search);
      const initialStoreTab = isEmbedded ? (params.get('store') || 'apps') : (params.get('tab') || 'apps');
      switchTab(initialStoreTab);
      els.tabs.forEach((btn) => {
        const count = (tabsHost || root).querySelector(`.store-tab-count[data-tab="${btn.dataset.tab}"]`);
        if (count) count.textContent = `(${state.catalogs[btn.dataset.tab].length})`;
      });
      // Hydrate source_repo links from per-app manifests (catalog.json omits
      // them) and re-render so "View source code" points at the true repo.
      enrichAppsWithSource().then((changed) => { if (changed) render(); }).catch(() => {});
    } catch (err) {
      state.loading = false;
      state.error = 'Failed to load the store catalog. Please try again later.';
      console.error('Store catalog error:', err);
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
