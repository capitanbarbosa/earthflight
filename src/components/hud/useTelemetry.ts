"use client";

import { useEffect, useRef, useState } from "react";
import { telemetry, type Telemetry } from "@/stores/telemetry";

/**
 * Poll the mutable telemetry object at a low rate (default 10 Hz) and re-render only when the
 * selected, formatted value actually changes.  The sim loop never touches React.
 */
export function useTelemetry<T>(select: (t: Telemetry) => T, intervalMs = 100, equals: (a: T, b: T) => boolean = shallowEqual): T {
  const [v, setV] = useState<T>(() => select(telemetry));
  const sel = useRef(select);
  sel.current = select;
  const eq = useRef(equals);
  eq.current = equals;
  const last = useRef(v);
  useEffect(() => {
    const id = setInterval(() => {
      const n = sel.current(telemetry);
      if (!eq.current(last.current, n)) {
        last.current = n;
        setV(n);
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return v;
}

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
