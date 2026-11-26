import { listen } from "@tauri-apps/api/event";
import { api, isNativeTauri } from "./api";
import { createTemplateDashboard, type CustomDashboard } from "./dashStudio.svelte";

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
  /** Independent horizontal transform scale multiplier (default 1). */
  scaleX?: number;
  /** Independent vertical transform scale multiplier (default 1). */
  scaleY?: number;
  /** Opacity for this widget, on top of the global opacity. */
  alpha: number;
  /** Lock position in edit mode to prevent accidental drags. */
  locked?: boolean;
  /** Automatically fade opacity to 25% in fast corners and restore on straights/pits. */
  autoFadeInCorners?: boolean;
  options: Record<string, any>;
}

export interface AppShortcutsConfig {
  editMode: string;
  toggleOverlay: string;
  toggleSpotter: string;
  nextProfile: string;
  toggleBroadcast: string;
  resetFocus: string;
  fxEditor: string;
}

export const DEFAULT_SHORTCUTS: AppShortcutsConfig = {
  editMode: "Ctrl+Shift+F9",
  toggleOverlay: "Ctrl+Shift+F10",
  toggleSpotter: "Ctrl+Shift+F8",
  nextProfile: "Ctrl+Shift+F7",
  toggleBroadcast: "Ctrl+Shift+F6",
  resetFocus: "Ctrl+Shift+F5",
  fxEditor: "Ctrl+Shift+F4",
};

export interface HudAnimationsConfig {
  /** #1 Animación de adelantamiento y delta en la tabla de Clasificación */
  standingsOvertake: boolean;
  /** #2 Pulso dinámico de frenada fuerte / aceleración a fondo en el Dashboard */
  dashboardGForcePulse: boolean;
  /** #3 Barrido de luz Morado / Verde al completar sectores en Delta y Tiempos */
  sectorSweepFlash: boolean;
  /** #4 Banner televisivo cinematográfico de Bandera a Cuadros / Victoria / Podio */
  checkeredBanner: boolean;
  /** #7 Ondas de voz reales del micrófono (RMS en vivo) en el Team Radio PTT */
  liveMicWaveform: boolean;
  /** #8 Panel animado en vivo durante el Pit Stop (4 ruedas + repostaje + crono) */
  pitStopLiveAnim: boolean;
  /** Semáforo de Salida TV (5 Luces Rojas → Apagado) */
  startLightsAnim: boolean;
  /** Pulso de Bloqueo de Frenos / ABS / TC Activo */
  absTcLockupPulse: boolean;
  /** Animación dinámica de Lift & Coast */
  liftAndCoastAnim: boolean;
  /** Transición Día → Noche en el HUD */
  dayNightTransition: boolean;
  /** Alerta animada de Sanción (Drive-Through / Stop & Go) */
  penaltyAlertAnim: boolean;
  /** Flujo de partículas/energía en la barra Híbrida / ERS */
  ersFlowAnim: boolean;
  /** Destello y sacudida (shake) al invalidar vuelta */
  lapInvalidShake: boolean;
  /** Pop-up animado estilo volante F1/GT3 al cambiar electrónica */
  electronicsPopupAnim: boolean;
}

export const DEFAULT_ANIMATIONS: HudAnimationsConfig = {
  standingsOvertake: true,
  dashboardGForcePulse: true,
  sectorSweepFlash: true,
  checkeredBanner: true,
  liveMicWaveform: true,
  pitStopLiveAnim: true,
  startLightsAnim: true,
  absTcLockupPulse: true,
  liftAndCoastAnim: true,
  dayNightTransition: true,
  penaltyAlertAnim: true,
  ersFlowAnim: true,
  lapInvalidShake: true,
  electronicsPopupAnim: true,
};

export type OnboardFxPresetId = "onboard_master" | "imsa_onboard" | "onboard_real" | "clean" | "f1_tcam" | "wec_film" | "kodak_2383" | "helmet_gopro" | "night_hdr" | "vhs_90s" | "custom";

export interface OnboardFxConfig {
  enabled: boolean;
  preset: OnboardFxPresetId;
  onlyOnTrack: boolean;
  contrast: number;
  saturation: number;
  vibrance: number;
  brightness: number;
  exposure: number;
  warmth: number;
  tint: number;
  acesTonemap: number;
  casSharpen: number;
  chromaticAberration: number;
  speedBlur: number;
  vignette: number;
  speedVignette: boolean;
  visorFrame: boolean;
  visorDirt: number;
  filmGrain: number;
  scanlines: number;
  rainDrops: boolean;
  recBadge: boolean;
  gForceVignette: boolean;
  cameraShake: boolean;
  lutStrength: number;
  /** 0=None, 1=WEC Film, 2=F1 T-Cam, 3=Kodak 2383, 4=GoPro, 5=Night HDR, 6=Custom .cube */
  lutPreset: number;
  // --- 9 Pro Realism Shaders (all optional) ---
  bloom: number;
  halation: number;
  lensDistortion: number;
  clarity: number;
  dehaze: number;
  anamorphicFlare: number;
  lift: number;
  gamma: number;
  gain: number;
  autoExposure: boolean;
  gforceShift: boolean;
  rpmVibration: boolean;
  autoWeatherTimeFx: boolean;
  // --- 7 Lighting & Photorealism Shaders (all optional) ---
  agxTonemap: number;
  giBounce: number;
  proMist: number;
  localHdr: number;
  highlightRolloff: number;
  splitShadowCool: number;
  splitHighlightWarm: number;
  shadowDepth: number;
  splitScreen?: number;
  cameraShakeIntensity?: number;
  rpmVibrationIntensity?: number;
  // --- 6 Next-Gen Multi-Pass & Temporal Shaders (#1, #2, #4, #7, #8, #10) ---
  pyramidalBloom?: number;
  grassRealism?: number;
  skyRealism?: number;
  sunGodRays?: number;
  film35mm?: number;
  heatHaze?: number;
  temporalMotionBlur?: number;
  lumenGi?: number;
  lumenSkyBounce?: number;
  linearColorSpace?: boolean;
  /** 0 = sRGB Native, 1 = Rec.709 (2.4 Broadcast), 2 = Rec.709 HLG, 3 = DCI-P3, 4 = BT.2020, 5 = ACEScg */
  colorSpace?: number;
  colorSpaceStrength?: number;
  taaAntialias?: number;
  performanceMode?: boolean;
  /** GPU FXAA 3.11 edge anti-aliasing (0..1) */
  fxaaAntialias?: number;
  /** Cinematic Replay Depth of Field (0..1) */
  cinematicDof?: number;
  /** Focus plane height for Replay DoF (0.15 = horizon, 0.50 = mid, 0.85 = foreground) */
  dofFocus?: number;
  /** Cinema iris adaptation speed for Auto-Exposure (0.05 = ultra-slow ~4s .. 1.0 = ~1s) */
  autoExposureSpeed?: number;
  /** RealLongExposure / Camera Shutter multi-frame accumulation (0..1) */
  longExposure?: number;
  /** 6-point optical aperture starburst on headlights & sun (0..1) */
  starburst?: number;
  /** Light-reactive polycarbonate windshield & dirty lens scatter (0..1) */
  dirtyLens?: number;
  /** Real WEC/IMSA broadcast CMOS sensor look: 4:2:2 chroma softness + matte toe + highlight knee (0..1) */
  broadcastSensor?: number;
  /** Wet asphalt specular reflections driven by live LMU rain telemetry (0..1) */
  wetReflections?: number;
  /** 10-bit Blue-Noise Debanding (0..1) */
  deband?: number;
  /** Edge-preserving Bilateral Surface Blur (SurfaceBlur.fx, 0..1) */
  surfaceBlur?: number;
  /** Photochemical DPX Film Curve (DPX.fx, 0..1) */
  dpxFilm?: number;
  /** Analog Broadcast RF / VHS Chroma Bleed & Interlace (VHS_RA.fx, 0..1) */
  vhsRf?: number;
  /** Persisted file path when lutPreset === 6 (Custom .cube LUT) */
  customLutPath?: string;
  /** User-saved custom FX presets (1-click apply, rename, delete) */
  userPresets?: UserFxPreset[];
  toggleKey?: string;
}

