"use client";

import { useEffect, useRef, useState } from "react";
import { getSimulator } from "@/lib/sim-bridge";
import { touchInput } from "@/lib/touch-input";
import { useFlightStore } from "@/stores/flight-store";

/**
 * On-screen flight controls for iPhone, iPad and other touch devices.
 * Left stick flies, right stick aims, and the buttons cover climb, dive, roll and systems.
 */
export function TouchControls() {
  const cameraMode = useFlightStore((s) => s.cameraMode);
  const [held, setHeld] = useState({ up: false, down: false, rollL: false, rollR: false });
  const [generation, setGeneration] = useState(0);
  const zooming = cameraMode === "free";

  useEffect(() => {
    touchInput.enabled = true;
    return () => {
      touchInput.enabled = false;
      touchInput.reset();
    };
  }, []);

  useEffect(() => {
    touchInput.vertical = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    touchInput.roll = (held.rollR ? 1 : 0) - (held.rollL ? 1 : 0);
  }, [held]);

  useEffect(() => {
    const release = () => {
      if (document.hidden) {
        touchInput.reset();
        setHeld({ up: false, down: false, rollL: false, rollR: false });
        setGeneration((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", release);
    return () => document.removeEventListener("visibilitychange", release);
  }, []);

  const hold = (key: keyof typeof held, down: boolean) => setHeld((h) => (h[key] === down ? h : { ...h, [key]: down }));

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <div className="touch-cluster touch-cluster-left pointer-events-auto absolute bottom-[max(0.6rem,env(safe-area-inset-bottom))] left-[max(0.6rem,env(safe-area-inset-left))]">
        <Stick
          label="Move"
          generation={generation}
          description="Move. Drag up to thrust forward, down to brake, sideways to strafe."
          onChange={(x, y) => {
            touchInput.strafe = x;
            touchInput.thrust = -y;
          }}
        />
        <div className="touch-pad">
          <TouchButton label="▲" sub="Climb" aria="Climb" held={held.up} onHold={(d) => hold("up", d)} />
          <TouchButton label="▼" sub="Dive" aria="Dive" held={held.down} onHold={(d) => hold("down", d)} />
          <TouchButton label="↺" sub="Roll" aria="Roll left" held={held.rollL} onHold={(d) => hold("rollL", d)} />
          <TouchButton label="Cam" aria="Cycle camera" onPress={() => getSimulator()?.cycleCamera()} />
        </div>
      </div>

      <div className="touch-cluster touch-cluster-right pointer-events-auto absolute bottom-[max(0.6rem,env(safe-area-inset-bottom))] right-[max(0.6rem,env(safe-area-inset-right))]">
        <div className="touch-pad">
          <TouchButton label="↻" sub="Roll" aria="Roll right" held={held.rollR} onHold={(d) => hold("rollR", d)} />
          <TouchButton label="Stop" aria="Emergency stop" tone="danger" onPress={() => getSimulator()?.emergencyStop()} />
          <TouchButton label="−" sub={zooming ? "Out" : "Slow"} aria={zooming ? "Zoom out" : "Decrease speed limit"} repeat generation={generation} onPress={() => getSimulator()?.adjustLimiter(-1)} />
          <TouchButton label="+" sub={zooming ? "In" : "Fast"} aria={zooming ? "Zoom in" : "Increase speed limit"} repeat generation={generation} onPress={() => getSimulator()?.adjustLimiter(1)} />
        </div>
        <Stick
          label="Look"
          generation={generation}
          description="Look. Drag to pitch and yaw the ship."
          onChange={(x, y) => {
            touchInput.lookX = x;
            touchInput.lookY = -y;
          }}
        />
      </div>
    </div>
  );
}

function Stick({
  label,
  description,
  generation,
  onChange,
}: {
  label: string;
  description: string;
  generation: number;
  onChange: (x: number, y: number) => void;
}) {
  const base = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    onChangeRef.current(0, 0);
  };

  useEffect(() => {
    if (generation === 0) return;
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    onChangeRef.current(0, 0);
  }, [generation]);

  const move = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const max = r.width / 2;
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    let nx = dx / max;
    let ny = dy / max;
    const m = Math.hypot(nx, ny);
    const dead = 0.14;
    if (m < dead) {
      nx = 0;
      ny = 0;
    } else {
      const s = (m - dead) / ((1 - dead) * m);
      nx *= s;
      ny *= s;
    }
    setKnob({ x: dx, y: dy });
    onChangeRef.current(nx, ny);
  };

  return (
    <div className="touch-stick-wrap flex flex-col items-center">
      <span className="mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-cyan-200/75">{label}</span>
      <div
        ref={base}
        className="touch-stick"
        role="application"
        aria-label={description}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          pid.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerId === pid.current) move(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerId === pid.current) end();
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === pid.current) end();
        }}
      >
        <div className="touch-knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
    </div>
  );
}

function TouchButton({
  label,
  sub,
  aria,
  held,
  tone,
  repeat,
  generation = 0,
  onHold,
  onPress,
}: {
  label: string;
  sub?: string;
  aria: string;
  held?: boolean;
  tone?: "danger";
  repeat?: boolean;
  generation?: number;
  onHold?: (down: boolean) => void;
  onPress?: () => void;
}) {
  const pressing = useRef(false);
  const timer = useRef<number | null>(null);
  const onPressRef = useRef(onPress);
  const onHoldRef = useRef(onHold);
  onPressRef.current = onPress;
  onHoldRef.current = onHold;

  const stopRepeat = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => () => stopRepeat(), []);
  useEffect(() => {
    if (generation === 0) return;
    pressing.current = false;
    stopRepeat();
    onHoldRef.current?.(false);
  }, [generation]);

  return (
    <button
      type="button"
      aria-label={aria}
      aria-pressed={onHold ? !!held : undefined}
      className={`touch-btn ${held ? "is-held" : ""} ${tone === "danger" ? "is-danger" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        pressing.current = true;
        onHold?.(true);
        if (repeat) {
          onPressRef.current?.();
          stopRepeat();
          timer.current = window.setInterval(() => onPressRef.current?.(), 170);
        }
      }}
      onPointerUp={(e) => {
        if (!pressing.current) return;
        pressing.current = false;
        stopRepeat();
        onHold?.(false);
        if (!repeat) onPressRef.current?.();
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={() => {
        pressing.current = false;
        stopRepeat();
        onHold?.(false);
      }}
    >
      <span className="touch-btn-icon">{label}</span>
      {sub && <span className="touch-btn-sub">{sub}</span>}
    </button>
  );
}
