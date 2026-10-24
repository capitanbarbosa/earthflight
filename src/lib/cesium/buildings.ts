import type { CesiumModule } from "./loader";
import { BuildingIndex, type Footprint } from "@/engine/collision";
import { EARTH_R } from "@/engine/coordinates";
import { createBuildingAppearance, buildingVertexFormat } from "./building-shader";
import { BUILDING_ZOOM, decodeBuildings, lonLatToTile, tileBounds, type RawBuilding } from "./building-data";

type Scene = InstanceType<CesiumModule["Scene"]>;

type TileStatus = "queued" | "loading" | "building" | "ready" | "empty" | "error";

interface TileState {
  key: string;
  x: number;
  y: number;
  status: TileStatus;
  abort?: AbortController;
  primitives: unknown[];
  lastWanted: number;
  dist: number;
  // build progress
  raw?: RawBuilding[];
  cursor?: number;
  instances?: unknown[];
  footprints?: Footprint[];
  tileGround?: number;
  lat0?: number;
  lon0?: number;
  errorAt?: number;
}

export interface BuildingQuality {
  radius: number; // metres around the ship
  maxTiles: number;
  maxAgl: number; // only stream when below this altitude
  shadows: boolean;
}

// deliberately mid-tone: Cesium's sun light (intensity 2) brightens lit faces a lot
/** Cesium-style high part of a double (multiple of 65536), so high + low reconstructs it with float32 low. */
const splitHigh = (v: number) => (v >= 0 ? Math.floor(v / 65536) * 65536 : -Math.floor(-v / 65536) * 65536);

const PALETTE_LOW = ["#8d9299", "#7f868e", "#999389", "#757e8a", "#938b82", "#858c89"];
const PALETTE_TALL = ["#647a93", "#7086a0", "#586d88", "#728399"];

/**
 * Streams OSM buildings from OpenFreeMap vector tiles, extrudes them to prisms in Cesium and
 * mirrors the footprints into a BuildingIndex for collision.  Work is time-sliced across frames.
 */
export class BuildingStreamer {
  private tileUrl: string | null = null;
  private tiles = new Map<string, TileState>();
  private frame = 0;
  private lastUpdate = 0;
  private disposed = false;
  private inflight = 0;
  private maxInflight = 3;
  private q: BuildingQuality = { radius: 3000, maxTiles: 12, maxAgl: 3500, shadows: false };
  private appearance: unknown;
  private vertexFormat: unknown;

  constructor(
    private Cesium: CesiumModule,
    private scene: Scene,
    readonly index: BuildingIndex,
  ) {
    this.appearance = createBuildingAppearance(Cesium);
    this.vertexFormat = buildingVertexFormat(Cesium);
  }

  setQuality(q: BuildingQuality) {
    this.q = q;
  }

  async init() {
    try {
      const res = await fetch("https://tiles.openfreemap.org/planet");
      const json = await res.json();
      this.tileUrl = json.tiles?.[0] ?? null;
    } catch (e) {
      console.warn("[buildings] OpenFreeMap TileJSON unavailable; buildings disabled", e);
    }
  }

  get stats() {
    let loading = 0;
    for (const t of this.tiles.values()) if (t.status === "queued" || t.status === "loading" || t.status === "building") loading++;
    return { buildings: this.index.count, tiles: this.index.tileCount, loading };
  }

