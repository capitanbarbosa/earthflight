/**
 * Six-degrees-of-freedom flight model in ECEF coordinates.
 *
 * Design notes
 * ------------
 * - State lives in Earth-centred Earth-fixed metres, orientation is a body→ECEF quaternion.
 * - "Follow the horizon": when the ship moves, the local up vector rotates.  We rotate the ship's
 *   orientation and velocity by the same minimal rotation (parallel transport of `up`) weighted
 *   by altitude.  Near the ground the ship therefore stays level over the curvature of the Earth
 *   and across the poles, in space it flies a true straight (Newtonian) line.
 * - Speed limits are a smooth function of altitude above *ground* (AGL), so descending
 *   automatically bleeds speed and precision grows toward the surface.
 */
import {
  DEG, Quat, Vec3, add, clamp, cross, damp, dot, len, lerp, madd, norm, qAxisAngle, qForward, qFromRotVec,
  qFromTo, qLookAlong, qMul, qNorm, qRight, qRotate, qSlerp, qUp, scale, smoothstep, sub,
} from "./math3";
import { ecefToGeodetic, enuFrame, geodeticToEcef, headingOf, pitchOf } from "./coordinates";

export type FlightAssist = "arcade" | "realistic";
export type FlightModeId = "space" | "atmosphere" | "city";
export type ModeSelection = FlightModeId | "auto";

export interface ShipState {
  pos: Vec3; // ECEF metres
  vel: Vec3; // ECEF m/s
  q: Quat; // body → ECEF
  angVel: Vec3; // body-frame angular rate (x: pitch, y: yaw, z: roll) rad/s
}

export interface ControlInput {
  thrust: number; // -1..1  (S brake/reverse, W forward)
  strafe: number; // -1..1  (A left, D right)
  vertical: number; // -1..1 (Shift down, Space up)
  roll: number; // -1..1  (E right, Q left)
  mouseDX: number; // accumulated px since last frame
  mouseDY: number;
  /** Virtual look stick, -1..1. Positive lookX matches mouse-right; positive lookY pitches the nose up. */
  lookX?: number;
  lookY?: number;
}

export interface GroundProbe {
  /** Terrain height above the WGS84 ellipsoid at lat/lon (radians), or null if tiles aren't loaded. */
  heightAt(lat: number, lon: number): number | null;
}

export interface ModeConfig {
  id: FlightModeId;
  label: string;
  blurb: string;
  /** Hard cap for the mode in m/s (the altitude cap always applies as well). */
  maxSpeed: number;
  /** Max steering rate rad/s. */
  maxTurn: number;
}

export const MODES: Record<FlightModeId, ModeConfig> = {
  space: { id: "space", label: "SPACE FLIGHT", blurb: "Orbital speeds", maxSpeed: Infinity, maxTurn: 70 * DEG },
  atmosphere: { id: "atmosphere", label: "ATMOSPHERIC", blurb: "Terrain aware", maxSpeed: 6000, maxTurn: 90 * DEG },
  city: { id: "city", label: "CITY FLIGHT", blurb: "Slow & precise", maxSpeed: 160, maxTurn: 105 * DEG },
};

/** AGL (m) → max speed (m/s). Log-log interpolated so every decade of altitude feels similar. */
const SPEED_TABLE: Array<[number, number]> = [
  [0, 30],
  [30, 45],
  [150, 90],
  [600, 220],
  [3_000, 600],
  [15_000, 2_500],
  [80_000, 11_000],
  [400_000, 60_000],
  [2_000_000, 250_000],
  [10_000_000, 1_000_000],
  [40_000_000, 3_000_000],
];

