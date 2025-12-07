const root = document.querySelector('.ghostos-root');
const desktopIcons = document.getElementById('ghostos-desktop-icons');
const windowLayer = document.getElementById('ghostos-window-layer');
const taskbarWindows = document.getElementById('ghostos-taskbar-windows');
const activeTitleEl = document.getElementById('ghostos-active-title');
const clockEl = document.getElementById('ghostos-clock');
const menuLogo = document.querySelector('.ghostos-menu-logo');
const launcherButton = document.querySelector('.ghostos-launcher-button');

const GITHUB_PROXY_BASE = 'https://fragrant-flower-ba0b.creepersbeast.workers.dev/';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_FIRMWARE_REPO = { owner: 'jaylikesbunda', repo: 'Ghost_ESP' };
const GITHUB_FLIPPER_REPO = { owner: 'jaylikesbunda', repo: 'ghost_esp_app' };

const GHOSTOS_SETTINGS_KEY = 'ghostosSettings';
let ghostosSettings = null;

function loadGhostosSettings() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(GHOSTOS_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveGhostosSettings(nextSettings) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const data = nextSettings && typeof nextSettings === 'object' ? nextSettings : {};
  try {
    window.localStorage.setItem(GHOSTOS_SETTINGS_KEY, JSON.stringify(data));
  } catch (e) {}
}

function applyGhostosBackgroundFromSettings() {
  if (!root) return;
  const color = ghostosSettings && ghostosSettings.backgroundColor;
  if (color) {
    root.style.setProperty('--ghostos-bg', color);
    root.style.setProperty('--ghostos-bg-alt', color);
  } else {
    root.style.removeProperty('--ghostos-bg');
    root.style.removeProperty('--ghostos-bg-alt');
  }
}

ghostosSettings = loadGhostosSettings();

const ghostosBoards = [
  {
    id: 'ghostesp-c6-rl',
    name: 'GhostBoard (Rabbit Labs)',
    image: 'https://4441fe46.delivery.rocketcdn.me/wp-content/uploads/2024/10/ghostgps-scaled.jpg',
    description: 'Flipper-compatible C6 board made for Ghost ESP. SD slot, 3 RGB LEDs, GPS expansion.',
    url: 'https://rabbit-labs.com/product/spookyesp-the-esp32-c6-board-that-sends-shivers-down-your-spine/',
    tags: ['Flipper', 'SD Card'],
  },
  {
    id: 'cyd2usb-2-4',
    name: 'CYD2USB 2.4 Inch C Variant',
    image: 'https://ae-pic-a1.aliexpress-media.com/kf/Se5f531b3b4f642c28c0b0655653c23d2p.jpg_960x960q75.jpg_.avif',
    description: 'Compact 2.4" capacitive touch display board powered by an ESP32 WROOM module.',
    url: 'https://s.click.aliexpress.com/e/_olgPirZ',
    tags: ['Touch', 'SD Card'],
  },
  {
    id: 'ultimate-marauder',
    name: 'Ultimate Marauder (The Wired Hatters)',
    image: 'https://static.wixstatic.com/media/35ea10_c352ea38cf4c4ba0982a44c7b898755d~mv2.jpg/v1/fill/w_500,h_333,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/35ea10_c352ea38cf4c4ba0982a44c7b898755d~mv2.jpg',
    description: 'Dual-ESP32 Marauder board by Wired Hatters.',
    url: 'https://www.wiredhatters.com/product-page/ultimate-marauder',
    tags: ['Flipper', 'GPS', 'SD Card', 'Touch'],
  },
  {
    id: 'esp32-wroom',
    name: 'ESP Rocket (The Wired Hatters)',
    image: 'https://static.wixstatic.com/media/35ea10_b537d4da88a84fddbd67a4029caa690c~mv2.jpg/v1/fill/w_475,h_333,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/35ea10_b537d4da88a84fddbd67a4029caa690c~mv2.jpg',
    description: 'Powered by an ESP32 WROOM UE, USB C and SMA antenna.',
    url: 'https://www.wiredhatters.com/product-page/esp-rocket',
    tags: ['Flipper'],
  },
  {
    id: 'esp32-c5-dev',
    name: 'ESP32-C5 Dev Board',
    image: 'https://ae-pic-a1.aliexpress-media.com/kf/S64ca5ad2310f41558d934e9f13b876e9S.png_960x960.png_.avif',
    description: 'Next-gen dual-band ready platform for advanced tests.',
    url: 'https://www.aliexpress.com/item/1005009128201189.html',
    tags: ['5GHz'],
  },
  {
    id: 'rabbit-phantom-labs',
    name: 'The Phantom (Rabbit-Labs)',
    image: 'https://4441fe46.delivery.rocketcdn.me/wp-content/uploads/2024/12/pham-scaled.jpg',
    description: 'ESP32-based device with SD card, resistive touch display and stylus.',
    url: 'https://rabbit-labs.com/product/the-phantom-by-rabbit-labs/?v=8bcc25c96aa5',
    tags: ['SD Card', 'Touch', 'Stylus'],
  },
  {
    id: 'cardputer-s3',
    name: 'ESP32-S3 Cardputer',
    image: 'https://shop.m5stack.com/cdn/shop/files/K132_v11_19_1200x1200.webp',
    description: 'Compact keyboard-style ESP32-S3 device with on-the-go control.',
    url: 'https://s.click.aliexpress.com/e/_oljsRNt',
    tags: ['Keyboard', 'SD Card', 'Infrared'],
  },
  {
    id: 'lilygo-t-embed-cc1101',
    name: 'T-Embed CC1101',
    image: 'https://lilygo.cc/cdn/shop/files/T-EMBED-CC1101-PLUS_6_4bda35c0-79ad-41ba-9aa7-52792d723ab1.jpg?v=1755075224&width=493',
    description: 'Built-in IR, Sub-Ghz and NFC with ESP32-S3.',
    url: 'https://www.lilygo.cc/products/t-embed-cc1101?bg_ref=69Mwul6hBm',
    tags: ['Infrared RX,TX', 'SD Card'],
  },
  {
    id: 'lilygo-twatch-s3-us',
    name: 'LilyGo T-Watch S3',
    image: 'https://lilygo.cc/cdn/shop/files/shipping_511a8c0c-8aca-4406-bcf0-0a70ea2d3a0e.jpg?v=1685513939&width=493',
    description: 'Wearable ESP32-S3 smartwatch with LoRa support.',
    url: 'https://www.lilygo.cc/products/t-watch-s3-us?bg_ref=69Mwul6hBm',
    tags: ['Touch', 'Infrared'],
  },
  {
    id: 'lilygo-t-deck',
    name: 'LilyGo T-Deck',
    image: 'https://lilygo.cc/cdn/shop/files/LILYGO-T-DECK_2_7fbd52e8-0aea-466e-8407-dee4aca5b381.jpg?v=1753155914&width=493',
    description: 'Modular developer board (ESP32-S3) designed for LoRa.',
    url: 'https://www.lilygo.cc/products/t-deck?bg_ref=69Mwul6hBm',
    tags: ['Touch', 'Keyboard'],
  },
  {
    id: 'lilygo-tdisplay-s3-touch',
    name: 'LilyGo T-Display S3 Touch',
    image: 'https://lilygo.cc/cdn/shop/products/LILYGO-T-Display-S3-Touch-version_5.jpg?v=1667462221&width=493',
    description: 'ESP32-S3 development board with integrated touch display.',
    url: 'https://www.lilygo.cc/products/t-display-s3?bg_ref=69Mwul6hBm',
    tags: ['Touch'],
  },
  {
    id: 'cyd-2432s024r',
    name: 'CYD-2432S024R Resistive',
    image: 'https://ae-pic-a1.aliexpress-media.com/kf/S59700c86dd9949c7a629e34fa38c7408y.jpg_960x960q75.jpg_.avif',
    description: '2.4" resistive touch display module (CYD-2432S024R).',
    url: 'https://s.click.aliexpress.com/e/_ombDm1D',
    tags: ['Touch', 'Resistive'],
  },
];

