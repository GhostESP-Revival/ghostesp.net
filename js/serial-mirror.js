const MIRROR_DEBUG = false;
const MIRROR_DIAG = true;
const MIRROR_MARKER = 0x47455350;
const MIRROR_END_MARKER = 0x444e4547;
const MIRROR_CMD_INFO = 0x01;
const MIRROR_CMD_FRAME = 0x02;
const MIRROR_CMD_FRAME_RLE = 0x03;
const MIRROR_CMD_FRAME_8BIT = 0x04;
const MIRROR_CMD_FRAME_8BIT_RLE = 0x05;
const MIRROR_CMD_FRAME_12BIT = 0x06;
const HEADER_SIZE = 17;
const MIRROR_CHECKSUM_SIZE = 2;
const MIRROR_MAX_DATA_LEN = 4096 * 4;

class SerialMirror {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.running = false;
    this.width = 320;
    this.height = 240;
    this.scale = 2;
    this.swapBytes = false;
    this.connected = false;
    this.buffer = new Uint8Array(0);
    this.frameCount = 0;
    this.fpsCounter = 0;
    this.fps = 0;
    this.lastFpsTime = performance.now();
    this.pixelData = new Uint8ClampedArray(320 * 240 * 4);
    this.fpsInterval = null;
    this.lastLoggedCmd = null;
    this.renderTimeout = null;
    this.currentMode = null;
    this._diagStats = { processed: 0, rejected: 0, waiting: 0 };
    this._lastRefreshReq = 0;
    this._waitStart = 0;
    this._waitTarget = 0;
    this._badHeaderKey = "";
    this._badHeaderCount = 0;
    this._lastFrameTime = 0;
    this._lastDataTime = 0;
    this._unsubscribeRaw = null;

    this.canvas = rootEl.querySelector("#mirrorDisplay");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.overlay = rootEl.querySelector("#mirrorOverlay");
    this.displayWrapper = rootEl.querySelector(".mirror-display-wrapper");
    this.statusDot = rootEl.querySelector("#mirrorStatusDot");

