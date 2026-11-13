<script lang="ts">
  import { onMount } from "svelte";
  import {
    applyThemeToElement,
    config,
    HUD_THEMES,
    loadConfig,
    type PresetThemeId,
  } from "../lib/config.svelte";
  import { live, provideLive, startLive } from "../lib/live.svelte";
  import type { Snapshot } from "../lib/types";
  import { wheelControl } from "../lib/wheelControl.svelte";
  import Damage from "../overlay/widgets/Damage.svelte";
  import Dashboard from "../overlay/widgets/Dashboard.svelte";
  import Electronics from "../overlay/widgets/Electronics.svelte";
  import Fuel from "../overlay/widgets/Fuel.svelte";
  import Inputs from "../overlay/widgets/Inputs.svelte";
  import LapTiming from "../overlay/widgets/LapTiming.svelte";
  import LiftCoast from "../overlay/widgets/LiftCoast.svelte";
  import PaceCatch from "../overlay/widgets/PaceCatch.svelte";
  import Radar from "../overlay/widgets/Radar.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import TrackLimits from "../overlay/widgets/TrackLimits.svelte";
  import TrackMap from "../overlay/widgets/TrackMap.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let showHudBadge = $state(true);
  let showSettingsModal = $state(false);
  let badgeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeq = -1;
  let lastConfigSeq = -1;

  let viewportEl = $state<HTMLDivElement | null>(null);
  let contentEl = $state<HTMLDivElement | null>(null);
  let autoScale = $state(1);

  provideLive({
    get snap() {
      return remoteSnap ?? live.snap;
    },
  });

  function flashBadge() {
    showHudBadge = true;
    if (badgeTimer) clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => {
      if (!showSettingsModal) showHudBadge = false;
    }, 2400);
  }

  function recomputeScale() {
    if (!viewportEl || !contentEl) return;
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;
    const cw = contentEl.offsetWidth;
    const ch = contentEl.offsetHeight;
    if (vw > 0 && vh > 0 && cw > 0 && ch > 0) {
      const s = Math.min((vw * 0.96) / cw, (vh * 0.94) / ch);
      autoScale = Math.max(0.5, Math.min(4.5, s));
    }
  }

  $effect(() => {
    const _page = wheelControl.pageIndex;
    const _pagesLen = wheelControl.enabledPageIds.length;
    flashBadge();
    requestAnimationFrame(() => {
      recomputeScale();
      setTimeout(recomputeScale, 60);
    });
  });

  $effect(() => {
    const theme = wheelControl.mobileTheme;
    if (viewportEl) {
      applyThemeToElement(viewportEl, theme);
    }
  });

  onMount(() => {
    loadConfig();
    startLive();
    wheelControl.startHost();
    flashBadge();

    const ro = new ResizeObserver(() => recomputeScale());
    if (viewportEl) ro.observe(viewportEl);
    if (contentEl) ro.observe(contentEl);
    window.addEventListener("resize", recomputeScale);
    window.addEventListener("orientationchange", recomputeScale);

    const timer = setInterval(async () => {
      try {
        const res = await fetch("/__mobile_state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.snap) {
          remoteSnap = data.snap;
        }
        if (typeof data.configSeq === "number" && data.configSeq !== lastConfigSeq) {
          lastConfigSeq = data.configSeq;
          if (Array.isArray(data.pages) && data.pages.length > 0) {
            wheelControl.enabledPageIds = data.pages;
          }
          if (typeof data.mobileTheme === "string") {
            wheelControl.mobileTheme = data.mobileTheme;
          }
        }
        if (typeof data.pageSeq === "number" && data.pageSeq !== lastSeq) {
          lastSeq = data.pageSeq;
          const len = wheelControl.activePages.length;
          if (typeof data.page === "number" && data.page !== wheelControl.pageIndex) {
            wheelControl.pageIndex = ((data.page % len) + len) % len;
          }
        }
        recomputeScale();
      } catch {
        // ignore
      }
    }, 55);

    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock?.request("screen").catch(() => {});
    }

    return () => {
      clearInterval(timer);
      ro.disconnect();
      window.removeEventListener("resize", recomputeScale);
      window.removeEventListener("orientationchange", recomputeScale);
    };
  });

  function ensureFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock?.request("screen").catch(() => {});
    }
  }

  function handleScreenTap(e: MouseEvent) {
    if (showSettingsModal) return;
    ensureFullscreen();
    const w = window.innerWidth || 1;
    const x = e.clientX;
    if (x < w * 0.28) {
      wheelControl.prevPage();
    } else if (x > w * 0.72) {
      wheelControl.nextPage();
    } else {
      flashBadge();
    }
  }

  const activePages = $derived(wheelControl.activePages);
  const currentPage = $derived(activePages[wheelControl.pageIndex % activePages.length] ?? activePages[0]);
  const activeThemeMeta = $derived(HUD_THEMES[wheelControl.mobileTheme] ?? HUD_THEMES["mdt-aura"]);
  const units = $derived(config.value.general.units);
  const wCfg = $derived(config.value.widgets);