  /** Call every frame with the ship position; decides what to load/evict (throttled). */
  update(latDeg: number, lonDeg: number, agl: number, speed: number, nowMs: number) {
    this.frame++;
    this.tick();
    if (!this.tileUrl || this.disposed) return;
    if (nowMs - this.lastUpdate < 350) return;
    this.lastUpdate = nowMs;

    if (agl > 15_000) {
      // far away: release everything
      if (this.tiles.size) this.evictAll();
      return;
    }
    if (agl > this.q.maxAgl || speed > 700) return; // high/fast: keep what we have, load nothing new

    const R = this.q.radius;
    const cosLat = Math.max(0.05, Math.cos((latDeg * Math.PI) / 180));
    const dLat = (R / EARTH_R) * (180 / Math.PI);
    const dLon = dLat / cosLat;
    const a = lonLatToTile(lonDeg - dLon, latDeg + dLat, BUILDING_ZOOM);
    const b = lonLatToTile(lonDeg + dLon, latDeg - dLat, BUILDING_ZOOM);
    const wanted: TileState[] = [];
    for (let x = a.x; x <= b.x; x++) {
      for (let y = a.y; y <= b.y; y++) {
        const key = `${x}/${y}`;
        const bb = tileBounds(BUILDING_ZOOM, x, y);
        const cx = Math.min(Math.max(lonDeg, bb.west), bb.east);
        const cy = Math.min(Math.max(latDeg, bb.south), bb.north);
        const dx = (cx - lonDeg) * cosLat * (Math.PI / 180) * EARTH_R;
        const dy = (cy - latDeg) * (Math.PI / 180) * EARTH_R;
        const dist = Math.hypot(dx, dy);
        if (dist > R) continue;
        let t = this.tiles.get(key);
        if (!t) {
          t = { key, x, y, status: "queued", primitives: [], lastWanted: this.frame, dist };
          this.tiles.set(key, t);
        }
        t.lastWanted = this.frame;
        t.dist = dist;
        wanted.push(t);
      }
    }
    wanted.sort((p, q) => p.dist - q.dist);
    const allowed = new Set(wanted.slice(0, this.q.maxTiles).map((t) => t.key));

    // evict least-needed tiles when over budget
    if (this.tiles.size > this.q.maxTiles) {
      const evictable = [...this.tiles.values()]
        .filter((t) => !allowed.has(t.key))
        .sort((p, q) => q.dist - p.dist);
      let over = this.tiles.size - this.q.maxTiles;
      for (const t of evictable) {
        if (over <= 0) break;
        this.removeTile(t);
        over--;
      }
    }

    // start loads, nearest first
    for (const t of wanted) {
      if (this.inflight >= this.maxInflight) break;
      if (!allowed.has(t.key)) continue;
      if (t.status === "queued") this.load(t);
      else if (t.status === "error" && nowMs - (t.errorAt ?? 0) > 15_000) {
        t.status = "queued";
        this.load(t);
      }
    }
  }

  private async load(t: TileState) {
    if (!this.tileUrl) return;
    t.status = "loading";
    this.inflight++;
    const ctl = new AbortController();
    t.abort = ctl;
    try {
      const url = this.tileUrl.replace("{z}", String(BUILDING_ZOOM)).replace("{x}", String(t.x)).replace("{y}", String(t.y));
      const res = await fetch(url, { signal: ctl.signal });
      if (res.status === 404 || res.status === 204) {
        t.status = "empty";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (this.disposed || !this.tiles.has(t.key)) return;
      const raw = decodeBuildings(buf, BUILDING_ZOOM, t.x, t.y);
      if (!raw.length) {
        t.status = "empty";
        return;
      }
      const bb = tileBounds(BUILDING_ZOOM, t.x, t.y);
      t.lat0 = (bb.north + bb.south) / 2;
      t.lon0 = (bb.east + bb.west) / 2;
      t.raw = raw;
      t.cursor = 0;
      t.instances = [];
      t.footprints = [];
      t.status = "building";
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        t.status = "error";
        t.errorAt = performance.now();
      }
    } finally {
      this.inflight--;
    }
  }

