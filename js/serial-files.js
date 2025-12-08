class FileBrowser {
  constructor() {
    this.currentPath = "/mnt/ghostesp";
    this.entries = [];
    this.selectedEntry = null;
    this.sdStatus = null;
    this.isLoading = false;
    this.responseBuffer = "";
    this.pendingCommand = null;
    this.expectedResponse = null;
    this.commandResolve = null;
    this.commandTimeout = null;
    this.downloadProgress = null;
    this.isBusy = false;
    this.isRefreshing = false;
    this.refreshDebounce = null;
    this.transferCancelled = false;
    this.initializeUI();
    this.setupEventListeners();
  }

  initializeUI() {
    const root = document.getElementById("filesRoot");
    if (!root) return;

    root.innerHTML = `
      <div class="files-container">
        <div class="files-header">
          <div class="files-title">
            <div class="files-status-dot" id="filesStatusDot"></div>
            <span>SD Card</span>
          </div>
          <div class="files-toolbar">
            <button class="files-toolbar-btn refresh" id="filesRefresh" title="Refresh">↻ Refresh</button>
            <button class="files-toolbar-btn upload" id="filesUpload" title="Upload File">↑ Upload</button>
            <button class="files-toolbar-btn mkdir" id="filesMkdir" title="New Folder">+ Folder</button>
          </div>
        </div>
        
        <div class="files-breadcrumb" id="filesBreadcrumb"></div>
        
        <div class="files-list-container" id="filesListContainer">
          <div class="files-not-connected" id="filesNotConnected">
            <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div>Connect to device to browse files</div>
          </div>
        </div>
        
        <div class="files-status-bar" id="filesStatusBar">
          <span class="files-stat"><span class="files-stat-value" id="filesMountStatus">Unknown</span></span>
          <span class="files-stat"><span class="files-stat-value" id="filesCardName">--</span></span>
          <span class="files-stat"><span class="files-stat-value" id="filesFreeSpace">--</span></span>
          <span class="files-stat"><span class="files-stat-value" id="filesItemCount">--</span></span>
        </div>
      </div>
      <input type="file" class="files-upload-input" id="filesUploadInput" />
    `;

    this.updateBreadcrumb();
  }

  setupEventListeners() {
    document.getElementById("filesRefresh")?.addEventListener("click", () => this.debouncedRefresh());
    document.getElementById("filesUpload")?.addEventListener("click", () => this.showUploadDialog());
    document.getElementById("filesMkdir")?.addEventListener("click", () => this.showMkdirDialog());
    document.getElementById("filesUploadInput")?.addEventListener("change", (e) => this.handleFileSelect(e));
    
    document.addEventListener("click", () => this.hideContextMenu());
    
    const tabBtn = document.querySelector('[data-tab="files"]');
    tabBtn?.addEventListener("click", () => {
      if (window.serialConsole?.isConnected) {
        this.debouncedRefresh();
      }
    });
    
    this.setupDragDrop();
  }

  setupDragDrop() {
    const container = document.getElementById("filesListContainer");
    if (!container) return;
    
    let dragCounter = 0;
    
    container.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      if (window.serialConsole?.isConnected) {
        container.classList.add("drag-over");
      }
    });
    
    container.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        container.classList.remove("drag-over");
      }
    });
    
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    
    container.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      container.classList.remove("drag-over");
      
      if (!window.serialConsole?.isConnected) {
        alert("Connect to device first");
        return;
      }
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        this.uploadFiles(files);
      }
    });
  }

  async uploadFiles(files) {
    for (const file of files) {
      await this.uploadFile(file);
    }
  }

  debouncedRefresh() {
    if (this.refreshDebounce) {
      clearTimeout(this.refreshDebounce);
    }
    this.refreshDebounce = setTimeout(() => {
      this.refreshDebounce = null;
      this.refresh();
    }, 300);
  }

  async refresh() {
    if (!window.serialConsole?.isConnected) {
      this.showNotConnected();
      return;
    }

    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    this.isLoading = true;
    this.showLoading();

    try {
      await this.getStatus();
      await this.listDirectory(this.currentPath);
      const dot = document.getElementById("filesStatusDot");
      dot?.classList.toggle("mounted", this.sdStatus?.mounted);
    } catch (error) {
      console.error("Refresh error:", error);
      this.showError("Failed to refresh: " + error.message);
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
    }
  }

  async sendCommand(cmd, timeout = 15000) {
    if (!window.serialConsole?.isConnected) {
      throw new Error("Not connected");
    }

    let waitCount = 0;
    while (this.isBusy && waitCount < 300) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    if (this.isBusy) {
      throw new Error("Previous command did not complete");
    }

    this.isBusy = true;
    this.responseBuffer = "";
    this.pendingCommand = cmd;
    this.expectedResponse = this.getExpectedResponseMarker(cmd);

    return new Promise(async (resolve, reject) => {
      this.commandResolve = resolve;
      
      this.commandTimeout = setTimeout(() => {
        this.commandResolve = null;
        this.pendingCommand = null;
        this.expectedResponse = null;
        this.isBusy = false;
        reject(new Error("Command timeout"));
      }, timeout);

      try {
        const writer = window.serialConsole.port.writable.getWriter();
        await writer.write(window.serialConsole.encoder.encode(cmd + "\n"));
        await writer.releaseLock();
      } catch (error) {
        clearTimeout(this.commandTimeout);
        this.commandResolve = null;
        this.pendingCommand = null;
        this.expectedResponse = null;
        this.isBusy = false;
        reject(error);
      }
    });
  }

  getExpectedResponseMarker(cmd) {
    const base = cmd.split(" ")[0] + " " + (cmd.split(" ")[1] || "");
    if (base.startsWith("sd status")) return "SD:STATUS:";
    if (base.startsWith("sd list")) return "SD:LIST:";
    if (base.startsWith("sd info")) return "SD:INFO:";
    if (base.startsWith("sd read")) return "SD:READ:";
    if (base.startsWith("sd size")) return "SD:SIZE:";
    if (base.startsWith("sd write")) return "SD:WRITE:";
    if (base.startsWith("sd append")) return "SD:APPEND:";
    if (base.startsWith("sd tree")) return "SD:TREE:";
    if (base.startsWith("sd mkdir")) return "SD:OK:created";
    if (base.startsWith("sd rm")) return "SD:OK:removed";
    return "SD:";
  }

  processSerialData(text) {
    if (!this.pendingCommand) return;

    this.responseBuffer += text;

    const hasExpectedMarker = this.expectedResponse && this.responseBuffer.includes(this.expectedResponse);
    const hasTerminator = this.responseBuffer.includes("SD:OK") || this.responseBuffer.includes("SD:ERR");
    
    const isStatusCmd = this.pendingCommand === "sd status";
    const statusComplete = isStatusCmd && 
      this.responseBuffer.includes("SD:STATUS:mounted=") && 
      (this.responseBuffer.includes("SD card unmounted") || this.responseBuffer.includes("used_pct="));
    
    if ((hasExpectedMarker && hasTerminator) || statusComplete) {
      clearTimeout(this.commandTimeout);
      const response = this.responseBuffer;
      this.responseBuffer = "";
      this.pendingCommand = null;
      this.expectedResponse = null;
      this.isBusy = false;
      
      if (this.commandResolve) {
        this.commandResolve(response);
        this.commandResolve = null;
      }
    }
  }

  parseStatus(response) {
    const status = {};
    const lines = response.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^SD:STATUS:(\w+)=(.+)$/);
      if (match) {
        const [, key, rawValue] = match;
        const value = rawValue.trim();
        if (value === "true") status[key] = true;
        else if (value === "false") status[key] = false;
        else if (/^\d+$/.test(value)) status[key] = parseInt(value, 10);
        else status[key] = value;
      }
    }
    
    return status;
  }

  parseList(response) {
    const entries = [];
    const lines = response.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      const dirMatch = trimmed.match(/^SD:DIR:\[(\d+)\]\s+(.+)$/);
      if (dirMatch) {
        entries.push({
          index: parseInt(dirMatch[1], 10),
          name: dirMatch[2].trim(),
          type: "dir",
          size: null
        });
        continue;
      }
      
      const fileMatch = trimmed.match(/^SD:FILE:\[(\d+)\]\s+(.+?)\s+(\d+)$/);
      if (fileMatch) {
        entries.push({
          index: parseInt(fileMatch[1], 10),
          name: fileMatch[2].trim(),
          type: "file",
          size: parseInt(fileMatch[3], 10)
        });
      }
    }
    
    return entries;
  }

  async getStatus() {
    try {
      const response = await this.sendCommand("sd status", 5000);
      this.sdStatus = this.parseStatus(response);
      this.updateStatusBar();
      
      const dot = document.getElementById("filesStatusDot");
      dot?.classList.toggle("mounted", this.sdStatus.mounted);
    } catch (error) {
      this.sdStatus = { mounted: true };
      this.updateStatusBar();
      const dot = document.getElementById("filesStatusDot");
      dot?.classList.add("mounted");
    }
  }

  async listDirectory(path) {
    try {
      const response = await this.sendCommand(`sd list ${path}`, 20000);
      this.entries = this.parseList(response);
      this.currentPath = path;
      this.updateBreadcrumb();
      this.renderFileList();
    } catch (error) {
      console.error("List error:", error);
      this.showError("Failed to list directory (JIT mount may have timed out)");
    }
  }

  async navigateTo(path) {
    this.currentPath = path;
    this.selectedEntry = null;
    await this.listDirectory(path);
  }

  async openEntry(entry) {
    if (entry.type === "dir") {
      const newPath = this.currentPath === "/" 
        ? `/${entry.name}` 
        : `${this.currentPath}/${entry.name}`;
      await this.navigateTo(newPath);
    }
  }

  async downloadFile(entry) {
    if (entry.type !== "file") return;

    const filePath = `${this.currentPath}/${entry.name}`;
    
    try {
      const sizeResponse = await this.sendCommand(`sd size ${filePath}`, 20000);
      const sizeMatch = sizeResponse.match(/SD:SIZE:(\d+)/);
      if (!sizeMatch) throw new Error("Could not get file size");
      
      const fileSize = parseInt(sizeMatch[1], 10);
      const chunkSize = 4096;
      let offset = 0;
      const chunks = [];

      this.transferCancelled = false;
      this.showProgress(0, fileSize, entry.name, "Downloading");

      while (offset < fileSize) {
        const length = Math.min(chunkSize, fileSize - offset);
        const readResponse = await this.sendCommand(`sd read ${filePath} ${offset} ${length}`, 30000);
        
        const beginMatch = readResponse.match(/SD:READ:BEGIN:/);
        const endMatch = readResponse.match(/SD:READ:END:bytes=(\d+)/);
        
        if (beginMatch && endMatch) {
          const startIdx = readResponse.indexOf("\n", readResponse.indexOf("SD:READ:BEGIN:")) + 1;
          const endIdx = readResponse.lastIndexOf("\nSD:READ:END:");
          
          if (startIdx > 0 && endIdx > startIdx) {
            const chunkData = readResponse.substring(startIdx, endIdx);
            chunks.push(chunkData);
          }
        }
        
        if (this.transferCancelled) throw new Error("Cancelled");
        
        offset += length;
        this.showProgress(offset, fileSize, entry.name, "Downloading");
      }

      const fullContent = chunks.join("");
      const blob = new Blob([fullContent], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.hideProgress();
    } catch (error) {
      console.error("Download error:", error);
      this.hideProgress();
      alert("Download failed: " + error.message);
    }
  }

  async deleteEntry(entry) {
    const path = `${this.currentPath}/${entry.name}`;
    const typeStr = entry.type === "dir" ? "folder" : "file";
    
    if (!confirm(`Delete ${typeStr} "${entry.name}"?`)) return;

    try {
      const response = await this.sendCommand(`sd rm ${path}`, 20000);
      if (response.includes("SD:OK")) {
        await this.refresh();
      } else {
        const errMatch = response.match(/SD:ERR:(.+)/);
        throw new Error(errMatch ? errMatch[1] : "Delete failed");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Delete failed: " + error.message);
    }
  }

  async createDirectory(name) {
    if (!name || !name.trim()) return;
    
    const path = `${this.currentPath}/${name.trim()}`;
    
    try {
      const response = await this.sendCommand(`sd mkdir ${path}`, 20000);
      if (response.includes("SD:OK")) {
        await this.refresh();
      } else {
        const errMatch = response.match(/SD:ERR:(.+)/);
        throw new Error(errMatch ? errMatch[1] : "Create folder failed");
      }
    } catch (error) {
      console.error("Mkdir error:", error);
      alert("Create folder failed: " + error.message);
    }
  }

  async uploadFile(file) {
    const path = `${this.currentPath}/${file.name}`;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 256;
      let offset = 0;
      const totalSize = bytes.length;

      this.transferCancelled = false;
      this.showProgress(0, totalSize, file.name, "Uploading");

      while (offset < totalSize) {
        const length = Math.min(chunkSize, totalSize - offset);
        const chunk = bytes.slice(offset, offset + length);
        const base64 = this.uint8ToBase64(chunk);
        
        const isFirst = offset === 0;
        const cmd = isFirst ? `sd write ${path} ${base64}` : `sd append ${path} ${base64}`;
        const marker = isFirst ? "SD:WRITE:bytes" : "SD:APPEND:bytes";
        
        const response = await this.sendCommand(cmd, 30000);
        
        if (!response.includes(marker) || !response.includes("SD:OK")) {
          if (response.includes("SD:ERR")) {
            const errMatch = response.match(/SD:ERR:(.+)/);
            throw new Error(errMatch ? errMatch[1] : "Write failed");
          }
          throw new Error("Unexpected response from device");
        }
        
        if (this.transferCancelled) throw new Error("Cancelled");
        
        offset += length;
        this.showProgress(offset, totalSize, file.name, "Uploading");
        
        if (offset < totalSize) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      this.hideProgress();
      await this.refresh();
    } catch (error) {
      console.error("Upload error:", error);
      this.hideProgress();
      alert("Upload failed: " + error.message);
    }
  }

  uint8ToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  showUploadDialog() {
    document.getElementById("filesUploadInput")?.click();
  }

  handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (file) {
      this.uploadFile(file);
    }
    event.target.value = "";
  }

  showMkdirDialog() {
    const name = prompt("Enter folder name:");
    if (name) {
      this.createDirectory(name);
    }
  }

  updateBreadcrumb() {
    const container = document.getElementById("filesBreadcrumb");
    if (!container) return;

    const parts = this.currentPath.split("/").filter(Boolean);
    let html = `<span class="breadcrumb-item" data-path="/">/</span>`;
    
    let accPath = "";
    for (let i = 0; i < parts.length; i++) {
      accPath += "/" + parts[i];
      const isLast = i === parts.length - 1;
      html += `<span class="breadcrumb-sep">›</span>`;
      html += `<span class="breadcrumb-item${isLast ? " current" : ""}" data-path="${accPath}">${parts[i]}</span>`;
    }

    container.innerHTML = html;

    container.querySelectorAll(".breadcrumb-item").forEach(item => {
      item.addEventListener("click", () => {
        const path = item.dataset.path;
        if (path) this.navigateTo(path);
      });
    });
  }

  updateStatusBar() {
    const mountEl = document.getElementById("filesMountStatus");
    const nameEl = document.getElementById("filesCardName");
    const freeEl = document.getElementById("filesFreeSpace");
    const countEl = document.getElementById("filesItemCount");

    if (this.sdStatus) {
      if (mountEl) {
        mountEl.textContent = this.sdStatus.mounted ? "Mounted" : "Not Mounted";
        mountEl.className = "files-stat-value " + (this.sdStatus.mounted ? "success" : "error");
      }
      if (nameEl) {
        const name = this.sdStatus.name || this.sdStatus.type || "--";
        nameEl.textContent = name;
      }
      if (freeEl) {
        if (this.sdStatus.free_mb !== undefined && this.sdStatus.total_mb !== undefined) {
          const freeGB = (this.sdStatus.free_mb / 1024).toFixed(1);
          const totalGB = (this.sdStatus.total_mb / 1024).toFixed(1);
          freeEl.textContent = `${freeGB} / ${totalGB} GB`;
        } else if (this.sdStatus.free_mb !== undefined) {
          freeEl.textContent = `${this.sdStatus.free_mb} MB free`;
        } else {
          freeEl.textContent = "--";
        }
      }
    }
    
    if (countEl) {
      const dirs = this.entries.filter(e => e.type === "dir").length;
      const files = this.entries.filter(e => e.type === "file").length;
      countEl.textContent = `${dirs} folders, ${files} files`;
    }
  }

  renderFileList() {
    const container = document.getElementById("filesListContainer");
    if (!container) return;

    if (this.entries.length === 0) {
      container.innerHTML = `
        <div class="files-empty">
          <div class="files-empty-icon"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
          <div>This folder is empty</div>
        </div>
      `;
      this.updateStatusBar();
      return;
    }

    const dirs = this.entries.filter(e => e.type === "dir").sort((a, b) => a.name.localeCompare(b.name));
    const files = this.entries.filter(e => e.type === "file").sort((a, b) => a.name.localeCompare(b.name));
    const sorted = [...dirs, ...files];

    let html = `
      <div class="files-list">
        <div class="files-list-header">
          <span></span>
          <span>Name</span>
          <span style="text-align:right">Size</span>
          <span style="text-align:right">Actions</span>
        </div>
    `;

    if (this.currentPath !== "/" && this.currentPath !== "/mnt/ghostesp") {
      html += `
        <div class="file-item dir" data-action="parent">
          <span class="file-icon dir"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="currentColor" stroke="none"/></svg></span>
          <span class="file-name">..</span>
          <span class="file-size"></span>
          <span class="file-actions"></span>
        </div>
      `;
    }

    for (const entry of sorted) {
      const icon = this.getFileIcon(entry);
      const size = entry.type === "file" ? this.formatSize(entry.size) : "--";
      const iconClass = this.getIconClass(entry);

      html += `
        <div class="file-item ${entry.type}" data-index="${entry.index}" data-name="${entry.name}" data-type="${entry.type}">
          <span class="file-icon ${iconClass}">${icon}</span>
          <span class="file-name">${this.escapeHtml(entry.name)}</span>
          <span class="file-size">${size}</span>
          <span class="file-actions">
            ${entry.type === "file" ? `<button class="file-action-btn download" title="Download" data-action="download"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ""}
            <button class="file-action-btn delete" title="Delete" data-action="delete"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </span>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll(".file-item").forEach(item => {
      item.addEventListener("dblclick", () => {
        if (item.dataset.action === "parent") {
          this.navigateUp();
        } else {
          const entry = this.entries.find(e => e.index === parseInt(item.dataset.index, 10));
          if (entry) this.openEntry(entry);
        }
      });

      item.addEventListener("click", (e) => {
        if (item.dataset.action === "parent") return;
        
        container.querySelectorAll(".file-item.selected").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        this.selectedEntry = this.entries.find(e => e.index === parseInt(item.dataset.index, 10));
      });

      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (item.dataset.action === "parent") return;
        
        const entry = this.entries.find(e => e.index === parseInt(item.dataset.index, 10));
        if (entry) this.showContextMenu(e.clientX, e.clientY, entry);
      });
    });

    container.querySelectorAll(".file-action-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = btn.closest(".file-item");
        const entry = this.entries.find(e => e.index === parseInt(item.dataset.index, 10));
        if (!entry) return;

        if (btn.dataset.action === "download") {
          this.downloadFile(entry);
        } else if (btn.dataset.action === "delete") {
          this.deleteEntry(entry);
        }
      });
    });

    this.updateStatusBar();
  }

  navigateUp() {
    const parts = this.currentPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      parts.pop();
      const newPath = "/" + parts.join("/");
      this.navigateTo(newPath || "/");
    }
  }

  getFileIcon(entry) {
    const svgFolder = `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="currentColor" stroke="none"/></svg>`;
    const svgFile = `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    const svgSignal = `<svg viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>`;
    const svgText = `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`;
    const svgCode = `<svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    const svgRemote = `<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="2"/><line x1="12" y1="6" x2="12" y2="6.01"/></svg>`;
    const svgSettings = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    const svgNfc = `<svg viewBox="0 0 24 24"><path d="M6 8.32a7.43 7.43 0 0 1 0 7.36"/><path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58"/><path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8"/><path d="M16.37 2a20.16 20.16 0 0 1 0 20"/></svg>`;
    const svgBin = `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M9 15h.01"/><path d="M15 15h.01"/></svg>`;
    
    if (entry.type === "dir") return svgFolder;
    
    const ext = entry.name.split(".").pop()?.toLowerCase();
    const icons = {
      pcap: svgSignal,
      csv: svgText,
      log: svgText,
      txt: svgText,
      html: svgCode,
      ir: svgRemote,
      json: svgSettings,
      nfc: svgNfc,
      bin: svgBin
    };
    
    return icons[ext] || svgFile;
  }

  getIconClass(entry) {
    if (entry.type === "dir") return "dir";
    const ext = entry.name.split(".").pop()?.toLowerCase();
    return ext || "file";
  }

  formatSize(bytes) {
    if (bytes === null || bytes === undefined) return "--";
    if (bytes === 0) return "0 B";
    
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  showContextMenu(x, y, entry) {
    this.hideContextMenu();
    
    const menu = document.createElement("div");
    menu.className = "files-context-menu";
    menu.id = "filesContextMenu";
    menu.style.left = x + "px";
    menu.style.top = y + "px";

    let html = "";
    
    if (entry.type === "dir") {
      html += `<div class="files-context-item" data-action="open"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Open</div>`;
    } else {
      html += `<div class="files-context-item" data-action="download"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download</div>`;
    }
    
    html += `<div class="files-context-sep"></div>`;
    html += `<div class="files-context-item danger" data-action="delete"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete</div>`;

    menu.innerHTML = html;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";

    menu.querySelectorAll(".files-context-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        
        if (action === "open") this.openEntry(entry);
        else if (action === "download") this.downloadFile(entry);
        else if (action === "delete") this.deleteEntry(entry);
        
        this.hideContextMenu();
      });
    });
  }

  hideContextMenu() {
    document.getElementById("filesContextMenu")?.remove();
  }

  showLoading() {
    const container = document.getElementById("filesListContainer");
    if (container) {
      container.innerHTML = `
        <div class="files-loading">
          <div class="files-spinner"></div>
          <span>Loading...</span>
        </div>
      `;
    }
  }

  showNotConnected() {
    const container = document.getElementById("filesListContainer");
    if (container) {
      container.innerHTML = `
        <div class="files-not-connected">
          <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div>Connect to device to browse files</div>
        </div>
      `;
    }
  }

  showError(message) {
    const container = document.getElementById("filesListContainer");
    if (container) {
      container.innerHTML = `
        <div class="files-empty">
          <div class="files-empty-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <div>${this.escapeHtml(message)}</div>
        </div>
      `;
    }
  }

  showProgress(current, total, fileName = "", action = "") {
    let progress = document.getElementById("filesProgress");
    
    if (!progress) {
      progress = document.createElement("div");
      progress.id = "filesProgress";
      progress.className = "files-progress";
      progress.innerHTML = `
        <div class="files-progress-info">
          <span class="files-progress-action" id="filesProgressAction"></span>
          <span class="files-progress-name" id="filesProgressName"></span>
          <button class="files-progress-cancel" id="filesProgressCancel" title="Cancel">×</button>
        </div>
        <div class="files-progress-row">
          <div class="files-progress-bar">
            <div class="files-progress-fill" id="filesProgressFill"></div>
          </div>
          <span class="files-progress-text" id="filesProgressText">0%</span>
        </div>
      `;
      
      const statusBar = document.getElementById("filesStatusBar");
      statusBar?.parentNode?.insertBefore(progress, statusBar);
      
      document.getElementById("filesProgressCancel")?.addEventListener("click", () => {
        this.transferCancelled = true;
      });
    }

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const fill = document.getElementById("filesProgressFill");
    const text = document.getElementById("filesProgressText");
    const nameEl = document.getElementById("filesProgressName");
    const actionEl = document.getElementById("filesProgressAction");
    
    if (fill) fill.style.width = pct + "%";
    if (text) text.textContent = pct + "%";
    if (nameEl) nameEl.textContent = fileName;
    if (actionEl) actionEl.textContent = action;
  }

  hideProgress() {
    document.getElementById("filesProgress")?.remove();
  }
}

const fileBrowser = new FileBrowser();

const originalLog = SerialConsole.prototype.log;
SerialConsole.prototype.log = function(text) {
  originalLog.call(this, text);
  fileBrowser.processSerialData(text);
};

const originalUpdateConnectionStatus = SerialConsole.prototype.updateConnectionStatus;
SerialConsole.prototype.updateConnectionStatus = function(connected) {
  originalUpdateConnectionStatus.call(this, connected);
  
  if (!connected) {
    fileBrowser.showNotConnected();
    const dot = document.getElementById("filesStatusDot");
    dot?.classList.remove("mounted");
  }
};
