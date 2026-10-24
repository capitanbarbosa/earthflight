import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Optional "search the whole world" geocoder proxy → OpenStreetMap Nominatim.
 *
 * Nominatim's public usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 *   - max 1 request/second, identifying User-Agent, cache results, NO autocomplete-as-you-type.
 * So: this endpoint is only called when the user presses Enter, is globally throttled to 1 req/s,
 * and caches results.  For real traffic point GEOCODER_URL at your own Nominatim/Photon instance
 * or a commercial geocoder.
 */
const BASE = process.env.GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
const UA = `EarthFlight/0.1 (+${process.env.NEXT_PUBLIC_SITE_URL || "https://example.com"}; ${process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@example.com"})`;

const cache = new Map<string, { at: number; data: unknown }>();
let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return NextResponse.json(hit.data, { headers: { "Cache-Control": "public, max-age=3600" } });

  // serialise upstream calls and keep ≥ 1.1 s between them
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCall + 1100 - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const url = `${BASE}?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return (await res.json()) as Array<{ place_id: number; display_name: string; lat: string; lon: string; type: string; name?: string }>;
  });
  chain = run.catch(() => undefined);

  try {
    const rows = await run;
    const data = {
      results: rows.map((r) => ({
        id: `geo-${r.place_id}`,
        name: r.name || r.display_name.split(",")[0],
        label: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
        type: r.type,
      })),
      attribution: "© OpenStreetMap contributors (Nominatim)",
    };
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ results: [], error: "Geocoder unavailable" }, { status: 502 });
  }
}
