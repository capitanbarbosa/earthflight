import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";

export const metadata: Metadata = {
  title: "Browser-Based Earth Exploration — Explore the Planet in 3D, No Download",
  description: "Explore the whole Earth in 3D from your browser. How EARTHFLIGHT streams satellite imagery, global terrain and OpenStreetMap buildings with WebGL, and what data it uses.",
  alternates: { canonical: "/browser-earth-exploration" },
};

export default function Page() {
  return (
    <ContentPage>
      <h1>Browser-based Earth exploration</h1>
      <p>
        Modern browsers can render a whole planet. EARTHFLIGHT uses WebGL and the open-source <a href="https://cesium.com/platform/cesiumjs/" rel="noopener">CesiumJS</a> globe
        engine to stream the Earth to you tile by tile, so you can start exploring in seconds with nothing to install and nothing to pay.
      </p>
      <h2>What you are looking at</h2>
      <ul>
        <li><strong>Imagery</strong> — NASA Blue Marble from orbit, Sentinel-2 cloudless satellite mosaics (EOX, CC BY 4.0) up close, and NASA Black Marble city lights on the night side.</li>
        <li><strong>Terrain</strong> — global elevation data, so mountains, valleys and canyons are actual shapes you can fly into.</li>
        <li><strong>Buildings</strong> — extruded from OpenStreetMap footprints and heights, loaded around you as you descend into a city.</li>
        <li><strong>Atmosphere and light</strong> — a physically inspired atmosphere, a sun that sets the day and night sides, and a star field.</li>
      </ul>
      <h2>How it stays fast</h2>
      <p>
        Only the part of the planet you can see is loaded, at a level of detail matched to your altitude. The 3D engine is loaded lazily, assets are cached by your browser,
        and an adaptive quality system lowers render resolution if your frame rate falls. Performance still depends on your hardware, network and browser, and we make no
        guarantee of a specific frame rate.
      </p>
      <h2>Accuracy and limits</h2>
      <p>
        This is an exploration toy, not a navigation tool. Imagery has different capture dates in different places, clouds and shadows are baked into the satellite
        pictures, and OpenStreetMap building coverage varies — dense in many European and North American cities, patchier elsewhere. We never invent buildings where data is missing.
      </p>
      <h2>Why not just use a map?</h2>
      <p>
        Flat maps are great for finding things. Flying teaches proportions: how tall the mountains are next to the ocean, how thin the atmosphere is, how large a city really is.
        Start in orbit and fly down — you will feel it.
      </p>
      <p>
        Ready? <Link href="/explore">Launch the simulator</Link>, or read the <Link href="/how-to-play">how-to-play guide</Link> and <Link href="/destinations">browse destinations</Link>.
        Looking for flight-model details? See the <Link href="/3d-flight-simulator">3D flight simulator</Link> page.
      </p>
    </ContentPage>
  );
}
