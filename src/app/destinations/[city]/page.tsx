import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/site/ContentPage";
import { JsonLd } from "@/components/site/JsonLd";
import { FEATURED, getDestination } from "@/lib/geospatial/destinations";
import { config } from "@/lib/config";

export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURED.map((d) => ({ city: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const d = getDestination(city);
  if (!d) return {};
  return {
    title: `Fly Over ${d.name} in 3D — Landmarks and Flight Tips`,
    description: `Fly a spaceship from orbit down into ${d.name}, ${d.country}. ${d.blurb.slice(0, 110)}…`,
    alternates: { canonical: `/destinations/${d.id}` },
  };
}

export default async function Page({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const d = getDestination(city);
  if (!d || !d.featured) notFound();
  const near = FEATURED.filter((x) => x.id !== d.id).slice(0, 4);
  return (
    <ContentPage>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Destinations", item: `${config.siteUrl}/destinations` },
            { "@type": "ListItem", position: 2, name: d.name, item: `${config.siteUrl}/destinations/${d.id}` },
          ],
        }}
      />
      <p className="!mt-0 font-mono text-xs uppercase tracking-[0.25em] text-cyan-300/70">
        <Link href="/destinations">Destinations</Link> / {d.country}
      </p>
      <h1>Fly over {d.name} in 3D</h1>
      <p>{d.blurb}</p>
      <p>
        <Link href={`/explore?dest=${d.id}`} className="start-btn !inline-block !no-underline">FLY TO {d.name.toUpperCase()}</Link>
      </p>

      <h2>Landmarks to find</h2>
      <p>These points are marked in the simulator. Select one in the destination search (<kbd>G</kbd>) to fly straight to it:</p>
      <ul>
        {d.landmarks.map((l) => (
          <li key={l.name}>
            <strong>{l.name}</strong> <span className="opacity-60">({l.lat.toFixed(3)}°, {l.lon.toFixed(3)}°)</span>
          </li>
        ))}
      </ul>

      <h2>Flying tips for {d.name}</h2>
      <ul>
        <li>The autopilot arrives at a few hundred metres, then hands control back to you. Reduce the speed limiter with the mouse wheel before dropping lower.</li>
        <li>Buildings are streamed from OpenStreetMap as you approach, so give the city a few seconds to appear after you arrive.</li>
        <li>Use the free camera (<kbd>C</kbd>) to orbit your ship against the skyline.</li>
        <li>Toggle <em>Night</em> in the pause menu to see the city after dark.</li>
      </ul>
      <p className="text-sm opacity-70">
        Building footprints and heights come from OpenStreetMap contributors and vary in completeness. Where no building is mapped, none is drawn.
      </p>

      <h2>More destinations</h2>
      <ul>
        {near.map((n) => (
          <li key={n.id}>
            <Link href={`/destinations/${n.id}`}>Fly over {n.name}</Link>
          </li>
        ))}
      </ul>
    </ContentPage>
  );
}
