let map;
let geocoder;
let placesService;
let autocompleteService;
let marker;
let infoWindow;
let serviceAreas;
let publishedServiceAreas;
let coverageBounds;
let geometryLibrary = new Map();
let countyCatalogLibrary = new Map();
let matchedCountyName = null;
let matchedLayer = null;
let suggestionPredictions = [];
let activeSuggestionIndex = -1;
let suggestionsTimer = null;

const INITIAL_CENTER = { lat: 36.7, lng: -84.8 };
const INITIAL_ZOOM = 5;
const DEFAULT_DATA_URL = "service_areas.geojson";
const DEFAULT_PRIMARY_CSV_URL = "primary_service_area.csv";
const DEFAULT_EXTENDED_CSV_URL = "extended_service_area.csv";
const LOCAL_DATA_KEY = "advantage_service_area_geojson_override_v1";

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#475569" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#172033" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#263449" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#334155" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#082f49" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7dd3fc" }] }
];

window.initMap = async function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    styles: DARK_MAP_STYLE,
    gestureHandling: "greedy"
  });

  geocoder = new google.maps.Geocoder();
  infoWindow = new google.maps.InfoWindow();
  placesService = new google.maps.places.PlacesService(map);
  autocompleteService = new google.maps.places.AutocompleteService();

  const baseServiceAreas = await fetch(DEFAULT_DATA_URL).then((response) => response.json());
  validateServiceAreaGeoJson(baseServiceAreas);
  countyCatalogLibrary = buildFeatureLibrary(baseServiceAreas);
  publishedServiceAreas = await buildPublishedServiceAreas(baseServiceAreas);

  const savedServiceAreas = loadSavedServiceAreas();
  setServiceAreaData(savedServiceAreas || publishedServiceAreas, savedServiceAreas ? "Saved browser CSV import" : "Published CSV map data", false);

  map.data.addListener("click", (event) => {
    const name = event.feature.getProperty("name");
    const serviceArea = event.feature.getProperty("service_area");
    infoWindow.setContent(`<div class="info-window"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(serviceArea)}</p></div>`);
    infoWindow.setPosition(event.latLng);
    infoWindow.open(map);
  });

  wireLookupControls();
};

function wireLookupControls() {
  const input = document.getElementById("address-input");
  const suggestions = document.getElementById("suggestions");

  input.addEventListener("input", () => {
    const value = input.value.trim();
    activeSuggestionIndex = -1;

    if (!value) {
      clearSuggestions();
      clearLookup(false);
      return;
    }

    window.clearTimeout(suggestionsTimer);
    suggestionsTimer = window.setTimeout(() => loadSuggestions(value), 170);
  });

  input.addEventListener("keydown", (event) => {
    if (!suggestionPredictions.length || !suggestions.classList.contains("open")) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestionPredictions.length - 1);
      renderSuggestions(suggestionPredictions);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
      renderSuggestions(suggestionPredictions);
    }

    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestionPredictions[activeSuggestionIndex]);
    }

    if (event.key === "Escape") clearSuggestions();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".lookup-card")) clearSuggestions();
  });

  document.getElementById("address-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (suggestionPredictions.length === 1 && suggestions.classList.contains("open")) {
      selectSuggestion(suggestionPredictions[0]);
      return;
    }
    checkAddress();
  });

  document.getElementById("reset-map").addEventListener("click", fitCoverageBounds);
  document.getElementById("clear-search").addEventListener("click", () => clearLookup(true));
  wireDataControls();
}

function loadSuggestions(inputValue) {
  if (inputValue.length < 3) {
    clearSuggestions();
    return;
  }

  autocompleteService.getPlacePredictions(
    {
      input: inputValue,
      componentRestrictions: { country: "us" },
      bounds: coverageBounds || undefined,
      strictBounds: false,
      types: ["geocode"]
    },
    (predictions, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions || !predictions.length) {
        suggestionPredictions = [];
        renderEmptySuggestion("No obvious address match yet. Add city/state, or press Check to search anyway.");
        return;
      }

      suggestionPredictions = predictions.slice(0, 6);
      renderSuggestions(suggestionPredictions);
    }
  );
}

