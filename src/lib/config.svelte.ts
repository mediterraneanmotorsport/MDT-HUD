import { listen } from "@tauri-apps/api/event";
import { api } from "./api";

export type Units = "metric" | "imperial";
export type HudTheme = "mdt-blue" | "stealth-dark" | "cyan-neon" | "racing-red" | "custom";

export type OptionDef =
  | { key: string; label: string; type: "number"; min: number; max: number; step: number }
  | { key: string; label: string; type: "boolean" }
  | { key: string; label: string; type: "select"; choices: { value: string; label: string }[] };

export interface WidgetMeta {
  id: string;
  name: string;
  description: string;
  defaults: { enabled: boolean; x: number; y: number };
  options: OptionDef[];
  optionDefaults: Record<string, unknown>;
}

export interface WidgetConfig {
  enabled: boolean;
  x: number;
  y: number;
  /** Size multiplier for this widget, on top of the global scale. */
  size: number;
  /** Opacity for this widget, on top of the global opacity. */
  alpha: number;
  options: Record<string, any>;
}

export interface AppConfig {
  version: 1;
  general: {
    units: Units;
    updateHz: number;
    /** Hide widgets while in menus/garage (always shown in edit mode). */
    onlyOnTrack: boolean;
    /** Hide widgets while the game window is not focused (always shown in edit/demo mode). */
    hideUnfocused: boolean;
    /** Show release notes once after each app update. */
    showChangelog: boolean;
    /** Last installed version whose release notes were handled. */
    lastSeenVersion: string;
    /** App launches counted until the GitHub star popup has been answered. */
    launches: number;
    /** The user starred or dismissed the GitHub star popup, so it never shows again. */
    starPromptDone: boolean;
    /** Grid snap in edit mode (px). */
    snap: number;
    /** Size multiplier applied to every widget. */
    scale: number;
    /** Opacity applied to every widget. */
    opacity: number;
    /** Name of the monitor the overlay covers; "" for the primary monitor. */
    monitor: string;
    /** HUD theme preset or "custom". */
    theme: HudTheme;
    /** Custom accent & border hex color (#rrggbb). */
    accentColor: string;
    /** Custom HUD panel background hex color (#rrggbb). */
    hudBgColor: string;
    /** Border opacity (0..1). */
    hudBorderOpacity: number;
    /** Comma-separated driver/team tags to highlight as MDT teammates. */
    teammates: string;
  };
  /** Lap rankings and car setup sharing. Off until the user opts in. */
  online: {
    /** Master switch; while off the app makes no requests to the server. */
    enabled: boolean;
    /** Upload laps only when asked, or every eligible lap as it's recorded. */
    lapUpload: "manual" | "auto";
    /** Hide your display name on laps uploaded from now on. */
    anonymous: boolean;
    /** Send the telemetry of your best lap on each track and class. */
    uploadTraces: boolean;
  };
  /** Voice & audio spotter settings (Perfil/Sara, Perfil/Antonio, etc.). */
  spotter: {
    enabled: boolean;
    profile: string;
    volume: number;
    radioEffect: boolean;
    ttsFallback: boolean;
    traffic: boolean;
    flags: boolean;
    strategy: boolean;
    carStatus: boolean;
    session: boolean;
  };
  widgets: Record<string, WidgetConfig>;
  /** Id of the profile mirrored by `general.scale/opacity` and `widgets`. */
  activeProfile: string;
  /** Saved overlay setups: layout, widget options, scale and opacity. */
  profiles: Record<string, Profile>;
}

/** A saved overlay setup. App-wide preferences (units, refresh rate, …) are not part of it. */
export interface Profile {
  name: string;
  scale: number;
  opacity: number;
  widgets: Record<string, WidgetConfig>;
}

