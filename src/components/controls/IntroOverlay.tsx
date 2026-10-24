"use client";

import { useFlightStore } from "@/stores/flight-store";
import { getSimulator } from "@/lib/sim-bridge";

/** Opening cinematic overlay: title, tagline and the START EXPLORING button. */
export function IntroOverlay({ headline }: { headline?: boolean }) {
  const phase = useFlightStore((s) => s.phase);
  const ready = useFlightStore((s) => s.ready);
  const error = useFlightStore((s) => s.error);
  const fading = phase === "flying";
  if (fading) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between p-6 text-center">
      <div className="fade-up mt-[7vh]">
        {headline ? (
          <h1 className="font-mono text-[clamp(1.6rem,6vw,3.75rem)] font-bold tracking-[0.35em] text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.55)]">EARTHFLIGHT</h1>
        ) : (
          <p className="font-mono text-[clamp(1.6rem,6vw,3.75rem)] font-bold tracking-[0.35em] text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.55)]">EARTHFLIGHT</p>
        )}
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.45em] text-cyan-200/80 sm:text-sm">Pilot a spaceship from orbit into the city</p>
      </div>

      <div className="fade-up mb-[9vh] flex flex-col items-center gap-4" style={{ animationDelay: "0.3s" }}>
        {error ? (
          <div className="hud-panel pointer-events-auto max-w-md px-5 py-4 text-sm text-amber-200">{error}</div>
        ) : (
          <>
            <button
              className="start-btn pointer-events-auto text-sm sm:text-base"
              disabled={!ready}
              onClick={() => void getSimulator()?.start()}
              aria-label="Start exploring"
            >
              {ready ? "START EXPLORING" : "CALIBRATING ORBIT…"}
            </button>
            <p className="font-mono text-[11px] tracking-[0.2em] text-cyan-100/60">
              {ready ? "WASD + mouse · desktop browser recommended · sound starts on click" : "Streaming Earth imagery and terrain"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
