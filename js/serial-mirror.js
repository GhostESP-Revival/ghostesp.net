const MIRROR_DEBUG = false;
const MIRROR_DIAG = true; // diagnostic logging for freeze debugging
const MIRROR_MARKER = 0x47455350;
const MIRROR_END_MARKER = 0x444e4547;
const MIRROR_CMD_INFO = 0x01;
const MIRROR_CMD_FRAME = 0x02;
const MIRROR_CMD_FRAME_RLE = 0x03;
const MIRROR_CMD_FRAME_8BIT = 0x04;
const MIRROR_CMD_FRAME_8BIT_RLE = 0x05;
const MIRROR_CMD_FRAME_12BIT = 0x06;
const HEADER_SIZE = 17;
const MIRROR_BAUD_RATES = [115200, 921600, 230400, 460800, 57600];
const MIRROR_CHECKSUM_SIZE = 2;
const MIRROR_MAX_DATA_LEN = 4096 * 4; // hard cap to avoid runaway buffers

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
    this.detectedBaud = null;
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

    this.canvas = rootEl.querySelector("#mirrorDisplay");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.overlay = rootEl.querySelector("#mirrorOverlay");
    this.displayWrapper = rootEl.querySelector(".mirror-display-wrapper");
    this.statusDot = rootEl.querySelector("#mirrorStatusDot");
    this.baudSelect = rootEl.querySelector("#mirrorBaudSelect");

    this.initPixelData();
    this.setupUI();
    this.startFpsTimer();
  }

  initPixelData() {
    for (let i = 0; i < this.pixelData.length; i += 4) {
      this.pixelData[i + 3] = 255;
    }
  }

  setupUI() {
    this.rootEl.querySelector("#mirrorConnectBtn").onclick = () =>
      this.connectManual();
    this.rootEl.querySelector("#mirrorDisconnectBtn").onclick = () =>
      this.disconnect();
    this.rootEl.querySelector("#mirrorSwapBtn").onclick = () =>
      this.toggleSwap();
    this.rootEl.querySelector("#mirrorScreenshotBtn").onclick = () =>
      this.takeScreenshot();
    this.rootEl.querySelector("#mirrorScaleDown").onclick = () =>
      this.changeScale(-1);
    this.rootEl.querySelector("#mirrorScaleUp").onclick = () =>
      this.changeScale(1);

    this.rootEl.querySelectorAll(".mirror-dpad-btn[data-cmd]").forEach((btn) => {
      btn.onclick = () => this.sendInput(btn.dataset.cmd);
    });

    this.keyHandler = (e) => {
      if (!document.querySelector("#tab-mirror.active")) return;
      const keyMap = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
        Enter: "select",
        " ": "select",
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        this.sendInput(keyMap[e.key]);
      }
    };
    document.addEventListener("keydown", this.keyHandler);

    this.resizeObserver = new ResizeObserver(() => {
      this.updateScale();
    });
    this.resizeObserver.observe(this.displayWrapper);

    requestAnimationFrame(() => this.updateScale());
  }

  startFpsTimer() {
    this.fpsInterval = setInterval(() => {
      this.fps = this.fpsCounter;
      this.fpsCounter = 0;
      this.updateStatus();
      this.updateDataHealth();
    }, 1000);
  }

  async connect() {
    if (!("serial" in navigator)) {
      alert("Web Serial API not supported");
      return;
    }

    try {
      this.port = await navigator.serial.requestPort();

      let baudToUse = MIRROR_BAUD_RATES[0];
      try {
        const detected = await this.autoDetectBaudOnPort();
        if (detected) {
          baudToUse = detected;
        }
      } catch (e) {
        console.error("Mirror baud auto-detect failed, using default", e);
      }

      await this.port.open({ baudRate: baudToUse });

      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();

      this.connected = true;
      this.running = true;
      this.updateConnectionUI();
      this.updateBaudDisplay(baudToUse);

      await this.sendCommand("mirror on");
      this.readLoop();
    } catch (e) {
      console.error("Connection failed:", e);
      this.connected = false;
      this.updateConnectionUI();
    }
  }

  async connectManual() {
    if (!("serial" in navigator)) {
      alert("Web Serial API not supported");
      return;
    }

    try {
      this.port = await navigator.serial.requestPort();

      let baudToUse = MIRROR_BAUD_RATES[0];
      if (this.baudSelect) {
        const selected = parseInt(this.baudSelect.value, 10);
        if (!Number.isNaN(selected)) {
          baudToUse = selected;
        }
      }

      await this.port.open({ baudRate: baudToUse });

      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();

      this.connected = true;
      this.running = true;
      this.updateConnectionUI();
      this.updateBaudDisplay(baudToUse);

      await this.sendCommand("mirror on");
      this.readLoop();
    } catch (e) {
      console.error("Connection failed:", e);
      this.connected = false;
      this.updateConnectionUI();
    }
  }

  async autoConnect() {
    if (!("serial" in navigator)) {
      alert("Web Serial API not supported");
      return;
    }

    try {
      this.port = await navigator.serial.requestPort();

      let baudToUse = MIRROR_BAUD_RATES[0];
      try {
        const detected = await this.autoDetectBaudOnPort();
        if (detected) {
          baudToUse = detected;
        }
      } catch (e) {
        console.error("Mirror baud auto-detect failed, using default", e);
      }

      await this.port.open({ baudRate: baudToUse });

      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();

      this.connected = true;
      this.running = true;
      this.updateConnectionUI();
      this.updateBaudDisplay(baudToUse);

      await this.sendCommand("mirror on");
      this.readLoop();
    } catch (e) {
      console.error("Connection failed:", e);
      this.connected = false;
      this.updateConnectionUI();
    }
  }

  updateBaudDisplay(baud) {
    const el = this.rootEl.querySelector("#mirrorBaudRate");
    if (el) el.textContent = `${baud}`;
  }

  findMarkerInData(data) {
    if (data.length < 4) return false;
    const view = new DataView(data.buffer, data.byteOffset);
    for (let i = 0; i <= data.length - 4; i++) {
      if (view.getUint32(i, true) === MIRROR_MARKER) {
        return true;
      }
    }
    return false;
  }

  scoreReadability(data) {
    if (!data || data.length === 0) return 0;
    let printable = 0;
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if ((c >= 0x20 && c <= 0x7e) || c === 0x0a || c === 0x0d || c === 0x09) {
        printable++;
      }
    }
    return printable / data.length;
  }

  async testBaudRate(baud, sampleMs = 600) {
    try {
      await this.port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });

      const writer = this.port.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode("mirror on\n"));
      writer.releaseLock();

      const reader = this.port.readable.getReader();
      const chunks = [];
      let totalBytes = 0;
      const deadline = Date.now() + sampleMs;

      while (Date.now() < deadline && totalBytes < 2048) {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), Math.max(50, deadline - Date.now()))
        );
        try {
          const { value, done } = await Promise.race([reader.read(), timeout]);
          if (done) break;
          if (value) {
            chunks.push(value);
            totalBytes += value.length;
          }
        } catch {
          break;
        }
      }

      const writer2 = this.port.writable.getWriter();
      await writer2.write(encoder.encode("mirror off\n"));
      writer2.releaseLock();

      await reader.cancel();
      reader.releaseLock();
      await this.port.close();

      if (totalBytes === 0) return { baud, score: 0, bytes: 0, hasMarker: false };

      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const hasMarker = this.findMarkerInData(combined);
      const readability = this.scoreReadability(combined);

      return { baud, score: hasMarker ? 1 : readability, bytes: totalBytes, hasMarker };
    } catch (e) {
      try { await this.port.close(); } catch {}
      return { baud, score: -1, bytes: 0, hasMarker: false, error: e.message };
    }
  }

  async autoDetectBaudOnPort() {
    const results = [];

    for (const baud of MIRROR_BAUD_RATES) {
      const result = await this.testBaudRate(baud, 500);
      results.push(result);

      if (result.hasMarker) {
        return baud;
      }
    }

    const withMarker = results.filter((r) => r.hasMarker && r.bytes > 0);
    if (withMarker.length === 0) {
      return null;
    }

    const best = withMarker.sort((a, b) => b.bytes - a.bytes)[0];
    return best ? best.baud : null;
  }

  async disconnect() {
    this.running = false;
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }

    this.port = null;
    this.reader = null;
    this.writer = null;
    this.connected = false;
    this.buffer = new Uint8Array(0);
    this._lastFrameTime = 0;
    this._lastDataTime = 0;
    this.updateConnectionUI();
  }

  destroy() {
    if (this.fpsInterval) {
      clearInterval(this.fpsInterval);
      this.fpsInterval = null;
    }
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
    this.disconnect();
  }

  async sendCommand(cmd) {
    if (this.writer) {
      const encoder = new TextEncoder();
      await this.writer.write(encoder.encode(cmd + "\n"));
    }
  }

  async sendInput(direction) {
    await this.sendCommand(`input ${direction}`);
  }

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

  appendBuffer(newData) {
    const combined = new Uint8Array(this.buffer.length + newData.length);
    combined.set(this.buffer);
    combined.set(newData, this.buffer.length);
    this.buffer = combined;
  }

  findMarker(startOffset = 0) {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    for (let i = startOffset; i <= this.buffer.length - 4; i++) {
      if (view.getUint32(i, true) === MIRROR_MARKER) {
        return i;
      }
    }
    return -1;
  }

  resyncToNextMarker() {
    // skip current marker byte and find the next valid marker
    const nextMarker = this.findMarker(1);
    if (nextMarker > 0) {
      this.buffer = this.buffer.slice(nextMarker);
    } else {
      // no marker found, keep last 4 bytes in case marker is split
      this.buffer = this.buffer.length > 4 ? this.buffer.slice(-4) : this.buffer;
    }
  }

  findEndMarker(startOffset) {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    for (let i = startOffset; i <= this.buffer.length - 4; i++) {
      if (view.getUint32(i, true) === MIRROR_END_MARKER) {
        return i;
      }
    }
    return -1;
  }

  requestRefresh(reason) {
    const now = performance.now();
    if (now - this._lastRefreshReq < 200) return;
    this._lastRefreshReq = now;
    if (MIRROR_DIAG) console.warn("[DIAG] requesting refresh due to", reason);
    // fire and forget
    this.sendCommand("mirror refresh");
  }

  checksum16(viewOrArray) {
    let sum = 0;
    for (let i = 0; i < viewOrArray.length; i++) {
      sum = (sum + viewOrArray[i]) & 0xffff;
    }
    return sum;
  }

  trackBadHeader(key, reason) {
    if (key === this._badHeaderKey) {
      this._badHeaderCount++;
    } else {
      this._badHeaderKey = key;
      this._badHeaderCount = 1;
    }
    if (this._badHeaderCount >= 2) {
      this.requestRefresh(reason || "repeat-bad-header");
      this._badHeaderCount = 0;
      this._badHeaderKey = "";
    }
  }

  processBuffer() {
    let packetsThisCall = 0;
    const maxPacketsPerCall = 4;

    // diagnostic: log buffer state every second
    if (MIRROR_DIAG) {
      const now = performance.now();
      if (!this._lastDiagTime || now - this._lastDiagTime > 1000) {
        this._lastDiagTime = now;
        console.log("[DIAG] buf:", this.buffer.length, "frames:", this.frameCount, "fps:", this.fps, "stats:", this._diagStats);
        this._diagStats = { processed: 0, rejected: 0, waiting: 0 };
      }
    }

    while (this.buffer.length >= HEADER_SIZE) {
      // yield after processing several packets to let renders happen
      if (packetsThisCall >= maxPacketsPerCall) {
        this.forceRender();
        setTimeout(() => this.processBuffer(), 0);
        return;
      }

      const markerPos = this.findMarker();
      if (markerPos < 0) {
        if (MIRROR_DIAG && this.buffer.length > 50) {
          console.warn("[DIAG] no marker in", this.buffer.length, "bytes - first 20:", Array.from(this.buffer.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
        this.buffer =
          this.buffer.length > 4 ? this.buffer.slice(-4) : this.buffer;
        break;
      }

      if (markerPos > 0) {
        if (MIRROR_DIAG) console.log("[DIAG] skipped", markerPos, "bytes to find marker");
        this.buffer = this.buffer.slice(markerPos);
      }

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

      if (
        cmd === MIRROR_CMD_FRAME ||
        cmd === MIRROR_CMD_FRAME_RLE ||
        cmd === MIRROR_CMD_FRAME_8BIT ||
        cmd === MIRROR_CMD_FRAME_8BIT_RLE ||
        cmd === MIRROR_CMD_FRAME_12BIT
      ) {
        let maxDataLen = 0;

        if (w <= 0 || h <= 0 || pixelCount <= 0 || w > 4096 || h > 4096) {
          if (MIRROR_DIAG) this._diagStats.rejected++;
          if (MIRROR_DEBUG || MIRROR_DIAG) {
            console.warn("[DIAG] Invalid geometry, resyncing", { cmd, x1, y1, x2, y2, w, h });
          }
          this.resyncToNextMarker();
          this.requestRefresh("bad-geometry");
          continue;
        }

        if (cmd === MIRROR_CMD_FRAME) {
          maxDataLen = pixelCount * 2;
        } else if (cmd === MIRROR_CMD_FRAME_RLE) {
          maxDataLen = pixelCount * 3;
        } else if (cmd === MIRROR_CMD_FRAME_8BIT) {
          maxDataLen = pixelCount;
        } else if (cmd === MIRROR_CMD_FRAME_8BIT_RLE) {
          maxDataLen = pixelCount * 2;
        } else if (cmd === MIRROR_CMD_FRAME_12BIT) {
          // packed RGB444: floor(n/2)*3 + (n%2 ? 2 : 0), cap at ceil(1.5n)
          maxDataLen = Math.ceil(pixelCount * 1.5);
        }

        if (dataLen <= 0 || dataLen > maxDataLen || dataLen > MIRROR_MAX_DATA_LEN) {
          if (MIRROR_DIAG) this._diagStats.rejected++;
          if (MIRROR_DEBUG || MIRROR_DIAG) {
            console.warn("[DIAG] Invalid dataLen, resyncing", { cmd, dataLen, maxDataLen, x1, y1, x2, y2 });
          }
          this.resyncToNextMarker();
          this.requestRefresh("bad-datalen");
          this.trackBadHeader(headerKey, "bad-datalen");
          continue;
        }
      }

      if (MIRROR_DEBUG) {
        console.debug("[Mirror] Header", {
          cmd,
          x1,
          y1,
          x2,
          y2,
          dataLen,
          bufferLen: this.buffer.length,
        });
      }

      if (cmd !== this.lastLoggedCmd) {
        let cmdLabel = "UNKNOWN";
        if (cmd === MIRROR_CMD_INFO) cmdLabel = "INFO";
        else if (cmd === MIRROR_CMD_FRAME) cmdLabel = "FRAME_16_RAW";
        else if (cmd === MIRROR_CMD_FRAME_RLE) cmdLabel = "FRAME_16_RLE";
        else if (cmd === MIRROR_CMD_FRAME_8BIT) cmdLabel = "FRAME_8_RAW";
        else if (cmd === MIRROR_CMD_FRAME_8BIT_RLE) cmdLabel = "FRAME_8_RLE";
        else if (cmd === MIRROR_CMD_FRAME_12BIT) cmdLabel = "FRAME_12_RAW";
        console.log("[Mirror] cmd", cmdLabel, `0x${cmd.toString(16)}`, {
          x1,
          y1,
          x2,
          y2,
          dataLen,
        });
        this.lastLoggedCmd = cmd;
      }

      if (cmd === MIRROR_CMD_INFO) {
        if (x1 !== this.width || y1 !== this.height) {
          this.resizeDisplay(x1, y1);
        }
        this.buffer = this.buffer.slice(HEADER_SIZE);
        continue;
      }

      if (cmd === MIRROR_CMD_FRAME || cmd === MIRROR_CMD_FRAME_RLE) {
        const totalNeededWithChecksum = HEADER_SIZE + dataLen + MIRROR_CHECKSUM_SIZE + 4;
        const totalNeededLegacy = HEADER_SIZE + dataLen + 4; // legacy no-checksum
        const hasChecksum = this.buffer.length >= totalNeededWithChecksum;
        const totalNeeded = hasChecksum ? totalNeededWithChecksum : totalNeededLegacy;

        if (this.buffer.length < totalNeeded) {
          if (MIRROR_DIAG) {
            this._diagStats.waiting++;
            console.log("[DIAG] waiting for data: have", this.buffer.length, "need", totalNeeded, "dataLen:", dataLen);
          }
          // salvage: if we already have an end marker in range, consume that frame instead of waiting forever
          const possibleEnd = this.findEndMarker(HEADER_SIZE);
          if (possibleEnd > 0 && possibleEnd >= HEADER_SIZE) {
            const payloadLen = possibleEnd - HEADER_SIZE - (hasChecksum ? MIRROR_CHECKSUM_SIZE : 0);
            if (payloadLen > 0 && payloadLen <= MIRROR_MAX_DATA_LEN) {
              if (MIRROR_DIAG) console.warn("[DIAG] salvaging frame with payloadLen", payloadLen, "expected", dataLen);
              const pixelData = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);
              const checksum = hasChecksum
                ? this.buffer[HEADER_SIZE + payloadLen] | (this.buffer[HEADER_SIZE + payloadLen + 1] << 8)
                : null;
              const calcOk = hasChecksum ? (this.checksum16(pixelData) === checksum) : true;
              if (calcOk) {
                this.buffer = this.buffer.slice(possibleEnd + 4);
                this.updateModeDisplay(false);
                if (cmd === MIRROR_CMD_FRAME_RLE) {
                  this.processRLEFrame(x1, y1, x2, y2, pixelData);
                } else {
                  this.processFrame(x1, y1, x2, y2, pixelData);
                }
                packetsThisCall++;
                if (MIRROR_DIAG) this._diagStats.processed++;
                continue;
              }
            }
          }
          // track how long we've been waiting on this packet
          if (this._waitTarget !== totalNeeded) {
            this._waitTarget = totalNeeded;
            this._waitStart = performance.now();
          } else if (performance.now() - this._waitStart > 200) {
            if (MIRROR_DIAG) console.warn("[DIAG] wait timeout, resyncing + refresh");
            this.resyncToNextMarker();
            this.requestRefresh("wait-timeout");
            this._waitTarget = 0;
            break;
          }
          // if we've accumulated more than 4096 bytes while waiting, resync to avoid deadlock
          if (this.buffer.length > 4096) {
            if (MIRROR_DIAG) console.warn("[DIAG] buffer bloated while waiting, resyncing");
            this.resyncToNextMarker();
            this.requestRefresh("buffer-bloat");
            this._waitTarget = 0;
            break;
          }
          break;
        } else {
          this._waitTarget = 0;
        }

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
          if (MIRROR_DEBUG || MIRROR_DIAG) {
            console.warn("[DIAG] Invalid end marker", {
              endMarker: '0x' + endMarker.toString(16),
              expected: '0x' + MIRROR_END_MARKER.toString(16),
              hasData,
              dataLen,
              checksum,
              checksumCalc: hasChecksum ? this.checksum16(pixelData) : null,
            });
          }
          // attempt salvage: find next end marker in current buffer and draw what we have
          const salvageEnd = this.findEndMarker(HEADER_SIZE);
          if (salvageEnd > 0 && salvageEnd > HEADER_SIZE) {
            const salvageLen = salvageEnd - HEADER_SIZE;
            // try with checksum first, then without
            const tryPayload = (withChecksum) => {
              const payloadLen = salvageLen - (withChecksum ? MIRROR_CHECKSUM_SIZE : 0);
              if (payloadLen <= 0 || payloadLen > MIRROR_MAX_DATA_LEN) return false;
              const payload = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);
              if (withChecksum) {
                const salvageChecksum = this.buffer[HEADER_SIZE + payloadLen] | (this.buffer[HEADER_SIZE + payloadLen + 1] << 8);
                if (this.checksum16(payload) !== salvageChecksum) return false;
              }
              this.buffer = this.buffer.slice(salvageEnd + 4);
              if (MIRROR_DIAG) console.warn("[DIAG] salvaging after bad end marker len", payloadLen, "withChecksum", withChecksum);
              this.updateModeDisplay(false);
              if (cmd === MIRROR_CMD_FRAME_RLE) {
                this.processRLEFrame(x1, y1, x2, y2, payload);
              } else {
                this.processFrame(x1, y1, x2, y2, payload);
              }
              packetsThisCall++;
              if (MIRROR_DIAG) this._diagStats.processed++;
              return true;
            };
            if (tryPayload(true)) continue;
            if (tryPayload(false)) continue;
          }
          // resync to next marker instead of waiting on a bad packet
          this.resyncToNextMarker();
          this.requestRefresh("bad-end-marker");
          continue;
        }

        if (MIRROR_DEBUG) {
          console.debug("[Mirror] Frame packet accepted", {
            cmd,
            x1,
            y1,
            x2,
            y2,
            dataLen,
          });
        }

        this.updateModeDisplay(false);
        if (cmd === MIRROR_CMD_FRAME_RLE) {
          this.processRLEFrame(x1, y1, x2, y2, pixelData);
        } else {
          this.processFrame(x1, y1, x2, y2, pixelData);
        }
        packetsThisCall++;
        if (MIRROR_DIAG) this._diagStats.processed++;
      } else if (cmd === MIRROR_CMD_FRAME_8BIT) {
        const w = x2 - x1 + 1;
        const h = y2 - y1 + 1;
        const pixelCount = dataLen;

        if (pixelCount !== w * h) {
          if (MIRROR_DEBUG) {
            console.warn("[Mirror] 8-bit raw frame size mismatch, skipping", {
              cmd,
              x1,
              y1,
              x2,
              y2,
              pixelCount,
              expected: w * h,
            });
          }
          this.resyncToNextMarker();
          continue;
        }

        const totalNeededLegacy = HEADER_SIZE + pixelCount + 4;
        const totalNeededWithChecksum = HEADER_SIZE + pixelCount + MIRROR_CHECKSUM_SIZE + 4;
        if (this.buffer.length < totalNeededLegacy) {
          if (MIRROR_DIAG) console.log("[DIAG] 8bit waiting: have", this.buffer.length, "need", totalNeededLegacy);
          break;
        }

        const pixelData = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + pixelCount);
        const endMarkerLegacy = view.getUint32(HEADER_SIZE + pixelCount, true);
        const hasChecksum = (endMarkerLegacy !== MIRROR_END_MARKER) && (this.buffer.length >= totalNeededWithChecksum);
        const checksum = hasChecksum ? view.getUint16(HEADER_SIZE + pixelCount, true) : null;
        const endMarkerOffset = HEADER_SIZE + pixelCount + (hasChecksum ? MIRROR_CHECKSUM_SIZE : 0);
        const endMarker = view.getUint32(endMarkerOffset, true);

        const hasValidChecksum = hasChecksum ? (this.checksum16(pixelData) === checksum) : true;

        if (endMarker !== MIRROR_END_MARKER || !hasValidChecksum) {
          if (MIRROR_DEBUG || MIRROR_DIAG) {
            console.warn("[DIAG] 8-bit Invalid end marker", {
              cmd,
              x1,
              y1,
              x2,
              y2,
              pixelCount,
              endMarker,
            });
          }
          this.resyncToNextMarker();
          continue;
        }

        this.buffer = this.buffer.slice(hasChecksum ? totalNeededWithChecksum : totalNeededLegacy);

        if (MIRROR_DEBUG) {
          console.debug("[Mirror] 8-bit raw frame accepted", {
            cmd,
            x1,
            y1,
            x2,
            y2,
            pixelCount,
          });
        }

        this.updateModeDisplay(true);
        this.processFrame8Bit(x1, y1, x2, y2, pixelData);
        packetsThisCall++;
        if (MIRROR_DIAG) this._diagStats.processed++;
      } else if (cmd === MIRROR_CMD_FRAME_8BIT_RLE) {
        const w = x2 - x1 + 1;
        const h = y2 - y1 + 1;
        const expectedPixels = w * h;
        const encodedLen = dataLen; // firmware now sends encoded length
        const totalNeededLegacy = HEADER_SIZE + encodedLen + 4;
        const totalNeededWithChecksum = HEADER_SIZE + encodedLen + MIRROR_CHECKSUM_SIZE + 4;
        if (this.buffer.length < totalNeededLegacy) break;

        const pixels = new Uint8Array(expectedPixels);
        let out = 0;
        let offset = HEADER_SIZE;
        const dataEnd = HEADER_SIZE + encodedLen;

        while (offset + 1 < dataEnd && out < expectedPixels) {
          const count = this.buffer[offset++];
          const value = this.buffer[offset++];
          const remaining = expectedPixels - out;
          const runLen = Math.min(count, remaining);
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

        if (endMarker !== MIRROR_END_MARKER || !hasValidChecksum) {
          if (MIRROR_DEBUG) {
            console.warn("[Mirror] Invalid 8-bit RLE end marker, skipping", {
              cmd,
              x1,
              y1,
              x2,
              y2,
              expectedPixels,
              endMarker,
            });
          }
          this.resyncToNextMarker();
          continue;
        }

        this.buffer = this.buffer.slice(hasChecksum ? totalNeededWithChecksum : totalNeededLegacy);

        if (MIRROR_DEBUG) {
          console.debug("[Mirror] 8-bit RLE frame accepted", {
            cmd,
            x1,
            y1,
            x2,
            y2,
            expectedPixels,
          });
        }

        this.updateModeDisplay(true);
        this.processFrame8Bit(x1, y1, x2, y2, pixels);
        packetsThisCall++;
        if (MIRROR_DIAG) this._diagStats.processed++;
      } else if (cmd === MIRROR_CMD_FRAME_12BIT) {
        const w = x2 - x1 + 1;
        const h = y2 - y1 + 1;
        const pixelCount = w * h;
        const expectedLen = Math.floor(pixelCount / 2) * 3 + (pixelCount & 1 ? 2 : 0);

        if (dataLen !== expectedLen) {
          if (MIRROR_DEBUG || MIRROR_DIAG) {
            console.warn("[DIAG] 12-bit packed frame size mismatch, resyncing", {
              cmd,
              x1,
              y1,
              x2,
              y2,
              dataLen,
              expectedLen,
            });
          }
          this.resyncToNextMarker();
          continue;
        }

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

        if (endMarker !== MIRROR_END_MARKER || !hasValidChecksum) {
          if (MIRROR_DEBUG || MIRROR_DIAG) {
            console.warn("[DIAG] 12-bit Invalid end marker/checksum, resyncing", {
              cmd,
              endMarker,
              checksum,
            });
          }
          this.resyncToNextMarker();
          continue;
        }

        this.buffer = this.buffer.slice(hasChecksum ? totalNeededWithChecksum : totalNeededLegacy);

        this.updateModeDisplay(false);
        this.processFrame12Bit(x1, y1, x2, y2, payload);
        packetsThisCall++;
        if (MIRROR_DIAG) this._diagStats.processed++;
      } else {
        this.resyncToNextMarker();
      }
    }
  }

  resizeDisplay(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.pixelData = new Uint8ClampedArray(w * h * 4);
    this.initPixelData();
    this.updateScale();
    this.clearDisplay();
    this.rootEl.querySelector("#mirrorResolution").textContent = `${w}×${h}`;
  }

  rgb332ToRgb(pixel8) {
    // firmware produces RRRGGGBB: R=bits[7:5], G=bits[4:2], B=bits[1:0]
    const r3 = (pixel8 >> 5) & 0x07;
    const g3 = (pixel8 >> 2) & 0x07;
    const b2 = pixel8 & 0x03;

    return {
      r: Math.round(r3 * 255 / 7),
      g: Math.round(g3 * 255 / 7),
      b: Math.round(b2 * 255 / 3),
    };
  }

  scheduleRender() {
    // don't reset pending render - prevents starvation during rapid partial updates
    if (this.renderTimeout) return;
    this.renderTimeout = setTimeout(() => {
      this.renderTimeout = null;
      this.doRender();
    }, 16);
  }

  forceRender() {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
    this.doRender();
  }

  doRender() {
        const imageData = new ImageData(this.pixelData, this.width, this.height);
        this.ctx.putImageData(imageData, 0, 0);
  }

  updateModeDisplay(is8bit) {
    this.currentMode = is8bit;
    const btn = this.rootEl.querySelector("#mirrorSwapBtn");
    btn.textContent = `Swap: ${this.swapBytes ? "ON" : "OFF"}`;
    btn.disabled = false;
    btn.classList.toggle("active", this.swapBytes);
    const note = this.rootEl.querySelector("#mirror8BitNote");
    if (note) {
      note.style.display = is8bit ? "block" : "none";
    }
  }

  decodeRLE(rleData, pixelCount) {
    const pixels = new Uint16Array(pixelCount);
    let inPos = 0, outPos = 0;
    while (inPos < rleData.length && outPos < pixelCount) {
      const count = rleData[inPos++];
      const pixel = (rleData[inPos++] << 8) | rleData[inPos++];
      for (let i = 0; i < count && outPos < pixelCount; i++) {
        pixels[outPos++] = pixel;
      }
    }
    return { pixels, used: outPos };
  }

  decodeRLE8Bit(rleData, pixelCount) {
    const pixels = new Uint8Array(pixelCount);
    let inPos = 0, outPos = 0;

    while (inPos < rleData.length && outPos < pixelCount) {
      const count = rleData[inPos++];
      const pixel8 = rleData[inPos++];
      for (let i = 0; i < count && outPos < pixelCount; i++) {
        pixels[outPos++] = pixel8;
      }
    }

    return { pixels, used: outPos };
  }

  processRLEFrame(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const pixelCount = w * h;
    const { pixels, used } = this.decodeRLE(data, pixelCount);

    if (used !== pixelCount && MIRROR_DEBUG) {
      console.warn("[Mirror] RLE decode length mismatch, drawing partial frame", {
        expected: pixelCount,
        actual: used,
        x1,
        y1,
        x2,
        y2,
      });
    }

    outer16: for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = py * w + px;
        if (srcIdx >= used) {
          break outer16;
        }
        let pixel = pixels[srcIdx];

        if (this.swapBytes) {
          pixel = ((pixel & 0xff) << 8) | ((pixel >> 8) & 0xff);
        }

        const r = ((pixel >> 11) & 0x1f) << 3;
        const g = ((pixel >> 5) & 0x3f) << 2;
        const b = (pixel & 0x1f) << 3;

        const destX = x1 + px;
        const destY = y1 + py;

        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r;
          this.pixelData[destIdx + 1] = g;
          this.pixelData[destIdx + 2] = b;
        }
      }
    }

    this.scheduleRender();
    this.frameCount++;
    this.fpsCounter++;
    this._lastFrameTime = performance.now();
    if (this.connected && this.running) {
      this.overlay.classList.add("hidden");
      this.overlay.textContent = "";
    }
    this.rootEl.querySelector("#mirrorFrameCount").textContent = this.frameCount;
  }

  processRLEFrame8Bit(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const pixelCount = w * h;
    const { pixels, used } = this.decodeRLE8Bit(data, pixelCount);

    if (used !== pixelCount && MIRROR_DEBUG) {
      console.warn("[Mirror] 8-bit RLE decode length mismatch, drawing partial frame", {
        expected: pixelCount,
        actual: used,
        x1,
        y1,
        x2,
        y2,
      });
    }

    outer8: for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = py * w + px;
        if (srcIdx >= used) {
          break outer8;
        }
        const pixel8 = pixels[srcIdx];
        const { r, g, b } = this.rgb332ToRgb(pixel8);

        const destX = x1 + px;
        const destY = y1 + py;

        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r;
          this.pixelData[destIdx + 1] = g;
          this.pixelData[destIdx + 2] = b;
        }
      }
    }

    this.scheduleRender();
    this.frameCount++;
    this.fpsCounter++;
    this._lastFrameTime = performance.now();
    if (this.connected && this.running) {
      this.overlay.classList.add("hidden");
      this.overlay.textContent = "";
    }
    this.rootEl.querySelector("#mirrorFrameCount").textContent = this.frameCount;
  }

  processFrame8Bit(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const expectedSize = w * h;

    if (data.length < expectedSize) return;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = py * w + px;
        const pixel8 = data[srcIdx];
        const { r, g, b } = this.rgb332ToRgb(pixel8);

        const destX = x1 + px;
        const destY = y1 + py;

        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r;
          this.pixelData[destIdx + 1] = g;
          this.pixelData[destIdx + 2] = b;
        }
      }
    }

    this.scheduleRender();
    this.frameCount++;
    this.fpsCounter++;
    this._lastFrameTime = performance.now();
    if (this.connected && this.running) {
      this.overlay.classList.add("hidden");
      this.overlay.textContent = "";
    }
    this.rootEl.querySelector("#mirrorFrameCount").textContent = this.frameCount;
  }

  processFrame12Bit(x1, y1, x2, y2, data) {
    // Packed RGB444: [p0(11:4)], [p0(3:0)<<4 | p1(11:8)], [p1(7:0)]
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const expectedPixels = w * h;
    const expectedLen = Math.floor(expectedPixels / 2) * 3 + (expectedPixels & 1 ? 2 : 0);
    if (data.length < expectedLen) return;

    let inPos = 0;
    let outPix = 0;

    const writePixel = (pixel12, destX, destY) => {
      const r4 = (pixel12 >> 8) & 0x0f;
      const g4 = (pixel12 >> 4) & 0x0f;
      const b4 = pixel12 & 0x0f;
      const r = r4 * 17;
      const g = g4 * 17;
      const b = b4 * 17;

      if (destX < this.width && destY < this.height) {
        const destIdx = (destY * this.width + destX) * 4;
        this.pixelData[destIdx] = r;
        this.pixelData[destIdx + 1] = g;
        this.pixelData[destIdx + 2] = b;
      }
    };

    while (outPix + 1 < expectedPixels && inPos + 2 < data.length) {
      const b0 = data[inPos++];
      const b1 = data[inPos++];
      const b2 = data[inPos++];
      const p0 = (b0 << 4) | (b1 >> 4);
      const p1 = ((b1 & 0x0f) << 8) | b2;

      const px0 = outPix % w;
      const py0 = Math.floor(outPix / w);
      writePixel(p0, x1 + px0, y1 + py0);
      outPix++;

      const px1 = outPix % w;
      const py1 = Math.floor(outPix / w);
      writePixel(p1, x1 + px1, y1 + py1);
      outPix++;
    }

    if (outPix < expectedPixels && inPos + 1 < data.length) {
      const b0 = data[inPos++];
      const b1 = data[inPos++];
      const p0 = (b0 << 4) | (b1 >> 4);
      const px0 = outPix % w;
      const py0 = Math.floor(outPix / w);
      writePixel(p0, x1 + px0, y1 + py0);
      outPix++;
    }

    this.scheduleRender();
    this.frameCount++;
    this.fpsCounter++;
    this._lastFrameTime = performance.now();
    if (this.connected && this.running) {
      this.overlay.classList.add("hidden");
      this.overlay.textContent = "";
    }
    this.rootEl.querySelector("#mirrorFrameCount").textContent = this.frameCount;
  }

  processFrame(x1, y1, x2, y2, data) {
    const w = x2 - x1 + 1;
    const h = y2 - y1 + 1;
    const expectedSize = w * h * 2;

    if (data.length < expectedSize) return;

    const view = new DataView(data.buffer, data.byteOffset);

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const srcIdx = (py * w + px) * 2;
        let pixel;

        if (this.swapBytes) {
          pixel = view.getUint16(srcIdx, false);
        } else {
          pixel = view.getUint16(srcIdx, true);
        }

        const r = ((pixel >> 11) & 0x1f) << 3;
        const g = ((pixel >> 5) & 0x3f) << 2;
        const b = (pixel & 0x1f) << 3;

        const destX = x1 + px;
        const destY = y1 + py;

        if (destX < this.width && destY < this.height) {
          const destIdx = (destY * this.width + destX) * 4;
          this.pixelData[destIdx] = r;
          this.pixelData[destIdx + 1] = g;
          this.pixelData[destIdx + 2] = b;
        }
      }
    }

    this.scheduleRender();
    this.frameCount++;
    this.fpsCounter++;
    this._lastFrameTime = performance.now();
    if (this.connected && this.running) {
      this.overlay.classList.add("hidden");
      this.overlay.textContent = "";
    }
    this.rootEl.querySelector("#mirrorFrameCount").textContent = this.frameCount;
  }

  toggleSwap() {
    this.swapBytes = !this.swapBytes;
    const btn = this.rootEl.querySelector("#mirrorSwapBtn");
    btn.textContent = `Swap: ${this.swapBytes ? "ON" : "OFF"}`;
    btn.classList.toggle("active", this.swapBytes);
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
    const maxW = wrapperRect.width - 4;
    const maxH = wrapperRect.height - 4;

    let displayW = this.width * this.scale;
    let displayH = this.height * this.scale;

    if (displayW > maxW || displayH > maxH) {
      const ratio = Math.min(maxW / displayW, maxH / displayH);
      displayW = Math.floor(displayW * ratio);
      displayH = Math.floor(displayH * ratio);
    }

    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;
    this.rootEl.querySelector("#mirrorScaleValue").textContent = `${this.scale}x`;
  }

  clearDisplay() {
    this.pixelData.fill(0);
    for (let i = 3; i < this.pixelData.length; i += 4) {
      this.pixelData[i] = 255;
    }
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  updateConnectionUI() {
    this.statusDot.classList.toggle("connected", this.connected);
    this.overlay.classList.toggle("hidden", this.connected);
    this.overlay.textContent = this.connected ? "" : "Disconnected";
  }

  updateStatus() {
    const fpsEl = this.rootEl.querySelector("#mirrorFps");
    fpsEl.textContent = this.fps;
    fpsEl.className =
      "mirror-stat-value " +
      (this.fps >= 10 ? "success" : this.fps >= 5 ? "warning" : "");
  }

  updateDataHealth() {
    if (!this.connected || !this.running) return;
    if (this._lastFrameTime) return;

    const now = performance.now();
    const recentlyReceivedData = this._lastDataTime && (now - this._lastDataTime) < 1500;

    this.overlay.classList.remove("hidden");
    this.overlay.textContent = recentlyReceivedData
      ? "Receiving data, waiting for first frame..."
      : "Not receiving data. Try using a different baudrate.";
  }
}

