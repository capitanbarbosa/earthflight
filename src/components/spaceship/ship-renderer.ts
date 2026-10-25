import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Quat, Vec3 } from "@/engine/math3";
import { createShipModel, type ShipModel } from "./ship-model";
import { SatelliteLayer, type SatFrame } from "./satellite-layer";
import type { Telemetry } from "@/stores/telemetry";

export type SatInput = { frame: Omit<SatFrame, "width" | "height" | "pixelRatio">; tel: Telemetry };

export interface ShipFrame {
  /** Camera pose in ECEF. */
  camPos: Vec3;
  camDir: Vec3;
  camUp: Vec3;
  fovY: number; // radians
  /** Ship pose in ECEF. */
  shipPos: Vec3;
  shipQ: Quat;
  /** Visual length of the ship in metres (scene is rendered in units of this length). */
  length: number;
  sunDir: Vec3; // ECEF unit vector toward the sun
  /** 0..1 how lit the ship is (night side → dim ambient). */
  daylight: number;
  thrust: number;
  boost: number;
  visible: boolean;
  time: number;
}

/**
 * Renders the ship with Three.js on a transparent canvas stacked above Cesium.
 *
 * Synchronisation: the Three camera sits at the origin with exactly Cesium's orientation and FOV,
 * and the ship is placed at (shipECEF − cameraECEF) / shipLength.  Subtracting in float64 *before*
 * converting to float32 keeps everything precise at planetary scale and the ship is never farther
 * than a few units from the camera, so there is no jitter and no depth-range problem.
 * The axes of the Three "world" are the ECEF axes, so the ship's ECEF quaternion is used as-is.
 */
export class ShipRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.02, 400);
  private model: ShipModel;
  private satLayer: SatelliteLayer;
  private sun = new THREE.DirectionalLight(0xfff2e0, 3.2);
  private fill = new THREE.HemisphereLight(0x6fa8ff, 0x0a0c12, 0.5);
  private pmrem: THREE.PMREMGenerator;
  private envTex: THREE.Texture;
  private basis = new THREE.Matrix4();
  private disposed = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false; // we clear explicitly: satellites pass, depth clear, ship pass
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "1" });
    container.appendChild(this.canvas);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    this.envTex = this.pmrem.fromScene(env, 0.04).texture;
    env.dispose?.();
    this.model = createShipModel(this.envTex);
    this.satLayer = new SatelliteLayer(this.envTex);
    this.scene.add(this.model.group, this.sun, this.fill);
    this.scene.add(this.sun.target);
  }

  setPixelRatio(r: number) {
    this.renderer.setPixelRatio(r);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.satLayer.resize(w, h);
  }

  private renderSats(sats: SatInput | undefined) {
    if (!sats) return;
    const c = this.canvas;
    this.satLayer.render(
      this.renderer,
      { ...sats.frame, width: c.clientWidth, height: c.clientHeight, pixelRatio: this.renderer.getPixelRatio() },
      sats.tel,
    );
  }

  render(f: ShipFrame, sats?: SatInput) {
    if (this.disposed) return;
    const m = this.model;
    m.group.visible = f.visible;
    this.renderer.clear();
    this.renderSats(sats);
    if (!f.visible) return;
    this.renderer.clearDepth();
    const L = Math.max(f.length, 1e-3);
    // camera: origin, same orientation as Cesium's
    const dir = new THREE.Vector3(f.camDir[0], f.camDir[1], f.camDir[2]);
    const up = new THREE.Vector3(f.camUp[0], f.camUp[1], f.camUp[2]);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    up.crossVectors(right, dir).normalize();
    this.basis.makeBasis(right, up, dir.clone().negate());
    this.camera.quaternion.setFromRotationMatrix(this.basis);
    this.camera.position.set(0, 0, 0);
    if (Math.abs(this.camera.fov - (f.fovY * 180) / Math.PI) > 1e-3) {
      this.camera.fov = (f.fovY * 180) / Math.PI;
      this.camera.updateProjectionMatrix();
    }
    // ship relative to the camera, in ship-length units
    m.group.position.set((f.shipPos[0] - f.camPos[0]) / L, (f.shipPos[1] - f.camPos[1]) / L, (f.shipPos[2] - f.camPos[2]) / L);
    m.group.quaternion.set(f.shipQ[0], f.shipQ[1], f.shipQ[2], f.shipQ[3]);
    m.update(f.time, f.thrust, f.boost);

    // lighting from the real sun direction (ECEF-aligned axes)
    this.sun.position.set(f.sunDir[0] * 10, f.sunDir[1] * 10, f.sunDir[2] * 10).add(m.group.position);
    this.sun.target.position.copy(m.group.position);
    this.sun.intensity = 0.35 + 3.0 * f.daylight;
    this.fill.intensity = 0.25 + 0.45 * f.daylight;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.model.dispose();
    this.satLayer.dispose();
    this.envTex.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
