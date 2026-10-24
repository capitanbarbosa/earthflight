import type { CesiumModule } from "./loader";
import { config } from "@/lib/config";

/**
 * Imagery stack (bottom → top):
 *   1. NASA GIBS Blue Marble (500 m, global, public domain)         – always, loads instantly from orbit
 *   2. Ground detail                                                  – provider chosen by NEXT_PUBLIC_IMAGERY
 *        eox      Sentinel-2 cloudless 2016, 10 m, CC BY 4.0           (default, keyless, commercial OK)
 *        esri     Esri World Imagery                                   (sub-metre; licence review required)
 *        maptiler MapTiler satellite                                   (key; commercial plan)
 *        ion      Cesium ion Bing Aerial                               (token; commercial plan)
 *   3. NASA GIBS VIIRS Black Marble city lights, shown on the night side only (dayAlpha 0 / nightAlpha 1).
 * See docs/DATA_SOURCES.md for licence and attribution details.
 */
export async function addImagery(Cesium: CesiumModule, scene: InstanceType<CesiumModule["Scene"]>) {
  const layers = scene.imageryLayers;
  const credits: string[] = [];

  const geo = () => new Cesium.GeographicTilingScheme();

  // 1. Blue Marble base (always)
  const base = new Cesium.UrlTemplateImageryProvider({
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg",
    tilingScheme: geo(),
    tileWidth: 512,
    tileHeight: 512,
    maximumLevel: 7,
    credit: new Cesium.Credit('Imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a>', false),
  });
  const baseLayer = layers.addImageryProvider(base);
  baseLayer.saturation = 1.08;

  // 2. Detail layer
  let detail: InstanceType<CesiumModule["ImageryLayer"]> | null = null;
  try {
    const provider = await createDetailProvider(Cesium);
    if (provider) {
      detail = layers.addImageryProvider(provider);
      detail.brightness = 1.05;
      detail.saturation = 1.1;
    }
  } catch (e) {
    console.warn("[imagery] detail provider failed, falling back to Blue Marble only", e);
  }

  // 2b. Regional high-resolution aerial photography (free, open-licensed national programmes).
  //     Only requested at street-level zooms; everywhere else the global layers above are used.
  //     NOTE: layers are inserted BELOW the night-lights layer (which must stay on top).
  if (config.imagery === "eox" && config.regionalImagery) {
    // Debug switch: /explore?skip=naip,usgs,gsi,ign disables individual regional layers.
    const skip = (typeof location !== "undefined" ? new URLSearchParams(location.search).get("skip") ?? "" : "").toLowerCase();
    for (const spec of regionalSpecs(Cesium)) {
      if (skip && skip.split(",").some((s) => s && spec.name.toLowerCase().includes(s))) continue;
      try {
        // IMPORTANT: gate by *terrain* level on the layer. Setting a high `minimumLevel` on the provider makes
        // Cesium build imagery tiles at that level for every coarse globe tile (millions) and crashes.
        const l = new Cesium.ImageryLayer(spec.provider, { minimumTerrainLevel: spec.minTerrainLevel });
        layers.add(l);
        l.brightness = 1.0;
        l.saturation = 1.05;
        credits.push(spec.name);
      } catch (e) {
        console.warn(`[imagery] ${spec.name} unavailable`, e);
      }
    }
  }

  // 3. Night lights
  const night = new Cesium.UrlTemplateImageryProvider({
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/2016-01-01/500m/{z}/{y}/{x}.png",
    tilingScheme: geo(),
    tileWidth: 512,
    tileHeight: 512,
    maximumLevel: 7,
    credit: new Cesium.Credit("Night lights: NASA Black Marble / GIBS", false),
  });
  const nightLayer = layers.addImageryProvider(night);
  nightLayer.dayAlpha = 0.0;
  nightLayer.nightAlpha = 1.0;
  nightLayer.brightness = 1.6;
  credits.push("NASA GIBS");
  return { baseLayer, detail, nightLayer, credits };
}

