# Advantage Service Area Checker

Static Google Maps tool for checking whether an entered address falls in the Primary Service Area, Extended Service Area, or outside the imported service-area county map.

## Setup

1. Replace `YOUR_GOOGLE_MAPS_API_KEY` in `index.html` with a browser-restricted Google Maps API key.
2. Enable these APIs on the Google Cloud project:
   - Maps JavaScript API
   - Places API
   - Geocoding API
3. Restrict the key to your live DigitalOcean domain, for example:
   - `https://your-app.ondigitalocean.app/*`
   - your custom domain if you add one later.
4. Commit/push to GitHub. DigitalOcean App Platform should redeploy automatically.

## Updating coverage data

The app now includes a small **Map data** import/export area in the left panel.

### Best publish workflow

1. Open the live tool.
2. Expand **Map data**.
3. Import an updated GeoJSON file, or import updated Primary/Extended CSV lists.
4. Review the map and test a few addresses.
5. Click **Export GeoJSON**.
6. Replace the repo file named `service_areas.geojson` with the exported file.
7. Commit/push to GitHub. DigitalOcean will publish the updated team map.

Important: importing data in the browser previews/saves it only for that browser. To update the shared team site, replace `service_areas.geojson` in GitHub.

### CSV format

The CSV importer expects a simple `Name` column, like:

```csv
Name
FL - Hillsborough County
FL - Pinellas County
GA - Cobb County
```

Primary CSV imports update the Primary layer. Extended CSV imports update the Extended layer.

Note: CSV imports can only use county shapes that already exist in the map's current GeoJSON geometry library. If you need to add brand-new counties that were not in the current geometry, import a full GeoJSON file instead.
