let database = [];
let currentPage = 1;
let itemsPerPage = 20;
let debounceTimer;
let currentResults = [];
let ghostSerial = null;

document.addEventListener('DOMContentLoaded', async function() {
    await loadDatabase();
    setupEventListeners();
});

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const deviceTypeFilter = document.getElementById('deviceTypeFilter');
    const brandFilter = document.getElementById('brandFilter');
    const itemsPerPageSelect = document.getElementById('itemsPerPage');

    if (searchInput) searchInput.addEventListener('input', debounceSearch);
    if (searchButton) searchButton.addEventListener('click', instantSearch);
    if (deviceTypeFilter) deviceTypeFilter.addEventListener('change', instantSearch);
    if (brandFilter) brandFilter.addEventListener('change', instantSearch);
    if (itemsPerPageSelect) itemsPerPageSelect.addEventListener('change', changeItemsPerPage);

    const closePopup = document.querySelector('.close-popup');
    if (closePopup) {
        closePopup.addEventListener('click', () => {
            document.getElementById('serialPopup').style.display = 'none';
        });
    }
}

function debounceSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(instantSearch, 300);
}

function instantSearch() {
    searchDatabase();
    window.scrollTo(0, 0);
}

function changeItemsPerPage() {
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    if (itemsPerPageSelect) {
        itemsPerPage = parseInt(itemsPerPageSelect.value);
        currentPage = 1;
        displayResults();
    }
}

async function loadDatabase() {
    const loadingElement = document.getElementById('loading');
    if (loadingElement) loadingElement.style.display = 'flex';

    try {
        const response = await fetch('flipper_irdb_database.json');
        
        const commitsResponse = await fetch('https://api.github.com/repos/Lucaslhm/Flipper-IRDB/commits?path=&per_page=1');
        const commits = await commitsResponse.json();
        const lastCommit = commits[0]?.commit?.committer?.date;
        
        if (lastCommit) {
            const lastUpdated = new Date(lastCommit);
            document.querySelector('.last-updated').innerHTML = `
                <span class="update-badge">
                    <i class="fas fa-sync-alt"></i>
                    Last updated: ${lastUpdated.toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    })}
                </span>
            `;
        }
        
        const data = await response.json();
        database = data;
        
        if (loadingElement) loadingElement.style.display = 'none';
        console.log('Database loaded successfully:', database.length, 'items');
        
        populateFilters();
        searchDatabase();
    } catch (error) {
        console.error('Error loading database:', error);
        if (loadingElement) loadingElement.style.display = 'none';
        const resultsElement = document.getElementById('results');
        if (resultsElement) resultsElement.innerHTML = '<p class="error">Error loading database. Please try again later.</p>';
    }
}