async function fetchGithubLatestRelease(repo) {
  const path = '/repos/' + repo.owner + '/' + repo.repo + '/releases/latest';
  const githubUrl = GITHUB_API_BASE + path;
  const proxyUrl = GITHUB_PROXY_BASE + '?url=' + encodeURIComponent(githubUrl);
  try {
    const proxyResp = await fetch(proxyUrl);
    if (proxyResp && proxyResp.ok) return proxyResp.json();
  } catch (e) {}
  const directResp = await fetch(githubUrl);
  if (!directResp.ok) throw new Error('Failed to fetch release');
  return directResp.json();
}

function renderReleasesApp(container) {
  if (!container) return;
  container.innerHTML = '<div class="ghostos-releases-status">Loading latest release...</div>';
  fetchGithubLatestRelease(GITHUB_FIRMWARE_REPO)
    .then((release) => {
      if (!release) {
        container.innerHTML = '<div class="ghostos-releases-status ghostos-releases-status--error">No release data available.</div>';
        return;
      }
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const totalDownloads = assets.reduce((acc, asset) => acc + (asset.download_count || 0), 0);
      const binAssets = assets.filter((asset) => asset && typeof asset.name === 'string' && /\.bin$/i.test(asset.name));
      const displayAssets = binAssets.length ? binAssets : assets;
      let dateString = '';
      if (release.published_at) {
        const d = new Date(release.published_at);
        dateString = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
      let html = '';
      html += '<div class="ghostos-releases-card">';
      html += '<div class="ghostos-releases-header">';
      html += '<div class="ghostos-chip">Latest</div>';
      html += '<div class="ghostos-releases-title">' + (release.tag_name || '') + '</div>';
      html += '</div>';
      html += '<div class="ghostos-releases-meta">';
      if (dateString) html += '<span>' + dateString + '</span>';
      html += '<span>' + totalDownloads + ' downloads</span>';
      html += '</div>';
      if (displayAssets.length) {
        html += '<ul class="ghostos-list ghostos-releases-assets">';
        displayAssets.forEach((asset) => {
          if (!asset || !asset.browser_download_url) return;
          html +=
            '<li><a href="' +
            asset.browser_download_url +
            '" target="_blank" rel="noopener" class="ghostos-link">' +
            asset.name +
            '</a></li>';
        });
        html += '</ul>';
      }
      html += '<div class="ghostos-button-row">';
      html +=
        '<a href="https://github.com/jaylikesbunda/Ghost_ESP/releases" target="_blank" rel="noopener" class="ghostos-button ghostos-button-primary">GitHub releases</a>';
      html +=
        '<a href="https://espressoflash.com" target="_blank" rel="noopener" class="ghostos-button">Web flasher</a>';
      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    })
    .catch(() => {
      container.innerHTML = '<div class="ghostos-releases-status ghostos-releases-status--error">Failed to load release data.</div>';
    });
}

function renderFlipperApp(container) {
  if (!container) return;
  container.innerHTML = '<div class="ghostos-releases-status">Loading Flipper release...</div>';
  fetchGithubLatestRelease(GITHUB_FLIPPER_REPO)
    .then((release) => {
      if (!release) {
        container.innerHTML = '<div class="ghostos-releases-status ghostos-releases-status--error">No Flipper release data available.</div>';
        return;
      }
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const installs = assets.reduce((acc, asset) => acc + (asset.download_count || 0), 0);
      let dateString = '';
      if (release.published_at) {
        const d = new Date(release.published_at);
        dateString = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
      let html = '';
      html += '<div class="ghostos-flipper-meta">';
      if (release.tag_name) html += '<span>Version ' + release.tag_name + '</span>';
      if (dateString) html += '<span>' + dateString + '</span>';
      html += '<span>' + installs + ' installs</span>';
      html += '</div>';
      if (release.name) {
        html += '<div class="ghostos-flipper-title">' + release.name + '</div>';
      }
      html += '<ul class="ghostos-flipper-features">';
      html += '<li>WiFi operations</li>';
      html += '<li>BLE controls</li>';
      html += '<li>GPS functions</li>';
      html += '<li>Device configuration</li>';
      html += '</ul>';
      container.innerHTML = html;
    })
    .catch(() => {
      container.innerHTML = '<div class="ghostos-releases-status ghostos-releases-status--error">Failed to load Flipper release data.</div>';
    });
}

function initBoardsApp(rootEl) {
  if (!rootEl) return;
  const listEl = rootEl.querySelector('.ghostos-boards-list');
  const filterButtons = Array.from(rootEl.querySelectorAll('.ghostos-boards-filter'));
  if (!listEl || !filterButtons.length) return;

  const render = (tag) => {
    const activeTag = tag && tag !== 'all' ? tag : null;
    const items = activeTag
      ? ghostosBoards.filter((b) => Array.isArray(b.tags) && b.tags.includes(activeTag))
      : ghostosBoards;
    listEl.innerHTML = '';
    items.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'ghostos-boards-card';
      const title = document.createElement('div');
      title.className = 'ghostos-boards-card-title';
      title.textContent = b.name;
      const tagsEl = document.createElement('div');
      tagsEl.className = 'ghostos-boards-card-tags';
      (b.tags || []).forEach((t) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'ghostos-boards-tag';
        tagEl.textContent = t;
        tagsEl.appendChild(tagEl);
      });
      let imageEl = null;
      if (b.image) {
        imageEl = document.createElement('img');
        imageEl.className = 'ghostos-boards-card-image';
        imageEl.src = b.image;
        imageEl.alt = b.name || '';
      }
      const desc = document.createElement('div');
      desc.className = 'ghostos-boards-card-description';
      desc.textContent = b.description;
      const footer = document.createElement('div');
      footer.className = 'ghostos-link-row';
      const link = document.createElement('a');
      link.className = 'ghostos-link';
      link.href = b.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open product page';
      footer.appendChild(link);
      card.appendChild(title);
      card.appendChild(tagsEl);
      if (imageEl) card.appendChild(imageEl);
      card.appendChild(desc);
      card.appendChild(footer);
      listEl.appendChild(card);
    });
  };

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      render(btn.getAttribute('data-filter'));
    });
  });

  render('all');
}

