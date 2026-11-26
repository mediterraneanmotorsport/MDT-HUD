import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { api, isNativeTauri } from "./api";
import { applyOutputSink, startHoldMicRecording, type HoldMicSession } from "./audioDevices.svelte";
import {
  config,
  cycleNextProfile,
  saveConfig,
  switchProfile,
  toggleBroadcastMode,
} from "./config.svelte";
import { lapTime } from "./format";
import { getStaticPhrasesForPersonality } from "./spotterPhrases";
import type { Snapshot, Vehicle } from "./types";

export const VOICE_COMMANDS_GUIDE = {
  actions: [
    { say: "«Cambia de perfil» / «Pon perfil [nombre]»", does: "Alterna al siguiente perfil de HUD o busca uno por nombre" },
    { say: "«Pon modo clasificación» / «Quita modo qualy»", does: "Activa o desactiva el modo Qualy/Hotlap limpio" },
    { say: "«Oculta el radar» / «Muestra el radar»", does: "Muestra u oculta cualquier widget (radar, mapa, delta, gomas, combustible, clasificación, daños)" },
    { say: "«Oculta el overlay» / «Muestra el overlay»", does: "Oculta o vuelve a mostrar todo el HUD en pista" },
    { say: "«Silencia el spotter» / «Activa el spotter»", does: "Silencia o reactiva los avisos automáticos en pista" },
    { say: "«Activa modo broadcast» / «Quita modo broadcast»", does: "Cambia entre conducción normal y Modo Broadcast" },
    { say: "«Pon modo showman» / «profesional» / «motivador» / «estratega»", does: "Cambia la personalidad del Ingeniero IA en directo" },
    { say: "«Marca esta vuelta» / «Guarda clip»", does: "Guarda una marca con hora/vuelta en la telemetría" },
  ],
  questions: [
    { say: "«¿Quién va en 5ª posición / líder / último?»", does: "Piloto, coche, categoría, neumáticos y diferencia en cualquier posición" },
    { say: "«¿Quién ha hecho el récord de pista / vuelta rápida?»", does: "Piloto y tiempo exacto del récord absoluto y de tu categoría" },
    { say: "«¿Qué neumáticos lleva [piloto o P5]?»", does: "Compuesto, vueltas de neumático y desgaste de cualquier piloto o posición" },
    { say: "«¿Cuánta energía virtual o combustible le queda a [piloto o P3]?»", does: "Porcentaje de VE y combustible de cualquier rival o posición" },
    { say: "«¿Cuántas paradas / qué coche / qué ritmo lleva [piloto o P4]?»", does: "Paradas, sanciones, última/mejor vuelta, coche y gap de cualquier piloto" },
    { say: "«¿Quién está en boxes?» / «¿Cómo va el top 5?»", does: "Pilotos actualmente en pit lane o resumen de clasificación en directo" },
    { say: "«¿Cómo voy de ritmo / última vuelta / delta?»", does: "Última vuelta, mejor personal y delta actual" },
    { say: "«¿Cuánta gasolina / energía virtual me queda?»", does: "Vueltas restantes de combustible, VE y si llegas sin parar" },
    { say: "«¿Cómo van mis gomas / frenos / daños?»", does: "Compuesto, desgaste, temperatura de gomas/frenos y estado del coche" },
    { say: "«¿Cuánto queda de carrera / va a llover?»", does: "Tiempo/vueltas restantes, sanciones, lluvia y temperatura de pista" },
  ],
};

export interface OnnxVoiceInfo {
  name: string;
  fileName: string;
  path: string;
  hasConfig: boolean;
}

export interface OnnxVoicesStatus {
  dir: string;
  piperFound: boolean;
  piperPath: string;
  voices: OnnxVoiceInfo[];
}

export interface Qwen3VoiceProfile {
  name: string;
  dir: string;
  audioFile: string;
  hasAudio: boolean;
  hasTranscript: boolean;
  preloaded: boolean;
}

export interface Qwen3VoicesStatus {
  dir: string;
  endpoint: string;
  venvFound: boolean;
  whisperFound: boolean;
  serverRunning: boolean;
  serverReady: boolean;
  serverLoading: boolean;
  backend: string;
  gpu: string;
  dtype: string;
  model: string;
  error: string;
  cacheFiles: number;
  cacheBytes: number;
  profiles: Qwen3VoiceProfile[];
}

export function friendlyOnnxVoiceName(rawName: string): string {
  const n = rawName.toLowerCase();
  if (n === "carlos_mdt" || n.includes("davefx")) return "Carlos (Castellano Nativo · Masculina)";
  if (n === "elena_mdt" || n.includes("sharvard")) return "Elena (Castellano Nativo · Femenina)";
  return rawName;
}

const PERSONALITY_PROMPTS: Record<string, string> = {
  wec_pro:
    "Eres el ingeniero de pista oficial de Mediterranean Motorsport en Le Mans Ultimate (WEC). Hablas por radio al piloto en español de España: tono serio, preciso, profesional y muy conciso. Responde SIEMPRE en 1 o 2 frases cortas (máximo 30 palabras), sin markdown, sin emojis ni listas.",
  motivator:
    "Eres el ingeniero de pista de Mediterranean Motorsport en Le Mans Ultimate. Hablas por radio en español de España con tono cercano, motivador y enérgico, dando datos clave para empujar al piloto. Responde SIEMPRE en 1 o 2 frases cortas (máximo 32 palabras), sin markdown ni emojis.",
  strategist:
    "Eres un estratega experto de resistencia (WEC/LMU) en el muro de boxes. Hablas por radio en español de España priorizando combustible, Energía Virtual (VE), gestión de neumáticos y ventanas de parada (undercut/overcut). Responde SIEMPRE en 1 o 2 frases cortas (máximo 32 palabras), sin markdown ni emojis.",
  streamer_hype:
    "Eres un ingeniero de pista español caótico, directo, intenso y vacilón estilo streamer gallego (rollo Xokas) hablando por radio al piloto en Le Mans Ultimate. Usas expresiones coloquiales como 'hermano', 'crack', 'espabila', 'no me la líes', 'a reventar el crono', pero SIEMPRE das el dato exacto de telemetría. Responde en 1 frase corta (máximo 20 palabras), sin markdown ni emojis.",
};

/**
 * Adapts English motorsport terms, acronyms, and units into natural Spanish phonetics
 * for Piper TTS `.onnx` models (while keeping the original clean text for on-screen subtitles).
 */
function toSpanishRadioPhonetics(raw: string): string {
  let t = raw;
  const rules: [RegExp, string][] = [
    [/\bradio\s+check\b/gi, "reidio chek"],
    [/\bundercut\b/gi, "ándercat"],
    [/\bovercut\b/gi, "óvercat"],
    [/\bpit\s+lane\b/gi, "pit lein"],
    [/\bpit\s+limiter\b/gi, "limitador de pit"],
    [/\bpit\s+stop\b/gi, "parada en boxes"],
    [/\bsafety\s+car\b/gi, "seifti car"],
    [/\bfull\s+course\s+yellow\b/gi, "ful cors yelou"],
    [/\bFCY\b/g, "ful cors yelou"],
    [/\bflat\s+spot\b/gi, "flat espot"],
    [/\bslipstream\b/gi, "rebufo"],
    [/\blift\s*(?:and|&)\s*coast\b/gi, "lift an coust"],
    [/\bdrive\s+through\b/gi, "draif zru"],
    [/\bstop\s*(?:and|&)\s*go\b/gi, "estop an gou"],
    [/\bhypercar\b/gi, "jáipercar"],
    [/\bLMGT3\b/gi, "ge te tres"],
    [/\bLMP2\b/gi, "ele eme pe dos"],
    [/\bLMP3\b/gi, "ele eme pe tres"],
    [/\bWEC\b/g, "uec"],
    [/\bLMU\b/g, "le mans últimate"],
    [/\bERS\b/g, "e erre ese"],
    [/\bABS\b/g, "a be ese"],
    [/\bTC\b/g, "control de tracción"],
    [/\bARB\b/g, "barras estabilizadoras"],
    [/\bVE\b/g, "energía virtual"],
    [/\bslicks?\b/gi, "esliks"],
    [/\bP1\b/g, "primero"],
    [/\bP2\b/g, "segundo"],
    [/\bP3\b/g, "tercero"],
    [/\bP(\d+)\b/g, "posición $1"],
    [/(\d+)\.(\d+)\s*s\b/gi, "$1 coma $2 segundos"],
    [/(\d+)\.(\d+)\s*L\b/g, "$1 coma $2 litros"],
    [/(\d+)\s*°C/g, "$1 grados"],
    [/(\d+)\s*km\/h/gi, "$1 kilómetros por hora"],
    [/(\d+)%/g, "$1 por ciento"],
  ];
  for (const [re, rep] of rules) {
    t = t.replace(re, rep);
  }
  return t;
}

/** Formats a lap time in seconds into natural spoken Spanish (e.g. "1 minuto 42 coma 3"). */
function spokenLapTime(sec: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "sin tiempo registrado";
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  const whole = Math.floor(rem);
  const tenths = Math.round((rem - whole) * 10);
  const adjWhole = tenths === 10 ? whole + 1 : whole;
  const adjTenths = tenths === 10 ? 0 : tenths;
  if (mins > 0) {
    return `${mins} ${mins === 1 ? "minuto" : "minutos"} ${adjWhole} coma ${adjTenths}`;
  }
  return `${adjWhole} coma ${adjTenths} segundos`;
}

function normalizeQueryText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#ªº°\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateTyreCompound(raw: string): string {
  const c = (raw || "").trim().toLowerCase();
  if (!c) return "";
  if (c.includes("soft") || c.includes("blando")) return "blandos";
  if (c.includes("med") || c.includes("medio")) return "medios";
  if (c.includes("hard") || c.includes("duro")) return "duros";
  if (c.includes("wet") || c.includes("rain") || c.includes("lluv")) return "de lluvia";
  if (c.includes("inter")) return "intermedios";
  if (c.includes("slick")) return "slicks";
  return raw.trim();
}

function describeVehicleTyres(v: Vehicle): string {
  const comps = (v.tyreCompounds ?? []).map((c) => translateTyreCompound(c)).filter(Boolean);
  let compTxt = "sin dato de compuesto en telemetría";
  if (comps.length > 0) {
    const fl = comps[0];
    const fr = comps[1] ?? fl;
    const rl = comps[2] ?? fl;
    const rr = comps[3] ?? rl;
    if (fl === fr && fl === rl && fl === rr) {
      compTxt = `neumáticos ${fl}`;
    } else if (fl === fr && rl === rr) {
      compTxt = `${fl} delante y ${rl} detrás`;
    } else {
      compTxt = `mezcla de compuestos (${fl}, ${fr}, ${rl}, ${rr})`;
    }
  }
  const extras: string[] = [];
  if (v.tyreLaps > 0) {
    extras.push(`con ${v.tyreLaps} ${v.tyreLaps === 1 ? "vuelta" : "vueltas"}`);
  }
  if (v.tyreWear != null && Number.isFinite(v.tyreWear)) {
    const pct = Math.round(v.tyreWear <= 1 ? v.tyreWear * 100 : v.tyreWear);
    if (pct > 0 && pct <= 100) extras.push(`al ${pct} por ciento de vida`);
  }
  return extras.length > 0 ? `${compTxt} ${extras.join(" y ")}` : compTxt;
}