export function altitudeSpeedCap(agl: number): number {
  const h = Math.max(0, agl);
  if (h >= SPEED_TABLE[SPEED_TABLE.length - 1][0]) return SPEED_TABLE[SPEED_TABLE.length - 1][1];
  for (let i = 1; i < SPEED_TABLE.length; i++) {
    const [h1, v1] = SPEED_TABLE[i];
    if (h <= h1) {
      const [h0, v0] = SPEED_TABLE[i - 1];
      // interpolate in log space on (h+10) to avoid log(0)
      const t = (Math.log(h + 10) - Math.log(h0 + 10)) / (Math.log(h1 + 10) - Math.log(h0 + 10));
      return Math.exp(lerp(Math.log(v0), Math.log(v1), t));
    }
  }
  return SPEED_TABLE[SPEED_TABLE.length - 1][1];
}

/** Resolve the active flight mode with hysteresis so it doesn't flicker on a threshold. */
export function resolveMode(agl: number, selection: ModeSelection, prev: FlightModeId): FlightModeId {
  if (selection !== "auto") return selection;
  const cityUp = 4500, cityDown = 3800;
  const spaceUp = 130_000, spaceDown = 105_000;
  if (prev === "city") {
    if (agl > cityUp) return agl > spaceUp ? "space" : "atmosphere";
    return "city";
  }
  if (prev === "atmosphere") {
    if (agl < cityDown) return "city";
    if (agl > spaceUp) return "space";
    return "atmosphere";
  }
  if (agl < cityDown) return "city";
  if (agl < spaceDown) return "atmosphere";
  return "space";
}

/** Visual/collision length of the ship; grows with altitude so it stays readable on screen. */
export function shipLength(agl: number): number {
  return clamp(agl * 0.02, 10, 250_000);
}

export interface FlightRuntime {
  lastGround: number;
  groundKnown: boolean;
  mode: FlightModeId;
  resetLevel: boolean;
  hold: boolean;
  collision: "none" | "terrain" | "building";
  collisionAge: number; // seconds since last collision
  recovered: boolean; // set for one frame when we pulled the ship out of terrain
  lastAccel: number;
  thrustLevel: number; // 0..1 smoothed, for FX/audio
}

export const createRuntime = (): FlightRuntime => ({
  lastGround: 0,
  groundKnown: false,
  mode: "space",
  resetLevel: false,
  hold: false,
  collision: "none",
  collisionAge: 99,
  recovered: false,
  lastAccel: 0,
  thrustLevel: 0,
});

export interface FlightConfig {
  assist: FlightAssist;
  selection: ModeSelection;
  speedScale: number; // 0.02..1
  sensitivity: number; // 1 = default
  invertY: boolean;
}

export interface FlightSample {
  lat: number; // rad
  lon: number; // rad
  alt: number; // m above ellipsoid
  agl: number; // m above ground
  ground: number;
  groundKnown: boolean;
  speed: number;
  vSpeed: number; // m/s along local up
  heading: number; // deg
  pitch: number; // deg
  bank: number; // deg, + = right wing down
  cap: number;
  length: number;
  mode: FlightModeId;
  up: Vec3;
  accel: number;
  thrustLevel: number;
}

export function createShip(lat: number, lon: number, alt: number, headingDeg = 0): ShipState {
  const pos = geodeticToEcef(lat, lon, alt);
  const f = enuFrame(lat, lon);
  const h = headingDeg * DEG;
  const fwd = add(scale(f.north, Math.cos(h)), scale(f.east, Math.sin(h)));
  return { pos, vel: [0, 0, 0], q: qLookAlong(fwd, f.up), angVel: [0, 0, 0] };
}

export function sampleShip(s: ShipState, rt: FlightRuntime): FlightSample {
  const g = ecefToGeodetic(s.pos);
  const f = enuFrame(g.lat, g.lon);
  const fwd = qForward(s.q);
  const right = qRight(s.q);
  const agl = g.h - rt.lastGround;
  const speed = len(s.vel);
  const heading = headingOf(fwd, g.lat, g.lon);
  return {
    lat: g.lat,
    lon: g.lon,
    alt: g.h,
    agl,
    ground: rt.lastGround,
    groundKnown: rt.groundKnown,
    speed,
    vSpeed: dot(s.vel, f.up),
    heading: Number.isNaN(heading) ? 0 : heading,
    pitch: pitchOf(fwd, f.up),
    bank: -Math.asin(clamp(dot(right, f.up), -1, 1)) / DEG,
    cap: altitudeSpeedCap(agl),
    length: shipLength(agl),
    mode: rt.mode,
    up: f.up,
    accel: rt.lastAccel,
    thrustLevel: rt.thrustLevel,
  };
}