let ghostosSerialScriptLoading = false;
let ghostosSerialScriptLoaded = false;
const ghostosSerialScriptCallbacks = [];

function ensureGhostOsSerialAssets(callback) {
  if (typeof callback !== 'function') return;
  if (ghostosSerialScriptLoaded && window.renderGhostOSSerialApp) {
    setTimeout(callback, 0);
    return;
  }
  ghostosSerialScriptCallbacks.push(callback);
  if (ghostosSerialScriptLoading) return;
  ghostosSerialScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'js/ghostos-serial.js';
  script.async = true;
  script.onload = () => {
    ghostosSerialScriptLoaded = true;
    ghostosSerialScriptLoading = false;
    const pending = ghostosSerialScriptCallbacks.slice();
    ghostosSerialScriptCallbacks.length = 0;
    pending.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
  };
  script.onerror = () => {
    ghostosSerialScriptLoading = false;
    ghostosSerialScriptCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

let ghostosFlasherScriptLoading = false;
let ghostosFlasherScriptLoaded = false;
const ghostosFlasherScriptCallbacks = [];

let ghostosMirrorScriptLoading = false;
let ghostosMirrorScriptLoaded = false;
const ghostosMirrorScriptCallbacks = [];

function ensureGhostOsFlasherAssets(callback) {
  if (typeof callback !== 'function') return;
  if (ghostosFlasherScriptLoaded && window.renderGhostOSFlasherApp) {
    setTimeout(callback, 0);
    return;
  }
  ghostosFlasherScriptCallbacks.push(callback);
  if (ghostosFlasherScriptLoading) return;
  ghostosFlasherScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'js/ghostos-flasher.js';
  script.async = true;
  script.onload = () => {
    ghostosFlasherScriptLoaded = true;
    ghostosFlasherScriptLoading = false;
    const pending = ghostosFlasherScriptCallbacks.slice();
    ghostosFlasherScriptCallbacks.length = 0;
    pending.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
  };
  script.onerror = () => {
    ghostosFlasherScriptLoading = false;
    ghostosFlasherScriptCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

function ensureGhostOsMirrorAssets(callback) {
  if (typeof callback !== 'function') return;
  if (ghostosMirrorScriptLoaded && window.renderGhostOSMirrorApp) {
    setTimeout(callback, 0);
    return;
  }
  ghostosMirrorScriptCallbacks.push(callback);
  if (ghostosMirrorScriptLoading) return;
  ghostosMirrorScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'js/ghostos-mirror.js';
  script.async = true;
  script.onload = () => {
    ghostosMirrorScriptLoaded = true;
    ghostosMirrorScriptLoading = false;
    const pending = ghostosMirrorScriptCallbacks.slice();
    ghostosMirrorScriptCallbacks.length = 0;
    pending.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
  };
  script.onerror = () => {
    ghostosMirrorScriptLoading = false;
    ghostosMirrorScriptCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

const apps = [
  {
    id: 'hub',
    title: 'Desktop',
    icon: 'hub',
    type: 'internal',
    width: 640,
    height: 420,
  },
  {
    id: 'boards',
    title: 'Supported Boards',
    icon: 'boards',
    type: 'internal',
    width: 640,
    height: 420,
  },
  {
    id: 'releases',
    title: 'Firmware Releases',
    icon: 'releases',
    type: 'internal',
    width: 620,
    height: 360,
  },
  {
    id: 'flasher',
    title: 'Web Flasher',
    icon: 'ghost',
    type: 'internal',
    width: 900,
    height: 560,
  },
  {
    id: 'flipper',
    title: 'Flipper Zero App',
    icon: 'ghost',
    type: 'internal',
    width: 620,
    height: 380,
  },
  {
    id: 'roadmap',
    title: 'Project Roadmap',
    icon: 'roadmap',
    type: 'internal',
    width: 640,
    height: 420,
  },
  {
    id: 'feedback',
    title: 'Feedback',
    icon: 'feedback',
    type: 'internal',
    width: 520,
    height: 380,
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'settings',
    type: 'internal',
    width: 420,
    height: 260,
  },
  {
    id: 'serial',
    title: 'Serial Console',
    icon: 'terminal',
    type: 'internal',
    width: 720,
    height: 420,
  },
  {
    id: 'mirror',
    title: 'Screen Mirror',
    icon: 'mirror',
    type: 'internal',
    width: 720,
    height: 480,
  },
  {
    id: 'shop',
    title: 'GhostESP Merch',
    icon: 'shop',
    type: 'link',
    href: 'https://shop.ghostesp.net',
  },
];

const appsById = new Map(apps.map((a) => [a.id, a]));

function iconSvg(id, size) {
  const cls = size === 'large' ? 'ghostos-icon ghostos-icon-large' : 'ghostos-icon';
  if (id === 'hub') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="3" width="7" height="9" rx="1"></rect>' +
      '<rect x="14" y="3" width="7" height="5" rx="1"></rect>' +
      '<rect x="14" y="12" width="7" height="9" rx="1"></rect>' +
      '<rect x="3" y="16" width="7" height="5" rx="1"></rect>' +
      '</svg>'
    );
  }
  if (id === 'boards') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 20v2"></path>' +
      '<path d="M12 2v2"></path>' +
      '<path d="M17 20v2"></path>' +
      '<path d="M17 2v2"></path>' +
      '<path d="M2 12h2"></path>' +
      '<path d="M2 17h2"></path>' +
      '<path d="M2 7h2"></path>' +
      '<path d="M20 12h2"></path>' +
      '<path d="M20 17h2"></path>' +
      '<path d="M20 7h2"></path>' +
      '<path d="M7 20v2"></path>' +
      '<path d="M7 2v2"></path>' +
      '<rect x="4" y="4" width="16" height="16" rx="2"></rect>' +
      '<rect x="8" y="8" width="8" height="8" rx="1"></rect>' +
      '</svg>'
    );
  }
  if (id === 'releases') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 15V3"></path>' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
      '<path d="m7 10 5 5 5-5"></path>' +
      '</svg>'
    );
  }
  if (id === 'roadmap') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="6" cy="19" r="3"></circle>' +
      '<path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path>' +
      '<circle cx="18" cy="5" r="3"></circle>' +
      '</svg>'
    );
  }
  if (id === 'feedback') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>' +
      '</svg>'
    );
  }
  if (id === 'settings') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path>' +
      '<circle cx="12" cy="12" r="3"></circle>' +
      '</svg>'
    );
  }
  if (id === 'terminal') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 19h8"></path>' +
      '<path d="m4 17 6-6-6-6"></path>' +
      '</svg>'
    );
  }
  if (id === 'mirror') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="-0.5 0 25 25" aria-hidden="true" focusable="false">' +
      '<path d="M17.5 21.92C18.6263 21.9829 19.7318 21.5974 20.575 20.848C21.4181 20.0985 21.9304 19.0459 22 17.92V7.91998C21.9304 6.79403 21.4181 5.74147 20.575 4.992C19.7318 4.24253 18.6263 3.85707 17.5 3.91998H6.5C5.37366 3.85707 4.26814 4.24253 3.42499 4.992C2.58184 5.74147 2.06958 6.79403 2 7.91998" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<path d="M12.6094 19.24C12.0403 17.35 11.0092 15.6316 9.60938 14.24C8.22098 12.8361 6.50146 11.8044 4.60938 11.24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<path d="M5.10077 21.9199C4.93867 21.1714 4.56508 20.4851 4.02441 19.9426C3.48375 19.4002 2.79876 19.0244 2.05078 18.8599" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<path d="M8.83984 20.5798C8.46814 19.2691 7.76782 18.0751 6.8053 17.1108C5.84277 16.1466 4.64994 15.4439 3.33984 15.0698" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>'
    );
  }
  if (id === 'shop') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M16 10a4 4 0 0 1-8 0"></path>' +
      '<path d="M3.103 6.034h17.794"></path>' +
      '<path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8Z"></path>' +
      '</svg>'
    );
  }
  if (id === 'ghost') {
    return (
      '<svg class="' +
      cls +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M9 10h.01"></path>' +
      '<path d="M15 10h.01"></path>' +
      '<path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"></path>' +
      '</svg>'
    );
  }
  return (
    '<svg class="' +
    cls +
    '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<rect x="4" y="4" width="16" height="16" rx="2"></rect>' +
    '</svg>'
  );
}
const openWindows = new Map();
let zCounter = 1;
let launcherMenu = null;

