import { create } from "zustand";
import type { LiveId } from "@/lib/live/registry";

export type LiveState = "off" | "loading" | "ok" | "error";
export interface LiveStatus {
  state: LiveState;
  count?: number;
  updated?: string;
  note?: string;
}

/** One entry of the clickable "live events" list (fly there with one click). */
export interface FeedItem {
  id: string;
  kind: "quake" | "fire" | "storm" | "volcano" | "ice" | "flood" | "other";
  title: string;
  detail: string;
  lat: number;
  lon: number;
  /** epoch ms of the event/report, 0 if unknown */
  time: number;
  score: number;
}

interface LiveStore {
  enabled: Record<LiveId, boolean>;
  status: Record<LiveId, LiveStatus>;
  feed: FeedItem[];
  setEnabled: (id: LiveId, on: boolean) => void;
  setStatus: (id: LiveId, s: LiveStatus) => void;
  setFeed: (f: FeedItem[]) => void;
}

const ids: LiveId[] = ["rain", "clouds", "aurora", "sst", "quakes", "events", "aircraft", "vessels"];
const off = () => Object.fromEntries(ids.map((i) => [i, { state: "off" as LiveState }])) as Record<LiveId, LiveStatus>;

export const useLiveStore = create<LiveStore>((set) => ({
  // a couple of light layers start on so the globe is alive straight away
  enabled: Object.fromEntries(ids.map((i) => [i, i === "quakes" || i === "events"])) as Record<LiveId, boolean>,
  status: off(),
  feed: [],
  setEnabled: (id, on) => set((s) => ({ enabled: { ...s.enabled, [id]: on } })),
  setStatus: (id, st) => set((s) => ({ status: { ...s.status, [id]: st } })),
  setFeed: (feed) => set({ feed }),
}));
