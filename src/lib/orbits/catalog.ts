import { gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";

export type SatKind = "station" | "sat" | "gps" | "starlink";

/**
 * Real satellites (CelesTrak TLEs, SGP4 propagation).
 *
 * Cost control: SGP4 is only re-run for a rotating slice of the catalogue every frame (each object about once
 * a second); between runs the position is extrapolated linearly from the SGP4 velocity (error over 1 s of a
 * LEO orbit is a few metres), then rotated from the inertial (TEME) frame into the Earth-fixed frame with the
 * current sidereal angle.  Output is ECEF metres, the same frame as the ship.
 */
export class OrbitCatalog {
  count = 0;
  names: string[] = [];
  kinds: SatKind[] = [];
  noradIds: string[] = [];
  updated = "";
  /** ECEF position in metres (x,y,z per object), valid after step(). */
  ecef = new Float64Array(0);
  /** ECEF velocity-ish (inertial, km/s, only used for orientation hints). */
  private recs: SatRec[] = [];
  private pos = new Float64Array(0); // TEME km
  private vel = new Float64Array(0); // TEME km/s
  private t0 = new Float64Array(0); // ms of last propagation
  private ok = new Uint8Array(0);
  private cursor = 0;
  loaded = false;

  async load(): Promise<boolean> {
    try {
      const res = await fetch("/api/satellites");
      if (!res.ok) return false;
      const data = (await res.json()) as { updated: string; sats: Array<[SatKind, string, string, string]> };
      const sats = data.sats ?? [];
      const recs: SatRec[] = [];
      const names: string[] = [];
      const kinds: SatKind[] = [];
      const ids: string[] = [];
      for (const [kind, name, l1, l2] of sats) {
        try {
          const rec = twoline2satrec(l1, l2);
          if (rec.error) continue;
          recs.push(rec);
          names.push(name);
          // CelesTrak's "stations" group also lists cubesats and visiting vehicles: only the actual station
          // modules (ISS …, CSS …) get the station model, everything else is drawn as an ordinary satellite
          kinds.push(kind === "station" && !/^(ISS|CSS) \(/.test(name) ? "sat" : kind);
          ids.push(l1.slice(2, 7).trim());
        } catch { /* skip malformed element set */ }
      }
      this.recs = recs;
      this.names = names;
      this.kinds = kinds;
      this.noradIds = ids;
      this.count = recs.length;
      this.updated = data.updated;
      this.pos = new Float64Array(this.count * 3);
      this.vel = new Float64Array(this.count * 3);
      this.t0 = new Float64Array(this.count);
      this.ok = new Uint8Array(this.count);
      this.ecef = new Float64Array(this.count * 3);
      const now = Date.now();
      for (let i = 0; i < this.count; i++) this.propagateOne(i, now);
      this.loaded = this.count > 0;
      return this.loaded;
    } catch {
      return false;
    }
  }

  private propagateOne(i: number, nowMs: number) {
    const r = propagate(this.recs[i], new Date(nowMs));
    if (!r || !r.position || !r.velocity || typeof r.position === "boolean") {
      this.ok[i] = 0;
      return;
    }
    const p = r.position, v = r.velocity;
    const o = i * 3;
    this.pos[o] = p.x; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z;
    this.vel[o] = v.x; this.vel[o + 1] = v.y; this.vel[o + 2] = v.z;
    this.t0[i] = nowMs;
    this.ok[i] = 1;
  }

  isValid(i: number) {
    return this.ok[i] === 1;
  }

  /** Advance the catalogue to `nowMs`: refresh a slice of SGP4 states, then fill `ecef` for everyone. */
  step(nowMs: number, dtSec: number) {
    if (!this.loaded) return;
    const n = this.count;
    // normal frames refresh ~dt of the catalogue (each object about once a second, capped at 25% per frame);
    // after a pause (dtSec >= 1) refresh everything at once so nothing is extrapolated from stale states
    const frac = dtSec >= 1 ? 1 : Math.min(dtSec, 0.25);
    const slice = Math.min(n, Math.max(8, Math.ceil(n * frac)));
    for (let k = 0; k < slice; k++) {
      this.propagateOne(this.cursor, nowMs);
      this.cursor = (this.cursor + 1) % n;
    }
    const g = gstime(new Date(nowMs));
    const c = Math.cos(g), s = Math.sin(g);
    for (let i = 0; i < n; i++) {
      if (!this.ok[i]) continue;
      const o = i * 3;
      const dt = (nowMs - this.t0[i]) / 1000;
      const x = this.pos[o] + this.vel[o] * dt;
      const y = this.pos[o + 1] + this.vel[o + 1] * dt;
      const z = this.pos[o + 2] + this.vel[o + 2] * dt;
      this.ecef[o] = (x * c + y * s) * 1000;
      this.ecef[o + 1] = (-x * s + y * c) * 1000;
      this.ecef[o + 2] = z * 1000;
    }
  }
}