function getWindowLayerRect() {
  if (!windowLayer) return null;
  return windowLayer.getBoundingClientRect();
}

function constrainWindowSize(win, hostRect) {
  if (!win || win.dataset.maximized === 'true') return;
  if (!hostRect) hostRect = getWindowLayerRect();
  if (!hostRect) return;
  const margin = isMobile() ? 12 : 32;
  const maxWidth = Math.max(200, hostRect.width - margin);
  const maxHeight = Math.max(160, hostRect.height - margin);
  const width = Math.min(win.offsetWidth, maxWidth);
  const height = Math.min(win.offsetHeight, maxHeight);
  win.style.width = width + 'px';
  win.style.height = height + 'px';
}

function clampWindowPosition(win, hostRect) {
  if (!win || win.dataset.maximized === 'true') return;
  if (!hostRect) hostRect = getWindowLayerRect();
  if (!hostRect) return;
  const rect = win.getBoundingClientRect();
  const maxX = Math.max(0, hostRect.width - rect.width);
  const maxY = Math.max(0, hostRect.height - rect.height);
  let left = rect.left - hostRect.left;
  let top = rect.top - hostRect.top;
  left = Math.max(0, Math.min(left, maxX));
  top = Math.max(0, Math.min(top, maxY));
  win.style.left = left + 'px';
  win.style.top = top + 'px';
}

function refitWindow(win) {
  const hostRect = getWindowLayerRect();
  if (!hostRect) return;
  constrainWindowSize(win, hostRect);
  clampWindowPosition(win, hostRect);
}

function refitAllWindows() {
  const hostRect = getWindowLayerRect();
  if (!hostRect) return;
  openWindows.forEach((win) => {
    if (!win) return;
    if (win.dataset.maximized === 'true') {
      win.style.left = '2px';
      win.style.top = '2px';
      win.style.width = 'calc(100% - 4px)';
      win.style.height = 'calc(100% - 4px)';
    } else {
      constrainWindowSize(win, hostRect);
      clampWindowPosition(win, hostRect);
    }
  });
}

function refitDesktopIcons() {
  if (!desktopIcons) return;
  const hostRect = desktopIcons.getBoundingClientRect();
  const icons = desktopIcons.querySelectorAll('.ghostos-desktop-icon');
  icons.forEach((icon) => {
    if (icon.style.position !== 'absolute') return;
    const iconRect = icon.getBoundingClientRect();
    let left = iconRect.left - hostRect.left;
    let top = iconRect.top - hostRect.top;
    const maxX = Math.max(0, hostRect.width - icon.offsetWidth);
    const maxY = Math.max(0, hostRect.height - icon.offsetHeight);
    left = Math.max(0, Math.min(left, maxX));
    top = Math.max(0, Math.min(top, maxY));
    icon.style.left = left + 'px';
    icon.style.top = top + 'px';
  });
}

function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function updateRootMode() {
  if (!root) return;
  if (isMobile()) root.classList.add('ghostos--mobile');
  else root.classList.remove('ghostos--mobile');
}

function updateClock() {
  if (!clockEl) return;
  const now = new Date();
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  clockEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
}

function renderDesktopIcons() {
  if (!desktopIcons) return;
  desktopIcons.innerHTML = '';
  apps.forEach((app) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghostos-desktop-icon';
    btn.dataset.appId = app.id;
    btn.innerHTML =
      '<div class="ghostos-desktop-icon-icon">' +
      iconSvg(app.icon, 'large') +
      '</div><div class="ghostos-desktop-icon-label">' +
      app.title +
      '</div>';
    btn.addEventListener('click', (event) => {
      if (btn.dataset.dragging === 'true') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      openApp(app.id);
    });
    desktopIcons.appendChild(btn);
  });
  enableDesktopIconDrag();
  refitDesktopIcons();
}

