<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import {
    applyRemoteConfig,
    applyThemeToElement,
    config,
    HUD_THEMES,
    loadConfig,
  } from "../lib/config.svelte";
  import {
    classColor,
    clock,
    fuel,
    fuelUnit,
    gap,
    isTeammate,
    lapTime,
    pressure,
    pressureUnit,
    shortName,
    temp,
    tempUnit,
  } from "../lib/format";
  import { live, provideLive, startLive } from "../lib/live.svelte";
  import type { Snapshot, Vehicle } from "../lib/types";
  import { MOBILE_SERVER_BASE, wheelControl } from "../lib/wheelControl.svelte";
  import CarRender from "../lib/CarRender.svelte";
  import Damage from "../overlay/widgets/Damage.svelte";
  import Dashboard from "../overlay/widgets/Dashboard.svelte";
  import Delta from "../overlay/widgets/Delta.svelte";
  import Electronics from "../overlay/widgets/Electronics.svelte";
  import Flags from "../overlay/widgets/Flags.svelte";
  import LapTiming from "../overlay/widgets/LapTiming.svelte";
  import PaceCatch from "../overlay/widgets/PaceCatch.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import TrackMap from "../overlay/widgets/TrackMap.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);

  // View mode: "lovely" (replica Lovely Pitwall) or "tablet" (dashboard optimizado sin scroll)
  let viewMode = $state<"lovely" | "tablet">("lovely");
  let showCustomizeModal = $state(false);
  let showRivalModal = $state(false);
  let selectedVehicleId = $state<number | null>(null);
  let focusStatusMsg = $state<string>("");

  // Personalización granular de módulos (guardada en localStorage)
  let pitwallModules = $state({
    header: true,
    leaderboard: true,
    relativeBar: true,
    bottomTelemetry: true,
    trackmap: true,
    weather: true,
    telemetryPedals: true,
    tyres: true,
    damage: true,
    fuelStrategy: true,
  });

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

    try {
      const savedModules = localStorage.getItem("mdt_pitwall_modules_v2");
      if (savedModules) {
        pitwallModules = { ...pitwallModules, ...JSON.parse(savedModules) };
      }
      const savedMode = localStorage.getItem("mdt_pitwall_view_mode_v2");
      if (savedMode === "tablet" || savedMode === "lovely") {
        viewMode = savedMode;
      }
    } catch {
      // ignore
    }

    let mounted = true;
    let sse: EventSource | null = null;
    let fallbackPolling = false;

    const handlePayload = (data: any) => {
      if (!data) return;
      if (data.appConfig) {
        applyRemoteConfig(data.appConfig);
      }
      if (data.snap) {
        remoteSnap = data.snap;
        live.snap = data.snap;
      }
      if (typeof data.mobileTheme === "string") {
        wheelControl.mobileTheme = data.mobileTheme;
      }
    };

    if (typeof EventSource !== "undefined") {
      try {
        sse = new EventSource(`${MOBILE_SERVER_BASE}/__mobile_stream`);
        sse.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            handlePayload(data);
          } catch {}
        };
        sse.onerror = () => {
          fallbackPolling = true;
        };
      } catch {
        fallbackPolling = true;
      }
    } else {
      fallbackPolling = true;
    }

    const pollState = async () => {
      while (mounted) {
        if (!sse || fallbackPolling || sse.readyState === EventSource.CLOSED) {
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
              handlePayload(data);
            }
          } catch {
            // ignore
          }
          const elapsed = performance.now() - t0;
          const waitMs = Math.max(100, 300 - elapsed);
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };
    void pollState();

    if ("wakeLock" in navigator) {
      (navigator as any).wakeLock?.request("screen").catch(() => {});
    }

    return () => {
      mounted = false;
      sse?.close();
    };
  });

  function toggleModule(key: keyof typeof pitwallModules) {
    pitwallModules[key] = !pitwallModules[key];
    try {
      localStorage.setItem("mdt_pitwall_modules_v2", JSON.stringify(pitwallModules));
    } catch {
      // ignore
    }
  }

  function setViewMode(mode: "lovely" | "tablet") {
    viewMode = mode;
    try {
      localStorage.setItem("mdt_pitwall_view_mode_v2", mode);
    } catch {
      // ignore
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  async function focusDriver(target: Vehicle | number) {
    const slotId = typeof target === "number" ? target : (target?.slotId ?? target?.id ?? 0);
    const v = typeof target === "number" ? vehicles.find((car) => (car.slotId ?? car.id) === target) : target;
    selectedVehicleId = slotId;
    const name = v ? `${shortName(v.driver)} (#${v.number || v.id})` : `Slot ${slotId}`;
    focusStatusMsg = `Enfocando a ${name} (Slot ${slotId})...`;
    try {
      void api.setFocusedSlot(slotId);
      const ok = await api.focusVehicle(slotId);
      if (ok) {
        focusStatusMsg = `✓ Enfocado en juego: ${name}`;
      } else {
        focusStatusMsg = `⚠️ No se pudo conectar a LMU (Slot ${slotId}). Asegúrate de tener LMU abierto en sesión.`;
      }
      setTimeout(() => {
        focusStatusMsg = "";
      }, 4000);
    } catch (e) {
      focusStatusMsg = `Error al enfocar Slot ${slotId}: ${e}`;
    }
  }

  const activeThemeMeta = $derived(HUD_THEMES[wheelControl.mobileTheme] ?? HUD_THEMES["mdt-aura"]);
  const units = $derived(config.value.general.units);
  const wCfg = $derived(config.value.widgets);
  const p = $derived(activeSnap?.player);
  const st = $derived(activeSnap?.strategy);
  const s = $derived(activeSnap?.session);
  const me = $derived(activeSnap?.vehicles.find((v) => v.isPlayer));
  const teammates = $derived(config.value.general.teammates);
  const vehicles = $derived(activeSnap?.vehicles ?? []);
  const batteryFull = $derived(!!p && p.electricMotorState > 0 && p.battery >= 0.975);

  // Selected or player vehicle for detailed inspection
  const selectedVehicle = $derived(
    vehicles.find((v) => v.id === selectedVehicleId) ?? me ?? vehicles[0] ?? null
  );

  // Best lap across entire grid
  const overallBest = $derived.by(() => {
    const times = vehicles.map((v) => v.bestLap).filter((t) => t > 0);
    return times.length ? Math.min(...times) : 0;
  });

  // Start grid qualification map for pos gained
  let startGridMap = new Map<number, number>();
  $effect(() => {
    for (const v of vehicles) {
      if (!startGridMap.has(v.id)) {
        startGridMap.set(v.id, v.qualification > 0 ? v.qualification : v.place);
      } else if (v.qualification > 0 && startGridMap.get(v.id) !== v.qualification) {
        startGridMap.set(v.id, v.qualification);
      }
    }
  });

  // Weather & Forecast calculations (5/10 min prediction window)
  const weather = $derived(s?.weather);
  const weatherIcon = $derived.by(() => {
    if (!weather) return { icon: "☀️", label: "Despejado", desc: "Pista seca" };
    const r = weather.raining;
    const c = weather.cloudCoverage;
    if (r >= 0.7) return { icon: "⛈️", label: "Tormenta", desc: "Extrema humedad" };
    if (r >= 0.35) return { icon: "🌧️", label: "Lluvia Fuerte", desc: "Pista mojada" };
    if (r > 0) return { icon: "🌦️", label: "Lluvia Ligera", desc: "Húmedo" };
    if (c >= 0.65) return { icon: "☁️", label: "Nublado", desc: "Seco" };
    if (c >= 0.25) return { icon: "⛅", label: "Parcial", desc: "Seco" };
    return { icon: "☀️", label: "Soleado", desc: "Pista seca" };
  });

  const forecastEstimate = $derived.by(() => {
    if (!weather || !s) return { text: "Estable ~10m", trend: "stable", minutes: 10 };
    const rain = weather.raining;
    const wet = weather.avgWetness;
    const currentEt = s.currentEt;
    const minsLeft = 5 - Math.floor((currentEt % 300) / 60);

    if (rain > 0.4) {
      return { text: `Lluvia persistente · Próx. ventana en ~${minsLeft}m`, trend: "rain", minutes: minsLeft };
    } else if (rain > 0.05) {
      return { text: `Lluvia ligera · Posible secado en ~${minsLeft + 5}m`, trend: "drying", minutes: minsLeft + 5 };
    } else if (weather.darkCloud > 0.5) {
      return { text: `Frente nuboso · Lluvia posible en ~${minsLeft}m`, trend: "cloudy", minutes: minsLeft };
    } else if (wet > 0.2) {
      return { text: `Pista secándose (~${minsLeft + 5}m para slick)`, trend: "drying", minutes: minsLeft + 5 };
    }
    return { text: `Estable · Próx. predicción en ~${minsLeft}m`, trend: "stable", minutes: minsLeft };
  });

  // Track Relative: Car immediately ahead and behind
  const relativeRivals = $derived.by(() => {
    if (!vehicles.length || !me) return { ahead: null as Vehicle | null, behind: null as Vehicle | null };
    const sorted = [...vehicles].sort((a, b) => a.place - b.place);
    const myIdx = sorted.findIndex((v) => v.id === me.id);
    const ahead = myIdx > 0 ? sorted[myIdx - 1] : null;
    const behind = myIdx >= 0 && myIdx < sorted.length - 1 ? sorted[myIdx + 1] : null;
    return { ahead, behind };
  });

  // Fuel Strategy & Lift and Coast
  const fuelCapacity = $derived(p?.fuelCapacity ?? 110);
  const currentFuel = $derived(p?.fuel ?? 0);
  const avgFuelPerLap = $derived(st?.fuelPerLap ?? 0);
  const lapsOfFuel = $derived(st?.lapsOfFuel ?? (avgFuelPerLap > 0 ? currentFuel / avgFuelPerLap : 0));
  const lcScore = $derived(p?.liftAndCoast ?? 0);
  const estTimeLeft = $derived.by(() => {
    if (!st || st.fuelPerLap <= 0 || !me?.lastLap) return "–";
    const sec = lapsOfFuel * me.lastLap;
    return clock(sec);
  });
  const atFinishLine = $derived.by(() => {
    if (!st || st.lapsRemaining <= 0 || avgFuelPerLap <= 0) return (currentFuel).toFixed(1);
    const rem = currentFuel - st.lapsRemaining * avgFuelPerLap;
    return rem.toFixed(1);
  });
</script>

{#snippet posDiffBadge(v: Vehicle)}
  {@const start = v.qualification > 0 ? v.qualification : (startGridMap.get(v.id) ?? v.place)}
  {@const diff = start - v.place}
  <span
    class={[
      "inline-flex items-center gap-0.5 font-mono text-[11px] font-bold",
      diff > 0 ? "text-[#00ff66]" : diff < 0 ? "text-[#ff3b30]" : "text-white/40",
    ]}
  >
    {#if diff > 0}▲ {diff}{:else if diff < 0}▼ {Math.abs(diff)}{:else}= 0{/if}
  </span>
{/snippet}

<div
  bind:this={rootEl}
  data-hud-theme={wheelControl.mobileTheme}
  class={[
    "flex h-dvh w-dvw flex-col overflow-hidden text-white select-none bg-[#070b12] font-sans",
    batteryFull && "hud-battery-full border-[3px] border-[#00ff66]",
  ]}
>
  <!-- =========================================================================
       BARRA DE ESTADO SUPERIOR (LOVELY STYLE)
       ========================================================================= -->
  {#if pitwallModules.header}
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0d131f] px-4 shadow-lg">
      <div class="flex items-center gap-6">
        <!-- Race / Session info -->
        <div class="flex items-center gap-2">
          <span class="rounded bg-white/10 px-2 py-0.5 text-xs font-black tracking-wider uppercase">
            {s?.kind === "race" ? "RACE" : s?.kind === "qualify" ? "QUALIFY" : "PRACTICE"}
          </span>
          <span class="font-mono text-xl font-black text-white">
            L{me?.totalLaps ?? 0}{s?.maxLaps ? `/${s.maxLaps}` : ""}
          </span>
        </div>

        <!-- Position -->
        <div class="flex flex-col">
          <span class="text-[9px] font-bold text-white/50 uppercase tracking-widest">POSITION</span>
          <span class="font-mono text-xl font-black text-white">
            {me?.place ?? 1}<span class="text-xs text-white/40 font-normal">/{vehicles.length || 1}</span>
          </span>
        </div>

        <!-- Time / Laps left -->
        <div class="flex flex-col">
          <span class="text-[9px] font-bold text-white/50 uppercase tracking-widest">TIME LEFT</span>
          <span class="font-mono text-xl font-black text-white">
            {s ? clock(s.timeRemaining) : "–"}
          </span>
        </div>

        <!-- Lap timings -->
        <div class="hidden items-center gap-5 sm:flex">
          <div class="flex flex-col">
            <span class="text-[9px] font-bold text-white/50 uppercase tracking-widest">LAST LAP</span>
            <span class="font-mono text-lg font-bold text-[#ff00ff]">
              {lapTime(me?.lastLap ?? 0)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-[9px] font-bold text-white/50 uppercase tracking-widest">BEST LAP</span>
            <span class="font-mono text-lg font-bold text-[#ff00ff]">
              {lapTime(me?.bestLap ?? 0)}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-[9px] font-bold text-white/50 uppercase tracking-widest">OVERALL BEST</span>
            <span class="font-mono text-lg font-bold text-[#00e5ff]">
              {lapTime(overallBest)}
            </span>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-2">
        {#if focusStatusMsg}
          <span class="animate-pulse rounded bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">
            {focusStatusMsg}
          </span>
        {/if}

        <div class="flex rounded-lg border border-white/15 bg-black/60 p-0.5 text-xs font-bold">
          <button
            class={["rounded px-2.5 py-1 transition", viewMode === "lovely" ? "bg-accent text-white" : "text-white/60 hover:text-white"]}
            onclick={() => setViewMode("lovely")}
          >
            🖥️ Lovely Pitwall
          </button>
          <button
            class={["rounded px-2.5 py-1 transition", viewMode === "tablet" ? "bg-accent text-white" : "text-white/60 hover:text-white"]}
            onclick={() => setViewMode("tablet")}
          >
            📱 Modo Tablet
          </button>
        </div>

        <button
          class="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/20 px-2.5 py-1 text-xs font-bold text-white hover:bg-accent"
          onclick={() => (showCustomizeModal = true)}
        >
          ⚙️ Personalizar
        </button>

        <button
          class="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20"
          onclick={toggleFullscreen}
          title="Pantalla Completa"
        >
          ⛶
        </button>
      </div>
    </header>
  {/if}

  <!-- =========================================================================
       LOVELY PITWALL LAYOUT (REPLICA COMPLETA)
       ========================================================================= -->
  {#if viewMode === "lovely"}
    <main class="grid min-h-0 flex-1 grid-cols-12 gap-2 overflow-hidden p-2.5">
      <!-- ==========================================
           COLUMNA IZQUIERDA: LEADERBOARD + RELATIVE BAR + TELEMETRÍA INFERIOR (7/12 cols)
           ========================================== -->
      <div class="col-span-12 flex h-full min-h-0 flex-col gap-2 overflow-hidden lg:col-span-7 xl:col-span-8">
        <!-- LEADERBOARD TABLE -->
        {#if pitwallModules.leaderboard}
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0d131f]/90 shadow-md">
            <div class="flex h-7 items-center justify-between border-b border-white/10 bg-black/40 px-3 text-[10px] font-bold tracking-wider text-white/50 uppercase">
              <span>LEADERBOARD (HAZ CLIC EN CUALQUIER PILOTO PARA ENFOCARLO EN EL JUEGO)</span>
              <span>{vehicles.length} COCHES</span>
            </div>

            <!-- Table Header -->
            <div class="grid grid-cols-[38px_42px_50px_1fr_65px_42px_58px_58px_72px_72px_55px_55px_55px] items-center gap-1 border-b border-white/10 bg-[#121926] px-2 py-1 text-[10px] font-extrabold text-white/60 uppercase">
              <span class="text-center">POS</span>
              <span class="text-center">DIFF</span>
              <span class="text-center">CLASS</span>
              <span>DRIVER / TEAM</span>
              <span class="text-center">PIT INFO</span>
              <span class="text-center">LAP</span>
              <span class="text-right">GAP</span>
              <span class="text-right">INT</span>
              <span class="text-center">BEST LAP</span>
              <span class="text-center">LAST LAP</span>
              <span class="text-right">S1</span>
              <span class="text-right">S2</span>
              <span class="text-right">S3</span>
            </div>

            <!-- Table Rows (Scrollable) -->
            <div class="min-h-0 flex-1 overflow-y-auto divide-y divide-white/5 text-[11px]">
              {#each vehicles as v, idx (v.id)}
                {@const mate = isTeammate(v, teammates)}
                {@const isSelected = selectedVehicleId === v.id}
                {@const isClassBest = overallBest > 0 && v.bestLap > 0 && v.bestLap <= overallBest + 1e-4}
                {@const prevCar = idx > 0 ? vehicles[idx - 1] : null}
                {@const gapInt = prevCar ? Math.max(0, v.timeBehindLeader - prevCar.timeBehindLeader) : 0}

                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_interactive_supports_focus -->
                <div
                  role="button"
                  tabindex="0"
                  class={[
                    "grid grid-cols-[38px_42px_50px_1fr_65px_42px_58px_58px_72px_72px_55px_55px_55px] items-center gap-1 px-2 py-1.5 transition-colors cursor-pointer select-none",
                    v.isPlayer
                      ? "bg-accent/30 font-bold border-l-4 border-accent text-white"
                      : isSelected
                        ? "bg-cyan-500/25 border-l-4 border-cyan-400 text-white"
                        : mate
                          ? "bg-accent/10 border-l-2 border-accent/60"
                          : idx % 2 === 1 ? "bg-white/[0.02]" : "bg-transparent",
                    "hover:bg-white/10",
                  ]}
                  onclick={() => focusDriver(v)}
                  title="Haz clic para enfocar este piloto en rFactor 2 / LMU"
                >
                  <!-- Pos badge -->
                  <div class="flex justify-center">
                    <span
                      class="flex h-5 w-6 items-center justify-center rounded text-[11px] font-black text-white"
                      style:background={v.isPlayer ? "var(--color-accent, #2287ec)" : classColor(v.class)}
                    >
                      {v.place}
                    </span>
                  </div>

                  <!-- Pos gained/lost -->
                  <div class="text-center">
                    {@render posDiffBadge(v)}
                  </div>

                  <!-- Class Badge -->
                  <div class="flex justify-center">
                    <span
                      class="rounded px-1.5 py-0.5 text-[9px] font-black text-white uppercase tracking-wider"
                      style:background={classColor(v.class)}
                    >
                      {v.class.slice(0, 3)}
                    </span>
                  </div>

                  <!-- Driver Name & Car -->
                  <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {#if mate}
                      <img src="/mdt-logo.png" alt="MDT" class="h-3 w-3 shrink-0 object-contain" />
                    {/if}
                    <span class="font-bold text-white/60">#{v.number || v.id}</span>
                    <span class="truncate font-semibold text-white">{shortName(v.driver)}</span>
                    {#if v.inPits}
                      <span class="rounded bg-white px-1 py-0.2 text-[9px] font-black text-black">PIT</span>
                    {/if}
                  </div>

                  <!-- Pit info -->
                  <div class="text-center font-mono text-[10px] text-white/70">
                    {v.numPitstops} ({v.tyreLaps}L)
                  </div>

                  <!-- Lap -->
                  <div class="text-center font-mono text-white/80">
                    L{v.totalLaps}
                  </div>

                  <!-- Gap -->
                  <div class="text-right font-mono text-white/90">
                    {idx === 0 ? "Líder" : `+${v.timeBehindLeader.toFixed(2)}`}
                  </div>

                  <!-- Interval -->
                  <div class="text-right font-mono text-white/70">
                    {idx === 0 ? "–" : `+${gapInt.toFixed(2)}`}
                  </div>

                  <!-- Best Lap -->
                  <div
                    class={[
                      "text-center font-mono font-bold",
                      isClassBest ? "text-[#ff00ff]" : v.bestLap > 0 ? "text-[#00ff66]" : "text-white/40",
                    ]}
                  >
                    {lapTime(v.bestLap)}
                  </div>

                  <!-- Last Lap -->
                  <div class="text-center font-mono font-bold text-white/90">
                    {lapTime(v.lastLap)}
                  </div>

                  <!-- S1 -->
                  <div class="text-right font-mono text-[10px] text-white/70">
                    {v.lastS1 > 0 ? v.lastS1.toFixed(3) : "–"}
                  </div>

                  <!-- S2 -->
                  <div class="text-right font-mono text-[10px] text-white/70">
                    {v.lastS2 > 0 ? v.lastS2.toFixed(3) : "–"}
                  </div>

                  <!-- S3 -->
                  <div class="text-right font-mono text-[10px] text-white/70">
                    {v.lastLap > 0 && v.lastS1 > 0 && v.lastS2 > 0 ? Math.max(0, v.lastLap - v.lastS1 - v.lastS2).toFixed(3) : "–"}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- TRACK RELATIVE BAR -->
        {#if pitwallModules.relativeBar}
          <div class="flex h-11 shrink-0 items-center justify-between rounded-lg border border-white/10 bg-[#0d131f] px-3 font-mono text-xs shadow">
            <!-- Behind Car -->
            <div class="flex items-center gap-2">
              {#if relativeRivals.behind}
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-black text-white uppercase"
                  style:background={classColor(relativeRivals.behind.class)}
                >
                  {relativeRivals.behind.class.slice(0, 3)}
                </span>
                <span class="text-white/60">{lapTime(relativeRivals.behind.lastLap)}</span>
                <span class="font-bold text-white">{shortName(relativeRivals.behind.driver)}</span>
                <span class="rounded bg-black/60 px-1 py-0.5 text-[10px] font-bold text-white/60">
                  #{relativeRivals.behind.number || relativeRivals.behind.place}
                </span>
                <span class="font-black text-[#00ff66]">
                  +{(relativeRivals.behind.timeBehindLeader - (me?.timeBehindLeader ?? 0)).toFixed(2)}s
                </span>
              {:else}
                <span class="text-white/40">– Sin rival detrás</span>
              {/if}
            </div>

            <!-- Center separator -->
            <div class="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-white/40 uppercase">
              <span>◄ TRACK RELATIVE ►</span>
            </div>

            <!-- Ahead Car -->
            <div class="flex items-center gap-2">
              {#if relativeRivals.ahead}
                <span class="font-black text-[#ff3b30]">
                  -{((me?.timeBehindLeader ?? 0) - relativeRivals.ahead.timeBehindLeader).toFixed(2)}s
                </span>
                <span class="rounded bg-black/60 px-1 py-0.5 text-[10px] font-bold text-white/60">
                  #{relativeRivals.ahead.number || relativeRivals.ahead.place}
                </span>
                <span class="font-bold text-white">{shortName(relativeRivals.ahead.driver)}</span>
                <span class="text-white/60">{lapTime(relativeRivals.ahead.lastLap)}</span>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-black text-white uppercase"
                  style:background={classColor(relativeRivals.ahead.class)}
                >
                  {relativeRivals.ahead.class.slice(0, 3)}
                </span>
              {:else}
                <span class="text-white/40">– Líder absoluto</span>
              {/if}
            </div>
          </div>
        {/if}

        <!-- BOTTOM TELEMETRY ROW (4 TILES: LAP TIMES, SECTORS, ELECTRONICS, FUEL & LIFT/COAST) -->
        {#if pitwallModules.bottomTelemetry}
          <div class="grid h-36 shrink-0 grid-cols-4 gap-2">
            <!-- Box 1: LAP TIMES -->
            <div class="flex flex-col justify-between rounded-lg border border-white/10 bg-[#0d131f] p-2.5">
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">LAP TIMES</span>
              <div class="space-y-1">
                <div>
                  <div class="text-[9px] text-white/40 uppercase">ESTIMATED LAP</div>
                  <div class="font-mono text-lg font-black text-[#ffcc00] leading-none">
                    {lapTime(me?.estimatedLapTime ?? 0)}
                  </div>
                </div>
                <div>
                  <div class="text-[9px] text-white/40 uppercase">LAST LAP</div>
                  <div class="font-mono text-base font-bold text-[#ff00ff] leading-none">
                    {lapTime(me?.lastLap ?? 0)}
                  </div>
                </div>
                <div>
                  <div class="text-[9px] text-white/40 uppercase">BEST LAP</div>
                  <div class="font-mono text-base font-bold text-[#ff00ff] leading-none">
                    {lapTime(me?.bestLap ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            <!-- Box 2: SECTORS -->
            <div class="flex flex-col justify-between rounded-lg border border-white/10 bg-[#0d131f] p-2.5">
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">SECTORS</span>
              <div class="space-y-1 text-xs">
                <div>
                  <div class="text-[9px] text-white/40 uppercase">CURRENT LAP</div>
                  <div class="font-mono text-lg font-black text-[#ffcc00] leading-none">
                    {me?.timeIntoLap ? clock(me.timeIntoLap) : "00:00.000"}
                  </div>
                </div>
                <div class="flex justify-between font-mono">
                  <span class="text-white/50">S1</span>
                  <span class="font-bold text-white">{me?.curS1 ? me.curS1.toFixed(3) : "–"}</span>
                </div>
                <div class="flex justify-between font-mono">
                  <span class="text-white/50">S2</span>
                  <span class="font-bold text-white">{me?.curS2 ? me.curS2.toFixed(3) : "–"}</span>
                </div>
                <div class="flex justify-between font-mono">
                  <span class="text-white/50">S3</span>
                  <span class="font-bold text-white">{me?.lastLap && me?.lastS1 && me?.lastS2 ? (me.lastLap - me.lastS1 - me.lastS2).toFixed(3) : "–"}</span>
                </div>
              </div>
            </div>

            <!-- Box 3: ELECTRONICS -->
            <div class="flex flex-col justify-between rounded-lg border border-white/10 bg-[#0d131f] p-2.5">
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">ELECTRONICS</span>
              <div class="grid grid-cols-5 gap-1 text-center">
                <div class="rounded border border-cyan-500/60 bg-cyan-950/40 p-1">
                  <div class="text-[8px] font-bold text-cyan-400">TC</div>
                  <div class="font-mono text-base font-black text-cyan-400">{p?.tc ?? 0}</div>
                </div>
                <div class="rounded border border-cyan-500/60 bg-cyan-950/40 p-1">
                  <div class="text-[8px] font-bold text-cyan-400">TC CUT</div>
                  <div class="font-mono text-base font-black text-cyan-400">{p?.tcCut ?? 0}</div>
                </div>
                <div class="rounded border border-yellow-500/60 bg-yellow-950/40 p-1">
                  <div class="text-[8px] font-bold text-yellow-400">ABS</div>
                  <div class="font-mono text-base font-black text-yellow-400">{p?.abs ?? 0}</div>
                </div>
                <div class="rounded border border-red-500/60 bg-red-950/40 p-1">
                  <div class="text-[8px] font-bold text-red-400">BB</div>
                  <div class="font-mono text-base font-black text-red-400">{p?.brakeBiasFront ? p.brakeBiasFront.toFixed(1) : "56.0"}</div>
                </div>
                <div class="rounded border border-green-500/60 bg-green-950/40 p-1">
                  <div class="text-[8px] font-bold text-green-400">MAP</div>
                  <div class="font-mono text-base font-black text-green-400">{p?.motorMap ?? 1}</div>
                </div>
              </div>
              <div class="text-[10px] text-white/50 text-center">
                ERS: {Math.round((p?.battery ?? 0) * 100)}% · Motor: {p?.electricMotorState ?? 0}
              </div>
            </div>

            <!-- Box 4: FUEL & LIFT/COAST STRATEGY -->
            <div class="flex flex-col justify-between rounded-lg border border-white/10 bg-[#0d131f] p-2.5">
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">FUEL & LIFT/COAST</span>
              <div class="grid grid-cols-5 gap-1 text-center font-mono">
                <div>
                  <div class="text-sm font-black text-[#ff3b30]">{fuel(currentFuel, units).toFixed(1)}</div>
                  <div class="text-[7px] text-white/50 uppercase">{fuelUnit(units)}</div>
                </div>
                <div>
                  <div class="text-sm font-black text-white">{avgFuelPerLap > 0 ? fuel(avgFuelPerLap, units).toFixed(2) : "–"}</div>
                  <div class="text-[7px] text-white/50 uppercase">AVG/VTA</div>
                </div>
                <div>
                  <div class="text-sm font-black text-[#00ff66]">{lapsOfFuel > 0 ? lapsOfFuel.toFixed(1) : "–"}</div>
                  <div class="text-[7px] text-white/50 uppercase">VUELTAS</div>
                </div>
                <div>
                  <div class="text-xs font-black text-white">{estTimeLeft}</div>
                  <div class="text-[7px] text-white/50 uppercase">TIEMPO</div>
                </div>
                <div>
                  <div class="text-sm font-black text-white">{atFinishLine}</div>
                  <div class="text-[7px] text-white/50 uppercase">FINAL</div>
                </div>
              </div>

              <!-- Lift & Coast Progress -->
              <div>
                <div class="mb-0.5 flex justify-between text-[8px] font-bold uppercase">
                  <span class="text-white/60">Lift and Coast</span>
                  <span class={lcScore > 0.4 ? "text-[#00ff66]" : "text-white"}>{Math.round(lcScore * 100)}% Eficiencia</span>
                </div>
                <div class="h-2 w-full overflow-hidden rounded bg-white/10">
                  <div class="h-full bg-gradient-to-r from-accent to-[#00ff66]" style:width="{Math.min(100, Math.max(0, lcScore * 100))}%"></div>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- ==========================================
           COLUMNA DERECHA: TRACK MAP, TELEMETRÍA, NEUMÁTICOS, DAÑOS Y RIVAL (5/12 cols)
           ========================================== -->
      <div class="col-span-12 flex h-full min-h-0 flex-col gap-2 overflow-y-auto lg:col-span-5 xl:col-span-4">
        <!-- TRACK MAP & WEATHER -->
        {#if pitwallModules.trackmap || pitwallModules.weather}
          <div class="flex flex-col rounded-lg border border-white/10 bg-[#0d131f] p-3 shadow">
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
              <div>
                <div class="font-display text-sm font-black text-white">{s?.track || "Circuito"}</div>
                <div class="text-[10px] text-white/50">TRACK MAP & ENTORNO</div>
              </div>
              <div class="font-mono text-sm font-bold text-accent">
                {s?.timeOfDay ? s.timeOfDay.slice(0, 5) : "12:00"}
              </div>
            </div>

            <div class="grid grid-cols-2 items-center gap-3">
              <!-- Live Map from Overlay -->
              <div class="flex justify-center">
                {#if pitwallModules.trackmap}
                  <TrackMap opts={{ size: 220, classColors: true, showNumbers: true }} {units} edit={false} />
                {/if}
              </div>

              <!-- Weather & Compass Details -->
              {#if pitwallModules.weather}
                <div class="space-y-2 text-xs">
                  <div class="flex items-center gap-2 rounded bg-black/40 p-2">
                    <span class="text-2xl">{weatherIcon.icon}</span>
                    <div>
                      <div class="font-bold text-white">{weatherIcon.label}</div>
                      <div class="text-[10px] text-white/50">{weatherIcon.desc}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-1.5 text-center font-mono text-[11px]">
                    <div class="rounded bg-black/40 p-1.5">
                      <div class="text-[8px] text-white/40 uppercase">PISTA / AMB</div>
                      <div class="font-black text-white">
                        {Math.round(temp(weather?.trackTemp ?? 25, units))}° / {Math.round(temp(weather?.ambientTemp ?? 22, units))}°
                      </div>
                    </div>
                    <div class="rounded bg-black/40 p-1.5">
                      <div class="text-[8px] text-white/40 uppercase">VIENTO</div>
                      <div class="font-black text-white">
                        {Math.round(weather?.windSpeed ?? 0)} m/s
                      </div>
                    </div>
                  </div>

                  <!-- 5/10 min forecast countdown -->
                  <div class="rounded border border-accent/40 bg-accent/10 p-2 text-[10px]">
                    <div class="flex items-center gap-1 font-bold text-accent">
                      <span>⏱️ Predicción (5-10m):</span>
                    </div>
                    <div class="mt-0.5 text-white/90 font-medium">
                      {forecastEstimate.text}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- TELEMETRY PEDALS, SPEED & RPM -->
        {#if pitwallModules.telemetryPedals}
          <div class="grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-[#0d131f] p-3 shadow">
            <!-- Pedals -->
            <div class="flex items-end justify-center gap-2">
              <!-- Clutch -->
              <div class="flex flex-col items-center gap-1">
                <div class="h-20 w-3 overflow-hidden rounded-full bg-white/10">
                  <div class="h-full w-full bg-blue-500 transition-all duration-75" style:height="{Math.round((p?.clutch ?? 0) * 100)}%"></div>
                </div>
                <span class="text-[8px] font-bold text-white/50">C</span>
              </div>
              <!-- Brake -->
              <div class="flex flex-col items-center gap-1">
                <div class="h-20 w-4 overflow-hidden rounded-full bg-white/10">
                  <div class="h-full w-full bg-[#ff3b30] shadow-[0_0_8px_#ff3b30] transition-all duration-75" style:height="{Math.round((p?.brake ?? 0) * 100)}%"></div>
                </div>
                <span class="text-[8px] font-bold text-[#ff3b30]">B</span>
              </div>
              <!-- Throttle -->
              <div class="flex flex-col items-center gap-1">
                <div class="h-20 w-4 overflow-hidden rounded-full bg-white/10">
                  <div class="h-full w-full bg-[#00ff66] shadow-[0_0_8px_#00ff66] transition-all duration-75" style:height="{Math.round((p?.throttle ?? 0) * 100)}%"></div>
                </div>
                <span class="text-[8px] font-bold text-[#00ff66]">T</span>
              </div>
            </div>

            <!-- Speed -->
            <div class="flex flex-col items-center justify-center rounded bg-black/40 p-2">
              <span class="text-[9px] font-bold text-white/40 uppercase">VELOCIDAD</span>
              <span class="font-mono text-3xl font-black text-white">{Math.round(p?.speed ?? 0)}</span>
              <span class="text-[9px] font-semibold text-white/60">{units === "imperial" ? "MPH" : "KMH"}</span>
            </div>

            <!-- Gear & RPM -->
            <div class="flex flex-col items-center justify-center rounded bg-black/40 p-2">
              <span class="text-[9px] font-bold text-white/40 uppercase">MARCHA / RPM</span>
              <span class="font-mono text-3xl font-black text-accent">{p?.gear === 0 ? "N" : p?.gear === -1 ? "R" : p?.gear ?? "–"}</span>
              <span class="font-mono text-[10px] text-white/70">{Math.round(p?.engineRpm ?? 0)} RPM</span>
            </div>
          </div>
        {/if}

        <!-- TIRES & BRAKES (4 CORNERS LOVELY STYLE) -->
        {#if pitwallModules.tyres}
          <div class="flex flex-col rounded-lg border border-white/10 bg-[#0d131f] p-3 shadow">
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="text-[10px] font-black text-white/50 uppercase">TIRES & BRAKES</span>
              <span class="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white">
                {p?.frontCompound || "DRY"}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs font-mono">
              <!-- FL -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>FL</span>
                  <span>{Math.round((p?.wheels?.[0]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">{pressure(p?.wheels?.[0]?.pressure ?? 190, units).toFixed(1)} <span class="text-[9px] font-normal text-white/40">{pressureUnit(units)}</span></div>
                <div class="flex justify-between text-[10px]">
                  <span class="text-cyan-400">{Math.round(temp(p?.wheels?.[0]?.carcassTemp ?? 85, units))}°</span>
                  <span class="text-orange-400">{Math.round(temp(p?.wheels?.[0]?.brakeTemp ?? 450, units))}°B</span>
                </div>
              </div>

              <!-- FR -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>FR</span>
                  <span>{Math.round((p?.wheels?.[1]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">{pressure(p?.wheels?.[1]?.pressure ?? 190, units).toFixed(1)} <span class="text-[9px] font-normal text-white/40">{pressureUnit(units)}</span></div>
                <div class="flex justify-between text-[10px]">
                  <span class="text-cyan-400">{Math.round(temp(p?.wheels?.[1]?.carcassTemp ?? 85, units))}°</span>
                  <span class="text-orange-400">{Math.round(temp(p?.wheels?.[1]?.brakeTemp ?? 450, units))}°B</span>
                </div>
              </div>

              <!-- RL -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>RL</span>
                  <span>{Math.round((p?.wheels?.[2]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">{pressure(p?.wheels?.[2]?.pressure ?? 190, units).toFixed(1)} <span class="text-[9px] font-normal text-white/40">{pressureUnit(units)}</span></div>
                <div class="flex justify-between text-[10px]">
                  <span class="text-cyan-400">{Math.round(temp(p?.wheels?.[2]?.carcassTemp ?? 85, units))}°</span>
                  <span class="text-orange-400">{Math.round(temp(p?.wheels?.[2]?.brakeTemp ?? 450, units))}°B</span>
                </div>
              </div>

              <!-- RR -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>RR</span>
                  <span>{Math.round((p?.wheels?.[3]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">{pressure(p?.wheels?.[3]?.pressure ?? 190, units).toFixed(1)} <span class="text-[9px] font-normal text-white/40">{pressureUnit(units)}</span></div>
                <div class="flex justify-between text-[10px]">
                  <span class="text-cyan-400">{Math.round(temp(p?.wheels?.[3]?.carcassTemp ?? 85, units))}°</span>
                  <span class="text-orange-400">{Math.round(temp(p?.wheels?.[3]?.brakeTemp ?? 450, units))}°B</span>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- CAR DAMAGE DIAGRAM -->
        {#if pitwallModules.damage}
          <div class="flex flex-col rounded-lg border border-white/10 bg-[#0d131f] p-3 shadow">
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="text-[10px] font-black text-white/50 uppercase">DAMAGE STATE</span>
              <span class="text-[10px] font-bold text-[#00ff66]">
                {(p?.damage?.aero ?? 0) === 0 ? "Aero OK" : `Aero -${Math.round((p?.damage?.aero ?? 0) * 100)}%`}
              </span>
            </div>

            <div class="flex items-center justify-around">
              <Damage opts={{ showCar: true }} {units} edit={false} />
            </div>
          </div>
        {/if}

        <!-- SELECTED RIVAL DETAILED CARD (SI HAY UNO SELECCIONADO) -->
        {#if selectedVehicle}
          <div class="rounded-lg border border-accent/40 bg-accent/10 p-3 shadow">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-[10px] font-black text-accent uppercase">
                PILOTO ENFOCADO EN DIRECTO
              </span>
              <button
                class="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white hover:bg-accent/80"
                onclick={() => focusDriver(selectedVehicle)}
              >
                🎥 Reenfocar en juego
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-black text-white">#{selectedVehicle.number || selectedVehicle.id} {shortName(selectedVehicle.driver)}</div>
                <div class="text-[10px] text-white/60">{selectedVehicle.team || selectedVehicle.vehicle}</div>
              </div>
              <div class="text-right font-mono">
                <div class="text-xs font-bold text-white">P{selectedVehicle.place} (Clase {selectedVehicle.class})</div>
                <div class="text-[10px] text-white/60">{selectedVehicle.numPitstops} pits · {selectedVehicle.tyreLaps}v neum</div>
              </div>
            </div>
            {#if me && selectedVehicle.id !== me.id}
              <div class="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-xs">
                <span class="text-white/60">Diferencia contigo:</span>
                <span class="font-mono font-bold text-accent">
                  {(selectedVehicle.timeBehindLeader - me.timeBehindLeader).toFixed(2)}s
                </span>
                <button
                  class="text-[10px] text-white/60 underline hover:text-white"
                  onclick={() => focusDriver(me)}
                >
                  Volver a mi coche
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </main>
  {:else}
    <!-- =========================================================================
         MODO TABLET: DASHBOARD COMPLETO SIN SCROLL
         ========================================================================= -->
    <main class="grid h-full min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-hidden p-3 md:grid-cols-3">
      <!-- Columna Izquierda: Estrategia, Meteorología, Combustible & Lift/Coast -->
      <div class="flex flex-col gap-2.5 overflow-y-auto">
        {#if pitwallModules.weather}
          <div class="hud p-3 text-xs">
            <div class="mb-1 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="hud-title flex items-center gap-1.5">
                <span>{weatherIcon.icon}</span> METEOROLOGÍA
              </span>
              <span class="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent uppercase">
                {weatherIcon.label}
              </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center font-mono">
              <div class="rounded bg-black/40 p-1.5">
                <div class="text-[8px] text-muted uppercase">PISTA / AMB</div>
                <div class="font-bold text-white">
                  {Math.round(temp(weather?.trackTemp ?? 25, units))}° / {Math.round(temp(weather?.ambientTemp ?? 22, units))}°
                </div>
              </div>
              <div class="rounded bg-black/40 p-1.5">
                <div class="text-[8px] text-muted uppercase">HUMEDAD</div>
                <div class="font-bold text-white">
                  {Math.round((weather?.avgWetness ?? 0) * 100)}%
                </div>
              </div>
            </div>
            <div class="mt-1.5 text-[10px] text-accent font-medium">
              ⏱️ {forecastEstimate.text}
            </div>
          </div>
        {/if}

        {#if pitwallModules.fuelStrategy}
          <div class="hud p-3 text-xs">
            <div class="mb-1 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="hud-title">⛽ COMBUSTIBLE & LIFT/COAST</span>
              <span class="font-mono font-bold text-good">
                {lapsOfFuel > 0 ? lapsOfFuel.toFixed(1) : "–"} vueltas
              </span>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-center font-mono">
              <div class="rounded bg-black/40 p-1">
                <div class="text-[8px] text-muted">LITROS</div>
                <div class="font-bold text-white">{fuel(currentFuel, units).toFixed(1)}</div>
              </div>
              <div class="rounded bg-black/40 p-1">
                <div class="text-[8px] text-muted">CONSUMO</div>
                <div class="font-bold text-white">{avgFuelPerLap > 0 ? fuel(avgFuelPerLap, units).toFixed(2) : "–"}</div>
              </div>
              <div class="rounded bg-black/40 p-1">
                <div class="text-[8px] text-muted">A META</div>
                <div class="font-bold text-white">{atFinishLine}</div>
              </div>
            </div>
            <div class="mt-2">
              <div class="flex justify-between text-[9px] font-bold text-muted">
                <span>LIFT & COAST</span>
                <span>{Math.round(lcScore * 100)}%</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded bg-white/10 mt-0.5">
                <div class="h-full bg-gradient-to-r from-accent to-good" style:width="{Math.min(100, Math.max(0, lcScore * 100))}%"></div>
              </div>
            </div>
          </div>
        {/if}

        {#if pitwallModules.tyres}
          <Tyres opts={{ showBrakes: true, showWearRate: true, showLapsLeft: true }} {units} edit={false} />
        {/if}
      </div>

      <!-- Columna Central: Dashboard DDU, Delta y Lap Timing -->
      <div class="flex flex-col items-center gap-2.5 overflow-y-auto">
        <Delta opts={{ reference: "pb", range: 2 }} {units} edit={false} />
        <Dashboard opts={wCfg.dashboard?.options ?? {}} {units} edit={false} />
        <LapTiming opts={{ showSectors: true }} {units} edit={false} />
        <Electronics opts={{}} {units} edit={false} />
      </div>

      <!-- Columna Derecha: TrackMap y Standings -->
      <div class="flex flex-col gap-2.5 overflow-y-auto">
        {#if pitwallModules.trackmap}
          <div class="flex justify-center">
            <TrackMap opts={{ size: 230, classColors: true, showNumbers: true }} {units} edit={false} />
          </div>
        {/if}
        <Standings
          opts={{ ...(wCfg.standings?.options ?? {}), showBranding: true, maxRows: 8, maxRowsOther: 4, showPosGained: true }}
          {units}
          edit={false}
        />
        <Relative
          opts={{ ...(wCfg.relative?.options ?? {}), ahead: 3, behind: 3, showPaceDiff: true, showEnergy: true }}
          {units}
          edit={false}
        />
      </div>
    </main>
  {/if}

  <!-- =========================================================================
       MODAL DE PERSONALIZACIÓN DE MÓDULOS DEL MURO
       ========================================================================= -->
  {#if showCustomizeModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div class="w-full max-w-md rounded-xl border border-white/20 bg-[#0d131f] p-5 shadow-2xl">
        <div class="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
          <div class="font-display text-base font-black text-white">⚙️ Personalizar Módulos del Pit Wall</div>
          <button class="text-white/60 hover:text-white" onclick={() => (showCustomizeModal = false)}>✕</button>
        </div>

        <p class="mb-4 text-xs text-white/60">
          Activa o desactiva cualquier sección según el tamaño de tu monitor o tablet:
        </p>

        <div class="space-y-2.5 text-xs">
          {#each Object.keys(pitwallModules) as key}
            {@const k = key as keyof typeof pitwallModules}
            <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 cursor-pointer hover:bg-white/5">
              <span class="font-bold text-white capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
              <input
                type="checkbox"
                class="h-4 w-4 rounded accent-accent"
                checked={pitwallModules[k]}
                onchange={() => toggleModule(k)}
              />
            </label>
          {/each}
        </div>

        <div class="mt-5 flex justify-end">
          <button
            class="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-white hover:bg-accent/80"
            onclick={() => (showCustomizeModal = false)}
          >
            Guardar y Cerrar
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