export interface UserFxPreset {
  id: string;
  name: string;
  values: Partial<Omit<OnboardFxConfig, "enabled" | "onlyOnTrack" | "preset" | "toggleKey" | "userPresets">>;
}

/** Neutral zero-baseline for all optional FX sliders so switching presets NEVER inherits leftover glow/white-out! */
export const CLEAN_FX_SLIDERS: Partial<Omit<OnboardFxConfig, "enabled" | "onlyOnTrack" | "preset" | "toggleKey">> = {
  contrast: 1.0,
  saturation: 1.0,
  vibrance: 0,
  brightness: 1.0,
  exposure: 0,
  warmth: 0,
  tint: 0,
  acesTonemap: 0,
  agxTonemap: 0,
  casSharpen: 0,
  chromaticAberration: 0,
  speedBlur: 0,
  vignette: 0,
  visorFrame: false,
  visorDirt: 0,
  filmGrain: 0,
  scanlines: 0,
  recBadge: false,
  lutStrength: 0,
  lutPreset: 0,
  bloom: 0,
  halation: 0,
  lensDistortion: 0,
  clarity: 0,
  dehaze: 0,
  anamorphicFlare: 0,
  lift: 0,
  gamma: 1.0,
  gain: 1.0,
  autoExposure: false,
  giBounce: 0,
  proMist: 0,
  localHdr: 0,
  highlightRolloff: 0,
  splitShadowCool: 0,
  splitHighlightWarm: 0,
  shadowDepth: 0,
  pyramidalBloom: 0,
  grassRealism: 0,
  skyRealism: 0,
  sunGodRays: 0,
  film35mm: 0,
  heatHaze: 0,
  temporalMotionBlur: 0,
  lumenGi: 0,
  lumenSkyBounce: 0,
  linearColorSpace: false,
  colorSpace: 0,
  colorSpaceStrength: 1.0,
  taaAntialias: 0,
  fxaaAntialias: 0,
  cinematicDof: 0,
  dofFocus: 0.5,
  autoExposureSpeed: 0.22,
  longExposure: 0,
  starburst: 0,
  dirtyLens: 0,
  broadcastSensor: 0,
  wetReflections: 0,
  deband: 0,
  surfaceBlur: 0,
  dpxFilm: 0,
  vhsRf: 0,
};

export const DEFAULT_ONBOARD_FX: OnboardFxConfig = {
  enabled: false,
  preset: "wec_film",
  onlyOnTrack: true,
  contrast: 1.08,
  saturation: 1.06,
  vibrance: 0.22,
  brightness: 1.0,
  exposure: 0.04,
  warmth: 6,
  tint: 0,
  acesTonemap: 0.2,
  casSharpen: 0.45,
  chromaticAberration: 0.14,
  speedBlur: 0.28,
  vignette: 0.32,
  speedVignette: true,
  visorFrame: false,
  visorDirt: 0.12,
  filmGrain: 0.08,
  scanlines: 0,
  rainDrops: true,
  recBadge: false,
  gForceVignette: true,
  cameraShake: true,
  lutStrength: 0.65,
  lutPreset: 1,
  bloom: 0.24,
  halation: 0.18,
  lensDistortion: 0.16,
  clarity: 0.32,
  dehaze: 0.18,
  anamorphicFlare: 0.14,
  lift: 0.0,
  gamma: 1.0,
  gain: 1.02,
  autoExposure: false,
  gforceShift: true,
  rpmVibration: true,
  autoWeatherTimeFx: true,
  agxTonemap: 0.28,
  giBounce: 0.14,
  proMist: 0.12,
  localHdr: 0.12,
  highlightRolloff: 0.32,
  splitShadowCool: 0.18,
  splitHighlightWarm: 0.14,
  shadowDepth: 0.18,
  splitScreen: 0,
  cameraShakeIntensity: 1.0,
  rpmVibrationIntensity: 1.0,
  pyramidalBloom: 0.18,
  grassRealism: 0.45,
  skyRealism: 0.25,
  sunGodRays: 0.12,
  film35mm: 0.16,
  heatHaze: 0.14,
  temporalMotionBlur: 0.2,
  lumenGi: 0.24,
  lumenSkyBounce: 0.16,
  linearColorSpace: false,
  colorSpace: 0,
  colorSpaceStrength: 1.0,
  taaAntialias: 0.3,
  performanceMode: false,
  toggleKey: "F9",
};

export const ONBOARD_FX_PRESETS: Record<
  Exclude<OnboardFxPresetId, "custom">,
  { name: string; desc: string; values: Partial<Omit<OnboardFxConfig, "enabled" | "onlyOnTrack" | "preset" | "toggleKey">> }
