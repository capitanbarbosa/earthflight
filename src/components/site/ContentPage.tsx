import Link from "next/link";
import { SITE_NAME } from "@/lib/config";
import { AdSlot } from "./AdSlot";

export function SiteHeader() {
  return (
    <header className="border-b border-cyan-400/15 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <Link href="/" className="font-mono text-sm font-bold tracking-[0.35em] text-cyan-200">
          {SITE_NAME}
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan-100/70">
          <Link className="hover:text-white" href="/how-to-play">How to play</Link>
          <Link className="hover:text-white" href="/controls">Controls</Link>
          <Link className="hover:text-white" href="/destinations">Destinations</Link>
          <Link className="hover:text-white" href="/3d-flight-simulator">Simulator</Link>
          <Link className="hud-btn !py-1" href="/explore">Launch</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-cyan-400/15 bg-black/50">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 text-sm text-cyan-100/65 sm:grid-cols-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.3em] text-cyan-200">{SITE_NAME}</p>
          <p className="mt-2 leading-relaxed">A free browser-based 3D Earth flight simulator. No download, no Google Maps.</p>
        </div>
        <ul className="space-y-1.5">
          <li><Link className="hover:text-white" href="/browser-earth-exploration">Browser-based Earth exploration</Link></li>
          <li><Link className="hover:text-white" href="/3d-flight-simulator">3D flight simulator</Link></li>
          <li><Link className="hover:text-white" href="/destinations">Popular destinations</Link></li>
          <li><Link className="hover:text-white" href="/how-to-play">How to play</Link></li>
        </ul>
        <ul className="space-y-1.5">
          <li><Link className="hover:text-white" href="/privacy">Privacy policy</Link></li>
          <li><Link className="hover:text-white" href="/terms">Terms of service</Link></li>
          <li className="pt-2 text-[11px] leading-relaxed text-cyan-100/45">
            Imagery: NASA GIBS, Sentinel-2 cloudless by EOX (CC BY 4.0). Map data © OpenStreetMap contributors. Terrain: Re:Earth global terrain (CC BY 4.0). Globe: CesiumJS.
          </li>
        </ul>
      </div>
    </footer>
  );
}

/** Standard layout for indexable content pages: header, prose, CTA, ad, footer. */
export function ContentPage({ children, cta = true }: { children: React.ReactNode; cta?: boolean }) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#06223a_0%,#02060c_55%)]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <article className="prose-site">{children}</article>
        {cta && (
          <div className="mt-10 border border-cyan-400/30 bg-cyan-400/5 p-6 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200">Ready for take-off?</p>
            <p className="mt-2 text-cyan-100/80">Launch the simulator and fly from orbit to the street in under a minute.</p>
            <Link href="/explore" className="start-btn mt-4 inline-block text-sm">START EXPLORING</Link>
          </div>
        )}
        <AdSlot />
      </main>
      <SiteFooter />
    </div>
  );
}