/** Parallel-transport the local frame from `oldUp` to `newUp`, weighted by w ∈ [0,1]. */
function transportFrame(s: ShipState, oldUp: Vec3, newUp: Vec3, w: number) {
  if (w <= 0) return;
  // atan2(|a×b|, a·b) stays accurate for the tiny per-frame angles (~1e-6 rad) where acos() collapses.
  const axis = cross(oldUp, newUp);
  const al = len(axis);
  if (al < 1e-16) return;
  const angle = Math.atan2(al, dot(oldUp, newUp)) * w;
  const r = qAxisAngle(axis, angle);
  s.q = qNorm(qMul(r, s.q));
  s.vel = qRotate(r, s.vel);
}

export function emergencyStop(s: ShipState, rt: FlightRuntime) {
  s.vel = [0, 0, 0];
  s.angVel = [0, 0, 0];
  rt.hold = true;
}

/** Advance the simulation by dt seconds. Returns the new sample (also used for HUD/FX). */
export function stepFlight(
  s: ShipState,
  rt: FlightRuntime,
  input: ControlInput,
  cfg: FlightConfig,
  dt: number,
  probe: GroundProbe,
): FlightSample {
  if (dt <= 0) return sampleShip(s, rt);
  dt = Math.min(dt, 0.1);

  // ---- environment -------------------------------------------------------------------------
  let g = ecefToGeodetic(s.pos);
  const gh = probe.heightAt(g.lat, g.lon);
  if (gh !== null && Number.isFinite(gh)) {
    rt.lastGround = gh;
    rt.groundKnown = true;
  } else {
    rt.groundKnown = false;
  }
  let up = enuFrame(g.lat, g.lon).up;
  const agl = g.h - rt.lastGround;
  rt.mode = resolveMode(agl, cfg.selection, rt.mode);
  const mode = MODES[rt.mode];
  const L = shipLength(agl);
  const clearance = Math.max(5, L * 0.6);

  let cap = Math.min(altitudeSpeedCap(agl), mode.maxSpeed) * clamp(cfg.speedScale, 0.02, 1);
  if (!rt.groundKnown && agl < 8000) cap = Math.min(cap, 120); // unknown terrain: stay cautious
  const arcade = cfg.assist === "arcade";

  // ---- attitude ----------------------------------------------------------------------------
  const sens = 0.0022 * cfg.sensitivity;
  const maxTurn = mode.maxTurn;
  const yInv = cfg.invertY ? -1 : 1;
  const lookX = input.lookX ?? 0;
  const lookY = input.lookY ?? 0;
  // Full stick ≈ a hard mouse turn. The look-sensitivity slider scales it, then the mode caps it.
  const stickScale = Math.min(0.95, 0.92 * cfg.sensitivity);
  const wantPitch = clamp((-input.mouseDY * yInv * sens) / dt + lookY * yInv * maxTurn * stickScale, -maxTurn, maxTurn);
  const wantYaw = clamp((-input.mouseDX * sens) / dt - lookX * maxTurn * stickScale, -maxTurn, maxTurn);
  const rollRate = 105 * DEG;
  const wantRoll = input.roll * rollRate;
  const kIn = arcade ? 14 : 7;
  const kOut = arcade ? 9 : 1.4;
  const w = s.angVel;
  const hasP = Math.abs(input.mouseDY) > 0 || Math.abs(lookY) > 0.02;
  const hasY = Math.abs(input.mouseDX) > 0 || Math.abs(lookX) > 0.02;
  const hasR = Math.abs(input.roll) > 0;
  w[0] += ((hasP ? wantPitch : 0) - w[0]) * damp(hasP ? kIn : kOut, dt);
  w[1] += ((hasY ? wantYaw : 0) - w[1]) * damp(hasY ? kIn : kOut, dt);
  w[2] += ((hasR ? wantRoll : 0) - w[2]) * damp(hasR ? kIn : kOut, dt);

  if (rt.resetLevel) {
    // Smoothly level out: forward projected onto the horizon, up = local up.
    const fwd = qForward(s.q);
    let fh = sub(fwd, scale(up, dot(fwd, up)));
    if (len(fh) < 0.05) fh = enuFrame(g.lat, g.lon).north;
    const target = qLookAlong(fh, up);
    s.q = qSlerp(s.q, target, damp(5, dt));
    s.angVel = [0, 0, 0];
    if (dot(qForward(s.q), qForward(target)) > 0.99995 && Math.abs(dot(qUp(s.q), up)) > 0.99995) rt.resetLevel = false;
  } else {
    s.q = qNorm(qMul(s.q, qFromRotVec([w[0] * dt, w[1] * dt, w[2] * dt])));
  }

  // Arcade auto-level of roll when the pilot isn't rolling and we're in/near the atmosphere.
  if (arcade && !hasR && agl < 150_000 && !rt.resetLevel) {
    const fwd = qForward(s.q);
    if (Math.abs(dot(fwd, up)) < 0.97) {
      const bank = Math.asin(clamp(dot(qRight(s.q), up), -1, 1));
      const k = damp(2.2, dt);
      s.q = qNorm(qMul(s.q, qAxisAngle([0, 0, 1], -bank * k)));
    }
  }

  // ---- translation -------------------------------------------------------------------------
  const fwd = qForward(s.q);
  const right = qRight(s.q);
  const anyMove = input.thrust !== 0 || input.strafe !== 0 || input.vertical !== 0;
  if (rt.hold && anyMove) rt.hold = false;
  const prevVel = s.vel;

  if (rt.hold) {
    s.vel = [0, 0, 0];
  } else {
    const A = cap / (arcade ? 1.6 : 3.4); // acceleration, m/s²
    let acc: Vec3 = [0, 0, 0];
    let thrustMag = 0;
    if (input.thrust > 0) {
      acc = madd(acc, fwd, input.thrust * A);
      thrustMag = Math.max(thrustMag, input.thrust);
    } else if (input.thrust < 0) {
      const vF = dot(s.vel, fwd);
      const sp = len(s.vel);
      if (vF > 1 && sp > 0.5) {
        // brake: retro-thrust opposite to travel direction (can't overshoot zero)
        const brake = Math.min(A * 1.8 * -input.thrust, sp / dt);
        acc = madd(acc, scale(s.vel, 1 / sp), -brake);
        thrustMag = Math.max(thrustMag, 0.6);
      } else {
        acc = madd(acc, fwd, input.thrust * A * 0.5);
        thrustMag = Math.max(thrustMag, 0.35);
      }
    }
    if (input.strafe) {
      acc = madd(acc, right, input.strafe * A * 0.7);
      thrustMag = Math.max(thrustMag, Math.abs(input.strafe) * 0.5);
    }
    if (input.vertical) {
      acc = madd(acc, up, input.vertical * A * 0.7);
      thrustMag = Math.max(thrustMag, Math.abs(input.vertical) * 0.5);
    }
    s.vel = madd(s.vel, acc, dt);

    // drag / coasting
    let k: number;
    if (arcade) k = anyMove ? 0.12 : 1.0;
    else k = 0.01 + 0.25 * Math.exp(-Math.max(0, agl) / 8000);
    s.vel = scale(s.vel, Math.exp(-k * dt));

    // arcade "grip": while thrusting forward the velocity vector swings toward the nose
    if (arcade && input.thrust > 0) {
      const sp = len(s.vel);
      if (sp > 1) {
        const dir = norm(add(scale(s.vel, 1 / sp), scale(sub(fwd, scale(s.vel, 1 / sp)), damp(3, dt))));
        s.vel = scale(dir, sp);
      }
    }

    // altitude-aware speed cap: ease down to it (so descent bleeds speed smoothly)
    const sp = len(s.vel);
    if (sp > cap) {
      const ns = cap + (sp - cap) * Math.exp(-2.5 * dt);
      s.vel = scale(s.vel, ns / sp);
    }
    // snap tiny drift to rest
    if (!anyMove && arcade && len(s.vel) < 0.15) s.vel = [0, 0, 0];

    rt.thrustLevel += (thrustMag - rt.thrustLevel) * damp(6, dt);
  }
  if (rt.hold) rt.thrustLevel += (0 - rt.thrustLevel) * damp(6, dt);

  // ---- terrain avoidance (look-ahead) --------------------------------------------------------
  const sp0 = len(s.vel);
  if (agl < 60_000 && sp0 > 3 && !rt.hold) {
    const T = clamp(2.5, 0.5, 4);
    const ahead = madd(s.pos, s.vel, T);
    const ga = ecefToGeodetic(ahead);
    const gAhead = probe.heightAt(ga.lat, ga.lon);
    if (gAhead !== null && Number.isFinite(gAhead)) {
      const need = gAhead + clearance * 3 - ga.h;
      if (need > 0) {
        const pull = Math.min((need / (T * T)) * 2, cap * 0.8);
        s.vel = madd(s.vel, up, pull * dt);
      }
    }
  }

  // ---- integrate position ------------------------------------------------------------------
  const oldUp = up;
  s.pos = madd(s.pos, s.vel, dt);
  g = ecefToGeodetic(s.pos);
  up = enuFrame(g.lat, g.lon).up;
  const wTransport = 1 - smoothstep(100_000, 2_000_000, agl);
  transportFrame(s, oldUp, up, wTransport);

  enforceTerrainFloor(s, rt, probe, dt);

  rt.lastAccel = len(sub(s.vel, prevVel)) / dt;
  return sampleShip(s, rt);
}

