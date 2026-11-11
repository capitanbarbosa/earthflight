import { describe, expect, it } from "vitest";
import { classifyDevice, type DeviceSignals } from "./device";

const desktop: DeviceSignals = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
  coarsePointer: false,
  narrow: false,
};

describe("classifyDevice", () => {
  it("keeps a mouse-driven desktop on keyboard controls", () => {
    expect(classifyDevice(desktop)).toMatchObject({ kind: "desktop", formFactor: "desktop", touchFlight: false });
  });

  it("detects an iPhone and uses the phone layout", () => {
    const p = classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      coarsePointer: true,
      narrow: true,
    });
    expect(p).toMatchObject({ kind: "iphone", formFactor: "phone", touchFlight: true });
  });

  it("detects an iPhone in landscape as a phone, not a tablet", () => {
    const p = classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
      coarsePointer: true,
      narrow: false,
    });
    expect(p).toMatchObject({ kind: "iphone", formFactor: "phone", touchFlight: true });
  });

  it("detects a classic iPad", () => {
    const p = classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPad",
      maxTouchPoints: 5,
      coarsePointer: true,
      narrow: false,
    });
    expect(p).toMatchObject({ kind: "ipad", formFactor: "tablet", touchFlight: true });
  });

  it("detects iPadOS when it pretends to be a Mac", () => {
    const p = classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      coarsePointer: true,
      narrow: false,
    });
    expect(p).toMatchObject({ kind: "ipad", formFactor: "tablet", touchFlight: true });
  });

  it("uses the phone layout for a narrow iPad split view", () => {
    const p = classifyDevice({
      ...desktop,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      coarsePointer: false,
      narrow: true,
    });
    expect(p).toMatchObject({ kind: "ipad", formFactor: "phone", touchFlight: true });
  });

  it("detects other phones and tablets from the primary pointer", () => {
    expect(classifyDevice({ ...desktop, coarsePointer: true, narrow: true }).kind).toBe("phone");
    expect(classifyDevice({ ...desktop, coarsePointer: true, narrow: false }).kind).toBe("tablet");
    expect(
      classifyDevice({
        ...desktop,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
        coarsePointer: true,
        narrow: false,
      }).kind,
    ).toBe("phone");
  });
});
