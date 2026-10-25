"use client";

import { useEffect, useMemo, useState } from "react";
import { LIVE_BY_ID, LIVE_GROUPS, LIVE_LAYERS, type LiveId } from "@/lib/live/registry";
import { useLiveStore, type FeedItem, type LiveStatus } from "@/stores/live-store";
import { getSimulator } from "@/lib/sim-bridge";

const KIND_LABEL: Record<FeedItem["kind"], string> = {
  quake: "Quake", fire: "Fire", storm: "Storm", volcano: "Volcano", ice: "Ice", flood: "Flood", other: "Event",
};
const KIND_DOT: Record<FeedItem["kind"], string> = {
  quake: "#ffb347", fire: "#ff7a2f", storm: "#5ee0ff", volcano: "#ff3b3b", ice: "#e8f4ff", flood: "#4d8dff", other: "#cfd8dc",
};
type Filter = "all" | "quake" | "fire" | "storm" | "other";

function ago(t: number): string {
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function StatusLine({ s, id }: { s: LiveStatus; id: LiveId }) {
  const meta = LIVE_BY_ID[id];
  if (s.state === "off") return <span className="text-cyan-200/45">{meta.freshness}</span>;
  if (s.state === "loading") return <span className="text-cyan-200/70">loading…</span>;
  if (s.state === "error") return <span className="text-amber-300/90">{s.note ?? "unavailable"}</span>;
  const bits: string[] = [];
  if (typeof s.count === "number") bits.push(`${s.count.toLocaleString()} shown`);
  if (s.note) bits.push(s.note);
  return <span className="text-emerald-300/85">{bits.length ? bits.join(" · ") : "live"}</span>;
}

/** Layers panel (key L): toggle every data layer, see honest status, fly to live events with one click. */
export function LayersPanel() {
  const enabled = useLiveStore((s) => s.enabled);
  const status = useLiveStore((s) => s.status);
  const feed = useLiveStore((s) => s.feed);
  const setEnabled = useLiveStore((s) => s.setEnabled);
  const [filter, setFilter] = useState<Filter>("all");
  const close = () => getSimulator()?.openPanel("none");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyL" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(() => {
    const m: Record<Filter, (f: FeedItem) => boolean> = {
      all: () => true,
      quake: (f) => f.kind === "quake",
      fire: (f) => f.kind === "fire",
      storm: (f) => f.kind === "storm" || f.kind === "volcano",
      other: (f) => f.kind === "ice" || f.kind === "flood" || f.kind === "other",
    };
    return feed.filter(m[filter]).slice(0, 40);
  }, [feed, filter]);

  const fly = (f: FeedItem) => {
    getSimulator()?.travelTo({ id: f.id, name: f.title, lat: f.lat, lon: f.lon }, { arriveAgl: f.kind === "storm" ? 90_000 : f.kind === "quake" ? 12_000 : 6_000 });
  };
  const anyOn = LIVE_LAYERS.some((l) => enabled[l.id]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex justify-end p-3 pt-16">
      <div className="hud-panel-solid fade-up pointer-events-auto flex h-full w-[min(430px,96vw)] flex-col font-mono">
        <div className="flex items-center justify-between border-b border-cyan-400/20 px-4 py-3">
          <span className="hud-label">Live globe layers</span>
          <button className="hud-label hover:text-white" onClick={close}>close · L</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {LIVE_GROUPS.map((g) => (
            <section key={g} className="px-3 pb-1 pt-3">
              <div className="hud-label px-1 pb-1 !text-[9px]">{g}</div>
              {LIVE_LAYERS.filter((l) => l.group === g).map((l) => (
                <label key={l.id} className="flex cursor-pointer items-start gap-3 px-1 py-2 hover:bg-cyan-400/5">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-cyan-300"
                    checked={enabled[l.id]}
                    onChange={(e) => setEnabled(l.id, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-cyan-50">{l.label}</span>
                    <span className="block text-[11px] leading-snug text-cyan-200/60">{l.blurb}</span>
                    <span className="mt-0.5 block text-[10px] leading-snug">
                      <StatusLine s={status[l.id]} id={l.id} />
                    </span>
                    {l.coverage && <span className="block text-[10px] leading-snug text-cyan-200/40">Coverage: {l.coverage}</span>}
                  </span>
                </label>
              ))}
            </section>
          ))}

          <section className="px-3 pb-3 pt-3">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="hud-label !text-[9px]">Happening now · fly there</span>
            </div>
            <div className="flex flex-wrap gap-1 px-1 pb-2">
              {(["all", "quake", "fire", "storm", "other"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`border px-2 py-0.5 text-[10px] uppercase tracking-wider ${filter === f ? "border-cyan-300 bg-cyan-400/20 text-white" : "border-cyan-400/25 text-cyan-200/60 hover:text-white"}`}
                >
                  {f === "storm" ? "storms & volcanoes" : f === "quake" ? "quakes" : f === "fire" ? "fires" : f}
                </button>
              ))}
            </div>
            {items.length === 0 && (
              <p className="px-1 py-2 text-[11px] text-cyan-200/55">
                {enabled.quakes || enabled.events ? "Loading events…" : "Turn on Earthquakes or Storms, volcanoes & wildfires to list events here."}
              </p>
            )}
            <ul>
              {items.map((f) => (
                <li key={f.id}>
                  <button onClick={() => fly(f)} className="flex w-full items-center gap-3 px-1 py-1.5 text-left hover:bg-cyan-400/10">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_DOT[f.kind] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-cyan-50">{f.title}</span>
                      <span className="block truncate text-[10px] text-cyan-200/55">
                        {f.detail}
                        {f.time ? ` · ${ago(f.time)}` : ""}
                      </span>
                    </span>
                    <span className="hud-label shrink-0 !text-[9px]">{KIND_LABEL[f.kind]} →</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="border-t border-cyan-400/20 px-4 py-2 text-[9px] leading-snug text-cyan-200/40">
          {anyOn ? "Data: " : "Sources: "}USGS · NASA EONET &amp; GIBS · NOAA SWPC · adsb.lol (ODbL) · Fintraffic Digitraffic (CC BY 4.0). Live data can be delayed or incomplete; do not use for navigation or safety decisions.
        </div>
      </div>
    </div>
  );
}
