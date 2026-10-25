import { NextResponse } from "next/server";

/**
 * Keyless live-data proxy for the globe's data layers.
 *
 * Every source here is public and needs no account or API key.  Requests go through the server so that
 *  - the visitor's IP is not sent to third parties,
 *  - responses are cached (each upstream is polled at most once per TTL, however many visitors there are),
 *  - the browser gets one small, normalised JSON shape per layer.
 *
 * Sources and terms (see docs/DATA_SOURCES.md):
 *   quakes   USGS Earthquake Hazards Program feed          US Government work, public domain
 *   events   NASA EONET natural-event tracker               NASA, public domain
 *   aircraft adsb.lol community ADS-B network               ODbL 1.0 (attribution)
 *   vessels  Fintraffic Digitraffic marine AIS (Finland)    CC BY 4.0 (attribution)
 *   aurora   NOAA SWPC OVATION aurora nowcast               US Government work, public domain
 * If an upstream fails the route answers with the last good copy, or an empty list: nothing is ever invented.
 */
export const dynamic = "force-dynamic";

const UA = "earthflight (browser Earth flight simulator)";
type Json = Record<string, unknown>;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; stale: boolean }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return { data: hit.data as T, stale: false };
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const data = await p;
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return { data, stale: false };
  } catch (e) {
    if (hit) return { data: hit.data as T, stale: true };
    throw e;
  }
}

async function getJson(url: string, timeoutMs = 20000): Promise<Json> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
  return (await res.json()) as Json;
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------------------
async function quakes() {
  const j = await getJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson");
  const feats = (j.features as Array<{ id: string; properties: Json; geometry: { coordinates: number[] } }>) ?? [];
  return {
    updated: new Date().toISOString(),
    items: feats
      .map((f) => ({
        id: f.id,
        lon: r4(f.geometry.coordinates[0]),
        lat: r4(f.geometry.coordinates[1]),
        depth: r1(f.geometry.coordinates[2] ?? 0),
        mag: r1(Number(f.properties.mag ?? 0)),
        place: String(f.properties.place ?? "Earthquake"),
        time: Number(f.properties.time ?? 0),
        url: String(f.properties.url ?? ""),
      }))
      .filter((q) => Number.isFinite(q.lon) && Number.isFinite(q.lat)),
  };
}

// ---------------------------------------------------------------------------------------------------------
interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  categories: Array<{ id: string }>;
  geometry: Array<{ date: string; type: string; coordinates: unknown; magnitudeValue?: number | null; magnitudeUnit?: string | null }>;
}
function firstPoint(coords: unknown): [number, number] | null {
  // Point: [lon, lat]; Polygon: [[[lon, lat], ...]]
  let c: unknown = coords;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") return [c[0], c[1]];
  return null;
}
async function events() {
  const base = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open";
  const [fires, other] = await Promise.allSettled([
    getJson(`${base}&category=wildfires&limit=400`),
    getJson(`${base}&category=severeStorms,volcanoes,floods,dustHaze,seaLakeIce,landslides,tempExtremes,drought,snow&limit=300`),
  ]);
  const evs: EonetEvent[] = [];
  for (const r of [fires, other]) if (r.status === "fulfilled") evs.push(...((r.value.events as EonetEvent[]) ?? []));
  if (!evs.length) throw new Error("EONET unavailable");
  const items = [];
  for (const e of evs) {
    const g = e.geometry?.[e.geometry.length - 1];
    const pt = g ? firstPoint(g.coordinates) : null;
    if (!pt) continue;
    items.push({
      id: e.id,
      title: e.title,
      cat: e.categories?.[0]?.id ?? "other",
      lon: r4(pt[0]),
      lat: r4(pt[1]),
      mag: typeof g.magnitudeValue === "number" ? g.magnitudeValue : null,
      unit: g.magnitudeUnit ?? null,
      date: g.date,
      url: e.link ?? "",
    });
  }
  return { updated: new Date().toISOString(), items };
}