export const HUD_THEMES: Record<Exclude<HudTheme, "custom">, { label: string; accent: string; bg: string; borderOpacity: number }> = {
  "mdt-blue": { label: "Azul MDT (#2287EC)", accent: "#2287ec", bg: "#091626", borderOpacity: 0.55 },
  "stealth-dark": { label: "Stealth Oscuro", accent: "#2287ec", bg: "#0e0e11", borderOpacity: 0.14 },
  "cyan-neon": { label: "Cian Competición", accent: "#06b6d4", bg: "#081c24", borderOpacity: 0.6 },
  "racing-red": { label: "Rojo Racing", accent: "#e3101f", bg: "#140c0e", borderOpacity: 0.5 },
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (isNaN(num)) return [34, 135, 236];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function applyTheme(g: AppConfig["general"]) {
  if (typeof document === "undefined") return;
  const preset = g.theme !== "custom" ? HUD_THEMES[g.theme] : null;
  const accentHex = preset ? preset.accent : g.accentColor || "#2287ec";
  const bgHex = preset ? preset.bg : g.hudBgColor || "#091626";
  const borderOp = preset ? preset.borderOpacity : (g.hudBorderOpacity ?? 0.55);

  const [ar, ag, ab] = hexToRgb(accentHex);
  const [br, bg, bb] = hexToRgb(bgHex);
  const hi = `rgb(${Math.min(255, ar + 35)} ${Math.min(255, ag + 35)} ${Math.min(255, ab + 35)})`;
  const lo = `rgb(${Math.round(ar * 0.48)} ${Math.round(ag * 0.48)} ${Math.round(ab * 0.48)})`;

  const root = document.documentElement.style;
  root.setProperty("--color-accent", accentHex);
  root.setProperty("--color-accent-hi", hi);
  root.setProperty("--color-accent-lo", lo);
  root.setProperty("--color-hud", `rgb(${br} ${bg} ${bb} / 0.92)`);
  root.setProperty("--color-hud-2", `rgb(${ar} ${ag} ${ab} / 0.14)`);
  root.setProperty("--color-hud-line", `rgb(${ar} ${ag} ${ab} / ${borderOp})`);
}

export const WIDGETS: WidgetMeta[] = [
  {
    id: "dashboard",
    name: "Cuadro de mandos (Dashboard)",
    description: "Velocidad, marcha, luces de cambio LED, volante en vivo, pedales, híbrido y electrónica.",
    defaults: { enabled: true, x: 760, y: 830 },
    options: [
      {
        key: "style",
        label: "Diseño del Dashboard",
        type: "select",
        choices: [
          { value: "wec", label: "WEC / Broadcast MDT (Deportivo con LEDs)" },
          { value: "ddu", label: "Cosworth / MoTeC DDU (Pantalla Hypercar/GT3)" },
          { value: "radial", label: "Tacómetro Circular + Volante en vivo" },
          { value: "compact", label: "Barra Horizontal Compacta" },
          { value: "classic", label: "Clásico Estándar" },
        ],
      },
      {
        key: "rpmStyle",
        label: "Estilo de luces de RPM",
        type: "select",
        choices: [
          { value: "leds", label: "15 LEDs individuales (Verde → Ámbar → Rojo → Azul)" },
          { value: "center", label: "Doble barra convergente al centro (Estilo F1/Hypercar)" },
          { value: "bar", label: "Barra continua clásica" },
        ],
      },
      { key: "showMdtLogo", label: "Mostrar sello / logo MDT", type: "boolean" },
      { key: "showPedals", label: "Barras verticales de Acelerador y Freno integradas", type: "boolean" },
      { key: "showSteeringWheel", label: "Indicador de giro de volante en vivo", type: "boolean" },
      { key: "shiftFlash", label: "Alerta visual al corte de RPM (Shift Light)", type: "boolean" },
      { key: "showIndicators", label: "Testigos luminosos (luces, limitador, TC, ABS, limpias, motor)", type: "boolean" },
      { key: "showBattery", label: "Barra de batería híbrida (ERS / Regen)", type: "boolean" },
      { key: "showFfb", label: "Medidor de fuerza FFB", type: "boolean" },
      { key: "showSettings", label: "Fila de TC / ABS / Mapa / Reparto de frenada (BB)", type: "boolean" },
    ],
    optionDefaults: {
      style: "wec",
      rpmStyle: "leds",
      showMdtLogo: true,
      showPedals: true,
      showSteeringWheel: true,
      shiftFlash: true,
      showIndicators: true,
      showBattery: true,
      showFfb: false,
      showSettings: true,
    },
  },
  {
    id: "inputs",
    name: "Telemetría de pedales y volante",
    description: "Gráfico en tiempo real de acelerador, freno y dirección con barras de pedales.",
    defaults: { enabled: true, x: 1110, y: 960 },
    options: [
      { key: "seconds", label: "Historial (s)", type: "number", min: 2, max: 20, step: 1 },
      { key: "showSteering", label: "Línea de dirección", type: "boolean" },
      { key: "showPedals", label: "Barras de acelerador / freno / embrague", type: "boolean" },
      { key: "showClutch", label: "Barra de embrague", type: "boolean" },
      { key: "width", label: "Ancho (px)", type: "number", min: 200, max: 600, step: 10 },
    ],
    optionDefaults: { seconds: 6, showSteering: true, showPedals: true, showClutch: true, width: 320 },
  },
  {
    id: "delta",
    name: "Delta de tiempo",
    description: "Barra de delta en vivo respecto a tu récord personal (PB) o mejor vuelta de sesión.",
    defaults: { enabled: true, x: 810, y: 80 },
    options: [
      {
        key: "reference",
        label: "Referencia",
        type: "select",
        choices: [
          { value: "pb", label: "Récord personal (PB histórico)" },
          { value: "session", label: "Mejor de la sesión" },
        ],
      },
      { key: "range", label: "Rango de la barra (s)", type: "number", min: 0.5, max: 5, step: 0.5 },
    ],
    optionDefaults: { reference: "pb", range: 2 },
  },
  {
    id: "laptiming",
    name: "Tiempos por vuelta",
    description: "Vuelta actual, última, mejor, predicción y parciales por sector.",
    defaults: { enabled: true, x: 1590, y: 20 },
    options: [{ key: "showSectors", label: "Mostrar sectores (S1 / S2 / S3)", type: "boolean" }],
    optionDefaults: { showSectors: true },
  },
  {
    id: "standings",
    name: "Clasificación (Standings)",
    description: "Torre de tiempos multicategoría con cabecera de sesión y sello MDT.",
    defaults: { enabled: true, x: 20, y: 110 },
    options: [
      { key: "showBranding", label: "Cabecera con logo MDT-HUD", type: "boolean" },
      { key: "showSession", label: "Cabecera con información de sesión", type: "boolean" },
      { key: "maxRows", label: "Filas para mi categoría", type: "number", min: 3, max: 40, step: 1 },
      { key: "maxRowsOther", label: "Filas para otras categorías", type: "number", min: 1, max: 40, step: 1 },
      { key: "around", label: "Coches alrededor de mí fuera del top", type: "number", min: 0, max: 5, step: 1 },
      {
        key: "classes",
        label: "Categorías",
        type: "select",
        choices: [
          { value: "all", label: "Todas las categorías" },
          { value: "mine", label: "Solo mi categoría" },
        ],
      },
      { key: "myClassFirst", label: "Mi categoría primero", type: "boolean" },
      { key: "showLogo", label: "Logo de marca del coche", type: "boolean" },
      { key: "showTyres", label: "Compuesto de neumáticos", type: "boolean" },
      { key: "showEnergy", label: "Energía virtual restante", type: "boolean" },
      { key: "showPits", label: "Paradas en boxes", type: "boolean" },
      { key: "showLast", label: "Última vuelta", type: "boolean" },
      { key: "showBest", label: "Mejor vuelta", type: "boolean" },
      { key: "colorTimes", label: "Colorear tiempos (verde = mejor personal, morado = récord de clase)", type: "boolean" },
      { key: "showInterval", label: "Intervalo con el coche de delante", type: "boolean" },
    ],
    optionDefaults: {
      showBranding: true,
      showSession: false,
      maxRows: 8,
      maxRowsOther: 8,
      around: 1,
      classes: "all",
      myClassFirst: false,
      showLogo: true,
      showTyres: true,
      showEnergy: true,
      showPits: false,
      showLast: true,
      showBest: false,
      colorTimes: true,
      showInterval: true,
    },
  },
  {
    id: "relative",
    name: "Relativo en pista (Relative)",
    description: "Coches físicamente cerca de ti en pista con diferencias en tiempo real, estado de vuelta y energía.",
    defaults: { enabled: true, x: 1220, y: 600 },
    options: [
      { key: "ahead", label: "Coches por delante", type: "number", min: 1, max: 8, step: 1 },
      { key: "behind", label: "Coches por detrás", type: "number", min: 1, max: 8, step: 1 },
      { key: "colorLapped", label: "Colorear doblados (naranja = doblado, cian = vuelta ganada / bandera azul)", type: "boolean" },
      { key: "showPaceDiff", label: "Diferencia de ritmo en la última vuelta (Δ ritmo)", type: "boolean" },
      { key: "showEnergy", label: "Energía virtual restante", type: "boolean" },
      { key: "showLast", label: "Última vuelta", type: "boolean" },
      { key: "showBest", label: "Mejor vuelta", type: "boolean" },
      { key: "colorTimes", label: "Colorear tiempos (verde = mejor personal, morado = récord de clase)", type: "boolean" },
    ],
    optionDefaults: {
      ahead: 3,
      behind: 3,
      colorLapped: true,
      showPaceDiff: true,
      showEnergy: true,
      showLast: false,
      showBest: false,
      colorTimes: true,
    },
  },
  {
    id: "pacecatch",
    name: "Cazador de Rivales (Pace & Catch)",
    description: "Compara tu ritmo con el coche de delante y detrás y calcula en cuántas vueltas lo alcanzas.",
    defaults: { enabled: true, x: 1220, y: 470 },
    options: [
      { key: "sameClassOnly", label: "Solo rivales de mi misma categoría", type: "boolean" },
      { key: "showLastLap", label: "Mostrar tiempo de última vuelta de ambos", type: "boolean" },
    ],
    optionDefaults: { sameClassOnly: true, showLastLap: true },
  },
  {
    id: "shiftlights",
    name: "Barra de Luces de Cambio LED (Shift Lights)",
    description: "Barra horizontal independiente de LEDs de RPM, marcha y aviso de corte para la parte superior del monitor.",
    defaults: { enabled: false, x: 740, y: 140 },
    options: [
      {
        key: "style",
        label: "Disposición de LEDs",
        type: "select",
        choices: [
          { value: "blocks", label: "Progresivo de izquierda a derecha" },
          { value: "center", label: "Convergente hacia el centro (Estilo F1 / Hypercar)" },
        ],
      },
      { key: "ledCount", label: "Número de LEDs", type: "number", min: 10, max: 24, step: 2 },
      { key: "width", label: "Ancho de la barra (px)", type: "number", min: 240, max: 640, step: 20 },
      { key: "showGear", label: "Mostrar marcha en el centro", type: "boolean" },
      { key: "showRpm", label: "Mostrar cifra de RPM", type: "boolean" },
    ],
    optionDefaults: { style: "center", ledCount: 16, width: 420, showGear: true, showRpm: true },
  },
  {
    id: "radar",
    name: "Radar de proximidad (Spotter)",
    description: "Radar cenital con barras laterales de aviso cuando tienes coches en paralelo.",
    defaults: { enabled: true, x: 850, y: 500 },
    options: [
      { key: "range", label: "Alcance del radar (m)", type: "number", min: 8, max: 25, step: 1 },
      { key: "autoHide", label: "Ocultar automáticamente si no hay coches cerca", type: "boolean" },
      { key: "showRings", label: "Anillos de distancia", type: "boolean" },
    ],
    optionDefaults: { range: 14, autoHide: false, showRings: true },
  },
  {
    id: "fuel",
    name: "Combustible y energía",
    description: "Consumo por vuelta, vueltas restantes, alerta de parada en boxes y calculadora de ahorro.",
    defaults: { enabled: true, x: 1590, y: 300 },
    options: [
      { key: "showPitAlert", label: "Alerta luminosa 'BOX ESTA VUELTA' cuando queda < 1.2 vueltas", type: "boolean" },
      { key: "showLast", label: "Consumo en la última vuelta", type: "boolean" },
      { key: "showSaver", label: "Ahorrador: objetivo por vuelta para alargar el stint +1 o +2 vueltas", type: "boolean" },
      {
        key: "saverResource",
        label: "Ahorrador basado en",
        type: "select",
        choices: [
          { value: "auto", label: "El que se agote antes" },
          { value: "fuel", label: "Combustible" },
          { value: "energy", label: "Energía virtual" },
        ],
      },
    ],
    optionDefaults: { showPitAlert: true, showLast: true, showSaver: true, saverResource: "auto" },
  },
  {
    id: "tyres",
    name: "Neumáticos y frenos",
    description: "Temperaturas, presiones, desgaste por vuelta, vueltas de vida útil restantes y frenos.",
    defaults: { enabled: true, x: 20, y: 820 },
    options: [
      {
        key: "tempLayer",
        label: "Temperaturas",
        type: "select",
        choices: [
          { value: "surface", label: "Superficie" },
          { value: "core", label: "Interior (Core)" },
          { value: "both", label: "Superficie e interior" },
        ],
      },
      { key: "showWearRate", label: "Desgaste por vuelta y vida estimada al final del stint", type: "boolean" },
      { key: "showLapsLeft", label: "Vueltas de vida útil estimadas para cada neumático", type: "boolean" },
      { key: "wearLimit", label: "Aviso de desgaste crítico (% restante)", type: "number", min: 0, max: 60, step: 5 },
      { key: "showBrakes", label: "Temperatura de frenos junto a cada rueda", type: "boolean" },
    ],
    optionDefaults: { tempLayer: "surface", showWearRate: true, showLapsLeft: true, wearLimit: 30, showBrakes: true },
  },
  {
    id: "session",
    name: "Información de sesión",
    description: "Tipo de sesión, tiempo restante, hora en pista y vueltas completadas.",
    defaults: { enabled: true, x: 20, y: 20 },
    options: [],
    optionDefaults: {},
  },
  {
    id: "flags",
    name: "Banderas y avisos",
    description: "Banderas de dirección de carrera: amarillas, FCY, bandera azul, semáforo y sanciones.",
    defaults: { enabled: true, x: 860, y: 20 },
    options: [],
    optionDefaults: {},
  },
  {
    id: "tracklimits",
    name: "Contador de Límites de Pista (Track Limits)",
    description: "Monitor permanente de puntos de Track Limits acumulados, margen de sanción y penalizaciones.",
    defaults: { enabled: true, x: 290, y: 20 },
    options: [
      { key: "showAlways", label: "Mostrar siempre (incluso con 0 puntos acumulados)", type: "boolean" },
    ],
    optionDefaults: { showAlways: true },
  },
  {
    id: "liftcoast",
    name: "Asistente de Lift & Coast y Regeneración",
    description: "Metros de Lift & Coast por vuelta, aviso de corte de gas y potencia de regeneración híbrida (kW).",
    defaults: { enabled: false, x: 1310, y: 300 },
    options: [
      { key: "showRegen", label: "Mostrar barra de potencia regenerada (kW)", type: "boolean" },
    ],
    optionDefaults: { showRegen: true },
  },
  {
    id: "trackmap",
    name: "Mapa del circuito",
    description: "Trazado del circuito con posición en vivo de todos los coches y compañeros MDT.",
    defaults: { enabled: true, x: 1640, y: 790 },
    options: [
      { key: "size", label: "Tamaño (px)", type: "number", min: 120, max: 500, step: 10 },
      { key: "classColors", label: "Colorear por categoría", type: "boolean" },
    ],
    optionDefaults: { size: 240, classColors: true },
  },
  {
    id: "weather",
    name: "Meteorología",
    description: "Temperatura ambiente y de pista, lluvia, humedad del asfalto y viento.",
    defaults: { enabled: false, x: 1590, y: 190 },
    options: [],
    optionDefaults: {},
  },
  {
    id: "damage",
    name: "Daños del vehículo",
    description: "Daños de carrocería, aerodinámica, suspensión, piezas sueltas y sobrecalentamiento.",
    defaults: { enabled: false, x: 330, y: 860 },
    options: [{ key: "showCar", label: "Silueta del coche", type: "boolean" }],
    optionDefaults: { showCar: true },
  },
  {
    id: "electronics",
    name: "Electrónica del coche",
    description: "TC, ABS, mapa motor, migración de frenada, barras estabilizadoras (ARB) e híbrido.",
    defaults: { enabled: false, x: 560, y: 930 },
    options: [],
    optionDefaults: {},
  },
  {
    id: "mdtbranding",
    name: "Marca de agua MDT (Stream)",
    description: "Insignia oficial de Mediterranean Motorsport con logo del toro y etiqueta personalizable.",
    defaults: { enabled: false, x: 1620, y: 1015 },
    options: [
      { key: "showTagline", label: "Mostrar subtítulo 'Mediterranean Motorsport'", type: "boolean" },
      {
        key: "style",
        label: "Estilo visual",
        type: "select",
        choices: [
          { value: "panel", label: "Panel HUD con borde" },
          { value: "minimal", label: "Marca de agua transparente" },
        ],
      },
    ],
    optionDefaults: { showTagline: true, style: "panel" },
  },
];

export const widgetMeta = (id: string) => WIDGETS.find((w) => w.id === id)!;

function defaultWidgets(): Record<string, WidgetConfig> {
  return Object.fromEntries(
    WIDGETS.map((w) => [
      w.id,
      { ...w.defaults, size: 1, alpha: 1, options: structuredClone(w.optionDefaults) } satisfies WidgetConfig,
    ]),
  );
}

function defaults(): AppConfig {
  const widgets = defaultWidgets();
  return {
    version: 1,
    general: {
      units: "metric",
      updateHz: 30,
      onlyOnTrack: true,
      hideUnfocused: false,
      showChangelog: true,
      lastSeenVersion: "",
      launches: 0,
      starPromptDone: false,
      snap: 4,
      scale: 1,
      opacity: 0.92,
      monitor: "",
      theme: "mdt-blue",
      accentColor: "#2287ec",
      hudBgColor: "#091626",
      hudBorderOpacity: 0.55,
      teammates: "MDT, Mediterranean",
    },
    online: { enabled: false, lapUpload: "manual", anonymous: false, uploadTraces: true },
    spotter: {
      enabled: true,
      profile: "Sara",
      volume: 0.85,
      radioEffect: true,
      ttsFallback: true,
      traffic: true,
      flags: true,
      strategy: true,
      carStatus: true,
      session: true,
    },
    widgets,
    activeProfile: "default",
    profiles: { default: { name: "Por defecto", scale: 1, opacity: 0.92, widgets: structuredClone(widgets) } },
  };
}

/** Fills anything missing in stored widget settings from the defaults. */
function mergeWidgets(stored: any): Record<string, WidgetConfig> {
  const base = defaultWidgets();
  for (const id of Object.keys(base)) {
    const { scale: _scale, opacity: _opacity, ...s } = stored?.[id] ?? {};
    base[id] = { ...base[id], ...s, options: { ...base[id].options, ...(s.options ?? {}) } };
  }
  return base;
}

/** Fills anything missing in a stored config from the defaults. */
function merge(stored: any): AppConfig {
  const base = defaults();
  if (!stored || typeof stored !== "object") return base;
  const general = { ...base.general, ...(stored.general ?? {}) };
  const online = { ...base.online, ...(stored.online ?? {}) };
  const spotter = { ...base.spotter, ...(stored.spotter ?? {}) };
  const widgets = mergeWidgets(stored.widgets);
  const profiles: Record<string, Profile> = {};
  for (const [id, p] of Object.entries<any>(stored.profiles ?? {})) {
    if (!p || typeof p !== "object") continue;
    profiles[id] = {
      name: typeof p.name === "string" && p.name ? p.name : "Perfil",
      scale: typeof p.scale === "number" ? p.scale : base.general.scale,
      opacity: typeof p.opacity === "number" ? p.opacity : base.general.opacity,
      widgets: mergeWidgets(p.widgets),
    };
  }
  let activeProfile = typeof stored.activeProfile === "string" ? stored.activeProfile : "default";
  if (!profiles[activeProfile]) {
    activeProfile = Object.keys(profiles)[0] ?? "default";
    profiles[activeProfile] ??= {
      name: "Por defecto",
      scale: general.scale,
      opacity: general.opacity,
      widgets: structuredClone(widgets),
    };
  }
  return { ...base, general, online, spotter, widgets, activeProfile, profiles };
}

class ConfigStore {
  value = $state<AppConfig>(defaults());
  loaded = $state(false);
}

export const config = new ConfigStore();

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;
let lastSaved = "";

export async function loadConfig() {
  if (started) {
    applyTheme(config.value.general);
    return;
  }
  started = true;
  await listen<unknown>("config-changed", (e) => {
    if (JSON.stringify(e.payload) === lastSaved) return;
    config.value = merge(e.payload);
    applyTheme(config.value.general);
  });
  config.value = merge(await api.getConfig());
  applyTheme(config.value.general);
  config.loaded = true;
}

/** Copies the live layout into the active profile's saved slot. */
function syncActiveProfile() {
  const c = config.value;
  c.profiles[c.activeProfile] = {
    name: c.profiles[c.activeProfile]?.name ?? "Perfil",
    scale: c.general.scale,
    opacity: c.general.opacity,
    widgets: $state.snapshot(c.widgets),
  };
}

/** Persists the current config (debounced) and broadcasts it to the other window. */
export function saveConfig() {
  applyTheme(config.value.general);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    syncActiveProfile();
    const snapshot = $state.snapshot(config.value);
    lastSaved = JSON.stringify(snapshot);
    api.saveConfig(snapshot);
  }, 250);
}

