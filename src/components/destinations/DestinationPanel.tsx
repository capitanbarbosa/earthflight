"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DestinationTarget } from "@/stores/flight-store";
import { DESTINATIONS, POPULAR, searchDestinations } from "@/lib/geospatial/destinations";
import { getSimulator } from "@/lib/sim-bridge";

interface Item {
  key: string;
  title: string;
  subtitle: string;
  target: DestinationTarget;
  kind: "city" | "landmark" | "world";
}

const toItem = (d: (typeof DESTINATIONS)[number], landmark?: { name: string; lat: number; lon: number }): Item => ({
  key: `${d.id}${landmark ? `:${landmark.name}` : ""}`,
  title: landmark ? landmark.name : d.name,
  subtitle: landmark ? `${d.name}, ${d.country}` : d.country,
  kind: landmark ? "landmark" : "city",
  target: { id: d.id, name: d.name, lat: landmark?.lat ?? d.lat, lon: landmark?.lon ?? d.lon, landmark: landmark?.name },
});

/** Searchable destination menu: instant offline autocomplete + optional worldwide search (Enter). */
export function DestinationPanel() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [world, setWorld] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const local: Item[] = useMemo(() => {
    if (!q.trim()) return POPULAR.map((d) => toItem(d));
    return searchDestinations(q, 9).map((h) => toItem(h.destination, h.landmark));
  }, [q]);
  const items = [...local, ...world];

  useEffect(() => setSel(0), [q]);

  const go = (it: Item) => {
    getSimulator()?.travelTo(it.target, it.kind === "world" ? { arriveAgl: 650 } : {});
  };

  const searchWorld = async () => {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const json = await res.json();
      const rows = (json.results ?? []) as Array<{ id: string; name: string; label: string; lat: number; lon: number }>;
      setWorld(
        rows.map((r) => ({
          key: r.id,
          title: r.name,
          subtitle: r.label.split(",").slice(1, 3).join(",").trim() || "OpenStreetMap",
          kind: "world" as const,
          target: { id: r.id, name: r.name, lat: r.lat, lon: r.lon },
        })),
      );
      if (!rows.length) setNote(json.error ? "Worldwide search is unavailable right now." : "No places found.");
    } catch {
      setNote("Worldwide search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-start justify-center bg-black/35 p-4 pt-[9vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && getSimulator()?.openPanel("none")}>
      <div className="hud-panel-solid fade-up w-[min(560px,96vw)] font-mono">
        <div className="flex items-center justify-between border-b border-cyan-400/20 px-4 py-3">
          <span className="hud-label">Destinations</span>
          <button className="hud-label hover:text-white" onClick={() => getSimulator()?.openPanel("none")}>
            close · esc
          </button>
        </div>
        <div className="px-4 pt-3">
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setWorld([]);
              setNote("");
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(items.length - 1, s + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
              else if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey || (!items.length && q.trim().length >= 3)) void searchWorld();
                else if (items[sel]) go(items[sel]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                getSimulator()?.openPanel("none");
              }
            }}
            placeholder="Type a city or landmark…  (New York, Tokyo, Eiffel Tower)"
            className="w-full border border-cyan-400/40 bg-black/50 px-3 py-2.5 text-sm text-cyan-50 outline-none placeholder:text-cyan-200/35 focus:border-cyan-300"
            aria-label="Search destinations"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-cyan-200/55">
            <span>↑↓ select · Enter fly · Shift+Enter search worldwide</span>
            <button className="underline-offset-2 hover:text-white hover:underline disabled:opacity-40" disabled={q.trim().length < 3 || busy} onClick={searchWorld}>
              {busy ? "searching…" : "search worldwide"}
            </button>
          </div>
        </div>
        <div className="hud-label px-4 pb-1 pt-3">{q.trim() ? "Results" : "Popular destinations"}</div>
        <ul className="max-h-[46vh] overflow-y-auto px-2 pb-3" role="listbox">
          {items.map((it, i) => (
            <li key={it.key}>
              <button
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(it)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${i === sel ? "bg-cyan-400/15" : "hover:bg-cyan-400/10"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-cyan-50">{it.title}</span>
                  <span className="block truncate text-[11px] text-cyan-200/55">{it.subtitle}</span>
                </span>
                <span className="hud-label shrink-0 !text-[9px]">{it.kind === "landmark" ? "Landmark" : it.kind === "world" ? "Place" : "City"} · fly →</span>
              </button>
            </li>
          ))}
          {!items.length && (
            <li className="px-3 py-4 text-xs text-cyan-200/60">
              No match in the built-in list. Press <span className="hud-key">Shift</span>+<span className="hud-key">Enter</span> to search the whole world.
            </li>
          )}
          {note && <li className="px-3 py-2 text-xs text-amber-300/80">{note}</li>}
          {world.length > 0 && <li className="px-3 py-1 text-[10px] text-cyan-200/40">Search © OpenStreetMap contributors (Nominatim)</li>}
        </ul>
      </div>
    </div>
  );
}