function initSerialMirror(rootEl) {
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div class="mirror-container">
      <div class="mirror-header">
        <span class="mirror-title">Screen Mirror</span>
        <div class="mirror-status-dot" id="mirrorStatusDot"></div>
      </div>
      <div class="mirror-main">
        <div class="mirror-display-wrapper">
          <canvas id="mirrorDisplay" width="320" height="240"></canvas>
          <div class="mirror-overlay" id="mirrorOverlay">Disconnected</div>
        </div>
        <div class="mirror-controls">
          <div class="mirror-controls-label">Controls</div>
          <div class="mirror-dpad">
            <div class="mirror-dpad-btn empty"></div>
            <button class="mirror-dpad-btn" data-cmd="up">▲</button>
            <div class="mirror-dpad-btn empty"></div>
            <button class="mirror-dpad-btn" data-cmd="left">◄</button>
            <button class="mirror-dpad-btn" data-cmd="select">●</button>
            <button class="mirror-dpad-btn" data-cmd="right">►</button>
            <div class="mirror-dpad-btn empty"></div>
            <button class="mirror-dpad-btn" data-cmd="down">▼</button>
            <div class="mirror-dpad-btn empty"></div>
          </div>
          <div class="mirror-hint">WASD / Arrows</div>
          <div class="mirror-divider"></div>
          <select class="mirror-baud-select" id="mirrorBaudSelect">
            <option value="57600">57600 baud</option>
            <option value="115200" selected>115200 baud</option>
            <option value="230400">230400 baud</option>
            <option value="460800">460800 baud</option>
            <option value="921600">921600 baud</option>
          </select>
          <div class="mirror-note" id="mirror8BitNote" style="display:none;">
            8-bit mode: device has limited serial bandwidth, colors may be incorrect and you may notice slowdowns.
          </div>
          <button class="mirror-action-btn connect" id="mirrorConnectBtn">Connect</button>
          <button class="mirror-action-btn disconnect" id="mirrorDisconnectBtn">Disconnect</button>
          <button class="mirror-action-btn" id="mirrorSwapBtn">Swap: OFF</button>
          <button class="mirror-action-btn" id="mirrorScreenshotBtn">Screenshot</button>
        </div>
      </div>
      <div class="mirror-status-bar">
        <span class="mirror-stat">Res:<span class="mirror-stat-value" id="mirrorResolution">320×240</span></span>
        <span class="mirror-stat">FPS:<span class="mirror-stat-value" id="mirrorFps">0</span></span>
        <div class="mirror-scale-controls">
          <button class="mirror-scale-btn" id="mirrorScaleDown">−</button>
          <span class="mirror-stat-value" id="mirrorScaleValue">2x</span>
          <button class="mirror-scale-btn" id="mirrorScaleUp">+</button>
        </div>
        <span class="mirror-stat">Frames:<span class="mirror-stat-value" id="mirrorFrameCount">0</span></span>
        <span class="mirror-stat">Baud:<span class="mirror-stat-value" id="mirrorBaudRate">-</span></span>
      </div>
      <div class="mirror-unsupported" id="mirrorUnsupported" style="display:none;">
        <p>Web Serial API not supported.</p>
        <p>Please use Chrome or Edge.</p>
      </div>
    </div>
  `;

  if (window.serialMirror && typeof window.serialMirror.destroy === "function") {
    window.serialMirror.destroy();
  }

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

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(`tab-${tabId}`).classList.add("active");

      if (tabId === "mirror" && !mirrorInitialized) {
        const mirrorRoot = document.getElementById("mirrorRoot");
        initSerialMirror(mirrorRoot);
        mirrorInitialized = true;
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
});