function populateFilters() {
    const deviceTypes = new Set(database.map(item => item.device_type));
    
    const brands = new Set(database.map(item => {
        if (!item.brand || 
            item.brand.trim() === '' || 
            item.brand.toLowerCase() === 'unknown' ||
            item.brand.toLowerCase() === 'n/a' ||
            item.brand.toLowerCase() === 'none' ||
            item.brand.includes('/') ||
            item.brand.includes('\\') ||
            item.brand.length < 2 ||
            /^[0-9.]+$/.test(item.brand) ||
            item.brand.includes('.ir')) {
            return null;
        }
        
        let brand = item.brand.trim();
        brand = brand.replace(/\w\S*/g, txt => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
        brand = brand.replace(/\.(txt|ir|json)$/i, '')
                    .replace(/[_-]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
        
        return brand;
    }).filter(brand => brand !== null));

    populateSelect('deviceTypeFilter', deviceTypes);
    populateSelect('brandFilter', Array.from(brands).sort((a, b) => 
        a.localeCompare(b, undefined, {sensitivity: 'base'})
    ));
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    if (!select) return;

    const defaultText = id === 'deviceTypeFilter' ? 'All Types' : 'All Brands';
    select.innerHTML = `<option value="">${defaultText}</option>`;

    Array.from(options).forEach(option => {
        if (option) {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            select.appendChild(optionElement);
        }
    });
}

function searchDatabase() {
    const searchInput = document.getElementById('searchInput');
    const deviceTypeFilter = document.getElementById('deviceTypeFilter');
    const brandFilter = document.getElementById('brandFilter');

    if (!searchInput || !deviceTypeFilter || !brandFilter) return;

    const searchTerm = searchInput.value.toLowerCase();
    const deviceType = deviceTypeFilter.value;
    const brand = brandFilter.value;

    const searchTerms = searchTerm.split(/\s+/).filter(term => term.length > 0);

    currentResults = database.filter(item => {
        const itemString = `${item.brand} ${item.model} ${item.device_type} ${item.additional_info || ''}`.toLowerCase();
        const matchesSearch = searchTerms.every(term => itemString.includes(term));
        const matchesDeviceType = deviceType === '' || item.device_type === deviceType;
        const matchesBrand = brand === '' || item.brand === brand;

        return matchesSearch && matchesDeviceType && matchesBrand;
    });

    currentPage = 1;
    displayResults();
    updateStats(currentResults.length);
}

function displayResults() {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '';

    if (currentResults.length === 0) {
        resultsDiv.innerHTML = '<p class="no-results">No results found.</p>';
        updatePagination(0);
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageResults = currentResults.slice(startIndex, endIndex);

    pageResults.forEach(item => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        
        const downloadUrl = `https://raw.githubusercontent.com/Lucaslhm/Flipper-IRDB/main/${item.path.replace(/\\/g, '/')}`;

        let additionalInfoHtml = '';
        if (item.additional_info) {
            if (item.additional_info.length > 50) {
                additionalInfoHtml = `
                    <p><strong>Info:</strong> 
                        <span class="info-text">${item.additional_info.substring(0, 50)}
                            <span class="more-text" style="display:none">${item.additional_info.substring(50)}</span>
                        </span>
                        <button class="read-more">Read More</button>
                    </p>`;
            } else {
                additionalInfoHtml = `<p><strong>Info:</strong> ${item.additional_info}</p>`;
            }
        }

        resultItem.innerHTML = `
            <h3>${item.brand} ${item.model}</h3>
            <div class="content-wrapper">
                <p><strong>Type:</strong> ${item.device_type}</p>
                <p><strong>File:</strong> ${item.filename}</p>
                ${additionalInfoHtml}
            </div>
            <div class="button-group">
                <button class="download-button"><i class="fas fa-download"></i> Download</button>
                <button class="send-button"><i class="fas fa-paper-plane"></i> Send to Device</button>
            </div>
            <div class="send-status" style="display: none;"></div>
        `;

        const downloadButton = resultItem.querySelector('.download-button');
        downloadButton.addEventListener('click', () => downloadFile(downloadUrl, item.filename));

        const sendButton = resultItem.querySelector('.send-button');
        const sendStatus = resultItem.querySelector('.send-status');
        
        sendButton.addEventListener('click', async () => {
            try {
                if (!isWebSerialAvailable()) {
                    showWebSerialPopup();
                    return;
                }

                sendButton.disabled = true;
                sendButton.classList.add('sending');
                sendStatus.style.display = 'block';
                sendStatus.textContent = 'Connecting to device...';
                sendStatus.className = 'send-status';

                if (!ghostSerial) {
                    ghostSerial = new GhostESPSerial();
                }

                if (!ghostSerial.isConnected) {
                    await ghostSerial.connect();
                }

                sendStatus.textContent = 'Downloading IR file...';
                const response = await fetch(downloadUrl);
                if (!response.ok) throw new Error('Failed to download file');
                const text = await response.text();

                sendStatus.textContent = 'Creating directory...';
                await ghostSerial.sendCommand('sd mkdir /mnt/ghostesp/infrared/remotes');

                sendStatus.textContent = 'Sending to device...';
                const destPath = `/mnt/ghostesp/infrared/remotes/${item.filename}`;
                await ghostSerial.uploadFileContent(destPath, text);

                sendStatus.textContent = 'Successfully sent to device!';
                sendStatus.classList.add('success');

                setTimeout(() => {
                    sendStatus.style.display = 'none';
                    sendButton.classList.remove('sending');
                    sendButton.disabled = false;
                }, 3000);

            } catch (error) {
                console.error('Error sending to device:', error);
                sendStatus.textContent = `Error: ${error.message}`;
                sendStatus.classList.add('error');
                ghostSerial = null;
                sendButton.classList.remove('sending');
                sendButton.disabled = false;
            }
        });

        const readMoreButton = resultItem.querySelector('.read-more');
        if (readMoreButton) {
            readMoreButton.addEventListener('click', function() {
                const moreText = this.parentNode.querySelector('.more-text');
                if (moreText.style.display === 'none') {
                    moreText.style.display = 'inline';
                    this.textContent = 'Read Less';
                } else {
                    moreText.style.display = 'none';
                    this.textContent = 'Read More';
                }
            });
        }

        resultsDiv.appendChild(resultItem);
    });

    updatePagination(currentResults.length);
}

function updatePagination(totalResults) {
    const paginationDiv = document.getElementById('pagination');
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const currentPageSpan = document.getElementById('currentPage');

    if (!paginationDiv || !prevButton || !nextButton || !currentPageSpan) return;

    const totalPages = Math.ceil(totalResults / itemsPerPage);

    if (totalPages <= 1) {
        paginationDiv.style.display = 'none';
        return;
    }

    paginationDiv.style.display = 'flex';
    currentPageSpan.textContent = `Page ${currentPage} of ${totalPages}`;

    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;

    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            displayResults();
            window.scrollTo(0, 0);
        }
    };

    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            displayResults();
            window.scrollTo(0, 0);
        }
    };
}