> = {
  onboard_master: {
    name: "🎥 WEC / IMSA Onboard Real (Master)",
    desc: "Máximo realismo de cámara onboard real: sensor CMOS 4:2:2, parabrisas reactivo a la luz, destellos 6 puntas en faros, reflejos de lluvia, FXAA 3.11, debanding 10-bit e iris de cine sin flashes.",
    values: {
      contrast: 1.02,
      saturation: 0.93,
      vibrance: 0.04,
      brightness: 0.99,
      exposure: 0.0,
      warmth: -1,
      tint: 0,
      agxTonemap: 0.26,
      highlightRolloff: 0.34,
      shadowDepth: 0.16,
      casSharpen: 0.26,
      fxaaAntialias: 0.45,
      grassRealism: 0.44,
      skyRealism: 0.28,
      broadcastSensor: 0.68,
      dirtyLens: 0.28,
      starburst: 0.36,
      wetReflections: 0.65,
      deband: 0.6,
      lensDistortion: 0.14,
      chromaticAberration: 0.08,
      vignette: 0.22,
      filmGrain: 0.06,
      lutPreset: 7,
      lutStrength: 0.82,
      autoExposure: true,
      autoExposureSpeed: 0.18,
      cameraShake: true,
      cameraShakeIntensity: 0.95,
      rpmVibration: true,
      rpmVibrationIntensity: 0.85,
      gforceShift: true,
      autoWeatherTimeFx: true,
    },
  },
  imsa_onboard: {
    name: "📹 IMSA Onboard Real (Road Atlanta)",
    desc: "Calibrado con foto real de Cadillac IMSA: LUT integrado sin blancos quemados, cockpit carbón limpio y paleta broadcast natural.",
    values: {
      contrast: 1.02,
      saturation: 0.94,
      vibrance: 0.04,
      brightness: 0.99,
      exposure: 0.0,
      warmth: -2,
      tint: 1,
      agxTonemap: 0.25,
      highlightRolloff: 0.42,
      proMist: 0.14,
      pyramidalBloom: 0.16,
      casSharpen: 0.24,
      grassRealism: 0.55,
      skyRealism: 0.32,
      lumenGi: 0.18,
      lumenSkyBounce: 0.14,
      lensDistortion: 0.16,
      chromaticAberration: 0.1,
      vignette: 0.2,
      filmGrain: 0.08,
      lutPreset: 7,
      lutStrength: 0.9,
      cameraShake: true,
      rpmVibration: true,
      gforceShift: true,
      autoWeatherTimeFx: true,
    },
  },
  onboard_real: {
    name: "🎥 Onboard Real CMOS (Equilibrado)",
    desc: "Aspecto cámara real equilibrado: AgX lineal corregido, negros limpios, Highlight Roll-Off y realismo HSL sin quemar blancos.",
    values: {
      contrast: 1.05,
      saturation: 0.94,
      vibrance: 0.1,
      brightness: 0.98,
      exposure: 0.0,
      warmth: 2,
      tint: -1,
      acesTonemap: 0.0,
      agxTonemap: 0.42,
      giBounce: 0.14,
      proMist: 0.12,
      localHdr: 0.12,
      highlightRolloff: 0.45,
      splitShadowCool: 0.22,
      splitHighlightWarm: 0.16,
      shadowDepth: 0.2,
      lift: 0.01,
      gamma: 0.98,
      gain: 1.0,
      casSharpen: 0.34,
      clarity: 0.24,
      dehaze: 0.14,
      bloom: 0.12,
      halation: 0.12,
      anamorphicFlare: 0.08,
      lensDistortion: 0.18,
      chromaticAberration: 0.14,
      speedBlur: 0.24,
      vignette: 0.28,
      filmGrain: 0.09,
      scanlines: 0,
      lutStrength: 0.35,
      lutPreset: 2,
      autoExposure: false,
      gforceShift: true,
      rpmVibration: true,
      cameraShake: true,
      autoWeatherTimeFx: true,
      pyramidalBloom: 0.2,
      grassRealism: 0.55,
      skyRealism: 0.32,
      sunGodRays: 0.14,
      film35mm: 0.2,
      heatHaze: 0.15,
      temporalMotionBlur: 0.24,
      lumenGi: 0.24,
      lumenSkyBounce: 0.16,
    },
  },
  wec_film: {
    name: "WEC Le Mans Film",
    desc: "LUT cinematográfico cálido, ACES Filmic, CAS Sharpening 45% y Speed Blur sutil.",
    values: {
      contrast: 1.08,
      saturation: 1.06,
      vibrance: 0.22,
      brightness: 1.0,
      exposure: 0.04,
      warmth: 6,
      tint: 0,
      acesTonemap: 0.35,
      casSharpen: 0.45,
      chromaticAberration: 0.14,
      speedBlur: 0.28,
      vignette: 0.32,
      speedVignette: true,
      visorFrame: false,
      visorDirt: 0.12,
      filmGrain: 0.08,
      scanlines: 0,
      rainDrops: true,
      recBadge: false,
      gForceVignette: true,
      cameraShake: true,
      lutStrength: 0.65,
      lutPreset: 1,
    },
  },
  f1_tcam: {
    name: "F1 T-Cam Broadcast",
    desc: "Nitidez CAS alta (65%), LUT TV frío técnico, aberración gran angular y REC.",
    values: {
      contrast: 1.12,
      saturation: 1.02,
      vibrance: 0.18,
      brightness: 1.01,
      exposure: 0.02,
      warmth: -8,
      tint: 0,
      acesTonemap: 0.2,
      casSharpen: 0.65,
      chromaticAberration: 0.22,
      speedBlur: 0.35,
      vignette: 0.24,
      speedVignette: true,
      visorFrame: false,
      visorDirt: 0.06,
      filmGrain: 0.04,
      scanlines: 0,
      rainDrops: true,
      recBadge: true,
      gForceVignette: false,
      cameraShake: true,
      lutStrength: 0.7,
      lutPreset: 2,
    },
  },
  kodak_2383: {
    name: "Kodak 2383 Cinema",
    desc: "Sombras azul petróleo + luces doradas de película 35mm, grano fino y ACES.",
    values: {
      contrast: 1.1,
      saturation: 1.04,
      vibrance: 0.15,
      brightness: 0.99,
      exposure: 0.05,
      warmth: 5,
      tint: -2,
      acesTonemap: 0.5,
      casSharpen: 0.35,
      chromaticAberration: 0.12,
      speedBlur: 0.2,
      vignette: 0.38,
      speedVignette: true,
      visorFrame: false,
      visorDirt: 0.1,
      filmGrain: 0.14,
      scanlines: 0,
      rainDrops: true,
      recBadge: false,
      gForceVignette: true,
      cameraShake: true,
      lutStrength: 0.85,
      lutPreset: 3,
    },
  },
  helmet_gopro: {
    name: "GoPro Visera Casco",
    desc: "Marco de visera, CAS 55%, vibrance alto, aberración cromática y Speed Blur.",
    values: {
      contrast: 1.14,
      saturation: 1.1,
      vibrance: 0.32,
      brightness: 0.98,
      exposure: 0.0,
      warmth: 3,
      tint: 0,
      acesTonemap: 0.25,
      casSharpen: 0.55,
      chromaticAberration: 0.32,
      speedBlur: 0.45,
      vignette: 0.5,
      speedVignette: true,
      visorFrame: true,
      visorDirt: 0.25,
      filmGrain: 0.09,
      scanlines: 0,
      rainDrops: true,
      recBadge: true,
      gForceVignette: true,
      cameraShake: true,
      lutStrength: 0.72,
      lutPreset: 4,
    },
  },
  night_hdr: {
    name: "Noche HDR Resistencia",
    desc: "Negros profundos, realce de faros/pilotos traseros y CAS Sharpening nocturno.",
    values: {
      contrast: 1.18,
      saturation: 1.08,
      vibrance: 0.2,
      brightness: 0.96,
      exposure: 0.06,
      warmth: -10,
      tint: 0,
      acesTonemap: 0.4,
      casSharpen: 0.5,
      chromaticAberration: 0.16,
      speedBlur: 0.25,
      vignette: 0.4,
      speedVignette: true,
      visorFrame: false,
      visorDirt: 0.14,
      filmGrain: 0.1,
      scanlines: 0,
      rainDrops: true,
      recBadge: false,
      gForceVignette: true,
      cameraShake: true,
      lutStrength: 0.85,
      lutPreset: 5,
    },
  },
  vhs_90s: {
    name: "Onboard Retro 90s",
    desc: "Cámara analógica clásica con scanlines, grano visible, aberración y tono cálido.",
    values: {
      contrast: 1.1,
      saturation: 0.86,
      vibrance: -0.05,
      brightness: 0.98,
      exposure: 0.0,
      warmth: 16,
      tint: 3,
      acesTonemap: 0.25,
      casSharpen: 0.1,
      chromaticAberration: 0.45,
      speedBlur: 0.18,
      vignette: 0.48,
      speedVignette: false,
      visorFrame: false,
      visorDirt: 0.2,
      filmGrain: 0.26,
      scanlines: 0.24,
      rainDrops: false,
      recBadge: true,
      gForceVignette: false,
      cameraShake: true,
      lutStrength: 0.5,
      lutPreset: 3,
    },
  },
  clean: {
    name: "Base Limpia (Neutro)",
    desc: "Todos los shaders a cero para ajustar tu propio perfil desde cero.",
    values: {
      contrast: 1.0,
      saturation: 1.0,
      vibrance: 0.0,
      brightness: 1.0,
      exposure: 0.0,
      warmth: 0,
      tint: 0,
      acesTonemap: 0.0,
      casSharpen: 0.0,
      chromaticAberration: 0.0,
      speedBlur: 0.0,
      vignette: 0.0,
      speedVignette: false,
      visorFrame: false,
      visorDirt: 0.0,
      filmGrain: 0.0,
      scanlines: 0.0,
      rainDrops: false,
      recBadge: false,
      gForceVignette: false,
      cameraShake: false,
      lutStrength: 0.0,
      lutPreset: 0,
      bloom: 0.0,
      halation: 0.0,
      lensDistortion: 0.0,
      clarity: 0.0,
      dehaze: 0.0,
      anamorphicFlare: 0.0,
      lift: 0.0,
      gamma: 1.0,
      gain: 1.0,
      autoExposure: false,
      gforceShift: false,
      rpmVibration: false,
      autoWeatherTimeFx: false,
      agxTonemap: 0.0,
      giBounce: 0.0,
      proMist: 0.0,
      localHdr: 0.0,
      highlightRolloff: 0.0,
      splitShadowCool: 0.0,
      splitHighlightWarm: 0.0,
      shadowDepth: 0.0,
      pyramidalBloom: 0.0,
      grassRealism: 0.0,
      skyRealism: 0.0,
      sunGodRays: 0.0,
      film35mm: 0.0,
      heatHaze: 0.0,
      temporalMotionBlur: 0.0,
      lumenGi: 0.0,
      lumenSkyBounce: 0.0,
    },
  },
};

