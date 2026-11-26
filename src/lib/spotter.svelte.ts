import { emit, listen } from "@tauri-apps/api/event";
import { aiEngineer } from "./aiEngineer.svelte";
import { applyOutputSink } from "./audioDevices.svelte";
import { config } from "./config.svelte";
import { api, isNativeTauri } from "./api";
import { pickSpotterPhrase, type SpotterEventContext } from "./spotterPhrases";
import type { Snapshot } from "./types";

export type SpotterPriority = 1 | 2 | 3 | 4 | 5;

export interface SpotterEventDef {
  folder: string;
  label: string;
  priority: SpotterPriority;
  cooldownMs: number;
  category: "traffic" | "flags" | "strategy" | "car" | "session" | "encouragement";
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
  { folder: "Final Remontada", label: "Final: Enhorabuena / Remontada", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Enhorabuena, gran remontada de {gained} posiciones hasta P{place}." },
  { folder: "Final Pesimista", label: "Final: Pesimista (Posiciones perdidas)", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Bandera a cuadros en P{place}, hemos perdido {lost} posiciones hoy." },

  // EVENTOS PRO DE INGENIERO IA (Telemetría avanzada en vivo)
  { folder: "Frenos Calientes", label: "Frenos sobrecalentados (>780°C)", priority: 3, cooldownMs: 45000, category: "car", ttsDefault: "Atención, discos de freno a {temp} grados, refrigera en recta." },
  { folder: "Desgaste Neumaticos", label: "Desgaste crítico de neumático (<35%)", priority: 3, cooldownMs: 60000, category: "car", ttsDefault: "Aviso de desgaste: la {wheel} baja al {wear} por ciento." },
  { folder: "Aviso Limites Pista", label: "Alerta de límites de pista (cerca de sanción)", priority: 2, cooldownMs: 35000, category: "flags", ttsDefault: "Cuidado con los límites de pista, un aviso más y nos cae penalización." },
  { folder: "Energia Virtual Baja", label: "Energía Virtual (VE) baja (<18%)", priority: 3, cooldownMs: 50000, category: "strategy", ttsDefault: "Energía virtual baja, quedan {laps} vueltas de margen." },
  { folder: "Rival Boxes", label: "Rival de delante entra a boxes (Overcut)", priority: 3, cooldownMs: 35000, category: "strategy", ttsDefault: "{driver} acaba de entrar a boxes. Pista limpia, empuja para el overcut." },
  { folder: "Tiempo Restante", label: "Hito de tiempo restante (15 / 10 / 5 / 2 min)", priority: 4, cooldownMs: 50000, category: "session", ttsDefault: "Quedan {mins} minutos de carrera, mantén el ritmo." },
  { folder: "Motor Caliente", label: "Motor sobrecalentado", priority: 3, cooldownMs: 45000, category: "car", ttsDefault: "Temperatura de motor elevada, sal del rebufo para refrigerar." },
  { folder: "Resumen Vuelta", label: "Resumen periódico de ritmo y gap", priority: 5, cooldownMs: 60000, category: "session", ttsDefault: "Buen ritmo. Vas P{place}, {driver} delante a {gap} segundos." },
  { folder: "Bloqueo Repetido", label: "Coaching: bloqueo repetido + ajuste de Brake Bias", priority: 3, cooldownMs: 55000, category: "car", ttsDefault: "Segundo bloqueo seguido. {advice} para estabilizar la frenada." },
  { folder: "Lift And Coast", label: "Coaching: Lift & Coast automático para ahorrar parada", priority: 3, cooldownMs: 90000, category: "strategy", ttsDefault: "Haz lift and coast en las rectas largas, ahorrando {laps} vueltas evitas una parada extra." },
  { folder: "Gomas en Ventana", label: "Neumáticos en ventana óptima de temperatura", priority: 4, cooldownMs: 90000, category: "car", ttsDefault: "Gomas en ventana óptima, ya tienes grip para empujar." },
  { folder: "Caza Rival", label: "Predicción de caza (recortando al coche de delante)", priority: 4, cooldownMs: 55000, category: "strategy", ttsDefault: "Le estás recortando {delta} por vuelta a {driver}. En {laps} estás encima." },
  { folder: "Defensa Rival", label: "Predicción de defensa (rival detrás recortando)", priority: 4, cooldownMs: 55000, category: "strategy", ttsDefault: "Atención, {driver} viene {delta} más rápido por vuelta. En {laps} estará encima, prepara defensa." },

  // MENSAJES DE ÁNIMO CONTEXTUALES (Psicología y motivación en carrera)
  { folder: "Animo Metronomo", label: "Ánimo: Racha de metrónomo (consistencia)", priority: 5, cooldownMs: 180000, category: "encouragement", ttsDefault: "Ritmo de metrónomo, {laps} vueltas seguidas clavadas al mismo tiempo. Gran trabajo." },
  { folder: "Animo Tras Error", label: "Ánimo: Recuperación tras error o salida", priority: 5, cooldownMs: 120000, category: "encouragement", ttsDefault: "Cabeza fría, eso ya pasó. Queda mucha carrera, resetea y vuelve a tu ritmo." },
  { folder: "Animo Defensa Exitosa", label: "Ánimo: Defensa aguantada con éxito", priority: 5, cooldownMs: 120000, category: "encouragement", ttsDefault: "Gran defensa frente a {driver}, ya has abierto hueco. Respira y marca tu ritmo." },
  { folder: "Animo Remontada", label: "Ánimo: Remontada en marcha", priority: 5, cooldownMs: 180000, category: "encouragement", ttsDefault: "Ya llevas {gained} posiciones ganadas hasta P{place}. Gran remontada, sigue empujando." },
  { folder: "Animo Tramo Final", label: "Ánimo: Empujón en tramo final de carrera", priority: 5, cooldownMs: 240000, category: "encouragement", ttsDefault: "Recta final de carrera, máxima concentración ahora. Tienes ritmo de sobra, dalo todo." },
  { folder: "Animo Stint Limpio", label: "Ánimo: Stint largo limpio sin errores", priority: 5, cooldownMs: 240000, category: "encouragement", ttsDefault: "{laps} vueltas seguidas sin un solo fallo. Stint de libro, mantén el foco." },
];

const EVENT_MAP = new Map<string, SpotterEventDef>(SPOTTER_EVENTS.map((e) => [e.folder, e]));

interface QueuedClip {
  event: SpotterEventDef;
  enqueuedAt: number;
  context?: SpotterEventContext;
}

export interface ActiveSpotterTransmission {
  folder: string;
  label: string;
  priority: SpotterPriority;
  text: string;
  profile: string;
  category: "traffic" | "flags" | "strategy" | "car" | "session";
  startedAt: number;
  speaker?: "driver" | "engineer";
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
  private currentBeepAudio: HTMLAudioElement | null = null;
  private playGen = 0;
  private currentPriority: SpotterPriority | null = null;
  private currentStartedAt = 0;
  private queue: QueuedClip[] = [];
  private deferredCornerQueue: QueuedClip[] = [];
  private inFastCorner = false;
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
    applyOutputSink(this.audioCtx);
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
  private sectorSessionKey = "";
  private mySessionBestSectors: [number, number, number] = [0, 0, 0];
  private broadcastChannel: BroadcastChannel | null = null;
  private radioChannelOpen = false;
  private closeRadioTimer: ReturnType<typeof setTimeout> | null = null;
  private warnedVeLow = false;
  private warnedTrackLimits = false;
  private lastOverheating = false;
  private lastAheadId: number | null = null;
  private lastAheadDriver = "";
  private lastAheadInPits = false;
  private calledTimeMilestones = new Set<number>();
  private lastSummaryLap = 0;
  private prevWheelSurfTemp: [number, number, number, number] = [0, 0, 0, 0];
  private frontLockupCount = 0;
  private rearLockupCount = 0;
  private lastLockupAt = 0;
  private advisedLiftCoast = false;
  private raceStartPlace: number | null = null;
  private inQualyHotlap = false;
  private tyresWereCold = false;
  private prevLapAheadId: number | null = null;
  private prevLapAheadGap: number | null = null;
  private prevLapBehindId: number | null = null;
  private prevLapBehindGap: number | null = null;
  private lastChaseCallLap = 0;
  private lastDefendCallLap = 0;
  // Encouragement / morale state
  private recentCleanLapTimes: number[] = [];
  private cleanLapStreak = 0;
  private currentLapHadIncident = false;
  private highSpeedSeenAt = 0;
  private incidentDetectedAt = 0;
  private defendingRivalId: number | null = null;
  private defendingRivalName = "";
  private defendingSince = 0;
  private calledRemontadaAtGained = 0;
  private calledFinalPush = false;

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

  private isAiSpotterActive(): boolean {
    const aiCfg = config.value.aiEngineer;
    return Boolean(
      aiCfg?.enabled &&
      (aiCfg.useForSpotterEvents ?? true) &&
      (aiCfg.voiceEngine === "onnx" || aiCfg.voiceEngine === "qwen3") &&
      isNativeTauri(),
    );
  }

  /** Trigger a spotter event respecting priority, cooldowns, and anti-loop rules. */
  trigger(folder: string, force = false, context?: SpotterEventContext) {
    const cfg = config.value.spotter;
    const active = Boolean(cfg?.enabled || this.isAiSpotterActive());
    if (!force && !active) return;

    const def = EVENT_MAP.get(folder);
    if (!def) return;

    if (!force) {
      if (def.category === "traffic" && !cfg.traffic) return;
      if (def.category === "flags" && !cfg.flags) return;
      if (def.category === "strategy" && !cfg.strategy) return;
      if (def.category === "car" && !cfg.carStatus) return;
      if (def.category === "session" && !cfg.session) return;
      if (def.category === "encouragement" && cfg.encouragement === false) return;

      const now = performance.now();
      const last = this.lastTriggeredAt.get(folder) ?? -Infinity;
      if (now - last < def.cooldownMs) return;
      this.lastTriggeredAt.set(folder, now);
    }

    const now = performance.now();

    // #2 Quiet in Qualy Hotlap: suppress non-critical chatter (P3-P5) during qualifying flying laps
    if (
      !force &&
      cfg?.quietInFastCorners &&
      this.inQualyHotlap &&
      def.priority >= 3 &&
      def.folder !== "Gomas en Ventana"
    ) {
      return;
    }

    // #10 Quiet in Fast Corners: defer non-urgent calls (P3-P5) while cornering hard or heavy braking
    if (!force && cfg?.quietInFastCorners && this.inFastCorner && def.priority >= 3) {
      this.deferredCornerQueue = this.deferredCornerQueue.filter(
        (q) => q.event.folder !== def.folder && now - q.enqueuedAt < 12000,
      );
      this.deferredCornerQueue.push({ event: def, enqueuedAt: now, context });
      if (this.deferredCornerQueue.length > 2) this.deferredCornerQueue.shift();
      return;
    }

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
    this.playGen++;
    if (this.currentBeepAudio) {
      this.currentBeepAudio.pause();
      this.currentBeepAudio.onended = null;
      this.currentBeepAudio.onerror = null;
      this.currentBeepAudio = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    aiEngineer.stopSpeaking();
    this.playing = false;
    this.currentPriority = null;
    this.currentTransmission = null;
    this.broadcastState();
  }

  private pruneQueue() {
    const now = performance.now();
    this.queue = this.queue.filter((item) => {
      const maxAge = item.event.priority === 1 ? 2500 : 7500;
      return now - item.enqueuedAt <= maxAge;
    });
  }

  private playNextInQueue(): boolean {
    this.pruneQueue();
    if (this.queue.length === 0) return false;
    const next = this.queue.shift()!;
    this.playNow(next.event, next.context);
    return true;
  }

  private playNow(def: SpotterEventDef, context?: SpotterEventContext) {
    if (this.closeRadioTimer) {
      clearTimeout(this.closeRadioTimer);
      this.closeRadioTimer = null;
    }

    const cfg = config.value.spotter;
    const profile = cfg?.profile || "Sara";
    const volume = Math.max(0, Math.min(1, cfg?.volume ?? 0.85));
    const useRadio = cfg?.radioEffect ?? true;

    // Pick a varied phrase tailored to the active AI engineer personality (built-in or custom)
    const personality = config.value.aiEngineer?.personality ?? "wec_pro";
    const ttsText = pickSpotterPhrase(
      def.folder,
      personality,
      def.ttsDefault,
      context,
      config.value.aiEngineer?.customPersonalities,
      cfg?.driverName,
      cfg?.driverNameFrequency ?? 0.35,
    );

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
      speaker: "engineer",
    };
    if (!this.isAiSpotterActive()) {
      this.broadcastState();
    }

    const gen = ++this.playGen;

    const wSpotter = config.value.widgets?.spotter?.options;
    const beepsVol = Math.max(0, Math.min(1, wSpotter?.beepsVolume ?? cfg?.beepsVolume ?? volume));

    const playStartBeep = (): Promise<void> => {
      const s = wSpotter?.startSound ?? cfg?.startSound ?? "1.mp3";
      if (!s || s === "none") return Promise.resolve();
      if (s === "mic_click") {
        if (useRadio) {
          this.playRadioClick(true, beepsVol);
          return new Promise((resolve) => setTimeout(resolve, 65));
        }
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (this.currentBeepAudio === beep) {
            this.currentBeepAudio = null;
          }
          resolve();
        };
        const beep = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(s)}?t=${Date.now()}`);
        applyOutputSink(beep);
        beep.volume = beepsVol;
        this.currentBeepAudio = beep;
        // Safety fallback so a broken/long clip never blocks the voice indefinitely
        const timer = setTimeout(finish, 1800);
        beep.onended = finish;
        beep.onerror = finish;
        beep.play().catch(finish);
      });
    };

    const playEndBeep = () => {
      const s = wSpotter?.endSound ?? cfg?.endSound ?? "f1-radio-end.mp3";
      if (!s || s === "none") return;
      if (s === "mic_click") {
        if (useRadio) this.playRadioClick(false, beepsVol);
        return;
      }
      const audio = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(s)}?t=${Date.now()}`);
      applyOutputSink(audio);
      audio.volume = beepsVol;
      audio.play().catch(() => {});
    };

    // Realistic open radio channel: only play opening beep when the channel was closed
    const ensureRadioOpen = (): Promise<void> => {
      if (this.radioChannelOpen) {
        return new Promise((resolve) => setTimeout(resolve, 110));
      }
      this.radioChannelOpen = true;
      return playStartBeep();
    };

    const finishTransmission = () => {
      setTimeout(() => {
        if (!this.playing && !this.radioChannelOpen) {
          this.currentTransmission = null;
          this.broadcastState();
        }
      }, 1200);
    };

    // Realistic closing: if more messages are queued (or arrive within 260ms), keep the radio open and speak back-to-back!
    const onClipFinished = () => {
      if (gen !== this.playGen) return;
      this.pruneQueue();
      if (this.queue.length > 0) {
        // Keep radioChannelOpen = true and chain the next instruction seamlessly
        this.playing = false;
        this.currentPriority = null;
        this.playNextInQueue();
        return;
      }

      this.playing = false;
      this.currentPriority = null;
      this.broadcastState();
      if (this.closeRadioTimer) clearTimeout(this.closeRadioTimer);
      this.closeRadioTimer = setTimeout(() => {
        this.closeRadioTimer = null;
        if (this.playing) return;
        if (this.playNextInQueue()) return;
        if (this.radioChannelOpen) {
          this.radioChannelOpen = false;
          playEndBeep();
        }
        finishTransmission();
      }, 260);
    };

    // If AI Engineer with Piper .onnx or Qwen3-TTS is enabled for on-track Spotter events:
    // Pre-synthesize audio FIRST so the Team Radio card & opening beep NEVER appear with dead silence!
    if (this.isAiSpotterActive()) {
      void aiEngineer
        .prepareAudio(ttsText)
        .then(async (wavReady) => {
          if (gen !== this.playGen || !wavReady) return;
          this.broadcastState();
          await ensureRadioOpen();
          if (gen !== this.playGen) return;
          await aiEngineer.speakWithRadio(ttsText, {
            skipStartBeep: true,
            skipEndBeep: true,
            skipBroadcast: true,
          });
        })
        .catch(() => {})
        .finally(() => {
          onClipFinished();
        });
      return;
    }

    const url = this.pickRandomUrl(profile, def.folder);

    if (url) {
      // Preload voice clip while start beep plays so there is zero gap and zero overlap
      const buster = url.includes("?") ? `&t=${Date.now()}` : `?t=${Date.now()}`;
      const audio = new Audio(`${url}${buster}`);
      applyOutputSink(audio);
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      if (useRadio) this.applyRadioFilter(audio, volume);
      else audio.volume = volume;
      this.currentAudio = audio;
      const done = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          onClipFinished();
        }
      };
      audio.onended = done;
      audio.onerror = () => {
        if (gen !== this.playGen) return;
        if (cfg?.ttsFallback) this.speakFallback(ttsText, profile, volume, done);
        else done();
      };
      void ensureRadioOpen().then(() => {
        if (gen !== this.playGen || this.currentAudio !== audio) return;
        audio.play().catch(() => {
          if (gen !== this.playGen) return;
          if (cfg?.ttsFallback) this.speakFallback(ttsText, profile, volume, done);
          else done();
        });
      });
      return;
    }

    // No hay archivos de audio para este evento en el perfil -> Fallback a TTS o fin
    const fallbackDone = () => {
      onClipFinished();
    };

    void ensureRadioOpen().then(() => {
      if (gen !== this.playGen) return;
      if (cfg?.ttsFallback ?? true) {
        this.speakFallback(ttsText, profile, volume, fallbackDone);
      } else {
        fallbackDone();
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
    const active = Boolean(cfg?.enabled || this.isAiSpotterActive());
    if (!active || !snap?.player) {
      this.lateralState = "clear";
      this.wasDriving = false;
      return;
    }

    const p = snap.player;
    const s = snap.session;
    const st = snap.strategy;
    const me = snap.vehicles.find((v) => v.isPlayer);
    const now = performance.now();

    // Auto-disable spotter if:
    // 1) Another driver is focused/spectated instead of the main player
    const focusingOtherDriver =
      (snap.focusedSlot != null && (!me || (snap.focusedSlot !== me.slotId && snap.focusedSlot !== me.id))) ||
      (me != null && p.id !== me.id);
    // 2) The user is NOT actively on track (disconnected, not in realtime, in garage, or AI/spectator/replay control)
    const userOnTrack = Boolean(
      snap.connected &&
        snap.inRealtime &&
        me &&
        !me.inGarage &&
        (me.control === 0 || snap.source === "demo"),
    );

    if (focusingOtherDriver || !userOnTrack) {
      this.lateralState = "clear";
      this.clearCandidateSince = 0;
      this.wasDriving = false;
      this.queue = [];
      return;
    }

    // #2 Track qualifying flying lap for silent-mode filtering
    this.inQualyHotlap = s.kind === "qualifying" && !p.inPits && p.speed > 25 && !p.lapInvalidated;

    // #10 Track whether driver is in a fast corner / heavy braking zone and flush deferred messages on straights
    const heavyCornerOrBrake = !p.inPits && p.speed > 18 && (Math.abs(p.gLat ?? 0) > 1.2 || (p.brake ?? 0) > 0.65);
    const straightAndCalm = p.inPits || (Math.abs(p.gLat ?? 0) < 0.85 && (p.brake ?? 0) < 0.25);
    if (heavyCornerOrBrake) {
      this.inFastCorner = true;
    } else if (straightAndCalm) {
      this.inFastCorner = false;
      if (this.deferredCornerQueue.length > 0 && !this.playing) {
        while (this.deferredCornerQueue.length > 0) {
          const item = this.deferredCornerQueue.shift()!;
          if (now - item.enqueuedAt <= 14000) {
            this.playNow(item.event, item.context);
            break;
          }
        }
      }
    }

    // Start of driving stint / leaving garage into the game
    const isDriving = Boolean(p.speed > 1.2);
    if (isDriving && !this.wasDriving) {
      this.wasDriving = true;
      this.trigger("Salida a Pista");
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
        // LMU / rFactor 2 uses a left-handed coordinate system:
        // +X = left side of the car, +Y = up, +Z = rear of the car (forward = -Z).
        // Therefore dx = wx * cos(yaw) - wz * sin(yaw) is positive to the LEFT and negative to the RIGHT.
        const dx = wx * cos - wz * sin;
        const dz = -wx * sin - wz * cos;

        if (Math.abs(dz) <= enterLon && Math.abs(dx) <= enterLat) {
          if (dx > 0.4) hasLeft = true;
          else if (dx < -0.4) hasRight = true;
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

    // Local Yellow detection: check player's sector, next sector ahead, any active yellow sector, raw LMU flags (1=single, 2=double), and personal vehicle flag
    const curSec = me?.sector && me.sector >= 1 && me.sector <= 3 ? me.sector : p.sector >= 1 && p.sector <= 3 ? p.sector : 1;
    const curSecYellow = Boolean(s.sectorYellow?.[curSec - 1]);
    const nextSecYellow = Boolean(s.sectorYellow?.[curSec % 3]);
    const rawYellow = Boolean(s.sectorFlagsRaw?.some((f) => f === 1 || f === 2));
    const personalYellow = me?.flag === 1 || me?.flag === 2;
    const localYellow = !p.inPits && (curSecYellow || nextSecYellow || rawYellow || personalYellow);

    const anyYellow = isFcy || localYellow;
    if (localYellow && !this.hadYellow && !isFcy) {
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
        this.tyresWereCold = true;
        this.prevLapAheadId = null;
        this.prevLapAheadGap = null;
        this.prevLapBehindId = null;
        this.prevLapBehindGap = null;
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
      this.warnedVeLow = false;
    } else if (st.samples > 0 && st.lapsOfFuel > 0) {
      const lapsRem = st.lapsOfVe > 0 ? Math.min(st.lapsOfFuel, st.lapsOfVe) : st.lapsOfFuel;
      if (lapsRem < 1.2 && !this.warnedBoxNow) {
        this.warnedBoxNow = true;
        this.warnedFuelLow = true;
        this.trigger("Box Esta Vuelta");
      } else if (lapsRem < 2.5 && !this.warnedFuelLow) {
        this.warnedFuelLow = true;
        this.trigger("Combustible Bajo");
      } else if (p.virtualEnergy > 0 && p.virtualEnergy < 0.18 && st.lapsOfVe > 0 && st.lapsOfVe < 2.5 && !this.warnedVeLow) {
        this.warnedVeLow = true;
        this.trigger("Energia Virtual Baja", false, { laps: st.lapsOfVe.toFixed(1) });
      }
    }

    // Track limits warning (close to drive-through / time penalty)
    if (p.trackLimitsStepsPerPenalty > 0 && !p.inPits) {
      const ratio = p.trackLimitsSteps / p.trackLimitsStepsPerPenalty;
      if (ratio >= 0.65 && !this.warnedTrackLimits) {
        this.warnedTrackLimits = true;
        this.trigger("Aviso Limites Pista");
      } else if (ratio < 0.35) {
        this.warnedTrackLimits = false;
      }
    }

    // Engine overheating warning
    if (p.overheating && !this.lastOverheating && !p.inPits) {
      this.trigger("Motor Caliente");
    }
    this.lastOverheating = Boolean(p.overheating);

    // -------------------------------------------------------------------------
    // 4. PRIORITY 4: Car Damage, DNF, Brakes, Wear & Tyre Temps
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
      } else if (avgTemp > 10 && avgTemp < 65) {
        this.tyresWereCold = true;
        if (avgTemp < 52 && p.lapDist < 1200) {
          this.trigger("Neumaticos Frios");
        }
      } else if (this.tyresWereCold && avgTemp >= 74 && avgTemp < 104) {
        this.tyresWereCold = false;
        this.trigger("Gomas en Ventana");
      }

      // Brake overheat warning (>780°C)
      const maxBrake = Math.round(Math.max(...p.wheels.map((w) => w.brakeTemp)));
      if (maxBrake > 780) {
        this.trigger("Frenos Calientes", false, { temp: maxBrake });
      }

      // Critical tyre wear warning (<35% on worst corner)
      const wheelNames = ["delantera izquierda", "delantera derecha", "trasera izquierda", "trasera derecha"];
      const minIdx = p.wheels.reduce((mi, w, i, arr) => (w.wear < arr[mi].wear ? i : mi), 0);
      const minWearPct = Math.round(p.wheels[minIdx].wear * 100);
      if (minWearPct > 0 && minWearPct <= 35) {
        this.trigger("Desgaste Neumaticos", false, { wheel: wheelNames[minIdx], wear: minWearPct });
      }

      // #5 Real-time Brake Lockup Coaching: detect repeated front/rear wheel lockups & advise Brake Bias tweak
      const surfTemps: [number, number, number, number] = [
        (p.wheels[0].surfaceTemp[0] + p.wheels[0].surfaceTemp[1] + p.wheels[0].surfaceTemp[2]) / 3,
        (p.wheels[1].surfaceTemp[0] + p.wheels[1].surfaceTemp[1] + p.wheels[1].surfaceTemp[2]) / 3,
        (p.wheels[2].surfaceTemp[0] + p.wheels[2].surfaceTemp[1] + p.wheels[2].surfaceTemp[2]) / 3,
        (p.wheels[3].surfaceTemp[0] + p.wheels[3].surfaceTemp[1] + p.wheels[3].surfaceTemp[2]) / 3,
      ];
      if (p.brake > 0.38 && p.speed > 18 && now - this.lastLockupAt > 9000) {
        const frontSpike =
          (this.prevWheelSurfTemp[0] > 20 && surfTemps[0] - this.prevWheelSurfTemp[0] > 5.5) ||
          (this.prevWheelSurfTemp[1] > 20 && surfTemps[1] - this.prevWheelSurfTemp[1] > 5.5) ||
          p.wheels[0].flat ||
          p.wheels[1].flat;
        const rearSpike =
          (this.prevWheelSurfTemp[2] > 20 && surfTemps[2] - this.prevWheelSurfTemp[2] > 5.5) ||
          (this.prevWheelSurfTemp[3] > 20 && surfTemps[3] - this.prevWheelSurfTemp[3] > 5.5) ||
          p.wheels[2].flat ||
          p.wheels[3].flat;
        if (frontSpike) {
          this.lastLockupAt = now;
          this.frontLockupCount += 1;
          if (this.frontLockupCount >= 2) {
            this.frontLockupCount = 0;
            this.trigger("Bloqueo Repetido", false, { advice: "mueve el reparto de frenada medio punto atrás" });
          }
        } else if (rearSpike) {
          this.lastLockupAt = now;
          this.rearLockupCount += 1;
          if (this.rearLockupCount >= 2) {
            this.rearLockupCount = 0;
            this.trigger("Bloqueo Repetido", false, { advice: "sube el reparto de frenada medio punto delante" });
          }
        }
      }
      this.prevWheelSurfTemp = surfTemps;

      // #5 Automatic Lift & Coast Coaching: when saving 0.2..1.3 laps avoids a full extra pit stop!
      if (s.kind === "race" && st.samples >= 2 && st.lapsRemaining > 1.5 && !this.advisedLiftCoast) {
        const minRem = p.virtualEnergy > 0 && st.lapsOfVe > 0 ? Math.min(st.lapsOfFuel, st.lapsOfVe) : st.lapsOfFuel;
        const deficit = st.lapsRemaining - minRem;
        if (minRem > 1.2 && deficit >= 0.2 && deficit <= 1.3) {
          this.advisedLiftCoast = true;
          this.trigger("Lift And Coast", false, { laps: deficit.toFixed(1) });
        }
      }
    }

    // Lucha directa, presión y rival de delante entrando a boxes (Overcut!)
    if (s.kind === "race" && me && !p.inPits && p.speed > 35) {
      const rivalAhead = snap.vehicles.find((v) => v.place === me.place - 1);
      const shortName = (full: string) => {
        const parts = full.trim().split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1] : full.trim() || "el rival";
      };

      // Detect if the rival directly ahead just pitted!
      if (this.lastAheadId != null) {
        const tracked = snap.vehicles.find((v) => v.id === this.lastAheadId);
        if (tracked && tracked.inPits && !this.lastAheadInPits && p.lapNumber >= 2) {
          this.trigger("Rival Boxes", false, { driver: shortName(this.lastAheadDriver) });
        }
        this.lastAheadInPits = Boolean(tracked?.inPits);
      }
      if (rivalAhead && !rivalAhead.inPits) {
        this.lastAheadId = rivalAhead.id;
        this.lastAheadDriver = rivalAhead.driver;
        this.lastAheadInPits = false;
      }

      // Rival ahead within 0.8s (with real driver name + exact gap!)
      if (me.timeBehindNext > 0.05 && me.timeBehindNext <= 0.8 && rivalAhead && !rivalAhead.inPits) {
        this.aheadCloseTicks = (this.aheadCloseTicks ?? 0) + 1;
        if (this.aheadCloseTicks >= 40) {
          this.trigger("Coche Delante Cerca", false, {
            driver: shortName(rivalAhead.driver),
            gap: me.timeBehindNext.toFixed(1),
          });
          this.aheadCloseTicks = 0;
        }
      } else {
        this.aheadCloseTicks = 0;
      }

      // Rival behind within 0.65s (with real driver name + exact gap!)
      const rivalBehind = snap.vehicles.find((v) => v.place === me.place + 1);
      if (rivalBehind && !rivalBehind.inPits) {
        const gapBehind = rivalBehind.timeBehindLeader - me.timeBehindLeader;
        if (gapBehind > 0.05 && gapBehind <= 0.65) {
          this.behindCloseTicks = (this.behindCloseTicks ?? 0) + 1;
          if (this.behindCloseTicks >= 40) {
            this.trigger("Presion Detras", false, {
              driver: shortName(rivalBehind.driver),
              gap: gapBehind.toFixed(1),
            });
            this.behindCloseTicks = 0;
          }
        } else {
          this.behindCloseTicks = 0;
        }

        // Encouragement #3: Successful defense (held rival <= 0.75s for >= 18s, then pulled gap >= 1.35s)
        if (gapBehind > 0.05 && gapBehind <= 0.75) {
          if (this.defendingRivalId !== rivalBehind.id) {
            this.defendingRivalId = rivalBehind.id;
            this.defendingRivalName = shortName(rivalBehind.driver);
            this.defendingSince = now;
          }
        } else if (
          this.defendingRivalId === rivalBehind.id &&
          gapBehind >= 1.35 &&
          now - this.defendingSince >= 18000
        ) {
          const defended = this.defendingRivalName || shortName(rivalBehind.driver);
          this.defendingRivalId = null;
          this.defendingSince = 0;
          this.trigger("Animo Defensa Exitosa", false, { driver: defended });
        } else if (this.defendingRivalId != null && this.defendingRivalId !== rivalBehind.id && gapBehind > 1.2) {
          this.defendingRivalId = null;
          this.defendingSince = 0;
        }
      } else {
        this.behindCloseTicks = 0;
        this.defendingRivalId = null;
        this.defendingSince = 0;
      }

      // Encouragement #5: Final push in closing minutes/laps while in a live battle
      if (!this.calledFinalPush && p.lapNumber >= 3) {
        const nearTimeEnd = s.timeRemaining > 30 && s.timeRemaining <= 240 && s.endEt >= 420;
        const nearLapEnd = s.maxLaps > 5 && s.maxLaps - (me.totalLaps ?? p.lapNumber) <= 3 && s.maxLaps - (me.totalLaps ?? p.lapNumber) >= 1;
        const inBattleAhead = Boolean(rivalAhead && !rivalAhead.inPits && me.timeBehindNext > 0.1 && me.timeBehindNext <= 2.5);
        const behindGapNow = rivalBehind && !rivalBehind.inPits ? rivalBehind.timeBehindLeader - me.timeBehindLeader : 99;
        const inBattleBehind = behindGapNow > 0.1 && behindGapNow <= 1.8;
        if ((nearTimeEnd || nearLapEnd) && (inBattleAhead || inBattleBehind)) {
          this.calledFinalPush = true;
          this.trigger("Animo Tramo Final");
        }
      }

      // Encouragement #4: Comeback in progress (>= 3 positions gained from race start)
      if (this.raceStartPlace != null && p.lapNumber >= 2 && !this.wasRecentlyInPits && now - this.lastPitExitTime > 20000) {
        const curPos = me.classPlace && me.classPlace > 0 ? me.classPlace : me.place;
        const gained = this.raceStartPlace - curPos;
        if (gained >= 3 && gained >= this.calledRemontadaAtGained + 3) {
          this.calledRemontadaAtGained = gained;
          this.trigger("Animo Remontada", false, { gained, place: curPos, classPlace: curPos });
        }
      }

      // Traffic ahead from different class or lapped
      if (rivalAhead && !rivalAhead.inPits && me.timeBehindNext > 0.05 && me.timeBehindNext < 1.4) {
        const isDifferentClass = rivalAhead.class && me.class && rivalAhead.class !== me.class;
        const isLapped = rivalAhead.totalLaps < me.totalLaps;
        if (isDifferentClass || isLapped) {
          this.trigger("Trafico Delante");
        }
      }

      // Timed race milestones (15, 10, 5, 2 minutes remaining)
      if (s.timeRemaining > 60 && s.endEt >= 600) {
        const minsLeft = Math.ceil(s.timeRemaining / 60);
        for (const m of [15, 10, 5, 2]) {
          if (minsLeft === m && s.timeRemaining <= m * 60 && s.timeRemaining > m * 60 - 15 && !this.calledTimeMilestones.has(m)) {
            this.calledTimeMilestones.add(m);
            this.trigger("Tiempo Restante", false, { mins: m });
            break;
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. PRIORITY 5: Lap Records, Overtakes, Mid-Race & Finish Result
    // -------------------------------------------------------------------------
    const completedLaps = me?.totalLaps ?? p.lapNumber;
    const pb = snap.timing.personalBest;

    // Encouragement #2: Recovery morale boost after an off-track / spin / sudden speed drop
    if (!p.inPits && s.phase === 5 && !this.hadFcy && p.lapNumber >= 1) {
      if (p.speed > 38) {
        this.highSpeedSeenAt = now;
      } else if (p.speed < 12 && this.highSpeedSeenAt > 0 && now - this.highSpeedSeenAt < 8000 && !this.wasRecentlyInPits) {
        this.incidentDetectedAt = now;
        this.currentLapHadIncident = true;
        this.highSpeedSeenAt = 0;
      }
      if (this.incidentDetectedAt > 0 && p.speed > 32 && now - this.incidentDetectedAt >= 4500 && now - this.incidentDetectedAt <= 25000) {
        this.incidentDetectedAt = 0;
        this.trigger("Animo Tras Error");
      } else if (this.incidentDetectedAt > 0 && now - this.incidentDetectedAt > 25000) {
        this.incidentDetectedAt = 0;
      }
    }

    // Lap milestone checks
    if (this.lastCompletedLaps >= 0 && completedLaps > this.lastCompletedLaps) {
      let triggeredBattleCall = false;

      // Encouragement #1 (Metronome consistency) & #6 (Clean stint streak)
      const finishedLapTime = snap.timing.lastLapTime;
      const wasCleanLap = !this.lastLapInvalidated && !this.currentLapHadIncident && !p.inPits && !this.wasRecentlyInPits && finishedLapTime > 20;
      if (wasCleanLap) {
        this.cleanLapStreak += 1;
        this.recentCleanLapTimes.push(finishedLapTime);
        if (this.recentCleanLapTimes.length > 4) this.recentCleanLapTimes.shift();

        if (this.cleanLapStreak >= 10 && this.cleanLapStreak % 10 === 0) {
          triggeredBattleCall = true;
          this.trigger("Animo Stint Limpio", false, { laps: String(this.cleanLapStreak) });
        } else if (this.recentCleanLapTimes.length === 4) {
          const minT = Math.min(...this.recentCleanLapTimes);
          const maxT = Math.max(...this.recentCleanLapTimes);
          if (maxT - minT <= 0.45) {
            this.recentCleanLapTimes = [];
            triggeredBattleCall = true;
            this.trigger("Animo Metronomo", false, { laps: "4" });
          }
        }
      } else {
        this.cleanLapStreak = 0;
        this.recentCleanLapTimes = [];
      }
      this.currentLapHadIncident = false;

      // #3 Predicción de Caza / Defensa (lap-by-lap closing rate to rival ahead & behind)
      if (s.kind === "race" && me && !p.inPits && completedLaps >= 2) {
        const shortSurname = (full: string) => {
          const parts = full.trim().split(/\s+/);
          return parts.length > 1 ? parts[parts.length - 1] : full.trim() || "el rival";
        };
        const formatClosing = (sec: number) =>
          sec >= 1 ? `${sec.toFixed(1)} segundos` : `${Math.round(sec * 10)} décimas`;
        const formatLaps = (n: number) => (n === 1 ? "una vuelta" : `${n} vueltas`);

        const aheadCar = snap.vehicles.find((v) => v.place === me.place - 1);
        if (aheadCar && !aheadCar.inPits && me.timeBehindNext > 0.2 && me.timeBehindNext < 40) {
          const gapAhead = me.timeBehindNext;
          if (
            this.prevLapAheadId === aheadCar.id &&
            this.prevLapAheadGap != null &&
            !this.wasRecentlyInPits
          ) {
            const closing = this.prevLapAheadGap - gapAhead;
            if (
              closing >= 0.35 &&
              closing < 8 &&
              gapAhead >= 0.8 &&
              gapAhead <= 7.0 &&
              completedLaps - this.lastChaseCallLap >= 2
            ) {
              const estLaps = Math.max(1, Math.min(9, Math.round(gapAhead / closing)));
              this.lastChaseCallLap = completedLaps;
              triggeredBattleCall = true;
              this.trigger("Caza Rival", false, {
                driver: shortSurname(aheadCar.driver),
                delta: formatClosing(closing),
                laps: formatLaps(estLaps),
              });
            }
          }
          this.prevLapAheadId = aheadCar.id;
          this.prevLapAheadGap = gapAhead;
        } else {
          this.prevLapAheadId = null;
          this.prevLapAheadGap = null;
        }

        const behindCar = snap.vehicles.find((v) => v.place === me.place + 1);
        if (behindCar && !behindCar.inPits) {
          const gapBehind = behindCar.timeBehindLeader - me.timeBehindLeader;
          if (gapBehind > 0.2 && gapBehind < 40) {
            if (
              !triggeredBattleCall &&
              this.prevLapBehindId === behindCar.id &&
              this.prevLapBehindGap != null &&
              !this.wasRecentlyInPits
            ) {
              const closingBehind = this.prevLapBehindGap - gapBehind;
              if (
                closingBehind >= 0.35 &&
                closingBehind < 8 &&
                gapBehind >= 0.7 &&
                gapBehind <= 6.0 &&
                completedLaps - this.lastDefendCallLap >= 2
              ) {
                const estLaps = Math.max(1, Math.min(9, Math.round(gapBehind / closingBehind)));
                this.lastDefendCallLap = completedLaps;
                triggeredBattleCall = true;
                this.trigger("Defensa Rival", false, {
                  driver: shortSurname(behindCar.driver),
                  delta: formatClosing(closingBehind),
                  laps: formatLaps(estLaps),
                });
              }
            }
            this.prevLapBehindId = behindCar.id;
            this.prevLapBehindGap = gapBehind;
          } else {
            this.prevLapBehindId = null;
            this.prevLapBehindGap = null;
          }
        } else {
          this.prevLapBehindId = null;
          this.prevLapBehindGap = null;
        }
      }

      if (pb > 0 && (this.lastBestLap === 0 || pb < this.lastBestLap - 0.001)) {
        this.lastBestLap = pb;
        this.trigger("Mejor Vuelta");
      } else if (!triggeredBattleCall && s.kind === "race" && me && completedLaps >= 3 && completedLaps - this.lastSummaryLap >= 4) {
        // Periodic race pace/gap check every ~4 laps when not already celebrating a PB
        const aheadCar = snap.vehicles.find((v) => v.place === me.place - 1);
        if (aheadCar && me.timeBehindNext > 0.5 && me.timeBehindNext < 30) {
          const parts = aheadCar.driver.trim().split(/\s+/);
          const drv = parts.length > 1 ? parts[parts.length - 1] : aheadCar.driver.trim() || "el de delante";
          this.lastSummaryLap = completedLaps;
          this.trigger("Resumen Vuelta", false, {
            place: me.classPlace || me.place,
            classPlace: me.classPlace || me.place,
            driver: drv,
            gap: me.timeBehindNext.toFixed(1),
          });
        }
      }
      if (s.maxLaps > 0 && completedLaps === s.maxLaps - 1 && !this.calledLastLap) {
        this.calledLastLap = true;
        this.trigger("Ultima Vuelta");
      }
    }
    this.lastCompletedLaps = completedLaps;
    if (pb > 0 && this.lastBestLap === 0) this.lastBestLap = pb;

    // Sector completion check (PB Green & Session Best Purple)
    const curSessionKey = `${snap.source}|${s.track}|${s.code}`;
    if (curSessionKey !== this.sectorSessionKey) {
      this.sectorSessionKey = curSessionKey;
      this.mySessionBestSectors = [0, 0, 0];
      this.calledTimeMilestones.clear();
      this.lastSummaryLap = 0;
      this.lastAheadId = null;
      this.warnedTrackLimits = false;
      this.warnedVeLow = false;
      this.frontLockupCount = 0;
      this.rearLockupCount = 0;
      this.advisedLiftCoast = false;
      this.raceStartPlace = null;
      this.tyresWereCold = false;
      this.prevLapAheadId = null;
      this.prevLapAheadGap = null;
      this.prevLapBehindId = null;
      this.prevLapBehindGap = null;
      this.lastChaseCallLap = 0;
      this.lastDefendCallLap = 0;
      this.recentCleanLapTimes = [];
      this.cleanLapStreak = 0;
      this.currentLapHadIncident = false;
      this.highSpeedSeenAt = 0;
      this.incidentDetectedAt = 0;
      this.defendingRivalId = null;
      this.defendingRivalName = "";
      this.defendingSince = 0;
      this.calledRemontadaAtGained = 0;
      this.calledFinalPush = false;
    }

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
        const sectorNum = completedSectorIdx + 1;
        const prevMySessionBest = this.mySessionBestSectors[completedSectorIdx];
        const prevPb = snap.timing.personalBestSectors[completedSectorIdx];

        // Compute the fastest individual sector time among OTHER vehicles in the same class (or all others if no class)
        const myClass = me?.class || p.vehicleClass || "";
        let bestRivalSector = Infinity;
        for (const v of snap.vehicles) {
          if (v.isPlayer || v.id === p.id) continue;
          if (myClass && v.class && v.class !== myClass) continue;
          const candidates: number[] = [];
          if (completedSectorIdx === 0) {
            if (v.bestS1 > 0.5) candidates.push(v.bestS1);
            if (v.lastS1 > 0.5) candidates.push(v.lastS1);
            if (v.curS1 > 0.5) candidates.push(v.curS1);
          } else if (completedSectorIdx === 1) {
            if (v.bestS2 > v.bestS1 && v.bestS1 > 0.5) candidates.push(v.bestS2 - v.bestS1);
            if (v.lastS2 > v.lastS1 && v.lastS1 > 0.5) candidates.push(v.lastS2 - v.lastS1);
            if (v.curS2 > v.curS1 && v.curS1 > 0.5) candidates.push(v.curS2 - v.curS1);
          } else if (completedSectorIdx === 2) {
            if (v.bestLap > v.bestS2 && v.bestS2 > 0.5) candidates.push(v.bestLap - v.bestS2);
            if (v.lastLap > v.lastS2 && v.lastS2 > 0.5) candidates.push(v.lastLap - v.lastS2);
          }
          for (const c of candidates) {
            if (c > 0.5 && c < bestRivalSector) bestRivalSector = c;
          }
        }

        const hasRivalRef = Number.isFinite(bestRivalSector);
        const beatOwnSession = prevMySessionBest === 0 || sectorTime < prevMySessionBest - 0.002;
        const beatOwnPrevious =
          (prevMySessionBest > 0 && sectorTime < prevMySessionBest - 0.002) ||
          (prevPb > 0 && sectorTime < prevPb - 0.002);

        if (hasRivalRef && beatOwnSession && sectorTime < bestRivalSector - 0.002) {
          // Fastest sector of the entire session (among class rivals) -> PURPLE
          this.trigger("Sector Purpura", false, { sector: sectorNum });
        } else if (beatOwnPrevious) {
          // Improved personal sector time, but NOT faster than the class/session benchmark -> GREEN
          this.trigger("Sector Verde", false, { sector: sectorNum });
        }

        if (prevMySessionBest === 0 || sectorTime < prevMySessionBest) {
          this.mySessionBestSectors[completedSectorIdx] = sectorTime;
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

    // Capture starting class position at race start (Lap 0/1) to measure positions gained/lost at finish
    if (s.kind === "race" && me && this.raceStartPlace == null && p.lapNumber <= 1) {
      const startPos = me.classPlace && me.classPlace > 0 ? me.classPlace : me.place;
      if (startPos > 0) this.raceStartPlace = startPos;
    }

    // Contextual Finish according to position AND positions gained/lost since grid start!
    const isCheckered = s.phase === 8 || (me?.finishStatus != null && me.finishStatus === 1);
    if (isCheckered && !this.calledFinish) {
      this.calledFinish = true;
      const finalPos = me?.classPlace && me.classPlace > 0 ? me.classPlace : (me?.place ?? 1);
      const gained = this.raceStartPlace != null ? this.raceStartPlace - finalPos : 0;
      const lost = gained < 0 ? Math.abs(gained) : 0;
      const ctx = { place: me?.place ?? finalPos, classPlace: finalPos, gained: Math.max(0, gained), lost };

      if (finalPos === 1) {
        this.trigger("Victoria", false, ctx);
      } else if (finalPos <= 3) {
        this.trigger("Podio", false, ctx);
      } else if (gained >= 2) {
        this.trigger("Final Remontada", false, ctx);
      } else if (lost >= 2) {
        this.trigger("Final Pesimista", false, ctx);
      } else if (finalPos <= 10) {
        this.trigger("Top 10", false, ctx);
      } else {
        this.trigger("Final Pesimista", false, { ...ctx, lost: Math.max(1, lost) });
      }
    } else if (!isCheckered && s.phase < 7) {
      this.calledFinish = false;
    }
  }
}

export const spotter = new SpotterEngine();
