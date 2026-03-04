const WIGLE_MAGIC = "WigleWifi-1.6";
const EXPECTED_HEADER = [
  "MAC",
  "SSID",
  "AuthMode",
  "FirstSeen",
  "Channel",
  "Frequency",
  "RSSI",
  "CurrentLatitude",
  "CurrentLongitude",
  "AltitudeMeters",
  "AccuracyMeters",
  "RCOIs",
  "MfgrId",
  "Type",
];

const DB_NAME = "openwd_local";
const DB_VERSION = 1;
const META_STORE = "meta";
const OBS_STORE = "observations";

const state = {
  map: null,
  layerGroup: null,
  canvasRenderer: null,
  baseTiles: null,
  clusterIndex: null,
  allPoints: [],
  pointById: new Map(),
  datasets: [],
  nextPointId: 1,
  filteredCount: 0,
  filteredWifi: 0,
  filteredBle: 0,
  renderedObjects: 0,
  renderTimer: null,
  filterTimer: null,
  clusteringAvailable: true,
  didInitialFitToData: false,
  timeRange: { min: 0, max: 0 },
  timeFilter: null,
  privacyMode: false,
};

let dbHandlePromise = null;

function escapeHtml(value) {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function setStatus(message) {
  document.getElementById("import-status").textContent = message;
}

function setMapHud(countText, modeText) {
  const countEl = document.getElementById("map-count");
  const modeEl = document.getElementById("map-mode");
  if (countEl) countEl.textContent = countText;
  if (modeEl) modeEl.textContent = modeText;
}

function fitMapToPoints(points) {
  if (!points || points.length === 0 || !state.map) return;
  const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
  if (!bounds.isValid()) return;
  state.map.fitBounds(bounds, { padding: [26, 26], maxZoom: 15 });
}

function safeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeenUnix(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function normalizeHeaderRow(row) {
  return row.map((item) => String(item || "").trim());
}

function openDatabase() {
  if (dbHandlePromise) return dbHandlePromise;
  dbHandlePromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(OBS_STORE)) {
        db.createObjectStore(OBS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbHandlePromise;
}

async function dbGetMeta(key, fallbackValue) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const req = store.get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      if (!req.result) {
        resolve(fallbackValue);
      } else {
        resolve(req.result.value);
      }
    };
  });
}

async function dbSetMeta(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(META_STORE).put({ key, value });
  });
}

async function dbGetAllObservations() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBS_STORE, "readonly");
    const req = tx.objectStore(OBS_STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function dbAddObservations(points) {
  if (!points.length) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBS_STORE, "readwrite");
    const store = tx.objectStore(OBS_STORE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const point of points) {
      store.put(point);
    }
  });
}

async function dbClearAll() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([OBS_STORE, META_STORE], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(OBS_STORE).clear();
    tx.objectStore(META_STORE).put({ key: "datasets", value: [] });
    tx.objectStore(META_STORE).put({ key: "nextPointId", value: 1 });
  });
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      worker: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results),
      error: (error) => reject(error),
    });
  });
}

