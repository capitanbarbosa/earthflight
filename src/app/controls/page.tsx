import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/ContentPage";
import { CONTROLS } from "@/lib/controls-data";

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
        EARTHFLIGHT is played with keyboard and mouse. Click the view to capture the mouse; press <kbd>Esc</kbd> to release it and pause. A compact
        reminder is always available in-game with <kbd>H</kbd>. New here? Read <Link href="/how-to-play">how to play</Link> first.
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
      <h2>Touch devices</h2>
      <p>EARTHFLIGHT currently needs a keyboard and mouse. Touch controls are not implemented.</p>
    </ContentPage>
  );
}