// ---------------------------------------------------------------------------------------------------------
async function aircraft(lat: number, lon: number) {
  const j = await getJson(`https://api.adsb.lol/v2/point/${lat.toFixed(2)}/${lon.toFixed(2)}/250`, 15000);
  const ac = (j.ac as Array<Json>) ?? [];
  const items = [];
  for (const a of ac) {
    const la = Number(a.lat), lo = Number(a.lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
    // the feed also carries ground obstacles / service vehicles / radar towers (ADS-B emitter categories C1-C3)
    if (["C1", "C2", "C3"].includes(String(a.category)) || ["TWR", "GRND", "GND", "SERV"].includes(String(a.t))) continue;
    const alt = a.alt_baro === "ground" ? 0 : Number(a.alt_geom ?? a.alt_baro ?? 0) * 0.3048;
    items.push({
      id: String(a.hex),
      call: String(a.flight ?? "").trim() || String(a.r ?? a.hex),
      type: String(a.t ?? ""),
      lat: r4(la),
      lon: r4(lo),
      alt: Math.round(Number.isFinite(alt) ? alt : 0),
      gs: Math.round(Number(a.gs ?? 0) * 0.514444), // knots → m/s
      trk: Math.round(Number(a.track ?? 0)),
      ground: a.alt_baro === "ground",
    });
  }
  return { updated: new Date().toISOString(), items };
}

// ---------------------------------------------------------------------------------------------------------
async function vessels() {
  const j = await getJson("https://meri.digitraffic.fi/api/ais/v1/locations", 25000);
  const feats = (j.features as Array<{ mmsi: number; geometry: { coordinates: number[] }; properties: Json }>) ?? [];
  const items = [];
  for (const f of feats) {
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const heading = Number(f.properties.heading);
    items.push({
      id: String(f.mmsi),
      lat: r4(lat),
      lon: r4(lon),
      sog: r1(Number(f.properties.sog ?? 0)), // knots
      cog: Math.round(Number(f.properties.cog ?? 0)),
      hdg: heading >= 0 && heading <= 360 ? heading : null,
    });
  }
  return { updated: String(j.dataUpdatedTime ?? new Date().toISOString()), items };
}

// ---------------------------------------------------------------------------------------------------------
async function aurora() {
  const j = await getJson("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", 25000);
  const coords = (j.coordinates as Array<[number, number, number]>) ?? [];
  if (!coords.length) throw new Error("no aurora data");
  // row-major grid: 181 rows (lat -90..90) × 360 columns (lon 0..359), values 0-100 (% probability)
  const values = new Array<number>(181 * 360).fill(0);
  for (const [lo, la, v] of coords) {
    const x = ((Math.round(lo) % 360) + 360) % 360;
    const y = Math.round(la) + 90;
    if (y >= 0 && y < 181) values[y * 360 + x] = Math.round(v);
  }
  return { updated: String(j["Observation Time"] ?? new Date().toISOString()), forecast: String(j["Forecast Time"] ?? ""), values };
}

// ---------------------------------------------------------------------------------------------------------
const TTL = { quakes: 5 * 60_000, events: 15 * 60_000, aircraft: 8_000, vessels: 20_000, aurora: 10 * 60_000 } as const;

export async function GET(req: Request, ctx: { params: Promise<{ layer: string }> }) {
  const { layer } = await ctx.params;
  const url = new URL(req.url);
  try {
    let out: { data: unknown; stale: boolean };
    switch (layer) {
      case "quakes": out = await cached("quakes", TTL.quakes, quakes); break;
      case "events": out = await cached("events", TTL.events, events); break;
      case "vessels": out = await cached("vessels", TTL.vessels, vessels); break;
      case "aurora": out = await cached("aurora", TTL.aurora, aurora); break;
      case "aircraft": {
        const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
        }
        // snap the query to a 1° grid so visitors in the same area share one upstream request
        const qlat = Math.round(lat), qlon = Math.round(lon);
        out = await cached(`aircraft:${qlat}:${qlon}`, TTL.aircraft, () => aircraft(qlat, qlon));
        break;
      }
      default:
        return NextResponse.json({ error: "unknown layer" }, { status: 404 });
    }
    return NextResponse.json({ ...(out.data as Json), stale: out.stale }, { headers: { "cache-control": "public, max-age=5" } });
  } catch (e) {
    console.warn(`[live] ${layer} failed: ${(e as Error).message}`);
    return NextResponse.json({ error: "upstream unavailable", items: [] }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