const SPANISH_ORDINALS: [RegExp, number][] = [
  [/\b(?:primer[oa]?|lider|punter[oa]?|cabeza de carrera)\b/, 1],
  [/\bsegund[oa]?\b/, 2],
  [/\btercer[oa]?\b/, 3],
  [/\bcuart[oa]?\b/, 4],
  [/\bquint[oa]?\b/, 5],
  [/\bsext[oa]?\b/, 6],
  [/\bseptim[oa]?\b/, 7],
  [/\boctav[oa]?\b/, 8],
  [/\bnoven[oa]?\b/, 9],
  [/\bdecim[oa]?\b/, 10],
  [/\b(?:undecim[oa]?|onceav[oa]?)\b/, 11],
  [/\b(?:duodecim[oa]?|doceav[oa]?)\b/, 12],
  [/\bdecimotercer[oa]?\b/, 13],
  [/\bdecimocuart[oa]?\b/, 14],
  [/\bdecimoquint[oa]?\b/, 15],
  [/\bdecimosext[oa]?\b/, 16],
  [/\bdecimoseptim[oa]?\b/, 17],
  [/\bdecimoctav[oa]?\b/, 18],
  [/\bdecimonoven[oa]?\b/, 19],
  [/\bvigesim[oa]?\b/, 20],
];

const QUERY_STOP_WORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "en", "con", "sin",
  "por", "para", "que", "quien", "como", "cuando", "donde", "cual", "cuanto", "cuanta", "cuantos",
  "cuantas", "esta", "estan", "va", "van", "lleva", "llevan", "tiene", "tienen", "queda", "quedan",
  "piloto", "coche", "auto", "posicion", "puesto", "plaza", "lugar", "general", "clase", "categoria",
  "neumatico", "neumaticos", "goma", "gomas", "rueda", "ruedas", "compuesto", "energia", "virtual",
  "combustible", "gasolina", "fuel", "vuelta", "vueltas", "rapida", "mejor", "ultima", "record",
  "pista", "sesion", "carrera", "boxes", "box", "parada", "paradas", "sancion", "sanciones",
  "penalizacion", "tiempo", "ritmo", "distancia", "diferencia", "gap", "delante", "detras", "atras",
  "lider", "primero", "ultimo", "mi", "mis", "me", "le", "les", "su", "sus", "nos", "hecho", "hizo",
  "numero", "dorsal", "marca", "modelo", "equipo", "top", "podio", "clasificacion",
]);

function extractRequestedPosition(q: string): number | null {
  if (/\b(?:ultim[oa]|farolillo)\b/.test(q) && !/\bultima vuelta\b/.test(q) && !/\bultimo tiempo\b/.test(q)) {
    return -1;
  }
  const explicit =
    q.match(/\bp\s*(\d{1,2})\b/) ??
    q.match(/\b(?:posicion|puesto|plaza)\s*(?:numero\s*)?(\d{1,2})\b/) ??
    q.match(/\b(\d{1,2})\s*[ªº°a]?\s*(?:posicion|puesto|plaza|lugar)\b/) ??
    q.match(/\b(?:en|al|del|el|la)\s+(\d{1,2})\s*[ªº°]\b/);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    if (n >= 1 && n <= 64) return n;
  }
  for (const [rx, pos] of SPANISH_ORDINALS) {
    if (rx.test(q)) return pos;
  }
  return null;
}