async function parseWigleFile(file) {
  const parsed = await parseCsvFile(file);
  const rows = parsed.data;
  const errors = [];
  let totalRows = 0;
  let validRows = 0;
  let skippedRows = 0;

  if (!rows || rows.length < 2) {
    throw new Error(`${file.name}: CSV has no usable rows`);
  }

  const firstRow = rows[0] || [];
  const firstCell = String(firstRow[0] || "").trim();
  if (!firstCell.startsWith(WIGLE_MAGIC)) {
    throw new Error(`${file.name}: invalid pre-header, expected ${WIGLE_MAGIC}`);
  }

  const header = normalizeHeaderRow(rows[1] || []);
  const headerMatches = header.length === EXPECTED_HEADER.length && header.every((value, idx) => value === EXPECTED_HEADER[idx]);
  if (!headerMatches) {
    throw new Error(`${file.name}: header is not WiGLE v1.6 format`);
  }

  const datasetId = `ds-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const importedAt = new Date().toISOString();
  const points = [];

  for (let i = 2; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }

    totalRows += 1;
    if (row.length < 14) {
      skippedRows += 1;
      if (errors.length < 12) errors.push(`Line ${i + 1}: expected 14 columns, got ${row.length}`);
      continue;
    }

    const obsType = String(row[13] || "").trim().toUpperCase();
    if (obsType !== "WIFI" && obsType !== "BLE") {
      skippedRows += 1;
      if (errors.length < 12) errors.push(`Line ${i + 1}: invalid Type '${row[13]}'`);
      continue;
    }

    const latitude = safeFloat(row[7]);
    const longitude = safeFloat(row[8]);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      skippedRows += 1;
      if (errors.length < 12) errors.push(`Line ${i + 1}: invalid lat/lon`);
      continue;
    }

    const point = {
      id: state.nextPointId,
      datasetId,
      fileName: file.name,
      importedAt,
      mac: String(row[0] || "").trim(),
      ssid: String(row[1] || "").trim(),
      authMode: String(row[2] || "").trim(),
      firstSeen: String(row[3] || "").trim(),
      firstSeenUnix: parseSeenUnix(row[3]),
      channel: safeInt(row[4]),
      frequency: safeInt(row[5]),
      rssi: safeInt(row[6]),
      latitude,
      longitude,
      altitude: safeFloat(row[9]),
      accuracy: safeFloat(row[10]),
      rcois: String(row[11] || "").trim(),
      mfgrId: String(row[12] || "").trim(),
      type: obsType,
    };

    state.nextPointId += 1;
    points.push(point);
    validRows += 1;
  }

  if (validRows === 0) {
    throw new Error(`${file.name}: no valid observation rows found`);
  }

  const dataset = {
    id: datasetId,
    fileName: file.name,
    importedAt,
    totalRows,
    validRows,
    skippedRows,
    errorCount: errors.length,
    errors,
  };

  return { dataset, points };
}

function combinePointsByLocation(points) {
  const byMac = new Map();
  
  for (const pt of points) {
    const key = `${pt.type}:${pt.mac}`;
    if (!byMac.has(key)) {
      byMac.set(key, []);
    }
    byMac.get(key).push(pt);
  }

  const combined = [];
  
  for (const [, pts] of byMac) {
    if (pts.length === 1) {
      combined.push(pts[0]);
      continue;
    }

    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;
    let bestRssi = -999;
    let bestPt = pts[0];

    for (const pt of pts) {
      if (pt.rssi !== null && pt.rssi > bestRssi) {
        bestRssi = pt.rssi;
        bestPt = pt;
      }
      const weight = pt.rssi !== null ? Math.pow(10, pt.rssi / 20) : 0.1;
      totalWeight += weight;
      weightedLat += pt.latitude * weight;
      weightedLon += pt.longitude * weight;
    }

    const avgLat = weightedLat / totalWeight;
    const avgLon = weightedLon / totalWeight;

    combined.push({
      ...bestPt,
      id: state.nextPointId++,
      latitude: avgLat,
      longitude: avgLon,
      combinedCount: pts.length,
      originalCount: pts.length,
    });
  }

  return combined;
}

function getFilterValues() {
  const typeEl = document.getElementById("filter-type");
  const searchEl = document.getElementById("filter-search");
  const rssiMinEl = document.getElementById("filter-rssi-min");
  const rssiMaxEl = document.getElementById("filter-rssi-max");
  const timeAllEl = document.getElementById("time-all-toggle");
  
  const type = typeEl ? typeEl.value : "ALL";
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const rssiMinRaw = rssiMinEl ? rssiMinEl.value : "";
  const rssiMaxRaw = rssiMaxEl ? rssiMaxEl.value : "";

  const rssiMin = rssiMinRaw === "" ? null : safeInt(rssiMinRaw);
  const rssiMax = rssiMaxRaw === "" ? null : safeInt(rssiMaxRaw);

  const allTime = timeAllEl ? timeAllEl.checked : true;
  const startUnix = allTime ? null : state.timeFilter;

  return { type, search, rssiMin, rssiMax, startUnix, endUnix: null };
}

function pointMatchesFilters(point, filters) {
  if (filters.type !== "ALL" && point.type !== filters.type) return false;
  if (filters.rssiMin !== null && (point.rssi ?? -999) < filters.rssiMin) return false;
  if (filters.rssiMax !== null && (point.rssi ?? 999) > filters.rssiMax) return false;

  if (filters.search) {
    const mac = (point.mac || "").toLowerCase();
    const ssid = (point.ssid || "").toLowerCase();
    if (!mac.includes(filters.search) && !ssid.includes(filters.search)) return false;
  }

  if (filters.startUnix !== null) {
    if (point.firstSeenUnix === null || point.firstSeenUnix < filters.startUnix) return false;
  }
  if (filters.endUnix !== null) {
    if (point.firstSeenUnix === null || point.firstSeenUnix > filters.endUnix) return false;
  }

  return true;
}

function rebuildClusterIndex(filtered) {
  if (!filtered.length) {
    state.clusterIndex = null;
    return;
  }

  const clusterCtor = window.Supercluster || window.supercluster;
  if (!clusterCtor) {
    state.clusterIndex = null;
    state.clusteringAvailable = false;
    return;
  }
  state.clusteringAvailable = true;

  const features = filtered.map((point) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    properties: {
      id: point.id,
      type: point.type,
      rssi: point.rssi,
    },
  }));

  state.clusterIndex = new clusterCtor({
    radius: 58,
    maxZoom: 19,
    minZoom: 0,
    nodeSize: 64,
  });
  state.clusterIndex.load(features);
}

function getClustersForView() {
  if (!state.clusterIndex) return [];
  const bounds = state.map.getBounds();
  const zoom = Math.floor(state.map.getZoom());
  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();

  if (west <= east) {
    return state.clusterIndex.getClusters([west, south, east, north], zoom);
  }

  const left = state.clusterIndex.getClusters([west, south, 180, north], zoom);
  const right = state.clusterIndex.getClusters([-180, south, east, north], zoom);
  return [...left, ...right];
}

function getRawPointsForView() {
  const filters = getFilterValues();
  const bounds = state.map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  const inLng = (lon) => {
    if (west <= east) return lon >= west && lon <= east;
    return lon >= west || lon <= east;
  };

  const visible = [];
  for (const point of state.allPoints) {
    if (point.latitude < south || point.latitude > north) continue;
    if (!inLng(point.longitude)) continue;
    if (!pointMatchesFilters(point, filters)) continue;
    visible.push(point);
    if (visible.length >= 12000) break;
  }
  return visible;
}

function clusterLabel(pointCount) {
  if (pointCount >= 1000) {
    return `${Math.round(pointCount / 100) / 10}k`;
  }
  return String(pointCount);
}

function clusterIcon(pointCount) {
  return L.divIcon({
    className: "",
    html: `<div class="cluster-icon">${escapeHtml(clusterLabel(pointCount))}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function clusterPopupContent(points, totalCount) {
  if (!points.length) return "<em>No points</em>";
  const rows = points
    .map((p) => {
      const ssid = p.ssid || "<hidden>";
      return `<div class="cpop-row"><strong>${escapeHtml(p.type)}</strong> &mdash; ${escapeHtml(ssid)}<br>MAC: ${escapeHtml(p.mac || "-")}<br>RSSI: ${escapeHtml(p.rssi ?? "-")} dBm &nbsp;&bull;&nbsp; Ch: ${escapeHtml(p.channel ?? "-")}<br>First Seen: ${escapeHtml(p.firstSeen || "-")}</div>`;
    })
    .join("");
  const extra =
    totalCount > 100
      ? `<div class="cpop-more">Showing 100 of ${totalCount} &mdash; zoom in to narrow down</div>`
      : "";
  return `<div class="cpop-list">${rows}${extra}</div>`;
}

function pointPopup(point, sampleCount) {
  const ssid = point.ssid || "<hidden>";
  const extra = sampleCount > 1 ? `<br>Aggregated Samples: ${sampleCount}` : "";
  return `
    <strong>${escapeHtml(point.type)}</strong><br>
    SSID/Name: ${escapeHtml(ssid)}<br>
    MAC: ${escapeHtml(point.mac || "-")}<br>
    Auth: ${escapeHtml(point.authMode || "-")}<br>
    RSSI: ${escapeHtml(point.rssi ?? "-")} dBm<br>
    Channel/Freq: ${escapeHtml(point.channel ?? "-")} / ${escapeHtml(point.frequency ?? "-")} MHz<br>
    First Seen: ${escapeHtml(point.firstSeen || "-")}<br>
    Lat/Lon: ${escapeHtml(point.latitude)}, ${escapeHtml(point.longitude)}${extra}
  `;
}

function renderClusters() {
  state.layerGroup.clearLayers();

  if (!state.clusterIndex && state.clusteringAvailable) {
    state.renderedObjects = 0;
    setMapHud("0 points", "No data in current filter");
    updateStats();
    return;
  }

  const clusters = state.clusteringAvailable ? getClustersForView() : [];
  let rendered = 0;
  let clusterCount = 0;
  let pointCount = 0;

  if (!state.clusteringAvailable) {
    const visiblePoints = getRawPointsForView();
    for (const point of visiblePoints) {
      const color = point.type === "BLE" ? "#8f8f8f" : "#ffffff";
      const marker = L.circleMarker([point.latitude, point.longitude], {
        renderer: state.canvasRenderer,
        radius: point.type === "BLE" ? 4 : 4.4,
        color,
        fillColor: color,
        weight: 1.2,
        fillOpacity: 0.96,
      });
      marker.bindPopup(pointPopup(point, 1));
      state.layerGroup.addLayer(marker);
      rendered += 1;
    }

    state.renderedObjects = rendered;
    setMapHud(`${formatNumber(state.filteredCount)} filtered points`, "Fallback raw mode (clustering unavailable)");
    updateStats();
    return;
  }

  for (const feature of clusters) {
    const [lon, lat] = feature.geometry.coordinates;
    const props = feature.properties || {};

    if (props.cluster) {
      clusterCount += 1;
      const pointCountAbbrev = props.point_count || 0;
      const marker = L.marker([lat, lon], { icon: clusterIcon(pointCountAbbrev) });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        const expansionZoom = state.clusterIndex.getClusterExpansionZoom(props.cluster_id);
        const currentZoom = Math.floor(state.map.getZoom());
        const targetZoom = Math.min(19, expansionZoom);
        if (targetZoom > currentZoom && pointCountAbbrev > 100) {
          state.map.flyTo([lat, lon], targetZoom, { duration: 0.2 });
          return;
        }
        const leaves = state.clusterIndex.getLeaves(props.cluster_id, 100);
        const pts = leaves.map((f) => state.pointById.get(f.properties.id)).filter(Boolean);
        L.popup({ maxHeight: 260, maxWidth: 300 })
          .setLatLng([lat, lon])
          .setContent(clusterPopupContent(pts, pointCountAbbrev))
          .openOn(state.map);
      });
      state.layerGroup.addLayer(marker);
      rendered += 1;
      continue;
    }

    pointCount += 1;
    const pointId = props.id;
    const point = state.pointById.get(pointId);
    if (!point) continue;

    const color = point.type === "BLE" ? "#8f8f8f" : "#ffffff";
    const marker = L.circleMarker([point.latitude, point.longitude], {
      renderer: state.canvasRenderer,
      radius: point.type === "BLE" ? 4 : 4.4,
      color,
      fillColor: color,
      weight: 1.2,
      fillOpacity: 0.96,
    });
    marker.bindPopup(pointPopup(point, 1));
    state.layerGroup.addLayer(marker);
    rendered += 1;
  }

  state.renderedObjects = rendered;
  const mode = clusterCount > 0 ? `Fast cluster mode - ${clusterCount} clusters, ${pointCount} raw points` : "Raw point mode";
  setMapHud(`${formatNumber(state.filteredCount)} filtered points`, mode);
  updateStats();
}

