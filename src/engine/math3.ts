/**
 * Tiny double-precision vector / quaternion helpers.
 *
 * Everything in the flight engine is expressed in Earth-centred, Earth-fixed (ECEF) metres,
 * so values reach ~4e7 and need float64.  JS numbers are float64 already; we only need a few
 * allocation-light helpers (kept dependency-free so the engine is unit-testable in Node).
 *
 * Quaternions are [x, y, z, w].  Ship body axes: +X right, +Y up, -Z forward.
 */
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-300 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** a + b*s */
export const madd = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const copy3 = (a: Vec3): Vec3 => [a[0], a[1], a[2]];

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const wrapPi = (a: number) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};

export const qIdentity = (): Quat => [0, 0, 0, 1];
export const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
export const qAxisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  const a = norm(axis);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
};
/** Rotation from body-space vector deltas (rad) — small-angle exponential map. */
export const qFromRotVec = (r: Vec3): Quat => {
  const ang = len(r);
  if (ang < 1e-12) return [r[0] / 2, r[1] / 2, r[2] / 2, 1];
  const s = Math.sin(ang / 2) / ang;
  return [r[0] * s, r[1] * s, r[2] * s, Math.cos(ang / 2)];
};
export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const qv: Vec3 = [q[0], q[1], q[2]];
  const t = scale(cross(qv, v), 2);
  return add(add(v, scale(t, q[3])), cross(qv, t));
};
export const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (cos < 0) {
    cos = -cos;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cos > 0.9995) {
    return qNorm([
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ]);
  }
  const th = Math.acos(cos);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
};

/** Shortest-arc rotation taking unit vector a onto unit vector b. */
export const qFromTo = (a: Vec3, b: Vec3): Quat => {
  const d = dot(a, b);
  if (d > 0.9999999999) return qIdentity();
  if (d < -0.999999) {
    // 180°: pick any perpendicular axis
    const ax: Vec3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return qAxisAngle(cross(a, ax), Math.PI);
  }
  const c = cross(a, b);
  return qNorm([c[0], c[1], c[2], 1 + d]);
};

/** Quaternion from an orthonormal basis (columns = where body X/Y/Z axes point in the parent frame). */
export const qFromBasis = (x: Vec3, y: Vec3, z: Vec3): Quat => {
  const m00 = x[0], m01 = y[0], m02 = z[0];
  const m10 = x[1], m11 = y[1], m12 = z[1];
  const m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qNorm(q);
};

/** Body axes in parent frame. */
export const RIGHT: Vec3 = [1, 0, 0];
export const UP: Vec3 = [0, 1, 0];
export const FORWARD: Vec3 = [0, 0, -1];
export const qRight = (q: Quat) => qRotate(q, RIGHT);
export const qUp = (q: Quat) => qRotate(q, UP);
export const qForward = (q: Quat) => qRotate(q, FORWARD);

/**
 * Build an orientation whose forward is `fwd`, with up as close to `upHint` as possible.
 * Safe when fwd ∥ upHint (falls back to an arbitrary perpendicular).
 */
export function qLookAlong(fwd: Vec3, upHint: Vec3): Quat {
  const f = norm(fwd);
  let r = cross(f, upHint);
  if (len(r) < 1e-9) r = cross(f, Math.abs(f[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  r = norm(r);
  const u = cross(r, f);
  // body X=right, Y=up, Z=-forward
  return qFromBasis(r, u, scale(f, -1));
}