export function resetLayout() {
  const d = defaultWidgets();
  for (const [id, w] of Object.entries(config.value.widgets)) {
    w.x = d[id].x;
    w.y = d[id].y;
    w.size = 1;
  }
  config.value.general.scale = 1;
  saveConfig();
}

/** Makes `id` the active profile and loads its layout into the overlay. */
export function switchProfile(id: string) {
  const c = config.value;
  const p = c.profiles[id];
  if (!p || id === c.activeProfile) return;
  syncActiveProfile();
  c.activeProfile = id;
  c.general.scale = p.scale;
  c.general.opacity = p.opacity;
  c.widgets = mergeWidgets($state.snapshot(p.widgets));
  saveConfig();
}

/** Creates a profile from the current setup (or the defaults) and switches to it. */
export function createProfile(name: string, fromDefaults = false) {
  syncActiveProfile();
  const c = config.value;
  const id = `p${Date.now().toString(36)}`;
  const d = defaults();
  c.profiles[id] = fromDefaults
    ? { name, scale: d.general.scale, opacity: d.general.opacity, widgets: d.widgets }
    : { name, scale: c.general.scale, opacity: c.general.opacity, widgets: $state.snapshot(c.widgets) };
  switchProfile(id);
}

export function renameProfile(id: string, name: string) {
  const p = config.value.profiles[id];
  if (!p || !name.trim()) return;
  p.name = name.trim();
  saveConfig();
}

