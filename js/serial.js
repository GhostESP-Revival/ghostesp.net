const COMMON_BAUD_RATES = [115200, 921600, 9600, 57600, 38400, 19200, 230400, 460800];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

class SerialConsole {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    this.abortController = null;
    this.lineBuffer = "";
    this.commandHistory = [];
    this.historyIndex = -1;
    this.currentInput = "";
    this.rawDataListeners = new Set();
    this.dataListeners = new Set();
    this.suppressConsoleOutput = false;
    this._suppressOverride = false;
    this._requestSuppressDepth = 0;
    this._cmdChain = null;
    this._commandLockHeld = false;
    this._busyFlag = 0;
    this._connecting = false;
    this._handlingDisconnect = false;
    this._cleaningUp = false;
    this._lastUserActivityAt = 0;
    this._lastUserSendAt = 0;
    this._lastChunkAt = 0;
    this._pendingInitialChipInfo = null;
    this._resolveInitialChipInfo = null;
    this.initializeElements();
    this.checkBrowserSupport();
    this.setupEventListeners();
    this.setupSerialEventListeners();
    this.setupChipInfoUI();
  }

  initializeElements() {
    this.connectButton = document.getElementById("connectButton");
    this.welcomeConnect = document.getElementById("welcomeConnect");
    this.welcomeConnectInline = document.getElementById("welcomeConnectInline");
    this.clearButton = document.getElementById("clearButton");
    this.sendButton = document.getElementById("sendButton");
    this.serialInput = document.getElementById("serialInput");
    this.output = document.getElementById("output");
    this.console = document.getElementById("console");
    this.baudSelect = document.getElementById("baudSelect");
    this.welcomeBaud = document.getElementById("welcomeBaud");
    this.autoConnectButton = document.getElementById("autoConnectButton");
    this.baudRateDisplay = document.getElementById("baudRate");
    this.connectionStatus = document.getElementById("connectionStatus");
    this.connectionDot = document.getElementById("connectionDot");
    this.permissionDialog = document.getElementById("permissionDialog");
    this.exportButton = document.getElementById("exportButton");
    this.welcomeCard = document.getElementById("welcomeCard");
    this.consoleMain = document.getElementById("consoleMain");
    if (this.baudSelect) this.updateBaudRateDisplay();
  }

  checkBrowserSupport() {
    // Every connect affordance explains itself through a tooltip rather than a
    // modal, so an unsupported browser is not greeted with a dialog it cannot
    // act on. The tooltip lives on the wrapper: disabled buttons do not emit
    // pointer events, so they could never show it themselves.
    const buttons = [this.connectButton, this.welcomeConnect, this.welcomeConnectInline];
    if (!("serial" in navigator)) {
      const message = "Web Serial isn't supported in this browser. Use Chrome, Edge, or Opera.";
      buttons.forEach((button) => {
        if (!button) return;
        button.disabled = true;
        const host = button.closest(".has-tooltip") || button;
        host.setAttribute("data-tooltip", message);
      });
      return false;
    }
    buttons.forEach((button) => {
      if (!button) return;
      const host = button.closest(".has-tooltip") || button;
      host.removeAttribute("data-tooltip");
    });
    return true;
  }

  setupEventListeners() {
    if (this.connectButton) this.connectButton.addEventListener("click", () => this.toggleConnection());
    if (this.welcomeConnect) this.welcomeConnect.addEventListener("click", () => this.connect());
    if (this.welcomeConnectInline) this.welcomeConnectInline.addEventListener("click", () => this.connect());
    if (this.clearButton) this.clearButton.addEventListener("click", () => this.clearConsole());
    if (this.sendButton) this.sendButton.addEventListener("click", () => this.sendData());
    if (this.exportButton) this.exportButton.addEventListener("click", () => this.exportLog());
    if (this.serialInput) {
      this.serialInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.sendData();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.navigateHistory("up");
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          this.navigateHistory("down");
        }
      });
    }

    if (this.baudSelect) {
      this.baudSelect.addEventListener("change", async () => {
        this.updateBaudRateDisplay();
        if (this.welcomeBaud) this.welcomeBaud.value = this.baudSelect.value;
        if (this.isConnected) {
          await this.reconnectWithNewBaudRate();
        }
      });
    }
    if (this.welcomeBaud) {
      this.welcomeBaud.addEventListener("change", () => {
        if (this.baudSelect) this.baudSelect.value = this.welcomeBaud.value;
        this.updateBaudRateDisplay();
      });
    }
  }

  // Chrome fires `disconnect` on navigator.serial when the USB device goes
  // away. Without this listener the page keeps showing "Connected" forever
  // and every command fails until the user reloads.
  setupSerialEventListeners() {
    if (!("serial" in navigator)) return;
    navigator.serial.addEventListener("disconnect", (event) => {
      const port = event.target;
      if (!port || !this.port || port !== this.port) return;
      this.log("Device disconnected unexpectedly\n");
      this.handleUnexpectedDisconnect();
    });
  }

  async handleUnexpectedDisconnect() {
    if (this._handlingDisconnect || !this.isConnected) return;
    this._handlingDisconnect = true;
    try {
      this.updateConnectionStatus(false);
      await this.cleanup();
    } finally {
      this._handlingDisconnect = false;
    }
  }

  addRawDataListener(listener) {
    if (typeof listener !== "function") return () => {};
    this.rawDataListeners.add(listener);
    return () => this.rawDataListeners.delete(listener);
  }

  addDataListener(listener) {
    if (typeof listener !== "function") return () => {};
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  emitRawData(value) {
    if (!value || !value.length || !this.rawDataListeners.size) return;
    for (const listener of this.rawDataListeners) {
      try { listener(value); } catch (error) { console.warn("Raw data listener error:", error); }
    }
  }

  emitData(text) {
    if (!text || !this.dataListeners.size) return;
    for (const listener of this.dataListeners) {
      try { listener(text); } catch (error) { console.warn("Data listener error:", error); }
    }
  }

  setConsoleOutputSuppressed(suppressed) {
    // Boolean "override" set by external tools (e.g. the screen mirror).
    // Internal per-request suppression uses a separate depth counter so the
    // two can't clobber each other and leave the console permanently muted.
    this._suppressOverride = !!suppressed;
    this._applySuppression();
  }

  _applySuppression() {
    this.suppressConsoleOutput = this._suppressOverride || this._requestSuppressDepth > 0;
  }

  updateBaudRateDisplay() {
    if (this.baudRateDisplay && this.baudSelect) {
      this.baudRateDisplay.textContent = `Baud Rate: ${this.baudSelect.value === "auto" ? "auto" : this.baudSelect.value}`;
    }
  }

  // Shows a temporary "Detecting…" state on the visible connect button while
  // the baud rate is being auto-detected, then snaps it back.
  setConnectButtonBusy(busy) {
    const btn = this.welcomeConnect && this.welcomeConnect.style.display !== 'none'
      ? this.welcomeConnect
      : (this.connectButton && this.connectButton.style.display !== 'none' ? this.connectButton : null);
    if (!btn) return;
    if (busy) {
      if (this._connectBtnLabel === undefined) {
        this._connectBtnLabel = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-arrow-repeat dash-spinning" aria-hidden="true"></i> <span>Detecting…</span>';
      }
      btn.disabled = true;
    } else {
      if (this._connectBtnLabel !== undefined) {
        btn.innerHTML = this._connectBtnLabel;
        this._connectBtnLabel = undefined;
      }
      btn.disabled = false;
    }
  }

  // Resolves the baud select to a number, auto-detecting when "Auto" is chosen.
  async resolveBaudRate() {
    const raw = (this.baudSelect && this.baudSelect.value) || "115200";
    if (raw !== "auto") {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    this.setConnectButtonBusy(true);
    this.log("Auto-detecting baud rate...\n");
    try {
      const detected = await this.autoDetectBaudOnPort();
      if (detected) {
        if (this.baudSelect) this.baudSelect.value = String(detected);
        this.updateBaudRateDisplay();
        this.log(`Detected ${detected} baud\n`);
        return detected;
      }
      this.log("Could not auto-detect baud rate, using 115200\n");
      return 115200;
    } finally {
      this.setConnectButtonBusy(false);
    }
  }

  async reconnectWithNewBaudRate() {
    const port = this.port;
    if (!port) return;
    try {
      const baud = parseInt(this.baudSelect.value, 10);
      if (isNaN(baud) || baud <= 0) {
        this.log("Auto baud can't be changed while connected — disconnect and reconnect to auto-detect.\n");
        return;
      }
      await this.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 150));
      // disconnect()/cleanup() drops the port reference and the reader's
      // AbortController; restore both before reopening.
      this.port = port;
      this.abortController = new AbortController();
      await port.open({
        baudRate: baud,
        dataBits: 8, stopBits: 1, parity: "none", flowControl: "none",
      });
      this.updateConnectionStatus(true);
      this.startReading();
      this.log("Reconnected with new baud rate: " + baud + "\n");
    } catch (error) {
      this.log(`Error changing baud rate: ${error.message}\n`);
      this.updateConnectionStatus(false);
      await this.cleanup();
    }
  }

  scoreReadability(data) {
    if (!data || data.length === 0) return 0;
    let printable = 0;
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if ((c >= 0x20 && c <= 0x7e) || c === 0x0a || c === 0x0d || c === 0x09) printable++;
    }
    return printable / data.length;
  }

  async testBaudRate(baud, sampleMs = 500) {
    try {
      await this.port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      const writer = this.port.writable.getWriter();
      await writer.write(this.encoder.encode("help\n"));
      writer.releaseLock();
      const reader = this.port.readable.getReader();
      const chunks = [];
      let totalBytes = 0;
      const deadline = Date.now() + sampleMs;
      while (Date.now() < deadline && totalBytes < 1024) {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), Math.max(50, deadline - Date.now()))
        );
        try {
          const { value, done } = await Promise.race([reader.read(), timeout]);
          if (done) break;
          if (value) { chunks.push(value); totalBytes += value.length; }
        } catch { break; }
      }
      await reader.cancel();
      reader.releaseLock();
      await this.port.close();
      if (totalBytes === 0) return { baud, score: 0, bytes: 0 };
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
      return { baud, score: this.scoreReadability(combined), bytes: totalBytes };
    } catch (e) {
      try { await this.port.close(); } catch {}
      return { baud, score: -1, bytes: 0, error: e.message };
    }
  }

  async autoDetectBaudOnPort() {
    const results = [];
    for (const baud of COMMON_BAUD_RATES) {
      const result = await this.testBaudRate(baud, 400);
      results.push(result);
      if (result.score >= 0.8 && result.bytes >= 10) return baud;
    }
    const best = results
      .filter((r) => r.score > 0.5 && r.bytes >= 10)
      .sort((a, b) => b.score - a.score || b.bytes - a.bytes)[0];
    return best ? best.baud : null;
  }

  async autoDetectBaudRate() {
    if (this.isAutoDetecting) return;
    if (this.isConnected) {
      this.log("Disconnect first before auto-detecting baud rate\n");
      return;
    }
    try {
      this.isAutoDetecting = true;
      if (this.autoConnectButton) { this.autoConnectButton.disabled = true; this.autoConnectButton.textContent = "Detecting..."; }
      if (this.connectButton) this.connectButton.disabled = true;
      if (this.permissionDialog) this.permissionDialog.style.display = "flex";
      this.port = await navigator.serial.requestPort();
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      this.log("Auto-detecting baud rate...\n");
      const results = [];
      for (const baud of COMMON_BAUD_RATES) {
        this.log(`  Testing ${baud}... `);
        const result = await this.testBaudRate(baud, 400);
        results.push(result);
        if (result.score >= 0) this.log(`${(result.score * 100).toFixed(0)}% readable (${result.bytes} bytes)\n`);
        else this.log(`error: ${result.error}\n`);
        await new Promise(r => setTimeout(r, 100));
      }
      const best = results
        .filter(r => r.score > 0.5 && r.bytes >= 10)
        .sort((a, b) => b.score - a.score || b.bytes - a.bytes)[0];
      if (best) {
        this.log(`\nDetected: ${best.baud} baud (${(best.score * 100).toFixed(0)}% readable)\n`);
        this.baudSelect.value = best.baud.toString();
        this.updateBaudRateDisplay();
      } else {
        this.log("\nCould not detect baud rate. Device may be idle - try triggering output.\n");
      }
    } catch (e) {
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      if (e.name !== "NotFoundError") this.log(`Auto-detect error: ${e.message}\n`);
    } finally {
      this.isAutoDetecting = false;
      if (this.autoConnectButton) { this.autoConnectButton.disabled = false; this.autoConnectButton.textContent = "Auto Detect"; }
      if (this.connectButton) this.connectButton.disabled = false;
      this.port = null;
    }
  }

  async toggleConnection() {
    if (this.isConnected) await this.disconnect();
    else await this.connect();
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected;
    if (!connected) this.clearChipInfo();
    if (this.connectionStatus) this.connectionStatus.textContent = connected ? "Connected" : "Disconnected";
    if (this.connectionDot) this.connectionDot.classList.toggle("connected", connected);
    if (this.connectButton) {
      this.connectButton.textContent = connected ? "Disconnect" : "Connect";
      this.connectButton.style.display = connected ? "" : "none";
    }
    if (this.welcomeConnect) this.welcomeConnect.style.display = connected ? "none" : "";
    if (this.sendButton) this.sendButton.disabled = !connected;
    if (this.serialInput) this.serialInput.disabled = !connected;
    if (this.baudSelect) this.baudSelect.disabled = connected;

    if (this.welcomeCard && this.consoleMain) {
      const storeTab = document.querySelector("#tab-store");
      const irdbTab = document.querySelector("#tab-irdb");
      const standaloneActive = (storeTab && storeTab.classList.contains("active")) || (irdbTab && irdbTab.classList.contains("active"));
      this.welcomeCard.classList.toggle("hidden", connected || standaloneActive);
      this.consoleMain.classList.toggle("hidden", !connected || standaloneActive);
    }

    document.dispatchEvent(new CustomEvent("serial-connection-change", { detail: { connected } }));
  }

  async connect() {
    if (this._connecting) return;
    this._connecting = true;
    try {
      if (this.permissionDialog) this.permissionDialog.style.display = "flex";
      this.port = await navigator.serial.requestPort();
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      await this.openPort();
      this.abortController = new AbortController();
      // Arm the "device ready" gate BEFORE announcing the connection: the
      // Store's app scan listens for the connection event and would otherwise
      // fire `sd list` at the still-booting console, lose it, and hold the
      // command queue for its full timeout. Everything except the chipinfo
      // handshake itself waits on this promise.
      let resolveReady;
      const ready = new Promise((resolve) => { resolveReady = resolve; });
      this._pendingInitialChipInfo = ready;
      this._resolveInitialChipInfo = resolveReady;

      this.updateConnectionStatus(true);
      this.startReading();
      this.log("Connected to device\n");
      this.fetchChipInfo({ initial: true })
        .catch(() => {})
        .finally(() => this._finishInitialChipInfo());
    } catch (error) {
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      if (error.name === "NotFoundError") this.log("No device selected\n");
      else this.log(`Error connecting: ${error.message}\n`);
      this.updateConnectionStatus(false);
      await this.cleanup();
    } finally {
      this._connecting = false;
    }
  }

  // Releases anyone waiting on the post-connect chipinfo handshake. Safe to
  // call multiple times (handshake completion and cleanup both call it).
  _finishInitialChipInfo() {
    const resolve = this._resolveInitialChipInfo;
    this._resolveInitialChipInfo = null;
    this._pendingInitialChipInfo = null;
    if (resolve) resolve();
  }

  async openPort() {
    const port = this.port;
    // A previous session can leave the OS handle open (e.g. after a reload
    // mid-connection). Close it first so open() doesn't fail with
    // "The port is already open".
    if (port.readable || port.writable) {
      try { await port.close(); } catch (error) { /* already closed */ }
    }
    const baud = await this.resolveBaudRate();
    const options = { baudRate: baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" };
    try {
      await port.open(options);
    } catch (error) {
      // USB-UART bridges (CH340/CP210x) sometimes reject the first open
      // right after the previous handle was released; retry once.
      await new Promise((resolve) => setTimeout(resolve, 400));
      try { await port.close(); } catch (closeError) { /* not open */ }
      await port.open(options);
    }
  }

  async autoConnect() {
    return this.connect();
  }

  async startReading() {
    const controller = this.abortController;
    const port = this.port;
    if (!port || !controller) return;
    try {
      while (port.readable && !controller.signal.aborted) {
        // Keep a local reference: cleanup() may null this.reader while a
        // read is pending, and the finally below must not dereference null.
        const reader = port.readable.getReader();
        this.reader = reader;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (controller.signal.aborted) break;
            if (done) break;
            this.emitRawData(value);
            const text = this.decoder.decode(value);
            this.emitData(text);
            this._lastChunkAt = Date.now();
            // Hidden background exchanges (chipinfo polls, Store scans) mute
            // the terminal so their bookkeeping output doesn't spam it. That
            // mute must never hide the answer to something the user just
            // typed, so recent user commands override it. The mirror's
            // boolean override still always wins.
            const userCommandRecent = Date.now() - this._lastUserSendAt < 10000;
            if (!this._suppressOverride && (!this.suppressConsoleOutput || userCommandRecent)) {
              this.log(text);
            }
          }
        } catch (error) {
          if (controller && !controller.signal.aborted) console.error("Error reading data:", error);
        } finally {
          try { await reader.releaseLock(); } catch (error) { console.warn("Error releasing reader lock:", error); }
          if (this.reader === reader) this.reader = null;
        }
      }
    } catch (error) {
      if (controller && !controller.signal.aborted) console.error("Fatal read error:", error);
    }

    // The loop only ends when the port closed or the controller aborted. If
    // the user didn't ask to disconnect, the cable was unplugged or the
    // handle died — surface it instead of leaving a dead "Connected" UI.
    if (this.isConnected && !controller.signal.aborted && this.abortController === controller) {
      this.log("Serial connection lost\n");
      this.handleUnexpectedDisconnect();
    }
  }

  async sendCommand(cmd) {
    if (!this.isConnected || !this.port) throw new Error("Not connected");
    return this._withCommandLock(() => this._writeRaw(cmd));
  }

  // Low-level serial write. Internal callers must already hold the command
  // lock so writes from different tools can't interleave on the wire.
  async _writeRaw(cmd) {
    if (!this.port || !this.port.writable) throw new Error("Not connected");
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(this.encoder.encode(cmd + "\n"));
    } finally {
      try { await writer.releaseLock(); } catch (error) { console.warn("Error releasing writer lock:", error); }
    }
  }

  // Marks the shared connection as busy from outside (e.g. a store install)
  // so background pollers can back off instead of interleaving commands.
  setBusy(busy) {
    this._busyFlag = Math.max(0, this._busyFlag + (busy ? 1 : -1));
  }

  get isBusy() {
    return this._busyFlag > 0;
  }

  // Serializes command/response exchanges that share this one open Web Serial
  // connection (console commands, chipinfo polls, store installs). Runs one at
  // a time so responses never bleed between concurrent callers.
  async _withCommandLock(fn) {
    const prev = this._cmdChain || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    this._cmdChain = prev.then(() => gate);
    await prev.catch(() => {});
    this._commandLockHeld = true;
    try {
      return await fn();
    } finally {
      this._commandLockHeld = false;
      release();
    }
  }

  // Send a command and wait for one of the given marker strings to appear
  // in the response, without printing the output to the console. Used by
  // the Store tab (and other tools) to drive the SAME open connection.
  // Background callers wait for the post-connect chipinfo handshake first so
  // their commands don't race a still-booting console and jam the queue.
  async requestCommandResponse(cmd, markers, timeoutMs = 5000, options = {}) {
    if (!this.isConnected || !this.port) throw new Error("Not connected");
    if (!options.internal && this._pendingInitialChipInfo) {
      try { await this._pendingInitialChipInfo; } catch (error) { /* handled by caller guards */ }
      if (!this.isConnected || !this.port) throw new Error("Not connected");
    }
    return this._withCommandLock(() => this._requestRawCommandResponse(cmd, markers, timeoutMs));
  }

  async _requestRawCommandResponse(cmd, markers, timeoutMs = 5000) {
    const markerList = Array.isArray(markers) ? markers : [markers];
    const bufferRef = { text: "" };
    const handler = (chunk) => { bufferRef.text += String(chunk || "").replace(/\x1b\[[0-9;]*m/g, ""); };
    // Suppression runs on a depth counter so overlapping requests (or a
    // mirror session) can't leave the console muted after they finish.
    this._requestSuppressDepth++;
    this._applySuppression();
    this.dataListeners.add(handler);
    let writeError = null;
    try {
      await this._writeRaw(cmd);
    } catch (error) {
      writeError = error;
    }
    const deadline = Date.now() + timeoutMs;
    try {
      if (!writeError) {
        await new Promise((resolve) => {
          const tick = () => {
            // Stop waiting early if the connection dropped so commands
            // queued behind this request aren't stuck for the full timeout.
            if (!this.isConnected) resolve();
            else if (markerList.some((m) => bufferRef.text.includes(m)) || Date.now() >= deadline) resolve();
            else setTimeout(tick, 50);
          };
          tick();
        });
      }
    } finally {
      this.dataListeners.delete(handler);
      this._requestSuppressDepth = Math.max(0, this._requestSuppressDepth - 1);
      this._applySuppression();
    }
    if (writeError) throw writeError;
    return bufferRef.text;
  }

  CHIP_INFO_PATTERNS = {
    MODEL: /Model\s*:\s*([^\r\n]+)/i,
    FIRMWARE: /Firmware\s*:\s*([^\r\n]+)/i,
    GIT_COMMIT: /Git Commit\s*:\s*([^\r\n]+)/i,
    REVISION: /Revision\s*:\s*v?(\d+(?:\.\d+)+)/i,
    CORES: /CPU Cores\s*:\s*(\d+)/i,
    FEATURES: /Features\s*:\s*([^\r\n]+)/i,
    FREE_HEAP: /Free Heap\s*:\s*(\d+)/i,
    MIN_FREE_HEAP: /Min Free Heap\s*:\s*(\d+)/i,
    IDF: /IDF Version\s*:\s*([^\r\n]+)/i,
    BUILD: /Build Config\s*:\s*([^\r\n]+)/i,
    SCREEN: /Screen\s*:\s*([^\r\n]+)/i,
    SCREEN_W: /Width\s*:\s*(\d+)/i,
    SCREEN_H: /Height\s*:\s*(\d+)/i,
    SCREEN_TYPE: /Screen Type\s*:\s*([^\r\n]+)/i
  };

  // Queries the device with `chipinfo` and shows model + firmware in the
  // dashboard header (same command the flasher uses).
  async fetchChipInfo(options = {}) {
    if (!this.isConnected || !this.port) return null;
    if (options.initial) await new Promise((resolve) => setTimeout(resolve, 1200));
    let text = "";
    // Retry when the device was still booting (opening the port resets most
    // ESP32 boards) or the request landed in a burst of other output. Each
    // attempt takes and releases the command lock, so user commands can slip
    // in between attempts instead of waiting for the whole retry loop.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        text = await this.requestCommandResponse("chipinfo", ["[CHIPINFO_END]"], 2000, { internal: true });
      } catch (error) {
        text = "";
      }
      if (text.includes("[CHIPINFO_END]")) break;
      // Firmware that predates chipinfo rejects it immediately — no retry.
      if (/unsupported\s+command|unknown\s+command|not\s+recognized/i.test(text)) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    // Explain a silent handshake failure instead of leaving the first typed
    // command hanging with no clue.
    if (options.initial && !text.includes("[CHIPINFO_END]") &&
        !/unsupported\s+command|unknown\s+command|not\s+recognized/i.test(text)) {
      this.log("No response to chipinfo — if the log above looks garbled, disconnect and reconnect at 115200 baud.\n");
    }
    const grab = (re) => {
      const m = text.match(re);
      return m && m[1] ? m[1].trim() : null;
    };
    this.chipInfo = {
      model: grab(this.CHIP_INFO_PATTERNS.MODEL),
      firmware: grab(this.CHIP_INFO_PATTERNS.FIRMWARE),
      gitCommit: grab(this.CHIP_INFO_PATTERNS.GIT_COMMIT),
      revision: grab(this.CHIP_INFO_PATTERNS.REVISION),
      cores: grab(this.CHIP_INFO_PATTERNS.CORES),
      features: grab(this.CHIP_INFO_PATTERNS.FEATURES),
      freeHeap: grab(this.CHIP_INFO_PATTERNS.FREE_HEAP),
      minFreeHeap: grab(this.CHIP_INFO_PATTERNS.MIN_FREE_HEAP),
      idf: grab(this.CHIP_INFO_PATTERNS.IDF),
      build: grab(this.CHIP_INFO_PATTERNS.BUILD),
      screen: grab(this.CHIP_INFO_PATTERNS.SCREEN),
      screenW: grab(this.CHIP_INFO_PATTERNS.SCREEN_W),
      screenH: grab(this.CHIP_INFO_PATTERNS.SCREEN_H),
      screenType: grab(this.CHIP_INFO_PATTERNS.SCREEN_TYPE)
    };
    this.renderChipInfo();
    return this.chipInfo;
  }

  // Header badge (compact) + sidebar device card (full readout).
  renderChipInfo() {
    const info = this.chipInfo;
    const detailEl = document.getElementById("chipInfoDetail");
    if (detailEl) {
      const parts = [];
      if (info.model) parts.push(info.model);
      if (info.firmware) parts.push(info.firmware);
      else if (info.revision) parts.push(`rev ${info.revision}`);
      if (parts.length) {
        detailEl.textContent = parts.join(" · ");
        detailEl.classList.add("visible");
        detailEl.title = [
          info.model ? `Model: ${info.model}` : "",
          info.firmware ? `Firmware: ${info.firmware}` : "",
          info.revision ? `Revision: v${info.revision}` : "",
          info.cores ? `Cores: ${info.cores}` : "",
          info.features ? `Features: ${info.features}` : "",
          info.freeHeap ? `Free heap: ${this.formatKb(info.freeHeap)}` : "",
          info.idf ? `IDF: ${info.idf}` : ""
        ].filter(Boolean).join("\n");
      }
    }

    const cardBody = document.getElementById("dashDeviceCardBody");
    const card = document.getElementById("dashDeviceCard");
    if (cardBody) {
      if (!info || (!info.model && !info.firmware)) {
        cardBody.innerHTML = '<p class="dash-device-card-empty">Could not read device info.</p>';
        return;
      }
      const rows = [
        ["Model", info.model],
        ["Firmware", info.firmware],
        ["Revision", info.revision ? `v${info.revision}` : ""],
        ["Cores", info.cores],
        ["Free heap", info.freeHeap ? this.formatKb(info.freeHeap) : ""],
        ["Min heap", info.minFreeHeap ? this.formatKb(info.minFreeHeap) : ""],
        ["IDF", info.idf],
        ["Screen", info.screen || (info.screenW && info.screenH ? `${info.screenW}\u00d7${info.screenH}${info.screenType ? ` ${info.screenType}` : ""}` : "")],
        ["Build", info.build]
      ].filter(([, v]) => v);
      cardBody.innerHTML = rows.map(([label, value]) => `
        <div class="dash-device-row">
          <span class="dash-device-row-label">${label}</span>
          <span class="dash-device-row-value" title="${escapeHtml(value)}">${escapeHtml(value.length > 34 ? value.slice(0, 34) + "\u2026" : value)}</span>
        </div>`).join("");
    }
    if (card) card.classList.add("has-device");
    document.dispatchEvent(new CustomEvent("chip-info-updated", { detail: { chipInfo: this.chipInfo } }));
  }

  formatKb(bytes) {
    const kb = Math.round(parseInt(bytes, 10) / 1024);
    return `${kb} KB`;
  }

  clearChipInfo() {
    this.chipInfo = null;
    const detailEl = document.getElementById("chipInfoDetail");
    if (detailEl) {
      detailEl.textContent = "";
      detailEl.classList.remove("visible");
      detailEl.title = "";
    }
    const card = document.getElementById("dashDeviceCard");
    if (card) card.classList.remove("has-device");
    const cardBody = document.getElementById("dashDeviceCardBody");
    if (cardBody) cardBody.innerHTML = '<p class="dash-device-card-empty">Connect to see device details.</p>';
    document.dispatchEvent(new CustomEvent("chip-info-updated", { detail: { chipInfo: null } }));
  }

  setupChipInfoUI() {
    const refreshBtn = document.getElementById("chipRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        if (!this.isConnected) return;
        refreshBtn.disabled = true;
        refreshBtn.querySelector("i").classList.add("dash-spinning");
        try {
          await this.fetchChipInfo();
        } catch (error) {
          this.log(`Chip info refresh failed: ${error.message}\n`);
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.querySelector("i").classList.remove("dash-spinning");
        }
      });
    }

    // Keep free-heap and status fresh while connected (quiet command, no
    // console spam). Skip while the tab is hidden or the user just typed
    // something so the poll never delays their command.
    this.chipInfoTimer = setInterval(() => {
      if (!this.isConnected || this.isBusy || this._commandLockHeld) return;
      if (document.hidden) return;
      if (Date.now() - this._lastUserActivityAt < 10000) return;
      // Never poll while the device is mid-stream (e.g. a long scan) —
      // its muted request would otherwise hide the tail of the output.
      if (Date.now() - this._lastChunkAt < 3000) return;
      this.fetchChipInfo().catch(() => {});
    }, 45000);
  }

  // Sends a command typed by the user (console input, quick commands)
  // through the same queue background tools use, so writes can't interleave
  // and the response is never swallowed by a concurrent quiet request. Waits
  // for the post-connect chipinfo handshake so an early command isn't sent
  // while the device is still booting.
  async sendUserCommand(cmd, options = {}) {
    const text = String(cmd || "").trim();
    if (!text || !this.isConnected || !this.port) return false;
    this._lastUserActivityAt = Date.now();
    if (options.echo !== false) this.log(`> ${text}\n`);
    if (this._pendingInitialChipInfo) {
      try { await this._pendingInitialChipInfo; } catch (error) { /* already handled */ }
    }
    if (!this.isConnected || !this.port) return false;
    this._lastUserSendAt = Date.now();
    await this.sendCommand(text);
    return true;
  }

  async sendData() {
    if (!this.isConnected || !this.serialInput || !this.serialInput.value) return;
    const value = this.serialInput.value;
    try {
      await this.sendUserCommand(value);
      if (value.trim()) {
        this.commandHistory.unshift(value);
        if (this.commandHistory.length > 50) this.commandHistory.pop();
      }
      this.historyIndex = -1;
      this.currentInput = "";
      this.serialInput.value = "";
    } catch (error) {
      console.error("Error writing to port:", error);
      this.log(`Error sending data: ${error.message}\n`);
    }
  }

  async cleanup() {
    if (this._cleaningUp) return;
    this._cleaningUp = true;
    try {
      if (this.abortController) { this.abortController.abort(); this.abortController = null; }
      if (this.reader) {
        // Snapshot + clear first: the read loop's own finally also releases
        // this reader, and neither path must dereference a null reference.
        const reader = this.reader;
        this.reader = null;
        try { await reader.cancel(); } catch (error) { console.warn("Error cleaning up reader:", error); }
        try { reader.releaseLock(); } catch (error) { /* already released by the read loop */ }
      }
      if (this.writer) {
        try { await this.writer.releaseLock(); } catch (error) { console.warn("Error cleaning up writer:", error); }
        this.writer = null;
      }
      if (this.port) {
        try { await this.port.close(); } catch (error) { console.warn("Error closing port:", error); }
        this.port = null;
      }
      this.isConnected = false;
      this.lineBuffer = "";
      // Wake anything waiting on the boot handshake, and don't leave the
      // console muted for the next session.
      this._finishInitialChipInfo();
      this._suppressOverride = false;
      this._requestSuppressDepth = 0;
      this._applySuppression();
    } finally {
      this._cleaningUp = false;
    }
  }

  async disconnect() {
    try {
      this.updateConnectionStatus(false);
      await this.cleanup();
      this.log("Disconnected from device\n");
    } catch (error) {
      console.error("Error during disconnect:", error);
      this.log("Forced disconnect due to error\n");
    }
  }

  clearConsole() {
    if (this.output) this.output.textContent = "";
  }

  log(text) {
    if (!this.output) return;
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!this.lineBuffer) this.lineBuffer = "";
    this.lineBuffer += lines;
    const completeLines = this.lineBuffer.split("\n");
    this.lineBuffer = completeLines[completeLines.length - 1].endsWith("\n") ? "" : completeLines.pop();

    const formattedLines = completeLines.map(line => {      const safe = escapeHtml(line);
      if (!line.trim()) return "<br>";
      if (line.match(/^>\s*[a-z]+$/i)) return `<span class="command-input">${safe}</span><br>`;
      const statusMessages = ['WiFi scan started','Stopping Wi-Fi','WiFi started','Ready to scan','Please wait','WiFi monitor stopped','HTTP server started'];
      if (statusMessages.some(msg => line.includes(msg))) return `<span class="status-message">${safe}</span><br>`;
      if (line.match(/^Found \d+ access points$/)) return `<span class="scan-summary">${safe}</span><br>`;
      if (line.match(/^\[\d+\]/)) { const [index, ...rest] = line.split(/(?<=^\[\d+\])\s/); return `<span class="ap-index">${escapeHtml(index)}</span> ${escapeHtml(rest.join(''))}<br>`; }
      if (line.match(/^\s*SSID:/)) { const [label, value] = line.split(/:\s*/); return `<span class="ap-label">${escapeHtml(label)}:</span> <span class="ap-ssid">${escapeHtml(value)}</span><br>`; }
      if (line.match(/^\s*RSSI:/)) { const [label, value] = line.split(/:\s*/); return `<span class="ap-label">${escapeHtml(label)}:</span> <span class="ap-rssi">${escapeHtml(value)}</span><br>`; }
      if (line.match(/^\s*Company:/)) { const [label, value] = line.split(/:\s*/); return `<span class="ap-label">${escapeHtml(label)}:</span> <span class="ap-company">${escapeHtml(value)}</span><br>`; }
      if (line.match(/^[A-Za-z]+$/) && line.length < 20) return `<span class="command-name">${safe}</span><br>`;
      if (line.match(/^Ghost ESP Commands:$/)) return `<span class="section-header">${safe}</span><br>`;
      if (line.match(/^\s{4}(Description|Usage|Arguments):(?:\s|$)/)) return `<span class="help-section-header">${safe}</span><br>`;
      if (line.match(/^\s{4}Usage:\s/)) { const [prefix, ...rest] = line.split(/(?<=Usage:)\s/); return `<span class="help-section-header">${escapeHtml(prefix)}</span><span class="command-usage">${escapeHtml(rest.join(' '))}</span><br>`; }
      if (line.match(/^\s{8}(-[a-zA-Z]|\[.*?\])\s+:/)) { const [flag, ...description] = line.split(/(?<=:)\s/); return `<span class="command-flag">${escapeHtml(flag)}</span><span class="flag-description">${escapeHtml(description.join(' '))}</span><br>`; }
      if (line.match(/^\[.*?\]\s*W\s+\(.*?\)\s*spi_flash:/)) return `<span class="warning">${safe}</span><br>`;
      if (line.match(/^Connected to device$/) || line.match(/^Disconnected from device$/)) return `<span class="connection-status">${safe}</span><br>`;
      if (line.match(/^Port Scanner$/)) return `<span class="section-header">${safe}</span><br>`;
      if (line.match(/^\s*OR\s*$/)) return `<span class="separator">${safe}</span><br>`;
      return `<span class="regular-text">${safe}</span><br>`;
    });

    if (formattedLines.length) {
      // Cap the terminal at MAX_LOG_LINES so long-running scans can't grow
      // the page into an endless scroll.
      const MAX_LOG_LINES = 2000;
      if (!this.logHistory) this.logHistory = [];
      this.logHistory.push(...formattedLines);
      if (this.logHistory.length > MAX_LOG_LINES) {
        this.logHistory.splice(0, this.logHistory.length - MAX_LOG_LINES);
        this.output.innerHTML = this.logHistory.join("");
      } else {
        this.output.innerHTML += formattedLines.join("");
      }
      setTimeout(() => { if (this.console) this.console.scrollTo({ top: this.console.scrollHeight, behavior: "smooth" }); }, 0);
      requestAnimationFrame(() => { if (this.console) this.console.scrollTo({ top: this.console.scrollHeight, behavior: "auto" }); });
    }
  }

  navigateHistory(direction) {
    if (!this.commandHistory.length || !this.serialInput) return;
    if (this.historyIndex === -1) this.currentInput = this.serialInput.value;
    if (direction === "up") {
      if (this.historyIndex < this.commandHistory.length - 1) { this.historyIndex++; this.serialInput.value = this.commandHistory[this.historyIndex]; }
    } else if (direction === "down") {
      if (this.historyIndex > -1) { this.historyIndex--; this.serialInput.value = this.historyIndex === -1 ? this.currentInput : this.commandHistory[this.historyIndex]; }
    }
    setTimeout(() => { this.serialInput.selectionStart = this.serialInput.value.length; this.serialInput.selectionEnd = this.serialInput.value.length; }, 0);
  }

  exportLog() {
    if (!this.output) return;
    const content = this.output.innerText || "";
    if (!content.trim()) return;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `serial_log_${Date.now()}.txt`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.serialConsole = new SerialConsole();
});
