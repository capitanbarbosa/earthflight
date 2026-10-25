# EARTHFLIGHT data sources and licences

Every source below is used **without an account, API key or sign-in**, and none of them is a Google product.
This document is an engineering summary, not legal advice: confirm the terms yourself before a commercial launch.
Items marked **verify** are the ones I would re-read first.

Not used, by design: Google Maps, Street View, Google Photorealistic 3D Tiles or any Google API; paid or
login-gated aircraft/ship feeds; OpenSky (non-commercial terms); anything that would require inventing buildings.

## Base map

| What | Source | Licence / terms | Notes |
| --- | --- | --- | --- |
| Whole-planet imagery (always on) | NASA GIBS Blue Marble Shaded Relief + Bathymetry (500 m) | NASA open data, credit requested | Loads instantly from orbit |
| Ground detail (default) | EOxCloudless **2016** mosaic, 10 m, via EOX public WMTS | **CC BY 4.0**, commercial use allowed with attribution; EOX gives no SLA and a fair-use policy applies | The 2018+ mosaics are **non-commercial** (CC BY-NC-SA) and must not be used on a commercial site. Attribution text follows EOX's published wording |
| Night lights | NASA GIBS VIIRS Black Marble | NASA open data | Night side only |
| US street-level aerial | USGS The National Map imagery and USDA NAIP | US Government work, public domain (credit requested) | Used only below street-level zoom, inside US bounds |
| Japan street-level aerial | GSI Japan `seamlessphoto` | GSI terms of use (attribution) **verify** | Inside Japan bounds |
| France street-level aerial | IGN Géoplateforme BD ORTHO | Licence Ouverte 2.0 (attribution) | Inside France bounds |
| Terrain | Re:Earth Terrain (Mapterhorn-derived quantized mesh, ellipsoidal heights) | CC BY 4.0 | Falls back to a smooth ellipsoid if unreachable |
| Buildings | OpenFreeMap vector tiles (OpenStreetMap data, OpenMapTiles schema) | ODbL data, attribution required: "© OpenStreetMap contributors" | Footprints and OSM height/levels only. Nothing is invented: a building without a height gets a plain default |
| Place search | OpenStreetMap Nominatim, proxied by `/api/geocode` | Nominatim usage policy (1 request/second, identifying User-Agent, no bulk use) | Set `GEOCODER_URL` to your own instance or a commercial geocoder for real traffic |

Cities not covered by free sub-metre aerial imagery (for example London, Dubai, Singapore, Cartagena, Medellín) show
the 10 m global imagery. Better imagery there needs a paid provider (Esri, MapTiler or Cesium ion are wired in as options).

## Live and interactive layers

All of these go through the server routes `/api/satellites` and `/api/live/[layer]`, or stream straight from NASA GIBS.
Server routes cache each upstream, so the number of upstream requests does not grow with the number of visitors,
and visitors' IP addresses are not sent to those providers. If an upstream is down the route serves the last good copy
or an empty list, and the Layers panel says so. Nothing is ever made up.

| Layer | Source | Refresh | Licence / terms | Honest limits |
| --- | --- | --- | --- | --- |
| Satellites in orbit | CelesTrak GP element sets (public) propagated in the browser with SGP4 (`satellite.js`, MIT) | elements cached 2 h, positions every frame | CelesTrak asks clients not to over-fetch; the route caches and backs off when rate-limited | Positions are model predictions, accurate to roughly kilometres. Only a subset of the catalogue is drawn |
| Earthquakes | USGS Earthquake Hazards Program, M2.5+ past day GeoJSON | 5 min | US Government work, public domain | |
| Storms, volcanoes, floods, sea ice, wildfires | NASA EONET v3, open events | 15 min | NASA, public domain | Curated event list, not a complete hazard feed. Wildfires are mostly US incident reports |
| Rain and snow | NASA GIBS `IMERG_Precipitation_Rate_30min` | 30 min product | NASA open data | Typically a few hours behind real time. Coarse (about 10 km) |
| Clouds | NASA GIBS GOES-East, GOES-West and Himawari Band 13 infrared, converted to a cloud overlay in the browser | about 10 min | NOAA data is public domain; Himawari is JMA data, used with credit **verify JMA terms** | No Europe or Africa coverage. Cold polar ground looks like cloud in infrared, so the layer fades out above about 56° latitude |
| Aurora | NOAA SWPC OVATION aurora nowcast | 10 min | US Government work, public domain | A probability model, not a camera image; quiet nights are faint |
| Sea temperature | NASA GIBS GHRSST MUR | daily | NASA open data | About a day behind |
| Aircraft near you | adsb.lol community ADS-B network, 250 nm radius around the ship | 10 s (positions are extrapolated between polls) | ODbL 1.0, attribution required | Only near the ship, only where volunteer receivers exist, and aircraft that opt out or have no ADS-B are missing. Not for navigation |
| Ships | Fintraffic Digitraffic marine AIS (`meri.digitraffic.fi`) | 30 s | CC BY 4.0, attribution required | **Finland and the Baltic only.** There is no free, keyless, global AIS feed that allows commercial use |

### What I looked at and rejected

* **Satellite fire hotspots** (NASA GIBS VIIRS/MODIS thermal anomalies): published only as vector tiles. NASA's raster
  fire service (FIRMS) needs a free key, so it breaks the no-sign-up rule. Fires appear through EONET instead.
* **Global ships:** aisstream.io and similar need an account and key; MarineTraffic and similar are paid.
* **Global aircraft:** OpenSky is non-commercial and rate-limited; FlightRadar24 and similar are paid. adsb.lol is the
  open option, and it is a regional query.
* **Live weather radar:** national services differ in terms and coverage, so only the global IMERG product is included.

## Attribution shown to users

Cesium's credit bar shows the imagery, terrain and tile credits automatically. The Layers panel footer names the
live-data sources. A full licences page belongs on the site's `/terms` and `/privacy` pages (already linked from the footer).

## Privacy note for the live layers

* The browser talks to your own server for aircraft, ships, quakes, events, aurora and satellites.
* The browser talks to NASA GIBS directly for map tiles (rain, clouds, sea temperature, base imagery). GIBS therefore sees
  visitors' IP addresses, as any tile server does. Mention this in the privacy policy, or proxy tiles if that matters to you.
* The aircraft request sends the ship's approximate position (rounded to a 1° grid on the server) to adsb.lol, not any
  user identity.
