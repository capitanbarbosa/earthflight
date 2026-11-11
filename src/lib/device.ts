export type FormFactor = "desktop" | "phone" | "tablet";
export type DeviceKind = "desktop" | "iphone" | "ipad" | "phone" | "tablet";

export interface DeviceSignals {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** Primary pointing device is a finger. */
  coarsePointer: boolean;
  /** Viewport is phone-width (also covers a split-screen iPad). */
  narrow: boolean;
}

export interface DeviceProfile {
  kind: DeviceKind;
  formFactor: FormFactor;
  /** On-screen sticks should fly the ship, and pointer lock should stay off. */
  touchFlight: boolean;
}

/**
 * iPhone, iPad (including iPadOS desktop-UA), and other phones/tablets whose primary
 * pointer is a finger. A touchscreen laptop with a mouse stays on keyboard and mouse.
 */
export function classifyDevice(s: DeviceSignals): DeviceProfile {
  const ua = s.userAgent || "";
  const platform = s.platform || "";
  const iphone = /iPhone|iPod/i.test(ua);
  // iPadOS 13+ Safari sends a Macintosh UA. More than one touch point separates it from a Mac.
  const ipad = /iPad/i.test(ua) || (/Macintosh|MacIntel/i.test(`${ua} ${platform}`) && s.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const androidPhone = android && /Mobile/i.test(ua);

  let kind: DeviceKind = "desktop";
  if (iphone) kind = "iphone";
  else if (ipad) kind = "ipad";
  else if (androidPhone || (s.coarsePointer && s.narrow)) kind = "phone";
  else if (android || s.coarsePointer) kind = "tablet";

  const touchFlight = kind !== "desktop";
  const formFactor: FormFactor = !touchFlight ? "desktop" : kind === "iphone" || kind === "phone" || s.narrow ? "phone" : "tablet";
  return { kind, formFactor, touchFlight };
}

export function detectDevice(): DeviceProfile {
  if (typeof navigator === "undefined") return { kind: "desktop", formFactor: "desktop", touchFlight: false };
  return classifyDevice({
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    maxTouchPoints: navigator.maxTouchPoints || 0,
    coarsePointer: !!window.matchMedia?.("(pointer: coarse)").matches,
    narrow: !!window.matchMedia?.("(max-width: 700px)").matches,
  });
}