  /** Time-sliced geometry building (≈3 ms per frame). */
  private tick() {
    const C = this.Cesium;
    const globe = this.scene.globe;
    const start = performance.now();
    for (const t of this.tiles.values()) {
      if (t.status !== "building" || !t.raw) continue;
      const carto = new C.Cartographic();
      if (t.tileGround === undefined) {
        carto.longitude = (t.lon0! * Math.PI) / 180;
        carto.latitude = (t.lat0! * Math.PI) / 180;
        const h = globe.getHeight(carto);
        if (h === undefined && (t.cursor ?? 0) === 0) {
          // terrain not streamed for this tile yet; wait a little (but not forever)
          t.errorAt = t.errorAt ?? performance.now();
          if (performance.now() - t.errorAt < 6000) continue;
        }
        t.tileGround = h ?? 0;
      }
      const cosLat0 = Math.cos((t.lat0! * Math.PI) / 180);
      const kx = (Math.PI / 180) * cosLat0 * EARTH_R, ky = (Math.PI / 180) * EARTH_R;
      const raw = t.raw;
      const instances = t.instances as unknown[];
      while (t.cursor! < raw.length) {
        const b = raw[t.cursor!++];
        const n = b.outer.length / 2;
        // ground: lowest of centroid + two vertices so buildings on slopes still reach the ground
        let cLon = 0, cLat = 0;
        for (let i = 0; i < n; i++) {
          cLon += b.outer[i * 2];
          cLat += b.outer[i * 2 + 1];
        }
        cLon /= n;
        cLat /= n;
        let g0 = Infinity;
        const probes = [cLon, cLat, b.outer[0], b.outer[1], b.outer[(n >> 1) * 2], b.outer[(n >> 1) * 2 + 1]];
        for (let i = 0; i < probes.length; i += 2) {
          carto.longitude = (probes[i] * Math.PI) / 180;
          carto.latitude = (probes[i + 1] * Math.PI) / 180;
          const h = globe.getHeight(carto);
          if (h !== undefined && h < g0) g0 = h;
        }
        if (!Number.isFinite(g0)) g0 = t.tileGround;
        const base = b.minHeight > 0 ? g0 + b.minHeight : g0 - 1.5;
        const top = g0 + b.height;
        if (top - base < 2) continue;

        const hier = new C.PolygonHierarchy(
          C.Cartesian3.fromDegreesArray(b.outer),
          b.holes.map((h) => new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(h))),
        );
        const tall = b.height > 55;
        const pal = tall ? PALETTE_TALL : PALETTE_LOW;
        // OSM `colour` tag when present and valid, otherwise a palette colour; never pure white/black
        let color = b.colour ? C.Color.fromCssColorString(b.colour) : undefined;
        if (!color) color = C.Color.fromCssColorString(pal[b.id % pal.length]);
        else color = C.Color.lerp(color, C.Color.fromCssColorString(pal[b.id % pal.length]), 0.35, new C.Color());
        const seed = ((b.id * 2654435761) >>> 0) / 4294967296;
        // base corner in ECEF, split high/low the way Cesium does, so the shader can work in building-local metres
        const bc = C.Cartesian3.fromDegrees(b.outer[0], b.outer[1], base);
        const hi = [splitHigh(bc.x), splitHigh(bc.y), splitHigh(bc.z)];
        const enc = {
          high: { x: hi[0], y: hi[1], z: hi[2] },
          low: { x: bc.x - hi[0], y: bc.y - hi[1], z: bc.z - hi[2] },
        };
        instances.push(
          new C.GeometryInstance({
            geometry: new C.PolygonGeometry({
              polygonHierarchy: hier,
              height: base,
              extrudedHeight: top,
              vertexFormat: this.vertexFormat as never,
            }),
            attributes: {
              color: C.ColorGeometryInstanceAttribute.fromColor(color),
              bparams: new C.GeometryInstanceAttribute({
                componentDatatype: C.ComponentDatatype.FLOAT,
                componentsPerAttribute: 4,
                value: [top - base, seed, 0, 0],
              }),
              bhi: new C.GeometryInstanceAttribute({
                componentDatatype: C.ComponentDatatype.FLOAT,
                componentsPerAttribute: 3,
                value: [enc.high.x, enc.high.y, enc.high.z],
              }),
              blo: new C.GeometryInstanceAttribute({
                componentDatatype: C.ComponentDatatype.FLOAT,
                componentsPerAttribute: 3,
                value: [enc.low.x, enc.low.y, enc.low.z],
              }),
            },
          }),
        );

        // collision footprint (tile-local metres)
        const ring = new Float64Array(b.outer.length);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < n; i++) {
          const x = (b.outer[i * 2] - t.lon0!) * kx;
          const y = (b.outer[i * 2 + 1] - t.lat0!) * ky;
          ring[i * 2] = x;
          ring[i * 2 + 1] = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        t.footprints!.push({ ring, minX, maxX, minY, maxY, base, top });

        if (instances.length >= 350) this.flush(t);
        if (performance.now() - start > 3.5) return;
      }
      // finished the tile
      this.flush(t);
      this.index.addTile(t.key, t.lat0!, t.lon0!, t.footprints!);
      t.raw = undefined;
      t.instances = undefined;
      t.footprints = undefined;
      t.status = "ready";
      if (performance.now() - start > 3.5) return;
    }
  }

  private flush(t: TileState) {
    const instances = t.instances as unknown[];
    if (!instances || instances.length === 0) return;
    const C = this.Cesium;
    const prim = new C.Primitive({
      geometryInstances: instances as never,
      appearance: this.appearance as never,
      asynchronous: true,
      allowPicking: false,
      releaseGeometryInstances: true,
      compressVertices: false, // custom shader reads plain normal/st attributes
      shadows: this.q.shadows ? C.ShadowMode.ENABLED : C.ShadowMode.DISABLED,
    });
    this.scene.primitives.add(prim);
    t.primitives.push(prim);
    t.instances = [];
  }

  private removeTile(t: TileState) {
    t.abort?.abort();
    for (const p of t.primitives) this.scene.primitives.remove(p as never);
    t.primitives.length = 0;
    this.index.removeTile(t.key);
    this.tiles.delete(t.key);
  }

  private evictAll() {
    for (const t of [...this.tiles.values()]) this.removeTile(t);
  }

  dispose() {
    this.disposed = true;
    this.evictAll();
    this.index.clear();
  }
}
