import { describe, expect, it } from "vitest";
import { DEG, len, qForward, qUp, dot, sub } from "./math3";
import {
  EARTH_R, GreatCircle, degToEcef, ecefToGeodetic, enuFrame, geodeticToEcef, greatCircleDistance, headingOf,
} from "./coordinates";
import {
  ControlInput, FlightConfig, altitudeSpeedCap, createRuntime, createShip, emergencyStop, resolveMode, sampleShip, stepFlight,
} from "./physics";
import { Autopilot } from "./travel";
import { BuildingIndex, applyContact } from "./collision";

const flat = (h: number) => ({ heightAt: () => h });
const none: ControlInput = { thrust: 0, strafe: 0, vertical: 0, roll: 0, mouseDX: 0, mouseDY: 0 };
const cfg: FlightConfig = { assist: "arcade", selection: "auto", speedScale: 1, sensitivity: 1, invertY: false };

describe("coordinates", () => {
  it("round-trips geodetic <-> ECEF including poles and high altitude", () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0], [45, 90, 1000], [-33.8, 151.2, 50], [89.9999, 10, 5000], [-90, 0, 0], [90, 0, 100], [10, -170, 3.6e7], [0.001, 179.99, 12],
    ];
    for (const [la, lo, h] of cases) {
      const g = ecefToGeodetic(degToEcef(la, lo, h));
      expect(g.lat / DEG).toBeCloseTo(la, 6);
      expect(Math.abs(g.h - h)).toBeLessThan(0.05);
      if (Math.abs(la) < 89.999) expect(Math.abs(((g.lon / DEG - lo + 540) % 360) - 180)).toBeLessThan(1e-6);
    }
  });

  it("great-circle distance NYC-London is ~5570 km", () => {
    const d = greatCircleDistance(40.7128 * DEG, -74.006 * DEG, 51.5074 * DEG, -0.1278 * DEG);
    expect(d / 1000).toBeGreaterThan(5540);
    expect(d / 1000).toBeLessThan(5600);
  });

  it("a great circle between two points at lat 80 passes over the pole", () => {
    const gc = new GreatCircle(80 * DEG, 0, 80 * DEG, Math.PI);
    const mid = gc.direction(0.5);
    expect(Math.asin(mid[2]) / DEG).toBeGreaterThan(89.99);
    expect(gc.distance / 1000).toBeCloseTo((20 * DEG * EARTH_R) / 1000, 0);
  });
});

