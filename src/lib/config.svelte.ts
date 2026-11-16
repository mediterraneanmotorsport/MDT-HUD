import { listen } from "@tauri-apps/api/event";
import { api, isNativeTauri } from "./api";

export type Units = "metric" | "imperial";
export type HudTheme = "mdt-aura" | "mdt-f1" | "mdt-hy" | "mdt-gt3" | "mdt-lmp2" | "custom";
export type PresetThemeId = Exclude<HudTheme, "custom">;

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
    /** Modo Broadcast: El overlay permanece activo y visible incluso como espectador o en repetición/garaje. */
    broadcastMode?: boolean;
    /** ID del perfil de overlay específico para retransmisiones y streaming. */
    broadcastProfileId?: string;
    /** ID del perfil de overlay para cuando el usuario está pilotando en pista. */
    drivingProfileId?: string;
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
  /** Discord Webhook integration for session telemetry exports */
  discord: {
    enabled: boolean;
    webhookUrl: string;
    botName: string;
    autoExport: boolean;
  };
  /** Retransmisión pública de telemetría en vivo con la comunidad y el equipo */
  broadcast: {
    enabled: boolean;
    driverName: string;
    brokerUrl: string;
    rateHz: number;
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
  screenWidth?: number;
  screenHeight?: number;
  widgets: Record<string, WidgetConfig>;
}

export interface HudThemeMeta {
  label: string;
  subtitle: string;
  fontName: string;
  accent: string;
  secondary: string;
  bg: string;
  borderOpacity: number;
  dashboardStyle: "wec" | "ddu" | "radial" | "compact" | "classic";
  rpmStyle: "leds" | "center" | "bar";
}

