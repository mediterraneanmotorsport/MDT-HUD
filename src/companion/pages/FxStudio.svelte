<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy, onMount } from "svelte";
  import { isNativeTauri } from "../../lib/api";
  import {
    AUDIO3D_PRESETS,
    CLEAN_FX_SLIDERS,
    config,
    DEFAULT_AUDIO3D,
    DEFAULT_ONBOARD_FX,
    DEFAULT_SOUND_FX,
    ONBOARD_FX_PRESETS,
    SOUND_FX_PRESETS,
    saveConfig,
    type Audio3DConfig,
    type OnboardFxConfig,
    type OnboardFxPresetId,
    type ShiftBeepStyle,
    type SoundFxConfig,
    type UserFxPreset,
  } from "../../lib/config.svelte";
  import { soundFx, type SoundFxTestKind } from "../../lib/soundFx.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import LutGeneratorCard from "../components/LutGeneratorCard.svelte";
  import Toggle from "../components/Toggle.svelte";

  let activeTab = $state<"visual" | "audio3d" | "sound">("visual");
  let subNavEl = $state<HTMLElement | null>(null);
  let subTabRefs: Record<string, HTMLButtonElement | null> = {};
  let subTabBar = $state({ left: 0, width: 0, visible: false });

  $effect(() => {
    const tab = activeTab;
    requestAnimationFrame(() => {
      const el = subTabRefs[tab];
      if (!el || !subNavEl) return;
      const nr = subNavEl.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      subTabBar = { left: r.left - nr.left, width: r.width, visible: true };
    });
  });

  let audio3dStatus = $state<{
    running: boolean;
    lmuPid: number;
    sampleRate: number;
    peakLevel: number;
    lastError: string;
  }>({
    running: false,
    lmuPid: 0,
    sampleRate: 48000,
    peakLevel: 0,
    lastError: "",
  });

  function ensureAudio3D(): Audio3DConfig {
    if (!config.value.general.audio3d) {
      config.value.general.audio3d = { ...DEFAULT_AUDIO3D };
    }
    return config.value.general.audio3d;
  }

  const a3d = $derived(config.value.general.audio3d ?? DEFAULT_AUDIO3D);

  function pushAudio3D(a: Audio3DConfig) {
    if (!isNativeTauri()) return;
    void invoke("update_audio3d", {
      params: {
        enabled: Boolean(a.enabled),
        mode: a.mode ?? 0,
        wetMix: a.wetMix ?? 0.48,
        spatialWidth: a.spatialWidth ?? 0.72,
        cockpitReverb: a.cockpitReverb ?? 0.36,
        subBassPunch: a.subBassPunch ?? 0.42,
        helmetResonance: a.helmetResonance ?? 0.2,
        gforcePanning: Boolean(a.gforcePanning),
        aeroWind: a.aeroWind ?? 0.18,
        eqSubDb: a.eqSubDb ?? 0,
        eqBassDb: a.eqBassDb ?? 0,
        eqMidDb: a.eqMidDb ?? 0,
        eqPresenceDb: a.eqPresenceDb ?? 0,
        eqAirDb: a.eqAirDb ?? 0,
        autoByClass: Boolean(a.autoByClass),
        rivalProximity: a.rivalProximity ?? 0.45,
      },
    }).catch(() => {});
  }

  function updateAudio3DField<K extends keyof Audio3DConfig>(
    key: K,
    val: Audio3DConfig[K],
  ) {
    const target = ensureAudio3D();
    target[key] = val;
    saveConfig();
    pushAudio3D(target);
  }

  function applyAudio3DPreset(id: keyof typeof AUDIO3D_PRESETS) {
    const target = ensureAudio3D();
    Object.assign(target, AUDIO3D_PRESETS[id].values);
    target.enabled = true;
    saveConfig();
    pushAudio3D(target);
  }

  function ensureSoundFx(): SoundFxConfig {
    if (!config.value.general.soundFx) {
      config.value.general.soundFx = { ...DEFAULT_SOUND_FX };
    }
    return config.value.general.soundFx;
  }

  const sfx = $derived(config.value.general.soundFx ?? DEFAULT_SOUND_FX);

  function updateSoundField<K extends keyof SoundFxConfig>(
    key: K,
    val: SoundFxConfig[K],
  ) {
    const target = ensureSoundFx();
    target[key] = val;
    saveConfig();
  }

  function applySoundPreset(id: keyof typeof SOUND_FX_PRESETS) {
    const target = ensureSoundFx();
    Object.assign(target, SOUND_FX_PRESETS[id].values);
    target.enabled = true;
    saveConfig();
  }

  let ioStatus = $state("");
  let importInput: HTMLInputElement | undefined = $state();
  let cubeInput: HTMLInputElement | undefined = $state();

  let engineStatus = $state<{
    running: boolean;
    fps: number;
    lutName: string;
    lutSize: number;
    lastError: string;
  }>({ running: false, fps: 0, lutName: "", lutSize: 0, lastError: "" });

  let statusTimer: ReturnType<typeof setInterval> | null = null;

  function ensureFx(): OnboardFxConfig {
    if (!config.value.general.onboardFx) {
      config.value.general.onboardFx = { ...DEFAULT_ONBOARD_FX };
    }
    return config.value.general.onboardFx;
  }

  const fx = $derived(config.value.general.onboardFx ?? DEFAULT_ONBOARD_FX);

  function pushNativeFx(f: OnboardFxConfig) {
    if (!isNativeTauri()) return;
    void invoke("update_native_fx", {
      params: {
        enabled: Boolean(f.enabled),
        onlyOnTrack: Boolean(f.onlyOnTrack),
        contrast: f.contrast ?? 1.0,
        saturation: f.saturation ?? 1.0,
        vibrance: f.vibrance ?? 0.0,
        brightness: f.brightness ?? 1.0,
        exposure: f.exposure ?? 0.0,
        warmth: (f.warmth ?? 0) / 30.0,
        tint: (f.tint ?? 0) / 30.0,
        acesTonemap: f.acesTonemap ?? 0.0,
        casSharpen: f.casSharpen ?? 0.0,
        chromaticAberration: f.chromaticAberration ?? 0.0,
        speedBlur: f.speedBlur ?? 0.0,
        vignette: f.vignette ?? 0.0,
        speedVignette: Boolean(f.speedVignette),
        gforceVignette: Boolean(f.gForceVignette),
        cameraShake: Boolean(f.cameraShake),
        filmGrain: f.filmGrain ?? 0.0,
        scanlines: f.scanlines ?? 0.0,
        lutStrength: f.lutStrength ?? 0.0,
        lutPreset: f.lutPreset ?? 0,
        bloom: f.bloom ?? 0.0,
        halation: f.halation ?? 0.0,
        lensDistortion: f.lensDistortion ?? 0.0,
        clarity: f.clarity ?? 0.0,
        dehaze: f.dehaze ?? 0.0,
        anamorphicFlare: f.anamorphicFlare ?? 0.0,
        lift: f.lift ?? 0.0,
        gamma: f.gamma ?? 1.0,
        gain: f.gain ?? 1.0,
        autoExposure: Boolean(f.autoExposure),
        gforceShift: Boolean(f.gforceShift),
        rpmVibration: Boolean(f.rpmVibration),
        autoWeatherTimeFx: Boolean(f.autoWeatherTimeFx),
        agxTonemap: f.agxTonemap ?? 0.0,
        giBounce: f.giBounce ?? 0.0,
        proMist: f.proMist ?? 0.0,
        localHdr: f.localHdr ?? 0.0,
        highlightRolloff: f.highlightRolloff ?? 0.0,
        splitShadowCool: f.splitShadowCool ?? 0.0,
        splitHighlightWarm: f.splitHighlightWarm ?? 0.0,
        shadowDepth: f.shadowDepth ?? 0.0,
        splitScreen: f.splitScreen ?? 0.0,
        cameraShakeIntensity: f.cameraShakeIntensity ?? 1.0,
        rpmVibrationIntensity: f.rpmVibrationIntensity ?? 1.0,
        pyramidalBloom: f.pyramidalBloom ?? 0.0,
        grassRealism: f.grassRealism ?? 0.0,
        skyRealism: f.skyRealism ?? 0.0,
        sunGodRays: f.sunGodRays ?? 0.0,
        film35mm: f.film35mm ?? 0.0,
        heatHaze: f.heatHaze ?? 0.0,
        temporalMotionBlur: f.temporalMotionBlur ?? 0.0,
        lumenGi: f.lumenGi ?? 0.0,
        lumenSkyBounce: f.lumenSkyBounce ?? 0.0,
        linearColorSpace: Boolean(f.linearColorSpace),
        colorSpace: f.colorSpace ?? 0,
        colorSpaceStrength: f.colorSpaceStrength ?? 1.0,
        taaAntialias: f.taaAntialias ?? 0.0,
        performanceMode: Boolean(f.performanceMode),
        fxaaAntialias: f.fxaaAntialias ?? 0.0,
        cinematicDof: f.cinematicDof ?? 0.0,
        dofFocus: f.dofFocus ?? 0.5,
        autoExposureSpeed: f.autoExposureSpeed ?? 0.22,
        longExposure: f.longExposure ?? 0.0,
        starburst: f.starburst ?? 0.0,
        dirtyLens: f.dirtyLens ?? 0.0,
        broadcastSensor: f.broadcastSensor ?? 0.0,
        wetReflections: f.wetReflections ?? 0.0,
        deband: f.deband ?? 0.0,
        surfaceBlur: f.surfaceBlur ?? 0.0,
        dpxFilm: f.dpxFilm ?? 0.0,
        vhsRf: f.vhsRf ?? 0.0,
      },
    }).catch(() => {});
  }

  async function refreshStatus() {
    if (!isNativeTauri()) return;
    try {
      engineStatus = await invoke("get_native_fx_status");
    } catch {}
    try {
      audio3dStatus = await invoke("get_audio3d_status");
    } catch {}
  }

  let cubeLuts = $state<{ name: string; path: string }[]>([]);
  let libraryPresets = $state<{ name: string; category: string; path: string }[]>([]);
  let libSearch = $state("");
  let libCategory = $state("ALL");
  let activeLibraryPreset = $state("");
  let newPresetName = $state("");
  let renamingPresetId = $state<string | null>(null);
  let renamingText = $state("");

  async function refreshLibraryPresets() {
    if (!isNativeTauri()) return;
    try {
      libraryPresets = await invoke<{ name: string; category: string; path: string }[]>("list_fx_preset_files");
    } catch {}
  }

  async function applyLibraryPreset(entry: { name: string; category: string; path: string }) {
    if (!isNativeTauri()) return;
    try {
      const text = await invoke<string>("read_fx_preset_file", { path: entry.path });
      const parsed = JSON.parse(text);
      const data = parsed?.fx ?? parsed;
      if (!data || typeof data !== "object") throw new Error("Formato no válido");
      const target = ensureFx();
      Object.assign(target, CLEAN_FX_SLIDERS, data);
      target.preset = "custom";
      target.enabled = true;
      activeLibraryPreset = entry.name;
      saveConfig();
      pushNativeFx(target);
      ioStatus = `✓ Aplicado ${entry.name}`;
      setTimeout(() => (ioStatus = ""), 2500);
    } catch (err) {
      ioStatus = `✗ ${String(err)}`;
      setTimeout(() => (ioStatus = ""), 3500);
    }
  }

  const libCategories = $derived([
    "ALL",
    ...Array.from(new Set(libraryPresets.map((p) => p.category))).sort(),
  ]);

  const filteredLibraryPresets = $derived(
    libraryPresets.filter((p) => {
      if (libCategory !== "ALL" && p.category !== libCategory) return false;
      const q = libSearch.trim().toLowerCase();
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    }),
  );

  async function refreshCubeLuts() {
    if (!isNativeTauri()) return;
    try {
      cubeLuts =
        await invoke<{ name: string; path: string }[]>("list_fx_cube_luts");
    } catch {}
  }

  async function selectCubeLut(entry: { name: string; path: string }) {
    if (!isNativeTauri()) return;
    try {
      const [name, size] = await invoke<[string, number]>(
        "load_fx_cube_lut_file",
        { path: entry.path },
      );
      const target = ensureFx();
      target.lutPreset = 6;
      target.customLutPath = entry.path;
      if ((target.lutStrength ?? 0) < 0.05) target.lutStrength = 0.85;
      target.preset = "custom";
      saveConfig();
      pushNativeFx(target);
      void refreshStatus();
      ioStatus = `✓ LUT ${name} (${size}³)`;
      setTimeout(() => (ioStatus = ""), 2500);
    } catch (err) {
      ioStatus = `✗ ${String(err)}`;
      setTimeout(() => (ioStatus = ""), 3500);
    }
  }

  async function openPresetsFolder() {
    if (!isNativeTauri()) return;
    try {
      await invoke("open_fx_presets_folder");
    } catch {}
  }

  function snapshotFxValues(src: OnboardFxConfig): UserFxPreset["values"] {
    const copy = { ...src } as Record<string, unknown>;
    delete copy.enabled;
    delete copy.onlyOnTrack;
    delete copy.preset;
    delete copy.toggleKey;
    delete copy.userPresets;
    return copy as UserFxPreset["values"];
  }

  function saveUserPreset() {
    const name = newPresetName.trim();
    if (!name) return;
    const target = ensureFx();
    const list = [...(target.userPresets ?? [])];
    const existingIdx = list.findIndex(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    const values = snapshotFxValues(target);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], name, values };
    } else {
      list.push({ id: `up_${Date.now()}`, name, values });
    }
    target.userPresets = list;
    newPresetName = "";
    saveConfig();
    ioStatus = `✓ Preset "${name}" guardado`;
    setTimeout(() => (ioStatus = ""), 2500);
  }

  function applyUserPreset(preset: UserFxPreset) {
    const target = ensureFx();
    Object.assign(target, CLEAN_FX_SLIDERS, preset.values);
    target.preset = "custom";
    target.enabled = true;
    saveConfig();
    pushNativeFx(target);
    if (target.lutPreset === 6 && target.customLutPath && isNativeTauri()) {
      void invoke("load_fx_cube_lut_file", { path: target.customLutPath })
        .then(() => refreshStatus())
        .catch(() => {});
    }
    ioStatus = `✓ Aplicado "${preset.name}"`;
    setTimeout(() => (ioStatus = ""), 2000);
  }

  function commitRenamePreset(id: string) {
    const trimmed = renamingText.trim();
    if (trimmed) {
      const target = ensureFx();
      target.userPresets = (target.userPresets ?? []).map((p) =>
        p.id === id ? { ...p, name: trimmed } : p,
      );
      saveConfig();
    }
    renamingPresetId = null;
    renamingText = "";
  }

  function deleteUserPreset(id: string) {
    const target = ensureFx();
    target.userPresets = (target.userPresets ?? []).filter((p) => p.id !== id);
    saveConfig();
  }

  onMount(() => {
    pushNativeFx(fx);
    pushAudio3D(a3d);
    void refreshStatus();
    void refreshCubeLuts();
    void refreshLibraryPresets();
    statusTimer = setInterval(() => void refreshStatus(), 1000);
  });

  onDestroy(() => {
    if (statusTimer) clearInterval(statusTimer);
  });

  function applyPreset(id: Exclude<OnboardFxPresetId, "custom">) {
    const target = ensureFx();
    // Reset all optional additive shaders first so presets NEVER inherit leftover white-out glow!
    Object.assign(target, CLEAN_FX_SLIDERS, ONBOARD_FX_PRESETS[id].values);
    target.preset = id;
    target.enabled = true;
    saveConfig();
    pushNativeFx(target);
  }

  function updateField<K extends keyof OnboardFxConfig>(
    key: K,
    val: OnboardFxConfig[K],
  ) {
    const target = ensureFx();
    target[key] = val;
    if (
      key !== "enabled" &&
      key !== "onlyOnTrack" &&
      key !== "preset" &&
      key !== "toggleKey"
    ) {
      target.preset = "custom";
    }
    saveConfig();
    pushNativeFx(target);
  }

  function exportFxPreset() {
    const cur = ensureFx();
    const payload = {
      format: "mdt-fx-preset-v2",
      exportedAt: new Date().toISOString(),
      fx: { ...cur },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mdt-onboard-${cur.preset || "custom"}.mdtfx.json`;
    a.click();
    URL.revokeObjectURL(url);
    ioStatus = "✅ Preset FX exportado (.mdtfx.json)";
    setTimeout(() => (ioStatus = ""), 3200);
  }

  async function importFxPreset(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const src = parsed?.fx ?? parsed;
      if (!src || typeof src !== "object") throw new Error("Formato no válido");
      const target = ensureFx();
      const num = (v: unknown, def: number, min: number, max: number) =>
        typeof v === "number" && Number.isFinite(v)
          ? Math.max(min, Math.min(max, v))
          : def;
      target.contrast = num(src.contrast, target.contrast, 0.7, 1.5);
      target.saturation = num(src.saturation, target.saturation, 0.3, 1.8);
      target.vibrance = num(src.vibrance, target.vibrance, -0.5, 1.0);
      target.brightness = num(src.brightness, target.brightness, 0.7, 1.35);
      target.exposure = num(src.exposure, target.exposure, -1.0, 1.0);
      target.warmth = num(src.warmth, target.warmth, -30, 30);
      target.tint = num(src.tint, target.tint, -30, 30);
      target.acesTonemap = num(src.acesTonemap, target.acesTonemap, 0, 1);
      target.casSharpen = num(src.casSharpen, target.casSharpen, 0, 1);
      target.chromaticAberration = num(
        src.chromaticAberration,
        target.chromaticAberration,
        0,
        1,
      );
      target.speedBlur = num(src.speedBlur, target.speedBlur, 0, 1);
      target.vignette = num(src.vignette, target.vignette, 0, 0.85);
      target.visorDirt = num(src.visorDirt, target.visorDirt, 0, 0.65);
      target.filmGrain = num(src.filmGrain, target.filmGrain, 0, 0.35);
      target.scanlines = num(src.scanlines, target.scanlines, 0, 0.35);
      target.lutStrength = num(src.lutStrength, target.lutStrength, 0, 1);
      target.lutPreset = Math.round(num(src.lutPreset, target.lutPreset, 0, 6));
      target.bloom = num(src.bloom, target.bloom, 0, 1);
      target.halation = num(src.halation, target.halation, 0, 1);
      target.lensDistortion = num(
        src.lensDistortion,
        target.lensDistortion,
        0,
        1,
      );
      target.clarity = num(src.clarity, target.clarity, 0, 1);
      target.dehaze = num(src.dehaze, target.dehaze, 0, 1);
      target.anamorphicFlare = num(
        src.anamorphicFlare,
        target.anamorphicFlare,
        0,
        1,
      );
      target.lift = num(src.lift, target.lift, -0.25, 0.25);
      target.gamma = num(src.gamma, target.gamma, 0.75, 1.35);
      target.gain = num(src.gain, target.gain, 0.75, 1.35);
      target.agxTonemap = num(src.agxTonemap, target.agxTonemap, 0, 1);
      target.giBounce = num(src.giBounce, target.giBounce, 0, 1);
      target.proMist = num(src.proMist, target.proMist, 0, 1);
      target.localHdr = num(src.localHdr, target.localHdr, 0, 1);
      target.highlightRolloff = num(
        src.highlightRolloff,
        target.highlightRolloff,
        0,
        1,
      );
      target.splitShadowCool = num(
        src.splitShadowCool,
        target.splitShadowCool,
        0,
        1,
      );
      target.splitHighlightWarm = num(
        src.splitHighlightWarm,
        target.splitHighlightWarm,
        0,
        1,
      );
      target.shadowDepth = num(src.shadowDepth, target.shadowDepth, 0, 1);
      target.pyramidalBloom = num(
        src.pyramidalBloom,
        target.pyramidalBloom ?? 0,
        0,
        1,
      );
      target.grassRealism = num(
        src.grassRealism,
        target.grassRealism ?? 0,
        0,
        1,
      );
      target.skyRealism = num(src.skyRealism, target.skyRealism ?? 0, 0, 1);
      target.sunGodRays = num(src.sunGodRays, target.sunGodRays ?? 0, 0, 1);
      target.film35mm = num(src.film35mm, target.film35mm ?? 0, 0, 1);
      target.heatHaze = num(src.heatHaze, target.heatHaze ?? 0, 0, 1);
      target.temporalMotionBlur = num(
        src.temporalMotionBlur,
        target.temporalMotionBlur ?? 0,
        0,
        1,
      );
      target.lumenGi = num(src.lumenGi, target.lumenGi ?? 0, 0, 1);
      target.lumenSkyBounce = num(
        src.lumenSkyBounce,
        target.lumenSkyBounce ?? 0,
        0,
        1,
      );
      target.colorSpace = Math.round(
        num(src.colorSpace, target.colorSpace ?? 0, 0, 5),
      );
      target.colorSpaceStrength = num(
        src.colorSpaceStrength,
        target.colorSpaceStrength ?? 1,
        0,
        1,
      );
      if (typeof src.linearColorSpace === "boolean")
        target.linearColorSpace = src.linearColorSpace;
      if (typeof src.autoExposure === "boolean")
        target.autoExposure = src.autoExposure;
      if (typeof src.gforceShift === "boolean")
        target.gforceShift = src.gforceShift;
      if (typeof src.rpmVibration === "boolean")
        target.rpmVibration = src.rpmVibration;
      if (typeof src.autoWeatherTimeFx === "boolean")
        target.autoWeatherTimeFx = src.autoWeatherTimeFx;
      if (typeof src.speedVignette === "boolean")
        target.speedVignette = src.speedVignette;
      if (typeof src.visorFrame === "boolean")
        target.visorFrame = src.visorFrame;
      if (typeof src.rainDrops === "boolean") target.rainDrops = src.rainDrops;
      if (typeof src.recBadge === "boolean") target.recBadge = src.recBadge;
      if (typeof src.gForceVignette === "boolean")
        target.gForceVignette = src.gForceVignette;
      if (typeof src.cameraShake === "boolean")
        target.cameraShake = src.cameraShake;
      target.preset = "custom";
      target.enabled = true;
      saveConfig();
      pushNativeFx(target);
      ioStatus = `✅ Preset importado: ${file.name}`;
    } catch {
      ioStatus = "❌ Error: archivo .mdtfx.json no válido";
    } finally {
      input.value = "";
      setTimeout(() => (ioStatus = ""), 3600);
    }
  }

  async function importCubeLut(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !isNativeTauri()) return;
    try {
      const text = await file.text();
      const size = await invoke<number>("load_native_fx_lut", {
        name: file.name,
        content: text,
      });
      const target = ensureFx();
      target.lutPreset = 6;
      if (target.lutStrength < 0.2) target.lutStrength = 0.85;
      target.preset = "custom";
      target.enabled = true;
      saveConfig();
      pushNativeFx(target);
      await refreshStatus();
      ioStatus = `✅ LUT 3D cargado: ${file.name} (${size}×${size}×${size})`;
    } catch (err) {
      ioStatus = `❌ Error .cube: ${String(err)}`;
    } finally {
      input.value = "";
      setTimeout(() => (ioStatus = ""), 4500);
    }
  }

  async function clearCubeLut() {
    if (!isNativeTauri()) return;
    await invoke("clear_native_fx_lut").catch(() => {});
    if (fx.lutPreset === 6) {
      updateField("lutPreset", 0);
    }
    await refreshStatus();
  }

  const LUT_OPTIONS = [
    { value: 0, label: "Ninguno (Sin LUT)" },
    {
      value: 7,
      label: "📹 IMSA Onboard Real (Calibrado Road Atlanta · Integrado)",
    },
    { value: 1, label: "WEC Le Mans Film (Integrado)" },
    { value: 2, label: "F1 T-Cam Broadcast (Integrado)" },
    { value: 3, label: "Kodak 2383 Cinema (Integrado)" },
    { value: 4, label: "GoPro Action Motorsport (Integrado)" },
    { value: 5, label: "Noche HDR Resistencia (Integrado)" },
    { value: 6, label: "LUT 3D Personalizado (.cube)" },
  ];

  const COLOR_SPACE_OPTIONS = [
    { value: 0, label: "sRGB (Nativo · Sin conversión)" },
    { value: 1, label: "Rec.709 · Broadcast 2.4 (TV / WEC / IMSA)" },
    { value: 2, label: "Rec.709 HLG · Hybrid Log-Gamma (Onboard HDR)" },
    { value: 3, label: "DCI-P3 · Cine Digital (Wide Gamut)" },
    { value: 4, label: "BT.2020 · UHD / HDR Wide Gamut" },
    { value: 5, label: "ACEScg · AP1 Cinema Pipeline (Hollywood / UE5)" },
  ];
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-5 p-6">
  <!-- Sticky Broadcast Sub-Tabs with Sliding Spring Indicator -->
  <div
    class="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-white/[0.1] bg-[#0e1017] px-3 py-1.5 shadow-lg"
  >
    <div bind:this={subNavEl} class="relative flex flex-wrap items-center gap-1">
      {#if subTabBar.visible}
        <span
          class="wec-tab-indicator"
          style:transform={`translate3d(${subTabBar.left}px, 0, 0)`}
          style:width={`${subTabBar.width}px`}
          aria-hidden="true"
        ></span>
      {/if}
      {#each [{ id: "visual", label: "Visual FX (DX11)", activeDot: engineStatus.running }, { id: "audio3d", label: "Audio3D (Binaural / 7.1 / EQ)", activeDot: audio3dStatus.running }, { id: "sound", label: "SonidosFX (Telemetría)", activeDot: sfx.enabled }] as tab (tab.id)}
        <button
          bind:this={subTabRefs[tab.id]}
          type="button"
          class={[
            "relative z-10 flex items-center gap-2 rounded-[4px] px-3.5 py-2 font-display text-xs font-bold tracking-[0.07em] uppercase cursor-pointer transition-colors active:scale-[0.97]",
            activeTab === tab.id
              ? "bg-white/[0.06] text-white"
              : "text-muted hover:bg-white/[0.04] hover:text-fg",
          ]}
          onclick={() => (activeTab = tab.id as "visual" | "audio3d" | "sound")}
        >
          <span>{tab.label}</span>
          {#if tab.activeDot}
            <span class="h-1.5 w-1.5 rounded-[1px] bg-emerald-400"></span>
          {/if}
        </button>
      {/each}
    </div>
    <span class="hidden sm:inline font-mono text-[11px] text-muted pr-1">
      {activeTab === "visual"
        ? engineStatus.running
          ? `DX11 · ${engineStatus.fps.toFixed(0)} FPS`
          : "Motor GPU Nativo"
        : activeTab === "audio3d"
          ? audio3dStatus.running
            ? `WASAPI · 48 kHz`
            : "Motor Espacial Rust"
          : sfx.enabled
            ? `SONIDOSFX · ${Math.round(sfx.volume * 100)}%`
            : "SONIDOSFX OFF"}
    </span>
  </div>

  {#key activeTab}
  <div class="wec-subtab-enter flex flex-col gap-5">
  {#if activeTab === "visual"}
    <!-- Header + Native D3D11 Engine Status -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="page-title text-2xl font-bold tracking-tight">
          🎥 MDT-FX Engine · Motor GPU Nativo DirectX 11
        </h1>
        <p class="mt-0.5 text-sm text-muted">
          Shaders HLSL reales en GPU (<strong
            >CAS Sharpening, LUTs 3D .cube, ACES Filmic, Aberración Cromática y
            Speed Blur</strong
          >) aplicados <strong>entre LMU y el HUD</strong> sin ReShade ni inyección
          en el juego.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          class={[
            "btn border px-3 py-2 text-xs font-bold cursor-pointer transition-colors",
            fx.performanceMode
              ? "bg-emerald-500/25 border-emerald-400/60 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.28)]"
              : "bg-white/[0.04] border-white/[0.12] text-muted hover:text-fg hover:border-emerald-400/40",
          ]}
          onclick={() => updateField("performanceMode", !fx.performanceMode)}
          title="Desactiva pasadas pesadas (Bloom piramidal, Lumen multi-pasada, God-Rays, TAA) y ejecuta Color + LUT + AgX + CAS en 1 sola pasada ultra-rápida (<0.25 ms)"
        >
          {fx.performanceMode
            ? "⚡ Modo Rendimiento: ON (1 Pasada GPU)"
            : "⚡ Modo Rendimiento"}
        </button>
        <button
          type="button"
          class="btn bg-accent/20 border border-accent/45 px-3 py-2 text-xs font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
          onclick={() => {
            if (isNativeTauri()) {
              void invoke("set_fx_editor_mode", { enabled: true }).catch(
                () => {},
              );
            }
          }}
          title="Abre el panel flotante de edición FX directamente sobre Le Mans Ultimate"
        >
          🎛️ Editor FX en Juego ({config.value.general.shortcuts?.fxEditor ||
            "Ctrl+Shift+F4"})
        </button>
        <div
          class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5"
        >
          <div class="text-right">
            <div
              class="flex items-center justify-end gap-1.5 text-xs font-bold uppercase tracking-wider text-fg"
            >
              <span
                class={[
                  "h-2 w-2 rounded-full",
                  engineStatus.running
                    ? "bg-good animate-pulse"
                    : fx.enabled
                      ? "bg-warn"
                      : "bg-faint",
                ]}
              ></span>
              <span
                >{engineStatus.running
                  ? `GPU ACTIVO · ${engineStatus.fps.toFixed(0)} FPS`
                  : fx.enabled
                    ? "EN ESPERA (PISTA)"
                    : "MOTOR APAGADO"}</span
              >
            </div>
            <div class="text-[11px] text-muted">
              DirectX 11 HLSL · 100% Nativo
            </div>
          </div>
          <Toggle
            checked={fx.enabled}
            label="Activar MDT-FX Engine"
            onchange={(v) => updateField("enabled", v)}
          />
        </div>
      </div>
    </div>

    {#if engineStatus.lastError}
      <div
        class="rounded-xl border border-bad/50 bg-bad/10 px-4 py-2.5 text-xs text-bad"
      >
        ⚠️ Motor DX11: {engineStatus.lastError} (Asegúrate de tener LMU en modo Ventana
        sin Bordes / Borderless).
      </div>
    {/if}

    <!-- Live Split-Screen Antes / Después Comparator -->
    <div
      class="card flex flex-wrap items-center justify-between gap-4 px-4 py-3"
    >
      <div class="min-w-0">
        <div class="text-xs font-bold uppercase tracking-wider text-fg">
          🌓 Comparador Pantalla Partida en Vivo (Antes / Después)
        </div>
        <div class="text-[11px] text-muted">
          Desliza para ver LMU original a la izquierda vs. MDT-FX a la derecha
          en tiempo real (0% = pantalla completa FX).
        </div>
      </div>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="0"
          max="0.95"
          step="0.01"
          class="w-40"
          value={fx.splitScreen ?? 0}
          oninput={(e) =>
            updateField("splitScreen", parseFloat(e.currentTarget.value))}
        />
        <span class="w-12 text-right font-mono text-xs font-bold text-accent">
          {(fx.splitScreen ?? 0) > 0.01
            ? `${Math.round((fx.splitScreen ?? 0) * 100)}%`
            : "OFF"}
        </span>
        {#if (fx.splitScreen ?? 0) > 0.01}
          <button
            type="button"
            class="btn px-2 py-1 text-[11px]"
            onclick={() => updateField("splitScreen", 0)}>✕</button
          >
        {/if}
      </div>
    </div>

    <!-- 1-Click Presets + Export/Import -->
    <div class="card p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span
            class="section-title text-xs font-bold tracking-widest text-muted uppercase"
          >
            Presets Cinematográficos Onboard (1 Clic)
          </span>
          <span class="ml-2 text-xs text-muted">
            Activo: <strong class="text-accent"
              >{fx.preset === "custom"
                ? "Personalizado"
                : (ONBOARD_FX_PRESETS[fx.preset]?.name ??
                  "Personalizado")}</strong
            >
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          {#if ioStatus}
            <span class="text-xs font-semibold text-accent">{ioStatus}</span>
          {/if}
          <button
            type="button"
            class="btn bg-surface-2 border border-line px-2.5 py-1 text-xs font-semibold hover:border-accent cursor-pointer"
            onclick={exportFxPreset}
          >
            📤 Exportar .mdtfx.json
          </button>
          <button
            type="button"
            class="btn bg-surface-2 border border-line px-2.5 py-1 text-xs font-semibold hover:border-accent cursor-pointer"
            onclick={() => importInput?.click()}
          >
            📥 Importar .mdtfx.json
          </button>
          <input
            bind:this={importInput}
            type="file"
            accept=".json,.mdtfx.json"
            class="hidden"
            onchange={importFxPreset}
          />
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {#each Object.entries(ONBOARD_FX_PRESETS) as [id, p] (id)}
          {@const active = fx.preset === id}
          <button
            type="button"
            class={[
              "flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer",
              active
                ? "border-accent bg-accent/15 shadow-[0_0_16px_rgba(34,135,236,0.28)]"
                : "border-line bg-surface-2/60 hover:border-accent/60 hover:bg-surface-2",
            ]}
            onclick={() =>
              applyPreset(id as Exclude<OnboardFxPresetId, "custom">)}
          >
            <div class="flex w-full items-center justify-between">
              <span class="text-sm font-bold text-fg">{p.name}</span>
              {#if active}
                <span
                  class="rounded bg-accent px-1.5 py-0.5 text-[10px] font-black text-white"
                  >ACTIVO</span
                >
              {/if}
            </div>
            <span class="mt-1 text-xs text-muted leading-snug">{p.desc}</span>
          </button>
        {/each}
      </div>

      <!-- User Custom Saved Presets -->
      <div class="mt-2 flex flex-col gap-2.5 border-t border-line pt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-bold tracking-wider text-fg uppercase"
            >⭐ Mis Presets Guardados</span
          >
          <div class="flex items-center gap-1.5">
            <input
              type="text"
              class="field w-44 py-1 text-xs"
              placeholder="Nombre del preset..."
              bind:value={newPresetName}
              onkeydown={(e) => {
                if (e.key === "Enter") saveUserPreset();
              }}
            />
            <button
              type="button"
              class="btn bg-accent px-3 py-1 text-xs font-bold text-white hover:brightness-110 cursor-pointer disabled:opacity-40"
              disabled={!newPresetName.trim()}
              onclick={saveUserPreset}
            >
              💾 Guardar como preset
            </button>
          </div>
        </div>
        {#if (fx.userPresets ?? []).length === 0}
          <div class="text-xs text-muted">
            Guarda tus ajustes actuales aquí para cambiar entre ellos con 1 clic
            (también aparecen en el editor flotante in-game).
          </div>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each fx.userPresets ?? [] as up (up.id)}
              <div
                class="flex items-center gap-1 rounded-xl border border-line bg-surface-2/80 px-2.5 py-1.5"
              >
                {#if renamingPresetId === up.id}
                  <input
                    type="text"
                    class="field w-32 py-0.5 text-xs"
                    bind:value={renamingText}
                    onkeydown={(e) => {
                      if (e.key === "Enter") commitRenamePreset(up.id);
                      if (e.key === "Escape") renamingPresetId = null;
                    }}
                  />
                  <button
                    type="button"
                    class="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white cursor-pointer"
                    onclick={() => commitRenamePreset(up.id)}
                  >
                    ✓
                  </button>
                {:else}
                  <button
                    type="button"
                    class="text-xs font-bold text-fg hover:text-accent cursor-pointer pr-1"
                    onclick={() => applyUserPreset(up)}
                    title="Aplicar preset guardado"
                  >
                    ⭐ {up.name}
                  </button>
                  <button
                    type="button"
                    class="text-[11px] text-muted hover:text-fg cursor-pointer px-1"
                    title="Renombrar preset"
                    onclick={() => {
                      renamingPresetId = up.id;
                      renamingText = up.name;
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    class="text-[11px] text-muted hover:text-bad cursor-pointer px-1"
                    title="Eliminar preset"
                    onclick={() => deleteUserPreset(up.id)}
                  >
                    🗑️
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Color Management: Linear Color Space + Broadcast/Cinema Gamut Profiles -->
    <div class="card flex flex-col gap-3.5 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-sm font-bold text-fg">
            🌈 Gestión de Color Profesional (Linear Space · Rec.709 · BT.2020 ·
            DCI-P3 · ACEScg)
          </div>
          <div class="text-xs text-muted">
            Procesado físico en <strong
              >espacio lineal (EOTF → Linear → OETF)</strong
            > y matrices de color estándar de cine y retransmisión.
          </div>
        </div>
        <div
          class="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
        >
          <div class="text-right">
            <div class="text-xs font-bold text-fg">Linear Color Space</div>
            <div class="text-[10px] text-muted">
              Luz física lineal (sRGB → Linear → sRGB)
            </div>
          </div>
          <Toggle
            checked={Boolean(fx.linearColorSpace)}
            label="Activar Linear Color Space"
            onchange={(v) => updateField("linearColorSpace", v)}
          />
        </div>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-fg" for="fx-color-space"
            >Perfil / Espacio de Color (Gamut)</label
          >
          <select
            id="fx-color-space"
            class="field py-2 text-xs font-semibold"
            value={fx.colorSpace ?? 0}
            onchange={(e) =>
              updateField("colorSpace", parseInt(e.currentTarget.value, 10))}
          >
            {#each COLOR_SPACE_OPTIONS as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium text-fg"
              >Intensidad del Perfil de Color</span
            >
            <span class="font-mono font-bold text-accent">
              {(fx.colorSpace ?? 0) === 0
                ? "OFF"
                : `${Math.round((fx.colorSpaceStrength ?? 1) * 100)}%`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            disabled={(fx.colorSpace ?? 0) === 0}
            value={fx.colorSpaceStrength ?? 1}
            oninput={(e) =>
              updateField(
                "colorSpaceStrength",
                parseFloat(e.currentTarget.value),
              )}
          />
        </div>
      </div>
    </div>

    <!-- 3D LUT Studio (.cube loader + Built-in LUTs) -->
    <div class="card flex flex-col gap-3 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-sm font-bold text-fg">
            🎨 Motor de LUTs 3D (Integrados + Archivos .cube de Cine/DaVinci)
          </div>
          <div class="text-xs text-muted">
            Carga cualquier LUT 3D estándar <code>.cube</code> (17³, 33³, 65³) directamente
            en textura 3D de GPU por hardware.
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="field py-1.5 text-xs font-semibold"
            value={fx.lutPreset ?? 0}
            onchange={(e) =>
              updateField("lutPreset", parseInt(e.currentTarget.value, 10))}
          >
            {#each LUT_OPTIONS as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
          <button
            type="button"
            class="btn bg-accent/20 border border-accent/50 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
            onclick={() => cubeInput?.click()}
          >
            📂 Cargar archivo .cube
          </button>
          <input
            bind:this={cubeInput}
            type="file"
            accept=".cube"
            class="hidden"
            onchange={importCubeLut}
          />
          {#if engineStatus.lutName}
            <button
              type="button"
              class="btn bg-surface-2 border border-line px-2 py-1.5 text-xs text-muted hover:text-bad cursor-pointer"
              onclick={clearCubeLut}
              title="Quitar LUT .cube cargado"
            >
              ✕ {engineStatus.lutName} ({engineStatus.lutSize}³)
            </button>
          {/if}
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-medium text-fg">Intensidad del LUT</span>
          <span class="font-mono font-bold text-accent"
            >{Math.round((fx.lutStrength ?? 0) * 100)}%</span
          >
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={fx.lutStrength ?? 0}
          oninput={(e) =>
            updateField("lutStrength", parseFloat(e.currentTarget.value))}
        />
      </div>

      <!-- Auto-scanned .cube LUT Gallery (MDT-FX-Presets) -->
      <div class="flex flex-col gap-2 border-t border-line pt-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span
            class="text-[11px] font-bold uppercase tracking-wider text-muted"
          >
            🗂️ Galería Automática (.cube en MDT-FX-Presets)
          </span>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="btn bg-surface-2 border border-line px-2 py-1 text-[11px] font-semibold text-fg hover:border-accent cursor-pointer"
              onclick={refreshCubeLuts}
              title="Volver a escanear archivos .cube"
            >
              🔄 Refrescar
            </button>
            <button
              type="button"
              class="btn bg-surface-2 border border-line px-2 py-1 text-[11px] font-semibold text-fg hover:border-accent cursor-pointer"
              onclick={openPresetsFolder}
              title="Abrir carpeta MDT-FX-Presets"
            >
              📁 Abrir carpeta
            </button>
          </div>
        </div>
        {#if cubeLuts.length === 0}
          <div class="text-xs text-muted">
            No se encontraron archivos <code>.cube</code> en
            <code>MDT-FX-Presets</code>. Copia tus LUTs ahí y pulsa Refrescar.
          </div>
        {:else}
          <div class="flex flex-wrap gap-1.5">
            {#each cubeLuts as entry (entry.path)}
              {@const isLoaded =
                fx.lutPreset === 6 && engineStatus.lutName === entry.name}
              <button
                type="button"
                class={[
                  "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
                  isLoaded
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-line bg-surface-2/70 text-fg hover:border-accent/60",
                ]}
                onclick={() => selectCubeLut(entry)}
              >
                🎞️ {entry.name.replace(/\.cube$/i, "")}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- 3D LUT Generator (LMU Screenshot -> Reference Real Photo) -->
    <LutGeneratorCard
      onSaved={(res) => {
        const target = ensureFx();
        target.lutPreset = 6;
        target.customLutPath = res.path;
        if ((target.lutStrength ?? 0) < 0.05) target.lutStrength = 0.85;
        target.preset = "custom";
        saveConfig();
        pushNativeFx(target);
        void refreshCubeLuts();
        void refreshStatus();
      }}
    />

    <!-- Biblioteca de Presets MDT-xxxx (Pack OnBoard ReShade Adaptado) -->
    <div class="card flex flex-col gap-3 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-sm font-bold text-fg">
            📚 Biblioteca de Presets OnBoard <code>MDT-xxxx</code> ({libraryPresets.length} presets)
          </div>
          <div class="text-xs text-muted">
            Presets del pack OnBoard ReShade adaptados a MDT-FX (Surface Blur Bilateral, DPX, RF/VHS, PerfectPerspective, AmbientLight y Lightroom).
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="text"
            class="field w-48 py-1 text-xs"
            placeholder="Buscar MDT-xxxx (ej. Visor, Night, F1, WEC)..."
            bind:value={libSearch}
          />
          <button
            type="button"
            class="btn bg-surface-2 border border-line px-2 py-1 text-xs font-semibold text-fg hover:border-accent cursor-pointer"
            onclick={refreshLibraryPresets}
          >
            🔄 Refrescar
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        {#each libCategories as cat (cat)}
          <button
            type="button"
            class={[
              "rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
              libCategory === cat
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface-2/70 text-muted hover:text-fg",
            ]}
            onclick={() => (libCategory = cat)}
          >
            {cat === "ALL" ? `Todos (${libraryPresets.length})` : cat}
          </button>
        {/each}
      </div>

      {#if filteredLibraryPresets.length === 0}
        <div class="text-xs text-muted">No hay presets que coincidan con "{libSearch}".</div>
      {:else}
        <div class="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredLibraryPresets as entry (entry.path)}
            <button
              type="button"
              class={[
                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors cursor-pointer",
                activeLibraryPreset === entry.name
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-line bg-surface-2/60 text-fg hover:border-accent/60 hover:bg-surface-2",
              ]}
              onclick={() => applyLibraryPreset(entry)}
              title={`${entry.category} · ${entry.name}`}
            >
              <span class="truncate">{entry.name}</span>
              <span class="shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-mono text-muted">
                {entry.category.replace("MDT-", "")}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Next-Gen Multi-Pass & Temporal Shaders (#1, #2, #4, #7, #8, #10) -->
    <div class="card flex flex-col gap-3.5 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span
            class="section-title text-xs font-bold tracking-widest uppercase"
          >
            🚀 Shaders Next-Gen Multi-Pasada y Temporales (DirectX 11 · 0% =
            desactivado)
          </span>
          <div class="text-xs text-muted">
            Lumen GI, Bloom Piramidal UE5/GT7, Realismo HSL de Hierba/Cielo,
            Rayos de Sol Volumétricos, TAA, Película 35mm, Heat Haze y Motion
            Blur Temporal.
          </div>
        </div>
        {#if fx.performanceMode}
          <span
            class="rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300"
          >
            ⚡ Modo Rendimiento activo (pausa multi-pasada)
          </span>
        {/if}
      </div>
      <div class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {#each [{ key: "lumenGi", label: "🌟 Lumen-Style GI · Irradiancia Multi-Escala + Oclusión", min: 0, max: 1, step: 0.01 }, { key: "lumenSkyBounce", label: "🌤️ Lumen-Style GI · Rebote Hemisférico de Cielo Vivo", min: 0, max: 1, step: 0.01 }, { key: "broadcastSensor", label: "📹 Sensor CMOS Broadcast Real (4:2:2 + Negros Mate + Knee)", min: 0, max: 1, step: 0.01 }, { key: "dirtyLens", label: "🧽 Parabrisas / Lente Reactiva a la Luz (Goma y Polvo)", min: 0, max: 1, step: 0.01 }, { key: "starburst", label: "✨ Destellos de Faros 6 Puntas (Aperture Starburst)", min: 0, max: 1, step: 0.01 }, { key: "wetReflections", label: "🌧️ Reflejos de Asfalto Mojado (Lluvia Real LMU)", min: 0, max: 1, step: 0.01 }, { key: "deband", label: "🌈 Debanding 10-Bit (Quita Bandas en Cielo / Noche)", min: 0, max: 1, step: 0.01 }, { key: "surfaceBlur", label: "🫧 Surface Blur Bilateral (Suaviza ruido 3D manteniendo bordes)", min: 0, max: 1, step: 0.01 }, { key: "dpxFilm", label: "🎞️ Película DPX / Tinte Broadcast (Curva RGB de cine)", min: 0, max: 1, step: 0.01 }, { key: "vhsRf", label: "📺 Señal Analógica RF / VHS (Onboards 90s / 2000s)", min: 0, max: 1, step: 0.01 }, { key: "fxaaAntialias", label: "🛡️ Anti-Aliasing FXAA 3.11 en GPU (Bordes finos sin ghosting)", min: 0, max: 1, step: 0.01 }, { key: "taaAntialias", label: "6. ✨ Anti-Aliasing Temporal Inteligente (TAA · Quita Shimmering)", min: 0, max: 1, step: 0.01 }, { key: "pyramidalBloom", label: "1. Bloom Piramidal Multi-Pasada (Dual-Kawase UE5)", min: 0, max: 1, step: 0.01 }, { key: "grassRealism", label: "2A. Realismo HSL · Naturalizar Hierba y Árboles", min: 0, max: 1, step: 0.01 }, { key: "skyRealism", label: "2B. Realismo HSL · Equilibrar Azul del Cielo", min: 0, max: 1, step: 0.01 }, { key: "sunGodRays", label: "4. Rayos Volumétricos de Sol (Sun God-Rays)", min: 0, max: 1, step: 0.01 }, { key: "film35mm", label: "7. Emulación Fotoquímica 35mm (Dye + Grano Sombras)", min: 0, max: 1, step: 0.01 }, { key: "heatHaze", label: "8. Distorsión Térmica de Asfalto (Heat Haze)", min: 0, max: 1, step: 0.01 }, { key: "longExposure", label: "📸 RealLongExposure / Obturador de Cámara (Estela continua GPU)", min: 0, max: 1, step: 0.01 }, { key: "temporalMotionBlur", label: "10. Estela Temporal de Velocidad (Motion Blur GPU)", min: 0, max: 1, step: 0.01 }, { key: "cinematicDof", label: "🎥 Profundidad de Campo Cinemática (Replay DoF / Bokeh)", min: 0, max: 1, step: 0.01 }, { key: "dofFocus", label: "🎯 Plano de Enfoque DoF (15% Horizonte · 50% Pista · 85% Volante)", min: 0.15, max: 0.85, step: 0.01 }] as s (s.key)}
          {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-fg">{s.label}</span>
              <span class="font-mono font-bold text-accent"
                >{Math.round(val * 100)}%</span
              >
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={val}
              oninput={(e) =>
                updateField(s.key as any, parseFloat(e.currentTarget.value))}
            />
          </div>
        {/each}
      </div>
    </div>

    <!-- Realistic Lighting & Cinema Photorealism Panel (#1, #2, #4, #5, #7, #8, #9) -->
    <div class="card flex flex-col gap-3.5 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span
            class="section-title text-xs font-bold tracking-widest text-amber-300 uppercase"
          >
            ☀️ Motor de Iluminación Realista y Cine (Todos opcionales · 0% =
            desactivado)
          </span>
          <div class="text-xs text-muted">
            AgX Filmic, Rebote Global GI, Black Pro-Mist 1/4, Local HDR de
            cockpit, Highlight Roll-Off, Split Toning y Oclusión de Sombras.
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {#each [{ key: "agxTonemap", label: "1. AgX Filmic Tonemapping (Cine / Faros sin quemar)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "giBounce", label: "2. Rebote de Luz Global en Pantalla (GI Color Bounce)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "proMist", label: "4. Filtro Óptico Black Pro-Mist 1/4 (Difusión Cine)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "localHdr", label: "5. Local Tone Mapping / Fake HDR (Cockpit + Cielo)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "highlightRolloff", label: "7. Suavizado de Luces Altas (Highlight Roll-Off)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "splitShadowCool", label: "8A. Split Toning · Sombras Frías (Luz de Cielo)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "splitHighlightWarm", label: "8B. Split Toning · Luces Cálidas (Sol Directo)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "shadowDepth", label: "9. Profundidad de Micro-Sombras (Oclusión)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }] as s (s.key)}
          {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-fg">{s.label}</span>
              <span class="font-mono font-bold text-amber-300"
                >{s.fmt(val)}</span
              >
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={val}
              oninput={(e) =>
                updateField(s.key as any, parseFloat(e.currentTarget.value))}
            />
          </div>
        {/each}
      </div>
    </div>

    <!-- Pro Shaders + Color Grading Grid -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- Pro Color Grading HLSL -->
      <div class="card flex flex-col gap-3.5 p-4">
        <span
          class="section-title text-xs font-bold tracking-widest text-muted uppercase"
        >
          Color Grading Profesional (HLSL GPU)
        </span>
        {#each [{ key: "acesTonemap", label: "ACES Filmic Tonemapping (Cine HDR)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "dehaze", label: "Dehaze (Eliminar Velo Grisáceo)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "exposure", label: "Exposición (EV)", min: -0.8, max: 0.8, step: 0.02, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} EV` }, { key: "lift", label: "Lift · Sombras (3-Vías)", min: -0.2, max: 0.2, step: 0.01, fmt: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%` }, { key: "gamma", label: "Gamma · Medios (3-Vías)", min: 0.75, max: 1.35, step: 0.01, fmt: (v: number) => v.toFixed(2) }, { key: "gain", label: "Gain · Luces Altas (3-Vías)", min: 0.75, max: 1.35, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "contrast", label: "Contraste (Curva S)", min: 0.75, max: 1.45, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "vibrance", label: "Vibrance Inteligente", min: -0.5, max: 1.0, step: 0.02, fmt: (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%` }, { key: "saturation", label: "Saturación Global", min: 0.4, max: 1.6, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "brightness", label: "Brillo", min: 0.75, max: 1.25, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "warmth", label: "Temperatura (Frío ↔ Cálido)", min: -30, max: 30, step: 1, fmt: (v: number) => (v > 0 ? `+${v} Cálido` : v < 0 ? `${v} Frío` : "Neutro") }, { key: "tint", label: "Matiz (Magenta ↔ Verde)", min: -30, max: 30, step: 1, fmt: (v: number) => (v > 0 ? `+${v}` : `${v}`) }] as s (s.key)}
          {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-fg">{s.label}</span>
              <span class="font-mono font-bold text-accent">{s.fmt(val)}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={val}
              oninput={(e) =>
                updateField(s.key as any, parseFloat(e.currentTarget.value))}
            />
          </div>
        {/each}
      </div>

      <!-- Optics, Sharpening & Lens Shaders -->
      <div class="card flex flex-col gap-3.5 p-4">
        <span
          class="section-title text-xs font-bold tracking-widest text-muted uppercase"
        >
          Nitidez, Óptica de Lente y Sensores Onboard
        </span>
        {#each [{ key: "casSharpen", label: "AMD FidelityFX CAS Sharpening (Nitidez Real)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "clarity", label: "Claridad Local / Micro-Contraste (Asfalto)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "bloom", label: "Bloom Óptico (Faros, Frenos y Sol)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "halation", label: "Halation de Película (Halo Cálido en Luces)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "anamorphicFlare", label: "Destello Anamórfico Horizontal (Focos)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "lensDistortion", label: "Distorsión Gran Angular (GoPro / T-Cam)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "chromaticAberration", label: "Aberración Cromática Radial (Lente)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "speedBlur", label: "Desenfoque Radial de Velocidad (>165 km/h)", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "vignette", label: "Viñeta Óptica de Lente", min: 0, max: 0.85, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "filmGrain", label: "Grano Cinematográfico de Sensor", min: 0, max: 0.35, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "visorDirt", label: "Suciedad y Reflejos de Visera (Bordes)", min: 0, max: 0.65, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }, { key: "scanlines", label: "Líneas Broadcast / Retro", min: 0, max: 0.35, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` }] as s (s.key)}
          {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-fg">{s.label}</span>
              <span class="font-mono font-bold text-accent">{s.fmt(val)}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={val}
              oninput={(e) =>
                updateField(s.key as any, parseFloat(e.currentTarget.value))}
            />
          </div>
        {/each}
      </div>
    </div>

    <!-- Dynamic Telemetry-Linked FX Toggles -->
    <div
      class="card grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-line"
    >
      {#each [{ key: "onlyOnTrack", title: "Activar solo cuando estás en pista", desc: "Apaga el motor DX11 en menús/garaje (0% GPU) y lo enciende al salir a pista." }, { key: "autoWeatherTimeFx", title: "Transición Automática Día → Atardecer → Noche → Lluvia", desc: "Adapta suavemente color, bloom, claridad y destellos según hora y clima de LMU." }, { key: "autoExposure", title: "Auto-Exposición Real de Sensor de Cámara", desc: "Analiza la escena en vivo y compensa sombras, túneles y faros automáticamente." }, { key: "gforceShift", title: "Inercia Óptica por Fuerzas G (Curvas y Frenada)", desc: "Micro-desplazamiento sutil de cámara por gLat/gLong (el HUD permanece fijo)." }, { key: "rpmVibration", title: "Vibración de Chasis por Altas RPM", desc: "Micro-vibración de alta frecuencia al acercarse al corte de revoluciones." }, { key: "speedVignette", title: "Efecto Túnel por Velocidad (>190 km/h)", desc: "Cierra sutilmente la viñeta en GPU al rodar a máxima velocidad." }, { key: "cameraShake", title: "Micro-vibración Real por Pianos y >280 km/h", desc: "Aplica micro-vibración real al vídeo de LMU al pisar pianos (el HUD queda fijo)." }, { key: "gForceVignette", title: "Pulso G-Force en Frenadas Fuertes", desc: "Sutil halo cálido en bordes al clavar frenos a alta velocidad." }, { key: "visorFrame", title: "Marco Curvo de Visera de Casco", desc: "Sombra superior e inferior estilo cámara dentro del casco." }, { key: "rainDrops", title: "Gotas de Lluvia Dinámicas", desc: "Aparecen en los bordes automáticamente cuando llueve en LMU." }, { key: "recBadge", title: "Indicador REC ● ONBOARD CAM", desc: "Marca discreta de cámara en la esquina superior izquierda." }] as t (t.key)}
        <div class="flex flex-col gap-2 bg-surface p-3.5">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium text-fg">{t.title}</div>
              <div class="text-xs text-muted">{t.desc}</div>
            </div>
            <Toggle
              checked={Boolean(fx[t.key as keyof OnboardFxConfig])}
              label={t.title}
              onchange={(v) => updateField(t.key as any, v)}
            />
          </div>
          {#if t.key === "autoExposure" && fx.autoExposure}
            <div
              class="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-1.5"
            >
              <span class="text-[11px] font-medium text-muted"
                >Velocidad del Iris (sin flashes)</span
              >
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                class="flex-1"
                value={fx.autoExposureSpeed ?? 0.22}
                oninput={(e) =>
                  updateField(
                    "autoExposureSpeed",
                    parseFloat(e.currentTarget.value),
                  )}
              />
              <span
                class="w-16 text-right font-mono text-[11px] font-bold text-accent"
              >
                {(fx.autoExposureSpeed ?? 0.22) <= 0.25
                  ? "Cine Lento"
                  : (fx.autoExposureSpeed ?? 0.22) <= 0.6
                    ? "Suave"
                    : "Ágil"}
              </span>
            </div>
          {:else if t.key === "rpmVibration" && fx.rpmVibration}
            <div
              class="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-1.5"
            >
              <span class="text-[11px] font-medium text-muted"
                >Intensidad RPM</span
              >
              <input
                type="range"
                min="0.1"
                max="2.5"
                step="0.05"
                class="flex-1"
                value={fx.rpmVibrationIntensity ?? 1.0}
                oninput={(e) =>
                  updateField(
                    "rpmVibrationIntensity",
                    parseFloat(e.currentTarget.value),
                  )}
              />
              <span
                class="w-10 text-right font-mono text-[11px] font-bold text-accent"
              >
                {Math.round((fx.rpmVibrationIntensity ?? 1.0) * 100)}%
              </span>
            </div>
          {:else if t.key === "cameraShake" && fx.cameraShake}
            <div
              class="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-1.5"
            >
              <span class="text-[11px] font-medium text-muted"
                >Intensidad Pianos</span
              >
              <input
                type="range"
                min="0.1"
                max="2.5"
                step="0.05"
                class="flex-1"
                value={fx.cameraShakeIntensity ?? 1.0}
                oninput={(e) =>
                  updateField(
                    "cameraShakeIntensity",
                    parseFloat(e.currentTarget.value),
                  )}
              />
              <span
                class="w-10 text-right font-mono text-[11px] font-bold text-accent"
              >
                {Math.round((fx.cameraShakeIntensity ?? 1.0) * 100)}%
              </span>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Atajo Rápido ON/OFF al Vuelo (Teclado + Volante) -->
    <div class="card flex flex-wrap items-center justify-between gap-4 p-4">
      <div class="min-w-0">
        <div class="text-sm font-bold text-fg">
          ⚡ Atajo Rápido FX ON/OFF al Vuelo (Teclado, Volante y Voz)
        </div>
        <div class="text-xs text-muted">
          Activa o desactiva el motor GPU nativo en plena recta para comparar
          antes/después al instante (o di <em>"activa FX"</em> /
          <em>"desactiva FX"</em> por radio).
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-xs text-muted">
          <span>Tecla rápida:</span>
          <input
            type="text"
            class="field w-20 py-1 text-center font-mono text-xs font-bold uppercase"
            value={fx.toggleKey || "F9"}
            onchange={(e) =>
              updateField("toggleKey", e.currentTarget.value.trim() || "F9")}
          />
        </label>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class={[
              "btn px-3 py-1.5 text-xs font-bold cursor-pointer",
              wheelControl.learning === "toggleFx"
                ? "bg-amber-500 text-black animate-pulse"
                : "bg-accent/20 border border-accent/40 text-accent hover:bg-accent hover:text-white",
            ]}
            onclick={() => {
              if (wheelControl.learning === "toggleFx")
                wheelControl.cancelLearning();
              else wheelControl.startLearning("toggleFx");
            }}
          >
            {wheelControl.learning === "toggleFx"
              ? "⏳ Pulsa botón del volante..."
              : wheelControl.actionBinds.toggleFx
                ? `🎮 ${wheelControl.actionBinds.toggleFx.label}`
                : "🎮 Asignar botón de volante"}
          </button>
          {#if wheelControl.actionBinds.toggleFx}
            <button
              type="button"
              class="btn bg-surface-2 border border-line px-2 py-1.5 text-xs text-muted hover:text-bad cursor-pointer"
              title="Quitar botón de volante"
              onclick={() => wheelControl.clearActionBind("toggleFx")}
            >
              ✕
            </button>
          {/if}
        </div>
      </div>
    </div>
  {:else if activeTab === "audio3d"}
    <!-- ==================== MDT-AUDIO3D (WASAPI BINAURAL / 7.1 / 8D) ==================== -->
    <div class="card flex flex-col gap-4 border-accent/40 p-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="page-title text-xl font-bold tracking-tight">
            🎧 MDT-Audio3D · Espacializador Binaural / 7.1 / 8D para LMU
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            Captura en exclusiva el audio de <code>Le Mans Ultimate.exe</code>
            vía <strong>WASAPI Process Loopback</strong> (48 kHz nativo en Rust,
            sin Voicemeeter ni cables virtuales) y añade espacialización Binaural/7.1/8D,
            reflexiones de cockpit en carbono y pegada sub-grave de escape.
          </p>
        </div>
        <div
          class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2"
        >
          <div class="text-right">
            <div
              class="flex items-center justify-end gap-1.5 text-xs font-bold uppercase tracking-wider text-fg"
            >
              <span
                class={[
                  "h-2 w-2 rounded-full",
                  audio3dStatus.running
                    ? "bg-good animate-pulse"
                    : a3d.enabled
                      ? "bg-warn"
                      : "bg-faint",
                ]}
              ></span>
              <span
                >{audio3dStatus.running
                  ? `LMU PID ${audio3dStatus.lmuPid} · 48 kHz`
                  : a3d.enabled
                    ? "ESPERANDO LMU"
                    : "AUDIO3D OFF"}</span
              >
            </div>
            <div
              class="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-black/50"
            >
              <div
                class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-amber-400 transition-[width] duration-75"
                style:width="{Math.round(
                  Math.min(1, audio3dStatus.peakLevel * 1.4) * 100,
                )}%"
              ></div>
            </div>
          </div>
          <Toggle
            checked={a3d.enabled}
            label="Activar MDT-Audio3D"
            onchange={(v) => updateAudio3DField("enabled", v)}
          />
        </div>
      </div>

      {#if a3d.enabled && audio3dStatus.lastError}
        <div
          class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
        >
          ℹ️ {audio3dStatus.lastError}
        </div>
      {/if}

      <!-- 4 Presets 1-Clic -->
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {#each Object.entries(AUDIO3D_PRESETS) as [id, p] (id)}
          <button
            type="button"
            class="flex flex-col items-start rounded-xl border border-line bg-surface-2/60 p-2.5 text-left transition-all hover:border-accent hover:bg-accent/10 cursor-pointer"
            onclick={() =>
              applyAudio3DPreset(id as keyof typeof AUDIO3D_PRESETS)}
          >
            <span class="text-xs font-bold text-fg">{p.name}</span>
            <span class="mt-1 text-[11px] text-muted leading-snug"
              >{p.desc}</span
            >
          </button>
        {/each}
      </div>

      <!-- Mode + Sliders -->
      <div class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <span class="text-xs font-medium text-fg"
            >Modo de Espacialización</span
          >
          <select
            class="field py-1.5 text-xs font-semibold"
            value={a3d.mode ?? 0}
            onchange={(e) =>
              updateAudio3DField("mode", parseInt(e.currentTarget.value, 10))}
          >
            <option value={0}
              >🎧 Binaural HRTF (Auriculares · Crossfeed + Sombra de Cabeza)</option
            >
            <option value={1}
              >🔊 7.1 Virtual Surround (Canales Laterales + Traseros
              Envolventes)</option
            >
            <option value={2}
              >🌀 8D Dinámico (Rotación Espacial + Inercia de Curva)</option
            >
            <option value={3}
              >🏎️ 5.1 Cabina / Cockpit (Enfoque Motor + Escape)</option
            >
          </select>
        </div>

        {#each [{ key: "wetMix", label: "Intensidad Mezcla 3D (Wet Bus)", min: 0, max: 1, step: 0.01 }, { key: "spatialWidth", label: "Amplitud Espacial (Mid/Side + HRTF)", min: 0, max: 1, step: 0.01 }, { key: "cockpitReverb", label: "Acústica de Cockpit en Carbono (Early Reflections)", min: 0, max: 1, step: 0.01 }, { key: "subBassPunch", label: "Excitador Sub-Grave de Escape (45–135 Hz)", min: 0, max: 1, step: 0.01 }, { key: "helmetResonance", label: "Resonancia Interior de Casco Integral", min: 0, max: 1, step: 0.01 }, { key: "aeroWind", label: "Viento Aerodinámico en Cabina (>140 km/h)", min: 0, max: 1, step: 0.01 }, { key: "rivalProximity", label: "Audio Espacial de Rivales en Paralelo (Doppler Izq./Der.)", min: 0, max: 1, step: 0.01 }] as s (s.key)}
          {@const val = Number(a3d[s.key as keyof Audio3DConfig] ?? 0)}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-fg">{s.label}</span>
              <span class="font-mono font-bold text-accent"
                >{Math.round(val * 100)}%</span
              >
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={val}
              oninput={(e) =>
                updateAudio3DField(
                  s.key as any,
                  parseFloat(e.currentTarget.value),
                )}
            />
          </div>
        {/each}

        <!-- #3 5-Band Parametric EQ -->
        <div
          class="flex flex-col gap-2.5 rounded-xl border border-line/70 bg-surface-2/40 p-3 sm:col-span-2"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-xs font-bold uppercase tracking-wider text-fg">
                🎚️ Ecualizador Paramétrico de 5 Bandas (48 kHz)
              </div>
              <div class="text-[11px] text-muted">
                Moldea graves de escape, cuerpo del motor, admisión y brillo
                metálico.
              </div>
            </div>
            <button
              type="button"
              class="btn bg-surface-2 border border-line px-2 py-1 text-[11px] font-semibold hover:border-accent cursor-pointer"
              onclick={() => {
                updateAudio3DField("eqSubDb", 0);
                updateAudio3DField("eqBassDb", 0);
                updateAudio3DField("eqMidDb", 0);
                updateAudio3DField("eqPresenceDb", 0);
                updateAudio3DField("eqAirDb", 0);
              }}
            >
              ↺ Resetear EQ (0 dB)
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {#each [{ key: "eqSubDb", label: "SUB · 60Hz" }, { key: "eqBassDb", label: "BASS · 180Hz" }, { key: "eqMidDb", label: "MID · 650Hz" }, { key: "eqPresenceDb", label: "PRES · 2.4kHz" }, { key: "eqAirDb", label: "AIR · 8kHz" }] as band (band.key)}
              {@const db = Number(a3d[band.key as keyof Audio3DConfig] ?? 0)}
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="font-bold text-muted">{band.label}</span>
                  <span class="font-mono font-bold text-accent"
                    >{db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1)} dB</span
                  >
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={db}
                  oninput={(e) =>
                    updateAudio3DField(
                      band.key as any,
                      parseFloat(e.currentTarget.value),
                    )}
                />
              </div>
            {/each}
          </div>
        </div>

        <div
          class="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-surface-2/50 px-3 py-2"
        >
          <div>
            <div class="text-xs font-semibold text-fg">
              Paneo Dinámico 3D por Fuerzas G (gLat)
            </div>
            <div class="text-[11px] text-muted">
              Bascula sutilmente la escena espacial del cockpit en curvas.
            </div>
          </div>
          <Toggle
            checked={Boolean(a3d.gforcePanning)}
            label="Paneo G-Force"
            onchange={(v) => updateAudio3DField("gforcePanning", v)}
          />
        </div>

        <div
          class="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-surface-2/50 px-3 py-2"
        >
          <div>
            <div class="text-xs font-semibold text-fg">
              Ajuste Acústico Automático por Categoría
            </div>
            <div class="text-[11px] text-muted">
              Adapta el EQ automáticamente según conduzcas LMGT3, LMP2 o
              Hypercar.
            </div>
          </div>
          <Toggle
            checked={Boolean(a3d.autoByClass)}
            label="Auto EQ por categoría"
            onchange={(v) => updateAudio3DField("autoByClass", v)}
          />
        </div>
      </div>
    </div>
  {:else}
    <!-- ==================== SONIDOSFX SUB-TAB ==================== -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="page-title text-2xl font-bold tracking-tight">
          🔊 SonidosFX · Audio Táctil de Telemetría
        </h1>
        <p class="mt-0.5 text-sm text-muted">
          Efectos sonoros sintetizados en tiempo real (&lt;5 ms) sincronizados
          con el coche, el volante y Dirección de Carrera. Todos 100%
          opcionales.
        </p>
      </div>
      <div
        class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5"
      >
        <div class="text-right">
          <div class="text-xs font-bold uppercase tracking-wider text-fg">
            {sfx.enabled ? "SONIDOSFX ACTIVADO" : "SONIDOSFX APAGADO"}
          </div>
          <div class="text-[11px] text-muted">Web Audio API · 0% CPU</div>
        </div>
        <Toggle
          checked={sfx.enabled}
          label="Activar SonidosFX"
          onchange={(v) => updateSoundField("enabled", v)}
        />
      </div>
    </div>

    <!-- Master Volume + 1-Click Presets -->
    <div class="card flex flex-col gap-4 p-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold uppercase tracking-wider text-fg"
            >Volumen Maestro de SonidosFX</span
          >
          <span class="font-mono font-bold text-accent"
            >{Math.round((sfx.volume ?? 0.55) * 100)}%</span
          >
        </div>
        <input
          type="range"
          min="0.05"
          max="1"
          step="0.01"
          value={sfx.volume ?? 0.55}
          oninput={(e) =>
            updateSoundField("volume", parseFloat(e.currentTarget.value))}
        />
      </div>

      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {#each Object.entries(SOUND_FX_PRESETS) as [id, p] (id)}
          <button
            type="button"
            class="flex flex-col items-start rounded-xl border border-line bg-surface-2/60 p-3 text-left transition-all hover:border-accent hover:bg-accent/10 cursor-pointer"
            onclick={() =>
              applySoundPreset(id as keyof typeof SOUND_FX_PRESETS)}
          >
            <span class="text-sm font-bold text-fg">{p.name}</span>
            <span class="mt-1 text-xs text-muted leading-snug">{p.desc}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Shift Beep Style & RPM Threshold -->
    <div class="card flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <div class="text-sm font-bold text-fg">
          🏎️ Configuración del Shift Beep (Cambio de Marcha)
        </div>
        <div class="text-xs text-muted">
          Elige el tono del pitido y el porcentaje exacto de RPM al que suena.
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-xs text-muted">
          <span>Estilo:</span>
          <select
            class="field py-1.5 text-xs font-semibold"
            value={sfx.shiftBeepStyle ?? "gt3"}
            onchange={(e) => {
              const st = e.currentTarget.value as ShiftBeepStyle;
              updateSoundField("shiftBeepStyle", st);
              soundFx.playShiftBeep(st);
            }}
          >
            <option value="gt3">GT3 Bosch (Pitido seco)</option>
            <option value="f1">F1 Broadcast (Doble agudo)</option>
            <option value="hypercar">Hypercar (Pulso ascendente)</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs text-muted">
          <span
            >Umbral RPM: <strong class="font-mono text-accent"
              >{sfx.shiftRpmPct ?? 95}%</strong
            ></span
          >
          <input
            type="range"
            min="90"
            max="98"
            step="1"
            class="w-28"
            value={sfx.shiftRpmPct ?? 95}
            oninput={(e) =>
              updateSoundField(
                "shiftRpmPct",
                parseInt(e.currentTarget.value, 10),
              )}
          />
        </label>
      </div>
    </div>

    <!-- 3 Categorized Packs with Individual Toggles + Test Buttons -->
    {#each [{ title: "🎛️ Pilotaje y Volante", items: [{ key: "shiftBeep", title: "Shift Beep (Aviso de Cambio de Marcha)", desc: "Pitido preciso al alcanzar tu umbral de RPM antes del corte." }, { key: "rotaryClick", title: "Click Mecánico de Rotaries / Electrónica", desc: "Chasquido táctil de ruleta al cambiar TC, ABS, Brake Bias, Map o ARB." }, { key: "liftCoastBeep", title: "Aviso Sonoro de Lift & Coast", desc: "Doble bip suave en el punto exacto de levantar el pie para ahorrar." }, { key: "absTcPulse", title: "Feedback Táctil de ABS y TC Activo", desc: "Pulso grave al entrar ABS en frenada y tick corto al cortar TC." }, { key: "pitLimiterPulse", title: "Pulso Rítmico de Limitador de Boxes", desc: "Sutil pulso electrónico mientras ruedas con el pit limiter activo." }] }, { title: "🏁 Dirección de Carrera y Tiempos (FIA / TV)", items: [{ key: "startLightsBeep", title: "Semáforo de Salida (5 Luces + Salida)", desc: "Tono en cada luz roja encendida y pitido agudo al darse la salida." }, { key: "sectorChime", title: "Timbre TV de Sector Morado / Verde", desc: "Acorde limpio al cerrar un sector récord de sesión o mejor personal." }, { key: "flagsAlert", title: "Alertas Sonoras FIA (Amarilla, Azul y Sanción)", desc: "Tonos diferenciados al salir Bandera Amarilla/FCY, Azul o sanción." }, { key: "lapInvalidBuzz", title: "Aviso de Vuelta Invalidada (Track Limits)", desc: "Doble tono grave discreto en el instante en que se anula la vuelta." }] }, { title: "⚡ Inmersión de Cabina (Híbrido / ERS)", items: [{ key: "ersWhine", title: "Zumbido Eléctrico Híbrido ERS (Hypercar)", desc: "Silbido eléctrico sutil y orgánico proporcional al Empuje y la Regen." }, { key: "batteryFullChime", title: "Tono de Batería 100% Llena", desc: "Aviso ascendente para recordarte desplegar energía híbrida." }] }] as group (group.title)}
      <div class="card flex flex-col divide-y divide-line">
        <div class="px-4 py-2.5">
          <span
            class="section-title text-xs font-bold tracking-widest text-muted uppercase"
            >{group.title}</span
          >
        </div>
        {#each group.items as item (item.key)}
          <div
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium text-fg">{item.title}</div>
              <div class="text-xs text-muted">{item.desc}</div>
            </div>
            <div class="flex items-center gap-2.5">
              <button
                type="button"
                class="btn bg-accent/15 border border-accent/40 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
                onclick={() => soundFx.playTest(item.key as SoundFxTestKind)}
              >
                ▶ Probar
              </button>
              <Toggle
                checked={Boolean(sfx[item.key as keyof SoundFxConfig])}
                label={item.title}
                onchange={(v) => updateSoundField(item.key as any, v)}
              />
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
  </div>
  {/key}
</div>
