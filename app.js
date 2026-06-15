let map;
let geocoder;
let autocomplete;
let marker;
let infoWindow;
let serviceAreas;
let coverageBounds;
let matchedCountyName = null;
let matchedLayer = null;

const INITIAL_CENTER = { lat: 36.7, lng: -84.8 };
const INITIAL_ZOOM = 5;

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

  serviceAreas = await fetch("service_areas.geojson").then((response) => response.json());
  map.data.addGeoJson(serviceAreas);
  map.data.setStyle(styleFeature);
  coverageBounds = buildGeoJsonBounds(serviceAreas);
  fitCoverageBounds();

  map.data.addListener("click", (event) => {
    const name = event.feature.getProperty("name");
    const serviceArea = event.feature.getProperty("service_area");
    infoWindow.setContent(`<div class="info-window"><h3>${name}</h3><p>${serviceArea}</p></div>`);
    infoWindow.setPosition(event.latLng);
    infoWindow.open(map);
  });

  wireAddressAutocomplete();
  wireControls();
};

function wireAddressAutocomplete() {
  const input = document.getElementById("address-input");

  autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "us" },
    fields: ["formatted_address", "geometry", "name"],
    strictBounds: false,
    types: ["address"]
  });

  if (coverageBounds) {
    autocomplete.setBounds(coverageBounds);
  }

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place || !place.geometry || !place.geometry.location) {
      checkAddress();
      return;
    }

    evaluateLocation(place.geometry.location, place.formatted_address || place.name || input.value.trim());
  });

  input.addEventListener("input", () => {
    if (!input.value.trim()) clearLookup(false);
  });

  document.getElementById("address-form").addEventListener("submit", (event) => {
    event.preventDefault();
    checkAddress();
  });
}

function wireControls() {
  document.getElementById("reset-map").addEventListener("click", fitCoverageBounds);
  document.getElementById("clear-search").addEventListener("click", () => clearLookup(true));
}

function styleFeature(feature) {
  const serviceArea = feature.getProperty("service_area");
  const name = feature.getProperty("name");
  const isMatched = name === matchedCountyName && serviceArea === matchedLayer;

  if (isMatched) {
    return {
      fillColor: "#fbbf24",
      fillOpacity: 0.78,
      strokeColor: "#f8fafc",
      strokeOpacity: 0.96,
      strokeWeight: 3,
      clickable: true,
      zIndex: 4
    };
  }

  if (serviceArea === "Primary Service Area") {
    return {
      fillColor: "#22c55e",
      fillOpacity: 0.46,
      strokeColor: "#bbf7d0",
      strokeOpacity: 0.44,
      strokeWeight: 1,
      clickable: true,
      zIndex: 2
    };
  }

  return {
    fillColor: "#94a3b8",
    fillOpacity: 0.22,
    strokeColor: "#cbd5e1",
    strokeOpacity: 0.24,
    strokeWeight: 1,
    clickable: true,
    zIndex: 1
  };
}

function checkAddress() {
  const input = document.getElementById("address-input");
  const button = document.getElementById("check-button");
  const address = input.value.trim();

  if (!address) return;

  button.disabled = true;
  setResult("idle", "Checking", "Looking up the address and comparing it to the service area map.", "⌛", "", "Working");

  geocoder.geocode({ address, region: "us" }, (results, status) => {
    button.disabled = false;

    if (status !== "OK" || !results[0]) {
      matchedCountyName = null;
      matchedLayer = null;
      map.data.setStyle(styleFeature);
      setResult("error", "Address not found", "Try a more complete street address with city and state.", "✕", "", "No match");
      return;
    }

    evaluateLocation(results[0].geometry.location, results[0].formatted_address);
  });
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
  if (marker) marker.setMap(null);
  marker = null;
  matchedCountyName = null;
  matchedLayer = null;
  map.data.setStyle(styleFeature);
  setResult("idle", "Search an address", "The tool will drop a pin and compare the address against the 2023 service-area counties.", "⌕", "", "Ready");
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
    walkCoordinates(feature.geometry.coordinates, feature.geometry.type, (lng, lat) => {
      bounds.extend({ lat, lng });
    });
  });

  return bounds;
}

function walkCoordinates(coordinates, type, callback) {
  if (type === "Point") {
    callback(coordinates[0], coordinates[1]);
    return;
  }

  if (type === "LineString" || type === "MultiPoint") {
    coordinates.forEach((coord) => callback(coord[0], coord[1]));
    return;
  }

  if (type === "Polygon" || type === "MultiLineString") {
    coordinates.flat(1).forEach((coord) => callback(coord[0], coord[1]));
    return;
  }

  if (type === "MultiPolygon") {
    coordinates.flat(2).forEach((coord) => callback(coord[0], coord[1]));
  }
}
