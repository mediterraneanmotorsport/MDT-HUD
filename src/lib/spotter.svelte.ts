import { config } from "./config.svelte";
import type { Snapshot } from "./types";

export type SpotterPriority = 1 | 2 | 3 | 4 | 5;

export interface SpotterEventDef {
  folder: string;
  label: string;
  priority: SpotterPriority;
  cooldownMs: number;
  category: "traffic" | "flags" | "strategy" | "car" | "session";
  ttsDefault: string;
}

export const SPOTTER_EVENTS: SpotterEventDef[] = [
  // PRIORIDAD 1: Tráfico en paralelo (Inmediato)
  { folder: "Coche Izquierda", label: "Coche a la izquierda", priority: 1, cooldownMs: 2500, category: "traffic", ttsDefault: "Coche a la izquierda" },
  { folder: "Coche Derecha", label: "Coche a la derecha", priority: 1, cooldownMs: 2500, category: "traffic", ttsDefault: "Coche a la derecha" },
  { folder: "Tres en Paralelo", label: "Tres en paralelo", priority: 1, cooldownMs: 2500, category: "traffic", ttsDefault: "Cuidado, tres en paralelo" },
  { folder: "Libre", label: "Pista libre (costados despejados)", priority: 1, cooldownMs: 1800, category: "traffic", ttsDefault: "Libre" },

  // PRIORIDAD 2: Banderas y Seguridad
  { folder: "Full Course Yellow", label: "Full Course Yellow (FCY)", priority: 2, cooldownMs: 18000, category: "flags", ttsDefault: "Atención, Full Course Yellow en pista" },
  { folder: "Bandera Amarilla", label: "Bandera amarilla", priority: 2, cooldownMs: 14000, category: "flags", ttsDefault: "Atención, bandera amarilla" },
  { folder: "Bandera Azul", label: "Bandera azul", priority: 2, cooldownMs: 16000, category: "flags", ttsDefault: "Bandera azul, coche rápido detrás" },
  { folder: "Bandera Negra", label: "Bandera negra / Penalización", priority: 2, cooldownMs: 25000, category: "flags", ttsDefault: "Atención, tenemos una penalización" },
  { folder: "Bandera Verde", label: "Bandera verde", priority: 2, cooldownMs: 10000, category: "flags", ttsDefault: "Bandera verde, pista libre" },

  // PRIORIDAD 3: Estrategia y Boxes
  { folder: "Box Esta Vuelta", label: "Box en esta vuelta (<1.2 vueltas)", priority: 3, cooldownMs: 35000, category: "strategy", ttsDefault: "Box en esta vuelta, combustible crítico" },
  { folder: "Combustible Bajo", label: "Combustible bajo (<2.5 vueltas)", priority: 3, cooldownMs: 45000, category: "strategy", ttsDefault: "Atención, quedan dos vueltas de combustible" },
  { folder: "Entrada Boxes", label: "Entrada a calle de boxes", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Entrando a calle de boxes, vigila la velocidad" },
  { folder: "Salida Boxes", label: "Salida de boxes a pista", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Saliendo de boxes, cuidado con la línea blanca" },
  { folder: "Limitador Pit", label: "Limitador de boxes activado", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Limitador activado" },

  // PRIORIDAD 4: Estado del Coche y Neumáticos
  { folder: "Daños Coche", label: "Daños en el coche / Motor", priority: 4, cooldownMs: 30000, category: "car", ttsDefault: "Atención, hemos sufrido daños en el coche" },
  { folder: "Neumaticos Frios", label: "Neumáticos fríos", priority: 4, cooldownMs: 45000, category: "car", ttsDefault: "Cuidado con los neumáticos fríos" },
  { folder: "Neumaticos Calientes", label: "Neumáticos sobrecalentados", priority: 4, cooldownMs: 45000, category: "car", ttsDefault: "Cuidado, neumáticos sobrecalentados" },

  // PRIORIDAD 5: Ritmo y Carrera
  { folder: "Mejor Vuelta", label: "Mejor vuelta personal", priority: 5, cooldownMs: 15000, category: "session", ttsDefault: "Gran vuelta, mejor tiempo personal" },
  { folder: "Ultima Vuelta", label: "Última vuelta", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Última vuelta" },
  { folder: "Final Carrera", label: "Final de carrera (Bandera a cuadros)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Bandera a cuadros, final de carrera" },
];

const EVENT_MAP = new Map<string, SpotterEventDef>(SPOTTER_EVENTS.map((e) => [e.folder, e]));

interface QueuedClip {
  event: SpotterEventDef;
  enqueuedAt: number;
}

class SpotterEngine {
  manifest = $state<Record<string, Record<string, string[]>>>({
    Sara: {},
    Antonio: {},
  });
  lastEvent = $state<string | null>(null);
  playing = $state(false);

  private lastPlayedFile = new Map<string, string>();
  private lastTriggeredAt = new Map<string, number>();
  private currentAudio: HTMLAudioElement | null = null;
  private currentPriority: SpotterPriority | null = null;
  private currentStartedAt = 0;
  private queue: QueuedClip[] = [];
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /** Plays a short WEC race-radio mic click/chirp on PTT open or close. */
  private playRadioClick(opening: boolean, volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(opening ? 1950 : 1350, now);
      if (opening) osc.frequency.exponentialRampToValueAtTime(2400, now + 0.035);
      else osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume * 0.14, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Ignore if audio context not unlocked yet
    }
  }

  /** Routes an HTMLAudioElement through a WEC walkie-talkie bandpass filter (380 Hz - 3300 Hz). */
  private applyRadioFilter(audio: HTMLAudioElement, volume: number) {
    const ctx = this.getAudioContext();
    if (!ctx) {
      audio.volume = volume;
      return;
    }
    try {
      const src = ctx.createMediaElementSource(audio);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 380;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3300;

      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1650;
      mid.Q.value = 1.4;
      mid.gain.value = 6.5;

      const gain = ctx.createGain();
      gain.gain.value = volume * 1.15;

      src.connect(hp);
      hp.connect(mid);
      mid.connect(lp);
      lp.connect(gain);
      gain.connect(ctx.destination);
    } catch {
      audio.volume = volume;
    }
  }

  // Telemetry state tracking to prevent loops
  private lateralState: "clear" | "left" | "right" | "three" = "clear";
  private lateralSince = 0;
  private clearCandidateSince = 0;
  private hadFcy = false;
  private hadYellow = false;
  private hadBlue = false;
  private lastPenalties = 0;
  private lastSpeedLimiter = false;
  private lastInPits: boolean | null = null;
  private warnedFuelLow = false;
  private warnedBoxNow = false;
  private lastDentsMax = 0;
  private lastDetached = false;
  private lastCompletedLaps = -1;
  private lastBestLap = 0;
  private calledLastLap = false;
  private calledFinish = false;

  constructor() {
    if (typeof window !== "undefined") {
      void this.refreshManifest();
    }
  }

  async refreshManifest() {
    try {
      const data = await api.getSpotterManifest();
      if (data && typeof data === "object" && Object.keys(data).length > 0) {
        this.manifest = data;
        return;
      }
    } catch {}
    try {
      const res = await fetch("/__spotter_files", { cache: "no-store" });
      if (res.ok && res.headers.get("content-type")?.includes("json")) {
        this.manifest = await res.json();
      }
    } catch {
      // Fallback if running without Vite middleware
    }
  }

  get availableProfiles(): string[] {
    const keys = new Set(["Sara", "Antonio", ...Object.keys(this.manifest)]);
    return [...keys];
  }

  getFilesFor(profile: string, folder: string): string[] {
    const dynamic = this.manifest[profile]?.[folder];
    if (dynamic && dynamic.length > 0) return dynamic;
    if (profile === "Sara" || profile === "Antonio") {
      return [1, 2, 3].map(
        (n) => `/Perfil/${encodeURIComponent(profile)}/${encodeURIComponent(folder)}/Audio${n}.wav`,
      );
    }
    return [];
  }

  /** Picks a random file from the folder without repeating the immediately previous one. */
  private pickRandomUrl(profile: string, folder: string): string | null {
    const files = this.getFilesFor(profile, folder);
    if (files.length === 0) return null;
    if (files.length === 1) return files[0];
    const key = `${profile}::${folder}`;
    const prev = this.lastPlayedFile.get(key);
    const pool = files.filter((f) => f !== prev);
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? files[0];
    this.lastPlayedFile.set(key, chosen);
    return chosen;
  }

  /** Trigger a spotter event respecting priority, cooldowns, and anti-loop rules. */
  trigger(folder: string, force = false) {
    const cfg = config.value.spotter;
    if (!force && !cfg?.enabled) return;

    const def = EVENT_MAP.get(folder);
    if (!def) return;

    if (!force) {
      if (def.category === "traffic" && !cfg.traffic) return;
      if (def.category === "flags" && !cfg.flags) return;
      if (def.category === "strategy" && !cfg.strategy) return;
      if (def.category === "car" && !cfg.carStatus) return;
      if (def.category === "session" && !cfg.session) return;

      const now = performance.now();
      const last = this.lastTriggeredAt.get(folder) ?? -Infinity;
      if (now - last < def.cooldownMs) return;
      this.lastTriggeredAt.set(folder, now);
    }

    const now = performance.now();

    // If currently playing something:
    if (this.playing && this.currentPriority != null) {
      const canInterrupt =
        force ||
        def.priority < this.currentPriority ||
        (def.priority === 1 && this.currentPriority === 1 && now - this.currentStartedAt > 280);

      if (canInterrupt) {
        this.stopCurrent();
        this.playNow(def);
        return;
      }

      // Do not queue low-priority messages (P4/P5) while busy to avoid chatter loops
      if (def.priority >= 4) return;

      // Replace or append in short priority queue (max 2 items)
      this.queue = this.queue.filter((q) => q.event.folder !== def.folder && now - q.enqueuedAt < 3000);
      this.queue.push({ event: def, enqueuedAt: now });
      this.queue.sort((a, b) => a.event.priority - b.event.priority);
      if (this.queue.length > 2) this.queue.length = 2;
      return;
    }

    this.playNow(def);
  }

  private stopCurrent() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.playing = false;
    this.currentPriority = null;
  }

  private playNextInQueue() {
    const now = performance.now();
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (now - next.enqueuedAt <= 3200) {
        this.playNow(next.event);
        return;
      }
    }
  }

  private playNow(def: SpotterEventDef) {
    const cfg = config.value.spotter;
    const profile = cfg?.profile || "Sara";
    const volume = Math.max(0, Math.min(1, cfg?.volume ?? 0.85));
    const useRadio = cfg?.radioEffect ?? true;

    this.lastEvent = `${profile}: ${def.folder}`;
    this.playing = true;
    this.currentPriority = def.priority;
    this.currentStartedAt = performance.now();

    if (useRadio) this.playRadioClick(true, volume);

    const url = this.pickRandomUrl(profile, def.folder);

    if (url) {
      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      if (useRadio) this.applyRadioFilter(audio, volume);
      else audio.volume = volume;
      this.currentAudio = audio;
      const done = () => {
        if (this.currentAudio === audio) {
          if (useRadio) this.playRadioClick(false, volume);
          this.currentAudio = null;
          this.playing = false;
          this.currentPriority = null;
          this.playNextInQueue();
        }
      };
      audio.onended = done;
      audio.onerror = () => {
        if (cfg?.ttsFallback) this.speakFallback(def.ttsDefault, profile, volume, done);
        else done();
      };
      audio.play().catch(() => {
        if (cfg?.ttsFallback) this.speakFallback(def.ttsDefault, profile, volume, done);
        else done();
      });
      return;
    }

    // Also try conventional filenames Audio1.wav..Audio3.wav or 1.wav..3.wav before TTS fallback
    const candidates = ["Audio1.wav", "Audio2.wav", "Audio3.wav"];
    const randomCandidate = candidates[Math.floor(Math.random() * candidates.length)];
    const directUrl = `/Perfil/${encodeURIComponent(profile)}/${encodeURIComponent(def.folder)}/${randomCandidate}`;

    const probeAudio = new Audio(directUrl);
    probeAudio.crossOrigin = "anonymous";
    if (useRadio) this.applyRadioFilter(probeAudio, volume);
    else probeAudio.volume = volume;
    this.currentAudio = probeAudio;
    const done = () => {
      if (this.currentAudio === probeAudio) {
        if (useRadio) this.playRadioClick(false, volume);
        this.currentAudio = null;
        this.playing = false;
        this.currentPriority = null;
        this.playNextInQueue();
      }
    };
    probeAudio.onended = done;
    probeAudio.onerror = () => {
      if (cfg?.ttsFallback ?? true) {
        this.speakFallback(def.ttsDefault, profile, volume, done);
      } else {
        done();
      }
    };
    probeAudio.play().catch(() => {
      if (cfg?.ttsFallback ?? true) {
        this.speakFallback(def.ttsDefault, profile, volume, done);
      } else {
        done();
      }
    });
  }

  private speakFallback(text: string, profile: string, volume: number, onDone: () => void) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onDone();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-ES";
      u.volume = volume;
      u.rate = 1.12;
      u.pitch = profile.toLowerCase().includes("antonio") ? 0.88 : 1.08;
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("es"));
      if (voices.length > 0) {
        const wantMale = profile.toLowerCase().includes("antonio");
        const matched = voices.find((v) =>
          wantMale
            ? /pablo|alvaro|jorge|raul|antonio|male/i.test(v.name)
            : /helena|laura|sabina|elvira|sara|monica|paulina|female/i.test(v.name),
        );
        if (matched) u.voice = matched;
        else u.voice = voices[0];
      }
      u.onend = onDone;
      u.onerror = onDone;
      window.speechSynthesis.speak(u);
    } catch {
      onDone();
    }
  }

  /** Evaluates a live telemetry snapshot and triggers appropriate spotter calls without looping. */
  update(snap: Snapshot | null) {
    const cfg = config.value.spotter;
    if (!cfg?.enabled || !snap?.player) return;

    const p = snap.player;
    const s = snap.session;
    const st = snap.strategy;
    const me = snap.vehicles.find((v) => v.isPlayer);
    const now = performance.now();

    // -------------------------------------------------------------------------
    // 1. PRIORITY 1: Side-by-side Traffic Spotter with Hysteresis
    // -------------------------------------------------------------------------
    if (!p.inPits && p.speed > 8) {
      let hasLeft = false;
      let hasRight = false;
      const enterLat = this.lateralState === "clear" ? 2.85 : 3.45;
      const enterLon = this.lateralState === "clear" ? 4.5 : 5.5;

      for (const v of snap.vehicles) {
        if (v.isPlayer || v.inPits) continue;
        const wx = v.pos[0] - p.pos[0];
        const wz = v.pos[2] - p.pos[2];
        const distSq = wx * wx + wz * wz;
        if (distSq > 64) continue;
        // Transform to player-local coordinates:
        // player forward unit vector = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
        const cos = Math.cos(p.yaw);
        const sin = Math.sin(p.yaw);
        const dx = wx * cos - wz * sin;
        const dz = -wx * sin - wz * cos;

        if (Math.abs(dz) <= enterLon && Math.abs(dx) <= enterLat) {
          if (dx < -0.4) hasLeft = true;
          else if (dx > 0.4) hasRight = true;
        }
      }

      const nextState: "clear" | "left" | "right" | "three" =
        hasLeft && hasRight ? "three" : hasLeft ? "left" : hasRight ? "right" : "clear";

      if (nextState !== "clear") {
        this.clearCandidateSince = 0;
        if (nextState !== this.lateralState) {
          if (this.lateralState === "clear") this.lateralSince = now;
          this.lateralState = nextState;
          if (nextState === "three") this.trigger("Tres en Paralelo");
          else if (nextState === "left") this.trigger("Coche Izquierda");
          else if (nextState === "right") this.trigger("Coche Derecha");
        }
      } else if (this.lateralState !== "clear") {
        if (this.clearCandidateSince === 0) {
          this.clearCandidateSince = now;
        } else if (now - this.clearCandidateSince > 420) {
          // Only call "Libre" if a car was alongside for at least 350ms
          if (now - this.lateralSince > 350) {
            this.trigger("Libre");
          }
          this.lateralState = "clear";
          this.clearCandidateSince = 0;
        }
      }
    } else {
      this.lateralState = "clear";
    }

    // -------------------------------------------------------------------------
    // 2. PRIORITY 2: Flags & Track Safety
    // -------------------------------------------------------------------------
    const isFcy = s.phase === 6 || s.yellowFlagState > 0;
    if (isFcy && !this.hadFcy) {
      this.trigger("Full Course Yellow");
    }
    this.hadFcy = isFcy;

    const anyYellow = isFcy || Boolean(me && !me.inPits && s.sectorYellow[me.sector - 1]);
    if (anyYellow && !this.hadYellow && !isFcy) {
      this.trigger("Bandera Amarilla");
    } else if (!anyYellow && this.hadYellow && s.phase === 5) {
      this.trigger("Bandera Verde");
    }
    this.hadYellow = anyYellow;

    const isBlue = me?.flag === 6;
    if (isBlue && !this.hadBlue) {
      this.trigger("Bandera Azul");
    }
    this.hadBlue = isBlue;

    const curPenalties = me?.numPenalties ?? 0;
    if (curPenalties > this.lastPenalties && curPenalties > 0) {
      this.trigger("Bandera Negra");
    }
    this.lastPenalties = curPenalties;

    // -------------------------------------------------------------------------
    // 3. PRIORITY 3: Fuel / Energy, Pit Entry/Exit & Pit Limiter
    // -------------------------------------------------------------------------
    if (this.lastInPits !== null && p.inPits !== this.lastInPits) {
      if (p.inPits) this.trigger("Entrada Boxes");
      else this.trigger("Salida Boxes");
    }
    this.lastInPits = p.inPits;

    // Trigger pit limiter voice after limiter is active for >1 tick (filters 50ms gear cut spikes)
    if (p.speedLimiter) {
      this.speedLimiterTicks = (this.speedLimiterTicks ?? 0) + 1;
    } else {
      this.speedLimiterTicks = 0;
    }
    const isPitLimiter = (this.speedLimiterTicks ?? 0) >= 2;
    if (isPitLimiter && !this.lastSpeedLimiter) {
      this.trigger("Limitador Pit");
    }
    this.lastSpeedLimiter = isPitLimiter;

    if (p.inPits) {
      this.warnedFuelLow = false;
      this.warnedBoxNow = false;
    } else if (st.samples > 0 && st.lapsOfFuel > 0) {
      const lapsRem = st.lapsOfVe > 0 ? Math.min(st.lapsOfFuel, st.lapsOfVe) : st.lapsOfFuel;
      if (lapsRem < 1.2 && !this.warnedBoxNow) {
        this.warnedBoxNow = true;
        this.warnedFuelLow = true;
        this.trigger("Box Esta Vuelta");
      } else if (lapsRem < 2.5 && !this.warnedFuelLow) {
        this.warnedFuelLow = true;
        this.trigger("Combustible Bajo");
      }
    }

    // -------------------------------------------------------------------------
    // 4. PRIORITY 4: Car Damage & Tyre Temps
    // -------------------------------------------------------------------------
    const maxDent = Math.max(0, ...p.dents);
    const hasNewDamage = maxDent > this.lastDentsMax || (p.detached && !this.lastDetached);
    if (hasNewDamage && p.lapNumber >= 0) {
      this.trigger("Daños Coche");
    }
    this.lastDentsMax = maxDent;
    this.lastDetached = p.detached;

    if (!p.inPits && p.speed > 25 && p.wheels.length === 4) {
      const avgTemp =
        p.wheels.reduce((acc, w) => acc + (w.surfaceTemp[0] + w.surfaceTemp[1] + w.surfaceTemp[2]) / 3, 0) / 4;
      if (avgTemp > 112) {
        this.trigger("Neumaticos Calientes");
      } else if (avgTemp > 10 && avgTemp < 52 && p.lapDist < 1200) {
        this.trigger("Neumaticos Frios");
      }
    }

    // -------------------------------------------------------------------------
    // 5. PRIORITY 5: Lap Records & Session Milestones
    // -------------------------------------------------------------------------
    const completedLaps = me?.totalLaps ?? p.lapNumber;
    const pb = snap.timing.personalBest;
    if (this.lastCompletedLaps >= 0 && completedLaps > this.lastCompletedLaps) {
      if (pb > 0 && (this.lastBestLap === 0 || pb < this.lastBestLap - 0.001)) {
        this.lastBestLap = pb;
        this.trigger("Mejor Vuelta");
      }
      if (s.maxLaps > 0 && completedLaps === s.maxLaps - 1 && !this.calledLastLap) {
        this.calledLastLap = true;
        this.trigger("Ultima Vuelta");
      }
    }
    this.lastCompletedLaps = completedLaps;
    if (pb > 0 && this.lastBestLap === 0) this.lastBestLap = pb;

    const isCheckered = s.phase === 8;
    if (isCheckered && !this.calledFinish) {
      this.calledFinish = true;
      this.trigger("Final Carrera");
    } else if (!isCheckered) {
      this.calledFinish = false;
    }
  }
}

export const spotter = new SpotterEngine();