describe("flight model", () => {
  it("altitude speed cap increases monotonically with altitude", () => {
    let prev = 0;
    for (const h of [0, 50, 200, 1000, 5000, 20000, 100000, 1e6, 1e7, 1e8]) {
      const v = altitudeSpeedCap(h);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(altitudeSpeedCap(100)).toBeLessThan(100); // slow near the ground
    expect(altitudeSpeedCap(5e6)).toBeGreaterThan(100_000); // very fast in space
  });

  it("auto mode follows altitude with hysteresis", () => {
    expect(resolveMode(500, "auto", "space")).toBe("city");
    expect(resolveMode(50_000, "auto", "city")).toBe("atmosphere");
    expect(resolveMode(500_000, "auto", "atmosphere")).toBe("space");
    expect(resolveMode(4_200, "auto", "city")).toBe("city"); // hysteresis keeps city
    expect(resolveMode(500_000, "city", "space")).toBe("city"); // manual wins
  });

  it("keeps constant altitude when flying level for 100 km (curvature handled)", () => {
    const s = createShip(10 * DEG, 20 * DEG, 5000, 90);
    const rt = createRuntime();
    const probe = flat(0);
    let sample = sampleShip(s, rt);
    for (let i = 0; i < 60 * 130; i++) sample = stepFlight(s, rt, { ...none, thrust: 1 }, cfg, 1 / 60, probe);
    expect(sample.speed).toBeGreaterThan(300);
    expect(Math.abs(sample.alt - 5000)).toBeLessThan(60);
    expect(Math.abs(sample.pitch)).toBeLessThan(1.5);
    expect(Math.abs(sample.bank)).toBeLessThan(1.5);
  });

  it("flies over the North Pole without losing level or producing NaNs", () => {
    const s = createShip(85 * DEG, 30 * DEG, 8000, 0); // heading north
    const rt = createRuntime();
    const probe = flat(0);
    let maxLat = 0;
    let sample = sampleShip(s, rt);
    for (let i = 0; i < 60 * 400; i++) {
      sample = stepFlight(s, rt, { ...none, thrust: 1 }, cfg, 1 / 60, probe);
      maxLat = Math.max(maxLat, sample.lat / DEG);
      expect(Number.isFinite(sample.alt)).toBe(true);
    }
    expect(maxLat).toBeGreaterThan(89.5);
    // after crossing the pole we should be heading back south, still level at ~8 km
    expect(sample.lat / DEG).toBeLessThan(89);
    expect(Math.abs(sample.alt - 8000)).toBeLessThan(120);
    expect(Math.abs(sample.pitch)).toBeLessThan(3);
    const g = ecefToGeodetic(s.pos);
    const fwd = qForward(s.q);
    const north = enuFrame(g.lat, g.lon).north;
    expect(dot(fwd, north)).toBeLessThan(0); // now moving away from the pole = southward
  });

  it("never lets the ship end up under terrain and recovers from being buried", () => {
    const s = createShip(0.5, 0.5, 900, 0);
    const rt = createRuntime();
    const probe = flat(1000);
    let sample = stepFlight(s, rt, none, cfg, 1 / 60, probe);
    expect(sample.alt).toBeGreaterThanOrEqual(1000);
    for (let i = 0; i < 600; i++) sample = stepFlight(s, rt, { ...none, vertical: -1 }, cfg, 1 / 60, probe);
    expect(sample.alt).toBeGreaterThanOrEqual(1000 + 5);
  });

  it("slows down automatically when descending from high speed", () => {
    const s = createShip(0, 0, 2_000_000, 0);
    const rt = createRuntime();
    const probe = flat(0);
    for (let i = 0; i < 60 * 3; i++) stepFlight(s, rt, { ...none, thrust: 1 }, cfg, 1 / 60, probe);
    const fast = len(s.vel);
    expect(fast).toBeGreaterThan(50_000);
    // teleport near ground keeping velocity
    const near = degToEcef(0, 0, 200);
    s.pos = near;
    let sample = sampleShip(s, rt);
    for (let i = 0; i < 60 * 4; i++) sample = stepFlight(s, rt, none, cfg, 1 / 60, probe);
    expect(sample.speed).toBeLessThan(150);
  });

  it("emergency stop zeroes velocity and holds until input", () => {
    const s = createShip(0, 0, 3000, 0);
    const rt = createRuntime();
    for (let i = 0; i < 120; i++) stepFlight(s, rt, { ...none, thrust: 1 }, { ...cfg, assist: "realistic" }, 1 / 60, flat(0));
    expect(len(s.vel)).toBeGreaterThan(10);
    emergencyStop(s, rt);
    for (let i = 0; i < 30; i++) stepFlight(s, rt, none, { ...cfg, assist: "realistic" }, 1 / 60, flat(0));
    expect(len(s.vel)).toBe(0);
    stepFlight(s, rt, { ...none, thrust: 1 }, cfg, 1 / 60, flat(0));
    expect(len(s.vel)).toBeGreaterThan(0);
  });

  it("reset orientation levels the ship", () => {
    const s = createShip(0.3, 0.3, 5000, 45);
    const rt = createRuntime();
    for (let i = 0; i < 60; i++) stepFlight(s, rt, { ...none, roll: 1, mouseDY: -8 }, { ...cfg, assist: "realistic" }, 1 / 60, flat(0));
    rt.resetLevel = true;
    let sample = sampleShip(s, rt);
    for (let i = 0; i < 300; i++) sample = stepFlight(s, rt, none, cfg, 1 / 60, flat(0));
    expect(Math.abs(sample.pitch)).toBeLessThan(0.5);
    expect(Math.abs(sample.bank)).toBeLessThan(0.5);
    expect(dot(qUp(s.q), sample.up)).toBeGreaterThan(0.9999);
  });
});

describe("autopilot", () => {
  it("flies NYC -> Tokyo along the great circle, never below the surface, and arrives", () => {
    const s = createShip(40.7 * DEG, -74 * DEG, 5000, 0);
    const ap = new Autopilot();
    let arrived = false;
    ap.start(s, { id: "tokyo", name: "Tokyo", lat: 35.68 * DEG, lon: 139.65 * DEG, ground: 40, arriveAgl: 420 }, () => (arrived = true));
    let minAlt = Infinity;
    let maxStep = 0;
    let prev = [...s.pos];
    for (let i = 0; i < 60 * 40 && ap.active; i++) {
      ap.step(s, 1 / 60);
      const g = ecefToGeodetic(s.pos);
      minAlt = Math.min(minAlt, g.h);
      maxStep = Math.max(maxStep, len(sub(s.pos, prev as [number, number, number])));
      prev = [...s.pos];
    }
    expect(arrived).toBe(true);
    expect(minAlt).toBeGreaterThan(400);
    const g = ecefToGeodetic(s.pos);
    expect(greatCircleDistance(g.lat, g.lon, 35.68 * DEG, 139.65 * DEG)).toBeLessThan(150);
    expect(g.h).toBeCloseTo(460, -1);
    expect(len(s.vel)).toBe(0);
    expect(maxStep).toBeGreaterThan(1000); // it really flew fast at some point
  });

  it("can be cancelled mid-flight and keeps a velocity estimate", () => {
    const s = createShip(0, 0, 1000, 90);
    const ap = new Autopilot();
    ap.start(s, { id: "x", name: "X", lat: 0, lon: 0.5, ground: 0, arriveAgl: 400 });
    for (let i = 0; i < 200; i++) ap.step(s, 1 / 60);
    expect(ap.active).toBe(true);
    ap.cancel();
    expect(ap.active).toBe(false);
    expect(len(ap.velocity)).toBeGreaterThan(0);
  });
});

describe("building collision", () => {
  const lat0 = 40.75, lon0 = -73.98;
  const idx = new BuildingIndex();
  const sq = (c: number, r: number) => new Float64Array([c - r, c - r, c + r, c - r, c + r, c + r, c - r, c + r]);
  idx.addTile("t", lat0, lon0, [
    { ring: sq(0, 20), minX: -20, maxX: 20, minY: -20, maxY: 20, base: 10, top: 110 },
  ]);
  const at = (xEast: number, yNorth: number, h: number) => {
    const f = enuFrame(lat0 * DEG, lon0 * DEG);
    const base = geodeticToEcef(lat0 * DEG, lon0 * DEG, h);
    return [
      base[0] + f.east[0] * xEast + f.north[0] * yNorth,
      base[1] + f.east[1] * xEast + f.north[1] * yNorth,
      base[2] + f.east[2] * xEast + f.north[2] * yNorth,
    ] as [number, number, number];
  };

  it("detects walls, pushes out, and ignores free space", () => {
    expect(idx.resolve(at(60, 0, 50), 6)).toBeNull();
    const c = idx.resolve(at(23, 0, 50), 6)!;
    expect(c).not.toBeNull();
    expect(c.kind).toBe("wall");
    expect(c.depth).toBeGreaterThan(2.5);
    expect(c.depth).toBeLessThan(3.5);
    const res = applyContact(at(23, 0, 50), [-10, 0, 0], c);
    expect(len(res.pos)).toBeGreaterThan(0);
    const after = idx.resolve(res.pos, 6);
    expect(after === null || after.depth < 0.2).toBe(true);
  });

  it("lands on roofs rather than tunnelling through them", () => {
    const c = idx.resolve(at(0, 0, 112), 6)!;
    expect(c.kind).toBe("roof");
    expect(idx.resolve(at(0, 0, 130), 6)).toBeNull();
  });

  it("reports camera-inside queries", () => {
    expect(idx.isInside(at(0, 0, 50), 1)).toBe(true);
    expect(idx.isInside(at(100, 0, 50), 1)).toBe(false);
  });

  it("heading helper is stable", () => {
    const f = enuFrame(0.2, 0.3);
    expect(headingOf(f.east, 0.2, 0.3)).toBeCloseTo(90, 5);
    expect(headingOf(f.north, 0.2, 0.3)).toBeCloseTo(0, 5);
  });
});
