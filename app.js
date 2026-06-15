let map;
let geocoder;
let marker;
let infoWindow;
let serviceAreas;
let matchedCountyName = null;
let matchedLayer = null;

const INITIAL_CENTER = { lat: 36.7, lng: -84.8 };
const INITIAL_ZOOM = 5;

window.initMap = async function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  geocoder = new google.maps.Geocoder();
  infoWindow = new google.maps.InfoWindow();

  serviceAreas = await fetch("service_areas.geojson").then((response) => response.json());
  map.data.addGeoJson(serviceAreas);
  map.data.setStyle(styleFeature);

  map.data.addListener("click", (event) => {
    const name = event.feature.getProperty("name");
    const serviceArea = event.feature.getProperty("service_area");
    infoWindow.setContent(`<div class="info-window"><h3>${name}</h3><p>${serviceArea}</p></div>`);
    infoWindow.setPosition(event.latLng);
    infoWindow.open(map);
  });

  document.getElementById("address-form").addEventListener("submit", (event) => {
    event.preventDefault();
    checkAddress();
  });
};

function styleFeature(feature) {
  const serviceArea = feature.getProperty("service_area");
  const name = feature.getProperty("name");
  const isMatched = name === matchedCountyName && serviceArea === matchedLayer;

  if (isMatched) {
    return {
      fillColor: "#ffd84a",
      fillOpacity: 0.72,
      strokeColor: "#111827",
      strokeWeight: 3,
      clickable: true,
    };
  }

  if (serviceArea === "Primary Service Area") {
    return {
      fillColor: "#5ee866",
      fillOpacity: 0.48,
      strokeColor: "#222222",
      strokeWeight: 1,
      clickable: true,
    };
  }

  return {
    fillColor: "#a8a8a8",
    fillOpacity: 0.26,
    strokeColor: "#222222",
    strokeWeight: 1,
    clickable: true,
  };
}

function checkAddress() {
  const input = document.getElementById("address-input");
  const button = document.querySelector("button[type='submit']");
  const address = input.value.trim();

  if (!address) return;

  button.disabled = true;
  setResult("idle", "Checking…", "Looking up the address and comparing it to the service area map.", "⌛");

  geocoder.geocode({ address, region: "us" }, (results, status) => {
    button.disabled = false;

    if (status !== "OK" || !results[0]) {
      matchedCountyName = null;
      matchedLayer = null;
      map.data.setStyle(styleFeature);
      setResult("error", "Address not found", "Try a more complete street address with city and state.", "❌");
      return;
    }

    const result = results[0];
    const location = result.geometry.location;
    const point = turf.point([location.lng(), location.lat()]);

    const matches = serviceAreas.features.filter((feature) => turf.booleanPointInPolygon(point, feature));
    const primaryMatch = matches.find((feature) => feature.properties.service_area === "Primary Service Area");
    const extendedMatch = matches.find((feature) => feature.properties.service_area === "Extended Service Area");
    const hit = primaryMatch || extendedMatch || null;

    updateMarker(location, result.formatted_address);
    map.setCenter(location);
    map.setZoom(9);

    if (hit) {
      matchedCountyName = hit.properties.name;
      matchedLayer = hit.properties.service_area;
      map.data.setStyle(styleFeature);

      if (hit.properties.service_area === "Primary Service Area") {
        setResult(
          "primary",
          "Primary Service Area",
          result.formatted_address,
          "✅",
          `Matched: ${hit.properties.name}`
        );
      } else {
        setResult(
          "extended",
          "Extended Service Area",
          result.formatted_address,
          "⚠️",
          `Matched: ${hit.properties.name}`
        );
      }
    } else {
      matchedCountyName = null;
      matchedLayer = null;
      map.data.setStyle(styleFeature);
      setResult("out", "Not in Service Area", result.formatted_address, "❌", "No matching county found.");
    }
  });
}

function updateMarker(location, title) {
  if (!marker) {
    marker = new google.maps.Marker({ map });
  }

  marker.setPosition(location);
  marker.setTitle(title);
}

function setResult(type, title, detail, icon, county = "") {
  const card = document.getElementById("result-card");
  card.className = `result-card ${type}`;
  document.getElementById("result-icon").textContent = icon;
  document.getElementById("result-title").textContent = title;
  document.getElementById("result-detail").textContent = detail;
  document.getElementById("result-county").textContent = county;
}
