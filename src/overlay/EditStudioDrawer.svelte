<script lang="ts">
  import {
    applyCompleteOverlayTheme,
    BATTLE_SOUNDS,
    config,
    HUD_THEMES,
    saveConfig,
    syncActiveProfile,
    TRACK_ENTRY_ANIMS,
    WIDGETS,
    type HudTheme,
    type PresetThemeId,
    type TrackEntryAnim,
    type WidgetConfig,
  } from "../lib/config.svelte";
  import { spotter } from "../lib/spotter.svelte";
  import { wheelControl } from "../lib/wheelControl.svelte";

  let {
    mode,
    selectedWidgetId,
    effectiveWidgets,
    onSelectWidget,
    onChangeMode,
    onTestTrackEntry,
    onClose,
  }: {
    mode: "widget" | "theme";
    selectedWidgetId: string | null;
    effectiveWidgets: Record<string, WidgetConfig>;
    onSelectWidget: (id: string) => void;
    onChangeMode: (m: "widget" | "theme") => void;
    onTestTrackEntry?: () => void;
    onClose: () => void;
  } = $props();

  const g = $derived(config.value.general);

  // Pick a valid active widget if none is selected
  const activeWidgetId = $derived.by(() => {
    if (selectedWidgetId && effectiveWidgets[selectedWidgetId]) return selectedWidgetId;
    const firstOn = WIDGETS.find((w) => effectiveWidgets[w.id]?.enabled);
    return firstOn?.id ?? WIDGETS[0].id;
  });

  const meta = $derived(WIDGETS.find((w) => w.id === activeWidgetId) ?? WIDGETS[0]);
  const cfg = $derived(effectiveWidgets[activeWidgetId] ?? config.value.widgets[activeWidgetId]);

  const SPOTTER_ALERT_SOUNDS = [
    { value: "1.mp3", label: "Tono 1 (1.mp3)" },
    { value: "2.mp3", label: "Tono 2 (2.mp3)" },
    { value: "3.mp3", label: "Tono 3 (3.mp3)" },
    { value: "4.mp3", label: "Tono 4 (4.mp3)" },
    { value: "5.mp3", label: "Tono 5 (5.mp3)" },
    { value: "6.mp3", label: "Tono 6 (6.mp3)" },
    { value: "7.mp3", label: "Tono 7 (7.mp3)" },
    { value: "8.mp3", label: "Tono 8 (8.mp3)" },
    { value: "9.mp3", label: "Tono 9 (9.mp3)" },
    { value: "10.mp3", label: "Tono 10 (10.mp3)" },
    { value: "11.mp3", label: "Tono 11 (11.mp3)" },
    { value: "12.mp3", label: "Tono 12 (12.mp3)" },
    { value: "13.mp3", label: "Tono 13 (13.mp3)" },
    { value: "14.mp3", label: "Tono 14 (14.mp3)" },
    { value: "15.mp3", label: "Tono 15 (15.mp3)" },
    { value: "16.mp3", label: "Tono 16 (16.mp3)" },
    { value: "17.mp3", label: "Tono 17 (17.mp3)" },
    { value: "f1-radio-end.mp3", label: "F1 Radio End" },
    { value: "mic_click", label: "Pitido walkie-talkie" },
    { value: "none", label: "Ninguno (Silencioso)" },
  ];

  function selectTheme(t: HudTheme) {
    if (t === "custom") {
      g.theme = "custom";
      saveConfig();
    } else {
      applyCompleteOverlayTheme(t, true);
      wheelControl.setMobileTheme(t);
    }
  }

  function playSpotterTestSound(file?: string) {
    if (!file || file === "none") return;
    if (file === "mic_click") {
      spotter.playMicBeep(true);
      return;
    }
    const vol = cfg?.options?.beepsVolume ?? config.value.spotter?.beepsVolume ?? config.value.spotter?.volume ?? 0.85;
    const audio = new Audio(`/Sound/Spotter%20alert/${encodeURIComponent(file)}?t=${Date.now()}`);
    audio.volume = Math.max(0, Math.min(1, vol));
    audio.play().catch(() => {});
  }

  function playBattleTestSound() {
    const vol = cfg?.options?.soundVolume ?? 0.8;
    let file: string = cfg?.options?.soundFile || "Battle.mp3";
    if (file === "random") {
      const pool = BATTLE_SOUNDS.filter((s) => s.value !== "random");
      file = pool[Math.floor(Math.random() * pool.length)]?.value ?? "Battle.mp3";
    }
    const audio = new Audio(`/Sound/Batalla/${encodeURIComponent(file)}?t=${Date.now()}`);
    audio.volume = Math.max(0, Math.min(1, vol));
    audio.play().catch(() => {});
  }

  // Draggable floating panel
  let offsetX = $state(0);
  let offsetY = $state(0);
  let drag: { px: number; py: number; ox: number; oy: number } | null = null;

  function onDragStart(e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input")) return;
    drag = { px: e.clientX, py: e.clientY, ox: offsetX, oy: offsetY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDragMove(e: PointerEvent) {
    if (!drag) return;
    offsetX = drag.ox + (e.clientX - drag.px);
    offsetY = drag.oy + (e.clientY - drag.py);
  }
  function onDragEnd() {
    drag = null;
  }
</script>

<div
  class="hud pointer-events-auto fixed top-24 right-6 z-40 flex w-[360px] max-w-[92vw] max-h-[78vh] flex-col overflow-hidden border border-white/15 shadow-2xl"
  style:transform="translate({offsetX}px, {offsetY}px)"
>
  <!-- Draggable Header + Mode Tabs -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex items-center justify-between gap-2 border-b border-white/10 bg-black/45 px-3 py-2 cursor-grab active:cursor-grabbing"
    onpointerdown={onDragStart}
    onpointermove={onDragMove}
    onpointerup={onDragEnd}
    onpointercancel={onDragEnd}
  >
    <div class="flex items-center gap-1 rounded-lg bg-black/50 p-0.5">
      <button
        type="button"
        class={[
          "rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
          mode === "widget" ? "bg-cyan-500 text-black" : "text-white/70 hover:text-white",
        ]}
        onclick={() => onChangeMode("widget")}
      >
        ⚙ Widget
      </button>
      <button
        type="button"
        class={[
          "rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
          mode === "theme" ? "bg-accent text-white" : "text-white/70 hover:text-white",
        ]}
        onclick={() => onChangeMode("theme")}
      >
        🎨 Tema y Estilo
      </button>
    </div>
    <button
      type="button"
      class="flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-white/10 text-xs text-white/80 hover:bg-red-500 hover:text-white transition-colors"
      title="Cerrar inspector"
      onclick={onClose}
    >
      ✕
    </button>
  </div>

  <!-- Body -->
  <div class="flex-1 overflow-y-auto p-3.5 text-xs space-y-4">
    {#if mode === "widget" && cfg}
      <!-- Widget selector -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted">Widget seleccionado</span>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              class="accent-emerald-400"
              checked={cfg.enabled}
              onchange={(e) => {
                cfg.enabled = e.currentTarget.checked;
                syncActiveProfile();
                saveConfig();
              }}
            />
            <span class="text-[11px] font-semibold text-white">{cfg.enabled ? "Visible" : "Oculto"}</span>
          </label>
        </div>
        <select
          class="field w-full py-1.5! text-xs! font-semibold"
          value={activeWidgetId}
          onchange={(e) => onSelectWidget(e.currentTarget.value)}
        >
          {#each WIDGETS as w (w.id)}
            <option value={w.id}>
              {effectiveWidgets[w.id]?.enabled ? "● " : "○ "}{w.name}
            </option>
          {/each}
        </select>
        <p class="text-[11px] leading-snug text-muted">{meta.description}</p>
      </div>

      <!-- Transform & Appearance -->
      <div class="space-y-2.5 rounded-lg border border-white/10 bg-black/35 p-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Transformación y Opacidad</span>
          <button
            type="button"
            class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white hover:bg-white/20 cursor-pointer"
            onclick={() => {
              cfg.size = 1;
              cfg.scaleX = 1;
              cfg.scaleY = 1;
              cfg.alpha = 1;
              saveConfig();
            }}
          >
            Reset 1:1
          </button>
        </div>

        <label class="grid grid-cols-[78px_1fr_40px] items-center gap-2">
          <span class="text-muted">Tamaño</span>
          <input type="range" min="0.4" max="3" step="0.05" bind:value={cfg.size} oninput={saveConfig} class="accent-cyan-400" />
          <span class="text-right font-mono">{Math.round(cfg.size * 100)}%</span>
        </label>

        <label class="grid grid-cols-[78px_1fr_40px] items-center gap-2">
          <span class="text-muted">Ancho (X)</span>
          <input
            type="range"
            min="0.35"
            max="3"
            step="0.05"
            value={cfg.scaleX ?? 1}
            oninput={(e) => {
              cfg.scaleX = Number(e.currentTarget.value);
              saveConfig();
            }}
            class="accent-accent"
          />
          <span class="text-right font-mono">{Math.round((cfg.scaleX ?? 1) * 100)}%</span>
        </label>

        <label class="grid grid-cols-[78px_1fr_40px] items-center gap-2">
          <span class="text-muted">Alto (Y)</span>
          <input
            type="range"
            min="0.35"
            max="3"
            step="0.05"
            value={cfg.scaleY ?? 1}
            oninput={(e) => {
              cfg.scaleY = Number(e.currentTarget.value);
              saveConfig();
            }}
            class="accent-accent"
          />
          <span class="text-right font-mono">{Math.round((cfg.scaleY ?? 1) * 100)}%</span>
        </label>

        <label class="grid grid-cols-[78px_1fr_40px] items-center gap-2">
          <span class="text-muted">Opacidad</span>
          <input type="range" min="0.2" max="1" step="0.01" bind:value={cfg.alpha} oninput={saveConfig} class="accent-cyan-400" />
          <span class="text-right font-mono">{Math.round(cfg.alpha * 100)}%</span>
        </label>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <label class="flex items-center gap-1.5 rounded bg-black/40 px-2 py-1">
            <span class="font-mono text-[10px] text-muted">X</span>
            <input
              type="number"
              class="w-full bg-transparent font-mono text-xs text-white outline-none"
              value={Math.round(cfg.x)}
              onchange={(e) => {
                cfg.x = Number(e.currentTarget.value) || 0;
                saveConfig();
              }}
            />
          </label>
          <label class="flex items-center gap-1.5 rounded bg-black/40 px-2 py-1">
            <span class="font-mono text-[10px] text-muted">Y</span>
            <input
              type="number"
              class="w-full bg-transparent font-mono text-xs text-white outline-none"
              value={Math.round(cfg.y)}
              onchange={(e) => {
                cfg.y = Number(e.currentTarget.value) || 0;
                saveConfig();
              }}
            />
          </label>
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            class={[
              "flex-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
              cfg.locked ? "border-amber-400/60 bg-amber-500/20 text-amber-300" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
            ]}
            onclick={() => {
              cfg.locked = !cfg.locked;
              saveConfig();
            }}
          >
            {cfg.locked ? "🔒 Bloqueado" : "🔓 Libre"}
          </button>
          <button
            type="button"
            class={[
              "flex-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
              cfg.autoFadeInCorners ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200" : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
            ]}
            onclick={() => {
              cfg.autoFadeInCorners = !cfg.autoFadeInCorners;
              saveConfig();
            }}
          >
            👁️ {cfg.autoFadeInCorners ? "Atenuar curva ON" : "Atenuar curva"}
          </button>
        </div>
      </div>

      <!-- Widget-specific options from meta.options -->
      {#if meta.options.length > 0}
        <div class="space-y-2.5 rounded-lg border border-white/10 bg-black/35 p-2.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Parámetros de {meta.name}
          </div>
          {#each meta.options as o (o.key)}
            {#if o.type === "boolean"}
              <label class="flex items-center justify-between gap-2 cursor-pointer py-0.5">
                <span class="text-white/90">{o.label}</span>
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-emerald-400 cursor-pointer"
                  checked={!!cfg.options[o.key]}
                  onchange={(e) => {
                    cfg.options[o.key] = e.currentTarget.checked;
                    saveConfig();
                  }}
                />
              </label>
            {:else if o.type === "number"}
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <span class="text-white/90">{o.label}</span>
                  <span class="font-mono text-cyan-300">{cfg.options[o.key]}</span>
                </div>
                <input
                  type="range"
                  min={o.min}
                  max={o.max}
                  step={o.step}
                  bind:value={cfg.options[o.key]}
                  oninput={saveConfig}
                  class="w-full accent-emerald-400"
                />
              </div>
            {:else}
              <label class="flex flex-col gap-1">
                <span class="text-white/90">{o.label}</span>
                <select class="field py-1! text-xs!" bind:value={cfg.options[o.key]} onchange={saveConfig}>
                  {#each o.choices as c}
                    <option value={c.value}>{c.label}</option>
                  {/each}
                </select>
              </label>
            {/if}
          {/each}
        </div>
      {/if}

      <!-- Special per-widget extras -->
      {#if activeWidgetId === "customdash"}
        <div class="space-y-2 rounded-lg border border-white/10 bg-black/35 p-2.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-accent">Plantilla Dash Studio</div>
          <select
            class="field w-full py-1! text-xs!"
            value={cfg.options.dashboardId ?? config.value.customDashboards?.[0]?.id ?? ""}
            onchange={(e) => {
              cfg.options.dashboardId = e.currentTarget.value;
              syncActiveProfile();
              saveConfig();
            }}
          >
            {#each config.value.customDashboards ?? [] as d (d.id)}
              <option value={d.id}>{d.name} ({d.width}×{d.height})</option>
            {/each}
          </select>
        </div>
      {/if}

      {#if activeWidgetId === "mdtbranding"}
        <div class="space-y-2 rounded-lg border border-white/10 bg-black/35 p-2.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-accent">Identidad del Piloto</div>
          <input
            type="text"
            class="field w-full py-1! text-xs!"
            placeholder="Nombre personalizado (vacío = del juego)"
            value={cfg.options.customDriverName ?? ""}
            oninput={(e) => {
              cfg.options.customDriverName = e.currentTarget.value;
              saveConfig();
            }}
          />
        </div>
      {/if}

      {#if activeWidgetId === "spotter"}
        <div class="space-y-2.5 rounded-lg border border-white/10 bg-black/35 p-2.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-accent">Radio y Tonos Spotter</div>
          <label class="grid grid-cols-[88px_1fr_36px] items-center gap-2">
            <span class="text-muted">Volumen voz</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round((config.value.spotter?.volume ?? 0.85) * 100)}
              oninput={(e) => {
                config.value.spotter.volume = Number(e.currentTarget.value) / 100;
                saveConfig();
              }}
              class="accent-accent"
            />
            <span class="text-right font-mono">{Math.round((config.value.spotter?.volume ?? 0.85) * 100)}%</span>
          </label>
          <label class="grid grid-cols-[88px_1fr_36px] items-center gap-2">
            <span class="text-muted">Vol. pitidos</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round((cfg.options.beepsVolume ?? config.value.spotter?.beepsVolume ?? 0.85) * 100)}
              oninput={(e) => {
                const v = Number(e.currentTarget.value) / 100;
                cfg.options.beepsVolume = v;
                if (config.value.spotter) config.value.spotter.beepsVolume = v;
                saveConfig();
              }}
              class="accent-accent"
            />
            <span class="text-right font-mono">{Math.round((cfg.options.beepsVolume ?? config.value.spotter?.beepsVolume ?? 0.85) * 100)}%</span>
          </label>
          <div class="flex items-center gap-1.5">
            <select class="field flex-1 py-1! text-[11px]!" bind:value={cfg.options.startSound} onchange={saveConfig}>
              {#each SPOTTER_ALERT_SOUNDS as snd}
                <option value={snd.value}>Inicio: {snd.label}</option>
              {/each}
            </select>
            <button
              type="button"
              class="rounded bg-accent/25 px-2 py-1 text-[10px] font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
              onclick={() => playSpotterTestSound(cfg.options.startSound ?? "1.mp3")}
            >▶</button>
          </div>
          <div class="flex items-center gap-1.5">
            <select class="field flex-1 py-1! text-[11px]!" bind:value={cfg.options.endSound} onchange={saveConfig}>
              {#each SPOTTER_ALERT_SOUNDS as snd}
                <option value={snd.value}>Fin: {snd.label}</option>
              {/each}
            </select>
            <button
              type="button"
              class="rounded bg-accent/25 px-2 py-1 text-[10px] font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
              onclick={() => playSpotterTestSound(cfg.options.endSound ?? "f1-radio-end.mp3")}
            >▶</button>
          </div>
        </div>
      {/if}

      {#if activeWidgetId === "battleforpos"}
        <div class="space-y-2 rounded-lg border border-white/10 bg-black/35 p-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-accent">Sonido de Batalla</span>
            <button
              type="button"
              class="rounded bg-accent/25 px-2 py-0.5 text-[10px] font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
              onclick={playBattleTestSound}
            >▶ Probar</button>
          </div>
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-white/90">Alerta sonora</span>
            <input
              type="checkbox"
              class="h-4 w-4 accent-emerald-400"
              checked={cfg.options.soundAlert ?? true}
              onchange={(e) => {
                cfg.options.soundAlert = e.currentTarget.checked;
                saveConfig();
              }}
            />
          </label>
          <select
            class="field w-full py-1! text-[11px]!"
            value={cfg.options.soundFile ?? "Battle.mp3"}
            onchange={(e) => {
              cfg.options.soundFile = e.currentTarget.value;
              saveConfig();
            }}
          >
            {#each BATTLE_SOUNDS as snd (snd.value)}
              <option value={snd.value}>{snd.label}</option>
            {/each}
          </select>
          <label class="grid grid-cols-[78px_1fr_36px] items-center gap-2">
            <span class="text-muted">Volumen</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round((cfg.options.soundVolume ?? 0.8) * 100)}
              oninput={(e) => {
                cfg.options.soundVolume = Number(e.currentTarget.value) / 100;
                saveConfig();
              }}
              class="accent-accent"
            />
            <span class="text-right font-mono">{Math.round((cfg.options.soundVolume ?? 0.8) * 100)}%</span>
          </label>
        </div>
      {/if}

      {#if activeWidgetId === "mfd"}
        <div class="space-y-2 rounded-lg border border-white/10 bg-black/35 p-2.5">
          <div class="text-[10px] font-bold uppercase tracking-wider text-accent">Tema del Móvil / MFD</div>
          <div class="flex flex-wrap gap-1.5">
            {#each Object.entries(HUD_THEMES) as [id, t] (id)}
              <button
                type="button"
                class={[
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold cursor-pointer",
                  wheelControl.mobileTheme === id
                    ? "border-accent bg-accent text-white"
                    : "border-white/10 bg-black/40 text-muted hover:text-white",
                ]}
                onclick={() => wheelControl.setMobileTheme(id as PresetThemeId)}
              >
                <span class="h-2 w-2 rounded-full" style:background={t.accent}></span>
                {t.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <!-- THEME & GLOBAL CUSTOMIZATION TAB -->
      <div class="space-y-3">
        <div class="text-[10px] font-bold uppercase tracking-wider text-accent">
          Temas Predefinidos (Overlay + Fuentes + Móvil)
        </div>
        <div class="grid grid-cols-1 gap-1.5">
          {#each Object.entries(HUD_THEMES) as [id, t] (id)}
            <button
              type="button"
              class={[
                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-all cursor-pointer",
                g.theme === id
                  ? "border-accent bg-accent/20 text-white shadow-[0_0_12px_var(--color-accent)]"
                  : "border-white/10 bg-black/40 text-white/80 hover:border-white/30",
              ]}
              onclick={() => selectTheme(id as HudTheme)}
            >
              <div class="min-w-0">
                <div class="text-xs font-extrabold uppercase tracking-wide">{t.label}</div>
                <div class="truncate text-[10px] text-muted">{t.fontName} · {t.subtitle}</div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <span class="h-3.5 w-3.5 rounded-full border border-white/25" style:background={t.accent}></span>
                <span class="h-3.5 w-3.5 rounded-full border border-white/25" style:background={t.secondary}></span>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Custom Colors -->
      <div class="space-y-2.5 rounded-lg border border-white/10 bg-black/35 p-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Colores Personalizados</span>
          {#if g.theme === "custom"}
            <span class="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300 uppercase">Activo</span>
          {/if}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center justify-between rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 cursor-pointer">
            <span class="text-white/90">Acento</span>
            <input
              type="color"
              value={g.accentColor}
              oninput={(e) => {
                g.theme = "custom";
                g.accentColor = e.currentTarget.value;
                saveConfig();
              }}
              class="h-6 w-7 cursor-pointer rounded border border-white/20 bg-transparent"
            />
          </label>
          <label class="flex items-center justify-between rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 cursor-pointer">
            <span class="text-white/90">Fondo HUD</span>
            <input
              type="color"
              value={g.hudBgColor}
              oninput={(e) => {
                g.theme = "custom";
                g.hudBgColor = e.currentTarget.value;
                saveConfig();
              }}
              class="h-6 w-7 cursor-pointer rounded border border-white/20 bg-transparent"
            />
          </label>
        </div>
      </div>

      <!-- Global Scale, Opacity & Behavior -->
      <div class="space-y-2.5 rounded-lg border border-white/10 bg-black/35 p-2.5">
        <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Ajustes Globales del Overlay</div>

        <label class="grid grid-cols-[88px_1fr_40px] items-center gap-2">
          <span class="text-muted">Escala global</span>
          <input type="range" min="0.4" max="3" step="0.05" bind:value={g.scale} oninput={saveConfig} class="accent-emerald-400" />
          <span class="text-right font-mono">{Math.round(g.scale * 100)}%</span>
        </label>

        <label class="grid grid-cols-[88px_1fr_40px] items-center gap-2">
          <span class="text-muted">Opacidad HUD</span>
          <input type="range" min="0.2" max="1" step="0.01" bind:value={g.opacity} oninput={saveConfig} class="accent-emerald-400" />
          <span class="text-right font-mono">{Math.round(g.opacity * 100)}%</span>
        </label>

        <!-- #11 Live Glassmorphism / Carbon / Neon + Geometry -->
        <div class="space-y-2 border-t border-white/10 pt-2">
          <div class="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Acabado y Geometría en Vivo</div>
          <div class="grid grid-cols-4 gap-1">
            {#each [
              { id: "default", label: "Tema" },
              { id: "glass", label: "Cristal" },
              { id: "carbon", label: "Carbono" },
              { id: "neon", label: "Neón" },
            ] as tex (tex.id)}
              <button
                type="button"
                class={[
                  "rounded-md border px-1.5 py-1 text-[10px] font-bold transition-colors cursor-pointer",
                  (g.hudTexture ?? "default") === tex.id
                    ? "border-fuchsia-400 bg-fuchsia-500/25 text-white"
                    : "border-white/10 bg-black/40 text-muted hover:text-white",
                ]}
                onclick={() => {
                  g.hudTexture = tex.id as "default" | "glass" | "carbon" | "neon";
                  if (tex.id === "glass" && (!g.hudBlur || g.hudBlur < 6)) g.hudBlur = 12;
                  saveConfig();
                }}
              >
                {tex.label}
              </button>
            {/each}
          </div>
          <label class="grid grid-cols-[88px_1fr_40px] items-center gap-2">
            <span class="text-muted">Bordes (px)</span>
            <input
              type="range"
              min="0"
              max="24"
              step="1"
              value={g.hudRadius ?? 10}
              oninput={(e) => {
                g.hudRadius = Number(e.currentTarget.value);
                saveConfig();
              }}
              class="accent-fuchsia-400"
            />
            <span class="text-right font-mono">{g.hudRadius ?? 10}px</span>
          </label>
          <label class="grid grid-cols-[88px_1fr_40px] items-center gap-2">
            <span class="text-muted">Grosor línea</span>
            <input
              type="range"
              min="0"
              max="4"
              step="0.5"
              value={g.hudBorderWidth ?? 1}
              oninput={(e) => {
                g.hudBorderWidth = Number(e.currentTarget.value);
                saveConfig();
              }}
              class="accent-fuchsia-400"
            />
            <span class="text-right font-mono">{g.hudBorderWidth ?? 1}px</span>
          </label>
          <label class="grid grid-cols-[88px_1fr_40px] items-center gap-2">
            <span class="text-muted">Desenfoque</span>
            <input
              type="range"
              min="0"
              max="24"
              step="2"
              value={g.hudBlur ?? 0}
              oninput={(e) => {
                g.hudBlur = Number(e.currentTarget.value);
                saveConfig();
              }}
              class="accent-fuchsia-400"
            />
            <span class="text-right font-mono">{g.hudBlur ?? 0}px</span>
          </label>
        </div>

        <label class="grid grid-cols-[88px_1fr] items-center gap-2">
          <span class="text-muted">Unidades</span>
          <select class="field py-1! text-xs!" bind:value={g.units} onchange={saveConfig}>
            <option value="metric">Métrico (km/h · °C · L)</option>
            <option value="imperial">Imperial (mph · °F · gal)</option>
          </select>
        </label>

        <div class="space-y-1.5 border-t border-white/10 pt-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Arranque al salir a pista</span>
            {#if onTestTrackEntry}
              <button
                type="button"
                class="rounded bg-cyan-500/25 px-2 py-0.5 text-[10px] font-bold text-cyan-200 hover:bg-cyan-400 hover:text-black cursor-pointer"
                onclick={onTestTrackEntry}
              >
                ▶ Probar
              </button>
            {/if}
          </div>
          <select
            class="field w-full py-1! text-[11px]!"
            value={g.trackEntryAnim ?? "ignition"}
            onchange={(e) => {
              g.trackEntryAnim = e.currentTarget.value as TrackEntryAnim;
              saveConfig();
              onTestTrackEntry?.();
            }}
          >
            {#each TRACK_ENTRY_ANIMS as a (a.value)}
              <option value={a.value}>{a.label}</option>
            {/each}
          </select>
          <label class="flex items-center justify-between gap-2 cursor-pointer pt-0.5">
            <span class="text-white/85">🔊 Sonido de encendido al arrancar</span>
            <input
              type="checkbox"
              class="h-4 w-4 accent-cyan-400"
              checked={g.trackEntrySound ?? true}
              onchange={(e) => {
                g.trackEntrySound = e.currentTarget.checked;
                saveConfig();
              }}
            />
          </label>
        </div>

        <label class="flex items-center justify-between gap-2 cursor-pointer pt-0.5">
          <span class="text-white/90">Guías magnéticas de alineación</span>
          <input
            type="checkbox"
            class="h-4 w-4 accent-cyan-400"
            checked={g.smartGuides ?? true}
            onchange={(e) => {
              g.smartGuides = e.currentTarget.checked;
              saveConfig();
            }}
          />
        </label>

        <label class="flex items-center justify-between gap-2 cursor-pointer">
          <span class="text-white/90">Atenuación nocturna automática</span>
          <input
            type="checkbox"
            class="h-4 w-4 accent-cyan-400"
            checked={g.autoNightDim ?? false}
            onchange={(e) => {
              g.autoNightDim = e.currentTarget.checked;
              saveConfig();
            }}
          />
        </label>

        {#if g.autoNightDim}
          <label class="grid grid-cols-[88px_1fr_40px] items-center gap-2">
            <span class="text-muted">Opac. noche</span>
            <input
              type="range"
              min="0.35"
              max="1"
              step="0.02"
              value={g.nightOpacity ?? 0.68}
              oninput={(e) => {
                g.nightOpacity = Number(e.currentTarget.value);
                saveConfig();
              }}
              class="accent-cyan-400"
            />
            <span class="text-right font-mono">{Math.round((g.nightOpacity ?? 0.68) * 100)}%</span>
          </label>
        {/if}
      </div>
    {/if}
  </div>
</div>
