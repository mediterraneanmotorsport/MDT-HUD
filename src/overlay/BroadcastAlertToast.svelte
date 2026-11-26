<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { fly } from "svelte/transition";
  import { isNativeTauri } from "../lib/api";
  import { config } from "../lib/config.svelte";
  import { lapTime } from "../lib/format";
  import type { Snapshot } from "../lib/types";

  let { snap, edit }: { snap: Snapshot | null; edit: boolean } = $props();

  interface TvAlert {
    id: number;
    kind: "fastest" | "podium" | "pit" | "fcy";
    kicker: string;
    title: string;
    subtitle: string;
    badge: string;
    accent: string;
  }

  interface CheckeredBanner {
    kicker: string;
    title: string;
    subtitle: string;
    badge: string;
    accent: string;
  }

  interface PitStopLiveState {
    active: boolean;
    released: boolean;
    elapsedSec: number;
    fuelPct: number;
    fuelLiters: number;
    vePct: number;
    showVe: boolean;
    tyres: { label: string; wearPct: number; fresh: boolean }[];
  }

  interface StartLightsState {
    total: number;
    lit: number;
    lightsOut: boolean;
  }

  interface PenaltyAlertState {
    title: string;
    detail: string;
    badge: string;
  }

  let current = $state<TvAlert | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  // #4 Checkered Flag / Victory / Podium top banner state
  let checkered = $state<CheckeredBanner | null>(null);
  let checkeredTimer: ReturnType<typeof setTimeout> | null = null;
  let checkeredShownForSession = false;

  // #1 Start Lights TV Gantry state
  let startLights = $state<StartLightsState | null>(null);
  let startLightsTimer: ReturnType<typeof setTimeout> | null = null;
  let startLightsTestInterval: ReturnType<typeof setInterval> | null = null;
  let prevStartLight = 0;

  // #7 Penalty Alert state
  let penaltyTest = $state<PenaltyAlertState | null>(null);
  let penaltyTestTimer: ReturnType<typeof setTimeout> | null = null;
  const activePenalty = $derived.by<PenaltyAlertState | null>(() => {
    if (!(config.value.general.animations?.penaltyAlertAnim ?? true)) return null;
    if (penaltyTest) return penaltyTest;
    const list = snap?.player?.penalties;
    if (!list || list.length === 0) return null;
    const pen = list[0];
    const title =
      pen.kind === "stopGo"
        ? `STOP & GO${pen.seconds > 0 ? ` · ${Math.round(pen.seconds)}s` : ""}`
        : pen.kind === "driveThrough"
          ? "DRIVE-THROUGH"
          : "SANCIÓN ACTIVA";
    return {
      title,
      detail: pen.reason || "CUMPLIR EN BOXES ANTES DE 3 VUELTAS",
      badge: list.length > 1 ? `×${list.length}` : "PEN",
    };
  });

  // #8 Live Pit Stop overlay state
  let pitLive = $state<PitStopLiveState | null>(null);
  let pitBoxStartMs = 0;
  let pitPrevWear: number[] = [1, 1, 1, 1];
  let pitFreshFlags: boolean[] = [false, false, false, false];
  let pitReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  let pitTestInterval: ReturnType<typeof setInterval> | null = null;
  let pitTestActive = false;

  // Tracking previous telemetry state to fire TV lower-thirds cleanly without spamming
  let lastSessionBest = 0;
  let lastPlace: number | null = null;
  let lastInPits: boolean | null = null;
  let lastFcy = false;
  let sessionKey = "";

  function showAlert(alert: Omit<TvAlert, "id">, durationMs = 5200) {
    if (!(config.value.general.broadcastAlerts ?? true)) return;
    if (hideTimer) clearTimeout(hideTimer);
    current = { ...alert, id: ++seq };
    hideTimer = setTimeout(() => {
      current = null;
      hideTimer = null;
    }, durationMs);
  }

  function showCheckeredBanner(banner: CheckeredBanner, durationMs = 7600) {
    if (!(config.value.general.animations?.checkeredBanner ?? true)) return;
    if (checkeredTimer) clearTimeout(checkeredTimer);
    checkered = banner;
    checkeredTimer = setTimeout(() => {
      checkered = null;
      checkeredTimer = null;
    }, durationMs);
  }

  function runPitStopTest() {
    if (!(config.value.general.animations?.pitStopLiveAnim ?? true)) return;
    if (pitTestInterval) clearInterval(pitTestInterval);
    if (pitReleaseTimer) clearTimeout(pitReleaseTimer);
    pitTestActive = true;
    let step = 0;
    pitLive = {
      active: true,
      released: false,
      elapsedSec: 0,
      fuelPct: 18,
      fuelLiters: 14.4,
      vePct: 15,
      showVe: true,
      tyres: [
        { label: "FL", wearPct: 38, fresh: false },
        { label: "FR", wearPct: 41, fresh: false },
        { label: "RL", wearPct: 44, fresh: false },
        { label: "RR", wearPct: 42, fresh: false },
      ],
    };
    pitTestInterval = setInterval(() => {
      step++;
      const sec = step * 0.1;
      const frac = Math.min(1, sec / 4.2);
      const t0 = sec >= 1.2;
      const t1 = sec >= 2.0;
      const t2 = sec >= 2.8;
      const t3 = sec >= 3.5;
      pitLive = {
        active: true,
        released: sec >= 4.4,
        elapsedSec: Math.min(4.4, sec),
        fuelPct: Math.round(18 + frac * 82),
        fuelLiters: Math.round((14.4 + frac * 65.6) * 10) / 10,
        vePct: Math.round(15 + frac * 85),
        showVe: true,
        tyres: [
          { label: "FL", wearPct: t0 ? 100 : 38, fresh: t0 },
          { label: "FR", wearPct: t1 ? 100 : 41, fresh: t1 },
          { label: "RL", wearPct: t2 ? 100 : 44, fresh: t2 },
          { label: "RR", wearPct: t3 ? 100 : 42, fresh: t3 },
        ],
      };
      if (sec >= 5.8) {
        if (pitTestInterval) clearInterval(pitTestInterval);
        pitTestInterval = null;
        pitTestActive = false;
        pitLive = null;
      }
    }, 100);
  }

  function runStartLightsTest() {
    if (!(config.value.general.animations?.startLightsAnim ?? true)) return;
    if (startLightsTestInterval) clearInterval(startLightsTestInterval);
    if (startLightsTimer) clearTimeout(startLightsTimer);
    let step = 1;
    startLights = { total: 5, lit: 1, lightsOut: false };
    startLightsTestInterval = setInterval(() => {
      step++;
      if (step <= 5) {
        startLights = { total: 5, lit: step, lightsOut: false };
      } else {
        if (startLightsTestInterval) clearInterval(startLightsTestInterval);
        startLightsTestInterval = null;
        startLights = { total: 5, lit: 0, lightsOut: true };
        startLightsTimer = setTimeout(() => {
          startLights = null;
          startLightsTimer = null;
        }, 1700);
      }
    }, 850);
  }

  function runPenaltyTest() {
    if (!(config.value.general.animations?.penaltyAlertAnim ?? true)) return;
    if (penaltyTestTimer) clearTimeout(penaltyTestTimer);
    penaltyTest = {
      title: "DRIVE-THROUGH",
      detail: "LÍMITES DE PISTA EXCEDIDOS · CUMPLIR EN BOXES",
      badge: "PEN",
    };
    penaltyTestTimer = setTimeout(() => {
      penaltyTest = null;
      penaltyTestTimer = null;
    }, 5200);
  }

  let unlistenTest: (() => void) | null = null;
  let unlistenCheckered: (() => void) | null = null;
  let unlistenPit: (() => void) | null = null;
  let unlistenLights: (() => void) | null = null;
  let unlistenPenalty: (() => void) | null = null;
  onMount(() => {
    if (isNativeTauri()) {
      void listen("test-broadcast-alert", () => {
        showAlert({
          kind: "fastest",
          kicker: "VUELTA RÁPIDA DE SESIÓN · HYPERCAR",
          title: "#1 · MEDITERRANEAN MOTORSPORT",
          subtitle: "NUEVO RÉCORD ABSOLUTO EN PISTA",
          badge: "1:36.428",
          accent: "#a855f7",
        });
      }).then((fn) => (unlistenTest = fn));

      void listen("test-checkered-banner", () => {
        showCheckeredBanner({
          kicker: "BANDERA A CUADROS · VICTORIA EN CATEGORÍA",
          title: "#1 · MEDITERRANEAN MOTORSPORT",
          subtitle: "FIN DE CARRERA · P1 GENERAL · ¡ENHORABUENA EQUIPO!",
          badge: "🏆 P1",
          accent: "#f59e0b",
        });
      }).then((fn) => (unlistenCheckered = fn));

      void listen("test-pitstop-anim", () => {
        runPitStopTest();
      }).then((fn) => (unlistenPit = fn));

      void listen("test-start-lights", () => {
        runStartLightsTest();
      }).then((fn) => (unlistenLights = fn));

      void listen("test-penalty-alert", () => {
        runPenaltyTest();
      }).then((fn) => (unlistenPenalty = fn));
    }
  });

  onDestroy(() => {
    unlistenTest?.();
    unlistenCheckered?.();
    unlistenPit?.();
    unlistenLights?.();
    unlistenPenalty?.();
    if (hideTimer) clearTimeout(hideTimer);
    if (checkeredTimer) clearTimeout(checkeredTimer);
    if (pitReleaseTimer) clearTimeout(pitReleaseTimer);
    if (pitTestInterval) clearInterval(pitTestInterval);
    if (startLightsTimer) clearTimeout(startLightsTimer);
    if (startLightsTestInterval) clearInterval(startLightsTestInterval);
    if (penaltyTestTimer) clearTimeout(penaltyTestTimer);
  });

  $effect(() => {
    if (edit || !snap?.player || !snap.connected || !snap.inRealtime) return;

    const p = snap.player;
    const s = snap.session;
    const me = snap.vehicles.find((v) => v.isPlayer);
    const key = `${snap.source}|${s.track}|${s.code}`;
    if (key !== sessionKey) {
      sessionKey = key;
      lastSessionBest = snap.timing.sessionBest || 0;
      lastPlace = me?.classPlace || me?.place || null;
      lastInPits = p.inPits;
      lastFcy = s.phase === 6 || s.yellowFlagState > 0;
      checkeredShownForSession = false;
      pitBoxStartMs = 0;
      return;
    }

    const drv = (me?.driver || config.value.broadcast?.driverName || "PILOTO").toUpperCase();
    const num = me?.number ? `#${me.number}` : "";
    const cls = (me?.class || p.vehicleClass || "").toUpperCase();
    const curPos = me?.classPlace && me.classPlace > 0 ? me.classPlace : (me?.place ?? 0);

    // #1 Start Lights TV Gantry (rF2/LMU startLight countdown)
    if ((config.value.general.animations?.startLightsAnim ?? true) && !startLightsTestInterval) {
      const total = Math.max(5, Math.min(6, s.numRedLights || 5));
      const sl = s.startLight || 0;
      if (sl >= 1 && sl <= total) {
        if (startLightsTimer) {
          clearTimeout(startLightsTimer);
          startLightsTimer = null;
        }
        startLights = { total, lit: sl, lightsOut: false };
      } else if (prevStartLight >= 1 && prevStartLight <= total && (sl === 0 || sl > total)) {
        startLights = { total, lit: 0, lightsOut: true };
        if (startLightsTimer) clearTimeout(startLightsTimer);
        startLightsTimer = setTimeout(() => {
          startLights = null;
          startLightsTimer = null;
        }, 1700);
      }
      prevStartLight = sl;
    }

    // #4 Cinematic Checkered Flag / Victory / Podium Top Banner
    if ((config.value.general.animations?.checkeredBanner ?? true) && !checkeredShownForSession) {
      const finished = me?.finishStatus === 1 || s.phase === 8;
      if (finished && p.lapNumber >= 1) {
        checkeredShownForSession = true;
        const isWin = curPos === 1;
        const isPod = curPos > 1 && curPos <= 3;
        showCheckeredBanner({
          kicker: isWin
            ? `BANDERA A CUADROS · VICTORIA ${cls}`
            : isPod
              ? `BANDERA A CUADROS · PODIO ${cls}`
              : `BANDERA A CUADROS · FIN DE SESIÓN`,
          title: `${num} ${drv}`.trim(),
          subtitle: isWin
            ? "CAMPEÓN DE CARRERA · ¡TRABAJO IMPECABLE!"
            : isPod
              ? `POSICIÓN P${curPos} EN CATEGORÍA · ¡GRAN PODIO!`
              : `CARRERA COMPLETADA · POSICIÓN FINAL P${curPos || "–"}`,
          badge: isWin ? "🏆 P1" : isPod ? `🥈 P${curPos}` : `🏁 P${curPos || "–"}`,
          accent: isWin ? "#f59e0b" : isPod ? "#10b981" : "#e5e7eb",
        });
      }
    }

    // #8 Live Pit Stop Animation when stationary in pit box
    if ((config.value.general.animations?.pitStopLiveAnim ?? true) && !pitTestActive) {
      const stationaryInBox = p.inPits && p.speed < 2.2;
      const wheels = (p as any).wheels as { wear?: number }[] | undefined;
      const labels = ["FL", "FR", "RL", "RR"];
      const wears = labels.map((_, idx) => Math.max(0, Math.min(1, wheels?.[idx]?.wear ?? 1)));
      if (stationaryInBox) {
        if (pitReleaseTimer) {
          clearTimeout(pitReleaseTimer);
          pitReleaseTimer = null;
        }
        if (pitBoxStartMs === 0) {
          pitBoxStartMs = Date.now();
          pitPrevWear = [...wears];
          pitFreshFlags = [false, false, false, false];
        } else {
          for (let i = 0; i < 4; i++) {
            if (wears[i] > pitPrevWear[i] + 0.08) pitFreshFlags[i] = true;
            pitPrevWear[i] = wears[i];
          }
        }
        const fuelCap = p.fuelCapacity > 0 ? p.fuelCapacity : 100;
        pitLive = {
          active: true,
          released: false,
          elapsedSec: (Date.now() - pitBoxStartMs) / 1000,
          fuelPct: Math.min(100, Math.round((p.fuel / fuelCap) * 100)),
          fuelLiters: Math.round(p.fuel * 10) / 10,
          vePct: Math.min(100, Math.round((p.virtualEnergy ?? 0) * 100)),
          showVe: (p.virtualEnergy ?? 0) > 0.001,
          tyres: labels.map((label, i) => ({
            label,
            wearPct: Math.round(wears[i] * 100),
            fresh: pitFreshFlags[i],
          })),
        };
      } else if (pitBoxStartMs > 0) {
        const finalSec = (Date.now() - pitBoxStartMs) / 1000;
        pitBoxStartMs = 0;
        if (pitLive && finalSec >= 1.2) {
          pitLive = { ...pitLive, released: true, elapsedSec: finalSec };
          if (pitReleaseTimer) clearTimeout(pitReleaseTimer);
          pitReleaseTimer = setTimeout(() => {
            pitLive = null;
            pitReleaseTimer = null;
          }, 1900);
        } else {
          pitLive = null;
        }
      }
    }

    if (!(config.value.general.broadcastAlerts ?? true)) return;

    // 1. New personal / session fastest lap!
    const sb = snap.timing.sessionBest;
    if (sb > 10 && lastSessionBest > 10 && sb < lastSessionBest - 0.005) {
      const rivalBest = snap.vehicles
        .filter((v) => !v.isPlayer && v.bestLap > 10 && (!me?.class || v.class === me.class))
        .reduce((best, v) => Math.min(best, v.bestLap), Infinity);
      const isPurple = sb < rivalBest;
      showAlert({
        kind: "fastest",
        kicker: isPurple ? `VUELTA RÁPIDA DE SESIÓN · ${cls}` : `MEJOR VUELTA PERSONAL · ${cls}`,
        title: `${num} ${drv}`.trim(),
        subtitle: isPurple ? "RÉCORD ABSOLUTO DE CATEGORÍA" : "NUEVA MARCA PERSONAL",
        badge: lapTime(sb),
        accent: isPurple ? "#a855f7" : "#10b981",
      });
    }
    if (sb > 10) lastSessionBest = sb;

    // 2. Overtake into Podium (P1 / P2 / P3) in Race
    if (s.kind === "race" && p.lapNumber >= 1 && !p.inPits && lastPlace != null && curPos > 0 && curPos <= 3 && curPos < lastPlace) {
      showAlert({
        kind: "podium",
        kicker: curPos === 1 ? `NUEVO LÍDER DE CARRERA · ${cls}` : `ENTRA EN POSICIÓN DE PODIO · ${cls}`,
        title: `${num} ${drv}`.trim(),
        subtitle: curPos === 1 ? "ASALTO AL LIDERATO EN PISTA" : `ADELANTAMIENTO HACIA P${curPos}`,
        badge: `P${curPos}`,
        accent: "#f59e0b",
      });
    }
    if (curPos > 0) lastPlace = curPos;

    // 3. Pit Entry TV Lower Third
    if (lastInPits === false && p.inPits && p.lapNumber >= 1) {
      showAlert({
        kind: "pit",
        kicker: `PIT STOP EN CURSO · ${cls}`,
        title: `${num} ${drv}`.trim(),
        subtitle: "ENTRADA A CALLE DE BOXES · SERVICIO DE EQUIPO",
        badge: "BOX",
        accent: "#06b6d4",
      });
    }
    lastInPits = p.inPits;

    // 4. Full Course Yellow TV Banner
    const isFcy = s.phase === 6 || s.yellowFlagState > 0;
    if (isFcy && !lastFcy) {
      showAlert({
        kind: "fcy",
        kicker: "DIRECCIÓN DE CARRERA · SEGURIDAD",
        title: "FULL COURSE YELLOW",
        subtitle: "VELOCIDAD LIMITADA A 80 KM/H · PROHIBIDO ADELANTAR",
        badge: "FCY",
        accent: "#eab308",
      });
    }
    lastFcy = isFcy;
  });
