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
    if (!("serial" in navigator)) {
      this.browserDialog.style.display = "flex";
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
    this.connectButton.addEventListener("click", () => this.toggleConnection());
    this.clearButton.addEventListener("click", () => this.clearConsole());
    this.sendButton.addEventListener("click", () => this.sendData());
    this.exportButton.addEventListener("click", () => this.exportLog());
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

    this.baudSelect.addEventListener("change", async () => {
      this.updateBaudRateDisplay();
      if (this.isConnected) {
        await this.reconnectWithNewBaudRate();
      }
    });
  }

  updateBaudRateDisplay() {
    this.baudRateDisplay.textContent = `Baud Rate: ${this.baudSelect.value}`;
  }

  async reconnectWithNewBaudRate() {
    try {
      // Store the current port info
      const portInfo = this.port.getInfo();
      await this.disconnect();

      // Brief delay to ensure proper port closure
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reopen with new baud rate
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
    this.connectionStatus.textContent = connected
      ? "Connected"
      : "Disconnected";
    this.connectionDot.classList.toggle("connected", connected);
    this.connectButton.textContent = connected ? "Disconnect" : "Connect";
    this.sendButton.disabled = !connected;
    this.serialInput.disabled = !connected;
    this.baudSelect.disabled = connected;
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

      // Create new AbortController for this connection
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
    // Signal all operations to stop
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Release reader if it exists
    if (this.reader) {
      try {
        await this.reader.cancel();
        await this.reader.releaseLock();
      } catch (error) {
        console.warn("Error cleaning up reader:", error);
      }
      this.reader = null;
    }

    // Release writer if it exists
    if (this.writer) {
      try {
        await this.writer.releaseLock();
      } catch (error) {
        console.warn("Error cleaning up writer:", error);
      }
      this.writer = null;
    }

    // Close port if it exists
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
      // Update UI immediately
      this.updateConnectionStatus(false);

      // Perform cleanup
      await this.cleanup();

      this.log("Disconnected from device\n");
    } catch (error) {
      console.error("Error during disconnect:", error);
      this.log("Forced disconnect due to error\n");
    }
  }

  clearConsole() {
    this.output.textContent = "";
  }

  log(text) {
    // Normalize line endings and split into lines
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Buffer to accumulate partial lines
    if (!this.lineBuffer) this.lineBuffer = "";

    // Append new text to buffer
    this.lineBuffer += lines;

    // Process complete lines
    const completeLines = this.lineBuffer.split("\n");
    // Keep the last line if it's incomplete (no ending newline)
    this.lineBuffer = completeLines[completeLines.length - 1].endsWith("\n")
      ? ""
      : completeLines.pop();

    // Process each complete line
    const formattedLines = completeLines.map(line => {
      if (!line.trim()) return "<br>";

      // Command prompt with command
      if (line.match(/^>\s*[a-z]+$/i)) {
        return `<span class="command-input">${line}</span><br>`;
      }

      // Status messages
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

      // Scan summary (Found X access points)
      if (line.match(/^Found \d+ access points$/)) {
        return `<span class="scan-summary">${line}</span><br>`;
      }

      // Access point entries
      if (line.match(/^\[\d+\]/)) {
        // Index number
        const [index, ...rest] = line.split(/(?<=^\[\d+\])\s/);
        return `<span class="ap-index">${index}</span> ${rest.join('')}<br>`;
      }

      // SSID lines
      if (line.match(/^\s*SSID:/)) {
        const [label, value] = line.split(/:\s*/);
        return `<span class="ap-label">${label}:</span> <span class="ap-ssid">${value}</span><br>`;
      }

      // RSSI lines
      if (line.match(/^\s*RSSI:/)) {
        const [label, value] = line.split(/:\s*/);
        return `<span class="ap-label">${label}:</span> <span class="ap-rssi">${value}</span><br>`;
      }

      // Company lines
      if (line.match(/^\s*Company:/)) {
        const [label, value] = line.split(/:\s*/);
        return `<span class="ap-label">${label}:</span> <span class="ap-company">${value}</span><br>`;
      }

      // Single-word command names (from the root command list)
      if (line.match(/^[A-Za-z]+$/) && line.length < 20) {
        return `<span class="command-name">${line}</span><br>`;
      }

      // Main section header
      if (line.match(/^Ghost ESP Commands:$/)) {
        return `<span class="section-header">${line}</span><br>`;
      }

      // Description/Usage/Arguments headers (must be properly indented)
      if (line.match(/^\s{4}(Description|Usage|Arguments):(?:\s|$)/)) {
        return `<span class="help-section-header">${line}</span><br>`;
      }

      // Command usage with proper indentation
      if (line.match(/^\s{4}Usage:\s/)) {
        const [prefix, ...rest] = line.split(/(?<=Usage:)\s/);
        return `<span class="help-section-header">${prefix}</span><span class="command-usage">${rest.join(' ')}</span><br>`;
      }

      // Arguments with flags (must be properly indented)
      if (line.match(/^\s{8}(-[a-zA-Z]|\[.*?\])\s+:/)) {
        const [flag, ...description] = line.split(/(?<=:)\s/);
        return `<span class="command-flag">${flag}</span><span class="flag-description">${description.join(' ')}</span><br>`;
      }

      // Warning messages (specifically SPI flash warnings)
      if (line.match(/^\[.*?\]\s*W\s+\(.*?\)\s*spi_flash:/)) {
        return `<span class="warning">${line}</span><br>`;
      }

      // Connection status messages (exact matches)
      if (line.match(/^Connected to device$/) || line.match(/^Disconnected from device$/)) {
        return `<span class="connection-status">${line}</span><br>`;
      }

      // Port Scanner section header
      if (line.match(/^Port Scanner$/)) {
        return `<span class="section-header">${line}</span><br>`;
      }

      // OR separator line
      if (line.match(/^\s*OR\s*$/)) {
        return `<span class="separator">${line}</span><br>`;
      }

      // Default case: regular text
      return `<span class="regular-text">${line}</span><br>`;
    });

    // Always scroll to bottom when new content is added
    if (formattedLines.length) {
      if (this.output.innerHTML) {
        this.output.innerHTML += formattedLines.join(""); // Remove \n since we're using <br> tags
      } else {
        this.output.innerHTML = formattedLines.join("");
      }

      // Ensure scrolling happens after content is fully rendered
      setTimeout(() => {
        this.console.scrollTo({
          top: this.console.scrollHeight,
          behavior: "smooth",
        });
      }, 0);

      // Backup scroll in case the first attempt fails
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
      // Save current input before navigating history
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

    // Move cursor to end of input
    setTimeout(() => {
      this.serialInput.selectionStart = this.serialInput.value.length;
      this.serialInput.selectionEnd = this.serialInput.value.length;
    }, 0);
  }

  exportLog() {
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

// Initialize the console when the page loads
document.addEventListener("DOMContentLoaded", () => {
  window.serialConsole = new SerialConsole();
});
