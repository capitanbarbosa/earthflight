/**
 * WGS84 geodesy + local tangent frames + great-circle navigation.
 *
 * All orientation logic elsewhere is done with ECEF quaternions and parallel transport of the
 * local "up" vector, never with heading/pitch Euler angles, so there are no singularities at
 * the poles or the antimeridian.  Heading/lat/lon here are for display and navigation only.
 */
import { DEG, RAD, Vec3, add, clamp, cross, dot, len, norm, scale, sub } from "./math3";

export const WGS84_A = 6378137.0;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B = WGS84_A * (1 - WGS84_F);
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
/** Mean Earth radius used for great-circle distances. */
export const EARTH_R = 6371008.8;

export interface Geodetic {
  lat: number; // radians
  lon: number; // radians
  h: number; // metres above ellipsoid
}

export function geodeticToEcef(lat: number, lon: number, h: number): Vec3 {
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
  return [(N + h) * cl * Math.cos(lon), (N + h) * cl * Math.sin(lon), (N * (1 - WGS84_E2) + h) * sl];
}

export function degToEcef(latDeg: number, lonDeg: number, h = 0): Vec3 {
  return geodeticToEcef(latDeg * DEG, lonDeg * DEG, h);
}

/** Iterative Bowring-style conversion; stable at the poles and out to geostationary range. */
export function ecefToGeodetic(p: Vec3): Geodetic {
  const [x, y, z] = p;
  const lon = Math.atan2(y, x);
  const r = Math.hypot(x, y);
  let lat = Math.atan2(z, r * (1 - WGS84_E2));
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const sl = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sl * sl);
    h = Math.abs(lat) < 1.35 ? r / Math.cos(lat) - N : Math.abs(z) / Math.abs(sl) - N * (1 - WGS84_E2);
    lat = Math.atan2(z, r * (1 - (WGS84_E2 * N) / (N + h)));
  }
  return { lat, lon, h };
}

/** East, North, Up unit vectors (ECEF components) at a geodetic location. */
export function enuFrame(lat: number, lon: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  return {
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
    up: [cl * co, cl * so, sl],
  };
}

/** Geodetic surface normal for an ECEF position. */
export function geodeticUp(p: Vec3): Vec3 {
  const g = ecefToGeodetic(p);
  return enuFrame(g.lat, g.lon).up;
}

/** Compass heading (0 = north, clockwise) of a direction vector at a location, in degrees. */
export function headingOf(dir: Vec3, lat: number, lon: number): number {
  const f = enuFrame(lat, lon);
  const e = dot(dir, f.east);
  const n = dot(dir, f.north);
  if (Math.hypot(e, n) < 1e-9) return NaN; // pointing straight up/down
  return ((Math.atan2(e, n) * RAD) % 360 + 360) % 360;
}

/** Elevation angle of a direction above the local horizon, degrees. */
export function pitchOf(dir: Vec3, up: Vec3): number {
  return Math.asin(clamp(dot(norm(dir), up), -1, 1)) * RAD;
}

/** Haversine great-circle distance on the mean sphere (metres). */
export function greatCircleDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat2 - lat1, dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing (rad, 0 = north, clockwise) of the great circle from point 1 to point 2. */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

const unitFromLatLon = (lat: number, lon: number): Vec3 => [
  Math.cos(lat) * Math.cos(lon),
  Math.cos(lat) * Math.sin(lon),
  Math.sin(lat),
];

/** A reusable great-circle path (spherical slerp between two surface directions). */
export class GreatCircle {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly angle: number; // central angle, radians
  private readonly axis: Vec3; // perpendicular to the plane (unit)
  private readonly tangent0: Vec3; // unit tangent at a pointing toward b

  constructor(lat1: number, lon1: number, lat2: number, lon2: number) {
    this.a = unitFromLatLon(lat1, lon1);
    this.b = unitFromLatLon(lat2, lon2);
    this.angle = Math.acos(clamp(dot(this.a, this.b), -1, 1));
    let ax = cross(this.a, this.b);
    if (len(ax) < 1e-12) {
      // coincident or antipodal: choose any plane that contains a (e.g. over the pole)
      ax = cross(this.a, Math.abs(this.a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    }
    this.axis = norm(ax);
    this.tangent0 = norm(cross(this.axis, this.a));
  }

  get distance(): number {
    return this.angle * EARTH_R;
  }

  /** Unit direction (geocentric) at fraction f ∈ [0,1]. */
  direction(f: number): Vec3 {
    const th = this.angle * f;
    return add(scale(this.a, Math.cos(th)), scale(this.tangent0, Math.sin(th)));
  }

  /** Unit tangent (direction of travel) at fraction f. */
  tangent(f: number): Vec3 {
    const th = this.angle * f;
    return add(scale(this.a, -Math.sin(th)), scale(this.tangent0, Math.cos(th)));
  }

  /** ECEF position at fraction f and height h above the ellipsoid. */
  position(f: number, h: number): Vec3 {
    const d = this.direction(f);
    const lat = Math.asin(clamp(d[2], -1, 1));
    const lon = Math.atan2(d[1], d[0]);
    return geodeticToEcef(lat, lon, h);
  }
}

/** Minimum distance between two points on the sphere in degrees → metres helper. */
export function chordDistance(a: Vec3, b: Vec3): number {
  return len(sub(a, b));
}
