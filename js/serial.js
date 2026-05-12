const COMMON_BAUD_RATES = [115200, 921600, 9600, 57600, 38400, 19200, 230400, 460800];

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
    this.initializeElements();
    this.checkBrowserSupport();
    this.setupEventListeners();
  }

  initializeElements() {
    this.connectButton = document.getElementById("connectButton");
    this.welcomeConnect = document.getElementById("welcomeConnect");
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
    this.browserDialog = document.getElementById("browserDialog");
    this.permissionDialog = document.getElementById("permissionDialog");
    this.exportButton = document.getElementById("exportButton");
    this.welcomeCard = document.getElementById("welcomeCard");
    this.consoleMain = document.getElementById("consoleMain");
    if (this.baudSelect) this.updateBaudRateDisplay();
  }

  checkBrowserSupport() {
    if (!("serial" in navigator)) {
      if (this.browserDialog) this.browserDialog.style.display = "flex";
      if (this.connectButton) {
        this.connectButton.disabled = true;
        this.connectButton.setAttribute("data-tooltip", "web serial not supported in this browser");
      }
      if (this.welcomeConnect) this.welcomeConnect.disabled = true;
      return false;
    } else {
      if (this.connectButton) this.connectButton.removeAttribute("data-tooltip");
    }
    return true;
  }

  setupEventListeners() {
    if (this.connectButton) this.connectButton.addEventListener("click", () => this.toggleConnection());
    if (this.welcomeConnect) this.welcomeConnect.addEventListener("click", () => this.connect());
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
    this.suppressConsoleOutput = !!suppressed;
  }

  updateBaudRateDisplay() {
    if (this.baudRateDisplay && this.baudSelect) {
      this.baudRateDisplay.textContent = `Baud Rate: ${this.baudSelect.value}`;
    }
  }

  async reconnectWithNewBaudRate() {
    try {
      const portInfo = this.port.getInfo();
      await this.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.port.open({
        baudRate: parseInt(this.baudSelect.value),
        dataBits: 8, stopBits: 1, parity: "none", flowControl: "none",
      });
      this.updateConnectionStatus(true);
      this.startReading();
      this.log("Reconnected with new baud rate: " + this.baudSelect.value + "\n");
    } catch (error) {
      this.log(`Error changing baud rate: ${error.message}\n`);
      this.updateConnectionStatus(false);
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
    if (this.connectionStatus) this.connectionStatus.textContent = connected ? "Connected" : "Disconnected";
    if (this.connectionDot) this.connectionDot.classList.toggle("connected", connected);
    if (this.connectButton) this.connectButton.textContent = connected ? "Disconnect" : "Connect";
    if (this.sendButton) this.sendButton.disabled = !connected;
    if (this.serialInput) this.serialInput.disabled = !connected;
    if (this.baudSelect) this.baudSelect.disabled = connected;

    if (this.welcomeCard && this.consoleMain) {
      this.welcomeCard.classList.toggle("hidden", connected);
      this.consoleMain.classList.toggle("hidden", !connected);
    }

    document.dispatchEvent(new CustomEvent("serial-connection-change", { detail: { connected } }));
  }

  async connect() {
    try {
      if (this.permissionDialog) this.permissionDialog.style.display = "flex";
      this.port = await navigator.serial.requestPort();
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      const baud = parseInt(this.baudSelect?.value || "115200");
      await this.port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      this.abortController = new AbortController();
      this.updateConnectionStatus(true);
      this.startReading();
      this.log("Connected to device\n");
    } catch (error) {
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      if (error.name === "NotFoundError") this.log("No device selected\n");
      else this.log(`Error connecting: ${error.message}\n`);
      this.updateConnectionStatus(false);
      await this.cleanup();
    }
  }

  async autoConnect() {
    if (!this.checkBrowserSupport()) return;
    if (this.isConnected) {
      this.log("Already connected - disconnect first to change baud automatically\n");
      return;
    }
    try {
      if (this.permissionDialog) this.permissionDialog.style.display = "flex";
      this.port = await navigator.serial.requestPort();
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      let baud = parseInt(this.baudSelect?.value || "115200");
      try {
        const detected = await this.autoDetectBaudOnPort();
        if (detected) { baud = detected; if (this.baudSelect) this.baudSelect.value = String(detected); this.updateBaudRateDisplay(); }
      } catch (e) { this.log(`Baud auto-detect failed, using ${baud}: ${e.message}\n`); }
      await this.port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      this.abortController = new AbortController();
      this.updateConnectionStatus(true);
      this.startReading();
      this.log("Connected to device (auto baud)\n");
    } catch (error) {
      if (this.permissionDialog) this.permissionDialog.style.display = "none";
      if (error.name === "NotFoundError") this.log("No device selected\n");
      else this.log(`Error connecting: ${error.message}\n`);
      this.updateConnectionStatus(false);
      await this.cleanup();
    }
  }

  async startReading() {
    const controller = this.abortController;
    if (!this.port || !controller) return;
    try {
      while (this.port.readable && !controller.signal.aborted) {
        this.reader = this.port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await this.reader.read();
            if (controller.signal.aborted) break;
            if (done) break;
            this.emitRawData(value);
            const text = this.decoder.decode(value);
            this.emitData(text);
            if (!this.suppressConsoleOutput) {
              this.log(text);
            }
          }
        } catch (error) {
          if (controller && !controller.signal.aborted) console.error("Error reading data:", error);
        } finally {
          try { await this.reader.releaseLock(); } catch (error) { console.warn("Error releasing reader lock:", error); }
        }
      }
    } catch (error) {
      if (controller && !controller.signal.aborted) console.error("Fatal read error:", error);
    }
  }

  async sendCommand(cmd) {
    if (!this.isConnected || !this.port) throw new Error("Not connected");
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(this.encoder.encode(cmd + "\n"));
    } finally {
      await writer.releaseLock();
    }
  }

  async sendData() {
    if (!this.isConnected || !this.serialInput || !this.serialInput.value) return;
    const data = this.serialInput.value + "\n";
    try {
      this.writer = this.port.writable.getWriter();
      await this.writer.write(this.encoder.encode(data));
      this.log(`> ${data}`);
      if (this.serialInput.value.trim()) {
        this.commandHistory.unshift(this.serialInput.value);
        if (this.commandHistory.length > 50) this.commandHistory.pop();
      }
      this.historyIndex = -1;
      this.currentInput = "";
      this.serialInput.value = "";
    } catch (error) {
      console.error("Error writing to port:", error);
      this.log(`Error sending data: ${error.message}\n`);
    } finally {
      if (this.writer) {
        try { await this.writer.releaseLock(); } catch (error) { console.warn("Error releasing writer lock:", error); }
        this.writer = null;
      }
    }
  }

  async cleanup() {
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
    if (this.reader) {
      try { await this.reader.cancel(); await this.reader.releaseLock(); } catch (error) { console.warn("Error cleaning up reader:", error); }
      this.reader = null;
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
    this.setConsoleOutputSuppressed(false);
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

    const formattedLines = completeLines.map(line => {
      if (!line.trim()) return "<br>";
      if (line.match(/^>\s*[a-z]+$/i)) return `<span class="command-input">${line}</span><br>`;
      const statusMessages = ['WiFi scan started','Stopping Wi-Fi','WiFi started','Ready to scan','Please wait','WiFi monitor stopped','HTTP server started'];
      if (statusMessages.some(msg => line.includes(msg))) return `<span class="status-message">${line}</span><br>`;
      if (line.match(/^Found \d+ access points$/)) return `<span class="scan-summary">${line}</span><br>`;
      if (line.match(/^\[\d+\]/)) { const [index, ...rest] = line.split(/(?<=^\[\d+\])\s/); return `<span class="ap-index">${index}</span> ${rest.join('')}<br>`; }
      if (line.match(/^\s*SSID:/)) { const [label, value] = line.split(/:\s*/); return `<span class="ap-label">${label}:</span> <span class="ap-ssid">${value}</span><br>`; }
      if (line.match(/^\s*RSSI:/)) { const [label, value] = line.split(/:\s*/); return `<span class="ap-label">${label}:</span> <span class="ap-rssi">${value}</span><br>`; }
      if (line.match(/^\s*Company:/)) { const [label, value] = line.split(/:\s*/); return `<span class="ap-label">${label}:</span> <span class="ap-company">${value}</span><br>`; }
      if (line.match(/^[A-Za-z]+$/) && line.length < 20) return `<span class="command-name">${line}</span><br>`;
      if (line.match(/^Ghost ESP Commands:$/)) return `<span class="section-header">${line}</span><br>`;
      if (line.match(/^\s{4}(Description|Usage|Arguments):(?:\s|$)/)) return `<span class="help-section-header">${line}</span><br>`;
      if (line.match(/^\s{4}Usage:\s/)) { const [prefix, ...rest] = line.split(/(?<=Usage:)\s/); return `<span class="help-section-header">${prefix}</span><span class="command-usage">${rest.join(' ')}</span><br>`; }
      if (line.match(/^\s{8}(-[a-zA-Z]|\[.*?\])\s+:/)) { const [flag, ...description] = line.split(/(?<=:)\s/); return `<span class="command-flag">${flag}</span><span class="flag-description">${description.join(' ')}</span><br>`; }
      if (line.match(/^\[.*?\]\s*W\s+\(.*?\)\s*spi_flash:/)) return `<span class="warning">${line}</span><br>`;
      if (line.match(/^Connected to device$/) || line.match(/^Disconnected from device$/)) return `<span class="connection-status">${line}</span><br>`;
      if (line.match(/^Port Scanner$/)) return `<span class="section-header">${line}</span><br>`;
      if (line.match(/^\s*OR\s*$/)) return `<span class="separator">${line}</span><br>`;
      return `<span class="regular-text">${line}</span><br>`;
    });

    if (formattedLines.length) {
      if (this.output.innerHTML) this.output.innerHTML += formattedLines.join("");
      else this.output.innerHTML = formattedLines.join("");
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
