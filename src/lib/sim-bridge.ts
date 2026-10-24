import type { Simulator } from "@/lib/cesium/simulator";

/** UI → simulator command bridge (type-only import keeps Cesium out of the main bundle). */
let current: Simulator | null = null;

export const setSimulator = (s: Simulator | null) => {
  current = s;
};
export const getSimulator = () => current;
