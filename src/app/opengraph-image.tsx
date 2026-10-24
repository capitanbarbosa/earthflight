import { ImageResponse } from "next/og";

export const alt = "EARTHFLIGHT — 3D spaceship Earth exploration";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 120%, #0b5a8f 0%, #06223a 35%, #02060c 70%)",
          color: "white",
          fontFamily: "monospace",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: 24, textShadow: "0 0 40px #22d3ee" }}>EARTHFLIGHT</div>
        <div style={{ marginTop: 24, fontSize: 30, letterSpacing: 8, color: "#a5f3fc" }}>FLY FROM ORBIT INTO THE CITY</div>
      </div>
    ),
    size,
  );
}
