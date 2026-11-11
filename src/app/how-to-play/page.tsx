import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";
import { JsonLd } from "@/components/site/JsonLd";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "How to Play — Fly a Spaceship from Orbit to City Streets",
  description: "Learn how to fly in EARTHFLIGHT: start in orbit, descend through the atmosphere, fly into 3D cities and use the destination search and cinematic travel.",
  alternates: { canonical: "/how-to-play" },
};

const steps = [
  ["Start in orbit", "Press START EXPLORING. The camera swoops behind your ship, hovering high above a slowly rotating Earth."],
  ["Capture the mouse", "Click the view once. Your mouse now pitches and yaws the ship. Press Esc any time to pause and release it."],
  ["Point at Earth and thrust", "Aim the nose at the planet and hold W. Speed is automatically limited by altitude, so you can cross continents in seconds and still slow down safely near the ground."],
  ["Descend and level out", "Hold Shift to descend, and R to level the ship to the local horizon. In arcade mode the ship also levels itself."],
  ["Pick a destination", "Press G, type a city or landmark and press Enter. The autopilot flies a great-circle arc, climbing and descending so it never clips terrain or buildings."],
  ["Take back control", "Press any thrust key or Backspace to cancel travel and fly manually. Press X for an emergency stop at any time."],
];

export default function Page() {
  return (
    <ContentPage>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to play EARTHFLIGHT",
          url: `${config.siteUrl}/how-to-play`,
          step: steps.map(([name, text]) => ({ "@type": "HowToStep", name, text })),
        }}
      />
      <h1>How to play EARTHFLIGHT</h1>
      <p>
        EARTHFLIGHT is a free 3D Earth flight simulator. There are no levels or enemies — the goal is to explore. This guide takes about two minutes and
        covers everything you need to go from orbit to street level. For the full key list see the <Link href="/controls">controls page</Link>.
      </p>
      <h2>Six steps to your first flight</h2>
      <ol className="my-4 list-decimal space-y-3 pl-5 text-[#b6d3dc]">
        {steps.map(([t, d]) => (
          <li key={t} className="leading-relaxed">
            <strong className="text-cyan-100">{t}.</strong> {d}
          </li>
        ))}
      </ol>
      <h2>The three flight modes</h2>
      <ul>
        <li><strong>Space</strong> — above roughly 130 km. Enormous speed range, ideal for crossing the planet. The ship is orientation-free here.</li>
        <li><strong>Atmospheric</strong> — below space. Drag and the horizon matter, speed is capped by altitude.</li>
        <li><strong>City</strong> — below a few kilometres. Fine control, a gentle speed cap and collision with buildings and terrain.</li>
      </ul>
      <p>Modes change automatically with altitude. You can lock one manually with the 1, 2 and 3 keys, or return to automatic with 0.</p>
      <h2>Arcade vs. realistic flight</h2>
      <p>
        Press F to switch. <strong>Arcade</strong> keeps the ship aligned with its direction of travel and levels it automatically — recommended for first flights.
        <strong> Realistic</strong> is Newtonian: the ship keeps its momentum and does not auto-level, so you must brake and align yourself.
      </p>
      <h2>Phones and tablets</h2>
      <p>
        Open the site on an iPhone, iPad or other phone or tablet and the controls switch on their own. The left stick flies the ship, the right stick aims it,
        and the buttons climb, dive and roll. Pause, destinations and live layers stay along the top. A keyboard attached to an iPad keeps working too.
      </p>
      <h2>Tips</h2>
      <ul>
        <li>Lower the speed limiter with the mouse wheel or the [ and ] keys when flying between buildings.</li>
        <li>Use the free camera (C) to orbit your ship and admire it against the planet.</li>
        <li>Switch to <em>Night</em> in the pause menu to see the city lights of the Earth.</li>
        <li>If the frame rate is low, choose Low quality in the pause menu or leave Adaptive quality on.</li>
      </ul>
    </ContentPage>
  );
}
