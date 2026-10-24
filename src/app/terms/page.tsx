import type { Metadata } from "next";
import { ContentPage } from "@/components/site/ContentPage";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of use for the EARTHFLIGHT browser-based Earth flight simulator.",
  alternates: { canonical: "/terms" },
};

// TEMPLATE: have a lawyer review this before launching commercially.
export default function Page() {
  return (
    <ContentPage cta={false}>
      <h1>Terms of service</h1>
      <p><em>Last updated: October 2026. This is a template — review it with legal counsel before commercial use.</em></p>
      <h2>Use of the service</h2>
      <p>EARTHFLIGHT is provided free of charge for entertainment and educational exploration. You agree not to disrupt the service, scrape it at scale, or attempt to bypass limits placed on third-party data providers.</p>
      <h2>Not for navigation</h2>
      <p>
        The simulator is not a navigation or aviation tool. Imagery, terrain and building data may be outdated, incomplete or inaccurate. Never rely on it for real-world travel, flight planning or safety decisions.
      </p>
      <h2>Data attribution</h2>
      <p>
        Map data © OpenStreetMap contributors (ODbL). Imagery: NASA GIBS; Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016, CC BY 4.0). Terrain: Re:Earth (CC BY 4.0).
        Globe engine: CesiumJS (Apache 2.0).
      </p>
      <h2>No warranty</h2>
      <p>The service is provided &quot;as is&quot; without warranties. We do not guarantee availability or any particular performance or frame rate, which depend on your device and network.</p>
      <h2>Contact</h2>
      <p><a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a></p>
    </ContentPage>
  );
}
