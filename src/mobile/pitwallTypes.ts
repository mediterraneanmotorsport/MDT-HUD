export type PitwallThemeId =
  | "lovely-dark"
  | "f1-carbon"
  | "cyber-neon"
  | "stealth-oled"
  | "racing-gold"
  | "wec-official"
  | "ferrari-af"
  | "porsche-penske"
  | "toyota-gazoo"
  | "mdt-racing";

export type PitwallViewMode = "lovely" | "engineer" | "tablet";
export type PitwallRightModuleId =
  | "trackmap"
  | "battleCard"
  | "trafficRadar"
  | "raceControl"
  | "penalties"
  | "stintTimeline"
  | "telemetryPedals"
  | "tyres"
  | "tyreHistory"
  | "damage";

export interface PitwallThemeMeta {
  id: PitwallThemeId;
  label: string;
  desc: string;
  bg: string;
  card: string;
  header: string;
  accent: string;
  preview: [string, string];
}

export const PITWALL_THEMES: Record<PitwallThemeId, PitwallThemeMeta> = {
  "lovely-dark": {
    id: "lovely-dark",
    label: "Lovely Dark",
    desc: "Estilo oficial Pit Wall (Azul/Cian)",
    bg: "bg-[#070b12]",
    card: "bg-[#0d131f]/95 border-white/10",
    header: "bg-[#0d131f] border-white/10",
    accent: "#2287ec",
    preview: ["#0d131f", "#2287ec"],
  },
  "wec-official": {
    id: "wec-official",
    label: "FIA WEC Official",
    desc: "Azul profundo resistencia & verde FIA",
    bg: "bg-[#040a14]",
    card: "bg-[#091529]/95 border-emerald-400/25",
    header: "bg-[#081326] border-emerald-400/40",
    accent: "#10b981",
    preview: ["#091529", "#10b981"],
  },
  "mdt-racing": {
    id: "mdt-racing",
    label: "MDT Racing Pro",
    desc: "Mediterranean Motorsport · Azul eléctrico",
    bg: "bg-[#050c18]",
    card: "bg-[#0a182e]/95 border-sky-400/30",
    header: "bg-[#081529] border-sky-400/45",
    accent: "#38bdf8",
    preview: ["#0a182e", "#38bdf8"],
  },
  "ferrari-af": {
    id: "ferrari-af",
    label: "Ferrari AF Corse",
    desc: "Rosso Corsa & amarillo Módena",
    bg: "bg-[#0e0607]",
    card: "bg-[#1a0b0d]/95 border-red-500/30",
    header: "bg-[#220c0f] border-yellow-400/40",
    accent: "#dc2626",
    preview: ["#dc2626", "#facc15"],
  },
  "porsche-penske": {
    id: "porsche-penske",
    label: "Porsche Penske",
    desc: "Negro técnico, rojo Penske & blanco",
    bg: "bg-[#09090b]",
    card: "bg-[#131317]/95 border-rose-500/25",
    header: "bg-[#18181d] border-rose-500/40",
    accent: "#e11d48",
    preview: ["#18181d", "#e11d48"],
  },
  "toyota-gazoo": {
    id: "toyota-gazoo",
    label: "Toyota Gazoo GR",
    desc: "Carbono mate & rojo GR Gazoo",
    bg: "bg-[#0a0a0c]",
    card: "bg-[#141418]/95 border-red-600/30",
    header: "bg-[#1b1b20] border-red-600/45",
    accent: "#ef4444",
    preview: ["#1b1b20", "#ef4444"],
  },
  "f1-carbon": {
    id: "f1-carbon",
    label: "F1 Carbon",
    desc: "Fibra de carbono & acentos rojos",
    bg: "bg-[#0b0b0d]",
    card: "bg-[#141418]/95 border-red-500/20",
    header: "bg-[#18181e] border-red-500/30",
    accent: "#e10600",
    preview: ["#141418", "#e10600"],
  },
  "cyber-neon": {
    id: "cyber-neon",
    label: "Cyber Neon",
    desc: "Púrpura, magenta & cian brillante",
    bg: "bg-[#090514]",
    card: "bg-[#140c2a]/95 border-fuchsia-500/25",
    header: "bg-[#1a0f38] border-fuchsia-500/40",
    accent: "#00ffff",
    preview: ["#140c2a", "#d946ef"],
  },
  "stealth-oled": {
    id: "stealth-oled",
    label: "Stealth OLED",
    desc: "Negro absoluto 0% luz (Resistencia noche)",
    bg: "bg-black",
    card: "bg-[#070707] border-white/10",
    header: "bg-[#0a0a0a] border-white/15",
    accent: "#e2e8f0",
    preview: ["#000000", "#ffffff"],
  },
  "racing-gold": {
    id: "racing-gold",
    label: "Racing Gold",
    desc: "Oro metálico, ámbar & champán",
    bg: "bg-[#0d0b07]",
    card: "bg-[#19150e]/95 border-amber-500/25",
    header: "bg-[#211c12] border-amber-500/35",
    accent: "#f5a623",
    preview: ["#19150e", "#f5a623"],
  },
};

