import { lapTime, speed, temp } from "./format";
import type { Snapshot } from "./types";
import type { Units } from "./config.svelte";

export type DashElementType =
  | "text"
  | "bar"
  | "radial"
  | "needle"
  | "leds"
  | "delta"
  | "icon"
  | "trace"
  | "tyreblock"
  | "minimap"
  | "miniradar"
  | "gmeter"
  | "steering"
  | "relatives"
  | "sectors"
  | "rect"
  | "indicator"
  | "image";

export type MotorsportIconId =
  | "headlights"
  | "wipers"
  | "rain"
  | "fuel"
  | "battery"
  | "engine"
  | "tyre"
  | "brake"
  | "tc"
  | "flag"
  | "pit"
  | "temp"
  | "bolt"
  | "warning";

export const MOTORSPORT_ICONS: { id: MotorsportIconId; label: string; defaultBinding: string; activeColor: string }[] = [
  { id: "headlights", label: "Luces", defaultBinding: "headlights", activeColor: "#38bdf8" },
  { id: "wipers", label: "Limpias", defaultBinding: "wipers", activeColor: "#22d3ee" },
  { id: "rain", label: "Lluvia", defaultBinding: "raining", activeColor: "#60a5fa" },
  { id: "fuel", label: "Fuel", defaultBinding: "fuelPct", activeColor: "#f59e0b" },
  { id: "battery", label: "Batería", defaultBinding: "batteryPct", activeColor: "#22c55e" },
  { id: "bolt", label: "Energía", defaultBinding: "virtualEnergyPct", activeColor: "#22d3ee" },
  { id: "engine", label: "Motor", defaultBinding: "waterTemp", activeColor: "#ef4444" },
  { id: "tyre", label: "Rueda", defaultBinding: "tyreTempFL", activeColor: "#f97316" },
  { id: "brake", label: "Freno/ABS", defaultBinding: "absActive", activeColor: "#ef4444" },
  { id: "tc", label: "TC", defaultBinding: "tcActive", activeColor: "#facc15" },
  { id: "flag", label: "Bandera", defaultBinding: "yellowFlag", activeColor: "#facc15" },
  { id: "pit", label: "Pit Lim", defaultBinding: "speedLimiter", activeColor: "#eab308" },
  { id: "temp", label: "Temp.", defaultBinding: "oilTemp", activeColor: "#f97316" },
  { id: "warning", label: "Alerta", defaultBinding: "yellowFlag", activeColor: "#ef4444" },
];

export type ConditionOp = ">" | ">=" | "<" | "<=" | "==" | "!=";

export interface DashCondition {
  enabled: boolean;
  binding: string;
  op: ConditionOp;
  value: number;
}

export interface DashColorStop {
  threshold: number;
  color: string;
  blink?: boolean;
}

export interface DashColorRule {
  enabled: boolean;
  binding: string;
  highThreshold?: number;
  highColor?: string;
  lowThreshold?: number;
  lowColor?: string;
  blinkOnTrigger?: boolean;
  /** Optional multi-stop traffic-light rules (evaluated from highest threshold down) */
  stops?: DashColorStop[];
}

export interface DashElement {
  id: string;
  name: string;
  type: DashElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Optional group ID to move/select multiple layers together */
  groupId?: string;
  /** Optional custom name for the group */
  groupName?: string;

  // Special widget options (G-Meter, Relatives, Tyres, Track Map)
  gMax?: number;
  relativesCount?: number;
  showTyreWear?: boolean;
  showBrakeTemp?: boolean;
  showTyrePress?: boolean;
  showCompound?: boolean;
  showClassColors?: boolean;
  showTrackFrame?: boolean;

  // Advanced transform & visual effects
  rotation?: number;
  skewX?: number;
  rotateX?: number;
  rotateY?: number;
  style3d?: "none" | "emboss" | "bevel" | "extrude" | "glass3d";
  animEffect?: "none" | "gear-pop" | "value-pulse" | "breathe" | "neon-pulse";
  clipShape?: "none" | "chamfer" | "slant-right" | "slant-left" | "chevron";
  gradientTo?: string;
  gradientAngle?: number;
  backdropBlur?: number;
  glowColor?: string;
  glowSize?: number;
  shadowColor?: string;
  shadowBlur?: number;

  // Data binding & optional custom arithmetic formula
  binding?: string;
  customFormula?: string;
  staticText?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;

  // Typography (for text / indicator)
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: "display" | "mono" | "sans" | "digital" | "f1" | "retro";
  italic?: boolean;
  uppercase?: boolean;
  letterSpacing?: number;
  textShadowColor?: string;
  textShadowBlur?: number;
  textAlign?: "left" | "center" | "right";
  color?: string;

  // Box / Shape styling
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderRadius?: number;

  // Bar / Radial / Needle Gauge
  min?: number;
  max?: number;
  fillColor?: string;
  trackColor?: string;
  orientation?: "horizontal" | "vertical";
  segments?: number;
  strokeWidth?: number;
  needleStartAngle?: number;
  needleEndAngle?: number;
  needleRedlinePct?: number;

  // RPM LED Strip / RPM Bar modes
  ledMode?: "standard" | "convergent" | "dual-bar" | "classic-bar";
  ledCount?: number;
  ledShape?: "circle" | "bar";
  ledGreenColor?: string;
  ledYellowColor?: string;
  ledRedColor?: string;
  ledFlashPct?: number;
  rpmScaleMax?: number;

  // Dedicated Delta bar options
  deltaStyle?: "hypercar-bar" | "split-bar" | "compact";
  deltaRange?: number;

  // Motorsport SVG Icon
  iconId?: MotorsportIconId;

  // Indicator active state
  activeBgColor?: string;
  activeTextColor?: string;
  activeBlink?: boolean;

  // Image
  imageUrl?: string;
  objectFit?: "contain" | "cover";

  // Conditional Visibility & Color Rules
  visibilityRule?: DashCondition;
  colorRule?: DashColorRule;
}

export interface DashPage {
  id: string;
  name: string;
  elements: DashElement[];
}

export interface CustomDashboard {
  id: string;
  name: string;
  width: number;
  height: number;
  bgColor: string;
  bgGradientTo?: string;
  bgGradientAngle?: number;
  bgPattern?: "none" | "carbon" | "grid" | "scanlines" | "brushed" | "dots";
  bgImageUrl?: string;
  bgImageOpacity?: number;
  bgOpacity: number;
  borderRadius: number;
  borderColor: string;
  borderWidth?: number;
  frameShadow?: "none" | "soft" | "deep" | "bezel";
  accentGlowColor?: string;
  accentGlowSize?: number;
  /** 3D Cockpit Perspective & Tilt */
  perspective3d?: number;
  tiltX?: number;
  tiltY?: number;
  /** Automatic steering-wheel pop-ups when TC/ABS/BB/Map/ARB/Mig/PitLimiter/Flags change */
  autoPopups?: boolean;
  popupAnimation?: "zoom" | "slide-up" | "flip3d" | "glitch" | "banner";
  bootAnimation?: "none" | "ignition-sweep" | "cascade" | "cyber-scan" | "matrix-build" | "gt3-boot";
  shiftFlashEnabled?: boolean;
  gearAnimEnabled?: boolean;
  /** Left & right vertical LED strips on the dashboard frame for Spotter / Flags / Shift alerts */
  sideLedsEnabled?: boolean;
  /** Comma-separated keywords to auto-activate this dashboard for matching cars/classes (e.g. "963, Porsche") */
  autoCarMatch?: string;
  /** Optional keyboard key (e.g. "PageDown") to cycle dashboard pages in-game */
  pageCycleKey?: string;
  /** Optional steering wheel / gamepad button index to cycle dashboard pages in-game */
  pageCycleGamepadBtn?: number | null;
  /** Legacy single-page elements (mirrored with pages[0].elements for compatibility) */
  elements: DashElement[];
  /** Multi-page screens (Carrera, Qualy, Estrategia, etc.) */
  pages?: DashPage[];
}

export interface SimOverrides {
  enabled: boolean;
  rpmPct: number;
  speed: number;
  gear: number;
  throttlePct: number;
  brakePct: number;
  fuelPct: number;
  deltaBest: number;
  speedLimiter: boolean;
  tcActive: boolean;
  absActive: boolean;
  yellowFlag: boolean;
}

export const DEFAULT_SIM_OVERRIDES: SimOverrides = {
  enabled: false,
  rpmPct: 76,
  speed: 242,
  gear: 5,
  throttlePct: 88,
  brakePct: 0,
  fuelPct: 54,
  deltaBest: -0.24,
  speedLimiter: false,
  tcActive: false,
  absActive: false,
  yellowFlag: false,
};

export function ensureDashPages(dash: CustomDashboard): DashPage[] {
  if (!dash.pages || dash.pages.length === 0) {
    dash.pages = [{ id: uid("page"), name: "Carrera", elements: dash.elements ?? [] }];
  }
  return dash.pages;
}

export interface TelemetryBindingDef {
  id: string;
  label: string;
  category: "Motor" | "Pedales" | "Tiempos" | "Energía" | "Neumáticos" | "Frenos" | "Electrónica" | "Estado" | "Sesión";
  kind: "number" | "string" | "boolean";
  defaultMin?: number;
  defaultMax?: number;
  defaultDecimals?: number;
}