export const HUD_THEMES: Record<PresetThemeId, HudThemeMeta> = {
  "mdt-aura": {
    label: "MDT-AURA",
    subtitle: "Neón Cian & Cristal Azul · Fuente Geométrica Aeroespacial · Dash WEC",
    fontName: "Barlow Aeroespacial",
    accent: "#2287ec",
    secondary: "#00e5ff",
    bg: "#050e1d",
    borderOpacity: 0.65,
    dashboardStyle: "wec",
    rpmStyle: "leds",
  },
  "mdt-f1": {
    label: "MDT-F1",
    subtitle: "Broadcast Fórmula 1 · Fuente Cursiva Racing Impact · Cortes Diagonales",
    fontName: "F1 Broadcast Italic",
    accent: "#e10600",
    secondary: "#ffffff",
    bg: "#08080c",
    borderOpacity: 0.65,
    dashboardStyle: "compact",
    rpmStyle: "center",
  },
  "mdt-hy": {
    label: "MDT-HY",
    subtitle: "Le Mans Hypercar WEC · Fuente Técnica Bahnschrift · Carbono & Oro Híbrido",
    fontName: "WEC Hypercar Tech",
    accent: "#ff1e38",
    secondary: "#ffb800",
    bg: "#11080c",
    borderOpacity: 0.6,
    dashboardStyle: "ddu",
    rpmStyle: "center",
  },
  "mdt-gt3": {
    label: "MDT-GT3",
    subtitle: "Consola MoTeC / Bosch GT3 · Fuente Monoespaciada Digital · Marco Industrial",
    fontName: "MoTeC Digital Mono",
    accent: "#00e676",
    secondary: "#ffd600",
    bg: "#05100a",
    borderOpacity: 0.7,
    dashboardStyle: "radial",
    rpmStyle: "leds",
  },
  "mdt-lmp2": {
    label: "MDT-LMP2",
    subtitle: "Prototipo Oreca Gulf · Fuente Clásica Endurance · Doble Franja Azul/Naranja",
    fontName: "Le Mans Classic",
    accent: "#00b0ff",
    secondary: "#ff6d00",
    bg: "#051220",
    borderOpacity: 0.65,
    dashboardStyle: "ddu",
    rpmStyle: "leds",
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  if (isNaN(num)) return [34, 135, 236];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function applyThemeToElement(
  el: HTMLElement,
  theme: HudTheme,
  customAccent = "#2287ec",
  customBg = "#091626",
  customBorderOp = 0.55,
) {
  const preset = theme !== "custom" ? (HUD_THEMES[theme] ?? HUD_THEMES["mdt-aura"]) : null;
  const effectiveTheme = preset ? theme : "custom";
  el.setAttribute("data-hud-theme", effectiveTheme);

  const accentHex = preset ? preset.accent : customAccent || "#2287ec";
  const bgHex = preset ? preset.bg : customBg || "#091626";
  const borderOp = preset ? preset.borderOpacity : (customBorderOp ?? 0.55);

  const [ar, ag, ab] = hexToRgb(accentHex);
  const [br, bg, bb] = hexToRgb(bgHex);
  const hi = `rgb(${Math.min(255, ar + 35)} ${Math.min(255, ag + 35)} ${Math.min(255, ab + 35)})`;
  const lo = `rgb(${Math.round(ar * 0.48)} ${Math.round(ag * 0.48)} ${Math.round(ab * 0.48)})`;

  const st = el.style;
  st.setProperty("--color-accent", accentHex);
  st.setProperty("--color-accent-hi", hi);
  st.setProperty("--color-accent-lo", lo);
  st.setProperty("--color-hud", `rgb(${br} ${bg} ${bb} / 0.93)`);
  st.setProperty("--color-hud-2", `rgb(${ar} ${ag} ${ab} / 0.15)`);
  st.setProperty("--color-hud-line", `rgb(${ar} ${ag} ${ab} / ${borderOp})`);
}

export function applyTheme(g: AppConfig["general"]) {
  if (typeof document === "undefined") return;
  applyThemeToElement(document.documentElement, g.theme, g.accentColor, g.hudBgColor, g.hudBorderOpacity);
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
      { key: "transparentIcons", label: "Quitar fondo a los iconos (iconos transparentes)", type: "boolean" },
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
      transparentIcons: false,
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
      { key: "showGhostTrace", label: "Mostrar traza fantasma comparativa de frenada (Ghost Trace)", type: "boolean" },
      { key: "width", label: "Ancho (px)", type: "number", min: 200, max: 600, step: 10 },
    ],
    optionDefaults: { seconds: 6, showSteering: true, showPedals: true, showClutch: true, showGhostTrace: false, width: 320 },
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
      { key: "showPosGained", label: "Posiciones ganadas o perdidas (▲/▼)", type: "boolean" },
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
      showPosGained: false,
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
      { key: "showFrame", label: "Mostrar recuadro de fondo", type: "boolean" },
      { key: "size", label: "Tamaño (px)", type: "number", min: 120, max: 500, step: 10 },
      { key: "classColors", label: "Colorear por categoría", type: "boolean" },
    ],
    optionDefaults: { showFrame: true, size: 240, classColors: true },
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
    id: "stintplanner",
    name: "Calculadora de Estrategia y Stints WEC",
    description: "Calcula paradas en boxes necesarias, litros/energía por parada, splash final y ahorro para quitar 1 parada.",
    defaults: { enabled: false, x: 1590, y: 540 },
    options: [
      { key: "safetyLaps", label: "Vueltas extra de margen de seguridad", type: "number", min: 0, max: 3, step: 0.5 },
      { key: "customMinutes", label: "Duración manual (min, 0 = automático de la sesión)", type: "number", min: 0, max: 1440, step: 15 },
    ],
    optionDefaults: { safetyLaps: 1, customMinutes: 0 },
  },
  {
    id: "mfd",
    name: "Pantalla Multifunción MFD (Control por Volante)",
    description: "Panel rotativo controlado con botones de tu volante: cambia entre Relativo, Clasificación, Daños/Gomas, Combustible y Cazador.",
    defaults: { enabled: false, x: 1220, y: 560 },
    options: [],
    optionDefaults: {},
  },
  {
    id: "mdtbranding",
    name: "Marca de agua MDT (Stream)",
    description: "Insignia de retransmisión con nombre del piloto en vivo, bandera del país y foto circular opcional.",
    defaults: { enabled: false, x: 1580, y: 1005 },
    options: [
      { key: "showAvatar", label: "Mostrar foto del piloto dentro de un círculo (Opcional)", type: "boolean" },
      { key: "showFlag", label: "Mostrar bandera del país del piloto (Opcional)", type: "boolean" },
      {
        key: "countryCode",
        label: "País del piloto (Bandera)",
        type: "select",
        choices: [
          { value: "auto", label: "Detectar automáticamente (Idioma / Zona horaria)" },
          { value: "ES", label: "España (ESP)" },
          { value: "PT", label: "Portugal (POR)" },
          { value: "AD", label: "Andorra (AND)" },
          { value: "FR", label: "Francia (FRA)" },
          { value: "IT", label: "Italia (ITA)" },
          { value: "DE", label: "Alemania (DEU)" },
          { value: "GB", label: "Reino Unido (GBR)" },
          { value: "NL", label: "Países Bajos (NLD)" },
          { value: "BE", label: "Bélgica (BEL)" },
          { value: "CH", label: "Suiza (CHE)" },
          { value: "AT", label: "Austria (AUT)" },
          { value: "MC", label: "Mónaco (MCO)" },
          { value: "IE", label: "Irlanda (IRL)" },
          { value: "PL", label: "Polonia (POL)" },
          { value: "SE", label: "Suecia (SWE)" },
          { value: "NO", label: "Noruega (NOR)" },
          { value: "FI", label: "Finlandia (FIN)" },
          { value: "DK", label: "Dinamarca (DNK)" },
          { value: "US", label: "Estados Unidos (USA)" },
          { value: "CA", label: "Canadá (CAN)" },
          { value: "MX", label: "México (MEX)" },
          { value: "AR", label: "Argentina (ARG)" },
          { value: "BR", label: "Brasil (BRA)" },
          { value: "CL", label: "Chile (CHL)" },
          { value: "CO", label: "Colombia (COL)" },
          { value: "UY", label: "Uruguay (URY)" },
          { value: "PE", label: "Perú (PER)" },
          { value: "VE", label: "Venezuela (VEN)" },
          { value: "JP", label: "Japón (JPN)" },
          { value: "AU", label: "Australia (AUS)" },
          { value: "NZ", label: "Nueva Zelanda (NZL)" },
          { value: "EU", label: "Internacional / Europa (INT)" },
        ],
      },
      { key: "showCarNumber", label: "Mostrar dorsal del coche en pista (#)", type: "boolean" },
      { key: "showTagline", label: "Mostrar subtítulo 'Mediterranean Motorsport'", type: "boolean" },
      {
        key: "style",
        label: "Estilo visual",
        type: "select",
        choices: [
          { value: "panel", label: "Panel HUD con borde del tema" },
          { value: "minimal", label: "Marca de agua transparente" },
        ],
      },
    ],
    optionDefaults: {
      showAvatar: true,
      avatarDataUrl: "",
      showFlag: true,
      countryCode: "auto",
      customDriverName: "",
      showCarNumber: true,
      showTagline: true,
      style: "panel",
    },
  },
  {
    id: "battleforpos",
    name: "Duelo por Posición (Battle for Pos)",
    description: "Gráfico televisivo estilo WEC que aparece automáticamente cuando dos coches luchan en pista a menos de 1 segundo.",
    defaults: { enabled: false, x: 730, y: 350 },
    options: [
      { key: "deltaThreshold", label: "Umbral de activación de batalla (segundos)", type: "number", min: 0.3, max: 3.0, step: 0.1 },
      { key: "showTyres", label: "Mostrar compuestos de neumáticos", type: "boolean" },
      { key: "showInterval", label: "Mostrar diferencia en décimas de segundo", type: "boolean" },
      { key: "showSpeed", label: "Mostrar velocidad en tiempo real de ambos", type: "boolean" },
      { key: "showClassBadge", label: "Mostrar placa de categoría (HY, P2, GT3)", type: "boolean" },
      { key: "sameClassOnly", label: "Solo alertar batallas de la misma categoría", type: "boolean" },
    ],
    optionDefaults: {
      deltaThreshold: 1.0,
      showTyres: true,
      showInterval: true,
      showSpeed: true,
      showClassBadge: true,
      sameClassOnly: true,
    },
  },
  {
    id: "broadcastticker",
    name: "Cinta de Tiempos WEC (Broadcast Ticker)",
    description: "Barra continua estilo retransmisión oficial con vueltas rápidas, sectores morados/verdes, banderas y clasificación.",
    defaults: { enabled: false, x: 160, y: 1010 },
    options: [
      { key: "showFastestLaps", label: "Mostrar vuelta rápida de cada categoría (Púrpura)", type: "boolean" },
      { key: "showSessionStatus", label: "Mostrar tiempo restante y banderas activas", type: "boolean" },
      { key: "showIntervals", label: "Mostrar diferencias e intervalos en la torre", type: "boolean" },
      { key: "showTeammates", label: "Resaltar compañeros de equipo MDT", type: "boolean" },
      { key: "speed", label: "Velocidad de cambio de pantalla (segundos)", type: "number", min: 3, max: 15, step: 1 },
    ],
    optionDefaults: {
      showFastestLaps: true,
      showSessionStatus: true,
      showIntervals: true,
      showTeammates: true,
      speed: 5,
    },
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
      theme: "mdt-aura",
      accentColor: "#2287ec",
      hudBgColor: "#071426",
      hudBorderOpacity: 0.65,
      teammates: "MDT, Mediterranean",
      broadcastMode: false,
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
    discord: {
      enabled: true,
      webhookUrl: "https://discord.com/api/webhooks/1571662308269232189/Y9Sv1n8yOwKUjWJbzJxxJgg-ipdOJLhAWlw0EcasB23RT97Z1WVgV2v_q6Ci6w6mgVEX",
      botName: "Ingeniera MDT",
      autoExport: true,
    },
    broadcast: {
      enabled: true,
      driverName: "",
      brokerUrl: "wss://broker.hivemq.com:8884/mqtt",
      rateHz: 15,
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
  if (general.theme !== "custom" && !(general.theme in HUD_THEMES)) {
    general.theme = "mdt-aura";
  }
  const online = { ...base.online, ...(stored.online ?? {}) };
  const spotter = { ...base.spotter, ...(stored.spotter ?? {}) };
  const discord = { ...base.discord, ...(stored.discord ?? {}) };
  if (!discord.webhookUrl || !discord.webhookUrl.startsWith("http")) {
    discord.webhookUrl = base.discord.webhookUrl;
  }
  if (!discord.botName || discord.botName === "MDT-HUD Telemetría") {
    discord.botName = "Ingeniera MDT";
  }
  if (discord.enabled === undefined) discord.enabled = true;
  if (discord.autoExport === undefined) discord.autoExport = true;
  const broadcast = { ...base.broadcast, ...(stored.broadcast ?? {}) };
  if (broadcast.enabled === undefined) broadcast.enabled = true;
  if (!broadcast.brokerUrl) broadcast.brokerUrl = base.broadcast.brokerUrl;
  if (!broadcast.rateHz) broadcast.rateHz = 15;
  const widgets = mergeWidgets(stored.widgets);
  const profiles: Record<string, Profile> = {};
  for (const [id, p] of Object.entries<any>(stored.profiles ?? {})) {
    if (!p || typeof p !== "object") continue;
    profiles[id] = {
      name: typeof p.name === "string" && p.name ? p.name : "Perfil",
      scale: typeof p.scale === "number" ? p.scale : base.general.scale,
      opacity: typeof p.opacity === "number" ? p.opacity : base.general.opacity,
      screenWidth: typeof p.screenWidth === "number" ? p.screenWidth : undefined,
      screenHeight: typeof p.screenHeight === "number" ? p.screenHeight : undefined,
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
  return { ...base, general, online, spotter, discord, broadcast, widgets, activeProfile, profiles };
}

class ConfigStore {
  value = $state<AppConfig>(defaults());
  loaded = $state(false);
  revision = $state(0);
}

export const config = new ConfigStore();

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;
let lastRemoteConfigStr = "";
let lastLocalSaveAt = 0;

function applyMergedInPlace(next: AppConfig) {
  Object.assign(config.value.general, next.general);
  Object.assign(config.value.online, next.online);
  Object.assign(config.value.spotter, next.spotter);
  if (next.discord) Object.assign(config.value.discord, next.discord);
  if (next.broadcast) Object.assign(config.value.broadcast, next.broadcast);
  for (const [id, wNext] of Object.entries(next.widgets)) {
    if (config.value.widgets[id]) {
      config.value.widgets[id].enabled = wNext.enabled;
      config.value.widgets[id].x = wNext.x;
      config.value.widgets[id].y = wNext.y;
      config.value.widgets[id].size = wNext.size;
      config.value.widgets[id].alpha = wNext.alpha;
      Object.assign(config.value.widgets[id].options, wNext.options);
    } else {
      config.value.widgets[id] = wNext;
    }
  }
  config.value.activeProfile = next.activeProfile;
  config.value.profiles = next.profiles;
  config.revision += 1;
}

export function applyRemoteConfig(raw: any) {
  if (!raw || typeof raw !== "object") return;
  if (Date.now() - lastLocalSaveAt < 650) return;
  const next = merge(raw);
  const s = JSON.stringify(next);
  if (s === lastRemoteConfigStr && config.loaded) return;
  lastRemoteConfigStr = s;
  applyMergedInPlace(next);
  applyTheme(config.value.general);
  config.loaded = true;
}

export async function loadConfig() {
  if (started) {
    applyTheme(config.value.general);
    return;
  }
  started = true;
  if (!isNativeTauri()) {
    try {
      const res = await fetch("/__mobile_state", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data?.appConfig) {
          applyRemoteConfig(data.appConfig);
          return;
        }
      }
    } catch {
      // ignore
    }
    applyTheme(config.value.general);
    config.loaded = true;
    return;
  }
  await listen<unknown>("config-changed", (e) => {
    const next = merge(e.payload);
    const s = JSON.stringify(next);
    lastRemoteConfigStr = s;
    applyMergedInPlace(next);
    applyTheme(config.value.general);
  });
  const initial = merge(await api.getConfig());
  const initialStr = JSON.stringify(initial);
  lastRemoteConfigStr = initialStr;
  applyMergedInPlace(initial);
  applyTheme(config.value.general);
  await detectNativeResolution();
  config.loaded = true;
}

/** Copies the live layout into the active profile's saved slot. */
export function syncActiveProfile() {
  const c = config.value;
  const native = getNativeResolution();
  c.profiles[c.activeProfile] = {
    name: c.profiles[c.activeProfile]?.name ?? "Perfil",
    scale: c.general.scale,
    opacity: c.general.opacity,
    screenWidth: native.width,
    screenHeight: native.height,
    widgets: $state.snapshot(c.widgets),
  };
}

/** Persists the current config (debounced) and broadcasts it to the other window and mobile server. */
export function saveConfig() {
  lastLocalSaveAt = Date.now();
  syncActiveProfile();
  config.revision += 1;
  applyTheme(config.value.general);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lastLocalSaveAt = Date.now();
    syncActiveProfile();
    const snapshot = $state.snapshot(config.value);
    const serialized = JSON.stringify(snapshot);
    lastRemoteConfigStr = serialized;
    if (isNativeTauri()) {
      api.saveConfig(snapshot);
    } else if (typeof window !== "undefined") {
      const body: Record<string, any> = { appConfig: snapshot };
      if (snapshot.general.theme !== "custom" && snapshot.general.theme in HUD_THEMES) {
        body.mobileTheme = snapshot.general.theme;
      }
      void fetch("/__mobile_state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => { });
    }
  }, 20);
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

  const native = getNativeResolution();
  if (
    p.screenWidth &&
    p.screenHeight &&
    (Math.abs(p.screenWidth - native.width) > 32 || Math.abs(p.screenHeight - native.height) > 32)
  ) {
    c.widgets = autoSizeProfileWidgets(p.widgets, p.screenWidth, p.screenHeight, native.width, native.height);
  } else {
    c.widgets = mergeWidgets($state.snapshot(p.widgets));
  }
  saveConfig();
}

/** Creates a profile from the current setup (or the defaults) and switches to it. */
export function createProfile(name: string, fromDefaults = false) {
  syncActiveProfile();
  const c = config.value;
  const id = `p${Date.now().toString(36)}`;
  const d = defaults();
  const native = getNativeResolution();
  c.profiles[id] = fromDefaults
    ? { name, scale: d.general.scale, opacity: d.general.opacity, screenWidth: native.width, screenHeight: native.height, widgets: d.widgets }
    : { name, scale: c.general.scale, opacity: c.general.opacity, screenWidth: native.width, screenHeight: native.height, widgets: $state.snapshot(c.widgets) };
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

let cachedNativeResolution: { width: number; height: number } = { width: 1920, height: 1080 };

/** Resolves the native display resolution of the monitor hosting the HUD. */
export async function detectNativeResolution(): Promise<{ width: number; height: number }> {
  if (isNativeTauri()) {
    try {
      const monitors = await api.listMonitors();
      if (monitors && monitors.length > 0) {
        const chosen = config.value?.general?.monitor;
        const target =
          (chosen ? monitors.find((m) => m.name === chosen) : null) ??
          monitors.find((m) => m.primary) ??
          monitors[0];
        if (target && target.width >= 640 && target.height >= 480) {
          cachedNativeResolution = { width: target.width, height: target.height };
          return cachedNativeResolution;
        }
      }
    } catch {
      // ignore
    }
  }
  if (typeof window !== "undefined" && window.screen) {
    const sw = window.screen.width;
    const sh = window.screen.height;
    if (sw >= 640 && sh >= 480) {
      cachedNativeResolution = { width: sw, height: sh };
      return cachedNativeResolution;
    }
  }
  return cachedNativeResolution;
}

/** Synchronous getter for the cached native display resolution (never returns companion window size). */
export function getNativeResolution(): { width: number; height: number } {
  if (cachedNativeResolution.width >= 640 && cachedNativeResolution.height >= 480) {
    return cachedNativeResolution;
  }
  if (typeof window !== "undefined" && window.screen) {
    const sw = window.screen.width;
    const sh = window.screen.height;
    if (sw >= 640 && sh >= 480) {
      return { width: sw, height: sh };
    }
  }
  return { width: 1920, height: 1080 };
}

const WIDGET_APPROX_WIDTHS: Record<string, number> = {
  dashboard: 480,
  shiftlights: 420,
  standings: 290,
  relative: 290,
  tyres: 344,
  fuel: 270,
  electronics: 210,
  damage: 210,
  radar: 220,
  trackmap: 260,
  weather: 250,
  inputs: 200,
  pacecatch: 270,
  session: 240,
  flags: 220,
  delta: 200,
  mdtbranding: 240,
  tracklimits: 220,
};

const WIDGET_APPROX_HEIGHTS: Record<string, number> = {
  dashboard: 240,
  shiftlights: 70,
  standings: 420,
  relative: 320,
  tyres: 240,
  fuel: 180,
  electronics: 180,
  damage: 180,
  radar: 220,
  trackmap: 260,
  weather: 160,
  inputs: 180,
  pacecatch: 180,
  session: 120,
  flags: 80,
  delta: 80,
  mdtbranding: 80,
  tracklimits: 80,
};

/**
 * Auto-sizes and repositions profile widgets to fit the user's current screen resolution.
 * Si el .json es de la misma resolución que la pantalla nativa, NO APLICA (se mantiene tal cual).
 */
export function autoSizeProfileWidgets(
  widgets: Record<string, WidgetConfig>,
  sourceW?: number,
  sourceH?: number,
  targetW?: number,
  targetH?: number,
): Record<string, WidgetConfig> {
  const native = getNativeResolution();
  const curW = targetW ?? native.width;
  const curH = targetH ?? native.height;

  let maxWidgetX = 0;
  let maxWidgetY = 0;
  for (const w of Object.values(widgets)) {
    if (typeof w.x === "number" && w.x > maxWidgetX) maxWidgetX = w.x;
    if (typeof w.y === "number" && w.y > maxWidgetY) maxWidgetY = w.y;
  }

  let srcW = sourceW && sourceW >= 640 ? sourceW : 0;
  let srcH = sourceH && sourceH >= 480 ? sourceH : 0;

  // Si proviene del bug de tamaño de la ventana acompañante (1360x860), deducir la resolución real original
  if (srcW === 1360 && srcH === 860) {
    srcW = 0;
    srcH = 0;
  }

  if (!srcW) {
    if (maxWidgetX > 2560) srcW = 3440;
    else if (maxWidgetX > 1920) srcW = 2560;
    else if (maxWidgetX > 1400) srcW = 1920;
    else srcW = 1920;
  }
  if (!srcH) {
    if (maxWidgetY > 1150) srcH = 1440;
    else if (maxWidgetY > 850) srcH = 1080;
    else srcH = 1080;
  }

  // REQUISITO CRÍTICO: Si el .json es de la misma resolución que la pantalla nativa, NO APLICA.
  if (Math.abs(srcW - curW) <= 32 && Math.abs(srcH - curH) <= 32) {
    return widgets;
  }

  // Factores de escala vertical y tamaño
  const scaleY = curH / srcH;
  const scaleSize = Math.max(0.4, Math.min(2.5, +(scaleY).toFixed(3)));

  const resized: Record<string, WidgetConfig> = {};
  for (const [id, w] of Object.entries(widgets)) {
    const copy = structuredClone(w);

    // 1. AUTOREDIMENSIONAR (tamaño del widget)
    if (typeof copy.size === "number") {
      copy.size = Math.max(0.4, Math.min(2.5, +(copy.size * scaleSize).toFixed(2)));
    }

    const effectiveScale = copy.size ?? 1;
    const approxW = Math.round((WIDGET_APPROX_WIDTHS[id] ?? 240) * effectiveScale);
    const approxH = Math.round((WIDGET_APPROX_HEIGHTS[id] ?? 120) * effectiveScale);

    // 2. POSICIONAR (coordenadas Y y X con anclaje inteligente por zonas)
    if (typeof copy.y === "number") {
      const newY = Math.round(copy.y * scaleY);
      const maxY = Math.max(0, curH - approxH - 10);
      copy.y = Math.max(10, Math.min(maxY, newY));
    }

    if (typeof copy.x === "number") {
      const relX = copy.x / srcW;
      let newX: number;

      if (relX < 0.35) {
        // Zona izquierda: mantener anclado al margen izquierdo
        newX = Math.round(copy.x * (curW / srcW));
      } else if (relX > 0.65) {
        // Zona derecha: mantener anclado al margen derecho
        const distFromRight = srcW - copy.x;
        const scaledDistFromRight = distFromRight * scaleY;
        newX = Math.round(curW - scaledDistFromRight);
      } else {
        // Zona central: mantener anclado con respecto al centro horizontal de la pantalla
        const centerOffset = copy.x - srcW / 2;
        newX = Math.round(curW / 2 + centerOffset * scaleY);
      }

      const maxX = Math.max(0, curW - approxW - 10);
      copy.x = Math.max(10, Math.min(maxX, newX));
    }

    resized[id] = copy;
  }

  return resized;
}

/** Exports the active HUD profile (plus theme/colors and native screen resolution) as a downloadable .mdthud.json string. */
export function exportActiveProfileJson(): { filename: string; content: string } {
  syncActiveProfile();
  const c = config.value;
  const p = c.profiles[c.activeProfile];
  const screen = getNativeResolution();
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
      screenWidth: screen.width,
      screenHeight: screen.height,
      widgets: $state.snapshot(c.widgets),
    },
  };
  const safeName = (p?.name ?? "mdt-profile").toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
  return {
    filename: `${safeName}.mdthud.json`,
    content: JSON.stringify(payload, null, 2),
  };
}