function enableDesktopIconDrag() {
  if (!desktopIcons) return;
  const icons = Array.from(desktopIcons.querySelectorAll('.ghostos-desktop-icon'));
  if (!icons.length) return;
  const pending = icons.filter((icon) => icon.dataset.draggable !== 'true');
  if (pending.length) {
    const hostRect = desktopIcons.getBoundingClientRect();
    const sample = pending[0];
    const iconWidth = sample.offsetWidth;
    const iconHeight = sample.offsetHeight;
    const styles = getComputedStyle(desktopIcons);
    const parseGap = (value) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 16;
    };
    const gapX = parseGap(styles.columnGap || styles.gap);
    const gapY = parseGap(styles.rowGap || styles.gap);
    if (isMobile()) {
      const columns = Math.max(1, Math.floor((hostRect.width + gapX) / (iconWidth + gapX)));
      pending.forEach((icon, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        icon.dataset.baseLeft = col * (iconWidth + gapX);
        icon.dataset.baseTop = row * (iconHeight + gapY);
      });
    } else {
      const maxRows = Math.max(1, Math.floor((hostRect.height + gapY) / (iconHeight + gapY)));
      const rows = Math.min(4, maxRows);
      pending.forEach((icon, index) => {
        const row = index % rows;
        const col = Math.floor(index / rows);
        icon.dataset.baseLeft = col * (iconWidth + gapX);
        icon.dataset.baseTop = row * (iconHeight + gapY);
      });
    }
  }
  icons.forEach((icon) => {
    if (icon.dataset.draggable === 'true') return;
    icon.dataset.draggable = 'true';
    const baseLeft = Number(icon.dataset.baseLeft || 0);
    const baseTop = Number(icon.dataset.baseTop || 0);
    icon.style.position = 'absolute';
    icon.style.left = baseLeft + 'px';
    icon.style.top = baseTop + 'px';
    icon.style.margin = '0';
    delete icon.dataset.baseLeft;
    delete icon.dataset.baseTop;
    let dragState = null;
    icon.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.button !== 0) return;
      event.preventDefault();
      const host = desktopIcons.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: iconRect.left - host.left,
        baseTop: iconRect.top - host.top,
        hostWidth: host.width,
        hostHeight: host.height,
      };
      icon.setPointerCapture(event.pointerId);
      icon.dataset.dragging = 'false';
    });
    icon.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      let x = dragState.baseLeft + dx;
      let y = dragState.baseTop + dy;
      const maxX = dragState.hostWidth - icon.offsetWidth;
      const maxY = dragState.hostHeight - icon.offsetHeight;
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      icon.style.left = x + 'px';
      icon.style.top = y + 'px';
      icon.dataset.dragging = 'true';
    });
    const endDrag = (event) => {
      if (!dragState || (event.pointerId && event.pointerId !== dragState.pointerId)) return;
      dragState = null;
      try {
        if (event.pointerId) icon.releasePointerCapture(event.pointerId);
      } catch (e) {}
      if (icon.dataset.dragging === 'true') {
        setTimeout(() => {
          if (icon.dataset.dragging === 'true') icon.dataset.dragging = '';
        }, 0);
      }
    };
    icon.addEventListener('pointerup', endDrag);
    icon.addEventListener('pointercancel', endDrag);
  });
}

function focusWindow(appId) {
  const win = openWindows.get(appId);
  if (!win || !windowLayer) return;
  const windows = windowLayer.querySelectorAll('.ghostos-window');
  windows.forEach((el) => {
    el.classList.toggle('ghostos-window--active', el === win);
  });
  zCounter += 1;
  win.style.zIndex = String(zCounter);
  if (activeTitleEl) {
    const app = appsById.get(appId);
    activeTitleEl.textContent = app ? app.title : 'Desktop';
  }
  if (taskbarWindows) {
    taskbarWindows.querySelectorAll('.ghostos-taskbar-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.appId === appId);
    });
  }
}

function ensureTaskbarItem(appId) {
  if (!taskbarWindows) return;
  const app = appsById.get(appId);
  if (!app) return;
  let btn = taskbarWindows.querySelector('[data-app-id="' + appId + '"]');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.appId = appId;
    btn.className = 'ghostos-taskbar-item';
    btn.innerHTML =
      '<span class="ghostos-taskbar-item-icon">' +
      iconSvg(app.icon) +
      '</span><span class="ghostos-taskbar-item-label">' +
      app.title +
      '</span>';
    btn.addEventListener('click', () => {
      const win = openWindows.get(appId);
      if (!win) return;
      const minimized = win.classList.contains('ghostos-window--minimized');
      if (minimized) {
        win.classList.remove('ghostos-window--minimized');
        btn.classList.remove('is-minimized');
        focusWindow(appId);
      } else if (win.classList.contains('ghostos-window--active')) {
        win.classList.add('ghostos-window--minimized');
        btn.classList.add('is-minimized');
        btn.classList.remove('is-active');
        if (activeTitleEl) activeTitleEl.textContent = 'Desktop';
      } else {
        focusWindow(appId);
      }
    });
    taskbarWindows.appendChild(btn);
  }
}

function closeWindow(appId) {
  const win = openWindows.get(appId);
  if (!win) return;
  if (appId === 'serial' && window.ghostosSerialConsole && typeof window.ghostosSerialConsole.disconnect === 'function') {
    try {
      window.ghostosSerialConsole.disconnect();
    } catch (e) {}
    window.ghostosSerialConsole = null;
  }
  if (appId === 'mirror' && window.ghostosMirror && typeof window.ghostosMirror.destroy === 'function') {
    try {
      window.ghostosMirror.destroy();
    } catch (e) {}
    window.ghostosMirror = null;
  }
  openWindows.delete(appId);
  win.remove();
  if (taskbarWindows) {
    const btn = taskbarWindows.querySelector('[data-app-id="' + appId + '"]');
    if (btn) btn.remove();
  }
  if (activeTitleEl) activeTitleEl.textContent = 'Desktop';
}

