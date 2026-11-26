<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { temp, tempUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const showTemps = $derived(opts.showTemps ?? true);
  const showBias = $derived(opts.showBias ?? true);
  const showAlerts = $derived(opts.showAlerts ?? true);

  // #4 Per-wheel lockup counter per lap + flat-spot risk tracker
  let lapLockups = $state<[number, number, number, number]>([0, 0, 0, 0]);
  let flatSpotRisk = $state<[number, number, number, number]>([0, 0, 0, 0]);
  let prevLockState = [false, false, false, false];
  let lastTrackedLap = -1;

  function discColor(c: number): string {
    if (c < 220) return "#38bdf8"; // Cold blue
    if (c < 580) return "#22c55e"; // Optimal green
    if (c < 780) return "#f59e0b"; // Warm/high amber
    return "#ef4444"; // Overheating red
  }

  function discPct(c: number): number {
    return Math.max(8, Math.min(100, Math.round((c / 950) * 100)));
  }

  const state = $derived.by(() => {
    const p = live.snap?.player;
    if (!p) {
      if (!edit) return null;
      return {
        biasFront: 54.5,
        brake: 0.72,
        throttle: 0,
        absActive: true,
        tcActive: false,
        totalLapLockups: 2,
        anyOverheat: true,
        wheels: [
          { label: "FL", brakeTemp: 810, lockup: true, spin: false, overheat: true, lockCount: 2, flatRisk: 38 },
          { label: "FR", brakeTemp: 615, lockup: false, spin: false, overheat: false, lockCount: 0, flatRisk: 0 },
          { label: "RL", brakeTemp: 490, lockup: false, spin: false, overheat: false, lockCount: 0, flatRisk: 0 },
          { label: "RR", brakeTemp: 485, lockup: false, spin: false, overheat: false, lockCount: 0, flatRisk: 0 },
        ],
      };
    }

    const biasFront = p.brakeBiasFront > 1 ? p.brakeBiasFront : p.brakeBiasFront * 100;
    const heavyBrake = p.brake > 0.35 && p.speed > 10;
    const lockFront = heavyBrake && (p.absActive || (p.brake > 0.82 && Math.abs(p.gLong) > 1.8 && biasFront >= 52));
    const lockRear = heavyBrake && (p.absActive || (p.brake > 0.82 && Math.abs(p.gLong) > 1.8 && biasFront < 52));
    const spinRear = p.throttle > 0.35 && p.tcActive;

    const labels = ["FL", "FR", "RL", "RR"];
    const wheels = p.wheels.map((w, idx) => {
      // Corner-specific lockup bias using lateral G (inside wheel locks first under trail braking)
      const isLeft = idx === 0 || idx === 2;
      const insideUnload = isLeft ? (p.gLat ?? 0) > 0.45 : (p.gLat ?? 0) < -0.45;
      const baseLock = idx < 2 ? lockFront : lockRear;
      const lockup = baseLock && (p.absActive || insideUnload || Math.abs(p.gLat ?? 0) <= 0.45);
      const overheat = w.brakeTemp >= 780;
      return {
        label: labels[idx] ?? `W${idx}`,
        brakeTemp: w.brakeTemp,
        lockup,
        spin: idx >= 2 && spinRear,
        overheat,
        lockCount: lapLockups[idx] ?? 0,
        flatRisk: Math.min(100, Math.round(flatSpotRisk[idx] ?? 0)),
      };
    });

    return {
      biasFront,
      brake: p.brake,
      throttle: p.throttle,
      absActive: p.absActive,
      tcActive: p.tcActive,
      totalLapLockups: lapLockups[0] + lapLockups[1] + lapLockups[2] + lapLockups[3],
      anyOverheat: wheels.some((w) => w.overheat),
      wheels,
    };
  });

  $effect(() => {
    const p = live.snap?.player;
    if (!p || edit) return;
    if (p.inPits) {
      flatSpotRisk = [0, 0, 0, 0];
      lapLockups = [0, 0, 0, 0];
      prevLockState = [false, false, false, false];
      lastTrackedLap = p.lapNumber;
      return;
    }
    if (lastTrackedLap !== -1 && p.lapNumber !== lastTrackedLap) {
      lapLockups = [0, 0, 0, 0];
    }
    lastTrackedLap = p.lapNumber;

    const st = state;
    if (!st) return;
    const nextCounts: [number, number, number, number] = [...lapLockups];
    const nextRisk: [number, number, number, number] = [...flatSpotRisk];
    let changed = false;

    for (let i = 0; i < 4; i++) {
      const locking = Boolean(st.wheels[i]?.lockup);
      if (locking && !prevLockState[i]) {
        nextCounts[i] += 1;
        changed = true;
      }
      if (locking && p.speed > 18) {
        nextRisk[i] = Math.min(100, nextRisk[i] + 4.5);
        changed = true;
      }
      prevLockState[i] = locking;
    }
    if (changed) {
      lapLockups = nextCounts;
      flatSpotRisk = nextRisk;
    }
  });
</script>

{#if state}
  <div class="hud w-[272px] select-none p-3 text-xs">
    <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
      <div class="flex items-center gap-1.5">
        <span class="hud-title">FRENOS & FLAT SPOT</span>
        {#if state.totalLapLockups > 0}
          <span
            class="rounded bg-red-500/25 px-1.5 py-0.5 font-mono text-[9px] font-black text-red-300"
            title="Bloqueos registrados en esta vuelta"
          >
            🔒 {state.totalLapLockups}
          </span>
        {/if}
      </div>
      {#if showAlerts}
        <div class="flex items-center gap-1">
          {#if state.absActive}
            <span class="rounded bg-red-500 px-1.5 py-0.5 font-mono text-[9px] font-black text-white animate-pulse">LOCK</span>
          {:else if state.anyOverheat}
            <span class="rounded bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-black text-white animate-pulse">🔥 HOT</span>
          {:else if state.tcActive}
            <span class="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[9px] font-black text-black animate-pulse">SPIN</span>
          {:else}
            <span class="font-mono text-[10px] text-emerald-400">OK</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if showBias}
      <div class="mt-2 flex flex-col gap-1">
        <div class="flex items-center justify-between font-mono text-[11px]">
          <span class="text-muted">REPARTO (BB)</span>
          <span class="font-bold text-white">
            {state.biasFront.toFixed(1)}% <span class="text-muted">F</span> / {(100 - state.biasFront).toFixed(1)}% <span class="text-muted">R</span>
          </span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-150"
            style:width="{Math.max(20, Math.min(80, state.biasFront))}%"
          ></div>
        </div>
      </div>
    {/if}

    {#if showTemps}
      <div class="mt-2.5 grid grid-cols-2 gap-2">
        {#each state.wheels as w (w.label)}
          {@const c = discColor(w.brakeTemp)}
          <div
            class={[
              "flex flex-col gap-1 rounded-lg border px-2 py-1.5 transition-all duration-100",
              w.lockup
                ? "border-red-500 bg-red-950/75 shadow-[0_0_12px_rgba(239,68,68,0.7)] animate-pulse"
                : w.overheat
                  ? "border-red-500/80 bg-red-950/45 shadow-[0_0_10px_rgba(239,68,68,0.45)]"
                  : w.spin
                    ? "border-amber-400 bg-amber-950/60 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                    : "border-white/10 bg-white/[0.03]",
            ]}
          >
            <div class="flex items-center justify-between font-mono text-[10px]">
              <span class="flex items-center gap-1 font-black text-white/85">
                {w.label}
                {#if w.lockCount > 0}
                  <span class="rounded bg-red-500/30 px-1 text-[8px] text-red-200">×{w.lockCount}</span>
                {/if}
              </span>
              <span class={["font-bold", w.overheat && "animate-pulse"]} style:color={c}>
                {Math.round(temp(w.brakeTemp, units))}{tempUnit(units)}
              </span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
              <div
                class="h-full rounded-full transition-all duration-150"
                style:width="{discPct(w.brakeTemp)}%"
                style:background={c}
              ></div>
            </div>
            {#if w.flatRisk > 0}
              <div class="flex items-center justify-between font-mono text-[8.5px]">
                <span class={w.flatRisk >= 50 ? "font-black text-red-400" : "text-amber-300"}>
                  FLAT SPOT
                </span>
                <span class="font-bold text-white/80">{w.flatRisk}%</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
