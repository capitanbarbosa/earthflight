"use client";

import { useEffect, useState } from "react";
import { config } from "@/lib/config";
import { useFlightStore } from "@/stores/flight-store";

export const CONSENT_KEY = "ef-ad-consent";

/**
 * Minimal consent notice. It only appears when AdSense is configured, only on content pages
 * (never over the flight viewport), and gates the ads script until the visitor accepts.
 * For EEA/UK/CH traffic you must use a Google-certified CMP (IAB TCF v2.2) — see docs/DEPLOYMENT.md.
 */
export function ConsentBanner() {
  const [state, setState] = useState<"unknown" | "granted" | "denied" | "hidden">("hidden");
  const phase = useFlightStore((s) => s.phase);

  useEffect(() => {
    if (!config.adsenseClient) return;
    const v = localStorage.getItem(CONSENT_KEY);
    setState(v === "granted" || v === "denied" ? v : "unknown");
  }, []);

  if (state !== "unknown" || phase === "flying") return null;
  const choose = (v: "granted" | "denied") => {
    localStorage.setItem(CONSENT_KEY, v);
    window.dispatchEvent(new Event("ef-consent"));
    setState(v);
  };
  return (
    <div role="dialog" aria-label="Cookie and advertising consent" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl border border-cyan-400/40 bg-black/90 p-4 text-sm text-cyan-50 shadow-2xl backdrop-blur">
      <p className="leading-relaxed text-cyan-100/90">
        We show ads on our information pages (never over the flight view) to keep EARTHFLIGHT free. Advertising partners may use cookies. See our{" "}
        <a className="underline" href="/privacy">privacy policy</a>.
      </p>
      <div className="mt-3 flex gap-2">
        <button className="hud-btn" onClick={() => choose("granted")}>Accept ads</button>
        <button className="hud-btn" onClick={() => choose("denied")}>No ads</button>
      </div>
    </div>
  );
}
