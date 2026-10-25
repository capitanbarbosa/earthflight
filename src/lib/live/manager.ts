import type { CesiumModule } from "@/lib/cesium/loader";
import { useLiveStore, type FeedItem } from "@/stores/live-store";
import { LIVE_BY_ID, type LiveId } from "./registry";

type Scene = InstanceType<CesiumModule["Scene"]>;
type Points = InstanceType<CesiumModule["PointPrimitiveCollection"]>;
type Labels = InstanceType<CesiumModule["LabelCollection"]>;
type ImgLayer = InstanceType<CesiumModule["ImageryLayer"]>;
type Cart3 = InstanceType<CesiumModule["Cartesian3"]>;

/** Ship position in degrees / metres, read by the manager each frame. */
export interface ShipLL { lat: number; lon: number; alt: number }

interface Quake { id: string; lon: number; lat: number; depth: number; mag: number; place: string; time: number; url: string }
interface EonetItem { id: string; title: string; cat: string; lon: number; lat: number; mag: number | null; unit: string | null; date: string; url: string }
interface Plane { id: string; call: string; type: string; lat: number; lon: number; alt: number; gs: number; trk: number; ground: boolean }
interface Vessel { id: string; lat: number; lon: number; sog: number; cog: number; hdg: number | null }

const R = 6371008.8;
const D2R = Math.PI / 180;
const FONT = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
const POLL_MS: Partial<Record<LiveId, number>> = { quakes: 5 * 60_000, events: 15 * 60_000, aircraft: 10_000, vessels: 30_000, aurora: 10 * 60_000 };
const AIRCRAFT_MAX_SHIP_ALT = 3_000_000; // above ~3,000 km you are in orbit; ADS-B planes are invisible dots there
const PLANE_LABELS = 14;