/**
 * Hard safety net: the ship centre may never sit below terrain + clearance.
 * - If the ship is *inside* the terrain (e.g. teleported, tiles refined under it) it is lifted out.
 * - If terrain data isn't loaded we keep the last known ground height (never trust "unknown = 0"
 *   once we've seen real data), and below 50 km we still enforce at least the clearance.
 * Used by the free-flight physics *and* the autopilot so neither can burrow into a mountain.
 */
export function enforceTerrainFloor(s: ShipState, rt: FlightRuntime, probe: GroundProbe, dt: number) {
  rt.recovered = false;
  const g = ecefToGeodetic(s.pos);
  const ghNew = probe.heightAt(g.lat, g.lon);
  let groundNow = rt.lastGround;
  if (ghNew !== null && Number.isFinite(ghNew)) {
    groundNow = ghNew;
    rt.lastGround = ghNew;
    rt.groundKnown = true;
  }
  const clearance = Math.max(5, shipLength(g.h - groundNow) * 0.6);
  const floor = groundNow + clearance;
  if (g.h < floor && (rt.groundKnown || ghNew !== null || g.h < 50_000)) {
    const deep = g.h < groundNow - 2;
    const up = enuFrame(g.lat, g.lon).up;
    s.pos = geodeticToEcef(g.lat, g.lon, floor);
    const vUp = dot(s.vel, up);
    if (vUp < 0) s.vel = sub(s.vel, scale(up, vUp));
    rt.collision = "terrain";
    rt.collisionAge = 0;
    rt.recovered = deep;
  } else {
    rt.collisionAge += dt;
    if (rt.collisionAge > 0.6) rt.collision = "none";
  }
}
