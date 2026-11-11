import { loadCesium, type CesiumModule } from "./loader";
import { addImagery } from "./imagery";
import { createTerrain } from "./terrain";
import { BuildingStreamer } from "./buildings";
import { Markers } from "./markers";
import { QUALITY, type QualityPreset } from "./quality";
import { BuildingIndex, applyContact } from "@/engine/collision";
import { CameraRig, type CameraPose } from "@/engine/camera";
import {
  DEG, RAD, Vec3, clamp, dot, len, norm, qLookAlong, scale, smoothstep, sub, wrapPi,
} from "@/engine/math3";
import {
  EARTH_R, degToEcef, ecefToGeodetic, enuFrame, geodeticToEcef, greatCircleDistance, initialBearing,
} from "@/engine/coordinates";
import {
  createRuntime, createShip, emergencyStop, enforceTerrainFloor, resolveMode, sampleShip, stepFlight,
  type FlightSample, type GroundProbe, type ShipState,
} from "@/engine/physics";
import { Autopilot, type TravelTarget } from "@/engine/travel";
import { ShipRenderer } from "@/components/spaceship/ship-renderer";
import { OrbitCatalog } from "@/lib/orbits/catalog";
import { LiveManager } from "@/lib/live/manager";
import { InputManager } from "@/lib/input";
import { AudioEngine } from "@/lib/audio/audio-engine";
import { nearestPlace } from "@/lib/geospatial/destinations";
import { getFlightState, useFlightStore, type DestinationTarget, type Quality } from "@/stores/flight-store";
import { telemetry } from "@/stores/telemetry";

type Scene = InstanceType<CesiumModule["Scene"]>;

/** Where the opening cinematic starts: high above the Caribbean so the Americas are in daylight. */
const START = { lat: 12 * DEG, lon: -62 * DEG, alt: 5_000_000, heading: 35 };

export interface SimulatorEvents {
  onReady?: () => void;
  onError?: (msg: string) => void;
}

/**
 * Orchestrates the whole experience: Cesium globe, flight physics, camera rig, Three.js ship,
 * input, building streaming, audio and HUD telemetry.  One instance per mounted <GlobeScene/>.
 */
export class Simulator {
  private C!: CesiumModule;
  private widget!: InstanceType<CesiumModule["CesiumWidget"]>;
  private scene!: Scene;
  private shipRenderer!: ShipRenderer;
  /** Real satellites (CelesTrak + SGP4), drawn next to the ship while in space. */
  private orbits = new OrbitCatalog();
  private orbitsRequested = false;
  private lastOrbitMs = 0;
  private input!: InputManager;
  private audio: AudioEngine | null = null;
  private buildings!: BuildingStreamer;
  private markers!: Markers;
  private live?: LiveManager;
  private bIndex = new BuildingIndex();
  private motionBlur: InstanceType<CesiumModule["PostProcessStage"]> | null = null;
  private resizeObs: ResizeObserver | null = null;
  private unsub: Array<() => void> = [];
  private disposed = false;

  // simulation state
  private ship: ShipState = createShip(START.lat, START.lon, START.alt, START.heading);
  private rt = createRuntime();
  private rig = new CameraRig();
  private ap = new Autopilot();
  private sample!: FlightSample;
  private pose!: CameraPose;
  private probe!: GroundProbe;
  private cart!: InstanceType<CesiumModule["Cartographic"]>;
  private introT = 0;
  private lastT = performance.now();
  private frame = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lowFpsSecs = 0;
  private highFpsSecs = 0;
  private adaptScale = 1;
  private nextRegionAt = 0;
  private sunRefLon = START.lon * RAD;
  private lastClockMs = 0;
  private suppressPause = false;
  private lastMode = "";
  private preset: QualityPreset = QUALITY.medium;
  private terrainProvider: unknown = null;
  private firstTilesLoaded = false;
  private createdAt = performance.now();
  private tmpC3!: InstanceType<CesiumModule["Cartesian3"]>;
  private tmpDir!: InstanceType<CesiumModule["Cartesian3"]>;
  private tmpUp!: InstanceType<CesiumModule["Cartesian3"]>;
  private prevAlert = "";
  private arrivedToastFor: string | null = null;

  private constructor(
    private container: HTMLElement,
    private creditEl: HTMLElement,
    private ev: SimulatorEvents,
  ) {}

  static async create(container: HTMLElement, creditEl: HTMLElement, ev: SimulatorEvents = {}) {
    const sim = new Simulator(container, creditEl, ev);
    await sim.init();
    return sim;
  }

