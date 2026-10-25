"use client";

import { useEffect, useRef } from "react";
import { useFlightStore } from "@/stores/flight-store";
import { telemetry } from "@/stores/telemetry";
import { MODES } from "@/engine/physics";
import { cardinal, fmtAlt, fmtDist, fmtLat, fmtLon, fmtSpeed } from "@/lib/format";
import { getSimulator } from "@/lib/sim-bridge";
import { useTelemetry } from "./useTelemetry";
import { Compass } from "./Compass";
import { DestinationIndicator } from "./DestinationIndicator";
import { SatLabels } from "./SatLabels";
import { ControlsGuide } from "../controls/ControlsGuide";

const modeColor = { space: "#a78bfa", atmosphere: "#22d3ee", city: "#34d399" } as const;

export function Hud() {
  const paused = useFlightStore((s) => s.paused);
  const panel = useFlightStore((s) => s.panel);
  const activeMode = useFlightStore((s) => s.activeMode);
  const modeSelection = useFlightStore((s) => s.modeSelection);
  const assist = useFlightStore((s) => s.assist);
  const cameraMode = useFlightStore((s) => s.cameraMode);
  const speedScale = useFlightStore((s) => s.speedScale);
  const muted = useFlightStore((s) => s.muted);
  const showControls = useFlightStore((s) => s.showControls);
  const set = useFlightStore((s) => s.set);
  const travelling = useFlightStore((s) => s.travelling);

  const r = useTelemetry((t) => {
    const sp = fmtSpeed(t.speed);
    const alt = fmtAlt(t.alt);
    const agl = fmtAlt(t.agl);
    return {
      speed: sp.value, speedUnit: sp.unit, alt: alt.value, altUnit: alt.unit, agl: agl.value, aglUnit: agl.unit,
      lat: fmtLat(t.lat), lon: fmtLon(t.lon), hdg: Math.round(t.heading), region: t.region,
      vs: Math.round(t.vSpeed), cap: fmtSpeed(t.cap).value + " " + fmtSpeed(t.cap).unit, fps: Math.round(t.fps),
      groundKnown: t.groundKnown, terrain: t.terrain, blds: t.buildings, bLoad: t.buildingsLoading,
      thrust: Math.round(t.thrust * 100),
    };
  });

  const sim = () => getSimulator();
  const mcolor = modeColor[activeMode];

  // the controls cheat-sheet fades away by itself after a while (H brings it back)
  useEffect(() => {
    if (!showControls) return;
    const t = window.setTimeout(() => useFlightStore.getState().set({ showControls: false }), 25000);
    return () => window.clearTimeout(t);
  }, [showControls]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none font-mono">
      {/* top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="hud-panel pointer-events-auto flex items-center gap-3 px-3 py-2">
          <span className="text-[13px] font-bold tracking-[0.35em] text-cyan-200">EARTHFLIGHT</span>
          <span className="hud-label hidden sm:inline">{r.fps} FPS</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <Compass />
          <div className="flex items-center gap-2">
            <span className="hud-label" style={{ color: mcolor }}>
              {MODES[activeMode].label}
              {modeSelection !== "auto" ? " · LOCKED" : " · AUTO"}
            </span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button className="hud-btn" onClick={() => sim()?.openPanel("destinations")} title="Destinations (G)">
            Destinations <span className="ml-1 opacity-60">G</span>
          </button>
          <button className="hud-btn" onClick={() => sim()?.openPanel("layers")} title="Live globe layers (L)">
            Layers <span className="ml-1 opacity-60">L</span>
          </button>
          <button className="hud-btn" onClick={() => set({ muted: !muted })} title="Mute (M)">
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button className="hud-btn" onClick={() => set({ paused: true })} title="Pause (Esc)">
            Pause
          </button>
        </div>
      </div>

      {/* crosshair */}
      <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80" width="64" height="64" viewBox="-32 -32 64 64" aria-hidden>
        <circle r="13" fill="none" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="1" />
        <circle r="1.6" fill="#a5f3fc" />
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1="0" y1="-20" x2="0" y2="-28" stroke="#22d3ee" strokeOpacity="0.7" strokeWidth="1" transform={`rotate(${a})`} />
        ))}
      </svg>

      <DestinationIndicator />
      <SatLabels />

      {/* bottom-left: flight data */}
      <div className="absolute bottom-7 left-3 sm:left-4">
        <div className="hud-panel pointer-events-none min-w-[250px] px-4 py-3">
          <div className="hud-label">Speed</div>
          <div className="flex items-baseline gap-2">
            <span className="hud-value text-3xl font-semibold">{r.speed}</span>
            <span className="hud-label">{r.speedUnit}</span>
          </div>
          <div className="mt-1 h-px w-full bg-gradient-to-r from-cyan-400/60 to-transparent" />
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <div className="hud-label">Altitude</div>
              <div className="hud-value text-lg">
                {r.alt} <span className="hud-label">{r.altUnit}</span>
              </div>
            </div>
            <div>
              <div className="hud-label">Above ground</div>
              <div className="hud-value text-lg">
                {r.agl} <span className="hud-label">{r.aglUnit}</span>
              </div>
            </div>
            <div>
              <div className="hud-label">Vertical</div>
              <div className="hud-value text-sm">{r.vs > 0 ? "+" : ""}{r.vs} m/s</div>
            </div>
            <div>
              <div className="hud-label">Speed limit</div>
              <div className="hud-value text-sm">{r.cap}</div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="hud-label">Thrust</span>
            <div className="h-1.5 flex-1 bg-cyan-900/40">
              <div className="h-full bg-cyan-300/90" style={{ width: `${r.thrust}%`, transition: "width 120ms linear" }} />
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="hud-label">Limiter</span>
            <div className="h-1.5 flex-1 bg-cyan-900/40">
              <div className="h-full bg-violet-300/80" style={{ width: `${Math.round(speedScale * 100)}%` }} />
            </div>
            <span className="hud-label">{Math.round(speedScale * 100)}%</span>
          </div>
        </div>
      </div>

      {/* bottom-right: position */}
      <div className="absolute bottom-7 right-3 sm:right-4">
        <div className="hud-panel pointer-events-none min-w-[250px] px-4 py-3 text-right">
          <div className="hud-label">Position</div>
          <div className="hud-value text-base">{r.lat}</div>
          <div className="hud-value text-base">{r.lon}</div>
          <div className="mt-1 h-px w-full bg-gradient-to-l from-cyan-400/60 to-transparent" />
          <div className="mt-2 hud-label">Heading</div>
          <div className="hud-value text-lg">
            {String(r.hdg).padStart(3, "0")}° <span className="hud-label">{cardinal(r.hdg)}</span>
          </div>
          <div className="mt-1 hud-label">Region</div>
          <div className="hud-value min-h-[1.25rem] text-[13px] text-cyan-100">{r.region || "—"}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-x-3 gap-y-1">
            <span className="hud-label">{assist === "arcade" ? "Arcade" : "Realistic"}</span>
            <span className="hud-label">
              {cameraMode === "chase" ? "Chase cam" : cameraMode === "cockpit" ? "Cockpit" : "Free cam"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap justify-end gap-x-3 gap-y-1">
            <span className="hud-label">{r.groundKnown ? "Terrain: locked" : "Terrain: loading"}</span>
            {r.blds > 0 && <span className="hud-label">{r.blds.toLocaleString("en-US")} bldgs</span>}
            {r.bLoad > 0 && <span className="hud-label text-amber-300/80">streaming</span>}
          </div>
        </div>
      </div>

      {/* bottom center: travel progress */}
      {travelling && <TravelBar />}

      {/* controls guide */}
      {showControls && !paused && panel === "none" && (
        <div className="pointer-events-auto absolute left-3 top-16 max-h-[calc(100dvh-7rem)] origin-top-left overflow-y-auto sm:left-4 [@media(max-height:640px)]:scale-[0.8]">
          <ControlsGuide compact onClose={() => set({ showControls: false })} />
        </div>
      )}

      <Toasts />
      <AlertFlash />
    </div>
  );
}

