<script lang="ts">
  import {
    MODULE_LABELS,
    PITWALL_PRESETS,
    PITWALL_THEMES,
    RIGHT_MODULE_LABELS,
    type PitwallConfig,
    type PitwallPreset,
    type PitwallRightModuleId,
    type PitwallThemeId,
  } from "./pitwallTypes";

  let {
    pitwallConfig = $bindable(),
    onApplyPreset,
    onSave,
    onReset,
    onClose,
  }: {
    pitwallConfig: PitwallConfig;
    onApplyPreset: (preset: PitwallPreset) => void;
    onSave: () => void;
    onReset: () => void;
    onClose: () => void;
  } = $props();

  let tab = $state<"presets" | "general" | "layout" | "columns" | "modules" | "units">("presets");

  function moveRightModule(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= pitwallConfig.rightOrder.length) return;
    const copy = [...pitwallConfig.rightOrder];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    pitwallConfig.rightOrder = copy;
  }

  const columnDefs: { key: keyof PitwallConfig["columns"]; title: string; desc: string }[] = [
    { key: "diff", title: "Ganancia de Posición (DIFF)", desc: "▲ / ▼ respecto a la parrilla de salida" },
    { key: "cls", title: "Insignia de Clase (CLASS)", desc: "Categoría del coche (HYP, LMP2, GT3)" },
    { key: "pit", title: "Boxes & Crono en Vivo (PIT INFO)", desc: "Paradas, tiempo total en pit lane + tiempo parado en box" },
    { key: "ve", title: "Energía Virtual & Stint (VE / STINT)", desc: "Barra de VE %, vueltas estimadas de VE y vueltas del stint" },
    { key: "lap", title: "Vuelta Actual (LAP)", desc: "Vueltas completadas por cada coche" },
    { key: "gap", title: "Diferencia con Líder (GAP)", desc: "Tiempo en segundos respecto al 1º" },
    { key: "interval", title: "Intervalo Coche Delante (INT)", desc: "Tiempo respecto al coche inmediatamente anterior" },
    { key: "bestLap", title: "Mejor Vuelta (BEST LAP)", desc: "Con morado para vuelta rápida global / verde PB" },
    { key: "lastLap", title: "Última Vuelta (LAST LAP)", desc: "Tiempo registrado en la vuelta anterior con flash" },
    { key: "sectors", title: "Sectores S1, S2, S3", desc: "Tiempos parciales por sector" },
  ];
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md"
  onclick={onClose}