function renderSuggestions(predictions) {
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";

  predictions.forEach((prediction, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `suggestion-item${index === activeSuggestionIndex ? " active" : ""}`;
    item.setAttribute("role", "option");

    const mainText = prediction.structured_formatting?.main_text || prediction.description;
    const secondaryText = prediction.structured_formatting?.secondary_text || "";

    item.innerHTML = `
      <span class="suggestion-pin">⌖</span>
      <span>
        <span class="suggestion-main">${escapeHtml(mainText)}</span>
        <span class="suggestion-secondary">${escapeHtml(secondaryText)}</span>
      </span>
    `;
    item.addEventListener("click", () => selectSuggestion(prediction));
    suggestions.appendChild(item);
  });

  suggestions.classList.add("open");
}

function renderEmptySuggestion(message) {
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = `<div class="suggestion-empty">${escapeHtml(message)}</div>`;
  suggestions.classList.add("open");
}

function clearSuggestions() {
  suggestionPredictions = [];
  activeSuggestionIndex = -1;
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";
  suggestions.classList.remove("open");
}

function selectSuggestion(prediction) {
  const input = document.getElementById("address-input");
  input.value = prediction.description;
  clearSuggestions();
  setResult("idle", "Checking", "Pulling the selected match and comparing it to the coverage map.", "⌛", "", "Working");

  placesService.getDetails(
    {
      placeId: prediction.place_id,
      fields: ["formatted_address", "geometry", "name"]
    },
    (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
        checkAddress(prediction.description);
        return;
      }
      evaluateLocation(place.geometry.location, place.formatted_address || place.name || prediction.description);
    }
  );
}


function wireDataControls() {
  document.getElementById("open-import-modal")?.addEventListener("click", () => openModal("import-modal"));
  document.getElementById("open-export-modal")?.addEventListener("click", () => openModal("export-modal"));
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
  document.getElementById("modal-backdrop")?.addEventListener("click", closeModals);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });

  document.getElementById("export-primary-csv")?.addEventListener("click", () => exportCoverageCsv("Primary Service Area"));
  document.getElementById("export-extended-csv")?.addEventListener("click", () => exportCoverageCsv("Extended Service Area"));

  document.getElementById("restore-default-data")?.addEventListener("click", () => {
    localStorage.removeItem(LOCAL_DATA_KEY);
    clearImportFileInputs();
    setServiceAreaData(publishedServiceAreas, "Published CSV map data restored", true);
    setDataStatus("Published CSV data restored for this browser.", "good");
    closeModals();
  });

  document.getElementById("import-primary-csv")?.addEventListener("change", () => updateSelectedFileName("import-primary-csv", "primary-file-name"));
  document.getElementById("import-extended-csv")?.addEventListener("change", () => updateSelectedFileName("import-extended-csv", "extended-file-name"));
  document.getElementById("apply-csv-import")?.addEventListener("click", applyCsvImportFromModal);
}

function openModal(id) {
  document.getElementById("modal-backdrop").hidden = false;
  document.getElementById(id).hidden = false;
}

function closeModals() {
  const backdrop = document.getElementById("modal-backdrop");
  if (backdrop) backdrop.hidden = true;
  document.querySelectorAll(".modal-sheet").forEach((modal) => { modal.hidden = true; });
}

function updateSelectedFileName(inputId, labelId) {
  const file = document.getElementById(inputId)?.files?.[0];
  const label = document.getElementById(labelId);
  if (label) label.textContent = file ? file.name : "No file selected";
}

function clearImportFileInputs() {
  const primaryInput = document.getElementById("import-primary-csv");
  const extendedInput = document.getElementById("import-extended-csv");
  if (primaryInput) primaryInput.value = "";
  if (extendedInput) extendedInput.value = "";
  updateSelectedFileName("import-primary-csv", "primary-file-name");
  updateSelectedFileName("import-extended-csv", "extended-file-name");
}

