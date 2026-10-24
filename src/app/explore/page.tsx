import type { Metadata } from "next";
import EarthflightApp from "@/components/game/EarthflightApp";

// The full-screen app has no text content of its own; the indexable version lives at "/".
export const metadata: Metadata = {
  title: "Fly",
  robots: { index: false, follow: true },
  alternates: { canonical: "/" },
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ dest?: string | string[] }> }) {
  const { dest } = await searchParams;
  return <EarthflightApp variant="explore" initialDestination={Array.isArray(dest) ? dest[0] : dest} />;
}