export type ShiftBeepStyle = "gt3" | "f1" | "hypercar";

export interface SoundFxConfig {
  enabled: boolean;
  volume: number; // 0..1
  shiftBeep: boolean;
  shiftBeepStyle: ShiftBeepStyle;
  shiftRpmPct: number; // 92..98
  rotaryClick: boolean;
  liftCoastBeep: boolean;
  absTcPulse: boolean;
  pitLimiterPulse: boolean;
  startLightsBeep: boolean;
  sectorChime: boolean;
  flagsAlert: boolean;
  lapInvalidBuzz: boolean;
  ersWhine: boolean;
  batteryFullChime: boolean;
}

export const DEFAULT_SOUND_FX: SoundFxConfig = {
  enabled: false,
  volume: 0.55,
  shiftBeep: true,
  shiftBeepStyle: "gt3",
  shiftRpmPct: 95,
  rotaryClick: true,
  liftCoastBeep: true,
  absTcPulse: false,
  pitLimiterPulse: true,
  startLightsBeep: true,
  sectorChime: true,
  flagsAlert: true,
  lapInvalidBuzz: true,
  ersWhine: false,
  batteryFullChime: true,
};

export const SOUND_FX_PRESETS: Record<
  "gt3_wec" | "f1_broadcast" | "essentials",
  { name: string; desc: string; values: Partial<SoundFxConfig> }
> = {
  gt3_wec: {
    name: "GT3 / WEC Pro",
    desc: "Shift Bosch GT3, clicks de volante, Lift & Coast, banderas FIA, sectores y ERS.",
    values: {
      shiftBeep: true,
      shiftBeepStyle: "gt3",
      shiftRpmPct: 95,
      rotaryClick: true,
      liftCoastBeep: true,
      absTcPulse: true,
      pitLimiterPulse: true,
      startLightsBeep: true,
      sectorChime: true,
      flagsAlert: true,
      lapInvalidBuzz: true,
      ersWhine: true,
      batteryFullChime: true,
    },
  },
  f1_broadcast: {
    name: "F1 Broadcast",
    desc: "Pitido F1 agudo al 96%, semáforo 5 luces, timbres TV morado/verde y alertas FIA.",
    values: {
      shiftBeep: true,
      shiftBeepStyle: "f1",
      shiftRpmPct: 96,
      rotaryClick: true,
      liftCoastBeep: true,
      absTcPulse: false,
      pitLimiterPulse: false,
      startLightsBeep: true,
      sectorChime: true,
      flagsAlert: true,
      lapInvalidBuzz: true,
      ersWhine: false,
      batteryFullChime: true,
    },
  },
  essentials: {
    name: "Solo Esenciales",
    desc: "Limpio y minimalista: solo Shift Beep, Semáforo, Banderas FIA y Vuelta Invalidada.",
    values: {
      shiftBeep: true,
      shiftBeepStyle: "hypercar",
      shiftRpmPct: 95,
      rotaryClick: false,
      liftCoastBeep: false,
      absTcPulse: false,
      pitLimiterPulse: false,
      startLightsBeep: true,
      sectorChime: false,
      flagsAlert: true,
      lapInvalidBuzz: true,
      ersWhine: false,
      batteryFullChime: false,
    },
  },
};

export interface Audio3DConfig {
  enabled: boolean;
  /** 0 = Binaural HRTF, 1 = 7.1 Virtual Surround, 2 = 8D Dinámico, 3 = 5.1 Cockpit */
  mode: number;
  wetMix: number;
  spatialWidth: number;
  cockpitReverb: number;
  subBassPunch: number;
  helmetResonance: number;
  gforcePanning: boolean;
  aeroWind: number;
  // --- #3: 5-Band Parametric EQ (-12..+12 dB) + Auto-Class ---
  eqSubDb: number;
  eqBassDb: number;
  eqMidDb: number;
  eqPresenceDb: number;
  eqAirDb: number;
  autoByClass: boolean;
  // --- #4: Spatial Rival Proximity Audio (Doppler Left/Right) ---
  rivalProximity: number;
}

export const DEFAULT_AUDIO3D: Audio3DConfig = {
  enabled: false,
  mode: 0,
  wetMix: 0.48,
  spatialWidth: 0.72,
  cockpitReverb: 0.36,
  subBassPunch: 0.42,
  helmetResonance: 0.2,
  gforcePanning: true,
  aeroWind: 0.18,
  eqSubDb: 1.5,
  eqBassDb: 1.0,
  eqMidDb: 0.0,
  eqPresenceDb: 1.2,
  eqAirDb: 0.8,
  autoByClass: true,
  rivalProximity: 0.45,
};

export const AUDIO3D_PRESETS: Record<
  "binaural_gt3" | "surround_71" | "dynamic_8d" | "raw_exhaust",
  { name: string; desc: string; values: Partial<Omit<Audio3DConfig, "enabled">> }
> = {
  binaural_gt3: {
    name: "🎧 Binaural Casco GT3",
    desc: "HRTF realista para auriculares, reflexiones de carbono, calidez de casco y golpe de escape.",
    values: {
      mode: 0,
      wetMix: 0.5,
      spatialWidth: 0.75,
      cockpitReverb: 0.38,
      subBassPunch: 0.45,
      helmetResonance: 0.28,
      gforcePanning: true,
      aeroWind: 0.18,
    },
  },
  surround_71: {
    name: "🔊 7.1 Virtual Surround WEC",
    desc: "Escena envolvente 360° con canales traseros virtuales para sentir tráfico y motores alrededor.",
    values: {
      mode: 1,
      wetMix: 0.56,
      spatialWidth: 0.88,
      cockpitReverb: 0.44,
      subBassPunch: 0.4,
      helmetResonance: 0.12,
      gforcePanning: true,
      aeroWind: 0.22,
    },
  },
  dynamic_8d: {
    name: "🌀 8D Inmersivo G-Force",
    desc: "Rotación espacial 8D suave combinada con inercia lateral en curvas y viento aerodinámico.",
    values: {
      mode: 2,
      wetMix: 0.52,
      spatialWidth: 0.9,
      cockpitReverb: 0.42,
      subBassPunch: 0.38,
      helmetResonance: 0.15,
      gforcePanning: true,
      aeroWind: 0.25,
    },
  },
  raw_exhaust: {
    name: "🔥 Escape Sub-Grave Bruto (5.1)",
    desc: "Excitador armónico de graves 45–135 Hz al máximo para darle cuerpo brutal al motor.",
    values: {
      mode: 3,
      wetMix: 0.58,
      spatialWidth: 0.6,
      cockpitReverb: 0.32,
      subBassPunch: 0.85,
      helmetResonance: 0.18,
      gforcePanning: false,
      aeroWind: 0.1,
    },
  },
};