/** Deletes a profile; the last remaining one can't be deleted. */
export function deleteProfile(id: string) {
  const c = config.value;
  const ids = Object.keys(c.profiles);
  if (ids.length < 2 || !c.profiles[id]) return;
  if (id === c.activeProfile) switchProfile(ids.find((x) => x !== id)!);
  delete c.profiles[id];
  saveConfig();
}

/** Exports the active HUD profile (plus theme/colors) as a downloadable .mdthud.json string. */
export function exportActiveProfileJson(): { filename: string; content: string } {
  syncActiveProfile();
  const c = config.value;
  const p = c.profiles[c.activeProfile];
  const payload = {
    app: "MDT-HUD",
    organization: "Mediterranean Motorsport",
    exportedAt: new Date().toISOString(),
    profile: {
      name: p?.name ?? "MDT Setup",
      scale: c.general.scale,
      opacity: c.general.opacity,
      theme: c.general.theme,
      accentColor: c.general.accentColor,
      hudBgColor: c.general.hudBgColor,
      hudBorderOpacity: c.general.hudBorderOpacity,
      teammates: c.general.teammates,
      widgets: $state.snapshot(c.widgets),
    },
  };
  const safeName = (p?.name ?? "mdt-profile").toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
  return {
    filename: `${safeName}.mdthud.json`,
    content: JSON.stringify(payload, null, 2),
  };
}

