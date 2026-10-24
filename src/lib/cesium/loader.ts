export type CesiumModule = typeof import("cesium");

let promise: Promise<CesiumModule> | null = null;

/**
 * Lazily load CesiumJS on the client only. CESIUM_BASE_URL must be set *before* the module
 * evaluates so workers/assets resolve to /cesium (copied from node_modules by scripts/copy-cesium.mjs).
 */
export function loadCesium(): Promise<CesiumModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("Cesium is client-only"));
  if (!promise) {
    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesium";
    promise = import("cesium");
  }
  return promise;
}
