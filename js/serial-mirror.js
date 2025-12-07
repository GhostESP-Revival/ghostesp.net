const MIRROR_MARKER = 0x47455350;
const MIRROR_END_MARKER = 0x444e4547;
const MIRROR_CMD_INFO = 0x01;
const MIRROR_CMD_FRAME = 0x02;
const HEADER_SIZE = 17;

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

    this.canvas = rootEl.querySelector("#mirrorDisplay");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.overlay = rootEl.querySelector("#mirrorOverlay");
    this.displayWrapper = rootEl.querySelector(".mirror-display-wrapper");
    this.statusDot = rootEl.querySelector("#mirrorStatusDot");

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
      this.connect();
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
    }, 1000);
  }

  async connect() {
    if (!("serial" in navigator)) {
      alert("Web Serial API not supported");
      return;
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();

      this.connected = true;
      this.running = true;
      this.updateConnectionUI();

      await this.sendCommand("mirror on");
      this.readLoop();
    } catch (e) {
      console.error("Connection failed:", e);
      this.connected = false;
      this.updateConnectionUI();
    }
  }

  async disconnect() {
    this.running = false;

    try {
      if (this.writer) {
        await this.sendCommand("mirror off");
        this.writer.releaseLock();
      }
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
      }
      if (this.port) {
        await this.port.close();
      }
    } catch (e) {
      console.error("Disconnect error:", e);
    }

    this.port = null;
    this.reader = null;
    this.writer = null;
    this.connected = false;
    this.buffer = new Uint8Array(0);
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

  findMarker() {
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    for (let i = 0; i <= this.buffer.length - 4; i++) {
      if (view.getUint32(i, true) === MIRROR_MARKER) {
        return i;
      }
    }
    return -1;
  }

  processBuffer() {
    while (this.buffer.length >= HEADER_SIZE) {
      const markerPos = this.findMarker();
      if (markerPos < 0) {
        this.buffer =
          this.buffer.length > 4 ? this.buffer.slice(-4) : this.buffer;
        break;
      }

      if (markerPos > 0) {
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

      if (cmd === MIRROR_CMD_INFO) {
        if (x1 !== this.width || y1 !== this.height) {
          this.resizeDisplay(x1, y1);
        }
        this.buffer = this.buffer.slice(HEADER_SIZE);
        continue;
      }

      if (cmd === MIRROR_CMD_FRAME) {
        const totalNeeded = HEADER_SIZE + dataLen + 4;
        if (this.buffer.length < totalNeeded) break;

        const pixelData = this.buffer.slice(HEADER_SIZE, HEADER_SIZE + dataLen);
        const endMarker = view.getUint32(HEADER_SIZE + dataLen, true);
        this.buffer = this.buffer.slice(totalNeeded);

        if (endMarker === MIRROR_END_MARKER && dataLen > 0) {
          this.processFrame(x1, y1, x2, y2, pixelData);
        }
      } else {
        this.buffer = this.buffer.slice(1);
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

    const imageData = new ImageData(this.pixelData, this.width, this.height);
    this.ctx.putImageData(imageData, 0, 0);

    this.frameCount++;
    this.fpsCounter++;
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
