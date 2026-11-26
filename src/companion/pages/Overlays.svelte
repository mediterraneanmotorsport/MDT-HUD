<script lang="ts">
  import { api } from "../../lib/api";
  import {
    applyCompleteOverlayTheme,
    BATTLE_SOUNDS,
    config,
    HUD_THEMES,
    resetLayout,
    saveConfig,
    syncActiveProfile,
    WIDGETS,
    type HudTheme,
    type PresetThemeId,
  } from "../../lib/config.svelte";
  import { live } from "../../lib/live.svelte";
  import { spotter } from "../../lib/spotter.svelte";
  import { REACTIVE_WIDGET_IDS, testAlert } from "../../lib/testAlert.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import { nav } from "../nav.svelte";
  import ProfileBar from "../components/ProfileBar.svelte";
  import Toggle from "../components/Toggle.svelte";
  import WidgetPreview from "../components/WidgetPreview.svelte";

  type WidgetCategory = "all" | "enabled" | "driving" | "strategy" | "broadcast" | "audio";
  const CATEGORY_MAP: Record<Exclude<WidgetCategory, "all" | "enabled">, Set<string>> = {
    driving: new Set([
      "dashboard", "customdash", "inputs", "delta", "laptiming", "shiftlights", "radar", "tyres",
      "brakelockup", "damage", "electronics", "tracklimits", "liftcoast", "flags",
    ]),
    strategy: new Set([
      "fuel", "stintplanner", "stintpace", "pitrejoin", "pacecatch", "weather",
      "session", "trackmap", "relative", "multiclasstraffic",
    ]),
    broadcast: new Set([
      "standings", "customdash", "battleforpos", "broadcastticker", "driverlowerthird",
      "headtohead", "gridpodium", "mdtbranding", "mfd", "spotter",
    ]),
    audio: new Set(["spotter", "battleforpos", "radar", "multiclasstraffic"]),
  };

  let searchQuery = $state("");
  let activeCategory = $state<WidgetCategory>("all");

  const filteredWidgets = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return WIDGETS.filter((w) => {
      if (activeCategory === "enabled" && !config.value.widgets[w.id]?.enabled) return false;
      if (activeCategory !== "all" && activeCategory !== "enabled") {
        if (!CATEGORY_MAP[activeCategory].has(w.id)) return false;
      }
      if (!q) return true;
      return w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.id.includes(q);
    });
  });

  let testSentMsg = $state("");
  function fireTestAlert(id: string) {
    testAlert.trigger(id, 4500);
    testSentMsg = "✓ Enviada al overlay (4.5s)";
    setTimeout(() => (testSentMsg = ""), 2500);
  }

  let selectedId = $state(WIDGETS[0].id);
  const meta = $derived(WIDGETS.find((w) => w.id === selectedId)!);
  const cfg = $derived(config.value.widgets[selectedId]);
  const g = $derived(config.value.general);

  let avatarInput = $state<HTMLInputElement | null>(null);
  let avatarError = $state("");

  function selectTheme(t: HudTheme) {
    if (t === "custom") {
      g.theme = "custom";
      saveConfig();
    } else {
      applyCompleteOverlayTheme(t, true);
      wheelControl.setMobileTheme(t);
    }
  }

  function handleAvatarUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    avatarError = "";

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 192;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Center-crop square
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

        const dataUrl = canvas.toDataURL("image/webp", 0.88);
        cfg.options.avatarDataUrl = dataUrl;
        cfg.options.showAvatar = true;
        saveConfig();
      };
      img.onerror = () => {
        avatarError = "No se pudo cargar la imagen seleccionada.";
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function clearAvatar() {
    cfg.options.avatarDataUrl = "";
    saveConfig();
  }

  const THEME_FONT_STYLE: Record<string, string> = {
    "mdt-aura": "font-family: 'Barlow Condensed', 'Barlow', sans-serif; letter-spacing: 0.06em;",
    "mdt-f1": "font-family: 'Impact', 'Arial Black', sans-serif; font-style: italic; letter-spacing: 0.08em;",
    "mdt-hy": "font-family: 'Bahnschrift', 'Consolas', monospace; letter-spacing: 0.14em;",
    "mdt-gt3": "font-family: 'Cascadia Mono', 'Consolas', monospace; letter-spacing: 0.04em;",
    "mdt-lmp2": "font-family: 'Franklin Gothic Medium', 'Georgia', serif; letter-spacing: 0.09em;",
  };

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
    { value: "f1-radio-end.mp3", label: "F1 Radio End (f1-radio-end.mp3)" },
    { value: "mic_click", label: "Pitido sintético walkie-talkie" },
    { value: "none", label: "Ninguno (Silencioso)" },
  ];

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
</script>

