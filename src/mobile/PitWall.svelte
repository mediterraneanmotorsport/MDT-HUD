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
    speed,
    speedUnit,
    temp,
    tempUnit,
  } from "../lib/format";
  import { live, provideLive, startLive } from "../lib/live.svelte";
  import type { Snapshot, Vehicle } from "../lib/types";
  import { MOBILE_SERVER_BASE, wheelControl } from "../lib/wheelControl.svelte";
  import Damage from "../overlay/widgets/Damage.svelte";
  import Dashboard from "../overlay/widgets/Dashboard.svelte";
  import Delta from "../overlay/widgets/Delta.svelte";
  import Electronics from "../overlay/widgets/Electronics.svelte";
  import LapTiming from "../overlay/widgets/LapTiming.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import TrackMap from "../overlay/widgets/TrackMap.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";

  let { embedded = false } = $props();

  let remoteSnap = $state.raw<Snapshot | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);

  // View mode: "lovely" (replica Lovely Pitwall) or "tablet" (dashboard optimizado sin scroll)
  let viewMode = $state<"lovely" | "tablet">("lovely");
  let showCustomizeModal = $state(false);
  let customizeTab = $state<"general" | "columns" | "modules" | "units">("general");
  let selectedVehicleId = $state<number | null>(null);
  let focusStatusMsg = $state<string>("");

  // Filtro de clase
  let selectedClass = $state<string>("ALL");

  // Configuración completa personalizable (guardada en localStorage)
  interface PitwallConfig {
    theme: "lovely-dark" | "f1-carbon" | "cyber-neon" | "stealth-oled" | "racing-gold";
    density: "compact" | "normal" | "spacious";
    units: {
      pressure: "psi" | "bar" | "kpa";
      temp: "c" | "f";
      speed: "kmh" | "mph";
    };
    columns: {
      diff: boolean;
      cls: boolean;
      driver: boolean;
      pit: boolean;
      lap: boolean;
      gap: boolean;
      interval: boolean;
      bestLap: boolean;
      lastLap: boolean;
      sectors: boolean;
    };
    modules: {
      header: boolean;
      leaderboard: boolean;
      relativeBar: boolean;
      bottomTelemetry: boolean;
      trackmap: boolean;
      weather: boolean;
      telemetryPedals: boolean;
      tyres: boolean;
      tyreHistory: boolean;
      damage: boolean;
      fuelStrategy: boolean;
    };
  }

  const DEFAULT_CONFIG: PitwallConfig = {
    theme: "lovely-dark",
    density: "normal",
    units: {
      pressure: "psi",
      temp: "c",
      speed: "kmh",
    },
    columns: {
      diff: true,
      cls: true,
      driver: true,
      pit: true,
      lap: true,
      gap: true,
      interval: true,
      bestLap: true,
      lastLap: true,
      sectors: true,
    },
    modules: {
      header: true,
      leaderboard: true,
      relativeBar: true,
      bottomTelemetry: true,
      trackmap: true,
      weather: true,
      telemetryPedals: true,
      tyres: true,
      tyreHistory: true,
      damage: true,
      fuelStrategy: true,
    },
  };

  let pitwallConfig = $state<PitwallConfig>(DEFAULT_CONFIG);

  const activeSnap = $derived(remoteSnap ?? live.snap);

  provideLive({
    get snap() {
      return activeSnap;
    },
  });

  // Pit Stop Tracking (duración de la parada en vivo y última parada registrada)
  interface PitRecord {
    inPits: boolean;
    pitStartEt: number;
    currentDuration: number;
    lastPitDuration: number;
    pitCount: number;
  }
  let pitRecords = $state<Record<number, PitRecord>>({});

  // Mini Sparklines Historial (Speed, RPM, Gear, Tyre Pressures)
  let historySpeed = $state<number[]>([]);
  let historyRpm = $state<number[]>([]);
  let historyGear = $state<number[]>([]);
  let historyTirePressures = $state<{ fl: number[]; fr: number[]; rl: number[]; rr: number[] }>({
    fl: [],
    fr: [],
    rl: [],
    rr: [],
  });

  const p = $derived(activeSnap?.player);
  const st = $derived(activeSnap?.strategy);
  const s = $derived(activeSnap?.session);
  const me = $derived(activeSnap?.vehicles?.find((v) => v.isPlayer) ?? null);
  const teammates = $derived(config.value.general.teammates);
  const vehicles = $derived(activeSnap?.vehicles ?? []);
  const batteryFull = $derived(!!p && p.electricMotorState > 0 && p.battery >= 0.975);

  // Unidades efectivas
  const effectiveUnits = $derived({
    ...config.value.general.units,
    pressure: pitwallConfig.units.pressure,
    temperature: pitwallConfig.units.temp,
    speed: pitwallConfig.units.speed,
  });

  // Clases disponibles para filtro rápido
  const availableClasses = $derived.by(() => {
    const set = new Set<string>();
    for (const v of vehicles) {
      if (v.class) set.add(v.class.trim());
    }
    return Array.from(set).sort();
  });

  // Vehículos filtrados por clase
  const filteredVehicles = $derived.by(() => {
    if (selectedClass === "ALL") return vehicles;
    return vehicles.filter((v) => (v.class || "").toLowerCase().includes(selectedClass.toLowerCase()));
  });

  // Seguimiento de paradas en boxes en tiempo real
  $effect(() => {
    const currentEt = s?.currentEt ?? Date.now() / 1000;
    for (const v of vehicles) {
      const rec = pitRecords[v.id];
      if (v.inPits) {
        if (!rec || !rec.inPits) {
          pitRecords[v.id] = {
            inPits: true,
            pitStartEt: currentEt,
            currentDuration: 0,
            lastPitDuration: rec?.lastPitDuration ?? 0,
            pitCount: v.numPitstops,
          };
        } else {
          rec.currentDuration = Math.max(0, currentEt - rec.pitStartEt);
          if (v.numPitstops > rec.pitCount) {
            rec.pitCount = v.numPitstops;
          }
        }
      } else {
        if (rec && rec.inPits) {
          const d = rec.currentDuration > 0 ? rec.currentDuration : Math.max(0, currentEt - rec.pitStartEt);
          rec.lastPitDuration = d > 0 ? d : rec.lastPitDuration;
          rec.inPits = false;
          rec.currentDuration = 0;
          rec.pitCount = v.numPitstops;
        }
      }
    }
  });

  // Historial para gráficas de telemetría y presión
  let lastHistSample = 0;
  $effect(() => {
    const now = Date.now();
    if (now - lastHistSample > 250) {
      lastHistSample = now;
      if (p) {
        const curSpd = speed(p.speed ?? 0, effectiveUnits);
        const curRpm = p.engineRpm ?? 0;
        const curGear = p.gear ?? 0;
        historySpeed = [...historySpeed.slice(-40), curSpd];
        historyRpm = [...historyRpm.slice(-40), curRpm];
        historyGear = [...historyGear.slice(-40), curGear];

        const w = p.wheels;
        if (w && w.length >= 4) {
          const fl = pressure(w[0]?.pressure ?? 190, effectiveUnits);
          const fr = pressure(w[1]?.pressure ?? 190, effectiveUnits);
          const rl = pressure(w[2]?.pressure ?? 190, effectiveUnits);
          const rr = pressure(w[3]?.pressure ?? 190, effectiveUnits);
          historyTirePressures.fl = [...historyTirePressures.fl.slice(-40), fl];
          historyTirePressures.fr = [...historyTirePressures.fr.slice(-40), fr];
          historyTirePressures.rl = [...historyTirePressures.rl.slice(-40), rl];
          historyTirePressures.rr = [...historyTirePressures.rr.slice(-40), rr];
        }
      }
    }
  });

  function createSparkline(pts: number[], w: number, h: number, minVal?: number, maxVal?: number): string {
    if (!pts || pts.length < 2) return "";
    const min = minVal ?? Math.min(...pts);
    const max = maxVal ?? Math.max(...pts);
    const range = max - min || 1;
    return pts
      .map((val, i) => {
        const x = (i / (pts.length - 1)) * w;
        const y = h - ((val - min) / range) * (h - 6) - 3;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  onMount(() => {
    loadConfig();
    startLive();
    wheelControl.startHost();

    try {
      const savedConfig = localStorage.getItem("mdt_pitwall_config_v3");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        pitwallConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          columns: { ...DEFAULT_CONFIG.columns, ...(parsed.columns || {}) },
          modules: { ...DEFAULT_CONFIG.modules, ...(parsed.modules || {}) },
          units: { ...DEFAULT_CONFIG.units, ...(parsed.units || {}) },
        };
      }
      const savedMode = localStorage.getItem("mdt_pitwall_view_mode_v2");
      if (savedMode === "tablet" || savedMode === "lovely") {
        viewMode = savedMode;
      }
    } catch {}

    if (embedded) return;

    let mounted = true;
    let sse: EventSource | null = null;
    let fallbackPolling = false;

    const handlePayload = (data: any) => {
      if (!data) return;
      if (data.appConfig) applyRemoteConfig(data.appConfig);
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
            handlePayload(JSON.parse(e.data));
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
            if (res.ok) handlePayload(await res.json());
          } catch {}
          const elapsed = performance.now() - t0;
          await new Promise((r) => setTimeout(r, Math.max(100, 300 - elapsed)));
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

  function saveConfig() {
    try {
      localStorage.setItem("mdt_pitwall_config_v3", JSON.stringify(pitwallConfig));
    } catch {}
  }

  function resetConfig() {
    pitwallConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    saveConfig();
  }

  function setViewMode(mode: "lovely" | "tablet") {
    viewMode = mode;
    try {
      localStorage.setItem("mdt_pitwall_view_mode_v2", mode);
    } catch {}
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
    focusStatusMsg = `Enfocando a ${name}...`;
    try {
      void api.setFocusedSlot(slotId);
      const ok = await api.focusVehicle(slotId);
      if (ok) {
        focusStatusMsg = `✓ Enfocado en juego: ${name}`;
      } else {
        focusStatusMsg = `⚠️ No se pudo conectar a LMU (Slot ${slotId}).`;
      }
      setTimeout(() => {
        focusStatusMsg = "";
      }, 4000);
    } catch (e) {
      focusStatusMsg = `Error al enfocar Slot ${slotId}: ${e}`;
    }
  }

  const selectedVehicle = $derived(
    vehicles.find((v) => v.id === selectedVehicleId) ?? me ?? vehicles[0] ?? null
  );

  const overallBest = $derived.by(() => {
    const times = vehicles.map((v) => v.bestLap).filter((t) => t > 0);
    return times.length ? Math.min(...times) : 0;
  });

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
    if (!weather || !s) return { text: "Estable ~10m", minutes: 10 };
    const rain = weather.raining;
    const wet = weather.avgWetness;
    const currentEt = s.currentEt;
    const minsLeft = 5 - Math.floor((currentEt % 300) / 60);

    if (rain > 0.4) return { text: `Lluvia persistente · Ventana ~${minsLeft}m`, minutes: minsLeft };
    if (rain > 0.05) return { text: `Lluvia ligera · Secado ~${minsLeft + 5}m`, minutes: minsLeft + 5 };
    if (weather.darkCloud > 0.5) return { text: `Frente nuboso · Lluvia en ~${minsLeft}m`, minutes: minsLeft };
    if (wet > 0.2) return { text: `Pista secándose (~${minsLeft + 5}m para slick)`, minutes: minsLeft + 5 };
    return { text: `Estable · Próx. informe en ~${minsLeft}m`, minutes: minsLeft };
  });

  const relativeRivals = $derived.by(() => {
    if (!vehicles.length || !me) return { ahead: null as Vehicle | null, behind: null as Vehicle | null };
    const sorted = [...vehicles].sort((a, b) => a.place - b.place);
    const myIdx = sorted.findIndex((v) => v.id === me.id);
    const ahead = myIdx > 0 ? sorted[myIdx - 1] : null;
    const behind = myIdx >= 0 && myIdx < sorted.length - 1 ? sorted[myIdx + 1] : null;
    return { ahead, behind };
  });

  const currentFuel = $derived(p?.fuel ?? 0);
  const avgFuelPerLap = $derived(st?.fuelPerLap ?? 0);
  const lapsOfFuel = $derived(st?.lapsOfFuel ?? (avgFuelPerLap > 0 ? currentFuel / avgFuelPerLap : 0));
  const lcScore = $derived(p?.liftAndCoast ?? 0);
  const estTimeLeft = $derived.by(() => {
    if (!st || st.fuelPerLap <= 0 || !me?.lastLap) return "–";
    return clock(lapsOfFuel * me.lastLap);
  });
  const atFinishLine = $derived.by(() => {
    if (!st || st.lapsRemaining <= 0 || avgFuelPerLap <= 0) return currentFuel.toFixed(1);
    return (currentFuel - st.lapsRemaining * avgFuelPerLap).toFixed(1);
  });

  // Tema CSS dinámico
  const themeStyles = $derived.by(() => {
    switch (pitwallConfig.theme) {
      case "f1-carbon":
        return {
          bg: "bg-[#0b0b0d]",
          card: "bg-[#141418]/95 border-red-500/20",
          header: "bg-[#18181e] border-red-500/30",
          accent: "#e10600",
        };
      case "cyber-neon":
        return {
          bg: "bg-[#090514]",
          card: "bg-[#140c2a]/95 border-fuchsia-500/25",
          header: "bg-[#1a0f38] border-fuchsia-500/40",
          accent: "#00ffff",
        };
      case "stealth-oled":
        return {
          bg: "bg-black",
          card: "bg-[#0a0a0a] border-white/10",
          header: "bg-[#101010] border-white/15",
          accent: "#ffffff",
        };
      case "racing-gold":
        return {
          bg: "bg-[#0d0b07]",
          card: "bg-[#19150e]/95 border-amber-500/25",
          header: "bg-[#211c12] border-amber-500/35",
          accent: "#f5a623",
        };
      case "lovely-dark":
      default:
        return {
          bg: "bg-[#070b12]",
          card: "bg-[#0d131f]/95 border-white/10",
          header: "bg-[#0d131f] border-white/10",
          accent: "#2287ec",
        };
    }
  });

  // Clases dinámicas según densidad
  const densityRowClass = $derived.by(() => {
    if (pitwallConfig.density === "compact") return "py-0.5 text-[10px]";
    if (pitwallConfig.density === "spacious") return "py-2.5 text-xs";
    return "py-1.5 text-[11px]";
  });
</script>

{#snippet posDiffBadge(v: Vehicle)}
  {@const start = v.qualification > 0 ? v.qualification : (startGridMap.get(v.id) ?? v.place)}
  {@const diff = start - v.place}
  <span
    class={[
      "inline-flex items-center gap-0.5 font-mono text-[10px] font-bold",
      diff > 0 ? "text-[#00ff66]" : diff < 0 ? "text-[#ff3b30]" : "text-white/40",
    ]}
  >
    {#if diff > 0}▲ {diff}{:else if diff < 0}▼ {Math.abs(diff)}{:else}= 0{/if}
  </span>
{/snippet}

<div
  bind:this={rootEl}
  class={[
    embedded
      ? `flex h-full w-full flex-col overflow-y-auto text-white select-none ${themeStyles.bg} font-sans`
      : `flex h-dvh w-dvw flex-col overflow-hidden text-white select-none ${themeStyles.bg} font-sans`,
    batteryFull && "border-[3px] border-[#00ff66]",
  ]}
>
  <!-- =========================================================================
       BARRA DE ESTADO SUPERIOR (LOVELY STYLE)
       ========================================================================= -->
  {#if pitwallConfig.modules.header}
    <header class={`flex h-14 shrink-0 items-center justify-between border-b ${themeStyles.header} px-4 shadow-lg`}>
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
        <div class="hidden items-center gap-5 md:flex">
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

      <!-- Controls & Customization -->
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

        <!-- Botón Personalizar Overlay -->
        <button
          class="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/25 px-3 py-1 text-xs font-bold text-white shadow hover:bg-accent transition"
          onclick={() => (showCustomizeModal = true)}
        >
          <span>⚙️</span>
          <span>Personalizar</span>
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
       LOVELY PITWALL LAYOUT (REPLICA COMPLETA CON PERSONALIZACIÓN)
       ========================================================================= -->
  {#if viewMode === "lovely"}
    <main class={["grid min-h-0 flex-1 grid-cols-12 gap-2 p-2.5", embedded ? "overflow-y-auto" : "overflow-hidden"]}>
      <!-- ==========================================
           COLUMNA IZQUIERDA: LEADERBOARD + RELATIVE BAR + TELEMETRÍA INFERIOR (7/12 cols)
           ========================================== -->
      <div class="col-span-12 flex h-full min-h-0 flex-col gap-2 overflow-hidden lg:col-span-7 xl:col-span-8">
        <!-- LEADERBOARD TABLE -->
        {#if pitwallConfig.modules.leaderboard}
          <div class={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border ${themeStyles.card} shadow-md`}>
            <!-- Leaderboard Header & Class Filter Pills -->
            <div class="flex h-8 items-center justify-between border-b border-white/10 bg-black/40 px-3 text-[10px] font-bold text-white/60">
              <div class="flex items-center gap-2">
                <span class="tracking-wider uppercase">LEADERBOARD ({filteredVehicles.length}/{vehicles.length})</span>
                <!-- Filtros rápidos por clase -->
                <div class="flex items-center gap-1">
                  <button
                    class={["rounded px-1.5 py-0.5 text-[9px] font-bold transition", selectedClass === "ALL" ? "bg-accent text-white" : "bg-white/10 text-white/60 hover:text-white"]}
                    onclick={() => (selectedClass = "ALL")}
                  >
                    TODAS
                  </button>
                  {#each availableClasses as c}
                    <button
                      class={["rounded px-1.5 py-0.5 text-[9px] font-bold transition uppercase", selectedClass === c ? "bg-accent text-white" : "bg-white/10 text-white/60 hover:text-white"]}
                      onclick={() => (selectedClass = c)}
                    >
                      {c.slice(0, 8)}
                    </button>
                  {/each}
                </div>
              </div>
              <span class="text-[9px] text-white/40">Haz clic en un piloto para enfocarlo</span>
            </div>

            <!-- Table Header -->
            <div class="flex items-center gap-1 border-b border-white/10 bg-[#121926]/90 px-2 py-1 text-[10px] font-extrabold text-white/60 uppercase">
              <span class="w-9 text-center">POS</span>
              {#if pitwallConfig.columns.diff}<span class="w-10 text-center">DIFF</span>{/if}
              {#if pitwallConfig.columns.cls}<span class="w-12 text-center">CLASS</span>{/if}
              <span class="flex-1 min-w-[120px]">DRIVER / TEAM</span>
              {#if pitwallConfig.columns.pit}<span class="w-24 text-center">PIT INFO</span>{/if}
              {#if pitwallConfig.columns.lap}<span class="w-10 text-center">LAP</span>{/if}
              {#if pitwallConfig.columns.gap}<span class="w-14 text-right">GAP</span>{/if}
              {#if pitwallConfig.columns.interval}<span class="w-14 text-right">INT</span>{/if}
              {#if pitwallConfig.columns.bestLap}<span class="w-18 text-center">BEST LAP</span>{/if}
              {#if pitwallConfig.columns.lastLap}<span class="w-18 text-center">LAST LAP</span>{/if}
              {#if pitwallConfig.columns.sectors}
                <span class="w-14 text-right">S1</span>
                <span class="w-14 text-right">S2</span>
                <span class="w-14 text-right">S3</span>
              {/if}
            </div>

            <!-- Table Rows (Scrollable & Responsive) -->
            <div class="min-h-0 flex-1 overflow-y-auto divide-y divide-white/5">
              {#each filteredVehicles as v, idx (v.id)}
                {@const mate = isTeammate(v, teammates)}
                {@const isSelected = selectedVehicleId === v.id}
                {@const isClassBest = overallBest > 0 && v.bestLap > 0 && v.bestLap <= overallBest + 1e-4}
                {@const prevCar = idx > 0 ? filteredVehicles[idx - 1] : null}
                {@const gapInt = prevCar ? Math.max(0, v.timeBehindLeader - prevCar.timeBehindLeader) : 0}
                {@const pitRec = pitRecords[v.id]}

                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_interactive_supports_focus -->
                <div
                  role="button"
                  tabindex="0"
                  class={[
                    "flex items-center gap-1 px-2 transition-colors cursor-pointer select-none",
                    densityRowClass,
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
                  title="Haz clic para enfocar este piloto en el juego"
                >
                  <!-- Pos badge -->
                  <div class="w-9 flex justify-center">
                    <span
                      class="flex h-5 w-6 items-center justify-center rounded text-[10px] font-black text-white"
                      style:background={v.isPlayer ? "var(--color-accent, #2287ec)" : classColor(v.class)}
                    >
                      {v.place}
                    </span>
                  </div>

                  <!-- Pos gained/lost -->
                  {#if pitwallConfig.columns.diff}
                    <div class="w-10 text-center">
                      {@render posDiffBadge(v)}
                    </div>
                  {/if}

                  <!-- Class Badge -->
                  {#if pitwallConfig.columns.cls}
                    <div class="w-12 flex justify-center">
                      <span
                        class="rounded px-1.5 py-0.5 text-[9px] font-black text-white uppercase tracking-wider"
                        style:background={classColor(v.class)}
                      >
                        {(v.class || "LMU").slice(0, 3)}
                      </span>
                    </div>
                  {/if}

                  <!-- Driver Name & Car -->
                  <div class="flex flex-1 min-w-[120px] items-center gap-1.5 overflow-hidden">
                    {#if mate}
                      <img src="/mdt-logo.png" alt="MDT" class="h-3 w-3 shrink-0 object-contain" />
                    {/if}
                    <span class="font-bold text-white/50 text-[10px]">#{v.number || v.id}</span>
                    <span class="truncate font-semibold text-white">{shortName(v.driver)}</span>
                    {#if v.inPits}
                      <span class="rounded bg-red-600 px-1 py-0.2 text-[8px] font-black text-white animate-pulse">PIT</span>
                    {/if}
                  </div>

                  <!-- Pit info con tiempo de parada en directo -->
                  {#if pitwallConfig.columns.pit}
                    <div class="w-24 text-center font-mono text-[10px]">
                      {#if v.inPits}
                        {@const curTime = pitRec?.currentDuration ?? 0}
                        <span class="inline-flex items-center gap-0.5 animate-pulse rounded bg-red-600/90 px-1.5 py-0.5 font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                          🛑 BOX {curTime > 0 ? `${curTime.toFixed(1)}s` : ""}
                        </span>
                      {:else if (pitRec?.lastPitDuration ?? 0) > 0}
                        <span class="text-white/90 font-bold">
                          {v.numPitstops}P <span class="text-accent">({pitRec!.lastPitDuration.toFixed(1)}s)</span>
                        </span>
                      {:else}
                        <span class="text-white/60">
                          {v.numPitstops ?? 0} ({v.tyreLaps ?? 0}L)
                        </span>
                      {/if}
                    </div>
                  {/if}

                  <!-- Lap -->
                  {#if pitwallConfig.columns.lap}
                    <div class="w-10 text-center font-mono text-white/80">
                      L{v.totalLaps}
                    </div>
                  {/if}

                  <!-- Gap -->
                  {#if pitwallConfig.columns.gap}
                    <div class="w-14 text-right font-mono text-white/90">
                      {idx === 0 ? "Líder" : `+${v.timeBehindLeader.toFixed(2)}`}
                    </div>
                  {/if}

                  <!-- Interval -->
                  {#if pitwallConfig.columns.interval}
                    <div class="w-14 text-right font-mono text-white/70">
                      {idx === 0 ? "–" : `+${gapInt.toFixed(2)}`}
                    </div>
                  {/if}

                  <!-- Best Lap -->
                  {#if pitwallConfig.columns.bestLap}
                    <div
                      class={[
                        "w-18 text-center font-mono font-bold",
                        isClassBest ? "text-[#ff00ff]" : v.bestLap > 0 ? "text-[#00ff66]" : "text-white/40",
                      ]}
                    >
                      {lapTime(v.bestLap)}
                    </div>
                  {/if}

                  <!-- Last Lap -->
                  {#if pitwallConfig.columns.lastLap}
                    <div class="w-18 text-center font-mono font-bold text-white/90">
                      {lapTime(v.lastLap)}
                    </div>
                  {/if}

                  <!-- Sectores S1, S2, S3 -->
                  {#if pitwallConfig.columns.sectors}
                    <div class="w-14 text-right font-mono text-[10px] text-white/70">
                      {v.lastS1 > 0 ? v.lastS1.toFixed(3) : "–"}
                    </div>
                    <div class="w-14 text-right font-mono text-[10px] text-white/70">
                      {v.lastS2 > 0 ? v.lastS2.toFixed(3) : "–"}
                    </div>
                    <div class="w-14 text-right font-mono text-[10px] text-white/70">
                      {v.lastLap > 0 && v.lastS1 > 0 && v.lastS2 > 0 ? Math.max(0, v.lastLap - v.lastS1 - v.lastS2).toFixed(3) : "–"}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- TRACK RELATIVE BAR -->
        {#if pitwallConfig.modules.relativeBar}
          <div class={`flex h-11 shrink-0 items-center justify-between rounded-lg border ${themeStyles.card} px-3 font-mono text-xs shadow`}>
            <!-- Behind Car -->
            <div class="flex items-center gap-2">
              {#if relativeRivals.behind}
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-black text-white uppercase"
                  style:background={classColor(relativeRivals.behind.class)}
                >
                  {(relativeRivals.behind.class || "LMU").slice(0, 3)}
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
                  {(relativeRivals.ahead.class || "LMU").slice(0, 3)}
                </span>
              {:else}
                <span class="text-white/40">– Líder absoluto</span>
              {/if}
            </div>
          </div>
        {/if}

        <!-- BOTTOM TELEMETRY ROW (4 TILES: LAP TIMES, SECTORS, ELECTRONICS, FUEL & LIFT/COAST) -->
        {#if pitwallConfig.modules.bottomTelemetry}
          <div class="grid h-36 shrink-0 grid-cols-4 gap-2">
            <!-- Box 1: LAP TIMES -->
            <div class={`flex flex-col justify-between rounded-lg border ${themeStyles.card} p-2.5`}>
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
            <div class={`flex flex-col justify-between rounded-lg border ${themeStyles.card} p-2.5`}>
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
            <div class={`flex flex-col justify-between rounded-lg border ${themeStyles.card} p-2.5`}>
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
            <div class={`flex flex-col justify-between rounded-lg border ${themeStyles.card} p-2.5`}>
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">FUEL & STRATEGY</span>
              <div class="grid grid-cols-5 gap-1 text-center font-mono">
                <div>
                  <div class="text-sm font-black text-[#ff3b30]">{fuel(currentFuel, effectiveUnits).toFixed(1)}</div>
                  <div class="text-[7px] text-white/50 uppercase">{fuelUnit(effectiveUnits)}</div>
                </div>
                <div>
                  <div class="text-sm font-black text-white">{avgFuelPerLap > 0 ? fuel(avgFuelPerLap, effectiveUnits).toFixed(2) : "–"}</div>
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
           COLUMNA DERECHA: TRACK MAP, TELEMETRÍA, NEUMÁTICOS, HISTORIAL Y DAÑOS (5/12 cols)
           ========================================== -->
      <div class="col-span-12 flex h-full min-h-0 flex-col gap-2 overflow-y-auto lg:col-span-5 xl:col-span-4">
        <!-- TRACK MAP & WEATHER -->
        {#if pitwallConfig.modules.trackmap || pitwallConfig.modules.weather}
          <div class={`flex flex-col rounded-lg border ${themeStyles.card} p-3 shadow`}>
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
              <div>
                <div class="font-display text-sm font-black text-white">{s?.track || "Circuito"}</div>
                <div class="text-[10px] text-white/50">TRACK MAP & METEO</div>
              </div>
              <div class="font-mono text-sm font-bold text-accent">
                {s?.timeOfDay ? (typeof s.timeOfDay === "number" ? clock(s.timeOfDay) : String(s.timeOfDay).slice(0, 5)) : "12:00"}
              </div>
            </div>

            <div class="grid grid-cols-2 items-center gap-3">
              <!-- Live Map from Overlay -->
              <div class="flex justify-center">
                {#if pitwallConfig.modules.trackmap}
                  <TrackMap opts={{ size: 210, classColors: true, showNumbers: true }} units={effectiveUnits} edit={false} />
                {/if}
              </div>

              <!-- Weather & Compass Details -->
              {#if pitwallConfig.modules.weather}
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
                        {Math.round(temp(weather?.trackTemp ?? 25, effectiveUnits))}° / {Math.round(temp(weather?.ambientTemp ?? 22, effectiveUnits))}°
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

        <!-- TELEMETRY PEDALS, SPEED & RPM CON MINI GRÁFICAS SPARKLINE -->
        {#if pitwallConfig.modules.telemetryPedals}
          <div class={`grid grid-cols-3 gap-2 rounded-lg border ${themeStyles.card} p-3 shadow`}>
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

            <!-- Speed & Sparkline -->
            <div class="flex flex-col items-center justify-between rounded bg-black/40 p-2">
              <span class="text-[9px] font-bold text-white/40 uppercase">VELOCIDAD</span>
              <div class="flex flex-col items-center">
                <span class="font-mono text-2xl font-black text-white">{Math.round(speed(p?.speed ?? 0, effectiveUnits))}</span>
                <span class="text-[8px] font-semibold text-white/60">{speedUnit(effectiveUnits).toUpperCase()}</span>
              </div>
              <svg class="h-6 w-full overflow-hidden" viewBox="0 0 100 24">
                <path d={createSparkline(historySpeed, 100, 24)} fill="none" stroke="#00ff66" stroke-width="1.5" />
              </svg>
            </div>

            <!-- Gear, RPM & Sparkline -->
            <div class="flex flex-col items-center justify-between rounded bg-black/40 p-2">
              <span class="text-[9px] font-bold text-white/40 uppercase">MARCHA / RPM</span>
              <div class="flex flex-col items-center">
                <span class="font-mono text-2xl font-black text-accent">{p?.gear === 0 ? "N" : p?.gear === -1 ? "R" : p?.gear ?? "–"}</span>
                <span class="font-mono text-[9px] text-white/70">{Math.round(p?.engineRpm ?? 0)} RPM</span>
              </div>
              <svg class="h-6 w-full overflow-hidden" viewBox="0 0 100 24">
                <path d={createSparkline(historyRpm, 100, 24)} fill="none" stroke="#ffcc00" stroke-width="1.5" />
              </svg>
            </div>
          </div>
        {/if}

        <!-- TIRES & BRAKES (4 ESQUINAS CON TEMPERATURAS INNER/MID/OUTER LOVELY STYLE) -->
        {#if pitwallConfig.modules.tyres}
          <div class={`flex flex-col rounded-lg border ${themeStyles.card} p-3 shadow`}>
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="text-[10px] font-black text-white/50 uppercase">TIRES & BRAKES (4 ESQUINAS)</span>
              <span class="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white">
                {p?.frontCompound || "DRY 3"}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs font-mono">
              <!-- FL -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>FL</span>
                  <span>{Math.round((p?.wheels?.[0]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">
                  {pressure(p?.wheels?.[0]?.pressure ?? 190, effectiveUnits).toFixed(1)}
                  <span class="text-[9px] font-normal text-white/40">{pressureUnit(effectiveUnits)}</span>
                </div>
                <div class="flex justify-between text-[9px] text-cyan-400">
                  <span>{Math.round(temp(p?.wheels?.[0]?.innerTemp?.[0] ?? 89, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[0]?.innerTemp?.[1] ?? 87, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[0]?.innerTemp?.[2] ?? 85, effectiveUnits))}°</span>
                </div>
                <div class="mt-0.5 text-right text-[9px] text-orange-400">
                  {Math.round(temp(p?.wheels?.[0]?.brakeTemp ?? 450, effectiveUnits))}° Disco
                </div>
              </div>

              <!-- FR -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>FR</span>
                  <span>{Math.round((p?.wheels?.[1]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">
                  {pressure(p?.wheels?.[1]?.pressure ?? 190, effectiveUnits).toFixed(1)}
                  <span class="text-[9px] font-normal text-white/40">{pressureUnit(effectiveUnits)}</span>
                </div>
                <div class="flex justify-between text-[9px] text-cyan-400">
                  <span>{Math.round(temp(p?.wheels?.[1]?.innerTemp?.[0] ?? 89, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[1]?.innerTemp?.[1] ?? 87, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[1]?.innerTemp?.[2] ?? 85, effectiveUnits))}°</span>
                </div>
                <div class="mt-0.5 text-right text-[9px] text-orange-400">
                  {Math.round(temp(p?.wheels?.[1]?.brakeTemp ?? 450, effectiveUnits))}° Disco
                </div>
              </div>

              <!-- RL -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>RL</span>
                  <span>{Math.round((p?.wheels?.[2]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">
                  {pressure(p?.wheels?.[2]?.pressure ?? 190, effectiveUnits).toFixed(1)}
                  <span class="text-[9px] font-normal text-white/40">{pressureUnit(effectiveUnits)}</span>
                </div>
                <div class="flex justify-between text-[9px] text-cyan-400">
                  <span>{Math.round(temp(p?.wheels?.[2]?.innerTemp?.[0] ?? 87, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[2]?.innerTemp?.[1] ?? 86, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[2]?.innerTemp?.[2] ?? 84, effectiveUnits))}°</span>
                </div>
                <div class="mt-0.5 text-right text-[9px] text-orange-400">
                  {Math.round(temp(p?.wheels?.[2]?.brakeTemp ?? 420, effectiveUnits))}° Disco
                </div>
              </div>

              <!-- RR -->
              <div class="rounded border border-white/10 bg-black/40 p-2">
                <div class="flex justify-between text-[10px] text-white/50">
                  <span>RR</span>
                  <span>{Math.round((p?.wheels?.[3]?.wear ?? 1) * 100)}%</span>
                </div>
                <div class="text-lg font-black text-white">
                  {pressure(p?.wheels?.[3]?.pressure ?? 190, effectiveUnits).toFixed(1)}
                  <span class="text-[9px] font-normal text-white/40">{pressureUnit(effectiveUnits)}</span>
                </div>
                <div class="flex justify-between text-[9px] text-cyan-400">
                  <span>{Math.round(temp(p?.wheels?.[3]?.innerTemp?.[0] ?? 87, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[3]?.innerTemp?.[1] ?? 86, effectiveUnits))}°</span>
                  <span>{Math.round(temp(p?.wheels?.[3]?.innerTemp?.[2] ?? 84, effectiveUnits))}°</span>
                </div>
                <div class="mt-0.5 text-right text-[9px] text-orange-400">
                  {Math.round(temp(p?.wheels?.[3]?.brakeTemp ?? 420, effectiveUnits))}° Disco
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- TYRE HISTORY PRESSURE (LINE GRAPH LOVELY STYLE) -->
        {#if pitwallConfig.modules.tyreHistory}
          <div class={`flex flex-col rounded-lg border ${themeStyles.card} p-3 shadow`}>
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="text-[10px] font-black text-white/50 uppercase">TYRE HISTORY PRESSURE</span>
              <div class="flex items-center gap-2 text-[9px] font-mono font-bold">
                <span class="text-[#ff3b30]">FL {pressure(p?.wheels?.[0]?.pressure ?? 190, effectiveUnits).toFixed(1)}</span>
                <span class="text-[#ff9500]">FR {pressure(p?.wheels?.[1]?.pressure ?? 190, effectiveUnits).toFixed(1)}</span>
                <span class="text-[#007aff]">RL {pressure(p?.wheels?.[2]?.pressure ?? 190, effectiveUnits).toFixed(1)}</span>
                <span class="text-[#af52de]">RR {pressure(p?.wheels?.[3]?.pressure ?? 190, effectiveUnits).toFixed(1)}</span>
              </div>
            </div>

            <div class="relative h-20 w-full overflow-hidden rounded bg-black/40 p-1">
              <svg class="h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                <!-- Grid lines -->
                <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
                <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
                <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />

                <!-- FL Line -->
                <path d={createSparkline(historyTirePressures.fl, 100, 40)} fill="none" stroke="#ff3b30" stroke-width="1.2" />
                <!-- FR Line -->
                <path d={createSparkline(historyTirePressures.fr, 100, 40)} fill="none" stroke="#ff9500" stroke-width="1.2" />
                <!-- RL Line -->
                <path d={createSparkline(historyTirePressures.rl, 100, 40)} fill="none" stroke="#007aff" stroke-width="1.2" />
                <!-- RR Line -->
                <path d={createSparkline(historyTirePressures.rr, 100, 40)} fill="none" stroke="#af52de" stroke-width="1.2" />
              </svg>
            </div>
          </div>
        {/if}

        <!-- CAR DAMAGE DIAGRAM -->
        {#if pitwallConfig.modules.damage}
          <div class={`flex flex-col rounded-lg border ${themeStyles.card} p-3 shadow`}>
            <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="text-[10px] font-black text-white/50 uppercase">DAMAGE STATE</span>
              <span class="text-[10px] font-bold text-[#00ff66]">
                {(p?.damage?.aero ?? 0) === 0 ? "Aero OK" : `Aero -${Math.round((p?.damage?.aero ?? 0) * 100)}%`}
              </span>
            </div>

            <div class="flex items-center justify-around">
              <Damage opts={{ showCar: true }} units={effectiveUnits} edit={false} />
            </div>
          </div>
        {/if}

        <!-- SELECTED RIVAL DETAILED CARD -->
        {#if selectedVehicle}
          <div class="rounded-lg border border-accent/40 bg-accent/10 p-3 shadow">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-[10px] font-black text-accent uppercase">
                PILOTO ENFOCADO EN DIRECTO
              </span>
              <button
                class="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white hover:bg-accent/80 transition"
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
                <div class="text-xs font-bold text-white">P{selectedVehicle.place} ({selectedVehicle.class})</div>
                <div class="text-[10px] text-white/60">
                  {selectedVehicle.numPitstops ?? 0} pits {pitRecords[selectedVehicle.id]?.lastPitDuration ? `(${pitRecords[selectedVehicle.id]!.lastPitDuration.toFixed(1)}s)` : ""}
                </div>
              </div>
            </div>
            {#if me && selectedVehicle.id !== me.id}
              <div class="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-xs">
                <span class="text-white/60">Diferencia contigo:</span>
                <span class="font-mono font-bold text-accent">
                  {(Number(selectedVehicle.timeBehindLeader || 0) - Number(me.timeBehindLeader || 0)).toFixed(2)}s
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
        {#if pitwallConfig.modules.weather}
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
                  {Math.round(temp(weather?.trackTemp ?? 25, effectiveUnits))}° / {Math.round(temp(weather?.ambientTemp ?? 22, effectiveUnits))}°
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

        {#if pitwallConfig.modules.fuelStrategy}
          <div class="hud p-3 text-xs">
            <div class="mb-1 flex items-center justify-between border-b border-white/10 pb-1">
              <span class="hud-title">⛽ COMBUSTIBLE & STRATEGY</span>
              <span class="font-mono font-bold text-good">
                {lapsOfFuel > 0 ? lapsOfFuel.toFixed(1) : "–"} vueltas
              </span>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-center font-mono">
              <div class="rounded bg-black/40 p-1">
                <div class="text-[8px] text-muted">LITROS</div>
                <div class="font-bold text-white">{fuel(currentFuel, effectiveUnits).toFixed(1)}</div>
              </div>
              <div class="rounded bg-black/40 p-1">
                <div class="text-[8px] text-muted">CONSUMO</div>
                <div class="font-bold text-white">{avgFuelPerLap > 0 ? fuel(avgFuelPerLap, effectiveUnits).toFixed(2) : "–"}</div>
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

        {#if pitwallConfig.modules.tyres}
          <Tyres opts={{ showBrakes: true, showWearRate: true, showLapsLeft: true }} units={effectiveUnits} edit={false} />
        {/if}
      </div>

      <!-- Columna Central: Dashboard DDU, Delta y Lap Timing -->
      <div class="flex flex-col items-center gap-2.5 overflow-y-auto">
        <Delta opts={{ reference: "pb", range: 2 }} units={effectiveUnits} edit={false} />
        <Dashboard opts={config.value.widgets.dashboard?.options ?? {}} units={effectiveUnits} edit={false} />
        <LapTiming opts={{ showSectors: true }} units={effectiveUnits} edit={false} />
        <Electronics opts={{}} units={effectiveUnits} edit={false} />
      </div>

      <!-- Columna Derecha: TrackMap y Standings -->
      <div class="flex flex-col gap-2.5 overflow-y-auto">
        {#if pitwallConfig.modules.trackmap}
          <div class="flex justify-center">
            <TrackMap opts={{ size: 230, classColors: true, showNumbers: true }} units={effectiveUnits} edit={false} />
          </div>
        {/if}
        <Standings
          opts={{ ...(config.value.widgets.standings?.options ?? {}), showBranding: true, maxRows: 8, maxRowsOther: 4, showPosGained: true }}
          units={effectiveUnits}
          edit={false}
        />
        <Relative
          opts={{ ...(config.value.widgets.relative?.options ?? {}), ahead: 3, behind: 3, showPaceDiff: true, showEnergy: true }}
          units={effectiveUnits}
          edit={false}
        />
      </div>
    </main>
  {/if}

  <!-- =========================================================================
       MODAL DE PERSONALIZACIÓN COMPLETA DEL PITWALL (OVERLAY BUILDER)
       ========================================================================= -->
  {#if showCustomizeModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/20 bg-[#0d131f] shadow-2xl overflow-hidden">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-white/10 bg-black/40 px-5 py-4">
          <div class="flex items-center gap-2">
            <span class="text-xl">⚙️</span>
            <div>
              <div class="font-display text-base font-black text-white">Personalizar Pit Wall & Overlay</div>
              <div class="text-[11px] text-white/50">Configura módulos, columnas, densidades, temas visuales y unidades</div>
            </div>
          </div>
          <button
            class="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
            onclick={() => {
              saveConfig();
              showCustomizeModal = false;
            }}
          >
            ✕
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex border-b border-white/10 bg-black/20 px-5 text-xs font-bold">
          <button
            class={["border-b-2 px-4 py-2.5 transition", customizeTab === "general" ? "border-accent text-accent" : "border-transparent text-white/60 hover:text-white"]}
            onclick={() => (customizeTab = "general")}
          >
            🎨 Tema & Densidad
          </button>
          <button
            class={["border-b-2 px-4 py-2.5 transition", customizeTab === "columns" ? "border-accent text-accent" : "border-transparent text-white/60 hover:text-white"]}
            onclick={() => (customizeTab = "columns")}
          >
            📋 Columnas Leaderboard
          </button>
          <button
            class={["border-b-2 px-4 py-2.5 transition", customizeTab === "modules" ? "border-accent text-accent" : "border-transparent text-white/60 hover:text-white"]}
            onclick={() => (customizeTab = "modules")}
          >
            🧩 Módulos del Muro
          </button>
          <button
            class={["border-b-2 px-4 py-2.5 transition", customizeTab === "units" ? "border-accent text-accent" : "border-transparent text-white/60 hover:text-white"]}
            onclick={() => (customizeTab = "units")}
          >
            📏 Unidades
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-y-auto p-5 text-xs space-y-4">
          <!-- TAB 1: GENERAL (TEMAS Y DENSIDAD) -->
          {#if customizeTab === "general"}
            <div>
              <span class="block font-bold text-white uppercase tracking-wider text-[11px] mb-2">Tema Visual del Pitwall</span>
              <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.theme === "lovely-dark" ? "border-accent bg-accent/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.theme = "lovely-dark")}
                >
                  <div class="font-bold text-white">Lovely Dark</div>
                  <div class="text-[10px] text-white/50">Estilo oficial Lovely Pitwall (Azul/Cian)</div>
                </button>
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.theme === "f1-carbon" ? "border-red-500 bg-red-500/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.theme = "f1-carbon")}
                >
                  <div class="font-bold text-red-400">F1 Carbon</div>
                  <div class="text-[10px] text-white/50">Fibra de carbono & Acentos Rojos</div>
                </button>
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.theme === "cyber-neon" ? "border-fuchsia-400 bg-fuchsia-500/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.theme = "cyber-neon")}
                >
                  <div class="font-bold text-fuchsia-300">Cyber Neon</div>
                  <div class="text-[10px] text-white/50">Púrpura, magenta & cian brillante</div>
                </button>
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.theme === "stealth-oled" ? "border-white bg-white/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.theme = "stealth-oled")}
                >
                  <div class="font-bold text-white">Stealth OLED</div>
                  <div class="text-[10px] text-white/50">Negro absoluto & alto contraste</div>
                </button>
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.theme === "racing-gold" ? "border-amber-400 bg-amber-500/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.theme = "racing-gold")}
                >
                  <div class="font-bold text-amber-300">Racing Gold</div>
                  <div class="text-[10px] text-white/50">Oro metálico, ámbar & champán</div>
                </button>
              </div>
            </div>

            <div class="border-t border-white/10 pt-4">
              <span class="block font-bold text-white uppercase tracking-wider text-[11px] mb-2">Densidad de Filas del Leaderboard</span>
              <div class="grid grid-cols-3 gap-2.5">
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.density === "compact" ? "border-accent bg-accent/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.density = "compact")}
                >
                  <div class="font-bold text-white">Compacto</div>
                  <div class="text-[10px] text-white/50">25+ coches sin scroll (Ideal monitores 1080p)</div>
                </button>
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.density === "normal" ? "border-accent bg-accent/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.density = "normal")}
                >
                  <div class="font-bold text-white">Normal</div>
                  <div class="text-[10px] text-white/50">Equilibrio estándar de visualización</div>
                </button>
                <button
                  class={["rounded-xl border p-3 text-left transition", pitwallConfig.density === "spacious" ? "border-accent bg-accent/20" : "border-white/10 bg-black/40 hover:bg-white/5"]}
                  onclick={() => (pitwallConfig.density = "spacious")}
                >
                  <div class="font-bold text-white">Espacioso</div>
                  <div class="text-[10px] text-white/50">Filas grandes para pantallas táctiles</div>
                </button>
              </div>
            </div>
          {/if}

          <!-- TAB 2: COLUMNAS DEL LEADERBOARD -->
          {#if customizeTab === "columns"}
            <p class="text-white/60 mb-2">Activa o desactiva qué datos quieres ver en la tabla de clasificación:</p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Ganancia de Posición (DIFF)</div>
                  <div class="text-[10px] text-white/50">▲ / ▼ con respecto a la parrilla de salida</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.diff} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Insignia de Clase (CLASS)</div>
                  <div class="text-[10px] text-white/50">Categoría del coche (HYP, LMP2, GT3)</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.cls} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Información de Boxes & Tiempos (PIT INFO)</div>
                  <div class="text-[10px] text-white/50">Paradas, tiempo de box en directo y última parada</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.pit} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Vuelta Actual (LAP)</div>
                  <div class="text-[10px] text-white/50">Vueltas completadas por cada coche</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.lap} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Diferencia con Líder (GAP)</div>
                  <div class="text-[10px] text-white/50">Tiempo en segundos respecto al 1º</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.gap} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Intervalo Coche Delante (INT)</div>
                  <div class="text-[10px] text-white/50">Tiempo respecto al coche inmediatamente anterior</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.interval} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Mejor Vuelta (BEST LAP)</div>
                  <div class="text-[10px] text-white/50">Con morado para vuelta rápida global</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.bestLap} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Última Vuelta (LAST LAP)</div>
                  <div class="text-[10px] text-white/50">Tiempo registrado en la vuelta anterior</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.lastLap} />
              </label>

              <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                <div>
                  <div class="font-bold text-white">Sectores S1, S2, S3</div>
                  <div class="text-[10px] text-white/50">Tiempos parciales por sector</div>
                </div>
                <input type="checkbox" class="h-4 w-4 accent-accent rounded" bind:checked={pitwallConfig.columns.sectors} />
              </label>
            </div>
          {/if}

          <!-- TAB 3: MÓDULOS DEL MURO -->
          {#if customizeTab === "modules"}
            <p class="text-white/60 mb-2">Enciende o apaga bloques completos para adaptar el Pitwall a cualquier pantalla:</p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {#each Object.keys(pitwallConfig.modules) as modKey}
                {@const k = modKey as keyof typeof pitwallConfig.modules}
                <label class="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-2.5 cursor-pointer hover:bg-white/5">
                  <span class="font-bold text-white capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-accent rounded"
                    bind:checked={pitwallConfig.modules[k]}
                  />
                </label>
              {/each}
            </div>
          {/if}

          <!-- TAB 4: UNIDADES -->
          {#if customizeTab === "units"}
            <div class="space-y-4">
              <div>
                <span class="block font-bold text-white uppercase tracking-wider text-[11px] mb-2">Unidad de Presión de Neumáticos</span>
                <div class="grid grid-cols-3 gap-2.5">
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.pressure === "psi" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.pressure = "psi")}
                  >
                    PSI
                  </button>
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.pressure === "bar" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.pressure = "bar")}
                  >
                    BAR
                  </button>
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.pressure === "kpa" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.pressure = "kpa")}
                  >
                    kPa
                  </button>
                </div>
              </div>

              <div class="border-t border-white/10 pt-4">
                <span class="block font-bold text-white uppercase tracking-wider text-[11px] mb-2">Unidad de Temperatura</span>
                <div class="grid grid-cols-2 gap-2.5">
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.temp === "c" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.temp = "c")}
                  >
                    Celsius (°C)
                  </button>
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.temp === "f" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.temp = "f")}
                  >
                    Fahrenheit (°F)
                  </button>
                </div>
              </div>

              <div class="border-t border-white/10 pt-4">
                <span class="block font-bold text-white uppercase tracking-wider text-[11px] mb-2">Unidad de Velocidad</span>
                <div class="grid grid-cols-2 gap-2.5">
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.speed === "kmh" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.speed = "kmh")}
                  >
                    KM/H
                  </button>
                  <button
                    class={["rounded-xl border p-3 text-center transition", pitwallConfig.units.speed === "mph" ? "border-accent bg-accent/20 text-white font-bold" : "border-white/10 bg-black/40 text-white/60 hover:text-white"]}
                    onclick={() => (pitwallConfig.units.speed = "mph")}
                  >
                    MPH
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-between border-t border-white/10 bg-black/40 px-5 py-3">
          <button
            class="text-xs text-white/50 hover:text-white underline transition"
            onclick={resetConfig}
          >
            Restablecer por defecto
          </button>
          <div class="flex gap-2">
            <button
              class="rounded-lg border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition"
              onclick={() => (showCustomizeModal = false)}
            >
              Cerrar
            </button>
            <button
              class="rounded-lg bg-accent px-5 py-1.5 text-xs font-bold text-white shadow hover:bg-accent/80 transition"
              onclick={() => {
                saveConfig();
                showCustomizeModal = false;
              }}
            >
              Guardar y Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