function findTargetVehicle(
  snap: Snapshot,
  q: string,
  me: Vehicle | undefined,
): { vehicle: Vehicle; via: "name" | "position" | "relative" } | null {
  if (!snap.vehicles?.length) return null;

  // 1. Direct driver name or car number match (highest priority)
  const carNumMatch = q.match(/(?:#|dorsal|numero|coche)\s*(\d{1,3})\b/);
  if (carNumMatch) {
    const num = carNumMatch[1];
    const byNum = snap.vehicles.find((v) => String(v.number || "").replace(/^0+/, "") === num.replace(/^0+/, ""));
    if (byNum) return { vehicle: byNum, via: "name" };
  }

  const qTokens = q.split(/\s+/).filter((t) => t.length >= 3 && !QUERY_STOP_WORDS.has(t));
  let bestDriverMatch: { vehicle: Vehicle; score: number } | null = null;
  for (const v of snap.vehicles) {
    const normName = normalizeQueryText(v.driver);
    if (!normName || normName.length < 3) continue;
    if (q.includes(normName)) {
      bestDriverMatch = { vehicle: v, score: 100 + normName.length };
      break;
    }
    const nameParts = normName.split(/\s+/).filter((p) => p.length >= 3);
    let score = 0;
    for (const qt of qTokens) {
      for (const np of nameParts) {
        if (qt === np) {
          score += 20 + np.length;
        } else if (np.length >= 4 && qt.length >= 4 && (np.startsWith(qt) || qt.startsWith(np))) {
          score += 10 + Math.min(np.length, qt.length);
        }
      }
    }
    if (score > 0 && (!bestDriverMatch || score > bestDriverMatch.score)) {
      bestDriverMatch = { vehicle: v, score };
    }
  }
  if (bestDriverMatch && bestDriverMatch.score >= 14) {
    return { vehicle: bestDriverMatch.vehicle, via: "name" };
  }

  // 2. Explicit position query ("quien va en 5ª posicion", "que gomas lleva el tercero", "el lider")
  const pos = extractRequestedPosition(q);
  if (pos !== null) {
    const wantClass = /\b(mi categoria|mi clase|en clase|de clase|de categoria|en categoria)\b/.test(q);
    const myClass = me?.class || snap.player?.vehicleClass || "";
    const pool = wantClass && myClass ? snap.vehicles.filter((v) => v.class === myClass) : snap.vehicles;
    if (pos === -1) {
      const last = [...pool].sort((a, b) => (wantClass ? b.classPlace - a.classPlace : b.place - a.place))[0];
      if (last) return { vehicle: last, via: "position" };
    } else {
      const exact = wantClass
        ? pool.find((v) => v.classPlace === pos)
        : snap.vehicles.find((v) => v.place === pos) ?? pool.find((v) => v.classPlace === pos);
      if (exact) return { vehicle: exact, via: "position" };
    }
  }

  // 3. Relative rival ("el de delante", "el coche de detras", "rival de delante")
  if (me) {
    const asksAhead = /\b(de delante|coche de delante|piloto de delante|rival de delante|el de delante)\b/.test(q);
    const asksBehind = /\b(de detras|coche de detras|piloto de detras|rival de detras|el de detras|el de atras)\b/.test(q);
    if (asksAhead) {
      const ahead = snap.vehicles.find((v) => v.place === me.place - 1);
      if (ahead) return { vehicle: ahead, via: "relative" };
    }
    if (asksBehind) {
      const behind = snap.vehicles.find((v) => v.place === me.place + 1);
      if (behind) return { vehicle: behind, via: "relative" };
    }
  }

  return null;
}

class AiEngineerEngine {
  voicesStatus = $state<OnnxVoicesStatus | null>(null);
  qwen3Status = $state<Qwen3VoicesStatus | null>(null);
  qwen3Busy = $state(false);
  qwen3Installing = $state(false);
  qwen3InstallMessage = $state("");
  qwen3InstallPercent = $state(0);
  prewarming = $state(false);
  prewarmDone = $state(0);
  prewarmTotal = $state(0);
  prewarmCurrentPhrase = $state("");
  prewarmEtaSecs = $state(0);
  busy = $state(false);
  installing = $state(false);
  installMessage = $state("");
  installPercent = $state(0);
  speaking = $state(false);
  listening = $state(false);
  lastQuestion = $state("");
  lastAnswer = $state("");
  lastError = $state("");

  private audioCtx: AudioContext | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private wavCache = new Map<string, string>();
  private inflightAudio = new Map<string, Promise<string | null>>();
  private activePttSession: HoldMicSession | null = null;
  private activePttSnap: Snapshot | null = null;
  private pttSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private pttReleasedEarly = false;
  private lastProactiveLap = -1;
  private lastProactiveAt = 0;
  private testIdx = 0;

  async testVoice(): Promise<void> {
    if (this.busy || this.speaking) return;
    const isQwen = config.value.aiEngineer?.voiceEngine === "qwen3";
    const pers = config.value.aiEngineer?.personality ?? "wec_pro";
    const samples =
      pers === "streamer_hype"
        ? [
            "A ver, crack, radio activa. Sales tercero y vas como un tiro, no me la líes ahora.",
            "Eh, bandera amarilla delante, hermano, levanta el pie que alguien la ha liado parda.",
            "Sector uno en púrpura, pero qué barbaridad estás haciendo, estás loco.",
          ]
        : isQwen
          ? [
              "Radio check, te recibo alto y claro. Estás tercero en categoría, sigue empujando.",
              "Bandera amarilla en el sector dos, precaución.",
              "Frenos y gomas en ventana óptima, mantén el ritmo.",
            ]
          : [
              "Radio check, te recibo alto y claro. Estás tercero en categoría a ocho décimas del segundo, gomas al ochenta y dos por ciento y cuatro vueltas de gasolina. Sigue empujando.",
              "Atención en el muro, el piloto de delante acaba de entrar a boxes. Tienes pista limpia durante dos vueltas para intentar el overcut, da el máximo ahora.",
              "Temperaturas de frenos y neumáticos en ventana óptima. Te quedan doce minutos de carrera y margen suficiente de energía virtual hasta bandera a cuadros.",
            ];
    const text = samples[this.testIdx % samples.length];
    this.testIdx += 1;
    this.lastError = "";
    this.lastAnswer = text;
    this.busy = true;
    try {
      await this.speakWithRadio(text);
    } finally {
      this.busy = false;
    }
  }

  private getAudioCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctor) this.audioCtx = new Ctor();
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    applyOutputSink(this.audioCtx);
    return this.audioCtx;
  }

  private qwen3PollTimer: ReturnType<typeof setInterval> | null = null;

  async refreshVoices(): Promise<OnnxVoicesStatus | null> {
    if (!isNativeTauri()) return null;
    void this.refreshQwen3Voices();
    try {
      const st = await invoke<OnnxVoicesStatus>("list_onnx_voices");
      this.voicesStatus = st;
      // Auto-select first valid .onnx model if none configured or if old path no longer exists
      if (config.value.aiEngineer && st.voices.length > 0) {
        const exists = st.voices.some((v) => v.path === config.value.aiEngineer?.onnxModelPath);
        if (!exists) {
          config.value.aiEngineer.onnxModelPath = st.voices[0].path;
          saveConfig();
        }
      }
      return st;
    } catch (e) {
      this.lastError = String(e);
      return null;
    }
  }

  async openVoicesFolder() {
    if (!isNativeTauri()) return;
    await invoke("open_onnx_voices_folder").catch(() => {});
  }

  async refreshQwen3Voices(): Promise<Qwen3VoicesStatus | null> {
    if (!isNativeTauri()) return null;
    try {
      const endpoint = config.value.aiEngineer?.qwen3Endpoint?.trim() || "http://127.0.0.1:18421";
      const st = await invoke<Qwen3VoicesStatus>("list_qwen3_voices", { endpoint });
      this.qwen3Status = st;
      if (config.value.aiEngineer && st.profiles.length > 0) {
        const cur = config.value.aiEngineer.qwen3Profile;
        if (!cur || !st.profiles.some((p) => p.name === cur)) {
          const withAudio = st.profiles.find((p) => p.hasAudio) ?? st.profiles[0];
          config.value.aiEngineer.qwen3Profile = withAudio.name;
          saveConfig();
        }
      }
      if (st.serverReady || (!st.serverLoading && !st.serverRunning)) {
        if (this.qwen3PollTimer) {
          clearInterval(this.qwen3PollTimer);
          this.qwen3PollTimer = null;
        }
      }
      return st;
    } catch (e) {
      this.lastError = String(e);
      return null;
    }
  }

  async openQwen3VoicesFolder() {
    if (!isNativeTauri()) return;
    await invoke("open_qwen3_voices_folder").catch(() => {});
    void this.refreshQwen3Voices();
  }

  async startQwen3Server(): Promise<void> {
    if (!isNativeTauri() || this.qwen3Busy) return;
    const cfg = config.value.aiEngineer;
    if (!cfg) return;
    this.qwen3Busy = true;
    this.lastError = "";
    try {
      const st = await invoke<Qwen3VoicesStatus>("start_qwen3_tts_server", {
        pythonPath: cfg.qwen3PythonPath?.trim() || null,
        device: cfg.qwen3Device || "auto",
        dtype: cfg.qwen3Dtype || "fp16",
        modelId: "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        endpoint: cfg.qwen3Endpoint?.trim() || "http://127.0.0.1:18421",
      });
      this.qwen3Status = st;
      // Poll /health every 1.5s while the 0.6B model loads into VRAM and precomputes speaker prompts
      if (this.qwen3PollTimer) clearInterval(this.qwen3PollTimer);
      if (!st.serverReady) {
        this.qwen3PollTimer = setInterval(() => {
          void this.refreshQwen3Voices();
        }, 1500);
      }
    } catch (e) {
      this.lastError = String(e);
    } finally {
      this.qwen3Busy = false;
    }
  }

  async stopQwen3Server(): Promise<void> {
    if (!isNativeTauri()) return;
    if (this.qwen3PollTimer) {
      clearInterval(this.qwen3PollTimer);
      this.qwen3PollTimer = null;
    }
    const endpoint = config.value.aiEngineer?.qwen3Endpoint?.trim() || "http://127.0.0.1:18421";
    await invoke("stop_qwen3_tts_server", { endpoint }).catch(() => {});
    await new Promise((r) => setTimeout(r, 350));
    await this.refreshQwen3Voices();
  }

  async clearVoiceCache(): Promise<number> {
    this.wavCache.clear();
    this.lastError = "";
    if (!isNativeTauri()) return 0;
    try {
      const endpoint = config.value.aiEngineer?.qwen3Endpoint?.trim() || "http://127.0.0.1:18421";
      const removed = await invoke<number>("clear_qwen3_cache", { endpoint });
      this.lastAnswer = `Caché de voz limpiada (${removed} audios eliminados).`;
      await this.refreshQwen3Voices();
      return removed;
    } catch (e) {
      this.lastError = String(e);
      return 0;
    }
  }

  private prewarmCancelled = false;
  private prewarmTickTimer: ReturnType<typeof setInterval> | null = null;

  /** 1-click installer for MDT-QWEN (uv + Python 3.12 + PyTorch CUDA/ROCm + qwen-tts + Whisper STT). */
  async installMdtQwen(): Promise<boolean> {
    if (!isNativeTauri() || this.qwen3Installing) return false;
    const cfg = config.value.aiEngineer;
    this.qwen3Installing = true;
    this.qwen3InstallMessage = "Preparando instalación de MDT-QWEN...";
    this.qwen3InstallPercent = 3;
    this.lastError = "";

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<{ stage: string; message: string; percent: number }>(
        "mdt-qwen-install-progress",
        (ev) => {
          if (ev.payload) {
            this.qwen3InstallMessage = ev.payload.message;
            this.qwen3InstallPercent = ev.payload.percent;
          }
        },
      );
      const st = await invoke<Qwen3VoicesStatus>("install_mdt_qwen", {
        gpuPref: cfg?.qwen3Device || "auto",
        endpoint: cfg?.qwen3Endpoint?.trim() || "http://127.0.0.1:18421",
      });
      this.qwen3Status = st;
      this.qwen3InstallMessage = "✓ MDT-QWEN + Whisper STT listos";
      this.qwen3InstallPercent = 100;
      return true;
    } catch (e) {
      this.lastError = String(e);
      this.qwen3InstallMessage = "";
      return false;
    } finally {
      unlisten?.();
      this.qwen3Installing = false;
    }
  }

  cancelPrewarm() {
    this.prewarmCancelled = true;
  }

  /**
   * Exports a custom personality as JSON, optionally bundling the linked MDT-QWEN reference audio (`ref.wav` + `ref.txt`)
   * in base64 so teammates can import the full voice + personality in 1 click!
   */
  async exportPersonalityPack(personalityId: string, includeVoiceWav: boolean): Promise<{ filename: string; json: string }> {
    const cfg = config.value.aiEngineer;
    const custom = cfg?.customPersonalities?.[personalityId];
    if (!custom) {
      throw new Error("Solo se pueden exportar personalidades personalizadas creadas en el editor.");
    }
    const voiceProfile = custom.linkedVoiceProfile?.trim() || cfg?.qwen3Profile?.trim() || "";
    let voiceBundle: { profileName: string; audioFile: string; audioBase64: string; refText: string } | null = null;
    if (includeVoiceWav && voiceProfile && isNativeTauri()) {
      voiceBundle = await invoke<{ profileName: string; audioFile: string; audioBase64: string; refText: string }>(
        "read_qwen3_voice_bundle",
        { profileName: voiceProfile },
      );
    }
    const pack = {
      format: "mdt-voice-personality-v1",
      exportedAt: new Date().toISOString(),
      personality: $state.snapshot(custom),
      voiceBundle,
    };
    const slug = custom.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "personalidad";
    return {
      filename: includeVoiceWav && voiceBundle ? `${slug}.mdtvoice.json` : `${slug}.personality.json`,
      json: JSON.stringify(pack, null, 2),
    };
  }

  /** Imports a `.personality.json` or `.mdtvoice.json` pack (restoring phrases + optional `ref.wav` into `VocesQwen3/`). */
  async importPersonalityPack(rawJson: string): Promise<{ name: string; voiceImported: string | null }> {
    const parsed = JSON.parse(rawJson);
    const pers = parsed?.personality ?? parsed;
    if (!pers || typeof pers !== "object" || typeof pers.name !== "string" || !pers.phrases) {
      throw new Error("El archivo no es un paquete válido de personalidad MDT-HUD.");
    }
    if (!config.value.aiEngineer) {
      throw new Error("Ingeniero IA no inicializado.");
    }
    const id =
      typeof pers.id === "string" && pers.id.startsWith("custom_")
        ? pers.id
        : `custom_${Date.now().toString(36)}`;

    let voiceImported: string | null = null;
    const vb = parsed?.voiceBundle;
    if (vb && vb.profileName && vb.audioBase64 && isNativeTauri()) {
      voiceImported = await invoke<string>("write_qwen3_voice_bundle", {
        profileName: String(vb.profileName),
        audioFile: String(vb.audioFile || "ref.wav"),
        audioBase64: String(vb.audioBase64),
        refText: typeof vb.refText === "string" ? vb.refText : null,
      });
    }

    const nextMap = { ...(config.value.aiEngineer.customPersonalities ?? {}) };
    nextMap[id] = {
      id,
      name: String(pers.name).trim() || "Personalidad Importada",
      description: String(pers.description ?? ""),
      llmPrompt: String(pers.llmPrompt ?? ""),
      linkedVoiceProfile: voiceImported ?? (typeof pers.linkedVoiceProfile === "string" ? pers.linkedVoiceProfile : undefined),
      phrases: pers.phrases && typeof pers.phrases === "object" ? pers.phrases : {},
    };
    config.value.aiEngineer.customPersonalities = nextMap;
    config.value.aiEngineer.personality = id;
    if (voiceImported) {
      config.value.aiEngineer.qwen3Profile = voiceImported;
    }
    saveConfig();
    if (voiceImported) {
      void this.refreshQwen3Voices();
    }
    return { name: nextMap[id].name, voiceImported };
  }

  /** Pre-generates all static phrases of the active personality into disk cache with live countdown ETA. */
  async prewarmPersonalityCache(): Promise<void> {
    if (!isNativeTauri() || this.prewarming) return;
    const cfg = config.value.aiEngineer;
    if (!cfg || cfg.voiceEngine !== "qwen3") return;
    if (!this.qwen3Status?.serverReady) {
      this.lastError = "Inicia primero el servidor MDT-QWEN antes de pre-generar la caché.";
      return;
    }

    const profile = cfg.qwen3Profile?.trim() || "Antonio";
    const endpoint = cfg.qwen3Endpoint?.trim() || "http://127.0.0.1:18421";
    const phrases = getStaticPhrasesForPersonality(cfg.personality, cfg.customPersonalities);
    if (phrases.length === 0) return;

    this.prewarming = true;
    this.prewarmCancelled = false;
    this.prewarmDone = 0;
    this.prewarmTotal = phrases.length;
    this.prewarmCurrentPhrase = "";
    this.prewarmEtaSecs = phrases.length * 5;
    this.lastError = "";

    let avgGenMs = 5500;
    let genCount = 0;

    if (this.prewarmTickTimer) clearInterval(this.prewarmTickTimer);
    this.prewarmTickTimer = setInterval(() => {
      if (this.prewarmEtaSecs > 1) this.prewarmEtaSecs -= 1;
    }, 1000);

    try {
      for (let i = 0; i < phrases.length; i++) {
        if (this.prewarmCancelled) break;
        const phrase = phrases[i];
        this.prewarmCurrentPhrase = phrase;
        const spokenText = toSpanishRadioPhonetics(phrase);
        const t0 = performance.now();
        try {
          const wav = await invoke<string>("synthesize_qwen3_tts", {
            text: spokenText,
            profile,
            endpoint,
            language: "Spanish",
          });
          this.wavCache.set(`qwen3|${profile}|${spokenText}`, wav);
        } catch (e) {
          this.lastError = String(e);
        }
        const elapsed = performance.now() - t0;
        // Only update synthesis average for uncached generations (>350ms)
        if (elapsed > 350) {
          genCount += 1;
          avgGenMs = genCount === 1 ? elapsed : avgGenMs * 0.65 + elapsed * 0.35;
        }
        this.prewarmDone = i + 1;
        const remaining = phrases.length - this.prewarmDone;
        this.prewarmEtaSecs = Math.max(0, Math.round((remaining * avgGenMs) / 1000));
        if (this.prewarmDone % 3 === 0 || this.prewarmDone === phrases.length) {
          void this.refreshQwen3Voices();
        }
      }
      if (!this.prewarmCancelled) {
        this.lastAnswer = `✓ Pre-generación completada: ${this.prewarmDone}/${this.prewarmTotal} frases listas en caché (<2ms en pista).`;
      }
    } finally {
      if (this.prewarmTickTimer) {
        clearInterval(this.prewarmTickTimer);
        this.prewarmTickTimer = null;
      }
      this.prewarming = false;
      this.prewarmCurrentPhrase = "";
      this.prewarmEtaSecs = 0;
      void this.refreshQwen3Voices();
    }
  }

  /** One-click automatic installer for Piper TTS (`piper.exe`) + starter Spanish `.onnx` voice. */
  async installPiper(installDefaultVoice = true): Promise<boolean> {
    if (!isNativeTauri() || this.installing) return false;
    this.installing = true;
    this.installMessage = "Preparando instalación de Piper TTS...";
    this.installPercent = 5;
    this.lastError = "";

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<{ stage: string; message: string; percent: number }>(
        "piper-install-progress",
        (ev) => {
          if (ev.payload) {
            this.installMessage = ev.payload.message;
            this.installPercent = ev.payload.percent;
          }
        },
      );
      const st = await invoke<OnnxVoicesStatus>("install_piper_tts", { installDefaultVoice });
      this.voicesStatus = st;
      if (config.value.aiEngineer && !config.value.aiEngineer.onnxModelPath && st.voices.length > 0) {
        config.value.aiEngineer.onnxModelPath = st.voices[0].path;
        saveConfig();
      }
      this.installMessage = "✓ Piper TTS listo";
      this.installPercent = 100;
      return true;
    } catch (e) {
      this.lastError = String(e);
      this.installMessage = "";
      return false;
    } finally {
      unlisten?.();
      this.installing = false;
    }
  }

  /** Builds a compact, high-signal Spanish telemetry summary for the local LLM. */
  buildTelemetryContext(snap: Snapshot | null): string {
    if (!snap?.player) return "No hay sesión activa en pista ahora mismo.";
    const p = snap.player;
    const s = snap.session;
    const st = snap.strategy;
    const me = snap.vehicles.find((v) => v.isPlayer);
    const ahead = me ? snap.vehicles.find((v) => v.place === me.place - 1) : null;
    const behind = me ? snap.vehicles.find((v) => v.place === me.place + 1) : null;
    const avgWear = p.wheels.length === 4 ? Math.round((p.wheels.reduce((a, w) => a + w.wear, 0) / 4) * 100) : 100;
    const maxTyreTemp = p.wheels.length === 4
      ? Math.round(Math.max(...p.wheels.map((w) => (w.surfaceTemp[0] + w.surfaceTemp[1] + w.surfaceTemp[2]) / 3)))
      : 0;
    const maxBrakeTemp = p.wheels.length === 4 ? Math.round(Math.max(...p.wheels.map((w) => w.brakeTemp))) : 0;
    const minsLeft = s.timeRemaining > 0 ? Math.round(s.timeRemaining / 60) : 0;

    // Compact live grid table (overall fastest + top 12 + neighbors around player) so LLMs can answer ANY rival/position question
    const fastestAll = snap.vehicles.filter((v) => v.bestLap > 5).sort((a, b) => a.bestLap - b.bestLap)[0];
    const sortedGrid = [...snap.vehicles].sort((a, b) => a.place - b.place);
    const gridSelected = new Map<number, Vehicle>();
    for (const v of sortedGrid.slice(0, 12)) gridSelected.set(v.id, v);
    if (me) {
      for (const v of sortedGrid) {
        if (Math.abs(v.place - me.place) <= 3) gridSelected.set(v.id, v);
      }
    }
    const gridLines = [...gridSelected.values()]
      .sort((a, b) => a.place - b.place)
      .map((v) => {
        const comp = translateTyreCompound(v.tyreCompounds?.[0] || "") || "?";
        const veStr = v.virtualEnergy != null ? `VE:${Math.round(v.virtualEnergy * 100)}%` : "";
        const fuelStr = v.fuelFraction > 0 ? `Fuel:${Math.round(v.fuelFraction * 100)}%` : "";
        const bestStr = v.bestLap > 5 ? `Mejor:${lapTime(v.bestLap)}` : "";
        const pitStr = v.inPits ? "EN_BOXES" : `Pits:${v.numPitstops}`;
        return `P${v.place}(C${v.classPlace} ${v.class}) ${v.driver} [${v.model || v.vehicle}] Gomas:${comp}(${v.tyreLaps}v) ${veStr} ${fuelStr} ${bestStr} ${pitStr}`.replace(/\s+/g, " ").trim();
      })
      .join(" | ");

    return [
      `Circuito: ${s.track || "Desconocido"} (${s.kind}), vuelta ${p.lapNumber + 1}.`,
      minsLeft > 0 ? `Tiempo restante: ${minsLeft} min.` : "",
      me ? `Posición: P${me.place} general (P${me.classPlace} en ${me.class}).` : "",
      ahead && me ? `Delante: ${ahead.driver} a ${me.timeBehindNext.toFixed(1)}s.` : "",
      behind && me ? `Detrás: ${behind.driver} a ${Math.max(0, behind.timeBehindLeader - me.timeBehindLeader).toFixed(1)}s.` : "",
      fastestAll ? `Récord de pista/sesión: ${fastestAll.driver} con ${lapTime(fastestAll.bestLap)}.` : "",
      snap.timing.lastLapTime > 0 ? `Última vuelta: ${lapTime(snap.timing.lastLapTime)}, mejor: ${lapTime(snap.timing.sessionBest)}.` : "",
      st.lapsOfFuel > 0 ? `Combustible: ${p.fuel.toFixed(1)}L (${st.lapsOfFuel.toFixed(1)} vueltas).` : `Combustible: ${p.fuel.toFixed(1)}L.`,
      p.virtualEnergy > 0 ? `Energía Virtual (VE): ${Math.round(p.virtualEnergy * 100)}% (${st.lapsOfVe.toFixed(1)} vueltas).` : "",
      `Neumáticos (${p.frontCompound}): vida media ${avgWear}%, temp máx ${maxTyreTemp}°C. Frenos máx: ${maxBrakeTemp}°C.`,
      s.weather?.raining > 0.05 ? `Lluvia activa (${Math.round(s.weather.raining * 100)}%).` : `Pista seca (${Math.round(s.weather?.trackTemp ?? 25)}°C).`,
      me?.numPenalties ? `Penalizaciones pendientes: ${me.numPenalties}.` : "",
      gridLines ? `Parrilla en directo: ${gridLines}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  /** Smart context-aware local engineer brain (understands Spanish motorsport intents without needing Ollama). */
  generateLocalBrief(snap: Snapshot | null, question = ""): string {
    const fast = config.value.aiEngineer?.voiceEngine === "qwen3";
    if (!snap?.player) {
      return fast
        ? "Radio check, ingeniero listo en el muro."
        : "Radio check, ingeniero local listo en el muro. Cuando salgas a pista te paso telemetría en directo.";
    }
    const q = normalizeQueryText(question);

    const p = snap.player;
    const s = snap.session;
    const st = snap.strategy;
    const me = snap.vehicles.find((v) => v.isPlayer);
    const myClass = me?.class || p.vehicleClass || "";
    const sameClass = snap.vehicles.filter((v) => (!myClass || v.class === myClass));
    const ahead = me ? snap.vehicles.find((v) => v.place === me.place - 1) : null;
    const behind = me ? snap.vehicles.find((v) => v.place === me.place + 1) : null;
    const leaderOverall = snap.vehicles.reduce((best, v) => (!best || v.place < best.place ? v : best), snap.vehicles[0]);
    const classLeader = sameClass.reduce((best, v) => (!best || v.classPlace < best.classPlace ? v : best), sameClass[0]);

    const avgWear = p.wheels.length === 4 ? Math.round((p.wheels.reduce((a, w) => a + w.wear, 0) / 4) * 100) : 100;
    const minWheelIdx = p.wheels.length === 4
      ? p.wheels.reduce((mi, w, i, arr) => (w.wear < arr[mi].wear ? i : mi), 0)
      : 0;
    const wheelNames = ["delantera izquierda", "delantera derecha", "trasera izquierda", "trasera derecha"];
    const maxTyreTemp = p.wheels.length === 4
      ? Math.round(Math.max(...p.wheels.map((w) => (w.surfaceTemp[0] + w.surfaceTemp[1] + w.surfaceTemp[2]) / 3)))
      : 0;
    const maxBrakeTemp = p.wheels.length === 4 ? Math.round(Math.max(...p.wheels.map((w) => w.brakeTemp))) : 0;

    // 0A. Grid-wide: who is currently in pits?
    if (/(quien|alguien|cuantos|pilotos|coches).*(en boxes|en pit|entrando a boxes|parando)/.test(q)) {
      const inPits = snap.vehicles.filter((v) => v.inPits && !v.inGarage);
      if (inPits.length === 0) {
        return "No hay ningún coche en boxes ahora mismo.";
      }
      const names = inPits.slice(0, 4).map((v) => `${v.driver} (P${v.place})`).join(", ");
      return inPits.length === 1
        ? `Ahora mismo solo está en boxes ${names}.`
        : `Hay ${inPits.length} coches en boxes: ${names}${inPits.length > 4 ? " y otros más" : ""}.`;
    }

    // 0B. Grid-wide: Top 3 / Top 5 / Standings summary
    if (/(top\s*3|top\s*5|podio actual|como va la clasificacion|clasificacion general|quienes van arriba)/.test(q)) {
      const wantClass = /\b(mi categoria|mi clase|clase|categoria)\b/.test(q);
      const count = /top\s*5/.test(q) ? 5 : 3;
      const pool = (wantClass && myClass ? sameClass : snap.vehicles)
        .slice()
        .sort((a, b) => (wantClass ? a.classPlace - b.classPlace : a.place - b.place))
        .slice(0, count);
      if (pool.length === 0) return "Sin datos de clasificación todavía.";
      const list = pool.map((v, i) => `P${i + 1} ${v.driver}`).join(", ");
      return `${wantClass && myClass ? `En ${myClass}` : "En la general"} van: ${list}.`;
    }

    // 0C. Grid-wide: how many cars on track
    if (/(cuantos coches|cuantos pilotos|cuantos somos|parrilla)/.test(q)) {
      const total = snap.vehicles.length;
      const inCls = sameClass.length;
      if (myClass && inCls !== total) {
        return `Hay ${total} coches en sesión, ${inCls} en tu categoría ${myClass}.`;
      }
      return `Hay ${total} coches en pista ahora mismo.`;
    }

    // 0D. Track / Session Record / Fastest Lap (overall + class)
    if (
      /(mas rapid|vuelta rapid|record|pole|mejor vuelta|mejor tiempo|tiempo de referencia|tiempo del lider|tiempo mas)/.test(q) &&
      !/(mi mejor|mi ultima|he hecho|hice)/.test(q) &&
      !findTargetVehicle(snap, q, me)
    ) {
      const fastestAll = snap.vehicles
        .filter((v) => v.bestLap > 5)
        .sort((a, b) => a.bestLap - b.bestLap)[0];
      const fastestClass = sameClass
        .filter((v) => v.bestLap > 5)
        .sort((a, b) => a.bestLap - b.bestLap)[0];
      const wantOverall = /(pista|absolut|general|todos|sesion)/.test(q) || !fastestClass;
      const primary = wantOverall ? (fastestAll ?? fastestClass) : (fastestClass ?? fastestAll);
      if (primary) {
        if (fast) return `Récord de ${primary.driver}: ${spokenLapTime(primary.bestLap)}.`;
        const extraClass =
          wantOverall && fastestClass && fastestAll && fastestClass.id !== fastestAll.id && myClass
            ? ` En tu categoría ${myClass} el más rápido es ${fastestClass.driver} con ${spokenLapTime(fastestClass.bestLap)}.`
            : "";
        const myBest =
          snap.timing.sessionBest > 5 && !primary.isPlayer
            ? ` Tu mejor es ${spokenLapTime(snap.timing.sessionBest)}.`
            : "";
        return `El récord de ${wantOverall ? "pista" : `tu categoría ${myClass}`} lo tiene ${primary.driver} (${primary.class || primary.model || "P" + primary.place}) con ${spokenLapTime(primary.bestLap)}.${extraClass}${myBest}`;
      }
      if (snap.timing.sessionBest > 5) {
        return fast ? `Tienes la vuelta rápida: ${spokenLapTime(snap.timing.sessionBest)}.` : `De momento tienes el mejor tiempo registrado con ${spokenLapTime(snap.timing.sessionBest)}.`;
      }
      return "Sin vueltas rápidas registradas todavía.";
    }

    // 0E. Omniscient Rival / Position Q&A (any driver by name, car #, P#, ordinal, or relative position)
    const asksExplicitlyAboutSelf = /\b(me queda|me quedan|mi coche|mis gomas|mis neumaticos|mi combustible|mi gasolina|mi energia|mi posicion|mi puesto|mi ritmo|mi mejor|mi vuelta|voy yo|tengo yo)\b/.test(q);
    const targetHit = !asksExplicitlyAboutSelf ? findTargetVehicle(snap, q, me) : null;
    if (targetHit) {
      const v = targetHit.vehicle;
      const posLabel =
        v.class && v.classPlace > 0 && v.classPlace !== v.place
          ? `P${v.place} general y P${v.classPlace} en ${v.class}`
          : `P${v.place}`;
      const gapToMeTxt = (() => {
        if (!me || v.isPlayer) return "";
        if (v.lapsBehindLeader !== me.lapsBehindLeader) {
          const lapDiff = Math.abs(v.lapsBehindLeader - me.lapsBehindLeader);
          return v.place < me.place
            ? `a ${lapDiff} ${lapDiff === 1 ? "vuelta" : "vueltas"} por delante`
            : `a ${lapDiff} ${lapDiff === 1 ? "vuelta" : "vueltas"} por detrás`;
        }
        const diff = v.timeBehindLeader - me.timeBehindLeader;
        if (Math.abs(diff) > 0.05) {
          return diff < 0
            ? `a ${Math.abs(diff).toFixed(1)} segundos por delante`
            : `a ${Math.abs(diff).toFixed(1)} segundos por detrás`;
        }
        return "";
      })();

      // E1. Tyres of target driver/position
      if (/(goma|neumat|rueda|compuesto|blando|medio|duro|lluvia|slick|desgaste)/.test(q)) {
        const tyreDesc = describeVehicleTyres(v);
        return fast
          ? `${v.driver} (${posLabel}) lleva ${tyreDesc}.`
          : `${v.driver}, en ${posLabel}, lleva ${tyreDesc}.`;
      }

      // E2. Virtual Energy / Fuel of target driver/position
      if (/(energ|virtual|\bve\b|combust|gasolina|fuel|deposito)/.test(q)) {
        const parts: string[] = [];
        if (v.virtualEnergy != null && Number.isFinite(v.virtualEnergy) && v.virtualEnergy >= 0) {
          parts.push(`${Math.round(v.virtualEnergy * 100)} por ciento de energía virtual`);
        }
        if (v.fuelFraction > 0 && Number.isFinite(v.fuelFraction)) {
          parts.push(`${Math.round(v.fuelFraction * 100)} por ciento de combustible`);
        }
        if (parts.length === 0) {
          return `La telemetría del simulador no publica la energía ni el combustible de ${v.driver} (${posLabel}).`;
        }
        return `A ${v.driver} (${posLabel}) le queda ${parts.join(" y ")}.`;
      }

      // E3. Pit stops of target
      if (/(parada|boxes|pit|ha parado|entradas)/.test(q)) {
        const pitNow = v.inPits ? " y está en boxes ahora mismo" : "";
        return `${v.driver} (${posLabel}) lleva ${v.numPitstops} ${v.numPitstops === 1 ? "parada" : "paradas"} en boxes${pitNow}.`;
      }

      // E4. Penalties of target
      if (/(sancion|penaliz)/.test(q)) {
        return v.numPenalties > 0
          ? `${v.driver} (${posLabel}) tiene ${v.numPenalties} ${v.numPenalties === 1 ? "penalización pendiente" : "penalizaciones pendientes"}.`
          : `${v.driver} (${posLabel}) no tiene sanciones pendientes.`;
      }

      // E5. Lap times / Pace of target
      if (/(vuelta|tiempo|ritmo|rapida|ultima|mejor|record)/.test(q)) {
        const last = v.lastLap > 5 ? `última vuelta en ${spokenLapTime(v.lastLap)}` : "";
        const best = v.bestLap > 5 ? `mejor vuelta en ${spokenLapTime(v.bestLap)}` : "";
        const combined = [last, best].filter(Boolean).join(" y ");
        if (!combined) return `${v.driver} (${posLabel}) aún no tiene vueltas cronometradas.`;
        return `${v.driver} (${posLabel}): ${combined}.`;
      }

      // E6. Car / Model / Team / Class of target
      if (/(que coche|modelo|marca|equipo|categoria|clase|dorsal)/.test(q)) {
        const car = v.model || v.vehicle || "coche desconocido";
        const cls = v.class ? ` en categoría ${v.class}` : "";
        const num = v.number ? ` con dorsal ${v.number}` : "";
        return `${v.driver} (${posLabel}) pilota un ${car}${cls}${num}.`;
      }

      // E7. Gap / Distance to target
      if (/(a cuanto|distancia|gap|diferencia|lejos|cerca)/.test(q)) {
        if (v.isPlayer) return `Eres tú mismo, vas en ${posLabel}.`;
        const leadGap = v.place === 1 ? "es el líder" : v.lapsBehindLeader > 0 ? `a ${v.lapsBehindLeader} vueltas del líder` : `a ${v.timeBehindLeader.toFixed(1)} segundos del líder`;
        return gapToMeTxt
          ? `${v.driver} (${posLabel}) está ${gapToMeTxt}, y ${leadGap}.`
          : `${v.driver} va en ${posLabel}, ${leadGap}.`;
      }

      // E8. Default: "Quién va en 5ª posición / líder / último" or general status of target
      const carTxt = v.model || v.vehicle ? ` con ${v.model || v.vehicle}` : "";
      const pitTxt = v.inPits ? ", actualmente en boxes" : "";
      const gapPart = gapToMeTxt ? `, ${gapToMeTxt}` : v.place === 1 ? ", líder de carrera" : v.timeBehindLeader > 0.05 ? `, a ${v.timeBehindLeader.toFixed(1)} segundos del líder` : "";
      const tyrePart = !fast && v.tyreCompounds?.[0] ? ` Lleva ${describeVehicleTyres(v)}.` : "";
      return `En ${posLabel} va ${v.driver}${carTxt}${pitTxt}${gapPart}.${tyrePart}`;
    }

    // 1. Fallback if user asked about a position that doesn't exist in the current grid
    const missingPos = !asksExplicitlyAboutSelf ? extractRequestedPosition(q) : null;
    if (missingPos !== null && missingPos > 0 && /(quien|posicion|puesto|goma|neumat|energ|combust|gasolina|coche)/.test(q)) {
      return `No hay ningún piloto en posición ${missingPos}; ahora mismo hay ${snap.vehicles.length} coches en pista.`;
    }

    // 2. Player's own best / last lap / pace / delta
    if (/(mi mejor|mi vuelta|ultima vuelta|ultimo tiempo|mi ritmo|mi tiempo|delta|cuanto pierdo|cuanto gano)/.test(q)) {
      if (fast) {
        if (snap.timing.lastLapTime > 5) return `Última ${spokenLapTime(snap.timing.lastLapTime)}, mejor ${spokenLapTime(snap.timing.sessionBest)}.`;
        return "Aún sin vuelta completada.";
      }
      const last = snap.timing.lastLapTime > 5 ? `Tu última vuelta fue ${spokenLapTime(snap.timing.lastLapTime)}` : "Aún no has completado vuelta";
      const best = snap.timing.sessionBest > 5 ? ` y tu mejor de sesión es ${spokenLapTime(snap.timing.sessionBest)}` : "";
      const deltaStr =
        snap.timing.deltaPb != null
          ? `. Ahora vas ${snap.timing.deltaPb <= 0 ? "ganando" : "perdiendo"} ${Math.abs(snap.timing.deltaPb).toFixed(1)} segundos.`
          : ".";
      return `${last}${best}${deltaStr}`;
    }

    // 3. Remaining race time / laps left
    if (/(cuanto queda|cuanto falta|tiempo restante|vueltas quedan|vueltas faltan|cuando acaba|final de carrera)/.test(q)) {
      const mins = s.timeRemaining > 0 ? Math.floor(s.timeRemaining / 60) : 0;
      const secs = s.timeRemaining > 0 ? Math.round(s.timeRemaining % 60) : 0;
      const lapsRem = st.lapsRemaining > 0 ? ` aproximadamente ${st.lapsRemaining.toFixed(1)} vueltas` : "";
      if (fast) {
        if (mins > 0) return `Quedan ${mins} minutos${st.lapsRemaining > 0 ? `, unas ${Math.round(st.lapsRemaining)} vueltas` : ""}.`;
        if (st.lapsRemaining > 0) return `Quedan ${st.lapsRemaining.toFixed(1)} vueltas.`;
        return `Vuelta ${p.lapNumber + 1}.`;
      }
      if (mins > 0) {
        return `Quedan ${mins} minutos${secs > 10 ? ` y ${secs} segundos` : ""} de sesión,${lapsRem}.`;
      }
      if (st.lapsRemaining > 0) {
        return `Quedan aproximadamente ${st.lapsRemaining.toFixed(1)} vueltas para bandera a cuadros.`;
      }
      return `Estás en la vuelta ${p.lapNumber + 1} de la sesión.`;
    }

    // 4. Penalties, track limits, flags
    if (/(sancion|penaliz|limite|track limit|bandera|amarilla|azul|fcy|safety)/.test(q)) {
      const pen = me?.numPenalties ?? 0;
      if (fast) {
        const flagShort = s.phase === 6 || s.yellowFlagState > 0 ? "Full Course Yellow." : s.sectorYellow?.some(Boolean) ? "Bandera amarilla." : "Bandera verde.";
        return pen > 0 ? `Tienes ${pen} sanciones. ${flagShort}` : `Sin sanciones. ${flagShort}`;
      }
      const penTxt = pen > 0 ? `Tienes ${pen} ${pen === 1 ? "penalización pendiente" : "penalizaciones pendientes"}.` : "No tienes penalizaciones pendientes.";
      const tlWarn =
        p.trackLimitsStepsPerPenalty > 0
          ? ` Límites de pista en ${Math.round((p.trackLimitsSteps / p.trackLimitsStepsPerPenalty) * 100)} por ciento.`
          : "";
      const flagTxt =
        s.phase === 6 || s.yellowFlagState > 0
          ? " Atención, Full Course Yellow activo."
          : s.sectorYellow?.some(Boolean)
            ? " Hay bandera amarilla local en pista."
            : " Pista con bandera verde.";
      return `${penTxt}${tlWarn}${flagTxt}`;
    }

    // 5. Fuel / Virtual Energy / Pit strategy
    if (/(fuel|gasolina|combust|energ|ve\b|box|parar|parada|estrateg|lleg|alcanz|stint)/.test(q)) {
      const lapsF = st.lapsOfFuel > 0 ? `${st.lapsOfFuel.toFixed(1)} vueltas de gasolina` : `${p.fuel.toFixed(1)} litros`;
      const vePart = p.virtualEnergy > 0 && st.lapsOfVe > 0 ? ` y ${st.lapsOfVe.toFixed(1)} vueltas de energía virtual` : "";
      const minRem = p.virtualEnergy > 0 && st.lapsOfVe > 0 ? Math.min(st.lapsOfFuel, st.lapsOfVe) : st.lapsOfFuel;
      if (fast) {
        const shortAdv = minRem > 0 && minRem < 2.2 ? "Box pronto." : st.lapsRemaining > 0 && minRem >= st.lapsRemaining + 0.3 ? "Llegas sin parar." : "Buen margen.";
        return `${lapsF}. ${shortAdv}`;
      }
      let advice = "Vamos bien de margen, mantén el ritmo.";
      if (minRem > 0 && minRem < 2.2) {
        advice = "Prepara parada en boxes pronto.";
      } else if (st.lapsRemaining > 0 && minRem > 0) {
        advice = minRem >= st.lapsRemaining + 0.3 ? "Te llega hasta bandera a cuadros sin parar." : `Necesitarás parar, faltan ${st.lapsRemaining.toFixed(1)} vueltas.`;
      }
      return `Tienes ${lapsF}${vePart}. ${advice}`;
    }

    // 6. Tyres / wear / temps
    if (/(goma|neumat|rueda|desgaste|compuesto|blando|medio|duro)/.test(q)) {
      const worstWear = p.wheels.length === 4 ? Math.round(p.wheels[minWheelIdx].wear * 100) : avgWear;
      const stateTxt = maxTyreTemp > 105 ? "calientes" : maxTyreTemp < 58 ? "frías" : "en ventana";
      if (fast) return `Gomas al ${avgWear} por ciento, ${maxTyreTemp} grados, ${stateTxt}.`;
      return `Llevas compuesto ${p.frontCompound || "actual"} al ${avgWear} por ciento de media. La más gastada es la ${wheelNames[minWheelIdx]} al ${worstWear} por ciento, temperatura máxima ${maxTyreTemp} grados, ${stateTxt}.`;
    }

    // 7. Brakes / bias / lockups
    if (/(freno|disco|reparto|bias|bloque)/.test(q)) {
      const bb = (p.brakeBiasFront > 1 ? p.brakeBiasFront : p.brakeBiasFront * 100).toFixed(1);
      const bTxt = maxBrakeTemp > 760 ? "muy calientes, cuida la frenada" : "en temperatura correcta";
      if (fast) return `Frenos a ${maxBrakeTemp} grados, reparto ${bb} delante.`;
      return `Discos de freno a ${maxBrakeTemp} grados de máxima, ${bTxt}. Reparto de frenada al ${bb} por ciento delante.`;
    }

    // 8. Damage / car status
    if (/(dano|daño|coche|motor|roto|golpe|aero|suspension)/.test(q)) {
      const maxDent = Math.max(0, ...p.dents);
      if (p.detached || maxDent > 0.35) {
        return fast ? "Daños importantes, valora entrar a boxes." : "El coche presenta daños importantes en carrocería. Valora entrar a boxes para reparar.";
      }
      if (p.overheating) {
        return fast ? "Motor caliente, sal del rebufo." : "Atención, el motor está sobrecalentado, abre hueco del rebufo para refrigerar.";
      }
      return fast ? "Coche limpio, sin daños." : "El coche está limpio, sin daños apreciables y temperaturas de motor correctas.";
    }

    // 9. Position, leader, rivals, gaps
    if (/(posicion|puesto|primero|lider|delante|detras|atras|gap|distancia|diferencia|rival|quien)/.test(q)) {
      if (!me) return "Sin referencia de posición todavía.";
      if (fast) {
        const aheadShort = ahead && me.timeBehindNext > 0.05 ? `, a ${me.timeBehindNext.toFixed(1)} segundos de ${ahead.driver}` : "";
        return `Vas P${me.classPlace || me.place}${aheadShort}.`;
      }
      const posTxt = `Vas P${me.classPlace || me.place}${myClass ? ` en ${myClass}` : ""}`;
      const aheadTxt = ahead && me.timeBehindNext > 0.05 ? `, a ${me.timeBehindNext.toFixed(1)} segundos de ${ahead.driver}` : "";
      const behindGap = behind ? Math.max(0, behind.timeBehindLeader - me.timeBehindLeader) : 0;
      const behindTxt = behind && behindGap > 0.05 ? `. Detrás viene ${behind.driver} a ${behindGap.toFixed(1)} segundos` : "";
      const leadTxt = classLeader && !classLeader.isPlayer ? `. El líder es ${classLeader.driver}` : leaderOverall?.isPlayer ? ". Eres el líder de carrera" : "";
      return `${posTxt}${aheadTxt}${behindTxt}${leadTxt}.`;
    }

    // 10. Weather / rain / track temperature (explicit weather keywords only — NOT generic "tiempo"!)
    if (/(lluv|llover|agua|clima|humedad|mojad|seca|temperatura|grados|que tiempo hace)/.test(q)) {
      if ((s.weather?.raining ?? 0) > 0.05) {
        return fast
          ? `Lluvia al ${Math.round(s.weather.raining * 100)} por ciento, pista a ${Math.round(s.weather?.trackTemp ?? 22)} grados.`
          : `Está lloviendo al ${Math.round(s.weather.raining * 100)} por ciento, humedad de pista en ${Math.round((s.weather.avgWetness ?? 0) * 100)} por ciento y asfalto a ${Math.round(s.weather?.trackTemp ?? 22)} grados.`;
      }
      return fast
        ? `Pista seca a ${Math.round(s.weather?.trackTemp ?? 25)} grados, sin lluvia.`
        : `Pista seca a ${Math.round(s.weather?.trackTemp ?? 25)} grados, ambiente a ${Math.round(s.weather?.ambientTemp ?? 20)} grados, sin lluvia en el radar.`;
    }

    // Default complete tactical race brief
    const posStr = me ? `Estás P${me.classPlace || me.place}` : "En pista";
    if (fast) {
      const fStr = st.lapsOfFuel > 0 ? `, ${st.lapsOfFuel.toFixed(1)} vueltas de fuel` : "";
      return `${posStr}${fStr}, gomas al ${avgWear} por ciento.`;
    }
    const gapStr = me && me.timeBehindNext > 0.05 ? ` a ${me.timeBehindNext.toFixed(1)} segundos del de delante` : "";
    const fuelStr = st.lapsOfFuel > 0 ? `, te quedan ${st.lapsOfFuel.toFixed(1)} vueltas de combustible` : "";
    const bestStr = snap.timing.sessionBest > 5 ? ` y tu mejor vuelta es ${spokenLapTime(snap.timing.sessionBest)}` : "";
    return `${posStr}${gapStr}${fuelStr}, gomas al ${avgWear} por ciento${bestStr}. Sigue empujando.`;
  }

  /** Immediately stops any ongoing radio playback (e.g., when interrupted by a P1 traffic call). */
  stopSpeaking() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio = null;
    }
    this.speaking = false;
  }

  /** Pre-synthesizes a WAV data URL without opening the Team Radio UI yet (deduplicates concurrent calls). */
  async prepareAudio(text: string): Promise<string | null> {
    const cfg = config.value.aiEngineer;
    const cleanText = text.replace(/[*_`#]/g, "").trim();
    if (!cfg || !cleanText || !isNativeTauri()) return null;
    const spokenText = toSpanishRadioPhonetics(cleanText);
    if (cfg.voiceEngine === "qwen3") {
      const profile = cfg.qwen3Profile?.trim() || "Antonio";
      const endpoint = cfg.qwen3Endpoint?.trim() || "http://127.0.0.1:18421";
      const cacheKey = `qwen3|${profile}|${spokenText}`;
      const cached = this.wavCache.get(cacheKey);
      if (cached) return cached;
      const existing = this.inflightAudio.get(cacheKey);
      if (existing) return existing;
      const promise = invoke<string>("synthesize_qwen3_tts", {
        text: spokenText,
        profile,
        endpoint,
        language: "Spanish",
      })
        .then((wavDataUrl) => {
          this.wavCache.set(cacheKey, wavDataUrl);
          return wavDataUrl;
        })
        .finally(() => {
          this.inflightAudio.delete(cacheKey);
        });
      this.inflightAudio.set(cacheKey, promise);
      return promise;
    }
    if (cfg.voiceEngine === "onnx") {
      if (!cfg.onnxModelPath) await this.refreshVoices();
      if (!cfg.onnxModelPath) return null;
      const lowerPath = cfg.onnxModelPath.toLowerCase();
      const speakerId = lowerPath.includes("elena_mdt") || lowerPath.includes("sharvard") ? 1 : null;
      const cacheKey = `${cfg.onnxModelPath}|${speakerId ?? ""}|${cfg.onnxSpeed ?? 0.96}|${cfg.onnxNoiseScale ?? 0.62}|${cfg.onnxNoiseW ?? 0.78}|${spokenText}`;
      const cached = this.wavCache.get(cacheKey);
      if (cached) return cached;
      const wavDataUrl = await invoke<string>("synthesize_onnx_tts", {
        text: spokenText,
        modelPath: cfg.onnxModelPath,
        lengthScale: cfg.onnxSpeed ?? 0.96,
        noiseScale: cfg.onnxNoiseScale ?? 0.62,
        noiseW: cfg.onnxNoiseW ?? 0.78,
        speakerId,
      });
      this.wavCache.set(cacheKey, wavDataUrl);
      return wavDataUrl;
    }
    return null;
  }

  /** Plays a WAV data URL (from Piper .onnx or Qwen3-TTS) through the WEC walkie-talkie radio filter + Team Radio card. */
  async speakWithRadio(
    text: string,
    opts?: { skipStartBeep?: boolean; skipEndBeep?: boolean; skipBroadcast?: boolean },
  ): Promise<void> {
    const cfg = config.value.aiEngineer;
    if (!cfg || !text.trim()) return;

    const cleanText = text.replace(/[*_`#]/g, "").trim();
    this.speaking = true;

    const vol = Math.max(0, Math.min(1, cfg.volume ?? 0.9));
    const useRadio = cfg.radioFilter ?? true;
    const wSpotter = config.value.widgets?.spotter?.options;
    const spCfg = config.value.spotter;
    const beepsVol = Math.max(0, Math.min(1, wSpotter?.beepsVolume ?? spCfg?.beepsVolume ?? vol));

    const playMicClick = (opening: boolean) => {
      const ctx = this.getAudioCtx();
      if (!ctx || !useRadio) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(opening ? 1950 : 1350, now);
        osc.frequency.exponentialRampToValueAtTime(opening ? 2450 : 900, now + 0.04);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(beepsVol * 0.14, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } catch {}
    };

    const playStartBeep = (): Promise<void> => {
      if (opts?.skipStartBeep) return Promise.resolve();
      const s = wSpotter?.startSound ?? spCfg?.startSound ?? "1.mp3";
      if (!s || s === "none") return Promise.resolve();
      if (s === "mic_click") {
        playMicClick(true);
        return new Promise((r) => setTimeout(r, 65));
      }
      return new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const beep = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(s)}?t=${Date.now()}`);
        applyOutputSink(beep);
        beep.volume = beepsVol;
        const timer = setTimeout(done, 1800);
        beep.onended = done;
        beep.onerror = done;
        beep.play().catch(done);
      });
    };

    const playEndBeep = () => {
      if (opts?.skipEndBeep) return;
      const s = wSpotter?.endSound ?? spCfg?.endSound ?? "f1-radio-end.mp3";
      if (!s || s === "none") return;
      if (s === "mic_click") {
        playMicClick(false);
        return;
      }
      const audio = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(s)}?t=${Date.now()}`);
      applyOutputSink(audio);
      audio.volume = beepsVol;
      audio.play().catch(() => {});
    };

    const finish = () => {
      playEndBeep();
      this.speaking = false;
      if (!opts?.skipBroadcast) {
        setTimeout(() => {
          if (!this.speaking) this.broadcastTeamRadio(null, false);
        }, 1400);
      }
    };

    // Helper to play a WAV/MP3 data URL through the selected radio DSP preset (studio / wec / f1_vintage / walkie)
    const radioPreset = cfg.radioPreset ?? (useRadio ? "wec" : "studio");
    const playDataUrlWithRadio = async (audioDataUrl: string) => {
      await playStartBeep();
      await new Promise<void>((resolve) => {
        if (this.currentAudio) {
          this.currentAudio.pause();
          this.currentAudio = null;
        }
        const audio = new Audio(audioDataUrl);
        applyOutputSink(audio);
        this.currentAudio = audio;

        const ctx = this.getAudioCtx();
        let noiseSrc: AudioBufferSourceNode | null = null;
        const stopNoise = () => {
          if (noiseSrc) {
            try {
              noiseSrc.stop();
              noiseSrc.disconnect();
            } catch {}
            noiseSrc = null;
          }
        };

        if (radioPreset !== "studio" && ctx) {
          try {
            const src = ctx.createMediaElementSource(audio);
            const hp = ctx.createBiquadFilter();
            hp.type = "highpass";
            const mid = ctx.createBiquadFilter();
            mid.type = "peaking";
            const lp = ctx.createBiquadFilter();
            lp.type = "lowpass";
            const gain = ctx.createGain();

            if (radioPreset === "f1_vintage") {
              hp.frequency.value = 480;
              mid.frequency.value = 1900;
              mid.Q.value = 1.6;
              mid.gain.value = 8.5;
              lp.frequency.value = 2650;
              gain.gain.value = vol * 1.15;
              // Subtle warm radio saturation via WaveShaper
              const shaper = ctx.createWaveShaper();
              const curve = new Float32Array(256);
              for (let i = 0; i < 256; i++) {
                const x = (i * 2) / 256 - 1;
                curve[i] = Math.tanh(x * 2.1);
              }
              shaper.curve = curve;
              src.connect(hp);
              hp.connect(mid);
              mid.connect(shaper);
              shaper.connect(lp);
              lp.connect(gain);
              gain.connect(ctx.destination);
            } else if (radioPreset === "walkie") {
              hp.frequency.value = 540;
              mid.frequency.value = 1850;
              mid.Q.value = 1.8;
              mid.gain.value = 7.5;
              lp.frequency.value = 2400;
              gain.gain.value = vol * 1.18;
              src.connect(hp);
              hp.connect(mid);
              mid.connect(lp);
              lp.connect(gain);
              gain.connect(ctx.destination);

              // Subtle filtered white-noise static bed while radio channel is active
              const bufSize = ctx.sampleRate * 2;
              const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
              const data = noiseBuf.getChannelData(0);
              for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
              noiseSrc = ctx.createBufferSource();
              noiseSrc.buffer = noiseBuf;
              noiseSrc.loop = true;
              const nFilter = ctx.createBiquadFilter();
              nFilter.type = "bandpass";
              nFilter.frequency.value = 1600;
              nFilter.Q.value = 0.9;
              const nGain = ctx.createGain();
              nGain.gain.value = vol * 0.022;
              noiseSrc.connect(nFilter);
              nFilter.connect(nGain);
              nGain.connect(ctx.destination);
              noiseSrc.start();
            } else {
              // Default WEC Pro Radio
              hp.frequency.value = 380;
              mid.frequency.value = 1650;
              mid.Q.value = 1.3;
              mid.gain.value = 6.0;
              lp.frequency.value = 3300;
              gain.gain.value = vol * 1.15;
              src.connect(hp);
              hp.connect(mid);
              mid.connect(lp);
              lp.connect(gain);
              gain.connect(ctx.destination);
            }
          } catch {
            audio.volume = vol;
          }
        } else {
          audio.volume = vol;
        }

        audio.onended = () => {
          stopNoise();
          this.currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          stopNoise();
          this.currentAudio = null;
          resolve();
        };
        audio.play().catch(() => {
          stopNoise();
          resolve();
        });
      });
    };

    // 1A. Local Qwen3-TTS 0.6B GPU Server (CUDA / ROCm · FP16/BF16 · Preloaded Reference Prompts)
    if (cfg.voiceEngine === "qwen3" && isNativeTauri()) {
      const profile = cfg.qwen3Profile?.trim() || "Antonio";
      const endpoint = cfg.qwen3Endpoint?.trim() || "http://127.0.0.1:18421";
      const spokenText = toSpanishRadioPhonetics(cleanText);
      const cacheKey = `qwen3|${profile}|${spokenText}`;
      try {
        let wavDataUrl = this.wavCache.get(cacheKey);
        if (!wavDataUrl) {
          wavDataUrl = await invoke<string>("synthesize_qwen3_tts", {
            text: spokenText,
            profile,
            endpoint,
            language: "Spanish",
          });
          if (this.wavCache.size > 64) {
            const firstKey = this.wavCache.keys().next().value;
            if (firstKey) this.wavCache.delete(firstKey);
          }
          this.wavCache.set(cacheKey, wavDataUrl);
        }
        // Only open Team Radio card + play audio once the WAV is ready (never show dead silence!)
        if (!opts?.skipBroadcast) {
          this.broadcastTeamRadio(cleanText, true);
        }
        await playDataUrlWithRadio(wavDataUrl);
        finish();
        return;
      } catch (e) {
        this.lastError = `Error Qwen3-TTS 0.6B: ${String(e)}`;
        this.speaking = false;
        return;
      }
    }

    // 1B. Local Piper .onnx voice synthesis (instant CPU inference + in-memory WAV cache)
    if (cfg.voiceEngine === "onnx" && isNativeTauri()) {
      if (!cfg.onnxModelPath) {
        await this.refreshVoices();
      }
      if (cfg.onnxModelPath) {
        try {
          const spokenText = toSpanishRadioPhonetics(cleanText);
          // Elena_MDT (sharvard multi-speaker model) uses speaker 1 = female Castilian Spanish
          const lowerPath = cfg.onnxModelPath.toLowerCase();
          const speakerId = lowerPath.includes("elena_mdt") || lowerPath.includes("sharvard") ? 1 : null;
          const cacheKey = `${cfg.onnxModelPath}|${speakerId ?? ""}|${cfg.onnxSpeed ?? 0.96}|${cfg.onnxNoiseScale ?? 0.62}|${cfg.onnxNoiseW ?? 0.78}|${spokenText}`;
          let wavDataUrl = this.wavCache.get(cacheKey);
          if (!wavDataUrl) {
            wavDataUrl = await invoke<string>("synthesize_onnx_tts", {
              text: spokenText,
              modelPath: cfg.onnxModelPath,
              lengthScale: cfg.onnxSpeed ?? 0.96,
              noiseScale: cfg.onnxNoiseScale ?? 0.62,
              noiseW: cfg.onnxNoiseW ?? 0.78,
              speakerId,
            });
            if (this.wavCache.size > 48) {
              const firstKey = this.wavCache.keys().next().value;
              if (firstKey) this.wavCache.delete(firstKey);
            }
            this.wavCache.set(cacheKey, wavDataUrl);
          }

          if (!opts?.skipBroadcast) {
            this.broadcastTeamRadio(cleanText, true);
          }
          await playDataUrlWithRadio(wavDataUrl);
          finish();
          return;
        } catch (e) {
          this.lastError = `Error voz ONNX: ${String(e)}`;
          this.speaking = false;
          return;
        }
      } else {
        this.lastError = "No hay ninguna voz .onnx seleccionada o instalada en VocesONNX.";
        this.speaking = false;
        return;
      }
    }

    // 2. System Web Speech API (only when explicitly set to 'system' or running outside Tauri)
    if (!opts?.skipBroadcast) {
      this.broadcastTeamRadio(cleanText, true);
    }
    await playStartBeep();
    await new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(cleanText);
        u.lang = "es-ES";
        u.volume = vol;
        u.rate = 1.08;
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("es"));
        if (voices.length > 0) u.voice = voices[0];
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
    finish();
  }

  private getActiveEngineerName(): string {
    if (config.value.aiEngineer?.voiceEngine === "qwen3") {
      return config.value.aiEngineer.qwen3Profile?.trim() || "Qwen3 IA";
    }
    const p = config.value.aiEngineer?.onnxModelPath?.trim();
    if (p) {
      const base = p.split(/[\\/]/).pop()?.replace(/\.onnx$/i, "") || "";
      if (base) {
        const clean = base.replace(/_mdt$/i, "").replace(/[_-]+/g, " ").trim();
        if (clean) return clean.charAt(0).toUpperCase() + clean.slice(1);
      }
    }
    return config.value.spotter?.profile || "Ingeniero IA";
  }

  private getDriverDisplayName(snap: Snapshot | null): string {
    const me = snap?.vehicles?.find((v) => v.isPlayer);
    const raw =
      me?.driver?.trim() ||
      config.value.broadcast?.driverName?.trim() ||
      config.value.general?.teammates?.split(",")[0]?.trim() ||
      "PILOTO";
    return raw;
  }

  private broadcastTeamRadio(
    text: string | null,
    playing: boolean,
    opts?: {
      speaker?: "driver" | "engineer";
      folder?: string;
      label?: string;
      profile?: string;
    },
  ) {
    const speaker = opts?.speaker ?? "engineer";
    const payload = {
      playing,
      transmission: text
        ? {
            folder: opts?.folder ?? (speaker === "driver" ? "PILOTO · PTT" : "Ingeniero IA"),
            label: opts?.label ?? (speaker === "driver" ? "Piloto hablando" : "Ingeniero de Pista"),
            priority: 3 as const,
            text,
            profile: opts?.profile ?? (speaker === "driver" ? "PILOTO" : this.getActiveEngineerName()),
            category: "strategy" as const,
            startedAt: performance.now(),
            speaker,
          }
        : null,
    };
    if (isNativeTauri()) {
      void emit("spotter-transmission-change", payload);
    }
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const ch = new BroadcastChannel("mdt-spotter-sync");
        ch.postMessage(payload);
        ch.close();
      } catch {}
    }
  }

  /**
   * Hands-free actionable voice commands (#3): executes real HUD/app actions from spoken Spanish phrases
   * and returns a short confirmation reply if matched (or null if it's a normal telemetry question).
   */
  private executeVoiceCommand(question: string, snap: Snapshot | null): string | null {
    const q = question
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (!q) return null;

    // 1. Toggle Qualy / Hotlap mode
    if (/(pon|activa|enciende).*(qualy|clasificacion|hotlap)/.test(q)) {
      config.value.general.autoQualyMode = true;
      saveConfig();
      return "Modo clasificación activado.";
    }
    if (/(quita|desactiva|apaga).*(qualy|clasificacion|hotlap)/.test(q)) {
      config.value.general.autoQualyMode = false;
      saveConfig();
      return "Modo clasificación desactivado.";
    }

    // 2. Toggle Broadcast mode
    if (/(pon|activa|enciende).*(broadcast|retransmision)/.test(q)) {
      toggleBroadcastMode(true);
      return "Modo broadcast activado.";
    }
    if (/(quita|desactiva|apaga).*(broadcast|retransmision)/.test(q)) {
      toggleBroadcastMode(false);
      return "Modo broadcast desactivado.";
    }

    // 3. Switch HUD profile by name or next profile
    if (/(siguiente perfil|cambia de perfil|cambiar perfil|otro perfil)/.test(q)) {
      cycleNextProfile();
      const activeName = config.value.profiles[config.value.activeProfile]?.name ?? "siguiente";
      return `Perfil cambiado a ${activeName}.`;
    }
    const profMatch = q.match(/(?:pon|cambia al?|activa)\s+(?:el\s+)?perfil\s+(?:de\s+)?(.+)/);
    if (profMatch) {
      const wanted = profMatch[1].trim();
      const entry = Object.entries(config.value.profiles).find(([, p]) =>
        p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(wanted),
      );
      if (entry) {
        switchProfile(entry[0]);
        return `Perfil cambiado a ${entry[1].name}.`;
      }
    }

    // 4. Hide / Show entire Overlay
    if (/(oculta|esconde|quita|apaga).*(overlay|hud|pantalla)/.test(q)) {
      if (isNativeTauri()) void api.setOverlayVisible(false).catch(() => {});
      return "Overlay ocultado.";
    }
    if (/(muestra|ensena|pon|activa).*(overlay|hud)/.test(q)) {
      if (isNativeTauri()) void api.setOverlayVisible(true).catch(() => {});
      return "Overlay visible.";
    }

    // 5. Mute / Unmute Spotter
    if (/(silencia|calla|apaga|desactiva).*(spotter|avisos)/.test(q)) {
      config.value.spotter.enabled = false;
      if (config.value.aiEngineer) config.value.aiEngineer.useForSpotterEvents = false;
      saveConfig();
      return "Spotter silenciado.";
    }
    if (/(activa|enciende).*(spotter|avisos)/.test(q)) {
      if (config.value.aiEngineer) config.value.aiEngineer.useForSpotterEvents = true;
      saveConfig();
      return "Spotter activado.";
    }

    // 6. Switch AI Engineer personality live on track
    if (/(pon|cambia a|activa).*(showman|xokas|caotico)/.test(q)) {
      if (config.value.aiEngineer) {
        config.value.aiEngineer.personality = "streamer_hype";
        saveConfig();
      }
      return "Modo showman activado, hermano, a dar espectáculo.";
    }
    if (/(pon|cambia a|activa).*(profesional|wec|serio)/.test(q)) {
      if (config.value.aiEngineer) {
        config.value.aiEngineer.personality = "wec_pro";
        saveConfig();
      }
      return "Modo ingeniero profesional activado.";
    }
    if (/(pon|cambia a|activa).*(motivador)/.test(q)) {
      if (config.value.aiEngineer) {
        config.value.aiEngineer.personality = "motivator";
        saveConfig();
      }
      return "Modo motivador activado, vamos campeón.";
    }
    if (/(pon|cambia a|activa).*(estratega)/.test(q)) {
      if (config.value.aiEngineer) {
        config.value.aiEngineer.personality = "strategist";
        saveConfig();
      }
      return "Modo estratega activado.";
    }

    // 7. Show / Hide individual widgets by Spanish name
    const wantsHide = /^(oculta|esconde|quita|apaga)\b/.test(q);
    const wantsShow = /^(muestra|ensena|pon|activa|abre)\b/.test(q);
    if (wantsHide || wantsShow) {
      const widgetAliases: [RegExp, string, string][] = [
        [/\bradar\b/, "radar", "Radar"],
        [/\b(mapa|circuito|minimapa)\b/, "trackmap", "Mapa"],
        [/\b(clasificacion|tabla|standings)\b/, "standings", "Clasificación"],
        [/\b(relativo|relative)\b/, "relative", "Relativo"],
        [/\b(delta)\b/, "delta", "Delta"],
        [/\b(combustible|gasolina|fuel)\b/, "fuel", "Combustible"],
        [/\b(neumaticos|gomas|ruedas)\b/, "tyres", "Neumáticos"],
        [/\b(danos|coche)\b/, "damage", "Daños"],
        [/\b(clima|tiempo|lluvia)\b/, "weather", "Clima"],
        [/\b(electronica|tc|abs)\b/, "electronics", "Electrónica"],
        [/\b(inputs|pedales)\b/, "inputs", "Pedales"],
      ];
      for (const [re, id, label] of widgetAliases) {
        if (re.test(q) && config.value.widgets[id]) {
          config.value.widgets[id].enabled = wantsShow;
          saveConfig();
          return wantsShow ? `${label} activado en pantalla.` : `${label} ocultado.`;
        }
      }
    }

    // 8. Save a telemetry/lap mark
    if (/(marca esta vuelta|guarda marca|guarda clip|marca incidente|marcar vuelta)/.test(q)) {
      const lap = (snap?.player?.lapNumber ?? 0) + 1;
      const stamp = new Date().toTimeString().slice(0, 8);
      if (isNativeTauri()) {
        void emit("voice-telemetry-mark", { time: stamp, label: `Marca de voz · V${lap} (${stamp})` });
      }
      return `Marca guardada en la vuelta ${lap}.`;
    }

    // 9. Toggle FX Onboard post-processing by voice
    if (/\b(fx|efectos|camara onboard|onboard)\b/.test(q) && /\b(activa|enciende|pon|desactiva|apaga|quita|oculta)\b/.test(q)) {
      const enable = /\b(activa|enciende|pon)\b/.test(q) && !/\b(desactiva|apaga|quita|oculta)\b/.test(q);
      if (config.value.general.onboardFx) {
        config.value.general.onboardFx.enabled = enable;
        saveConfig();
      }
      return enable ? "Efectos FX Onboard activados." : "Efectos FX Onboard desactivados.";
    }

    return null;
  }

  /** Asks the local AI Race Engineer a question (or executes a hands-free voice command) and speaks the reply. */
  async ask(question = "", snap: Snapshot | null = null): Promise<string> {
    const cfg = config.value.aiEngineer;
    if (!cfg) return "";
    if (this.busy) return this.lastAnswer;

    this.busy = true;
    this.lastError = "";
    this.lastQuestion = question.trim() || "Informe táctico de carrera";

    let answer = "";
    try {
      // Check hands-free actionable voice commands first (#3)
      const cmdReply = question.trim() ? this.executeVoiceCommand(question, snap) : null;
      if (cmdReply) {
        answer = cmdReply;
      } else if (cfg.brainMode !== "local_rules" && isNativeTauri()) {
        const customPers = cfg.customPersonalities?.[cfg.personality];
        const basePrompt =
          customPers?.llmPrompt?.trim() ||
          PERSONALITY_PROMPTS[cfg.personality] ||
          PERSONALITY_PROMPTS.wec_pro;
        const pilotName = config.value.spotter?.driverName?.trim();
        const sysPrompt = pilotName
          ? `${basePrompt}\nEl piloto se llama ${pilotName}. Dirígete a él por su nombre de forma natural en algunas respuestas de radio.`
          : basePrompt;
        const ctx = this.buildTelemetryContext(snap);
        const userPrompt = question.trim()
          ? `Telemetría actual: ${ctx}\nPregunta del piloto por radio: "${question.trim()}"`
          : `Telemetría actual: ${ctx}\nDame un informe breve de radio con lo más importante ahora mismo.`;
        try {
          answer = await invoke<string>("ai_engineer_chat", {
            endpoint: cfg.endpoint || (cfg.brainMode === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234"),
            model: cfg.model || "gemma3:4b",
            systemPrompt: sysPrompt,
            userPrompt,
          });
        } catch (e) {
          this.lastError = `LLM local no disponible (${String(e)}). Usando motor integrado.`;
          answer = this.generateLocalBrief(snap, question);
        }
      } else {
        answer = this.generateLocalBrief(snap, question);
      }

      this.lastAnswer = answer;
      await this.speakWithRadio(answer);
      return answer;
    } finally {
      this.busy = false;
    }
  }

  private playPttTone(opening: boolean) {
    try {
      const ctx = this.getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(opening ? 1100 : 1400, now);
      osc.frequency.exponentialRampToValueAtTime(opening ? 1750 : 850, now + 0.075);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch {}
  }

  private micLevelChannel: BroadcastChannel | null = null;
  private lastMicLevelBroadcast = 0;
  private broadcastMicLevel(level: number) {
    const now = performance.now();
    if (level > 0 && now - this.lastMicLevelBroadcast < 45) return;
    this.lastMicLevelBroadcast = now;
    try {
      if (!this.micLevelChannel && typeof BroadcastChannel !== "undefined") {
        this.micLevelChannel = new BroadcastChannel("mdt-mic-level");
      }
      this.micLevelChannel?.postMessage({ level });
    } catch {}
  }

  /**
   * True Walkie-Talkie Push-To-Talk:
   * Call `beginPushToTalk(snap)` on button PRESS — records until `endPushToTalk()` is called on RELEASE!
   */
  async beginPushToTalk(snap: Snapshot | null = null) {
    if (typeof window === "undefined" || this.listening || this.busy) return;
    this.listening = true;
    this.pttReleasedEarly = false;
    this.activePttSnap = snap;
    this.lastError = "";

    const driverName = this.getDriverDisplayName(snap);
    this.broadcastTeamRadio("Hablando por radio... (suelta el botón al terminar)", true, {
      speaker: "driver",
      folder: "PILOTO · PTT",
      label: "Piloto hablando",
      profile: driverName,
    });

    try {
      const selectedMicId = config.value.general.audioInputId?.trim() || "";
      const session = await startHoldMicRecording(selectedMicId, (lvl) => {
        this.broadcastMicLevel(lvl);
      });
      if (this.pttReleasedEarly) {
        await session.stop();
        this.broadcastMicLevel(0);
        this.listening = false;
        this.broadcastTeamRadio(null, false);
        return;
      }
      this.activePttSession = session;
      this.playPttTone(true);
      if (this.pttSafetyTimer) clearTimeout(this.pttSafetyTimer);
      // Safety cap (15s max hold) so mic never stays open forever if focus is lost
      this.pttSafetyTimer = setTimeout(() => {
        void this.endPushToTalk();
      }, 15000);
    } catch (e) {
      this.broadcastMicLevel(0);
      this.listening = false;
      this.activePttSession = null;
      this.lastError = `No se pudo abrir el micrófono: ${String(e)}`;
      this.broadcastTeamRadio(null, false);
    }
  }

  /** Stops PTT recording on button RELEASE and transcribes + answers immediately. */
  async endPushToTalk() {
    if (!this.listening) return;
    this.broadcastMicLevel(0);
    if (this.pttSafetyTimer) {
      clearTimeout(this.pttSafetyTimer);
      this.pttSafetyTimer = null;
    }
    if (!this.activePttSession) {
      // Released before getUserMedia resolved
      this.pttReleasedEarly = true;
      this.listening = false;
      this.broadcastTeamRadio(null, false);
      return;
    }

    const session = this.activePttSession;
    const snap = this.activePttSnap;
    const driverName = this.getDriverDisplayName(snap);
    this.activePttSession = null;
    this.listening = false;
    this.playPttTone(false);

    try {
      const { wavBase64, durationMs, peak } = await session.stop();
      if (!wavBase64 || durationMs < 260) {
        this.lastError = "Mantén pulsado el botón mientras hablas y suéltalo al terminar.";
        this.broadcastTeamRadio(null, false);
        return;
      }
      if (peak < 0.0025) {
        this.lastError = "El micrófono no captó sonido (nivel 0%). Revisa el micrófono en 'Audio y Micrófono' o desmutéalo.";
        this.broadcastTeamRadio(null, false);
        return;
      }
      if (!isNativeTauri()) {
        this.lastError = "El reconocimiento de voz PTT offline está disponible en la app de escritorio.";
        this.broadcastTeamRadio(null, false);
        return;
      }
      this.busy = true;
      this.broadcastTeamRadio("Procesando transmisión del piloto...", true, {
        speaker: "driver",
        folder: "PILOTO · ENVIANDO",
        label: "Procesando voz",
        profile: driverName,
      });
      const transcript = await invoke<string>("listen_voice_command", {
        timeoutSecs: 6,
        wavBase64,
      });
      this.busy = false;
      const clean = (transcript || "").trim();
      if (!clean) {
        this.lastError = "No se entendió ninguna frase. Mantén pulsado el botón, habla claro y suéltalo al acabar.";
        this.broadcastTeamRadio(null, false);
        return;
      }
      this.lastQuestion = clean;
      this.broadcastTeamRadio(clean, false, {
        speaker: "driver",
        folder: "PILOTO · RADIO",
        label: "Mensaje del piloto",
        profile: driverName,
      });
      await this.ask(clean, snap);
    } catch (e) {
      this.busy = false;
      this.lastError = String(e);
      this.broadcastTeamRadio(null, false);
    }
  }

  /** Compatibility alias if called without hold/release. */
  async startVoicePushToTalk(snap: Snapshot | null = null) {
    await this.beginPushToTalk(snap);
  }

  /** Optional proactive engineer check called from the live telemetry loop. */
  onTelemetry(snap: Snapshot | null) {
    const cfg = config.value.aiEngineer;
    if (!cfg?.enabled || !cfg.proactiveEnabled || !snap?.player || !snap.inRealtime) return;
    const p = snap.player;
    if (p.inPits || p.speed < 20 || this.busy || this.speaking) return;
    if (config.value.spotter?.quietInFastCorners && (Math.abs(p.gLat ?? 0) > 1.2 || p.brake > 0.65)) return;

    const every = Math.max(1, cfg.proactiveEveryLaps || 3);
    if (p.lapNumber > 0 && p.lapNumber !== this.lastProactiveLap && p.lapNumber % every === 0) {
      const now = Date.now();
      if (now - this.lastProactiveAt > 45000) {
        this.lastProactiveLap = p.lapNumber;
        this.lastProactiveAt = now;
        void this.ask("", snap);
      }
    }
  }
}

export const aiEngineer = new AiEngineerEngine();
