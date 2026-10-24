/**
 * Cinematic travel autopilot.
 *
 * The ship follows a great-circle arc (spherical interpolation of geocentric directions — never a
 * lat/lon lerp) with an altitude profile layered on top, so it can never cut through the planet:
 *
 *   orient  →  climb/descend to cruise altitude  →  cruise  →  decelerate & descend to the target.
 *
 * Progress along the arc uses a quintic smootherstep so speed ramps up gently, peaks mid-flight and
 * reaches ~0 at the destination.  Terrain/building collision still runs after every step.
 */
import { Quat, Vec3, clamp, damp, lerp, len, norm, qLookAlong, qSlerp, scale, smootherstep, smoothstep, sub } from "./math3";
import { GreatCircle, ecefToGeodetic, enuFrame, geodeticToEcef } from "./coordinates";
import type { ShipState } from "./physics";

export interface TravelTarget {
  id: string;
  name: string;
  lat: number; // rad
  lon: number; // rad
  /** Terrain height at the target if known (m above ellipsoid). */
  ground: number;
  /** Desired arrival height above ground (m). */
  arriveAgl: number;
}

export type TravelPhase = "idle" | "orient" | "cruise" | "arrived";

export class Autopilot {
  phase: TravelPhase = "idle";
  target: TravelTarget | null = null;
  progress = 0; // 0..1
  /** Remaining distance along the arc (m). */
  remaining = 0;
  duration = 0;
  private gc: GreatCircle | null = null;
  private t = 0;
  private orientDur = 1.4;
  private startH = 0;
  private cruiseH = 0;
  private endH = 0;
  private prevPos: Vec3 = [0, 0, 0];
  private arrivedCb: (() => void) | null = null;
  /** Extra altitude (m) added when terrain/buildings forced the ship upward, so the path doesn't fight the collision. */
  private lift = 0;
  /** Live velocity estimate (m/s) for hand-back to physics when cancelled. */
  velocity: Vec3 = [0, 0, 0];

  get active() {
    return this.phase === "orient" || this.phase === "cruise";
  }

  start(ship: ShipState, target: TravelTarget, onArrive?: () => void) {
    const g = ecefToGeodetic(ship.pos);
    this.gc = new GreatCircle(g.lat, g.lon, target.lat, target.lon);
    this.target = target;
    const D = this.gc.distance;
    this.startH = g.h;
    this.endH = target.ground + target.arriveAgl;
    this.cruiseH = clamp(D * 0.12, 150, 2_000_000);
    // High start + near target: skip the climb.
    if (this.startH > this.cruiseH && D < this.startH) this.cruiseH = this.startH;
    this.duration = clamp(5 + 2.4 * Math.log2(1 + D / 40_000), 7, 24);
    this.orientDur = D < 800 ? 0.4 : 1.4;
    this.t = 0;
    this.lift = 0;
    this.progress = 0;
    this.remaining = D;
    this.phase = "orient";
    this.prevPos = [...ship.pos] as Vec3;
    this.velocity = [0, 0, 0];
    this.arrivedCb = onArrive ?? null;
  }

  cancel() {
    this.phase = "idle";
    this.target = null;
    this.gc = null;
  }

  /** Update arrival ground height as real terrain tiles stream in near the end of the flight. */
  setGround(h: number) {
    if (this.target) {
      this.target.ground = h;
      this.endH = h + this.target.arriveAgl;
    }
  }

  addLift(dh: number) {
    this.lift = Math.min(this.lift + dh, 3000);
  }

  private altitudeAt(f: number): number {
    const climb = smoothstep(0, 0.28, f);
    const descend = smoothstep(0.52, 1.0, f);
    const mid = lerp(this.startH, this.cruiseH, climb);
    return lerp(mid, this.endH, descend) + this.lift;
  }

  private pose(f: number): { pos: Vec3; q: Quat } {
    const gc = this.gc!;
    const pos = gc.position(f, this.altitudeAt(f));
    const f2 = Math.min(1, f + 0.004);
    const f1 = f2 - 0.004 > 0 ? f2 - 0.004 : 0;
    let dir = sub(gc.position(f2, this.altitudeAt(f2)), gc.position(f1, this.altitudeAt(f1)));
    const g = ecefToGeodetic(pos);
    const up = enuFrame(g.lat, g.lon).up;
    if (len(dir) < 1e-6) dir = gc.tangent(f);
    return { pos, q: qLookAlong(norm(dir), up) };
  }

  /** Advance. Writes into `ship`; returns true on the frame the flight completes. */
  step(ship: ShipState, dt: number): boolean {
    if (!this.active || !this.gc || !this.target) return false;
    this.t += dt;
    this.lift *= Math.exp(-0.12 * dt);
    const tau = Math.max(0, this.t - this.orientDur);
    const f = smootherstep(tau / this.duration);
    this.progress = f;
    this.remaining = this.gc.distance * (1 - f);
    this.phase = this.t < this.orientDur ? "orient" : "cruise";

    const { pos, q } = this.pose(f);
    ship.pos = pos;
    ship.q = this.phase === "orient" ? qSlerp(ship.q, q, damp(3.2, dt)) : qSlerp(ship.q, q, damp(8, dt));
    ship.angVel = [0, 0, 0];
    this.velocity = scale(sub(pos, this.prevPos), 1 / Math.max(dt, 1e-4));
    ship.vel = this.velocity;
    this.prevPos = pos;

    if (tau >= this.duration) {
      // Hand back control: level, slightly nose-down, nearly stationary.
      const g = ecefToGeodetic(ship.pos);
      const fr = enuFrame(g.lat, g.lon);
      const fwd = norm(sub(this.gc.tangent(1), scale(fr.up, 0.1)));
      ship.q = qLookAlong(fwd, fr.up);
      ship.vel = [0, 0, 0];
      this.phase = "arrived";
      const cb = this.arrivedCb;
      this.arrivedCb = null;
      cb?.();
      return true;
    }
    return false;
  }
}

/** Geodetic helper used by UI code. */
export const targetPosition = (t: TravelTarget): Vec3 => geodeticToEcef(t.lat, t.lon, t.ground);
export const DEFAULT_ARRIVE_AGL = 420;
