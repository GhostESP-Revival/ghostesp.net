// store.js — GhostESP Store (apps + asset packs + scripts).
// Runs standalone at /marketplace OR embedded inside the Serial Console
// page (dashboard.html #storeRoot). When embedded, installs reuse the console's
// already-open Web Serial connection; standalone it manages its own.
(function () {
  const CATALOGS = {
    apps: {
      url: 'https://raw.githubusercontent.com/GhostESP-Revival/GhostESP-Apps/main/catalog.json',
      cacheKey: 'ghostesp-store-apps-v2',
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
    busy: false,
    session: null, // only used standalone
    catalogs: { apps: [], assets: [], scripts: [] },
    error: null,
    installedApps: {}, // app id -> { version }
    installedCount: 0,
    updateCount: 0,
    showAllApps: false,
    chipKey: ''
  };

  let root = null;
  let els = {};
  let isEmbedded = false;

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

    root.innerHTML = `
      ${deviceBar}
      <div class="store-tabs" role="tablist" aria-label="Store categories">        <button class="store-tab active" type="button" data-tab="apps" role="tab" aria-selected="true"><i class="bi bi-grid"></i> Apps <span class="store-tab-count" data-tab="apps"></span></button>
        <button class="store-tab" type="button" data-tab="assets" role="tab" aria-selected="false"><i class="bi bi-palette"></i> Asset Packs <span class="store-tab-count" data-tab="assets"></span></button>
        <button class="store-tab" type="button" data-tab="scripts" role="tab" aria-selected="false"><i class="bi bi-file-code"></i> Scripts <span class="store-tab-count" data-tab="scripts"></span></button>
      </div>
      <div class="store-toolbar">
        <input id="store-search" class="store-input" type="search" placeholder="Search the store…" autocomplete="off">
        <select id="store-target" class="store-select" aria-label="Filter by target"><option value="">All targets</option></select>
      </div>
      <div class="store-chip-filter" id="store-chip-filter" style="display:none;">
        <label class="store-show-all-label">
          <input type="checkbox" id="store-show-all-apps">
          <span>Showing apps for <strong class="store-chip-filter-name"></strong> · <em>Show all apps</em></span>
        </label>
      </div>
      <p class="store-security-notice">Only install items from sources you trust. Packages obtained outside this store may contain malware or compromise your device.</p>
      <div id="store-meta" class="store-list-meta">Loading store…</div>
      <div id="store-grid" class="store-grid" aria-live="polite"></div>`;

    els = {
      tabs: Array.prototype.slice.call(root.querySelectorAll('[data-tab]')),
      search: root.querySelector('#store-search'),
      target: root.querySelector('#store-target'),
      grid: root.querySelector('#store-grid'),
      meta: root.querySelector('#store-meta'),
      status: root.querySelector('#store-status'),
      connectBtn: root.querySelector('#store-connect-btn'),
      disconnectBtn: root.querySelector('#store-disconnect-btn'),
      chipFilter: root.querySelector('#store-chip-filter'),
      showAll: root.querySelector('#store-show-all-apps')
    };

    if (els.tabs.length) {
      els.tabs.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    }
    if (els.search) els.search.addEventListener('input', () => { state.query = els.search.value.trim().toLowerCase(); render(); });
    if (els.target) els.target.addEventListener('change', () => { state.target = els.target.value; render(); });
    if (els.grid) els.grid.addEventListener('click', onGridClick);
    if (els.showAll) els.showAll.addEventListener('change', () => { state.showAllApps = els.showAll.checked; render(); });

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
    if (state.target) {
      if (key === 'apps') return (item.targets || []).includes(state.target);
      return true;
    }
    return true;
  }

  function renderTargetSelect() {
    if (els.target) {
      els.target.style.display = state.tab === 'apps' ? '' : 'none';
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
      `<option value="${esc(t)}" ${t === state.target ? 'selected' : ''}>${esc(t)}</option>`).join('');
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

  function renderDownloads(item, key) {
    const downloads = downloadsFor(item, key);
    const entries = Object.entries(downloads);
    if (!entries.length) return '';
    const expandedKey = `${key}:${item.id}`;
    const isExpanded = state.expanded.has(expandedKey);
    const install = installControl(key);
    return `
      <div class="store-actions-row">
        <button class="store-download-toggle" type="button" data-toggle="${esc(expandedKey)}" aria-expanded="${isExpanded}">
          ${isExpanded ? 'Hide downloads' : `<i class="bi bi-download"></i> Download`}
        </button>
        ${isExpanded ? `<div class="store-download-targets">
          ${entries.map(([target, url]) => `<a class="store-download" href="${esc(url)}" download>
            <span>${esc(url.split('/').pop())}</span><span>${esc(target)}</span>
          </a>`).join('')}
        </div>` : ''}
        ${install.show ? `
          <button class="store-install-btn" type="button" data-install="${esc(expandedKey)}" ${install.disabled ? 'disabled' : ''}>
            ${install.disabled ? 'Connect to install' : labelFor(item, key)}
          </button>
          <p class="store-install-status">${install.disabled ? esc(install.hint) : ''}</p>
        ` : ''}
      </div>`;
  }

  function renderCard(item, key) {
    const authors = (item.authors || []).length ? item.authors : ['Unknown'];
    const chips = [item.category].filter(Boolean).map((c) => `<span class="store-chip store-chip-accent">${esc(c)}</span>`).join('');
    const metaChips = key === 'apps'
      ? (item.targets || []).map((t) => `<span class="store-chip">${esc(t)}</span>`).join('')
      : key === 'scripts'
        ? (item.permissions || []).slice(0, 4).map((p) => `<span class="store-chip store-permission-chip">${esc(p)}</span>`).join('')
        : (item.contents || []).map((c) => `<span class="store-chip">${esc(c)}</span>`).join('');

    const inst = state.installedApps[item.id] || null;
    const hasUpdate = key === 'apps' && inst && compareVersions(item.version, inst.version) > 0;
    const statusChips = key === 'apps' && inst
      ? `<span class="store-chip store-installed-chip">Installed ${inst.version ? 'v' + esc(inst.version) : ''}</span>` +
        (hasUpdate ? `<span class="store-chip store-update-chip">Update: v${esc(item.version)}</span>` : '')
      : '';

    const screenshots = key === 'apps'
      ? ((item.screenshots || []).filter((s) => s && s.url) || []).slice(0, 3)
      : [];

    return `<article class="store-card" data-key="${key}" data-id="${esc(item.id)}">
      ${key === 'assets' && item.preview ? `<img class="store-preview" src="${esc(item.preview)}" alt="${esc(item.name)} preview" loading="lazy">` : ''}
      ${screenshots.length ? `<div class="store-screenshots">
        ${screenshots.map((s) => `<figure class="store-screenshot"><img src="${esc(s.url)}" alt="${esc(s.alt || item.name)}" loading="lazy"></figure>`).join('')}
      </div>` : ''}
      <div class="store-card-head-inline">
        <h3 class="store-card-title">${esc(item.name)}</h3>
        <div class="store-card-id">${esc(item.id)} v${esc(item.version)}</div>
        <div class="store-card-authors"><span>Authors:</span> ${esc(authors.join(', '))}</div>
      </div>
      <p class="store-card-description">${esc(item.description)}</p>
      <div class="store-chip-row">${statusChips}${chips}${metaChips}</div>
      ${renderDownloads(item, key)}
      <a class="store-source-link" href="${esc(sourceUrlFor(item))}" target="_blank" rel="noopener">View source code</a>
    </article>`;
  }

  function sourceUrlFor(item) {
    if (item.source_repo) {
      const repo = item.source_repo.replace(/\.git\/?$/, '').replace(/\/$/, '');
      const branch = item.source_branch || 'main';
      const subdir = item.source_subdir ? `/${item.source_subdir.replace(/^\/+/, '')}` : '';
      return `${repo}/tree/${branch}${subdir}`;
    }
    return 'https://github.com/GhostESP-Revival';
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

    els.grid.innerHTML = visible.length
      ? visible.map((item) => renderCard(item, state.tab)).join('')
      : (chipFiltering
          ? `<div class="store-empty">No apps for ${esc(chip.label)} yet — tick “Show all apps” to browse everything.</div>`
          : '<div class="store-empty">Nothing matches this filter yet.</div>');

    els.tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
  }

  function switchTab(tab) {
    if (!CATALOGS[tab]) tab = 'apps';
    state.tab = tab;
    state.query = '';
    state.target = '';
    if (els.search) els.search.value = '';
    renderTargetSelect();
    render();
    // Standalone only — when embedded, leave the URL alone so
    // dashboard-level params like ?tab=irdb survive.
    if (!isEmbedded) {
      try { history.replaceState(null, '', location.pathname + `?tab=${tab}`); } catch (e) {}
    }
  }

  function onGridClick(event) {
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
    if (!buildShell()) return;

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
        const count = root.querySelector(`.store-tab-count[data-tab="${btn.dataset.tab}"]`);
        if (count) count.textContent = `(${state.catalogs[btn.dataset.tab].length})`;
      });
    } catch (err) {
      state.loading = false;
      state.error = 'Failed to load the store catalog. Please try again later.';
      console.error('Store catalog error:', err);
    }
    render();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();