</script>

<!-- Contenedor 100% Pantalla Completa Móvil adaptado al Tema elegido -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={viewportEl}
  data-hud-theme={wheelControl.mobileTheme}
  onclick={handleScreenTap}
  class="fixed inset-0 flex h-dvh w-dvw items-center justify-center overflow-hidden text-fg select-none"
  style:background={activeThemeMeta.bg}
>
  <!-- Único Overlay Individual escalado automáticamente para llenar el 100% de la pantalla del teléfono -->
  <div
    bind:this={contentEl}
    class="flex items-center justify-center transition-transform duration-75"
    style="transform: scale({autoScale}); transform-origin: center center;"
  >
    {#if currentPage.id === "dashboard"}
      <Dashboard
        opts={{
          ...(wCfg.dashboard?.options ?? {}),
          style: activeThemeMeta.dashboardStyle,
          rpmStyle: activeThemeMeta.rpmStyle,
          showMdtLogo: true,
          showPedals: true,
          showSteeringWheel: true,
          showIndicators: true,
          showBattery: true,
          showSettings: true,
        }}
        {units}
        edit={true}
      />
    {:else if currentPage.id === "relative"}
      <Relative
        opts={{ ...(wCfg.relative?.options ?? {}), ahead: 4, behind: 4, showPaceDiff: true, showEnergy: true }}
        {units}
        edit={true}
      />
    {:else if currentPage.id === "standings"}
      <Standings
        opts={{ ...(wCfg.standings?.options ?? {}), showBranding: true, maxRows: 8, maxRowsOther: 4 }}
        {units}
        edit={true}
      />
    {:else if currentPage.id === "damage"}
      <Damage opts={{ ...(wCfg.damage?.options ?? {}), showCar: true }} {units} edit={true} />
    {:else if currentPage.id === "tyres"}
      <Tyres
        opts={{ ...(wCfg.tyres?.options ?? {}), showWearRate: true, showLapsLeft: true, showBrakes: true }}
        {units}
        edit={true}
      />
    {:else if currentPage.id === "fuel"}
      <Fuel
        opts={{ ...(wCfg.fuel?.options ?? {}), showPitAlert: true, showLast: true, showSaver: true, saverResource: "auto" }}
        {units}
        edit={true}
      />
    {:else if currentPage.id === "liftcoast"}
      <LiftCoast opts={{ ...(wCfg.liftcoast?.options ?? {}), showRegen: true }} {units} edit={true} />
    {:else if currentPage.id === "pacecatch"}
      <PaceCatch opts={{ ...(wCfg.pacecatch?.options ?? {}), sameClassOnly: true, showLastLap: true }} {units} edit={true} />
    {:else if currentPage.id === "tracklimits"}
      <TrackLimits opts={{ ...(wCfg.tracklimits?.options ?? {}), showAlways: true }} {units} edit={true} />
    {:else if currentPage.id === "electronics"}
      <Electronics opts={wCfg.electronics?.options ?? {}} {units} edit={true} />
    {:else if currentPage.id === "laptiming"}
      <LapTiming opts={{ ...(wCfg.laptiming?.options ?? {}), showSectors: true }} {units} edit={true} />
    {:else if currentPage.id === "radar"}
      <Radar opts={{ ...(wCfg.radar?.options ?? {}), range: 14, autoHide: false, showRings: true }} {units} edit={true} />
    {:else if currentPage.id === "trackmap"}
      <TrackMap opts={{ ...(wCfg.trackmap?.options ?? {}), size: 280, classColors: true }} {units} edit={true} />
    {:else if currentPage.id === "inputs"}
      <Inputs
        opts={{ ...(wCfg.inputs?.options ?? {}), seconds: 6, showSteering: true, showPedals: true, width: 340 }}
        {units}
        edit={true}
      />
    {/if}
  </div>

  <!-- Indicador flotante temporal + botón de Configuración del Móvil -->
  {#if showHudBadge && !showSettingsModal}
    <div
      class="fixed top-2.5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-accent/60 bg-black/85 px-3.5 py-1 text-xs shadow-xl backdrop-blur-md"
    >
      <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
      <span class="font-display font-bold tracking-wider text-accent-hi uppercase">
        {(wheelControl.pageIndex % activePages.length) + 1}/{activePages.length} · {currentPage.shortTitle}
      </span>
      <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">
        {activeThemeMeta.label}
      </span>
      <button
        type="button"
        class="pointer-events-auto ml-1 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-white shadow hover:bg-accent-hi"
        onclick={(e) => {
          e.stopPropagation();
          showSettingsModal = true;
        }}
      >
        ⚙️ Configurar
      </button>
    </div>
  {/if}

  <!-- Modal de Configuración del Widget Móvil (Ordenar, Eliminar, Añadir y Tema del Móvil) -->
  {#if showSettingsModal}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      onclick={(e) => {
        e.stopPropagation();
        showSettingsModal = false;
      }}
    >
      <div
        class="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-accent/50 bg-[#0b1320] text-sm shadow-2xl"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3">
          <div class="flex items-center gap-2">
            <img src="/mdt-logo.png" alt="MDT" class="h-5 w-5 object-contain" />
            <span class="font-display text-base font-extrabold tracking-wider text-white uppercase">
              Configurar Dashboards y Tema del Móvil
            </span>
          </div>
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-white"
            onclick={() => (showSettingsModal = false)}
          >
            ✓ Listo
          </button>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto p-4">
          <!-- 1. Elegir Tema del Móvil -->
          <div>
            <div class="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
              1. Tema Visual del Móvil
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {#each Object.entries(HUD_THEMES) as [id, t] (id)}
                <button
                  type="button"
                  class={[
                    "flex flex-col items-start rounded-lg border p-2 text-left transition",
                    wheelControl.mobileTheme === id
                      ? "border-accent bg-accent/20 text-white shadow"
                      : "border-white/10 bg-black/30 text-muted hover:text-white",
                  ]}
                  onclick={() => wheelControl.setMobileTheme(id as PresetThemeId)}
                >
                  <div class="flex items-center gap-1.5">
                    <span class="h-2.5 w-2.5 rounded-full" style:background={t.accent}></span>
                    <span class="h-2.5 w-2.5 rounded-full" style:background={t.secondary}></span>
                    <span class="font-display text-xs font-extrabold">{t.label}</span>
                  </div>
                </button>
              {/each}
            </div>
          </div>

          <!-- 2. Ordenar o Eliminar Dashboards Activos en el Móvil -->
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="text-xs font-bold tracking-wider text-muted uppercase">
                2. Orden de Pantallas en el Móvil ({activePages.length})
              </span>
              <button
                type="button"
                class="text-xs text-accent-hi hover:underline"
                onclick={() => wheelControl.resetPages()}
              >
                Restablecer por defecto
              </button>
            </div>
            <div class="space-y-1.5">
              {#each activePages as pg, idx (pg.id)}
                <div class="flex items-center justify-between rounded-lg border border-white/10 bg-black/35 px-3 py-1.5">
                  <button
                    type="button"
                    class="flex flex-1 items-center gap-2 text-left"
                    onclick={() => {
                      wheelControl.setPage(idx);
                      showSettingsModal = false;
                    }}
                  >
                    <span class="w-5 font-mono text-xs font-bold text-accent-hi">{idx + 1}.</span>
                    <span class="font-semibold text-white">{pg.title}</span>
                  </button>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      class="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-white disabled:opacity-30"
                      title="Subir"
                      onclick={() => wheelControl.movePage(idx, -1)}
                    >↑</button>
                    <button
                      type="button"
                      disabled={idx === activePages.length - 1}
                      class="rounded bg-white/10 px-2 py-0.5 text-xs font-bold text-white disabled:opacity-30"
                      title="Bajar"
                      onclick={() => wheelControl.movePage(idx, 1)}
                    >↓</button>
                    <button
                      type="button"
                      disabled={activePages.length <= 1}
                      class="ml-1 rounded bg-bad/25 px-2 py-0.5 text-xs font-bold text-bad hover:bg-bad hover:text-white disabled:opacity-30"
                      title="Eliminar del móvil"
                      onclick={() => wheelControl.removePage(pg.id)}
                    >✕</button>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- 3. Añadir Nuevos Dashboards al Móvil -->
          {#if wheelControl.availableToAdd.length > 0}
            <div>
              <div class="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
                3. Añadir Pantallas al Móvil
              </div>
              <div class="flex flex-wrap gap-1.5">
                {#each wheelControl.availableToAdd as avail (avail.id)}
                  <button
                    type="button"
                    class="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white hover:border-accent hover:bg-accent/20"
                    onclick={() => wheelControl.addPage(avail.id)}
                  >
                    + {avail.short}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
