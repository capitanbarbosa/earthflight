import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";
import { DESTINATIONS, FEATURED } from "@/lib/geospatial/destinations";

export const metadata: Metadata = {
  title: "Popular Destinations — Fly Over New York, Tokyo, London, Paris and More",
  description: "Pick a city and fly there in 3D: New York, Tokyo, London, Paris, Dubai, Singapore, Cartagena and Medellín, with landmarks and cinematic great-circle travel.",
  alternates: { canonical: "/destinations" },
};

export default function Page() {
  const others = DESTINATIONS.filter((d) => !d.featured);
  return (
    <ContentPage>
      <h1>Popular destinations</h1>
      <p>
        Every destination below is one keystroke away in the simulator: press <kbd>G</kbd>, type the name and your ship will fly a safe great-circle
        route there. Each city page lists landmarks to look for and flying tips.
      </p>
      <h2>Featured cities</h2>
      <ul className="!list-none !ml-0 grid gap-3 sm:grid-cols-2">
        {FEATURED.map((d) => (
          <li key={d.id} className="hud-panel !m-0 p-4">
            <Link href={`/destinations/${d.id}`} className="!no-underline">
              <span className="block text-lg font-semibold text-cyan-50">{d.name}</span>
              <span className="block text-xs uppercase tracking-widest text-cyan-200/55">{d.country}</span>
            </Link>
            <p className="!my-2 text-sm">{d.blurb}</p>
            <Link href={`/explore?dest=${d.id}`} className="text-sm">Fly there →</Link>
          </li>
        ))}
      </ul>
      <h2>More places in the simulator</h2>
      <p>These are also in the built-in search, with 3D buildings wherever OpenStreetMap has them:</p>
      <ul>
        {others.map((d) => (
          <li key={d.id}>
            <Link href={`/explore?dest=${d.id}`}>{d.name}</Link>, {d.country}
          </li>
        ))}
      </ul>
      <p>Anything else? Use the search panel&apos;s worldwide search (Shift + Enter) to find almost any named place.</p>
    </ContentPage>
  );
}