function TravelBar() {
  const t = useTelemetry((t) => ({ name: t.travel.name, p: Math.round(t.travel.progress * 100), rem: fmtDist(t.travel.remaining), phase: t.travel.phase }), 120);
  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 w-[min(520px,88vw)] -translate-x-1/2">
      <div className="hud-panel px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="hud-label">{t.phase === "orient" ? "Aligning with course" : "Cinematic travel"}</span>
          <span className="hud-label text-cyan-100">→ {t.name}</span>
        </div>
        <div className="mt-2 h-1.5 w-full bg-cyan-900/40">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-200" style={{ width: `${t.p}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="hud-value text-xs">{t.rem} remaining</span>
          <button className="hud-btn !py-1" onClick={() => getSimulator()?.cancelTravel()}>
            Cancel · any thrust key
          </button>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useFlightStore((s) => s.toasts);
  return (
    <div className="absolute bottom-44 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fade-up hud-panel max-w-[80vw] px-3 py-1.5 text-[12px] ${t.tone === "warn" ? "!border-amber-400/60 text-amber-200" : "text-cyan-100"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function AlertFlash() {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      const el = ref.current;
      if (!el || telemetry.alertSeq === seq.current) return;
      seq.current = telemetry.alertSeq;
      el.textContent = `⚠ ${telemetry.alertText}`;
      el.classList.remove("alert-flash");
      void el.offsetWidth;
      el.classList.add("alert-flash");
    }, 60);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      ref={ref}
      className="absolute left-1/2 top-24 -translate-x-1/2 border border-amber-400/70 bg-amber-950/60 px-4 py-1.5 text-[12px] tracking-[0.25em] text-amber-200 opacity-0"
    />
  );
}
