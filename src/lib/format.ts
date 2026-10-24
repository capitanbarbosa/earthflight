export function fmtSpeed(mps: number): { value: string; unit: string } {
  const kmh = mps * 3.6;
  if (kmh < 10_000) return { value: Math.round(kmh).toLocaleString("en-US"), unit: "KM/H" };
  const kms = mps / 1000;
  if (kms < 100) return { value: kms.toFixed(1), unit: "KM/S" };
  return { value: Math.round(kms).toLocaleString("en-US"), unit: "KM/S" };
}

export function fmtAlt(m: number): { value: string; unit: string } {
  const a = Math.max(0, m);
  if (a < 10_000) return { value: Math.round(a).toLocaleString("en-US"), unit: "M" };
  if (a < 100_000) return { value: (a / 1000).toFixed(1), unit: "KM" };
  return { value: Math.round(a / 1000).toLocaleString("en-US"), unit: "KM" };
}

export function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100_000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString("en-US")} km`;
}

export function fmtLat(deg: number): string {
  return `${Math.abs(deg).toFixed(4)}° ${deg >= 0 ? "N" : "S"}`;
}
export function fmtLon(deg: number): string {
  let d = ((deg + 540) % 360) - 180;
  if (Number.isNaN(d)) d = 0;
  return `${Math.abs(d).toFixed(4)}° ${d >= 0 ? "E" : "W"}`;
}

const CARD = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const cardinal = (h: number) => CARD[Math.round(((h % 360) + 360) % 360 / 22.5) % 16];