function toggleMaximize(win) {
  if (!windowLayer) return;
  const maximized = win.dataset.maximized === 'true';
  if (maximized) {
    const left = win.dataset.prevLeft;
    const top = win.dataset.prevTop;
    const width = win.dataset.prevWidth;
    const height = win.dataset.prevHeight;
    if (left && top && width && height) {
      win.style.left = left;
      win.style.top = top;
      win.style.width = width;
      win.style.height = height;
    }
    delete win.dataset.prevLeft;
    delete win.dataset.prevTop;
    delete win.dataset.prevWidth;
    delete win.dataset.prevHeight;
    win.dataset.maximized = 'false';
    refitWindow(win);
  } else {
    const rect = win.getBoundingClientRect();
    const hostRect = windowLayer.getBoundingClientRect();
    win.dataset.prevLeft = rect.left - hostRect.left + 'px';
    win.dataset.prevTop = rect.top - hostRect.top + 'px';
    win.dataset.prevWidth = rect.width + 'px';
    win.dataset.prevHeight = rect.height + 'px';
    win.style.left = '2px';
    win.style.top = '2px';
    win.style.width = 'calc(100% - 4px)';
    win.style.height = 'calc(100% - 4px)';
    win.dataset.maximized = 'true';
  }
}

function attachWindowInteractions(win, appId) {
  const titlebar = win.querySelector('.ghostos-window-titlebar');
  const controls = win.querySelector('.ghostos-window-controls');
  if (titlebar) {
    let dragState = null;
    titlebar.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.button !== 0) return;
      if (event.target.closest('.ghostos-window-controls')) return;
      event.preventDefault();
      if (!windowLayer) return;
      const rect = win.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      titlebar.setPointerCapture(event.pointerId);
      focusWindow(appId);
    });
    titlebar.addEventListener('pointermove', (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const hostRect = getWindowLayerRect();
      if (!hostRect) return;
      let x = event.clientX - hostRect.left - dragState.offsetX;
      let y = event.clientY - hostRect.top - dragState.offsetY;
      const visibleMargin = 40;
      const minX = Math.min(0, hostRect.width - win.offsetWidth);
      const minY = Math.min(0, hostRect.height - win.offsetHeight);
      const maxX = Math.max(0, hostRect.width - visibleMargin);
      const maxY = Math.max(0, hostRect.height - visibleMargin);
      x = Math.max(minX, Math.min(x, maxX));
      y = Math.max(minY, Math.min(y, maxY));
      win.style.left = x + 'px';
      win.style.top = y + 'px';
      win.dataset.maximized = 'false';
    });
    const endDrag = (event) => {
      if (!dragState) return;
      if (event.pointerId && event.pointerId !== dragState.pointerId) return;
      dragState = null;
      try {
        if (event.pointerId) titlebar.releasePointerCapture(event.pointerId);
      } catch (e) {}
    };
    titlebar.addEventListener('pointerup', endDrag);
    titlebar.addEventListener('pointercancel', endDrag);
    titlebar.addEventListener('dblclick', (event) => {
      if (event.target.closest('.ghostos-window-controls')) return;
      toggleMaximize(win);
    });
  }
  if (controls) {
    controls.addEventListener('click', (event) => {
      const btn = event.target.closest('.ghostos-window-control');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'close') closeWindow(appId);
      else if (action === 'minimize') {
        win.classList.add('ghostos-window--minimized');
        const tb = taskbarWindows && taskbarWindows.querySelector('[data-app-id="' + appId + '"]');
        if (tb) {
          tb.classList.add('is-minimized');
          tb.classList.remove('is-active');
        }
        if (activeTitleEl) activeTitleEl.textContent = 'Desktop';
      } else if (action === 'maximize') toggleMaximize(win);
    });
  }
  win.addEventListener('mousedown', () => focusWindow(appId));
}

