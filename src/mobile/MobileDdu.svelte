<script lang="ts">
  import { onMount } from "svelte";
  import { config, loadConfig } from "../lib/config.svelte";
  import { live, provideLive, startLive } from "../lib/live.svelte";
  import type { Snapshot } from "../lib/types";
  import { MFD_PAGES, wheelControl } from "../lib/wheelControl.svelte";
  import Damage from "../overlay/widgets/Damage.svelte";
  import Dashboard from "../overlay/widgets/Dashboard.svelte";
  import Electronics from "../overlay/widgets/Electronics.svelte";
  import Flags from "../overlay/widgets/Flags.svelte";
  import Fuel from "../overlay/widgets/Fuel.svelte";
  import LapTiming from "../overlay/widgets/LapTiming.svelte";
  import LiftCoast from "../overlay/widgets/LiftCoast.svelte";
  import PaceCatch from "../overlay/widgets/PaceCatch.svelte";
  import Radar from "../overlay/widgets/Radar.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import TrackLimits from "../overlay/widgets/TrackLimits.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let connectedToPc = $state(false);
  let isFullscreen = $state(false);
  let lastSeq = -1;

  provideLive({
    get snap() {
      return remoteSnap ?? live.snap;
    },
  });

  onMount(() => {
    loadConfig();
    startLive();

    // Poll PC telemetry & wheel button page state at ~18 Hz
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/__mobile_state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.snap) {
          remoteSnap = data.snap;
          connectedToPc = true;
        }
        if (typeof data.pageSeq === "number" && data.pageSeq !== lastSeq) {
          lastSeq = data.pageSeq;
          if (typeof data.page === "number") {
            wheelControl.page = ((data.page % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
          }
        }
      } catch {
        connectedToPc = false;
      }
    }, 55);

    // Keep mobile screen awake while driving
    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock?.request("screen").catch(() => {});
    }

    return () => clearInterval(timer);
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      isFullscreen = true;
    } else {
      document.exitFullscreen?.().catch(() => {});
      isFullscreen = false;
    }
  }

  const currentPage = $derived(MFD_PAGES[wheelControl.page % MFD_PAGES.length]);
  const units = $derived(config.value.general.units);
  const wCfg = $derived(config.value.widgets);
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-[#050b14] text-fg select-none">
  <!-- Top Mobile DDU Bar -->
  <header class="flex h-11 shrink-0 items-center justify-between border-b border-accent/40 bg-[#081324] px-3">
    <div class="flex items-center gap-2">
      <img src="/mdt-logo.png" alt="MDT" class="h-6 w-auto object-contain" />
      <span class="font-display text-sm font-black tracking-wider text-white uppercase">MDT-HUD · MOBILE DDU</span>
      <span
        class={[
          "ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
          connectedToPc || live.snap?.player ? "bg-good/20 text-good" : "bg-warn/20 text-warn",
        ]}
      >
        {connectedToPc || live.snap?.player ? "EN VIVO" : "ESPERANDO PC"}
      </span>
    </div>

    <!-- Page tabs (touchable + controlled by Steering Wheel buttons) -->
    <div class="flex items-center gap-1 overflow-x-auto">
      {#each MFD_PAGES as p, i (p.id)}
        <button
          type="button"
          class={[
            "rounded px-2.5 py-1 font-display text-xs font-extrabold tracking-wider uppercase transition-all",
            wheelControl.page === i
              ? "bg-accent text-white shadow-[0_0_12px_var(--color-accent)]"
              : "bg-white/5 text-muted hover:bg-white/10 hover:text-white",
          ]}
          onclick={() => wheelControl.setPage(i)}
        >
          {i + 1}. {p.shortTitle}
        </button>
      {/each}
    </div>

    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="rounded border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white active:bg-accent"
        onclick={toggleFullscreen}
      >
        {isFullscreen ? "Salir" : "⛶ Pantalla Completa"}
      </button>
    </div>
  </header>

  <!-- Main Mobile DDU Body -->
  <main class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-3">
    <!-- Active Flags Banner at top if any -->
    <div class="mb-2 flex justify-center">
      <Flags opts={{}} {units} edit={false} />
    </div>

    {#if currentPage.id === "ddu-only"}
      <!-- Giant Fullscreen Dashboard -->
      <div class="flex flex-col items-center gap-3 scale-110 sm:scale-125">
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
          edit={false}
        />
        <LapTiming opts={{ showSectors: true }} {units} edit={false} />
      </div>
    {:else}
      <div class="flex w-full max-w-5xl flex-wrap items-start justify-center gap-3">
        <!-- Left / Top: Always-visible Compact/WEC Dashboard + LapTiming -->
        <div class="flex flex-col items-center gap-2">
          <Dashboard
            opts={{
              ...(wCfg.dashboard?.options ?? {}),
              style: "wec",
              rpmStyle: "leds",
              showMdtLogo: true,
              showPedals: true,
              showSteeringWheel: true,
            }}
            {units}
            edit={false}
          />
          <LapTiming opts={{ showSectors: true }} {units} edit={false} />
        </div>

        <!-- Right / Bottom: Dynamic Page switched by Steering Wheel Buttons -->
        <div class="flex flex-col items-center gap-2">
          {#if currentPage.id === "relative"}
            <Relative opts={{ ...(wCfg.relative?.options ?? {}), ahead: 4, behind: 4 }} {units} edit={false} />
            <Radar opts={{ range: 14, autoHide: false, showRings: true }} {units} edit={false} />
          {:else if currentPage.id === "standings"}
            <Standings
              opts={{ ...(wCfg.standings?.options ?? {}), showBranding: true, maxRows: 10, maxRowsOther: 5 }}
              {units}
              edit={false}
            />
          {:else if currentPage.id === "damage-tyres"}
            <div class="flex flex-wrap items-start justify-center gap-2.5">
              <Tyres opts={{ ...(wCfg.tyres?.options ?? {}), showWearRate: true, showLapsLeft: true, showBrakes: true }} {units} edit={false} />
              <div class="flex flex-col gap-2">
                <Damage opts={{ showCar: true }} {units} edit={false} />
                <Electronics opts={{}} {units} edit={false} />
              </div>
            </div>
          {:else if currentPage.id === "fuel-lift"}
            <div class="flex flex-wrap items-start justify-center gap-2.5">
              <Fuel opts={{ showPitAlert: true, showLast: true, showSaver: true, saverResource: "auto" }} {units} edit={false} />
              <LiftCoast opts={{ showRegen: true }} {units} edit={false} />
            </div>
          {:else if currentPage.id === "pace-limits"}
            <div class="flex flex-wrap items-start justify-center gap-2.5">
              <PaceCatch opts={{ sameClassOnly: true, showLastLap: true }} {units} edit={false} />
              <TrackLimits opts={{ showAlways: true }} {units} edit={false} />
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </main>

  <!-- Bottom Big Touch Controls for Smartphone/Tablet + Current Page Indicator -->
  <footer class="flex h-12 shrink-0 items-center justify-between border-t border-white/10 bg-[#081324] px-3">
    <button
      type="button"
      class="flex h-9 items-center gap-2 rounded-lg border border-accent/50 bg-accent/15 px-4 font-display text-sm font-black tracking-wider text-white uppercase active:bg-accent"
      onclick={() => wheelControl.prevPage()}
    >
      ◀ ANTERIOR
    </button>

    <div class="text-center">
      <div class="font-display text-xs font-extrabold tracking-widest text-accent uppercase">{currentPage.title}</div>
      <div class="text-[10px] text-muted">Cambia con los botones del volante o tocando aquí</div>
    </div>

    <button
      type="button"
      class="flex h-9 items-center gap-2 rounded-lg border border-accent/50 bg-accent/15 px-4 font-display text-sm font-black tracking-wider text-white uppercase active:bg-accent"
      onclick={() => wheelControl.nextPage()}
    >
      SIGUIENTE ▶
    </button>
  </footer>
</div>
