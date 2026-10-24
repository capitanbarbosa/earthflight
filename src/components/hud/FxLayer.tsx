"use client";

import { useEffect, useRef } from "react";
import { useFlightStore } from "@/stores/flight-store";
import { telemetry } from "@/stores/telemetry";

interface Streak {
  a: number; // angle
  r: number; // radial position 0..1
  v: number; // speed multiplier
  l: number; // length
}

/**
 * Screen-space effects driven by telemetry:
 *  - speed lines (radial streaks) at high relative velocity
 *  - atmospheric entry heat glow
 *  - sun glare / lens flare
 *  - cockpit canopy frame (first-person camera)
 * One canvas + a few divs, one rAF loop, zero React state.
 */
export function FxLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const heat = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);
  const flare = useRef<HTMLDivElement>(null);
  const effects = useFlightStore((s) => s.effects);
  const quality = useFlightStore((s) => s.quality);
  const cameraMode = useFlightStore((s) => s.cameraMode);
  const phase = useFlightStore((s) => s.phase);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const count = quality === "low" ? 50 : quality === "medium" ? 90 : 140;
    const streaks: Streak[] = Array.from({ length: count }, () => ({
      a: Math.random() * Math.PI * 2, r: Math.random(), v: 0.5 + Math.random(), l: 0.05 + Math.random() * 0.2,
    }));
    let raf = 0, last = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.floor(c.clientWidth * dpr);
      c.height = Math.floor(c.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const T = telemetry;
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      const fx = effects ? T.fx.speed : 0;
      if (fx > 0.02) {
        const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy);
        ctx.lineCap = "round";
        for (const s of streaks) {
          s.r += dt * (0.35 + 1.9 * fx) * s.v;
          if (s.r > 1) {
            s.r = 0.12 + Math.random() * 0.1;
            s.a = Math.random() * Math.PI * 2;
            s.l = 0.05 + Math.random() * 0.2;
          }
          const r0 = s.r * maxR;
          const r1 = Math.min(maxR, r0 + s.l * maxR * (0.4 + fx * 1.6) * (0.3 + s.r));
          const alpha = Math.min(1, s.r * 1.5) * fx * 0.75;
          ctx.strokeStyle = `rgba(190,240,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = (0.6 + s.r * 1.8) * (W / 1600 + 0.5);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
          ctx.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
          ctx.stroke();
        }
      }
      // atmospheric entry heat
      const h = effects ? T.fx.heat : 0;
      if (heat.current) {
        const flick = 0.85 + 0.15 * Math.sin(now * 0.04) * Math.sin(now * 0.013);
        heat.current.style.opacity = String(Math.min(1, h * 0.95 * flick));
      }
      // sun glare
      const S = T.sun;
      if (glare.current && flare.current) {
        const i = effects ? S.intensity : 0;
        glare.current.style.opacity = String(Math.min(1, i));
        glare.current.style.transform = `translate(${S.x}px, ${S.y}px) translate(-50%, -50%)`;
        // ghost flare mirrored through the screen centre
        const mx = window.innerWidth - S.x, my = window.innerHeight - S.y;
        flare.current.style.opacity = String(Math.min(0.55, i * 0.55));
        flare.current.style.transform = `translate(${(S.x + mx) / 2 + (mx - S.x) * 0.25}px, ${(S.y + my) / 2 + (my - S.y) * 0.25}px) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [effects, quality]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div
        ref={heat}
        className="absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 55%, rgba(255,120,40,0) 30%, rgba(255,110,30,0.25) 60%, rgba(255,60,10,0.55) 100%), radial-gradient(ellipse at 50% 100%, rgba(255,200,120,0.55), transparent 55%)",
          mixBlendMode: "screen",
        }}
      />
      <div
        ref={glare}
        className="absolute left-0 top-0 h-[560px] w-[560px] opacity-0 will-change-transform"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,245,0.95) 0%, rgba(255,238,200,0.55) 6%, rgba(255,210,150,0.18) 22%, rgba(255,200,120,0) 62%)",
          mixBlendMode: "screen",
        }}
      />
      <div
        ref={flare}
        className="absolute left-0 top-0 h-40 w-40 rounded-full opacity-0 will-change-transform"
        style={{
          background: "radial-gradient(circle, rgba(120,200,255,0.0) 40%, rgba(120,200,255,0.22) 62%, rgba(120,200,255,0) 72%)",
          mixBlendMode: "screen",
        }}
      />
      {phase === "flying" && cameraMode === "cockpit" && <CockpitFrame />}
    </div>
  );
}

function CockpitFrame() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1622" stopOpacity="0.96" />
          <stop offset="1" stopColor="#02060c" stopOpacity="0.98" />
        </linearGradient>
        <radialGradient id="vig" cx="50%" cy="50%" r="75%">
          <stop offset="0.62" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#vig)" />
      {/* lower dash */}
      <path d="M0 600 L0 520 Q250 470 500 480 Q750 470 1000 520 L1000 600 Z" fill="url(#cf)" stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M120 600 Q500 520 880 600" fill="none" stroke="#22d3ee" strokeOpacity="0.25" strokeWidth="1" />
      {/* canopy struts */}
      <path d="M0 0 L0 520 L38 505 L170 0 Z" fill="url(#cf)" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M1000 0 L1000 520 L962 505 L830 0 Z" fill="url(#cf)" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M0 0 H1000 V26 Q500 52 0 26 Z" fill="url(#cf)" stroke="#22d3ee" strokeOpacity="0.3" strokeWidth="1" />
    </svg>
  );
}
