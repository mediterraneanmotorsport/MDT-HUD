<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { penaltyText } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const p = $derived(live.snap?.player);
  const me = $derived(live.snap?.vehicles.find((v) => v.isPlayer));
  const showAlways = $derived(opts.showAlways ?? true);

  const perPoint = $derived(Math.max(1, p?.trackLimitsStepsPerPoint ?? 4));
  const currentPts = $derived(p ? p.trackLimitsSteps / perPoint : 0);
  const maxPts = $derived(p && p.trackLimitsStepsPerPenalty > 0 ? p.trackLimitsStepsPerPenalty / perPoint : 3);
  const frac = $derived(maxPts > 0 ? Math.min(1, currentPts / maxPts) : 0);
  const remainingPts = $derived(Math.max(0, maxPts - currentPts));
  const danger = $derived(remainingPts <= 1 && currentPts > 0);
  const warning = $derived(!danger && currentPts > 0);

  const penalties = $derived(me?.penalties ?? []);
  const numPenalties = $derived(me?.numPenalties ?? 0);

  // Flash when points increase
  let lastSteps = -1;
  let flashUntil = $state(0);
  let now = $state(Date.now());

  $effect(() => {
    const steps = p?.trackLimitsSteps ?? -1;
    if (lastSteps >= 0 && steps > lastSteps) {
      flashUntil = Date.now() + 4500;
    }
    lastSteps = steps;
    now = Date.now();
  });

  const justCut = $derived(now < flashUntil);
</script>

{#if showAlways || currentPts > 0 || numPenalties > 0 || edit}
  <div
    class={[
      "hud w-[240px] p-2.5 text-sm transition-all",
      justCut && "ring-2 ring-warn shadow-[0_0_20px_var(--color-warn)]",
      danger && "border-bad/80",
    ]}
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
        <span class="hud-label text-accent">LÍMITES DE PISTA</span>
      </div>
      <span
        class={[
          "rounded px-1.5 py-px font-display text-xs font-extrabold tabular-nums",
          danger ? "bg-bad text-white" : warning ? "bg-warn text-black" : "bg-white/10 text-fg",
        ]}
      >
        {currentPts.toFixed(2).replace(/\.00$/, "")} / {maxPts.toFixed(1).replace(/\.0$/, "")} PTS
      </span>
    </div>

    <!-- Segmented / Progress Bar -->
    <div class="mt-2 h-2 overflow-hidden rounded-full bg-hud-2">
      <div
        class="h-full rounded-full transition-all duration-150"
        style:width="{frac * 100}%"
        style:background={danger ? "var(--color-bad)" : warning ? "var(--color-warn)" : "var(--color-good)"}
      ></div>
    </div>

    <div class="mt-1.5 flex items-center justify-between text-[11px]">
      {#if justCut}
        <span class="animate-pulse font-bold text-warn">¡CORTE DETECTADO!</span>
      {:else if danger}
        <span class="font-bold text-bad">¡A {remainingPts.toFixed(1)} pts de sanción!</span>
      {:else if warning}
        <span class="text-muted">Margen: {remainingPts.toFixed(1)} pts</span>
      {:else}
        <span class="text-good">Limpio (0 avisos)</span>
      {/if}
      <span class="tabular-nums text-muted">{Math.round(frac * 100)}%</span>
    </div>

    {#if numPenalties > 0}
      <div class="mt-2 flex items-center justify-between rounded bg-bad px-2 py-1 text-xs font-bold text-white">
        <span>SANCIÓN ACTIVA</span>
        <span>{penalties[0] ? penaltyText(penalties[0]) : `×${numPenalties}`}</span>
      </div>
    {/if}
  </div>
{/if}
