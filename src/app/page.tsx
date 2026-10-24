import Link from "next/link";
import EarthflightApp from "@/components/game/EarthflightApp";
import { SiteFooter, SiteHeader } from "@/components/site/ContentPage";
import { AdSlot } from "@/components/site/AdSlot";
import { JsonLd } from "@/components/site/JsonLd";
import { FEATURED } from "@/lib/geospatial/destinations";
import { config, SITE_NAME } from "@/lib/config";

const FAQ = [
  {
    q: "Is EARTHFLIGHT free?",
    a: "Yes. It runs in your browser with no download, no account and no payment. The site is supported by unobtrusive ads on information pages only, never over the flight view.",
  },
  {
    q: "Does it use Google Earth or Google Maps?",
    a: "No. EARTHFLIGHT is built on the open-source CesiumJS globe with NASA, ESA Sentinel-2 and OpenStreetMap-derived data. It does not use Google Maps, Street View or Google 3D tiles.",
  },
  {
    q: "What do I need to play?",
    a: "A desktop or laptop with a modern browser (Chrome, Edge, Firefox or Safari), WebGL 2, a mouse and a keyboard. A discrete GPU helps in High quality; Low quality works on integrated graphics.",
  },
  {
    q: "Are the buildings real?",
    a: "Buildings come from OpenStreetMap and are extruded from their mapped footprints and heights. Where OpenStreetMap has no building data, nothing is invented — you will see flat ground instead.",
  },
  {
    q: "Can I fly anywhere on Earth?",
    a: "Yes. Fly freely in any direction, jump to one of the featured cities with cinematic great-circle travel, or search for any place name worldwide.",
  },
];

export default function Home() {
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: SITE_NAME,
            url: config.siteUrl,
            applicationCategory: "GameApplication",
            operatingSystem: "Any (modern web browser with WebGL 2)",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            description: "Free browser-based 3D spaceship flight simulator over a real Earth, from orbit to city streets.",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />

      <EarthflightApp variant="home" />

      <div className="below-fold bg-[radial-gradient(ellipse_at_top,#06223a_0%,#02060c_60%)]">
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-5 py-14">
          <section className="prose-site mx-auto max-w-3xl">
            <h2 className="!mt-0 !text-2xl">A 3D Earth flight simulator that runs in your browser</h2>
            <p>
              EARTHFLIGHT puts you in the cockpit of a spaceship above a real, rotating Earth. Burn toward the planet, break through the atmosphere,
              and slow down over a city until you are flying between skyscrapers — all in a single continuous flight, with nothing to install.
            </p>
            <p>
              Satellite imagery, global terrain and OpenStreetMap buildings are streamed on demand, so the world you explore is the real one:
              the Alps, the Himalayas, the Manhattan skyline, the canals of Cartagena.
            </p>
          </section>

          <section className="mt-12 grid gap-4 sm:grid-cols-3" aria-label="Features">
            {[
              ["Orbit to street level", "Altitude-aware flight: thousands of km/s in space, a controlled crawl between buildings."],
              ["Six degrees of freedom", "Thrust, strafe, ascend, pitch, yaw and roll with momentum, arcade and realistic flight models."],
              ["Cinematic travel", "Search any city and fly a safe great-circle arc there — never through the planet."],
            ].map(([t, d]) => (
              <div key={t} className="hud-panel p-5">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cyan-100/70">{d}</p>
              </div>
            ))}
          </section>

          <section className="mt-14">
            <h2 className="font-mono text-sm font-bold uppercase tracking-[0.3em] text-cyan-200">Popular destinations</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURED.map((d) => (
                <li key={d.id}>
                  <Link href={`/destinations/${d.id}`} className="hud-panel block p-4 transition-colors hover:border-cyan-300/70">
                    <span className="block text-base font-semibold text-cyan-50">{d.name}</span>
                    <span className="block text-xs text-cyan-200/55">{d.country}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-cyan-100/70">
              <Link className="underline" href="/destinations">See all destinations</Link> · <Link className="underline" href="/how-to-play">How to play</Link> ·{" "}
              <Link className="underline" href="/controls">Controls</Link>
            </p>
          </section>

          <AdSlot />

          <section className="prose-site mx-auto mt-14 max-w-3xl">
            <h2 className="!mt-0">Frequently asked questions</h2>
            {FAQ.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
            <p>
              Learn more: <Link href="/3d-flight-simulator">3D flight simulator</Link> · <Link href="/browser-earth-exploration">browser-based Earth exploration</Link>.
            </p>
          </section>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