</script>

{#if startLights}
  <div class="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
    <div
      transition:fly={{ y: -36, duration: 240 }}
      class={[
        "flex flex-col items-center gap-2 rounded-2xl border px-5 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.92)] backdrop-blur-md transition-colors duration-150",
        startLights.lightsOut
          ? "border-emerald-400/90 bg-[#051a10]/95 shadow-[0_0_38px_rgba(16,185,129,0.55)]"
          : "border-white/20 bg-[#0a0c10]/95",
      ]}
    >
      <div class="flex items-center gap-3">
        {#each { length: startLights.total } as _, idx}
          {@const isOn = !startLights.lightsOut && idx < startLights.lit}
          <div class="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-black/80 p-1.5">
            {#each [0, 1] as _row}
              <div
                class={[
                  "h-5 w-5 rounded-full transition-all duration-100",
                  startLights.lightsOut
                    ? "bg-emerald-400 shadow-[0_0_18px_#34d399]"
                    : isOn
                      ? "bg-red-500 shadow-[0_0_22px_#ef4444,inset_0_0_8px_#fecaca]"
                      : "bg-neutral-800/90",
                ]}
              ></div>
            {/each}
          </div>
        {/each}
      </div>
      <span
        class={[
          "font-display text-xs font-black tracking-[0.25em] uppercase",
          startLights.lightsOut ? "text-emerald-300" : "text-red-400",
        ]}
      >
        {startLights.lightsOut ? "🟢 ¡SALIDA! LIGHTS OUT!" : `SEMÁFORO DE SALIDA · ${startLights.lit}/${startLights.total}`}
      </span>
    </div>
  </div>
{/if}

{#if activePenalty}
  <div class="pointer-events-none fixed top-6 right-6 z-40">
    <div
      transition:fly={{ x: 36, duration: 280 }}
      class="flex items-center gap-3 rounded-xl border-2 border-red-500/85 bg-[#1a0507]/95 px-4 py-2.5 shadow-[0_0_30px_rgba(239,68,68,0.55)] backdrop-blur-md animate-pulse"
    >
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 font-mono text-xs font-black text-white shadow-[0_0_14px_#ef4444]">
        {activePenalty.badge}
      </div>
      <div class="flex flex-col">
        <span class="font-mono text-[9px] font-black tracking-[0.18em] text-amber-300 uppercase">
          ⚠️ DIRECCIÓN DE CARRERA
        </span>
        <span class="font-display text-base font-black tracking-wide text-white uppercase leading-tight">
          {activePenalty.title}
        </span>
        <span class="text-[10px] font-bold text-red-200/90 uppercase">
          {activePenalty.detail}
        </span>
      </div>
    </div>
  </div>
{/if}

{#if checkered}
  <div class="pointer-events-none fixed inset-x-0 top-7 z-40 flex justify-center px-4">
    <div
      transition:fly={{ y: -42, duration: 380 }}
      class="mdt-shimmer-overlay relative min-w-[440px] max-w-[640px] overflow-hidden rounded-xl border bg-[#050912]/95 shadow-[0_18px_52px_rgba(0,0,0,0.9)] backdrop-blur-md"
      style:border-color="{checkered.accent}99"
      style:box-shadow="0 0 36px {checkered.accent}55, 0 18px 48px rgba(0,0,0,0.9)"
    >
      <div class="mdt-checkered-strip h-2 w-full"></div>
      <div class="flex items-center justify-between gap-5 px-5 py-3.5">
        <div class="flex min-w-0 flex-col">
          <span class="font-mono text-[10px] font-black tracking-[0.2em] uppercase" style:color={checkered.accent}>
            {checkered.kicker}
          </span>
          <span class="truncate font-display text-2xl font-black tracking-wider text-white uppercase leading-tight">
            {checkered.title}
          </span>
          <span class="truncate text-[11px] font-bold tracking-wider text-white/80 uppercase">
            {checkered.subtitle}
          </span>
        </div>
        <div
          class="shrink-0 rounded-xl border px-4 py-2 font-display text-2xl font-black tracking-wider text-white shadow-inner"
          style:background="{checkered.accent}28"
          style:border-color="{checkered.accent}99"
        >
          {checkered.badge}
        </div>
      </div>
      <div class="mdt-checkered-strip h-2 w-full"></div>
    </div>
  </div>
{/if}

{#if pitLive}
  <div class="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
    <div
      transition:fly={{ y: 28, duration: 260 }}
      class={[
        "relative min-w-[390px] max-w-[490px] overflow-hidden rounded-xl border px-4 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.88)] backdrop-blur-md transition-colors duration-200",
        pitLive.released
          ? "border-emerald-400/90 bg-[#051a11]/95 shadow-[0_0_32px_rgba(16,185,129,0.5)]"
          : "border-cyan-400/75 bg-[#050d1a]/95 shadow-[0_0_28px_rgba(6,182,212,0.35)]",
      ]}
    >
      <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
        <div class="flex items-center gap-2">
          <span
            class={[
              "h-2.5 w-2.5 rounded-full",
              pitLive.released ? "bg-emerald-400 animate-ping" : "bg-cyan-400 animate-pulse",
            ]}
          ></span>
          <span
            class={[
              "font-display text-sm font-black tracking-[0.14em] uppercase",
              pitLive.released ? "text-emerald-300" : "text-cyan-300",
            ]}
          >
            {pitLive.released ? "🟢 ¡SALIDA! GO! GO! GO!" : "🔧 PIT STOP EN CURSO · BOX"}
          </span>
        </div>
        <span class="font-mono text-xl font-black tracking-wider text-white tnum">
          {pitLive.elapsedSec.toFixed(1)}s
        </span>
      </div>

      <div class="mt-2.5 grid grid-cols-2 gap-3">
        <!-- 4 Tyres Live Refresh Grid -->
        <div class="grid grid-cols-2 gap-1.5">
          {#each pitLive.tyres as t (t.label)}
            <div
              class={[
                "flex items-center justify-between rounded-md border px-2 py-1 font-mono text-[11px] font-bold transition-colors",
                t.fresh
                  ? "mdt-pit-tyre-fresh border-emerald-400/80 bg-emerald-500/20 text-emerald-200"
                  : "border-white/15 bg-white/5 text-white/80",
              ]}
            >
              <span>{t.label}</span>
              <span>{t.wearPct}%</span>
            </div>
          {/each}
        </div>

        <!-- Fuel & Virtual Energy Refill Bars -->
        <div class="flex flex-col justify-center gap-2">
          <div>
            <div class="flex justify-between font-mono text-[10px] font-bold text-amber-300">
              <span>⛽ COMBUSTIBLE</span>
              <span>{pitLive.fuelLiters.toFixed(1)}L ({pitLive.fuelPct}%)</span>
            </div>
            <div class="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                class="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-150"
                style:width="{pitLive.fuelPct}%"
              ></div>
            </div>
          </div>
          {#if pitLive.showVe}
            <div>
              <div class="flex justify-between font-mono text-[10px] font-bold text-cyan-300">
                <span>⚡ ENERGÍA VIRTUAL</span>
                <span>{pitLive.vePct}%</span>
              </div>
              <div class="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-300 transition-[width] duration-150"
                  style:width="{pitLive.vePct}%"
                ></div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

{#if current}
  <div class="pointer-events-none fixed inset-x-0 bottom-10 z-40 flex justify-center px-4">
    <div
      transition:fly={{ y: 36, duration: 320 }}
      class="mdt-shimmer-overlay relative flex min-w-[380px] max-w-[560px] items-center justify-between gap-4 overflow-hidden rounded-xl border bg-[#060b14]/95 px-4 py-3 shadow-[0_14px_44px_rgba(0,0,0,0.85)] backdrop-blur-md"
      style:border-color="{current.accent}88"
      style:box-shadow="0 0 28px {current.accent}44, 0 12px 36px rgba(0,0,0,0.85)"
    >
      <!-- Left vertical racing accent bar -->
      <div class="absolute inset-y-0 left-0 w-1.5" style:background={current.accent}></div>

      <div class="flex min-w-0 flex-col pl-2">
        <span
          class="font-mono text-[10px] font-black tracking-[0.16em] uppercase"
          style:color={current.accent}
        >
          {current.kicker}
        </span>
        <span class="truncate font-display text-xl font-black tracking-wide text-white uppercase leading-tight">
          {current.title}
        </span>
        <span class="truncate text-[11px] font-semibold tracking-wider text-white/75 uppercase">
          {current.subtitle}
        </span>
      </div>

      <div
        class="shrink-0 rounded-lg border px-3 py-1.5 font-mono text-lg font-black tracking-wider text-white shadow-inner"
        style:background="{current.accent}28"
        style:border-color="{current.accent}88"
      >
        {current.badge}
      </div>

      <!-- Bottom countdown progress bar -->
      <div
        class="tv-alert-bar absolute bottom-0 left-0 h-0.5 w-full origin-left"
        style:background={current.accent}
      ></div>
    </div>
  </div>
{/if}

<style>
  @keyframes tv-bar-drain {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
  .tv-alert-bar {
    animation: tv-bar-drain 5.2s linear forwards;
  }
</style>
