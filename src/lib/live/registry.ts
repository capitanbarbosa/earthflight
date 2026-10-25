/**
 * The globe's keyless data layers. Everything listed here works with no account and no API key.
 * Terms for each source are summarised in docs/DATA_SOURCES.md.
 */
export type LiveId = "rain" | "clouds" | "aurora" | "sst" | "quakes" | "events" | "aircraft" | "vessels";
export type LiveGroup = "Weather & space" | "Hazards" | "Traffic" | "Ocean";

export interface LiveMeta {
  id: LiveId;
  label: string;
  group: LiveGroup;
  /** One line: what you see. */
  blurb: string;
  /** Where the data comes from (shown as attribution). */
  source: string;
  /** How fresh it is, honestly. */
  freshness: string;
  /** Geographic coverage caveat, if any. */
  coverage?: string;
  /** "points" layers fetch JSON through /api/live; "imagery" layers stream map tiles from NASA GIBS. */
  kind: "points" | "imagery";
}

export const LIVE_LAYERS: LiveMeta[] = [
  {
    id: "rain", label: "Rain & snow", group: "Weather & space", kind: "imagery",
    blurb: "Global precipitation rate from the NASA IMERG satellite constellation.",
    source: "NASA GIBS · IMERG", freshness: "30-minute product, a few hours behind real time",
  },
  {
    id: "clouds", label: "Clouds (infrared)", group: "Weather & space", kind: "imagery",
    blurb: "Live cloud tops from the GOES-East, GOES-West and Himawari weather satellites.",
    source: "NASA GIBS · NOAA GOES / JMA Himawari", freshness: "about every 10 minutes",
    coverage: "Americas, Pacific and Asia/Australia; Europe and Africa are not covered",
  },
  {
    id: "aurora", label: "Aurora forecast", group: "Weather & space", kind: "imagery",
    blurb: "Where the northern and southern lights are likely right now (NOAA OVATION model).",
    source: "NOAA Space Weather Prediction Center", freshness: "model nowcast, updated every few minutes",
  },
  {
    id: "quakes", label: "Earthquakes", group: "Hazards", kind: "points",
    blurb: "Every magnitude 2.5+ earthquake from the past 24 hours, sized by magnitude.",
    source: "USGS Earthquake Hazards Program", freshness: "updated every few minutes",
  },
  {
    id: "events", label: "Storms, volcanoes & wildfires", group: "Hazards", kind: "points",
    blurb: "Open natural events: cyclones, volcanic activity, floods, sea ice and reported wildfires.",
    source: "NASA EONET", freshness: "curated event list, updated through the day",
    coverage: "wildfires are mostly US incident reports in this feed",
  },
  {
    id: "aircraft", label: "Aircraft near you", group: "Traffic", kind: "points",
    blurb: "Live ADS-B aircraft within about 460 km of your ship, with callsign tags for the nearest.",
    source: "adsb.lol community network (ODbL)", freshness: "refreshed every ~10 seconds",
    coverage: "only the area around you, and only where volunteer receivers exist",
  },
  {
    id: "vessels", label: "Ships (Finland & Baltic)", group: "Traffic", kind: "points",
    blurb: "Live AIS ship positions in Finnish waters and the Gulf of Finland.",
    source: "Fintraffic Digitraffic (CC BY 4.0)", freshness: "refreshed every ~30 seconds",
    coverage: "Finland only: global ship tracking needs a paid or registered data source",
  },
  {
    id: "sst", label: "Sea temperature", group: "Ocean", kind: "imagery",
    blurb: "Sea-surface temperature, from warm tropical water to polar cold.",
    source: "NASA GIBS · GHRSST MUR", freshness: "daily, about a day behind",
  },
];

export const LIVE_BY_ID = Object.fromEntries(LIVE_LAYERS.map((l) => [l.id, l])) as Record<LiveId, LiveMeta>;
export const LIVE_GROUPS: LiveGroup[] = ["Weather & space", "Hazards", "Traffic", "Ocean"];