export interface CustomPersonalityDef {
  id: string;
  name: string;
  description: string;
  llmPrompt: string;
  /** Optional linked MDT-QWEN profile folder name (e.g. "Ingeniero_random") */
  linkedVoiceProfile?: string;
  phrases: Record<string, string[]>;
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
    /** Atajos de teclado globales */
    shortcuts?: AppShortcutsConfig;
    /** Transición animada escalonada al cambiar de perfil de HUD / Broadcast */
    animateProfileSwitch?: boolean;
    /** Animación de encendido/arranque del overlay al salir a pista */
    trackEntryAnim?: TrackEntryAnim;
    /** Reproducir efecto sonoro de encendido sincronizado con la animación de arranque */
    trackEntrySound?: boolean;
    /** Cambiar automáticamente de perfil de HUD según la categoría del coche (Hypercar / LMP2 / LMGT3) */
    autoProfileByClass?: boolean;
    /** Mapeo de categoría -> ID de perfil */
    classProfiles?: Record<string, string>;
    /** Modo Qualy / Hotlap automático (oculta widgets de resistencia durante clasificación) */
    autoQualyMode?: boolean;
    /** Luces ambientales perimetrales en pantalla completa (banderas, paralelo, shift light) */
    ambientEdgeLighting?: boolean;
    /** Alertas televisivas animadas automáticas en pantalla (vuelta rápida, podio, pit stop, FCY) */
    broadcastAlerts?: boolean;
    /** Centro de Animaciones HUD opcionales (#1, #2, #3, #4, #7, #8) */
    animations?: HudAnimationsConfig;
    /** Capa FX de posprocesado Onboard Real entre el juego y el HUD */
    onboardFx?: OnboardFxConfig;
    /** Motor de síntesis de audio de telemetría en tiempo real (SonidosFX) */
    soundFx?: SoundFxConfig;
    /** Motor nativo WASAPI Process-Loopback Binaural / 7.1 / 8D para LMU (MDT-Audio3D) */
    audio3d?: Audio3DConfig;
    /** Personalización visual global en vivo (#11): radio, grosor, desenfoque y textura */
    hudRadius?: number;
    hudBorderWidth?: number;
    hudBlur?: number;
    hudTexture?: "default" | "glass" | "carbon" | "neon";
    /** Guías magnéticas de alineación al arrastrar widgets en modo edición */
    smartGuides?: boolean;
    /** Atenuar automáticamente la opacidad del HUD durante la noche en pista */
    autoNightDim?: boolean;
    /** Opacidad objetivo durante la noche (0.35..0.95) */
    nightOpacity?: number;
    /** Tecla para alternar Modo HUD Limpio / Pánico (oculta widgets secundarios) */
    panicModeKey?: string;
    /** Minimizar a la bandeja del sistema de Windows en lugar de cerrar */
    minimizeToTray?: boolean;
    /** Dispositivos de audio seleccionados dentro de la app (vacío = predeterminado de Windows) */
    audioInputId?: string;
    audioOutputId?: string;
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
    beepsVolume?: number;
    radioEffect: boolean;
    ttsFallback: boolean;
    startSound?: string;
    endSound?: string;
    traffic: boolean;
    flags: boolean;
    strategy: boolean;
    carStatus: boolean;
    session: boolean;
    /** Mensajes de ánimo contextuales en pista (metrónomo, tras error, defensa exitosa, remontada, tramo final, stint limpio) */
    encouragement?: boolean;
    /** Retrasa mensajes no urgentes del spotter en curvas rápidas o frenadas fuertes (#10) */
    quietInFastCorners?: boolean;
    /** Nombre o apodo del piloto para personalizar aleatoriamente las frases de radio (ej. "Miguel") */
    driverName?: string;
    /** Frecuencia con la que el spotter incluye el nombre del piloto (0..1, por defecto 0.35) */
    driverNameFrequency?: number;
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
  /** Ingeniero de Pista IA Local + Voces Clonadas (.onnx / Piper TTS) */
  aiEngineer?: {
    enabled: boolean;
    brainMode: "local_rules" | "ollama" | "lmstudio";
    endpoint: string;
    model: string;
    personality: string;
    voiceEngine: "onnx" | "qwen3" | "system";
    onnxModelPath: string;
    onnxSpeed: number;
    onnxNoiseScale?: number;
    onnxNoiseW?: number;
    /** MDT-QWEN (Qwen3-TTS 0.6B local zero-shot voice cloning · CUDA / ROCm · FP16/BF16) */
    qwen3Profile?: string;
    qwen3Device?: "auto" | "cuda" | "rocm" | "cpu";
    qwen3Dtype?: "fp16" | "bf16" | "fp32";
    qwen3PythonPath?: string;
    qwen3Endpoint?: string;
    /** Auto-start MDT-QWEN GPU server silently when opening MDT-HUD */
    qwen3AutoStart?: boolean;
    /** User-created custom personalities & phrase banks (exportable/importable) */
    customPersonalities?: Record<string, CustomPersonalityDef>;
    /** Usar la voz IA (.onnx o MDT-QWEN) también para todos los avisos en vivo del Spotter */
    useForSpotterEvents?: boolean;
    radioFilter: boolean;
    /** Nivel/estilo de filtro de radio: studio (limpio), wec, f1_vintage o walkie (con ruido blanco) */
    radioPreset?: "studio" | "wec" | "f1_vintage" | "walkie";
    volume: number;
    proactiveEnabled: boolean;
    proactiveEveryLaps: number;
  };
  widgets: Record<string, WidgetConfig>;
  /** Id of the profile mirrored by `general.scale/opacity` and `widgets`. */
  activeProfile: string;
  /** Saved overlay setups: layout, widget options, scale and opacity. */
  profiles: Record<string, Profile>;
  /** Custom dashboards created in MDT Dash Studio (SimHub-style visual editor). */
  customDashboards?: CustomDashboard[];
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
  const st = document.documentElement.style;
  if (g.hudRadius != null) st.setProperty("--hud-radius", `${g.hudRadius}px`);
  else st.removeProperty("--hud-radius");
  if (g.hudBorderWidth != null) st.setProperty("--hud-border-w", `${g.hudBorderWidth}px`);
  else st.removeProperty("--hud-border-w");
  if (g.hudBlur != null && g.hudBlur > 0) st.setProperty("--hud-blur", `${g.hudBlur}px`);
  else st.setProperty("--hud-blur", "0px");
  if (g.hudTexture && g.hudTexture !== "default") {
    document.documentElement.setAttribute("data-hud-texture", g.hudTexture);
  } else {
    document.documentElement.removeAttribute("data-hud-texture");
  }
}

export type TrackEntryAnim =
  | "ignition"
  | "telemetry-boot"
  | "grid-launch"
  | "hypercar-pulse"
  | "cinematic-fade"
  | "none";