/** Imports a profile from a parsed .mdthud.json object and switches to it. */
export function importProfileFromObject(raw: any): string {
  const src = raw?.profile ?? raw;
  if (!src || typeof src !== "object" || !src.widgets) {
    throw new Error("El archivo no contiene un perfil válido de MDT-HUD.");
  }
  syncActiveProfile();
  const c = config.value;
  const id = `p${Date.now().toString(36)}`;
  const name = typeof src.name === "string" && src.name.trim() ? src.name.trim() : "Perfil Importado MDT";
  const widgets = mergeWidgets(src.widgets);
  c.profiles[id] = {
    name,
    scale: typeof src.scale === "number" ? src.scale : 1,
    opacity: typeof src.opacity === "number" ? src.opacity : 0.92,
    widgets,
  };
  if (src.theme) c.general.theme = src.theme;
  if (src.accentColor) c.general.accentColor = src.accentColor;
  if (src.hudBgColor) c.general.hudBgColor = src.hudBgColor;
  if (typeof src.hudBorderOpacity === "number") c.general.hudBorderOpacity = src.hudBorderOpacity;
  if (typeof src.teammates === "string") c.general.teammates = src.teammates;
  switchProfile(id);
  return name;
}

/** Creates one of the 3 built-in MDT factory templates and activates it. */
export function createMdtTemplateProfile(template: "competicion" | "streamer" | "minimalista") {
  syncActiveProfile();
  const c = config.value;
  const w = defaultWidgets();

  if (template === "competicion") {
    w.dashboard.options.style = "ddu";
    w.dashboard.options.rpmStyle = "leds";
    w.shiftlights.enabled = true;
    w.pacecatch.enabled = true;
    w.radar.enabled = true;
    w.standings.enabled = true;
    w.relative.enabled = true;
    w.fuel.enabled = true;
    w.tyres.enabled = true;
    w.electronics.enabled = true;
    w.damage.enabled = true;
  } else if (template === "streamer") {
    w.dashboard.options.style = "wec";
    w.dashboard.options.rpmStyle = "leds";
    w.mdtbranding.enabled = true;
    w.standings.enabled = true;
    w.standings.options.showBranding = true;
    w.relative.enabled = true;
    w.pacecatch.enabled = true;
    w.trackmap.enabled = true;
    w.weather.enabled = true;
    w.inputs.enabled = true;
  } else if (template === "minimalista") {
    for (const k of Object.keys(w)) w[k].enabled = false;
    w.dashboard.enabled = true;
    w.dashboard.options.style = "compact";
    w.relative.enabled = true;
    w.radar.enabled = true;
    w.radar.options.autoHide = true;
    w.fuel.enabled = true;
    w.flags.enabled = true;
    w.delta.enabled = true;
  }

  const labels = {
    competicion: "MDT Competición (Pro)",
    streamer: "MDT Streamer / Broadcast",
    minimalista: "MDT Minimalista",
  };

  const id = `p${Date.now().toString(36)}`;
  c.profiles[id] = {
    name: labels[template],
    scale: 1,
    opacity: 0.92,
    widgets: w,
  };
  switchProfile(id);
}
