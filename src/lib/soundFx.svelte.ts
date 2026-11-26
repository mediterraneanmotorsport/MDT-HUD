import { config, DEFAULT_SOUND_FX, type ShiftBeepStyle } from "./config.svelte";
import type { Snapshot } from "./types";

export type SoundFxTestKind =
  | "shiftBeep"
  | "rotaryClick"
  | "liftCoastBeep"
  | "absTcPulse"
  | "pitLimiterPulse"
  | "startLightsBeep"
  | "sectorChime"
  | "flagsAlert"
  | "lapInvalidBuzz"
  | "ersWhine"
  | "batteryFullChime";

class SoundFxEngine {
  private ctx: AudioContext | null = null;
  private ersOsc: OscillatorNode | null = null;
  private ersGain: GainNode | null = null;

  // Previous telemetry state for clean edge-triggered audio cues
  private lastShiftAt = 0;
  private lastShiftGear = -1;
  private lastElecSig = "";
  private lastLiftActive = false;
  private lastAbsAt = 0;
  private lastTcAt = 0;
  private lastPitPulseAt = 0;
  private prevStartLight = 0;
  private prevS1 = -1;
  private prevS2 = -1;
  private prevYellow = false;
  private prevBlue = false;
  private prevPenCount = 0;
  private prevInvalid = false;
  private prevBatteryFull = false;
  private sessionKey = "";

  private getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private get vol(): number {
    const v = config.value.general.soundFx?.volume ?? DEFAULT_SOUND_FX.volume;
    return Math.max(0, Math.min(1, v));
  }

