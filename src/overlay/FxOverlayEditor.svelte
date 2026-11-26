<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { isNativeTauri } from "../lib/api";
  import {
    CLEAN_FX_SLIDERS,
    config,
    DEFAULT_ONBOARD_FX,
    ONBOARD_FX_PRESETS,
    saveConfig,
    type OnboardFxConfig,
    type OnboardFxPresetId,
    type UserFxPreset,
  } from "../lib/config.svelte";

  let { onClose }: { onClose: () => void } = $props();

  type FxTab = "quick" | "color" | "nextgen" | "optics";
  let tab = $state<FxTab>("quick");
  let savedToast = $state("");
  let cubeLuts = $state<{ name: string; path: string }[]>([]);
  let newPresetName = $state("");
  let renamingPresetId = $state<string | null>(null);
  let renamingText = $state("");

  async function refreshCubeLuts() {
    if (!isNativeTauri()) return;
    try {
      cubeLuts = await invoke<{ name: string; path: string }[]>("list_fx_cube_luts");
    } catch {}
  }

  async function selectCubeLut(entry: { name: string; path: string }) {
    if (!isNativeTauri()) return;
    try {
      await invoke("load_fx_cube_lut_file", { path: entry.path });
      const target = ensureFx();
      target.lutPreset = 6;
      target.customLutPath = entry.path;
      if ((target.lutStrength ?? 0) < 0.05) target.lutStrength = 0.85;
      target.preset = "custom";
      saveConfig();
      savedToast = `✓ ${entry.name.replace(/\.cube$/i, "")}`;
      setTimeout(() => (savedToast = ""), 2000);
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
    const idx = list.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    const values = snapshotFxValues(target);
    if (idx >= 0) list[idx] = { ...list[idx], name, values };
    else list.push({ id: `up_${Date.now()}`, name, values });
    target.userPresets = list;
    newPresetName = "";
    saveConfig();
    savedToast = `✓ "${name}"`;
    setTimeout(() => (savedToast = ""), 1800);
  }

  function applyUserPreset(preset: UserFxPreset) {
    const target = ensureFx();
    Object.assign(target, CLEAN_FX_SLIDERS, preset.values);
    target.preset = "custom";
    target.enabled = true;
    saveConfig();
    if (target.lutPreset === 6 && target.customLutPath && isNativeTauri()) {
      void invoke("load_fx_cube_lut_file", { path: target.customLutPath }).catch(() => {});
    }
    savedToast = `⭐ ${preset.name}`;
    setTimeout(() => (savedToast = ""), 1800);
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
    void refreshCubeLuts();
  });

  // Draggable floating panel position (starts neatly on the left so center track is 100% visible)
  let posX = $state(28);
  let posY = $state(64);
  let drag: { px: number; py: number; ox: number; oy: number } | null = null;

  function onHeaderDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select")) return;
    drag = { px: e.clientX, py: e.clientY, ox: posX, oy: posY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHeaderMove(e: PointerEvent) {
    if (!drag) return;
    posX = Math.max(8, Math.min(window.innerWidth - 360, drag.ox + (e.clientX - drag.px)));
    posY = Math.max(8, Math.min(window.innerHeight - 120, drag.oy + (e.clientY - drag.py)));
  }
  function onHeaderUp() {
    drag = null;
  }

  function ensureFx(): OnboardFxConfig {
    if (!config.value.general.onboardFx) {
      config.value.general.onboardFx = { ...DEFAULT_ONBOARD_FX };
    }
    return config.value.general.onboardFx;
  }

  const fx = $derived(config.value.general.onboardFx ?? DEFAULT_ONBOARD_FX);

  function setField<K extends keyof OnboardFxConfig>(key: K, val: OnboardFxConfig[K]) {
    const target = ensureFx();
    target[key] = val;
    if (key !== "enabled" && key !== "onlyOnTrack" && key !== "preset" && key !== "toggleKey") {
      target.preset = "custom";
    }
    saveConfig();
  }

  function applyPreset(id: Exclude<OnboardFxPresetId, "custom">) {
    const target = ensureFx();
    Object.assign(target, CLEAN_FX_SLIDERS, ONBOARD_FX_PRESETS[id].values);
    target.preset = id;
    target.enabled = true;
    saveConfig();
  }

  function saveNow() {
    saveConfig();
    savedToast = "✓ Guardado";
    setTimeout(() => (savedToast = ""), 1800);
  }

  function closeEditor() {
    if (isNativeTauri()) {
      void invoke("set_fx_editor_mode", { enabled: false }).catch(() => {});
    }
    onClose();
  }

  const shortcutLabel = $derived(config.value.general.shortcuts?.fxEditor || "Ctrl+Shift+F4");

  const LUT_OPTIONS = [
    { value: 0, label: "Ninguno" },
    { value: 7, label: "📹 IMSA Onboard Real" },
    { value: 1, label: "WEC Le Mans Film" },
    { value: 2, label: "F1 T-Cam Broadcast" },
    { value: 3, label: "Kodak 2383 Cinema" },
    { value: 4, label: "GoPro Action" },
    { value: 5, label: "Noche HDR" },
    { value: 6, label: "Personalizado (.cube)" },
  ];

  const COLOR_SPACE_OPTIONS = [
    { value: 0, label: "sRGB (Nativo)" },
    { value: 1, label: "Rec.709 (Broadcast 2.4)" },
    { value: 2, label: "Rec.709 HLG (HDR)" },
    { value: 3, label: "DCI-P3 (Cine)" },
    { value: 4, label: "BT.2020 (UHD)" },
    { value: 5, label: "ACEScg (AP1)" },
  ];
</script>

<!-- Floating In-Game FX Quick Editor (100% crisp above DX11 FX, live real-time editing over LMU) -->
<div
  class="pointer-events-auto fixed z-[90] flex w-[396px] max-w-[92vw] max-h-[84vh] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#070b14]/90 text-white shadow-[0_24px_64px_rgba(0,0,0,0.75)] backdrop-blur-xl select-none"
  style:left={`${posX}px`}
  style:top={`${posY}px`}
>
  <!-- Draggable Header -->
  <div
    class="flex cursor-grab items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3.5 py-2.5 active:cursor-grabbing"
    onpointerdown={onHeaderDown}
    onpointermove={onHeaderMove}
    onpointerup={onHeaderUp}
  >
    <div class="flex items-center gap-2 min-w-0">
      <span class={["h-2 w-2 shrink-0 rounded-full", fx.enabled ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-white/30"]}></span>
      <div class="min-w-0">
        <div class="truncate text-xs font-extrabold tracking-wide text-white">🎛️ MDT-FX Editor en Vivo</div>
        <div class="text-[10px] font-mono text-white/55">Arrastra · {shortcutLabel} o Esc para cerrar</div>
      </div>
    </div>
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class={[
          "rounded-lg px-2 py-1 text-[10px] font-bold transition-colors cursor-pointer",
          fx.performanceMode ? "bg-amber-500/25 text-amber-300 border border-amber-400/45" : "bg-white/5 text-white/65 border border-white/10",
        ]}
        onclick={() => setField("performanceMode", !fx.performanceMode)}
        title="Modo Rendimiento: 1 sola pasada GPU (<0.25 ms)"
      >
        ⚡ {fx.performanceMode ? "PERF ON" : "PERF"}
      </button>
      <button
        type="button"
        class={[
          "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
          fx.enabled ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40" : "bg-white/10 text-white/70 border border-white/15",
        ]}
        onclick={() => setField("enabled", !fx.enabled)}
      >
        {fx.enabled ? "FX ON" : "FX OFF"}
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs font-bold text-white/80 hover:bg-red-500/30 hover:text-white cursor-pointer"
        onclick={closeEditor}
        title="Cerrar editor FX"
      >
        ✕
      </button>
    </div>
  </div>

  <!-- Compact Tabs -->
  <div class="flex items-center gap-1 border-b border-white/10 bg-black/25 px-2.5 py-1.5">
    {#each [
      { id: "quick", label: "⚡ Rápido" },
      { id: "color", label: "🎨 Color" },
      { id: "nextgen", label: "🚀 Next-Gen" },
      { id: "optics", label: "📷 Óptica" },
    ] as t (t.id)}
      <button
        type="button"
        class={[
          "flex-1 rounded-lg px-1.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
          tab === t.id ? "bg-[#2287ec] text-white shadow-[0_0_12px_rgba(34,135,236,0.45)]" : "text-white/65 hover:bg-white/10 hover:text-white",
        ]}
        onclick={() => (tab = t.id as FxTab)}
      >
        {t.label}
      </button>
    {/each}
  </div>

  <!-- Scrollable Controls -->
  <div class="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3 text-xs">
    {#if tab === "quick"}
      <!-- Split-Screen Antes / Después -->
      <div class="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
        <div class="flex items-center justify-between">
          <span class="font-bold text-white">🌓 Antes / Después (Split)</span>
          <span class="font-mono font-bold text-sky-400">
            {(fx.splitScreen ?? 0) > 0.01 ? `${Math.round((fx.splitScreen ?? 0) * 100)}%` : "OFF"}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="0.95"
          step="0.01"
          value={fx.splitScreen ?? 0}
          oninput={(e) => setField("splitScreen", parseFloat(e.currentTarget.value))}
        />
      </div>

      <!-- 1-Click Presets -->
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-bold uppercase tracking-wider text-white/55">Presets 1 Clic</span>
        <div class="grid grid-cols-2 gap-1.5">
          {#each Object.entries(ONBOARD_FX_PRESETS) as [id, p] (id)}
            <button
              type="button"
              class={[
                "truncate rounded-lg border px-2 py-1.5 text-left text-[11px] font-bold transition-colors cursor-pointer",
                fx.preset === id ? "border-sky-400 bg-sky-500/25 text-white" : "border-white/10 bg-white/[0.04] text-white/80 hover:border-white/25",
              ]}
              onclick={() => applyPreset(id as Exclude<OnboardFxPresetId, "custom">)}
            >
              {p.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Mis Presets Guardados (1 Clic + Renombrar + Borrar) -->
      <div class="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <span class="text-[10px] font-bold uppercase tracking-wider text-sky-300">⭐ Mis Presets Guardados</span>
        <div class="flex items-center gap-1.5">
          <input
            type="text"
            class="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0c1220] px-2 py-1 text-[11px] text-white placeholder:text-white/40"
            placeholder="Guardar como preset..."
            bind:value={newPresetName}
            onkeydown={(e) => {
              if (e.key === "Enter") saveUserPreset();
            }}
          />
          <button
            type="button"
            class="rounded-lg bg-[#2287ec] px-2.5 py-1 text-[11px] font-bold text-white hover:brightness-110 cursor-pointer disabled:opacity-40"
            disabled={!newPresetName.trim()}
            onclick={saveUserPreset}
          >
            💾
          </button>
        </div>
        {#if (fx.userPresets ?? []).length > 0}
          <div class="flex flex-wrap gap-1 pt-0.5">
            {#each fx.userPresets ?? [] as up (up.id)}
              <div class="flex items-center gap-0.5 rounded-lg border border-white/15 bg-white/[0.05] px-1.5 py-0.5">
                {#if renamingPresetId === up.id}
                  <input
                    type="text"
                    class="w-24 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white"
                    bind:value={renamingText}
                    onkeydown={(e) => {
                      if (e.key === "Enter") commitRenamePreset(up.id);
                      if (e.key === "Escape") renamingPresetId = null;
                    }}
                  />
                  <button type="button" class="text-[10px] text-emerald-300 px-1 cursor-pointer" onclick={() => commitRenamePreset(up.id)}>✓</button>
                {:else}
                  <button
                    type="button"
                    class="text-[11px] font-bold text-white/90 hover:text-sky-300 cursor-pointer pr-0.5"
                    onclick={() => applyUserPreset(up)}
                  >
                    ⭐ {up.name}
                  </button>
                  <button
                    type="button"
                    class="text-[10px] text-white/45 hover:text-white cursor-pointer"
                    title="Renombrar"
                    onclick={() => {
                      renamingPresetId = up.id;
                      renamingText = up.name;
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    class="text-[10px] text-white/45 hover:text-red-400 cursor-pointer"
                    title="Eliminar"
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

      <!-- LUT 3D + Color Space -->
      <div class="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-white/85">LUT 3D</span>
          <select
            class="rounded-lg border border-white/15 bg-[#0c1220] px-2 py-1 text-[11px] font-semibold text-white"
            value={fx.lutPreset ?? 0}
            onchange={(e) => setField("lutPreset", parseInt(e.currentTarget.value, 10))}
          >
            {#each LUT_OPTIONS as o (o.value)}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex flex-col gap-0.5">
          <div class="flex justify-between text-[11px]">
            <span class="text-white/75">Intensidad LUT</span>
            <span class="font-mono font-bold text-sky-400">{Math.round((fx.lutStrength ?? 0) * 100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" value={fx.lutStrength ?? 0} oninput={(e) => setField("lutStrength", parseFloat(e.currentTarget.value))} />
        </div>

        {#if cubeLuts.length > 0}
          <div class="flex flex-col gap-1 border-t border-white/10 pt-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-white/55">🎞️ Galería .cube (1 Clic)</span>
              <button type="button" class="text-[10px] text-sky-300 hover:underline cursor-pointer" onclick={refreshCubeLuts}>🔄</button>
            </div>
            <div class="flex flex-wrap gap-1">
              {#each cubeLuts as entry (entry.path)}
                {@const active = fx.lutPreset === 6 && fx.customLutPath === entry.path}
                <button
                  type="button"
                  class={[
                    "rounded-md border px-2 py-0.5 text-[10px] font-semibold cursor-pointer",
                    active ? "border-sky-400 bg-sky-500/25 text-white" : "border-white/15 bg-white/[0.04] text-white/80 hover:border-sky-400/60",
                  ]}
                  onclick={() => selectCubeLut(entry)}
                >
                  {entry.name.replace(/\.cube$/i, "")}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="mt-1 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span class="font-semibold text-white/85">Perfil Color</span>
          <select
            class="rounded-lg border border-white/15 bg-[#0c1220] px-2 py-1 text-[11px] font-semibold text-white"
            value={fx.colorSpace ?? 0}
            onchange={(e) => setField("colorSpace", parseInt(e.currentTarget.value, 10))}
          >
            {#each COLOR_SPACE_OPTIONS as o (o.value)}
              <option value={o.value}>{o.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-white/75">Linear Color Space (EOTF/OETF)</span>
          <input
            type="checkbox"
            checked={Boolean(fx.linearColorSpace)}
            onchange={(e) => setField("linearColorSpace", e.currentTarget.checked)}
          />
        </div>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-white/75">Solo activo en pista</span>
          <input
            type="checkbox"
            checked={Boolean(fx.onlyOnTrack)}
            onchange={(e) => setField("onlyOnTrack", e.currentTarget.checked)}
          />
        </div>
      </div>

    {:else if tab === "color"}
      {#each [
        { key: "exposure", label: "Exposición (EV)", min: -1, max: 1, step: 0.02, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}` },
        { key: "contrast", label: "Contraste", min: 0.7, max: 1.5, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
        { key: "saturation", label: "Saturación", min: 0.5, max: 1.6, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
        { key: "vibrance", label: "Vibrance", min: -0.5, max: 1, step: 0.02, fmt: (v: number) => `${Math.round(v * 100)}%` },
        { key: "warmth", label: "Temperatura", min: -30, max: 30, step: 1, fmt: (v: number) => `${v > 0 ? "+" : ""}${v}` },
        { key: "tint", label: "Tinte (Verde/Magenta)", min: -30, max: 30, step: 1, fmt: (v: number) => `${v > 0 ? "+" : ""}${v}` },
        { key: "lift", label: "Lift (Sombras)", min: -0.2, max: 0.2, step: 0.005, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}` },
        { key: "gamma", label: "Gamma (Medios)", min: 0.75, max: 1.35, step: 0.01, fmt: (v: number) => v.toFixed(2) },
        { key: "gain", label: "Gain (Altas Luces)", min: 0.75, max: 1.35, step: 0.01, fmt: (v: number) => v.toFixed(2) },
        { key: "acesTonemap", label: "ACES Filmic", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
        { key: "agxTonemap", label: "AgX Filmic", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
        { key: "highlightRolloff", label: "Highlight Roll-Off", min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
      ] as s (s.key)}
        {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
        <div class="flex flex-col gap-0.5">
          <div class="flex justify-between text-[11px]">
            <span class="text-white/85">{s.label}</span>
            <span class="font-mono font-bold text-sky-400">{s.fmt(val)}</span>
          </div>
          <input type="range" min={s.min} max={s.max} step={s.step} value={val} oninput={(e) => setField(s.key as any, parseFloat(e.currentTarget.value))} />
        </div>
      {/each}

    {:else if tab === "nextgen"}
      {#each [
        { key: "lumenGi", label: "🌟 Lumen GI · Irradiancia Multi-Escala", min: 0, max: 1, step: 0.01 },
        { key: "lumenSkyBounce", label: "🌤️ Lumen GI · Rebote de Cielo Vivo", min: 0, max: 1, step: 0.01 },
        { key: "broadcastSensor", label: "📹 Sensor CMOS Broadcast (4:2:2 + Mate)", min: 0, max: 1, step: 0.01 },
        { key: "dirtyLens", label: "🧽 Parabrisas Reactivo a la Luz", min: 0, max: 1, step: 0.01 },
        { key: "starburst", label: "✨ Destellos Faros 6 Puntas (Starburst)", min: 0, max: 1, step: 0.01 },
        { key: "wetReflections", label: "🌧️ Reflejos Asfalto Mojado (Lluvia LMU)", min: 0, max: 1, step: 0.01 },
        { key: "deband", label: "🌈 Debanding 10-Bit (Cielo / Noche)", min: 0, max: 1, step: 0.01 },
        { key: "surfaceBlur", label: "🫧 Surface Blur Bilateral (Suaviza ruido 3D)", min: 0, max: 1, step: 0.01 },
        { key: "dpxFilm", label: "🎞️ Película DPX / Tinte Broadcast", min: 0, max: 1, step: 0.01 },
        { key: "vhsRf", label: "📺 Señal Analógica RF / VHS (90s / 2000s)", min: 0, max: 1, step: 0.01 },
        { key: "fxaaAntialias", label: "🛡️ FXAA 3.11 (Bordes finos sin ghosting)", min: 0, max: 1, step: 0.01 },
        { key: "taaAntialias", label: "6. TAA Inteligente (Quita Shimmering)", min: 0, max: 1, step: 0.01 },
        { key: "pyramidalBloom", label: "1. Bloom Piramidal UE5 (Dual-Kawase)", min: 0, max: 1, step: 0.01 },
        { key: "grassRealism", label: "2A. Realismo HSL · Hierba y Árboles", min: 0, max: 1, step: 0.01 },
        { key: "skyRealism", label: "2B. Realismo HSL · Azul del Cielo", min: 0, max: 1, step: 0.01 },
        { key: "sunGodRays", label: "4. Rayos Volumétricos de Sol", min: 0, max: 1, step: 0.01 },
        { key: "film35mm", label: "7. Película Fotoquímica 35mm", min: 0, max: 1, step: 0.01 },
        { key: "heatHaze", label: "8. Heat Haze (Asfalto Caliente)", min: 0, max: 1, step: 0.01 },
        { key: "longExposure", label: "📸 RealLongExposure / Obturador", min: 0, max: 1, step: 0.01 },
        { key: "temporalMotionBlur", label: "10. Motion Blur Temporal", min: 0, max: 1, step: 0.01 },
        { key: "cinematicDof", label: "🎥 Replay DoF (Bokeh Cinemático)", min: 0, max: 1, step: 0.01 },
        { key: "dofFocus", label: "🎯 Enfoque DoF (Horizonte ↔ Volante)", min: 0.15, max: 0.85, step: 0.01 },
      ] as s (s.key)}
        {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
        <div class="flex flex-col gap-0.5">
          <div class="flex justify-between text-[11px]">
            <span class="text-white/85">{s.label}</span>
            <span class="font-mono font-bold text-sky-400">{Math.round(val * 100)}%</span>
          </div>
          <input type="range" min={s.min} max={s.max} step={s.step} value={val} oninput={(e) => setField(s.key as any, parseFloat(e.currentTarget.value))} />
        </div>
      {/each}

    {:else if tab === "optics"}
      {#each [
        { key: "casSharpen", label: "Nitidez AMD CAS", min: 0, max: 1, step: 0.01 },
        { key: "clarity", label: "Clarity (Micro-contraste)", min: 0, max: 1, step: 0.01 },
        { key: "dehaze", label: "Dehaze (Quitar neblina)", min: 0, max: 1, step: 0.01 },
        { key: "proMist", label: "Black Pro-Mist 1/4", min: 0, max: 1, step: 0.01 },
        { key: "bloom", label: "Bloom Óptico", min: 0, max: 1, step: 0.01 },
        { key: "halation", label: "Halación Fílmica", min: 0, max: 1, step: 0.01 },
        { key: "lensDistortion", label: "Lente Gran Angular", min: 0, max: 1, step: 0.01 },
        { key: "chromaticAberration", label: "Aberración Cromática", min: 0, max: 1, step: 0.01 },
        { key: "vignette", label: "Viñeta Óptica", min: 0, max: 1, step: 0.01 },
        { key: "filmGrain", label: "Grano CMOS", min: 0, max: 0.5, step: 0.01 },
        { key: "cameraShakeIntensity", label: "Intensidad Vibración Pianos", min: 0.1, max: 2.5, step: 0.05 },
        { key: "rpmVibrationIntensity", label: "Intensidad Vibración RPM", min: 0.1, max: 2.5, step: 0.05 },
        { key: "autoExposureSpeed", label: "Velocidad Iris Auto-Exposure", min: 0.05, max: 1.0, step: 0.05 },
      ] as s (s.key)}
        {@const val = Number(fx[s.key as keyof OnboardFxConfig] ?? 0)}
        <div class="flex flex-col gap-0.5">
          <div class="flex justify-between text-[11px]">
            <span class="text-white/85">{s.label}</span>
            <span class="font-mono font-bold text-sky-400">{Math.round(val * 100)}%</span>
          </div>
          <input type="range" min={s.min} max={s.max} step={s.step} value={val} oninput={(e) => setField(s.key as any, parseFloat(e.currentTarget.value))} />
        </div>
      {/each}
      <div class="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
        <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <span>Pianos</span>
          <input type="checkbox" checked={Boolean(fx.cameraShake)} onchange={(e) => setField("cameraShake", e.currentTarget.checked)} />
        </label>
        <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <span>RPM</span>
          <input type="checkbox" checked={Boolean(fx.rpmVibration)} onchange={(e) => setField("rpmVibration", e.currentTarget.checked)} />
        </label>
        <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <span>G-Shift</span>
          <input type="checkbox" checked={Boolean(fx.gforceShift)} onchange={(e) => setField("gforceShift", e.currentTarget.checked)} />
        </label>
        <label class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <span>Auto-Exp</span>
          <input type="checkbox" checked={Boolean(fx.autoExposure)} onchange={(e) => setField("autoExposure", e.currentTarget.checked)} />
        </label>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="flex items-center justify-between gap-2 border-t border-white/10 bg-black/35 px-3.5 py-2">
    <button
      type="button"
      class="rounded-lg bg-[#2287ec] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#3a9bff] cursor-pointer"
      onclick={saveNow}
    >
      {savedToast || "💾 Guardar FX"}
    </button>
    <button
      type="button"
      class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
      onclick={closeEditor}
    >
      Listo (Volver a LMU)
    </button>
  </div>
</div>
