# Advantage Service Area Checker

A small static web app for checking whether a typed address falls in the Primary Service Area, Extended Service Area, or outside the service area.

## What changed in this premium version

- Google Places address autocomplete
- Easy suggested-address selection
- Dark premium UI polish
- Coverage map automatically fits to the service-area footprint instead of starting on the full country
- Result card with clear Primary / Extended / Out-of-Area states
- Reset and clear controls

## Required Google APIs

Use a browser-restricted Google Maps API key with these enabled:

- Maps JavaScript API
- Places API
- Geocoding API

In `index.html`, replace:

```text
YOUR_GOOGLE_MAPS_API_KEY
```

with the production key. Restrict the key to the final hosted domain.

## Deploying

This is still a static site. Push the files to GitHub and redeploy through DigitalOcean App Platform.

Files:

- `index.html`
- `styles.css`
- `app.js`
- `service_areas.geojson`

## Notes

Coverage logic is based on the imported 2023 county polygons in `service_areas.geojson`.
