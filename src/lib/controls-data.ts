export interface ControlRow {
  keys: string[];
  action: string;
  group: "Flight" | "Camera & modes" | "Systems";
  detail?: string;
}

export const CONTROLS: ControlRow[] = [
  { keys: ["W"], action: "Accelerate forward", group: "Flight", detail: "Thrust along the nose. Top speed depends on your altitude above the ground." },
  { keys: ["S"], action: "Brake / reverse thrust", group: "Flight", detail: "Retro-burn against your direction of travel, then slow reverse." },
  { keys: ["A"], action: "Strafe left", group: "Flight" },
  { keys: ["D"], action: "Strafe right", group: "Flight" },
  { keys: ["Space"], action: "Ascend", group: "Flight", detail: "Thrust away from the Earth (local up)." },
  { keys: ["Shift"], action: "Descend", group: "Flight", detail: "Thrust toward the surface; terrain protection still applies." },
  { keys: ["Mouse"], action: "Pitch and yaw", group: "Flight", detail: "Click the view to capture the mouse (pointer lock). If unavailable, hold the mouse button and drag." },
  { keys: ["Q"], action: "Roll left", group: "Flight" },
  { keys: ["E"], action: "Roll right", group: "Flight" },
  { keys: ["[", "]"], action: "Speed limiter  (or mouse wheel)", group: "Flight", detail: "Scale the maximum speed of the current altitude band from 2% to 100%." },
  { keys: ["C"], action: "Toggle camera", group: "Camera & modes", detail: "Chase → cockpit → free orbit (mouse orbits the ship, wheel zooms)." },
  { keys: ["F"], action: "Toggle flight mode (arcade ⇄ realistic)", group: "Camera & modes", detail: "Arcade: assisted, auto-level, velocity follows the nose. Realistic: Newtonian momentum, no auto-level." },
  { keys: ["1", "2", "3", "0"], action: "Space / Atmospheric / City / Auto altitude mode", group: "Camera & modes" },
  { keys: ["R"], action: "Reset orientation", group: "Systems", detail: "Levels the ship to the local horizon." },
  { keys: ["X"], action: "Emergency stop", group: "Systems", detail: "Kills velocity and holds position until you thrust again." },
  { keys: ["T"], action: "Reset position (return to orbit)", group: "Systems" },
  { keys: ["G"], action: "Destinations / search", group: "Systems" },
  { keys: ["Backspace"], action: "Cancel cinematic travel", group: "Systems", detail: "Any thrust key also cancels travel." },
  { keys: ["M"], action: "Mute / unmute", group: "Systems" },
  { keys: ["H"], action: "Show / hide this guide", group: "Systems" },
  { keys: ["Esc"], action: "Pause / release mouse", group: "Systems" },
];
