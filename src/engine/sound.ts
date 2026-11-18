import type { SimSoundEvent } from "./types";

/**
 * Web Audio API Procedural Harmonic Scale Synthesizer
 * Zero external audio files; rate-limited polyphony so 4x speed never clips.
 */

// C Major Pentatonic frequencies across 3 octaves (C4 -> A6)
const PENTATONIC_HZ = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
];

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private lastHitAt = 0;
  private lastGateAt = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.ensureContext();
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playEvents(events: SimSoundEvent[]): void {
    if (!this.enabled || events.length === 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    for (const ev of events) {
      if (ev.type === "hit") {
        if (now - this.lastHitAt < 0.048) continue;
        this.lastHitAt = now;
        const laneOffset = ev.laneIndex * 2;
        const freq = PENTATONIC_HZ[laneOffset % PENTATONIC_HZ.length];
        this.triggerTone(ctx, freq, 0.045, 0.035, "sine", ev.laneIndex);
      } else if (ev.type === "gate") {
        if (now - this.lastGateAt < 0.065) continue;
        this.lastGateAt = now;
        const freq = PENTATONIC_HZ[(5 + ev.laneIndex * 2) % PENTATONIC_HZ.length];
        this.triggerTone(ctx, freq, 0.07, 0.045, "triangle", ev.laneIndex);
      } else if (ev.type === "wall_break") {
        const scaleIdx = Math.min(
          PENTATONIC_HZ.length - 1,
          Math.max(0, Math.round(ev.intensity) % PENTATONIC_HZ.length)
        );
        const freq = PENTATONIC_HZ[scaleIdx];
        this.triggerTone(ctx, freq, 0.16, 0.09, "triangle", ev.laneIndex);
        this.triggerTone(ctx, freq * 1.5, 0.12, 0.05, "sine", ev.laneIndex);
      } else if (ev.type === "jackpot") {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          this.triggerTone(ctx, f, 0.22, 0.07, "triangle", ev.laneIndex, idx * 0.045);
        });
      } else if (ev.type === "finish") {
        [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, idx) => {
          this.triggerTone(ctx, f, 0.34, 0.085, "triangle", ev.laneIndex, idx * 0.06);
        });
      }
    }
  }

  private triggerTone(
    ctx: AudioContext,
    freq: number,
    duration: number,
    peakGain: number,
    type: OscillatorType,
    laneIndex: number,
    delay = 0
  ): void {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      const panVal = Math.max(-0.6, Math.min(0.6, (laneIndex - 1) * 0.45));
      panner.pan.setValueAtTime(panVal, start);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      osc.connect(gain);
      gain.connect(ctx.destination);
    }

    osc.start(start);
    osc.stop(start + duration + 0.015);
  }
}

export const soundEngine = new SoundSynthesizer();