  // ------------------------------------------------------------------------------------------
  private async init() {
    const C = await loadCesium();
    this.C = C;
    const widget = new C.CesiumWidget(this.container, {
      baseLayer: false,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      scene3DOnly: true,
      requestRenderMode: false,
      useBrowserRecommendedResolution: false,
      showRenderLoopErrors: false,
      creditContainer: this.creditEl,
      skyAtmosphere: new C.SkyAtmosphere(),
      contextOptions: { webgl: { alpha: false, antialias: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false } },
    });
    this.widget = widget;
    const scene = widget.scene;
    this.scene = scene;
    const canvas = widget.canvas;
    // Explicit CSS size: without Cesium's widget stylesheet the canvas would size itself from its own
    // drawing buffer, and Cesium's clientWidth-based resize would feed back to ever larger buffers.
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });

    scene.screenSpaceCameraController.enableInputs = false;
    scene.backgroundColor = C.Color.BLACK;
    scene.globe.baseColor = C.Color.fromCssColorString("#06121f");
    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.showGroundAtmosphere = true;
    scene.globe.atmosphereLightIntensity = 14;
    scene.globe.tileCacheSize = 300;
    scene.globe.nightFadeOutDistance = 1.0e7;
    scene.globe.nightFadeInDistance = 4.0e7;
    scene.light = new C.SunLight();
    scene.highDynamicRange = false;
    scene.fog.enabled = true;
    scene.fog.density = 0.00018;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;
    widget.clock.shouldAnimate = false;
    this.cart = new C.Cartographic();
    this.tmpC3 = new C.Cartesian3();
    this.tmpDir = new C.Cartesian3();
    this.tmpUp = new C.Cartesian3();
    this.camera.frustum.near = 0.3;

    const globe = scene.globe;
    this.probe = {
      heightAt: (lat, lon) => {
        this.cart.longitude = lon;
        this.cart.latitude = lat;
        this.cart.height = 0;
        const h = globe.getHeight(this.cart);
        return h === undefined || !Number.isFinite(h) ? null : h;
      },
    };

    // Three.js overlay for the ship
    this.shipRenderer = new ShipRenderer(this.container);
    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(this.container);
    this.onResize();

    // initial sample/pose so the first frame is valid
    this.sample = sampleShip(this.ship, this.rt);
    this.pose = this.rig.update(0.016, this.ship, this.sample, { speedFx: 0, shake: 0, introTime: 0, mode: "space" }, this.camObstacles());
    this.applyPose(this.pose);
    this.setClock(this.sunRefLon, "day", true);

    // data layers (async, don't block the first frame)
    this.buildings = new BuildingStreamer(C, scene, this.bIndex);
    void this.buildings.init();
    this.markers = new Markers(C, scene);
    this.live = new LiveManager(C, scene, () => ({ lat: telemetry.lat, lon: telemetry.lon, alt: telemetry.alt }));
    void (async () => {
      try {
        await addImagery(C, scene);
      } catch (e) {
        console.warn("[imagery] failed", e);
        getFlightState().toast("Satellite imagery unavailable — showing a basic globe", "warn");
      }
    })();
    void (async () => {
      const t = await createTerrain(C);
      if (this.disposed) return;
      scene.terrainProvider = t.provider as never;
      this.terrainProvider = t.provider;
      telemetry.terrain = t.fallback ? "fallback" : "ready";
      if (t.fallback) getFlightState().toast("Terrain service unreachable — using smooth globe (collision safety stays on)", "warn");
    })();

    // input
    this.input = new InputManager(this.container, {
      isCapturing: () => {
        const s = getFlightState();
        return s.phase === "flying" && !s.paused && s.panel === "none";
      },
      onKeyDown: (code, e) => this.onKey(code, e),
      onWheel: (dy) => this.onWheel(dy),
      onLockChange: (locked) => this.onLockChange(locked),
      onViewportPointerDown: () => {
        const s = getFlightState();
        if (s.inputMode === "touch") return;
        if (s.phase === "flying" && !s.paused && s.panel === "none" && !this.input.locked) this.input.requestLock();
      },
    });

    // store subscriptions
    const st = useFlightStore;
    this.unsub.push(
      st.subscribe((s, p) => {
        if (s.quality !== p.quality || s.effects !== p.effects) this.applyQuality(s.quality);
        if (s.satellites && !p.satellites) this.loadOrbits();
        if (s.cameraMode !== p.cameraMode && s.phase === "flying") this.rig.setMode(s.cameraMode);
        if (s.muted !== p.muted) this.audio?.setMuted(s.muted);
        if (s.volume !== p.volume) this.audio?.setVolume(s.volume);
        if (s.destination !== p.destination) {
          if (s.destination) this.markers.setBeacon(s.destination.lat, s.destination.lon, telemetry.ground);
          else this.markers.setBeacon(null);
        }
        if (s.panel !== p.panel) {
          if (s.panel !== "none") {
            this.suppressPause = true;
            this.input.exitLock();
            this.input.clearKeys();
          }
          this.audio?.ui(s.panel === "none" ? "close" : "open");
        }
        if (s.paused !== p.paused && s.paused) {
          this.input.clearKeys();
          this.input.exitLock();
        }
      }),
    );
    this.applyQuality(getFlightState().quality);

    scene.preUpdate.addEventListener(this.onPreUpdate);
    scene.postRender.addEventListener(this.onPostRender);
    scene.renderError.addEventListener((_s: unknown, err: unknown) => {
      console.error("[cesium] render error", err);
      this.ev.onError?.("The 3D renderer hit an error. Try reloading, or lower the graphics quality.");
    });

    // orbital traffic: load in the background; the sim never waits for it and works without it
    if (getFlightState().satellites) this.loadOrbits();

    // dev/QA handle
    if (typeof window !== "undefined") {
      (window as unknown as { __earthflight?: unknown }).__earthflight = this;
    }
  }

  private get camera() {
    return this.scene.camera;
  }

  private loadOrbits() {
    if (this.orbitsRequested) return;
    this.orbitsRequested = true;
    void this.orbits.load().then((ok) => {
      if (!ok) this.orbitsRequested = false; // allow a retry if the user toggles the layer again
    });
  }

  // ------------------------------------------------------------------------------------------
  // public commands
  // ------------------------------------------------------------------------------------------
  async start() {
    const s = getFlightState();
    if (s.phase === "flying") return;
    if (!this.audio) {
      try {
        this.audio = new AudioEngine();
        this.audio.setMuted(s.muted);
        this.audio.setVolume(s.volume);
        await this.audio.resume();
        this.audio.ui("select");
      } catch {
        this.audio = null;
      }
    }
    this.rig.setMode("chase");
    this.rig.easeScale = 0.18;
    this.rt.mode = "space";
    useFlightStore.getState().set({ phase: "flying", paused: false, cameraMode: "chase", panel: "none" });
    this.capturePointer();
    useFlightStore.getState().toast(
      getFlightState().inputMode === "touch"
        ? "Left stick flies · right stick aims · hold climb and dive"
        : "Mouse to steer · W/S thrust · Space/Shift ascend/descend · G destinations",
    );
  }

  resume() {
    useFlightStore.getState().set({ paused: false, panel: "none" });
    this.suppressPause = false;
    this.capturePointer();
  }

  /** Chase → cockpit → free orbit. */
  cycleCamera() {
    const s = getFlightState();
    if (s.phase !== "flying" || s.paused || s.panel !== "none") return;
    const order = ["chase", "cockpit", "free"] as const;
    const idx = order.indexOf(s.cameraMode as (typeof order)[number]);
    const next = order[(idx < 0 ? 0 : idx + 1) % order.length];
    useFlightStore.getState().set({ cameraMode: next });
    useFlightStore.getState().toast(
      next === "chase" ? "Camera: third-person chase" : next === "cockpit" ? "Camera: first-person cockpit" : "Camera: free orbit — right stick looks around, + and − zoom",
    );
    this.audio?.ui("click");
  }

  /** Speed limiter, or zoom while the free camera is active. `dir` +1 is faster / closer. */
  adjustLimiter(dir: 1 | -1) {
    const s = getFlightState();
    if (s.phase !== "flying" || s.paused || s.panel !== "none") return;
    if (s.cameraMode === "free") this.rig.zoom(-dir * 90);
    else useFlightStore.getState().set({ speedScale: clamp(s.speedScale * Math.pow(1.25, dir), 0.02, 1) });
  }

  openPanel(p: "destinations" | "settings" | "layers" | "none") {
    useFlightStore.getState().set({ panel: p });
    if (p === "none") {
      this.suppressPause = false;
      if (getFlightState().phase === "flying" && !getFlightState().paused) this.capturePointer();
    }
  }

  travelTo(d: DestinationTarget, opts: { arriveAgl?: number; backOffM?: number } = {}) {
    const C = this.C;
    if (getFlightState().phase !== "flying") return;
    this.ap.cancel();
    this.arrivedToastFor = null;
    const isLandmark = !!d.landmark;
    const arriveAgl = opts.arriveAgl ?? (isLandmark ? 230 : 420);
    let lat = d.lat * DEG, lon = d.lon * DEG;
    if (isLandmark) {
      // stop short of the landmark, facing it
      const g = ecefToGeodetic(this.ship.pos);
      const brg = initialBearing(lat, lon, g.lat, g.lon); // direction from target back toward us
      const back = opts.backOffM ?? 380;
      lat += (Math.cos(brg) * back) / EARTH_R;
      lon += (Math.sin(brg) * back) / (EARTH_R * Math.max(0.05, Math.cos(lat)));
    }
    this.cart.longitude = lon;
    this.cart.latitude = lat;
    const known = this.scene.globe.getHeight(this.cart);
    const target: TravelTarget = { id: d.id, name: d.landmark ?? d.name, lat, lon, ground: known ?? 0, arriveAgl };
    // refine ground height from the terrain provider (async); Autopilot adapts its final descent
    if (known === undefined && this.terrainProvider) {
      const carto = [new C.Cartographic(lon, lat)];
      C.sampleTerrainMostDetailed(this.terrainProvider as never, carto)
        .then((r) => {
          const h = r[0]?.height;
          if (Number.isFinite(h) && this.ap.target?.id === target.id) this.ap.setGround(h);
        })
        .catch(() => undefined);
    }
    this.rt.hold = false;
    this.rt.resetLevel = false;
    this.ap.start(this.ship, target, () => this.onArrive(d));
    useFlightStore.getState().set({ travelling: true, destination: d, panel: "none", paused: false });
    this.suppressPause = false;
    this.audio?.ui("select");
    this.capturePointer();
    useFlightStore.getState().toast(`Setting course for ${target.name}`);
  }

  cancelTravel(silent = false) {
    if (!this.ap.active) return;
    const v = this.ap.velocity;
    this.ap.cancel();
    this.ship.vel = v;
    useFlightStore.getState().set({ travelling: false });
    if (!silent) useFlightStore.getState().toast("Autopilot cancelled — you have control");
    this.audio?.ui("close");
  }

  emergencyStop() {
    this.cancelTravel(true);
    emergencyStop(this.ship, this.rt);
    this.flashAlert("EMERGENCY STOP");
    this.audio?.ui("warn");
    useFlightStore.getState().toast("Emergency stop — holding position. Press any thrust key to resume.");
  }

  resetOrientation() {
    this.rt.resetLevel = true;
    useFlightStore.getState().toast("Orientation reset");
    this.audio?.ui("click");
  }

  resetPosition() {
    this.cancelTravel(true);
    this.ship = createShip(START.lat, START.lon, START.alt, START.heading);
    this.rt = createRuntime();
    this.rig.easeScale = 0.3;
    useFlightStore.getState().toast("Returned to orbit");
    this.audio?.ui("select");
  }

  /** QA/dev helper: teleport the ship near a location (keeps flying state). */
  debugTeleport(latDeg: number, lonDeg: number, agl = 600, headingDeg = 0) {
    this.cancelTravel(true);
    this.ship = createShip(latDeg * DEG, lonDeg * DEG, agl + (this.probe.heightAt(latDeg * DEG, lonDeg * DEG) ?? 0), headingDeg);
    this.rt = createRuntime();
    this.rig.easeScale = 1;
  }

  getSample() {
    return this.sample;
  }

  // ------------------------------------------------------------------------------------------
  // events
  // ------------------------------------------------------------------------------------------
  private onKey(code: string, e: KeyboardEvent) {
    const s = getFlightState();
    const set = useFlightStore.getState().set;
    const toast = useFlightStore.getState().toast;
    if (s.phase !== "flying") return;
    if (code === "Escape") {
      if (s.panel !== "none") return this.openPanel("none");
      // Esc while pointer-locked is consumed by the browser (→ lock change → pause); this handles the unlocked case
      if (s.paused) this.resume();
      else set({ paused: true });
      return;
    }
    if (s.paused) return;
    if (s.panel !== "none") return;
    switch (code) {
      case "KeyC": {
        const order = ["chase", "cockpit", "free"] as const;
        const next = order[(order.indexOf(s.cameraMode as never) + 1) % order.length];
        set({ cameraMode: next });
        toast(`Camera: ${next === "chase" ? "third-person chase" : next === "cockpit" ? "first-person cockpit" : "free orbit (mouse orbits, wheel zooms)"}`);
        this.audio?.ui("click");
        break;
      }
      case "KeyF": {
        const next = s.assist === "arcade" ? "realistic" : "arcade";
        set({ assist: next });
        toast(next === "arcade" ? "Arcade flight: assisted, auto-level, velocity follows nose" : "Realistic flight: Newtonian momentum, no auto-level");
        this.audio?.ui("click");
        break;
      }
      case "KeyR": this.resetOrientation(); break;
      case "KeyX": this.emergencyStop(); break;
      case "KeyT": this.resetPosition(); break;
      case "KeyG": this.openPanel("destinations"); break;
      case "KeyL": this.openPanel("layers"); break;
      case "KeyH": set({ showControls: !s.showControls }); break;
      case "KeyM": set({ muted: !s.muted }); break;
      case "Backspace": this.cancelTravel(); break;
      case "Digit0": set({ modeSelection: "auto" }); toast("Flight mode: automatic by altitude"); break;
      case "Digit1": set({ modeSelection: "space" }); toast("Flight mode: SPACE"); break;
      case "Digit2": set({ modeSelection: "atmosphere" }); toast("Flight mode: ATMOSPHERIC"); break;
      case "Digit3": set({ modeSelection: "city" }); toast("Flight mode: CITY"); break;
      case "BracketLeft": set({ speedScale: clamp(s.speedScale / 1.25, 0.02, 1) }); break;
      case "BracketRight": set({ speedScale: clamp(s.speedScale * 1.25, 0.02, 1) }); break;
    }
    e.stopPropagation?.();
  }

  private capturePointer() {
    if (getFlightState().inputMode === "touch") return;
    this.input.requestLock();
  }

  private onWheel(dy: number) {
    const s = getFlightState();
    if (s.cameraMode === "free") this.rig.zoom(dy);
    else useFlightStore.getState().set({ speedScale: clamp(s.speedScale * Math.exp(-dy * 0.0012), 0.02, 1) });
  }

  private onLockChange(locked: boolean) {
    const s = useFlightStore.getState();
    if (s.inputMode === "touch") {
      if (locked) this.input.exitLock();
      return;
    }
    s.set({ pointerLocked: locked });
    if (!locked && s.phase === "flying" && s.panel === "none" && !this.suppressPause && !s.paused) {
      s.set({ paused: true });
    }
    if (locked) this.suppressPause = false;
  }

  private onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.shipRenderer?.resize(w, h);
  }

  private onArrive(d: DestinationTarget) {
    useFlightStore.getState().set({ travelling: false });
    this.audio?.arrival();
    if (this.arrivedToastFor !== d.id) {
      useFlightStore.getState().toast(`Arrived at ${d.landmark ?? d.name} — you have control`);
      this.arrivedToastFor = d.id;
    }
  }

  private flashAlert(text: string) {
    telemetry.alertText = text;
    telemetry.alertSeq++;
  }

  // ------------------------------------------------------------------------------------------
  // quality
  // ------------------------------------------------------------------------------------------
  private applyQuality(q: Quality) {
    const C = this.C, scene = this.scene, widget = this.widget;
    const p = QUALITY[q];
    this.preset = p;
    const dpr = window.devicePixelRatio || 1;
    const target = Math.min(dpr, p.dprCap) * p.res * this.adaptScale;
    widget.useBrowserRecommendedResolution = false;
    widget.resolutionScale = target / dpr;
    this.shipRenderer.setPixelRatio(Math.min(dpr, p.dprCap));
    scene.globe.maximumScreenSpaceError = p.sse / Math.max(0.6, this.adaptScale);
    scene.postProcessStages.fxaa.enabled = p.fxaa;
    try {
      scene.msaaSamples = p.msaa;
    } catch { /* msaa unsupported (WebGL1) */ }
    const fx = getFlightState().effects;
    const bloom = scene.postProcessStages.bloom;
    bloom.enabled = p.bloom && fx;
    if (bloom.enabled) {
      bloom.uniforms.glowOnly = false;
      bloom.uniforms.contrast = 110;
      bloom.uniforms.brightness = -0.2;
      bloom.uniforms.delta = 1.2;
      bloom.uniforms.sigma = 2.2;
      bloom.uniforms.stepSize = 1.1;
    }
    scene.shadowMap.enabled = false; // toggled per-altitude in update()
    scene.shadowMap.size = 2048;
    scene.shadowMap.softShadows = true;
    scene.shadowMap.maximumDistance = 4000;
    scene.shadowMap.darkness = 0.45;
    scene.globe.shadows = p.shadows ? C.ShadowMode.RECEIVE_ONLY : C.ShadowMode.DISABLED;
    this.buildings.setQuality(p.buildings);
    this.ensureMotionBlur(p.blur && fx);
  }

  private ensureMotionBlur(on: boolean) {
    const C = this.C;
    if (on && !this.motionBlur) {
      this.motionBlur = new C.PostProcessStage({
        name: "earthflight_radial_blur",
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform float strength;
          in vec2 v_textureCoordinates;
          void main() {
            vec2 c = vec2(0.5);
            vec2 d = v_textureCoordinates - c;
            vec4 sum = vec4(0.0);
            for (int i = 0; i < 8; i++) {
              float s = 1.0 - strength * float(i) / 7.0;
              sum += texture(colorTexture, c + d * s);
            }
            out_FragColor = sum / 8.0;
          }`,
        uniforms: { strength: 0.0 },
      });
      this.motionBlur.enabled = false;
      this.scene.postProcessStages.add(this.motionBlur);
    } else if (!on && this.motionBlur) {
      this.scene.postProcessStages.remove(this.motionBlur);
      this.motionBlur = null;
    }
  }

  // ------------------------------------------------------------------------------------------
  // per-frame
  // ------------------------------------------------------------------------------------------
  private camObstacles() {
    return {
      groundAt: (lat: number, lon: number) => this.probe.heightAt(lat, lon),
      insideBuilding: (p: Vec3, pad: number) => this.bIndex.isInside(p, pad),
    };
  }

  private onPreUpdate = () => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastT) / 1000;
    this.lastT = now;
    const dt = clamp(rawDt, 0, 0.05);
    this.frame++;
    this.trackFps(rawDt, now);

    const st = getFlightState();
    const flying = st.phase === "flying";
    const simPaused = st.paused || st.panel !== "none";
    const L0 = this.sample.length;

    // ---- readiness ---------------------------------------------------------------------
    if (!this.firstTilesLoaded && this.frame > 20) {
      const loaded = this.scene.globe.tilesLoaded;
      if (loaded || now - this.createdAt > 14000) {
        this.firstTilesLoaded = true;
        if (st.phase === "loading") useFlightStore.getState().set({ phase: "intro", ready: true });
        this.ev.onReady?.();
      }
    }

    // ---- simulation --------------------------------------------------------------------
    let sample = this.sample;
    if (!flying) {
      this.introT += dt;
      // Earth turns slowly under a ship held fixed in space (exaggerated for the cinematic)
      const lon = START.lon - this.introT * 0.35 * DEG;
      const up = enuFrame(START.lat, lon);
      this.ship.pos = geodeticToEcef(START.lat, lon, START.alt + Math.sin(this.introT * 0.8) * START.alt * 0.0007);
      const hdg = START.heading * DEG;
      const fwd: Vec3 = [
        up.north[0] * Math.cos(hdg) + up.east[0] * Math.sin(hdg),
        up.north[1] * Math.cos(hdg) + up.east[1] * Math.sin(hdg),
        up.north[2] * Math.cos(hdg) + up.east[2] * Math.sin(hdg),
      ];
      this.ship.q = qLookAlong(fwd, up.up);
      this.ship.vel = [0, 0, 0];
      this.rt.lastGround = 0;
      sample = sampleShip(this.ship, this.rt);
      this.rt.thrustLevel = 0.18;
      this.input.consumeMouse();
    } else if (!simPaused) {
      let controls = this.input.read();
      const moveKeys = controls.thrust !== 0 || controls.strafe !== 0 || controls.vertical !== 0;
      if (this.ap.active && moveKeys) this.cancelTravel();
      if (st.cameraMode === "free") {
        const nudge = 7 * (dt * 60);
        this.rig.orbit(controls.mouseDX + (controls.lookX ?? 0) * nudge, controls.mouseDY - (controls.lookY ?? 0) * nudge);
        controls = { ...controls, mouseDX: 0, mouseDY: 0, lookX: 0, lookY: 0 };
      }
      if (this.ap.active) {
        this.ap.step(this.ship, dt);
        // keep terrain/building safety active during cinematic flight
        const before = ecefToGeodetic(this.ship.pos).h;
        enforceTerrainFloor(this.ship, this.rt, this.probe, dt);
        this.resolveBuildings(L0, true);
        const after = ecefToGeodetic(this.ship.pos).h;
        if (after - before > 0.5) this.ap.addLift(after - before);
        // end of autopilot hand-off
        sample = sampleShip(this.ship, this.rt);
        this.rt.thrustLevel += (0.75 - this.rt.thrustLevel) * Math.min(1, dt * 4);
        this.rt.mode = resolveMode(sample.agl, st.modeSelection, this.rt.mode);
        const g = ecefToGeodetic(this.ship.pos);
        const gh = this.probe.heightAt(g.lat, g.lon);
        if (gh !== null) {
          this.rt.lastGround = gh;
          this.rt.groundKnown = true;
        }
        if (this.ap.target && this.ap.progress > 0.55) {
          const th = this.probe.heightAt(this.ap.target.lat, this.ap.target.lon);
          if (th !== null) this.ap.setGround(th);
        }
      } else {
        sample = stepFlight(
          this.ship,
          this.rt,
          controls,
          { assist: st.assist, selection: st.modeSelection, speedScale: st.speedScale, sensitivity: st.sensitivity, invertY: st.invertY },
          dt,
          this.probe,
        );
        this.resolveBuildings(sample.length, false);
        sample = sampleShip(this.ship, this.rt);
      }
      if (this.rt.recovered) {
        this.flashAlert("TERRAIN RECOVERY");
      }
    } else {
      this.input.consumeMouse();
      sample = sampleShip(this.ship, this.rt);
    }
    this.sample = sample;
    if (sample.mode !== this.lastMode) {
      this.lastMode = sample.mode;
      useFlightStore.getState().set({ activeMode: sample.mode });
    }

    // ---- visual intensity drivers --------------------------------------------------------
    const speedFx =
      flying && !simPaused
        ? clamp(smoothstep(0.08, 0.9, sample.speed / Math.max(sample.agl, 200)) * smoothstep(60, 300, sample.speed), 0, 1)
        : 0;
    const band = smoothstep(140_000, 100_000, sample.agl) * (1 - smoothstep(35_000, 15_000, sample.agl));
    const heat = flying ? band * smoothstep(2500, 8000, sample.speed) : 0;
    const thrusting = smoothstep(0.55, 1.0, this.rt.thrustLevel);
    const fxOn = st.effects;
    const shake = fxOn && flying && !simPaused ? clamp(thrusting * smoothstep(0.3, 0.9, speedFx) * 0.6 + heat * 0.7 + (this.rt.collision === "building" ? 0.5 : 0), 0, 1) : 0;

    // ---- camera ----------------------------------------------------------------------------
    this.rig.setMode(flying ? st.cameraMode : "intro");
    this.pose = this.rig.update(
      simPaused ? 0 : dt,
      this.ship,
      sample,
      { speedFx: fxOn ? speedFx : 0, shake, introTime: this.introT, mode: sample.mode },
      this.camObstacles(),
    );
    this.applyPose(this.pose);

    // ---- world updates -----------------------------------------------------------------------
    this.updateSun(dt, sample, flying);
    this.buildings.update((sample.lat * RAD), (sample.lon * RAD), sample.agl, sample.speed, now);
    if (this.preset.shadows) this.scene.shadowMap.enabled = sample.agl < 2500;
    if (this.motionBlur) {
      const k = fxOn ? speedFx * 0.35 : 0;
      this.motionBlur.enabled = k > 0.02;
      (this.motionBlur.uniforms as { strength: number }).strength = k;
    }

    // ---- telemetry -----------------------------------------------------------------------------
    const T = telemetry;
    T.speed = sample.speed;
    T.alt = sample.alt;
    T.agl = sample.agl;
    T.ground = sample.ground;
    T.groundKnown = sample.groundKnown;
    T.lat = sample.lat * RAD;
    T.lon = sample.lon * RAD;
    T.heading = sample.heading;
    T.pitch = sample.pitch;
    T.bank = sample.bank;
    T.vSpeed = sample.vSpeed;
    T.cap = sample.cap;
    T.mode = sample.mode;
    T.thrust = this.rt.thrustLevel;
    T.accel = sample.accel;
    T.collision = this.rt.collision;
    const bs = this.buildings.stats;
    T.buildings = bs.buildings;
    T.buildingTiles = bs.tiles;
    T.buildingsLoading = bs.loading;
    T.fx.speed = speedFx;
    T.fx.heat = heat;
    T.fx.shake = shake;
    T.travel.active = this.ap.active;
    T.travel.name = this.ap.target?.name ?? "";
    T.travel.progress = this.ap.progress;
    T.travel.remaining = this.ap.remaining;
    T.travel.phase = this.ap.phase;
    if (now >= this.nextRegionAt) {
      this.nextRegionAt = now + 500;
      const near = nearestPlace(T.lat, T.lon);
      T.region = !near
        ? ""
        : near.distance < 35_000
          ? `Over ${near.name}`
          : near.distance < 600_000
            ? `${Math.round(near.distance / 1000)} km from ${near.name}`
            : "No known city nearby";
    }
    this.updateDestinationIndicator(sample, st.destination);

    if (this.rt.collision !== "none" && this.rt.collision !== (this.prevAlert as string)) {
      this.flashAlert(this.rt.collision === "building" ? "BUILDING COLLISION" : "TERRAIN PROXIMITY");
    }
    this.prevAlert = this.rt.collision;

    // ---- audio -----------------------------------------------------------------------------------
    if (this.audio) {
      this.audio.update({
        thrust: this.rt.thrustLevel,
        speedNorm: clamp(sample.speed / Math.max(sample.cap, 1), 0, 1),
        speed: sample.speed,
        agl: sample.agl,
        accel: sample.accel,
        travelling: this.ap.active,
        active: flying && !simPaused,
      });
    }
  };

  private resolveBuildings(L: number, autopilot: boolean) {
    if (this.bIndex.count === 0) return;
    const r = 0.42 * L;
    for (let i = 0; i < 3; i++) {
      const c = this.bIndex.resolve(this.ship.pos, r);
      if (!c) break;
      const res = applyContact(this.ship.pos, this.ship.vel, c);
      this.ship.pos = res.pos;
      if (!autopilot) this.ship.vel = res.vel;
      this.rt.collision = "building";
      this.rt.collisionAge = 0;
    }
  }

  private applyPose(p: CameraPose) {
    const cam = this.camera;
    const C = this.C;
    this.tmpC3.x = p.pos[0]; this.tmpC3.y = p.pos[1]; this.tmpC3.z = p.pos[2];
    this.tmpDir.x = p.dir[0]; this.tmpDir.y = p.dir[1]; this.tmpDir.z = p.dir[2];
    this.tmpUp.x = p.up[0]; this.tmpUp.y = p.up[1]; this.tmpUp.z = p.up[2];
    cam.setView({ destination: this.tmpC3, orientation: { direction: this.tmpDir, up: this.tmpUp } });
    const canvas = this.widget.canvas;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const frustum = cam.frustum as InstanceType<CesiumModule["PerspectiveFrustum"]>;
    frustum.fov = aspect >= 1 ? 2 * Math.atan(Math.tan(p.fov / 2) * aspect) : p.fov;
    void C;
  }

  private onPostRender = () => {
    if (this.disposed) return;
    const st = getFlightState();
    const p = this.pose;
    const sun = (this.scene as unknown as { context: { uniformState: { sunDirectionWC: { x: number; y: number; z: number } } } }).context
      .uniformState.sunDirectionWC;
    const sunDir: Vec3 = norm([sun.x, sun.y, sun.z]);
    // Earth-shadow factor for the ship
    const pos = this.ship.pos;
    const proj = dot(pos, sunDir);
    let daylight = 1;
    if (proj < 0) {
      const perp = len(sub(pos, scale(sunDir, proj)));
      daylight = smoothstep(6.28e6, 6.5e6, perp);
    }
    // orbital traffic: only meaningful (and only drawn) once the ship is high above the atmosphere
    const nowMs = Date.now();
    this.live?.update(nowMs);
    const satOpacity = st.satellites && this.orbits.loaded ? smoothstep(60_000, 120_000, this.sample.alt) : 0;
    if (satOpacity > 0.01) {
      const dtOrb = Math.min(1, Math.max(0, (nowMs - this.lastOrbitMs) / 1000));
      this.lastOrbitMs = nowMs;
      this.orbits.step(nowMs, dtOrb);
    } else {
      this.lastOrbitMs = nowMs;
    }
    this.shipRenderer.render(
      {
        camPos: p.pos,
        camDir: p.dir,
        camUp: p.up,
        fovY: p.fov,
        shipPos: this.ship.pos,
        shipQ: this.ship.q,
        length: this.sample.length,
        sunDir,
        daylight,
        thrust: this.rt.thrustLevel,
        boost: telemetry.fx.speed,
        visible: st.phase !== "flying" || st.cameraMode !== "cockpit",
        time: performance.now() / 1000,
      },
      {
        frame: {
          catalog: this.orbits,
          camPos: p.pos,
          camDir: p.dir,
          camUp: p.up,
          fovY: p.fov,
          shipPos: this.ship.pos,
          sunDir,
          opacity: satOpacity,
        },
        tel: telemetry,
      },
    );

    // sun glare (screen-space for the HUD)
    const right = norm([p.dir[1] * p.up[2] - p.dir[2] * p.up[1], p.dir[2] * p.up[0] - p.dir[0] * p.up[2], p.dir[0] * p.up[1] - p.dir[1] * p.up[0]]);
    const d = dot(sunDir, p.dir);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (d > 0.05) {
      const tanY = Math.tan(p.fov / 2), tanX = tanY * (w / h);
      const nx = dot(sunDir, right) / (d * tanX);
      const ny = dot(sunDir, p.up) / (d * tanY);
      // occlusion by the globe
      const t = -dot(p.pos, sunDir);
      let occluded = false;
      if (t > 0) {
        const closest = len([p.pos[0] + sunDir[0] * t, p.pos[1] + sunDir[1] * t, p.pos[2] + sunDir[2] * t]);
        occluded = closest < 6.356e6;
      }
      const edge = 1 - smoothstep(1.0, 2.2, Math.max(Math.abs(nx), Math.abs(ny)));
      telemetry.sun.x = (nx * 0.5 + 0.5) * w;
      telemetry.sun.y = (0.5 - ny * 0.5) * h;
      telemetry.sun.intensity = occluded ? 0 : edge * smoothstep(0.05, 0.6, d);
    } else telemetry.sun.intensity = 0;
  };

  private updateSun(dt: number, s: FlightSample, flying: boolean) {
    const mode = getFlightState().sunMode;
    const lonDeg = s.lon * RAD;
    if (flying) {
      let d = lonDeg - this.sunRefLon;
      d = ((d + 540) % 360) - 180;
      this.sunRefLon += d * (1 - Math.exp(-dt * 0.9));
    }
    this.setClock(this.sunRefLon, mode, false);
  }

  private setClock(lonDeg: number, mode: "day" | "live" | "night", force: boolean) {
    const C = this.C;
    const nowMs = performance.now();
    if (!force && nowMs - this.lastClockMs < 120) return;
    this.lastClockMs = nowMs;
    const d = new Date();
    let ms: number;
    if (mode === "live") ms = d.getTime();
    else {
      const localHour = mode === "day" ? 14 : 23.5;
      const utcHours = (((localHour - lonDeg / 15) % 24) + 24) % 24;
      ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + utcHours * 3600e3;
    }
    this.widget.clock.currentTime = C.JulianDate.fromDate(new Date(ms), this.widget.clock.currentTime);
  }

  private updateDestinationIndicator(s: FlightSample, dest: DestinationTarget | null) {
    const D = telemetry.dest;
    if (!dest) {
      D.active = false;
      return;
    }
    const la = dest.lat * DEG, lo = dest.lon * DEG;
    D.active = true;
    D.name = dest.landmark ?? dest.name;
    D.distance = greatCircleDistance(s.lat, s.lon, la, lo);
    const brg = initialBearing(s.lat, s.lon, la, lo) * RAD;
    D.bearing = (brg + 360) % 360;
    D.relBearing = wrapPi((D.bearing - s.heading) * DEG) * RAD;
    // project to screen
    const h = (this.probe.heightAt(la, lo) ?? s.ground) + 60;
    const target = degToEcef(dest.lat, dest.lon, h);
    const toTarget = sub(target, this.pose.pos);
    const behindHorizon = dot(norm(target), sub(this.pose.pos, target)) < -1e3;
    const C = this.C;
    this.tmpC3.x = target[0]; this.tmpC3.y = target[1]; this.tmpC3.z = target[2];
    const win = C.SceneTransforms.worldToWindowCoordinates(this.scene, this.tmpC3);
    const w = this.container.clientWidth, hgt = this.container.clientHeight;
    const forward = dot(norm(toTarget), this.pose.dir) > 0;
    if (win && forward && !behindHorizon && win.x > 0 && win.x < w && win.y > 0 && win.y < hgt) {
      D.x = win.x;
      D.y = win.y;
      D.onScreen = true;
    } else D.onScreen = false;
  }

  private trackFps(rawDt: number, now: number) {
    this.fpsAcc += rawDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      const fps = this.fpsFrames / this.fpsAcc;
      telemetry.fps = fps;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      const s = getFlightState();
      if (s.adaptiveQuality && s.phase === "flying" && !s.paused && document.visibilityState === "visible") {
        if (fps < 40) {
          this.lowFpsSecs++;
          this.highFpsSecs = 0;
        } else if (fps > 57) {
          this.highFpsSecs++;
          this.lowFpsSecs = 0;
        } else {
          this.lowFpsSecs = this.highFpsSecs = 0;
        }
        if (this.lowFpsSecs >= 3 && this.adaptScale > 0.55) {
          this.adaptScale = Math.max(0.55, this.adaptScale - 0.15);
          this.lowFpsSecs = 0;
          this.applyQuality(s.quality);
        } else if (this.highFpsSecs >= 8 && this.adaptScale < 1) {
          this.adaptScale = Math.min(1, this.adaptScale + 0.1);
          this.highFpsSecs = 0;
          this.applyQuality(s.quality);
        }
      }
    }
    void now;
  }

  // ------------------------------------------------------------------------------------------
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsub.forEach((u) => u());
    this.input?.exitLock();
    this.input?.dispose();
    this.resizeObs?.disconnect();
    this.audio?.dispose();
    try {
      this.scene?.preUpdate.removeEventListener(this.onPreUpdate);
      this.scene?.postRender.removeEventListener(this.onPostRender);
    } catch { /* scene already destroyed */ }
    this.buildings?.dispose();
    this.live?.dispose();
    this.markers?.dispose();
    this.shipRenderer?.dispose();
    try {
      this.widget?.destroy();
    } catch { /* ignore */ }
    if (typeof window !== "undefined") delete (window as unknown as { __earthflight?: unknown }).__earthflight;
  }
}