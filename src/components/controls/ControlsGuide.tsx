"use client";

import { CONTROLS } from "@/lib/controls-data";

export function ControlsGuide({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const groups = ["Flight", "Camera & modes", "Systems"] as const;
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
