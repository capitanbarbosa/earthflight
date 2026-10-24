import { PbfReader } from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

/**
 * OpenMapTiles `building` layer decoder (OpenStreetMap-derived data served as vector tiles by
 * OpenFreeMap).  Heights come from OSM `height` / `building:levels` tags as resolved by the
 * OpenMapTiles schema into `render_height` / `render_min_height`.  Buildings without any height
 * tag get the schema default; we never add buildings that OSM does not contain.
 */
export interface RawBuilding {
  /** Flat [lon, lat, lon, lat, …] outer ring (no repeated closing vertex). */
  outer: number[];
  holes: number[][];
  height: number; // roof above local ground, metres
  minHeight: number; // bottom above local ground (building parts), metres
  id: number;
  /** OSM `colour` tag (CSS name or #hex) when mapped. */
  colour?: string;
}

export const BUILDING_ZOOM = 14;

export function tileBounds(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lon = (xx: number) => (xx / n) * 360 - 180;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) };
}

export function lonLatToTile(lonDeg: number, latDeg: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lonDeg + 180) / 360) * n);
  const latR = (latDeg * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function ringToFlat(ring: number[][]): number[] | null {
  const pts = ring.slice();
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  if (pts.length < 3) return null;
  const out: number[] = [];
  for (const p of pts) out.push(p[0], p[1]);
  return out;
}

/** Approximate planar area in m² (shoelace in a local equirectangular frame). */
export function ringAreaM2(flat: number[]): number {
  const n = flat.length / 2;
  const lat0 = (flat[1] * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat0), ky = 110574;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2] * kx, yi = flat[i * 2 + 1] * ky;
    const xj = flat[j * 2] * kx, yj = flat[j * 2 + 1] * ky;
    a += xj * yi - xi * yj;
  }
  return Math.abs(a) / 2;
}

export function decodeBuildings(bytes: ArrayBuffer | Uint8Array, z: number, x: number, y: number): RawBuilding[] {
  const tile = new VectorTile(new PbfReader(bytes));
  const layer = tile.layers["building"];
  if (!layer) return [];
  if (layer.length > 60_000) throw new Error("building layer too large");
  const out: RawBuilding[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    if (p.hide_3d) continue; // outline replaced by building:part geometry
    const gj = f.toGeoJSON(x, y, z).geometry;
    const polys: number[][][][] =
      gj.type === "Polygon" ? [gj.coordinates as number[][][]] : gj.type === "MultiPolygon" ? (gj.coordinates as number[][][][]) : [];
    const rh = Number(p.render_height);
    const rmh = Number(p.render_min_height);
    const height = Number.isFinite(rh) && rh > 0 ? rh : 6;
    const minHeight = Number.isFinite(rmh) && rmh > 0 ? Math.min(rmh, height - 2) : 0;
    for (let k = 0; k < polys.length; k++) {
      const rings = polys[k];
      const outer = ringToFlat(rings[0]);
      if (!outer || ringAreaM2(outer) < 8) continue;
      const holes: number[][] = [];
      for (let r = 1; r < rings.length; r++) {
        const h = ringToFlat(rings[r]);
        if (h) holes.push(h);
      }
      out.push({ outer, holes, height, minHeight, id: (f.id ?? i) * 8 + k, colour: typeof p.colour === "string" ? p.colour : undefined });
    }
  }
  return out;
}
