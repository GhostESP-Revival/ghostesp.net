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
    this.initializeElements();
    this.checkBrowserSupport();
    this.setupEventListeners();
  }

  initializeElements() {
    this.connectButton = document.getElementById("connectButton");
    this.clearButton = document.getElementById("clearButton");
    this.sendButton = document.getElementById("sendButton");
    this.serialInput = document.getElementById("serialInput");
    this.output = document.getElementById("output");
    this.console = document.getElementById("console");
    this.baudSelect = document.getElementById("baudSelect");
    this.baudRateDisplay = document.getElementById("baudRate");
    this.connectionStatus = document.getElementById("connectionStatus");
    this.connectionDot = document.getElementById("connectionDot");
    this.browserDialog = document.getElementById("browserDialog");
    this.permissionDialog = document.getElementById("permissionDialog");
    this.exportButton = document.getElementById("exportButton");
    this.updateBaudRateDisplay();
  }

  checkBrowserSupport() {
    if (!this.connectButton) {
      return false;
    }

    if (!("serial" in navigator)) {
      if (this.browserDialog) {
        this.browserDialog.style.display = "flex";
      }
      this.connectButton.disabled = true;
      this.connectButton.setAttribute(
        "data-tooltip",
        "web serial not supported in this browser"
      );
      return false;
    } else {
      this.connectButton.removeAttribute("data-tooltip");
    }
    return true;
  }

  setupEventListeners() {
    if (this.connectButton) {
      this.connectButton.addEventListener("click", () => this.toggleConnection());
    }

    if (this.clearButton) {
      this.clearButton.addEventListener("click", () => this.clearConsole());
    }

    if (this.sendButton) {
      this.sendButton.addEventListener("click", () => this.sendData());
    }

    if (this.exportButton) {
      this.exportButton.addEventListener("click", () => this.exportLog());
    }

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
        if (this.isConnected) {
          await this.reconnectWithNewBaudRate();
        }
      });
    }
  }

  updateBaudRateDisplay() {
    if (!this.baudRateDisplay || !this.baudSelect) return;
    this.baudRateDisplay.textContent = `Baud Rate: ${this.baudSelect.value}`;
  }

  async reconnectWithNewBaudRate() {
    try {
      const portInfo = this.port.getInfo();
      await this.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.port.open({
        baudRate: parseInt(this.baudSelect.value),
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      this.updateConnectionStatus(true);
      this.startReading();
      this.log(
        "Reconnected with new baud rate: " + this.baudSelect.value + "\n"
      );
    } catch (error) {
      this.log(`Error changing baud rate: ${error.message}\n`);
      this.updateConnectionStatus(false);
    }
  }

  async toggleConnection() {
    if (this.isConnected) {
      await this.disconnect();
    } else {
      await this.connect();
    }
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected;
    if (this.connectionStatus) {
      this.connectionStatus.textContent = connected
        ? "Connected"
        : "Disconnected";
    }
    if (this.connectionDot) {
      this.connectionDot.classList.toggle("connected", connected);
    }
    if (this.connectButton) {
      this.connectButton.textContent = connected ? "Disconnect" : "Connect";
    }
    if (this.sendButton) {
      this.sendButton.disabled = !connected;
    }
    if (this.serialInput) {
      this.serialInput.disabled = !connected;
    }
    if (this.baudSelect) {
      this.baudSelect.disabled = connected;
    }
  }

  async connect() {
    try {
      this.permissionDialog.style.display = "flex";
      this.port = await navigator.serial.requestPort();
      this.permissionDialog.style.display = "none";
      await this.port.open({
        baudRate: parseInt(this.baudSelect.value),
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });
      this.abortController = new AbortController();
      this.updateConnectionStatus(true);
      this.startReading();
      this.log("Connected to device\n");
    } catch (error) {
      this.permissionDialog.style.display = "none";
      if (error.name === "NotFoundError") {
        this.log("No device selected\n");
      } else {
        this.log(`Error connecting: ${error.message}\n`);
      }
      this.updateConnectionStatus(false);
      await this.cleanup();
    }
  }

  async startReading() {
    if (!this.port || !this.abortController) return;
    try {
      while (this.port.readable && !this.abortController.signal.aborted) {
        this.reader = this.port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await this.reader.read();
            if (this.abortController.signal.aborted) break;
            if (done) break;
            this.log(this.decoder.decode(value));
          }
        } catch (error) {
          if (!this.abortController.signal.aborted) {
            console.error("Error reading data:", error);
          }
        } finally {
          try {
            await this.reader.releaseLock();
          } catch (error) {
            console.warn("Error releasing reader lock:", error);
          }
        }
      }
    } catch (error) {
      if (!this.abortController.signal.aborted) {
        console.error("Fatal read error:", error);
      }
    }
  }

  async sendData() {
    if (!this.isConnected || !this.serialInput.value) return;
    const data = this.serialInput.value + "\n";
    try {
      this.writer = this.port.writable.getWriter();
      await this.writer.write(this.encoder.encode(data));
      this.log(`> ${data}`);
      if (this.serialInput.value.trim()) {
        this.commandHistory.unshift(this.serialInput.value);
        if (this.commandHistory.length > 50) {
          this.commandHistory.pop();
        }
      }
      this.historyIndex = -1;
      this.currentInput = "";
      this.serialInput.value = "";
    } catch (error) {
      console.error("Error writing to port:", error);
      this.log(`Error sending data: ${error.message}\n`);
    } finally {
      if (this.writer) {
        try {
          await this.writer.releaseLock();
        } catch (error) {
          console.warn("Error releasing writer lock:", error);
        }
        this.writer = null;
      }
    }
  }

  async cleanup() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.reader) {
      try {
        await this.reader.cancel();
        await this.reader.releaseLock();
      } catch (error) {
        console.warn("Error cleaning up reader:", error);
      }
      this.reader = null;
    }
    if (this.writer) {
      try {
        await this.writer.releaseLock();
      } catch (error) {
        console.warn("Error cleaning up writer:", error);
      }
      this.writer = null;
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (error) {
        console.warn("Error closing port:", error);
      }
      this.port = null;
    }
    this.isConnected = false;
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
    if (!this.output) return;
    this.output.textContent = "";
  }

  log(text) {
    if (!this.output || !this.console) return;
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!this.lineBuffer) this.lineBuffer = "";
    this.lineBuffer += lines;
    const completeLines = this.lineBuffer.split("\n");
    this.lineBuffer = completeLines[completeLines.length - 1].endsWith("\n")
      ? ""
      : completeLines.pop();
    const formattedLines = completeLines.map(line => {
      if (!line.trim()) return "<br>";
      if (line.match(/^>\s*[a-z]+$/i)) {
        return `<span class="command-input">${line}</span><br>`;
      }
      const statusMessages = [
        'WiFi scan started',
        'Stopping Wi-Fi',
        'WiFi started',
        'Ready to scan',
        'Please wait',
        'WiFi monitor stopped',
        'HTTP server started'
      ];
      if (statusMessages.some(msg => line.includes(msg))) {
        return `<span class="status-message">${line}</span><br>`;
      }
      if (line.match(/^Found \d+ access points$/)) {
        return `<span class="scan-summary">${line}</span><br>`;
      }
      if (line.match(/^\[\d+\]/)) {
        const [index, ...rest] = line.split(/(?<=^\[\d+\])\s/);
        return `<span class="ap-index">${index}</span> ${rest.join('')}<br>`;
      }
      if (line.match(/^\s*SSID:/)) {
        const [label, value] = line.split(/:\s*/);
        return `<span class="ap-label">${label}:</span> <span class="ap-ssid">${value}</span><br>`;
      }
      if (line.match(/^\s*RSSI:/)) {
        const [label, value] = line.split(/:\s*/);
        return `<span class="ap-label">${label}:</span> <span class="ap-rssi">${value}</span><br>`;
      }
      if (line.match(/^\s*Company:/)) {
        const [label, value] = line.split(/:\s*/);
        return `<span class="ap-label">${label}:</span> <span class="ap-company">${value}</span><br>`;
      }
      if (line.match(/^[A-Za-z]+$/) && line.length < 20) {
        return `<span class="command-name">${line}</span><br>`;
      }
      if (line.match(/^Ghost ESP Commands:$/)) {
        return `<span class="section-header">${line}</span><br>`;
      }
      if (line.match(/^\s{4}(Description|Usage|Arguments):(?:\s|$)/)) {
        return `<span class="help-section-header">${line}</span><br>`;
      }
      if (line.match(/^\s{4}Usage:\s/)) {
        const [prefix, ...rest] = line.split(/(?<=Usage:)\s/);
        return `<span class="help-section-header">${prefix}</span><span class="command-usage">${rest.join(' ')}</span><br>`;
      }
      if (line.match(/^\s{8}(-[a-zA-Z]|\[.*?\])\s+:/)) {
        const [flag, ...description] = line.split(/(?<=:)\s/);
        return `<span class="command-flag">${flag}</span><span class="flag-description">${description.join(' ')}</span><br>`;
      }
      if (line.match(/^\[.*?\]\s*W\s+\(.*?\)\s*spi_flash:/)) {
        return `<span class="warning">${line}</span><br>`;
      }
      if (line.match(/^Connected to device$/) || line.match(/^Disconnected from device$/)) {
        return `<span class="connection-status">${line}</span><br>`;
      }
      if (line.match(/^Port Scanner$/)) {
        return `<span class="section-header">${line}</span><br>`;
      }
      if (line.match(/^\s*OR\s*$/)) {
        return `<span class="separator">${line}</span><br>`;
      }
      return `<span class="regular-text">${line}</span><br>`;
    });
    if (formattedLines.length) {
      if (this.output.innerHTML) {
        this.output.innerHTML += formattedLines.join("");
      } else {
        this.output.innerHTML = formattedLines.join("");
      }
      setTimeout(() => {
        this.console.scrollTo({
          top: this.console.scrollHeight,
          behavior: "smooth",
        });
      }, 0);
      requestAnimationFrame(() => {
        this.console.scrollTo({
          top: this.console.scrollHeight,
          behavior: "auto",
        });
      });
    }
  }

  navigateHistory(direction) {
    if (!this.commandHistory.length) return;
    if (this.historyIndex === -1) {
      this.currentInput = this.serialInput.value;
    }
    if (direction === "up") {
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
        this.serialInput.value = this.commandHistory[this.historyIndex];
      }
    } else if (direction === "down") {
      if (this.historyIndex > -1) {
        this.historyIndex--;
        this.serialInput.value =
          this.historyIndex === -1
            ? this.currentInput
            : this.commandHistory[this.historyIndex];
      }
    }
    setTimeout(() => {
      this.serialInput.selectionStart = this.serialInput.value.length;
      this.serialInput.selectionEnd = this.serialInput.value.length;
    }, 0);
  }

  exportLog() {
    if (!this.output) return;
    const content = this.output.innerText || "";
    if (!content.trim()) {
      return;
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serial_log_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
}

function renderGhostOsSerialConsole(rootEl) {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div class="serial-container">
      <div class="header">
        <h1>Serial Console</h1>
        <div class="status-bar">
          <div class="status-indicator">
            <div class="status-dot" id="connectionDot"></div>
            <span id="connectionStatus">Disconnected</span>
          </div>
          <div class="status-indicator">
            <span id="baudRate">Baud Rate: 115200</span>
          </div>
        </div>
      </div>
      <div class="console" id="console">
        <div class="console-output" id="output"></div>
      </div>
      <div class="controls-container">
        <div class="control-panel">
          <button class="btn btn-primary" id="connectButton">Connect</button>
          <button class="btn" id="clearButton">Clear Console</button>
          <button class="btn" id="exportButton">Export Log</button>
          <select class="btn" id="baudSelect">
            <option value="9600">9600 baud</option>
            <option value="115200" selected>115200 baud</option>
            <option value="921600">921600 baud</option>
          </select>
        </div>
        <div class="input-group">
          <input
            type="text"
            class="serial-input"
            id="serialInput"
            placeholder="Type a command and press Enter..."
          />
          <button class="btn" id="sendButton">Send</button>
        </div>
      </div>
    </div>
    <div class="dialog-overlay" id="browserDialog">
      <div class="dialog">
        <h2>Browser Not Supported</h2>
        <p>
          Web Serial API is only supported in Chromium-based browsers (Chrome,
          Edge, Opera). Please use a supported browser to access this feature.
        </p>
        <button
          class="btn btn-primary"
          id="browserDialogClose"
        >
          Close
        </button>
      </div>
    </div>
    <div class="dialog-overlay" id="permissionDialog">
      <div class="dialog">
        <h2>Permission Required</h2>
        <p>
          Please select your device from the popup and click "Connect" to
          establish a serial connection.
        </p>
        <button
          class="btn btn-primary"
          id="permissionDialogClose"
        >
          OK
        </button>
      </div>
    </div>
  `;

  if (window.ghostosSerialConsole &&
      typeof window.ghostosSerialConsole.disconnect === "function") {
    window.ghostosSerialConsole.disconnect();
  }

  const instance = new SerialConsole();
  window.ghostosSerialConsole = instance;

  const browserClose = document.getElementById("browserDialogClose");
  const browserDialog = document.getElementById("browserDialog");
  if (browserClose && browserDialog) {
    browserClose.addEventListener("click", () => {
      browserDialog.style.display = "none";
    });
  }

  const permissionClose = document.getElementById("permissionDialogClose");
  const permissionDialog = document.getElementById("permissionDialog");
  if (permissionClose && permissionDialog) {
    permissionClose.addEventListener("click", () => {
      permissionDialog.style.display = "none";
    });
  }
}

window.renderGhostOSSerialApp = renderGhostOsSerialConsole;
