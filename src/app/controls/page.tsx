import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";
import { CONTROLS, TOUCH_CONTROLS } from "@/lib/controls-data";

export const metadata: Metadata = {
  title: "Controls — Keyboard and Mouse Reference",
  description: "Complete EARTHFLIGHT controls: WASD thrust, Space/Shift ascend and descend, Q/E roll, mouse look with pointer lock, camera, flight mode and emergency stop keys.",
  alternates: { canonical: "/controls" },
};

const groups = ["Flight", "Camera & modes", "Systems"] as const;

export default function Page() {
  return (
    <ContentPage>
      <h1>Controls</h1>
      <p>
        On a computer, EARTHFLIGHT is played with keyboard and mouse. Click the view to capture the mouse; press <kbd>Esc</kbd> to release it and pause. On an
        iPhone, iPad or other phone or tablet, on-screen sticks appear instead and the mouse is left unlocked. A compact reminder is available in-game with <kbd>H</kbd>,
        or the Help button. New here? Read <Link href="/how-to-play">how to play</Link> first.
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {CONTROLS.filter((c) => c.group === g).map((c) => (
                <tr key={c.action}>
                  <td className="whitespace-nowrap">
                    {c.keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && " / "}
                        <kbd>{k}</kbd>
                      </span>
                    ))}
                  </td>
                  <td>
                    <strong className="text-cyan-100">{c.action}</strong>
                    {c.detail && <span className="block text-sm opacity-75">{c.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <h2>Mouse</h2>
      <p>
        If your browser blocks pointer lock (some embedded browsers do), hold the left mouse button and drag instead. Use <em>Invert Y</em> and the mouse
        sensitivity slider in the pause menu to tune the feel.
      </p>
      <h2>Phone and tablet</h2>
      <p>
        iPhone, iPad and other touch devices are detected automatically, including iPadOS when it reports itself as a desktop Mac. The left stick thrusts and
        strafes, the right stick pitches and yaws, and the buttons beside them climb, dive, roll, change camera, set the speed limiter and stop. Push the move
        stick to cancel cinematic travel. A paired keyboard still uses the keys above. Pointer lock stays off, so leaving the view does not pause the flight;
        use the Pause button.
      </p>
      <table>
        <thead>
          <tr>
            <th>Control</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {TOUCH_CONTROLS.map((c) => (
            <tr key={c.control}>
              <td className="whitespace-nowrap">
                <kbd>{c.control}</kbd>
              </td>
              <td>
                <strong className="text-cyan-100">{c.action}</strong>
                {c.detail && <span className="block text-sm opacity-75">{c.detail}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ContentPage>
  );
}
