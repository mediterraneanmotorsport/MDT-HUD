<script lang="ts">
  import { onMount } from "svelte";
  import { config, loadConfig } from "../lib/config.svelte";
  import { live, provideLive, startLive } from "../lib/live.svelte";
  import type { Snapshot } from "../lib/types";
  import { MFD_PAGES, wheelControl } from "../lib/wheelControl.svelte";
  import Damage from "../overlay/widgets/Damage.svelte";
  import Dashboard from "../overlay/widgets/Dashboard.svelte";
  import Electronics from "../overlay/widgets/Electronics.svelte";
  import Fuel from "../overlay/widgets/Fuel.svelte";
  import LiftCoast from "../overlay/widgets/LiftCoast.svelte";
  import PaceCatch from "../overlay/widgets/PaceCatch.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import TrackLimits from "../overlay/widgets/TrackLimits.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let showHudBadge = $state(true);
  let badgeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSeq = -1;

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
      showHudBadge = false;
    }, 1600);
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
    // Recompute scale whenever the active page changes
    const _page = wheelControl.pageIndex;
    flashBadge();
    requestAnimationFrame(() => {
      recomputeScale();
      setTimeout(recomputeScale, 60);
    });
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

    // Poll PC telemetry & wheel button page state at ~18 Hz
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/__mobile_state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.snap) {
          remoteSnap = data.snap;
        }
        if (typeof data.pageSeq === "number" && data.pageSeq !== lastSeq) {
          lastSeq = data.pageSeq;
          if (typeof data.page === "number" && data.page !== wheelControl.pageIndex) {
            wheelControl.pageIndex = ((data.page % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
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

  const currentPage = $derived(MFD_PAGES[wheelControl.pageIndex % MFD_PAGES.length]);
  const units = $derived(config.value.general.units);
  const wCfg = $derived(config.value.widgets);
</script>

<!-- Contenedor 100% Pantalla Completa Móvil sin barras ni bordes -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={viewportEl}
  onclick={handleScreenTap}
  class="fixed inset-0 flex h-dvh w-dvw items-center justify-center overflow-hidden bg-[#050b14] text-fg select-none"
>
  <!-- Único Overlay Individual escalado automáticamente para llenar toda la pantalla del teléfono -->
  <div
    bind:this={contentEl}
    class=" flex items-center justify-center transition-transform duration-75"
    style="transform: scale({autoScale}); transform-origin: center center;"
  >
    {#if currentPage.id === "dashboard"}
      <Dashboard
        opts={{
          ...(wCfg.dashboard?.options ?? {}),
          style: "ddu",
          rpmStyle: "leds",
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
        opts={{ ...(wCfg.relative?.options ?? {}), ahead: 4, behind: 4, showLapsim: true, showEnergy: true }}
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
    {/if}
  </div>

  <!-- Indicador flotante temporal (se oculta solo tras 1.6s para dejar la pantalla 100% limpia) -->
  {#if showHudBadge}
    <div
      class="pointer-events-none fixed top-2.5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#2287EC]/50 bg-[#071222]/90 px-3.5 py-1 text-xs shadow-lg backdrop-blur-md"
    >
      <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
      <span class="font-display font-bold tracking-wider text-[#62b0ff] uppercase">
        {wheelControl.pageIndex + 1}/{MFD_PAGES.length} · {currentPage.shortTitle}
      </span>
      <span class="text-[10px] text-muted">· Toca izq/der o usa el volante</span>
    </div>
  {/if}
</div>
