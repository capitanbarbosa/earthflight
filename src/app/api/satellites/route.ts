import { NextResponse } from "next/server";

/**
 * Orbital element sets for the "orbital traffic" layer, fetched from CelesTrak (public GP/TLE data) and
 * cached for 6 h so the browser never calls CelesTrak directly and we stay well inside its request limits.
 *
 * Response: { updated: ISO string, source, sats: Array<[kind, name, tleLine1, tleLine2]> }
 * If CelesTrak is unreachable the list is simply empty: the client then shows nothing (no invented data).
 */
export const dynamic = "force-dynamic"; // caching is handled below (in-memory copy + Cache-Control)

const BASE = "https://celestrak.org/NORAD/elements/gp.php";
type Kind = "station" | "sat" | "gps" | "starlink";
const GROUPS: Array<{ group: string; kind: Kind; max: number }> = [
  { group: "stations", kind: "station", max: 100 },
  { group: "visual", kind: "sat", max: 250 },
  { group: "gps-ops", kind: "gps", max: 60 },
  { group: "starlink", kind: "starlink", max: 3000 }, // sampled evenly; the full shell is ~10k objects
];

/**
 * Last good copy per group, kept in server memory. CelesTrak publishes new elements every few hours and asks
 * clients not to re-download an unchanged set (it answers repeat requests with 403), so we fetch at most once
 * per MIN_REFETCH_MS per group and fall back to the previous copy if a refresh fails.
 */
const MIN_REFETCH_MS = 2 * 60 * 60 * 1000;
const store = new Map<string, { text: string; at: number }>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_FAIL_MS = 15 * 60 * 1000; // don't hammer CelesTrak while it is refusing us

async function fetchGroup(group: string): Promise<string> {
  const have = store.get(group);
  if (have && Date.now() - have.at < MIN_REFETCH_MS) return have.text;
  const lastFail = failedAt.get(group);
  if (lastFail && Date.now() - lastFail < RETRY_AFTER_FAIL_MS) {
    if (have) return have.text;
    throw new Error("backing off after a recent failure");
  }
  try {
    const res = await fetch(`${BASE}?GROUP=${group}&FORMAT=tle`, {
      cache: "no-store", // some groups exceed Next's 2 MB data-cache limit; we keep our own copy instead
      signal: AbortSignal.timeout(25000),
      headers: { "user-agent": "earthflight (browser Earth flight simulator)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("\n1 ")) throw new Error("unexpected response body");
    store.set(group, { text, at: Date.now() });
    failedAt.delete(group);
    return text;
  } catch (e) {
    failedAt.set(group, Date.now());
    console.warn(`[satellites] CelesTrak ${group} failed: ${(e as Error).message}${have ? " (using previous copy)" : ""}`);
    if (have) return have.text;
    throw e;
  }
}

function parseTle(text: string): Array<[string, string, string]> {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const out: Array<[string, string, string]> = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [name, l1, l2] = [lines[i].trim(), lines[i + 1], lines[i + 2]];
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) out.push([name, l1, l2]);
  }
  return out;
}

export async function GET() {
  const seen = new Set<string>();
  const sats: Array<[Kind, string, string, string]> = [];
  const results = await Promise.allSettled(GROUPS.map((g) => fetchGroup(g.group)));
  const complete = results.every((r) => r.status === "fulfilled");
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const { kind, max } = GROUPS[i];
    const all = parseTle(r.value);
    const stride = Math.max(1, Math.ceil(all.length / max));
    for (let k = 0; k < all.length; k += stride) {
      const [name, l1, l2] = all[k];
      const id = l1.slice(2, 7);
      if (seen.has(id)) continue;
      seen.add(id);
      sats.push([kind, name, l1, l2]);
    }
  });
  return NextResponse.json(
    { updated: new Date().toISOString(), source: "CelesTrak", sats },
    {
      status: sats.length ? 200 : 502,
      headers: {
        // a partial list (some group failed) is only cached briefly so it fills in once CelesTrak answers again
        "cache-control": !sats.length ? "no-store" : complete ? "public, max-age=3600, s-maxage=21600" : "public, max-age=120",
      },
    },
  );
}
