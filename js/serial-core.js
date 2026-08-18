// serial-core.js — shared Web Serial connection + install engine.
// Used by the unified marketplace store (and reusable by any page that
// talks to a RUNNING GhostESP console, e.g. the serial console).
(function () {
  const BAUD_CANDIDATES = [115200, 460800];
  const UPLOAD_TIMEOUT_MS = 45000;
  const CHUNK_BYTES = 256;
  const MAX_LINE_BYTES = 512;
  const ENC = new TextEncoder();
  const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;

  const INSTALL_PATHS = {
    apps: '/mnt/ghostesp/apps',
    themes: '/mnt/ghostesp/themes',
    scripts: '/mnt/ghostesp/scripts'
  };

  function supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function b64encode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function firstMatch(buffer, patterns) {
    for (const pattern of patterns) {
      const index = buffer.indexOf(pattern);
      if (index !== -1) return index;
    }
    return -1;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeChipModel(model) {
    const lower = String(model || '').toLowerCase().replace(/\s+/g, '');
    if (lower === 'esp32') return 'esp32';
    if (lower.startsWith('esp32') && lower.includes('-')) return lower.replace(/-/g, '');
    return lower;
  }

  class SerialLink {
    constructor(port) {
      this.port = port;
      this.closed = false;
    }

    async open(baudRate) {
      await this.port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
      this.closed = false;
    }

    async drain(ms = 300) {
      let reader;
      try { reader = this.port.readable.getReader(); } catch (error) { return; }
      const deadline = Date.now() + ms;
      try {
        while (Date.now() < deadline) {
          const { value, done } = await Promise.race([
            reader.read(),
            new Promise((resolve) => setTimeout(() => resolve({ value: null, done: true }), 100))
          ]);
          if (done || !value) break;
        }
      } catch (error) {}
      try { reader.releaseLock(); } catch (error) {}
    }

    async sendCommand(cmd, markers, timeoutMs = 5000) {
      if (this.closed || !this.port.writable) {
        return { text: '', matched: false, garbled: false, closed: true };
      }

      await this.drain(150);

      const writer = this.port.writable.getWriter();
      await writer.write(ENC.encode(cmd + '\n'));
      try { writer.releaseLock(); } catch (error) {}

      const markerList = Array.isArray(markers) ? markers : [markers];
      const reader = this.port.readable.getReader();
      const deadline = Date.now() + timeoutMs;
      let response = '';
      let rawBytes = 0;
      let nonTextBytes = 0;

      try {
        while (Date.now() < deadline) {
          const remaining = Math.max(50, deadline - Date.now());
          const { value, done } = await Promise.race([
            reader.read(),
            new Promise((resolve) => setTimeout(() => resolve({ value: null, done: true }), remaining))
          ]);
          if (done) break;
          if (!value) continue;

          rawBytes += value.length;
          let asciiChunk = '';
          for (let i = 0; i < value.length; i++) {
            const byte = value[i];
            const isTextByte = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte === 0x1b;
            if (!isTextByte) nonTextBytes++;
            if (isTextByte) asciiChunk += String.fromCharCode(byte);
          }
          response += asciiChunk.replace(/\x1b\[[0-9;]*m/g, '');
          if (firstMatch(response, markerList) !== -1) break;
        }
      } catch (error) {}
      try { reader.releaseLock(); } catch (error) {}

      const cleaned = response.replace(/[\x00-\x1f\x7f-\xff\uFFFD]/g, '').trim();
      const garbled = rawBytes > 20 && (nonTextBytes / rawBytes > 0.35 || cleaned.length < rawBytes * 0.3);
      const matched = firstMatch(response, markerList) !== -1;
      return { text: response, matched, garbled, closed: false };
    }

    disconnect() {
      try { this.port.close(); } catch (error) {}
      this.closed = true;
    }
  }

  async function fetchChipInfo(link, detectWrongBaud) {
    let last = { text: '', matched: false, garbled: false };
    for (let attempt = 1; attempt <= 2; attempt++) {
      last = await link.sendCommand('chipinfo', ['[CHIPINFO_END]'], 5000);

      if (detectWrongBaud && last.garbled) return { wrongBaud: true };
      if (last.matched) {
        const modelMatch = last.text.match(/Model\s*:\s*([^\r\n]+)/i);
        return { model: modelMatch ? normalizeChipModel(modelMatch[1]) : null };
      }
      if (/unsupported\s+command|unknown\s+command|not\s+recognized/i.test(last.text)) {
        return { model: null, notSupported: true };
      }
      if (attempt < 2 && !last.text.includes('[CHIPINFO_START]')) {
        await sleep(250);
      }
    }
    const cleaned = last.text.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (cleaned.length >= 12 || /ghost>|command|commands:/i.test(cleaned)) {
      return { model: null, gotResponse: true };
    }
    return { model: null, noResponse: true };
  }

  async function openAndIdentify(port, onStatus) {
    for (const baud of BAUD_CANDIDATES) {
      if (onStatus) onStatus(`Connecting at ${baud} baud...`);
      const link = new SerialLink(port);
      try {
        await link.open(baud);
      } catch (error) {
        continue;
      }

      const result = await fetchChipInfo(link, true);

      if (result.wrongBaud || result.noResponse) {
        link.disconnect();
        await sleep(200);
        continue;
      }

      return { link, baud, model: result.model || null };
    }
    return null;
  }

  async function connect(onStatus) {
    if (!supported()) throw new Error('Web Serial is not supported in this browser. Use Chrome, Edge, or Opera on desktop.');
    if (onStatus) onStatus('Select your device in the browser dialog...');
    const port = await navigator.serial.requestPort();
    if (!port) throw new Error('No device selected');

    if (onStatus) onStatus('Detecting baud rate...');
    const connected = await openAndIdentify(port, onStatus);
    if (!connected) {
      throw new Error('Could not detect the device. Is GhostESP booted and the serial console responsive?');
    }
    return { port, link: connected.link, baud: connected.baud, model: connected.model };
  }

  function closeSession(session) {
    if (!session) return;
    try {
      if (session.link) session.link.disconnect();
    } catch (error) {}
    session.link = null;
    session.port = null;
  }

  async function ensureDir(link, dir) {
    const status = await link.sendCommand('sd status', ['SD:STATUS:mounted=', 'SD:ERR'], 15000);
    if (!status.text || status.text.includes('SD:ERR')) {
      throw new Error('Could not read the SD card. Is one inserted?');
    }
    const mounted = /SD:STATUS:mounted=(true|false)/.exec(status.text);
    if (mounted && mounted[1] !== 'true') {
      throw new Error('The SD card is not mounted. Insert a card and try again.');
    }

    const mkdir = await link.sendCommand(`sd mkdir ${dir}`, ['SD:OK:', 'SD:ERR:'], 20000);
    if (mkdir.text.includes('SD:OK:')) return;
    if (mkdir.text.includes('SD:ERR:mkdir_failed')) return;
    throw new Error('Could not create the folder on the SD card.');
  }

  async function uploadFile(link, dir, filename, bytes, onProgress) {
    const total = bytes.length;
    let offset = 0;
    const path = `${dir}/${filename}`;

    while (offset < total) {
      const length = Math.min(CHUNK_BYTES, total - offset);
      const chunk = bytes.slice(offset, offset + length);
      const payload = b64encode(chunk);

      const commandLength = ('sd append ' + path + ' ' + payload + '\n').length;
      if (commandLength > MAX_LINE_BYTES) {
        throw new Error('Device console buffer too small for upload chunks');
      }

      const isFirst = offset === 0;
      const cmd = isFirst ? `sd write ${path} ${payload}` : `sd append ${path} ${payload}`;

      const res = await link.sendCommand(cmd, ['SD:OK', 'SD:ERR'], UPLOAD_TIMEOUT_MS);
      const response = res.text;

      if (!response) throw new Error('Device stopped responding during upload');
      if (response.includes('SD:ERR')) {
        const match = response.match(/SD:ERR:([^\r\n]+)/);
        throw new Error(`Device write error: ${match ? match[1].trim() : 'unknown'}`);
      }
      if (!response.includes('SD:OK')) throw new Error('Unexpected response from device during upload');

      offset += length;
      if (onProgress) onProgress(offset, total);
    }
  }

  function proxyBaseUrl() {
    const proxyPath = '/.netlify/functions/app-proxy';
    if (typeof location !== 'undefined' && location.protocol && location.protocol.startsWith('http')) {
      return `${location.origin}${proxyPath}`;
    }
    return `https://ghostesp.net${proxyPath}`;
  }

  async function readDirectResponse(response, onProgress) {
    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10) || 0;
    if (contentLength > MAX_DOWNLOAD_BYTES) throw new Error('Package is too large to install this way.');

    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (received > MAX_DOWNLOAD_BYTES) throw new Error('Package is too large to install this way.');
            if (onProgress) onProgress(received, contentLength);
          }
        }
      } finally {
        try { await reader.releaseLock(); } catch (error) {}
      }
      const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (bytes.length === 0) throw new Error('Downloaded package is empty');
      return bytes;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length === 0) throw new Error('Downloaded package is empty');
    if (onProgress) onProgress(bytes.length, bytes.length);
    return bytes;
  }

  function decodeBase64(b64) {
    const cleaned = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    const bytes = new Uint8Array(Math.floor((cleaned.length * 3) / 4));
    let out = 0;
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned.charCodeAt(i);
      let value;
      if (char >= 65 && char <= 90) value = char - 65;
      else if (char >= 97 && char <= 122) value = char - 71;
      else if (char >= 48 && char <= 57) value = char + 4;
      else if (char === 43) value = 62;
      else if (char === 47) value = 63;
      else continue;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes[out++] = (buffer >> bits) & 0xff;
      }
    }
    return bytes.slice(0, out);
  }

  async function download(url, onProgress) {
    const needsProxy = /^https:\/\/gesp\.fuckyourcdn\.com\//i.test(url) || /^(https?:\/\/)?raw\.(githubusercontent|github)\.com\//i.test(url);
    if (!needsProxy) {
      try {
        const direct = await fetch(url, { mode: 'cors' });
        if (direct.ok) return await readDirectResponse(direct, onProgress);
      } catch (error) {}
    }

    const proxyBase = `${proxyBaseUrl()}?url=${encodeURIComponent(url)}`;
    let metaResponse;
    try {
      metaResponse = await fetch(proxyBase);
    } catch (error) {
      throw new Error('Download failed: cannot reach the app proxy. If testing locally, run `netlify dev` or use the live site.');
    }
    if (!metaResponse.ok) throw new Error('Download failed: the app proxy is unavailable. Download the package manually instead.');
    const info = await metaResponse.json();
    if (!info || !info.ok) throw new Error((info && info.message) || 'Download failed: proxy error.');

    const total = info.total || 0;
    const chunkSize = 512 * 1024;
    const chunks = [];
    let received = 0;

    while (true) {
      const partResponse = await fetch(`${proxyBase}&start=${received}&length=${chunkSize}`);
      if (!partResponse.ok) throw new Error('Download failed during chunked transfer.');
      const part = await partResponse.json();
      if (!part || !part.ok || !part.data) {
        throw new Error((part && part.message) || 'Download failed during chunked transfer.');
      }

      const bytes = decodeBase64(part.data);
      chunks.push(bytes);
      received += bytes.length;
      if (onProgress) onProgress(received, total);

      if (total > 0 && received >= total) break;
      if (bytes.length < chunkSize) break;
      if (received > MAX_DOWNLOAD_BYTES) throw new Error('Package is too large to install this way.');
    }

    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (bytes.length === 0) throw new Error('Downloaded package is empty');
    return bytes;
  }

  // Installs one package onto a connected device.
  // opts: {
  //   kind: 'apps' | 'themes' | 'scripts',
  //   session: { link, ... } | null (will connect if null),
  //   downloadUrl: string,
  //   filename: string,
  //   packageId: string | null        // scripts only: folder name on the SD
  //   makeManifest: (filename) => object | null   // only scripts
  //   onStatus: fn(string),
  //   onProgress: fn(done, total),
  // }
  async function install(opts) {
    if (!supported()) throw new Error('Web Serial is not supported in this browser. Use Chrome, Edge, or Opera on desktop.');
    const { kind, session, downloadUrl, filename, packageId, makeManifest, onStatus, onProgress } = opts;
    if (!INSTALL_PATHS[kind]) throw new Error(`Unknown install type: ${kind}`);

    let local = session;
    let ownConnection = false;
    if (!local || !local.link) {
      onStatus('Detecting device… connect when prompted.');
      local = await connect(onStatus);
      ownConnection = true;
    }
    const link = local.link;
    const dir = INSTALL_PATHS[kind];
    const uiLabel = kind === 'apps' ? 'App' : kind === 'themes' ? 'Theme pack' : 'Script';

    try {
      onStatus('Downloading ' + uiLabel + '…');
      const data = await download(downloadUrl, onProgress);

      if (data.length > 4 * 1024 * 1024) {
        const proceed = window.confirm(
          `This package is ${formatSize(data.length)}. Uploading over serial can take a long time.\n\n` +
          `Continue anyway? (Or cancel and copy the file to your SD card instead.)`
        );
        if (!proceed) throw new Error('Install cancelled');
      }

      onStatus('Preparing SD card…');
      if (kind === 'scripts') {
        const packageFolder = encodeURIComponent(packageId || filename.split('.')[0]);
        await ensureDir(link, `${dir}/${packageFolder}`);
      } else {
        await ensureDir(link, dir);
      }

      if (kind === 'scripts') {
        const scriptId = packageId || filename.split('.')[0];
        const packageFolder = encodeURIComponent(scriptId);
        if (onProgress) onProgress(0, data.length);
        onStatus(`Uploading ${uiLabel} (0%)…`);
        await uploadFile(link, `${dir}/${packageFolder}`, filename, data, onProgress);

        const manifest = makeManifest ? makeManifest(filename) : null;
        if (manifest) {
          const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
          onStatus('Writing manifest…');
          await uploadFile(link, `${dir}/${packageFolder}`, 'manifest.json', manifestBytes, () => {});
        }
        onStatus(`Installed! Open GhostScript and run ${scriptId}.`);
      } else {
        onProgress(0, data.length);
        onStatus(`Uploading ${uiLabel} (0%)…`);
        await uploadFile(link, dir, filename, data, onProgress);

        if (kind === 'apps') {
          onStatus('Reloading app gallery…');
          const res = await link.sendCommand('apps reload', ['apps reloaded', 'apps reload failed'], 90000);
          if (res.text.includes('apps reload failed')) {
            throw new Error('App installed but the gallery failed to reload: ' + res.text.trim());
          }
          onStatus('Installed! Check the app gallery on your device.');
        } else {
          onStatus('Uploaded! Select it in Settings → Display & Brightness → Appearance → Asset Pack.');
        }
      }
    } finally {
      if (ownConnection) {
        closeSession(local);
      }
    }
  }

  window.SerialCore = {
    supported,
    connect,
    closeSession,
    ensureDir,
    uploadFile,
    download,
    install,
    formatSize,
    INSTALL_PATHS
  };
})();