function renderAppContent(app, body) {
  if (app.id === 'hub') {
    body.innerHTML =
      '<div class="ghostos-pane ghostos-hub">' +
      '<h1>GhostESP Home</h1>' +
      '<p class="ghostos-hub-subtitle">Choose what you want to do and we\'ll take you there.</p>' +
      '<div class="ghostos-hub-grid">' +
      '<div class="ghostos-hub-card">' +
      '<h3 class="ghostos-hub-card-title">Get started with hardware</h3>' +
      '<p class="ghostos-hub-card-text">See supported boards and pick one that matches your device.</p>' +
      '<div class="ghostos-button-row">' +
      '<button class="ghostos-button ghostos-button-primary" data-open-app="boards">Open supported boards</button>' +
      '</div>' +
      '</div>' +
      '<div class="ghostos-hub-card">' +
      '<h3 class="ghostos-hub-card-title">Flash firmware</h3>' +
      '<p class="ghostos-hub-card-text">Grab the latest GhostESP firmware or use the web flasher.</p>' +
      '<div class="ghostos-button-row">' +
      '<button class="ghostos-button ghostos-button-primary" data-open-app="releases">View firmware releases</button>' +
      '<a href="https://espressoflash.com" target="_blank" rel="noopener" class="ghostos-button">Open web flasher</a>' +
      '</div>' +
      '</div>' +
      '<div class="ghostos-hub-card">' +
      '<h3 class="ghostos-hub-card-title">Flipper companion app</h3>' +
      '<p class="ghostos-hub-card-text">Install or update the GhostESP app on your Flipper Zero.</p>' +
      '<div class="ghostos-button-row">' +
      '<button class="ghostos-button" data-open-app="flipper">Open Flipper app info</button>' +
      '</div>' +
      '</div>' +
      '<div class="ghostos-hub-card">' +
      '<h3 class="ghostos-hub-card-title">Roadmap and feedback</h3>' +
      '<p class="ghostos-hub-card-text">See what\'s planned next or send feedback and board requests.</p>' +
      '<div class="ghostos-button-row">' +
      '<button class="ghostos-button" data-open-app="roadmap">View roadmap</button>' +
      '<button class="ghostos-button" data-open-app="feedback">Send feedback</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="ghostos-link-row ghostos-hub-links">' +
      '<a href="https://github.com/jaylikesbunda/Ghost_ESP" target="_blank" rel="noopener" class="ghostos-link">Firmware GitHub</a>' +
      '<a href="https://github.com/jaylikesbunda/ghost_esp_app" target="_blank" rel="noopener" class="ghostos-link">Flipper app GitHub</a>' +
      '<a href="https://discord.gg/5cyNmUMgwh" target="_blank" rel="noopener" class="ghostos-link">Discord server</a>' +
      '</div>' +
      '</div>';
  } else if (app.id === 'boards') {
    body.innerHTML =
      '<div class="ghostos-pane ghostos-boards">' +
      '<h2>Supported boards</h2>' +
      '<p>Boards known to work well with GhostESP. Filter by capabilities and jump to vendor pages.</p>' +
      '<div class="ghostos-boards-filters">' +
      '<button type="button" class="ghostos-button ghostos-boards-filter is-active" data-filter="all">All</button>' +
      '<button type="button" class="ghostos-button ghostos-boards-filter" data-filter="Touch">Touch</button>' +
      '<button type="button" class="ghostos-button ghostos-boards-filter" data-filter="Flipper">Flipper</button>' +
      '</div>' +
      '<div class="ghostos-boards-list"></div>' +
      '<div class="ghostos-link-row">' +
      '<a href="../boards.html" target="_blank" rel="noopener" class="ghostos-link">Open full boards page</a>' +
      '</div>' +
      '</div>';
    initBoardsApp(body);
  } else if (app.id === 'releases') {
    body.innerHTML =
      '<div class="ghostos-pane ghostos-releases">' +
      '<h2>Firmware releases</h2>' +
      '<p>Live data from the latest GhostESP firmware release.</p>' +
      '<div class="ghostos-releases-content"></div>' +
      '</div>';
    const container = body.querySelector('.ghostos-releases-content');
    renderReleasesApp(container);
  } else if (app.id === 'flipper') {
    body.innerHTML =
      '<div class="ghostos-pane ghostos-flipper">' +
      '<h2>Flipper Zero app</h2>' +
      '<p>Install the latest GhostESP Flipper companion and see basic release info.</p>' +
      '<div class="ghostos-pane-section ghostos-flipper-content"></div>' +
      '<div class="ghostos-button-row">' +
      '<a href="https://cdn.spookytools.com/assets/ghost_esp.fap" target="_blank" rel="noopener" class="ghostos-button ghostos-button-primary">Download latest FAP</a>' +
      '<a href="https://github.com/jaylikesbunda/ghost_esp_app/releases" target="_blank" rel="noopener" class="ghostos-button">GitHub releases</a>' +
      '<a href="https://lab.flipper.net/apps/ghost_esp" target="_blank" rel="noopener" class="ghostos-button">App Catalog</a>' +
      '</div>' +
      '</div>';
    const container = body.querySelector('.ghostos-flipper-content');
    renderFlipperApp(container);
  } else if (app.id === 'flasher') {
    body.innerHTML = '<div class="ghostos-flasher-root"></div>';
    const container = body.querySelector('.ghostos-flasher-root');
    ensureGhostOsFlasherAssets(() => {
      if (window.renderGhostOSFlasherApp && container) {
        window.renderGhostOSFlasherApp(container);
      }
    });
  } else if (app.id === 'roadmap') {
    body.innerHTML =
      '<div class="ghostos-pane">' +
      '<h2>Roadmap</h2>' +
      '<div class="ghostos-pane-section">' +
      '<h3>Upcoming: Revival v1.8</h3>' +
      '<ul class="ghostos-list">' +
      '<li>CLI refactor and filesystem management.</li>' +
      '<li>Karma-style attack workflow.</li>' +
      '<li>Deauth burst + handshake capture tweaks.</li>' +
      '<li>Menu and Web UI layout refinements.</li>' +
      '</ul>' +
      '</div>' +
      '<div class="ghostos-pane-section">' +
      '<h3>Recent: Revival v1.7.x</h3>' +
      '<ul class="ghostos-list">' +
      '<li>Dual ESP32 communication and Web UI control.</li>' +
      '<li>Power saving improvements on supported boards.</li>' +
      '<li>Additional board profiles and display support.</li>' +
      '</ul>' +
      '</div>' +
      '<div class="ghostos-link-row">' +
      '<a href="../roadmap.html" target="_blank" rel="noopener" class="ghostos-link">Open detailed roadmap</a>' +
      '</div>' +
      '</div>';
  } else if (app.id === 'settings') {
    body.innerHTML =
      '<div class="ghostos-pane">' +
      '<h2>Settings</h2>' +
      '<div class="ghostos-pane-section">' +
      '<p>Customize the desktop background color.</p>' +
      '<label class="ghostos-settings-row">' +
      '<span>Background</span>' +
      '<input type="color" id="ghostos-setting-bg" />' +
      '</label>' +
      '<div class="ghostos-button-row">' +
      '<button type="button" class="ghostos-button ghostos-button-primary" id="ghostos-setting-bg-apply">Apply</button>' +
      '<button type="button" class="ghostos-button" id="ghostos-setting-bg-reset">Reset</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    const colorInput = body.querySelector('#ghostos-setting-bg');
    const applyBtn = body.querySelector('#ghostos-setting-bg-apply');
    const resetBtn = body.querySelector('#ghostos-setting-bg-reset');

    if (colorInput) {
      const current = ghostosSettings && ghostosSettings.backgroundColor;
      if (current && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(current)) {
        colorInput.value = current;
      } else {
        colorInput.value = '#050505';
      }
    }

    if (applyBtn && colorInput) {
      applyBtn.addEventListener('click', () => {
        const value = colorInput.value;
        if (!value) return;
        if (!ghostosSettings || typeof ghostosSettings !== 'object') ghostosSettings = {};
        ghostosSettings.backgroundColor = value;
        applyGhostosBackgroundFromSettings();
        saveGhostosSettings(ghostosSettings);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        ghostosSettings = {};
        applyGhostosBackgroundFromSettings();
        saveGhostosSettings(ghostosSettings);
        if (colorInput) colorInput.value = '#050505';
      });
    }
  } else if (app.id === 'serial') {
    body.innerHTML = '<div class="ghostos-serial-root"></div>';
    const container = body.querySelector('.ghostos-serial-root');
    ensureGhostOsSerialAssets(() => {
      if (window.renderGhostOSSerialApp && container) {
        window.renderGhostOSSerialApp(container);
      }
    });
  } else if (app.id === 'mirror') {
    body.innerHTML = '<div class="ghostos-mirror-root"></div>';
    const container = body.querySelector('.ghostos-mirror-root');
    ensureGhostOsMirrorAssets(() => {
      if (window.renderGhostOSMirrorApp && container) {
        window.renderGhostOSMirrorApp(container);
      }
    });
  } else if (app.id === 'feedback') {
    body.innerHTML =
      '<div class="ghostos-pane">' +
      '<h2>Feedback</h2>' +
      '<p>Use the feedback form to propose display support, features or fixes.</p>' +
      '<div class="ghostos-button-row">' +
      '<a href="../feedback.html" target="_blank" rel="noopener" class="ghostos-button ghostos-button-primary">Open feedback form</a>' +
      '</div>' +
      '</div>';
  } else {
    body.innerHTML = '<div class="ghostos-pane"><p>Placeholder window for ' + app.title + '.</p></div>';
  }
}

