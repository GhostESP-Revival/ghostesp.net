document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener("dragover", (event) => {
        if (!event.target.closest('.flasher-file-drop')) return;
        event.preventDefault();
    }, false);

    window.addEventListener("drop", (event) => {
        if (!event.target.closest('.flasher-file-drop')) event.preventDefault();
    }, false);

    const checkEsptoolLoaded = () => {
        if (window.esptoolJS) {
            initializeFlasher();
        } else {
            setTimeout(checkEsptoolLoaded, 100);
        }
    };
    checkEsptoolLoaded();

    function updateStatusIndicator(status, message, details) {
        const el = document.getElementById('globalStatus');
        if (!el) return;
        let iconClass = 'bi-cpu';
        switch (status) {
            case 'flashing': iconClass = 'bi-lightning-charge'; break;
            case 'success': iconClass = 'bi-check-circle-fill'; break;
            case 'error': iconClass = 'bi-exclamation-triangle-fill'; break;
            case 'disconnected': iconClass = 'bi-x-circle'; break;
        }
        el.className = `flasher-global-status flasher-status-${status}`;
        el.innerHTML = `<i class="bi ${iconClass}"></i> <span>${message}</span>${details ? `<small class="d-block text-muted">${details}</small>` : ''}`;
    }

    function initializeFlasher() {
        function getElementById(id) {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`Element with ID '${id}' not found in the DOM`);
            }
            return element;
        }

        // Chipinfo parsing regex patterns
        const chipInfoRegex = {
            CHIP_FIRMWARE:   /Firmware:\s*([^\n]+)/,
            CHIP_GIT_COMMIT: /Git Commit:\s*([^\n]+)/,
            CHIP_MODEL:      /Model:\s*([^\n]+)/,
            CHIP_REVISION:   /Revision:\s*v?(\d+(?:\.\d+)+)/,
            CHIP_CORES:      /CPU Cores:\s*(\d+)/,
            CHIP_FEATURES:   /Features:\s*([^\n]+)/,
            CHIP_FREE_HEAP:  /Free Heap:\s*(\d+)/,
            CHIP_MIN_HEAP:   /Min Free Heap:\s*(\d+)/,
            CHIP_IDF:        /IDF Version:\s*([^\n]+)/,
            CHIP_BUILD_TEMPLATE: /Build Config:\s*([^\n]+)/i,
            CHIP_BUILD_CFG:  /Build Config:\s*([^\n]+)/,
            CHIP_SCREEN:     /Screen:\s*([^\n]+)/,
            CHIP_SCREEN_W:   /Width:\s*(\d+)/,
            CHIP_SCREEN_H:   /Height:\s*(\d+)/,
            CHIP_SCREEN_TYPE:/Screen Type:\s*([^\n]+)/
        };

        function parseChipInfo(text) {
            let parseText = text;
            const startIdx = text.indexOf('[CHIPINFO_START]');
            const endIdx = text.indexOf('[CHIPINFO_END]');
            if (startIdx !== -1 && endIdx !== -1) {
                parseText = text.substring(startIdx, endIdx);
            }
            const info = {};
            for (const [key, regex] of Object.entries(chipInfoRegex)) {
                const match = parseText.match(regex);
                if (match) {
                    info[key] = match[1].trim();
                }
            }

            if (!info.CHIP_BUILD_TEMPLATE && info.CHIP_BUILD_CFG) {
                info.CHIP_BUILD_TEMPLATE = info.CHIP_BUILD_CFG;
            }
            return info;
        }

        function checkChipMismatch(detectedModel) {
            if (!selectedDevice || !detectedModel || !chipMismatchWarningElem) return;
            const selectedNorm = selectedDevice.replace(/ESP32[-_]?/i, '').toLowerCase();
            const detectedNorm = detectedModel.replace(/ESP32[-_]?/i, '').toLowerCase();
            if (selectedNorm !== detectedNorm) {
                chipMismatchWarningElem.style.display = 'inline-flex';
                espLoaderTerminal.writeLine(`WARNING: Chip mismatch! Selected ${selectedDevice} but detected ${detectedModel}`);
            } else {
                chipMismatchWarningElem.style.display = 'none';
            }
        }

        function displayChipInfo(info) {
            const insights = getElementById('deviceInsights');
            const panel = getElementById('chipInfoPanel');
            const statsContainer = getElementById('chipStats');
            const screenDisplay = getElementById('screenDisplay');
            const screenPreview = getElementById('screenPreview');
            const screenMeta = getElementById('screenMeta');

            if (!panel || !statsContainer) return;

            // Build chip stats
            const stats = [];
            
            if (info.CHIP_FIRMWARE) {
                stats.push({ label: 'Firmware', value: info.CHIP_FIRMWARE, highlight: true });
            }
            if (info.CHIP_MODEL) {
                stats.push({ label: 'Model', value: info.CHIP_MODEL, highlight: true });
            }
            if (info.CHIP_REVISION) {
                stats.push({ label: 'Revision', value: `v${info.CHIP_REVISION}` });
            }
            if (info.CHIP_CORES) {
                stats.push({ label: 'Cores', value: info.CHIP_CORES });
            }
            if (info.CHIP_FEATURES) {
                stats.push({ label: 'Features', value: info.CHIP_FEATURES });
            }
            if (info.CHIP_FREE_HEAP) {
                const heapKB = (parseInt(info.CHIP_FREE_HEAP) / 1024).toFixed(1);
                stats.push({ label: 'Free Heap', value: `${heapKB} KB`, highlight: true });
            }
            if (info.CHIP_IDF) {
                stats.push({ label: 'IDF', value: info.CHIP_IDF });
            }
            if (info.CHIP_BUILD_TEMPLATE) {
                stats.push({ label: 'Build', value: info.CHIP_BUILD_TEMPLATE, highlight: true });
            } else if (info.CHIP_BUILD_CFG) {
                stats.push({ label: 'Build', value: info.CHIP_BUILD_CFG });
            }
            if (info.CHIP_GIT_COMMIT) {
                stats.push({ label: 'Git', value: info.CHIP_GIT_COMMIT });
            }

            if (stats.length > 0) {
                statsContainer.innerHTML = stats.map(stat => `
                    <div class="flasher-chip-stat">
                        <div class="flasher-chip-stat-label">${stat.label}</div>
                        <div class="flasher-chip-stat-value ${stat.highlight ? 'highlight' : ''}">${stat.value}</div>
                    </div>
                `).join('');
                panel.classList.add('visible');
                if (insights) insights.classList.add('visible');
            }

            if (info.CHIP_BUILD_TEMPLATE) {
                detectedBuildTemplate = info.CHIP_BUILD_TEMPLATE;
                applyBuildTemplateMatch();
            }

            const inferredDevice = inferDeviceFromChipModel(info.CHIP_MODEL);
            if (inferredDevice && deviceOptions[inferredDevice]) {
                selectedDevice = inferredDevice;
                selectedSide = selectedBrand ? `${selectedBrand} (${selectedDevice})` : selectedDevice;
                updateDefaultAddresses();
                document.querySelectorAll('.flasher-device-card').forEach(card => {
                    card.classList.toggle('selected', card.dataset.device === inferredDevice && !card.dataset.brand);
                });
                if (continueToStep2Btn) continueToStep2Btn.disabled = false;
            }

            // Handle screen display
            if (info.CHIP_SCREEN || info.CHIP_SCREEN_TYPE) {
                if (screenPreview) {
                    screenPreview.textContent = info.CHIP_SCREEN || 'Screen detected';
                }
                
                const metaItems = [];
                if (info.CHIP_SCREEN_TYPE) {
                    metaItems.push(`Type: <span>${info.CHIP_SCREEN_TYPE}</span>`);
                }
                if (info.CHIP_SCREEN_W && info.CHIP_SCREEN_H) {
                    metaItems.push(`Resolution: <span>${info.CHIP_SCREEN_W}x${info.CHIP_SCREEN_H}</span>`);
                }
                
                if (screenMeta) {
                    screenMeta.innerHTML = metaItems.map(item => 
                        `<div class="flasher-screen-meta-item">${item}</div>`
                    ).join('');
                }
                
                if (screenDisplay) {
                    screenDisplay.classList.add('visible');
                }
            } else {
                if (screenDisplay) {
                    screenDisplay.classList.remove('visible');
                }
            }
        }

        function clearChipInfoDisplay() {
            const panel = getElementById('chipInfoPanel');
            const insights = getElementById('deviceInsights');
            const screenDisplay = getElementById('screenDisplay');
            if (panel) panel.classList.remove('visible');
            if (screenDisplay) screenDisplay.classList.remove('visible');
            if (insights) insights.classList.remove('visible');
        }

        let flasherMirrorInstance = null;

        async function initFlasherMirror() {
            const mirrorRoot = getElementById('mirrorRoot');
            const screenDisplay = getElementById('screenDisplay');
            const insights = getElementById('deviceInsights');
            if (!mirrorRoot || !screenDisplay) return;

            // Create compact mirror UI with hidden controls for SerialMirror compatibility
            mirrorRoot.innerHTML = `
                <div class="mirror-compact-container">
                    <div class="mirror-display-wrapper mirror-compact-display">
                        <canvas id="mirrorDisplay" width="320" height="240"></canvas>
                        <div class="mirror-overlay" id="mirrorOverlay">Disconnected</div>
                    </div>
                    <!-- Hidden elements SerialMirror expects -->
                    <div style="display:none">
                        <span id="mirrorResolution">320×240</span>
                        <span id="mirrorFps">0</span>
                        <span id="mirrorFrameCount">0</span>
                        <span id="mirrorBaudRate">115200</span>
                        <div class="mirror-status-dot" id="mirrorStatusDot"></div>
                        <button id="mirrorConnectBtn"></button>
                        <button id="mirrorDisconnectBtn"></button>
                        <button id="mirrorSwapBtn"></button>
                        <button id="mirrorScreenshotBtn"></button>
                        <button id="mirrorScaleDown"></button>
                        <button id="mirrorScaleUp"></button>
                        <span id="mirrorScaleValue">1x</span>
                        <select id="mirrorBaudSelect"><option value="115200">115200</option></select>
                        <div id="mirror8BitNote"></div>
                    </div>
                </div>
            `;

            // Try to use serial-mirror.js if available
            if (typeof SerialMirror === 'function') {
                try {
                    flasherMirrorInstance = new SerialMirror(mirrorRoot);
                    if (normalSerialPort && flasherMirrorInstance) {
                        flasherMirrorInstance.port = normalSerialPort;
                        flasherMirrorInstance.writer = normalSerialPort.writable.getWriter();
                        flasherMirrorInstance.reader = normalSerialPort.readable.getReader();
                        flasherMirrorInstance.connected = true;
                        flasherMirrorInstance.running = true;
                        flasherMirrorInstance.updateConnectionUI();
                        flasherMirrorInstance.updateBaudDisplay(115200);
                        await flasherMirrorInstance.sendCommand('mirror on');
                        flasherMirrorInstance.readLoop();
                    }
                    screenDisplay.classList.add('visible');
                    if (insights) insights.classList.add('visible');
                    espLoaderTerminal.writeLine("Screen mirror initialized");
                } catch (e) {
                    espLoaderTerminal.writeLine(`Screen mirror init error: ${e.message}`);
                }
            } else {
                espLoaderTerminal.writeLine("Screen mirror library not loaded");
            }
        }

        async function stopFlasherMirror() {
            if (!flasherMirrorInstance) return;

            try {
                flasherMirrorInstance.running = false;
                try { await flasherMirrorInstance.sendCommand('mirror off'); } catch (_) { }
                if (flasherMirrorInstance.reader) {
                    try { await flasherMirrorInstance.reader.cancel(); } catch (_) { }
                    try { flasherMirrorInstance.reader.releaseLock(); } catch (_) { }
                    flasherMirrorInstance.reader = null;
                }
                if (flasherMirrorInstance.writer) {
                    try { flasherMirrorInstance.writer.releaseLock(); } catch (_) { }
                    flasherMirrorInstance.writer = null;
                }
                if (flasherMirrorInstance.resizeObserver) {
                    flasherMirrorInstance.resizeObserver.disconnect();
                    flasherMirrorInstance.resizeObserver = null;
                }
                if (flasherMirrorInstance.fpsInterval) {
                    clearInterval(flasherMirrorInstance.fpsInterval);
                    flasherMirrorInstance.fpsInterval = null;
                }
            } finally {
                flasherMirrorInstance = null;
            }
        }

        const continueToStep2Btn = getElementById('continueToStep2');
        const backToStep1Btn = getElementById('backToStep1');
        const continueToStep3Btn = getElementById('continueToStep3');
        const backToStep2Btn = getElementById('backToStep2');
        const startOverBtn = getElementById('startOver');
        let connectBtn = getElementById('connectBtn');
        let disconnectBtn = getElementById('disconnectBtn');
        let flashBtn = getElementById('flashBtn');
        let eraseBtn = getElementById('eraseBtn');
        let resetBtn = getElementById('resetBtn');
        const terminalElem = getElementById('terminal');
        const terminalToggleBtn = getElementById('terminalToggle');
        const chipInfoElem = getElementById('chipInfo');
        const detectedChipInfoElem = getElementById('detectedChipInfo');
        const detectedChipModelElem = getElementById('detectedChipModel');
        const chipMismatchWarningElem = getElementById('chipMismatchWarning');
        const flashProgressElem = getElementById('flashProgress');
        const flashSummaryElem = getElementById('flashSummary');
        const flashETAElem = getElementById('flashETA');
        const globalStatusElem = getElementById('globalStatus');
        const choiceDownloadCard = getElementById('choiceDownload');
        const choiceManualCard = getElementById('choiceManual');
        const downloadOptionsContainer = getElementById('downloadOptionsContainer');
        const manualUploadContainer = getElementById('manualUploadContainer');
        
        const releaseToggle = getElementById('releaseToggle');
        const ghostEspVariantSelect = getElementById('ghostEspVariantSelect');
        const ghostEspStatusElem = getElementById('ghostEspStatus');
        const baudrateSelect = getElementById('baudrate');
        const flashModeSelect = getElementById('flashMode');
        const flashFreqSelect = getElementById('flashFreq');
        const flashSizeSelect = getElementById('flashSize');
        const resetMethodSelect = getElementById('resetMethod');
        const eraseAllCheckbox = getElementById('eraseAll');
        const binaryTypeButtons = document.querySelectorAll('[data-binary]');

        const step3Pairs = [
            ['flashMode', 'flashMode3'],
            ['flashFreq', 'flashFreq3'],
            ['flashSize', 'flashSize3'],
            ['baudrate', 'baudrate3'],
            ['resetMethod', 'resetMethod3'],
        ];
        step3Pairs.forEach(([s2, s3]) => {
            const el2 = getElementById(s2);
            const el3 = getElementById(s3);
            if (el2 && el3) {
                el3.value = el2.value;
                el2.addEventListener('change', () => {
                    el3.value = el2.value;
                    updateFlashSummary();
                });
                el3.addEventListener('change', () => {
                    el2.value = el3.value;
                    updateFlashSummary();
                });
            }
        });
        const eraseAll3 = getElementById('eraseAll3');
        if (eraseAllCheckbox && eraseAll3) {
            eraseAll3.checked = eraseAllCheckbox.checked;
            eraseAllCheckbox.addEventListener('change', () => {
                eraseAll3.checked = eraseAllCheckbox.checked;
                updateFlashSummary();
            });
            eraseAll3.addEventListener('change', () => {
                eraseAllCheckbox.checked = eraseAll3.checked;
                updateFlashSummary();
            });
        }
        const appFirmwareSection = getElementById('appFirmware');
        const bootloaderFirmwareSection = getElementById('bootloaderFirmware');
        const partitionFirmwareSection = getElementById('partitionFirmware');
        const appFileInput = getElementById('appFile');
        const bootloaderFileInput = getElementById('bootloaderFile');
        const partitionFileInput = getElementById('partitionFile');
        const appFileInfoElem = getElementById('appFileInfo');
        const bootloaderFileInfoElem = getElementById('bootloaderFileInfo');
        const partitionFileInfoElem = getElementById('partitionFileInfo');
        const appAddressInput = getElementById('appAddress');
        const bootloaderAddressInput = getElementById('bootloaderAddress');
        const partitionAddressInput = getElementById('partitionAddress');

        let espLoader = null;
        let transport = null;
        let normalSerialPort = null;
        let normalSerialReader = null;
        let normalSerialWriter = null;
        let connected = false;
        let chipType = '';
        let lastDetectedChipModel = '';
        let selectedDevice = null;
        let selectedBrand = null;
        let selectedSide = '';
        let currentStep = 1;
        let extractedGhostEspFiles = null;
        let selectedFirmwareMethod = null;
        let ghostEspReleaseType = 'stable';
        let selectedDeviceMethod = 'chip';
        let inBootloaderMode = false;
        let detectedBuildTemplate = null;
        
        let ghostEspStableReleases = null;
        let ghostEspPrereleases = null;
        let ghostEspPopulateRequestId = 0;

        if (appFileInfoElem) appFileInfoElem.textContent = 'No file selected';
        if (bootloaderFileInfoElem) bootloaderFileInfoElem.textContent = 'No file selected';
        if (partitionFileInfoElem) partitionFileInfoElem.textContent = 'No file selected';

        let espLoaderTerminal = {
            clean() {
                if (terminalElem) terminalElem.innerHTML = '';
            },
            writeLine(data) {
                if (terminalElem) {
                    terminalElem.innerHTML += data + '\n';
                    terminalElem.scrollTop = terminalElem.scrollHeight;
                }
                console.log(data);
            },
            write(data) {
                if (terminalElem) {
                    terminalElem.innerHTML += data;
                    terminalElem.scrollTop = terminalElem.scrollHeight;
                }
                console.log(data);
            }
        };

        const deviceOptions = {
            'ESP32': {
                filters: [
                    { usbVendorId: 0x0403, usbProductId: 0x6010 },
                    { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
                    { usbVendorId: 0x1A86, usbProductId: 0x7523 },
                    { usbVendorId: 0x0403, usbProductId: 0x6001 },
                    { usbVendorId: 0x303A, usbProductId: 0x1011 },
                    { usbVendorId: 0x1A86, usbProductId: 0x55D4 }
                ],
                defaultFlashMode: 'dio',
                defaultFlashFreq: '40m',
                defaultFlashSize: '4MB',
                appAddress: '0x10000',
                bootloaderAddress: '0x1000',
                partitionAddress: '0x8000'
            },
            'ESP32-S2': {
                filters: [
                    { usbVendorId: 0x303A, usbProductId: 0x0002 },
                    { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
                    { usbVendorId: 0x0403, usbProductId: 0x6001 },
                    { usbVendorId: 0x303A, usbProductId: 0x1011 },
                    { usbVendorId: 0x1A86, usbProductId: 0x55D4 }
                ],
                defaultFlashMode: 'dio',
                defaultFlashFreq: '80m',
                defaultFlashSize: '4MB',
                appAddress: '0x10000',
                bootloaderAddress: '0x1000',
                partitionAddress: '0x8000'
            },
            'ESP32-S3': {
                filters: [
                    { usbVendorId: 0x303A, usbProductId: 0x1001 },
                    { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
                    { usbVendorId: 0x0403, usbProductId: 0x6001 },
                    { usbVendorId: 0x303A, usbProductId: 0x1011 },
                    { usbVendorId: 0x1A86, usbProductId: 0x55D4 }
                ],
                defaultFlashMode: 'dio',
                defaultFlashFreq: '80m',
                defaultFlashSize: '8MB',
                appAddress: '0x10000',
                bootloaderAddress: '0x0',
                partitionAddress: '0x8000'
            },
            'ESP32-C3': {
                filters: [
                    { usbVendorId: 0x303A, usbProductId: 0x0005 },
                    { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
                    { usbVendorId: 0x0403, usbProductId: 0x6001 },
                    { usbVendorId: 0x303A, usbProductId: 0x1011 },
                    { usbVendorId: 0x1A86, usbProductId: 0x55D4 }
                ],
                defaultFlashMode: 'dio',
                defaultFlashFreq: '40m',
                defaultFlashSize: '4MB',
                appAddress: '0x10000',
                bootloaderAddress: '0x0',
                partitionAddress: '0x8000'
            },
            'ESP32-C6': {
                filters: [
                    { usbVendorId: 0x303A, usbProductId: 0x1001 },
                    { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
                    { usbVendorId: 0x0403, usbProductId: 0x6001 },
                    { usbVendorId: 0x303A, usbProductId: 0x1011 },
                    { usbVendorId: 0x1A86, usbProductId: 0x55D4 }
                ],
                defaultFlashMode: 'dio',
                defaultFlashFreq: '80m',
                defaultFlashSize: '4MB',
                appAddress: '0x10000',
                bootloaderAddress: '0x0',
                partitionAddress: '0x8000'
            },
            'ESP32-C5': {
                filters: [
                    { usbVendorId: 0x303A, usbProductId: 0x1001 },
                    { usbVendorId: 0x10C4, usbProductId: 0xEA60 },
                    { usbVendorId: 0x0403, usbProductId: 0x6001 },
                    { usbVendorId: 0x303A, usbProductId: 0x1011 },
                    { usbVendorId: 0x1A86, usbProductId: 0x55D4 }
                ],
                defaultFlashMode: 'dio',
                defaultFlashFreq: '80m',
                defaultFlashSize: '4MB',
                appAddress: '0x10000',
                bootloaderAddress: '0x2000',
                partitionAddress: '0x8000'
            }
        };

        const GHOST_ESP_OWNER = 'GhostESP-Revival';
        const GHOST_ESP_REPO = 'GhostESP';
        

        const ghostEspNiceNames = {
            "esp32-generic.zip": "Generic ESP32",
            "esp32s2-generic.zip": "Generic ESP32-S2",
            "esp32s3-generic.zip": "Generic ESP32-S3",
            "esp32c3-generic.zip": "Generic ESP32-C3",
            "esp32c6-generic.zip": "Generic ESP32-C6",
            "esp32c5-generic.zip": "Generic ESP32-C5",
            "esp32c5-generic-v01.zip": "Generic ESP32-C5 v01",
            "esp32v5_awok.zip": "Awok V5",
            "ACE_C5.zip": "ACE C5",
            "ACE_S3.zip": "ACE S3",
            "ghostboard.zip": "Rabbit Labs' GhostBoard",
            "MarauderV4_FlipperHub.zip": "Marauder V4 / FlipperHub",
            "MarauderV6_AwokDual.zip": "Marauder V6 / Awok Dual",
            "AwokMini.zip": "Awok Mini",
            "ESP32-S3-Cardputer.zip": "M5Stack Cardputer",
            "HeltecV3.zip": "Heltec V3",
            "CYD2USB.zip": "CYD2USB",
            "CYDMicroUSB.zip": "CYD MicroUSB",
            "CYDDualUSB.zip": "CYD Dual USB",
            "CYD2USB2.4Inch.zip": "CYD 2.4 Inch USB",
            "CYD2USB2.4Inch_C.zip": "CYD 2.4 Inch USB-C",
            "NM-CYD-C5.zip": "NM-CYD-C5",
            "CYD2432S028R.zip": "CYD2432S028R",
            "Waveshare_LCD.zip": "Waveshare 7\" LCD",
            "Crowtech_LCD.zip": "Crowtech 7\" LCD",
            "Sunton_LCD.zip": "Sunton 7\" LCD",
            "JC3248W535EN_LCD.zip": "JC3248W535EN LCD",
            "Flipper_JCMK_GPS.zip": "Flipper Dev-Board w/ JCMK GPS",
            "LilyGo-T-Deck.zip": "LilyGo T-Deck",
            "LilyGo-TEmbedC1101.zip": "LilyGo TEmbedC1101",
            "LilyGo-S3TWatch-2020.zip": "LilyGo S3 T-Watch 2020",
            "LilyGo-TDisplayS3-Touch.zip": "LilyGo TDisplay S3 Touch",
            "RabbitLabs_Minion.zip": "Rabbit Labs' Minion",
            "JCMK_DevBoardPro.zip": "JCMK DevBoard Pro",
            "CardputerADV.zip": "Cardputer ADV",
            "Lolin_S3_Pro.zip": "Lolin S3 Pro",
            "Poltergeist.zip": "Rabbit-Labs Poltergeist",
            "Banshee_C5.zip": "The Wired Hatter's Banshee C5",
            "Banshee_S3.zip": "The Wired Hatter's Banshee S3",
            "XIAO_S3_Sense.zip": "Seeed XIAO S3 Sense",
            "XIAO_C5.zip": "Seeed XIAO C5",
            "XIAO_S3.zip": "Seeed XIAO S3"
        };

        const ghostEspChipMapping = {
            "esp32": "ESP32",
            "esp32s2": "ESP32-S2",
            "esp32s3": "ESP32-S3",
            "esp32c3": "ESP32-C3",
            "esp32c6": "ESP32-C6",
            "esp32c5": "ESP32-C5"
        };

        // Brand to firmware build mapping for filtering
        const brandToFirmware = {
            "TheWiredHatters": ["esp32-generic.zip", "MarauderV4_FlipperHub.zip", "Banshee_C5.zip", "Banshee_S3.zip"],
            "RabbitLabs": ["ghostboard.zip", "RabbitLabs_Minion.zip", "Poltergeist.zip"],
            "Generic": ["esp32-generic.zip", "esp32s2-generic.zip", "esp32s3-generic.zip", "esp32c3-generic.zip", "esp32c6-generic.zip", "esp32c5-generic.zip", "esp32c5-generic-v01.zip"],
            "M5Stack": ["ESP32-S3-Cardputer.zip", "CardputerADV.zip"],
            "CYD": ["CYD2USB.zip", "CYDMicroUSB.zip", "CYDDualUSB.zip", "CYD2USB2.4Inch.zip", "CYD2USB2.4Inch_C.zip", "NM-CYD-C5.zip", "CYD2432S028R.zip"],
            "LilyGo": ["LilyGo-T-Deck.zip", "LilyGo-TEmbedC1101.zip", "LilyGo-S3TWatch-2020.zip", "LilyGo-TDisplayS3-Touch.zip"],
            "Awok": ["AwokMini.zip", "MarauderV4_FlipperHub.zip", "MarauderV6_AwokDual.zip"],
            "Heltec": ["HeltecV3.zip"],
            "Waveshare": ["Waveshare_LCD.zip"],
            "JCMK": ["JCMK_DevBoardPro.zip", "Flipper_JCMK_GPS.zip", "MarauderV4_FlipperHub.zip", "MarauderV6_AwokDual.zip"],
            "Seeed": ["XIAO_S3_Sense.zip", "XIAO_C5.zip", "XIAO_S3.zip"]
        };

        // Generic builds that should always show
        const genericBuilds = ["esp32-generic.zip", "esp32s2-generic.zip", "esp32s3-generic.zip", "esp32c3-generic.zip", "esp32c6-generic.zip", "esp32c5-generic.zip", "esp32c5-generic-v01.zip"];

        const buildTemplateToZip = {
            "ace_c5": "ACE_C5.zip",
            "ace_s3": "ACE_S3.zip",
            "unknown_board": "CYD2432S028R.zip",
            "cyd2usb": "CYD2USB.zip",
            "cyd2usb2.4inch": "CYD2USB2.4Inch.zip",
            "cyd2usb2.4inch_c_varient": "CYD2USB2.4Inch_C.zip",
            "nm-cyd-c5": "NM-CYD-C5.zip",
            "cyddualusb": "CYDDualUSB.zip",
            "cydmicrousb": "CYDMicroUSB.zip",
            "jc3248w535en": "JC3248W535EN_LCD.zip",
            "jcmk_devboardpro": "JCMK_DevBoardPro.zip",
            "jcmk devboard pro": "JCMK_DevBoardPro.zip",
            "s3twatch": "LilyGo-S3TWatch-2020.zip",
            "tdisplays3-touch": "LilyGo-TDisplayS3-Touch.zip",
            "lilygo t-display s3": "LilyGo-TDisplayS3-Touch.zip",
            "tembedc1101": "LilyGo-TEmbedC1101.zip",
            "lilygo tembedc1101": "LilyGo-TEmbedC1101.zip",
            "awokmini": "AwokMini.zip",
            "cardputer": "ESP32-S3-Cardputer.zip",
            "cardputeradv": "CardputerADV.zip",
            "cardputer adv": "CardputerADV.zip",
            "crowtech7inch": "Crowtech_LCD.zip",
            "default.esp32": "esp32-generic.zip",
            "default.esp32c3": "esp32c3-generic.zip",
            "default.esp32c5": "esp32c5-generic.zip",
            "default.esp32c6": "esp32c6-generic.zip",
            "default.esp32s2": "esp32s2-generic.zip",
            "default.esp32s3": "esp32s3-generic.zip",
            "flipper.jcmk_gps": "Flipper_JCMK_GPS.zip",
            "ghostboard": "ghostboard.zip",
            "heltec wifi kit 32 v3": "HeltecV3.zip",
            "heltecv3": "HeltecV3.zip",
            "lolins3pro": "Lolin_S3_Pro.zip",
            "marauderv4": "MarauderV4_FlipperHub.zip",
            "marauderv6": "MarauderV6_AwokDual.zip",
            "minion": "RabbitLabs_Minion.zip",
            "poltergeist": "Poltergeist.zip",
            "somethingsomething": "Banshee_C5.zip",
            "somethingsomething2": "Banshee_S3.zip",
            "sunton7inch": "Sunton_LCD.zip",
            "tdeck": "LilyGo-T-Deck.zip",
            "waveshare7inch": "Waveshare_LCD.zip",
            "xiao_esp32c5": "XIAO_C5.zip",
            "xiao_esp32s3": "XIAO_S3.zip",
            "xiao_esp32s3_sense": "XIAO_S3_Sense.zip"
        };

        function normalizeBuildTemplate(value) {
            const cleaned = (value || '')
                .toLowerCase()
                .replace(/^sdkconfig\./, '')
                .replace(/^config_build_config_template\s*[=:]\s*/i, '')
                .replace(/,.*$/, '')
                .replace(/\s+/g, ' ')
                .trim();

            return cleaned.replace(/^"|"$/g, '');
        }

        function inferDeviceFromChipModel(model) {
            const compact = (model || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (compact.includes('ESP32S3')) return 'ESP32-S3';
            if (compact.includes('ESP32S2')) return 'ESP32-S2';
            if (compact.includes('ESP32C6')) return 'ESP32-C6';
            if (compact.includes('ESP32C5')) return 'ESP32-C5';
            if (compact.includes('ESP32C3')) return 'ESP32-C3';
            if (compact.includes('ESP32')) return 'ESP32';
            return null;
        }

        function applyBuildTemplateMatch() {
            if (!detectedBuildTemplate || !ghostEspVariantSelect) return false;

            const templateKey = normalizeBuildTemplate(detectedBuildTemplate);
            const targetZip = buildTemplateToZip[templateKey];
            console.log('[Flasher] build template match:', {
                detectedBuildTemplate,
                templateKey,
                targetZip
            });
            if (!targetZip) {
                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = `Detected build template: ${detectedBuildTemplate}`;
                    ghostEspStatusElem.className = 'form-text text-muted mt-2';
                }
                return false;
            }

            const options = Array.from(ghostEspVariantSelect.options);
            const matchedOption = options.find(option => option.dataset.assetName === targetZip) ||
                options.find(option => (option.textContent || '').toLowerCase().includes(targetZip.replace(/\.zip$/i, '').toLowerCase()));
            console.log('[Flasher] build options:', options.map(option => ({
                text: option.textContent,
                asset: option.dataset.assetName,
                selected: option.selected
            })));
            if (!matchedOption) {
                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = `Detected ${detectedBuildTemplate}, but ${targetZip} is not available in this release/channel.`;
                    ghostEspStatusElem.className = 'form-text text-warning mt-2 loading';
                }
                return false;
            }

            if (ghostEspVariantSelect.value !== matchedOption.value) {
                ghostEspVariantSelect.value = matchedOption.value;
                loadGhostEspZip(matchedOption.value);
            }

            if (ghostEspStatusElem) {
                ghostEspStatusElem.textContent = `Auto-selected ${matchedOption.textContent} from build template: ${detectedBuildTemplate}`;
                ghostEspStatusElem.className = 'form-text text-success mt-2 success';
            }
            espLoaderTerminal.writeLine(`Matched build template ${detectedBuildTemplate} to ${targetZip}`);
            return true;
        }

        const ghostEspZipToTarget = {
            "esp32-generic.zip": "esp32",
            "esp32s2-generic.zip": "esp32s2",
            "esp32s3-generic.zip": "esp32s3",
            "esp32c3-generic.zip": "esp32c3",
            "esp32c5-generic.zip": "esp32c5",
            "esp32c5-generic-v01.zip": "esp32c5",
            "esp32c6-generic.zip": "esp32c6",
            "esp32v5_awok.zip": "esp32s2",
            "ACE_C5.zip": "esp32c5",
            "ACE_S3.zip": "esp32s3",
            "ghostboard.zip": "esp32c6",
            "MarauderV4_FlipperHub.zip": "esp32",
            "MarauderV6_AwokDual.zip": "esp32",
            "AwokMini.zip": "esp32s2",
            "ESP32-S3-Cardputer.zip": "esp32s3",
            "HeltecV3.zip": "esp32s3",
            "CYD2USB.zip": "esp32",
            "CYDMicroUSB.zip": "esp32",
            "CYDDualUSB.zip": "esp32",
            "CYD2USB2.4Inch.zip": "esp32",
            "CYD2USB2.4Inch_C.zip": "esp32",
            "NM-CYD-C5.zip": "esp32c5",
            "CYD2432S028R.zip": "esp32",
            "Waveshare_LCD.zip": "esp32s3",
            "Crowtech_LCD.zip": "esp32s3",
            "Sunton_LCD.zip": "esp32s3",
            "JC3248W535EN_LCD.zip": "esp32s3",
            "Flipper_JCMK_GPS.zip": "esp32s2",
            "LilyGo-T-Deck.zip": "esp32s3",
            "LilyGo-TEmbedC1101.zip": "esp32s3",
            "LilyGo-S3TWatch-2020.zip": "esp32s3",
            "LilyGo-TDisplayS3-Touch.zip": "esp32s3",
            "JCMK_DevBoardPro.zip": "esp32",
            "RabbitLabs_Minion.zip": "esp32",
            "CardputerADV.zip": "esp32s3",
            "Lolin_S3_Pro.zip": "esp32s3",
            "Poltergeist.zip": "esp32c5",
            "Banshee_C5.zip": "esp32c5",
            "Banshee_S3.zip": "esp32s3",
            "XIAO_S3_Sense.zip": "esp32s3",
            "XIAO_C5.zip": "esp32c5",
            "XIAO_S3.zip": "esp32s3"
        };

        // --- Event Listeners: Step Navigation ---
        if (continueToStep2Btn) {
            continueToStep2Btn.addEventListener('click', () => {
                if (connected || selectedDevice) {
                    goToStep(2);
                    if (selectedFirmwareMethod === 'download') {
                        populateGhostEspDropdown(GHOST_ESP_OWNER, GHOST_ESP_REPO, '.zip', selectedDevice, selectedBrand)
                            .catch(err => console.error('Error populating GhostESP dropdown:', err));
                    }
                } else {
                    espLoaderTerminal.writeLine("Please connect a device or choose a manual filter first");
                }
            });
        }

        if (backToStep1Btn) {
            backToStep1Btn.addEventListener('click', () => goToStep(1));
        }

        if (continueToStep3Btn) {
            continueToStep3Btn.addEventListener('click', () => {
                if (connected) {
                    updateFlashSummary();
                    goToStep(3);
                } else {
                    espLoaderTerminal.writeLine("Please connect to a device first");
                }
            });
        }

        if (backToStep2Btn) {
            backToStep2Btn.addEventListener('click', () => goToStep(2));
        }

        if (startOverBtn) {
            startOverBtn.addEventListener('click', () => {
                clearExtractedData();
                clearManualInputs();
                if (connected) {
                    disconnect().then(() => goToStep(1));
                } else {
                    goToStep(1);
                }
            });
        }

        // --- Event Listeners: Device Method Toggle (Chip vs Brand) ---
        const methodCards = document.querySelectorAll('#deviceMethodToggle .flasher-toggle-btn');
        const chipSelectionContainer = getElementById('chipSelectionContainer');
        const brandSelectionContainer = getElementById('brandSelectionContainer');

        methodCards.forEach(card => {
            card.addEventListener('click', () => {
                methodCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedDeviceMethod = card.dataset.method;
                
                // Clear previous selection when switching methods
                document.querySelectorAll('.flasher-device-card').forEach(c => c.classList.remove('selected'));
                selectedDevice = null;
                selectedBrand = null;
                if (continueToStep2Btn) continueToStep2Btn.disabled = !connected;
                
                if (selectedDeviceMethod === 'chip') {
                    if (chipSelectionContainer) chipSelectionContainer.classList.remove('d-none');
                    if (brandSelectionContainer) brandSelectionContainer.classList.add('d-none');
                    espLoaderTerminal.writeLine('Switched to chip model selection');
                } else {
                    if (chipSelectionContainer) chipSelectionContainer.classList.add('d-none');
                    if (brandSelectionContainer) brandSelectionContainer.classList.remove('d-none');
                    espLoaderTerminal.writeLine('Switched to board brand selection');
                }
            });
        });

        // --- Event Listeners: Device Cards ---
        const deviceCards = document.querySelectorAll('.flasher-device-card');
        deviceCards.forEach(card => {
            card.addEventListener('click', () => {
                // Only deselect cards within the same container
                const container = card.parentElement;
                container.querySelectorAll('.flasher-device-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedDevice = card.dataset.device;
                selectedBrand = card.dataset.brand || null;
                selectedSide = selectedBrand ? `${selectedBrand} (${selectedDevice})` : selectedDevice;
                espLoaderTerminal.writeLine(`Selected: ${selectedSide}`);
                updateDefaultAddresses();
                if (continueToStep2Btn) continueToStep2Btn.disabled = false;
                if (selectedFirmwareMethod === 'download') {
                    populateGhostEspDropdown(GHOST_ESP_OWNER, GHOST_ESP_REPO, '.zip', selectedDevice, selectedBrand)
                        .catch(err => console.error('Error repopulating GhostESP after device change:', err));
                }
                if (connected && lastDetectedChipModel) {
                    checkChipMismatch(lastDetectedChipModel);
                }
            });
        });

        // --- Event Listeners: Connect / Disconnect ---
        if (connectBtn) connectBtn.addEventListener('click', connect);
        if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);

        // --- Event Listeners: Flash / Erase / Reset ---
        if (flashBtn) flashBtn.addEventListener('click', flash);
        if (eraseBtn) eraseBtn.addEventListener('click', eraseFlash);
        if (resetBtn) resetBtn.addEventListener('click', resetDevice);

        // --- Event Listeners: Firmware Method Choice ---
        if (choiceDownloadCard) {
            choiceDownloadCard.addEventListener('click', () => {
                selectFirmwareMethod('download');
            });
        }
        if (choiceManualCard) {
            choiceManualCard.addEventListener('click', () => {
                selectFirmwareMethod('manual');
            });
        }



        // --- Event Listeners: GhostESP Release Toggle (Stable / Prerelease) ---
        if (releaseToggle) {
            const releaseBtns = releaseToggle.querySelectorAll('[data-release]');
            releaseBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const releaseType = btn.getAttribute('data-release');
                    releaseBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    ghostEspReleaseType = releaseType;
                    if (ghostEspVariantSelect) ghostEspVariantSelect.selectedIndex = 0;
                    clearExtractedData();
                    if (downloadOptionsContainer && !downloadOptionsContainer.classList.contains('d-none')) {
                        populateGhostEspDropdown(GHOST_ESP_OWNER, GHOST_ESP_REPO, '.zip', selectedDevice, selectedBrand)
                            .catch(err => console.error('Error repopulating GhostESP after release toggle:', err));
                    }
                });
            });
        }

        // --- Event Listeners: GhostESP Variant Select ---
        if (ghostEspVariantSelect) {
            ghostEspVariantSelect.addEventListener('change', () => {
                loadGhostEspZip(ghostEspVariantSelect.value);
            });
        }

        // --- Event Listeners: Binary Type Toggle ---
        if (binaryTypeButtons && binaryTypeButtons.length > 0) {
            binaryTypeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    binaryTypeButtons.forEach(btn => btn.classList.remove('active'));
                    if (appFirmwareSection) appFirmwareSection.classList.add('d-none');
                    if (bootloaderFirmwareSection) bootloaderFirmwareSection.classList.add('d-none');
                    if (partitionFirmwareSection) partitionFirmwareSection.classList.add('d-none');
                    button.classList.add('active');
                    const binaryType = button.dataset.binary;
                    if (binaryType === 'app' && appFirmwareSection) {
                        appFirmwareSection.classList.remove('d-none');
                    } else if (binaryType === 'bootloader' && bootloaderFirmwareSection) {
                        bootloaderFirmwareSection.classList.remove('d-none');
                    } else if (binaryType === 'partition' && partitionFirmwareSection) {
                        partitionFirmwareSection.classList.remove('d-none');
                    }
                });
            });
        }

        // --- Event Listeners: Terminal Toggle ---
        if (terminalToggleBtn && terminalElem) {
            terminalToggleBtn.addEventListener('click', () => {
                terminalElem.classList.toggle('open');
                const isHidden = terminalElem.classList.contains('d-none');
                const icon = terminalToggleBtn.querySelector('i');
                if (icon) {
                    icon.className = isHidden ? 'bi bi-terminal' : 'bi bi-terminal-fill';
                }
            });
        }

        // --- Event Listeners: Stuck / Help Buttons ---
        const stuckButtons = document.querySelectorAll('.stuck-button');
        stuckButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const step = button.dataset.step;
                const modalId = `stuckModalStep${step}`;
                const modalElement = document.getElementById(modalId);
                if (modalElement && bootstrap && bootstrap.Modal) {
                    try {
                        const modalInstance = new bootstrap.Modal(modalElement);
                        modalInstance.show();
                    } catch (e) {
                        console.error('Error showing help modal:', e);
                        espLoaderTerminal.writeLine(`Error showing help: ${e.message}`);
                    }
                } else {
                    espLoaderTerminal.writeLine(`Could not open help for step ${step}`);
                }
            });
        });

        // --- Core Functions ---

        function goToStep(step) {
            for (let i = 1; i <= 3; i++) {
                const container = document.getElementById(`step${i}`);
                const stepper = document.getElementById(`stepper${i}`);
                if (container) container.classList.remove('active');
                if (stepper) {
                    stepper.classList.remove('active');
                    stepper.classList.remove('completed');
                }
            }
            const targetContainer = document.getElementById(`step${step}`);
            if (targetContainer) targetContainer.classList.add('active');
            for (let i = 1; i <= 3; i++) {
                const stepper = document.getElementById(`stepper${i}`);
                if (stepper) {
                    if (i < step) {
                        stepper.classList.add('completed');
                    } else if (i === step) {
                        stepper.classList.add('active');
                    }
                }
            }
            currentStep = step;
            updateButtonStates();
        }

        function updateDefaultAddresses() {
            if (selectedDevice && deviceOptions[selectedDevice]) {
                const options = deviceOptions[selectedDevice];
                if (flashModeSelect) flashModeSelect.value = options.defaultFlashMode;
                if (flashFreqSelect) flashFreqSelect.value = options.defaultFlashFreq;
                if (flashSizeSelect) flashSizeSelect.value = options.defaultFlashSize;
                if (appAddressInput) appAddressInput.value = options.appAddress;
                if (bootloaderAddressInput) bootloaderAddressInput.value = options.bootloaderAddress;
                if (partitionAddressInput) partitionAddressInput.value = options.partitionAddress;
            }
        }

        async function connect() {
            if (connectBtn) connectBtn.disabled = true;

            try {
                espLoaderTerminal.writeLine(`Requesting WebSerial port. Select your device from the popup...`);

                // Connect in normal serial mode (not bootloader)
                normalSerialPort = await navigator.serial.requestPort();
                await normalSerialPort.open({ baudRate: 115200 });

                connected = true;
                inBootloaderMode = false;
                if (!selectedSide) selectedSide = selectedDevice || 'GhostESP device';
                
                espLoaderTerminal.writeLine(`Connected to ${selectedSide} in normal mode`);
                chipInfoElem.innerHTML = `<span class="status-indicator status-connected"></span> Connected to ${selectedSide} <span class="flasher-status-sub">— Detecting chip info...</span>`;
                updateStatusIndicator('success', 'Connected', `${selectedSide} (Normal Mode)`);
                updateButtonStates();

                // Fetch chipinfo from device
                let gotChipInfo = await fetchChipInfoNormal({ detectWrongBaud: true });

                if (gotChipInfo === 'wrong-baud') {
                    espLoaderTerminal.writeLine("Wrong baud rate detected, switching to 460800...");
                    if (chipInfoElem) {
                        const sub = chipInfoElem.querySelector('.flasher-status-sub');
                        if (sub) sub.textContent = '— Switching to 460800 baud...';
                    }
                    try {
                        await normalSerialPort.close();
                        await normalSerialPort.open({ baudRate: 460800 });
                        gotChipInfo = await fetchChipInfoNormal({ detectWrongBaud: false });
                        if (gotChipInfo === true) {
                            espLoaderTerminal.writeLine("Chip info received at 460800 baud");
                        } else if (gotChipInfo === 'got-response' || gotChipInfo === 'wrong-baud') {
                            espLoaderTerminal.writeLine("Connected at 460800 baud");
                        } else {
                            espLoaderTerminal.writeLine("No chip info response at 460800");
                            if (chipInfoElem) {
                                const sub = chipInfoElem.querySelector('.flasher-status-sub');
                                if (sub) sub.textContent = '— Chip info unavailable';
                            }
                        }
                    } catch (retryErr) {
                        espLoaderTerminal.writeLine(`Retry at 460800 failed: ${retryErr.message}`);
                        try {
                            await normalSerialPort.close();
                            await normalSerialPort.open({ baudRate: 115200 });
                        } catch (_) {}
                    }
                } else if (!gotChipInfo) {
                    espLoaderTerminal.writeLine("No response at 115200 baud, retrying at 460800...");
                    if (chipInfoElem) {
                        const sub = chipInfoElem.querySelector('.flasher-status-sub');
                        if (sub) sub.textContent = '— Retrying at 460800 baud...';
                    }
                    try {
                        await normalSerialPort.close();
                        await normalSerialPort.open({ baudRate: 460800 });
                        gotChipInfo = await fetchChipInfoNormal({ detectWrongBaud: false });
                        if (gotChipInfo === true) {
                            espLoaderTerminal.writeLine("Chip info received at 460800 baud");
                        } else {
                            espLoaderTerminal.writeLine("No chip info response at 460800 either");
                            if (chipInfoElem) {
                                const sub = chipInfoElem.querySelector('.flasher-status-sub');
                                if (sub) sub.textContent = '— Chip info unavailable';
                            }
                        }
                    } catch (retryErr) {
                        espLoaderTerminal.writeLine(`Retry at 460800 failed: ${retryErr.message}`);
                        try {
                            await normalSerialPort.close();
                            await normalSerialPort.open({ baudRate: 115200 });
                        } catch (_) {}
                    }
                }

                // Initialize screen mirror
                await initFlasherMirror();

                const mirrorWorking = screenDisplay && screenDisplay.classList.contains('visible');

                if (gotChipInfo === true || mirrorWorking) {
                    if (chipInfoElem) {
                        const sub = chipInfoElem.querySelector('.flasher-status-sub');
                        if (sub && gotChipInfo === true && mirrorWorking) {
                            sub.textContent = '— Mirror & chip info OK';
                        } else if (sub && gotChipInfo === true) {
                            sub.textContent = `— ${detectedBuildTemplate || 'Chip detected'}`;
                        } else if (sub) {
                            sub.textContent = '— Mirror active, no chip info';
                        }
                    }
                    if (continueToStep2Btn) continueToStep2Btn.disabled = false;
                    if (selectedFirmwareMethod === 'download') {
                        await populateGhostEspDropdown(GHOST_ESP_OWNER, GHOST_ESP_REPO, '.zip', selectedDevice, selectedBrand);
                    }
                    goToStep(2);
                } else {
                    if (chipInfoElem) {
                        chipInfoElem.innerHTML = `<span class="status-indicator status-connected"></span> Connected <span class="flasher-status-sub">— Couldn't detect device, select manually below</span>`;
                    }
                    espLoaderTerminal.writeLine("No chip info or screen mirror. Please select your device manually.");
                    if (connectBtn) connectBtn.disabled = false;
                }
            } catch (error) {
                console.error("Error during connection:", error);
                let userMessage = `Error: ${error.message}`;
                let chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Connection failed`;
                let statusTitle = 'Connection Failed';
                let statusDetails = `Error: ${error.message}`;
                const errorStr = error.message.toLowerCase();
                if (errorStr.includes("failed to connect") ||
                    errorStr.includes("timed out waiting for packet") ||
                    errorStr.includes("invalid head of packet") ||
                    errorStr.includes("no serial data received")) {
                    userMessage = `Connection failed. Ensure the device is in bootloader mode (hold BOOT, press RESET) and try again. (Error: ${error.message})`;
                    chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Failed: Check Bootloader Mode`;
                    statusTitle = 'Check Bootloader Mode';
                    statusDetails = 'Hold BOOT/FLASH, press RESET, then try connecting.';
                } else if (errorStr.includes("access denied") ||
                    errorStr.includes("port is already open") ||
                    errorStr.includes("failed to open serial port")) {
                    userMessage = `Error: Could not open serial port. Is it already open in another program? Close other connections and try again. (Error: ${error.message})`;
                    chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Failed: Port In Use?`;
                    statusTitle = 'Port Access Error';
                    statusDetails = 'Close other serial programs and retry.';
                } else if (errorStr.includes("the device has been lost")) {
                    userMessage = `Error: Device disconnected during connection attempt. Check cable and connection. (Error: ${error.message})`;
                    chipInfoMessage = `<span class="status-indicator status-disconnected"></span> Failed: Device Lost`;
                    statusTitle = 'Device Disconnected';
                    statusDetails = 'Check USB cable and connection.';
                }
                espLoaderTerminal.writeLine(userMessage);
                if (chipInfoElem) chipInfoElem.innerHTML = chipInfoMessage;
                if (connectBtn) connectBtn.disabled = false;
                connected = false;
                updateButtonStates();
                updateStatusIndicator('error', statusTitle, statusDetails);
            }
        }

        async function fetchChipInfoNormal({ detectWrongBaud = true } = {}) {
            if (!normalSerialPort?.readable || !normalSerialPort?.writable) return false;

            let reader = null;
            let writer = null;

            try {
                espLoaderTerminal.writeLine("Fetching chipinfo from device...");
                if (chipInfoElem) {
                    const sub = chipInfoElem.querySelector('.flasher-status-sub');
                    if (sub) sub.textContent = '— Requesting chip info...';
                }

                // Drain stale buffered data
                try {
                    const drainReader = normalSerialPort.readable.getReader();
                    const drainDeadline = Date.now() + 300;
                    while (Date.now() < drainDeadline) {
                        const { value, done } = await Promise.race([
                            drainReader.read(),
                            new Promise(resolve => setTimeout(() => resolve({ value: null, done: true }), 100))
                        ]);
                        if (done || !value) break;
                    }
                    drainReader.releaseLock();
                } catch (_) {}

                let response = '';
                const encoder = new TextEncoder();

                for (let attempt = 1; attempt <= 2; attempt++) {
                    response = '';
                    let rawBytes = 0;
                    let nonTextBytes = 0;

                    writer = normalSerialPort.writable.getWriter();
                    await writer.write(encoder.encode(`${attempt === 1 ? '\n' : ''}chipinfo\n`));
                    writer.releaseLock();
                    writer = null;

                    reader = normalSerialPort.readable.getReader();
                    const deadline = Date.now() + 5000;

                    while (Date.now() < deadline) {
                        const remaining = Math.max(50, deadline - Date.now());
                        const { value, done } = await Promise.race([
                            reader.read(),
                            new Promise(resolve => setTimeout(() => resolve({ value: null, done: true }), remaining))
                        ]);
                        if (done) break;
                        if (value) {
                            rawBytes += value.length;
                            let asciiChunk = '';
                            for (const byte of value) {
                                const isTextByte = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte === 0x1b;
                                if (!isTextByte) nonTextBytes++;
                                if (isTextByte) asciiChunk += String.fromCharCode(byte);
                            }
                            if (detectWrongBaud && rawBytes > 20 && nonTextBytes / rawBytes > 0.35) {
                                espLoaderTerminal.writeLine("Garbled response detected (baud rate mismatch)");
                                reader.releaseLock();
                                reader = null;
                                return 'wrong-baud';
                            }
                            response += asciiChunk.replace(/\x1b\[[0-9;]*m/g, '');
                            if (response.includes('[CHIPINFO_END]')) break;
                            const cleaned = response.replace(/[\x00-\x1f\x7f-\xff\uFFFD]/g, '').trim();
                            if (detectWrongBaud && rawBytes > 20 && cleaned.length < rawBytes * 0.3) {
                                espLoaderTerminal.writeLine("Garbled response detected (baud rate mismatch)");
                                reader.releaseLock();
                                reader = null;
                                return 'wrong-baud';
                            }
                        }
                    }
                    if (reader) { reader.releaseLock(); reader = null; }

                    if (response.includes('[CHIPINFO_END]')) break;
                    if (attempt < 2 && (/unsupported\s+command|unknown\s+command|not\s+recognized/i.test(response) || !response.includes('[CHIPINFO_START]'))) {
                        espLoaderTerminal.writeLine("Chipinfo response incomplete, retrying command...");
                        await new Promise(resolve => setTimeout(resolve, 250));
                    } else {
                        break;
                    }
                }

                if (response) {
                    console.log('[Flasher] chipinfo raw response:', response);
                    const parsed = parseChipInfo(response);
                    console.log('[Flasher] parsed chipinfo:', parsed);
                    if (Object.keys(parsed).length > 0) {
                        displayChipInfo(parsed);
                        espLoaderTerminal.writeLine("Chip info parsed successfully");
                        if (chipInfoElem) {
                            const sub = chipInfoElem.querySelector('.flasher-status-sub');
                            if (sub) sub.textContent = `— ${parsed.CHIP_MODEL || 'Chip detected'}`;
                        }
                        // Show detected chip model
                        lastDetectedChipModel = parsed.CHIP_MODEL || '';
                        if (detectedChipInfoElem) detectedChipInfoElem.style.display = 'flex';
                        if (detectedChipModelElem) detectedChipModelElem.textContent = lastDetectedChipModel || 'Unknown';
                        // Check for mismatch
                        checkChipMismatch(lastDetectedChipModel);
                        return true;
                    } else if (/unsupported\s+command|unknown\s+command|not\s+recognized/i.test(response)) {
                        espLoaderTerminal.writeLine("Device does not support chipinfo command");
                        if (chipInfoElem) {
                            const sub = chipInfoElem.querySelector('.flasher-status-sub');
                            if (sub) sub.textContent = '— chipinfo not supported by firmware';
                        }
                        return false;
                    } else {
                        espLoaderTerminal.writeLine("Could not parse chip info from response");
                        if (chipInfoElem) {
                            const sub = chipInfoElem.querySelector('.flasher-status-sub');
                            if (sub) sub.textContent = '— Chip info unavailable';
                        }
                        return response.trim().length > 0 ? 'got-response' : false;
                    }
                } else {
                    espLoaderTerminal.writeLine("No response to chipinfo command");
                    if (chipInfoElem) {
                        const sub = chipInfoElem.querySelector('.flasher-status-sub');
                        if (sub) sub.textContent = '— No chip info response';
                    }
                }
            } catch (error) {
                espLoaderTerminal.writeLine(`Error fetching chipinfo: ${error.message}`);
                if (chipInfoElem) {
                    const sub = chipInfoElem.querySelector('.flasher-status-sub');
                    if (sub) sub.textContent = '— Chip info failed';
                }
            } finally {
                try { if (reader) reader.releaseLock(); } catch (_) { }
                try { if (writer) writer.releaseLock(); } catch (_) { }
            }
            return false;
        }

        async function disconnect() {
            try {
                await stopFlasherMirror();

                // Clean up bootloader connection first because esptool owns the port there.
                if (transport && espLoader) {
                    await transport.disconnect();
                    transport = null;
                    espLoader = null;
                }

                // Clean up normal serial connection
                if (normalSerialReader) {
                    await normalSerialReader.cancel();
                    normalSerialReader.releaseLock();
                    normalSerialReader = null;
                }
                if (normalSerialWriter) {
                    normalSerialWriter.releaseLock();
                    normalSerialWriter = null;
                }
                if (normalSerialPort) {
                    try { await normalSerialPort.close(); } catch (_) { }
                    normalSerialPort = null;
                }
                
                espLoaderTerminal.writeLine("Disconnected from device");
                connected = false;
                inBootloaderMode = false;
                updateButtonStates();
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-disconnected"></span> Disconnected`;
                if (detectedChipInfoElem) detectedChipInfoElem.style.display = 'none';
                if (chipMismatchWarningElem) chipMismatchWarningElem.style.display = 'none';
                lastDetectedChipModel = '';
                if (continueToStep3Btn) continueToStep3Btn.disabled = true;
                clearChipInfoDisplay();
                
                return true;
            } catch (error) {
                console.error(error);
                espLoaderTerminal.writeLine(`Error disconnecting: ${error.message}`);
                connected = false;
                inBootloaderMode = false;
                updateButtonStates();
                return false;
            }
        }

        async function flash() {
            if (!connected) {
                espLoaderTerminal.writeLine("Not connected to a device");
                return;
            }
            if (!hasFirmwareFilesSelected()) {
                espLoaderTerminal.writeLine("Please select/load at least one firmware file");
                return;
            }

            if (flashETAElem) flashETAElem.textContent = '';
            const savedDevice = selectedDevice;
            const savedSide = selectedSide;

            if (flashBtn) flashBtn.disabled = true;
            if (eraseBtn) eraseBtn.disabled = true;
            if (disconnectBtn) disconnectBtn.disabled = true;
            if (resetBtn) resetBtn.disabled = true;

            let flashStartTime = null;

            try {
                espLoaderTerminal.writeLine("Preparing to flash...");
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Preparing Flash...`;
                updateStatusIndicator('flashing', 'Preparing flash...', '');

                // If in normal mode, switch to bootloader mode
                if (!inBootloaderMode) {
                    espLoaderTerminal.writeLine("Switching to bootloader mode...");

                    await stopFlasherMirror();

                    if (normalSerialReader) {
                        try { await normalSerialReader.cancel(); } catch (_) { }
                        try { normalSerialReader.releaseLock(); } catch (_) { }
                        normalSerialReader = null;
                    }
                    if (normalSerialWriter) {
                        try { normalSerialWriter.releaseLock(); } catch (_) { }
                        normalSerialWriter = null;
                    }
                    if (!normalSerialPort) {
                        throw new Error('Serial port unavailable. Reconnect the device and try again.');
                    }
                    try {
                        await normalSerialPort.close();
                    } catch (_) { }

                    await new Promise(resolve => setTimeout(resolve, 250));

                    transport = new window.esptoolJS.Transport(normalSerialPort);
                    espLoader = new window.esptoolJS.ESPLoader({
                        transport: transport,
                        baudrate: parseInt(baudrateSelect.value),
                        terminal: espLoaderTerminal,
                        enableTracing: true
                    });
                    chipType = await espLoader.main();
                    inBootloaderMode = true;
                    connected = true;
                    espLoaderTerminal.writeLine(`Connected in bootloader mode (${chipType})`);
                }

                let eraseSuccessful = true;
                if (eraseAllCheckbox && eraseAllCheckbox.checked) {
                    espLoaderTerminal.writeLine("Erase requested before flashing. This may take a moment...");
                    updateStatusIndicator('flashing', 'Erasing flash...', 'This may take a moment...');
                    try {
                        await eraseFlashInternal();
                    } catch (eraseError) {
                        espLoaderTerminal.writeLine(`Erase failed: ${eraseError.message}. Aborting flash operation.`);
                        if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-error"></span> Erase Failed`;
                        updateStatusIndicator('error', 'Erase Failed', eraseError.message);
                        eraseSuccessful = false;
                    }
                } else {
                    espLoaderTerminal.writeLine("Skipping erase step.");
                }

                if (!eraseSuccessful) {
                    updateButtonStates();
                    return;
                }

                espLoaderTerminal.writeLine("Processing firmware files...");
                updateStatusIndicator('flashing', 'Processing files...', '');

                const fileArray = [];
                const source = selectedFirmwareMethod === 'download' ? 'download' : 'manual';

                if (source === 'download' && extractedGhostEspFiles) {
                    espLoaderTerminal.writeLine("Using auto-loaded GhostESP files...");
                    for (const key in extractedGhostEspFiles) {
                        const fileInfo = extractedGhostEspFiles[key];
                        if (fileInfo.data) {
                            const flashAddress = parseInt(fileInfo.addressInput.value, 16);
                            const uint8Data = new Uint8Array(fileInfo.data);
                            let binaryString = '';
                            for (let i = 0; i < uint8Data.length; i++) {
                                binaryString += String.fromCharCode(uint8Data[i]);
                            }
                            fileArray.push({
                                data: binaryString,
                                address: flashAddress,
                                name: fileInfo.name,
                                type: fileInfo.type
                            });
                            espLoaderTerminal.writeLine(`Prepared ${fileInfo.name} for address 0x${flashAddress.toString(16)}`);
                        }
                    }
                } else {
                    espLoaderTerminal.writeLine("Using manually selected files...");
                    for (const [inputElem, addressInput, fileType] of [
                        [appFileInput, appAddressInput, 'Application'],
                        [bootloaderFileInput, bootloaderAddressInput, 'Bootloader'],
                        [partitionFileInput, partitionAddressInput, 'Partition']
                    ]) {
                        if (inputElem?.files?.length > 0) {
                            const file = inputElem.files[0];
                            const firmware = await file.arrayBuffer();
                            const flashAddress = parseInt(addressInput.value, 16);
                            const uint8Data = new Uint8Array(firmware);
                            let binaryString = '';
                            for (let i = 0; i < uint8Data.length; i++) {
                                binaryString += String.fromCharCode(uint8Data[i]);
                            }
                            fileArray.push({
                                data: binaryString,
                                address: flashAddress,
                                name: file.name,
                                type: fileType,
                                size: uint8Data.length
                            });
                            espLoaderTerminal.writeLine(`Prepared ${file.name} for address 0x${flashAddress.toString(16)}`);
                        }
                    }
                }

                if (fileArray.length === 0) {
                    espLoaderTerminal.writeLine("No firmware data found to flash.");
                    updateButtonStates();
                    return;
                }

                fileArray.sort((a, b) => a.address - b.address);

                chipType = espLoader.chip.CHIP_NAME;
                let correctBootloaderOffset = 0x1000;
                if (chipType.includes("ESP32-S3") ||
                    chipType.includes("ESP32-C3") ||
                    chipType.includes("ESP32-C6") ||
                    chipType.includes("ESP32-H2") ||
                    chipType.includes("ESP32-C2")) {
                    correctBootloaderOffset = 0x0;
                } else if (chipType.includes("ESP32-P4") || chipType.includes("ESP32-C5")) {
                    correctBootloaderOffset = 0x2000;
                }

                let offsetAdjusted = false;
                for (let i = 0; i < fileArray.length; i++) {
                    if (fileArray[i].type === 'Bootloader' &&
                        fileArray[i].address !== correctBootloaderOffset) {
                        espLoaderTerminal.writeLine(`WARNING: Bootloader address 0x${fileArray[i].address.toString(16)} does not match expected offset 0x${correctBootloaderOffset.toString(16)} for ${chipType}. Adjusting.`);
                        fileArray[i].address = correctBootloaderOffset;
                        offsetAdjusted = true;
                    }
                }
                if (offsetAdjusted) {
                    fileArray.sort((a, b) => a.address - b.address);
                    espLoaderTerminal.writeLine("Re-sorted files after bootloader address correction.");
                }

                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Flashing...`;
                updateStatusIndicator('flashing', 'Flashing firmware...', 'Do not disconnect');

                const formatTime = (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}m ${secs}s`;
                };

                const flashOptions = {
                    fileArray: fileArray.map(item => ({ data: item.data, address: item.address })),
                    flashSize: "keep",
                    flashMode: flashModeSelect ? flashModeSelect.value : 'dio',
                    flashFreq: flashFreqSelect ? flashFreqSelect.value : '40m',
                    eraseAll: false,
                    compress: true,
                    reportProgress: (fileIndex, written, total) => {
                        const percentage = Math.floor((written / total) * 100);
                        if (flashProgressElem) flashProgressElem.style.width = `${percentage}%`;
                        const fileName = fileArray[fileIndex] ? fileArray[fileIndex].name : `File ${fileIndex + 1}`;
                        espLoaderTerminal.writeLine(`Flashing ${fileName}: ${percentage}% (${written}/${total} bytes)`);

                        if (flashStartTime && written > 0 && flashETAElem) {
                            const currentTime = Date.now();
                            const elapsedTimeSeconds = (currentTime - flashStartTime) / 1000;
                            if (elapsedTimeSeconds > 1) {
                                const bytesPerSecond = written / elapsedTimeSeconds;
                                if (bytesPerSecond > 0) {
                                    const remainingBytes = total - written;
                                    const remainingSeconds = remainingBytes / bytesPerSecond;
                                    flashETAElem.textContent = `ETA: ${formatTime(remainingSeconds)}`;
                                } else {
                                    flashETAElem.textContent = 'ETA: Calculating...';
                                }
                            } else {
                                flashETAElem.textContent = 'ETA: Calculating...';
                            }
                        } else if (flashETAElem) {
                            flashETAElem.textContent = '';
                        }
                    },
                    calculateMD5Hash: calculateMd5Hash
                };

                let flashSuccess = false;
                let retryCount = 0;
                const maxRetries = 2;
                flashStartTime = Date.now();

                while (!flashSuccess && retryCount <= maxRetries) {
                    try {
                        espLoaderTerminal.writeLine(`Starting flash write operation${retryCount > 0 ? ` (attempt ${retryCount + 1})` : ''}...`);
                        await espLoader.writeFlash(flashOptions);
                        flashSuccess = true;
                        espLoaderTerminal.writeLine("\nFlash write complete!");
                    } catch (flashError) {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            espLoaderTerminal.writeLine(`\nFlash write attempt failed: ${flashError.message}. Retrying...`);
                            try {
                                await espLoader.sync();
                            } catch (e) { }
                        } else {
                            throw flashError;
                        }
                    }
                }

                if (flashProgressElem) flashProgressElem.style.width = '100%';
                if (flashETAElem) flashETAElem.textContent = '';
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-success"></span> Flash Complete`;
                updateStatusIndicator('success', 'Flash complete!', 'Attempting device reset...');

                try {
                    espLoaderTerminal.writeLine("Attempting soft reset (into app)...");
                    await espLoader.softReset(true);
                    espLoaderTerminal.writeLine("Soft reset command sent.");
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (resetError) {
                    console.error("Soft reset failed:", resetError);
                    espLoaderTerminal.writeLine(`Note: Soft reset command failed: ${resetError.message}. Manual reset may be required.`);
                }

                try {
                    await disconnect();
                } catch (err) {
                    espLoaderTerminal.writeLine(`Note: Disconnect error after reset: ${err.message}`);
                } finally {
                    const actionContainer = flashBtn?.parentElement;
                    if (actionContainer) {
                        actionContainer.innerHTML = `
                            <button id="flashBtn" class="btn btn-primary" disabled>
                                <i class="bi bi-lightning"></i> Flash Firmware
                            </button>
                            <button id="eraseBtn" class="btn btn-danger" disabled>
                                <i class="bi bi-trash"></i> Erase Flash
                            </button>
                            <button id="resetBtn" class="btn btn-secondary" disabled>
                                <i class="bi bi-arrow-repeat"></i> Reset Device
                            </button>
                        `;
                        flashBtn = document.getElementById('flashBtn');
                        eraseBtn = document.getElementById('eraseBtn');
                        resetBtn = document.getElementById('resetBtn');
                        if (flashBtn) flashBtn.addEventListener('click', flash);
                        if (eraseBtn) eraseBtn.addEventListener('click', eraseFlash);
                        if (resetBtn) resetBtn.addEventListener('click', resetDevice);
                    }
                    connected = false;
                    updateButtonStates();
                    espLoaderTerminal.writeLine("Flash process complete. Device may have reset.");
                    updateStatusIndicator('success', 'Flash Complete', 'Device may have reset. Disconnected.');
                }

            } catch (error) {
                console.error("Error during flash process:", error);
                espLoaderTerminal.writeLine(`\nError flashing: ${error.message}`);
                if (flashETAElem) flashETAElem.textContent = '';
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-error"></span> Flash failed`;
                if (flashProgressElem) flashProgressElem.style.width = '0%';
                updateStatusIndicator('error', 'Flash failed', error.message);
            } finally {
                updateButtonStates();
            }
        }

        function calculateMd5Hash(image) {
            return null;
        }

        async function eraseFlashInternal() {
            if (!connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device to erase.");
                throw new Error("Device not connected for erasing.");
            }

            if (globalStatusElem) {
                globalStatusElem.textContent = 'Erasing flash, please wait... This may take a moment.';
                globalStatusElem.className = 'alert alert-warning mt-3';
                globalStatusElem.classList.remove('d-none');
            }

            try {
                espLoaderTerminal.writeLine("Erasing flash (this may take a moment)...");
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Erasing...`;
                updateStatusIndicator('flashing', 'Erasing flash...', 'This may take a moment...');

                await espLoader.eraseFlash();

                espLoaderTerminal.writeLine("Flash erased successfully");
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-connected"></span> Flash erased`;
                updateStatusIndicator('success', 'Flash erased', 'Ready to flash firmware');

                if (globalStatusElem) {
                    globalStatusElem.textContent = 'Flash erased successfully.';
                    globalStatusElem.className = 'alert alert-success mt-3';
                    setTimeout(() => globalStatusElem.classList.add('d-none'), 3000);
                }
                return true;
            } catch (error) {
                console.error("Error during erase:", error);
                espLoaderTerminal.writeLine(`Error erasing flash: ${error.message}`);
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-disconnected"></span> Erase failed`;
                updateStatusIndicator('error', 'Erase failed', error.message);

                if (globalStatusElem) {
                    globalStatusElem.textContent = `Error erasing flash: ${error.message}`;
                    globalStatusElem.className = 'alert alert-danger mt-3';
                    setTimeout(() => globalStatusElem.classList.add('d-none'), 5000);
                }
                throw error;
            }
        }

        async function eraseFlash() {
            if (!connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device");
                return;
            }
            if (eraseBtn) eraseBtn.disabled = true;
            if (flashBtn) flashBtn.disabled = true;
            if (resetBtn) resetBtn.disabled = true;

            try {
                await eraseFlashInternal();
            } catch (error) {
                espLoaderTerminal.writeLine("Standalone erase operation failed.");
            } finally {
                updateButtonStates();
            }
        }

        async function resetDevice() {
            if (!connected || !espLoader) {
                espLoaderTerminal.writeLine("Not connected to a device");
                return;
            }
            if (resetBtn) resetBtn.disabled = true;

            try {
                espLoaderTerminal.writeLine("Attempting soft reset (into app)...");
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-flashing"></span> Resetting...`;
                updateStatusIndicator('flashing', 'Resetting...', '');

                await espLoader.softReset(true);
                espLoaderTerminal.writeLine("Soft reset command sent.");

                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-connected"></span> Device reset initiated`;
                updateStatusIndicator('success', 'Reset initiated', 'Device should restart');

                setTimeout(() => {
                    connected = false;
                    updateButtonStates();
                    if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-disconnected"></span> Reset attempted, likely disconnected`;
                    updateStatusIndicator('disconnected', 'Disconnected', 'Device reset attempted');
                }, 1000);

            } catch (error) {
                console.error("Soft reset failed:", error);
                espLoaderTerminal.writeLine(`Note: Soft reset failed: ${error.message}. Manual reset may be required.`);
                if (chipInfoElem) chipInfoElem.innerHTML = `<span class="status-indicator status-warning"></span> Reset command failed`;
                updateStatusIndicator('error', 'Reset Failed', error.message);
                if (resetBtn) resetBtn.disabled = !connected;
            }
        }

        // --- GhostESP Functions ---

        function populateAssets(assets, parentElement, fileExtension, filterChip, filterBrand) {
            let foundFiles = false;
            if (!assets || assets.length === 0) {
                return false;
            }

            // Build list of allowed builds based on brand filter
            let allowedBuilds = null;
            if (filterBrand && brandToFirmware[filterBrand]) {
                allowedBuilds = new Set(brandToFirmware[filterBrand]);
            }

            assets.forEach(asset => {
                if (asset.name.endsWith(fileExtension)) {
                    // Filter by brand if specified
                    if (allowedBuilds && !allowedBuilds.has(asset.name)) {
                        return;
                    }

                    // Filter by chip if specified (and no brand filter)
                    if (filterChip && !filterBrand) {
                        const assetTarget = ghostEspZipToTarget[asset.name];
                        const mappedChip = ghostEspChipMapping[assetTarget];
                        if (mappedChip !== filterChip) {
                            return;
                        }
                    }

                    if (asset.name === "esp32-generic.zip") {
                        if (!filterBrand || filterBrand === 'Generic') {
                            const option1 = document.createElement('option');
                            option1.value = asset.browser_download_url;
                            option1.dataset.assetName = asset.name;
                            option1.textContent = "Generic ESP32";
                            parentElement.appendChild(option1);
                        }

                        if (!filterBrand || filterBrand === 'TheWiredHatters') {
                            const option2 = document.createElement('option');
                            option2.value = asset.browser_download_url;
                            option2.dataset.assetName = asset.name;
                            option2.textContent = "FlipperHub Rocket";
                            parentElement.appendChild(option2);
                        }

                        foundFiles = true;
                        return;
                    }

                    if (asset.name === "CYD2USB2.4Inch.zip") {
                        const option1 = document.createElement('option');
                        option1.value = asset.browser_download_url;
                        option1.dataset.assetName = asset.name;
                        option1.textContent = "CYD 2.4 Inch USB (ESP32)";
                        parentElement.appendChild(option1);

                        const option2 = document.createElement('option');
                        option2.value = asset.browser_download_url;
                        option2.dataset.assetName = asset.name;
                        option2.textContent = "Rabbit Labs' Phantom";
                        parentElement.appendChild(option2);

                        foundFiles = true;
                        return;
                    }

                    foundFiles = true;
                    const option = document.createElement('option');
                    option.value = asset.browser_download_url;
                    option.dataset.assetName = asset.name;
                    option.textContent = ghostEspNiceNames[asset.name] || asset.name;
                    parentElement.appendChild(option);
                }
            });
            return foundFiles;
        }

        async function populateGhostEspDropdown(owner, repo, fileExtension = '.zip', filterChip = null, filterBrand = null) {
            const selectElement = ghostEspVariantSelect;
            if (!selectElement) {
                console.error('GhostESP select element not found');
                return;
            }

            const requestId = ++ghostEspPopulateRequestId;
            selectElement.innerHTML = `<option value="">Select a build...</option>`;
            selectElement.disabled = true;

            try {
                await populateGhostEspFromGitHub(selectElement, owner, repo, fileExtension, filterChip, filterBrand, requestId);

                if (requestId !== ghostEspPopulateRequestId) {
                    return;
                }
            } catch (error) {
                console.error(`Error fetching ${repo} data:`, error);
                espLoaderTerminal.writeLine(`Failed to fetch ${repo} list: ${error.message}`);
                selectElement.innerHTML = `<option value="">Error loading options</option>`;
            }
        }

        

        async function populateGhostEspFromGitHub(selectElement, owner, repo, fileExtension, filterChip, filterBrand, requestId) {
            if (!ghostEspStableReleases || !ghostEspPrereleases) {
                const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
                espLoaderTerminal.writeLine(`Fetching releases from ${owner}/${repo}...`);

                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = `Fetching releases from GitHub...`;
                    ghostEspStatusElem.className = 'form-text mt-2 loading';
                }

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
                }
                const releases = await response.json();
                if (requestId !== ghostEspPopulateRequestId) return;
                if (!releases || releases.length === 0) {
                    espLoaderTerminal.writeLine(`No releases found for ${owner}/${repo}.`);
                    selectElement.innerHTML = `<option value="">No releases found</option>`;
                    return;
                }

                for (const release of releases) {
                    if (!release.prerelease && !ghostEspStableReleases) {
                        ghostEspStableReleases = release;
                    }
                    if (release.prerelease && !ghostEspPrereleases) {
                        ghostEspPrereleases = release;
                    }
                    if (ghostEspStableReleases && ghostEspPrereleases) break;
                }
            }

            if (requestId !== ghostEspPopulateRequestId) return;

            const targetRelease = ghostEspReleaseType === 'stable' ? ghostEspStableReleases : ghostEspPrereleases;

            if (targetRelease) {
                if (populateAssets(targetRelease.assets, selectElement, fileExtension, filterChip, filterBrand)) {
                    selectElement.disabled = false;
                    espLoaderTerminal.writeLine(`Loaded ${ghostEspReleaseType} release from GitHub: ${targetRelease.tag_name}`);
                    if (ghostEspStatusElem) {
                        ghostEspStatusElem.textContent = `GitHub ${ghostEspReleaseType}: ${targetRelease.tag_name}`;
                        ghostEspStatusElem.className = 'form-text text-success mt-2 success';
                    }
                    applyBuildTemplateMatch();
                } else {
                    espLoaderTerminal.writeLine(`${ghostEspReleaseType} release ${targetRelease.tag_name} found, but no matching assets.`);
                    selectElement.innerHTML = `<option value="">No matching assets found</option>`;
                }
            } else {
                espLoaderTerminal.writeLine(`No ${ghostEspReleaseType} release found for ${owner}/${repo}.`);
                selectElement.innerHTML = `<option value="">No ${ghostEspReleaseType} release found</option>`;
            }
        }

        async function loadGhostEspZip(optionValue) {
            if (!optionValue) {
                extractedGhostEspFiles = null;
                updateBinaryTypeIndicators();
                updateFlashSummary();
                updateButtonStates();
                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = 'Select a variant to begin loading firmware files.';
                    ghostEspStatusElem.className = 'form-text text-muted mt-2';
                }
                return;
            }

            if (ghostEspVariantSelect) ghostEspVariantSelect.disabled = true;
            extractedGhostEspFiles = null;

            try {
                let zipBlob;
                zipBlob = await fetchGhostEspFromGitHub(optionValue);

                if (!zipBlob || zipBlob.size === 0) {
                    throw new Error("Downloaded ZIP file is empty or fetch returned nothing.");
                }

                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = 'Download complete. Extracting files...';
                    ghostEspStatusElem.className = 'form-text mt-2 loading';
                }

                espLoaderTerminal.writeLine(`Downloaded ${Math.round(zipBlob.size / 1024)} KB ZIP. Extracting...`);

                const zip = await JSZip.loadAsync(zipBlob);

                const filesToExtract = {
                    app: { name: 'Ghost_ESP_IDF.bin', data: null, elem: appFileInfoElem, addressInput: appAddressInput, type: 'Application' },
                    bootloader: { name: 'bootloader.bin', data: null, elem: bootloaderFileInfoElem, addressInput: bootloaderAddressInput, type: 'Bootloader' },
                    partition: { name: 'partition-table.bin', data: null, elem: partitionFileInfoElem, addressInput: partitionAddressInput, type: 'Partition' }
                };

                let foundCount = 0;
                let foundFilesLog = [];

                for (const key in filesToExtract) {
                    const target = filesToExtract[key];

                    let fileEntry = zip.file(target.name);

                    if (!fileEntry) {
                        if (key === 'app') {
                            fileEntry = zip.file('firmware.bin');
                            if (fileEntry) target.name = 'firmware.bin';
                        } else if (key === 'partition') {
                            fileEntry = zip.file('partitions.bin');
                            if (fileEntry) target.name = 'partitions.bin';
                        }
                    }

                    if (fileEntry) {
                        target.data = await fileEntry.async("arraybuffer");
                        const fileSizeKB = Math.round(target.data.byteLength / 1024);
                        if (target.elem) {
                            target.elem.textContent = `${target.name} [Auto-Loaded] (${fileSizeKB} KB)`;
                        }
                        foundFilesLog.push(target.name);
                        foundCount++;
                    } else {
                        if (target.elem) {
                            target.elem.textContent = `${target.name} [Not Found]`;
                        }
                    }
                }

                if (foundCount > 0) {
                    extractedGhostEspFiles = filesToExtract;
                    espLoaderTerminal.writeLine("Extraction complete. Files ready.");
                    if (ghostEspStatusElem) {
                        ghostEspStatusElem.textContent = `Loaded: ${foundFilesLog.join(', ')}`;
                        ghostEspStatusElem.className = 'form-text text-success mt-2 success';
                    }
                    updateBinaryTypeIndicators();
                    updateFlashSummary();
                } else {
                    clearExtractedData();
                    updateFlashSummary();
                    if (ghostEspStatusElem) {
                        ghostEspStatusElem.textContent = 'Error: No required .bin files found in ZIP.';
                        ghostEspStatusElem.className = 'form-text text-danger mt-2 error';
                    }
                    throw new Error("No required .bin files found in the downloaded ZIP.");
                }

            } catch (error) {
                console.error("Error loading or extracting GhostESP ZIP:", error);
                espLoaderTerminal.writeLine(`Error processing GhostESP ZIP: ${error.message}`);
                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = `Error: ${error.message}`;
                    ghostEspStatusElem.className = 'form-text text-danger mt-2 error';
                }
                extractedGhostEspFiles = null;
                if (appFileInfoElem) appFileInfoElem.textContent = 'ZIP Load Failed';
                if (bootloaderFileInfoElem) bootloaderFileInfoElem.textContent = 'ZIP Load Failed';
                if (partitionFileInfoElem) partitionFileInfoElem.textContent = 'ZIP Load Failed';
                document.querySelectorAll('.flasher-file-drop.file-uploaded').forEach(el => el.classList.remove('file-uploaded'));
                updateBinaryTypeIndicators();
            } finally {
                if (ghostEspVariantSelect) ghostEspVariantSelect.disabled = false;
                updateButtonStates();
            }
        }

        async function fetchGhostEspFromGitHub(zipUrl) {
            if (ghostEspStatusElem) {
                ghostEspStatusElem.textContent = 'Fetching ZIP from GitHub...';
                ghostEspStatusElem.className = 'form-text mt-2 loading';
            }

            const proxyUrl = 'https://super-breeze-c8cd.flavouredjelly.workers.dev/?url=' + encodeURIComponent(zipUrl);
            espLoaderTerminal.writeLine(`Fetching GhostESP firmware from ${zipUrl}...`);

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
            }

            return await response.blob();
        }

        // --- UI Functions ---

        function updateButtonStates() {
            if (connectBtn) connectBtn.disabled = connected;
            if (disconnectBtn) disconnectBtn.disabled = !connected;

            const canFlash = connected && hasFirmwareFilesSelected();
            if (flashBtn) flashBtn.disabled = !canFlash;
            if (eraseBtn) eraseBtn.disabled = !connected;
            if (resetBtn) resetBtn.disabled = !connected;

            if (baudrateSelect) baudrateSelect.disabled = connected;

            if (continueToStep2Btn) continueToStep2Btn.disabled = !connected && !selectedDevice;
            if (continueToStep3Btn) continueToStep3Btn.disabled = !connected || !hasFirmwareFilesSelected();
        }

        function hasFirmwareFilesSelected() {
            if (selectedFirmwareMethod === 'download') {
                return extractedGhostEspFiles &&
                    (extractedGhostEspFiles.app.data ||
                        extractedGhostEspFiles.bootloader.data ||
                        extractedGhostEspFiles.partition.data);
            } else if (selectedFirmwareMethod === 'manual') {
                return (appFileInput?.files?.length > 0) ||
                    (bootloaderFileInput?.files?.length > 0) ||
                    (partitionFileInput?.files?.length > 0);
            }
            return false;
        }

        function updateFlashSummary() {
            if (!flashSummaryElem) return;
            flashSummaryElem.innerHTML = '';
            flashSummaryElem.classList.add('flash-summary-box');
            let hasBinaries = false;
            const addSummaryItem = (icon, text) => {
                flashSummaryElem.innerHTML += `<div class="summary-item"><i class="bi ${icon} me-2"></i> ${text}</div>`;
            };

            if (selectedFirmwareMethod === 'download' && extractedGhostEspFiles) {
                if (extractedGhostEspFiles.app.data) {
                    const address = extractedGhostEspFiles.app.addressInput.value;
                    addSummaryItem('bi-file-earmark-binary', `Application: ${extractedGhostEspFiles.app.name} at ${address} [Auto]`);
                    hasBinaries = true;
                }
                if (extractedGhostEspFiles.bootloader.data) {
                    const address = extractedGhostEspFiles.bootloader.addressInput.value;
                    addSummaryItem('bi-hdd-network', `Bootloader: ${extractedGhostEspFiles.bootloader.name} at ${address} [Auto]`);
                    hasBinaries = true;
                }
                if (extractedGhostEspFiles.partition.data) {
                    const address = extractedGhostEspFiles.partition.addressInput.value;
                    addSummaryItem('bi-table', `Partition Table: ${extractedGhostEspFiles.partition.name} at ${address} [Auto]`);
                    hasBinaries = true;
                }
            } else if (selectedFirmwareMethod === 'manual') {
                if (appFileInput?.files?.length > 0) {
                    const file = appFileInput.files[0];
                    const address = appAddressInput.value;
                    addSummaryItem('bi-file-earmark-binary', `Application: ${file.name} at ${address}`);
                    hasBinaries = true;
                }
                if (bootloaderFileInput?.files?.length > 0) {
                    const file = bootloaderFileInput.files[0];
                    const address = bootloaderAddressInput.value;
                    addSummaryItem('bi-hdd-network', `Bootloader: ${file.name} at ${address}`);
                    hasBinaries = true;
                }
                if (partitionFileInput?.files?.length > 0) {
                    const file = partitionFileInput.files[0];
                    const address = partitionAddressInput.value;
                    addSummaryItem('bi-table', `Partition Table: ${file.name} at ${address}`);
                    hasBinaries = true;
                }
            }

            if (!hasBinaries) {
                flashSummaryElem.innerHTML = '<div class="summary-item text-warning"><i class="bi bi-exclamation-triangle me-2"></i> Select method and provide firmware</div>';
                if (flashBtn) flashBtn.disabled = true;
            } else {
                if (flashBtn) flashBtn.disabled = !connected;
            }

            if (flashModeSelect && flashFreqSelect && flashSizeSelect) {
                addSummaryItem('bi-gear', `Settings: ${flashModeSelect.value.toUpperCase()}, ${flashFreqSelect.value}, ${flashSizeSelect.value}`);
            }
            if (eraseAllCheckbox && eraseAllCheckbox.checked) {
                addSummaryItem('bi-eraser-fill text-warning', '<strong>Erase all flash before programming</strong>');
            }
            updateButtonStates();
        }

        function updateBinaryTypeIndicators() {
            document.querySelectorAll('.file-badge').forEach(badge => badge.remove());

            let hasApp = false, hasBootloader = false, hasPartition = false;

            if (selectedFirmwareMethod === 'download' && extractedGhostEspFiles) {
                hasApp = !!extractedGhostEspFiles.app.data;
                hasBootloader = !!extractedGhostEspFiles.bootloader.data;
                hasPartition = !!extractedGhostEspFiles.partition.data;
            } else if (selectedFirmwareMethod === 'manual') {
                hasApp = appFileInput?.files?.length > 0;
                hasBootloader = bootloaderFileInput?.files?.length > 0;
                hasPartition = partitionFileInput?.files?.length > 0;
            }

            if (hasApp) {
                const appButton = document.querySelector('[data-binary="app"]');
                appButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
            if (hasBootloader) {
                const bootloaderButton = document.querySelector('[data-binary="bootloader"]');
                bootloaderButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
            if (hasPartition) {
                const partitionButton = document.querySelector('[data-binary="partition"]');
                partitionButton?.insertAdjacentHTML('beforeend', '<span class="file-badge"></span>');
            }
        }

        function selectFirmwareMethod(method) {
            selectedFirmwareMethod = method;

            if (choiceDownloadCard) choiceDownloadCard.classList.toggle('active', method === 'download');
            if (choiceManualCard) choiceManualCard.classList.toggle('active', method === 'manual');

            if (downloadOptionsContainer) downloadOptionsContainer.classList.toggle('d-none', method !== 'download');
            if (manualUploadContainer) manualUploadContainer.classList.toggle('d-none', method !== 'manual');

            if (method === 'download') {
                clearManualInputs();
                if (ghostEspStatusElem) {
                    ghostEspStatusElem.textContent = 'Select a variant to begin loading firmware files.';
                    ghostEspStatusElem.className = 'form-text text-muted mt-2';
                }
                populateGhostEspDropdown(GHOST_ESP_OWNER, GHOST_ESP_REPO, '.zip', selectedDevice, selectedBrand)
                    .catch(err => {
                        console.error('Error populating GhostESP dropdown:', err);
                        if (ghostEspStatusElem) {
                            ghostEspStatusElem.textContent = 'Error loading variants.';
                            ghostEspStatusElem.className = 'form-text text-danger mt-2 error';
                        }
                    });
            } else if (method === 'manual') {
                clearExtractedData();
                const appToggle = document.querySelector('[data-binary="app"]');
                if (appToggle) appToggle.click();
            }

            updateFlashSummary();
            updateButtonStates();
        }

        function clearExtractedData() {
            if (extractedGhostEspFiles) {
                extractedGhostEspFiles = null;
                if (appFileInfoElem?.textContent.includes('[Auto-Loaded]')) appFileInfoElem.textContent = 'No file selected';
                if (bootloaderFileInfoElem?.textContent.includes('[Auto-Loaded]')) bootloaderFileInfoElem.textContent = 'No file selected';
                if (partitionFileInfoElem?.textContent.includes('[Auto-Loaded]')) partitionFileInfoElem.textContent = 'No file selected';
                document.querySelectorAll('.flasher-file-drop.file-uploaded').forEach(el => el.classList.remove('file-uploaded'));
                updateBinaryTypeIndicators();
                espLoaderTerminal.writeLine("Cleared auto-loaded GhostESP files.");
            }
        }

        function clearManualInputs() {
            if (appFileInput) appFileInput.value = '';
            if (bootloaderFileInput) bootloaderFileInput.value = '';
            if (partitionFileInput) partitionFileInput.value = '';
            if (appFileInfoElem) appFileInfoElem.textContent = 'No file selected';
            if (bootloaderFileInfoElem) bootloaderFileInfoElem.textContent = 'No file selected';
            if (partitionFileInfoElem) partitionFileInfoElem.textContent = 'No file selected';
            document.querySelectorAll('.flasher-file-drop.file-uploaded').forEach(el => el.classList.remove('file-uploaded'));
            updateBinaryTypeIndicators();
        }

        // --- File Input Setup ---

        function setupFileInputHandling(dropZone, fileInput, infoElement) {
            if (!dropZone || !fileInput || !infoElement) {
                console.error("Missing elements for file input handling:", fileInput?.id);
                return;
            }

            const updateDisplay = (file) => {
                const fileSizeKB = Math.round(file.size / 1024);
                infoElement.textContent = `${file.name} (${fileSizeKB} KB)`;
                const uploadLabel = dropZone.querySelector('span');
                if (uploadLabel) {
                    uploadLabel.innerHTML = `<i class="bi bi-file-earmark-check"></i> ${file.name}`;
                }
                dropZone.classList.add('file-uploaded');
                updateBinaryTypeIndicators();
                updateButtonStates();
            };

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    updateDisplay(file);
                }
            });

            dropZone.addEventListener('click', () => {
                fileInput.click();
            });

            dropZone.addEventListener('dragover', (event) => {
                event.stopPropagation();
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                dropZone.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', (event) => {
                event.stopPropagation();
                event.preventDefault();
                dropZone.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('drag-over');
                const files = e.dataTransfer?.files;
                if (!files?.length) return;
                const file = files[0];
                if (!file.name.toLowerCase().endsWith('.bin')) {
                    espLoaderTerminal.writeLine('Only .bin files accepted');
                    return;
                }
                try { fileInput.files = files; } catch (_) { }
                const changeEvent = new Event('change');
                fileInput.dispatchEvent(changeEvent);
            });
        }

        if (appFirmwareSection) {
            const appDropZone = appFirmwareSection.querySelector('.flasher-file-drop');
            setupFileInputHandling(appDropZone, appFileInput, appFileInfoElem);
        }
        if (bootloaderFirmwareSection) {
            const bootloaderDropZone = bootloaderFirmwareSection.querySelector('.flasher-file-drop');
            setupFileInputHandling(bootloaderDropZone, bootloaderFileInput, bootloaderFileInfoElem);
        }
        if (partitionFirmwareSection) {
            const partitionDropZone = partitionFirmwareSection.querySelector('.flasher-file-drop');
            setupFileInputHandling(partitionDropZone, partitionFileInput, partitionFileInfoElem);
        }

        // --- WebSerial Check ---
        if (!navigator.serial) {
            espLoaderTerminal.writeLine("WebSerial is not supported in this browser. Please use Chrome or Edge version 89 or later.");
            if (connectBtn) connectBtn.disabled = true;

            const modalHtml = `
            <style>
                #webSerialModal { z-index: 10002 !important; }
                .modal-backdrop { z-index: 10001 !important; }
            </style>
            <div class="modal fade" id="webSerialModal" tabindex="-1" aria-hidden="true" style="z-index: 10002;">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Browser Not Supported</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-danger">
                                <i class="bi bi-exclamation-triangle-fill"></i>
                                WebSerial is not supported in this browser.
                            </div>
                            <p>Please use a supported browser:</p>
                            <ul>
                                <li>Chrome (v89+)</li>
                                <li>Edge (v89+)</li>
                                <li>Opera (v76+)</li>
                            </ul>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const webSerialModal = new bootstrap.Modal(getElementById('webSerialModal'));
            webSerialModal.show();
        } else {
            espLoaderTerminal.writeLine("GhostESP Flasher ready. Please select your device type.");
        }

        // --- Initialize ---
        goToStep(1);
        selectFirmwareMethod('download');
    }

    const style = document.createElement('style');
    style.textContent = `
    .file-uploaded {
        border: 2px solid #5bf13d !important;
        background-color: rgba(91, 241, 61, 0.1) !important;
        transition: all 0.3s ease !important;
    }
    .file-uploaded span {
        color: #5bf13d !important;
        font-weight: 500 !important;
    }
    @keyframes pulse-flashing { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
    .status-flashing-anim { animation: pulse-flashing 1.5s infinite; }
    .file-badge {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: var(--success-color, #2ecc71);
        margin-left: 8px;
        vertical-align: middle;
        box-shadow: 0 0 5px var(--success-color, #2ecc71);
    }
    `;
    document.head.appendChild(style);

    window.debugFileInputs = function () {
        ['appFile', 'bootloaderFile', 'partitionFile'].forEach(id => {
            const input = document.getElementById(id);
            const info = document.getElementById(id + 'Info');
            console.log(`${id}:`, {
                hasFiles: input?.files?.length > 0,
                fileName: input?.files?.[0]?.name,
                infoText: info?.textContent
            });
        });
    };
});
