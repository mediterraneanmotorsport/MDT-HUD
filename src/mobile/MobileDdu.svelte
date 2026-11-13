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
  import { wheelControl, type MfdPageId } from "../lib/wheelControl.svelte";
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
  import StintPlanner from "../overlay/widgets/StintPlanner.svelte";
  import TrackLimits from "../overlay/widgets/TrackLimits.svelte";
  import TrackMap from "../overlay/widgets/TrackMap.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let showHudBadge = $state(true);
  let showSettingsModal = $state(false);
  let badgeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeq = -1;
  let lastConfigSeq = -1;

  // Item 2: Optional Intelligent Auto-Popups
  let overridePageId = $state<MfdPageId | null>(null);
  let overrideReason = $state<string>("");
  let overrideTimer: ReturnType<typeof setTimeout> | null = null;

  let rotaryOverlay = $state<{ label: string; value: string; color: string } | null>(null);
  let rotaryTimer: ReturnType<typeof setTimeout> | null = null;

  // Previous telemetry state for edge detection
  let prevDentSum = -1;
  let prevInPits: boolean | null = null;
  let prevCutPts = -1;
  let prevTc = -1;
  let prevAbs = -1;
  let prevMap = -1;
  let prevBb = "";

  // Touch swipe tracking (Item 1)
  let touchStartX = 0;
  let touchStartY = 0;
  let swipedJustNow = false;

  let viewportEl = $state<HTMLDivElement | null>(null);
  let contentEl = $state<HTMLDivElement | null>(null);
  let autoScale = $state(1);

  const activeSnap = $derived(remoteSnap ?? live.snap);

  provideLive({
    get snap() {
      return activeSnap;
    },
  });

  function triggerTemporaryPage(pageId: MfdPageId, reason: string, durationMs = 5000) {
    overridePageId = pageId;
    overrideReason = reason;
    if (overrideTimer) clearTimeout(overrideTimer);
    overrideTimer = setTimeout(() => {
      overridePageId = null;
      overrideReason = "";
    }, durationMs);
  }

  function triggerRotaryPopup(label: string, value: string, color: string) {
    rotaryOverlay = { label, value, color };
    if (rotaryTimer) clearTimeout(rotaryTimer);
    rotaryTimer = setTimeout(() => {
      rotaryOverlay = null;
    }, 1800);
  }

  function checkAutoPopups(s: Snapshot | null) {
    const p = s?.player;
    if (!p) {
      prevDentSum = -1;
      prevInPits = null;
      prevCutPts = -1;
      prevTc = -1;
      return;
    }

    const dentSum = p.dents.reduce((a, b) => a + b, 0) + (p.detachedParts ? 10 : 0);
    const inPits = !!p.inPits;
    const cutPts = s?.penalties?.cutTrackPoints ?? 0;
    const bbStr = (p.brakeBiasFront * 100).toFixed(1);

    if (wheelControl.autoPopups) {
      if (prevDentSum >= 0 && dentSum > prevDentSum) {
        triggerTemporaryPage("damage", "⚠️ DAÑOS DETECTADOS", 5000);
      } else if (prevInPits === false && inPits === true) {
        triggerTemporaryPage("fuel", "🔧 ENTRADA A BOXES · REPOSTAJE", 6000);
      } else if (prevCutPts >= 0 && cutPts > prevCutPts) {
        triggerTemporaryPage("tracklimits", "⚠️ AVISO DE LÍMITES DE PISTA", 4000);
      }

      if (prevTc >= 0) {
        if (p.tc !== prevTc) triggerRotaryPopup("CONTROL TRACCIÓN (TC)", `${p.tc} / ${p.tcMax}`, "#f59e0b");
        else if (p.abs !== prevAbs) triggerRotaryPopup("ABS", `${p.abs} / ${p.absMax}`, "#38bdf8");
        else if (p.motorMap !== prevMap) triggerRotaryPopup("MAPA MOTOR", `${p.motorMap} / ${p.motorMapMax}`, "#22c55e");
        else if (bbStr !== prevBb) triggerRotaryPopup("REPARTO FRENADA (BB)", `${bbStr}%`, "#ef4444");
      }
    }

    prevDentSum = dentSum;
    prevInPits = inPits;
    prevCutPts = cutPts;
    prevTc = p.tc;
    prevAbs = p.abs;
    prevMap = p.motorMap;
    prevBb = bbStr;
  }

  $effect(() => {
    checkAutoPopups(activeSnap);
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
    const _override = overridePageId;
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
          if (typeof data.autoPopups === "boolean") {
            wheelControl.autoPopups = data.autoPopups;
          }
        }
        if (typeof data.pageSeq === "number" && data.pageSeq !== lastSeq) {
          lastSeq = data.pageSeq;
          const len = wheelControl.activePages.length;
          if (typeof data.page === "number" && data.page !== wheelControl.pageIndex) {
            wheelControl.pageIndex = ((data.page % len) + len) % len;
            overridePageId = null;
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

  function onTouchStart(e: TouchEvent) {
    if (showSettingsModal || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e: TouchEvent) {
    if (showSettingsModal || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      swipedJustNow = true;
      setTimeout(() => (swipedJustNow = false), 250);
      overridePageId = null;
      if (dx < 0) wheelControl.nextPage();
      else wheelControl.prevPage();
    } else if (dy < -60 && Math.abs(dy) > Math.abs(dx)) {
      swipedJustNow = true;
      setTimeout(() => (swipedJustNow = false), 250);
      showSettingsModal = true;
    }
  }

  function handleScreenTap(e: MouseEvent) {
    if (showSettingsModal || swipedJustNow) return;
    ensureFullscreen();
    const w = window.innerWidth || 1;
    const x = e.clientX;
    if (x < w * 0.28) {
      overridePageId = null;
      wheelControl.prevPage();
    } else if (x > w * 0.72) {
      overridePageId = null;
      wheelControl.nextPage();
    } else {
      flashBadge();
    }
  }

  const activePages = $derived(wheelControl.activePages);
  const basePage = $derived(activePages[wheelControl.pageIndex % activePages.length] ?? activePages[0]);
  const effectivePageId = $derived<MfdPageId>(overridePageId ?? basePage.id);
  const activeThemeMeta = $derived(HUD_THEMES[wheelControl.mobileTheme] ?? HUD_THEMES["mdt-aura"]);
  const units = $derived(config.value.general.units);
  const wCfg = $derived(config.value.widgets);

  // Peripheral border state: Battery 100% green flash OR Delta green/red border
  const p = $derived(activeSnap?.player);
  const batteryFull = $derived(!!p && p.electricMotorState > 0 && p.battery >= 0.975);
  const deltaVal = $derived(
    activeSnap?.timing.deltaPb ?? (activeSnap?.timing.sessionBest && p ? p.deltaBest : null),
  );
  const peripheralBorderClass = $derived(
    batteryFull
      ? "hud-battery-full border-[4px] border-[#00ff66]"
      : deltaVal != null && deltaVal < -0.005
        ? "hud-delta-good border-[3px]"
        : deltaVal != null && deltaVal > 0.005
          ? "hud-delta-bad border-[3px]"
          : "",
  );
</script>

<!-- Contenedor 100% Pantalla Completa Móvil con Swipe, Borde Delta y Destello Batería 100% -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={viewportEl}
  data-hud-theme={wheelControl.mobileTheme}
  onclick={handleScreenTap}
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  class={["fixed inset-0 flex h-dvh w-dvw items-center justify-center overflow-hidden text-fg select-none", peripheralBorderClass]}
  style:background={activeThemeMeta.bg}
>
  <!-- Destello de advertencia superior cuando la batería híbrida está al 100% -->
  {#if batteryFull}
    <div
      class="pointer-events-none fixed top-2 left-1/2 z-40 -translate-x-1/2 animate-pulse rounded-full bg-[#00ff66] px-4 py-1 font-display text-xs font-black tracking-widest text-black uppercase shadow-[0_0_24px_#00ff66]"
    >
      ⚡ BATERÍA 100% LLENA · DESPLEGAR ERS
    </div>
  {/if}

  <!-- Aviso de Auto-Popup Inteligente si está activo -->
  {#if overridePageId}
    <div
      class="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2 animate-bounce rounded-full border border-warn bg-warn/90 px-4 py-1 font-display text-xs font-black tracking-wider text-black uppercase shadow-lg"
    >
      {overrideReason}
    </div>
  {/if}

  <!-- Pop-up Gigante de Cambio de Electrónica (TC / ABS / Mapa / BB) si autoPopups está activo -->
  {#if rotaryOverlay}
    <div
      class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
    >
      <div
        class="flex flex-col items-center rounded-2xl border-4 bg-[#070d18]/95 px-10 py-6 shadow-2xl"
        style:border-color={rotaryOverlay.color}
        style:box-shadow="0 0 40px {rotaryOverlay.color}"
      >
        <span class="font-display text-sm font-black tracking-[0.2em] uppercase" style:color={rotaryOverlay.color}>
          {rotaryOverlay.label}
        </span>
        <span class="mt-2 font-display text-7xl font-black text-white tabular-nums">
          {rotaryOverlay.value}
        </span>
      </div>
    </div>
  {/if}

  <!-- Único Overlay Individual escalado automáticamente para llenar el 100% de la pantalla del teléfono -->
  <div
    bind:this={contentEl}
    class="flex items-center justify-center transition-transform duration-75"
    style="transform: scale({autoScale}); transform-origin: center center;"
  >
    {#if effectivePageId === "dashboard"}
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
    {:else if effectivePageId === "relative"}
      <Relative
        opts={{ ...(wCfg.relative?.options ?? {}), ahead: 4, behind: 4, showPaceDiff: true, showEnergy: true }}
        {units}
        edit={true}
      />
    {:else if effectivePageId === "standings"}
      <Standings
        opts={{ ...(wCfg.standings?.options ?? {}), showBranding: true, maxRows: 8, maxRowsOther: 4 }}
        {units}
        edit={true}
      />
    {:else if effectivePageId === "damage"}
      <Damage opts={{ ...(wCfg.damage?.options ?? {}), showCar: true }} {units} edit={true} />
    {:else if effectivePageId === "tyres"}
      <Tyres
        opts={{ ...(wCfg.tyres?.options ?? {}), showWearRate: true, showLapsLeft: true, showBrakes: true }}
        {units}
        edit={true}
      />
    {:else if effectivePageId === "fuel"}
      <Fuel
        opts={{ ...(wCfg.fuel?.options ?? {}), showPitAlert: true, showLast: true, showSaver: true, saverResource: "auto" }}
        {units}
        edit={true}
      />
    {:else if effectivePageId === "liftcoast"}
      <LiftCoast opts={{ ...(wCfg.liftcoast?.options ?? {}), showRegen: true }} {units} edit={true} />
    {:else if effectivePageId === "pacecatch"}
      <PaceCatch opts={{ ...(wCfg.pacecatch?.options ?? {}), sameClassOnly: true, showLastLap: true }} {units} edit={true} />
    {:else if effectivePageId === "tracklimits"}
      <TrackLimits opts={{ ...(wCfg.tracklimits?.options ?? {}), showAlways: true }} {units} edit={true} />
    {:else if effectivePageId === "electronics"}
      <Electronics opts={wCfg.electronics?.options ?? {}} {units} edit={true} />
    {:else if effectivePageId === "laptiming"}
      <LapTiming opts={{ ...(wCfg.laptiming?.options ?? {}), showSectors: true }} {units} edit={true} />
    {:else if effectivePageId === "radar"}
      <Radar opts={{ ...(wCfg.radar?.options ?? {}), range: 14, autoHide: false, showRings: true }} {units} edit={true} />
    {:else if effectivePageId === "trackmap"}
      <TrackMap opts={{ ...(wCfg.trackmap?.options ?? {}), size: 280, classColors: true }} {units} edit={true} />
    {:else if effectivePageId === "inputs"}
      <Inputs
        opts={{ ...(wCfg.inputs?.options ?? {}), seconds: 6, showSteering: true, showPedals: true, width: 340 }}
        {units}
        edit={true}
      />
    {:else if effectivePageId === "stintplanner"}
      <StintPlanner opts={wCfg.stintplanner?.options ?? {}} {units} edit={true} />
    {/if}
  </div>

  <!-- Indicador flotante temporal + botón de Configuración del Móvil -->
  {#if showHudBadge && !showSettingsModal && !batteryFull}
    <div
      class="fixed top-2.5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-accent/60 bg-black/85 px-3.5 py-1 text-xs shadow-xl backdrop-blur-md"
    >
      <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
      <span class="font-display font-bold tracking-wider text-accent-hi uppercase">
        {(wheelControl.pageIndex % activePages.length) + 1}/{activePages.length} · {basePage.shortTitle}
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

  <!-- Modal de Configuración del Widget Móvil -->
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
          <!-- Opción de Pop-ups Automáticos Inteligentes (Punto 2) -->
          <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 p-3">
            <div>
              <div class="text-xs font-bold text-white">Pop-ups Automáticos Inteligentes en Carrera (Opcional)</div>
              <div class="text-[11px] text-muted">
                Cambia durante 5 s a Daños al sufrir un golpe, a Combustible al entrar a boxes, o muestra TC/ABS/Mapa en grande al tocarlos.
              </div>
            </div>
            <input
              type="checkbox"
              class="h-4 w-4 accent-accent"
              checked={wheelControl.autoPopups}
              onchange={(e) => wheelControl.setAutoPopups(e.currentTarget.checked)}
            />
          </label>

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
