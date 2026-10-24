import type { CesiumModule } from "./loader";
import { config } from "@/lib/config";

/** Re:Earth / Mapterhorn ellipsoidal quantized-mesh terrain (CC BY 4.0) — keyless. */
export const REEARTH_TERRAIN_URL = "https://terrain.reearth.land/cesium-mesh/ellipsoid";

/**
 * Create the terrain provider.  Falls back to a smooth ellipsoid if the service is unreachable;
 * flight physics then relies on its "last known ground" safety logic.
 */
export async function createTerrain(Cesium: CesiumModule): Promise<{
  provider: InstanceType<CesiumModule["CesiumTerrainProvider"]> | InstanceType<CesiumModule["EllipsoidTerrainProvider"]>;
  fallback: boolean;
}> {
  try {
    if (config.terrain === "ion" && config.ionToken) {
      Cesium.Ion.defaultAccessToken = config.ionToken;
      const provider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: false });
      return { provider, fallback: false };
    }
    const resource = new Cesium.Resource({
      url: REEARTH_TERRAIN_URL,
      retryAttempts: 3,
      // Be polite to the public endpoint: back off on throttling (429/503) and retry.
      retryCallback: (_res: unknown, error: { statusCode?: number } | undefined) => {
        const code = error?.statusCode;
        if (code === 429 || code === 503 || code === 502) {
          return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 400 + Math.random() * 800));
        }
        return false;
      },
    } as ConstructorParameters<CesiumModule["Resource"]>[0]);
    const provider = await Cesium.CesiumTerrainProvider.fromUrl(resource, {
      // NOTE: vertex normals must stay OFF — with them Cesium switches the globe to "vertex lighting",
      // which disables per-layer dayAlpha/nightAlpha (our Black Marble night-lights layer).
      requestVertexNormals: false,
      requestWaterMask: false,
    });
    return { provider, fallback: false };
  } catch (e) {
    console.warn("[terrain] terrain service unavailable; using ellipsoid", e);
    return { provider: new Cesium.EllipsoidTerrainProvider(), fallback: true };
  }
}
