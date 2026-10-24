import type { Metadata } from "next";
import { ContentPage } from "@/components/site/ContentPage";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How EARTHFLIGHT handles data, cookies, third-party map services and advertising.",
  alternates: { canonical: "/privacy" },
};

// TEMPLATE: have a lawyer review this before launching commercially, and update to match your real setup.
export default function Page() {
  return (
    <ContentPage cta={false}>
      <h1>Privacy policy</h1>
      <p><em>Last updated: October 2026. This is a template — review it with legal counsel and adapt it to your deployment.</em></p>
      <h2>What we collect</h2>
      <p>
        EARTHFLIGHT has no accounts and does not ask for personal information. Your settings (quality, volume, control preferences) are held in memory in your browser and are not
        sent to us. Like any web server, ours may log your IP address, user agent and requested URL for security and diagnostics.
      </p>
      <h2>Third-party services your browser contacts</h2>
      <p>To draw the Earth, your browser requests map data directly from third-party providers, which receive your IP address and the tiles you request:</p>
      <ul>
        <li>NASA GIBS (Blue Marble, Black Marble imagery)</li>
        <li>EOX (Sentinel-2 cloudless imagery) or another configured imagery provider</li>
        <li>Re:Earth / the configured terrain provider</li>
        <li>OpenFreeMap (OpenStreetMap-derived building tiles)</li>
      </ul>
      <p>
        If you use worldwide place search, your query is sent to our server, which forwards it to OpenStreetMap Nominatim. We do not store queries beyond a short in-memory cache.
      </p>
      <h2>Advertising and cookies</h2>
      <p>
        Information pages (not the flight view) may show ads served by Google AdSense, only if you accept advertising in the notice shown on first visit. Google and its partners may
        use cookies to serve and measure ads. You can choose &quot;No ads&quot; and no advertising script is loaded. See{" "}
        <a href="https://policies.google.com/technologies/ads" rel="noopener">how Google uses data from partner sites</a>.
      </p>
      <h2>Audio and input</h2>
      <p>The simulator uses your keyboard and mouse (including pointer lock). It never accesses your microphone or camera. Sound only starts after you press Start.</p>
      <h2>Your rights</h2>
      <p>Depending on where you live you may have rights to access, correct or delete personal data. Contact us at <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.</p>
    </ContentPage>
  );
}
