import type { MetadataRoute } from "next";
import { config } from "@/lib/config";
import { FEATURED } from "@/lib/geospatial/destinations";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: Array<[string, number]> = [
    ["", 1],
    ["/how-to-play", 0.8],
    ["/controls", 0.8],
    ["/destinations", 0.8],
    ["/browser-earth-exploration", 0.7],
    ["/3d-flight-simulator", 0.7],
    ["/privacy", 0.2],
    ["/terms", 0.2],
  ];
  return [
    ...pages.map(([p, priority]) => ({ url: `${config.siteUrl}${p}`, lastModified: now, changeFrequency: "monthly" as const, priority })),
    ...FEATURED.map((d) => ({ url: `${config.siteUrl}/destinations/${d.id}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