function queueRender(delayMs = 70) {
  if (state.renderTimer) {
    clearTimeout(state.renderTimer);
  }
  state.renderTimer = setTimeout(renderClusters, delayMs);
}

function queueFilter(delayMs = 180) {
  if (state.filterTimer) {
    clearTimeout(state.filterTimer);
  }
  state.filterTimer = setTimeout(applyFilters, delayMs);
}

function applyFilters() {
  const filters = getFilterValues();
  const filtered = [];
  let wifi = 0;
  let ble = 0;

  for (const point of state.allPoints) {
    if (!pointMatchesFilters(point, filters)) continue;
    filtered.push(point);
    if (point.type === "BLE") ble += 1;
    else wifi += 1;
  }

  state.filteredCount = filtered.length;
  state.filteredWifi = wifi;
  state.filteredBle = ble;

  try {
    rebuildClusterIndex(filtered);
    queueRender(10);
  } catch (error) {
    setStatus(`Render error: ${error.message}`);
  }
}

function updateStats() {
  const statsText = document.getElementById("stats-text");
  if (!statsText) return;
  const text = `${state.datasets.length} datasets | ${formatNumber(state.filteredCount)} points (${formatNumber(state.filteredWifi)} WiFi, ${formatNumber(state.filteredBle)} BLE) | ${formatNumber(state.renderedObjects)} rendered`;
  statsText.textContent = text;
}

