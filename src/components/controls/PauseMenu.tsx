"use client";

import { useState } from "react";
import { useFlightStore, type Quality } from "@/stores/flight-store";
import { getSimulator } from "@/lib/sim-bridge";
import { ControlsGuide } from "./ControlsGuide";

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="hud-label">{label}</span>
      <div className="flex">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`border border-cyan-400/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors first:border-r-0 last:border-l-0 [&:not(:first-child):not(:last-child)]:border-x-0 ${value === v ? "bg-cyan-400/25 text-white" : "text-cyan-200/70 hover:bg-cyan-400/10"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Range({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="hud-label">{label}</span>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-36 accent-cyan-300" aria-label={label} />
        <span className="hud-value w-10 text-right text-[11px]">{fmt(value)}</span>
      </div>
    </div>
  );
}

/** Pause overlay: resume, settings (quality / flight / audio), controls guide. */
export function PauseMenu() {
  const s = useFlightStore();
  const [tab, setTab] = useState<"menu" | "controls">("menu");
  const sim = () => getSimulator();

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="hud-panel-solid fade-up max-h-[92vh] w-[min(760px,96vw)] overflow-y-auto font-mono">
        <div className="flex items-center justify-between border-b border-cyan-400/20 px-5 py-3">
          <span className="text-sm font-bold tracking-[0.35em] text-cyan-200">PAUSED</span>
          <div className="flex gap-2">
            <button className={`hud-btn !py-1 ${tab === "menu" ? "!bg-cyan-400/20" : ""}`} onClick={() => setTab("menu")}>Settings</button>
            <button className={`hud-btn !py-1 ${tab === "controls" ? "!bg-cyan-400/20" : ""}`} onClick={() => setTab("controls")}>Controls</button>
          </div>
        </div>

        {tab === "controls" ? (
          <div className="p-4">
            <ControlsGuide />
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-1 p-5 sm:grid-cols-2">
            <div>
              <div className="hud-label mb-1 text-cyan-300">Graphics</div>
              <Seg<Quality> label="Quality" value={s.quality} onChange={(quality) => s.set({ quality })} options={[["low", "Low"], ["medium", "Med"], ["high", "High"]]} />
              <Seg label="Adaptive" value={s.adaptiveQuality ? "on" : "off"} onChange={(v) => s.set({ adaptiveQuality: v === "on" })} options={[["on", "On"], ["off", "Off"]]} />
              <Seg label="Effects" value={s.effects ? "on" : "off"} onChange={(v) => s.set({ effects: v === "on" })} options={[["on", "On"], ["off", "Off"]]} />
              <Seg label="Sun" value={s.sunMode} onChange={(sunMode) => s.set({ sunMode })} options={[["day", "Daylight"], ["live", "Live"], ["night", "Night"]]} />
              <Seg label="Satellites" value={s.satellites ? "on" : "off"} onChange={(v) => s.set({ satellites: v === "on" })} options={[["on", "On"], ["off", "Off"]]} />
              <p className="mt-1 text-[10px] leading-relaxed text-cyan-200/45">
                Adaptive lowers render resolution if the frame rate drops. High enables MSAA, bloom, motion blur and shadows near the ground. Satellites are real objects (CelesTrak orbit data) shown near the ship in space; their size on screen is exaggerated.
              </p>
            </div>
            <div>
              <div className="hud-label mb-1 text-cyan-300">Flight</div>
              <Seg label="Model" value={s.assist} onChange={(assist) => s.set({ assist })} options={[["arcade", "Arcade"], ["realistic", "Realistic"]]} />
              <Seg label="Mode" value={s.modeSelection} onChange={(modeSelection) => s.set({ modeSelection })} options={[["auto", "Auto"], ["space", "Space"], ["atmosphere", "Atmos"], ["city", "City"]]} />
              <Seg label="Camera" value={s.cameraMode} onChange={(cameraMode) => s.set({ cameraMode })} options={[["chase", "Chase"], ["cockpit", "Cockpit"], ["free", "Free"]]} />
              <Range label="Speed limit" value={s.speedScale} min={0.02} max={1} step={0.01} onChange={(speedScale) => s.set({ speedScale })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Range label="Mouse" value={s.sensitivity} min={0.25} max={3} step={0.05} onChange={(sensitivity) => s.set({ sensitivity })} fmt={(v) => `${v.toFixed(1)}×`} />
              <Seg label="Invert Y" value={s.invertY ? "on" : "off"} onChange={(v) => s.set({ invertY: v === "on" })} options={[["off", "Off"], ["on", "On"]]} />
            </div>
            <div className="sm:col-span-2">
              <div className="hud-label mb-1 mt-2 text-cyan-300">Audio</div>
              <div className="grid gap-x-8 sm:grid-cols-2">
                <Seg label="Sound" value={s.muted ? "off" : "on"} onChange={(v) => s.set({ muted: v === "off" })} options={[["on", "On"], ["off", "Muted"]]} />
                <Range label="Volume" value={s.volume} min={0} max={1} step={0.05} onChange={(volume) => s.set({ volume })} fmt={(v) => `${Math.round(v * 100)}%`} />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cyan-400/20 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button className="hud-btn" onClick={() => sim()?.resetOrientation()}>Reset orientation</button>
            <button className="hud-btn" onClick={() => sim()?.resetPosition()}>Return to orbit</button>
            <button className="hud-btn" onClick={() => sim()?.openPanel("destinations")}>Destinations</button>
          </div>
          <button className="start-btn !px-8 !py-2.5 !text-xs !tracking-[0.3em]" onClick={() => sim()?.resume()}>
            RESUME
          </button>
        </div>
      </div>
    </div>
  );
}
