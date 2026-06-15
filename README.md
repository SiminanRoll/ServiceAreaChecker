# Advantage Service Area Checker

A static Google Maps web tool for checking whether an address is in the Advantage Technologies Primary Service Area, Extended Service Area, or outside the current service area.

## Files

- `index.html` — page structure and Google Maps script include
- `styles.css` — premium dark UI styling
- `app.js` — address lookup, autocomplete, map rendering, and CSV import/export logic
- `service_areas.geojson` — county geometry catalog used by the map
- `primary_service_area.csv` — published Primary Service Area county list
- `extended_service_area.csv` — published Extended Service Area county list

## Google API key

In `index.html`, replace:

```html
YOUR_GOOGLE_MAPS_API_KEY
```

with the browser-restricted Google Maps key.

Required APIs:

- Maps JavaScript API
- Places API
- Geocoding API

## Updating the service area

The visible update flow is CSV-only.

1. Open the live tool.
2. Click **Import**.
3. Choose a Primary CSV and/or Extended CSV.
4. Click **Preview imported map**.
5. Review the map and test addresses.
6. Click **Export**.
7. Download the current Primary and Extended CSVs.
8. Replace `primary_service_area.csv` and `extended_service_area.csv` in GitHub.
9. Commit and push. DigitalOcean App Platform should redeploy automatically.

The CSV format should include a county-name column named `Name`, such as:

```csv
Name
FL - Hillsborough County
GA - Fulton County
WI - Milwaukee County
```

## Important note

The CSV import can only display counties that exist in the included `service_areas.geojson` geometry catalog. If a future update adds brand-new counties that are not in the current geometry catalog, the app will warn that those counties could not be found. In that case, the geometry catalog needs to be regenerated with those counties included.
