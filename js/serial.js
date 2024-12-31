class SerialConsole {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.abortController = null;
        this.lineBuffer = '';
        this.initializeElements();
        this.checkBrowserSupport();
        this.setupEventListeners();
    }

    initializeElements() {
        this.connectButton = document.getElementById('connectButton');
        this.clearButton = document.getElementById('clearButton');
        this.sendButton = document.getElementById('sendButton');
        this.serialInput = document.getElementById('serialInput');
        this.output = document.getElementById('output');
        this.console = document.getElementById('console');
        this.baudSelect = document.getElementById('baudSelect');
        this.baudRateDisplay = document.getElementById('baudRate');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionDot = document.getElementById('connectionDot');
        this.browserDialog = document.getElementById('browserDialog');
        this.permissionDialog = document.getElementById('permissionDialog');
        this.updateBaudRateDisplay();
    }

    checkBrowserSupport() {
        if (!('serial' in navigator)) {
            this.browserDialog.style.display = 'flex';
            this.connectButton.disabled = true;
            return false;
        }
        return true;
    }

    setupEventListeners() {
        this.connectButton.addEventListener('click', () => this.toggleConnection());
        this.clearButton.addEventListener('click', () => this.clearConsole());
        this.sendButton.addEventListener('click', () => this.sendData());
        this.serialInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendData();
            }
        });
        
        this.baudSelect.addEventListener('change', async () => {
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
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Reopen with new baud rate
            await this.port.open({
                baudRate: parseInt(this.baudSelect.value),
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            this.updateConnectionStatus(true);
            this.startReading();
            this.log('Reconnected with new baud rate: ' + this.baudSelect.value + '\n');
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
        this.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
        this.connectionDot.classList.toggle('connected', connected);
        this.connectButton.textContent = connected ? 'Disconnect' : 'Connect';
        this.sendButton.disabled = !connected;
        this.serialInput.disabled = !connected;
        this.baudSelect.disabled = connected;
    }

    async connect() {
        try {
            this.permissionDialog.style.display = 'flex';
            this.port = await navigator.serial.requestPort();
            this.permissionDialog.style.display = 'none';

            await this.port.open({
                baudRate: parseInt(this.baudSelect.value),
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            // Create new AbortController for this connection
            this.abortController = new AbortController();

            this.updateConnectionStatus(true);
            this.startReading();
            this.log('Connected to device\n');
        } catch (error) {
            this.permissionDialog.style.display = 'none';
            if (error.name === 'NotFoundError') {
                this.log('No device selected\n');
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
                        console.error('Error reading data:', error);
                    }
                } finally {
                    try {
                        await this.reader.releaseLock();
                    } catch (error) {
                        console.warn('Error releasing reader lock:', error);
                    }
                }
            }
        } catch (error) {
            if (!this.abortController.signal.aborted) {
                console.error('Fatal read error:', error);
            }
        }
    }

    async sendData() {
        if (!this.isConnected || !this.serialInput.value) return;

        const data = this.serialInput.value + '\n';
        try {
            this.writer = this.port.writable.getWriter();
            await this.writer.write(this.encoder.encode(data));
            this.log(`> ${data}`);
            this.serialInput.value = '';
        } catch (error) {
            console.error('Error writing to port:', error);
            this.log(`Error sending data: ${error.message}\n`);
        } finally {
            if (this.writer) {
                try {
                    await this.writer.releaseLock();
                } catch (error) {
                    console.warn('Error releasing writer lock:', error);
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
                console.warn('Error cleaning up reader:', error);
            }
            this.reader = null;
        }

        // Release writer if it exists
        if (this.writer) {
            try {
                await this.writer.releaseLock();
            } catch (error) {
                console.warn('Error cleaning up writer:', error);
            }
            this.writer = null;
        }

        // Close port if it exists
        if (this.port) {
            try {
                await this.port.close();
            } catch (error) {
                console.warn('Error closing port:', error);
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
            
            this.log('Disconnected from device\n');
        } catch (error) {
            console.error('Error during disconnect:', error);
            this.log('Forced disconnect due to error\n');
        }
    }

    clearConsole() {
        this.output.textContent = '';
    }

    log(text) {
        // Normalize line endings and split into lines
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Buffer to accumulate partial lines
        if (!this.lineBuffer) this.lineBuffer = '';
        
        // Append new text to buffer
        this.lineBuffer += lines;
        
        // Process complete lines
        const completeLines = this.lineBuffer.split('\n');
        // Keep the last line if it's incomplete (no ending newline)
        this.lineBuffer = completeLines[completeLines.length - 1].endsWith('\n') ? '' : completeLines.pop();
        
        // Process each complete line
        const formattedLines = completeLines.map(line => {
            if (!line.trim()) return '';
            
            let formattedLine = line;
            let matched = false;

            // GhostESP-specific formatting (preserved)
            if (formattedLine.match(/^\[\d+\]\s*SSID:/)) {
                return `<span class="ap-entry">${formattedLine}</span>`;
            }
            if (formattedLine.match(/^\s*(RSSI|Company):/)) {
                return `<span class="ap-detail">${formattedLine}</span>`;
            }
            
            // Generic firmware patterns (enhanced)
            
            // WiFi related messages (broadened)
            if (formattedLine.match(/\b(WiFi|scanning|AP|access point|SSID|connected to|network|connection)\b/i)) {
                return `<span class="wifi-status">${formattedLine}</span>`;
            }
            
            // IP/MAC Addresses and network info
            if (formattedLine.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/) || // IPv4
                formattedLine.match(/\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\b/) || // MAC address
                formattedLine.match(/\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/)) { // IPv6
                return `<span class="ip-address">${formattedLine}</span>`;
            }
            
            // Command input (starts with '>' or '$' for different shells)
            if (formattedLine.match(/^[>$]\s/)) {
                return `<span class="command">${formattedLine}</span>`;
            }
            
            // Help/Documentation text (broadened)
            if (formattedLine.match(/^(Description|Usage|Arguments|Example|Options|Commands|Help):/i)) {
                return `<span class="help-header">${formattedLine}</span>`;
            }
            
            // Command names (more flexible pattern)
            if (formattedLine.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                return `<span class="command-name">${formattedLine}</span>`;
            }
            
            // Error messages (enhanced patterns)
            if (formattedLine.match(/\b(error|fail(ed|ure)?|exception|invalid|timeout|denied)\b/i) || 
                formattedLine.match(/\b(ERR|ERROR|E:)/i) ||
                formattedLine.match(/^!\s/)) {
                return `<span class="error">${formattedLine}</span>`;
            }
            
            // Success messages (enhanced patterns)
            if (formattedLine.match(/\b(success|ok|done|ready|started|complete|finished|connected)\b/i) || 
                formattedLine.match(/\b(OK|SUCCESS|S:)/i)) {
                return `<span class="success">${formattedLine}</span>`;
            }
            
            // Warning messages (enhanced patterns)
            if (formattedLine.match(/\b(warning|warn|caution|attention)\b/i) || 
                formattedLine.match(/\b(WARN|WARNING|W:)/i)) {
                return `<span class="warning">${formattedLine}</span>`;
            }
            
            // Info/Debug/Log messages (enhanced patterns)
            if (formattedLine.match(/\b(info|note|debug|log)\b/i) || 
                formattedLine.match(/\b(INFO|DEBUG|LOG|I:|D:)/i)) {
                return `<span class="info">${formattedLine}</span>`;
            }
            
            // Arguments and parameters (enhanced)
            if (formattedLine.trim().match(/^(-{1,2}|\/)[a-zA-Z]/) || // Command line args
                formattedLine.match(/^[a-zA-Z_][a-zA-Z0-9_]*=/)) {    // Key=value pairs
                return `<span class="argument">${formattedLine}</span>`;
            }
            
            // Memory addresses and hex values
            if (formattedLine.match(/\b(0x[0-9a-fA-F]+)\b/)) {
                return `<span class="memory-address">${formattedLine}</span>`;
            }
            
            return formattedLine;
        }).filter(line => line);
        
        // Always scroll to bottom when new content is added
        if (formattedLines.length) {
            if (this.output.innerHTML) {
                this.output.innerHTML += formattedLines.join('\n');
            } else {
                this.output.innerHTML = formattedLines.join('\n');
            }
            
            // Ensure scrolling happens after content is fully rendered
            setTimeout(() => {
                this.console.scrollTo({
                    top: this.console.scrollHeight,
                    behavior: 'smooth'
                });
            }, 0);

            // Backup scroll in case the first attempt fails
            requestAnimationFrame(() => {
                this.console.scrollTo({
                    top: this.console.scrollHeight,
                    behavior: 'auto'
                });
            });
        }
    }
}

// Initialize the console when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.serialConsole = new SerialConsole();
}); 