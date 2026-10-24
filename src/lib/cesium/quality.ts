import type { BuildingQuality } from "./buildings";

export interface QualityPreset {
  /** Cap on the device pixel ratio used for rendering. */
  dprCap: number;
  /** Extra resolution multiplier. */
  res: number;
  /** Cesium globe maximumScreenSpaceError (lower = sharper terrain/imagery, more load). */
  sse: number;
  fxaa: boolean;
  msaa: number;
  shadows: boolean;
  bloom: boolean;
  blur: boolean;
  buildings: BuildingQuality;
}

export const QUALITY: Record<"low" | "medium" | "high", QualityPreset> = {
  low: {
    dprCap: 1, res: 0.8, sse: 4, fxaa: false, msaa: 1, shadows: false, bloom: false, blur: false,
    buildings: { radius: 1800, maxTiles: 6, maxAgl: 2500, shadows: false },
  },
  medium: {
    dprCap: 1.5, res: 1, sse: 2.2, fxaa: true, msaa: 1, shadows: false, bloom: false, blur: false,
    buildings: { radius: 3000, maxTiles: 12, maxAgl: 3500, shadows: false },
  },
  high: {
    dprCap: 2, res: 1, sse: 1.4, fxaa: false, msaa: 4, shadows: true, bloom: true, blur: true,
    buildings: { radius: 4500, maxTiles: 20, maxAgl: 4500, shadows: true },
  },
};
