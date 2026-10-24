import type { FlightModeId } from "@/engine/physics";

/**
 * Mutable per-frame telemetry. Written by the simulator every frame, read by HUD widgets on a
 * timer or inside their own requestAnimationFrame callbacks — it never triggers React renders.
 */
export interface Telemetry {
  speed: number; // m/s
  alt: number; // m above ellipsoid
  agl: number; // m above ground
  ground: number;
  groundKnown: boolean;
  lat: number; // deg
  lon: number; // deg
  heading: number; // deg
  pitch: number;
  bank: number;
  vSpeed: number;
  cap: number;
  mode: FlightModeId;
  region: string;
  thrust: number;
  accel: number;
  fps: number;
  collision: "none" | "terrain" | "building";
  buildings: number;
  buildingTiles: number;
  buildingsLoading: number;
  terrain: "loading" | "ready" | "fallback";
  travel: { active: boolean; name: string; progress: number; remaining: number; phase: string };
  dest: { active: boolean; name: string; distance: number; bearing: number; relBearing: number; x: number; y: number; onScreen: boolean };
  fx: { speed: number; heat: number; shake: number };
  sun: { x: number; y: number; intensity: number };
  /** Increments whenever the sim wants the HUD to flash a collision/emergency indicator. */
  alertSeq: number;
  alertText: string;
}

export const telemetry: Telemetry = {
  speed: 0,
  alt: 0,
  agl: 0,
  ground: 0,
  groundKnown: false,
  lat: 0,
  lon: 0,
  heading: 0,
  pitch: 0,
  bank: 0,
  vSpeed: 0,
  cap: 0,
  mode: "space",
  region: "",
  thrust: 0,
  accel: 0,
  fps: 60,
  collision: "none",
  buildings: 0,
  buildingTiles: 0,
  buildingsLoading: 0,
  terrain: "loading",
  travel: { active: false, name: "", progress: 0, remaining: 0, phase: "idle" },
  dest: { active: false, name: "", distance: 0, bearing: 0, relBearing: 0, x: 0, y: 0, onScreen: false },
  fx: { speed: 0, heat: 0, shake: 0 },
  sun: { x: 0, y: 0, intensity: 0 },
  alertSeq: 0,
  alertText: "",
};