export interface PitwallConfig {
  theme: PitwallThemeId;
  customAccent: string; // "" = use theme default
  fontScale: "sm" | "md" | "lg";
  density: "compact" | "normal" | "spacious";
  splitPct: number; // Left column width % (45..75)
  pitLossSec: number; // Estimated pit stop loss for Rejoin Predictor
  rightOrder: PitwallRightModuleId[];
  pinnedIds: number[];
  locked: boolean; // #40 Lock Layout
  zenMode: boolean; // #40 Zen Mode
  autoDirector: {
    enabled: boolean;
    category: string; // "ALL" or class name
    intervalSec: number;
  };
  units: {
    pressure: "psi" | "bar" | "kpa";
    temp: "c" | "f";
    speed: "kmh" | "mph";
  };
  columns: {
    diff: boolean;
    cls: boolean;
    driver: boolean;
    pit: boolean;
    ve: boolean;
    lap: boolean;
    gap: boolean;
    interval: boolean;
    bestLap: boolean;
    lastLap: boolean;
    sectors: boolean;
  };
  modules: {
    header: boolean;
    flagBanners: boolean;
    leaderboard: boolean;
    pinnedStrip: boolean;
    relativeBar: boolean;
    bottomTelemetry: boolean;
    trackmap: boolean;
    weather: boolean;
    raceControl: boolean;
    battleCard: boolean;
    trafficRadar: boolean;
    penalties: boolean;
    stintTimeline: boolean;
    pitRejoin: boolean;
    telemetryPedals: boolean;
    tyres: boolean;
    tyreHistory: boolean;
    damage: boolean;
    fuelStrategy: boolean;
  };
}

export const DEFAULT_RIGHT_ORDER: PitwallRightModuleId[] = [
  "trackmap",
  "battleCard",
  "trafficRadar",
  "raceControl",
  "penalties",
  "stintTimeline",
  "telemetryPedals",
  "tyres",
  "tyreHistory",
  "damage",
];

export const RIGHT_MODULE_LABELS: Record<PitwallRightModuleId, string> = {
  trackmap: "🗺️ Mapa Interactivo & Meteo",
  battleCard: "⚔️ Tarjeta Duelo Directo (H2H)",
  trafficRadar: "🚦 Predictor de Tráfico / Doblados",
  raceControl: "🚩 Dirección de Carrera (Feed)",
  penalties: "⚖️ Penalizaciones & Track Limits",
  stintTimeline: "📊 Línea Temporal de Stints",
  telemetryPedals: "🎮 Pedales, Velocidad & RPM",
  tyres: "🛞 Mapa Calor Neumáticos & Degradación",
  tyreHistory: "📈 Historial de Presiones",
  damage: "🔧 Diagrama de Daños",
};

export const MODULE_LABELS: Record<keyof PitwallConfig["modules"], string> = {
  header: "Barra Superior de Sesión",
  flagBanners: "Banners Cinematográficos de Banderas",
  leaderboard: "Tabla Clasificación (Leaderboard)",
  pinnedStrip: "Franja de Rivales Vigilados (★)",
  relativeBar: "Barra de Relativo en Pista",
  bottomTelemetry: "Telemetría Inferior (Tiempos/Electrónica/Fuel)",
  trackmap: "Mapa Interactivo con Sectores y Zoom",
  weather: "Meteorología & Predicción",
  raceControl: "Feed Dirección de Carrera (Race Control)",
  battleCard: "Tarjeta Duelo Directo (<1.8s)",
  trafficRadar: "Predictor de Tráfico / Doblados",
  penalties: "Panel de Penalizaciones & Track Limits",
  stintTimeline: "Línea Temporal de Stints (Compuestos)",
  pitRejoin: "Predictor de Rejoin tras Pit Stop",
  telemetryPedals: "Pedales, Velocidad & RPM Sparklines",
  tyres: "Neumáticos Mapa Calor & Degradación",
  tyreHistory: "Gráfica Historial de Presiones",
  damage: "Diagrama de Daños del Coche",
  fuelStrategy: "Estrategia Combustible & Lift/Coast",
};