<div class="mx-auto max-w-6xl p-6">
  <div class="mb-5 flex items-center justify-between">
    <div>
      <h1 class="page-title">Overlays</h1>
      <p class="text-sm text-muted">Activa y personaliza los widgets. Colócalos en pantalla con el editor de diseño.</p>
    </div>
    <div class="flex gap-2">
      <button class="btn" onclick={resetLayout}>Restablecer posiciones</button>
      <button
        class={["btn", live.status.editMode ? "bg-warn! text-black" : "btn-primary"]}
        onclick={() => api.setEditMode(!live.status.editMode)}
      >
        {live.status.editMode ? "Terminar edición" : "Editar diseño en pantalla"}
      </button>
    </div>
  </div>

  <ProfileBar />

  <div class="mb-4 card p-4 text-sm">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <span class="text-xs font-semibold tracking-wider text-muted uppercase">
          Temas Predefinidos Completos (App + Overlay + Fuentes + Móvil)
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <button
          class={[
            "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            g.theme === "custom" ? "border-accent bg-surface-3 text-fg" : "border-line text-muted hover:text-fg",
          ]}
          onclick={() => selectTheme("custom")}
        >
          Personalizado
        </button>
        <label class="flex items-center gap-1.5 text-xs text-muted">
          Acento
          <input
            type="color"
            value={g.accentColor}
            oninput={(e) => {
              g.theme = "custom";
              g.accentColor = e.currentTarget.value;
              saveConfig();
            }}
            class="h-6 w-7 cursor-pointer rounded border border-line bg-transparent"
          />
        </label>
        <label class="flex items-center gap-1.5 text-xs text-muted">
          Fondo
          <input
            type="color"
            value={g.hudBgColor}
            oninput={(e) => {
              g.theme = "custom";
              g.hudBgColor = e.currentTarget.value;
              saveConfig();
            }}
            class="h-6 w-7 cursor-pointer rounded border border-line bg-transparent"
          />
        </label>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
      {#each Object.entries(HUD_THEMES) as [id, t] (id)}
        <button
          class={[
            "flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all",
            g.theme === id
              ? "border-accent bg-surface-3 text-fg shadow-[0_0_18px_var(--color-accent)]"
              : "border-line bg-surface-2/60 text-muted hover:border-white/25 hover:text-fg",
          ]}
          onclick={() => selectTheme(id as HudTheme)}
        >
          <div class="flex w-full items-center justify-between">
            <span class="text-base font-extrabold text-fg uppercase" style={THEME_FONT_STYLE[id]}>{t.label}</span>
            <div class="flex items-center gap-1">
              <span class="h-3 w-3 rounded-full border border-white/20" style:background={t.accent}></span>
              <span class="h-3 w-3 rounded-full border border-white/20" style:background={t.secondary}></span>
            </div>
          </div>
          <div class="mt-1 rounded bg-white/6 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-accent-hi uppercase">
            Fuente: {t.fontName}
          </div>
          <div class="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted">{t.subtitle}</div>
        </button>
      {/each}
    </div>
  </div>

  <div class="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 card px-5 py-3 text-sm">
    <span class="text-xs font-semibold tracking-wider text-muted uppercase">Todos los widgets</span>
    <label class="flex items-center gap-3">
      <span class="text-muted">Escala</span>
      <input type="range" min="0.4" max="3" step="0.05" bind:value={g.scale} oninput={saveConfig} class="w-40 accent-accent" />
      <span class="w-10 text-right tnum">{Math.round(g.scale * 100)}%</span>
    </label>
    <label class="flex items-center gap-3">
      <span class="text-muted">Opacidad</span>
      <input type="range" min="0.2" max="1" step="0.01" bind:value={g.opacity} oninput={saveConfig} class="w-40 accent-accent" />
      <span class="w-10 text-right tnum">{Math.round(g.opacity * 100)}%</span>
    </label>
  </div>

  <div class="grid grid-cols-[340px_1fr] gap-4">
    <div class="flex flex-col gap-2 card p-2.5">
      <!-- Buscador y filtros de categoría -->
      <div class="flex flex-col gap-2 border-b border-line pb-2">
        <input
          type="search"
          class="field w-full py-1.5 text-xs"
          placeholder="🔍 Buscar entre {WIDGETS.length} widgets..."
          bind:value={searchQuery}
        />
        <div class="flex flex-wrap gap-1">
          {#each [
            { id: "all", label: "Todos" },
            { id: "enabled", label: "Activos" },
            { id: "driving", label: "Pilotaje" },
            { id: "strategy", label: "Estrategia" },
            { id: "broadcast", label: "Broadcast TV" },
            { id: "audio", label: "Spotter" },
          ] as cat (cat.id)}
            <button
              type="button"
              class={[
                "rounded-md px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                activeCategory === cat.id
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg",
              ]}
              onclick={() => (activeCategory = cat.id as WidgetCategory)}
            >
              {cat.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="flex max-h-[68vh] flex-col gap-1 overflow-y-auto pr-0.5">
        {#each filteredWidgets as w (w.id)}
          {@const wc = config.value.widgets[w.id]}
          <div
            class={[
              "flex items-center gap-3 rounded-md px-3 py-2",
              selectedId === w.id ? "bg-surface-3 shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-surface-2",
            ]}
          >
            <button class="min-w-0 flex-1 text-left" onclick={() => (selectedId = w.id)}>
              <div class="text-sm font-medium">{w.name}</div>
              <div class="truncate text-xs text-muted">{w.description}</div>
            </button>
            <Toggle
              checked={wc.enabled}
              label={`Activar ${w.name}`}
              onchange={(v) => {
                wc.enabled = v;
                saveConfig();
              }}
            />
          </div>
        {:else}
          <div class="px-3 py-6 text-center text-xs text-muted">
            No se encontraron widgets con ese filtro.
          </div>
        {/each}
      </div>
    </div>

    <div class="min-w-0 card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="section-title text-lg">{meta.name}</h2>
          <p class="text-sm text-muted">{meta.description}</p>
        </div>
        <div class="flex items-center gap-3">
          {#if REACTIVE_WIDGET_IDS.has(selectedId)}
            <button
              type="button"
              class="btn bg-accent/20 border border-accent/40 text-accent hover:bg-accent hover:text-white text-xs font-bold transition-colors cursor-pointer"
              onclick={() => fireTestAlert(selectedId)}
              title="Lanza una vista previa animada de 4,5 segundos directamente en el overlay y OBS"
            >
              {testSentMsg || "⚡ Probar alerta en overlay"}
            </button>
          {/if}
          <Toggle
            checked={cfg.enabled}
            label="Activado"
            onchange={(v) => {
              cfg.enabled = v;
              saveConfig();
            }}
          />
        </div>
      </div>

      <div class="mt-5">
        <WidgetPreview {meta} />
      </div>

      <div class="mt-6 grid max-w-lg grid-cols-[160px_1fr_60px] items-center gap-x-4 gap-y-4 text-sm">
        <span class="text-muted">Posición</span>
        <span class="col-span-2 text-muted tnum">x {Math.round(cfg.x)} · y {Math.round(cfg.y)}</span>

        <span class="text-muted">Tamaño</span>
        <input type="range" min="0.4" max="3" step="0.05" bind:value={cfg.size} oninput={saveConfig} class="accent-accent" />
        <span class="text-right tnum">{Math.round(cfg.size * 100)}%</span>

        <span class="text-muted">Opacidad</span>
        <input type="range" min="0.2" max="1" step="0.01" bind:value={cfg.alpha} oninput={saveConfig} class="accent-accent" />
        <span class="text-right tnum">{Math.round(cfg.alpha * 100)}%</span>

        {#each meta.options as o (o.key)}
          <span class="text-muted">{o.label}</span>
          {#if o.type === "boolean"}
            <div class="col-span-2">
              <Toggle
                checked={!!cfg.options[o.key]}
                label={o.label}
                onchange={(v) => {
                  cfg.options[o.key] = v;
                  saveConfig();
                }}
              />
            </div>
          {:else if o.type === "number"}
            <input
              type="range"
              min={o.min}
              max={o.max}
              step={o.step}
              bind:value={cfg.options[o.key]}
              oninput={saveConfig}
              class="accent-accent"
            />
            <span class="text-right tnum">{cfg.options[o.key]}</span>
          {:else}
            <select
              class="col-span-2 field"
              bind:value={cfg.options[o.key]}
              onchange={saveConfig}
            >
              {#each o.choices as c}<option value={c.value}>{c.label}</option>{/each}
            </select>
          {/if}
        {/each}
      </div>

      {#if selectedId === "customdash"}
        <div class="mt-5 border-t border-line pt-4 text-sm">
          <h3 class="font-bold text-fg">🎨 Plantilla de Dash Studio activa en el Overlay</h3>
          <p class="mt-0.5 text-xs text-muted">
            Elige qué dashboard diseñado en <strong>Dash Studio</strong> quieres mostrar en este widget.
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <select
              class="field max-w-sm flex-1 text-xs"
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
        </div>
      {/if}

      {#if selectedId === "mdtbranding"}
        <div class="mt-6 border-t border-line pt-5 text-sm">
          <h3 class="font-bold text-fg">Identidad del Piloto (Nombre en Vivo, Bandera y Foto Circular)</h3>
          <p class="mt-0.5 text-xs text-muted">
            Por defecto muestra automáticamente el nombre del piloto detectado en Le Mans Ultimate y la bandera de su país. También puedes subir tu foto en círculo o fijar un alias personalizado.
          </p>

          <div class="mt-4 grid max-w-lg gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold tracking-wider text-muted uppercase">
                Nombre del piloto (vacío = automático del juego)
              </span>
              <input
                type="text"
                class="field"
                placeholder="Automático del juego (ej. M. García o [ES] M. García)"
                value={cfg.options.customDriverName ?? ""}
                oninput={(e) => {
                  cfg.options.customDriverName = e.currentTarget.value;
                  saveConfig();
                }}
              />
            </label>

            <div>
              <div class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
                Foto del piloto en círculo (Opcional)
              </div>
              <div class="flex flex-wrap items-center gap-4">
                {#if cfg.options.avatarDataUrl}
                  <div class="relative h-14 w-14 shrink-0 rounded-full p-0.5 shadow-[0_0_12px_var(--color-accent)]" style="background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hi));">
                    <img
                      src={cfg.options.avatarDataUrl}
                      alt="Foto del piloto"
                      class="h-full w-full rounded-full bg-surface object-cover"
                    />
                  </div>
                {:else}
                  <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed border-line bg-surface-2 text-xs text-muted">
                    Sin foto
                  </div>
                {/if}

                <div class="flex flex-wrap items-center gap-2">
                  <input
                    bind:this={avatarInput}
                    type="file"
                    accept="image/*"
                    class="hidden"
                    onchange={handleAvatarUpload}
                  />
                  <button
                    type="button"
                    class="btn btn-primary text-xs"
                    onclick={() => avatarInput?.click()}
                  >
                    Subir foto del piloto
                  </button>
                  {#if cfg.options.avatarDataUrl}
                    <button
                      type="button"
                      class="btn text-xs text-bad hover:border-bad"
                      onclick={clearAvatar}
                    >
                      Quitar foto
                    </button>
                  {/if}
                </div>
              </div>
              {#if avatarError}
                <p class="mt-1.5 text-xs text-bad">{avatarError}</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      {#if selectedId === "mfd"}
        <div class="mt-6 border-t border-line pt-5 text-sm">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-fg">Configuración del Widget Móvil y MFD</h3>
              <p class="text-xs text-muted">
                Elige el tema del móvil y modifica el orden, elimina o añade dashboards a la rotación del volante.
              </p>
            </div>
            <button class="btn text-xs" onclick={() => wheelControl.resetPages()}>
              Restablecer orden
            </button>
          </div>

          <div class="mt-4">
            <div class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Tema del Móvil</div>
            <div class="flex flex-wrap gap-2">
              {#each Object.entries(HUD_THEMES) as [id, t] (id)}
                <button
                  class={[
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition",
                    wheelControl.mobileTheme === id
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-surface-2 text-muted hover:text-fg",
                  ]}
                  onclick={() => wheelControl.setMobileTheme(id as PresetThemeId)}
                >
                  <span class="h-2.5 w-2.5 rounded-full" style:background={t.accent}></span>
                  {t.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
                Orden de Dashboards Activos ({wheelControl.activePages.length})
              </div>
              <div class="space-y-1.5">
                {#each wheelControl.activePages as pg, idx (pg.id)}
                  <div class="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
                    <span class="font-semibold text-fg">
                      <span class="mr-1.5 font-mono text-accent">{idx + 1}.</span>{pg.title}
                    </span>
                    <div class="flex items-center gap-1">
                      <button
                        class="rounded bg-surface-3 px-2 py-0.5 font-bold hover:bg-line disabled:opacity-30"
                        disabled={idx === 0}
                        title="Subir"
                        onclick={() => wheelControl.movePage(idx, -1)}
                      >↑</button>
                      <button
                        class="rounded bg-surface-3 px-2 py-0.5 font-bold hover:bg-line disabled:opacity-30"
                        disabled={idx === wheelControl.activePages.length - 1}
                        title="Bajar"
                        onclick={() => wheelControl.movePage(idx, 1)}
                      >↓</button>
                      <button
                        class="ml-1 rounded bg-bad/20 px-2 py-0.5 font-bold text-bad hover:bg-bad hover:text-white disabled:opacity-30"
                        disabled={wheelControl.activePages.length <= 1}
                        title="Eliminar"
                        onclick={() => wheelControl.removePage(pg.id)}
                      >✕</button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <div>
              <div class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
                Añadir Nuevos Dashboards al Móvil
              </div>
              {#if wheelControl.availableToAdd.length === 0}
                <div class="rounded-lg border border-line bg-surface-2 p-3 text-xs text-muted">
                  Todos los dashboards disponibles están añadidos.
                </div>
              {:else}
                <div class="flex flex-wrap gap-1.5">
                  {#each wheelControl.availableToAdd as avail (avail.id)}
                    <button
                      class="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-fg hover:border-accent hover:text-accent"
                      onclick={() => wheelControl.addPage(avail.id)}
                    >
                      + {avail.short}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      {#if selectedId === "spotter"}
        <div class="mt-6 border-t border-line pt-5 text-sm">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-fg flex items-center gap-2">
                <span>📻 Sonidos de Transmisión de Radio (Team Radio)</span>
              </h3>
              <p class="text-xs text-muted">
                Configura los pitidos y tonos que suenan al abrir y cerrar la comunicación con el spotter o ingeniero.
              </p>
            </div>
          </div>

          <div class="mt-4 grid max-w-xl gap-3">
            <!-- Slider: Volumen de Voz del Spotter -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Volumen de Voz del Spotter / Ingeniero</div>
                <div class="text-[11px] text-muted">Intensidad de locución de los archivos de audio (.wav)</div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
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
                  class="accent-accent w-28 sm:w-36 cursor-pointer"
                />
                <span class="w-10 text-right font-mono text-xs font-bold text-fg">
                  {Math.round((config.value.spotter?.volume ?? 0.85) * 100)}%
                </span>
              </div>
            </div>

            <!-- Slider: Volumen de Pitidos de Radio -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Volumen de Pitidos y Tonos de Radio</div>
                <div class="text-[11px] text-muted">Intensidad de los efectos sonoros de apertura y cierre de radio</div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
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
                  class="accent-accent w-28 sm:w-36 cursor-pointer"
                />
                <span class="w-10 text-right font-mono text-xs font-bold text-fg">
                  {Math.round((cfg.options.beepsVolume ?? config.value.spotter?.beepsVolume ?? 0.85) * 100)}%
                </span>
              </div>
            </div>

            <!-- Sonido al empezar a hablar (Inicio) -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Sonido al empezar a hablar (Inicio)</div>
                <div class="text-[11px] text-muted">Pitido de radio previo a la locución del spotter</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <select
                  class="field py-1 text-xs"
                  bind:value={cfg.options.startSound}
                  onchange={saveConfig}
                >
                  {#each SPOTTER_ALERT_SOUNDS as snd}
                    <option value={snd.value}>{snd.label}</option>
                  {/each}
                </select>
                <button
                  type="button"
                  class="rounded bg-accent/20 border border-accent/40 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
                  onclick={() => playSpotterTestSound(cfg.options.startSound ?? "1.mp3")}
                  title="Probar sonido de inicio"
                >
                  ▶ Probar audio
                </button>
              </div>
            </div>

            <!-- Sonido al terminar de hablar (Fin - Opcional) -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Sonido al terminar de hablar (Fin)</div>
                <div class="text-[11px] text-muted">Pitido de fin de transmisión (opcional, puede dejarse vacío/ninguno)</div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <select
                  class="field py-1 text-xs"
                  bind:value={cfg.options.endSound}
                  onchange={saveConfig}
                >
                  {#each SPOTTER_ALERT_SOUNDS as snd}
                    <option value={snd.value}>{snd.label}</option>
                  {/each}
                </select>
                <button
                  type="button"
                  class="rounded bg-accent/20 border border-accent/40 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
                  onclick={() => playSpotterTestSound(cfg.options.endSound ?? "f1-radio-end.mp3")}
                  title="Probar sonido de finalización"
                >
                  ▶ Probar audio
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if selectedId === "battleforpos"}
        <div class="mt-6 border-t border-line pt-5 text-sm">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-fg flex items-center gap-2">
                <span>⚔️ Alerta Sonora de Duelo por Posición</span>
              </h3>
              <p class="text-xs text-muted">
                Emite el sonido especial Battle.mp3 cuando entras en lucha directa a menos de 1 segundo de un rival.
              </p>
            </div>
          </div>

          <div class="mt-4 grid max-w-xl gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Sonido de Batalla</div>
                <div class="text-[11px] text-muted">Se reproduce al activarse la alerta de batalla en pantalla</div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <Toggle
                  checked={cfg.options.soundAlert ?? true}
                  label="Activar alerta sonora"
                  onchange={(v) => {
                    cfg.options.soundAlert = v;
                    saveConfig();
                  }}
                />
                <button
                  type="button"
                  class="rounded bg-accent/20 border border-accent/40 px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
                  onclick={playBattleTestSound}
                  title="Probar sonido de batalla seleccionado"
                >
                  ⚔️ ▶ Probar audio
                </button>
              </div>
            </div>

            <!-- Selector de archivo de audio de batalla -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Audio de Batalla</div>
                <div class="text-[11px] text-muted">Elige qué pista de Sound/Batalla sonará al entrar en duelo</div>
              </div>
              <select
                class="field py-1 text-xs"
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
            </div>

            <!-- Slider: Volumen de la Alerta de Batalla -->
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-fg">Volumen de la Alerta de Batalla</div>
                <div class="text-[11px] text-muted">Intensidad del efecto sonoro al entrar en duelo directo</div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
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
                  class="accent-accent w-28 sm:w-36 cursor-pointer"
                />
                <span class="w-10 text-right font-mono text-xs font-bold text-fg">
                  {Math.round((cfg.options.soundVolume ?? 0.8) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if selectedId === "customdash"}
        <div class="mt-6 border-t border-line pt-5 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-bold text-fg">🎨 Dashboard Personalizado (MDT Dash Studio)</h3>
              <p class="text-xs text-muted">
                Elige cuál de tus diseños creados en Dash Studio se mostrará en este widget (compatible con Overlay PC y OBS Broadcast).
              </p>
            </div>
            <button
              type="button"
              class="btn btn-primary text-xs font-bold"
              onclick={() => (nav.page = "dashstudio")}
            >
              🎨 Abrir Editor Dash Studio
            </button>
          </div>

          <div class="mt-4 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 p-3">
            <div class="text-xs font-semibold text-fg">Diseño activo a mostrar</div>
            <select class="field py-1 text-xs" bind:value={cfg.options.dashboardId} onchange={saveConfig}>
              <option value="">(Primero disponible)</option>
              {#each config.value.customDashboards ?? [] as d (d.id)}
                <option value={d.id}>{d.name} ({d.width}×{d.height})</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