/** Imports a profile from a parsed .mdthud.json object, auto-resizes to the user's screen resolution (if different) and switches to it. */
export function importProfileFromObject(raw: any, targetW?: number, targetH?: number): string {
  const src = raw?.profile ?? raw;
  if (!src || typeof src !== "object" || !src.widgets) {
    throw new Error("El archivo no contiene un perfil válido de MDT-HUD.");
  }
  syncActiveProfile();
  const c = config.value;
  const id = `p${Date.now().toString(36)}`;
  const name = typeof src.name === "string" && src.name.trim() ? src.name.trim() : "Perfil Importado MDT";
  const rawWidgets = mergeWidgets(src.widgets);
  const srcW = typeof src.screenWidth === "number" ? src.screenWidth : undefined;
  const srcH = typeof src.screenHeight === "number" ? src.screenHeight : undefined;
  const widgets = autoSizeProfileWidgets(rawWidgets, srcW, srcH, targetW, targetH);

  const native = getNativeResolution();
  c.profiles[id] = {
    name,
    scale: typeof src.scale === "number" ? src.scale : 1,
    opacity: typeof src.opacity === "number" ? src.opacity : 0.92,
    screenWidth: targetW ?? native.width,
    screenHeight: targetH ?? native.height,
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

/** Applies one of the 5 complete MDT overlay themes (MDT-AURA, MDT-F1, MDT-HY, MDT-GT3, MDT-LMP2) purely visually without changing user's widgets. */
export function applyCompleteOverlayTheme(themeId: PresetThemeId, _applyDesignOptions = false) {
  const c = config.value;
  const preset = HUD_THEMES[themeId];
  if (!preset) return;

  // Solo aplicar el cambio visual (colores, fondo, opacidad de borde y tema CSS)
  c.general.theme = themeId;
  c.general.accentColor = preset.accent;
  c.general.hudBgColor = preset.bg;
  c.general.hudBorderOpacity = preset.borderOpacity;

  // NO modificar los complementos elegidos por el usuario (c.widgets[...].enabled permanece intacto)
  saveConfig();
}

/** Creates one of the built-in MDT factory templates and activates it. */
export function createMdtTemplateProfile(template: "competicion" | "streamer" | "minimalista" | "wec" | "broadcast") {
  if (template === "wec") template = "competicion";
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
  } else if (template === "broadcast") {
    for (const k of Object.keys(w)) w[k].enabled = false;
    w.standings.enabled = true;
    w.standings.x = 24;
    w.standings.y = 80;
    w.standings.options.showBranding = true;
    w.relative.enabled = true;
    w.relative.x = 24;
    w.relative.y = 780;
    w.trackmap.enabled = true;
    w.trackmap.x = 1560;
    w.trackmap.y = 50;
    w.weather.enabled = true;
    w.weather.x = 1560;
    w.weather.y = 480;
    w.mdtbranding.enabled = true;
    w.mdtbranding.x = 24;
    w.mdtbranding.y = 20;
    w.flags.enabled = true;
    if (w.battleforpos) {
      w.battleforpos.enabled = true;
      w.battleforpos.x = 740;
      w.battleforpos.y = 320;
    }
    if (w.broadcastticker) {
      w.broadcastticker.enabled = true;
      w.broadcastticker.x = 160;
      w.broadcastticker.y = 1010;
    }
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
    broadcast: "MDT Modo Broadcast (Espectador)",
  };

  const id = `p${Date.now().toString(36)}`;
  const native = getNativeResolution();
  const finalWidgets =
    Math.abs(native.width - 1920) > 32 || Math.abs(native.height - 1080) > 32
      ? autoSizeProfileWidgets(w, 1920, 1080, native.width, native.height)
      : w;

  c.profiles[id] = {
    name: labels[template],
    scale: 1,
    opacity: 0.92,
    screenWidth: native.width,
    screenHeight: native.height,
    widgets: finalWidgets,
  };
  if (template === "broadcast") {
    c.general.broadcastProfileId = id;
  }
  switchProfile(id);
}

/** Activa o desactiva el Modo Broadcast cambiando automáticamente entre el perfil de pilotaje y el perfil de stream. */
export function toggleBroadcastMode(forceState?: boolean) {
  const c = config.value;
  const next = typeof forceState === "boolean" ? forceState : !c.general.broadcastMode;
  c.general.broadcastMode = next;
  syncActiveProfile();

  if (next) {
    c.general.drivingProfileId = c.activeProfile;
    if (c.general.broadcastProfileId && c.profiles[c.general.broadcastProfileId]) {
      switchProfile(c.general.broadcastProfileId);
    } else {
      const existing = Object.entries(c.profiles).find(([_, p]) =>
        p.name.toLowerCase().includes("broadcast") || p.name.toLowerCase().includes("retransmisión"),
      );
      if (existing) {
        c.general.broadcastProfileId = existing[0];
        switchProfile(existing[0]);
      } else {
        createMdtTemplateProfile("broadcast");
        c.general.broadcastProfileId = c.activeProfile;
      }
    }
  } else {
    if (c.general.drivingProfileId && c.profiles[c.general.drivingProfileId]) {
      switchProfile(c.general.drivingProfileId);
    }
  }

  saveConfig();
  api.setBroadcastMode(next);
}