    this.initPixelData();
    this.setupUI();
    this.startFpsTimer();
    this.listenForConnection();
  }

  initPixelData() {
    for (let i = 0; i < this.pixelData.length; i += 4) this.pixelData[i + 3] = 255;
  }

  setupUI() {
    const startBtn = this.rootEl.querySelector("#mirrorStartBtn");
    const stopBtn = this.rootEl.querySelector("#mirrorStopBtn");
    const swapBtn = this.rootEl.querySelector("#mirrorSwapBtn");
    const screenshotBtn = this.rootEl.querySelector("#mirrorScreenshotBtn");
    const scaleDown = this.rootEl.querySelector("#mirrorScaleDown");
    const scaleUp = this.rootEl.querySelector("#mirrorScaleUp");

    if (startBtn) startBtn.onclick = () => this.startMirror();
    if (stopBtn) stopBtn.onclick = () => this.stopMirror();
    if (swapBtn) swapBtn.onclick = () => this.toggleSwap();
    if (screenshotBtn) screenshotBtn.onclick = () => this.takeScreenshot();
    if (scaleDown) scaleDown.onclick = () => this.changeScale(-1);
    if (scaleUp) scaleUp.onclick = () => this.changeScale(1);

    this.rootEl.querySelectorAll(".mirror-dpad-btn[data-cmd]").forEach((btn) => {
      btn.onclick = () => this.sendInput(btn.dataset.cmd);
    });

    this.keyHandler = (e) => {
      if (!document.querySelector("#tab-mirror.active")) return;
      const keyMap = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", Enter: "select", " ": "select" };
      if (keyMap[e.key]) { e.preventDefault(); this.sendInput(keyMap[e.key]); }
    };
    document.addEventListener("keydown", this.keyHandler);

    this.resizeObserver = new ResizeObserver(() => this.updateScale());
    if (this.displayWrapper) this.resizeObserver.observe(this.displayWrapper);
    requestAnimationFrame(() => this.updateScale());
    this.updateConnectionUI();
  }

  listenForConnection() {
    document.addEventListener("serial-connection-change", (e) => {
      if (!e.detail.connected && this.running) {
        this.stopMirror();
      }
      this.updateConnectionUI();
    });
  }

  startFpsTimer() {
    this.fpsInterval = setInterval(() => {
      this.fps = this.fpsCounter;
      this.fpsCounter = 0;
      this.updateStatus();
      this.updateDataHealth();
    }, 1000);
  }

  async startMirror() {
    const sc = window.serialConsole;
    if (!sc || !sc.isConnected) {
      this.overlay.classList.remove("hidden");
      this.overlay.textContent = "Connect to device first";
      return;
    }

    try {
      this.running = true;
      this.connected = true;
      this.buffer = new Uint8Array(0);
      this._lastFrameTime = 0;
      this._lastDataTime = 0;

      sc.setConsoleOutputSuppressed(true);
      this._unsubscribeRaw = sc.addRawDataListener((value) => {
        if (!this.running) return;
        this._lastDataTime = performance.now();
        this.appendBuffer(value);
        this.processBuffer();
      });

      await sc.sendCommand("mirror on");
      this.updateConnectionUI();
      this.updateStartStopUI();
    } catch (e) {
      console.error("Mirror start failed:", e);
      this.running = false;
      this.connected = false;
      this.updateConnectionUI();
    }
  }

  async stopMirror() {
    this.running = false;
    this.connected = false;

    if (this._unsubscribeRaw) { this._unsubscribeRaw(); this._unsubscribeRaw = null; }
    const sc = window.serialConsole;
    if (sc) {
      sc.setConsoleOutputSuppressed(false);
      try { await sc.sendCommand("mirror off"); } catch {}
    }

    this.buffer = new Uint8Array(0);
    this._lastFrameTime = 0;
    this._lastDataTime = 0;
    this.updateConnectionUI();
    this.updateStartStopUI();
  }

  destroy() {
    if (this.fpsInterval) { clearInterval(this.fpsInterval); this.fpsInterval = null; }
    if (this.keyHandler) { document.removeEventListener("keydown", this.keyHandler); this.keyHandler = null; }
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.renderTimeout) { clearTimeout(this.renderTimeout); this.renderTimeout = null; }
    this.stopMirror();
  }

  async sendCommand(cmd) {
    if (this.writer) {
      const encoder = new TextEncoder();
      await this.writer.write(encoder.encode(cmd + "\n"));
    } else {
      const sc = window.serialConsole;
      if (sc && sc.isConnected) { try { await sc.sendCommand(cmd); } catch {} }
    }
  }

  async sendInput(direction) { await this.sendCommand(`input ${direction}`); }

  async readLoop() {
    while (this.running && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this._lastDataTime = performance.now();
          this.appendBuffer(value);
          this.processBuffer();
        }
      } catch (e) {
        if (this.running) {
          console.error("Read error:", e);
          this.connected = false;
          this.updateConnectionUI();
        }
        break;
      }
    }
  }

  updateBaudDisplay(baud) {
    const el = this.rootEl.querySelector("#mirrorBaudRate");
    if (el) el.textContent = `${baud}`;
  }

  appendBuffer(newData) {
    const combined = new Uint8Array(this.buffer.length + newData.length);
    combined.set(this.buffer);
    combined.set(newData, this.buffer.length);
    this.buffer = combined;
  }

  findMarker(startOffset = 0) {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    for (let i = startOffset; i <= this.buffer.length - 4; i++) {
      if (view.getUint32(i, true) === MIRROR_MARKER) return i;
    }
    return -1;
  }

  resyncToNextMarker() {
    const nextMarker = this.findMarker(1);
    if (nextMarker > 0) this.buffer = this.buffer.slice(nextMarker);
    else this.buffer = this.buffer.length > 4 ? this.buffer.slice(-4) : this.buffer;
  }

  findEndMarker(startOffset) {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    for (let i = startOffset; i <= this.buffer.length - 4; i++) {
      if (view.getUint32(i, true) === MIRROR_END_MARKER) return i;
    }
    return -1;
  }

  requestRefresh(reason) {
    const now = performance.now();
    if (now - this._lastRefreshReq < 200) return;
    this._lastRefreshReq = now;
    if (MIRROR_DIAG) console.warn("[DIAG] requesting refresh due to", reason);
    this.sendCommand("mirror refresh");
  }

  checksum16(viewOrArray) {
    let sum = 0;
    for (let i = 0; i < viewOrArray.length; i++) sum = (sum + viewOrArray[i]) & 0xffff;
    return sum;
  }

  trackBadHeader(key, reason) {
    if (key === this._badHeaderKey) this._badHeaderCount++;
    else { this._badHeaderKey = key; this._badHeaderCount = 1; }
    if (this._badHeaderCount >= 2) { this.requestRefresh(reason || "repeat-bad-header"); this._badHeaderCount = 0; this._badHeaderKey = ""; }
  }

  processBuffer() {
    let packetsThisCall = 0;
    const maxPacketsPerCall = 4;

    if (MIRROR_DIAG) {
      const now = performance.now();
      if (!this._lastDiagTime || now - this._lastDiagTime > 1000) {
        this._lastDiagTime = now;
        console.log("[DIAG] buf:", this.buffer.length, "frames:", this.frameCount, "fps:", this.fps, "stats:", this._diagStats);
        this._diagStats = { processed: 0, rejected: 0, waiting: 0 };
      }
    }

    while (this.buffer.length >= HEADER_SIZE) {
      if (packetsThisCall >= maxPacketsPerCall) { this.forceRender(); setTimeout(() => this.processBuffer(), 0); return; }

      const markerPos = this.findMarker();
      if (markerPos < 0) {
        if (MIRROR_DIAG && this.buffer.length > 50) console.warn("[DIAG] no marker in", this.buffer.length, "bytes");
        this.buffer = this.buffer.length > 4 ? this.buffer.slice(-4) : this.buffer;
        break;
      }
      if (markerPos > 0) { if (MIRROR_DIAG) console.log("[DIAG] skipped", markerPos, "bytes to find marker"); this.buffer = this.buffer.slice(markerPos); }
      if (this.buffer.length < HEADER_SIZE) break;

      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
      const cmd = view.getUint8(4);
      const x1 = view.getUint16(5, true);
      const y1 = view.getUint16(7, true);
      const x2 = view.getUint16(9, true);
      const y2 = view.getUint16(11, true);
      const dataLen = view.getUint32(13, true);
      const w = x2 - x1 + 1;
      const h = y2 - y1 + 1;
      const pixelCount = w * h;
      const headerKey = `${cmd}-${x1}-${y1}-${x2}-${y2}-${dataLen}`;

      if (cmd === MIRROR_CMD_FRAME || cmd === MIRROR_CMD_FRAME_RLE || cmd === MIRROR_CMD_FRAME_8BIT || cmd === MIRROR_CMD_FRAME_8BIT_RLE || cmd === MIRROR_CMD_FRAME_12BIT) {
        let maxDataLen = 0;
        if (w <= 0 || h <= 0 || pixelCount <= 0 || w > 4096 || h > 4096) {
          if (MIRROR_DIAG) this._diagStats.rejected++;
          this.resyncToNextMarker(); this.requestRefresh("bad-geometry"); continue;
        }
        if (cmd === MIRROR_CMD_FRAME) maxDataLen = pixelCount * 2;
        else if (cmd === MIRROR_CMD_FRAME_RLE) maxDataLen = pixelCount * 3;
        else if (cmd === MIRROR_CMD_FRAME_8BIT) maxDataLen = pixelCount;
        else if (cmd === MIRROR_CMD_FRAME_8BIT_RLE) maxDataLen = pixelCount * 2;
        else if (cmd === MIRROR_CMD_FRAME_12BIT) maxDataLen = Math.ceil(pixelCount * 1.5);

        if (dataLen <= 0 || dataLen > maxDataLen || dataLen > MIRROR_MAX_DATA_LEN) {
          if (MIRROR_DIAG) this._diagStats.rejected++;
          this.resyncToNextMarker(); this.requestRefresh("bad-datalen"); this.trackBadHeader(headerKey, "bad-datalen"); continue;
        }
      }

      if (MIRROR_DEBUG && cmd !== this.lastLoggedCmd) {
        let cmdLabel = "UNKNOWN";
        if (cmd === MIRROR_CMD_INFO) cmdLabel = "INFO";
        else if (cmd === MIRROR_CMD_FRAME) cmdLabel = "FRAME_16_RAW";
        else if (cmd === MIRROR_CMD_FRAME_RLE) cmdLabel = "FRAME_16_RLE";
        else if (cmd === MIRROR_CMD_FRAME_8BIT) cmdLabel = "FRAME_8_RAW";
        else if (cmd === MIRROR_CMD_FRAME_8BIT_RLE) cmdLabel = "FRAME_8_RLE";
        else if (cmd === MIRROR_CMD_FRAME_12BIT) cmdLabel = "FRAME_12_RAW";
        console.log("[Mirror] cmd", cmdLabel, `0x${cmd.toString(16)}`, { x1, y1, x2, y2, dataLen });
        this.lastLoggedCmd = cmd;
      }

      if (cmd === MIRROR_CMD_INFO) {
        if (x1 !== this.width || y1 !== this.height) this.resizeDisplay(x1, y1);
        this.buffer = this.buffer.slice(HEADER_SIZE);
        continue;
      }

      if (cmd === MIRROR_CMD_FRAME || cmd === MIRROR_CMD_FRAME_RLE) {
        const totalNeededWithChecksum = HEADER_SIZE + dataLen + MIRROR_CHECKSUM_SIZE + 4;
        const totalNeededLegacy = HEADER_SIZE + dataLen + 4;
        const hasChecksum = this.buffer.length >= totalNeededWithChecksum;
        const totalNeeded = hasChecksum ? totalNeededWithChecksum : totalNeededLegacy;

        if (this.buffer.length < totalNeeded) {
          if (MIRROR_DIAG) { this._diagStats.waiting++; }
          const possibleEnd = this.findEndMarker(HEADER_SIZE);
          if (possibleEnd > 0 && possibleEnd >= HEADER_SIZE) {
            const payloadLen = possibleEnd - HEADER_SIZE - (hasChecksum ? MIRROR_CHECKSUM_SIZE : 0);
            if (payloadLen > 0 && payloadLen <= MIRROR_MAX_DATA_LEN) {
              const pixelData = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);
              const checksum = hasChecksum ? this.buffer[HEADER_SIZE + payloadLen] | (this.buffer[HEADER_SIZE + payloadLen + 1] << 8) : null;
              if (hasChecksum ? (this.checksum16(pixelData) === checksum) : true) {
                this.buffer = this.buffer.slice(possibleEnd + 4);
                this.updateModeDisplay(false);
                if (cmd === MIRROR_CMD_FRAME_RLE) this.processRLEFrame(x1, y1, x2, y2, pixelData);
                else this.processFrame(x1, y1, x2, y2, pixelData);
                packetsThisCall++; if (MIRROR_DIAG) this._diagStats.processed++; continue;
              }
            }
          }
          if (this._waitTarget !== totalNeeded) { this._waitTarget = totalNeeded; this._waitStart = performance.now(); }
          else if (performance.now() - this._waitStart > 200) { this.resyncToNextMarker(); this.requestRefresh("wait-timeout"); this._waitTarget = 0; break; }
          if (this.buffer.length > 4096) { this.resyncToNextMarker(); this.requestRefresh("buffer-bloat"); this._waitTarget = 0; break; }
          break;
        } else { this._waitTarget = 0; }

        const pixelData = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + dataLen);
        const checksum = hasChecksum ? view.getUint16(HEADER_SIZE + dataLen, true) : null;
        const endMarkerOffset = HEADER_SIZE + dataLen + (hasChecksum ? MIRROR_CHECKSUM_SIZE : 0);
        const endMarker = view.getUint32(endMarkerOffset, true);
        this.buffer = this.buffer.slice(totalNeeded);

        const hasData = dataLen > 0 && pixelData.length >= dataLen;
        const hasValidEnd = endMarker === MIRROR_END_MARKER;
        const hasValidChecksum = hasChecksum ? (this.checksum16(pixelData) === checksum) : true;

        if (!hasData || !hasValidEnd || !hasValidChecksum) {
          if (MIRROR_DIAG) this._diagStats.rejected++;
          const salvageEnd = this.findEndMarker(HEADER_SIZE);
          if (salvageEnd > 0 && salvageEnd > HEADER_SIZE) {
            const salvageLen = salvageEnd - HEADER_SIZE;
            const tryPayload = (withChecksum) => {
              const payloadLen = salvageLen - (withChecksum ? MIRROR_CHECKSUM_SIZE : 0);
              if (payloadLen <= 0 || payloadLen > MIRROR_MAX_DATA_LEN) return false;
              const payload = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);
              if (withChecksum) { const sc = this.buffer[HEADER_SIZE + payloadLen] | (this.buffer[HEADER_SIZE + payloadLen + 1] << 8); if (this.checksum16(payload) !== sc) return false; }
              this.buffer = this.buffer.slice(salvageEnd + 4);
              this.updateModeDisplay(false);
              if (cmd === MIRROR_CMD_FRAME_RLE) this.processRLEFrame(x1, y1, x2, y2, payload);
              else this.processFrame(x1, y1, x2, y2, payload);
              packetsThisCall++; if (MIRROR_DIAG) this._diagStats.processed++; return true;
            };
            if (tryPayload(true)) continue;
            if (tryPayload(false)) continue;
          }
          this.resyncToNextMarker(); this.requestRefresh("bad-end-marker"); continue;
        }

        this.updateModeDisplay(false);
        if (cmd === MIRROR_CMD_FRAME_RLE) this.processRLEFrame(x1, y1, x2, y2, pixelData);
        else this.processFrame(x1, y1, x2, y2, pixelData);
        packetsThisCall++; if (MIRROR_DIAG) this._diagStats.processed++;
      } else if (cmd === MIRROR_CMD_FRAME_8BIT) {
        const w8 = x2 - x1 + 1;
        const h8 = y2 - y1 + 1;
        const pixelCount8 = dataLen;
        if (pixelCount8 !== w8 * h8) { this.resyncToNextMarker(); continue; }

        const totalNeededLegacy = HEADER_SIZE + pixelCount8 + 4;
        const totalNeededWithChecksum = HEADER_SIZE + pixelCount8 + MIRROR_CHECKSUM_SIZE + 4;
        if (this.buffer.length < totalNeededLegacy) break;

        const pixelData8 = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + pixelCount8);
        const endMarkerLegacy = view.getUint32(HEADER_SIZE + pixelCount8, true);
        const hasChecksum8 = (endMarkerLegacy !== MIRROR_END_MARKER) && (this.buffer.length >= totalNeededWithChecksum);
        const checksum8 = hasChecksum8 ? view.getUint16(HEADER_SIZE + pixelCount8, true) : null;
        const endMarkerOffset8 = HEADER_SIZE + pixelCount8 + (hasChecksum8 ? MIRROR_CHECKSUM_SIZE : 0);
        const endMarker8 = view.getUint32(endMarkerOffset8, true);
        const hasValidChecksum8 = hasChecksum8 ? (this.checksum16(pixelData8) === checksum8) : true;

        if (endMarker8 !== MIRROR_END_MARKER || !hasValidChecksum8) { this.resyncToNextMarker(); continue; }
        this.buffer = this.buffer.slice(hasChecksum8 ? totalNeededWithChecksum : totalNeededLegacy);
        this.updateModeDisplay(true);
        this.processFrame8Bit(x1, y1, x2, y2, pixelData8);
        packetsThisCall++; if (MIRROR_DIAG) this._diagStats.processed++;
      } else if (cmd === MIRROR_CMD_FRAME_8BIT_RLE) {
        const w8r = x2 - x1 + 1;
        const h8r = y2 - y1 + 1;
        const expectedPixels = w8r * h8r;
        const encodedLen = dataLen;
        const totalNeededLegacy = HEADER_SIZE + encodedLen + 4;
        const totalNeededWithChecksum = HEADER_SIZE + encodedLen + MIRROR_CHECKSUM_SIZE + 4;
        if (this.buffer.length < totalNeededLegacy) break;

        const pixels = new Uint8Array(expectedPixels);
        let out = 0, offset = HEADER_SIZE;
        const dataEnd = HEADER_SIZE + encodedLen;
        while (offset + 1 < dataEnd && out < expectedPixels) {
          const count = this.buffer[offset++];
          const value = this.buffer[offset++];
          const runLen = Math.min(count, expectedPixels - out);
          pixels.fill(value, out, out + runLen);
          out += runLen;
        }

        const view2 = new DataView(this.buffer.buffer, this.buffer.byteOffset);
        const endMarkerLegacy = view2.getUint32(dataEnd, true);
        const hasChecksum = (endMarkerLegacy !== MIRROR_END_MARKER) && (this.buffer.length >= totalNeededWithChecksum);
        const checksum = hasChecksum ? view2.getUint16(dataEnd, true) : null;
        const endMarkerOffset = dataEnd + (hasChecksum ? MIRROR_CHECKSUM_SIZE : 0);
        if (endMarkerOffset + 4 > this.buffer.length) break;
        const endMarker = view2.getUint32(endMarkerOffset, true);
        const payload = this.buffer.slice(HEADER_SIZE, dataEnd);
        const hasValidChecksum = hasChecksum ? (this.checksum16(payload) === checksum) : true;

        if (endMarker !== MIRROR_END_MARKER || !hasValidChecksum) { this.resyncToNextMarker(); continue; }
        this.buffer = this.buffer.slice(hasChecksum ? totalNeededWithChecksum : totalNeededLegacy);
        this.updateModeDisplay(true);
        this.processFrame8Bit(x1, y1, x2, y2, pixels);
        packetsThisCall++; if (MIRROR_DIAG) this._diagStats.processed++;
      } else if (cmd === MIRROR_CMD_FRAME_12BIT) {
        const w12 = x2 - x1 + 1;
        const h12 = y2 - y1 + 1;
        const pixelCount12 = w12 * h12;
        const expectedLen = Math.floor(pixelCount12 / 2) * 3 + (pixelCount12 & 1 ? 2 : 0);
        if (dataLen !== expectedLen) { this.resyncToNextMarker(); continue; }

        const totalNeededLegacy = HEADER_SIZE + dataLen + 4;
        const totalNeededWithChecksum = HEADER_SIZE + dataLen + MIRROR_CHECKSUM_SIZE + 4;
        if (this.buffer.length < totalNeededLegacy) break;

        const payload = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + dataLen);
        const view2 = new DataView(this.buffer.buffer, this.buffer.byteOffset);
        const endMarkerLegacy = view2.getUint32(HEADER_SIZE + dataLen, true);
        const hasChecksum = (endMarkerLegacy !== MIRROR_END_MARKER) && (this.buffer.length >= totalNeededWithChecksum);
        const checksum = hasChecksum ? view2.getUint16(HEADER_SIZE + dataLen, true) : null;
        const endMarkerOffset = HEADER_SIZE + dataLen + (hasChecksum ? MIRROR_CHECKSUM_SIZE : 0);
        const endMarker = view2.getUint32(endMarkerOffset, true);
        const hasValidChecksum = hasChecksum ? (this.checksum16(payload) === checksum) : true;

        if (endMarker !== MIRROR_END_MARKER || !hasValidChecksum) { this.resyncToNextMarker(); continue; }
        this.buffer = this.buffer.slice(hasChecksum ? totalNeededWithChecksum : totalNeededLegacy);
        this.updateModeDisplay(false);
        this.processFrame12Bit(x1, y1, x2, y2, payload);
        packetsThisCall++; if (MIRROR_DIAG) this._diagStats.processed++;
      } else { this.resyncToNextMarker(); }
    }
  }

  resizeDisplay(w, h) {
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    if (this.displayWrapper) this.displayWrapper.style.aspectRatio = `${w} / ${h}`;
    this.pixelData = new Uint8ClampedArray(w * h * 4);
    this.initPixelData();
    this.updateScale();
    this.clearDisplay();
    const resEl = this.rootEl.querySelector("#mirrorResolution");
    if (resEl) resEl.textContent = `${w}\u00d7${h}`;
  }

  rgb332ToRgb(pixel8) {
    const r3 = (pixel8 >> 5) & 0x07;
    const g3 = (pixel8 >> 2) & 0x07;
    const b2 = pixel8 & 0x03;
    const bAs3 = b2 * 7 / 3;
    if (Math.abs(r3 - g3) <= 1 && Math.abs(((r3 + g3) / 2) - bAs3) <= 1.25) {
      const gray = Math.round(((r3 / 7) + (g3 / 7) + (b2 / 3)) / 3 * 255);
      return { r: gray, g: gray, b: gray };
    }
    return { r: Math.round(r3 * 255 / 7), g: Math.round(g3 * 255 / 7), b: Math.round(b2 * 255 / 3) };
  }

  scheduleRender() {
    if (this.renderTimeout) return;
    this.renderTimeout = setTimeout(() => { this.renderTimeout = null; this.doRender(); }, 16);
  }

  forceRender() {
    if (this.renderTimeout) { clearTimeout(this.renderTimeout); this.renderTimeout = null; }
    this.doRender();
  }

  doRender() {
    const imageData = new ImageData(this.pixelData, this.width, this.height);
    this.ctx.putImageData(imageData, 0, 0);
  }

  updateModeDisplay(is8bit) {
    this.currentMode = is8bit;
    const btn = this.rootEl.querySelector("#mirrorSwapBtn");
    if (btn) {
      btn.textContent = `Swap: ${this.swapBytes ? "ON" : "OFF"}`;
      btn.disabled = false;
      btn.classList.toggle("active", this.swapBytes);
    }
    const note = this.rootEl.querySelector("#mirror8BitNote");
    if (note) note.style.display = is8bit ? "block" : "none";
  }

  decodeRLE(rleData, pixelCount) {
    const pixels = new Uint16Array(pixelCount);
    let inPos = 0, outPos = 0;
    while (inPos < rleData.length && outPos < pixelCount) {
      const count = rleData[inPos++];
      const pixel = (rleData[inPos++] << 8) | rleData[inPos++];
      for (let i = 0; i < count && outPos < pixelCount; i++) pixels[outPos++] = pixel;
    }
    return { pixels, used: outPos };
  }

  processRLEFrame(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1, h = y2 - y1 + 1, pixelCount = w * h;
    const { pixels, used } = this.decodeRLE(data, pixelCount);
    outer16: for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = py * w + px;
        if (srcIdx >= used) break outer16;
        let pixel = pixels[srcIdx];
        if (this.swapBytes) pixel = ((pixel & 0xff) << 8) | ((pixel >> 8) & 0xff);
        const r = ((pixel >> 11) & 0x1f) << 3, g = ((pixel >> 5) & 0x3f) << 2, b = (pixel & 0x1f) << 3;
        const destX = x1 + px, destY = y1 + py;
        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r; this.pixelData[destIdx + 1] = g; this.pixelData[destIdx + 2] = b;
        }
      }
    }
    this.scheduleRender(); this.frameCount++; this.fpsCounter++; this._lastFrameTime = performance.now();
    if (this.connected && this.running) { this.overlay.classList.add("hidden"); this.overlay.textContent = ""; }
    const fc = this.rootEl.querySelector("#mirrorFrameCount"); if (fc) fc.textContent = this.frameCount;
  }

  processFrame8Bit(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1, h = y2 - y1 + 1, expectedSize = w * h;
    if (data.length < expectedSize) return;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const { r, g, b } = this.rgb332ToRgb(data[py * w + px]);
        const destX = x1 + px, destY = y1 + py;
        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r; this.pixelData[destIdx + 1] = g; this.pixelData[destIdx + 2] = b;
        }
      }
    }
    this.scheduleRender(); this.frameCount++; this.fpsCounter++; this._lastFrameTime = performance.now();
    if (this.connected && this.running) { this.overlay.classList.add("hidden"); this.overlay.textContent = ""; }
    const fc = this.rootEl.querySelector("#mirrorFrameCount"); if (fc) fc.textContent = this.frameCount;
  }

  processFrame12Bit(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1, h = y2 - y1 + 1, expectedPixels = w * h;
    const expectedLen = Math.floor(expectedPixels / 2) * 3 + (expectedPixels & 1 ? 2 : 0);
    if (data.length < expectedLen) return;
    let inPos = 0, outPix = 0;
    const writePixel = (pixel12, destX, destY) => {
      const r = ((pixel12 >> 8) & 0x0f) * 17, g = ((pixel12 >> 4) & 0x0f) * 17, b = (pixel12 & 0x0f) * 17;
      if (destX < this.width && destY < this.height) {
        const destIdx = (destY * this.width + destX) * 4;
        this.pixelData[destIdx] = r; this.pixelData[destIdx + 1] = g; this.pixelData[destIdx + 2] = b;
      }
    };
    while (outPix + 1 < expectedPixels && inPos + 2 < data.length) {
      const b0 = data[inPos++], b1 = data[inPos++], b2 = data[inPos++];
      writePixel((b0 << 4) | (b1 >> 4), x1 + (outPix % w), y1 + Math.floor(outPix / w)); outPix++;
      writePixel(((b1 & 0x0f) << 8) | b2, x1 + (outPix % w), y1 + Math.floor(outPix / w)); outPix++;
    }
    if (outPix < expectedPixels && inPos + 1 < data.length) {
      const b0 = data[inPos++], b1 = data[inPos++];
      writePixel((b0 << 4) | (b1 >> 4), x1 + (outPix % w), y1 + Math.floor(outPix / w)); outPix++;
    }
    this.scheduleRender(); this.frameCount++; this.fpsCounter++; this._lastFrameTime = performance.now();
    if (this.connected && this.running) { this.overlay.classList.add("hidden"); this.overlay.textContent = ""; }
    const fc = this.rootEl.querySelector("#mirrorFrameCount"); if (fc) fc.textContent = this.frameCount;
  }

  processFrame(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1, h = y2 - y1 + 1, expectedSize = w * h * 2;
    if (data.length < expectedSize) return;
    const view = new DataView(data.buffer, data.byteOffset);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = (py * w + px) * 2;
        const pixel = this.swapBytes ? view.getUint16(srcIdx, false) : view.getUint16(srcIdx, true);
        const r = ((pixel >> 11) & 0x1f) << 3, g = ((pixel >> 5) & 0x3f) << 2, b = (pixel & 0x1f) << 3;
        const destX = x1 + px, destY = y1 + py;
        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r; this.pixelData[destIdx + 1] = g; this.pixelData[destIdx + 2] = b;
        }
      }
    }
    this.scheduleRender(); this.frameCount++; this.fpsCounter++; this._lastFrameTime = performance.now();
    if (this.connected && this.running) { this.overlay.classList.add("hidden"); this.overlay.textContent = ""; }
    const fc = this.rootEl.querySelector("#mirrorFrameCount"); if (fc) fc.textContent = this.frameCount;
  }

  toggleSwap() {
    this.swapBytes = !this.swapBytes;
    const btn = this.rootEl.querySelector("#mirrorSwapBtn");
    if (btn) {
      btn.textContent = `Swap: ${this.swapBytes ? "ON" : "OFF"}`;
      btn.classList.toggle("active", this.swapBytes);
    }
    this.clearDisplay();
    this.sendCommand("mirror refresh");
  }

  takeScreenshot() {
    const link = document.createElement("a");
    link.download = `ghost_mirror_${Date.now()}.png`;
    link.href = this.canvas.toDataURL("image/png");
    link.click();
  }

  changeScale(delta) {
    this.scale = Math.max(1, Math.min(4, this.scale + delta));
    this.updateScale();
    this.sendCommand("mirror refresh");
  }

  updateScale() {
    const wrapperRect = this.displayWrapper.getBoundingClientRect();
    const maxW = wrapperRect.width - 4, maxH = wrapperRect.height - 4;
    let displayW = this.width * this.scale, displayH = this.height * this.scale;
    if (displayW > maxW || displayH > maxH) {
      const ratio = Math.min(maxW / displayW, maxH / displayH);
      displayW = Math.floor(displayW * ratio); displayH = Math.floor(displayH * ratio);
    }
    this.canvas.style.width = `${displayW}px`; this.canvas.style.height = `${displayH}px`;
    const scaleVal = this.rootEl.querySelector("#mirrorScaleValue");
    if (scaleVal) scaleVal.textContent = `${this.scale}x`;
  }

  clearDisplay() {
    this.pixelData.fill(0);
    for (let i = 3; i < this.pixelData.length; i += 4) this.pixelData[i] = 255;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  updateConnectionUI() {
    const sc = window.serialConsole;
    const deviceConnected = (sc && sc.isConnected) || this.connected;
    this.statusDot.classList.toggle("connected", this.running);
    this.statusDot.classList.toggle("device-connected", deviceConnected && !this.running);
    if (!deviceConnected) {
      this.overlay.classList.remove("hidden");
      this.overlay.textContent = "Connect to device first";
    } else if (!this.running) {
      this.overlay.classList.remove("hidden");
      this.overlay.textContent = "Click Start to begin mirroring";
    } else {
      this.overlay.classList.add("hidden");
      this.overlay.textContent = "";
    }
    this.updateStartStopUI();
  }

  updateStartStopUI() {
    const startBtn = this.rootEl.querySelector("#mirrorStartBtn");
    const stopBtn = this.rootEl.querySelector("#mirrorStopBtn");
    const sc = window.serialConsole;
    const deviceConnected = (sc && sc.isConnected) || this.connected;
    if (startBtn) startBtn.disabled = !deviceConnected || this.running;
    if (stopBtn) stopBtn.disabled = !this.running;
  }

  updateStatus() {
    const fpsEl = this.rootEl.querySelector("#mirrorFps");
    if (!fpsEl) return;
    fpsEl.textContent = this.fps;
    fpsEl.className = "mirror-stat-value " + (this.fps >= 10 ? "success" : this.fps >= 5 ? "warning" : "");
  }

  updateDataHealth() {
    if (!this.connected || !this.running || this._lastFrameTime) return;
    const now = performance.now();
    const recentlyReceivedData = this._lastDataTime && (now - this._lastDataTime) < 1500;
    this.overlay.classList.remove("hidden");
    this.overlay.textContent = recentlyReceivedData ? "Receiving data, waiting for first frame..." : "Not receiving data. Try a different baudrate.";
  }
}