function createWindow(appId) {
  const app = appsById.get(appId);
  if (!app || !windowLayer) return;
  if (openWindows.has(appId)) {
    const existing = openWindows.get(appId);
    existing.classList.remove('ghostos-window--minimized');
    focusWindow(appId);
    return;
  }
  if (app.type === 'link') {
    window.open(app.href, '_blank', 'noopener');
    return;
  }
  const win = document.createElement('div');
  win.className = 'ghostos-window ghostos-window--active';
  win.dataset.appId = appId;
  const baseLeft = 40 + openWindows.size * 24;
  const baseTop = 26 + openWindows.size * 18;
  win.style.left = baseLeft + 'px';
  win.style.top = baseTop + 'px';
  if (app.width) win.style.width = app.width + 'px';
  if (app.height) win.style.height = app.height + 'px';
  zCounter += 1;
  win.style.zIndex = String(zCounter);
  win.innerHTML =
    '<div class="ghostos-window-titlebar">' +
    '<div class="ghostos-window-title">' +
    '<span class="ghostos-window-title-icon">' + iconSvg(app.icon) + '</span>' +
    '<span>' + app.title + '</span>' +
    '</div>' +
    '<div class="ghostos-window-controls">' +
    '<button type="button" class="ghostos-window-control" data-action="minimize">–</button>' +
    '<button type="button" class="ghostos-window-control" data-action="maximize">▢</button>' +
    '<button type="button" class="ghostos-window-control" data-action="close">×</button>' +
    '</div>' +
    '</div>' +
    '<div class="ghostos-window-body"></div>';
  const body = win.querySelector('.ghostos-window-body');
  if (body) renderAppContent(app, body);
  windowLayer.appendChild(win);
  openWindows.set(appId, win);
  ensureTaskbarItem(appId);
  focusWindow(appId);
  attachWindowInteractions(win, appId);
  refitWindow(win);
}

function openApp(appId) {
  const app = appsById.get(appId);
  if (!app) return;
  createWindow(appId);
}

function handleDelegatedClicks() {
  if (!windowLayer) return;
  windowLayer.addEventListener('click', (event) => {
    const target = event.target.closest('[data-open-app]');
    if (!target) return;
    const id = target.getAttribute('data-open-app');
    if (id) openApp(id);
  });
}

function ensureLauncherMenu() {
  if (!root || launcherMenu) return;
  const menu = document.createElement('div');
  menu.className = 'ghostos-launcher-menu';
  let html = '<div class="ghostos-launcher-menu-header">Apps</div>';
  html += '<div class="ghostos-launcher-menu-list">';
  apps.forEach((app) => {
    html +=
      '<button type="button" class="ghostos-launcher-menu-item" data-app-id="' +
      app.id +
      '">' +
      '<span class="ghostos-launcher-menu-item-icon">' +
      iconSvg(app.icon) +
      '</span>' +
      '<span class="ghostos-launcher-menu-item-label">' +
      app.title +
      '</span>' +
      '</button>';
  });
  html += '</div>';
  menu.innerHTML = html;
  root.appendChild(menu);
  launcherMenu = menu;
  launcherMenu.addEventListener('click', (event) => {
    const btn = event.target.closest('.ghostos-launcher-menu-item');
    if (!btn) return;
    const id = btn.dataset.appId;
    if (!id) return;
    openApp(id);
    closeLauncherMenu();
  });
}

function openLauncherMenu() {
  if (!launcherMenu) return;
  launcherMenu.classList.add('ghostos-launcher-menu--open');
}

function closeLauncherMenu() {
  if (!launcherMenu) return;
  launcherMenu.classList.remove('ghostos-launcher-menu--open');
}

function setupLauncherMenu() {
  if (!launcherButton) return;
  launcherButton.addEventListener('click', (event) => {
    event.stopPropagation();
    ensureLauncherMenu();
    if (!launcherMenu) return;
    const isOpen = launcherMenu.classList.contains('ghostos-launcher-menu--open');
    if (isOpen) closeLauncherMenu();
    else openLauncherMenu();
  });
  document.addEventListener('click', (event) => {
    if (!launcherMenu) return;
    if (!launcherMenu.classList.contains('ghostos-launcher-menu--open')) return;
    if (launcherButton && launcherButton.contains(event.target)) return;
    if (launcherMenu.contains(event.target)) return;
    closeLauncherMenu();
  });
}

function createLoginOverlay() {
  if (!root) return;
  const overlay = document.createElement('div');
  overlay.className = 'ghostos-login-overlay';
  overlay.innerHTML =
    '<div class="ghostos-login-window">' +
    '<div class="ghostos-login-header">' +
    '<span class="ghostos-login-logo"><img src="images/favicon.ico" alt="GhostESP" width="18" height="18"></span>' +
    '<span class="ghostos-login-title">GhostOS</span>' +
    '</div>' +
    '<div class="ghostos-login-body">' +
    '<div class="ghostos-login-loading">Loading environment...</div>' +
    '<form class="ghostos-login-form">' +
    '<label class="ghostos-login-field"><span>Username</span>' +
    '<input type="text" name="username" autocomplete="username" value="ghostgoo69240"></label>' +
    '<label class="ghostos-login-field"><span>Password</span>' +
    '<input type="password" name="password" autocomplete="current-password"></label>' +
    '<button type="submit" class="ghostos-button ghostos-button-primary ghostos-login-submit">Sign in</button>' +
    '</form>' +
    '</div>' +
    '</div>';
  root.appendChild(overlay);
  const form = overlay.querySelector('.ghostos-login-form');
  const loading = overlay.querySelector('.ghostos-login-loading');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (overlay.dataset.state === 'submitting') return;
      overlay.dataset.state = 'submitting';
      if (loading) loading.textContent = 'Signing in...';
      setTimeout(() => {
        overlay.classList.add('ghostos-login-overlay--hidden');
        setTimeout(() => {
          overlay.remove();
          openApp('hub');
        }, 250);
      }, 700);
    });
  }
}

function init() {
  updateRootMode();
  applyGhostosBackgroundFromSettings();
  updateClock();
  renderDesktopIcons();
  handleDelegatedClicks();
  createLoginOverlay();
  if (menuLogo) menuLogo.innerHTML = '<img src="images/favicon.ico" alt="GhostESP" width="16" height="16">';
  setupLauncherMenu();
  window.addEventListener('resize', () => {
    updateRootMode();
    refitAllWindows();
    refitDesktopIcons();
  });
  setInterval(updateClock, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
