"use client";

import { CONTROLS, TOUCH_CONTROLS } from "@/lib/controls-data";
import { useFlightStore } from "@/stores/flight-store";

export function ControlsGuide({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const touch = useFlightStore((s) => s.inputMode === "touch");
  const groups = ["Flight", "Camera & modes", "Systems"] as const;
  if (touch && compact) {
    return (
      <div className="hud-panel w-[270px] px-3 py-2.5 font-mono">
        <div className="flex items-center justify-between">
          <span className="hud-label">Touch controls</span>
          {onClose && (
            <button className="hud-label hover:text-white" onClick={onClose} aria-label="Hide controls guide">
              hide
            </button>
          )}
        </div>
        <ul className="mt-1.5 space-y-1">
          {TOUCH_CONTROLS.map((c) => (
            <li key={c.control} className="flex items-center gap-2 text-[11px] text-cyan-100/90">
              <span className="hud-key !h-auto min-w-[78px] shrink-0 px-1 py-0.5 text-center leading-tight">{c.control}</span>
              <span className="leading-tight">{c.action}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={`hud-panel ${compact ? "w-[270px] px-3 py-2.5" : "w-full px-4 py-4"} font-mono`}>
      <div className="flex items-center justify-between">
        <span className="hud-label">Controls</span>
        {onClose && (
          <button className="hud-label hover:text-white" onClick={onClose} aria-label="Hide controls guide">
            hide · H
          </button>
        )}
      </div>
      {!compact && touch && (
        <ul className="mt-3 space-y-1 border-b border-cyan-400/15 pb-3">
          {TOUCH_CONTROLS.map((c) => (
            <li key={c.control} className="text-[12px] text-cyan-100/90">
              <span className="hud-key mr-2">{c.control}</span>
              {c.action}
              {c.detail && <span className="mt-0.5 block text-[11px] text-cyan-100/55">{c.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className={compact ? "mt-1.5 space-y-2" : "mt-3 grid gap-6 sm:grid-cols-3"}>
        {groups.map((g) => (
          <div key={g}>
            {!compact && <div className="hud-label mb-2 text-cyan-300">{g}</div>}
            <ul className="space-y-1">
              {CONTROLS.filter((c) => c.group === g)
                .filter((c) => !compact || !["Systems"].includes(g) || ["R", "X", "G", "Esc"].includes(c.keys[0]))
                .map((c) => (
                  <li key={c.action} className="flex items-center gap-2 text-[11px] text-cyan-100/90">
                    <span className="flex min-w-[78px] shrink-0 items-center gap-1">
                      {c.keys.map((k) => (
                        <span key={k} className="hud-key">
                          {k}
                        </span>
                      ))}
                    </span>
                    <span className="leading-tight">{c.action}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