function updateTimeSlider() {
  const slider = document.getElementById("time-slider");
  const display = document.getElementById("time-display");
  const timeAll = document.getElementById("time-all-toggle");
  if (!slider || !display) return;

  if (state.allPoints.length === 0) {
    slider.disabled = true;
    display.textContent = "No data";
    if (timeAll) timeAll.checked = true;
    return;
  }

  let minTime = Infinity;
  let maxTime = -Infinity;
  
  for (const pt of state.allPoints) {
    if (pt.firstSeenUnix !== null) {
      if (pt.firstSeenUnix < minTime) minTime = pt.firstSeenUnix;
      if (pt.firstSeenUnix > maxTime) maxTime = pt.firstSeenUnix;
    }
  }

  if (minTime === Infinity || maxTime === -Infinity) {
    slider.disabled = true;
    display.textContent = "No timestamps";
    if (timeAll) timeAll.checked = true;
    return;
  }

  state.timeRange = { min: minTime, max: maxTime };
  slider.disabled = false;
  slider.min = minTime;
  slider.max = maxTime;
  slider.value = maxTime;
  if (timeAll) timeAll.checked = true;
  
  const date = new Date(maxTime * 1000);
  display.textContent = date.toLocaleDateString();
}

function handleTimeSlider() {
  const slider = document.getElementById("time-slider");
  const display = document.getElementById("time-display");
  const timeAll = document.getElementById("time-all-toggle");
  if (!slider || !display) return;

  const selectedTime = parseInt(slider.value, 10);
  state.timeFilter = selectedTime;
  if (timeAll) timeAll.checked = false;

  const date = new Date(selectedTime * 1000);
  display.textContent = date.toLocaleDateString();
  
  applyFilters();
}

function handleTimeAllToggle(event) {
  const checked = event.target.checked;
  const slider = document.getElementById("time-slider");
  if (checked) {
    state.timeFilter = null;
    if (slider) slider.value = slider.max;
  } else if (slider) {
    state.timeFilter = parseInt(slider.value, 10);
  }
  updateTimeSlider();
  applyFilters();
}

function renderDatasets() {
  const el = document.getElementById("dataset-list");
  if (!state.datasets.length) {
    el.innerHTML = '<div class="dataset-item">No datasets imported yet.</div>';
    return;
  }

  const sorted = [...state.datasets].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  el.innerHTML = sorted
    .map((dataset) => {
      const when = new Date(dataset.importedAt).toLocaleString();
      return `
        <div class="dataset-item" title="${escapeHtml(dataset.fileName)}">
          <div class="dataset-name">${escapeHtml(dataset.fileName)}</div>
          <div class="dataset-meta">
            Imported: ${escapeHtml(when)}<br>
            Valid: ${formatNumber(dataset.validRows)} / Total: ${formatNumber(dataset.totalRows)}<br>
            Skipped: ${formatNumber(dataset.skippedRows)}
          </div>
        </div>
      `;
    })
    .join("");
}