>
  <div
    class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#0d131f] shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/10 bg-black/40 px-5 py-3.5">
      <div class="flex items-center gap-2.5">
        <span class="text-xl">⚙️</span>
        <div>
          <div class="font-display text-base font-black text-white">Personalizar Pit Wall Pro</div>
          <div class="text-[11px] text-white/50">Presets de rol, temas de escudería, orden de paneles, columnas y estrategia</div>
        </div>
      </div>
      <button
        type="button"
        class="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white cursor-pointer"
        onclick={() => {
          onSave();
          onClose();
        }}
      >
        ✕
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex flex-wrap border-b border-white/10 bg-black/25 px-4 text-xs font-bold">
      {#each [
        { id: "presets", label: "⚡ Presets" },
        { id: "general", label: "🎨 Temas & Texto" },
        { id: "layout", label: "📐 Layout & Pit" },
        { id: "columns", label: "📋 Columnas" },
        { id: "modules", label: "🧩 Módulos" },
        { id: "units", label: "📏 Unidades" },
      ] as t (t.id)}
        <button
          type="button"
          class={[
            "border-b-2 px-3 py-2.5 transition cursor-pointer",
            tab === t.id ? "border-accent text-accent" : "border-transparent text-white/60 hover:text-white",
          ]}
          onclick={() => (tab = t.id as typeof tab)}
        >
          {t.label}
        </button>
      {/each}
    </div>

    <!-- Content -->
    <div class="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
      <!-- TAB: PRESETS -->
      {#if tab === "presets"}
        <p class="text-white/60">Aplica una configuración profesional completa con 1 clic según tu rol:</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each PITWALL_PRESETS as preset (preset.id)}
            <button
              type="button"
              class="flex flex-col items-start gap-1 rounded-xl border border-white/15 bg-black/40 p-3.5 text-left transition hover:border-accent hover:bg-accent/15 cursor-pointer"
              onclick={() => {
                onApplyPreset(preset);
                onSave();
              }}
            >
              <div class="flex items-center gap-2 font-display text-sm font-black text-white">
                <span class="text-lg">{preset.icon}</span>
                <span>{preset.label}</span>
              </div>
              <div class="text-[11px] text-white/60">{preset.desc}</div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- TAB: GENERAL (THEMES, ACCENT, FONT SCALE, DENSITY) -->
      {#if tab === "general"}
        <div>
          <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Tema Visual / Escudería</span>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {#each Object.values(PITWALL_THEMES) as tm (tm.id)}
              <button
                type="button"
                class={[
                  "flex flex-col rounded-xl border p-2.5 text-left transition cursor-pointer",
                  pitwallConfig.theme === tm.id ? "border-accent bg-accent/20" : "border-white/10 bg-black/40 hover:bg-white/5",
                ]}
                onclick={() => (pitwallConfig.theme = tm.id as PitwallThemeId)}
              >
                <div class="flex items-center gap-2">
                  <span class="h-3 w-3 rounded-full border border-white/25" style:background={tm.preview[0]}></span>
                  <span class="h-3 w-3 rounded-full" style:background={tm.preview[1]}></span>
                  <span class="font-bold text-white">{tm.label}</span>
                </div>
                <div class="mt-1 text-[10px] text-white/50">{tm.desc}</div>
              </button>
            {/each}
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <!-- Custom Accent Color -->
          <div class="rounded-xl border border-white/10 bg-black/35 p-3">
            <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Color de Acento Propio</span>
            <div class="flex items-center gap-2">
              <input
                type="color"
                class="h-8 w-12 cursor-pointer rounded border border-white/20 bg-transparent"
                value={pitwallConfig.customAccent || PITWALL_THEMES[pitwallConfig.theme].accent}
                oninput={(e) => (pitwallConfig.customAccent = e.currentTarget.value)}
              />
              <span class="font-mono text-xs text-white/80">
                {pitwallConfig.customAccent || "Por defecto del tema"}
              </span>
              {#if pitwallConfig.customAccent}
                <button
                  type="button"
                  class="ml-auto rounded bg-white/10 px-2 py-1 text-[10px] font-bold text-white hover:bg-white/20 cursor-pointer"
                  onclick={() => (pitwallConfig.customAccent = "")}
                >
                  Restablecer
                </button>
              {/if}
            </div>
          </div>

          <!-- Font Scale -->
          <div class="rounded-xl border border-white/10 bg-black/35 p-3">
            <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Escala de Tipografía</span>
            <div class="grid grid-cols-3 gap-1.5">
              {#each [
                { id: "sm", label: "S · Pequeña" },
                { id: "md", label: "M · Normal" },
                { id: "lg", label: "L · Grande" },
              ] as fs (fs.id)}
                <button
                  type="button"
                  class={[
                    "rounded-lg border py-1.5 text-center font-bold transition cursor-pointer",
                    pitwallConfig.fontScale === fs.id ? "border-accent bg-accent/25 text-white" : "border-white/10 bg-black/40 text-white/60 hover:text-white",
                  ]}
                  onclick={() => (pitwallConfig.fontScale = fs.id as PitwallConfig["fontScale"])}
                >
                  {fs.label}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <div class="border-t border-white/10 pt-4">
          <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Densidad de Filas del Leaderboard</span>
          <div class="grid grid-cols-3 gap-2">
            {#each [
              { id: "compact", title: "Compacto", desc: "25+ coches sin scroll" },
              { id: "normal", title: "Normal", desc: "Equilibrio estándar" },
              { id: "spacious", title: "Espacioso", desc: "Ideal táctil / tablet" },
            ] as d (d.id)}
              <button
                type="button"
                class={[
                  "rounded-xl border p-2.5 text-left transition cursor-pointer",
                  pitwallConfig.density === d.id ? "border-accent bg-accent/20" : "border-white/10 bg-black/40 hover:bg-white/5",
                ]}
                onclick={() => (pitwallConfig.density = d.id as PitwallConfig["density"])}
              >
                <div class="font-bold text-white">{d.title}</div>
                <div class="text-[10px] text-white/50">{d.desc}</div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- TAB: LAYOUT & PIT PREDICTOR -->
      {#if tab === "layout"}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="rounded-xl border border-white/10 bg-black/35 p-3">
            <div class="mb-1 flex justify-between text-[11px] font-bold text-white uppercase">
              <span>Ancho Columna Izquierda</span>
              <span class="font-mono text-accent">{pitwallConfig.splitPct}%</span>
            </div>
            <input
              type="range"
              min="45"
              max="75"
              step="1"
              class="w-full accent-accent"
              bind:value={pitwallConfig.splitPct}
            />
            <div class="mt-1 text-[10px] text-white/50">También puedes arrastrar el separador vertical directamente en el Pit Wall.</div>
          </div>

          <div class="rounded-xl border border-white/10 bg-black/35 p-3">
            <div class="mb-1 flex justify-between text-[11px] font-bold text-white uppercase">
              <span>Tiempo Perdido en Pit Stop (Rejoin)</span>
              <span class="font-mono text-cyan-400">{pitwallConfig.pitLossSec}s</span>
            </div>
            <input
              type="range"
              min="15"
              max="75"
              step="1"
              class="w-full accent-cyan-400"
              bind:value={pitwallConfig.pitLossSec}
            />
            <div class="mt-1 text-[10px] text-white/50">Usado para proyectar la posición de salida (REJOIN) en mapa y tabla.</div>
          </div>
        </div>

        <div class="border-t border-white/10 pt-4">
          <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">
            Orden de Paneles en Columna Derecha
          </span>
          <div class="space-y-1.5">
            {#each pitwallConfig.rightOrder as modId, idx (modId)}
              <div class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="w-5 font-mono text-[11px] font-bold text-accent">{idx + 1}.</span>
                  <span class="font-bold text-white">{RIGHT_MODULE_LABELS[modId as PitwallRightModuleId] ?? modId}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    class="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-white hover:bg-accent disabled:opacity-30 cursor-pointer"
                    onclick={() => moveRightModule(idx, -1)}
                  >↑</button>
                  <button
                    type="button"
                    disabled={idx === pitwallConfig.rightOrder.length - 1}
                    class="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-white hover:bg-accent disabled:opacity-30 cursor-pointer"
                    onclick={() => moveRightModule(idx, 1)}
                  >↓</button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- TAB: COLUMNS -->
      {#if tab === "columns"}
        <p class="text-white/60">Activa o desactiva columnas del Leaderboard:</p>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each columnDefs as col (col.key)}
            <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 hover:bg-white/5">
              <div>
                <div class="font-bold text-white">{col.title}</div>
                <div class="text-[10px] text-white/50">{col.desc}</div>
              </div>
              <input type="checkbox" class="h-4 w-4 rounded accent-accent" bind:checked={pitwallConfig.columns[col.key]} />
            </label>
          {/each}
        </div>
      {/if}

      <!-- TAB: MODULES -->
      {#if tab === "modules"}
        <p class="text-white/60">Enciende o apaga bloques del Pit Wall:</p>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each Object.keys(pitwallConfig.modules) as modKey (modKey)}
            {@const k = modKey as keyof PitwallConfig["modules"]}
            <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 hover:bg-white/5">
              <span class="font-bold text-white">{MODULE_LABELS[k] ?? k}</span>
              <input type="checkbox" class="h-4 w-4 rounded accent-accent" bind:checked={pitwallConfig.modules[k]} />
            </label>
          {/each}
        </div>
      {/if}

      <!-- TAB: UNITS -->
      {#if tab === "units"}
        <div class="space-y-4">
          <div>
            <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Presión de Neumáticos</span>
            <div class="grid grid-cols-3 gap-2">
              {#each ["psi", "bar", "kpa"] as u (u)}
                <button
                  type="button"
                  class={[
                    "rounded-xl border p-3 text-center uppercase transition cursor-pointer",
                    pitwallConfig.units.pressure === u ? "border-accent bg-accent/20 font-bold text-white" : "border-white/10 bg-black/40 text-white/60 hover:text-white",
                  ]}
                  onclick={() => (pitwallConfig.units.pressure = u as PitwallConfig["units"]["pressure"])}
                >
                  {u}
                </button>
              {/each}
            </div>
          </div>
          <div class="border-t border-white/10 pt-4">
            <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Temperatura</span>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class={["rounded-xl border p-3 text-center transition cursor-pointer", pitwallConfig.units.temp === "c" ? "border-accent bg-accent/20 font-bold text-white" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                onclick={() => (pitwallConfig.units.temp = "c")}
              >Celsius (°C)</button>
              <button
                type="button"
                class={["rounded-xl border p-3 text-center transition cursor-pointer", pitwallConfig.units.temp === "f" ? "border-accent bg-accent/20 font-bold text-white" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                onclick={() => (pitwallConfig.units.temp = "f")}
              >Fahrenheit (°F)</button>
            </div>
          </div>
          <div class="border-t border-white/10 pt-4">
            <span class="mb-2 block text-[11px] font-bold tracking-wider text-white uppercase">Velocidad</span>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class={["rounded-xl border p-3 text-center transition cursor-pointer", pitwallConfig.units.speed === "kmh" ? "border-accent bg-accent/20 font-bold text-white" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                onclick={() => (pitwallConfig.units.speed = "kmh")}
              >KM/H</button>
              <button
                type="button"
                class={["rounded-xl border p-3 text-center transition cursor-pointer", pitwallConfig.units.speed === "mph" ? "border-accent bg-accent/20 font-bold text-white" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                onclick={() => (pitwallConfig.units.speed = "mph")}
              >MPH</button>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-white/10 bg-black/40 px-5 py-3">
      <button type="button" class="text-xs text-white/50 underline transition hover:text-white cursor-pointer" onclick={onReset}>
        Restablecer por defecto
      </button>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-white/20 cursor-pointer"
          onclick={onClose}
        >Cerrar</button>
        <button
          type="button"
          class="rounded-lg bg-accent px-5 py-1.5 text-xs font-bold text-white shadow transition hover:opacity-90 cursor-pointer"
          onclick={() => {
            onSave();
            onClose();
          }}
        >Guardar y Aplicar</button>
      </div>
    </div>
  </div>
</div>