export const DEFAULT_PITWALL_CONFIG: PitwallConfig = {
  theme: "lovely-dark",
  customAccent: "",
  fontScale: "md",
  density: "normal",
  splitPct: 62,
  pitLossSec: 34,
  rightOrder: [...DEFAULT_RIGHT_ORDER],
  pinnedIds: [],
  locked: false,
  zenMode: false,
  autoDirector: {
    enabled: false,
    category: "ALL",
    intervalSec: 22,
  },
  units: {
    pressure: "psi",
    temp: "c",
    speed: "kmh",
  },
  columns: {
    diff: true,
    cls: true,
    driver: true,
    pit: true,
    ve: true,
    lap: true,
    gap: true,
    interval: true,
    bestLap: true,
    lastLap: true,
    sectors: true,
  },
  modules: {
    header: true,
    flagBanners: true,
    leaderboard: true,
    pinnedStrip: true,
    relativeBar: true,
    bottomTelemetry: true,
    trackmap: true,
    weather: true,
    raceControl: true,
    battleCard: true,
    trafficRadar: true,
    penalties: true,
    stintTimeline: true,
    pitRejoin: true,
    telemetryPedals: true,
    tyres: true,
    tyreHistory: true,
    damage: true,
    fuelStrategy: true,
  },
};

export interface PitwallPreset {
  id: string;
  label: string;
  icon: string;
  desc: string;
  viewMode: PitwallViewMode;
  patch: Partial<PitwallConfig>;
}

export const PITWALL_PRESETS: PitwallPreset[] = [
  {
    id: "engineer",
    label: "Ingeniero de Estrategia",
    icon: "🧠",
    desc: "Modo Ingeniero, VE/Stint, Pit Rejoin, Race Control y Duelo Directo",
    viewMode: "engineer",
    patch: {
      theme: "wec-official",
      density: "compact",
      splitPct: 60,
      columns: {
        diff: true,
        cls: true,
        driver: true,
        pit: true,
        ve: true,
        lap: true,
        gap: true,
        interval: true,
        bestLap: true,
        lastLap: true,
        sectors: true,
      },
      modules: {
        ...DEFAULT_PITWALL_CONFIG.modules,
        raceControl: true,
        battleCard: true,
        pitRejoin: true,
        pinnedStrip: true,
      },
    },
  },
  {
    id: "broadcast",
    label: "Director Broadcast TV",
    icon: "📺",
    desc: "Torre limpia estilo TV WEC, mapa grande, banners de banderas y feed",
    viewMode: "lovely",
    patch: {
      theme: "mdt-racing",
      density: "normal",
      splitPct: 66,
      columns: {
        diff: true,
        cls: true,
        driver: true,
        pit: true,
        ve: true,
        lap: false,
        gap: true,
        interval: true,
        bestLap: true,
        lastLap: false,
        sectors: false,
      },
      modules: {
        ...DEFAULT_PITWALL_CONFIG.modules,
        tyreHistory: false,
        damage: false,
        raceControl: true,
        battleCard: true,
      },
    },
  },
  {
    id: "night-oled",
    label: "Resistencia Nocturno (OLED)",
    icon: "🌙",
    desc: "Negro absoluto para no deslumbrar de noche en stints de resistencia",
    viewMode: "lovely",
    patch: {
      theme: "stealth-oled",
      density: "normal",
      splitPct: 62,
      modules: {
        ...DEFAULT_PITWALL_CONFIG.modules,
      },
    },
  },
  {
    id: "tablet-10",
    label: "Compacto Tablet 10\"",
    icon: "📱",
    desc: "Dashboard táctil completo sin scroll para tablets de 10 pulgadas",
    viewMode: "tablet",
    patch: {
      theme: "lovely-dark",
      density: "spacious",
      fontScale: "md",
    },
  },
];