async function importFiles() {
  const input = document.getElementById("file-input");
  const files = Array.from(input.files || []);
  if (!files.length) {
    setStatus("Select one or more .csv files first.");
    return;
  }

  const newDatasets = [];
  const newPoints = [];
  const failures = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    setStatus(`Parsing ${i + 1}/${files.length}: ${file.name}`);

    try {
      const result = await parseWigleFile(file);
      newDatasets.push(result.dataset);
      newPoints.push(...result.points);
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }

  if (newPoints.length > 0) {
    const combinedPoints = combinePointsByLocation(newPoints);
    const originalCount = newPoints.length;
    const combinedCount = combinedPoints.length;
    
    state.allPoints.push(...combinedPoints);
    for (const point of combinedPoints) {
      state.pointById.set(point.id, point);
    }
    state.datasets.push(...newDatasets);

    await dbAddObservations(combinedPoints);
    await dbSetMeta("datasets", state.datasets);
    await dbSetMeta("nextPointId", state.nextPointId);
    fitMapToPoints(combinedPoints);
    
    setStatus(`Combined ${originalCount} observations into ${combinedCount} unique networks (weighted by RSSI)`);
  }

  const statusLines = [
    `Imported datasets: ${newDatasets.length}, failed: ${failures.length}`,
    `Imported points: ${formatNumber(newPoints.length)}`,
  ];
  if (failures.length) {
    statusLines.push(...failures.slice(0, 6));
  }

  setStatus(statusLines.join("\n"));
  renderDatasets();
  applyFilters();
  updateTimeSlider();
  input.value = "";
}

async function clearAllData() {
  if (!window.confirm("Delete all imported datasets and points from this browser?")) {
    return;
  }

  await dbClearAll();
  state.allPoints = [];
  state.pointById = new Map();
  state.datasets = [];
  state.nextPointId = 1;
  state.clusterIndex = null;
  state.filteredCount = 0;
  state.filteredWifi = 0;
  state.filteredBle = 0;
  state.renderedObjects = 0;

  renderDatasets();
  updateStats();
  renderClusters();
  updateTimeSlider();
  setStatus("Local browser data cleared.");
}

function resetFilters() {
  const filterType = document.getElementById("filter-type");
  const filterSearch = document.getElementById("filter-search");
  const filterRssiMin = document.getElementById("filter-rssi-min");
  const filterRssiMax = document.getElementById("filter-rssi-max");

  if (filterType) filterType.value = "ALL";
  if (filterSearch) filterSearch.value = "";
  if (filterRssiMin) filterRssiMin.value = "";
  if (filterRssiMax) filterRssiMax.value = "";
  
  state.timeFilter = null;
  updateTimeSlider();
  applyFilters();
}

function initMap() {
  state.map = L.map("map", {
    zoomControl: true,
    worldCopyJump: true,
    preferCanvas: true,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
  }).setView([20, 0], 2);

  state.baseTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(state.map);

  state.canvasRenderer = L.canvas({ padding: 0.4 });
  state.layerGroup = L.layerGroup().addTo(state.map);

  state.map.on("moveend", () => queueRender(60));
  state.map.on("zoomend", () => queueRender(40));
  window.addEventListener("resize", () => {
    state.map.invalidateSize();
    queueRender(80);
  });
}

