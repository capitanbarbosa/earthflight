"use client";

import { useEffect, useMemo, useRef } from "react";
import { telemetry } from "@/stores/telemetry";

const PX_PER_DEG = 3.2;

/** Heading tape. Updated from requestAnimationFrame straight into the DOM (no React renders). */
export function Compass() {
  const strip = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);

  const marks = useMemo(() => {
    const out: Array<{ deg: number; label: string; major: boolean }> = [];
    for (let d = -360; d <= 720; d += 5) {
      const n = ((d % 360) + 360) % 360;
      const names: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W", 45: "NE", 135: "SE", 225: "SW", 315: "NW" };
      out.push({ deg: d, label: names[n] ?? (n % 10 === 0 ? String(n).padStart(3, "0") : ""), major: n % 45 === 0 });
    }
    return out;
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const h = telemetry.heading;
      if (strip.current) strip.current.style.transform = `translateX(${-(h + 360) * PX_PER_DEG}px)`;
      if (num.current) num.current.textContent = String(Math.round(h) % 360).padStart(3, "0");
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative flex flex-col items-center">
      <span className="hud-value text-sm" ref={num}>
        000
      </span>
      <div className="mt-0.5 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-cyan-300" />
      <div
        className="relative h-9 w-[min(420px,44vw)] overflow-hidden"
        style={{ maskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)" }}
      >
        <div ref={strip} className="absolute left-1/2 top-0 h-full will-change-transform" style={{ width: 0 }}>
          {marks.map((m) => (
            <div
              key={m.deg}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: (m.deg + 360) * PX_PER_DEG }}
            >
              <div className={`w-px ${m.major ? "h-3.5 bg-cyan-200" : "h-2 bg-cyan-400/60"}`} />
              <span className={`mt-0.5 text-[10px] leading-none ${["N", "E", "S", "W"].includes(m.label) ? "font-bold text-cyan-200" : "text-cyan-400/80"}`}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
