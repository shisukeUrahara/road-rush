// All sound is synthesized — no audio files. Engine is a continuous saw whose
// pitch tracks speed; everything else is a short blip.

import { HIGH_MAX } from "./config";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private warnUntil = 0;
  muted = false;

  /** Must be called from a user gesture; browsers block audio otherwise. */
  resume(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  startEngine(): void {
    if (!this.ctx || !this.master || this.engineOsc) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 60;

    const sub = this.ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = 30;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.35;

    // Low-pass keeps the saw from sounding like a wasp at top speed.
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;

    osc.connect(lp);
    sub.connect(subGain);
    subGain.connect(lp);
    lp.connect(gain);
    osc.start();
    sub.start();

    this.engineOsc = osc;
    this.engineSub = sub;
    this.engineGain = gain;
  }

  stopEngine(): void {
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.t, 0.05);
    this.engineOsc?.stop(this.t + 0.2);
    this.engineSub?.stop(this.t + 0.2);
    this.engineOsc = null;
    this.engineSub = null;
    this.engineGain = null;
  }

  /** speed in km/h; skidding adds a rasp. */
  updateEngine(speed: number, skidding: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineSub) return;
    const ratio = Math.min(1, speed / HIGH_MAX);
    const base = 52 + ratio * 150 + (skidding ? 30 : 0);
    this.engineOsc.frequency.setTargetAtTime(base, this.t, 0.05);
    this.engineSub.frequency.setTargetAtTime(base * 0.5, this.t, 0.05);
    const vol = this.muted ? 0 : 0.05 + ratio * 0.13;
    this.engineGain.gain.setTargetAtTime(vol, this.t, 0.08);
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 0.2,
    endFreq?: number,
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), this.t + dur);
    g.gain.setValueAtTime(vol, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.3, filterHz = 1200): void {
    if (!this.ctx || !this.master || this.muted) return;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start();
  }

  skid(): void {
    this.noise(0.35, 0.22, 2600);
  }

  bump(): void {
    this.blip(180, 0.12, "square", 0.22, 90);
  }

  explode(): void {
    this.noise(0.65, 0.5, 700);
    this.blip(120, 0.5, "sawtooth", 0.3, 30);
  }

  /** Rising chime; higher combo = higher pitch. */
  fuel(combo: number): void {
    const base = 520 + Math.min(combo, 6) * 90;
    this.blip(base, 0.09, "square", 0.24);
    window.setTimeout(() => this.blip(base * 1.5, 0.13, "square", 0.22), 80);
  }

  pass(): void {
    this.blip(880, 0.05, "triangle", 0.1);
  }

  select(): void {
    this.blip(660, 0.07, "square", 0.18);
  }

  confirm(): void {
    this.blip(520, 0.07, "square", 0.2);
    window.setTimeout(() => this.blip(780, 0.1, "square", 0.2), 70);
  }

  mascot(): void {
    [523, 659, 784, 1046].forEach((f, i) =>
      window.setTimeout(() => this.blip(f, 0.14, "square", 0.22), i * 90),
    );
  }

  gameOver(): void {
    [440, 349, 262, 196].forEach((f, i) =>
      window.setTimeout(() => this.blip(f, 0.28, "triangle", 0.24), i * 170),
    );
  }

  /** Called every frame while fuel is low; self-throttles to ~2 beeps/sec. */
  lowFuelTick(now: number): void {
    if (now < this.warnUntil) return;
    this.warnUntil = now + 0.5;
    this.blip(1100, 0.07, "square", 0.14);
  }
}
