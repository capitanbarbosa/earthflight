"use client";

import { useEffect, useRef } from "react";
import { useFlightStore } from "@/stores/flight-store";
import { telemetry } from "@/stores/telemetry";
import { fmtDist } from "@/lib/format";

/**
 * Screen-space destination marker (diamond + label) when the target is in view, otherwise an
 * edge arrow pointing the way.  Positioned from rAF; no React state per frame.
 */
export function DestinationIndicator() {
  const dest = useFlightStore((s) => s.destination);
  const marker = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const dist = useRef<HTMLSpanElement>(null);
  const arrowDist = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!dest) return;
    let raf = 0;
    const loop = () => {
      const D = telemetry.dest;
      const m = marker.current, a = arrow.current;
      const near = D.distance < 120;
      if (m && a) {
        if (D.active && D.onScreen && !near) {
          m.style.display = "flex";
          m.style.transform = `translate(${D.x}px, ${D.y}px) translate(-50%, -100%)`;
          a.style.display = "none";
          if (label.current) label.current.textContent = D.name;
          if (dist.current) dist.current.textContent = fmtDist(D.distance);
        } else if (D.active && !near) {
          m.style.display = "none";
          a.style.display = "flex";
          // chevron on a ring around the screen centre pointing toward the target bearing (relative to heading)
          const ang = (D.relBearing * Math.PI) / 180;
          const R = Math.min(window.innerWidth, window.innerHeight) * 0.34;
          const x = Math.sin(ang) * R, y = -Math.cos(ang) * R;
          a.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
          const chev = a.firstElementChild as HTMLElement | null;
          if (chev) chev.style.transform = `rotate(${D.relBearing}deg)`;
          if (arrowDist.current) arrowDist.current.textContent = `${D.name} · ${fmtDist(D.distance)}`;
        } else {
          m.style.display = "none";
          a.style.display = "none";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dest]);

  if (!dest) return null;
  return (
    <>
      <div ref={marker} className="absolute left-0 top-0 hidden flex-col items-center will-change-transform" style={{ display: "none" }}>
        <div className="hud-panel mb-1 px-2 py-1 text-center">
          <span ref={label} className="hud-value block text-[11px] tracking-widest" />
          <span ref={dist} className="hud-label block !text-[10px]" />
        </div>
        <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden>
          <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="none" stroke="#5eead4" strokeWidth="1.6" />
          <rect x="-2.5" y="-2.5" width="5" height="5" transform="rotate(45)" fill="#5eead4" />
        </svg>
        <div className="h-8 w-px bg-gradient-to-b from-cyan-300/80 to-transparent" />
      </div>
      <div ref={arrow} className="absolute left-1/2 top-1/2 hidden flex-col items-center will-change-transform" style={{ display: "none", marginLeft: 0 }}>
        <svg width="34" height="34" viewBox="-17 -17 34 34" style={{ transformOrigin: "center" }} aria-hidden>
          <path d="M0 -12 L9 8 L0 3 L-9 8 Z" fill="#5eead4" fillOpacity="0.85" stroke="#031018" strokeWidth="1" />
        </svg>
        <span ref={arrowDist} className="hud-label mt-1 whitespace-nowrap !text-[10px]" />
      </div>
    </>
  );
}
