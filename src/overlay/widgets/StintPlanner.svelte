<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { fuel, fuelUnit, vePct } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, units }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const snap = $derived(live.snap);
  const p = $derived(snap?.player);
  const st = $derived(snap?.strategy);
  const hasVe = $derived((p?.virtualEnergy ?? 0) > 0);
  const safetyLaps = $derived(Number(opts.safetyLaps ?? 1));
  const customMinutes = $derived(Number(opts.customMinutes ?? 0));

  const plan = $derived.by(() => {
    if (!p || !st) return null;
    const fuelPerLap = st.fuelPerLap > 0 ? st.fuelPerLap : 0;
    const vePerLap = hasVe && st.vePerLap > 0 ? st.vePerLap : 0;
    if (fuelPerLap <= 0 && vePerLap <= 0) return null;

    const refLapTime =
      snap?.timing.lastLapTime && snap.timing.lastLapTime > 20
        ? snap.timing.lastLapTime
        : snap?.timing.sessionBest && snap.timing.sessionBest > 20
          ? snap.timing.sessionBest
          : 105;

    const baseLapsRemaining =
      customMinutes > 0
        ? (customMinutes * 60) / refLapTime
        : st.lapsRemaining > 0
          ? st.lapsRemaining
          : 0;

    const totalLapsToCover = Math.max(0, baseLapsRemaining + safetyLaps);

    const tankCap = p.fuelCapacity > 0 ? p.fuelCapacity : 100;
    const fullTankLapsFuel = fuelPerLap > 0 ? tankCap / fuelPerLap : 999;
    const fullTankLapsVe = vePerLap > 0 ? 1.0 / vePerLap : 999;
    const fullStintLaps = Math.min(fullTankLapsFuel, fullTankLapsVe);

    const currentLapsFuel = fuelPerLap > 0 ? p.fuel / fuelPerLap : 999;
    const currentLapsVe = vePerLap > 0 ? p.virtualEnergy / vePerLap : 999;
    const currentStintLapsLeft = Math.min(currentLapsFuel, currentLapsVe);

    const lapsAfterCurrent = Math.max(0, totalLapsToCover - currentStintLapsLeft);
    const stopsNeeded = lapsAfterCurrent <= 0.05 ? 0 : Math.ceil(lapsAfterCurrent / Math.max(1, fullStintLaps));

    const totalFuelNeeded = totalLapsToCover * fuelPerLap;
    const fuelDeficit = Math.max(0, totalFuelNeeded - p.fuel);
    const nextStopFuelAdd = Math.min(tankCap, fuelDeficit);

    const totalVeNeeded = totalLapsToCover * vePerLap;
    const veDeficit = Math.max(0, totalVeNeeded - p.virtualEnergy);
    const nextStopVeAdd = Math.min(1.0, veDeficit);

    // Final stop splash & dash calculation
    const lastStopLaps =
      stopsNeeded > 0 ? lapsAfterCurrent - (stopsNeeded - 1) * fullStintLaps : 0;
    const splashFuel = lastStopLaps * fuelPerLap;
    const splashVe = lastStopLaps * vePerLap;

    // Can we save 1 pit stop by slight fuel saving (< 10%)?
    const canSaveStop = stopsNeeded > 0 && lastStopLaps > 0 && lastStopLaps <= Math.max(2.2, fullStintLaps * 0.12);
    const targetLapsWithoutLastStop = currentStintLapsLeft + (stopsNeeded - 1) * fullStintLaps;
    const saveFuelPerLap =
      canSaveStop && totalLapsToCover > 0 && fuelPerLap > 0
        ? Math.max(0, fuelPerLap - (p.fuel + (stopsNeeded - 1) * tankCap) / totalLapsToCover)
        : 0;

    return {
      totalLapsToCover,
      fullStintLaps,
      currentStintLapsLeft,
      stopsNeeded,
      fuelDeficit,
      nextStopFuelAdd,
      veDeficit,
      nextStopVeAdd,
      splashFuel,
      splashVe,
      canSaveStop,
      saveFuelPerLap,
    };
  });
</script>

<div class="hud w-[310px] p-3 text-xs">
  <div class="flex items-center justify-between border-b border-white/10 pb-2">
    <div class="flex items-center gap-1.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
      <span class="hud-title">Estrategia & Stints WEC</span>
    </div>
    <span class="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-hi">
      +{safetyLaps.toFixed(1)}v margen
    </span>
  </div>

  {#if plan}
    <div class="mt-2.5 grid grid-cols-3 gap-2 text-center">
      <div class="hud-tile p-2">
        <div class="hud-label text-[9px]">PARADAS REST.</div>
        <div
          class={[
            "hud-value mt-1 text-2xl font-black",
            plan.stopsNeeded === 0 ? "text-good" : "text-warn",
          ]}
        >
          {plan.stopsNeeded}
        </div>
      </div>

      <div class="hud-tile p-2">
        <div class="hud-label text-[9px]">STINT LLENO</div>
        <div class="hud-value mt-1 text-2xl font-bold text-fg">
          {plan.fullStintLaps.toFixed(1)}<span class="text-[11px] text-muted">v</span>
        </div>
      </div>

      <div class="hud-tile p-2">
        <div class="hud-label text-[9px]">VUELTAS META</div>
        <div class="hud-value mt-1 text-2xl font-bold text-fg">
          {plan.totalLapsToCover.toFixed(1)}<span class="text-[11px] text-muted">v</span>
        </div>
      </div>
    </div>

    <div class="mt-2.5 space-y-1.5 rounded-lg bg-black/30 p-2.5">
      <div class="flex items-center justify-between">
        <span class="text-muted">Repostaje próx. parada:</span>
        <span class="font-mono font-bold text-fg">
          +{fuel(plan.nextStopFuelAdd, units).toFixed(1)} {fuelUnit(units)}
          {#if hasVe}
            <span class="text-accent-hi">· +{vePct(plan.nextStopVeAdd).toFixed(0)}% VE</span>
          {/if}
        </span>
      </div>

      {#if plan.stopsNeeded > 0}
        <div class="flex items-center justify-between">
          <span class="text-muted">Última parada (Splash):</span>
          <span class="font-mono font-bold text-good">
            +{fuel(plan.splashFuel, units).toFixed(1)} {fuelUnit(units)}
            {#if hasVe}
              <span>· +{vePct(plan.splashVe).toFixed(0)}% VE</span>
            {/if}
          </span>
        </div>
      {/if}

      <div class="flex items-center justify-between border-t border-white/10 pt-1.5">
        <span class="text-muted">Autonomía actual:</span>
        <span class="font-mono font-bold text-accent-hi">
          {plan.currentStintLapsLeft.toFixed(1)} vueltas
        </span>
      </div>
    </div>

    {#if plan.canSaveStop && plan.saveFuelPerLap > 0}
      <div class="mt-2 rounded-md border border-good/40 bg-good/15 px-2.5 py-1.5 text-[11px] font-semibold text-good">
        💡 Ahorra <b>{fuel(plan.saveFuelPerLap, units).toFixed(2)} {fuelUnit(units)}/vta</b> para eliminar 1 parada en boxes.
      </div>
    {/if}
  {:else}
    <div class="py-5 text-center text-xs text-muted">
      Completa una vuelta limpia para calcular paradas, stints y repostaje exacto.
    </div>
  {/if}
</div>
