import type { TrackEntryAnim } from "./config.svelte";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/**
 * Plays a crisp, low-latency synthesized cockpit power-up chime synchronized
 * with each of the 5 track-entry ignition animations.
 */
export function playTrackEntrySound(anim: TrackEntryAnim, volume = 0.35) {
  if (anim === "none") return;
  const c = getCtx();
  if (!c) return;

  try {
    const now = c.currentTime;
    const master = c.createGain();
    master.gain.setValueAtTime(Math.max(0.05, Math.min(0.8, volume)), now);
    master.connect(c.destination);

    const tone = (
      type: OscillatorType,
      f0: number,
      f1: number,
      start: number,
      dur: number,
      peak: number,
    ) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, now + start);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + start + dur);
      g.gain.setValueAtTime(0.0008, now + start);
      g.gain.linearRampToValueAtTime(peak, now + start + Math.min(0.03, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0008, now + start + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    if (anim === "ignition") {
      // Hypercar cockpit power-up sweep + crisp confirmation chime
      tone("sine", 220, 880, 0.0, 0.34, 0.45);
      tone("triangle", 440, 1320, 0.06, 0.32, 0.22);
      tone("sine", 1046.5, 1046.5, 0.36, 0.16, 0.32);
    } else if (anim === "telemetry-boot") {
      // Crisp 3-step digital DDU boot beeps
      tone("square", 660, 660, 0.0, 0.06, 0.16);
      tone("square", 880, 880, 0.09, 0.06, 0.18);
      tone("triangle", 1320, 1760, 0.19, 0.22, 0.28);
    } else if (anim === "grid-launch") {
      // Deep turbine spool-up + harmonic lock
      tone("sawtooth", 110, 440, 0.0, 0.38, 0.16);
      tone("sine", 220, 660, 0.04, 0.36, 0.36);
      tone("sine", 880, 880, 0.38, 0.18, 0.25);
    } else if (anim === "hypercar-pulse") {
      // High-voltage ERS capacitor charge surge
      tone("sine", 180, 1480, 0.0, 0.42, 0.4);
      tone("triangle", 360, 2220, 0.05, 0.38, 0.2);
      tone("sine", 1480, 1180, 0.43, 0.2, 0.24);
    } else if (anim === "cinematic-fade") {
      // Clean broadcast whoosh chord
      tone("sine", 330, 494, 0.0, 0.4, 0.28);
      tone("sine", 494, 659, 0.08, 0.38, 0.22);
    }
  } catch {
    // Ignore if browser/webview audio context is not unlocked yet
  }
}
