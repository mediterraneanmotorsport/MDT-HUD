<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { temp, tempUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const showTemps = $derived(opts.showTemps ?? true);
  const showBias = $derived(opts.showBias ?? true);
  const showAlerts = $derived(opts.showAlerts ?? true);

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
        wheels: [
          { label: "FL", brakeTemp: 640, lockup: true, spin: false },
          { label: "FR", brakeTemp: 615, lockup: false, spin: false },
          { label: "RL", brakeTemp: 490, lockup: false, spin: false },
          { label: "RR", brakeTemp: 485, lockup: false, spin: false },
        ],
      };
    }

    const biasFront = p.brakeBiasFront > 1 ? p.brakeBiasFront : p.brakeBiasFront * 100;
    const heavyBrake = p.brake > 0.35 && p.speed > 10;
    const lockFront = heavyBrake && (p.absActive || (p.brake > 0.82 && Math.abs(p.gLong) > 1.8 && biasFront >= 52));
    const lockRear = heavyBrake && (p.absActive || (p.brake > 0.82 && Math.abs(p.gLong) > 1.8 && biasFront < 52));
    const spinRear = p.throttle > 0.35 && p.tcActive;

    const labels = ["FL", "FR", "RL", "RR"];
    const wheels = p.wheels.map((w, idx) => ({
      label: labels[idx] ?? `W${idx}`,
      brakeTemp: w.brakeTemp,
      lockup: idx < 2 ? lockFront : lockRear,
      spin: idx >= 2 && spinRear,
    }));

    return {
      biasFront,
      brake: p.brake,
      throttle: p.throttle,
      absActive: p.absActive,
      tcActive: p.tcActive,
      wheels,
    };
  });
</script>

{#if state}
  <div class="hud w-[260px] select-none p-3 text-xs">
    <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
      <span class="hud-title">FRENOS & BLOQUEOS</span>
      {#if showAlerts}
        <div class="flex items-center gap-1">
          {#if state.absActive}
            <span class="rounded bg-red-500 px-1.5 py-0.5 font-mono text-[9px] font-black text-white animate-pulse">ABS / LOCK</span>
          {:else if state.tcActive}
            <span class="rounded bg-amber-500 px-1.5 py-0.5 font-mono text-[9px] font-black text-black animate-pulse">TC / SPIN</span>
          {:else}
            <span class="font-mono text-[10px] text-muted">OK</span>
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
                ? "border-red-500 bg-red-950/70 shadow-[0_0_12px_rgba(239,68,68,0.65)]"
                : w.spin
                  ? "border-amber-400 bg-amber-950/60 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                  : "border-white/10 bg-white/[0.03]",
            ]}
          >
            <div class="flex items-center justify-between font-mono text-[10px]">
              <span class="font-black text-white/80">{w.label}</span>
              <span class="font-bold" style:color={c}>
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
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
