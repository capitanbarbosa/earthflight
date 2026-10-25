import * as THREE from "three";
import type { OrbitCatalog, SatKind } from "@/lib/orbits/catalog";
import type { Vec3 } from "@/engine/math3";
import { SAT_LABEL_MAX, type Telemetry } from "@/stores/telemetry";

/** Rendering units are kilometres, camera-relative (positions are subtracted in float64 first). */
const NEAR_MODELS = 10;
const MAX_MODEL_RANGE_KM = 2500;
const EARTH_OCCLUDE_R = 6.356e6; // metres
const EARTH_SHADOW_R = 6.40e6;

const POINT_PX: Record<SatKind, number> = { station: 7, sat: 3.6, gps: 3.4, starlink: 2.1 };
const POINT_RGB: Record<SatKind, [number, number, number]> = {
  station: [1.0, 0.92, 0.66],
  sat: [0.62, 0.82, 1.0],
  gps: [0.72, 1.0, 0.81],
  starlink: [0.82, 0.88, 1.0],
};
/** Real overall size in km (floor for the on-screen scale: models are enlarged to stay readable). */
const REAL_KM: Record<SatKind, number> = { station: 0.109, sat: 0.02, gps: 0.012, starlink: 0.011 };
/** Extra on-screen size multiplier per kind. */
const SCREEN_MULT: Record<SatKind, number> = { station: 1.7, sat: 1.0, gps: 1.0, starlink: 1.0 };
const SCREEN_ANGLE = 0.02; // model length ≈ 2% of its distance (≈ 1.1° of view)

interface Slot {
  group: THREE.Group;
  parts: Record<"generic" | "starlink" | "station", THREE.Group>;
  mats: { body: THREE.MeshStandardMaterial; panel: THREE.MeshStandardMaterial; white: THREE.MeshStandardMaterial; dish: THREE.MeshStandardMaterial };
  base: { body: THREE.Color; panel: THREE.Color; white: THREE.Color; dish: THREE.Color };
  idx: number;
  dist: number;
}

export interface SatFrame {
  catalog: OrbitCatalog;
  camPos: Vec3;
  camDir: Vec3;
  camUp: Vec3;
  fovY: number;
  shipPos: Vec3;
  sunDir: Vec3;
  /** 0..1 global fade (0 = hidden). */
  opacity: number;
  width: number;
  height: number;
  pixelRatio: number;
}