/** NASA GIBS WMTS tile templates (EPSG:3857). `default` time = newest available. */
const gibs = (layer: string, level: number, ext: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/default/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;

const EVENT_COLOR: Record<string, string> = {
  wildfires: "#ff7a2f", severeStorms: "#5ee0ff", volcanoes: "#ff3b3b", seaLakeIce: "#e8f4ff", floods: "#4d8dff",
  dustHaze: "#d9b36a", landslides: "#b08d5e", tempExtremes: "#ff9bd2", drought: "#e5c76b", snow: "#ffffff",
};
const EVENT_KIND: Record<string, FeedItem["kind"]> = {
  wildfires: "fire", severeStorms: "storm", volcanoes: "volcano", seaLakeIce: "ice", floods: "flood",
};
const EVENT_NAME: Record<string, string> = {
  wildfires: "Wildfire", severeStorms: "Storm", volcanoes: "Volcano", seaLakeIce: "Sea ice", floods: "Flood",
  dustHaze: "Dust / haze", landslides: "Landslide", tempExtremes: "Temperature extreme", drought: "Drought", snow: "Snow",
};

/**
 * All the globe's live data layers.  Point layers are Cesium primitive collections (no Entities), imagery layers
 * are inserted just below the night-lights layer.  Nothing is drawn unless the matching toggle is on, and each
 * layer reports honest status (loading / ok / error + counts) to the live store.
 */
export class LiveManager {
  private C: CesiumModule;
  private scene: Scene;
  private getShip: () => ShipLL;
  private points = new Map<LiveId, Points>();
  private labels = new Map<LiveId, Labels>();
  private imagery = new Map<LiveId, ImgLayer[]>();
  private nextAt = new Map<LiveId, number>();
  private busy = new Set<LiveId>();
  private active = new Set<LiveId>();
  private unsub: () => void;
  private disposed = false;

  private quakeData: Quake[] = [];
  private eventData: EonetItem[] = [];
  private planes: { p: ReturnType<Points["add"]>; d: Plane; t0: number }[] = [];
  private planeLabelIdx: number[] = [];
  private lastPlaneTick = 0;
  private lastPlaneSort = 0;
  private lastPlaneFetch: { lat: number; lon: number } | null = null;
  private scratch: Cart3;
  private imageryToken = new Map<LiveId, number>();
  /**
   * Markers sit right on the ground, so at orbital distances depth precision clips them in half. We switch the depth
   * test off for anything closer to the camera than ~97% of the horizon distance: that still hides everything on the far
   * side of the planet (which is always beyond the horizon) while keeping every marker whole.
   */
  private depthT = 5e4;

  constructor(C: CesiumModule, scene: Scene, getShip: () => ShipLL) {
    this.C = C;
    this.scene = scene;
    this.getShip = getShip;
    this.scratch = new C.Cartesian3();
    const apply = (id: LiveId, on: boolean) => (on ? this.enable(id) : this.disable(id));
    const st = useLiveStore.getState();
    for (const id of Object.keys(st.enabled) as LiveId[]) if (st.enabled[id]) apply(id, true);
    this.unsub = useLiveStore.subscribe((s, p) => {
      for (const id of Object.keys(s.enabled) as LiveId[]) if (s.enabled[id] !== p.enabled[id]) apply(id, s.enabled[id]);
    });
  }

  // -------------------------------------------------------------------------------------------------------
  private status(id: LiveId, state: "off" | "loading" | "ok" | "error", extra: { count?: number; updated?: string; note?: string } = {}) {
    useLiveStore.getState().setStatus(id, { state, ...extra });
  }

  private enable(id: LiveId) {
    if (this.disposed || this.active.has(id)) return;
    this.active.add(id);
    this.status(id, "loading");
    if (LIVE_BY_ID[id].kind === "imagery") {
      void this.addImagery(id);
    } else {
      this.collections(id).forEach((c) => (c.show = true));
      this.nextAt.set(id, 0);
    }
  }

  private disable(id: LiveId) {
    if (!this.active.delete(id)) return;
    this.status(id, "off");
    if (LIVE_BY_ID[id].kind === "imagery") {
      this.imageryToken.set(id, (this.imageryToken.get(id) ?? 0) + 1); // cancel an in-flight build
      const ls = this.imagery.get(id) ?? [];
      for (const l of ls) this.scene.imageryLayers.remove(l, true);
      this.imagery.delete(id);
    } else {
      this.points.get(id)?.removeAll();
      this.labels.get(id)?.removeAll();
      this.collections(id).forEach((c) => (c.show = false));
      if (id === "aircraft") {
        this.planes = [];
        this.lastPlaneFetch = null;
      }
      if (id === "quakes") this.quakeData = [];
      if (id === "events") this.eventData = [];
      if (id === "quakes" || id === "events") this.publishFeed();
    }
  }

  private collections(id: LiveId): Array<Points | Labels> {
    const C = this.C;
    if (!this.points.has(id)) {
      this.points.set(id, this.scene.primitives.add(new C.PointPrimitiveCollection({ scene: this.scene } as never)) as Points);
      this.labels.set(id, this.scene.primitives.add(new C.LabelCollection({ scene: this.scene } as never)) as Labels);
    }
    return [this.points.get(id)!, this.labels.get(id)!];
  }

  // ------------------------------------------------------------------------------------------- imagery
  private insert(provider: InstanceType<CesiumModule["UrlTemplateImageryProvider"]> | InstanceType<CesiumModule["SingleTileImageryProvider"]>): ImgLayer {
    const layers = this.scene.imageryLayers;
    // keep the night-lights layer (always last) on top
    return layers.addImageryProvider(provider, Math.max(1, layers.length - 1));
  }

  private async addImagery(id: LiveId) {
    const C = this.C;
    const token = (this.imageryToken.get(id) ?? 0) + 1;
    this.imageryToken.set(id, token);
    const tpl = (layer: string, level: number, ext: string, credit: string) =>
      new C.UrlTemplateImageryProvider({
        url: gibs(layer, level, ext),
        maximumLevel: level,
        tilingScheme: new C.WebMercatorTilingScheme(),
        credit,
      });
    try {
      const made: ImgLayer[] = [];
      if (id === "rain") {
        const l = this.insert(tpl("IMERG_Precipitation_Rate_30min", 6, "png", "NASA GIBS / IMERG"));
        l.alpha = 0.85;
        made.push(l);
      } else if (id === "sst") {
        const l = this.insert(tpl("GHRSST_L4_MUR_Sea_Surface_Temperature", 7, "png", "NASA GIBS / GHRSST MUR"));
        l.alpha = 0.7;
        made.push(l);
      } else if (id === "clouds") {
        for (const name of ["GOES-East_ABI_Band13_Clean_Infrared", "GOES-West_ABI_Band13_Clean_Infrared", "Himawari_AHI_Band13_Clean_Infrared"]) {
          const provider = tpl(name, 6, "png", "NASA GIBS / NOAA GOES, JMA Himawari");
          // Infrared is greyscale (cold cloud tops = bright, warm ground/sea = dark). Convert brightness → opacity
          // so only the cloud tops remain, as soft white, and the real Earth shows through everywhere else.
          const original = provider.requestImage.bind(provider);
          provider.requestImage = ((x: number, y: number, level: number, request?: unknown) => {
            const p = original(x, y, level, request as never);
            return p?.then((img) => (img ? (cloudsFromInfrared(img as unknown as CanvasImageSource & { width: number; height: number }, y, level) as never) : img));
          }) as typeof provider.requestImage;
          const l = this.insert(provider);
          l.alpha = 0.92;
          made.push(l);
        }
      } else if (id === "aurora") {
        // the data fetch happens through our API route, so this one can fail honestly
        const res = await fetch("/api/live/aurora", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { values: number[]; updated: string; forecast: string };
        const url = auroraCanvas(j.values);
        const provider = await C.SingleTileImageryProvider.fromUrl(url, { rectangle: C.Rectangle.fromDegrees(-180, -90, 180, 90), credit: "NOAA SWPC" });
        const l = this.insert(provider);
        l.dayAlpha = 0.2; // aurora is a night-side effect
        l.nightAlpha = 1;
        l.alpha = 0.95;
        made.push(l);
        this.nextAt.set(id, Date.now() + (POLL_MS.aurora ?? 6e5));
        this.status(id, "ok", { updated: j.updated });
      }
      if (this.imageryToken.get(id) !== token || !this.active.has(id) || this.disposed) {
        for (const l of made) this.scene.imageryLayers.remove(l, true);
        return;
      }
      this.imagery.set(id, made);
      if (id !== "aurora") this.status(id, "ok", { note: "streaming tiles" });
    } catch (e) {
      console.warn(`[live] ${id} failed`, e);
      if (this.active.has(id)) this.status(id, "error", { note: "unavailable right now" });
    }
  }

  private applyDepth(height: number) {
    const h = Math.max(50, height);
    const horizon = Math.sqrt((R + h) * (R + h) - R * R);
    const t = Math.max(3e4, horizon * 0.97);
    if (Math.abs(t - this.depthT) / this.depthT < 0.06) return;
    this.depthT = t;
    for (const c of [...this.points.values(), ...this.labels.values()]) {
      for (let i = 0; i < c.length; i++) (c.get(i) as { disableDepthTestDistance: number }).disableDepthTestDistance = t;
    }
  }

  // ------------------------------------------------------------------------------------------- per frame
  update(nowMs: number) {
    if (this.disposed) return;
    const ship = this.getShip();
    this.applyDepth(ship.alt);
    for (const id of this.active) {
      if (id === "aurora" || LIVE_BY_ID[id].kind === "imagery") {
        if (id === "aurora" && this.imagery.has("aurora") && nowMs >= (this.nextAt.get(id) ?? Infinity)) void this.refreshAurora();
        continue;
      }
      if (nowMs >= (this.nextAt.get(id) ?? 0) && !this.busy.has(id)) void this.refresh(id, ship, nowMs);
    }
    if (this.active.has("aircraft")) {
      this.tickPlanes(ship);
      // refresh early if the ship has flown far from the last query centre
      if (this.lastPlaneFetch && !this.busy.has("aircraft")) {
        const d = ground(ship.lat, ship.lon, this.lastPlaneFetch.lat, this.lastPlaneFetch.lon);
        if (d > 150_000) this.nextAt.set("aircraft", 0);
      }
    }
  }

  private async refreshAurora() {
    this.nextAt.set("aurora", Date.now() + (POLL_MS.aurora ?? 6e5));
    const old = this.imagery.get("aurora");
    if (!old) return;
    const C = this.C;
    try {
      const res = await fetch("/api/live/aurora", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { values: number[]; updated: string };
      const provider = await C.SingleTileImageryProvider.fromUrl(auroraCanvas(j.values), { rectangle: C.Rectangle.fromDegrees(-180, -90, 180, 90), credit: "NOAA SWPC" });
      if (!this.active.has("aurora")) return;
      const l = this.insert(provider);
      l.dayAlpha = 0.2;
      l.nightAlpha = 1;
      l.alpha = 0.95;
      for (const o of old) this.scene.imageryLayers.remove(o, true);
      this.imagery.set("aurora", [l]);
      this.status("aurora", "ok", { updated: j.updated });
    } catch {
      /* keep showing the previous nowcast */
    }
  }

  private async refresh(id: LiveId, ship: ShipLL, nowMs: number) {
    this.busy.add(id);
    this.nextAt.set(id, nowMs + (POLL_MS[id] ?? 60_000));
    try {
      let url = `/api/live/${id}`;
      if (id === "aircraft") {
        if (ship.alt > AIRCRAFT_MAX_SHIP_ALT) {
          this.clearPlanes();
          this.status(id, "ok", { count: 0, note: "fly lower than ~3,000 km to see aircraft" });
          return;
        }
        url += `?lat=${ship.lat.toFixed(3)}&lon=${ship.lon.toFixed(3)}`;
        this.lastPlaneFetch = { lat: ship.lat, lon: ship.lon };
      }
      const res = await fetch(url, { cache: "no-store" });
      const j = (await res.json()) as { items?: unknown[]; updated?: string; stale?: boolean };
      if (!this.active.has(id) || this.disposed) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = j.items ?? [];
      const note = j.stale ? "showing last good data" : undefined;
      if (id === "quakes") { this.quakeData = items as Quake[]; this.renderQuakes(); }
      else if (id === "events") { this.eventData = items as EonetItem[]; this.renderEvents(); }
      else if (id === "aircraft") this.renderPlanes(items as Plane[]);
      else if (id === "vessels") this.renderVessels(items as Vessel[]);
      this.status(id, "ok", { count: items.length, updated: j.updated, note });
    } catch (e) {
      console.warn(`[live] ${id} failed`, e);
      if (this.active.has(id)) this.status(id, "error", { note: "unavailable right now" });
    } finally {
      this.busy.delete(id);
    }
  }

  // ------------------------------------------------------------------------------------------- renderers
  private color(css: string, a = 1) {
    return this.C.Color.fromCssColorString(css).withAlpha(a);
  }

  private labelStyle(text: string, position: Cart3, css: string, maxDist: number) {
    const C = this.C;
    return {
      position,
      text,
      font: FONT,
      fillColor: this.color(css),
      outlineColor: this.color("#031018", 0.9),
      outlineWidth: 4,
      style: C.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: C.VerticalOrigin.BOTTOM,
      pixelOffset: new C.Cartesian2(0, -9),
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, maxDist),
      translucencyByDistance: new C.NearFarScalar(maxDist * 0.6, 1, maxDist, 0),
      disableDepthTestDistance: this.depthT,
    };
  }

  private renderQuakes() {
    const C = this.C;
    const pts = this.points.get("quakes")!, lbl = this.labels.get("quakes")!;
    pts.removeAll();
    lbl.removeAll();
    const sorted = [...this.quakeData].sort((a, b) => b.mag - a.mag);
    sorted.forEach((q, i) => {
      const pos = C.Cartesian3.fromDegrees(q.lon, q.lat, 60);
      // colour by magnitude: yellow (small) → red (large)
      const t = Math.min(1, Math.max(0, (q.mag - 2.5) / 4.5));
      const css = `rgb(255, ${Math.round(220 - 170 * t)}, ${Math.round(70 - 40 * t)})`;
      pts.add({
        position: pos,
        pixelSize: 4 + q.mag * 2.1,
        color: this.color(css, 0.78),
        outlineColor: this.color("#ffffff", 0.65),
        outlineWidth: 1.2,
        heightReference: C.HeightReference.RELATIVE_TO_GROUND,
        scaleByDistance: new C.NearFarScalar(2e5, 1.5, 3e7, 0.55),
        disableDepthTestDistance: this.depthT,
      });
      if (i < 12 || q.mag >= 5) {
        lbl.add({
          ...this.labelStyle(`M${q.mag.toFixed(1)}  ${shorten(q.place, 34)}`, pos, "#ffe9a8", i < 4 ? 1.2e7 : 2.5e6),
          heightReference: C.HeightReference.RELATIVE_TO_GROUND,
        });
      }
    });
    this.publishFeed();
  }

  private renderEvents() {
    const C = this.C;
    const pts = this.points.get("events")!, lbl = this.labels.get("events")!;
    pts.removeAll();
    lbl.removeAll();
    for (const e of this.eventData) {
      const css = EVENT_COLOR[e.cat] ?? "#cfd8dc";
      const pos = C.Cartesian3.fromDegrees(e.lon, e.lat, 80);
      const fire = e.cat === "wildfires";
      const acres = fire && e.mag ? e.mag : 0;
      const size = fire ? 3.5 + Math.min(4, Math.log10(acres + 1) * 1.1) : e.cat === "severeStorms" ? 13 : 10;
      pts.add({
        position: pos,
        pixelSize: size,
        color: this.color(css, fire ? 0.8 : 0.9),
        outlineColor: this.color("#031018", 0.9),
        outlineWidth: 1.5,
        heightReference: C.HeightReference.RELATIVE_TO_GROUND,
        scaleByDistance: new C.NearFarScalar(2e5, 1.5, 3e7, 0.6),
        disableDepthTestDistance: this.depthT,
      });
      if (!fire || acres > 20_000) {
        lbl.add({
          ...this.labelStyle(shorten(e.title, 38), pos, css, fire ? 1.5e6 : 6e6),
          heightReference: C.HeightReference.RELATIVE_TO_GROUND,
        });
      }
    }
    this.publishFeed();
  }

  private renderVessels(items: Vessel[]) {
    const C = this.C;
    const pts = this.points.get("vessels")!;
    pts.removeAll();
    for (const v of items) {
      const moving = v.sog > 0.5;
      pts.add({
        position: C.Cartesian3.fromDegrees(v.lon, v.lat, 8),
        pixelSize: moving ? 5 : 3.5,
        color: this.color(moving ? "#6ef0c8" : "#7aa9a0", 0.92),
        outlineColor: this.color("#031018", 0.8),
        outlineWidth: 1,
        scaleByDistance: new C.NearFarScalar(2e4, 1.6, 6e6, 0.5),
        distanceDisplayCondition: new C.DistanceDisplayCondition(0, 8e6),
        disableDepthTestDistance: this.depthT,
      });
    }
  }

  // aircraft ------------------------------------------------------------------------------------------
  private clearPlanes() {
    this.points.get("aircraft")?.removeAll();
    this.labels.get("aircraft")?.removeAll();
    this.planes = [];
    this.planeLabelIdx = [];
  }

  private renderPlanes(items: Plane[]) {
    const C = this.C;
    const pts = this.points.get("aircraft")!;
    this.clearPlanes();
    const now = performance.now();
    for (const d of items) {
      const p = pts.add({
        position: C.Cartesian3.fromDegrees(d.lon, d.lat, d.alt + 3),
        pixelSize: d.ground ? 3 : 4.5,
        color: this.color(d.ground ? "#9fb4bd" : "#f4fbff", 0.95),
        outlineColor: this.color("#0b2a3a", 0.85),
        outlineWidth: 1,
        scaleByDistance: new C.NearFarScalar(3e3, 1.8, 2.5e6, 0.45),
        distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3e6),
        disableDepthTestDistance: this.depthT,
      });
      this.planes.push({ p, d, t0: now });
    }
    this.lastPlaneSort = 0;
    this.tickPlanes(this.getShip(), true);
  }

  /** Dead-reckon aircraft between polls (4 Hz) so they glide instead of jumping every 10 s. */
  private tickPlanes(ship: ShipLL, force = false) {
    if (!this.planes.length) return;
    const now = performance.now();
    if (!force && now - this.lastPlaneTick < 250) return;
    this.lastPlaneTick = now;
    const C = this.C;
    const lbl = this.labels.get("aircraft")!;
    for (const a of this.planes) {
      const dt = Math.min(30, (now - a.t0) / 1000);
      const d = a.d;
      let lat = d.lat, lon = d.lon;
      if (!d.ground && d.gs > 0) {
        const dist = d.gs * dt;
        const trk = d.trk * D2R;
        lat += ((Math.cos(trk) * dist) / R) / D2R;
        lon += ((Math.sin(trk) * dist) / (R * Math.max(0.05, Math.cos(d.lat * D2R)))) / D2R;
      }
      C.Cartesian3.fromDegrees(lon, lat, d.alt + 3, undefined, this.scratch);
      a.p.position = this.scratch;
    }
    // labels for the nearest few
    if (now - this.lastPlaneSort > 1500 || force) {
      this.lastPlaneSort = now;
      const near = this.planes
        .map((a, i) => ({ i, d: ground(ship.lat, ship.lon, a.d.lat, a.d.lon) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, PLANE_LABELS)
        .filter((x) => x.d < 150_000);
      this.planeLabelIdx = near.map((x) => x.i);
      lbl.removeAll();
      for (const i of this.planeLabelIdx) {
        const a = this.planes[i];
        const fl = a.d.ground ? "GND" : `FL${String(Math.round((a.d.alt * 3.28084) / 100)).padStart(3, "0")}`;
        lbl.add({ ...this.labelStyle(`${a.d.call}  ${fl}${a.d.type ? " " + a.d.type : ""}`, a.p.position, "#bff3ff", 120_000) });
      }
    } else if (this.planeLabelIdx.length) {
      for (let k = 0; k < this.planeLabelIdx.length && k < lbl.length; k++) {
        lbl.get(k).position = this.planes[this.planeLabelIdx[k]].p.position;
      }
    }
  }

  // ------------------------------------------------------------------------------------------- feed
  private publishFeed() {
    const out: FeedItem[] = [];
    for (const q of this.quakeData) {
      if (q.mag < 4.5) continue;
      out.push({
        id: `q:${q.id}`, kind: "quake", title: `M${q.mag.toFixed(1)} earthquake`, detail: `${q.place} · ${Math.round(q.depth)} km deep`,
        lat: q.lat, lon: q.lon, time: q.time, score: 40 + q.mag * 12,
      });
    }
    const fires = this.eventData.filter((e) => e.cat === "wildfires").sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0)).slice(0, 12);
    const keep = new Set(fires.map((f) => f.id));
    for (const e of this.eventData) {
      if (e.cat === "wildfires" && !keep.has(e.id)) continue;
      const fire = e.cat === "wildfires";
      const detail = fire && e.mag ? `${Math.round(e.mag).toLocaleString()} ${e.unit ?? "acres"}` : (EVENT_NAME[e.cat] ?? "Natural event") + (e.mag && e.unit ? ` · ${e.mag} ${e.unit}` : "");
      out.push({
        id: `e:${e.id}`, kind: EVENT_KIND[e.cat] ?? "other", title: e.title, detail,
        lat: e.lat, lon: e.lon, time: Date.parse(e.date) || 0,
        score: fire ? 20 + Math.log10((e.mag ?? 1) + 1) * 8 : e.cat === "severeStorms" || e.cat === "volcanoes" ? 110 : 70,
      });
    }
    out.sort((a, b) => b.score - a.score);
    useLiveStore.getState().setFeed(out.slice(0, 60));
  }

  dispose() {
    this.disposed = true;
    this.unsub();
    for (const id of [...this.active]) this.disable(id);
    for (const c of [...this.points.values(), ...this.labels.values()]) {
      if (!this.scene.isDestroyed()) this.scene.primitives.remove(c);
    }
    this.points.clear();
    this.labels.clear();
  }
}

// ---------------------------------------------------------------------------------------------- helpers
function shorten(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/** Great-circle-ish ground distance in metres (equirectangular, fine for the <1000 km used here). */
function ground(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dy = (lat2 - lat1) * D2R;
  let dl = lon2 - lon1;
  if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
  const dx = dl * D2R * Math.cos(((lat1 + lat2) / 2) * D2R);
  return Math.sqrt(dx * dx + dy * dy) * R;
}

/** Greyscale IR tile → white cloud layer with brightness-derived opacity. */
function cloudsFromInfrared(src: CanvasImageSource & { width: number; height: number }, tileY: number, level: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = 2 ** level;
  for (let i = 0; i < d.length; i += 4) {
    // Cold polar ice and snow look like cloud tops in infrared, so fade the layer out toward the poles
    const row = Math.floor(i / 4 / w);
    const lat = Math.abs(Math.atan(Math.sinh(Math.PI * (1 - (2 * (tileY + row / h)) / n))) / D2R);
    const polar = 1 - Math.min(1, Math.max(0, (lat - 56) / 14));
    const lo = 0.58 + 0.2 * Math.min(1, Math.max(0, (lat - 32) / 26)); // colder ground at high latitude → stricter threshold
    if (polar <= 0) { d[i + 3] = 0; continue; }
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const t = Math.min(1, Math.max(0, (lum - lo) / 0.28));
    const a = t * t * (3 - 2 * t) * (d[i + 3] / 255) * polar;
    d[i] = 244;
    d[i + 1] = 248;
    d[i + 2] = 255;
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** NOAA OVATION grid (181 lat rows × 360 lon columns, 0-100 %) → transparent RGBA canvas as a data URL. */
function auroraCanvas(values: number[]): string {
  const W = 360, H = 181;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = values[y * W + x] ?? 0;
      // source lon 0..359 → image column −180..179 ; source lat −90..90 (row 0 = south) → image row 0 = north
      const col = x < 180 ? x + 180 : x - 180;
      const row = H - 1 - y;
      const o = (row * W + col) * 4;
      // 0-100 % probability; quiet nights peak around 10-20 %, storms exceed 60 %, so scale for readability
      const t = Math.min(1, v / 60);
      img.data[o] = 40 + 215 * sm(0.45, 0.95, t);
      img.data[o + 1] = 255 - 150 * sm(0.45, 1, t);
      img.data[o + 2] = 120 + 110 * sm(0.4, 1, t);
      img.data[o + 3] = Math.round(255 * sm(0.04, 0.3, t) * 0.92);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
}

export type { Cart3 };
