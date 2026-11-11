"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect } from "react";
import { useFlightStore } from "@/stores/flight-store";
import { IntroOverlay } from "@/components/controls/IntroOverlay";
import { PauseMenu } from "@/components/controls/PauseMenu";
import { TouchControls } from "@/components/controls/TouchControls";
import { detectDevice } from "@/lib/device";
import { DestinationPanel } from "@/components/destinations/DestinationPanel";
import { LayersPanel } from "@/components/layers/LayersPanel";
import { Hud } from "@/components/hud/Hud";
import { FxLayer } from "@/components/hud/FxLayer";
import { getDestination } from "@/lib/geospatial/destinations";
import { getSimulator } from "@/lib/sim-bridge";

// Lazy-load the 3D scene: Cesium + Three never ship in the initial JS of content pages.
const GlobeScene = dynamic(() => import("@/components/globe/GlobeScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-black" />,
});

/**
 * The whole simulator: globe + intro cinematic + HUD + menus.
 * `variant="home"` is one viewport tall inside a scrollable page; once flight starts it becomes a
 * fixed full-screen app and the surrounding page content is hidden (see .flying in globals.css).
 */
export default function EarthflightApp({ variant = "explore", initialDestination }: { variant?: "home" | "explore"; initialDestination?: string }) {
  const phase = useFlightStore((s) => s.phase);
  const paused = useFlightStore((s) => s.paused);
  const panel = useFlightStore((s) => s.panel);
  const touchFlight = useFlightStore((s) => s.inputMode === "touch");
  const flying = phase === "flying";

  useEffect(() => {
    const apply = () => {
      const profile = detectDevice();
      const prev = useFlightStore.getState();
      useFlightStore.getState().set({
        deviceReady: true,
        deviceKind: profile.kind,
        formFactor: profile.formFactor,
        inputMode: profile.touchFlight ? "touch" : "keyboard",
        showControls: profile.touchFlight && prev.inputMode !== "touch" ? false : prev.showControls,
      });
      const root = document.documentElement;
      root.classList.toggle("touch-flight", profile.touchFlight);
      root.classList.toggle("form-phone", profile.formFactor === "phone");
      root.classList.toggle("form-tablet", profile.formFactor === "tablet");
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    const coarse = window.matchMedia("(pointer: coarse)");
    const narrow = window.matchMedia("(max-width: 700px)");
    coarse.addEventListener?.("change", apply);
    narrow.addEventListener?.("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      coarse.removeEventListener?.("change", apply);
      narrow.removeEventListener?.("change", apply);
      document.documentElement.classList.remove("touch-flight", "form-phone", "form-tablet");
    };
  }, []);

  useEffect(() => {
    if (!flying) return;
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", block);
    document.addEventListener("gesturechange", block);
    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
    };
  }, [flying]);

  // /explore?dest=tokyo → after START, cinematically fly there once the intro has settled.
  useEffect(() => {
    if (!flying || !initialDestination) return;
    const d = getDestination(initialDestination);
    if (!d) return;
    const t = window.setTimeout(() => getSimulator()?.travelTo({ id: d.id, name: d.name, lat: d.lat, lon: d.lon }), 2500);
    return () => window.clearTimeout(t);
  }, [flying, initialDestination]);

  useEffect(() => {
    document.documentElement.classList.toggle("flying", flying);
    if (flying) window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("flying");
  }, [flying]);

  return (
    <div className={flying || variant === "explore" ? "fixed inset-0 z-50 bg-black" : "relative h-dvh w-full bg-black"}>
      <GlobeScene />
      <FxLayer />
      {phase !== "flying" && <IntroOverlay headline={variant === "home"} />}
      {phase !== "flying" && variant === "home" && (
        <nav aria-label="Main" className="absolute inset-x-0 top-0 z-30 flex items-center justify-end gap-2 p-3 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-100/80 sm:gap-4 sm:p-4">
          <Link href="/how-to-play" className="hidden px-2 py-1 hover:text-white sm:inline">How to play</Link>
          <Link href="/destinations" className="hidden px-2 py-1 hover:text-white sm:inline">Destinations</Link>
          <Link href="/explore" className="hud-btn !py-1.5">Explore</Link>
        </nav>
      )}
      {flying && <Hud />}
      {flying && touchFlight && !paused && panel === "none" && <TouchControls />}
      {flying && paused && panel === "none" && <PauseMenu />}
      {flying && panel === "destinations" && <DestinationPanel />}
      {flying && panel === "layers" && <LayersPanel />}
    </div>
  );
}