function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    datasets: state.datasets,
    points: state.allPoints,
  };
  
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wdmap-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${state.allPoints.length} points to JSON`);
}

async function loadDataFromFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.points || !Array.isArray(data.points)) {
      throw new Error("Invalid export file");
    }
    
    const loadedPoints = data.points;
    const loadedDatasets = data.datasets || [];
    const originalCount = state.allPoints.length;
    
    const combinedPoints = combinePointsByLocation(loadedPoints);
    
    state.allPoints.push(...combinedPoints);
    for (const point of combinedPoints) {
      state.pointById.set(point.id, point);
    }
    state.datasets.push(...loadedDatasets);
    
    await dbAddObservations(combinedPoints);
    await dbSetMeta("datasets", state.datasets);
    await dbSetMeta("nextPointId", state.nextPointId);
    fitMapToPoints(combinedPoints);
    applyFilters();
    
    const newCount = state.allPoints.length - originalCount;
    setStatus(`Loaded ${combinedPoints.length} points (${newCount} new) from JSON`);
  } catch (error) {
    setStatus(`Failed to load: ${error.message}`);
  }
}

const MAX_ANIM_FRAMES = 2000;
const TARGET_ANIM_MS = 13000;

function smoothPath(points, sampleCap = 1000, segments = 8) {
  if (points.length < 4) return points;

  // Pre-sample long paths to keep spline stable
  let base = points;
  if (points.length > sampleCap) {
    base = subsamplePath(points, sampleCap);
  }

  const result = [];
  const n = base.length;

  const clamp = (idx) => base[Math.min(Math.max(idx, 0), n - 1)];

  for (let i = 0; i < n - 1; i++) {
    const p0 = clamp(i - 1);
    const p1 = clamp(i);
    const p2 = clamp(i + 1);
    const p3 = clamp(i + 2);

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        ((2 * p1[0]) +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        ((2 * p1[1]) +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

      result.push([x, y]);
    }
  }

  result.push(base[n - 1]);
  return result;
}

function subsamplePath(arr, maxLen) {
  if (arr.length <= maxLen) return arr;
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    result.push(arr[Math.round((i / (maxLen - 1)) * (arr.length - 1))]);
  }
  return result;
}

function getAnimFrameDelay(frameIdx, totalFrames) {
  if (totalFrames <= 1) return 50;
  const progress = frameIdx / (totalFrames - 1);
  const speedFactor = Math.max(0.15, Math.sin(Math.PI * progress));
  const avgMs = TARGET_ANIM_MS / totalFrames;
  return Math.max(4, Math.round(avgMs / speedFactor));
}

const animationState = {
  isAnimating: false,
  pathLine: null,
  currentIndex: 0,
  frames: [],
  rawPoints: [],
  cumulativeWifi: [],
  cumulativeBle: [],
  totalFrames: 0,
  startZoom: 3,
  targetZoom: 10,
  lastZoom: null,
  animationId: null,
};

const gifExportState = {
  isExporting: false,
};

function getOrderedPoints() {
  return [...state.allPoints]
    .filter(p => p.latitude != null && p.longitude != null)
    .sort((a, b) => (a.firstSeenUnix || 0) - (b.firstSeenUnix || 0));
}

function startAnimation() {
  if (animationState.isAnimating) return;

  const rawPoints = getOrderedPoints();
  if (rawPoints.length === 0) {
    setStatus("No points to animate");
    animationState.isAnimating = false;
    return;
  }

  // Precompute cumulative wifi/ble counts (O(n) once, O(1) lookup later)
  let cWifi = 0;
  let cBle = 0;
  const cumulativeWifi = [];
  const cumulativeBle = [];
  for (const pt of rawPoints) {
    if (pt.type === "WIFI") cWifi += 1;
    else cBle += 1;
    cumulativeWifi.push(cWifi);
    cumulativeBle.push(cBle);
  }

  // Spline smooth then subsample to MAX_ANIM_FRAMES
  const rawCoords = rawPoints.map((p) => [p.latitude, p.longitude]);
  const smoothed = smoothPath(rawCoords, 1200, 10);
  const frames = subsamplePath(smoothed, MAX_ANIM_FRAMES);

  animationState.isAnimating = true;
  animationState.currentIndex = 0;
  animationState.rawPoints = rawPoints;
  animationState.cumulativeWifi = cumulativeWifi;
  animationState.cumulativeBle = cumulativeBle;
  animationState.frames = frames;
  animationState.totalFrames = frames.length;
  const overlay = document.getElementById("animate-overlay");
  if (overlay) overlay.style.display = "block";

  if (animationState.pathLine) {
    animationState.pathLine.remove();
    animationState.pathLine = null;
  }

  animationState.pathLine = L.polyline([], {
    color: "#111111",
    weight: 3,
    opacity: 0.9,
    dashArray: "6 10",
    smoothFactor: 2.5,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(state.map);

  // Fit to all points (non-animated) then record zoom for ramp
  const bounds = L.latLngBounds(rawPoints.map((p) => [p.latitude, p.longitude]));
  if (bounds.isValid()) {
    state.map.fitBounds(bounds, { padding: [48, 48], animate: false });
  }
  animationState.startZoom = state.map.getZoom();
  animationState.targetZoom = Math.min(14, animationState.startZoom + 5);
  animationState.lastZoom = animationState.startZoom;

  state.map.setMinZoom(animationState.startZoom - 0.1);
  state.map.setMaxZoom(Math.max(18, animationState.targetZoom + 2));

  animateStep();
}

function animateStep() {
  if (!animationState.isAnimating) return;

  const si = animationState.currentIndex;
  const total = animationState.totalFrames;

  if (si >= total) {
    stopAnimation();
    return;
  }

  const coord = animationState.frames[si];
  animationState.pathLine.addLatLng(coord);

  // Zoom: ease-in during first ~40% of animation, then hold
  const progress = total > 1 ? si / (total - 1) : 1;
  const zoomProgress = Math.min(1, progress * 2.5);
  const zoomEase = 1 - Math.pow(1 - zoomProgress, 2);
  const intendedZoom = animationState.startZoom + (animationState.targetZoom - animationState.startZoom) * zoomEase;
  const currentZoom =
    animationState.lastZoom === null
      ? intendedZoom
      : Math.max(animationState.lastZoom, intendedZoom);
  animationState.lastZoom = currentZoom;

  // Update map view every 4 frames to avoid over-calling setView
  if (si % 4 === 0 || si === total - 1) {
    state.map.setView(coord, currentZoom, {
      animate: true,
      duration: 0.45,
      easeLinearity: 0.6,
      noMoveStart: true,
    });
    state.map.invalidateSize({ pan: false });
  }

  // Map frame index → raw point index for stats
  const rawTotal = animationState.rawPoints.length;
  const rawIdx = Math.min(rawTotal - 1, Math.floor((si / total) * rawTotal));
  updateAnimateOverlay(
    rawIdx,
    animationState.rawPoints,
    animationState.cumulativeWifi,
    animationState.cumulativeBle
  );

  // Sync time slider during animation (without changing All time toggle)
  const timeSlider = document.getElementById("time-slider");
  const timeDisplay = document.getElementById("time-display");
  if (timeSlider && timeDisplay) {
    const ts = animationState.rawPoints[rawIdx]?.firstSeenUnix;
    if (ts) {
      timeSlider.value = ts;
      timeDisplay.textContent = new Date(ts * 1000).toLocaleDateString();
    }
  }

  animationState.currentIndex++;
  const delay = getAnimFrameDelay(si, total);
  animationState.animationId = setTimeout(animateStep, delay);
}

function updateAnimateOverlay(rawIdx, points, cumulativeWifi, cumulativeBle) {
  const pt = points[rawIdx];
  if (!pt) return;
  const date = pt.firstSeenUnix ? new Date(pt.firstSeenUnix * 1000) : new Date();

  const yearEl = document.getElementById("animate-year");
  const dateEl = document.getElementById("animate-date");
  const countEl = document.getElementById("animate-count");
  const typeEl = document.getElementById("animate-type");
  const wifiEl = document.getElementById("animate-wifi");
  const bleEl = document.getElementById("animate-ble");

  if (yearEl) yearEl.textContent = date.getFullYear();
  if (dateEl) dateEl.textContent = date.toLocaleDateString("en-US", { month: "long" });
  if (countEl) countEl.textContent = (rawIdx + 1).toLocaleString();
  if (typeEl) typeEl.textContent = rawIdx === 0 ? "network found" : "networks found";
  if (wifiEl) wifiEl.textContent = `${(cumulativeWifi[rawIdx] || 0).toLocaleString()} WiFi`;
  if (bleEl) bleEl.textContent = `${(cumulativeBle[rawIdx] || 0).toLocaleString()} BLE`;
}

function stopAnimation() {
  animationState.isAnimating = false;
  if (animationState.animationId) {
    clearTimeout(animationState.animationId);
    animationState.animationId = null;
  }

  animationState.lastZoom = null;
  if (animationState.pathLine) {
    animationState.pathLine.remove();
    animationState.pathLine = null;
  }
  state.map.setMinZoom(2);
  state.map.setMaxZoom(19);

  const animateBtn = document.getElementById("animate-btn");
  if (animateBtn) animateBtn.textContent = "Animate";

  // Hide overlay after a short pause so the final count is readable
  setTimeout(() => {
    const overlay = document.getElementById("animate-overlay");
    if (overlay) overlay.style.display = "none";
  }, 2200);

  // Restore cluster layer on top of the path line
  applyFilters();
  setStatus("Animation complete");
}

// Export frame removed

// Share card removed

function exportAnimationGif() {
  if (gifExportState.isExporting) return;
  if (!state.map) return;

  if (animationState.isAnimating) {
    stopAnimation();
  }

  const ordered = getOrderedPoints();
  if (ordered.length === 0) {
    setStatus("No points to export");
    return;
  }

  const GifCtor = window.GIF;
  if (!GifCtor) {
    setStatus("GIF export library not loaded");
    return;
  }

  gifExportState.isExporting = true;
  setStatus("Rendering animation GIF... (this can take a bit)");

  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap) {
    gifExportState.isExporting = false;
    setStatus("Map container not found");
    return;
  }

  const prevBtnText = document.getElementById("animate-btn")?.textContent;
  if (prevBtnText) document.getElementById("animate-btn").textContent = "Rendering...";

  const overlay = document.getElementById("animate-overlay");
  if (overlay) overlay.style.display = "block";

  // Prepare path + stats (reuse animation logic)
  const rawCoords = ordered.map((p) => [p.latitude, p.longitude]);
  const smoothed = smoothPath(rawCoords, 1200, 10);
  const frames = subsamplePath(smoothed, 220);

  let cWifi = 0;
  let cBle = 0;
  const cumulativeWifi = [];
  const cumulativeBle = [];
  for (const pt of ordered) {
    if (pt.type === "WIFI") cWifi += 1;
    else cBle += 1;
    cumulativeWifi.push(cWifi);
    cumulativeBle.push(cBle);
  }

  state.layerGroup.clearLayers();
  const pathLine = L.polyline([], {
    color: "#111111",
    weight: 3,
    opacity: 0.9,
    dashArray: "6 10",
    smoothFactor: 2.5,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  }).addTo(state.map);

  const bounds = L.latLngBounds(ordered.map((p) => [p.latitude, p.longitude]));
  if (bounds.isValid()) {
    state.map.fitBounds(bounds, { padding: [48, 48], animate: false });
  }
  const startZoom = state.map.getZoom();
  const targetZoom = Math.min(14, startZoom + 5);

  const gif = new GifCtor({
    workers: 2,
    quality: 12,
    workerScript: "js/gif.worker.js",
    width: mapWrap.offsetWidth,
    height: mapWrap.offsetHeight,
  });

  let frameIdx = 0;
  const totalFrames = frames.length;

  const capture = () => {
    const progress = totalFrames > 1 ? frameIdx / (totalFrames - 1) : 1;
    const zoomProgress = Math.min(1, progress * 2.5);
    const zoomEase = 1 - Math.pow(1 - zoomProgress, 2);
    const currentZoom = startZoom + (targetZoom - startZoom) * zoomEase;

    const coord = frames[frameIdx];
    pathLine.addLatLng(coord);
    state.map.setView(coord, currentZoom, { animate: false });

    const rawIdx = Math.min(ordered.length - 1, Math.floor((frameIdx / totalFrames) * ordered.length));
    updateAnimateOverlay(rawIdx, ordered, cumulativeWifi, cumulativeBle);

    state.map.invalidateSize({ pan: false });

    const delay = getAnimFrameDelay(frameIdx, totalFrames);

    html2canvas(mapWrap, {
      scale: 1.5,
      backgroundColor: "#0a0a0a",
      logging: false,
      useCORS: true,
    })
      .then((canvas) => {
        gif.addFrame(canvas, { delay });
        frameIdx += 1;
        if (frameIdx < totalFrames) {
          setTimeout(() => requestAnimationFrame(capture), delay);
        } else {
          gif.on("finished", (blob) => {
            const link = document.createElement("a");
            link.download = `wdmap-animation-${Date.now()}.gif`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
            gifExportState.isExporting = false;
            if (overlay) overlay.style.display = "none";
            if (prevBtnText) document.getElementById("animate-btn").textContent = prevBtnText;
            applyFilters();
            setStatus("Animation GIF saved");
          });
          gif.render();
        }
      })
      .catch((err) => {
        gifExportState.isExporting = false;
        if (overlay) overlay.style.display = "none";
        if (prevBtnText) document.getElementById("animate-btn").textContent = prevBtnText;
        applyFilters();
        setStatus(`Animation GIF failed: ${err.message}`);
      });
  };

  capture();
}

function wireUi() {
  document.getElementById("import-btn").addEventListener("click", () => {
    void importFiles();
  });

  document.getElementById("export-btn").addEventListener("click", exportData);

  document.getElementById("load-btn").addEventListener("click", () => {
    document.getElementById("load-input").click();
  });

  document.getElementById("load-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      void loadDataFromFile(file);
    }
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    void clearAllData();
  });

  const animateBtn = document.getElementById("animate-btn");
  if (animateBtn) animateBtn.addEventListener("click", () => {
    if (animationState.isAnimating) {
      stopAnimation();
      animateBtn.textContent = "Animate";
    } else {
      if (state.allPoints.length === 0) {
        setStatus("No points to animate");
        return;
      }
      animateBtn.textContent = "Stop";
      startAnimation();
    }
  });

  // Export frame removed

  // Share card removed

  document.getElementById("apply-filters").addEventListener("click", applyFilters);
  document.getElementById("reset-filters").addEventListener("click", resetFilters);

  const filterToggle = document.getElementById("filter-toggle");
  if (filterToggle) {
    filterToggle.addEventListener("click", () => {
      const panel = document.getElementById("filter-panel");
      if (!panel) return;
      const isOpen = panel.classList.toggle("open");
      panel.setAttribute("aria-hidden", String(!isOpen));
      filterToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  const privacyToggle = document.getElementById("privacy-toggle");
  if (privacyToggle) {
    privacyToggle.addEventListener("click", () => {
      state.privacyMode = !state.privacyMode;
      const mapWrap = document.querySelector(".map-wrap");
      if (mapWrap) {
        mapWrap.classList.toggle("privacy-on", state.privacyMode);
      }
      if (state.baseTiles) {
        if (state.privacyMode) {
          state.map.removeLayer(state.baseTiles);
        } else {
          state.baseTiles.addTo(state.map);
        }
      }
      privacyToggle.setAttribute("aria-pressed", String(state.privacyMode));
      privacyToggle.textContent = state.privacyMode ? "Privacy On" : "Privacy";
    });
  }

  const filterType = document.getElementById("filter-type");
  if (filterType) filterType.addEventListener("change", () => queueFilter(120));

  const filterSearch = document.getElementById("filter-search");
  if (filterSearch) filterSearch.addEventListener("input", () => queueFilter(220));

  const filterRssiMin = document.getElementById("filter-rssi-min");
  if (filterRssiMin) filterRssiMin.addEventListener("input", () => queueFilter(220));

  const filterRssiMax = document.getElementById("filter-rssi-max");
  if (filterRssiMax) filterRssiMax.addEventListener("input", () => queueFilter(220));

  const timeSlider = document.getElementById("time-slider");
  if (timeSlider) timeSlider.addEventListener("input", handleTimeSlider);

  const timeAllToggle = document.getElementById("time-all-toggle");
  if (timeAllToggle) timeAllToggle.addEventListener("change", handleTimeAllToggle);
}

async function loadPersistedData() {
  state.datasets = await dbGetMeta("datasets", []);
  state.nextPointId = await dbGetMeta("nextPointId", 1);
  state.allPoints = await dbGetAllObservations();
  state.allPoints.sort((a, b) => b.id - a.id);
  state.pointById = new Map(state.allPoints.map((point) => [point.id, point]));
}

async function boot() {
  initMap();
  wireUi();
  
  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
  }, 50);
  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
  }, 200);
  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
  }, 500);

  setStatus("Loading local browser data...");
  try {
    await loadPersistedData();
    if (state.allPoints.length > 0 && !state.didInitialFitToData) {
      fitMapToPoints(state.allPoints);
      state.didInitialFitToData = true;
    }
    renderDatasets();
    applyFilters();
    updateTimeSlider();
    setStatus(`Ready. Loaded ${formatNumber(state.allPoints.length)} points from browser storage.`);
  } catch (error) {
    setStatus(`Storage init warning: ${error.message}`);
  }
}

document.addEventListener('DOMContentLoaded', boot);
