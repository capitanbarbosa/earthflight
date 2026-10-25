"use client";

import { useEffect, useRef } from "react";
import { SAT_LABEL_MAX, telemetry } from "@/stores/telemetry";

const kindColor: Record<string, string> = {
  station: "#ffe9a8",
  sat: "#9fd2ff",
  gps: "#b8ffcf",
  starlink: "#dbe6ff",
};

function fmtKm(km: number) {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-US")} km`;
}

/**
 * Name tags for the satellites nearest to the ship while in space, plus a small attribution/status line.
 * Positions come from the Three.js satellite pass via the mutable telemetry object; the DOM is updated
 * directly each frame so nothing re-renders.
 */
export function SatLabels() {
  const els = useRef<Array<HTMLDivElement | null>>([]);
  const status = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastText = "";
    const tick = () => {
      const S = telemetry.sats;
      for (let i = 0; i < SAT_LABEL_MAX; i++) {
        const el = els.current[i];
        if (!el) continue;
        if (i < S.count) {
          const L = S.items[i];
          el.style.display = "block";
          // keep the tag on screen: flip to the left of the marker near the right edge
          const w = el.parentElement?.clientWidth ?? 1024;
          const flip = L.x > w - 240;
          el.style.transform = flip
            ? `translate(${Math.round(L.x - 14)}px, ${Math.round(L.y - 10)}px) translateX(-100%)`
            : `translate(${Math.round(L.x + 14)}px, ${Math.round(L.y - 10)}px)`;
          const text = `${L.name} · ${fmtKm(L.km)}`;
          if (el.dataset.t !== text) {
            el.dataset.t = text;
            el.textContent = text;
          }
          el.style.color = kindColor[L.kind] ?? "#cfe";
        } else if (el.style.display !== "none") {
          el.style.display = "none";
        }
      }
      const st = status.current;
      if (st) {
        const show = S.count > 0 || S.visible > 0;
        const text = show ? `ORBITAL TRAFFIC · ${S.visible.toLocaleString("en-US")} OF ${S.total.toLocaleString("en-US")} IN VIEW · DATA CELESTRAK` : "";
        if (text !== lastText) {
          lastText = text;
          st.textContent = text;
          st.style.opacity = show ? "1" : "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: SAT_LABEL_MAX }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            els.current[i] = el;
          }}
          className="absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ display: "none", textShadow: "0 0 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)" }}
        />
      ))}
      <div
        ref={status}
        className="absolute left-1/2 top-[5.6rem] -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-200/55 transition-opacity"
        style={{ opacity: 0 }}
      />
    </div>
  );
}