export const TELEMETRY_BINDINGS: TelemetryBindingDef[] = [
  { id: "none", label: "— Texto estático (sin vínculo) —", category: "Motor", kind: "string" },
  { id: "gear", label: "Marcha (R, N, 1..8)", category: "Motor", kind: "string" },
  { id: "speed", label: "Velocidad (km/h o mph)", category: "Motor", kind: "number", defaultMin: 0, defaultMax: 340, defaultDecimals: 0 },
  { id: "rpm", label: "RPM actuales", category: "Motor", kind: "number", defaultMin: 0, defaultMax: 9000, defaultDecimals: 0 },
  { id: "rpmPct", label: "RPM (%)", category: "Motor", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },

  { id: "throttlePct", label: "Acelerador (%)", category: "Pedales", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "brakePct", label: "Freno (%)", category: "Pedales", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "clutchPct", label: "Embrague (%)", category: "Pedales", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },

  { id: "deltaBest", label: "Delta vs Mejor (s)", category: "Tiempos", kind: "number", defaultMin: -2, defaultMax: 2, defaultDecimals: 2 },
  { id: "lapNumber", label: "Vuelta actual", category: "Tiempos", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "currentLap", label: "Tiempo vuelta actual", category: "Tiempos", kind: "string" },
  { id: "predictedLap", label: "Vuelta predicha", category: "Tiempos", kind: "string" },
  { id: "lastLap", label: "Última vuelta (mm:ss.mmm)", category: "Tiempos", kind: "string" },
  { id: "bestLap", label: "Mejor vuelta (mm:ss.mmm)", category: "Tiempos", kind: "string" },
  { id: "place", label: "Posición General", category: "Tiempos", kind: "number", defaultMin: 1, defaultMax: 40, defaultDecimals: 0 },
  { id: "classPlace", label: "Posición en Categoría", category: "Tiempos", kind: "number", defaultMin: 1, defaultMax: 40, defaultDecimals: 0 },

  { id: "fuel", label: "Combustible (L / gal)", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 1 },
  { id: "fuelPerLap", label: "Consumo Combustible / Vuelta", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 10, defaultDecimals: 2 },
  { id: "fuelPct", label: "Combustible (%)", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "virtualEnergyPct", label: "Energía Virtual (%)", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 1 },
  { id: "vePerLap", label: "Energía Virtual / Vuelta (%)", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 20, defaultDecimals: 2 },
  { id: "lapsOfVe", label: "Vueltas de Energía Virtual", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 50, defaultDecimals: 1 },
  { id: "batteryPct", label: "Batería Híbrida / SOC (%)", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "regenKw", label: "Regeneración ERS (kW)", category: "Energía", kind: "number", defaultMin: 0, defaultMax: 200, defaultDecimals: 0 },

  { id: "tyreTempFL", label: "Temp. Goma FL", category: "Neumáticos", kind: "number", defaultMin: 30, defaultMax: 120, defaultDecimals: 0 },
  { id: "tyreTempFR", label: "Temp. Goma FR", category: "Neumáticos", kind: "number", defaultMin: 30, defaultMax: 120, defaultDecimals: 0 },
  { id: "tyreTempRL", label: "Temp. Goma RL", category: "Neumáticos", kind: "number", defaultMin: 30, defaultMax: 120, defaultDecimals: 0 },
  { id: "tyreTempRR", label: "Temp. Goma RR", category: "Neumáticos", kind: "number", defaultMin: 30, defaultMax: 120, defaultDecimals: 0 },
  { id: "tyreWearFL", label: "Vida Goma FL (%)", category: "Neumáticos", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "tyreWearFR", label: "Vida Goma FR (%)", category: "Neumáticos", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "tyreWearRL", label: "Vida Goma RL (%)", category: "Neumáticos", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },
  { id: "tyreWearRR", label: "Vida Goma RR (%)", category: "Neumáticos", kind: "number", defaultMin: 0, defaultMax: 100, defaultDecimals: 0 },

  { id: "brakeBias", label: "Reparto de Freno (% F)", category: "Frenos", kind: "number", defaultMin: 40, defaultMax: 70, defaultDecimals: 1 },
  { id: "brakeTempFL", label: "Temp. Disco FL", category: "Frenos", kind: "number", defaultMin: 100, defaultMax: 900, defaultDecimals: 0 },
  { id: "brakeTempFR", label: "Temp. Disco FR", category: "Frenos", kind: "number", defaultMin: 100, defaultMax: 900, defaultDecimals: 0 },
  { id: "brakeTempRL", label: "Temp. Disco RL", category: "Frenos", kind: "number", defaultMin: 100, defaultMax: 900, defaultDecimals: 0 },
  { id: "brakeTempRR", label: "Temp. Disco RR", category: "Frenos", kind: "number", defaultMin: 100, defaultMax: 900, defaultDecimals: 0 },

  { id: "tc", label: "Control Tracción (TC)", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 12, defaultDecimals: 0 },
  { id: "tcSlip", label: "TC Slip (TCS)", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 12, defaultDecimals: 0 },
  { id: "tcCut", label: "TC Cut (TCC)", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 12, defaultDecimals: 0 },
  { id: "abs", label: "Nivel ABS", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 12, defaultDecimals: 0 },
  { id: "motorMap", label: "Mapa de Motor", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 10, defaultDecimals: 0 },
  { id: "migration", label: "Brake Migration", category: "Electrónica", kind: "number", defaultMin: -5, defaultMax: 5, defaultDecimals: 1 },
  { id: "frontArb", label: "ARB Delantero", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 10, defaultDecimals: 0 },
  { id: "rearArb", label: "ARB Trasero", category: "Electrónica", kind: "number", defaultMin: 0, defaultMax: 10, defaultDecimals: 0 },
  { id: "waterTemp", label: "Temp. Agua", category: "Motor", kind: "number", defaultMin: 40, defaultMax: 130, defaultDecimals: 0 },
  { id: "oilTemp", label: "Temp. Aceite", category: "Motor", kind: "number", defaultMin: 40, defaultMax: 140, defaultDecimals: 0 },
  { id: "trackTemp", label: "Temp. Pista", category: "Sesión", kind: "number", defaultMin: 0, defaultMax: 65, defaultDecimals: 0 },
  { id: "ambientTemp", label: "Temp. Aire", category: "Sesión", kind: "number", defaultMin: 0, defaultMax: 50, defaultDecimals: 0 },

  { id: "speedLimiter", label: "Limitador de Boxes (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "tcActive", label: "TC Interviniendo (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "absActive", label: "ABS Interviniendo (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "yellowFlag", label: "Bandera Amarilla / FCY (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "blueFlag", label: "Bandera Azul (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "inPits", label: "En Boxes (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "headlights", label: "Luces / Faros (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "wipers", label: "Limpiaparabrisas (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },
  { id: "raining", label: "Lluvia en pista (ON/OFF)", category: "Estado", kind: "boolean", defaultMin: 0, defaultMax: 1, defaultDecimals: 0 },

  { id: "driverName", label: "Nombre del Piloto", category: "Sesión", kind: "string" },
  { id: "carNumber", label: "Dorsal del Coche", category: "Sesión", kind: "string" },
  { id: "trackName", label: "Circuito", category: "Sesión", kind: "string" },
];

export interface EvaluatedBinding {
  num: number;
  text: string;
  bool: boolean;
}

/**
 * Safe recursive-descent arithmetic evaluator (no eval/Function).
 * Supports +, -, *, /, parentheses, numbers, and any telemetry binding id (e.g. "fuel / 2.8", "rpmPct * 0.9").
 */
export function evalCustomFormula(
  formula: string,
  snap: Snapshot | null,
  units: Units,
  decimals = 1,
  previewTick = 0,
  sim?: SimOverrides,
): EvaluatedBinding {
  const tokens: string[] = [];
  const re = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[+\-*/()])\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    tokens.push(m[1]);
  }
  let pos = 0;

  const parseExpr = (): number => {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = parseFactor();
      left = op === "*" ? left * right : right !== 0 ? left / right : 0;
    }
    return left;
  };

  const parseFactor = (): number => {
    if (pos >= tokens.length) return 0;
    const tok = tokens[pos];
    if (tok === "-") {
      pos++;
      return -parseFactor();
    }
    if (tok === "+") {
      pos++;
      return parseFactor();
    }
    if (tok === "(") {
      pos++;
      const v = parseExpr();
      if (tokens[pos] === ")") pos++;
      return v;
    }
    pos++;
    const numVal = Number(tok);
    if (!Number.isNaN(numVal)) return numVal;
    return evalTelemetryBinding(snap, tok, units, decimals, previewTick, sim).num;
  };

  const result = parseExpr();
  const safe = Number.isFinite(result) ? result : 0;
  return { num: safe, text: safe.toFixed(decimals), bool: safe > 0 };
}

/** Evaluates any telemetry binding from a live Snapshot (or simulated/manual values in Dash Studio). */
export function evalTelemetryBinding(
  snap: Snapshot | null,
  bindingId: string | undefined,
  units: Units,
  decimals?: number,
  previewTick = 0,
  sim?: SimOverrides,
): EvaluatedBinding {
  if (!bindingId || bindingId === "none") {
    return { num: 0, text: "", bool: false };
  }

  // Manual Studio simulation overrides take priority inside Dash Studio when enabled
  if (sim?.enabled) {
    const fmt = (v: number, d = 0) => v.toFixed(decimals ?? d);
    switch (bindingId) {
      case "gear": return { num: sim.gear, text: sim.gear < 0 ? "R" : sim.gear === 0 ? "N" : String(sim.gear), bool: sim.gear !== 0 };
      case "speed": return { num: sim.speed, text: fmt(sim.speed, 0), bool: sim.speed > 1 };
      case "rpm": { const r = Math.round(1500 + (sim.rpmPct / 100) * 7500); return { num: r, text: String(r), bool: true }; }
      case "rpmPct": return { num: sim.rpmPct, text: fmt(sim.rpmPct, 0), bool: true };
      case "throttlePct": return { num: sim.throttlePct, text: fmt(sim.throttlePct, 0), bool: sim.throttlePct > 1 };
      case "brakePct": return { num: sim.brakePct, text: fmt(sim.brakePct, 0), bool: sim.brakePct > 1 };
      case "fuelPct": return { num: sim.fuelPct, text: fmt(sim.fuelPct, 0), bool: sim.fuelPct > 0 };
      case "fuel": { const f = sim.fuelPct * 0.85; return { num: f, text: fmt(f, 1), bool: f > 0 }; }
      case "deltaBest": { const s = sim.deltaBest > 0 ? "+" : ""; return { num: sim.deltaBest, text: `${s}${fmt(sim.deltaBest, 2)}`, bool: sim.deltaBest < 0 }; }
      case "speedLimiter": return { num: sim.speedLimiter ? 1 : 0, text: sim.speedLimiter ? "ON" : "OFF", bool: sim.speedLimiter };
      case "tcActive": return { num: sim.tcActive ? 1 : 0, text: sim.tcActive ? "ON" : "OFF", bool: sim.tcActive };
      case "absActive": return { num: sim.absActive ? 1 : 0, text: sim.absActive ? "ON" : "OFF", bool: sim.absActive };
      case "yellowFlag": return { num: sim.yellowFlag ? 1 : 0, text: sim.yellowFlag ? "YELLOW" : "CLEAR", bool: sim.yellowFlag };
    }
  }

  const p = snap?.player;
  const me = snap?.vehicles?.find((v) =>
    snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
  );

  if (!p) {
    const wave = (Math.sin(previewTick * 0.08) + 1) / 2;
    const rpmPct = 55 + wave * 38;
    const sp = 185 + wave * 92;
    const demoMap: Record<string, EvaluatedBinding> = {
      gear: { num: 4, text: "4", bool: true },
      speed: { num: sp, text: String(Math.round(sp)), bool: true },
      rpm: { num: 5200 + wave * 3100, text: String(Math.round(5200 + wave * 3100)), bool: true },
      rpmPct: { num: rpmPct, text: String(Math.round(rpmPct)), bool: true },
      throttlePct: { num: Math.round(40 + wave * 60), text: String(Math.round(40 + wave * 60)), bool: true },
      brakePct: { num: Math.round((1 - wave) * 35), text: String(Math.round((1 - wave) * 35)), bool: false },
      clutchPct: { num: 0, text: "0", bool: false },
      deltaBest: { num: -0.24, text: "-0.24", bool: false },
      lapNumber: { num: 12, text: "12", bool: true },
      currentLap: { num: 86.456, text: "1:26.456", bool: true },
      predictedLap: { num: 86.216, text: "1:26.216", bool: true },
      lastLap: { num: 118.42, text: "1:58.420", bool: true },
      bestLap: { num: 118.18, text: "1:58.180", bool: true },
      place: { num: 3, text: "3", bool: true },
      classPlace: { num: 2, text: "2", bool: true },
      fuel: { num: 46.5, text: "46.5", bool: true },
      fuelPerLap: { num: 2.36, text: "2.36", bool: true },
      fuelPct: { num: 58, text: "58", bool: true },
      virtualEnergyPct: { num: 64.2, text: "64.2", bool: true },
      vePerLap: { num: 6.42, text: "6.42", bool: true },
      lapsOfVe: { num: 14.7, text: "14.7", bool: true },
      batteryPct: { num: 94, text: "94", bool: true },
      regenKw: { num: 150, text: "150", bool: true },
      tcSlip: { num: 8, text: "8", bool: true },
      tcCut: { num: 6, text: "6", bool: true },
      migration: { num: 1.5, text: "1.5", bool: true },
      frontArb: { num: 2, text: "2", bool: true },
      rearArb: { num: 3, text: "3", bool: true },
      waterTemp: { num: 89, text: "89", bool: true },
      oilTemp: { num: 96, text: "96", bool: true },
      trackTemp: { num: 35, text: "35", bool: true },
      ambientTemp: { num: 28, text: "28", bool: true },
      tyreTempFL: { num: 86, text: "86", bool: true },
      tyreTempFR: { num: 88, text: "88", bool: true },
      tyreTempRL: { num: 82, text: "82", bool: true },
      tyreTempRR: { num: 84, text: "84", bool: true },
      tyreWearFL: { num: 84, text: "84", bool: true },
      tyreWearFR: { num: 81, text: "81", bool: true },
      tyreWearRL: { num: 87, text: "87", bool: true },
      tyreWearRR: { num: 86, text: "86", bool: true },
      brakeBias: { num: 54.5, text: "54.5", bool: true },
      brakeTempFL: { num: 520, text: "520", bool: true },
      brakeTempFR: { num: 515, text: "515", bool: true },
      brakeTempRL: { num: 440, text: "440", bool: true },
      brakeTempRR: { num: 435, text: "435", bool: true },
      tc: { num: 4, text: "4", bool: true },
      abs: { num: 3, text: "3", bool: true },
      motorMap: { num: 1, text: "1", bool: true },
      speedLimiter: { num: 0, text: "OFF", bool: false },
      tcActive: { num: wave > 0.85 ? 1 : 0, text: wave > 0.85 ? "ON" : "OFF", bool: wave > 0.85 },
      absActive: { num: 0, text: "OFF", bool: false },
      yellowFlag: { num: 0, text: "OFF", bool: false },
      blueFlag: { num: 0, text: "OFF", bool: false },
      headlights: { num: 1, text: "ON", bool: true },
      wipers: { num: 0, text: "OFF", bool: false },
      raining: { num: 0, text: "OFF", bool: false },
      inPits: { num: 0, text: "OFF", bool: false },
      driverName: { num: 0, text: "M. VERSTAPPEN", bool: true },
      carNumber: { num: 1, text: "1", bool: true },
      trackName: { num: 0, text: "Circuit de la Sarthe", bool: true },
    };
    return demoMap[bindingId] ?? { num: 0, text: "–", bool: false };
  }

  const fmtNum = (val: number, defDec = 0) => {
    const d = decimals ?? defDec;
    return Number.isFinite(val) ? val.toFixed(d) : "–";
  };

  switch (bindingId) {
    case "gear": {
      const g = p.gear;
      return { num: g, text: g < 0 ? "R" : g === 0 ? "N" : String(g), bool: g !== 0 };
    }
    case "speed": {
      const v = speed(p.speed, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 1 };
    }
    case "rpm":
      return { num: p.rpm, text: fmtNum(p.rpm, 0), bool: p.rpm > 0 };
    case "rpmPct": {
      const pct = p.maxRpm > 0 ? Math.min(100, Math.max(0, (p.rpm / p.maxRpm) * 100)) : 0;
      return { num: pct, text: fmtNum(pct, 0), bool: pct > 0 };
    }
    case "throttlePct": {
      const v = p.throttle * 100;
      return { num: v, text: fmtNum(v, 0), bool: v > 2 };
    }
    case "brakePct": {
      const v = p.brake * 100;
      return { num: v, text: fmtNum(v, 0), bool: v > 2 };
    }
    case "clutchPct": {
      const v = p.clutch * 100;
      return { num: v, text: fmtNum(v, 0), bool: v > 2 };
    }
    case "deltaBest": {
      const d = snap?.timing?.deltaPb ?? p.deltaBest ?? 0;
      const sign = d > 0 ? "+" : "";
      return { num: d, text: `${sign}${fmtNum(d, 2)}`, bool: d < 0 };
    }
    case "lapNumber":
      return { num: p.lapNumber, text: String(p.lapNumber), bool: p.lapNumber > 0 };
    case "lastLap":
      return { num: me?.lastLap ?? 0, text: lapTime(me?.lastLap ?? 0), bool: (me?.lastLap ?? 0) > 0 };
    case "bestLap":
      return { num: me?.bestLap ?? 0, text: lapTime(me?.bestLap ?? 0), bool: (me?.bestLap ?? 0) > 0 };
    case "place":
      return { num: me?.place ?? 0, text: me ? String(me.place) : "–", bool: Boolean(me) };
    case "classPlace":
      return { num: me?.classPlace ?? 0, text: me ? String(me.classPlace) : "–", bool: Boolean(me) };
    case "fuel": {
      const v = units === "imperial" ? p.fuel * 0.264172 : p.fuel;
      return { num: v, text: fmtNum(v, 1), bool: v > 0 };
    }
    case "fuelPct": {
      const pct = p.fuelCapacity > 0 ? (p.fuel / p.fuelCapacity) * 100 : 0;
      return { num: pct, text: fmtNum(pct, 0), bool: pct > 0 };
    }
    case "virtualEnergyPct": {
      const pct = p.virtualEnergy > 1.01 ? p.virtualEnergy : p.virtualEnergy * 100;
      return { num: pct, text: fmtNum(pct, 1), bool: pct > 0 };
    }
    case "batteryPct": {
      const pct = p.battery > 1.01 ? p.battery : p.battery * 100;
      return { num: pct, text: fmtNum(pct, 0), bool: pct > 0 };
    }
    case "tyreTempFL":
    case "tyreTempFR":
    case "tyreTempRL":
    case "tyreTempRR": {
      const idx = bindingId.endsWith("FL") ? 0 : bindingId.endsWith("FR") ? 1 : bindingId.endsWith("RL") ? 2 : 3;
      const w = p.wheels?.[idx];
      const avg = w ? (w.surfaceTemp[0] + w.surfaceTemp[1] + w.surfaceTemp[2]) / 3 : 0;
      const v = temp(avg, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "tyreWearFL":
    case "tyreWearFR":
    case "tyreWearRL":
    case "tyreWearRR": {
      const idx = bindingId.endsWith("FL") ? 0 : bindingId.endsWith("FR") ? 1 : bindingId.endsWith("RL") ? 2 : 3;
      const v = (p.wheels?.[idx]?.wear ?? 0) * 100;
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "brakeBias": {
      const v = p.brakeBiasFront > 1 ? p.brakeBiasFront : p.brakeBiasFront * 100;
      return { num: v, text: fmtNum(v, 1), bool: true };
    }
    case "brakeTempFL":
    case "brakeTempFR":
    case "brakeTempRL":
    case "brakeTempRR": {
      const idx = bindingId.endsWith("FL") ? 0 : bindingId.endsWith("FR") ? 1 : bindingId.endsWith("RL") ? 2 : 3;
      const v = temp(p.wheels?.[idx]?.brakeTemp ?? 0, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "tc":
      return { num: p.tc, text: String(p.tc), bool: p.tc > 0 };
    case "tcSlip":
      return { num: p.tcSlip, text: String(p.tcSlip), bool: p.tcSlip > 0 };
    case "tcCut":
      return { num: p.tcCut, text: String(p.tcCut), bool: p.tcCut > 0 };
    case "abs":
      return { num: p.abs, text: String(p.abs), bool: p.abs > 0 };
    case "motorMap":
      return { num: p.motorMap, text: String(p.motorMap), bool: p.motorMap > 0 };
    case "migration":
      return { num: p.migration, text: fmtNum(p.migration, 1), bool: p.migration !== 0 };
    case "frontArb":
      return { num: p.frontArb, text: String(p.frontArb), bool: p.frontArb > 0 };
    case "rearArb":
      return { num: p.rearArb, text: String(p.rearArb), bool: p.rearArb > 0 };
    case "regenKw":
      return { num: p.regenKw, text: fmtNum(p.regenKw, 0), bool: p.regenKw > 0 };
    case "waterTemp": {
      const v = temp(p.waterTemp, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "oilTemp": {
      const v = temp(p.oilTemp, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "trackTemp": {
      const v = temp(snap?.session?.weather?.trackTemp ?? 0, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "ambientTemp": {
      const v = temp(snap?.session?.weather?.ambientTemp ?? 0, units);
      return { num: v, text: fmtNum(v, 0), bool: v > 0 };
    }
    case "currentLap":
      return { num: snap?.timing?.currentLapTime ?? 0, text: lapTime(snap?.timing?.currentLapTime ?? 0), bool: true };
    case "predictedLap":
      return { num: snap?.timing?.predictedLap ?? 0, text: lapTime(snap?.timing?.predictedLap ?? 0), bool: (snap?.timing?.predictedLap ?? 0) > 0 };
    case "fuelPerLap": {
      const v = snap?.strategy?.fuelPerLap ?? 0;
      const val = units === "imperial" ? v * 0.264172 : v;
      return { num: val, text: fmtNum(val, 2), bool: val > 0 };
    }
    case "vePerLap": {
      const v = (snap?.strategy?.vePerLap ?? 0) * 100;
      return { num: v, text: fmtNum(v, 2), bool: v > 0 };
    }
    case "lapsOfVe": {
      const v = snap?.strategy?.lapsOfVe ?? 0;
      return { num: v, text: fmtNum(v, 1), bool: v > 0 };
    }
    case "speedLimiter":
      return { num: p.speedLimiter ? 1 : 0, text: p.speedLimiter ? "ON" : "OFF", bool: p.speedLimiter };
    case "tcActive":
      return { num: p.tcActive ? 1 : 0, text: p.tcActive ? "ON" : "OFF", bool: p.tcActive };
    case "absActive":
      return { num: p.absActive ? 1 : 0, text: p.absActive ? "ON" : "OFF", bool: p.absActive };
    case "yellowFlag": {
      const on = Boolean(snap?.session && (snap.session.phase === 6 || snap.session.yellowFlagState > 0 || (me && snap.session.sectorYellow[me.sector - 1])));
      return { num: on ? 1 : 0, text: on ? "YELLOW" : "CLEAR", bool: on };
    }
    case "blueFlag": {
      const on = me?.flag === 6;
      return { num: on ? 1 : 0, text: on ? "BLUE" : "CLEAR", bool: on };
    }
    case "inPits":
      return { num: p.inPits ? 1 : 0, text: p.inPits ? "PIT" : "TRACK", bool: p.inPits };
    case "headlights":
      return { num: p.headlights ? 1 : 0, text: p.headlights ? "ON" : "OFF", bool: p.headlights };
    case "wipers":
      return { num: p.wipers > 0 ? 1 : 0, text: p.wipers > 0 ? "ON" : "OFF", bool: p.wipers > 0 };
    case "raining": {
      const r = (snap?.session?.weather?.raining ?? 0) > 0.05;
      return { num: r ? 1 : 0, text: r ? "WET" : "DRY", bool: r };
    }
    case "driverName":
      return { num: 0, text: me?.driver || snap?.session?.playerName || "PILOTO", bool: true };
    case "carNumber":
      return { num: Number(me?.number) || 0, text: me?.number || "1", bool: true };
    case "trackName":
      return { num: 0, text: snap?.session?.track || "Circuito", bool: true };
    default:
      return { num: 0, text: "–", bool: false };
  }
}

export function evalCondition(val: number, op: ConditionOp, target: number): boolean {
  switch (op) {
    case ">": return val > target;
    case ">=": return val >= target;
    case "<": return val < target;
    case "<=": return val <= target;
    case "==": return Math.abs(val - target) < 0.001;
    case "!=": return Math.abs(val - target) >= 0.001;
  }
}

export function uid(prefix = "el"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultElement(type: DashElementType, x = 40, y = 40): DashElement {
  const names: Record<DashElementType, string> = {
    text: "Dato / Texto",
    bar: "Barra de Progreso",
    radial: "Medidor Circular",
    needle: "Tacómetro Aguja",
    leds: "Barra / LEDs RPM",
    delta: "Barra Delta",
    icon: "Icono Motorsport",
    trace: "Gráfica Pedales",
    tyreblock: "Bloque 4 Ruedas",
    minimap: "Mapa del Circuito",
    miniradar: "Mini-Radar",
    gmeter: "Medidor Fuerzas G",
    steering: "Volante / Ángulo",
    relatives: "Mini Relatives",
    sectors: "Sectores S1/S2/S3",
    rect: "Panel / Caja",
    indicator: "Indicador Estado",
    image: "Imagen / Logo",
  };
  const base: DashElement = {
    id: uid(type),
    name: names[type],
    type,
    x,
    y,
    w: 160,
    h: 48,
    opacity: 1,
    visible: true,
    locked: false,
    rotation: 0,
  };

  if (type === "text") {
    return {
      ...base,
      binding: "speed",
      staticText: "TEXTO",
      prefix: "",
      suffix: " km/h",
      decimals: 0,
      fontSize: 34,
      fontWeight: 900,
      fontFamily: "display",
      textAlign: "center",
      color: "#ffffff",
      bgColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 6,
    };
  }
  if (type === "bar") {
    return {
      ...base,
      w: 220,
      h: 20,
      binding: "throttlePct",
      min: 0,
      max: 100,
      fillColor: "#22c55e",
      trackColor: "rgba(255,255,255,0.12)",
      orientation: "horizontal",
      borderRadius: 6,
    };
  }
  if (type === "radial") {
    return {
      ...base,
      w: 110,
      h: 110,
      binding: "virtualEnergyPct",
      min: 0,
      max: 100,
      fillColor: "#22d3ee",
      trackColor: "rgba(255,255,255,0.12)",
      strokeWidth: 10,
      color: "#ffffff",
      fontSize: 22,
      suffix: "%",
      decimals: 0,
    };
  }
  if (type === "needle") {
    return {
      ...base,
      w: 168,
      h: 168,
      binding: "rpmPct",
      min: 0,
      max: 100,
      fillColor: "#ef4444",
      trackColor: "rgba(255,255,255,0.14)",
      color: "#ffffff",
      fontSize: 24,
      suffix: "%",
      needleStartAngle: -135,
      needleEndAngle: 135,
      needleRedlinePct: 85,
    };
  }
  if (type === "leds") {
    return {
      ...base,
      w: 440,
      h: 28,
      binding: "rpmPct",
      ledMode: "standard",
      ledCount: 15,
      ledShape: "circle",
      ledGreenColor: "#22c55e",
      ledYellowColor: "#facc15",
      ledRedColor: "#ef4444",
      ledFlashPct: 95,
      rpmScaleMax: 8,
    };
  }
  if (type === "delta") {
    return {
      ...base,
      w: 520,
      h: 44,
      binding: "deltaBest",
      deltaStyle: "hypercar-bar",
      deltaRange: 2.0,
      bgColor: "rgba(0,0,0,0.45)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 6,
    };
  }
  if (type === "icon") {
    return {
      ...base,
      w: 44,
      h: 44,
      iconId: "headlights",
      binding: "headlights",
      color: "rgba(255,255,255,0.22)",
      activeTextColor: "#38bdf8",
      activeBlink: false,
      bgColor: "transparent",
      borderWidth: 0,
      borderRadius: 8,
    };
  }
  if (type === "trace") {
    return {
      ...base,
      w: 220,
      h: 72,
      bgColor: "rgba(0,0,0,0.45)",
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderRadius: 8,
    };
  }
  if (type === "tyreblock") {
    return {
      ...base,
      w: 176,
      h: 132,
      bgColor: "rgba(0,0,0,0.45)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 10,
      showTyreWear: true,
      showBrakeTemp: true,
      showTyrePress: false,
      showCompound: true,
    };
  }
  if (type === "minimap") {
    return {
      ...base,
      w: 160,
      h: 160,
      bgColor: "rgba(0,0,0,0.35)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 12,
      showClassColors: true,
      showTrackFrame: false,
    };
  }
  if (type === "gmeter") {
    return {
      ...base,
      w: 116,
      h: 116,
      gMax: 3,
      fillColor: "#22d3ee",
      bgColor: "rgba(0,0,0,0.45)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 12,
    };
  }
  if (type === "steering") {
    return {
      ...base,
      w: 100,
      h: 100,
      fillColor: "#facc15",
      color: "#ffffff",
      bgColor: "rgba(0,0,0,0.40)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 12,
    };
  }
  if (type === "relatives") {
    return {
      ...base,
      w: 256,
      h: 122,
      relativesCount: 2,
      bgColor: "rgba(0,0,0,0.50)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 10,
    };
  }
  if (type === "sectors") {
    return {
      ...base,
      w: 244,
      h: 54,
      bgColor: "rgba(0,0,0,0.50)",
      borderColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderRadius: 10,
    };
  }
  if (type === "miniradar") {
    return {
      ...base,
      w: 168,
      h: 168,
      borderRadius: 10,
    };
  }
  if (type === "rect") {
    return {
      ...base,
      w: 200,
      h: 100,
      bgColor: "#0c192c",
      borderColor: "rgba(34,135,236,0.5)",
      borderWidth: 1,
      borderRadius: 10,
    };
  }
  if (type === "indicator") {
    return {
      ...base,
      w: 110,
      h: 32,
      binding: "speedLimiter",
      staticText: "PIT LIMITER",
      fontSize: 13,
      fontWeight: 900,
      fontFamily: "display",
      color: "rgba(255,255,255,0.35)",
      bgColor: "rgba(255,255,255,0.06)",
      activeBgColor: "#eab308",
      activeTextColor: "#000000",
      activeBlink: true,
      borderRadius: 6,
    };
  }
  return {
    ...base,
    w: 96,
    h: 56,
    imageUrl: "/mdt-logo.png",
    objectFit: "contain",
  };
}

export type DashTemplateId =
  | "cadillac-vseries"
  | "toyota-gr010"
  | "hypercar-endurance"
  | "aston-vantage-gt3"
  | "bosch-ddu-s2"
  | "gt3-pro"
  | "hypercar-wec"
  | "porsche-963"
  | "ferrari-499p"
  | "bmw-m4-gt3"
  | "f1-halo"
  | "broadcast-strip"
  | "blank";

export function createTemplateDashboard(template: DashTemplateId): CustomDashboard {
  const wrap = (dash: Omit<CustomDashboard, "pages">, extraPages?: DashPage[]): CustomDashboard => {
    const pages: DashPage[] = [
      { id: uid("page"), name: "Carrera", elements: dash.elements },
      ...(extraPages ?? []),
    ];
    return {
      popupAnimation: "zoom",
      shiftFlashEnabled: true,
      gearAnimEnabled: true,
      sideLedsEnabled: true,
      ...dash,
      autoPopups: true,
      pages,
    };
  };

  if (template === "cadillac-vseries") {
    return wrap({
      id: uid("dash"),
      name: "Cadillac V-Series.R Hypercar",
      width: 760,
      height: 440,
      bgColor: "#000000",
      bgOpacity: 0.98,
      borderRadius: 10,
      borderColor: "#334155",
      borderWidth: 2,
      frameShadow: "bezel",
      autoCarMatch: "",
      elements: [
        // Top telemetry strip: DRY | WAT T | OIL T | MGU T || SPEED || ENERGY | E Lst5 | E LAST
        { ...createDefaultElement("rect", 8, 6), name: "Bar Top Left", w: 326, h: 36, bgColor: "#05070c", borderColor: "#312e81", borderWidth: 1, borderRadius: 4 },
        { ...createDefaultElement("text", 12, 10), name: "Compuesto", binding: "none", staticText: "DRY", fontSize: 22, fontWeight: 700, w: 68, h: 28, color: "#ffffff" },
        { ...createDefaultElement("text", 84, 14), name: "Lbl WAT", binding: "none", staticText: "WAT T", fontSize: 10, italic: true, w: 38, h: 20, color: "#94a3b8" },
        { ...createDefaultElement("text", 122, 10), name: "Water", binding: "waterTemp", suffix: "", fontSize: 22, fontFamily: "sans", w: 40, h: 28, color: "#ffffff" },
        { ...createDefaultElement("text", 168, 14), name: "Lbl OIL", binding: "none", staticText: "OIL T", fontSize: 10, italic: true, w: 34, h: 20, color: "#94a3b8" },
        { ...createDefaultElement("text", 202, 10), name: "Oil", binding: "oilTemp", suffix: "", fontSize: 22, fontFamily: "sans", w: 40, h: 28, color: "#ffffff" },
        { ...createDefaultElement("text", 248, 14), name: "Lbl MGU", binding: "none", staticText: "MGU", fontSize: 10, italic: true, w: 34, h: 20, color: "#94a3b8" },
        { ...createDefaultElement("text", 282, 10), name: "MGU", binding: "batteryPct", suffix: "", fontSize: 22, fontFamily: "sans", w: 46, h: 28, color: "#ffffff" },

        { ...createDefaultElement("text", 340, 6), name: "Speed Top", binding: "speed", suffix: "", fontSize: 30, fontFamily: "sans", w: 80, h: 36, color: "#ffffff" },

        { ...createDefaultElement("rect", 426, 6), name: "Bar Top Right", w: 326, h: 36, bgColor: "#05070c", borderColor: "#312e81", borderWidth: 1, borderRadius: 4 },
        { ...createDefaultElement("text", 430, 14), name: "Lbl NRG", binding: "none", staticText: "ENERGY", fontSize: 10, italic: true, w: 54, h: 20, color: "#67e8f9" },
        { ...createDefaultElement("text", 484, 10), name: "VE", binding: "virtualEnergyPct", suffix: "", decimals: 0, fontSize: 24, fontFamily: "sans", w: 42, h: 28, color: "#ffffff" },
        { ...createDefaultElement("text", 534, 14), name: "Lbl E5", binding: "none", staticText: "E/LAP", fontSize: 10, italic: true, w: 42, h: 20, color: "#67e8f9" },
        { ...createDefaultElement("text", 576, 10), name: "E/Lap", binding: "vePerLap", suffix: "", decimals: 2, fontSize: 22, fontFamily: "sans", w: 58, h: 28, color: "#ffffff" },
        { ...createDefaultElement("text", 640, 14), name: "Lbl FL", binding: "none", staticText: "F/LAP", fontSize: 10, italic: true, w: 42, h: 20, color: "#67e8f9" },
        { ...createDefaultElement("text", 682, 10), name: "F/Lap", binding: "fuelPerLap", suffix: "", decimals: 2, fontSize: 22, fontFamily: "sans", w: 62, h: 28, color: "#ffffff" },

        // Left Fuel / Laps / Best Lap Box
        { ...createDefaultElement("rect", 8, 52), name: "Box Fuel", w: 238, h: 248, bgColor: "#000000", borderColor: "#858552", borderWidth: 1, borderRadius: 4 },
        { ...createDefaultElement("text", 14, 58), name: "Lbl LastF", binding: "none", staticText: "LAST", fontSize: 13, italic: true, w: 108, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 14, 76), name: "Fuel/Lap Big", binding: "fuelPerLap", suffix: "", decimals: 2, fontSize: 38, fontFamily: "sans", w: 108, h: 42, color: "#ffffff" },
        { ...createDefaultElement("text", 128, 58), name: "Lbl FLevel", binding: "none", staticText: "F LEVEL", fontSize: 13, italic: true, w: 108, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 128, 76), name: "Fuel Level", binding: "fuel", suffix: "", decimals: 0, fontSize: 38, fontFamily: "sans", w: 108, h: 42, color: "#ffffff" },
        { ...createDefaultElement("text", 14, 134), name: "Lbl EstL", binding: "none", staticText: "EST LAPS", fontSize: 13, italic: true, w: 108, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 14, 152), name: "Est Laps", binding: "lapsOfVe", suffix: "", decimals: 1, fontSize: 38, fontFamily: "sans", w: 108, h: 42, color: "#ffffff" },
        { ...createDefaultElement("text", 128, 134), name: "Lbl Stint", binding: "none", staticText: "LAP", fontSize: 13, italic: true, w: 108, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 128, 152), name: "Stint", binding: "lapNumber", suffix: "", fontSize: 38, fontFamily: "sans", w: 108, h: 42, color: "#ffffff" },
        { ...createDefaultElement("text", 14, 224), name: "Best Lap Purple", binding: "bestLap", suffix: "", fontSize: 40, fontFamily: "sans", w: 224, h: 52, color: "#a855f7" },

        // Left Brake Bias + Bottom MAP / HARV / MULTI
        { ...createDefaultElement("rect", 8, 308), name: "Box BB", w: 238, h: 64, bgColor: "#000000", borderColor: "#fef3c7", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 14, 312), name: "Lbl BB", binding: "none", staticText: "Brake Bias", fontSize: 13, italic: true, w: 226, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 14, 330), name: "BB Val", binding: "brakeBias", suffix: "", decimals: 1, fontSize: 34, fontWeight: 900, fontFamily: "sans", w: 226, h: 38, color: "#ffffff" },

        { ...createDefaultElement("rect", 8, 378), name: "Box MAP", w: 76, h: 54, bgColor: "#000000", borderColor: "#fde68a", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 10, 380), name: "Hdr MAP", binding: "none", staticText: "MAP", fontSize: 12, fontWeight: 900, w: 72, h: 18, color: "#000000", bgColor: "#fde68a" },
        { ...createDefaultElement("text", 10, 400), name: "Val MAP", binding: "motorMap", suffix: "", fontSize: 28, fontWeight: 900, w: 72, h: 28, color: "#ffffff" },

        { ...createDefaultElement("rect", 89, 378), name: "Box HARV", w: 76, h: 54, bgColor: "#000000", borderColor: "#be123c", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 91, 380), name: "Hdr HARV", binding: "none", staticText: "HARV", fontSize: 12, fontWeight: 900, w: 72, h: 18, color: "#000000", bgColor: "#be123c" },
        { ...createDefaultElement("text", 91, 400), name: "Val HARV", binding: "regenKw", suffix: "", fontSize: 26, fontWeight: 900, w: 72, h: 28, color: "#ffffff" },

        { ...createDefaultElement("rect", 170, 378), name: "Box MULTI", w: 76, h: 54, bgColor: "#000000", borderColor: "#16a34a", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 172, 380), name: "Hdr MULTI", binding: "none", staticText: "ABS", fontSize: 12, fontWeight: 900, w: 72, h: 18, color: "#000000", bgColor: "#16a34a" },
        { ...createDefaultElement("text", 172, 400), name: "Val MULTI", binding: "abs", suffix: "", fontSize: 28, fontWeight: 900, w: 72, h: 28, color: "#ffffff" },

        // Center: 4 Brake Temps framing Giant Gear + 4-Wheel Tyre Block below
        { ...createDefaultElement("text", 262, 54), name: "Brake FL", binding: "brakeTempFL", suffix: "", fontSize: 28, fontFamily: "sans", w: 72, h: 32, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 426, 54), name: "Brake FR", binding: "brakeTempFR", suffix: "", fontSize: 28, fontFamily: "sans", w: 72, h: 32, color: "#ffffff", textAlign: "right" },
        { ...createDefaultElement("text", 308, 72), name: "Gear Giant", binding: "gear", suffix: "", fontSize: 144, fontWeight: 700, fontFamily: "sans", w: 144, h: 152, color: "#ffffff", animEffect: "gear-pop" },
        { ...createDefaultElement("text", 262, 224), name: "Brake RL", binding: "brakeTempRL", suffix: "", fontSize: 28, fontFamily: "sans", w: 72, h: 32, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 426, 224), name: "Brake RR", binding: "brakeTempRR", suffix: "", fontSize: 28, fontFamily: "sans", w: 72, h: 32, color: "#ffffff", textAlign: "right" },
        { ...createDefaultElement("tyreblock", 254, 266), name: "TYRE 4R", w: 252, h: 166, bgColor: "#040814", borderColor: "#64748b", borderWidth: 2, borderRadius: 4, showTyrePress: true, showBrakeTemp: false, showCompound: false, showTyreWear: true },

        // Right: Lap & Delta | Current Lap | Red SoC Banner | ARB+TC | TC L + MIG
        { ...createDefaultElement("rect", 514, 52), name: "Box Right Top", w: 238, h: 146, bgColor: "#000000", borderColor: "#312e81", borderWidth: 1, borderRadius: 4 },
        { ...createDefaultElement("text", 520, 56), name: "Lbl LapR", binding: "none", staticText: "LAP", fontSize: 12, italic: true, w: 60, h: 16, color: "#9ca3af", textAlign: "left" },
        { ...createDefaultElement("text", 520, 74), name: "Lap Num", binding: "lapNumber", suffix: "", fontSize: 36, fontFamily: "sans", w: 64, h: 40, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 590, 56), name: "Lbl DeltaR", binding: "none", staticText: "DELTA", fontSize: 12, italic: true, w: 154, h: 16, color: "#9ca3af", textAlign: "right" },
        { ...createDefaultElement("text", 590, 74), name: "Delta Big", binding: "deltaBest", suffix: "", decimals: 3, fontSize: 38, fontWeight: 900, fontFamily: "sans", w: 154, h: 40, color: "#ffffff", textAlign: "right", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
        { ...createDefaultElement("text", 520, 134), name: "Current Lap", binding: "currentLap", suffix: "", fontSize: 40, fontFamily: "sans", w: 224, h: 48, color: "#ffffff" },

        { ...createDefaultElement("rect", 514, 206), name: "SoC Red Box", w: 238, h: 92, bgColor: "#dc2626", borderColor: "#ef4444", borderWidth: 2, borderRadius: 6, style3d: "bevel" },
        { ...createDefaultElement("text", 522, 224), name: "SoC Val", binding: "batteryPct", prefix: "SoC  ", suffix: "%", decimals: 0, fontSize: 42, fontWeight: 700, fontFamily: "sans", w: 222, h: 56, color: "#ffffff" },

        { ...createDefaultElement("rect", 514, 306), name: "Box ARB/TC", w: 238, h: 66, bgColor: "#000000", borderColor: "#64748b", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 520, 314), name: "ARB F", binding: "frontArb", prefix: "ARB F  ", suffix: "", fontSize: 18, fontWeight: 900, w: 96, h: 24, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 520, 342), name: "ARB R", binding: "rearArb", prefix: "ARB R  ", suffix: "", fontSize: 18, fontWeight: 900, w: 96, h: 24, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 626, 312), name: "Lbl TCS", binding: "none", staticText: "TC S", fontSize: 12, italic: true, w: 54, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 626, 332), name: "Val TCS", binding: "tcSlip", suffix: "", fontSize: 28, fontWeight: 900, w: 54, h: 32, color: "#ffffff" },
        { ...createDefaultElement("text", 686, 312), name: "Lbl TCC", binding: "none", staticText: "TC C", fontSize: 12, italic: true, w: 54, h: 16, color: "#9ca3af" },
        { ...createDefaultElement("text", 686, 332), name: "Val TCC", binding: "tcCut", suffix: "", fontSize: 28, fontWeight: 900, w: 54, h: 32, color: "#ffffff" },

        { ...createDefaultElement("rect", 514, 378), name: "Box TCL", w: 80, h: 54, bgColor: "#000000", borderColor: "#22c55e", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 516, 380), name: "Hdr TCL", binding: "none", staticText: "TC L", fontSize: 12, fontWeight: 900, w: 76, h: 18, color: "#000000", bgColor: "#22c55e" },
        { ...createDefaultElement("text", 516, 400), name: "Val TCL", binding: "tc", suffix: "", fontSize: 28, fontWeight: 900, w: 76, h: 28, color: "#ffffff" },

        { ...createDefaultElement("rect", 600, 378), name: "Box MIG", w: 152, h: 54, bgColor: "#000000", borderColor: "#2563eb", borderWidth: 2, borderRadius: 4 },
        { ...createDefaultElement("text", 602, 380), name: "Hdr MIG", binding: "none", staticText: "MIG", fontSize: 12, fontWeight: 900, w: 148, h: 18, color: "#000000", bgColor: "#2563eb" },
        { ...createDefaultElement("text", 602, 400), name: "Val MIG", binding: "migration", suffix: "% F", decimals: 1, fontSize: 26, fontWeight: 900, w: 148, h: 28, color: "#ffffff" },
      ],
    });
  }

  if (template === "toyota-gr010") {
    return wrap({
      id: uid("dash"),
      name: "Toyota GR010 Gazoo Racing",
      width: 760,
      height: 440,
      bgColor: "#000000",
      bgOpacity: 0.98,
      borderRadius: 10,
      borderColor: "#ffffff",
      borderWidth: 2,
      frameShadow: "deep",
      autoCarMatch: "",
      elements: [
        // Left column: STINT, FUEL, F LAST, F THIS, HY MAP, T ELEC, T OIL, T WATER
        { ...createDefaultElement("rect", 6, 6), name: "Col Left Top", w: 214, h: 190, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 12, 10), name: "Lbl Stint", binding: "none", staticText: "STINT", fontSize: 22, w: 120, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 136, 10), name: "Val Stint", binding: "lapNumber", suffix: "", fontSize: 24, fontWeight: 900, w: 78, h: 26, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 12, 46), name: "Lbl Fuel", binding: "none", staticText: "FUEL", fontSize: 22, w: 110, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 126, 46), name: "Val Fuel", binding: "fuel", suffix: "", decimals: 0, fontSize: 24, w: 88, h: 26, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 12, 80), name: "Lbl FLast", binding: "none", staticText: "F LAST", fontSize: 22, w: 110, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 126, 80), name: "Val FLast", binding: "fuelPerLap", suffix: "", decimals: 2, fontSize: 24, w: 88, h: 26, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 12, 114), name: "Lbl E/Lap", binding: "none", staticText: "E LAP", fontSize: 22, w: 110, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 126, 114), name: "Val E/Lap", binding: "vePerLap", suffix: "", decimals: 2, fontSize: 24, w: 88, h: 26, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 12, 158), name: "Lbl HyMap", binding: "none", staticText: "HY MAP", fontSize: 22, w: 120, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 136, 158), name: "Val HyMap", binding: "motorMap", suffix: "", fontSize: 24, w: 78, h: 26, color: "#fef08a", textAlign: "right" },

        { ...createDefaultElement("rect", 6, 196), name: "Col Left Mid", w: 214, h: 108, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 12, 204), name: "Lbl TElec", binding: "none", staticText: "T ELEC", fontSize: 20, w: 120, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 136, 204), name: "Val TElec", binding: "batteryPct", suffix: "", fontSize: 22, w: 78, h: 26, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 12, 238), name: "Lbl TOil", binding: "none", staticText: "T OIL", fontSize: 20, w: 120, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 136, 238), name: "Val TOil", binding: "oilTemp", suffix: "", fontSize: 22, w: 78, h: 26, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 12, 272), name: "Lbl TWater", binding: "none", staticText: "T WATER", fontSize: 20, w: 126, h: 26, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 142, 272), name: "Val TWater", binding: "waterTemp", suffix: "", fontSize: 22, w: 72, h: 26, color: "#fef08a", textAlign: "right" },

        // Center Top: Yellow Speed + KMH + Giant Italic Gear
        { ...createDefaultElement("rect", 220, 6), name: "Box Center Top", w: 320, h: 190, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 300, 12), name: "Speed GR", binding: "speed", suffix: "", fontSize: 44, fontFamily: "sans", w: 140, h: 46, color: "#fef08a" },
        { ...createDefaultElement("text", 464, 14), name: "KMH", binding: "none", staticText: "KMH", fontSize: 16, w: 66, h: 22, color: "#fef08a", textAlign: "right" },
        { ...createDefaultElement("text", 300, 60), name: "Gear GR", binding: "gear", suffix: "", fontSize: 128, fontWeight: 900, italic: true, fontFamily: "sans", w: 160, h: 128, color: "#ffffff", animEffect: "gear-pop" },

        // Center Mid: 4-Wheel Tyre Temps & Pressures
        { ...createDefaultElement("tyreblock", 220, 196), name: "Tyres GR", w: 320, h: 108, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0, showTyrePress: true, showBrakeTemp: false, showCompound: false, showTyreWear: false },

        // Right Top: Current Lap | SoC Bar | BIAS F | TC LEVEL/SLIP/CUT
        { ...createDefaultElement("rect", 540, 6), name: "Box Right Top", w: 214, h: 190, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 546, 10), name: "Cur Lap GR", binding: "currentLap", suffix: "", fontSize: 30, fontFamily: "sans", w: 202, h: 34, color: "#fef08a" },
        { ...createDefaultElement("bar", 546, 48), name: "SoC Bar", binding: "batteryPct", w: 202, h: 26, fillColor: "#facc15", trackColor: "#111827", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 550, 50), name: "SoC Text", binding: "batteryPct", prefix: "SoC   ", suffix: "%", decimals: 0, fontSize: 20, fontWeight: 900, w: 194, h: 22, color: "#000000" },
        { ...createDefaultElement("text", 546, 82), name: "Lbl BiasF", binding: "none", staticText: "BIAS F", fontSize: 20, w: 96, h: 26, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 642, 82), name: "Val BiasF", binding: "brakeBias", suffix: "", decimals: 1, fontSize: 24, fontWeight: 700, w: 104, h: 26, color: "#22c55e", textAlign: "right" },
        { ...createDefaultElement("text", 546, 114), name: "Lbl TCLvl", binding: "none", staticText: "TC LEVEL", fontSize: 16, w: 120, h: 22, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 674, 114), name: "Val TCLvl", binding: "tc", suffix: "", fontSize: 20, fontWeight: 700, w: 72, h: 22, color: "#22c55e", textAlign: "right" },
        { ...createDefaultElement("text", 546, 140), name: "Lbl TCSlip", binding: "none", staticText: "TC SLIP", fontSize: 16, w: 120, h: 22, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 674, 140), name: "Val TCSlip", binding: "tcSlip", suffix: "", fontSize: 20, fontWeight: 700, w: 72, h: 22, color: "#22c55e", textAlign: "right" },
        { ...createDefaultElement("text", 546, 166), name: "Lbl TCCut", binding: "none", staticText: "TC CUT", fontSize: 16, w: 120, h: 22, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 674, 166), name: "Val TCCut", binding: "tcCut", suffix: "", fontSize: 20, fontWeight: 700, w: 72, h: 22, color: "#22c55e", textAlign: "right" },

        // Right Mid: 4 Brake Temps
        { ...createDefaultElement("rect", 540, 196), name: "Box Brakes GR", w: 214, h: 108, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 548, 208), name: "Brk FL", binding: "brakeTempFL", suffix: "", fontSize: 30, fontFamily: "sans", w: 96, h: 36, color: "#ffffff" },
        { ...createDefaultElement("text", 650, 208), name: "Brk FR", binding: "brakeTempFR", suffix: "", fontSize: 30, fontFamily: "sans", w: 96, h: 36, color: "#ffffff" },
        { ...createDefaultElement("text", 548, 254), name: "Brk RL", binding: "brakeTempRL", suffix: "", fontSize: 30, fontFamily: "sans", w: 96, h: 36, color: "#ffffff" },
        { ...createDefaultElement("text", 650, 254), name: "Brk RR", binding: "brakeTempRR", suffix: "", fontSize: 30, fontFamily: "sans", w: 96, h: 36, color: "#ffffff" },

        // Row 3: Last Lap (Green) | Delta (Red/Green) | Best Lap (Blue)
        { ...createDefaultElement("rect", 6, 304), name: "Box LastLap", w: 214, h: 48, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 12, 310), name: "Last Lap GR", binding: "lastLap", suffix: "", fontSize: 32, fontFamily: "sans", w: 202, h: 36, color: "#22c55e" },
        { ...createDefaultElement("rect", 220, 304), name: "Box DeltaGR", w: 320, h: 48, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 230, 310), name: "Delta GR", binding: "deltaBest", suffix: "", decimals: 2, fontSize: 36, fontWeight: 700, fontFamily: "sans", w: 300, h: 36, color: "#ef4444", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
        { ...createDefaultElement("rect", 540, 304), name: "Box BestLap", w: 214, h: 48, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 546, 310), name: "Best Lap GR", binding: "bestLap", suffix: "", fontSize: 32, fontFamily: "sans", w: 202, h: 36, color: "#3b82f6" },

        // Row 4: NRG LVL | NRG LST | ARB F | ARB R
        { ...createDefaultElement("rect", 6, 352), name: "Box Bottom Info", w: 748, h: 42, bgColor: "#000000", borderColor: "#ffffff", borderWidth: 1, borderRadius: 0 },
        { ...createDefaultElement("text", 14, 358), name: "NRG LVL", binding: "virtualEnergyPct", prefix: "NRG LVL  ", suffix: "", decimals: 0, fontSize: 24, fontWeight: 700, w: 170, h: 30, color: "#fef08a", textAlign: "left" },
        { ...createDefaultElement("text", 190, 358), name: "NRG LST", binding: "vePerLap", suffix: " NRG LST", decimals: 2, fontSize: 22, fontWeight: 700, w: 196, h: 30, color: "#fef08a" },
        { ...createDefaultElement("text", 398, 358), name: "ARB F GR", binding: "frontArb", prefix: "ARB F  P", suffix: "", fontSize: 26, fontWeight: 900, w: 170, h: 30, color: "#fef08a" },
        { ...createDefaultElement("text", 576, 358), name: "ARB R GR", binding: "rearArb", prefix: "P", suffix: "  ARB R", fontSize: 26, fontWeight: 900, w: 170, h: 30, color: "#fef08a", textAlign: "right" },

        // Footer GR TOYOTA GAZOO Racing
        { ...createDefaultElement("text", 16, 400), name: "GR Badge", binding: "none", staticText: "GR", fontSize: 28, fontWeight: 900, italic: true, w: 66, h: 32, color: "#ffffff", bgColor: "#dc2626", borderRadius: 2 },
        { ...createDefaultElement("text", 92, 402), name: "Toyota Brand", binding: "none", staticText: "TOYOTA  GAZOO  RACING", fontSize: 26, fontWeight: 900, italic: true, letterSpacing: 4, w: 650, h: 30, color: "#e5e7eb" },
      ],
    });
  }

  if (template === "hypercar-endurance") {
    return wrap(
      {
        id: uid("dash"),
        name: "Hypercar Endurance Pro",
        width: 780,
        height: 440,
        bgColor: "#040507",
        bgOpacity: 0.98,
        borderRadius: 12,
        borderColor: "#1f2937",
        borderWidth: 2,
        frameShadow: "bezel",
        autoCarMatch: "",
        elements: [
          // Top strip panel
          { ...createDefaultElement("rect", 12, 10), name: "Panel Superior", w: 756, h: 78, bgColor: "#000000", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("text", 20, 16), name: "Lbl RPM", binding: "none", staticText: "RPM", fontSize: 12, fontWeight: 700, w: 130, h: 16, color: "#9ca3af", textAlign: "left" },
          { ...createDefaultElement("text", 20, 34), name: "RPM", binding: "rpm", suffix: "", fontSize: 42, fontWeight: 700, fontFamily: "sans", w: 140, h: 46, color: "#ffffff", textAlign: "left" },
          { ...createDefaultElement("text", 174, 16), name: "Lbl VE/Lap", binding: "none", staticText: "ENERGY P/LAP", fontSize: 12, fontWeight: 700, w: 130, h: 16, color: "#9ca3af" },
          { ...createDefaultElement("text", 174, 34), name: "VE/Lap", binding: "vePerLap", suffix: "", decimals: 2, fontSize: 42, fontWeight: 700, fontFamily: "sans", w: 130, h: 46, color: "#ffffff" },
          { ...createDefaultElement("text", 320, 16), name: "Lbl VE Laps", binding: "none", staticText: "ENERGY LAPS", fontSize: 12, fontWeight: 700, w: 130, h: 16, color: "#9ca3af" },
          { ...createDefaultElement("text", 320, 34), name: "VE Laps", binding: "lapsOfVe", suffix: "", decimals: 1, fontSize: 42, fontWeight: 700, fontFamily: "sans", w: 130, h: 46, color: "#ffffff" },
          { ...createDefaultElement("text", 466, 16), name: "Lbl Fuel/Lap", binding: "none", staticText: "FUEL P/LAP", fontSize: 12, fontWeight: 700, w: 130, h: 16, color: "#9ca3af" },
          { ...createDefaultElement("text", 466, 34), name: "Fuel/Lap", binding: "fuelPerLap", suffix: "", decimals: 2, fontSize: 42, fontWeight: 700, fontFamily: "sans", w: 130, h: 46, color: "#ffffff" },
          { ...createDefaultElement("text", 614, 16), name: "Lbl Fuel Tank", binding: "none", staticText: "FUEL TANK", fontSize: 12, fontWeight: 700, w: 140, h: 16, color: "#9ca3af" },
          { ...createDefaultElement("text", 614, 34), name: "Fuel Tank", binding: "fuel", suffix: "", decimals: 1, fontSize: 42, fontWeight: 700, fontFamily: "sans", w: 140, h: 46, color: "#ffffff" },

          // Full-width Hypercar Lap Time Delta Bar
          { ...createDefaultElement("delta", 12, 92), name: "Lap Time Delta", w: 756, h: 48, deltaStyle: "hypercar-bar", deltaRange: 2.0 },

          // Middle row: Lap Time, Pred Lap, SOC, Brake Bias, Brk Mig
          { ...createDefaultElement("rect", 12, 144), name: "Panel Tiempos", w: 756, h: 64, bgColor: "#000000", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("text", 18, 148), name: "Lbl Lap", binding: "none", staticText: "LAP TIME", fontSize: 11, w: 156, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 18, 164), name: "Lap Time", binding: "currentLap", suffix: "", fontSize: 30, fontFamily: "sans", w: 156, h: 38, color: "#ffffff" },
          { ...createDefaultElement("text", 184, 148), name: "Lbl Pred", binding: "none", staticText: "PRED. LAP TIME", fontSize: 11, w: 164, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 184, 164), name: "Pred Lap", binding: "predictedLap", suffix: "", fontSize: 30, fontFamily: "sans", w: 164, h: 38, color: "#ffffff" },
          { ...createDefaultElement("text", 360, 148), name: "Lbl SOC", binding: "none", staticText: "SOC", fontSize: 11, w: 80, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 360, 164), name: "SOC", binding: "batteryPct", suffix: "", decimals: 0, fontSize: 34, fontFamily: "sans", w: 80, h: 38, color: "#ffffff" },
          { ...createDefaultElement("text", 460, 148), name: "Lbl BB", binding: "none", staticText: "BRAKE BIAS", fontSize: 11, w: 130, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 460, 164), name: "Brake Bias", binding: "brakeBias", suffix: "", decimals: 1, fontSize: 34, fontFamily: "sans", w: 130, h: 38, color: "#ffffff" },
          { ...createDefaultElement("text", 604, 148), name: "Lbl Mig", binding: "none", staticText: "BRK MIG", fontSize: 11, w: 150, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 604, 164), name: "Brk Mig", binding: "migration", suffix: "% F", decimals: 1, fontSize: 34, fontFamily: "sans", w: 150, h: 38, color: "#ffffff" },

          // Main lower 3-column block: Tyres | Gear + Pedals | Brake Temps
          { ...createDefaultElement("tyreblock", 12, 212), name: "Neumáticos 4R", w: 238, h: 146, bgColor: "#000000", borderColor: "rgba(255,255,255,0.14)", borderRadius: 6, showTyrePress: true, showBrakeTemp: false, showCompound: false, showTyreWear: true },
          { ...createDefaultElement("rect", 256, 212), name: "Caja Marcha", w: 268, h: 146, bgColor: "#000000", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("bar", 272, 232), name: "Freno Vert", binding: "brakePct", w: 22, h: 106, orientation: "vertical", fillColor: "#ef4444", trackColor: "#111827", borderColor: "rgba(255,255,255,0.25)", borderWidth: 1, borderRadius: 2 },
          { ...createDefaultElement("text", 316, 218), name: "Marcha", binding: "gear", suffix: "", fontSize: 122, fontWeight: 900, fontFamily: "sans", w: 148, h: 134, color: "#ffffff", animEffect: "gear-pop" },
          { ...createDefaultElement("bar", 486, 232), name: "Gas Vert", binding: "throttlePct", w: 22, h: 106, orientation: "vertical", fillColor: "#16a34a", trackColor: "#111827", borderColor: "rgba(255,255,255,0.25)", borderWidth: 1, borderRadius: 2 },

          { ...createDefaultElement("rect", 530, 212), name: "Caja Discos", w: 238, h: 146, bgColor: "#000000", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("text", 542, 224), name: "Disco FL", binding: "brakeTempFL", suffix: "", fontSize: 44, fontFamily: "sans", w: 104, h: 52, color: "#ffffff" },
          { ...createDefaultElement("text", 652, 224), name: "Disco FR", binding: "brakeTempFR", suffix: "", fontSize: 44, fontFamily: "sans", w: 104, h: 52, color: "#ffffff" },
          { ...createDefaultElement("text", 542, 294), name: "Disco RL", binding: "brakeTempRL", suffix: "", fontSize: 44, fontFamily: "sans", w: 104, h: 52, color: "#ffffff" },
          { ...createDefaultElement("text", 652, 294), name: "Disco RR", binding: "brakeTempRR", suffix: "", fontSize: 44, fontFamily: "sans", w: 104, h: 52, color: "#ffffff" },

          // Bottom colored status boxes
          { ...createDefaultElement("rect", 12, 364), name: "Box Speed", w: 122, h: 64, bgColor: "#000000", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("text", 12, 368), name: "Lbl Speed", binding: "none", staticText: "SPEED", fontSize: 11, w: 122, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 12, 384), name: "Speed", binding: "speed", suffix: "", fontSize: 38, fontFamily: "sans", w: 122, h: 40, color: "#ffffff" },

          { ...createDefaultElement("rect", 140, 364), name: "Box REG", w: 122, h: 64, bgColor: "#000000", borderColor: "#22d3ee", borderWidth: 2, borderRadius: 6 },
          { ...createDefaultElement("text", 140, 368), name: "Lbl REG", binding: "none", staticText: "REG", fontSize: 11, w: 122, h: 14, color: "#e5e7eb" },
          { ...createDefaultElement("text", 140, 384), name: "REG", binding: "motorMap", suffix: "", fontSize: 38, fontFamily: "sans", w: 122, h: 40, color: "#ffffff" },

          { ...createDefaultElement("rect", 268, 364), name: "Box ENG", w: 122, h: 64, bgColor: "#000000", borderColor: "#b91c1c", borderWidth: 2, borderRadius: 6 },
          { ...createDefaultElement("text", 268, 368), name: "Lbl ENG", binding: "none", staticText: "ENG kW", fontSize: 11, w: 122, h: 14, color: "#e5e7eb" },
          { ...createDefaultElement("text", 268, 384), name: "ENG", binding: "regenKw", suffix: "", fontSize: 38, fontFamily: "sans", w: 122, h: 40, color: "#ffffff" },

          { ...createDefaultElement("rect", 396, 364), name: "Box VE", w: 122, h: 64, bgColor: "#000000", borderColor: "#22c55e", borderWidth: 2, borderRadius: 6 },
          { ...createDefaultElement("text", 396, 368), name: "Lbl VE", binding: "none", staticText: "V. ENERGY", fontSize: 11, w: 122, h: 14, color: "#e5e7eb" },
          { ...createDefaultElement("text", 396, 384), name: "V.Energy", binding: "virtualEnergyPct", suffix: "", decimals: 0, fontSize: 38, fontFamily: "sans", w: 122, h: 40, color: "#ffffff" },

          { ...createDefaultElement("rect", 524, 364), name: "Box TC", w: 106, h: 64, bgColor: "#000000", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("text", 524, 368), name: "Lbl TC", binding: "none", staticText: "TC LVL", fontSize: 11, w: 106, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 524, 384), name: "TC", binding: "tc", suffix: "", fontSize: 38, fontFamily: "sans", w: 106, h: 40, color: "#ffffff" },

          { ...createDefaultElement("rect", 636, 364), name: "Box Delta", w: 132, h: 64, bgColor: "#000000", borderColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderRadius: 6 },
          { ...createDefaultElement("text", 636, 368), name: "Lbl Delta", binding: "none", staticText: "DELTA", fontSize: 11, w: 132, h: 14, color: "#9ca3af" },
          { ...createDefaultElement("text", 636, 384), name: "Delta Num", binding: "deltaBest", suffix: "", decimals: 3, fontSize: 34, fontFamily: "sans", w: 132, h: 40, color: "#22c55e", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
        ],
      },
      [
        {
          id: uid("page"),
          name: "Mapa + Estrategia",
          elements: [
            { ...createDefaultElement("leds", 20, 12), name: "RPM Convergente", w: 740, h: 24, ledMode: "dual-bar" },
            { ...createDefaultElement("minimap", 20, 50), name: "Mapa Circuito", w: 260, h: 260 },
            { ...createDefaultElement("relatives", 300, 50), name: "Relatives", w: 460, h: 165, relativesCount: 3 },
            { ...createDefaultElement("sectors", 300, 228), name: "Sectores", w: 460, h: 82 },
            { ...createDefaultElement("delta", 20, 326), name: "Delta", w: 740, h: 48, deltaStyle: "hypercar-bar" },
          ],
        },
      ],
    );
  }

  if (template === "aston-vantage-gt3") {
    const dial = (x: number, y: number, label: string, binding: string, bg: string, border: string, txt = "#ffffff") => [
      { ...createDefaultElement("rect", x, y), name: `Dial ${label}`, w: 76, h: 76, bgColor: bg, borderColor: border, borderWidth: 3, borderRadius: 50, style3d: "bevel" as const },
      { ...createDefaultElement("text", x, y + 14), name: `Val ${label}`, binding, suffix: "", decimals: 0, fontSize: 32, fontWeight: 900, w: 76, h: 46, color: txt },
      { ...createDefaultElement("text", x - 6, y + 80), name: `Lbl ${label}`, binding: "none", staticText: label, fontSize: 13, fontWeight: 700, w: 88, h: 18, color: "#e5e7eb" },
    ];
    return wrap({
      id: uid("dash"),
      name: "Vantage GT3 Circular",
      width: 760,
      height: 440,
      bgColor: "#020304",
      bgOpacity: 0.98,
      borderRadius: 14,
      borderColor: "#84cc16",
      borderWidth: 2,
      frameShadow: "bezel",
      autoCarMatch: "",
      elements: [
        // Top status indicators
        { ...createDefaultElement("indicator", 148, 16), name: "PIT", binding: "speedLimiter", staticText: "PIT", w: 86, h: 30, fontSize: 20, bgColor: "transparent", color: "#374151", activeBgColor: "#ef4444", activeTextColor: "#ffffff" },
        { ...createDefaultElement("indicator", 526, 16), name: "YLW", binding: "yellowFlag", staticText: "YLW", w: 86, h: 30, fontSize: 20, bgColor: "transparent", color: "#374151", activeBgColor: "#eab308", activeTextColor: "#000000" },

        // Giant central circular Gear dial (Vantage style)
        { ...createDefaultElement("rect", 242, 20), name: "Anillo Exterior", w: 276, h: 276, bgColor: "#182226", borderColor: "#a3e635", borderWidth: 4, borderRadius: 200, style3d: "emboss" },
        { ...createDefaultElement("rect", 268, 46), name: "Esfera Central", w: 224, h: 224, bgColor: "#c7d6e6", gradientTo: "#9fb5cc", gradientAngle: 150, borderColor: "#111827", borderWidth: 4, borderRadius: 200, style3d: "glass3d" },
        { ...createDefaultElement("text", 302, 70), name: "Marcha", binding: "gear", suffix: "", fontSize: 126, fontWeight: 900, fontFamily: "sans", w: 156, h: 136, color: "#090b0f", animEffect: "gear-pop" },
        { ...createDefaultElement("text", 296, 210), name: "Subtitulo", binding: "none", staticText: "VANTAGE GT3", fontSize: 15, fontWeight: 900, letterSpacing: 2, w: 168, h: 22, color: "#111827" },

        // Left column (separated by lime lines)
        { ...createDefaultElement("text", 18, 46), name: "Energy", binding: "virtualEnergyPct", suffix: "", decimals: 0, fontSize: 38, fontWeight: 700, w: 96, h: 42, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 18, 88), name: "Lbl Energy", binding: "none", staticText: "ENERGY", fontSize: 12, w: 96, h: 16, color: "#d1d5db", textAlign: "left" },
        { ...createDefaultElement("text", 124, 46), name: "Fuel Lap", binding: "fuelPerLap", suffix: "", decimals: 2, fontSize: 38, fontWeight: 700, w: 106, h: 42, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 124, 88), name: "Lbl FuelLap", binding: "none", staticText: "FUEL LAP", fontSize: 12, w: 106, h: 16, color: "#d1d5db", textAlign: "left" },
        { ...createDefaultElement("rect", 16, 108), name: "Linea L1", w: 214, h: 3, bgColor: "#84cc16", borderWidth: 0, borderRadius: 2 },

        { ...createDefaultElement("text", 18, 134), name: "Speed", binding: "speed", suffix: "", fontSize: 40, fontWeight: 700, w: 100, h: 44, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 18, 178), name: "Lbl Speed", binding: "none", staticText: "SPEED", fontSize: 12, w: 100, h: 16, color: "#d1d5db", textAlign: "left" },
        { ...createDefaultElement("text", 128, 134), name: "Lap Count", binding: "lapNumber", suffix: "", fontSize: 40, fontWeight: 700, w: 100, h: 44, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 128, 178), name: "Lbl Lap", binding: "none", staticText: "LAP COUNT", fontSize: 12, w: 100, h: 16, color: "#d1d5db", textAlign: "left" },
        { ...createDefaultElement("rect", 16, 198), name: "Linea L2", w: 214, h: 3, bgColor: "#84cc16", borderWidth: 0, borderRadius: 2 },

        { ...createDefaultElement("text", 18, 224), name: "Water", binding: "waterTemp", suffix: "", fontSize: 34, w: 100, h: 38, color: "#ffffff" },
        { ...createDefaultElement("text", 18, 264), name: "Lbl Water", binding: "none", staticText: "WATER TEMP", fontSize: 11, w: 100, h: 16, color: "#d1d5db" },
        { ...createDefaultElement("text", 128, 224), name: "Oil", binding: "oilTemp", suffix: "", fontSize: 34, w: 100, h: 38, color: "#ffffff" },
        { ...createDefaultElement("text", 128, 264), name: "Lbl Oil", binding: "none", staticText: "OIL TEMP", fontSize: 11, w: 100, h: 16, color: "#d1d5db" },

        // Right column
        { ...createDefaultElement("text", 530, 48), name: "Last Lap", binding: "lastLap", suffix: "", fontSize: 36, fontWeight: 700, fontFamily: "mono", w: 214, h: 42, color: "#ffffff", textAlign: "right" },
        { ...createDefaultElement("text", 530, 90), name: "Lbl LastLap", binding: "none", staticText: "LAST LAP", fontSize: 12, w: 214, h: 16, color: "#d1d5db", textAlign: "right" },
        { ...createDefaultElement("rect", 530, 108), name: "Linea R1", w: 214, h: 3, bgColor: "#84cc16", borderWidth: 0, borderRadius: 2 },

        { ...createDefaultElement("text", 530, 134), name: "B Bias", binding: "brakeBias", suffix: "", decimals: 1, fontSize: 38, fontWeight: 700, w: 100, h: 44, color: "#ffffff", textAlign: "left" },
        { ...createDefaultElement("text", 530, 178), name: "Lbl BB", binding: "none", staticText: "B BIAS", fontSize: 12, w: 100, h: 16, color: "#d1d5db", textAlign: "left" },
        { ...createDefaultElement("text", 630, 134), name: "Delta", binding: "deltaBest", suffix: "", decimals: 2, fontSize: 36, fontWeight: 700, w: 114, h: 44, color: "#ffffff", textAlign: "right", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#a3e635" } },
        { ...createDefaultElement("text", 630, 178), name: "Lbl Delta", binding: "none", staticText: "DELTA", fontSize: 12, w: 114, h: 16, color: "#d1d5db", textAlign: "right" },
        { ...createDefaultElement("rect", 530, 198), name: "Linea R2", w: 214, h: 3, bgColor: "#84cc16", borderWidth: 0, borderRadius: 2 },

        { ...createDefaultElement("tyreblock", 530, 210), name: "Neumáticos", w: 214, h: 92, bgColor: "transparent", borderWidth: 0, showCompound: false, showTyreWear: false, showBrakeTemp: true },

        // Bottom 7 circular rotary dials (Vantage GT3 signature)
        ...dial(18, 326, "TC SLIP", "tcSlip", "#84a92c", "#bef264"),
        ...dial(124, 326, "MODE", "motorMap", "#883232", "#f87171"),
        ...dial(230, 326, "ARB F", "frontArb", "#2d52c7", "#60a5fa"),
        ...dial(342, 326, "TC", "tc", "#cbd5e1", "#ffffff", "#090b0f"),
        ...dial(454, 326, "ARB R", "rearArb", "#0e8a8a", "#2dd4bf"),
        ...dial(560, 326, "ABS", "abs", "#1d6ce0", "#60a5fa"),
        ...dial(666, 326, "TC CUT", "tcCut", "#9a5b2c", "#fb923c"),
      ],
    });
  }

  if (template === "bosch-ddu-s2") {
    return wrap({
      id: uid("dash"),
      name: "Bosch DDU S2 Wireframe",
      width: 720,
      height: 440,
      bgColor: "#000000",
      bgOpacity: 0.98,
      borderRadius: 12,
      borderColor: "#334155",
      borderWidth: 2,
      frameShadow: "deep",
      autoCarMatch: "",
      elements: [
        // Classic numbered RPM bar (0..8)
        { ...createDefaultElement("leds", 46, 12), name: "RPM Clásica 0-8", w: 628, h: 48, ledMode: "classic-bar", ledGreenColor: "#2563eb", ledYellowColor: "#38bdf8", ledRedColor: "#ef4444", rpmScaleMax: 8 },

        // Row 1: TRACK, AIR, LaptimeDiff (Red border), Speed
        { ...createDefaultElement("rect", 46, 74), name: "Box Track", w: 94, h: 78, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 48, 76), name: "Lbl Track", binding: "none", staticText: "TRACK", fontSize: 14, w: 90, h: 18, color: "#ffffff" },
        { ...createDefaultElement("text", 48, 100), name: "Track Temp", binding: "trackTemp", suffix: "", fontSize: 38, fontFamily: "sans", w: 90, h: 44, color: "#ffffff" },

        { ...createDefaultElement("rect", 148, 74), name: "Box Air", w: 94, h: 78, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 150, 76), name: "Lbl Air", binding: "none", staticText: "AIR", fontSize: 14, w: 90, h: 18, color: "#ffffff" },
        { ...createDefaultElement("text", 150, 100), name: "Air Temp", binding: "ambientTemp", suffix: "", fontSize: 38, fontFamily: "sans", w: 90, h: 44, color: "#ffffff" },

        { ...createDefaultElement("rect", 252, 74), name: "Box Delta", w: 172, h: 78, bgColor: "transparent", borderColor: "#dc2626", borderWidth: 2, borderRadius: 2 },
        { ...createDefaultElement("text", 254, 76), name: "Lbl Delta", binding: "none", staticText: "LaptimeDiff", fontSize: 15, w: 168, h: 20, color: "#ef4444" },
        { ...createDefaultElement("text", 254, 100), name: "Delta", binding: "deltaBest", suffix: "", decimals: 2, fontSize: 42, fontFamily: "sans", w: 168, h: 46, color: "#ef4444", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },

        { ...createDefaultElement("rect", 434, 74), name: "Box Speed", w: 206, h: 78, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 436, 76), name: "Lbl Speed", binding: "none", staticText: "Speed", fontSize: 15, w: 202, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 436, 100), name: "Speed", binding: "speed", suffix: "", fontSize: 44, fontFamily: "sans", w: 202, h: 46, color: "#ffffff" },

        // Row 2: Energy & LapTime (Left) | Gear (Center) | ABS/TC/MAP + TCC/TCS (Right)
        { ...createDefaultElement("rect", 46, 164), name: "Box Energy", w: 200, h: 86, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 48, 168), name: "Lbl Energy", binding: "none", staticText: "Energy", fontSize: 16, w: 196, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 48, 194), name: "Energy", binding: "virtualEnergyPct", suffix: "", decimals: 1, fontSize: 44, fontFamily: "sans", w: 196, h: 48, color: "#ffffff" },

        { ...createDefaultElement("rect", 46, 260), name: "Box LapTime", w: 200, h: 86, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 48, 264), name: "Lbl LapTime", binding: "none", staticText: "Lap Time", fontSize: 16, w: 196, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 48, 294), name: "LapTime", binding: "currentLap", suffix: "", fontSize: 34, fontFamily: "mono", w: 196, h: 42, color: "#ffffff" },

        { ...createDefaultElement("rect", 262, 164), name: "Box Gear", w: 148, h: 182, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 264, 168), name: "Lbl Gear", binding: "none", staticText: "Gear", fontSize: 18, w: 144, h: 22, color: "#ffffff" },
        { ...createDefaultElement("text", 264, 204), name: "Gear", binding: "gear", suffix: "", fontSize: 118, fontWeight: 700, fontFamily: "sans", w: 144, h: 128, color: "#ffffff", animEffect: "gear-pop" },

        { ...createDefaultElement("rect", 426, 164), name: "Box ABS", w: 66, h: 86, bgColor: "transparent", borderColor: "#eab308", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 426, 168), name: "Lbl ABS", binding: "none", staticText: "ABS", fontSize: 15, w: 66, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 426, 198), name: "ABS", binding: "abs", suffix: "", fontSize: 38, fontFamily: "sans", w: 66, h: 44, color: "#ffffff" },

        { ...createDefaultElement("rect", 500, 164), name: "Box TC", w: 66, h: 86, bgColor: "transparent", borderColor: "#38bdf8", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 500, 168), name: "Lbl TC", binding: "none", staticText: "TC", fontSize: 15, w: 66, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 500, 198), name: "TC", binding: "tc", suffix: "", fontSize: 38, fontFamily: "sans", w: 66, h: 44, color: "#ffffff" },

        { ...createDefaultElement("rect", 574, 164), name: "Box MAP", w: 66, h: 86, bgColor: "transparent", borderColor: "#ef4444", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 574, 168), name: "Lbl MAP", binding: "none", staticText: "MAP", fontSize: 15, w: 66, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 574, 198), name: "MAP", binding: "motorMap", suffix: "", fontSize: 38, fontFamily: "sans", w: 66, h: 44, color: "#ffffff" },

        { ...createDefaultElement("rect", 426, 260), name: "Box TCC", w: 102, h: 86, bgColor: "transparent", borderColor: "#22c55e", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 426, 264), name: "Lbl TCC", binding: "none", staticText: "TCC", fontSize: 15, w: 102, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 426, 294), name: "TCC", binding: "tcCut", suffix: "", fontSize: 38, fontFamily: "sans", w: 102, h: 44, color: "#ffffff" },

        { ...createDefaultElement("rect", 538, 260), name: "Box TCS", w: 102, h: 86, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 538, 264), name: "Lbl TCS", binding: "none", staticText: "TCS", fontSize: 15, w: 102, h: 20, color: "#ffffff" },
        { ...createDefaultElement("text", 538, 294), name: "TCS", binding: "tcSlip", suffix: "", fontSize: 38, fontFamily: "sans", w: 102, h: 44, color: "#ffffff" },

        // Bottom Bosch DDU S2 footer strip
        { ...createDefaultElement("rect", 46, 364), name: "Barra Inferior", w: 594, h: 52, bgColor: "transparent", borderColor: "#ffffff", borderWidth: 1, borderRadius: 2 },
        { ...createDefaultElement("text", 56, 376), name: "Marca DDU", binding: "none", staticText: "DDU S2  Motorsport Display", fontSize: 16, fontWeight: 700, w: 240, h: 28, color: "#e5e7eb", textAlign: "left" },
        { ...createDefaultElement("indicator", 316, 374), name: "PIT Ind", binding: "speedLimiter", staticText: "PIT LIM", w: 88, h: 32, activeBgColor: "#eab308", activeTextColor: "#000000" },
        { ...createDefaultElement("indicator", 412, 374), name: "FCY Ind", binding: "yellowFlag", staticText: "YELLOW", w: 88, h: 32, activeBgColor: "#facc15", activeTextColor: "#000000" },
        { ...createDefaultElement("text", 518, 376), name: "MDT Badge", binding: "none", staticText: "MDT BOSCH", fontSize: 16, fontWeight: 900, letterSpacing: 2, w: 112, h: 28, color: "#64748b", textAlign: "right" },
      ],
    });
  }

  if (template === "blank") {
    return wrap({
      id: uid("dash"),
      name: "Dashboard Personalizado",
      width: 640,
      height: 320,
      bgColor: "#06101f",
      bgOpacity: 0.94,
      borderRadius: 14,
      borderColor: "#2287ec",
      elements: [
        createDefaultElement("leds", 100, 14),
        { ...createDefaultElement("text", 260, 80), name: "Marcha", binding: "gear", suffix: "", fontSize: 92, w: 120, h: 105, color: "#ffffff" },
        { ...createDefaultElement("text", 240, 195), name: "Velocidad", binding: "speed", suffix: " km/h", fontSize: 32, w: 160, h: 44, color: "#38bdf8" },
      ],
    });
  }

  if (template === "porsche-963") {
    return wrap(
      {
        id: uid("dash"),
        name: "Porsche 963 LMDh WEC",
        width: 680,
        height: 360,
        bgColor: "#0a0a0c",
        bgOpacity: 0.97,
        borderRadius: 16,
        borderColor: "#d5001c",
        elements: [
          { ...createDefaultElement("rect", 0, 0), name: "Franja Porsche", w: 680, h: 6, bgColor: "#d5001c", borderWidth: 0, borderRadius: 0 },
          { ...createDefaultElement("leds", 44, 16), name: "Shift LEDs", w: 592, h: 22, ledCount: 16, ledShape: "bar", ledGreenColor: "#ffffff", ledYellowColor: "#facc15", ledRedColor: "#d5001c" },
          { ...createDefaultElement("tyreblock", 20, 56), name: "Gomas & Frenos", w: 180, h: 144 },
          { ...createDefaultElement("trace", 20, 212), name: "Traza Pedales", w: 180, h: 74 },
          { ...createDefaultElement("image", 64, 298), name: "Logo MDT", w: 92, h: 44 },
          { ...createDefaultElement("text", 224, 52), name: "Delta", binding: "deltaBest", suffix: "s", decimals: 2, fontSize: 34, w: 232, h: 42, color: "#22c55e", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
          { ...createDefaultElement("text", 268, 98), name: "Marcha", binding: "gear", suffix: "", fontSize: 132, w: 144, h: 140, color: "#ffffff", glowColor: "#d5001c", glowSize: 10 },
          { ...createDefaultElement("text", 240, 248), name: "Velocidad", binding: "speed", suffix: " km/h", fontSize: 36, w: 200, h: 44, color: "#ffffff" },
          { ...createDefaultElement("text", 240, 298), name: "Pos / Vuelta", binding: "classPlace", prefix: "P", suffix: " CLASE", fontSize: 18, w: 200, h: 28, color: "#d5001c" },
          { ...createDefaultElement("radial", 494, 56), name: "Energía Virtual", binding: "virtualEnergyPct", w: 118, h: 118, fillColor: "#22d3ee", suffix: "%" },
          { ...createDefaultElement("radial", 494, 182), name: "Batería ERS", binding: "batteryPct", w: 118, h: 118, fillColor: "#22c55e", suffix: "%" },
          { ...createDefaultElement("text", 472, 308), name: "Brake Bias", binding: "brakeBias", prefix: "BB ", suffix: "%", decimals: 1, fontSize: 22, w: 180, h: 32, color: "#facc15" },
        ],
      },
      [
        {
          id: uid("page"),
          name: "Estrategia & Mapa",
          elements: [
            { ...createDefaultElement("minimap", 24, 24), name: "Mapa Circuito", w: 200, h: 200 },
            { ...createDefaultElement("tyreblock", 246, 24), name: "4 Ruedas", w: 200, h: 150 },
            { ...createDefaultElement("text", 468, 32), name: "Combustible", binding: "fuel", prefix: "FUEL ", suffix: "L", decimals: 1, fontSize: 28, w: 190, h: 38, color: "#f59e0b" },
            { ...createDefaultElement("bar", 468, 80), name: "Barra Fuel", binding: "fuelPct", w: 188, h: 18, fillColor: "#f59e0b" },
            { ...createDefaultElement("text", 468, 118), name: "Última", binding: "lastLap", fontSize: 22, w: 190, h: 30, fontFamily: "mono", color: "#ffffff" },
            { ...createDefaultElement("text", 468, 156), name: "Mejor", binding: "bestLap", fontSize: 22, w: 190, h: 30, fontFamily: "mono", color: "#c084fc" },
          ],
        },
      ],
    );
  }

  if (template === "ferrari-499p") {
    return wrap({
      id: uid("dash"),
      name: "Ferrari 499P Hypercar",
      width: 680,
      height: 360,
      bgColor: "#100507",
      bgOpacity: 0.96,
      borderRadius: 16,
      borderColor: "#facc15",
      elements: [
        { ...createDefaultElement("leds", 40, 14), name: "Shift LEDs", w: 600, h: 24, ledCount: 15, ledShape: "circle", ledGreenColor: "#22c55e", ledYellowColor: "#facc15", ledRedColor: "#dc2626" },
        { ...createDefaultElement("needle", 26, 56), name: "Tacómetro", binding: "rpmPct", w: 186, h: 186, fillColor: "#facc15" },
        { ...createDefaultElement("trace", 26, 256), name: "Pedales", w: 186, h: 78 },
        { ...createDefaultElement("text", 238, 56), name: "Delta", binding: "deltaBest", suffix: "s", decimals: 2, fontSize: 32, w: 204, h: 40, color: "#facc15", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
        { ...createDefaultElement("text", 268, 102), name: "Marcha", binding: "gear", suffix: "", fontSize: 126, w: 144, h: 136, color: "#facc15" },
        { ...createDefaultElement("text", 242, 248), name: "Velocidad", binding: "speed", suffix: " km/h", fontSize: 34, w: 196, h: 42, color: "#ffffff" },
        { ...createDefaultElement("image", 302, 298), name: "Logo MDT", w: 76, h: 42 },
        { ...createDefaultElement("tyreblock", 470, 56), name: "4 Ruedas", w: 186, h: 140 },
        { ...createDefaultElement("text", 470, 212), name: "VE %", binding: "virtualEnergyPct", prefix: "VE ", suffix: "%", decimals: 1, fontSize: 22, w: 186, h: 30, color: "#22d3ee" },
        { ...createDefaultElement("bar", 470, 248), name: "Barra VE", binding: "virtualEnergyPct", w: 186, h: 14, fillColor: "#22d3ee" },
        { ...createDefaultElement("text", 470, 276), name: "BB", binding: "brakeBias", prefix: "BB ", suffix: "%", decimals: 1, fontSize: 20, w: 92, h: 28, color: "#facc15" },
        { ...createDefaultElement("text", 566, 276), name: "TC", binding: "tc", prefix: "TC ", suffix: "", fontSize: 20, w: 90, h: 28, color: "#38bdf8" },
        { ...createDefaultElement("indicator", 470, 312), name: "PIT", binding: "speedLimiter", staticText: "PIT LIMITER", w: 186, h: 28, activeBgColor: "#facc15", activeTextColor: "#000000", activeBlink: true },
      ],
    });
  }

  if (template === "bmw-m4-gt3") {
    return wrap({
      id: uid("dash"),
      name: "BMW M4 GT3 Motorsport",
      width: 640,
      height: 340,
      bgColor: "#050b16",
      bgOpacity: 0.96,
      borderRadius: 14,
      borderColor: "#0066b1",
      elements: [
        { ...createDefaultElement("rect", 0, 0), name: "M-Stripe Azul", w: 214, h: 5, bgColor: "#00a0e3", borderWidth: 0, borderRadius: 0 },
        { ...createDefaultElement("rect", 214, 0), name: "M-Stripe Oscuro", w: 213, h: 5, bgColor: "#003d78", borderWidth: 0, borderRadius: 0 },
        { ...createDefaultElement("rect", 427, 0), name: "M-Stripe Rojo", w: 213, h: 5, bgColor: "#e22718", borderWidth: 0, borderRadius: 0 },
        { ...createDefaultElement("leds", 36, 16), name: "RPM LEDs", w: 568, h: 22, ledCount: 15, ledShape: "circle" },
        { ...createDefaultElement("needle", 22, 54), name: "RPM Aguja", binding: "rpmPct", w: 170, h: 170, fillColor: "#e22718" },
        { ...createDefaultElement("trace", 22, 238), name: "Traza Pedales", w: 170, h: 80 },
        { ...createDefaultElement("text", 214, 54), name: "Delta", binding: "deltaBest", suffix: "s", decimals: 2, fontSize: 30, w: 212, h: 38, color: "#22c55e" },
        { ...createDefaultElement("text", 256, 98), name: "Marcha", binding: "gear", suffix: "", fontSize: 120, w: 128, h: 128, color: "#ffffff" },
        { ...createDefaultElement("text", 226, 234), name: "Velocidad", binding: "speed", suffix: " km/h", fontSize: 32, w: 188, h: 40, color: "#38bdf8" },
        { ...createDefaultElement("image", 282, 282), name: "Logo MDT", w: 76, h: 42 },
        { ...createDefaultElement("tyreblock", 446, 54), name: "Gomas & Frenos", w: 174, h: 142 },
        { ...createDefaultElement("text", 446, 210), name: "TC / ABS", binding: "tc", prefix: "TC ", suffix: "", fontSize: 22, w: 84, h: 30, color: "#38bdf8" },
        { ...createDefaultElement("text", 536, 210), name: "ABS", binding: "abs", prefix: "ABS ", suffix: "", fontSize: 22, w: 84, h: 30, color: "#a78bfa" },
        { ...createDefaultElement("text", 446, 248), name: "BB", binding: "brakeBias", prefix: "BB ", suffix: "%", decimals: 1, fontSize: 22, w: 174, h: 30, color: "#facc15" },
        { ...createDefaultElement("indicator", 446, 286), name: "TC Active", binding: "tcActive", staticText: "TC ACTIVO", w: 174, h: 32, activeBgColor: "#f59e0b", activeTextColor: "#000000" },
      ],
    });
  }

  if (template === "f1-halo") {
    return wrap({
      id: uid("dash"),
      name: "F1 Halo Telemetry Bar (OBS)",
      width: 760,
      height: 130,
      bgColor: "#060b16",
      bgOpacity: 0.94,
      borderRadius: 65,
      borderColor: "#1e75ff",
      elements: [
        { ...createDefaultElement("image", 28, 36), name: "Logo MDT", w: 68, h: 58 },
        { ...createDefaultElement("radial", 112, 14), name: "Velocidad", binding: "speed", min: 0, max: 350, w: 102, h: 102, fillColor: "#1e75ff", suffix: "", fontSize: 24 },
        { ...createDefaultElement("text", 224, 16), name: "Marcha", binding: "gear", suffix: "", fontSize: 78, w: 84, h: 86, color: "#ffffff" },
        { ...createDefaultElement("leds", 316, 18), name: "Shift LEDs", w: 220, h: 18, ledCount: 15, ledShape: "bar" },
        { ...createDefaultElement("trace", 316, 44), name: "Pedales Vivo", w: 220, h: 68 },
        { ...createDefaultElement("text", 552, 22), name: "Piloto", binding: "driverName", suffix: "", fontSize: 20, w: 178, h: 30, textAlign: "left", color: "#1e75ff" },
        { ...createDefaultElement("text", 552, 54), name: "Delta", binding: "deltaBest", suffix: "s", decimals: 2, fontSize: 24, w: 178, h: 30, textAlign: "left", color: "#22c55e" },
        { ...createDefaultElement("text", 552, 88), name: "Posición", binding: "classPlace", prefix: "POS P", suffix: "", fontSize: 16, w: 178, h: 24, textAlign: "left", color: "#ffffff" },
      ],
    });
  }

  if (template === "broadcast-strip") {
    return wrap({
      id: uid("dash"),
      name: "Broadcast TV Strip (OBS)",
      width: 720,
      height: 108,
      bgColor: "#060e1c",
      bgOpacity: 0.94,
      borderRadius: 12,
      borderColor: "#2287ec",
      elements: [
        { ...createDefaultElement("image", 16, 26), name: "Logo MDT", w: 64, h: 56 },
        { ...createDefaultElement("text", 92, 16), name: "Piloto", binding: "driverName", suffix: "", fontSize: 20, w: 210, h: 30, textAlign: "left", color: "#ffffff" },
        { ...createDefaultElement("text", 92, 48), name: "Posición", binding: "classPlace", prefix: "P", suffix: " CLASE", fontSize: 16, w: 120, h: 24, textAlign: "left", color: "#38bdf8" },
        { ...createDefaultElement("text", 320, 12), name: "Marcha", binding: "gear", suffix: "", fontSize: 64, w: 72, h: 74, color: "#ffffff", bgColor: "rgba(34,135,236,0.22)", borderColor: "#2287ec", borderWidth: 1, borderRadius: 10 },
        { ...createDefaultElement("text", 404, 16), name: "Velocidad", binding: "speed", suffix: "", fontSize: 44, w: 112, h: 50, color: "#ffffff", textAlign: "right" },
        { ...createDefaultElement("text", 404, 66), name: "Unidad", binding: "none", staticText: "KM/H", fontSize: 11, w: 112, h: 18, color: "#94a3b8", textAlign: "right" },
        { ...createDefaultElement("bar", 534, 24), name: "Acelerador", binding: "throttlePct", w: 168, h: 18, fillColor: "#22c55e" },
        { ...createDefaultElement("bar", 534, 52), name: "Freno", binding: "brakePct", w: 168, h: 18, fillColor: "#ef4444" },
        { ...createDefaultElement("leds", 92, 82), name: "RPM LEDs", w: 610, h: 14, ledCount: 20, ledShape: "bar" },
      ],
    });
  }

  if (template === "hypercar-wec") {
    return wrap({
      id: uid("dash"),
      name: "Hypercar WEC DDU Pro",
      width: 680,
      height: 360,
      bgColor: "#050c18",
      bgOpacity: 0.96,
      borderRadius: 16,
      borderColor: "#ef4444",
      elements: [
        { ...createDefaultElement("leds", 40, 14), name: "Shift LEDs", w: 600, h: 24, ledCount: 16, ledShape: "circle" },
        { ...createDefaultElement("rect", 24, 54), name: "Panel Izq", w: 190, h: 280, bgColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 12 },
        { ...createDefaultElement("rect", 466, 54), name: "Panel Der", w: 190, h: 280, bgColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderRadius: 12 },
        { ...createDefaultElement("radial", 64, 70), name: "Energía Virtual", binding: "virtualEnergyPct", w: 110, h: 110, fillColor: "#22d3ee", suffix: "%" },
        { ...createDefaultElement("text", 34, 184), name: "Etiqueta VE", binding: "none", staticText: "VIRTUAL ENERGY", fontSize: 11, w: 170, h: 18, color: "#94a3b8" },
        { ...createDefaultElement("radial", 64, 206), name: "Batería ERS", binding: "batteryPct", w: 110, h: 110, fillColor: "#22c55e", suffix: "%" },
        { ...createDefaultElement("text", 240, 62), name: "Delta", binding: "deltaBest", suffix: "s", decimals: 2, fontSize: 32, w: 200, h: 42, color: "#22c55e", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
        { ...createDefaultElement("text", 268, 108), name: "Marcha", binding: "gear", suffix: "", fontSize: 124, w: 144, h: 132, color: "#ffffff" },
        { ...createDefaultElement("text", 250, 248), name: "Velocidad", binding: "speed", suffix: " km/h", fontSize: 34, w: 180, h: 44, color: "#38bdf8" },
        { ...createDefaultElement("image", 306, 298), name: "Logo MDT", w: 68, h: 38 },
        { ...createDefaultElement("text", 480, 72), name: "Brake Bias", binding: "brakeBias", prefix: "BB ", suffix: "%", decimals: 1, fontSize: 24, w: 162, h: 34, color: "#facc15" },
        { ...createDefaultElement("text", 480, 118), name: "TC", binding: "tc", prefix: "TC ", suffix: "", fontSize: 22, w: 76, h: 32, color: "#38bdf8" },
        { ...createDefaultElement("text", 564, 118), name: "ABS", binding: "abs", prefix: "ABS ", suffix: "", fontSize: 22, w: 80, h: 32, color: "#a78bfa" },
        { ...createDefaultElement("text", 480, 166), name: "Combustible", binding: "fuel", prefix: "FUEL ", suffix: "L", decimals: 1, fontSize: 20, w: 162, h: 30, color: "#ffffff" },
        { ...createDefaultElement("bar", 484, 202), name: "Barra Fuel", binding: "fuelPct", w: 154, h: 14, fillColor: "#f59e0b" },
        { ...createDefaultElement("indicator", 484, 236), name: "Alerta TC", binding: "tcActive", staticText: "TC ACTIVO", w: 154, h: 30, activeBgColor: "#f59e0b", activeTextColor: "#000000" },
        { ...createDefaultElement("indicator", 484, 276), name: "Alerta PIT", binding: "speedLimiter", staticText: "PIT LIMITER", w: 154, h: 34, activeBgColor: "#ef4444", activeTextColor: "#ffffff", activeBlink: true },
      ],
    });
  }

  // Default: "gt3-pro"
  return wrap({
    id: uid("dash"),
    name: "GT3 Pro Steering Dash",
    width: 640,
    height: 320,
    bgColor: "#061121",
    bgOpacity: 0.95,
    borderRadius: 14,
    borderColor: "#2287ec",
    elements: [
      { ...createDefaultElement("leds", 40, 14), name: "Shift LEDs", w: 560, h: 24, ledCount: 15, ledShape: "circle" },
      { ...createDefaultElement("rect", 18, 52), name: "Caja Izq", w: 176, h: 248, bgColor: "rgba(255,255,255,0.03)", borderColor: "rgba(34,135,236,0.35)", borderWidth: 1, borderRadius: 10 },
      { ...createDefaultElement("rect", 446, 52), name: "Caja Der", w: 176, h: 248, bgColor: "rgba(255,255,255,0.03)", borderColor: "rgba(34,135,236,0.35)", borderWidth: 1, borderRadius: 10 },
      { ...createDefaultElement("text", 28, 66), name: "Posición", binding: "classPlace", prefix: "P", suffix: "", fontSize: 38, w: 72, h: 46, color: "#38bdf8" },
      { ...createDefaultElement("text", 104, 66), name: "Vuelta", binding: "lapNumber", prefix: "V", suffix: "", fontSize: 32, w: 80, h: 46, color: "#ffffff" },
      { ...createDefaultElement("text", 28, 126), name: "Última", binding: "lastLap", prefix: "", suffix: "", fontSize: 20, w: 156, h: 28, color: "#ffffff", fontFamily: "mono" },
      { ...createDefaultElement("text", 28, 158), name: "Mejor", binding: "bestLap", prefix: "", suffix: "", fontSize: 18, w: 156, h: 26, color: "#c084fc", fontFamily: "mono" },
      { ...createDefaultElement("text", 28, 200), name: "Fuel", binding: "fuel", prefix: "FUEL ", suffix: "L", decimals: 1, fontSize: 20, w: 156, h: 28, color: "#f59e0b" },
      { ...createDefaultElement("bar", 30, 234), name: "Barra Fuel", binding: "fuelPct", w: 152, h: 14, fillColor: "#f59e0b" },
      { ...createDefaultElement("image", 62, 258), name: "Logo MDT", w: 88, h: 36 },

      { ...createDefaultElement("text", 218, 56), name: "Delta", binding: "deltaBest", suffix: "s", decimals: 2, fontSize: 28, w: 204, h: 38, color: "#22c55e", colorRule: { enabled: true, binding: "deltaBest", highThreshold: 0.01, highColor: "#ef4444", lowThreshold: -0.01, lowColor: "#22c55e" } },
      { ...createDefaultElement("text", 256, 96), name: "Marcha", binding: "gear", suffix: "", fontSize: 120, w: 128, h: 128, color: "#ffffff" },
      { ...createDefaultElement("text", 230, 224), name: "Velocidad", binding: "speed", suffix: " km/h", fontSize: 32, w: 180, h: 40, color: "#38bdf8" },
      { ...createDefaultElement("bar", 218, 272), name: "Acelerador", binding: "throttlePct", w: 98, h: 14, fillColor: "#22c55e" },
      { ...createDefaultElement("bar", 324, 272), name: "Freno", binding: "brakePct", w: 98, h: 14, fillColor: "#ef4444" },

      { ...createDefaultElement("text", 458, 64), name: "Brake Bias", binding: "brakeBias", prefix: "BB ", suffix: "%", decimals: 1, fontSize: 22, w: 152, h: 30, color: "#facc15" },
      { ...createDefaultElement("text", 458, 102), name: "TC", binding: "tc", prefix: "TC ", suffix: "", fontSize: 20, w: 72, h: 28, color: "#38bdf8" },
      { ...createDefaultElement("text", 536, 102), name: "ABS", binding: "abs", prefix: "ABS ", suffix: "", fontSize: 20, w: 76, h: 28, color: "#a78bfa" },
      { ...createDefaultElement("tyreblock", 454, 140), name: "4 Ruedas", w: 160, h: 108 },
      { ...createDefaultElement("indicator", 458, 256), name: "PIT Limiter", binding: "speedLimiter", staticText: "PIT LIMITER", w: 152, h: 32, activeBgColor: "#eab308", activeTextColor: "#000000", activeBlink: true },
    ],
  });
}
