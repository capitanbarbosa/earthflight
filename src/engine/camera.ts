/**
 * Camera rig: chase / cockpit / free-orbit / intro.
 *
 * All smoothing happens on the camera offset *relative to the ship* and on the camera
 * orientation, never on absolute ECEF position.  That keeps the lag identical at 3 m/s and
 * 3,000 km/s (absolute-position smoothing would leave the camera millions of metres behind).
 * Distances are in units of the ship's visual length L so the framing is constant across scales.
 */
import {
  DEG, Quat, Vec3, add, clamp, cross, damp, len, madd, norm, qAxisAngle, qForward, qIdentity, qMul,
  qRight, qRotate, qSlerp, qUp, scale, sub,
} from "./math3";
import { ecefToGeodetic } from "./coordinates";
import type { FlightModeId, FlightSample, ShipState } from "./physics";

export type CameraMode = "chase" | "cockpit" | "free" | "intro";

export interface CameraPose {
  pos: Vec3;
  dir: Vec3;
  up: Vec3;
  /** Vertical field of view, radians. */
  fov: number;
}

export interface CameraObstacles {
  groundAt(lat: number, lon: number): number | null;
  insideBuilding(pos: Vec3, pad: number): boolean;
}

export interface CameraFrameParams {
  /** 0..1 visual speed intensity (FOV kick / chase stretch). */
  speedFx: number;
  /** 0..1 shake amount. */
  shake: number;
  /** Intro orbit clock (seconds). */
  introTime: number;
  mode: FlightModeId;
}

const CHASE_BY_MODE: Record<FlightModeId, { back: number; up: number }> = {
  space: { back: 3.6, up: 1.05 },
  atmosphere: { back: 3.0, up: 0.9 },
  city: { back: 2.5, up: 0.75 },
};

export class CameraRig {
  mode: CameraMode = "intro";
  private camQ: Quat = qIdentity();
  private rel: Vec3 = [0, 0, 0];
  private fov = 48 * DEG;
  private clearT = 1;
  private shakeX = 0;
  private shakeY = 0;
  private initialised = false;
  /** < 1 slows all easing (used for the intro → flight transition). */
  easeScale = 1;
  freeYaw = 0.5;
  freePitch = 0.25;
  freeDist = 3.4;

  setMode(m: CameraMode) {
    this.mode = m;
  }

  orbit(dx: number, dy: number) {
    this.freeYaw -= dx * 0.004;
    this.freePitch = clamp(this.freePitch + dy * 0.004, -1.45, 1.45);
  }

  zoom(delta: number) {
    this.freeDist = clamp(this.freeDist * Math.exp(delta * 0.0012), 1.4, 14);
  }

