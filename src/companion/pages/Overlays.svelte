<script lang="ts">
  import { api } from "../../lib/api";
  import {
    applyCompleteOverlayTheme,
    config,
    HUD_THEMES,
    resetLayout,
    saveConfig,
    WIDGETS,
    type HudTheme,
    type PresetThemeId,
  } from "../../lib/config.svelte";
  import { live } from "../../lib/live.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import ProfileBar from "../components/ProfileBar.svelte";
  import Toggle from "../components/Toggle.svelte";
  import WidgetPreview from "../components/WidgetPreview.svelte";

  let selectedId = $state(WIDGETS[0].id);
  const meta = $derived(WIDGETS.find((w) => w.id === selectedId)!);
  const cfg = $derived(config.value.widgets[selectedId]);
  const g = $derived(config.value.general);

  function selectTheme(t: HudTheme) {
    if (t === "custom") {
      g.theme = "custom";
      saveConfig();
    } else {
      applyCompleteOverlayTheme(t, true);
    }
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
          Temas Predefinidos Completos del Overlay (Diseño + Dashboard + Colores)
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
              ? "border-accent bg-surface-3 text-fg shadow-[0_0_16px_rgb(34_135_236/0.25)]"
              : "border-line bg-surface-2/60 text-muted hover:border-white/25 hover:text-fg",
          ]}
          onclick={() => selectTheme(id as HudTheme)}
        >
          <div class="flex w-full items-center justify-between">
            <span class="font-display text-sm font-extrabold tracking-wider text-fg">{t.label}</span>
            <div class="flex items-center gap-1">
              <span class="h-3 w-3 rounded-full border border-white/20" style:background={t.accent}></span>
              <span class="h-3 w-3 rounded-full border border-white/20" style:background={t.secondary}></span>
            </div>
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

  <div class="grid grid-cols-[320px_1fr] gap-4">
    <div class="flex flex-col gap-1 card p-2">
      {#each WIDGETS as w (w.id)}
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
      {/each}
    </div>

    <div class="min-w-0 card p-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="section-title text-lg">{meta.name}</h2>
          <p class="text-sm text-muted">{meta.description}</p>
        </div>
        <Toggle
          checked={cfg.enabled}
          label="Activado"
          onchange={(v) => {
            cfg.enabled = v;
            saveConfig();
          }}
        />
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
    </div>
  </div>
</div>
