import type { ControlInput } from "@/engine/physics";
import { getFlightState } from "@/stores/flight-store";
import { touchInput } from "@/lib/touch-input";

export interface InputHandlers {
  onKeyDown(code: string, e: KeyboardEvent): void;
  onWheel(deltaY: number): void;
  onLockChange(locked: boolean): void;
  /** Primary click on the viewport while not locked. Must request pointer lock inside this call. */
  onViewportPointerDown(e: PointerEvent): void;
  /** True if flight keys/mouse should currently be consumed. */
  isCapturing(): boolean;
}

const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyC", "KeyF", "KeyR", "KeyX", "KeyT", "KeyG", "KeyL", "KeyH", "KeyM",
  "Space", "ShiftLeft", "ShiftRight", "Tab", "Backspace", "BracketLeft", "BracketRight", "Digit0", "Digit1", "Digit2", "Digit3", "KeyV",
]);

/** Keyboard + mouse for the flight sim, with pointer-lock and a drag-to-steer fallback. */
export class InputManager {
  private keys = new Set<string>();
  private dx = 0;
  private dy = 0;
  private dragging = false;
  locked = false;
  private cleanup: Array<() => void> = [];

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
  ) {
    const on = <K extends keyof WindowEventMap>(t: Window, ev: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn, opts);
      this.cleanup.push(() => t.removeEventListener(ev, fn, opts));
    };
    const onEl = <K extends keyof HTMLElementEventMap>(ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn, opts);
      this.cleanup.push(() => el.removeEventListener(ev, fn, opts));
    };

    on(window, "keydown", (e) => {
      if (isTyping(e.target)) return;
      if (!this.h.isCapturing()) {
        // still allow toggles like Esc handled elsewhere; swallow nothing
        this.h.onKeyDown(e.code, e);
        return;
      }
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.h.onKeyDown(e.code, e);
      this.keys.add(e.code);
    });
    on(window, "keyup", (e) => {
      this.keys.delete(e.code);
    });
    on(window, "blur", () => {
      this.keys.clear();
      this.dragging = false;
    });
    on(window, "mousemove", (e) => {
      if (!this.h.isCapturing()) return;
      if (this.locked || this.dragging) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    on(window, "mouseup", () => {
      this.dragging = false;
    });
    onEl("pointerdown", (e) => {
      if (!this.h.isCapturing()) return;
      // Fingers fly with the on-screen sticks. A mouse on an iPad can still click-drag.
      if (e.pointerType === "touch" || e.pointerType === "pen") return;
      if (e.button !== 0 && e.button !== 2) return;
      if (!this.locked) this.dragging = true;
      if (getFlightState().inputMode !== "touch") this.h.onViewportPointerDown(e);
    });
    onEl("wheel", (e) => {
      if (!this.h.isCapturing()) return;
      e.preventDefault();
      this.h.onWheel(e.deltaY);
    }, { passive: false });
    onEl("contextmenu", (e) => e.preventDefault());
    const lockChange = () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) this.dragging = false;
      this.h.onLockChange(this.locked);
    };
    document.addEventListener("pointerlockchange", lockChange);
    this.cleanup.push(() => document.removeEventListener("pointerlockchange", lockChange));
  }

  requestLock() {
    try {
      const r = this.el.requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => undefined);
    } catch {
      /* unsupported – drag fallback is used */
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  has(code: string) {
    return this.keys.has(code);
  }

  clearKeys() {
    this.keys.clear();
  }

  /** Read & consume this frame's controls. Keyboard and the touch sticks add together. */
  read(): ControlInput {
    const k = this.keys;
    const axis = (pos: string[], neg: string[]) =>
      (pos.some((c) => k.has(c)) ? 1 : 0) - (neg.some((c) => k.has(c)) ? 1 : 0);
    const mix = (key: number, touch: number) => clampAxis(key + (touchInput.enabled ? touch : 0));
    const out: ControlInput = {
      thrust: mix(axis(["KeyW"], ["KeyS"]), touchInput.thrust),
      strafe: mix(axis(["KeyD"], ["KeyA"]), touchInput.strafe),
      vertical: mix(axis(["Space"], ["ShiftLeft", "ShiftRight"]), touchInput.vertical),
      roll: mix(axis(["KeyE"], ["KeyQ"]), touchInput.roll),
      mouseDX: this.dx,
      mouseDY: this.dy,
      lookX: touchInput.enabled ? touchInput.lookX : 0,
      lookY: touchInput.enabled ? touchInput.lookY : 0,
    };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  /** Drop accumulated mouse movement without using it. */
  consumeMouse() {
    const r = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return r;
  }

  dispose() {
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
  }
}

function clampAxis(v: number) {
  return Math.max(-1, Math.min(1, v));
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