function initSerialMirror(rootEl) {
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div class="mirror-container">
      <div class="mirror-main">
        <div class="mirror-display-wrapper">
          <canvas id="mirrorDisplay" width="320" height="240"></canvas>
          <div class="mirror-overlay" id="mirrorOverlay">Connect to device first</div>
        </div>
        <div class="mirror-controls">
          <div class="mirror-controls-label">Controls</div>
          <div class="mirror-dpad">
            <div class="mirror-dpad-btn empty"></div>
            <button class="mirror-dpad-btn" data-cmd="up">\u25b2</button>
            <div class="mirror-dpad-btn empty"></div>
            <button class="mirror-dpad-btn" data-cmd="left">\u25c4</button>
            <button class="mirror-dpad-btn" data-cmd="select">\u25cf</button>
            <button class="mirror-dpad-btn" data-cmd="right">\u25ba</button>
            <div class="mirror-dpad-btn empty"></div>
            <button class="mirror-dpad-btn" data-cmd="down">\u25bc</button>
            <div class="mirror-dpad-btn empty"></div>
          </div>
          <div class="mirror-hint">WASD / Arrows</div>
          <div class="mirror-divider"></div>
          <div class="mirror-action-row">
            <button class="mirror-action-btn start" id="mirrorStartBtn">Start</button>
            <button class="mirror-action-btn stop" id="mirrorStopBtn" disabled>Stop</button>
          </div>
          <div class="mirror-action-row">
            <button class="mirror-action-btn" id="mirrorSwapBtn">Swap: OFF</button>
            <button class="mirror-action-btn" id="mirrorScreenshotBtn">Screenshot</button>
          </div>
          <div class="mirror-note" id="mirror8BitNote" style="display:none;">
            8-bit mode: limited serial bandwidth, colors may be incorrect.
          </div>
        </div>
      </div>
      <div class="mirror-status-bar">
        <div class="mirror-status-dot-wrap"><div class="mirror-status-dot" id="mirrorStatusDot"></div></div>
        <span class="mirror-stat">Res:<span class="mirror-stat-value" id="mirrorResolution">320\u00d7240</span></span>
        <span class="mirror-stat">FPS:<span class="mirror-stat-value" id="mirrorFps">0</span></span>
        <div class="mirror-scale-controls">
          <button class="mirror-scale-btn" id="mirrorScaleDown">\u2212</button>
          <span class="mirror-stat-value" id="mirrorScaleValue">2x</span>
          <button class="mirror-scale-btn" id="mirrorScaleUp">+</button>
        </div>
        <span class="mirror-stat">Frames:<span class="mirror-stat-value" id="mirrorFrameCount">0</span></span>
      </div>
      <div class="mirror-unsupported" id="mirrorUnsupported" style="display:none;">
        <p>Web Serial API not supported.</p>
        <p>Please use Chrome or Edge.</p>
      </div>
    </div>
  `;

  if (window.serialMirror && typeof window.serialMirror.destroy === "function") window.serialMirror.destroy();
  if ("serial" in navigator) {
    rootEl.querySelector("#mirrorUnsupported").style.display = "none";
    window.serialMirror = new SerialMirror(rootEl);
  } else {
    rootEl.querySelector(".mirror-main").style.display = "none";
    rootEl.querySelector(".mirror-status-bar").style.display = "none";
    rootEl.querySelector("#mirrorUnsupported").style.display = "block";
  }
}

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");
  let mirrorInitialized = false;
  let filesInitialized = false;
  let crashInitialized = false;
  let activeTab = "console";

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      // Stop mirror when leaving mirror tab
      if (activeTab === "mirror" && tabId !== "mirror" && window.serialMirror?.running) {
        window.serialMirror.stopMirror();
      }
      activeTab = tabId;

      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${tabId}`).classList.add("active");

      if (tabId === "mirror" && !mirrorInitialized) {
        initSerialMirror(document.getElementById("mirrorRoot"));
        mirrorInitialized = true;
      }
      if (tabId === "files" && !filesInitialized) {
        window.fileBrowser = new FileBrowser();
        filesInitialized = true;
        if (window.serialConsole?.isConnected) {
          window.fileBrowser.debouncedRefresh();
        }
      }
      if (tabId === "crash" && !crashInitialized) {
        window.crashDecoderTab = new CrashDecoderTab(document.getElementById("crashRoot"));
        crashInitialized = true;
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => { setupTabs(); });
