const CRASH_PROXY_BASE = "https://fragrant-flower-ba0b.creepersbeast.workers.dev/?url=";
const CRASH_DECODER_BUILD = "20260304j";
const CRASH_MANIFEST_URL =
  "https://raw.githubusercontent.com/GhostESP-Revival/GhostESP/Development-deki/firmware-manifest.json";
const CONFIG_TEMPLATE_ALIASES = {
  somethingsomething: "Banshee_C5",
  somethingsomething2: "Banshee_S3",
};
const GHOST_ESP_NICE_NAMES = {
  "esp32-generic.zip": "Generic ESP32 / FlipperHub Rocket",
  "esp32s2-generic.zip": "Generic ESP32-S2",
  "esp32s3-generic.zip": "Generic ESP32-S3",
  "esp32c3-generic.zip": "Generic ESP32-C3",
  "esp32c6-generic.zip": "Generic ESP32-C6",
  "esp32c5-generic.zip": "Generic ESP32-C5",
  "esp32c5-generic-v01.zip": "Generic ESP32-C5 v01",
  "esp32v5_awok.zip": "Awok V5",
  "ace_c5.zip": "ACE C5",
  "ace_s3.zip": "ACE S3",
  "ghostboard.zip": "Rabbit Labs' GhostBoard",
  "marauderv4_flipperhub.zip": "Marauder V4 / FlipperHub",
  "marauderv6_awokdual.zip": "Marauder V6 / Awok Dual",
  "awokmini.zip": "Awok Mini",
  "esp32-s3-cardputer.zip": "M5Stack Cardputer",
  "heltecv3.zip": "Heltec V3",
  "cyd2usb.zip": "CYD2USB",
  "cydmicrousb.zip": "CYD MicroUSB",
  "cyddualusb.zip": "CYD Dual USB",
  "cyd2usb2.4inch.zip": "CYD 2.4 Inch USB",
  "cyd2usb2.4inch_c.zip": "CYD 2.4 Inch USB-C",
  "cyd2432s028r.zip": "CYD2432S028R",
  "waveshare_lcd.zip": "Waveshare 7\" LCD",
  "crowtech_lcd.zip": "Crowtech 7\" LCD",
  "sunton_lcd.zip": "Sunton 7\" LCD",
  "jc3248w535en_lcd.zip": "JC3248W535EN LCD",
  "flipper_jcmk_gps.zip": "Flipper Dev-Board w/ JCMK GPS",
  "lilygo-t-deck.zip": "LilyGo T-Deck",
  "lilygo-tembedc1101.zip": "LilyGo TEmbedC1101",
  "lilygo-s3twatch-2020.zip": "LilyGo S3 T-Watch 2020",
  "lilygo-tdisplays3-touch.zip": "LilyGo TDisplay S3 Touch",
  "rabbitlabs_minion.zip": "Rabbit Labs' Minion",
  "jcmk_devboardpro.zip": "JCMK DevBoard Pro",
  "cardputeradv.zip": "Cardputer ADV",
  "lolin_s3_pro.zip": "Lolin S3 Pro",
  "poltergeist.zip": "Rabbit-Labs Poltergeist",
  "banshee_c5.zip": "The Wired Hatter's Banshee C5",
  "banshee_s3.zip": "The Wired Hatter's Banshee S3",
};

class CrashDecoderTab {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();

    this.isBusy = false;
    this.mode = "TEXT";
    this.lineBuffer = new Uint8Array(0);
    this.binaryBuffer = null;
    this.binaryOffset = 0;
    this.expectedBinaryLength = 0;
    this.pendingCommand = null;

    this.latestCoredump = null;
    this.latestMetadata = null;
    this.releaseCache = new Map();
    this.manualElfFile = null;
    this.manualCoredumpFile = null;

    this.onRawDataBound = (value) => this.processIncomingBytes(value);
    this.onConnectionChangeBound = (event) => this.handleConnectionChange(event);