export const TRACK_ENTRY_ANIMS: { value: TrackEntryAnim; label: string; desc: string }[] = [
  { value: "ignition", label: "🔑 Encendido Cockpit (Ignition Sweep)", desc: "Barrido luminoso y despliegue progresivo tipo cuadro Hypercar" },
  { value: "telemetry-boot", label: "⚡ Boot Telemetría (Holograma DDU)", desc: "Parpadeo digital de arranque y apertura vertical estilo volante F1/WEC" },
  { value: "grid-launch", label: "🚀 Arranque en Parrilla (Slide Converge)", desc: "Entrada deslizada con desaceleración elástica y enfoque progresivo" },
  { value: "hypercar-pulse", label: "🔥 Pulso Hypercar (Sobrecarga ERS)", desc: "Destello energético en bordes con zoom de alta tensión en cascada" },
  { value: "cinematic-fade", label: "🎬 Broadcast TV (Cortinilla WEC)", desc: "Revelado limpio de izquierda a derecha estilo retransmisión oficial" },
  { value: "none", label: "Sin animación (Instantánea)", desc: "Aparece al instante sin transición de carga" },
];

export const BATTLE_SOUNDS = [
  { value: "Battle.mp3", label: "Clásico (Battle.mp3)" },
  { value: "aura-mp3_MCdhuKZ.mp3", label: "Aura (aura-mp3_MCdhuKZ.mp3)" },
  { value: "battlebus.mp3", label: "Battle Bus (battlebus.mp3)" },
  { value: "cowboy-stand-off.mp3", label: "Cowboy Stand-Off (cowboy-stand-off.mp3)" },
  { value: "doue-aura.mp3", label: "Doué Aura (doue-aura.mp3)" },
  { value: "pokemon-battle.mp3", label: "Pokémon Battle (pokemon-battle.mp3)" },
  { value: "random", label: "🎲 Aleatorio (cualquiera)" },
] as const;

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
      { key: "animateSectorFlash", label: "Flash animado en sectores morado/verde y mejor vuelta", type: "boolean" },
    ],
    optionDefaults: { reference: "pb", range: 2, animateSectorFlash: true },
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
      { key: "showPenalties", label: "Puntos / sanciones de penalización", type: "boolean" },
      { key: "showDamage", label: "Porcentaje de daño del coche", type: "boolean" },
      { key: "showPitDuration", label: "Tiempo de parada en boxes", type: "boolean" },
      { key: "animatePositions", label: "Animación WEC al intercambiar posiciones (verde sube / rojo baja)", type: "boolean" },
      { key: "animateSectorFlash", label: "Destello morado/verde al marcar vuelta rápida o mejora personal", type: "boolean" },
      { key: "animatePitAlerts", label: "Animación deslizante al entrar y salir de boxes (PIT)", type: "boolean" },
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
      showPenalties: false,
      showDamage: false,
      showPitDuration: false,
      animatePositions: true,
      animateSectorFlash: true,
      animatePitAlerts: true,
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
      { key: "showBackground", label: "Mostrar fondo y recuadro del radar", type: "boolean" },
      { key: "showRings", label: "Anillos de distancia", type: "boolean" },
      { key: "animateTransitions", label: "Transición suave de aparición y pulso en zona roja", type: "boolean" },
    ],
    optionDefaults: { range: 14, autoHide: false, showBackground: true, showRings: true, animateTransitions: true },
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
    options: [
      { key: "animateTransitions", label: "Animación expansiva, barrido de luz y flash de Bandera Verde", type: "boolean" },
    ],
    optionDefaults: { animateTransitions: true },
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
      { key: "showPitRejoin", label: "Mostrar punto fantasma de salida de boxes (PIT)", type: "boolean" },
      { key: "pitLossSec", label: "Pérdida estimada en boxes para el punto fantasma (s)", type: "number", min: 15, max: 80, step: 1 },
    ],
    optionDefaults: { showFrame: true, size: 240, classColors: true, showPitRejoin: false, pitLossSec: 32 },
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
      { key: "animateTransitions", label: "Animación split-wipe de entrada y pulso en duelo cerrado (<0.35s)", type: "boolean" },
    ],
    optionDefaults: {
      deltaThreshold: 1.0,
      showTyres: true,
      soundFile: "Battle.mp3",
      showInterval: true,
      showSpeed: true,
      showClassBadge: true,
      sameClassOnly: true,
      soundAlert: true,
      soundVolume: 0.8,
      animateTransitions: true,
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
  {
    id: "spotter",
    name: "Radio de Spotter (Team Radio)",
    description: "Widget animado estilo Team Radio / WEC que aparece en pantalla cuando el spotter o ingeniero transmite un mensaje de voz o aviso.",
    defaults: { enabled: true, x: 740, y: 70 },
    options: [
      {
        key: "style",
        label: "Estilo visual de la radio (4 diseños)",
        type: "select",
        choices: [
          { value: "wec", label: "Banner oficial WEC / Broadcast" },
          { value: "f1", label: "Gráfico TV Fórmula 1 (Team Radio)" },
          { value: "compact", label: "Cápsula deportiva moderna" },
          { value: "cyber", label: "Táctico / Cyberpunk Monospace" },
        ],
      },
      { key: "showText", label: "Mostrar texto y subtítulo de la radio", type: "boolean" },
      { key: "showEqualizer", label: "Mostrar ondas animadas de transmisión", type: "boolean" },
      { key: "showProfile", label: "Mostrar nombre del ingeniero (Sara / Antonio)", type: "boolean" },
      { key: "showCategoryBadge", label: "Mostrar insignia de evento (Banderas, PB, Tráfico)", type: "boolean" },
      { key: "animateTransitions", label: "Animación de entrada/salida y barrido de luz al transmitir", type: "boolean" },
    ],
    optionDefaults: {
      style: "wec",
      showText: true,
      showEqualizer: true,
      showProfile: true,
      showCategoryBadge: true,
      startSound: "1.mp3",
      endSound: "f1-radio-end.mp3",
      beepsVolume: 0.85,
      animateTransitions: true,
    },
  },
  {
    id: "pitrejoin",
    name: "Predicción de Salida de Boxes (Pit Rejoin)",
    description: "Calcula en qué posición y con qué rivales saldrías a pista si entrases a boxes ahora mismo (aire limpio vs tráfico).",
    defaults: { enabled: false, x: 1600, y: 520 },
    options: [
      { key: "pitLossSec", label: "Pérdida estimada por parada en boxes (segundos)", type: "number", min: 15, max: 80, step: 1 },
      { key: "sameClassOnly", label: "Calcular posición solo dentro de mi categoría", type: "boolean" },
      { key: "showGaps", label: "Mostrar coches estimados delante y detrás", type: "boolean" },
    ],
    optionDefaults: {
      pitLossSec: 32,
      sameClassOnly: true,
      showGaps: true,
    },
  },
  {
    id: "multiclasstraffic",
    name: "Alertas de Tráfico Multicategoría",
    description: "Aviso automático cuando un Hypercar/LMP2 rápido se acerca por detrás o cuando te aproximas a un GT3 doblado.",
    defaults: { enabled: false, x: 805, y: 150 },
    options: [
      { key: "showFasterBehind", label: "Alertar categoría superior acercándose por detrás", type: "boolean" },
      { key: "behindThreshold", label: "Umbral tráfico rápido detrás (segundos)", type: "number", min: 1.0, max: 5.0, step: 0.2 },
      { key: "showSlowerAhead", label: "Alertar categoría inferior delante", type: "boolean" },
      { key: "aheadThreshold", label: "Umbral tráfico lento delante (segundos)", type: "number", min: 0.8, max: 4.0, step: 0.2 },
    ],
    optionDefaults: {
      showFasterBehind: true,
      behindThreshold: 2.5,
      showSlowerAhead: true,
      aheadThreshold: 2.0,
    },
  },
  {
    id: "brakelockup",
    name: "Monitor de Frenos y Bloqueos (BB / Lockup)",
    description: "Reparto de frenada (Brake Bias), temperatura de los 4 discos de freno y alertas instantáneas de bloqueo (ABS) o patinaje (TC).",
    defaults: { enabled: false, x: 1320, y: 740 },
    options: [
      { key: "showBias", label: "Mostrar barra de reparto de frenada (Brake Bias)", type: "boolean" },
      { key: "showTemps", label: "Mostrar temperatura de los 4 discos (FL/FR/RL/RR)", type: "boolean" },
      { key: "showAlerts", label: "Mostrar avisos de ABS / Lockup y TC / Spin", type: "boolean" },
    ],
    optionDefaults: {
      showBias: true,
      showTemps: true,
      showAlerts: true,
    },
  },
  {
    id: "stintpace",
    name: "Ritmo de Stint y Degradación",
    description: "Gráfica de barras de tus últimas vueltas del stint con aviso automático de caída de ritmo (Tyre Cliff).",
    defaults: { enabled: false, x: 1590, y: 310 },
    options: [
      { key: "maxLaps", label: "Número de vueltas visibles en la gráfica", type: "number", min: 5, max: 12, step: 1 },
      { key: "showTrend", label: "Mostrar etiqueta de estado (Sólido / Degradando / Cliff)", type: "boolean" },
    ],
    optionDefaults: {
      maxLaps: 8,
      showTrend: true,
    },
  },
  {
    id: "driverlowerthird",
    name: "Tarjeta TV de Piloto Enfocado (Lower-Third)",
    description: "Gráfico inferior estilo WEC/F1 que aparece automáticamente al enfocar a cualquier piloto en Standings o Broadcast.",
    defaults: { enabled: false, x: 725, y: 890 },
    options: [
      { key: "alwaysVisible", label: "Mantener siempre visible (en lugar de auto-ocultar)", type: "boolean" },
      { key: "displaySeconds", label: "Segundos visible al cambiar de piloto", type: "number", min: 3, max: 15, step: 1 },
      { key: "showLogo", label: "Mostrar logo de marca del coche", type: "boolean" },
      { key: "showStats", label: "Mostrar barra inferior (mejor vuelta, gomas, boxes, energía)", type: "boolean" },
    ],
    optionDefaults: {
      alwaysVisible: false,
      displaySeconds: 6,
      showLogo: true,
      showStats: true,
    },
  },
  {
    id: "headtohead",
    name: "Comparador Cara a Cara (Head-to-Head TV)",
    description: "Compara en directo velocidad, vueltas, sectores, neumáticos y energía virtual de dos pilotos en pista.",
    defaults: { enabled: false, x: 740, y: 610 },
    options: [
      {
        key: "mode",
        label: "Pareja de coches a comparar",
        type: "select",
        choices: [
          { value: "auto_ahead", label: "Piloto enfocado vs coche de delante" },
          { value: "auto_leader", label: "Piloto enfocado vs líder de categoría" },
          { value: "top2", label: "Lucha por el liderato (P1 vs P2 de clase)" },
        ],
      },
      { key: "showSectors", label: "Mostrar comparativa de sectores (S1 / S2)", type: "boolean" },
      { key: "showEnergy", label: "Mostrar compuestos, energía virtual y paradas", type: "boolean" },
    ],
    optionDefaults: {
      mode: "auto_ahead",
      showSectors: true,
      showEnergy: true,
    },
  },
  {
    id: "gridpodium",
    name: "Parrilla de Salida y Podio Final (TV)",
    description: "Gráfico televisivo automático con la Parrilla de Salida antes de la carrera y el Podio Top 3 por categoría al finalizar.",
    defaults: { enabled: false, x: 690, y: 180 },
    options: [
      {
        key: "displayMode",
        label: "Modo de visualización",
        type: "select",
        choices: [
          { value: "auto", label: "Automático (Parrilla en salida / Podio en bandera a cuadros)" },
          { value: "force_grid", label: "Forzar vista de Parrilla de Salida" },
          { value: "force_podium", label: "Forzar vista de Podio Top 3" },
        ],
      },
      { key: "showGrid", label: "Mostrar automáticamente en parrilla / salida", type: "boolean" },
      { key: "showPodium", label: "Mostrar automáticamente al cruzar bandera a cuadros", type: "boolean" },
      { key: "maxGridRows", label: "Máximo de pilotos en Parrilla de Salida", type: "number", min: 4, max: 24, step: 2 },
    ],
    optionDefaults: {
      displayMode: "auto",
      showGrid: true,
      showPodium: true,
      maxGridRows: 10,
    },
  },
  {
    id: "customdash",
    name: "Dashboard Personalizado (MDT Dash Studio)",
    description: "Muestra el volante o HUD diseñado al píxel por ti en la pestaña Dash Studio (estilo SimHub).",
    defaults: { enabled: false, x: 640, y: 710 },
    options: [],
    optionDefaults: {
      dashboardId: "",
    },
  },
  {
    id: "pitbox",
    name: "Guía de Frenada en Boxes (Pit Box Meter)",
    description: "Aparece automáticamente al entrar al pit lane con barra de aproximación, alerta de velocidad, limitador y crono de parada.",
    defaults: { enabled: false, x: 805, y: 220 },
    options: [
      { key: "pitLimitKmh", label: "Límite de pit lane (km/h)", type: "number", min: 50, max: 100, step: 10 },
      { key: "alwaysShow", label: "Mostrar siempre (incluso fuera de boxes)", type: "boolean" },
    ],
    optionDefaults: {
      pitLimitKmh: 60,
      alwaysShow: false,
    },
  },
  {
    id: "liveghost",
    name: "Comparador Vuelta Fantasma (Live Trace PB)",
    description: "Superpone tu acelerador y freno en tiempo real contra tu mejor vuelta (PB) con vista anticipada de la próxima frenada.",
    defaults: { enabled: false, x: 760, y: 840 },
    options: [
      { key: "width", label: "Ancho (px)", type: "number", min: 260, max: 540, step: 20 },
      { key: "lookBehindMeters", label: "Historial atrás (m)", type: "number", min: 100, max: 500, step: 20 },
      { key: "lookAheadMeters", label: "Vista anticipada PB (m)", type: "number", min: 40, max: 300, step: 20 },
      { key: "showSpeedDelta", label: "Mostrar delta de velocidad vs PB", type: "boolean" },
    ],
    optionDefaults: {
      width: 360,
      lookBehindMeters: 260,
      lookAheadMeters: 140,
      showSpeedDelta: true,
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
      shortcuts: { ...DEFAULT_SHORTCUTS },
      animateProfileSwitch: true,
      trackEntryAnim: "ignition",
      trackEntrySound: true,
      autoProfileByClass: false,
      classProfiles: { Hypercar: "", LMP2: "", LMP3: "", LMGT3: "" },
      autoQualyMode: false,
      ambientEdgeLighting: false,
      broadcastAlerts: true,
      animations: { ...DEFAULT_ANIMATIONS },
      onboardFx: { ...DEFAULT_ONBOARD_FX },
      soundFx: { ...DEFAULT_SOUND_FX },
      audio3d: { ...DEFAULT_AUDIO3D },
      hudRadius: 10,
      hudBorderWidth: 1,
      hudBlur: 0,
      hudTexture: "default",
      smartGuides: true,
      autoNightDim: false,
      nightOpacity: 0.68,
    },
    online: { enabled: false, lapUpload: "manual", anonymous: false, uploadTraces: true },
    spotter: {
      enabled: true,
      profile: "Sara",
      volume: 0.85,
      beepsVolume: 0.85,
      radioEffect: true,
      ttsFallback: true,
      startSound: "1.mp3",
      endSound: "f1-radio-end.mp3",
      traffic: true,
      flags: true,
      strategy: true,
      carStatus: true,
      session: true,
      encouragement: true,
    },
    discord: {
      enabled: true,
      webhookUrl: "",
      botName: "Ingeniera MDT",
      autoExport: true,
    },
    broadcast: {
      enabled: true,
      driverName: "",
      brokerUrl: "wss://broker.hivemq.com:8884/mqtt",
      rateHz: 15,
    },
    aiEngineer: {
      enabled: false,
      brainMode: "local_rules",
      endpoint: "http://127.0.0.1:11434",
      model: "gemma3:4b",
      personality: "wec_pro",
      voiceEngine: "onnx",
      onnxModelPath: "",
      onnxSpeed: 0.96,
      onnxNoiseScale: 0.62,
      onnxNoiseW: 0.78,
      qwen3Profile: "Antonio",
      qwen3Device: "auto",
      qwen3Dtype: "fp16",
      qwen3PythonPath: "",
      qwen3Endpoint: "http://127.0.0.1:18421",
      qwen3AutoStart: false,
      customPersonalities: {},
      useForSpotterEvents: true,
      radioFilter: true,
      radioPreset: "wec",
      volume: 0.9,
      proactiveEnabled: false,
      proactiveEveryLaps: 3,
    },
    widgets,
    activeProfile: "default",
    profiles: { default: { name: "Por defecto", scale: 1, opacity: 0.92, widgets: structuredClone(widgets) } },
    customDashboards: [createTemplateDashboard("gt3-pro")],
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
  const general = {
    ...base.general,
    ...(stored.general ?? {}),
    animations: { ...DEFAULT_ANIMATIONS, ...(stored.general?.animations ?? {}) },
    onboardFx: { ...DEFAULT_ONBOARD_FX, ...(stored.general?.onboardFx ?? {}) },
    soundFx: { ...DEFAULT_SOUND_FX, ...(stored.general?.soundFx ?? {}) },
    audio3d: { ...DEFAULT_AUDIO3D, ...(stored.general?.audio3d ?? {}) },
  };
  if (general.theme !== "custom" && !(general.theme in HUD_THEMES)) {
    general.theme = "mdt-aura";
  }
  const online = { ...base.online, ...(stored.online ?? {}) };
  const spotter = { ...base.spotter, ...(stored.spotter ?? {}) };
  const discord = { ...base.discord, ...(stored.discord ?? {}) };
  // Clear legacy/revoked default webhook so clients transparently use the protected Rust backend channel
  if (!discord.webhookUrl || discord.webhookUrl.includes("1571662308269232189") || !discord.webhookUrl.startsWith("https://")) {
    discord.webhookUrl = "";
  }
  if (!discord.botName || discord.botName === "MDT-HUD Telemetría") {
    discord.botName = "Ingeniera MDT";
  }
  if (discord.enabled === undefined) discord.enabled = true;
  if (discord.autoExport === undefined) discord.autoExport = true;
  const broadcast = { ...base.broadcast, ...(stored.broadcast ?? {}) };
  if (broadcast.enabled === undefined) broadcast.enabled = true;
  const aiEngineer = { ...base.aiEngineer!, ...(stored.aiEngineer ?? {}) };
  if (aiEngineer.voiceEngine !== "onnx" && aiEngineer.voiceEngine !== "qwen3" && aiEngineer.voiceEngine !== "system") {
    aiEngineer.voiceEngine = "onnx";
  }
  if (aiEngineer.onnxModelPath && aiEngineer.onnxModelPath.includes("es_ES-davefx-medium")) {
    aiEngineer.onnxModelPath = aiEngineer.onnxModelPath.replace("es_ES-davefx-medium", "Carlos_MDT");
  }
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
  const customDashboards: CustomDashboard[] =
    Array.isArray(stored.customDashboards) && stored.customDashboards.length > 0
      ? stored.customDashboards
      : base.customDashboards ?? [createTemplateDashboard("gt3-pro")];
  return { ...base, general, online, spotter, discord, broadcast, aiEngineer, widgets, activeProfile, profiles, customDashboards };
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
  if (next.aiEngineer) Object.assign(config.value.aiEngineer, next.aiEngineer);
  for (const [id, wNext] of Object.entries(next.widgets)) {
    if (config.value.widgets[id]) {
      config.value.widgets[id].enabled = wNext.enabled;
      config.value.widgets[id].x = wNext.x;
      config.value.widgets[id].y = wNext.y;
      config.value.widgets[id].size = wNext.size;
      config.value.widgets[id].scaleX = wNext.scaleX;
      config.value.widgets[id].scaleY = wNext.scaleY;
      config.value.widgets[id].alpha = wNext.alpha;
      config.value.widgets[id].locked = wNext.locked;
      config.value.widgets[id].autoFadeInCorners = wNext.autoFadeInCorners;
      Object.assign(config.value.widgets[id].options, wNext.options);
    } else {
      config.value.widgets[id] = wNext;
    }
  }
  config.value.activeProfile = next.activeProfile;
  config.value.profiles = next.profiles;
  if (Array.isArray(next.customDashboards) && next.customDashboards.length > 0) {
    config.value.customDashboards = next.customDashboards;
  }
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

/** Cambia cíclicamente al siguiente perfil de overlay configurado. */
export function cycleNextProfile() {
  const profileIds = Object.keys(config.value.profiles);
  if (profileIds.length <= 1) return;
  const currentIdx = profileIds.indexOf(config.value.activeProfile);
  const nextIdx = (currentIdx + 1) % profileIds.length;
  switchProfile(profileIds[nextIdx]);
}

/** Devuelve todos los widgets activos al área visible de la pantalla principal si se quedaron fuera o en puntos muertos */
export function recoverWidgetsToPrimaryScreen(screenWidth = 1920, screenHeight = 1080) {
  const w = config.value.widgets;
  for (const [id, cfg] of Object.entries(w)) {
    if (!cfg.enabled) continue;
    // Si el widget está fuera de los márgenes de la pantalla principal
    if (cfg.x < 0 || cfg.x > screenWidth - 100 || cfg.y < 0 || cfg.y > screenHeight - 60) {
      const def = WIDGETS.find((m) => m.id === id)?.defaults;
      if (def) {
        cfg.x = def.x;
        cfg.y = def.y;
      } else {
        cfg.x = Math.max(20, Math.min(screenWidth - 300, cfg.x));
        cfg.y = Math.max(20, Math.min(screenHeight - 150, cfg.y));
      }
    }
  }
  syncActiveProfile();
  saveConfig();
}

/** Exporta la configuración completa (perfiles, posiciones, tema, spotter y dashboards) como JSON .mdtprofile */
export function exportFullProfileJson(): string {
  syncActiveProfile();
  const payload = {
    format: "mdt-hud-profile",
    version: 1,
    exportedAt: new Date().toISOString(),
    config: $state.snapshot(config.value),
  };
  return JSON.stringify(payload, null, 2);
}

/** Importa un archivo .mdtprofile y aplica la configuración completa */
export function importFullProfileJson(raw: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(raw);
    const incoming = parsed?.format === "mdt-hud-profile" && parsed?.config ? parsed.config : parsed;
    if (!incoming || typeof incoming !== "object" || !incoming.widgets || !incoming.general) {
      return { ok: false, message: "El archivo no es un perfil .mdtprofile válido." };
    }
    const merged = mergeWithDefaults(incoming);
    config.value = merged;
    applyThemeToDom(merged.general);
    saveConfig();
    return { ok: true, message: "✓ Perfil completo importado y aplicado correctamente." };
  } catch {
    return { ok: false, message: "Error al leer el archivo .mdtprofile (JSON inválido)." };
  }
}
