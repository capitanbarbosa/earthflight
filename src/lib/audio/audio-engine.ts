/**
 * Procedural audio (WebAudio) — original synthesis, no sample assets, so no licensing issues.
 * Created lazily from a user gesture (START EXPLORING), so nothing plays before interaction.
 *
 *   engine hum        detuned saw/square + sub, low-passed, pitch/volume follow thrust & speed
 *   thruster          band-passed noise bursts scaled by acceleration
 *   atmosphere/wind   low-passed noise scaled by speed × air density (exp(-AGL/9 km))
 *   warp whoosh       rising filtered noise when cinematic travel starts
 *   UI blips / arrival chime
 */
export interface AudioParams {
  thrust: number; // 0..1
  speedNorm: number; // 0..1 (speed relative to cap)
  speed: number; // m/s
  agl: number; // m
  accel: number; // m/s² (unused scale; we use thrust delta)
  travelling: boolean;
  active: boolean; // false in pause menu → silence
}

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private engGain: GainNode;
  private engFilter: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private thrGain: GainNode;
  private thrFilter: BiquadFilterNode;
  private windGain: GainNode;
  private windFilter: BiquadFilterNode;
  private warpGain: GainNode;
  private warpFilter: BiquadFilterNode;
  private noiseSrc: AudioBufferSourceNode[] = [];
  private muted = false;
  private volume = 0.6;
  private prevThrust = 0;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // engine
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.frequency.value = 300;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.0;
    this.engFilter.connect(this.engGain).connect(this.master);
    const mk = (type: OscillatorType, f: number, g: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(this.engFilter);
      o.start();
      this.oscs.push(o);
    };
    mk("sawtooth", 55, 0.35);
    mk("square", 55.6, 0.18);
    mk("sine", 27.5, 0.6);
    // slow LFO for engine "breathing"
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    this.oscs.forEach((o) => lfoGain.connect(o.frequency));
    lfo.start();
    this.oscs.push(lfo);

    // noise buffer
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1; // pink-ish noise
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    }
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      this.noiseSrc.push(s);
      return s;
    };
    // thruster
    this.thrFilter = ctx.createBiquadFilter();
    this.thrFilter.type = "bandpass";
    this.thrFilter.frequency.value = 900;
    this.thrFilter.Q.value = 0.8;
    this.thrGain = ctx.createGain();
    this.thrGain.gain.value = 0;
    noise().connect(this.thrFilter).connect(this.thrGain).connect(this.master);
    // wind
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "lowpass";
    this.windFilter.frequency.value = 600;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise().connect(this.windFilter).connect(this.windGain).connect(this.master);
    // warp
    this.warpFilter = ctx.createBiquadFilter();
    this.warpFilter.type = "bandpass";
    this.warpFilter.frequency.value = 200;
    this.warpFilter.Q.value = 1.4;
    this.warpGain = ctx.createGain();
    this.warpGain.gain.value = 0;
    noise().connect(this.warpFilter).connect(this.warpGain).connect(this.master);
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.applyMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }
  setVolume(v: number) {
    this.volume = v;
    this.applyMaster();
  }
  private applyMaster() {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.8, t, 0.05);
  }

  update(p: AudioParams) {
    const t = this.ctx.currentTime;
    const on = p.active ? 1 : 0;
    const th = Math.min(1, Math.max(0, p.thrust));
    this.engGain.gain.setTargetAtTime(on * (0.05 + 0.16 * th + 0.05 * p.speedNorm), t, 0.1);
    this.engFilter.frequency.setTargetAtTime(160 + 900 * th + 400 * p.speedNorm, t, 0.12);
    const base = 48 + 38 * th + 22 * p.speedNorm;
    this.oscs[0].frequency.setTargetAtTime(base, t, 0.15);
    this.oscs[1].frequency.setTargetAtTime(base * 1.011, t, 0.15);
    this.oscs[2].frequency.setTargetAtTime(base * 0.5, t, 0.15);
    // thruster bursts when thrust rises quickly
    const dTh = Math.max(0, th - this.prevThrust);
    this.prevThrust = th;
    this.thrGain.gain.setTargetAtTime(on * (th * 0.1 + Math.min(0.3, dTh * 6)), t, 0.06);
    this.thrFilter.frequency.setTargetAtTime(500 + 2400 * th, t, 0.1);
    // atmosphere / wind
    const density = Math.exp(-Math.max(0, p.agl) / 9000);
    const wind = Math.min(1, p.speed / 800) * density;
    this.windGain.gain.setTargetAtTime(on * wind * 0.45, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(300 + 2500 * wind, t, 0.15);
    // warp
    this.warpGain.gain.setTargetAtTime(on * (p.travelling ? 0.22 : 0), t, 0.5);
    this.warpFilter.frequency.setTargetAtTime(p.travelling ? 900 : 200, t, 1.5);
  }

  private blip(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  ui(kind: "click" | "open" | "close" | "select" | "warn") {
    switch (kind) {
      case "click": return this.blip(880, 0.07, "triangle", 0.09);
      case "open": return this.blip(520, 0.14, "sine", 0.1, 980);
      case "close": return this.blip(900, 0.14, "sine", 0.1, 480);
      case "select": return (this.blip(660, 0.09, "triangle", 0.1), this.blip(990, 0.12, "triangle", 0.1, undefined, 0.07));
      case "warn": return this.blip(220, 0.25, "square", 0.08, 160);
    }
  }

  arrival() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.blip(f, 1.2, "sine", 0.09, undefined, i * 0.11));
    this.blip(261.63, 1.8, "triangle", 0.06, undefined, 0);
  }

  dispose() {
    this.noiseSrc.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    this.oscs.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } });
    void this.ctx.close();
  }
}
