import { emit, listen } from "@tauri-apps/api/event";
import { config } from "./config.svelte";
import { api, isNativeTauri } from "./api";
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
  // PRIORIDAD 1: Tráfico en paralelo (Inmediato e interrumpible)
  { folder: "Coche Izquierda", label: "Coche a la izquierda", priority: 1, cooldownMs: 2500, category: "traffic", ttsDefault: "Coche a la izquierda" },
  { folder: "Coche Derecha", label: "Coche a la derecha", priority: 1, cooldownMs: 2500, category: "traffic", ttsDefault: "Coche a la derecha" },
  { folder: "Tres en Paralelo", label: "Tres en paralelo", priority: 1, cooldownMs: 2500, category: "traffic", ttsDefault: "Cuidado, tres en paralelo" },
  { folder: "Libre", label: "Pista libre (costados despejados)", priority: 1, cooldownMs: 1800, category: "traffic", ttsDefault: "Libre" },

  // PRIORIDAD 2: Banderas, Salida y Seguridad
  { folder: "Salida Carrera", label: "Salida de carrera (Semáforo verde)", priority: 2, cooldownMs: 40000, category: "flags", ttsDefault: "¡Luces fuera, estamos en carrera! Cuidado en la primera curva, todos juntos." },
  { folder: "Full Course Yellow", label: "Full Course Yellow (FCY)", priority: 2, cooldownMs: 18000, category: "flags", ttsDefault: "Atención, Full Course Yellow en pista" },
  { folder: "Bandera Amarilla", label: "Bandera amarilla", priority: 2, cooldownMs: 14000, category: "flags", ttsDefault: "Atención, bandera amarilla" },
  { folder: "Bandera Azul", label: "Bandera azul", priority: 2, cooldownMs: 16000, category: "flags", ttsDefault: "Bandera azul, coche rápido detrás" },
  { folder: "Bandera Negra", label: "Bandera negra / Penalización", priority: 2, cooldownMs: 25000, category: "flags", ttsDefault: "Atención, tenemos una penalización" },
  { folder: "Vuelta Cancelada", label: "Vuelta anulada (Límites de pista)", priority: 2, cooldownMs: 15000, category: "flags", ttsDefault: "Vuelta anulada por límites de pista. Enfría gomas y prepara la siguiente." },
  { folder: "Bandera Verde", label: "Bandera verde", priority: 2, cooldownMs: 10000, category: "flags", ttsDefault: "Bandera verde, pista libre" },
  { folder: "Lluvia Inminente", label: "Comienzo de lluvia", priority: 2, cooldownMs: 35000, category: "flags", ttsDefault: "Atención, están cayendo las primeras gotas en pista. Precaución, la superficie resbala." },

  // PRIORIDAD 3: Estrategia, Boxes y Combustible
  { folder: "Box Esta Vuelta", label: "Box en esta vuelta (<1.2 vueltas)", priority: 3, cooldownMs: 35000, category: "strategy", ttsDefault: "Box en esta vuelta, combustible crítico" },
  { folder: "Combustible Bajo", label: "Combustible bajo (<2.5 vueltas)", priority: 3, cooldownMs: 45000, category: "strategy", ttsDefault: "Atención, quedan dos vueltas de combustible" },
  { folder: "Entrada Boxes", label: "Entrada a calle de boxes", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Entrando a calle de boxes, vigila la velocidad" },
  { folder: "Salida Boxes", label: "Salida de boxes a pista", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Saliendo de boxes, cuidado con la línea blanca" },
  { folder: "Salida Pit Lane", label: "Salida del pit lane (Línea de boxes)", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Fin de pit lane, limitador fuera. Gas a fondo, a por ellos." },
  { folder: "Parada Exitosa", label: "Salida de parada limpia", priority: 3, cooldownMs: 35000, category: "strategy", ttsDefault: "Buena parada de boxes. Ruedas nuevas y depósito listo, a por ellos." },
  { folder: "Limitador Pit", label: "Limitador de boxes activado", priority: 3, cooldownMs: 15000, category: "strategy", ttsDefault: "Limitador activado" },
  { folder: "Pista Secandose", label: "Pista secándose", priority: 3, cooldownMs: 45000, category: "strategy", ttsDefault: "La lluvia ha cesado y la pista empieza a secarse, cuida neumáticos o prepara slicks." },

  // PRIORIDAD 4: Estado del Coche y Daños
  { folder: "Daños Coche", label: "Daños en el coche / Motor", priority: 4, cooldownMs: 30000, category: "car", ttsDefault: "Atención, hemos sufrido daños en el coche" },
  { folder: "Abandono DNF", label: "Abandono / DNF", priority: 4, cooldownMs: 60000, category: "car", ttsDefault: "Una lástima, tenemos daños graves y debemos retirar el coche. Apaga el motor con seguridad." },
  { folder: "Neumaticos Frios", label: "Neumáticos fríos", priority: 4, cooldownMs: 45000, category: "car", ttsDefault: "Cuidado con los neumáticos fríos" },
  { folder: "Neumaticos Calientes", label: "Neumáticos sobrecalentados", priority: 4, cooldownMs: 45000, category: "car", ttsDefault: "Cuidado, neumáticos sobrecalentados" },

  // PRIORIDAD 4: Lucha y Presión en pista
  { folder: "Trafico Salida Boxes", label: "Tráfico en recta al salir de boxes", priority: 2, cooldownMs: 18000, category: "traffic", ttsDefault: "¡Atención! Tráfico rápido en recta de meta, cede el paso al incorporarte." },
  { folder: "Coche Delante Cerca", label: "Rival delante a tiro (< 0.8s)", priority: 4, cooldownMs: 30000, category: "traffic", ttsDefault: "Tienes al coche de delante a tiro de rebufo, presiónale, cometerá un error." },
  { folder: "Presion Detras", label: "Presión por detrás (< 0.6s)", priority: 4, cooldownMs: 25000, category: "traffic", ttsDefault: "Tienes a un rival pegado detrás a pocas décimas, defiende el interior." },
  { folder: "Trafico Delante", label: "Tráfico de otra categoría / Doblados", priority: 4, cooldownMs: 25000, category: "traffic", ttsDefault: "Tráfico de otra categoría delante, busca una salida limpia sin comprometer tu trazada." },

  // PRIORIDAD 5: Ritmo, Adelantamientos y Momentos de Carrera
  { folder: "Salida a Pista", label: "Coche sale a pista (Inicio de tanda)", priority: 3, cooldownMs: 30000, category: "session", ttsDefault: "Radio check, te recibo alto y claro. Coche en pista, calienta neumáticos y frenos con calma." },
  { folder: "Sector Verde", label: "Sector verde (Mejora personal)", priority: 4, cooldownMs: 6000, category: "session", ttsDefault: "Sector {sector} en verde, mejorando tu marca personal." },
  { folder: "Sector Purpura", label: "Sector púrpura (Récord de sesión)", priority: 4, cooldownMs: 6000, category: "session", ttsDefault: "¡Sector {sector} en púrpura! El más rápido de la sesión." },
  { folder: "Posicion Ganada", label: "Posición ganada (Adelantamiento)", priority: 5, cooldownMs: 12000, category: "session", ttsDefault: "¡Buena esa! Posición ganada, estás en P{place}. Ahora abre hueco y marca tu ritmo." },
  { folder: "Posicion Perdida", label: "Posición perdida", priority: 5, cooldownMs: 12000, category: "session", ttsDefault: "Hemos perdido la posición, estás en P{place}. Cabeza fría, mantén el ritmo y te la devuelves." },
  { folder: "Lider Carrera", label: "Líder de carrera (P1 en pista)", priority: 5, cooldownMs: 30000, category: "session", ttsDefault: "P1. Eres el líder de la carrera, gestiona el ritmo y cuida gomas." },
  { folder: "Mejor Vuelta", label: "Mejor vuelta personal", priority: 5, cooldownMs: 15000, category: "session", ttsDefault: "Gran vuelta, mejor tiempo personal" },
  { folder: "Mitad Carrera", label: "Ecuador de carrera (50%)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Mitad de carrera completada. El ritmo es bueno, mantén la consistencia." },
  { folder: "Ultima Vuelta", label: "Última vuelta", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Última vuelta de carrera, dalo todo." },

  // PRIORIDAD 5: Final de Carrera según Resultado
  { folder: "Victoria", label: "Final: Victoria (P1 Ganador)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "¡Siii! ¡Victoria! ¡P1! ¡Qué carrerón te has marcado, increíble trabajo de todo el equipo!" },
  { folder: "Podio", label: "Final: Podio (P2 o P3)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "¡Bandera a cuadros! ¡Estamos en el podio, P{place}! Gran carrera y valiosos puntos, fantástico trabajo." },
  { folder: "Top 10", label: "Final: En los puntos (P4 - P10)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Bandera a cuadros. Terminamos en P{place}. Carrera sólida con buenos puntos para el equipo. Buen esfuerzo." },
  { folder: "Final Dificil", label: "Final: Carrera difícil (> P10 o daños)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Bandera a cuadros. Día complicado hoy en pista. Trae el coche a boxes, analizaremos los datos para la próxima." },
  { folder: "Final Carrera", label: "Final: Bandera a cuadros estándar", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Bandera a cuadros, final de carrera" },
];

const EVENT_MAP = new Map<string, SpotterEventDef>(SPOTTER_EVENTS.map((e) => [e.folder, e]));

interface QueuedClip {
  event: SpotterEventDef;
  enqueuedAt: number;
  context?: { place?: number; classPlace?: number; sector?: number };
}

export interface ActiveSpotterTransmission {
  folder: string;
  label: string;
  priority: SpotterPriority;
  text: string;
  profile: string;
  category: "traffic" | "flags" | "strategy" | "car" | "session";
  startedAt: number;
}

class SpotterEngine {
  manifest = $state<Record<string, Record<string, string[]>>>({
    Sara: {},
    Antonio: {},
  });
  lastEvent = $state<string | null>(null);
  playing = $state(false);
  currentTransmission = $state<ActiveSpotterTransmission | null>(null);

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

  /** Public tester for the mic beep from Settings. */
  public playMicBeep(opening: boolean) {
    const vol = config.value.widgets?.spotter?.options?.beepsVolume ?? config.value.spotter?.beepsVolume ?? config.value.spotter?.volume ?? 0.85;
    this.playRadioClick(opening, vol);
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

  // Telemetry state tracking to prevent loops and chatter
  private lateralState: "clear" | "left" | "right" | "three" = "clear";
  private lateralSince = 0;
  private clearCandidateSince = 0;
  private hadFcy = false;
  private hadYellow = false;
  private hadBlue = false;
  private lastPenalties = 0;
  private lastSpeedLimiter = false;
  private speedLimiterTicks = 0;
  private lastInPits: boolean | null = null;
  private wasInPitStop = false;
  private wasRecentlyInPits = false;
  private lastPitExitTime = 0;
  private warnedFuelLow = false;
  private warnedBoxNow = false;
  private lastDentsMax = 0;
  private lastDetached = false;
  private lastCompletedLaps = -1;
  private lastBestLap = 0;
  private calledLastLap = false;
  private calledFinish = false;
  private calledRaceStart = false;
  private calledHalfRace = false;
  private calledDnf = false;
  private lastPhase: number | null = null;
  private lastTrackPlace: number | null = null;
  private aheadCloseTicks = 0;
  private behindCloseTicks = 0;
  private lastRain: number | null = null;
  private wasDriving = false;
  private lastSector: number | null = null;
  private lastLapInvalidated = false;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      void this.refreshManifest();

      // Sincronización entre ventanas (Companion <-> Overlay)
      if (isNativeTauri()) {
        void listen<{ transmission: ActiveSpotterTransmission | null; playing: boolean }>(
          "spotter-transmission-change",
          (event) => {
            if (event.payload) {
              this.currentTransmission = event.payload.transmission;
              this.playing = event.payload.playing;
            }
          }
        );
      }

      if (typeof BroadcastChannel !== "undefined") {
        try {
          this.broadcastChannel = new BroadcastChannel("mdt-spotter-sync");
          this.broadcastChannel.onmessage = (event) => {
            if (event.data && typeof event.data === "object") {
              this.currentTransmission = event.data.transmission;
              this.playing = event.data.playing;
            }
          };
        } catch {}
      }
    }
  }

  private broadcastState() {
    const payload = {
      transmission: this.currentTransmission,
      playing: this.playing,
    };
    if (isNativeTauri()) {
      void emit("spotter-transmission-change", payload);
    }
    try {
      this.broadcastChannel?.postMessage(payload);
    } catch {}
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
    const profObj = this.manifest[profile];
    if (profObj) {
      let list: string[] = [];
      if (profObj[folder] && profObj[folder].length > 0) {
        list = profObj[folder];
      } else {
        // Case-insensitive lookup (e.g. "Bandera Amarilla" vs "Bandera amarilla")
        const targetLower = folder.toLowerCase().trim();
        for (const [k, v] of Object.entries(profObj)) {
          if (k.toLowerCase().trim() === targetLower && v.length > 0) {
            list = v;
            break;
          }
        }
      }
      // Filtrar y excluir estrictamente cualquier archivo residual "Audio(n).wav"
      return list.filter((url) => !/\/audio\d+/i.test(decodeURIComponent(url)));
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
  trigger(folder: string, force = false, context?: { place?: number; classPlace?: number; sector?: number }) {
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
        this.playNow(def, context);
        return;
      }

      // Do not queue low-priority messages (P4/P5) while busy to avoid chatter loops
      if (def.priority >= 4) return;

      // Replace or append in short priority queue (max 2 items)
      this.queue = this.queue.filter((q) => q.event.folder !== def.folder && now - q.enqueuedAt < 3000);
      this.queue.push({ event: def, enqueuedAt: now, context });
      this.queue.sort((a, b) => a.event.priority - b.event.priority);
      if (this.queue.length > 2) this.queue.length = 2;
      return;
    }

    this.playNow(def, context);
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
    this.currentTransmission = null;
    this.broadcastState();
  }

  private playNextInQueue() {
    const now = performance.now();
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (now - next.enqueuedAt <= 3200) {
        this.playNow(next.event, next.context);
        return;
      }
    }
  }

  private playNow(def: SpotterEventDef, context?: { place?: number; classPlace?: number; sector?: number }) {
    const cfg = config.value.spotter;
    const profile = cfg?.profile || "Sara";
    const volume = Math.max(0, Math.min(1, cfg?.volume ?? 0.85));
    const useRadio = cfg?.radioEffect ?? true;

    // Substitute dynamic tokens in default TTS string
    let ttsText = def.ttsDefault;
    const pos = context?.classPlace || context?.place;
    if (pos) {
      ttsText = ttsText.replace(/\{place\}/g, String(pos));
    }
    if (context?.sector != null) {
      ttsText = ttsText.replace(/\{sector\}/g, String(context.sector));
    }

    this.lastEvent = `${profile}: ${def.folder}`;
    this.playing = true;
    this.currentPriority = def.priority;
    this.currentStartedAt = performance.now();
    this.currentTransmission = {
      folder: def.folder,
      label: def.label,
      priority: def.priority,
      text: ttsText,
      profile,
      category: def.category,
      startedAt: this.currentStartedAt,
    };
    this.broadcastState();

    const wSpotter = config.value.widgets?.spotter?.options;
    const beepsVol = Math.max(0, Math.min(1, wSpotter?.beepsVolume ?? cfg?.beepsVolume ?? volume));

    const playStartBeep = () => {
      const s = wSpotter?.startSound ?? cfg?.startSound ?? "1.mp3";
      if (!s || s === "none") return;
      if (s === "mic_click") {
        if (useRadio) this.playRadioClick(true, beepsVol);
        return;
      }
      const audio = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(s)}?t=${Date.now()}`);
      audio.volume = beepsVol;
      audio.play().catch(() => {});
    };

    const playEndBeep = () => {
      const s = wSpotter?.endSound ?? cfg?.endSound ?? "f1-radio-end.mp3";
      if (!s || s === "none") return;
      if (s === "mic_click") {
        if (useRadio) this.playRadioClick(false, beepsVol);
        return;
      }
      const audio = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(s)}?t=${Date.now()}`);
      audio.volume = beepsVol;
      audio.play().catch(() => {});
    };

    playStartBeep();

    const finishTransmission = () => {
      setTimeout(() => {
        if (!this.playing) {
          this.currentTransmission = null;
          this.broadcastState();
        }
      }, 1200);
    };

    const url = this.pickRandomUrl(profile, def.folder);

    if (url) {
      const buster = url.includes("?") ? `&t=${Date.now()}` : `?t=${Date.now()}`;
      const audio = new Audio(`${url}${buster}`);
      audio.crossOrigin = "anonymous";
      if (useRadio) this.applyRadioFilter(audio, volume);
      else audio.volume = volume;
      this.currentAudio = audio;
      const done = () => {
        if (this.currentAudio === audio) {
          playEndBeep();
          this.currentAudio = null;
          this.playing = false;
          this.currentPriority = null;
          this.broadcastState();
          finishTransmission();
          this.playNextInQueue();
        }
      };
      audio.onended = done;
      audio.onerror = () => {
        if (cfg?.ttsFallback) this.speakFallback(ttsText, profile, volume, done);
        else done();
      };
      audio.play().catch(() => {
        if (cfg?.ttsFallback) this.speakFallback(ttsText, profile, volume, done);
        else done();
      });
      return;
    }

    // No hay archivos de audio para este evento en el perfil -> Fallback a TTS o fin
    const fallbackDone = () => {
      playEndBeep();
      this.playing = false;
      this.currentPriority = null;
      this.broadcastState();
      finishTransmission();
      this.playNextInQueue();
    };

    if (cfg?.ttsFallback ?? true) {
      this.speakFallback(ttsText, profile, volume, fallbackDone);
    } else {
      fallbackDone();
    }
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

    // Start of driving stint / leaving garage into the game
    const isDriving = Boolean(snap.inRealtime && !me?.inGarage && p.speed > 1.2);
    if (isDriving && !this.wasDriving) {
      this.wasDriving = true;
      this.trigger("Salida a Pista");
    } else if (!snap.inRealtime || Boolean(me?.inGarage)) {
      this.wasDriving = false;
    }

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
    // 2. PRIORITY 2: Flags, Race Start & Track Safety
    // -------------------------------------------------------------------------
    // Green flag race start
    if (s.kind === "race") {
      const isGreen = s.phase === 5;
      if (isGreen && this.lastPhase != null && this.lastPhase >= 2 && this.lastPhase <= 4 && !this.calledRaceStart) {
        this.calledRaceStart = true;
        this.trigger("Salida Carrera");
      }
      this.lastPhase = s.phase;
    }

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

    // Weather change: Rain start or track drying
    const rain = s.weather?.raining ?? 0;
    const wet = s.weather?.avgWetness ?? 0;
    if (this.lastRain != null) {
      if (this.lastRain < 0.05 && rain >= 0.05) {
        this.trigger("Lluvia Inminente");
      } else if (this.lastRain >= 0.1 && rain < 0.02 && wet > 0.15) {
        this.trigger("Pista Secandose");
      }
    }
    this.lastRain = rain;

    // -------------------------------------------------------------------------
    // 3. PRIORITY 3: Fuel / Energy, Pit Entry/Exit & Pit Limiter
    // -------------------------------------------------------------------------
    if (this.lastInPits !== null && p.inPits !== this.lastInPits) {
      if (p.inPits) {
        this.trigger("Entrada Boxes");
        this.wasInPitStop = true;
      } else {
        if (this.wasInPitStop) {
          this.trigger("Parada Exitosa");
          this.wasInPitStop = false;
        } else {
          this.trigger("Salida Boxes");
        }
        this.lastPitExitTime = now;
        this.wasRecentlyInPits = true;
        setTimeout(() => {
          this.wasRecentlyInPits = false;
        }, 15000);
      }
    }
    this.lastInPits = p.inPits;

    if (p.speedLimiter) {
      this.speedLimiterTicks = (this.speedLimiterTicks ?? 0) + 1;
    } else {
      this.speedLimiterTicks = 0;
    }
    const isPitLimiter = (this.speedLimiterTicks ?? 0) >= 2;
    if (isPitLimiter && !this.lastSpeedLimiter) {
      this.trigger("Limitador Pit");
    } else if (this.lastSpeedLimiter && !isPitLimiter && (p.inPits || this.wasRecentlyInPits || now - this.lastPitExitTime < 14000)) {
      // Exiting pit lane: check if fast traffic approaching in turn 1 / main straight
      let hasApproachingTraffic = false;
      for (const v of snap.vehicles) {
        if (v.isPlayer || v.inPits) continue;
        if (v.sector === 1 && v.lapDist < 420 && v.speed > 35) {
          hasApproachingTraffic = true;
          break;
        }
      }
      if (hasApproachingTraffic) {
        this.trigger("Trafico Salida Boxes");
      } else {
        this.trigger("Salida Pit Lane");
      }
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
    // 4. PRIORITY 4: Car Damage, DNF & Tyre Temps
    // -------------------------------------------------------------------------
    const maxDent = Math.max(0, ...p.dents);
    const hasNewDamage = maxDent > this.lastDentsMax || (p.detached && !this.lastDetached);
    if (hasNewDamage && p.lapNumber >= 0) {
      this.trigger("Daños Coche");
    }
    this.lastDentsMax = maxDent;
    this.lastDetached = p.detached;

    // DNF detection
    const isDnf =
      me?.finishStatus === 2 ||
      me?.finishStatus === 3 ||
      (p.engineState === 0 && maxDent > 0.6 && !p.inPits && p.speed < 1);
    if (isDnf && !this.calledDnf && s.kind === "race" && p.lapNumber >= 1) {
      this.calledDnf = true;
      this.trigger("Abandono DNF");
    }

    if (!p.inPits && p.speed > 25 && p.wheels.length === 4) {
      const avgTemp =
        p.wheels.reduce((acc, w) => acc + (w.surfaceTemp[0] + w.surfaceTemp[1] + w.surfaceTemp[2]) / 3, 0) / 4;
      if (avgTemp > 112) {
        this.trigger("Neumaticos Calientes");
      } else if (avgTemp > 10 && avgTemp < 52 && p.lapDist < 1200) {
        this.trigger("Neumaticos Frios");
      }
    }

    // Lucha directa y presión
    if (s.kind === "race" && me && !p.inPits && p.speed > 35) {
      // Rival ahead within 0.8s
      if (me.timeBehindNext > 0.05 && me.timeBehindNext <= 0.8) {
        this.aheadCloseTicks = (this.aheadCloseTicks ?? 0) + 1;
        if (this.aheadCloseTicks >= 40) {
          this.trigger("Coche Delante Cerca");
          this.aheadCloseTicks = 0;
        }
      } else {
        this.aheadCloseTicks = 0;
      }

      // Rival behind within 0.65s
      const rivalBehind = snap.vehicles.find((v) => v.place === me.place + 1);
      if (rivalBehind && !rivalBehind.inPits) {
        const gapBehind = rivalBehind.timeBehindLeader - me.timeBehindLeader;
        if (gapBehind > 0.05 && gapBehind <= 0.65) {
          this.behindCloseTicks = (this.behindCloseTicks ?? 0) + 1;
          if (this.behindCloseTicks >= 40) {
            this.trigger("Presion Detras");
            this.behindCloseTicks = 0;
          }
        } else {
          this.behindCloseTicks = 0;
        }
      } else {
        this.behindCloseTicks = 0;
      }

      // Traffic ahead from different class or lapped
      const rivalAhead = snap.vehicles.find((v) => v.place === me.place - 1);
      if (rivalAhead && !rivalAhead.inPits && me.timeBehindNext > 0.05 && me.timeBehindNext < 1.4) {
        const isDifferentClass = rivalAhead.class && me.class && rivalAhead.class !== me.class;
        const isLapped = rivalAhead.totalLaps < me.totalLaps;
        if (isDifferentClass || isLapped) {
          this.trigger("Trafico Delante");
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. PRIORITY 5: Lap Records, Overtakes, Mid-Race & Finish Result
    // -------------------------------------------------------------------------
    const completedLaps = me?.totalLaps ?? p.lapNumber;
    const pb = snap.timing.personalBest;

    // Lap milestone checks
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

    // Sector completion check (PB Green & Session Best Purple)
    const curSector = p.sector;
    if (this.lastSector != null && this.lastSector !== curSector && !p.inPits && !p.lapInvalidated && p.speed > 25) {
      let completedSectorIdx = -1;
      let sectorTime = 0;

      if (this.lastSector === 1 && curSector === 2) {
        completedSectorIdx = 0;
        sectorTime = snap.timing.currentSectors[0];
      } else if (this.lastSector === 2 && curSector === 3) {
        completedSectorIdx = 1;
        sectorTime = snap.timing.currentSectors[1];
      } else if (this.lastSector === 3 && curSector === 1) {
        completedSectorIdx = 2;
        sectorTime = snap.timing.lastSectors[2];
      }

      if (completedSectorIdx >= 0 && sectorTime > 0.5) {
        const sb = snap.timing.sessionBestSectors[completedSectorIdx];
        const pb = snap.timing.personalBestSectors[completedSectorIdx];
        const sectorNum = completedSectorIdx + 1;

        if (sb > 0 && sectorTime <= sb + 0.002) {
          this.trigger("Sector Purpura", false, { sector: sectorNum });
        } else if (pb > 0 && sectorTime <= pb + 0.002) {
          this.trigger("Sector Verde", false, { sector: sectorNum });
        }
      }
    }
    this.lastSector = curSector;

    // Lap invalidated / track limits
    if (p.lapInvalidated && !this.lastLapInvalidated && !p.inPits && p.speed > 25) {
      this.trigger("Vuelta Cancelada");
    }
    this.lastLapInvalidated = p.lapInvalidated;

    // Mid-race milestone
    if (s.kind === "race" && !this.calledHalfRace) {
      if (s.maxLaps > 4 && completedLaps >= Math.floor(s.maxLaps / 2)) {
        this.calledHalfRace = true;
        this.trigger("Mitad Carrera");
      } else if (s.endEt > 0 && s.currentEt >= s.endEt / 2 && s.endEt >= 300) {
        this.calledHalfRace = true;
        this.trigger("Mitad Carrera");
      }
    }

    // Overtakes / position change on track (filtering pit stop artifacts)
    if (s.kind === "race" && me && !p.inPits && p.speed > 25 && p.lapNumber >= 1) {
      const curPlace = me.place;
      if (this.lastTrackPlace !== null && this.lastTrackPlace > 0) {
        const diff = this.lastTrackPlace - curPlace;
        if (!this.wasRecentlyInPits && now - this.lastPitExitTime > 15000) {
          const ctx = { place: curPlace, classPlace: me.classPlace || curPlace };
          if (diff > 0) {
            if (curPlace === 1 || me.classPlace === 1) {
              this.trigger("Lider Carrera", false, ctx);
            } else {
              this.trigger("Posicion Ganada", false, ctx);
            }
          } else if (diff < 0) {
            this.trigger("Posicion Perdida", false, ctx);
          }
        }
      }
      this.lastTrackPlace = curPlace;
    }

    // Contextual Finish according to position
    const isCheckered = s.phase === 8 || (me?.finishStatus != null && me.finishStatus === 1);
    if (isCheckered && !this.calledFinish) {
      this.calledFinish = true;
      const finalPos = me?.classPlace && me.classPlace > 0 ? me.classPlace : (me?.place ?? 1);
      const ctx = { place: me?.place ?? finalPos, classPlace: finalPos };

      if (finalPos === 1) {
        this.trigger("Victoria", false, ctx);
      } else if (finalPos <= 3) {
        this.trigger("Podio", false, ctx);
      } else if (finalPos <= 10) {
        this.trigger("Top 10", false, ctx);
      } else {
        this.trigger("Final Dificil", false, ctx);
      }
    } else if (!isCheckered && s.phase < 7) {
      this.calledFinish = false;
    }
  }
}

export const spotter = new SpotterEngine();
