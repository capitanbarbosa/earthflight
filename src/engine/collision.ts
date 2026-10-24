/**
 * Building collision using OSM footprints.
 *
 * APPROXIMATION (documented in docs/): each building is an extruded 2D footprint polygon
 * (prism) from terrain level up to its roof.  The ship is a sphere.  We test the sphere centre
 * against the prism with a signed distance to the footprint, and resolve penetration by pushing
 * out horizontally (walls) or vertically (roofs), whichever is the smaller correction.
 * Overhangs, setbacks, roof shapes and `building:part` geometry finer than the footprint are
 * ignored.  This is conservative for tall slab buildings and cheap enough to run every frame.
 *
 * Footprints are stored in a tile-local equirectangular metre frame (error < 0.1 m at z14 tile
 * sizes), bucketed into a coarse grid so a query touches only a handful of buildings.
 */
import { Vec3, add, dot, len, madd, scale } from "./math3";
import { EARTH_R, ecefToGeodetic, enuFrame } from "./coordinates";

export interface Footprint {
  /** Flat [x0,y0,x1,y1,...] outer ring in tile-local metres (east, north). */
  ring: Float64Array;
  minX: number; maxX: number; minY: number; maxY: number;
  /** Height above ellipsoid of the building base and roof (m). */
  base: number;
  top: number;
}

interface TileEntry {
  key: string;
  lat0: number; // rad
  lon0: number; // rad
  cosLat0: number;
  buildings: Footprint[];
  cells: Map<number, number[]>;
}

const CELL = 64; // metres
const cellKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

export interface Contact {
  normal: Vec3; // ECEF unit vector pointing out of the obstacle
  depth: number; // metres of penetration
  kind: "wall" | "roof";
}

export class BuildingIndex {
  private tiles = new Map<string, TileEntry>();
  /** Total number of indexed buildings (for diagnostics). */
  count = 0;

  addTile(key: string, lat0Deg: number, lon0Deg: number, buildings: Footprint[]) {
    this.removeTile(key);
    const lat0 = (lat0Deg * Math.PI) / 180;
    const lon0 = (lon0Deg * Math.PI) / 180;
    const cells = new Map<number, number[]>();
    buildings.forEach((b, i) => {
      const cx0 = Math.floor(b.minX / CELL), cx1 = Math.floor(b.maxX / CELL);
      const cy0 = Math.floor(b.minY / CELL), cy1 = Math.floor(b.maxY / CELL);
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cy = cy0; cy <= cy1; cy++) {
          const k = cellKey(cx, cy);
          const arr = cells.get(k);
          if (arr) arr.push(i);
          else cells.set(k, [i]);
        }
    });
    this.tiles.set(key, { key, lat0, lon0, cosLat0: Math.cos(lat0), buildings, cells });
    this.count += buildings.length;
  }

  removeTile(key: string) {
    const t = this.tiles.get(key);
    if (!t) return;
    this.count -= t.buildings.length;
    this.tiles.delete(key);
  }

  clear() {
    this.tiles.clear();
    this.count = 0;
  }

  get tileCount() {
    return this.tiles.size;
  }

  /** Is the point inside (or within `pad` m of) any building prism? Used by the camera. */
  isInside(pos: Vec3, pad = 0): boolean {
    return this.query(pos, pad, true) !== null;
  }

  /** Deepest contact between a sphere (centre `pos`, radius `radius`) and any building. */
  resolve(pos: Vec3, radius: number): Contact | null {
    return this.query(pos, radius, false);
  }

  private query(pos: Vec3, radius: number, anyHit: boolean): Contact | null {
    if (this.tiles.size === 0) return null;
    const g = ecefToGeodetic(pos);
    if (g.h > 1500 + radius) return null; // nothing taller than that is modelled
    let best: Contact | null = null;
    let bestDepth = 0;
    const frame = enuFrame(g.lat, g.lon);
    for (const t of this.tiles.values()) {
      const x = (g.lon - t.lon0) * t.cosLat0 * EARTH_R;
      const y = (g.lat - t.lat0) * EARTH_R;
      // skip tiles clearly out of range (tile ≈ 2.4 km wide at z14)
      if (Math.abs(x) > 4500 || Math.abs(y) > 4500) continue;
      const cx0 = Math.floor((x - radius) / CELL), cx1 = Math.floor((x + radius) / CELL);
      const cy0 = Math.floor((y - radius) / CELL), cy1 = Math.floor((y + radius) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const list = t.cells.get(cellKey(cx, cy));
          if (!list) continue;
          for (const bi of list) {
            const b = t.buildings[bi];
            if (g.h > b.top + radius || g.h < b.base - radius) continue;
            if (x < b.minX - radius || x > b.maxX + radius || y < b.minY - radius || y > b.maxY + radius) continue;
            const c = contactWithRing(b, x, y, g.h, radius);
            if (!c) continue;
            if (anyHit) return { normal: [0, 0, 0], depth: c.depth, kind: c.kind };
            if (c.depth > bestDepth) {
              bestDepth = c.depth;
              // horizontal normal (east,north) → ECEF
              const n: Vec3 =
                c.kind === "roof"
                  ? frame.up
                  : add(scale(frame.east, c.nx), scale(frame.north, c.ny));
              best = { normal: n, depth: c.depth, kind: c.kind };
            }
          }
        }
      }
    }
    return best;
  }
}

function contactWithRing(
  b: Footprint,
  px: number,
  py: number,
  h: number,
  r: number,
): { depth: number; nx: number; ny: number; kind: "wall" | "roof" } | null {
  const ring = b.ring;
  const n = ring.length / 2;
  let inside = false;
  let minD2 = Infinity;
  let cxp = 0, cyp = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], yi = ring[i * 2 + 1];
    const xj = ring[j * 2], yj = ring[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    // closest point on segment j→i
    const dx = xi - xj, dy = yi - yj;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - xj) * dx + (py - yj) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = xj + dx * t, qy = yj + dy * t;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < minD2) {
      minD2 = d2;
      cxp = qx;
      cyp = qy;
    }
  }
  const d = Math.sqrt(minD2);
  if (!inside && d >= r) return null;
  // horizontal push-out
  let hDepth: number, nx: number, ny: number;
  if (inside) {
    hDepth = d + r;
    nx = d > 1e-6 ? cxp - px : 0;
    ny = d > 1e-6 ? cyp - py : 1;
  } else {
    hDepth = r - d;
    nx = px - cxp;
    ny = py - cyp;
  }
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  const vDepth = b.top + r - h; // push straight up onto the roof
  if (vDepth > 0 && vDepth < hDepth * 0.9) return { depth: vDepth, nx: 0, ny: 0, kind: "roof" };
  return { depth: hDepth, nx, ny, kind: "wall" };
}

/** Apply a contact: move out of the obstacle and cancel velocity into it. */
export function applyContact(pos: Vec3, vel: Vec3, c: Contact, restitution = 0.15): { pos: Vec3; vel: Vec3 } {
  const p = madd(pos, c.normal, c.depth + 0.05);
  const vn = dot(vel, c.normal);
  const v = vn < 0 ? madd(vel, c.normal, -(1 + restitution) * vn) : vel;
  return { pos: p, vel: v };
}

export const speedOf = (v: Vec3) => len(v);
