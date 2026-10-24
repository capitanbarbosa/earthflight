// NOTE: NEXT_PUBLIC_* must be referenced literally so Next.js can inline them at build time.
export const config = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  imagery: (process.env.NEXT_PUBLIC_IMAGERY || "eox") as "eox" | "esri" | "maptiler" | "ion",
  terrain: (process.env.NEXT_PUBLIC_TERRAIN || "reearth") as "reearth" | "ion",
  ionToken: process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || "",
  maptilerKey: process.env.NEXT_PUBLIC_MAPTILER_KEY || "",
  arcgisKey: process.env.NEXT_PUBLIC_ARCGIS_API_KEY || "",
  /** Overlay free national aerial imagery (US/Japan/France) at street level. Set NEXT_PUBLIC_REGIONAL_IMAGERY=false to disable. */
  regionalImagery: process.env.NEXT_PUBLIC_REGIONAL_IMAGERY !== "false",
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "",
  adsenseSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT_CONTENT || "",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com",
};

export const SITE_NAME = "EARTHFLIGHT";
export const SITE_TAGLINE = "Fly a spaceship from orbit down into 3D cities";