function updateStats(resultCount) {
    const statsDiv = document.getElementById('stats');
    if (!statsDiv) return;

    const totalItems = database.length;
    statsDiv.innerHTML = `
        <span class="stat-item"><strong>${resultCount.toLocaleString()}</strong> results found</span>
        <span class="stat-item"><strong>${totalItems.toLocaleString()}</strong> total IR files</span>
    `;
}

function downloadFile(url, filename) {
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.blob();
        })
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
                document.body.removeChild(a);
            }, 100);
        })
        .catch(error => {
            console.error('Download failed:', error);
            alert('Download failed. Please try again.');
        });
}

function isWebSerialAvailable() {
    return 'serial' in navigator;
}

function showWebSerialPopup() {
    const popup = document.getElementById('serialPopup');
    if (popup) {
        popup.style.display = 'flex';
    }
}

class GhostESPSerial {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.responseBuffer = '';
        this.readLoopPromise = null;
    }

    async connect() {
        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });

            this.reader = this.port.readable.getReader();
            this.readLoopPromise = this.readLoop();

            await new Promise(resolve => setTimeout(resolve, 500));

            this.responseBuffer = '';
            this.isConnected = true;

            return true;
        } catch (error) {
            console.error('Connection error:', error);
            await this.disconnect();
            throw error;
        }
    }

    async readLoop() {
        while (true) {
            try {
                const { value, done } = await this.reader.read();
                if (done) break;

                const decoded = this.decoder.decode(value);
                this.responseBuffer += decoded;
            } catch (error) {
                if (error.name === 'NetworkError') break;
                throw error;
            }
        }
    }

    async sendCommand(cmd, timeout = 15000) {
        if (!this.isConnected) {
            throw new Error('Not connected to device');
        }

        this.responseBuffer = '';
        
        const writer = this.port.writable.getWriter();
        await writer.write(this.encoder.encode(cmd + '\n'));
        writer.releaseLock();

        await new Promise(resolve => setTimeout(resolve, 500));
        
        return this.responseBuffer;
    }

    async uploadFileContent(path, content) {
        const bytes = this.encoder.encode(content);
        const chunkSize = 256;
        let offset = 0;

        while (offset < bytes.length) {
            const length = Math.min(chunkSize, bytes.length - offset);
            const chunk = bytes.slice(offset, offset + length);
            const base64 = this.uint8ToBase64(chunk);

            const isFirst = offset === 0;
            const cmd = isFirst ? `sd write ${path} ${base64}` : `sd append ${path} ${base64}`;
            
            const response = await this.sendCommand(cmd, 30000);
            
            if (response.includes('SD:ERR')) {
                throw new Error('Write failed');
            }

            offset += length;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return true;
    }

    uint8ToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader = null;
            }
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            this.isConnected = false;
        } catch (error) {
            console.error('Disconnection error:', error);
        }
    }
}
