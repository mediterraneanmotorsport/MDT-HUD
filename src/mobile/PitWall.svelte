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
  import Delta from "../overlay/widgets/Delta.svelte";
  import Flags from "../overlay/widgets/Flags.svelte";
  import Fuel from "../overlay/widgets/Fuel.svelte";
  import Inputs from "../overlay/widgets/Inputs.svelte";
  import LapTiming from "../overlay/widgets/LapTiming.svelte";
  import LiftCoast from "../overlay/widgets/LiftCoast.svelte";
  import PaceCatch from "../overlay/widgets/PaceCatch.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import SessionInfo from "../overlay/widgets/SessionInfo.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import StintPlanner from "../overlay/widgets/StintPlanner.svelte";
  import TrackLimits from "../overlay/widgets/TrackLimits.svelte";
  import TrackMap from "../overlay/widgets/TrackMap.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";
  import Weather from "../overlay/widgets/Weather.svelte";

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);

  const activeSnap = $derived(remoteSnap ?? live.snap);

  provideLive({
    get snap() {
      return activeSnap;
    },
  });

  $effect(() => {
    const theme = wheelControl.mobileTheme;
    if (rootEl) {
      applyThemeToElement(rootEl, theme);
    }
  });

  onMount(() => {
    loadConfig();
    startLive();
    wheelControl.startHost();

    const timer = setInterval(async () => {
      try {
        const res = await fetch("/__mobile_state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.snap) remoteSnap = data.snap;
        if (typeof data.mobileTheme === "string") {
          wheelControl.mobileTheme = data.mobileTheme;
        }
      } catch {
        // ignore
      }
    }, 65);

    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock?.request("screen").catch(() => {});
    }

    return () => clearInterval(timer);
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  const activeThemeMeta = $derived(HUD_THEMES[wheelControl.mobileTheme] ?? HUD_THEMES["mdt-aura"]);
  const units = $derived(config.value.general.units);
  const wCfg = $derived(config.value.widgets);
  const p = $derived(activeSnap?.player);
  const batteryFull = $derived(!!p && p.electricMotorState > 0 && p.battery >= 0.975);
</script>

<div
  bind:this={rootEl}
  data-hud-theme={wheelControl.mobileTheme}
  class={[
    "flex h-dvh w-dvw flex-col overflow-hidden text-fg select-none",
    batteryFull && "hud-battery-full border-[4px] border-[#00ff66]",
  ]}
  style:background={activeThemeMeta.bg}
>
  <!-- Cabecera Muro de Ingenieros MDT -->
  <header class="flex h-11 shrink-0 items-center justify-between border-b border-accent/40 bg-black/50 px-4">
    <div class="flex items-center gap-2.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-6 w-6 object-contain" />
      <span class="font-display text-sm font-black tracking-wider text-white uppercase">
        MDT-HUD · MURO DE INGENIEROS WEC (PIT WALL)
      </span>
      {#if batteryFull}
        <span class="animate-pulse rounded bg-[#00ff66] px-2.5 py-0.5 font-display text-xs font-black text-black shadow-[0_0_14px_#00ff66]">
          ⚡ BATERÍA 100% LLENA
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1.5">
      {#each Object.entries(HUD_THEMES) as [id, t] (id)}
        <button
          type="button"
          class={[
            "flex items-center gap-1 rounded px-2 py-1 font-display text-xs font-extrabold transition",
            wheelControl.mobileTheme === id
              ? "bg-accent text-white shadow"
              : "bg-white/5 text-muted hover:text-white",
          ]}
          onclick={() => wheelControl.setMobileTheme(id as PresetThemeId)}
        >
          <span class="h-2 w-2 rounded-full" style:background={t.accent}></span>
          {t.label}
        </button>
      {/each}
      <button
        type="button"
        class="ml-2 rounded border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-accent"
        onclick={toggleFullscreen}
      >
        ⛶ Pantalla Completa
      </button>
    </div>
  </header>

  <!-- Cuadrícula de 4 Columnas del Muro de Ingenieros -->
  <main class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 md:grid-cols-2 xl:grid-cols-4">
    <!-- Columna 1: Pista, Sesión, Mapa, Meteorología y Límites -->
    <div class="flex flex-col items-center gap-2.5">
      <SessionInfo opts={{}} {units} edit={true} />
      <Flags opts={{}} {units} edit={true} />
      <TrackMap opts={{ size: 250, classColors: true }} {units} edit={true} />
      <Weather opts={{}} {units} edit={true} />
      <TrackLimits opts={{ showAlways: true }} {units} edit={true} />
    </div>

    <!-- Columna 2: Clasificación Completa, Relativo y Cazador -->
    <div class="flex flex-col items-center gap-2.5">
      <Standings
        opts={{ ...(wCfg.standings?.options ?? {}), showBranding: true, maxRows: 10, maxRowsOther: 5 }}
        {units}
        edit={true}
      />
      <Relative
        opts={{ ...(wCfg.relative?.options ?? {}), ahead: 3, behind: 3, showPaceDiff: true, showEnergy: true }}
        {units}
        edit={true}
      />
      <PaceCatch opts={{ sameClassOnly: true, showLastLap: true }} {units} edit={true} />
    </div>

    <!-- Columna 3: Cuadro DDU, Delta con Borde Verde/Rojo, Tiempos y Pedales -->
    <div class="flex flex-col items-center gap-2.5">
      <Delta opts={{ reference: "pb", range: 2 }} {units} edit={true} />
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
      <LapTiming opts={{ showSectors: true }} {units} edit={true} />
      <Inputs opts={{ seconds: 6, showSteering: true, showPedals: true, width: 320 }} {units} edit={true} />
    </div>

    <!-- Columna 4: Estrategia WEC, Combustible, Lift & Coast, Neumáticos y Daños -->
    <div class="flex flex-col items-center gap-2.5">
      <StintPlanner opts={wCfg.stintplanner?.options ?? { safetyLaps: 1, customMinutes: 0 }} {units} edit={true} />
      <Fuel
        opts={{ showPitAlert: true, showLast: true, showSaver: true, saverResource: "auto" }}
        {units}
        edit={true}
      />
      <LiftCoast opts={{ showRegen: true }} {units} edit={true} />
      <Tyres
        opts={{ tempLayer: "surface", showWearRate: true, showLapsLeft: true, wearLimit: 30, showBrakes: true }}
        {units}
        edit={true}
      />
      <Damage opts={{ showCar: true }} {units} edit={true} />
    </div>
  </main>
</div>
