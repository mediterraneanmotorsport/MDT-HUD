<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { vePct } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const p = $derived(live.snap?.player);
  const st = $derived(live.snap?.strategy);
  const showRegen = $derived(opts.showRegen ?? true);

  // Detect live coasting (off-throttle, off-brake at speed > 80 km/h)
  const isCoasting = $derived(!!p && !p.inPits && p.speed > 22 && p.throttle < 0.06 && p.brake < 0.04);
  const lmuLiftPrompt = $derived((p?.liftAndCoast ?? 0) > 0);

  let lapCoastMeters = $state(0);
  let lastLapNum = -1;
  let lastDist = 0;

  $effect(() => {
    if (!p) return;
    if (p.lapNumber !== lastLapNum) {
      lastLapNum = p.lapNumber;
      lapCoastMeters = 0;
      lastDist = p.lapDist;
      return;
    }
    const d = p.lapDist - lastDist;
    lastDist = p.lapDist;
    if (d > 0 && d < 30 && isCoasting) {
      lapCoastMeters += d;
    }
  });

  const regenKw = $derived(Math.max(0, Math.round(p?.regenKw ?? 0)));
  const maxRegenKw = 200; // 200 kW reference scale for LMH/LMDh
  const regenFrac = $derived(Math.min(1, regenKw / maxRegenKw));
  const hasVe = $derived((p?.virtualEnergy ?? 0) > 0);
</script>

<div
  class={[
    "hud w-[260px] p-2.5 text-sm transition-all",
    (lmuLiftPrompt || isCoasting) && "ring-2 ring-sky-400 shadow-[0_0_20px_rgb(56_189_248_/_0.45)]",
  ]}
>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-1.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
      <span class="hud-label text-accent">LIFT & COAST · ERS</span>
    </div>
    <span
      class={[
        "rounded px-1.5 py-0.5 font-display text-[11px] font-black tracking-wider uppercase",
        lmuLiftPrompt
          ? "animate-pulse bg-sky-400 text-black"
          : isCoasting
            ? "bg-emerald-400 text-black"
            : "bg-white/10 text-muted",
      ]}
    >
      {lmuLiftPrompt ? "¡SOLTAR GAS!" : isCoasting ? "COASTING ACTIVO" : "A FONDO / FRENO"}
    </span>
  </div>

  <!-- Coasting meters accumulated this lap -->
  <div class="mt-2 grid grid-cols-2 gap-2">
    <div class="hud-tile px-2.5 py-1.5">
      <div class="text-[10px] font-bold tracking-wider text-muted uppercase">L&C esta vuelta</div>
      <div class="hud-value mt-0.5 text-[22px] text-sky-400">
        {Math.round(lapCoastMeters)} <span class="text-xs font-normal text-muted">m</span>
      </div>
    </div>

    <div class="hud-tile px-2.5 py-1.5">
      <div class="text-[10px] font-bold tracking-wider text-muted uppercase">
        {hasVe ? "Energía / vta" : "Comb. / vta"}
      </div>
      <div class="hud-value mt-0.5 text-[22px]">
        {#if hasVe}
          {st && st.vePerLap > 0 ? vePct(st.vePerLap).toFixed(1) : "–"}<span class="text-xs font-normal text-muted">%</span>
        {:else}
          {st && st.fuelPerLap > 0 ? st.fuelPerLap.toFixed(2) : "–"}<span class="text-xs font-normal text-muted">L</span>
        {/if}
      </div>
    </div>
  </div>

  {#if showRegen}
    <div class="mt-2 hud-tile px-2.5 py-1.5">
      <div class="flex items-center justify-between text-[11px]">
        <span class="font-bold tracking-wider text-muted uppercase">Regeneración (ERS)</span>
        <span class="font-display font-bold tabular-nums text-sky-400">{regenKw} kW</span>
      </div>
      <div class="mt-1 h-2 overflow-hidden rounded-full bg-hud-2">
        <div
          class="h-full rounded-full bg-gradient-to-r from-accent to-sky-400 transition-[width] duration-75"
          style:width="{regenFrac * 100}%"
        ></div>
      </div>
    </div>
  {/if}
</div>
