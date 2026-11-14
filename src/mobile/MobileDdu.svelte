<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import {
    applyRemoteConfig,
    applyThemeToElement,
    config,
    HUD_THEMES,
    loadConfig,
    saveConfig,
    type PresetThemeId,
  } from "../lib/config.svelte";
  import { live, provideLive, startLive } from "../lib/live.svelte";
  import type { Snapshot } from "../lib/types";
  import { MOBILE_SERVER_BASE, wheelControl, type MfdPageId } from "../lib/wheelControl.svelte";
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
  let fallbackDemoSnap = $state.raw<Snapshot | null>(null);
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
  let prevTcSlip = -1;
  let prevTcCut = -1;
  let prevAbs = -1;
  let prevMap = -1;
  let prevMig = -1;
  let prevFArb = -1;
  let prevRArb = -1;
  let prevBb = "";

  // Touch swipe tracking (Item 1)
  let touchStartX = 0;
  let touchStartY = 0;
  let swipedJustNow = false;

  let viewportEl = $state<HTMLDivElement | null>(null);
  let contentEl = $state<HTMLDivElement | null>(null);
  let autoScale = $state(1);

  const activeSnap = $derived(
    remoteSnap?.player ? remoteSnap : live.snap?.player ? live.snap : (remoteSnap ?? live.snap ?? fallbackDemoSnap),
  );

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

    const dentSum = p.dents.reduce((a, b) => a + b, 0) + (p.detached ? 10 : 0);
    const inPits = !!p.inPits;
    const cutPts = p.trackLimitsSteps ?? 0;
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
        if (p.tc !== prevTc)
          triggerRotaryPopup("CONTROL TRACCIÓN (TC)", p.tcMax > 0 ? `${p.tc} / ${p.tcMax}` : `${p.tc}`, "#f59e0b");
        else if (p.tcSlip !== prevTcSlip)
          triggerRotaryPopup("TC SLIP", `${p.tcSlip}`, "#f59e0b");
        else if (p.tcCut !== prevTcCut)
          triggerRotaryPopup("TC CUT", `${p.tcCut}`, "#f59e0b");
        else if (p.abs !== prevAbs)
          triggerRotaryPopup("ABS", p.absMax > 0 ? `${p.abs} / ${p.absMax}` : `${p.abs}`, "#38bdf8");
        else if (p.motorMap !== prevMap)
          triggerRotaryPopup("MAPA MOTOR (MAP)", p.motorMapMax > 0 ? `${p.motorMap} / ${p.motorMapMax}` : `${p.motorMap}`, "#22c55e");
        else if (bbStr !== prevBb)
          triggerRotaryPopup("REPARTO FRENADA (BB)", `${bbStr}%`, "#ef4444");
        else if (p.migration !== prevMig)
          triggerRotaryPopup("MIGRACIÓN FRENADA (MIG)", `${p.migration}`, "#ef4444");
        else if (p.frontArb !== prevFArb || p.rearArb !== prevRArb)
          triggerRotaryPopup("BARRAS ARB DEL / TRAS", `${p.frontArb} / ${p.rearArb}`, "#38bdf8");
      }
    }

    prevDentSum = dentSum;
    prevInPits = inPits;
    prevCutPts = cutPts;
    prevTc = p.tc;
    prevTcSlip = p.tcSlip;
    prevTcCut = p.tcCut;
    prevAbs = p.abs;
    prevMap = p.motorMap;
    prevMig = p.migration;
    prevFArb = p.frontArb;
    prevRArb = p.rearArb;
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
    void wheelControl.pageIndex;
    void overridePageId;
    void wheelControl.enabledPageIds.length;
    void config.revision;
    void wheelControl.mobileTheme;
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
    void loadConfig();
    void startLive();
    wheelControl.startHost();
    flashBadge();

    const ro = new ResizeObserver(() => recomputeScale());
    if (viewportEl) ro.observe(viewportEl);
    if (contentEl) ro.observe(contentEl);
    window.addEventListener("resize", recomputeScale);
    window.addEventListener("orientationchange", recomputeScale);

    let mounted = true;
    const pollState = async () => {
      while (mounted) {
        const t0 = performance.now();
        try {
          const ctrl = new AbortController();
          const timeoutId = setTimeout(() => ctrl.abort(), 1200);
          const res = await fetch(`${MOBILE_SERVER_BASE}/__mobile_state`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            if (data.appConfig) {
              applyRemoteConfig(data.appConfig);
            }
            if (data.snap) {
              remoteSnap = data.snap;
              live.snap = data.snap;
            } else if (!live.snap?.player) {
              const demo = await api.getPreviewSnapshot().catch(() => null);
              if (demo) fallbackDemoSnap = demo;
            }
            if (typeof data.configSeq === "number" && data.configSeq !== lastConfigSeq) {
              lastConfigSeq = data.configSeq;
              if (Array.isArray(data.pages) && data.pages.length > 0) {
                wheelControl.enabledPageIds = data.pages;
              }
              if (typeof data.mobileTheme === "string" && wheelControl.mobileTheme !== data.mobileTheme) {
                wheelControl.mobileTheme = data.mobileTheme;
              }
              if (typeof data.autoPopups === "boolean") {
                wheelControl.autoPopups = data.autoPopups;
              }
              recomputeScale();
            }
            if (typeof data.pageSeq === "number" && data.pageSeq !== lastSeq) {
              lastSeq = data.pageSeq;
              const len = wheelControl.activePages.length;
              if (typeof data.page === "number" && data.page !== wheelControl.pageIndex) {
                wheelControl.pageIndex = ((data.page % len) + len) % len;
                overridePageId = null;
              }
            }
          }
        } catch {
          // ignore
        }
        const elapsed = performance.now() - t0;
        const waitMs = Math.max(18, 32 - elapsed);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    };
    void pollState();

    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock?.request("screen").catch(() => {});
    }

    return () => {
      mounted = false;
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
  const dashOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.dashboard?.options ?? {}) };
  });
  const relOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.relative?.options ?? {}) };
  });
  const standOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.standings?.options ?? {}), maxRows: 8, maxRowsOther: 4 };
  });
  const dmgOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.damage?.options ?? {}), showCar: true };
  });
  const tyreOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.tyres?.options ?? {}) };
  });
  const fuelOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.fuel?.options ?? {}) };
  });
  const lcOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.liftcoast?.options ?? {}) };
  });
  const pcOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.pacecatch?.options ?? {}) };
  });
  const tlOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.tracklimits?.options ?? {}), showAlways: true };
  });
  const elecOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.electronics?.options ?? {}) };
  });
  const lapOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.laptiming?.options ?? {}) };
  });
  const radarOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.radar?.options ?? {}), autoHide: false };
  });
  const mapOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.trackmap?.options ?? {}) };
  });
  const inputOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.inputs?.options ?? {}) };
  });
  const stintOpts = $derived.by(() => {
    void config.revision;
    return { ...(wCfg.stintplanner?.options ?? {}) };
  });

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
      <Dashboard opts={dashOpts} {units} edit={false} />
    {:else if effectivePageId === "relative"}
      <Relative opts={relOpts} {units} edit={false} />
    {:else if effectivePageId === "standings"}
      <Standings opts={standOpts} {units} edit={false} />
    {:else if effectivePageId === "damage"}
      <Damage opts={dmgOpts} {units} edit={false} />
    {:else if effectivePageId === "tyres"}
      <Tyres opts={tyreOpts} {units} edit={false} />
    {:else if effectivePageId === "fuel"}
      <Fuel opts={fuelOpts} {units} edit={false} />
    {:else if effectivePageId === "liftcoast"}
      <LiftCoast opts={lcOpts} {units} edit={false} />
    {:else if effectivePageId === "pacecatch"}
      <PaceCatch opts={pcOpts} {units} edit={false} />
    {:else if effectivePageId === "tracklimits"}
      <TrackLimits opts={tlOpts} {units} edit={false} />
    {:else if effectivePageId === "electronics"}
      <Electronics opts={elecOpts} {units} edit={false} />
    {:else if effectivePageId === "laptiming"}
      <LapTiming opts={lapOpts} {units} edit={false} />
    {:else if effectivePageId === "radar"}
      <Radar opts={radarOpts} {units} edit={false} />
    {:else if effectivePageId === "trackmap"}
      <TrackMap opts={mapOpts} {units} edit={false} />
    {:else if effectivePageId === "inputs"}
      <Inputs opts={inputOpts} {units} edit={false} />
    {:else if effectivePageId === "stintplanner"}
      <StintPlanner opts={stintOpts} {units} edit={false} />
    {/if}
  </div>

  <!-- Barra superior permanente (se atenúa suavemente tras 2.4 s para no estorbar pero sigue siempre accesible) -->
  {#if !showSettingsModal && !batteryFull}
    <div
      class={[
        "fixed top-2 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/60 bg-black/85 px-3 py-1 text-xs shadow-xl backdrop-blur-md transition-opacity duration-300",
        showHudBadge ? "opacity-100" : "opacity-40 hover:opacity-100",
      ]}
      onclick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="pointer-events-auto rounded-full bg-white/10 px-2 py-0.5 font-bold text-white hover:bg-accent"
        title="Pantalla anterior"
        onclick={() => {
          overridePageId = null;
          wheelControl.prevPage();
        }}
      >◀</button>
      <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
      <span class="font-display font-bold tracking-wider whitespace-nowrap text-accent-hi uppercase">
        {(wheelControl.pageIndex % activePages.length) + 1}/{activePages.length} · {basePage.shortTitle}
      </span>
      <button
        type="button"
        class="pointer-events-auto rounded-full bg-white/10 px-2 py-0.5 font-bold text-white hover:bg-accent"
        title="Siguiente pantalla"
        onclick={() => {
          overridePageId = null;
          wheelControl.nextPage();
        }}
      >▶</button>
      {#if effectivePageId !== "dashboard"}
        <button
          type="button"
          class="pointer-events-auto rounded-full border border-accent/60 bg-accent/25 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-accent"
          onclick={() => {
            overridePageId = null;
            if (!wheelControl.enabledPageIds.includes("dashboard")) {
              wheelControl.addPage("dashboard");
            }
            wheelControl.setPage("dashboard");
          }}
        >
          🏎️ Ir al Dash
        </button>
      {/if}
      <button
        type="button"
        class="pointer-events-auto rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-white shadow hover:bg-accent-hi"
        onclick={() => {
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

          <!-- 4. Ajustes del Dashboard sincronizados en Tiempo Real (PC <-> Móvil) -->
          {#if wCfg.dashboard}
            <div class="border-t border-white/10 pt-3">
              <div class="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
                4. Ajustes del Dashboard (Sincronizados en Vivo con PC)
              </div>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label class="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/35 p-2 text-xs">
                  <span class="text-muted">Diseño del Dashboard</span>
                  <select
                    class="rounded border border-white/15 bg-black/60 px-2 py-1 text-white"
                    bind:value={wCfg.dashboard.options.style}
                    onchange={saveConfig}
                  >
                    <option value="wec">WEC / Broadcast MDT</option>
                    <option value="ddu">Cosworth / MoTeC DDU</option>
                    <option value="radial">Tacómetro Circular Radial</option>
                    <option value="compact">Barra Horizontal Compacta</option>
                    <option value="classic">Clásico Estándar</option>
                  </select>
                </label>
                <label class="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/35 p-2 text-xs">
                  <span class="text-muted">Luces de RPM</span>
                  <select
                    class="rounded border border-white/15 bg-black/60 px-2 py-1 text-white"
                    bind:value={wCfg.dashboard.options.rpmStyle}
                    onchange={saveConfig}
                  >
                    <option value="leds">15 LEDs individuales</option>
                    <option value="center">Doble barra convergente</option>
                    <option value="bar">Barra continua</option>
                  </select>
                </label>
                <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs">
                  <span>Mostrar pedales (Acel / Freno)</span>
                  <input type="checkbox" class="accent-accent" bind:checked={wCfg.dashboard.options.showPedals} onchange={saveConfig} />
                </label>
                <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs">
                  <span>Volante en vivo</span>
                  <input type="checkbox" class="accent-accent" bind:checked={wCfg.dashboard.options.showSteeringWheel} onchange={saveConfig} />
                </label>
                <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs">
                  <span>Fila TC / ABS / MAP / BB</span>
                  <input type="checkbox" class="accent-accent" bind:checked={wCfg.dashboard.options.showSettings} onchange={saveConfig} />
                </label>
                <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs">
                  <span>Batería Híbrida (ERS)</span>
                  <input type="checkbox" class="accent-accent" bind:checked={wCfg.dashboard.options.showBattery} onchange={saveConfig} />
                </label>
                <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs">
                  <span>Testigos luminosos</span>
                  <input type="checkbox" class="accent-accent" bind:checked={wCfg.dashboard.options.showIndicators} onchange={saveConfig} />
                </label>
                <label class="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-xs">
                  <span>Medidor de fuerza FFB</span>
                  <input type="checkbox" class="accent-accent" bind:checked={wCfg.dashboard.options.showFfb} onchange={saveConfig} />
                </label>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