    this.render();
    this.bindElements();
    this.attachSerialHooks();
    this.setupEventListeners();
    this.updateConnectionUi();
  }

  static concatUint8Arrays(a, b) {
    if (!a || a.length === 0) return b;
    if (!b || b.length === 0) return a;
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  render() {
    this.rootEl.innerHTML = `
      <div class="crash-container">
        <div class="crash-header">
          <div class="crash-title-wrap">
            <div class="crash-status-dot" id="crashStatusDot"></div>
            <span class="crash-title">Crash Decode</span>
          </div>
        </div>

        <div class="crash-config-grid">
          <label class="crash-field">
            <span>ELF File</span>
            <div class="crash-upload-row">
              <label for="crashElfFile" class="btn crash-upload-btn">Choose ELF</label>
              <input id="crashElfFile" class="crash-file-input" type="file" accept=".elf,application/octet-stream" />
              <span class="crash-file-name" id="crashElfFileName">No file selected</span>
            </div>
          </label>
          <label class="crash-field">
            <span>Coredump File</span>
            <div class="crash-upload-row">
              <label for="crashCoredumpFile" class="btn crash-upload-btn">Choose Core</label>
              <input id="crashCoredumpFile" class="crash-file-input" type="file" accept=".bin,.elf,application/octet-stream" />
              <span class="crash-file-name" id="crashCoredumpFileName">No file selected</span>
            </div>
          </label>
        </div>

        <div class="crash-actions">
          <button class="btn btn-primary" id="crashDecodeBtn">Decode Crash</button>
          <button class="btn" id="crashInspectBtn">Inspect Only</button>
          <button class="btn" id="crashDownloadBtn" disabled>Download Coredump</button>
          <button class="btn" id="crashClearBtn">Clear Results</button>
        </div>

        <div class="crash-meta-grid">
          <div class="crash-meta-card">
            <div class="crash-meta-label">Commit</div>
            <div class="crash-meta-value" id="crashCommit">--</div>
          </div>
          <div class="crash-meta-card">
            <div class="crash-meta-label">Build Config</div>
            <div class="crash-meta-value" id="crashBuildConfig">--</div>
          </div>
        </div>

        <div class="crash-report" id="crashReport">No crash report yet.</div>

        <div class="crash-log" id="crashLog" aria-live="polite"></div>
      </div>
    `;
  }

  bindElements() {
    this.statusDot = this.rootEl.querySelector("#crashStatusDot");
    this.elfFileInput = this.rootEl.querySelector("#crashElfFile");
    this.elfFileNameEl = this.rootEl.querySelector("#crashElfFileName");
    this.coredumpFileInput = this.rootEl.querySelector("#crashCoredumpFile");
    this.coredumpFileNameEl = this.rootEl.querySelector("#crashCoredumpFileName");
    this.decodeBtn = this.rootEl.querySelector("#crashDecodeBtn");
    this.inspectBtn = this.rootEl.querySelector("#crashInspectBtn");
    this.downloadBtn = this.rootEl.querySelector("#crashDownloadBtn");
    this.clearBtn = this.rootEl.querySelector("#crashClearBtn");
    this.reportEl = this.rootEl.querySelector("#crashReport");
    this.logEl = this.rootEl.querySelector("#crashLog");

    this.commitEl = this.rootEl.querySelector("#crashCommit");
    this.buildConfigEl = this.rootEl.querySelector("#crashBuildConfig");

  }

  setupEventListeners() {
    this.decodeBtn.addEventListener("click", () => this.runDecodeFlow({ decodeClientSide: true }));
    this.inspectBtn.addEventListener("click", () => this.runDecodeFlow({ decodeClientSide: false }));
    this.downloadBtn.addEventListener("click", () => this.downloadLatestCoredump());
    this.clearBtn.addEventListener("click", () => this.clearResults());

    this.elfFileInput?.addEventListener("change", () => this.onElfFileSelected());
    this.coredumpFileInput?.addEventListener("change", () => this.onCoredumpFileSelected());

    document.addEventListener("serial-connection-change", this.onConnectionChangeBound);

    const crashTabBtn = document.querySelector('[data-tab="crash"]');
    crashTabBtn?.addEventListener("click", () => this.updateConnectionUi());
  }

  attachSerialHooks() {
    const serialConsole = window.serialConsole;
    if (!serialConsole || typeof serialConsole.addRawDataListener !== "function") {
      this.appendLog("Serial console is not ready yet.", "warning");
      return;
    }

    this.detachSerialHooks();
    this.unsubscribeRaw = serialConsole.addRawDataListener(this.onRawDataBound);
  }

  detachSerialHooks() {
    if (typeof this.unsubscribeRaw === "function") {
      this.unsubscribeRaw();
      this.unsubscribeRaw = null;
    }
  }

  handleConnectionChange(event) {
    const connected = !!event?.detail?.connected;
    if (!connected && this.pendingCommand) {
      this.failPendingCommand(new Error("Serial connection lost"));
    }

    if (!connected) {
      this.resetParserState();
    }

    this.updateConnectionUi();
  }

  updateConnectionUi() {
    const connected = !!window.serialConsole?.isConnected;
    this.statusDot?.classList.toggle("connected", connected);

    const canOfflineDecode = this.hasManualCoreSelected() && this.hasManualElfSelected();
    this.decodeBtn.disabled = this.isBusy || (!connected && !canOfflineDecode);
    this.inspectBtn.disabled = this.isBusy || !connected;
    this.downloadBtn.disabled = !this.latestCoredump || this.isBusy;
  }

  setBusy(busy) {
    this.isBusy = busy;
    this.decodeBtn.textContent = busy ? "Working..." : "Decode Crash";
    this.inspectBtn.textContent = busy ? "Working..." : "Inspect Only";
    if (this.elfFileInput) {
      this.elfFileInput.disabled = busy;
    }
    if (this.coredumpFileInput) {
      this.coredumpFileInput.disabled = busy;
    }
    this.updateConnectionUi();
  }

  clearResults() {
    this.latestCoredump = null;
    this.latestMetadata = null;
    this.commitEl.textContent = "--";
    this.buildConfigEl.textContent = "--";
    this.reportEl.textContent = "No crash report yet.";
    this.logEl.textContent = "";
    this.updateConnectionUi();
  }

  onElfFileSelected() {
    const file = this.elfFileInput?.files?.[0] || null;
    this.manualElfFile = file;
    if (this.elfFileNameEl) {
      this.elfFileNameEl.textContent = file ? file.name : "No file selected";
    }
    this.updateConnectionUi();
  }

  async readManualElfBytes() {
    const file = this.manualElfFile || this.elfFileInput?.files?.[0] || null;
    if (!file) {
      return null;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      elfName: file.name || "manual.elf",
      elfBytes: bytes,
      manual: true,
    };
  }

  onCoredumpFileSelected() {
    const file = this.coredumpFileInput?.files?.[0] || null;
    this.manualCoredumpFile = file;
    if (this.coredumpFileNameEl) {
      this.coredumpFileNameEl.textContent = file ? file.name : "No file selected";
    }
    this.updateConnectionUi();
  }

  async readManualCoredumpBytes() {
    const file = this.manualCoredumpFile || this.coredumpFileInput?.files?.[0] || null;
    if (!file) {
      return null;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      fileName: file.name || "coredump.bin",
      bytes,
      manual: true,
    };
  }

  hasManualElfSelected() {
    return !!(this.manualElfFile || this.elfFileInput?.files?.[0]);
  }

  hasManualCoreSelected() {
    return !!(this.manualCoredumpFile || this.coredumpFileInput?.files?.[0]);
  }

  appendLog(message, level = "info") {
    if (!this.logEl) return;
    const line = document.createElement("div");
    line.className = `crash-log-line ${level}`;

    const ts = new Date().toLocaleTimeString();
    line.textContent = `[${ts}] ${message}`;
    this.logEl.appendChild(line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  resetParserState() {
    this.mode = "TEXT";
    this.lineBuffer = new Uint8Array(0);
    this.binaryBuffer = null;
    this.binaryOffset = 0;
    this.expectedBinaryLength = 0;
  }

  processIncomingBytes(value) {
    if (!this.pendingCommand || !(value instanceof Uint8Array)) {
      return;
    }

    let offset = 0;

    while (offset < value.length) {
      if (this.mode === "BINARY") {
        const remaining = this.expectedBinaryLength - this.binaryOffset;
        const available = value.length - offset;
        const take = Math.min(remaining, available);

        if (take > 0 && this.binaryBuffer) {
          this.binaryBuffer.set(value.subarray(offset, offset + take), this.binaryOffset);
          this.binaryOffset += take;
          offset += take;
        }

        if (this.binaryOffset === this.expectedBinaryLength) {
          this.mode = "TEXT";
          this.onBinaryPayloadComplete(this.binaryBuffer || new Uint8Array(0));
          this.binaryBuffer = null;
          this.expectedBinaryLength = 0;
          this.binaryOffset = 0;
        }

        continue;
      }

      const newlineIndex = this.findByte(value, 0x0a, offset);
      if (newlineIndex === -1) {
        this.lineBuffer = CrashDecoderTab.concatUint8Arrays(this.lineBuffer, value.subarray(offset));
        offset = value.length;
        continue;
      }

      const linePart = value.subarray(offset, newlineIndex);
      this.lineBuffer = CrashDecoderTab.concatUint8Arrays(this.lineBuffer, linePart);
      const line = this.decodeBufferedLine();
      this.handleTextLine(line);
      offset = newlineIndex + 1;
    }
  }

  findByte(bytes, target, start = 0) {
    for (let i = start; i < bytes.length; i++) {
      if (bytes[i] === target) return i;
    }
    return -1;
  }

  decodeBufferedLine() {
    const text = this.decoder.decode(this.lineBuffer);
    this.lineBuffer = new Uint8Array(0);
    return text.replace(/\r$/, "");
  }

  onBinaryPayloadComplete(payload) {
    if (!this.pendingCommand || this.pendingCommand.type !== "sd_read") {
      return;
    }

    this.pendingCommand.state.payload = payload;
  }

  handleTextLine(lineRaw) {
    if (!this.pendingCommand) {
      return;
    }

    const line = lineRaw.trimEnd();
    if (!line) {
      return;
    }

    if (/^SD:ERR:(.+)$/.test(line)) {
      const match = line.match(/^SD:ERR:(.+)$/);
      this.failPendingCommand(new Error(match ? match[1].trim() : "SD command failed"));
      return;
    }

    if (this.pendingCommand.type === "chipinfo") {
      this.handleChipInfoLine(line);
      return;
    }

    if (this.pendingCommand.type === "sd_size") {
      this.handleSdSizeLine(line);
      return;
    }

    if (this.pendingCommand.type === "sd_list") {
      this.handleSdListLine(line);
      return;
    }

    if (this.pendingCommand.type === "sd_read") {
      this.handleSdReadLine(line);
    }
  }

  handleChipInfoLine(line) {
    const state = this.pendingCommand.state;

    if (/^\[CHIPINFO_START\]$/.test(line)) {
      state.started = true;
      return;
    }

    if (!state.started) {
      return;
    }

    const commitMatch = line.match(/^\s*Git Commit:\s*([0-9a-fA-F]+)\s*$/);
    if (commitMatch) {
      state.commit = commitMatch[1];
      return;
    }

    const configMatch = line.match(/^\s*Build Config:\s*(.+)\s*$/);
    if (configMatch) {
      state.buildConfig = configMatch[1].trim();
      return;
    }

    if (/^\[CHIPINFO_END\]$/.test(line)) {
      if (!state.commit || !state.buildConfig) {
        this.failPendingCommand(new Error("CHIPINFO block missing commit or build config"));
        return;
      }

      this.completePendingCommand({
        commit: state.commit,
        buildConfig: state.buildConfig,
      });
    }
  }

  handleSdSizeLine(line) {
    const state = this.pendingCommand.state;
    const sizeMatch = line.match(/^SD:SIZE:(\d+)$/);
    if (sizeMatch) {
      state.size = Number.parseInt(sizeMatch[1], 10);
      return;
    }

    if (/^SD:OK(?::.*)?$/.test(line)) {
      if (!Number.isInteger(state.size) || state.size < 0) {
        this.failPendingCommand(new Error("Invalid SD size response"));
        return;
      }

      this.completePendingCommand({ size: state.size });
    }
  }

  handleSdListLine(line) {
    const state = this.pendingCommand.state;

    const fileMatch = line.match(/^SD:FILE:\[(\d+)\]\s+(.+)\s+(\d+)$/);
    if (fileMatch) {
      state.entries.push({
        type: "file",
        index: Number.parseInt(fileMatch[1], 10),
        name: fileMatch[2].trim(),
        size: Number.parseInt(fileMatch[3], 10),
      });
      return;
    }

    const dirMatch = line.match(/^SD:DIR:\[(\d+)\]\s+(.+)$/);
    if (dirMatch) {
      state.entries.push({
        type: "dir",
        index: Number.parseInt(dirMatch[1], 10),
        name: dirMatch[2].trim(),
      });
      return;
    }

    if (/^SD:OK(?::.*)?$/.test(line)) {
      this.completePendingCommand({ entries: state.entries });
    }
  }

  handleSdReadLine(line) {
    const state = this.pendingCommand.state;

    const beginMatch = line.match(/^SD:READ:BEGIN:(.+)$/);
    if (beginMatch) {
      state.path = beginMatch[1].trim();
      return;
    }

    const sizeMatch = line.match(/^SD:READ:SIZE:(\d+)$/);
    if (sizeMatch) {
      state.fileSize = Number.parseInt(sizeMatch[1], 10);
      return;
    }

    const offsetMatch = line.match(/^SD:READ:OFFSET:(\d+)$/);
    if (offsetMatch) {
      state.offset = Number.parseInt(offsetMatch[1], 10);
      return;
    }

    const lengthMatch = line.match(/^SD:READ:LENGTH:(\d+)$/);
    if (lengthMatch) {
      const len = Number.parseInt(lengthMatch[1], 10);
      if (!Number.isFinite(len) || len < 0) {
        this.failPendingCommand(new Error("Invalid SD read length"));
        return;
      }

      state.length = len;
      this.mode = "BINARY";
      this.expectedBinaryLength = len;
      this.binaryOffset = 0;
      this.binaryBuffer = new Uint8Array(len);
      return;
    }

    const endMatch = line.match(/^SD:READ:END:bytes=(\d+)$/);
    if (endMatch) {
      state.endBytes = Number.parseInt(endMatch[1], 10);
      return;
    }

    if (/^SD:OK(?::.*)?$/.test(line)) {
      if (!Number.isInteger(state.length) || !state.payload) {
        this.failPendingCommand(new Error("Incomplete SD read response"));
        return;
      }

      if (state.payload.length !== state.length) {
        this.failPendingCommand(
          new Error(`Binary payload length mismatch (${state.payload.length}/${state.length})`)
        );
        return;
      }

      if (Number.isInteger(state.endBytes) && state.endBytes !== state.length) {
        this.failPendingCommand(
          new Error(`SD end marker length mismatch (${state.endBytes}/${state.length})`)
        );
        return;
      }

      this.completePendingCommand({
        path: state.path,
        fileSize: state.fileSize,
        offset: state.offset,
        length: state.length,
        payload: state.payload,
      });
    }
  }

  async runCommand({ type, command, timeoutMs, state }) {
    if (!window.serialConsole?.isConnected || !window.serialConsole?.port) {
      throw new Error("Not connected to device");
    }

    if (this.pendingCommand) {
      throw new Error("Another crash command is already running");
    }

    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.failPendingCommand(new Error(`${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommand = {
        type,
        command,
        state,
        resolve,
        reject,
        timeoutId,
      };

      try {
        const writer = window.serialConsole.port.writable.getWriter();
        await writer.write(this.encoder.encode(command + "\n"));
        await writer.releaseLock();
      } catch (error) {
        this.failPendingCommand(error);
      }
    });
  }

  completePendingCommand(payload) {
    if (!this.pendingCommand) {
      return;
    }

    clearTimeout(this.pendingCommand.timeoutId);
    const { resolve } = this.pendingCommand;
    this.pendingCommand = null;
    this.resetParserState();
    resolve(payload);
  }

  failPendingCommand(error) {
    if (!this.pendingCommand) {
      return;
    }

    clearTimeout(this.pendingCommand.timeoutId);
    const { reject } = this.pendingCommand;
    this.pendingCommand = null;
    this.resetParserState();
    reject(error instanceof Error ? error : new Error(String(error)));
  }

  async readChipInfo() {
    return this.runCommand({
      type: "chipinfo",
      command: "chipinfo",
      timeoutMs: 10000,
      state: {
        started: false,
        commit: null,
        buildConfig: null,
      },
    });
  }

  async sdSize(path) {
    const safePath = path.replace(/\s+/g, " ").trim();

    const fileBrowser = window.fileBrowser;
    if (fileBrowser && typeof fileBrowser.sendCommand === "function") {
      const response = await fileBrowser.sendCommand(`sd size ${safePath}`, 15000);
      const err = this.extractSdError(response);
      if (err) {
        throw new Error(err);
      }

      const sizeMatch = response.match(/SD:SIZE:(\d+)/);
      if (!sizeMatch) {
        throw new Error("Could not parse SD size response");
      }
      return { size: Number.parseInt(sizeMatch[1], 10) };
    }

    return this.runCommand({
      type: "sd_size",
      command: `sd size ${safePath}`,
      timeoutMs: 15000,
      state: { size: null },
    });
  }

  async sdList(path) {
    const safePath = path.replace(/\s+/g, " ").trim();

    const fileBrowser = window.fileBrowser;
    if (fileBrowser && typeof fileBrowser.sendCommand === "function") {
      const response = await fileBrowser.sendCommand(`sd list ${safePath}`, 20000);
      const err = this.extractSdError(response);
      if (err) {
        throw new Error(err);
      }

      if (typeof fileBrowser.parseList === "function") {
        return { entries: fileBrowser.parseList(response) };
      }

      const entries = [];
      const lines = response.split(/\r?\n/);
      for (const line of lines) {
        const fileMatch = line.trim().match(/^SD:FILE:\[(\d+)\]\s+(.+?)\s+(\d+)$/);
        if (fileMatch) {
          entries.push({
            type: "file",
            index: Number.parseInt(fileMatch[1], 10),
            name: fileMatch[2].trim(),
            size: Number.parseInt(fileMatch[3], 10),
          });
          continue;
        }

        const dirMatch = line.trim().match(/^SD:DIR:\[(\d+)\]\s+(.+)$/);
        if (dirMatch) {
          entries.push({
            type: "dir",
            index: Number.parseInt(dirMatch[1], 10),
            name: dirMatch[2].trim(),
          });
        }
      }
      return { entries };
    }

    return this.runCommand({
      type: "sd_list",
      command: `sd list ${safePath}`,
      timeoutMs: 20000,
      state: { entries: [] },
    });
  }

  async sdRead(path, offset, length, timeoutMs) {
    const safePath = path.replace(/\s+/g, " ").trim();
    return this.runCommand({
      type: "sd_read",
      command: `sd read ${safePath} ${offset} ${length}`,
      timeoutMs,
      state: {
        path: null,
        fileSize: null,
        offset: null,
        length: null,
        endBytes: null,
        payload: null,
      },
    });
  }

  extractSdError(text) {
    if (!text) {
      return null;
    }

    const match = String(text).match(/SD:ERR:([^\r\n]+)/);
    return match ? `SD error: ${match[1].trim()}` : null;
  }

  parseCoredumpName(fileName) {
    const match = String(fileName || "").match(/^coredump_([A-Za-z0-9-]+)_(\d+)\.bin$/i);
    if (!match) {
      return null;
    }

    return {
      sig: match[1],
      sizeHint: Number.parseInt(match[2], 10),
    };
  }

  decodeAscii(payload) {
    return this.decoder.decode(payload || new Uint8Array(0)).replace(/\0/g, " ").trim();
  }

  selectLatestCoredumpEntry(entries) {
    const candidates = (entries || [])
      .filter((entry) => entry.type === "file" && /^coredump_.+\.bin$/i.test(entry.name))
      .sort((a, b) => {
        const aIndex = Number.isFinite(a.index) ? a.index : -1;
        const bIndex = Number.isFinite(b.index) ? b.index : -1;
        if (aIndex !== bIndex) {
          return bIndex - aIndex;
        }
        return b.name.localeCompare(a.name);
      });

    return candidates[0] || null;
  }

  findEntryByMarker(entries, markerText) {
    const marker = String(markerText || "").trim();
    if (!marker) {
      return null;
    }

    const directName = `coredump_${marker}.bin`;
    const direct = entries.find((entry) => entry.type === "file" && entry.name === directName);
    if (direct) {
      return direct;
    }

    const sigOnly = marker.split("_")[0];
    if (!sigOnly) {
      return null;
    }

    const prefixed = entries
      .filter((entry) => entry.type === "file" && entry.name.startsWith(`coredump_${sigOnly}_`) && /\.bin$/i.test(entry.name))
      .sort((a, b) => {
        const aIndex = Number.isFinite(a.index) ? a.index : -1;
        const bIndex = Number.isFinite(b.index) ? b.index : -1;
        return bIndex - aIndex;
      });

    return prefixed[0] || null;
  }

  async readSummaryText(summaryPath) {
    try {
      const summarySize = await this.sdSize(summaryPath);
      if (!Number.isFinite(summarySize.size) || summarySize.size <= 0) {
        return null;
      }

      const readTimeout = Math.max(10000, Math.ceil(summarySize.size / 1024) * 1000);
      const summaryRead = await this.sdRead(summaryPath, 0, summarySize.size, readTimeout);
      return this.decodeAscii(summaryRead.payload);
    } catch (error) {
      this.appendLog(`Summary read skipped: ${error.message || String(error)}`, "warning");
      return null;
    }
  }

  async detectCoredumpPath() {
    const coredumpDir = "/mnt/ghostesp/logs/coredumps";
    const sigFilePath = `${coredumpDir}/.last_saved_sig`;

    this.appendLog("Listing coredump directory...");
    const listing = await this.sdList(coredumpDir);
    const entries = listing.entries || [];

    const latest = this.selectLatestCoredumpEntry(entries);
    if (!latest) {
      throw new Error("No coredump binary found in /mnt/ghostesp/logs/coredumps");
    }

    let selected = latest;
    let markerText = "";
    try {
      this.appendLog("Reading coredump signature marker...");
      const sigRead = await this.sdRead(sigFilePath, 0, 64, 15000);
      markerText = this.decodeAscii(sigRead.payload);
      const markerMatch = markerText.match(/[A-Za-z0-9_-]{4,}/);
      if (markerMatch) {
        const fromMarker = this.findEntryByMarker(entries, markerMatch[0]);
        if (fromMarker) {
          selected = fromMarker;
        }
      }
    } catch (error) {
      this.appendLog(`Could not read .last_saved_sig: ${error.message || String(error)}`, "warning");
    }

    const selectedPath = `${coredumpDir}/${selected.name}`;
    const parsed = this.parseCoredumpName(selected.name);
    const summaryName = parsed ? `coredump_${parsed.sig}.summary.txt` : null;
    const summaryEntry = summaryName
      ? entries.find((entry) => entry.type === "file" && entry.name === summaryName)
      : null;
    const summaryPath = summaryEntry ? `${coredumpDir}/${summaryEntry.name}` : null;

    this.appendLog(`Selected coredump: ${selectedPath}`);
    if (summaryPath) {
      this.appendLog(`Found summary file: ${summaryPath}`);
    }

    return {
      path: selectedPath,
      summaryPath,
      markerText,
    };
  }

  normalizeConfigName(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  normalizeConfigToken(value) {
    return this.normalizeConfigName(value).replace(/[^a-z0-9]+/g, "");
  }

  uniqueStrings(values) {
    return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  }

  buildTargetConfigCandidates(buildConfig) {
    const raw = String(buildConfig || "").trim();
    const normalized = this.normalizeConfigName(raw);
    const alias = CONFIG_TEMPLATE_ALIASES[normalized];
    const candidates = [raw];

    if (alias) {
      candidates.push(alias);
    }

    return this.uniqueStrings(candidates);
  }

  buildConfigNamesFromRecord(record, fallbackKey) {
    const zipName = String(record?.zip_name || "").trim();
    const zipStem = zipName.toLowerCase().endsWith(".zip") ? zipName.slice(0, -4) : zipName;
    return this.uniqueStrings([
      record?.config,
      record?.name,
      record?.build_config,
      record?.build,
      record?.variant,
      zipStem,
      fallbackKey,
    ]);
  }

  scoreConfigMatch(targetValue, candidateValue) {
    const targetNorm = this.normalizeConfigName(targetValue);
    const candidateNorm = this.normalizeConfigName(candidateValue);
    if (!targetNorm || !candidateNorm) {
      return -1;
    }

    if (targetNorm === candidateNorm) {
      return 100;
    }

    const targetToken = this.normalizeConfigToken(targetValue);
    const candidateToken = this.normalizeConfigToken(candidateValue);
    if (targetToken && targetToken === candidateToken) {
      return 95;
    }

    const minRaw = Math.min(targetNorm.length, candidateNorm.length);
    if (minRaw >= 4 && (targetNorm.includes(candidateNorm) || candidateNorm.includes(targetNorm))) {
      return 80;
    }

    const minToken = Math.min(targetToken.length, candidateToken.length);
    if (
      minToken >= 6 &&
      targetToken &&
      candidateToken &&
      (targetToken.includes(candidateToken) || candidateToken.includes(targetToken))
    ) {
      return 70;
    }

    return -1;
  }

  collectConfigOptions(commitRecord) {
    const options = [];

    const collections = [
      { list: commitRecord?.configs, fromObject: false },
      { list: commitRecord?.builds, fromObject: false },
      { list: commitRecord?.variants, fromObject: false },
    ];

    for (const { list } of collections) {
      if (!Array.isArray(list)) {
        continue;
      }
      for (const item of list) {
        const key =
          item?.config || item?.name || item?.build_config || item?.build || item?.variant || item?.zip_name;
        options.push({
          configKey: key,
          configRecord: item,
          candidateNames: this.buildConfigNamesFromRecord(item, key),
        });
      }
    }

    if (commitRecord?.configs && typeof commitRecord.configs === "object" && !Array.isArray(commitRecord.configs)) {
      for (const [key, value] of Object.entries(commitRecord.configs)) {
        options.push({
          configKey: key,
          configRecord: value,
          candidateNames: this.buildConfigNamesFromRecord(value, key),
        });
      }
    }

    return options;
  }

  findCommitMatch(manifest, commit) {
    const commitNormalized = String(commit || "").trim();
    if (!commitNormalized) {
      throw new Error("Missing commit from CHIPINFO");
    }

    const sources = [];

    if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
      if (manifest.commits && typeof manifest.commits === "object" && !Array.isArray(manifest.commits)) {
        sources.push(manifest.commits);
      }
      sources.push(manifest);
    }

    for (const source of sources) {
      const keys = Object.keys(source).filter((key) => /^[0-9a-fA-F]{7,}$/.test(key));
      if (!keys.length) continue;

      if (source[commitNormalized]) {
        return { commitKey: commitNormalized, commitRecord: source[commitNormalized] };
      }

      const matches = keys.filter(
        (key) => key.startsWith(commitNormalized) || commitNormalized.startsWith(key)
      );

      if (matches.length === 1) {
        return { commitKey: matches[0], commitRecord: source[matches[0]] };
      }

      if (matches.length > 1) {
        throw new Error(`Ambiguous manifest commit match for ${commitNormalized}`);
      }
    }

    if (Array.isArray(manifest)) {
      const exact = manifest.find((item) => item?.commit === commitNormalized);
      if (exact) {
        return { commitKey: exact.commit, commitRecord: exact };
      }

      const prefixMatches = manifest.filter((item) => {
        const key = String(item?.commit || "");
        return key && (key.startsWith(commitNormalized) || commitNormalized.startsWith(key));
      });

      if (prefixMatches.length === 1) {
        return {
          commitKey: String(prefixMatches[0].commit),
          commitRecord: prefixMatches[0],
        };
      }

      if (prefixMatches.length > 1) {
        throw new Error(`Ambiguous manifest commit match for ${commitNormalized}`);
      }
    }

    throw new Error(`No manifest entry found for commit ${commitNormalized}`);
  }

  findConfigMatch(commitRecord, buildConfig) {
    const targets = this.buildTargetConfigCandidates(buildConfig);
    const options = this.collectConfigOptions(commitRecord);

    let best = null;
    let bestScore = -1;

    for (const option of options) {
      for (const target of targets) {
        for (const candidate of option.candidateNames) {
          const score = this.scoreConfigMatch(target, candidate);
          if (score > bestScore) {
            bestScore = score;
            best = option;
          }
        }
      }
    }

    if (best && bestScore >= 70) {
      return {
        configKey: best.configKey,
        configRecord: best.configRecord,
      };
    }

    const fallbackZip = this.extractAssetUrl(commitRecord, { type: "zip" });
    const fallbackBin = this.extractAssetUrl(commitRecord, { type: "bin" });

    if (fallbackZip || fallbackBin) {
      return {
        configKey: buildConfig,
        configRecord: commitRecord,
      };
    }

    const available = this.uniqueStrings(
      options.flatMap((option) => option.candidateNames).slice(0, 12)
    );

    const alias = CONFIG_TEMPLATE_ALIASES[this.normalizeConfigName(buildConfig)];
    const aliasHint = alias ? ` Alias mapped to ${alias}, but no match was found in this commit.` : "";

    if (available.length) {
      throw new Error(
        `No manifest config entry found for build config ${buildConfig}.${aliasHint} Available configs: ${available.join(", ")}`
      );
    }

    throw new Error(`No manifest config entry found for build config ${buildConfig}`);
  }

  getProxiedUrl(url) {
    if (!url || typeof url !== "string") {
      throw new Error("Invalid URL for proxy request");
    }

    if (url.startsWith(CRASH_PROXY_BASE)) {
      return url;
    }

    return `${CRASH_PROXY_BASE}${encodeURIComponent(url)}`;
  }

  async fetchJsonThroughProxy(url) {
    const proxied = this.getProxiedUrl(url);
    const response = await fetch(proxied, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Proxy fetch failed (${response.status}) for ${url}`);
    }

    const rawText = await response.text();
    try {
      return JSON.parse(rawText);
    } catch {
      if (/<!doctype html|<html/i.test(rawText.slice(0, 256))) {
        throw new Error(
          `Manifest URL returned HTML, not JSON. Use a raw file URL (raw.githubusercontent.com), not a GitHub blob page.`
        );
      }
      throw new Error("Manifest response is not valid JSON");
    }
  }

  async fetchArrayBufferThroughProxy(url) {
    const proxied = this.getProxiedUrl(url);
    const response = await fetch(proxied, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Proxy download failed (${response.status}) for ${url}`);
    }
    return response.arrayBuffer();
  }

  parseGithubArtifactInfo(url) {
    try {
      const parsed = new URL(String(url || "").trim());
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname;

      if (host === "github.com") {
        const m = path.match(/^\/([^/]+)\/([^/]+)\/actions\/runs\/\d+\/artifacts\/(\d+)\/?$/);
        if (m) {
          return { owner: m[1], repo: m[2], artifactId: m[3] };
        }
      }

      if (host === "api.github.com") {
        const m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/artifacts\/(\d+)\/zip$/);
        if (m) {
          return { owner: m[1], repo: m[2], artifactId: m[3] };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async fetchArtifactZipWithToken(url) {
    const token = this.getGithubToken();
    if (!token) {
      throw new Error("GitHub token is required for Actions artifact ZIP download");
    }

    const info = this.parseGithubArtifactInfo(url);
    if (!info) {
      throw new Error("URL is not a GitHub Actions artifact link");
    }

    const apiUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/actions/artifacts/${info.artifactId}/zip`;
    this.appendLog(`Downloading artifact ZIP with GitHub token: ${info.owner}/${info.repo}#${info.artifactId}`);
    const response = await fetch(apiUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GitHub artifact API failed (${response.status})`);
    }

    return response.arrayBuffer();
  }

  getGithubToken() {
    return null;
  }

  async fetchZipArrayBuffer(url) {
    const artifactInfo = this.parseGithubArtifactInfo(url);
    if (artifactInfo) {
      return this.fetchArtifactZipWithToken(url);
    }

    return this.fetchArrayBufferThroughProxy(url);
  }

  extractAssetUrl(record, { type }) {
    const wantedExt = type === "zip" ? ".zip" : ".bin";
    const directFieldCandidates =
      type === "zip"
        ? ["download_url", "zip_url"]
        : ["bin_url", "bin", "firmware_bin", "merged_bin_url", "flash_bin_url"];

    for (const field of directFieldCandidates) {
      const value = record?.[field];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    const collections = [record?.assets, record?.files, record?.artifacts].filter(Array.isArray);
    for (const items of collections) {
      const candidate = items.find((item) => {
        const name = String(item?.name || item?.filename || "").toLowerCase();
        const url = String(item?.browser_download_url || item?.download_url || item?.url || "").toLowerCase();
        return name.endsWith(wantedExt) || url.endsWith(wantedExt);
      });

      if (candidate) {
        const found = candidate.browser_download_url || candidate.download_url || candidate.url;
        if (typeof found === "string" && found.trim()) {
          return found.trim();
        }
      }
    }

    return null;
  }

  buildZipNameCandidates(configRecord, configKey) {
    const fromRecord = String(configRecord?.zip_name || "").trim();
    const fromKey = configKey ? `${configKey}.zip` : "";
    const recordNames = this.buildConfigNamesFromRecord(configRecord, configKey)
      .map((name) => `${name}.zip`)
      .filter((name) => !name.toLowerCase().endsWith(".zip.zip"));

    return this.uniqueStrings([fromRecord, fromKey, ...recordNames]);
  }

  buildBinNameCandidates(configRecord, configKey, zipNameCandidates) {
    const fromRecord = String(configRecord?.bin_name || "").trim();
    const fromKey = configKey ? `${configKey}.bin` : "";
    const fromZip = (zipNameCandidates || [])
      .filter((name) => name.toLowerCase().endsWith(".zip"))
      .map((name) => `${name.slice(0, -4)}.bin`);

    return this.uniqueStrings([fromRecord, fromKey, ...fromZip]);
  }

  getNiceConfigName(configRecord, configKey) {
    const zipName = String(configRecord?.zip_name || (configKey ? `${configKey}.zip` : "")).trim();
    const lookupKey = zipName.toLowerCase();
    return GHOST_ESP_NICE_NAMES[lookupKey] || configKey || zipName || "Unknown";
  }

  releaseAssetUrl(asset) {
    return asset?.browser_download_url || asset?.download_url || asset?.url || null;
  }

  releaseAssetName(asset) {
    return String(asset?.name || asset?.label || "").trim();
  }

  isUsableDownloadUrl(url, expectedExt) {
    const value = String(url || "").trim();
    if (!value) {
      return false;
    }

    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const ext = `.${String(expectedExt || "").toLowerCase().replace(/^\./, "")}`;

      if (host === "github.com" && /\/actions\/runs\/\d+\/artifacts\/\d+/.test(path)) {
        return false;
      }

      if (host === "api.github.com" && /\/actions\/artifacts\/\d+\/zip$/.test(path)) {
        return false;
      }

      if (path.endsWith(ext)) {
        return true;
      }

      const rscd = parsed.searchParams.get("rscd") || "";
      if (rscd.toLowerCase().includes(`filename=%22`) && rscd.toLowerCase().includes(ext)) {
        return true;
      }

      const fileNameParam = parsed.searchParams.get("filename") || "";
      if (fileNameParam.toLowerCase().endsWith(ext)) {
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async fetchRepositoryReleases(repository) {
    const repo = String(repository || "").trim();
    if (!repo) {
      return [];
    }

    if (this.releaseCache.has(repo)) {
      return this.releaseCache.get(repo);
    }

    const apiUrl = `https://api.github.com/repos/${repo}/releases`;
    this.appendLog(`Fetching releases via worker proxy: ${repo}`);
    const releases = await this.fetchJsonThroughProxy(apiUrl);
    const normalized = Array.isArray(releases) ? releases : [];
    this.releaseCache.set(repo, normalized);
    return normalized;
  }

  findAssetByNameInReleases(releases, targetNames, preferredTags = []) {
    const targets = this.uniqueStrings(targetNames).map((name) => name.toLowerCase());
    if (!targets.length) {
      return null;
    }

    const tagSet = new Set(this.uniqueStrings(preferredTags).map((tag) => tag.toLowerCase()));
    const prioritized = [];
    const fallback = [];

    for (const release of releases || []) {
      const tag = String(release?.tag_name || "").toLowerCase();
      if (tagSet.size && tagSet.has(tag)) {
        prioritized.push(release);
      } else {
        fallback.push(release);
      }
    }

    const ordered = [...prioritized, ...fallback];
    for (const release of ordered) {
      const assets = Array.isArray(release?.assets) ? release.assets : [];
      for (const asset of assets) {
        const name = this.releaseAssetName(asset).toLowerCase();
        if (targets.includes(name) || targets.some((target) => name.endsWith(target))) {
          return { asset, release };
        }
      }
    }

    return null;
  }

  findFirstByExtensionInRelease(release, extension) {
    const ext = String(extension || "").toLowerCase();
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    return assets.find((asset) => this.releaseAssetName(asset).toLowerCase().endsWith(ext)) || null;
  }

  async resolveFirmwareLinks(manifest, commitRecord, configRecord, configKey) {
    let zipUrl = this.extractAssetUrl(configRecord, { type: "zip" });
    let binUrl = this.extractAssetUrl(configRecord, { type: "bin" });

    if (zipUrl && !this.isUsableDownloadUrl(zipUrl, "zip")) {
      this.appendLog("Manifest ZIP URL is not a direct download link, falling back to release assets.", "warning");
      zipUrl = null;
    }

    if (binUrl && !this.isUsableDownloadUrl(binUrl, "bin")) {
      this.appendLog("Manifest BIN URL is not a direct download link, falling back to release assets.", "warning");
      binUrl = null;
    }

    const zipNameCandidates = this.buildZipNameCandidates(configRecord, configKey);
    const binNameCandidates = this.buildBinNameCandidates(configRecord, configKey, zipNameCandidates);

    if (zipUrl && binUrl) {
      return { zipUrl, binUrl };
    }

    const repository = String(manifest?.repository || "").trim();
    if (!repository) {
      if (zipUrl || binUrl) {
        return { zipUrl, binUrl };
      }
      throw new Error("Manifest does not include repository metadata for release lookup");
    }

    const preferredTags = this.uniqueStrings([
      configRecord?.release_tag,
      commitRecord?.last_tag,
      ...(Array.isArray(commitRecord?.release_refs) ? commitRecord.release_refs : []),
    ]);

    const releases = await this.fetchRepositoryReleases(repository);

    let zipAssetRef = null;
    if (!zipUrl) {
      zipAssetRef = this.findAssetByNameInReleases(releases, zipNameCandidates, preferredTags);
      if (zipAssetRef) {
        const candidate = this.releaseAssetUrl(zipAssetRef.asset);
        if (this.isUsableDownloadUrl(candidate, "zip")) {
          zipUrl = candidate;
        }
      }
    }

    if (!binUrl) {
      if (zipAssetRef?.release) {
        const directBin = this.findAssetByNameInReleases([zipAssetRef.release], binNameCandidates, []);
        if (directBin) {
          const candidate = this.releaseAssetUrl(directBin.asset);
          if (this.isUsableDownloadUrl(candidate, "bin")) {
            binUrl = candidate;
          }
        } else {
          const fallbackBin = this.findFirstByExtensionInRelease(zipAssetRef.release, ".bin");
          if (fallbackBin) {
            const candidate = this.releaseAssetUrl(fallbackBin);
            if (this.isUsableDownloadUrl(candidate, "bin")) {
              binUrl = candidate;
            }
          }
        }
      }

      if (!binUrl) {
        const globalBin = this.findAssetByNameInReleases(releases, binNameCandidates, preferredTags);
        if (globalBin) {
          const candidate = this.releaseAssetUrl(globalBin.asset);
          if (this.isUsableDownloadUrl(candidate, "bin")) {
            binUrl = candidate;
          }
        }
      }
    }

    if (!zipUrl && !binUrl) {
      throw new Error(
        `Could not resolve release assets for config ${configKey}. Tried ZIP names: ${zipNameCandidates.join(", ")}`
      );
    }

    return { zipUrl, binUrl };
  }

  async fetchManifestAndResolve(commit, buildConfig) {
    const manifestUrl = CRASH_MANIFEST_URL;

    this.appendLog(`Fetching manifest via worker proxy: ${manifestUrl}`);
    const manifest = await this.fetchJsonThroughProxy(manifestUrl);
    const { commitKey, commitRecord } = this.findCommitMatch(manifest, commit);
    const { configKey, configRecord } = this.findConfigMatch(commitRecord, buildConfig);
    const configNiceName = this.getNiceConfigName(configRecord, configKey);
    const { zipUrl, binUrl } = await this.resolveFirmwareLinks(manifest, commitRecord, configRecord, configKey);

    return {
      manifestUrl,
      commitKey,
      configKey,
      configNiceName,
      firmwareZipUrl: zipUrl,
      firmwareBinUrl: binUrl,
    };
  }

  async fetchFirmwareElf(firmwareZipUrl) {
    if (!window.JSZip) {
      throw new Error("JSZip failed to load; cannot extract firmware ELF");
    }

    this.appendLog(`Downloading firmware ZIP: ${firmwareZipUrl}`);
    const zipBuffer = await this.fetchZipArrayBuffer(firmwareZipUrl);
    const zip = await window.JSZip.loadAsync(zipBuffer);
    const elfCandidates = Object.values(zip.files)
      .filter((file) => !file.dir && file.name.toLowerCase().endsWith(".elf"))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!elfCandidates.length) {
      throw new Error("No .elf file found in firmware ZIP");
    }

    const elfEntry = elfCandidates[0];
    const elfBytes = await elfEntry.async("uint8array");
    return {
      elfName: elfEntry.name,
      elfBytes,
    };
  }

  parseElfSymbols(elfBytes) {
    if (!(elfBytes instanceof Uint8Array) || elfBytes.length < 52) {
      throw new Error("ELF file is invalid or empty");
    }

    if (
      elfBytes[0] !== 0x7f ||
      elfBytes[1] !== 0x45 ||
      elfBytes[2] !== 0x4c ||
      elfBytes[3] !== 0x46
    ) {
      throw new Error("Selected file is not an ELF binary");
    }

    const elfClass = elfBytes[4];
    const dataEncoding = elfBytes[5];

    if (elfClass !== 1) {
      throw new Error("Only 32-bit ELF is supported in browser decode mode");
    }

    if (dataEncoding !== 1) {
      throw new Error("Only little-endian ELF is supported in browser decode mode");
    }

    const dv = new DataView(elfBytes.buffer, elfBytes.byteOffset, elfBytes.byteLength);
    const eShoff = dv.getUint32(32, true);
    const eShentsize = dv.getUint16(46, true);
    const eShnum = dv.getUint16(48, true);

    if (!eShoff || !eShentsize || !eShnum) {
      throw new Error("ELF is missing section headers");
    }

    const sections = [];
    for (let i = 0; i < eShnum; i++) {
      const base = eShoff + i * eShentsize;
      if (base + 40 > elfBytes.length) break;

      sections.push({
        index: i,
        nameOffset: dv.getUint32(base + 0, true),
        type: dv.getUint32(base + 4, true),
        flags: dv.getUint32(base + 8, true),
        addr: dv.getUint32(base + 12, true),
        offset: dv.getUint32(base + 16, true),
        size: dv.getUint32(base + 20, true),
        link: dv.getUint32(base + 24, true),
        entsize: dv.getUint32(base + 36, true),
        name: "",
      });
    }

    const eShstrndx = dv.getUint16(50, true);
    const shStrSection = sections[eShstrndx];
    if (!shStrSection) {
      throw new Error("ELF section header string table is missing");
    }

    const shStr = elfBytes.subarray(shStrSection.offset, shStrSection.offset + shStrSection.size);
    for (const section of sections) {
      section.name = this.readNullTerminatedString(shStr, section.nameOffset);
    }

    const symtabSection = sections.find((section) => section.type === 2 && section.entsize > 0);
    if (!symtabSection) {
      throw new Error("ELF does not include a .symtab section");
    }

    const strtabSection = sections[symtabSection.link];
    if (!strtabSection) {
      throw new Error("ELF .strtab section is missing");
    }

    const strtab = elfBytes.subarray(strtabSection.offset, strtabSection.offset + strtabSection.size);
    const symbols = [];
    const entryCount = Math.floor(symtabSection.size / symtabSection.entsize);
    const noisySymbolPattern = /^(CSR_|RV_|_heap|_stack|_start|_end|_ext_ram|__)/;

    for (let i = 0; i < entryCount; i++) {
      const base = symtabSection.offset + i * symtabSection.entsize;
      if (base + 16 > elfBytes.length) break;

      const stName = dv.getUint32(base + 0, true);
      const stValue = dv.getUint32(base + 4, true);
      const stSize = dv.getUint32(base + 8, true);
      const stInfo = dv.getUint8(base + 12);
      const stType = stInfo & 0x0f;
      const stShndx = dv.getUint16(base + 14, true);

      if (stValue === 0 || stShndx === 0) {
        continue;
      }

      if (stType !== 2) {
        continue;
      }

      const name = this.readNullTerminatedString(strtab, stName);
      if (!name || noisySymbolPattern.test(name)) {
        continue;
      }

      symbols.push({
        name,
        value: stValue >>> 0,
        size: stSize >>> 0,
      });
    }

    if (!symbols.length) {
      throw new Error("No function symbols found in ELF .symtab");
    }

    symbols.sort((a, b) => a.value - b.value || a.name.localeCompare(b.name));

    for (let i = 0; i < symbols.length; i++) {
      const current = symbols[i];
      const next = symbols[i + 1];
      const inferredEnd = next ? next.value : current.value + Math.max(current.size, 4);
      current.end = current.size > 0 ? current.value + current.size : inferredEnd;
      if (current.end <= current.value) {
        current.end = current.value + 4;
      }
    }

    const execRanges = sections
      .filter((section) => (section.flags & 0x4) !== 0 && section.addr > 0 && section.size > 0)
      .map((section) => ({
        start: section.addr >>> 0,
        end: (section.addr + section.size) >>> 0,
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start);

    return {
      symbols,
      execRanges,
    };
  }

  readNullTerminatedString(bytes, offset) {
    if (!Number.isFinite(offset) || offset < 0 || offset >= bytes.length) {
      return "";
    }

    let end = offset;
    while (end < bytes.length && bytes[end] !== 0) {
      end++;
    }

    return this.decoder.decode(bytes.subarray(offset, end));
  }

  lookupSymbolForAddress(symbols, address) {
    let low = 0;
    let high = symbols.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const symbol = symbols[mid];

      if (address < symbol.value) {
        high = mid - 1;
      } else if (address >= symbol.end) {
        low = mid + 1;
      } else {
        return symbol;
      }
    }

    if (high >= 0) {
      const symbol = symbols[high];
      const delta = address - symbol.value;
      if (delta >= 0 && delta < 0x200) {
        return symbol;
      }
    }

    return null;
  }

  isAddressInRanges(address, ranges) {
    if (!Array.isArray(ranges) || !ranges.length) {
      return address >= 0x40000000;
    }

    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const range = ranges[mid];
      if (address < range.start) {
        high = mid - 1;
      } else if (address >= range.end) {
        low = mid + 1;
      } else {
        return true;
      }
    }

    return false;
  }

  isRamAddress(address) {
    return address >= 0x3f000000 && address <= 0x60000000;
  }

  isLikelyCodeAddress(address, execRanges) {
    if (!this.isAddressInRanges(address, execRanges)) {
      return false;
    }

    if ((address & 0x1) !== 0) {
      return false;
    }

    if (address >= 0x40800000 && address < 0x40801000) {
      return false;
    }

    return true;
  }

  parseElfProgramHeaders(elfBytes) {
    if (!(elfBytes instanceof Uint8Array) || elfBytes.length < 52) {
      return null;
    }

    if (elfBytes[0] !== 0x7f || elfBytes[1] !== 0x45 || elfBytes[2] !== 0x4c || elfBytes[3] !== 0x46) {
      return null;
    }

    if (elfBytes[4] !== 1 || elfBytes[5] !== 1) {
      return null;
    }

    const dv = new DataView(elfBytes.buffer, elfBytes.byteOffset, elfBytes.byteLength);
    const eType = dv.getUint16(16, true);
    const ePhoff = dv.getUint32(28, true);
    const ePhentsize = dv.getUint16(42, true);
    const ePhnum = dv.getUint16(44, true);

    if (!ePhoff || !ePhentsize || !ePhnum) {
      return null;
    }

    const programHeaders = [];
    for (let i = 0; i < ePhnum; i++) {
      const base = ePhoff + i * ePhentsize;
      if (base + 32 > elfBytes.length) {
        break;
      }

      programHeaders.push({
        type: dv.getUint32(base + 0, true),
        offset: dv.getUint32(base + 4, true),
        vaddr: dv.getUint32(base + 8, true),
        paddr: dv.getUint32(base + 12, true),
        filesz: dv.getUint32(base + 16, true),
        memsz: dv.getUint32(base + 20, true),
        flags: dv.getUint32(base + 24, true),
        align: dv.getUint32(base + 28, true),
      });
    }

    return {
      eType,
      programHeaders,
    };
  }

  parseElfNotes(noteBytes) {
    const notes = [];
    if (!(noteBytes instanceof Uint8Array)) {
      return notes;
    }

    const dv = new DataView(noteBytes.buffer, noteBytes.byteOffset, noteBytes.byteLength);
    let offset = 0;

    const align4 = (value) => (value + 3) & ~3;

    while (offset + 12 <= noteBytes.length) {
      const namesz = dv.getUint32(offset, true);
      const descsz = dv.getUint32(offset + 4, true);
      const type = dv.getUint32(offset + 8, true);
      offset += 12;

      const nameEnd = offset + namesz;
      if (nameEnd > noteBytes.length) {
        break;
      }

      const nameRaw = noteBytes.subarray(offset, nameEnd);
      const name = this.decoder.decode(nameRaw).replace(/\0/g, "").trim();
      offset += align4(namesz);

      const descEnd = offset + descsz;
      if (descEnd > noteBytes.length) {
        break;
      }

      const desc = noteBytes.subarray(offset, descEnd);
      offset += align4(descsz);

      notes.push({ name, type, desc });
    }

    return notes;
  }

  parseTaskInfoNoteDesc(descBytes) {
    if (!(descBytes instanceof Uint8Array) || descBytes.length < 20) {
      return null;
    }

    const dv = new DataView(descBytes.buffer, descBytes.byteOffset, descBytes.byteLength);
    const taskIndex = dv.getUint32(0, true);
    const taskFlags = dv.getUint32(4, true);
    const taskTcbAddr = dv.getUint32(8, true);
    const taskStackStart = dv.getUint32(12, true);
    const taskStackLen = dv.getUint32(16, true);
    const taskStackEnd = (taskStackStart + taskStackLen) >>> 0;
    let taskName = "";
    if (descBytes.length >= 36) {
      const nameBytes = descBytes.subarray(20, 36);
      taskName = this.decoder.decode(nameBytes).replace(/\0/g, "").trim();
    }

    return {
      taskIndex,
      taskFlags,
      taskTcbAddr,
      taskStackStart,
      taskStackLen,
      taskStackEnd,
      taskName,
    };
  }

  isStackPointerInTaskRange(sp, taskInfo) {
    if (!Number.isFinite(sp) || !taskInfo) {
      return false;
    }
    const start = taskInfo.taskStackStart >>> 0;
    const end = taskInfo.taskStackEnd >>> 0;
    return end > start && sp >= start && sp < end;
  }

  parseExtraInfoMarker(descBytes) {
    if (!(descBytes instanceof Uint8Array) || descBytes.length < 4) {
      return null;
    }
    const dv = new DataView(descBytes.buffer, descBytes.byteOffset, descBytes.byteLength);
    return dv.getUint32(0, true) >>> 0;
  }

  parseRiscVCorePrstatus(descBytes) {
    if (!(descBytes instanceof Uint8Array) || descBytes.length < (72 + 32 * 4)) {
      return null;
    }

    const dv = new DataView(descBytes.buffer, descBytes.byteOffset, descBytes.byteLength);
    const prPid = dv.getUint32(24, true) >>> 0;
    const rawRegs = [];
    for (let i = 0; i < 32; i++) {
      rawRegs.push(dv.getUint32(72 + i * 4, true) >>> 0);
    }

    return {
      prPid,
      rawRegs,
    };
  }

  pickLikelyPcFromRiscVRegs(rawRegs, execRanges, symbols) {
    const idlePattern = /^(vPortYield|vPortTaskWrapper|prvIdleTask|esp_cpu_wait_for_intr|ulTaskGenericNotifyTake)$/;
    let best = null;

    for (let i = 0; i < rawRegs.length; i++) {
      const value = rawRegs[i] >>> 0;
      if (!this.isLikelyCodeAddress(value, execRanges)) {
        continue;
      }

      const symbol = this.lookupSymbolForAddress(symbols, value);
      let score = 0;
      if (symbol) {
        score += 8;
        const offset = value - symbol.value;
        if (offset >= 0 && offset < 0x40) {
          score += 4;
        }
        if (idlePattern.test(symbol.name)) {
          score -= 4;
        }
      }

      if (i === 31) score += 2;
      if (i === 0 || i === 1) score += 1;

      if (!best || score > best.score) {
        best = { value, score };
      }
    }

    if (best) {
      return best.value;
    }

    return (rawRegs[31] || rawRegs[0] || 0) >>> 0;
  }

  buildRiscVRegLayouts(rawRegs, pc) {
    const layouts = [];

    layouts.push({
      layout: "stackframe",
      regs: {
        ra: (rawRegs[0] || 0) >>> 0,
        sp: (rawRegs[1] || 0) >>> 0,
        gp: (rawRegs[2] || 0) >>> 0,
        tp: (rawRegs[3] || 0) >>> 0,
        pc: pc >>> 0,
      },
    });

    layouts.push({
      layout: "x0-based",
      regs: {
        ra: (rawRegs[1] || 0) >>> 0,
        sp: (rawRegs[2] || 0) >>> 0,
        gp: (rawRegs[3] || 0) >>> 0,
        tp: (rawRegs[4] || 0) >>> 0,
        pc: pc >>> 0,
      },
    });

    return layouts;
  }

  findLikelyRiscVRegisterSetInRange(dv, startOffset, endOffset, execRanges, baseOffset = 0) {
    let best = null;
    const last = Math.max(startOffset, endOffset - 36 * 4);

    for (let offset = startOffset; offset <= last; offset += 4) {
      const ra = dv.getUint32(offset + 0, true);
      const sp = dv.getUint32(offset + 4, true);
      const gp = dv.getUint32(offset + 8, true);
      const tp = dv.getUint32(offset + 12, true);

      const pcCandidates = [
        { index: 32, value: dv.getUint32(offset + 32 * 4, true) },
        { index: 31, value: dv.getUint32(offset + 31 * 4, true) },
        { index: 33, value: dv.getUint32(offset + 33 * 4, true) },
      ];

      for (const pcEntry of pcCandidates) {
        const pc = pcEntry.value;
        let score = 0;

        if (!this.isLikelyCodeAddress(pc, execRanges)) continue;
        if (!this.isLikelyCodeAddress(ra, execRanges)) continue;
        if (!this.isRamAddress(sp)) continue;

        score += 12;
        score += 9;
        score += 8;

        if ((sp & 0x3) === 0) score += 2;
        if ((sp & 0xf) === 0) score += 3;

        if (this.isRamAddress(gp)) score += 2;
        if (this.isRamAddress(tp)) score += 2;

        const a0 = dv.getUint32(offset + 10 * 4, true);
        const a1 = dv.getUint32(offset + 11 * 4, true);
        if (a0 <= 0x400) score += 1;
        if (a1 <= 0x400) score += 1;

        if (!best || score > best.score) {
          best = {
            score,
            offset: baseOffset + offset,
            pcIndex: pcEntry.index,
            regs: {
              ra,
              sp,
              gp,
              tp,
              pc,
            },
          };
        }
      }
    }

    return best;
  }

  parseCoredumpAsElf(coredumpBytes, execRanges, symbols = []) {
    const parsed = this.parseElfProgramHeaders(coredumpBytes);
    if (!parsed) {
      return null;
    }

    const loadSegments = [];
    const notes = [];

    for (const ph of parsed.programHeaders) {
      const end = ph.offset + ph.filesz;
      if (ph.offset < 0 || end > coredumpBytes.length) {
        continue;
      }

      if (ph.type === 1) {
        loadSegments.push({
          vaddr: ph.vaddr >>> 0,
          memsz: ph.memsz >>> 0,
          filesz: ph.filesz >>> 0,
          flags: ph.flags >>> 0,
          data: coredumpBytes.subarray(ph.offset, end),
        });
      } else if (ph.type === 4) {
        const noteBytes = coredumpBytes.subarray(ph.offset, end);
        notes.push(...this.parseElfNotes(noteBytes));
      }
    }

    const taskInfos = notes
      .filter((note) => note?.type === 678)
      .map((note) => this.parseTaskInfoNoteDesc(note.desc))
      .filter(Boolean)
      .sort((a, b) => a.taskIndex - b.taskIndex);

    const extraInfoMarker = notes
      .filter((note) => note?.type === 677)
      .map((note) => this.parseExtraInfoMarker(note.desc))
      .find((value) => Number.isFinite(value) && value > 0) || null;

    const crashedTaskInfo = taskInfos.find((t) => t.taskIndex === 0) || taskInfos[0] || null;

    const coreNotes = notes.filter((note) => note?.name === "CORE" && note?.type === 1 && note?.desc?.length >= 36 * 4);

    let bestRegSet = null;
    for (let coreIndex = 0; coreIndex < coreNotes.length; coreIndex++) {
      const note = coreNotes[coreIndex];
      const parsedPrstatus = this.parseRiscVCorePrstatus(note.desc);
      const noteDv = new DataView(note.desc.buffer, note.desc.byteOffset, note.desc.byteLength);
      const scanned = this.findLikelyRiscVRegisterSetInRange(noteDv, 0, note.desc.length, execRanges, 0);
      const candidateList = [];
      if (parsedPrstatus?.rawRegs?.length === 32) {
        const pc = this.pickLikelyPcFromRiscVRegs(parsedPrstatus.rawRegs, execRanges, symbols);
        const layouts = this.buildRiscVRegLayouts(parsedPrstatus.rawRegs, pc);
        for (const item of layouts) {
          candidateList.push({
            score: 30,
            offset: 0,
            regs: item.regs,
            prPid: parsedPrstatus.prPid,
            rawRegs: parsedPrstatus.rawRegs,
            fromPrstatus: true,
            regLayout: item.layout,
          });
        }
      }

      if (scanned) {
        candidateList.push(scanned);
      }

      for (const candidate of candidateList) {
        const stackSignal = this.scoreStackPointerSignal(candidate.regs, loadSegments, symbols, execRanges);
        const inCrashedTaskStack = this.isStackPointerInTaskRange(candidate.regs.sp, crashedTaskInfo);
        const pidMatch = extraInfoMarker && candidate.prPid ? candidate.prPid === extraInfoMarker : false;
        const x0LayoutBonus = candidate.regLayout === "x0-based" ? 24 : 0;
        const totalScore =
          100 +
          stackSignal * 3 +
          (inCrashedTaskStack ? 60 : -40) +
          (pidMatch ? 80 : 0) +
          (candidate.fromPrstatus ? 40 : 0) +
          x0LayoutBonus -
          coreIndex;

        if (!bestRegSet || totalScore > bestRegSet.totalScore) {
          bestRegSet = {
            ...candidate,
            noteIndex: coreIndex,
            stackSignal,
            totalScore,
            fromCoreNote: true,
            inCrashedTaskStack,
            pidMatch,
          };
        }
      }
    }

    if (!bestRegSet) {
      for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
        const note = notes[noteIndex];
        if (!note?.desc || note.desc.length < 36 * 4) {
          continue;
        }
        const noteDv = new DataView(note.desc.buffer, note.desc.byteOffset, note.desc.byteLength);
        const candidate = this.findLikelyRiscVRegisterSetInRange(
          noteDv,
          0,
          note.desc.length,
          execRanges,
          0
        );
        if (!candidate) {
          continue;
        }

        const stackSignal = this.scoreStackPointerSignal(candidate.regs, loadSegments, symbols, execRanges);
        const preferredNoteBonus = Math.max(0, 4 - Math.min(noteIndex, 4));
        const totalScore = candidate.score + stackSignal * 3 + preferredNoteBonus;

        if (!bestRegSet || totalScore > bestRegSet.totalScore) {
          bestRegSet = {
            ...candidate,
            noteIndex,
            stackSignal,
            totalScore,
          };
        }
      }
    }

    return {
      eType: parsed.eType,
      loadSegments,
      notes,
      taskInfos,
      crashedTaskInfo,
      extraInfoMarker,
      regSet: bestRegSet,
    };
  }

  parseRawEspCoredump(coredumpBytes, execRanges, symbols = []) {
    if (!(coredumpBytes instanceof Uint8Array) || coredumpBytes.length < 20) {
      return null;
    }

    if (
      coredumpBytes[0] === 0x7f &&
      coredumpBytes[1] === 0x45 &&
      coredumpBytes[2] === 0x4c &&
      coredumpBytes[3] === 0x46
    ) {
      return null;
    }

    const dv = new DataView(coredumpBytes.buffer, coredumpBytes.byteOffset, coredumpBytes.byteLength);
    const totLen = dv.getUint32(0, true);
    const ver = dv.getUint32(4, true);
    const dumpVer = ver & 0xffff;

    const BIN_V1 = 0x0001;
    const BIN_V2 = 0x0002;
    const BIN_V2_1 = 0x0003;
    const ELF_CRC32_V2 = 0x0100;
    const ELF_SHA256_V2 = 0x0101;
    const ELF_CRC32_V2_1 = 0x0102;
    const ELF_SHA256_V2_1 = 0x0103;
    const ELF_SHA256_V2_2 = 0x0104;

    if (!Number.isFinite(totLen) || totLen <= 24 || totLen > coredumpBytes.length) {
      return null;
    }

    const isWrappedElf = [ELF_CRC32_V2, ELF_SHA256_V2, ELF_CRC32_V2_1, ELF_SHA256_V2_1, ELF_SHA256_V2_2].includes(dumpVer);
    if (isWrappedElf) {
      let headerSize = 20;
      let checksumSize = 4;

      if (dumpVer === ELF_CRC32_V2_1 || dumpVer === ELF_SHA256_V2_1) {
        headerSize = 24;
      } else if (dumpVer === ELF_SHA256_V2_2) {
        headerSize = 12;
      }

      if (dumpVer === ELF_SHA256_V2 || dumpVer === ELF_SHA256_V2_1 || dumpVer === ELF_SHA256_V2_2) {
        checksumSize = 32;
      }

      const dataEnd = totLen - checksumSize;
      if (dataEnd <= headerSize || dataEnd > coredumpBytes.length) {
        return null;
      }

      const elfPayload = coredumpBytes.subarray(headerSize, dataEnd);
      const parsedWrappedElf = this.parseCoredumpAsElf(elfPayload, execRanges, symbols);
      if (!parsedWrappedElf) {
        return null;
      }

      return {
        format: "raw_wrapped_elf",
        dumpVer,
        loadSegments: parsedWrappedElf.loadSegments,
        notes: parsedWrappedElf.notes,
        taskInfos: parsedWrappedElf.taskInfos,
        crashedTaskInfo: parsedWrappedElf.crashedTaskInfo,
        regSet: parsedWrappedElf.regSet,
      };
    }

    if (![BIN_V1, BIN_V2, BIN_V2_1].includes(dumpVer)) {
      return null;
    }

    const align4 = (value) => (value + 3) & ~3;

    const taskNum = dv.getUint32(8, true);
    const tcbsz = dv.getUint32(12, true);
    const segsNum = dumpVer === BIN_V1 ? 0 : dv.getUint32(16, true);
    const headerSize = dumpVer === BIN_V1 ? 16 : dumpVer === BIN_V2 ? 20 : 24;
    const checksumSize = 4;
    const dataEnd = totLen - checksumSize;

    if (taskNum <= 0 || taskNum > 128 || tcbsz <= 0 || tcbsz > (64 * 1024)) {
      return null;
    }
    if (dataEnd <= headerSize || dataEnd > coredumpBytes.length) {
      return null;
    }

    const loadSegments = [];
    const taskInfos = [];
    let cursor = headerSize;
    let regSet = null;

    for (let i = 0; i < taskNum; i++) {
      if (cursor + 12 > dataEnd) {
        break;
      }

      const taskHeaderOffset = cursor;
      const tcbAddr = dv.getUint32(cursor + 0, true);
      const stackTop = dv.getUint32(cursor + 4, true);
      const stackEnd = dv.getUint32(cursor + 8, true);
      cursor += 12;

      const stackLen = Math.abs((stackTop >>> 0) - (stackEnd >>> 0));
      if (cursor + tcbsz + stackLen > dataEnd) {
        break;
      }

      const tcbBytes = coredumpBytes.subarray(cursor, cursor + tcbsz);
      cursor += tcbsz;

      const stackFileOffset = cursor;
      const stackBytes = coredumpBytes.subarray(cursor, cursor + stackLen);
      cursor += stackLen;
      cursor = align4(cursor);

      const taskStackStart = Math.min(stackTop >>> 0, stackEnd >>> 0);
      const taskStackEnd = Math.max(stackTop >>> 0, stackEnd >>> 0);
      const taskInfo = {
        taskIndex: i,
        taskFlags: 0,
        taskTcbAddr: tcbAddr >>> 0,
        taskStackStart,
        taskStackLen: stackLen >>> 0,
        taskStackEnd,
      };
      taskInfos.push(taskInfo);

      if (tcbAddr && tcbsz > 0) {
        loadSegments.push({
          vaddr: tcbAddr >>> 0,
          memsz: tcbsz >>> 0,
          filesz: tcbsz >>> 0,
          flags: 0x6,
          data: tcbBytes,
        });
      }

      if (taskStackStart && stackLen > 0) {
        loadSegments.push({
          vaddr: taskStackStart >>> 0,
          memsz: stackLen >>> 0,
          filesz: stackLen >>> 0,
          flags: 0x6,
          data: stackBytes,
        });
      }

      if (i === 0 && stackBytes.length >= 32 * 4) {
        const regsDv = new DataView(stackBytes.buffer, stackBytes.byteOffset, stackBytes.byteLength);
        const regs = [];
        for (let r = 0; r < 32; r++) {
          regs.push(regsDv.getUint32(r * 4, true) >>> 0);
        }

        const candidatePc = regs[31] >>> 0;
        const candidate = {
          score: 0,
          offset: taskHeaderOffset,
          regs: {
            ra: regs[0] >>> 0,
            sp: regs[1] >>> 0,
            gp: regs[2] >>> 0,
            tp: regs[3] >>> 0,
            pc: candidatePc,
          },
        };

        const stackSignal = this.scoreStackPointerSignal(candidate.regs, loadSegments, symbols, execRanges);
        const inCrashedTaskStack = this.isStackPointerInTaskRange(candidate.regs.sp, taskInfo);
        regSet = {
          ...candidate,
          stackSignal,
          totalScore: 200 + stackSignal * 3 + (inCrashedTaskStack ? 80 : -80),
          fromRawTask0: true,
          inCrashedTaskStack,
          stackFileOffset,
        };
      }
    }

    if (dumpVer === BIN_V2 && Number.isFinite(segsNum) && segsNum > 0) {
      for (let s = 0; s < segsNum; s++) {
        if (cursor + 8 > dataEnd) {
          break;
        }
        const memStart = dv.getUint32(cursor + 0, true);
        const memSz = dv.getUint32(cursor + 4, true);
        cursor += 8;
        if (!Number.isFinite(memSz) || memSz <= 0 || cursor + memSz > dataEnd) {
          break;
        }
        const data = coredumpBytes.subarray(cursor, cursor + memSz);
        cursor += memSz;

        loadSegments.push({
          vaddr: memStart >>> 0,
          memsz: memSz >>> 0,
          filesz: memSz >>> 0,
          flags: 0x6,
          data,
        });
      }
    }

    if (!taskInfos.length) {
      return null;
    }

    return {
      format: "raw",
      dumpVer,
      taskInfos,
      crashedTaskInfo: taskInfos[0] || null,
      loadSegments,
      regSet,
    };
  }

  formatEspDumpVersion(dumpVer) {
    const value = Number(dumpVer) >>> 0;
    const major = (value >> 8) & 0xff;
    const minor = value & 0xff;
    return `${major}.${minor}`;
  }

  hex32(value) {
    return `0x${(Number(value) >>> 0).toString(16).padStart(8, "0")}`;
  }

  buildRiscVRegisterLines(rawRegs, regLayout) {
    if (!Array.isArray(rawRegs) || rawRegs.length < 32 || regLayout !== "x0-based") {
      return [];
    }

    const names = [
      "x0", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0/fp", "s1",
      "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "s2", "s3",
      "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4",
      "t5", "t6",
    ];

    return names.map((name, i) => `${name.padEnd(6, " ")} ${this.hex32(rawRegs[i])}`);
  }

  readU32FromLoadSegments(loadSegments, address) {
    for (const segment of loadSegments || []) {
      const start = segment.vaddr >>> 0;
      const end = (segment.vaddr + segment.filesz) >>> 0;
      if (address >= start && address + 4 <= end) {
        const local = address - start;
        const dv = new DataView(segment.data.buffer, segment.data.byteOffset, segment.data.byteLength);
        return dv.getUint32(local, true);
      }
    }
    return null;
  }

  isAddressInLoadSegments(loadSegments, address, byteLength = 4) {
    const length = Math.max(1, Number(byteLength) || 4);
    for (const segment of loadSegments || []) {
      const start = segment.vaddr >>> 0;
      const end = (segment.vaddr + segment.filesz) >>> 0;
      if (address >= start && address + length <= end) {
        return true;
      }
    }
    return false;
  }

  scoreStackPointerSignal(regs, loadSegments, symbols, execRanges) {
    const sp = regs?.sp;
    const pc = regs?.pc;
    const ra = regs?.ra;

    if (!Number.isFinite(sp) || !this.isAddressInLoadSegments(loadSegments, sp, 32)) {
      return -4;
    }

    let signal = 0;
    if ((sp & 0xfff) === 0) {
      signal -= 6;
    }

    const pcSymbol = Number.isFinite(pc) ? this.lookupSymbolForAddress(symbols, pc) : null;
    const raSymbol = Number.isFinite(ra) ? this.lookupSymbolForAddress(symbols, ra) : null;
    const likelyIdlePattern = /^(vPortYield|vPortTaskWrapper|prvIdleTask|esp_cpu_wait_for_intr|ulTaskGenericNotifyTake)$/;

    if (pcSymbol) {
      signal += 4;
      if (likelyIdlePattern.test(pcSymbol.name)) {
        signal -= 6;
      }
    } else {
      signal -= 4;
    }

    if (raSymbol) {
      signal += 3;
      if (likelyIdlePattern.test(raSymbol.name)) {
        signal -= 4;
      }
      if ((ra - raSymbol.value) === 0) {
        signal -= 3;
      }
    } else {
      signal -= 2;
    }

    if (Number.isFinite(pc) && Number.isFinite(ra) && pc === ra) {
      signal -= 2;
    }

    const seen = new Set();
    let sawRaOnStack = false;

    for (let i = 0; i < 192; i++) {
      const addr = (sp + i * 4) >>> 0;
      const value = this.readU32FromLoadSegments(loadSegments, addr);
      if (!Number.isFinite(value) || !this.isAddressInRanges(value, execRanges)) {
        continue;
      }

      if (Number.isFinite(ra) && value === ra && i <= 64) {
        sawRaOnStack = true;
      }

      const symbol = this.lookupSymbolForAddress(symbols, value);
      if (!symbol) {
        continue;
      }

      if (!seen.has(symbol.name)) {
        seen.add(symbol.name);
        signal += 2;
      } else {
        signal += 1;
      }

      if (signal >= 18) {
        break;
      }
    }

    if (sawRaOnStack) {
      signal += 4;
    }

    if (signal === 0) {
      return -2;
    }

    return signal;
  }

  extractFramesFromStackPointer(sp, loadSegments, symbols, execRanges) {
    const frames = [];
    const seen = new Set();

    for (let i = 0; i < 512; i++) {
      const addr = (sp + i * 4) >>> 0;
      const value = this.readU32FromLoadSegments(loadSegments, addr);
      if (!Number.isFinite(value)) {
        continue;
      }

      if (!this.isAddressInRanges(value, execRanges)) {
        continue;
      }

      const symbol = this.lookupSymbolForAddress(symbols, value);
      if (!symbol) {
        continue;
      }

      const key = `${value}:${symbol.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      frames.push({
        offset: addr,
        address: value,
        symbol,
      });

      if (frames.length >= 20) {
        break;
      }
    }

    return frames;
  }

  findLikelyRiscVRegisterSet(coredumpBytes, execRanges) {
    const dv = new DataView(coredumpBytes.buffer, coredumpBytes.byteOffset, coredumpBytes.byteLength);
    const best = this.findLikelyRiscVRegisterSetInRange(dv, 0, coredumpBytes.length, execRanges, 0);

    if (!best || best.score < 12) {
      return null;
    }

    if (!this.isRamAddress(best.regs.sp) || !this.isLikelyCodeAddress(best.regs.pc, execRanges)) {
      return null;
    }

    return best;
  }

  extractFramesNearOffset(coredumpBytes, startOffset, symbols, execRanges) {
    const dv = new DataView(coredumpBytes.buffer, coredumpBytes.byteOffset, coredumpBytes.byteLength);
    const begin = Math.max(0, startOffset - 0x80);
    const end = Math.min(coredumpBytes.length - 4, startOffset + 0x400);
    const frames = [];

    for (let offset = begin; offset <= end; offset += 4) {
      const address = dv.getUint32(offset, true);
      if (!this.isAddressInRanges(address, execRanges)) {
        continue;
      }

      const symbol = this.lookupSymbolForAddress(symbols, address);
      if (!symbol) {
        continue;
      }

      frames.push({
        offset,
        address,
        symbol,
      });
    }

    const deduped = [];
    const seen = new Set();
    for (const frame of frames) {
      const key = `${frame.address}:${frame.symbol.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(frame);
      if (deduped.length >= 24) {
        break;
      }
    }

    return deduped;
  }

  extractCandidateFrames(coredumpBytes, symbols, execRanges) {
    const dv = new DataView(coredumpBytes.buffer, coredumpBytes.byteOffset, coredumpBytes.byteLength);
    const minAddr = symbols[0].value;
    const maxAddr = symbols[symbols.length - 1].end;
    const hits = [];

    for (let offset = 0x40; offset + 4 <= coredumpBytes.length; offset += 4) {
      const addr = dv.getUint32(offset, true);
      if (addr < minAddr || addr > maxAddr) {
        continue;
      }

      if ((addr & 0x1) !== 0) {
        continue;
      }

      if (!this.isAddressInRanges(addr, execRanges)) {
        continue;
      }

      const symbol = this.lookupSymbolForAddress(symbols, addr);
      if (!symbol) {
        continue;
      }

      hits.push({
        offset,
        address: addr >>> 0,
        symbol,
      });
    }

    if (!hits.length) {
      return [];
    }

    const runs = [];
    let current = [hits[0]];

    for (let i = 1; i < hits.length; i++) {
      const prev = hits[i - 1];
      const item = hits[i];
      if (item.offset - prev.offset <= 16) {
        current.push(item);
      } else {
        runs.push(current);
        current = [item];
      }
    }
    runs.push(current);

    runs.sort((a, b) => b.length - a.length || a[0].offset - b[0].offset);
    const selected = runs[0].length >= 3 ? runs[0] : hits.slice(0, 40);

    const deduped = [];
    for (const item of selected) {
      const last = deduped[deduped.length - 1];
      if (last && last.address === item.address) {
        continue;
      }
      deduped.push(item);
      if (deduped.length >= 32) {
        break;
      }
    }

    return deduped;
  }

  extractPanicHint(coredumpBytes) {
    let ascii = "";
    let current = "";
    for (let i = 0; i < coredumpBytes.length; i++) {
      const c = coredumpBytes[i];
      if (c >= 0x20 && c <= 0x7e) {
        current += String.fromCharCode(c);
        if (current.length > 200) {
          current = current.slice(-200);
        }
      } else {
        if (current.length >= 12) {
          ascii += current + "\n";
        }
        current = "";
      }
      if (ascii.length > 8000) {
        break;
      }
    }

    const lines = ascii
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const hint = lines.find((line) => /(panic|guru|abort|exception|assert)/i.test(line));
    return hint || null;
  }

  decodeCoredumpClientSide(coredumpBytes, elfBytes) {
    const parsedElf = this.parseElfSymbols(elfBytes);
    const symbols = parsedElf.symbols;
    const parsedCore = this.parseCoredumpAsElf(coredumpBytes, parsedElf.execRanges, symbols);
    const parsedRawCore = parsedCore ? null : this.parseRawEspCoredump(coredumpBytes, parsedElf.execRanges, symbols);
    const activeCore = parsedCore || parsedRawCore;
    const regSet = activeCore?.regSet || this.findLikelyRiscVRegisterSet(coredumpBytes, parsedElf.execRanges);
    const coredumpIsElf =
      coredumpBytes instanceof Uint8Array &&
      coredumpBytes.length >= 4 &&
      coredumpBytes[0] === 0x7f &&
      coredumpBytes[1] === 0x45 &&
      coredumpBytes[2] === 0x4c &&
      coredumpBytes[3] === 0x46;

    let frames = [];
    if (regSet && activeCore?.loadSegments?.length) {
      frames = this.extractFramesFromStackPointer(
        regSet.regs.sp,
        activeCore.loadSegments,
        symbols,
        parsedElf.execRanges
      );
    }

    if (!frames.length) {
      frames = regSet
        ? this.extractFramesNearOffset(coredumpBytes, regSet.offset, symbols, parsedElf.execRanges)
        : this.extractCandidateFrames(coredumpBytes, symbols, parsedElf.execRanges);
    }

    const panicHint = this.extractPanicHint(coredumpBytes);

    const lines = [];
    lines.push("Client-side coredump decode (ELF symbolication)");
    lines.push(`Decoder build: ${CRASH_DECODER_BUILD}`);
    lines.push(`Symbols loaded: ${symbols.length}`);
    if (parsedCore) {
      lines.push(`Core format: ELF (${parsedCore.loadSegments.length} memory segments, ${parsedCore.notes.length} notes)`);
      if (parsedCore.extraInfoMarker) {
        lines.push(`Crashed task marker: 0x${parsedCore.extraInfoMarker.toString(16)}`);
        const markerTask = (parsedCore.taskInfos || []).find((task) => (task.taskTcbAddr >>> 0) === (parsedCore.extraInfoMarker >>> 0));
        if (markerTask) {
          lines.push(`Crashed task hint: index=${markerTask.taskIndex} tcb=0x${markerTask.taskTcbAddr.toString(16)}${markerTask.taskName ? ` name=${markerTask.taskName}` : ""}`);
        }
      }
      if (parsedCore.crashedTaskInfo) {
        const ti = parsedCore.crashedTaskInfo;
        lines.push(
          `Crashed task hint: tcb=0x${ti.taskTcbAddr.toString(16)} stack=0x${ti.taskStackStart.toString(16)}-0x${ti.taskStackEnd.toString(16)}`
        );
      }
    } else if (parsedRawCore) {
      const rawKind = parsedRawCore.format === "raw_wrapped_elf" ? "RAW+ELF" : "RAW";
      lines.push(`Core format: ${rawKind} (ESP coredump v${this.formatEspDumpVersion(parsedRawCore.dumpVer)})`);
      if (parsedRawCore.crashedTaskInfo) {
        const ti = parsedRawCore.crashedTaskInfo;
        lines.push(
          `Crashed task hint: tcb=0x${ti.taskTcbAddr.toString(16)} stack=0x${ti.taskStackStart.toString(16)}-0x${ti.taskStackEnd.toString(16)}`
        );
      }
    } else {
      lines.push(`Core format: ${coredumpIsElf ? "ELF (unparsed)" : "RAW/unknown"}`);
      lines.push("Crashed-task notes are unavailable for this core format, so register selection is heuristic.");
    }

    if (regSet) {
      lines.push(
        `Detected register block @ dump+0x${regSet.offset.toString(16)} pc=0x${regSet.regs.pc.toString(16)} ra=0x${regSet.regs.ra.toString(16)} sp=0x${regSet.regs.sp.toString(16)}`
      );
      if (regSet.fromCoreNote) {
        let source = `Register source: CORE note${regSet.inCrashedTaskStack ? " (SP matches crashed-task stack)" : ""}`;
        if (regSet.pidMatch) {
          source += " (pid marker match)";
        }
        lines.push(source);
      } else if (regSet.fromRawTask0) {
        lines.push(`Register source: RAW task[0] stack frame${regSet.inCrashedTaskStack ? " (SP matches crashed-task stack)" : ""}`);
      } else {
        lines.push("Register source: heuristic scan");
      }
    }

    if (regSet?.rawRegs?.length === 32 && regSet.regLayout === "x0-based") {
      lines.push("");
      lines.push("Current thread registers:");
      const regLines = this.buildRiscVRegisterLines(regSet.rawRegs, regSet.regLayout);
      for (const regLine of regLines) {
        lines.push(regLine);
      }
      lines.push(`pc     ${this.hex32(regSet.regs.pc)}`);
    }

    const threadHints = Array.isArray(activeCore?.taskInfos) ? activeCore.taskInfos : [];
    if (threadHints.length) {
      lines.push("");
      lines.push("Thread hints:");
      const top = threadHints.slice(0, 16);
      for (const task of top) {
        const name = task.taskName || "(name unavailable)";
        lines.push(
          `#${task.taskIndex} tcb=${this.hex32(task.taskTcbAddr)} stack=${this.hex32(task.taskStackStart)}-${this.hex32(task.taskStackEnd)} name=${name}`
        );
      }
    }

    if (panicHint) {
      lines.push(`Panic hint: ${panicHint}`);
    }
    lines.push("");
    lines.push("Candidate backtrace:");

    if (regSet) {
      const pcSymbol = this.lookupSymbolForAddress(symbols, regSet.regs.pc);
      const raSymbol = this.lookupSymbolForAddress(symbols, regSet.regs.ra);
      if (pcSymbol) {
        lines.push(
          `#0 0x${regSet.regs.pc.toString(16)} ${pcSymbol.name}+0x${(regSet.regs.pc - pcSymbol.value).toString(16)} (pc)`
        );
      }
      if (raSymbol && regSet.regs.ra !== regSet.regs.pc) {
        lines.push(
          `#1 0x${regSet.regs.ra.toString(16)} ${raSymbol.name}+0x${(regSet.regs.ra - raSymbol.value).toString(16)} (ra)`
        );
      }
    }

    const startIndex = regSet ? 2 : 0;
    frames.forEach((frame, index) => {
      const offsetInFn = frame.address - frame.symbol.value;
      lines.push(
        `#${index + startIndex} 0x${frame.address.toString(16)} ${frame.symbol.name}+0x${offsetInFn.toString(16)} (src+0x${frame.offset.toString(16)})`
      );
    });

    if (!frames.length) {
      lines.push("(no additional stack frames recovered from dump memory)");
      lines.push("This usually means full IDF unwinding is required for this crash.");
    }

    lines.push("");
    lines.push("Note: this browser decoder is best-effort and may include non-call addresses.");

    return { text: lines.join("\n") };
  }

  renderReport(reportData) {
    if (typeof reportData === "string") {
      this.reportEl.textContent = reportData;
      return;
    }

    if (!reportData || typeof reportData !== "object") {
      this.reportEl.textContent = "Decoder response was empty.";
      return;
    }

    if (reportData.report && typeof reportData.report === "string") {
      this.reportEl.textContent = reportData.report;
      return;
    }

    if (reportData.text && typeof reportData.text === "string") {
      this.reportEl.textContent = reportData.text;
      return;
    }

    const panic = reportData.panic_reason ? `Panic: ${reportData.panic_reason}\n` : "";
    const backtrace = Array.isArray(reportData.backtrace)
      ? `Backtrace:\n${reportData.backtrace.join("\n")}`
      : "";

    if (panic || backtrace) {
      this.reportEl.textContent = `${panic}${backtrace}`.trim();
      return;
    }

    this.reportEl.textContent = JSON.stringify(reportData, null, 2);
  }

  downloadLatestCoredump() {
    if (!this.latestCoredump) {
      return;
    }

    const blob = new Blob([this.latestCoredump.bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = this.latestCoredump.fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "--";
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
  }

  async runDecodeFlow({ decodeClientSide }) {
    const connected = !!window.serialConsole?.isConnected;

    if (!connected && !(this.hasManualCoreSelected() && this.hasManualElfSelected())) {
      this.appendLog("Connect to device or upload both coredump and ELF files.", "warning");
      return;
    }

    if (this.isBusy) {
      this.appendLog("A decode operation is already running.", "warning");
      return;
    }

    this.setBusy(true);
    this.reportEl.textContent = "Working...";
    this.appendLog("Starting crash collection sequence...");

    if (!connected) {
      try {
        const manualCore = await this.readManualCoredumpBytes();
        const manualElf = await this.readManualElfBytes();

        if (!manualCore || !manualElf) {
          throw new Error("Manual coredump and ELF files are both required for offline decode");
        }

        this.commitEl.textContent = "manual";
        this.buildConfigEl.textContent = "manual";
        this.latestCoredump = {
          bytes: manualCore.bytes,
          fileName: manualCore.fileName,
        };

        if (!decodeClientSide) {
          this.reportEl.textContent = "Manual coredump loaded successfully.";
        } else {
          const decoded = this.decodeCoredumpClientSide(manualCore.bytes, manualElf.elfBytes);
          this.renderReport(decoded);
          this.appendLog("Offline client-side decode completed.", "success");
        }
      } catch (error) {
        this.appendLog(error.message || String(error), "error");
        this.reportEl.textContent = `Crash decode failed: ${error.message || String(error)}`;
      } finally {
        this.setBusy(false);
      }
      return;
    }

    try {
      const chip = await this.readChipInfo();
      this.appendLog(`Detected firmware commit ${chip.commit}, config ${chip.buildConfig}`);

      this.commitEl.textContent = chip.commit;
      this.buildConfigEl.textContent = chip.buildConfig;

      const manualCore = await this.readManualCoredumpBytes();
      let coredumpBytes;
      let coredumpPath;
      let coredumpInfo = null;

      if (manualCore) {
        coredumpBytes = manualCore.bytes;
        coredumpPath = `(manual upload) ${manualCore.fileName}`;
        this.latestCoredump = {
          bytes: manualCore.bytes,
          fileName: manualCore.fileName,
        };
        this.appendLog(`Using manually uploaded coredump: ${manualCore.fileName}`);
      } else {
        coredumpInfo = await this.detectCoredumpPath();
        this.appendLog(`Getting coredump size: ${coredumpInfo.path}`);
        const coredumpSizeResult = await this.sdSize(coredumpInfo.path);
        const coredumpSize = coredumpSizeResult.size;

        if (!Number.isFinite(coredumpSize) || coredumpSize <= 0) {
          throw new Error("Coredump size is invalid");
        }

        this.appendLog(`Reading coredump payload (${coredumpSize} bytes)...`);
        const readTimeout = Math.max(30000, Math.ceil(coredumpSize / 2048) * 1000);
        const coredumpRead = await this.sdRead(coredumpInfo.path, 0, coredumpSize, readTimeout);

        coredumpBytes = coredumpRead.payload;
        coredumpPath = coredumpInfo.path;
        const fileName = coredumpInfo.path.split("/").pop() || "coredump.bin";
        this.latestCoredump = {
          bytes: coredumpRead.payload,
          fileName,
        };
      }

      const coredumpSize = coredumpBytes.length;

      this.latestMetadata = {
        commit: chip.commit,
        buildConfig: chip.buildConfig,
        coredumpPath,
        coredumpSize,
        coredumpMarker: coredumpInfo?.markerText || null,
        coredumpSummaryPath: coredumpInfo?.summaryPath || null,
        coredumpSummaryText: null,
        firmwareZipUrl: null,
        firmwareBinUrl: null,
        manifestUrl: CRASH_MANIFEST_URL,
      };

      if (coredumpInfo?.summaryPath) {
        this.appendLog("Reading coredump summary text...");
        const summaryText = await this.readSummaryText(coredumpInfo.summaryPath);
        if (summaryText) {
          this.latestMetadata.coredumpSummaryText = summaryText;
          this.appendLog("Loaded coredump summary text.");
        }
      }

      this.appendLog("Coredump capture complete.", "success");

      if (!decodeClientSide) {
        const summary = this.latestMetadata.coredumpSummaryText;
        this.reportEl.textContent = summary
          ? `Coredump collected successfully.\n\nSummary:\n${summary}`
          : "Coredump collected successfully. Upload an ELF file and click Decode Crash for symbolication.";
        return;
      }

      const manualElf = await this.readManualElfBytes();
      if (!manualElf) {
        throw new Error("Manual ELF file is required. Upload the matching .elf and retry decode.");
      }

      this.appendLog(`Using manually uploaded ELF: ${manualElf.elfName}`);
      const decoded = this.decodeCoredumpClientSide(coredumpBytes, manualElf.elfBytes);
      this.renderReport(decoded);
      this.appendLog("Client-side decode completed.", "success");
    } catch (error) {
      this.appendLog(error.message || String(error), "error");
      this.reportEl.textContent = `Crash decode failed: ${error.message || String(error)}`;
    } finally {
      this.setBusy(false);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("crashRoot");
  if (!root) return;

  window.crashDecoderTab = new CrashDecoderTab(root);
});