  update(
    dt: number,
    ship: ShipState,
    sample: FlightSample,
    p: CameraFrameParams,
    obstacles: CameraObstacles,
  ): CameraPose {
    const L = sample.length;
    const ease = this.easeScale;
    this.easeScale = Math.min(1, this.easeScale + dt / 4); // relax back to normal
    const e = (rate: number) => damp(rate * ease, dt);
    const shipFwd = qForward(ship.q);
    const shipUp = qUp(ship.q);
    const shipRight = qRight(ship.q);
    const localUp = sample.up;

    let targetRel: Vec3;
    let lookAt: Vec3; // relative to ship
    let upHint: Vec3;
    let fovT: number;
    let obstruct = true;

    switch (this.mode) {
      case "cockpit": {
        this.camQ = qSlerp(this.camQ, ship.q, e(30));
        targetRel = qRotate(this.camQ, [0, 0.1 * L, -0.12 * L]);
        lookAt = madd(targetRel, qForward(this.camQ), L);
        upHint = qUp(this.camQ);
        fovT = (78 + 16 * p.speedFx) * DEG;
        obstruct = false;
        break;
      }
      case "free": {
        const oq = qMul(ship.q, qMul(qAxisAngle([0, 1, 0], this.freeYaw), qAxisAngle([1, 0, 0], -this.freePitch)));
        this.camQ = oq;
        targetRel = qRotate(oq, [0, 0, this.freeDist * L]);
        lookAt = [0, 0, 0];
        upHint = qUp(oq);
        fovT = 58 * DEG;
        break;
      }
      case "intro": {
        // From orbit the horizon sits ~55° below level, so to frame "ship over the planet" the camera
        // must look down steeply: it hovers high above/behind the ship and slowly circles it.
        const th = 0.9 + p.introTime * 0.045;
        const R = 5.6 * L;
        const el = 62 * DEG;
        const away = add(scale(shipRight, Math.sin(th)), scale(shipFwd, -Math.cos(th))); // horizontal, camera side
        targetRel = add(scale(away, Math.cos(el) * R), scale(localUp, Math.sin(el) * R));
        // aim slightly above the ship so it sits just under the title block
        const d0 = norm(scale(targetRel, -1));
        const camRight = norm(cross(d0, localUp));
        const camUp = cross(camRight, d0);
        lookAt = add(scale(camUp, -0.12 * L), scale(camRight, 0.0 * L));
        upHint = scale(away, -1);
        fovT = 46 * DEG;
        this.camQ = ship.q;
        obstruct = false;
        break;
      }
      default: {
        // chase
        this.camQ = qSlerp(this.camQ, ship.q, e(6.5));
        const c = CHASE_BY_MODE[p.mode];
        const stretch = 1 + 0.35 * p.speedFx;
        targetRel = qRotate(this.camQ, [0, c.up * L, c.back * L * stretch]);
        lookAt = madd([0, 0, 0], qForward(this.camQ), 1.6 * L);
        upHint = qUp(this.camQ);
        fovT = (62 + 18 * p.speedFx) * DEG;
      }
    }

    if (!this.initialised) {
      this.rel = targetRel;
      this.fov = fovT;
      this.initialised = true;
    } else {
      const k = this.mode === "free" ? 10 : this.mode === "cockpit" ? 40 : this.mode === "intro" ? 3 : 9;
      this.rel = [
        this.rel[0] + (targetRel[0] - this.rel[0]) * e(k),
        this.rel[1] + (targetRel[1] - this.rel[1]) * e(k),
        this.rel[2] + (targetRel[2] - this.rel[2]) * e(k),
      ];
      this.fov += (fovT - this.fov) * e(4);
    }

    // ---- obstruction: pull the camera toward the ship until it's in free space -----------
    let t = 1;
    if (obstruct && this.mode !== "intro" && sample.agl < 3000) {
      const samples = 6;
      t = 0;
      for (let i = samples; i >= 1; i--) {
        const ti = i / samples;
        const pt = madd(ship.pos, this.rel, ti);
        if (!this.blocked(pt, obstacles)) {
          t = ti;
          break;
        }
      }
    }
    this.clearT = t < this.clearT ? t : this.clearT + (t - this.clearT) * damp(2.5, dt);
    const rel = scale(this.rel, this.clearT);
    let pos = add(ship.pos, rel);

    if (this.mode === "cockpit" || this.mode === "intro") {
      // never let the eye end up under the terrain
      const g = ecefToGeodetic(pos);
      const gh = obstacles.groundAt(g.lat, g.lon);
      if (gh !== null && g.h < gh + 1.5 && this.mode === "cockpit") {
        pos = madd(pos, sample.up, gh + 1.5 - g.h);
      }
    }

    // ---- orientation ---------------------------------------------------------------------
    const target = madd(ship.pos, lookAt, 1);
    let dir = norm(sub(target, pos));
    if (len(dir) === 0) dir = shipFwd;
    let up = norm(sub(upHint, scale(dir, upHint[0] * dir[0] + upHint[1] * dir[1] + upHint[2] * dir[2])));
    if (len(up) === 0) up = shipUp;

    // ---- shake ---------------------------------------------------------------------------
    if (p.shake > 0.001) {
      this.shakeX += (Math.random() * 2 - 1 - this.shakeX) * damp(30, dt);
      this.shakeY += (Math.random() * 2 - 1 - this.shakeY) * damp(30, dt);
      const amp = p.shake * 0.006;
      const right = norm(cross(dir, up));
      dir = norm(add(add(dir, scale(right, this.shakeX * amp)), scale(up, this.shakeY * amp)));
      up = norm(sub(up, scale(dir, up[0] * dir[0] + up[1] * dir[1] + up[2] * dir[2])));
    }

    return { pos, dir, up, fov: this.fov };
  }

  private blocked(p: Vec3, o: CameraObstacles): boolean {
    const g = ecefToGeodetic(p);
    const gh = o.groundAt(g.lat, g.lon);
    if (gh !== null && g.h < gh + 2) return true;
    return o.insideBuilding(p, 2);
  }
}