async function applyCsvImportFromModal() {
  const primaryFile = document.getElementById("import-primary-csv")?.files?.[0];
  const extendedFile = document.getElementById("import-extended-csv")?.files?.[0];

  if (!primaryFile && !extendedFile) {
    setDataStatus("Choose at least one CSV to preview an import.", "warn");
    return;
  }

  try {
    const current = getCurrentCoverageSets();
    const primaryNames = primaryFile ? parseCountyNamesFromCsv(await primaryFile.text()) : [...current.primary];
    const extendedNames = extendedFile ? parseCountyNamesFromCsv(await extendedFile.text()) : [...current.extended];

    if (primaryFile && !primaryNames.length) throw new Error("Primary CSV did not include any county names.");
    if (extendedFile && !extendedNames.length) throw new Error("Extended CSV did not include any county names.");

    const primarySet = new Set(primaryNames.map(normalizeCountyName));
    const extendedSet = new Set(extendedNames.map(normalizeCountyName));

    // Primary wins if a county appears in both lists.
    primarySet.forEach((name) => extendedSet.delete(name));

    const { geojson, missingPrimary, missingExtended } = rebuildFromCountySets(primarySet, extendedSet);
    localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(geojson));
    setServiceAreaData(geojson, "Browser CSV import preview", true);
    clearImportFileInputs();
    closeModals();

    const missing = [...missingPrimary, ...missingExtended];
    if (missing.length) {
      setDataStatus(`Preview updated, but ${missing.length} counties were not found in the current county geometry catalog. Export/replace the CSVs after review.`, "warn");
    } else {
      setDataStatus("CSV preview updated. To publish for the team, replace the Primary and Extended CSV files in GitHub and push.", "good");
    }
  } catch (error) {
    setDataStatus(`CSV import failed: ${error.message}`, "bad");
  }
}

async function buildPublishedServiceAreas(baseGeoJson) {
  try {
    const [primaryResponse, extendedResponse] = await Promise.all([
      fetch(DEFAULT_PRIMARY_CSV_URL, { cache: "no-store" }),
      fetch(DEFAULT_EXTENDED_CSV_URL, { cache: "no-store" })
    ]);

    if (!primaryResponse.ok || !extendedResponse.ok) return baseGeoJson;

    const [primaryText, extendedText] = await Promise.all([primaryResponse.text(), extendedResponse.text()]);
    const primaryNames = parseCountyNamesFromCsv(primaryText);
    const extendedNames = parseCountyNamesFromCsv(extendedText);
    if (!primaryNames.length && !extendedNames.length) return baseGeoJson;

    const primarySet = new Set(primaryNames.map(normalizeCountyName));
    const extendedSet = new Set(extendedNames.map(normalizeCountyName));
    primarySet.forEach((name) => extendedSet.delete(name));

    const { geojson } = rebuildFromCountySets(primarySet, extendedSet);
    return geojson.features.length ? geojson : baseGeoJson;
  } catch (_error) {
    return baseGeoJson;
  }
}

function buildFeatureLibrary(geojson) {
  const library = new Map();
  geojson.features.forEach((feature) => {
    library.set(normalizeCountyName(feature.properties.name), cloneJson(feature));
  });
  return library;
}

function loadSavedServiceAreas() {
  try {
    const saved = localStorage.getItem(LOCAL_DATA_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    validateServiceAreaGeoJson(parsed);
    return parsed;
  } catch (_error) {
    localStorage.removeItem(LOCAL_DATA_KEY);
    return null;
  }
}

function setServiceAreaData(geojson, sourceLabel, shouldClearLookup) {
  validateServiceAreaGeoJson(geojson);
  serviceAreas = cloneJson(geojson);
  rebuildGeometryLibrary(serviceAreas);

  map.data.forEach((feature) => map.data.remove(feature));
  map.data.addGeoJson(serviceAreas);
  map.data.setStyle(styleFeature);
  coverageBounds = buildGeoJsonBounds(serviceAreas);

  if (shouldClearLookup) clearLookup(true);
  else fitCoverageBounds();

  updateDataSummary(sourceLabel);
}

function validateServiceAreaGeoJson(geojson) {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("File must be a GeoJSON FeatureCollection.");
  }

  const badFeature = geojson.features.find((feature) => !feature.geometry || !feature.properties?.name || !feature.properties?.service_area);
  if (badFeature) {
    throw new Error("Each feature needs geometry, properties.name, and properties.service_area.");
  }
}

function rebuildGeometryLibrary(geojson) {
  geometryLibrary = new Map();
  geojson.features.forEach((feature) => {
    geometryLibrary.set(normalizeCountyName(feature.properties.name), cloneJson(feature));
  });
}

function rebuildFromCountySets(primarySet, extendedSet) {
  const features = [];
  const missingPrimary = [];
  const missingExtended = [];

  const sourceLibrary = countyCatalogLibrary.size ? countyCatalogLibrary : geometryLibrary;

  primarySet.forEach((name) => {
    const feature = sourceLibrary.get(name);
    if (!feature) { missingPrimary.push(name); return; }
    const copy = cloneJson(feature);
    copy.properties.service_area = "Primary Service Area";
    copy.properties.priority = 1;
    features.push(copy);
  });

  extendedSet.forEach((name) => {
    const feature = sourceLibrary.get(name);
    if (!feature) { missingExtended.push(name); return; }
    const copy = cloneJson(feature);
    copy.properties.service_area = "Extended Service Area";
    copy.properties.priority = 2;
    features.push(copy);
  });

  return { geojson: { type: "FeatureCollection", features }, missingPrimary, missingExtended };
}

