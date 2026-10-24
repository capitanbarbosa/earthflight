import { create } from "zustand";
import type { CameraMode } from "@/engine/camera";
import type { FlightAssist, FlightModeId, ModeSelection } from "@/engine/physics";

export type Phase = "loading" | "intro" | "flying";
export type Quality = "low" | "medium" | "high";
export type Panel = "none" | "destinations" | "settings";

export interface DestinationTarget {
  id: string;
  name: string;
  lat: number; // degrees
  lon: number;
  /** Optional specific landmark inside the city. */
  landmark?: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "warn";
}

/**
 * Slow-changing UI/simulation settings only.
 * Fast per-frame values (speed, altitude, …) live in `telemetry` to avoid React re-renders.
 */
interface FlightState {
  phase: Phase;
  ready: boolean; // globe finished first load
  error: string | null;
  paused: boolean;
  pointerLocked: boolean;
  panel: Panel;
  showControls: boolean;

  cameraMode: CameraMode; // chase | cockpit | free
  assist: FlightAssist;
  modeSelection: ModeSelection;
  activeMode: FlightModeId;
  speedScale: number;
  invertY: boolean;
  sensitivity: number;

  quality: Quality;
  adaptiveQuality: boolean;
  effects: boolean;
  sunMode: "day" | "live" | "night";

  muted: boolean;
  volume: number;

  destination: DestinationTarget | null; // selected target shown by the HUD indicator
  travelling: boolean;
  toasts: Toast[];

  set: (p: Partial<FlightState>) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
}

let toastId = 1;

export const useFlightStore = create<FlightState>((set, get) => ({
  phase: "loading",
  ready: false,
  error: null,
  paused: false,
  pointerLocked: false,
  panel: "none",
  showControls: true,

  cameraMode: "chase",
  assist: "arcade",
  modeSelection: "auto",
  activeMode: "space",
  speedScale: 1,
  invertY: false,
  sensitivity: 1,

  quality: "medium",
  adaptiveQuality: true,
  effects: true,
  sunMode: "day",

  muted: false,
  volume: 0.6,

  destination: null,
  travelling: false,
  toasts: [],

  set: (p) => set(p),
  toast: (text, tone = "info") => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const getFlightState = () => useFlightStore.getState();
