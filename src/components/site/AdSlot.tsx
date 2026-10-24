"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import { CONSENT_KEY } from "./ConsentBanner";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * AdSense-ready slot for CONTENT pages only.
 *  - renders nothing unless NEXT_PUBLIC_ADSENSE_CLIENT is set and the visitor accepted ads;
 *  - reserves fixed height (no layout shift);
 *  - is intentionally never used on /explore or over the flight viewport.
 */
export function AdSlot({ slot, className = "", minHeight = 250 }: { slot?: string; className?: string; minHeight?: number }) {
  const [ok, setOk] = useState(false);
  const pushed = useRef(false);
  const adSlot = slot || config.adsenseSlot;

  useEffect(() => {
    if (!config.adsenseClient) return;
    const check = () => setOk(localStorage.getItem(CONSENT_KEY) === "granted");
    check();
    window.addEventListener("ef-consent", check);
    return () => window.removeEventListener("ef-consent", check);
  }, []);

  useEffect(() => {
    if (!ok || pushed.current) return;
    const id = "adsense-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.adsenseClient}`;
      document.head.appendChild(s);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      /* ad blocker or script not ready */
    }
  }, [ok]);

  if (!config.adsenseClient || !ok || !adSlot) return null;
  return (
    <aside aria-label="Advertisement" className={`my-8 ${className}`} style={{ minHeight }}>
      <p className="mb-1 text-center text-[10px] uppercase tracking-[0.3em] text-cyan-200/40">Advertisement</p>
      <ins className="adsbygoogle block" style={{ display: "block", minHeight }} data-ad-client={config.adsenseClient} data-ad-slot={adSlot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