/**
 * Free national aerial-imagery programmes, restricted to their coverage rectangle so no requests are
 * wasted elsewhere.  Licences (see docs/DATA_SOURCES.md):
 *   US     USGS The National Map / USDA NAIP   public domain (credit requested)
 *   Japan  GSI "seamlessphoto"                  GSI terms of use (CC BY 4.0 compatible, attribution)
 *   France IGN BD ORTHO                         Licence Ouverte 2.0 (attribution)
 */
function regionalSpecs(Cesium: CesiumModule) {
  const merc = () => new Cesium.WebMercatorTilingScheme();
  const R = Cesium.Rectangle.fromDegrees;
  const credit = (html: string) => new Cesium.Credit(html, false);
  return [
    {
      // cached tiles, ~2.4 m/px, fast
      name: "USGS Imagery",
      minTerrainLevel: 7,
      provider: new Cesium.UrlTemplateImageryProvider({
        url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
        tilingScheme: merc(),
        maximumLevel: 16,
        rectangle: R(-125.0, 24.4, -66.9, 49.5),
        credit: credit('Imagery: <a href="https://www.usgs.gov/core-science-systems/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a> / USDA NAIP'),
      }),
    },
    {
      // NAIP via dynamic WMS, ~0.6 m/px, slower but only used when very low
      name: "USDA NAIP",
      minTerrainLevel: 16,
      provider: new Cesium.WebMapServiceImageryProvider({
        url: "https://imagery.nationalmap.gov/arcgis/services/USGSNAIPImagery/ImageServer/WMSServer",
        layers: "USGSNAIPImagery:NaturalColor",
        parameters: { format: "image/jpeg", transparent: false, styles: "" },
        tilingScheme: merc(),
        tileWidth: 256,
        tileHeight: 256,
        maximumLevel: 19,
        rectangle: R(-125.0, 24.4, -66.9, 49.5),
        credit: credit("Aerial imagery: USDA NAIP / USGS"),
      }),
    },
    {
      name: "GSI Japan",
      minTerrainLevel: 11,
      provider: new Cesium.UrlTemplateImageryProvider({
        url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
        tilingScheme: merc(),
        maximumLevel: 18,
        rectangle: R(122.9, 24.0, 146.0, 45.6),
        credit: credit('Imagery: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">GSI Japan</a>'),
      }),
    },
    {
      name: "IGN France",
      minTerrainLevel: 10,
      provider: new Cesium.UrlTemplateImageryProvider({
        url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        tilingScheme: merc(),
        maximumLevel: 19,
        rectangle: R(-4.9, 42.3, 8.3, 51.0),
        credit: credit("Imagery: © IGN (Géoplateforme)"),
      }),
    },
  ];
}

async function createDetailProvider(Cesium: CesiumModule) {
  switch (config.imagery) {
    case "esri": {
      const key = config.arcgisKey;
      return Cesium.ArcGisMapServerImageryProvider.fromUrl(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        {
          ...(key ? { token: key } : {}),
          enablePickFeatures: false,
          credit: "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        },
      );
    }
    case "maptiler": {
      if (!config.maptilerKey) throw new Error("NEXT_PUBLIC_MAPTILER_KEY missing");
      return new Cesium.UrlTemplateImageryProvider({
        url: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${config.maptilerKey}`,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 20,
        credit: new Cesium.Credit(
          '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
          false,
        ),
      });
    }
    case "ion": {
      if (!config.ionToken) throw new Error("NEXT_PUBLIC_CESIUM_ION_TOKEN missing");
      Cesium.Ion.defaultAccessToken = config.ionToken;
      return Cesium.IonImageryProvider.fromAssetId(2);
    }
    case "eox":
    default:
      return new Cesium.UrlTemplateImageryProvider({
        url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", // = the 2016 mosaic (global; the 2017 one has gaps)
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        tileWidth: 256,
        tileHeight: 256,
        maximumLevel: 14,
        credit: new Cesium.Credit(
          '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by <a href="https://eox.at" target="_blank" rel="noopener">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016) CC BY 4.0',
          false,
        ),
      });
  }
}
