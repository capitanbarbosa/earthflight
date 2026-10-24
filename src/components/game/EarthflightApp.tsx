"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useFlightStore } from "@/stores/flight-store";
import { IntroOverlay } from "@/components/controls/IntroOverlay";
import { PauseMenu } from "@/components/controls/PauseMenu";
import { DestinationPanel } from "@/components/destinations/DestinationPanel";
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
  const flying = phase === "flying";

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
      {flying && <Hud />}
      {flying && paused && panel === "none" && <PauseMenu />}
      {flying && panel === "destinations" && <DestinationPanel />}
    </div>
  );
}