  private tone(
    freq: number,
    durationSec: number,
    gainScale = 0.25,
    type: OscillatorType = "sine",
    delaySec = 0,
    endFreq?: number,
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationSec);
    }
    const peak = Math.max(0.0005, this.vol * gainScale);
    g.gain.setValueAtTime(0.0005, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, now + durationSec);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  playShiftBeep(style?: ShiftBeepStyle) {
    const s = style ?? config.value.general.soundFx?.shiftBeepStyle ?? "gt3";
    if (s === "f1") {
      this.tone(2450, 0.065, 0.28, "sine", 0);
      this.tone(2950, 0.07, 0.24, "sine", 0.075);
    } else if (s === "hypercar") {
      this.tone(1880, 0.09, 0.26, "triangle", 0, 2240);
    } else {
      // GT3 Bosch crisp beep
      this.tone(2100, 0.08, 0.28, "square", 0);
    }
  }

  playRotaryClick() {
    this.tone(1450, 0.022, 0.24, "triangle", 0, 620);
    this.tone(3100, 0.014, 0.14, "sine", 0.004, 1800);
  }

  playLiftCoast() {
    this.tone(1180, 0.075, 0.22, "sine", 0);
    this.tone(920, 0.095, 0.2, "sine", 0.09);
  }

  playAbsPulse() {
    this.tone(145, 0.045, 0.3, "sawtooth", 0, 95);
  }

  playTcPulse() {
    this.tone(520, 0.032, 0.18, "triangle", 0, 340);
  }

  playPitLimiterPulse() {
    this.tone(760, 0.055, 0.16, "sine", 0);
  }

  playStartLight(lightsOut: boolean) {
    if (lightsOut) {
      this.tone(1560, 0.28, 0.34, "triangle", 0, 1780);
    } else {
      this.tone(520, 0.14, 0.28, "sine", 0);
    }
  }

  playSectorChime(purple: boolean) {
    if (purple) {
      this.tone(880, 0.12, 0.22, "sine", 0);
      this.tone(1174.66, 0.14, 0.22, "sine", 0.09);
      this.tone(1760, 0.24, 0.24, "sine", 0.18);
    } else {
      this.tone(783.99, 0.11, 0.2, "sine", 0);
      this.tone(1046.5, 0.2, 0.22, "sine", 0.09);
    }
  }

  playFlagAlert(kind: "yellow" | "blue" | "penalty") {
    if (kind === "penalty") {
      this.tone(420, 0.16, 0.3, "sawtooth", 0);
      this.tone(310, 0.24, 0.3, "sawtooth", 0.18);
    } else if (kind === "blue") {
      this.tone(980, 0.08, 0.22, "sine", 0);
      this.tone(980, 0.08, 0.22, "sine", 0.12);
    } else {
      this.tone(660, 0.14, 0.24, "triangle", 0);
      this.tone(520, 0.14, 0.22, "triangle", 0.16);
    }
  }

  playLapInvalidBuzz() {
    this.tone(220, 0.09, 0.26, "sawtooth", 0, 180);
    this.tone(175, 0.14, 0.26, "sawtooth", 0.11, 140);
  }

  playBatteryFull() {
    this.tone(1046, 0.09, 0.22, "sine", 0);
    this.tone(1568, 0.18, 0.22, "sine", 0.09);
  }

  private updateErsWhine(active: boolean, regen: boolean, speedKmh: number) {
    if (!active) {
      if (this.ersGain && this.ctx) {
        this.ersGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      }
      return;
    }
    const ctx = this.getCtx();
    if (!ctx) return;
    if (!this.ersOsc || !this.ersGain) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sine";
      filter.type = "bandpass";
      filter.frequency.value = 1400;
      filter.Q.value = 2.0;
      gain.gain.value = 0.0001;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.ersOsc = osc;
      this.ersGain = gain;
    }
    const targetFreq = regen
      ? 620 + Math.min(900, speedKmh * 3.1)
      : 920 + Math.min(1350, speedKmh * 4.4);
    const targetGain = this.vol * (regen ? 0.055 : 0.075);
    this.ersOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.06);
    this.ersGain.gain.setTargetAtTime(Math.max(0.0001, targetGain), ctx.currentTime, 0.08);
  }

  stopContinuous() {
    if (this.ersGain && this.ctx) {
      this.ersGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.04);
    }
  }

  playTest(kind: SoundFxTestKind) {
    switch (kind) {
      case "shiftBeep":
        this.playShiftBeep();
        break;
      case "rotaryClick":
        this.playRotaryClick();
        break;
      case "liftCoastBeep":
        this.playLiftCoast();
        break;
      case "absTcPulse":
        this.playAbsPulse();
        setTimeout(() => this.playTcPulse(), 180);
        break;
      case "pitLimiterPulse":
        this.playPitLimiterPulse();
        setTimeout(() => this.playPitLimiterPulse(), 320);
        break;
      case "startLightsBeep":
        this.playStartLight(false);
        setTimeout(() => this.playStartLight(false), 380);
        setTimeout(() => this.playStartLight(true), 780);
        break;
      case "sectorChime":
        this.playSectorChime(true);
        break;
      case "flagsAlert":
        this.playFlagAlert("yellow");
        break;
      case "lapInvalidBuzz":
        this.playLapInvalidBuzz();
        break;
      case "ersWhine":
        this.tone(950, 0.45, 0.14, "sine", 0, 1950);
        break;
      case "batteryFullChime":
        this.playBatteryFull();
        break;
    }
  }

  processSnapshot(snap: Snapshot | null) {
    const cfg = config.value.general.soundFx ?? DEFAULT_SOUND_FX;
    if (!cfg.enabled || !snap?.connected || !snap.inRealtime || !snap.player) {
      this.stopContinuous();
      return;
    }

    const p = snap.player;
    const s = snap.session;
    const me = snap.vehicles.find((v) => v.isPlayer);
    const now = performance.now();
    const speedKmh = p.speed * 3.6;

    const key = `${snap.source}|${s.track}|${s.code}`;
    if (key !== this.sessionKey) {
      this.sessionKey = key;
      this.lastElecSig = `${p.tc}|${p.tcSlip}|${p.tcCut}|${p.abs}|${p.motorMap}|${(p.brakeBiasFront * 100).toFixed(1)}|${p.migration}|${p.frontArb}|${p.rearArb}`;
      this.prevStartLight = s.startLight || 0;
      this.prevS1 = me?.curS1 ?? -1;
      this.prevS2 = me?.curS2 ?? -1;
      this.prevYellow = s.yellowFlagState > 0 || s.phase === 6;
      this.prevBlue = me?.flag === 6;
      this.prevPenCount = p.penalties?.length ?? 0;
      this.prevInvalid = p.lapInvalidated;
      this.prevBatteryFull = p.electricMotorState > 0 && p.battery >= 0.98;
      this.lastLiftActive = false;
      return;
    }

    // 1. Shift Beep
    if (cfg.shiftBeep && p.maxRpm > 500 && p.gear >= 1 && p.gear < p.maxGears && p.throttle > 0.4) {
      const frac = p.rpm / p.maxRpm;
      const thresh = Math.max(0.88, Math.min(0.99, (cfg.shiftRpmPct ?? 95) / 100));
      if (frac >= thresh && (p.gear !== this.lastShiftGear || now - this.lastShiftAt > 950)) {
        this.lastShiftAt = now;
        this.lastShiftGear = p.gear;
        this.playShiftBeep(cfg.shiftBeepStyle);
      } else if (frac < thresh - 0.06 && p.gear === this.lastShiftGear) {
        this.lastShiftGear = -1;
      }
    }

    // 2. Mechanical Rotary Click (TC / ABS / BB / Map / ARB)
    const elecSig = `${p.tc}|${p.tcSlip}|${p.tcCut}|${p.abs}|${p.motorMap}|${(p.brakeBiasFront * 100).toFixed(1)}|${p.migration}|${p.frontArb}|${p.rearArb}`;
    if (elecSig !== this.lastElecSig) {
      if (cfg.rotaryClick && this.lastElecSig) {
        this.playRotaryClick();
      }
      this.lastElecSig = elecSig;
    }

    // 3. Lift & Coast Beep
    const liftActive = p.liftAndCoast > 0.08 && speedKmh > 90 && !p.inPits;
    if (cfg.liftCoastBeep && liftActive && !this.lastLiftActive) {
      this.playLiftCoast();
    }
    this.lastLiftActive = liftActive;

    // 4. ABS / TC Tactile Pulses
    if (cfg.absTcPulse) {
      if (p.absActive && now - this.lastAbsAt > 160) {
        this.lastAbsAt = now;
        this.playAbsPulse();
      } else if (p.tcActive && now - this.lastTcAt > 180) {
        this.lastTcAt = now;
        this.playTcPulse();
      }
    }

    // 5. Pit Limiter Pulse
    if (cfg.pitLimiterPulse && p.speedLimiter && speedKmh > 5 && now - this.lastPitPulseAt > 780) {
      this.lastPitPulseAt = now;
      this.playPitLimiterPulse();
    }

    // 6. Start Lights Countdown Beeps
    if (cfg.startLightsBeep) {
      const total = Math.max(5, Math.min(6, s.numRedLights || 5));
      const sl = s.startLight || 0;
      if (sl > this.prevStartLight && sl >= 1 && sl <= total) {
        this.playStartLight(false);
      } else if (this.prevStartLight >= 1 && this.prevStartLight <= total && (sl === 0 || sl > total)) {
        this.playStartLight(true);
      }
      this.prevStartLight = sl;
    }

    // 7. Purple / Green Sector Broadcast Chime
    if (cfg.sectorChime && me) {
      const classCars = snap.vehicles.filter((v) => v.class === me.class);
      if (me.curS1 > 0 && this.prevS1 >= 0 && Math.abs(me.curS1 - this.prevS1) > 0.001) {
        const bestS1 = Math.min(...classCars.map((c) => c.bestS1).filter((t) => t > 0), Infinity);
        if (me.curS1 <= bestS1 + 0.001) this.playSectorChime(true);
        else if (me.bestS1 > 0 && me.curS1 <= me.bestS1 + 0.001) this.playSectorChime(false);
      }
      if (me.curS2 > 0 && this.prevS2 >= 0 && Math.abs(me.curS2 - this.prevS2) > 0.001) {
        const bestS2 = Math.min(...classCars.map((c) => c.bestS2).filter((t) => t > 0), Infinity);
        if (me.curS2 <= bestS2 + 0.001) this.playSectorChime(true);
        else if (me.bestS2 > 0 && me.curS2 <= me.bestS2 + 0.001) this.playSectorChime(false);
      }
      this.prevS1 = me.curS1;
      this.prevS2 = me.curS2;
    }

    // 8. FIA Flags & Penalties Alerts
    if (cfg.flagsAlert) {
      const isYellow = s.yellowFlagState > 0 || s.phase === 6;
      const isBlue = me?.flag === 6;
      const penCount = p.penalties?.length ?? 0;
      if (penCount > this.prevPenCount) this.playFlagAlert("penalty");
      else if (isYellow && !this.prevYellow) this.playFlagAlert("yellow");
      else if (isBlue && !this.prevBlue) this.playFlagAlert("blue");
      this.prevYellow = isYellow;
      this.prevBlue = isBlue;
      this.prevPenCount = penCount;
    }

    // 9. Lap Invalidated Buzz
    if (cfg.lapInvalidBuzz && p.lapInvalidated && !this.prevInvalid) {
      this.playLapInvalidBuzz();
    }
    this.prevInvalid = p.lapInvalidated;

    // 10. Hybrid ERS Electric Whine
    const ersActive = cfg.ersWhine && (p.electricMotorState === 2 || p.electricMotorState === 3) && speedKmh > 20;
    this.updateErsWhine(ersActive, p.electricMotorState === 3, speedKmh);

    // 11. Battery 100% Full Chime
    const batFull = p.electricMotorState > 0 && p.battery >= 0.98;
    if (cfg.batteryFullChime && batFull && !this.prevBatteryFull) {
      this.playBatteryFull();
    }
    this.prevBatteryFull = batFull;
  }
}

export const soundFx = new SoundFxEngine();
