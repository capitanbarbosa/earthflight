import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";

export const metadata: Metadata = {
  title: "Free 3D Flight Simulator — Spaceship Flight from Orbit to City",
  description: "A free 3D spaceship flight simulator in your browser: six-degree-of-freedom flight, arcade and realistic physics, altitude-aware speed, terrain and building collision.",
  alternates: { canonical: "/3d-flight-simulator" },
};

export default function Page() {
  return (
    <ContentPage>
      <h1>3D flight simulator: from orbit to city streets</h1>
      <p>
        EARTHFLIGHT is a free 3D flight simulator where the aircraft is a spaceship and the airfield is the entire planet. It is built for exploration rather than combat:
        smooth, forgiving, and scaled so that both a 40,000 km orbit and a 30 m alley between skyscrapers feel controllable.
      </p>
      <h2>Flight model</h2>
      <ul>
        <li><strong>Six degrees of freedom</strong> — thrust, strafe and vertical thrust plus pitch, yaw and roll, all with inertia.</li>
        <li><strong>Altitude-aware speed</strong> — the speed cap rises smoothly with height, from walking-pace-plus near the ground to thousands of kilometres per second in deep space.</li>
        <li><strong>Arcade and realistic</strong> — arcade keeps the ship stable and aligned; realistic is Newtonian with density-based drag.</li>
        <li><strong>Curved-Earth correct</strong> — the ship&apos;s orientation is carried along the curvature of the planet, so level flight stays level across the globe and over the poles.</li>
      </ul>
      <h2>Safety systems</h2>
      <p>
        Terrain look-ahead pulls the ship up before it reaches a mountain, a hard floor keeps it from going underground, and building footprints act as solid obstacles
        in cities. An emergency stop (<kbd>X</kbd>) and orientation reset (<kbd>R</kbd>) recover from any situation. Collision with buildings is an approximation based on
        mapped footprints and heights, not a physically exact simulation.
      </p>
      <h2>Three cameras</h2>
      <p>A chase camera with speed-based field-of-view, a cockpit view, and a free orbit camera. Toggle with <kbd>C</kbd>.</p>
      <h2>Cinematic travel</h2>
      <p>
        Search for a destination and the autopilot flies a great-circle route with a climb, cruise and descent profile — it can never cut through the Earth, and it raises
        itself over tall buildings on arrival. Cancel at any time by pressing a thrust key.
      </p>
      <p>
        <Link href="/controls">See all controls</Link> · <Link href="/how-to-play">How to play</Link> · <Link href="/browser-earth-exploration">How the Earth is rendered</Link>
      </p>
    </ContentPage>
  );
}