const POINT_VS = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  gl_PointSize = aSize * uScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const POINT_FS = /* glsl */ `
precision mediump float;
varying vec3 vColor;
uniform float uOpacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(vColor * (0.55 + 0.8 * a), a * uOpacity);
}
`;

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, axis: "x" | "y" | "z" = "z") {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
  if (axis === "z") m.rotation.x = Math.PI / 2;
  if (axis === "x") m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/**
 * Orbital traffic overlay.  Frame convention for the models (unit length ≈ 1):
 *   +z points at the Earth (nadir), x is the solar-array axis (perpendicular to the sun), y faces the sun.
 */
export class SatelliteLayer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.02, 1e5);
  private basis = new THREE.Matrix4();
  private sunLight = new THREE.DirectionalLight(0xfff4e4, 3.0);
  private hemi = new THREE.HemisphereLight(0x7fb0ff, 0x05070c, 0.55);
  private points: THREE.Points;
  private pointGeo = new THREE.BufferGeometry();
  private pointMat: THREE.ShaderMaterial;
  private posAttr: THREE.BufferAttribute | null = null;
  private sizeAttr: THREE.BufferAttribute | null = null;
  private colAttr: THREE.BufferAttribute | null = null;
  private built = 0;
  private slots: Slot[] = [];
  private tmp = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private envTex: THREE.Texture;
  private near: Array<{ i: number; d: number }> = [];

  constructor(envTex: THREE.Texture) {
    this.envTex = envTex;
    this.pointMat = new THREE.ShaderMaterial({
      vertexShader: POINT_VS,
      fragmentShader: POINT_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uOpacity: { value: 1 } },
    });
    this.points = new THREE.Points(this.pointGeo, this.pointMat);
    this.points.frustumCulled = false;
    this.scene.add(this.points, this.sunLight, this.hemi);
    for (let s = 0; s < NEAR_MODELS; s++) this.slots.push(this.makeSlot());
  }

  private makeSlot(): Slot {
    const env = this.envTex;
    const body = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.38, envMap: env, envMapIntensity: 1.1 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x1b2c58, metalness: 0.55, roughness: 0.3, emissive: 0x050a1c, envMap: env, envMapIntensity: 1.3 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 0.35, roughness: 0.5, envMap: env });
    const dish = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.6, roughness: 0.25, envMap: env });
    const group = new THREE.Group();

    // generic bus + two arrays + nadir antenna
    const generic = new THREE.Group();
    generic.add(
      box(0.46, 0.38, 0.6, body),
      box(1.1, 0.02, 0.42, panel, 0.8, 0, 0),
      box(1.1, 0.02, 0.42, panel, -0.8, 0, 0),
      cyl(0.02, 0.5, white, 0.28, 0, 0, "x"),
      cyl(0.13, 0.05, dish, 0, 0, 0.34, "z"),
    );
    // flat-panel constellation bus: wide chassis + one long array
    const starlink = new THREE.Group();
    starlink.add(box(0.62, 0.05, 0.3, white), box(1.9, 0.015, 0.46, panel, 1.25, 0, 0), box(0.24, 0.05, 0.2, dish, -0.1, 0, 0.18));
    // station: truss, module stack, four large array pairs, radiators
    const station = new THREE.Group();
    station.add(
      box(2.5, 0.05, 0.05, white),
      cyl(0.09, 1.1, white, 0, 0.04, 0, "z"),
      cyl(0.07, 0.5, white, 0, 0.04, -0.7, "x"),
      cyl(0.07, 0.5, white, 0, 0.04, 0.45, "x"),
      box(0.5, 0.012, 1.0, panel, 1.15, 0, 0),
      box(0.5, 0.012, 1.0, panel, 0.6, 0, 0),
      box(0.5, 0.012, 1.0, panel, -0.6, 0, 0),
      box(0.5, 0.012, 1.0, panel, -1.15, 0, 0),
      box(0.04, 0.4, 0.7, dish, 0.2, 0.2, 0.0),
    );
    group.add(generic, starlink, station);
    group.visible = false;
    this.scene.add(group);
    return {
      group,
      parts: { generic, starlink, station },
      mats: { body, panel, white, dish },
      base: { body: body.color.clone(), panel: panel.color.clone(), white: white.color.clone(), dish: dish.color.clone() },
      idx: -1,
      dist: 0,
    };
  }

  private build(catalog: OrbitCatalog) {
    const n = catalog.count;
    this.posAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      const c = POINT_RGB[catalog.kinds[i]];
      this.colAttr.setXYZ(i, c[0], c[1], c[2]);
    }
    this.pointGeo.setAttribute("position", this.posAttr);
    this.pointGeo.setAttribute("aSize", this.sizeAttr);
    this.pointGeo.setAttribute("aColor", this.colAttr);
    this.pointGeo.setDrawRange(0, n);
    this.built = n;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Draw into `renderer` (caller owns clearing). Fills telemetry.sats. */
  render(renderer: THREE.WebGLRenderer, f: SatFrame, tel: Telemetry) {
    const cat = f.catalog;
    const T = tel.sats;
    if (!cat.loaded || f.opacity <= 0.01) {
      T.count = 0;
      T.visible = 0;
      return;
    }
    if (this.built !== cat.count) this.build(cat);
    const n = cat.count;
    const pos = this.posAttr!.array as Float32Array;
    const size = this.sizeAttr!.array as Float32Array;

    // camera: origin, same orientation and FOV as Cesium's
    const dir = this.tmp.set(f.camDir[0], f.camDir[1], f.camDir[2]);
    const up = this.tmpB.set(f.camUp[0], f.camUp[1], f.camUp[2]);
    const right = this.v3.crossVectors(dir, up).normalize();
    up.crossVectors(right, dir).normalize();
    this.basis.makeBasis(right, up, dir.clone().negate());
    this.camera.quaternion.setFromRotationMatrix(this.basis);
    this.camera.position.set(0, 0, 0);
    const fovDeg = (f.fovY * 180) / Math.PI;
    if (Math.abs(this.camera.fov - fovDeg) > 1e-3) {
      this.camera.fov = fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);

    const [cx, cy, cz] = f.camPos;
    const [sx, sy, sz] = f.shipPos;
    const e = cat.ecef;
    let visible = 0;
    const near = this.near;
    near.length = 0;
    let worst = Infinity;

    for (let i = 0; i < n; i++) {
      const o = i * 3;
      if (!cat.isValid(i)) { size[i] = 0; continue; }
      const px = e[o], py = e[o + 1], pz = e[o + 2];
      // camera → satellite, in metres (float64) then km (float32)
      const dx = px - cx, dy = py - cy, dz = pz - cz;
      pos[o] = dx / 1000; pos[o + 1] = dy / 1000; pos[o + 2] = dz / 1000;
      // hidden behind the Earth? closest approach of the segment to the Earth's centre
      const dd = dx * dx + dy * dy + dz * dz;
      let t = -(cx * dx + cy * dy + cz * dz) / dd;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = cx + dx * t, qy = cy + dy * t, qz = cz + dz * t;
      if (qx * qx + qy * qy + qz * qz < EARTH_OCCLUDE_R * EARTH_OCCLUDE_R) { size[i] = 0; continue; }
      visible++;
      size[i] = POINT_PX[cat.kinds[i]];
      // nearest-to-ship candidates for full models
      const ex = px - sx, ey = py - sy, ez = pz - sz;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez) / 1000;
      if (d < MAX_MODEL_RANGE_KM && d < worst) {
        let k = near.length;
        near.push({ i, d });
        while (k > 0 && near[k - 1].d > d) { near[k] = near[k - 1]; k--; }
        near[k] = { i, d };
        if (near.length > NEAR_MODELS) near.length = NEAR_MODELS;
        if (near.length === NEAR_MODELS) worst = near[NEAR_MODELS - 1].d;
      }
    }

    // full models for the nearest ones
    const sun = this.v3.set(f.sunDir[0], f.sunDir[1], f.sunDir[2]).clone();
    this.sunLight.position.copy(sun).multiplyScalar(10);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.updateMatrixWorld();
    const zAxis = new THREE.Vector3(), xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), p = new THREE.Vector3();
    let labels = 0;
    // objects that are practically the same place (a station and its docked modules/visiting vehicles) get one model
    const chosen: number[] = [];
    let ci = 0;
    for (let s = 0; s < NEAR_MODELS; s++) {
      const slot = this.slots[s];
      let c: { i: number; d: number } | undefined;
      while (ci < near.length) {
        const cand = near[ci++];
        const co = cand.i * 3;
        let dup = false;
        for (const j of chosen) {
          const jo = j * 3;
          if (Math.hypot(e[co] - e[jo], e[co + 1] - e[jo + 1], e[co + 2] - e[jo + 2]) < 8000) { dup = true; break; }
        }
        if (dup) { size[cand.i] = 0; continue; }
        c = cand;
        break;
      }
      if (!c) { slot.group.visible = false; slot.idx = -1; continue; }
      chosen.push(c.i);
      const i = c.i, o = i * 3, kind = cat.kinds[i];
      size[i] = 0; // the dot is replaced by the model
      p.set(pos[o], pos[o + 1], pos[o + 2]);
      const distCam = p.length();
      const scale = Math.max(REAL_KM[kind], distCam * SCREEN_ANGLE * SCREEN_MULT[kind]);
      slot.group.visible = true;
      slot.group.position.copy(p);
      slot.group.scale.setScalar(scale);
      // orientation: +z nadir, x ⟂ (nadir, sun) = array axis, y faces the sun
      zAxis.set(-e[o], -e[o + 1], -e[o + 2]).normalize();
      xAxis.crossVectors(zAxis, sun);
      if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0).cross(zAxis);
      xAxis.normalize();
      yAxis.crossVectors(zAxis, xAxis).normalize();
      this.m4.makeBasis(xAxis, yAxis, zAxis);
      this.quat.setFromRotationMatrix(this.m4);
      slot.group.quaternion.copy(this.quat);
      slot.parts.generic.visible = kind === "sat" || kind === "gps";
      slot.parts.starlink.visible = kind === "starlink";
      slot.parts.station.visible = kind === "station";
      // Earth's shadow: dim the materials
      const proj = e[o] * f.sunDir[0] + e[o + 1] * f.sunDir[1] + e[o + 2] * f.sunDir[2];
      let lit = 1;
      if (proj < 0) {
        const qx = e[o] - f.sunDir[0] * proj, qy = e[o + 1] - f.sunDir[1] * proj, qz = e[o + 2] - f.sunDir[2] * proj;
        if (Math.sqrt(qx * qx + qy * qy + qz * qz) < EARTH_SHADOW_R) lit = 0.12;
      }
      slot.mats.body.color.copy(slot.base.body).multiplyScalar(lit);
      slot.mats.panel.color.copy(slot.base.panel).multiplyScalar(lit);
      slot.mats.white.color.copy(slot.base.white).multiplyScalar(lit);
      slot.mats.dish.color.copy(slot.base.dish).multiplyScalar(lit);
      slot.idx = i;
      slot.dist = c.d;

      // label (screen space)
      if (labels < SAT_LABEL_MAX) {
        const ndc = p.clone().project(this.camera);
        if (ndc.z < 1 && Math.abs(ndc.x) < 1.05 && Math.abs(ndc.y) < 1.05) {
          const L = T.items[labels++];
          L.x = (ndc.x * 0.5 + 0.5) * f.width;
          L.y = (0.5 - ndc.y * 0.5) * f.height;
          L.name = cat.names[i];
          L.km = c.d;
          L.kind = kind;
        }
      }
    }
    T.count = labels;
    T.visible = visible;
    T.total = n;
    T.updated = cat.updated;

    this.posAttr!.needsUpdate = true;
    this.sizeAttr!.needsUpdate = true;
    this.pointMat.uniforms.uScale.value = f.pixelRatio;
    this.pointMat.uniforms.uOpacity.value = f.opacity;
    this.hemi.intensity = 0.55;

    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.pointGeo.dispose();
    this.pointMat.dispose();
    for (const s of this.slots) {
      s.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      Object.values(s.mats).forEach((m) => m.dispose());
    }
  }
}