function getCurrentCoverageSets() {
  const primary = new Set();
  const extended = new Set();
  serviceAreas.features.forEach((feature) => {
    const key = normalizeCountyName(feature.properties.name);
    if (feature.properties.service_area === "Primary Service Area") primary.add(key);
    if (feature.properties.service_area === "Extended Service Area") extended.add(key);
  });
  return { primary, extended };
}

function parseCountyNamesFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return [];

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const nameIndex = header.findIndex((value) => ["name", "county", "county name"].includes(value));
  const startIndex = nameIndex >= 0 ? 1 : 0;
  const columnIndex = nameIndex >= 0 ? nameIndex : 0;

  return rows.slice(startIndex)
    .map((row) => (row[columnIndex] || "").trim())
    .filter(Boolean);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') { value += '"'; index++; }
      else inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) { row.push(value); value = ""; continue; }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function exportCoverageCsv(layerName) {
  const rows = serviceAreas.features
    .filter((feature) => feature.properties.service_area === layerName)
    .map((feature) => feature.properties.name)
    .sort((a, b) => a.localeCompare(b));

  const fileName = layerName === "Primary Service Area" ? "primary_service_area.csv" : "extended_service_area.csv";
  const csv = ["Name", ...rows.map(csvEscape)].join("\n");
  downloadTextFile(fileName, csv, "text/csv");
}

function updateDataSummary(sourceLabel) {
  const primaryCount = serviceAreas.features.filter((feature) => feature.properties.service_area === "Primary Service Area").length;
  const extendedCount = serviceAreas.features.filter((feature) => feature.properties.service_area === "Extended Service Area").length;
  setDataStatus(`${sourceLabel}. ${primaryCount} Primary counties, ${extendedCount} Extended counties.`, "");
}

function setDataStatus(message, tone = "") {
  const status = document.getElementById("data-status");
  if (!status) return;
  status.textContent = message;
  status.className = `data-status ${tone}`.trim();
}

function downloadTextFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeCountyName(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function csvEscape(value) {
  const text = String(value || "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function styleFeature(feature) {
  const serviceArea = feature.getProperty("service_area");
  const name = feature.getProperty("name");
  const isMatched = name === matchedCountyName && serviceArea === matchedLayer;

  if (isMatched) {
    return { fillColor: "#fbbf24", fillOpacity: 0.78, strokeColor: "#f8fafc", strokeOpacity: 0.96, strokeWeight: 3, clickable: true, zIndex: 4 };
  }

  if (serviceArea === "Primary Service Area") {
    return { fillColor: "#22c55e", fillOpacity: 0.48, strokeColor: "#bbf7d0", strokeOpacity: 0.46, strokeWeight: 1, clickable: true, zIndex: 2 };
  }

  return { fillColor: "#94a3b8", fillOpacity: 0.24, strokeColor: "#cbd5e1", strokeOpacity: 0.25, strokeWeight: 1, clickable: true, zIndex: 1 };
}

function checkAddress(overrideAddress) {
  const input = document.getElementById("address-input");
  const button = document.getElementById("check-button");
  const address = (overrideAddress || input.value).trim();

  if (!address) return;
  clearSuggestions();
  button.disabled = true;
  setResult("idle", "Checking", "Looking up the address and comparing it to the service area map.", "⌛", "", "Working");

  geocoder.geocode(
    {
      address,
      region: "us",
      bounds: coverageBounds || undefined,
      componentRestrictions: { country: "US" }
    },
    (results, status) => {
      button.disabled = false;

      if (status !== "OK" || !results?.length) {
        matchedCountyName = null;
        matchedLayer = null;
        map.data.setStyle(styleFeature);
        setResult("error", "Address not found", "Try a more complete address, or choose one of the possible matches while typing.", "✕", "", "No match");
        return;
      }

      if (results.length > 1 && !overrideAddress) {
        renderGeocodeMatches(results.slice(0, 6));
        setResult("idle", "Choose a match", "Multiple possible locations were found. Select the best match from the list below the address field.", "⌕", "", "Possible matches");
        return;
      }

      evaluateLocation(results[0].geometry.location, results[0].formatted_address);
    }
  );
}

function renderGeocodeMatches(results) {
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";
  results.forEach((result) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "suggestion-item";
    item.innerHTML = `
      <span class="suggestion-pin">⌖</span>
      <span>
        <span class="suggestion-main">${escapeHtml(result.formatted_address.split(",")[0])}</span>
        <span class="suggestion-secondary">${escapeHtml(result.formatted_address)}</span>
      </span>
    `;
    item.addEventListener("click", () => {
      document.getElementById("address-input").value = result.formatted_address;
      clearSuggestions();
      evaluateLocation(result.geometry.location, result.formatted_address);
    });
    suggestions.appendChild(item);
  });
  suggestions.classList.add("open");
}

function evaluateLocation(location, formattedAddress) {
  const point = turf.point([location.lng(), location.lat()]);
  const matches = serviceAreas.features.filter((feature) => turf.booleanPointInPolygon(point, feature));
  const primaryMatch = matches.find((feature) => feature.properties.service_area === "Primary Service Area");
  const extendedMatch = matches.find((feature) => feature.properties.service_area === "Extended Service Area");
  const hit = primaryMatch || extendedMatch || null;

  updateMarker(location, formattedAddress);
  map.panTo(location);
  map.setZoom(10);

  if (hit) {
    matchedCountyName = hit.properties.name;
    matchedLayer = hit.properties.service_area;
    map.data.setStyle(styleFeature);

    if (hit.properties.service_area === "Primary Service Area") {
      setResult("primary", "Primary Service Area", formattedAddress, "✓", `Matched county: ${hit.properties.name}`, "Approved");
    } else {
      setResult("extended", "Extended Service Area", formattedAddress, "!", `Matched county: ${hit.properties.name}`, "Review");
    }
  } else {
    matchedCountyName = null;
    matchedLayer = null;
    map.data.setStyle(styleFeature);
    setResult("out", "Not in Service Area", formattedAddress, "✕", "No matching service-area county found.", "Out of area");
  }
}

function updateMarker(location, title) {
  if (!marker) {
    marker = new google.maps.Marker({
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#f8fafc",
        fillOpacity: 1,
        strokeColor: "#0f172a",
        strokeWeight: 4
      }
    });
  }
  marker.setPosition(location);
  marker.setTitle(title);
}

function setResult(type, title, detail, icon, county = "", kicker = "Result") {
  const card = document.getElementById("result-card");
  card.className = `result-card ${type}`;
  document.getElementById("result-icon").textContent = icon;
  document.getElementById("result-kicker").textContent = kicker;
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-detail").textContent = detail;
  document.getElementById("result-county").textContent = county;
}

function clearLookup(clearInput) {
  if (clearInput) document.getElementById("address-input").value = "";
  clearSuggestions();
  if (marker) marker.setMap(null);
  marker = null;
  matchedCountyName = null;
  matchedLayer = null;
  map.data.setStyle(styleFeature);
  setResult("idle", "Search an address", "The map will drop a pin and compare the location against the 2023 service-area counties.", "⌕", "", "Ready");
  fitCoverageBounds();
}

function fitCoverageBounds() {
  if (!coverageBounds || coverageBounds.isEmpty()) {
    map.setCenter(INITIAL_CENTER);
    map.setZoom(INITIAL_ZOOM);
    return;
  }
  map.fitBounds(coverageBounds, { top: 96, right: 56, bottom: 56, left: 56 });
}

function buildGeoJsonBounds(geojson) {
  const bounds = new google.maps.LatLngBounds();
  geojson.features.forEach((feature) => {
    walkCoordinates(feature.geometry.coordinates, feature.geometry.type, (lng, lat) => bounds.extend({ lat, lng }));
  });
  return bounds;
}

function walkCoordinates(coordinates, type, callback) {
  if (type === "Point") { callback(coordinates[0], coordinates[1]); return; }
  if (type === "LineString" || type === "MultiPoint") { coordinates.forEach((coord) => callback(coord[0], coord[1])); return; }
  if (type === "Polygon" || type === "MultiLineString") { coordinates.flat(1).forEach((coord) => callback(coord[0], coord[1])); return; }
  if (type === "MultiPolygon") coordinates.flat(2).forEach((coord) => callback(coord[0], coord[1]));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
