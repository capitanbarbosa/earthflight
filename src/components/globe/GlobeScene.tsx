"use client";

import { useEffect, useRef } from "react";
import { Simulator } from "@/lib/cesium/simulator";
import { setSimulator } from "@/lib/sim-bridge";
import { useFlightStore } from "@/stores/flight-store";

/**
 * Mounts the Cesium globe + Three ship overlay. Everything heavy happens inside `Simulator`;
 * this component only owns the DOM containers and the lifecycle (full WebGL cleanup on unmount).
 */
export default function GlobeScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let sim: Simulator | null = null;
    let cancelled = false;
    const set = useFlightStore.getState().set;
    (async () => {
      try {
        const s = await Simulator.create(containerRef.current!, creditRef.current!, {
          onError: (msg) => set({ error: msg }),
        });
        if (cancelled) {
          s.dispose();
          return;
        }
        sim = s;
        setSimulator(s);
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : String(e);
        set({
          error: /webgl/i.test(msg)
            ? "Your browser could not start WebGL. Enable hardware acceleration or try a recent Chrome, Edge, Firefox or Safari on a desktop."
            : `Failed to start the 3D engine: ${msg}`,
        });
      }
    })();
    return () => {
      cancelled = true;
      setSimulator(null);
      sim?.dispose();
      useFlightStore.getState().set({ phase: "loading", ready: false, paused: false, panel: "none", travelling: false, destination: null });
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black" style={{ touchAction: "none" }} />
      <div
        ref={creditRef}
        className="credit-line pointer-events-auto absolute bottom-1 left-1/2 z-20 max-w-[min(900px,92vw)] -translate-x-1/2 text-center"
      />
    </>
  );
}
