<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const p = $derived(live.snap?.player);
  const style = $derived((opts.style ?? "center") as "blocks" | "center");
  const ledCount = $derived(Math.max(10, Math.min(24, Number(opts.ledCount ?? 16))));
  const width = $derived(Math.max(240, Math.min(640, Number(opts.width ?? 420))));
  const showGear = $derived(opts.showGear ?? true);
  const showRpm = $derived(opts.showRpm ?? true);

  const rpmFrac = $derived(p && p.maxRpm > 0 ? Math.min(1, Math.max(0, p.rpm / p.maxRpm)) : 0);
  const gear = $derived(!p ? "–" : p.gear < 0 ? "R" : p.gear === 0 ? "N" : String(p.gear));
  const rpmText = $derived(p ? String(Math.round(p.rpm)) : "0");
  const flash = $derived(rpmFrac > 0.965);

  function colorForFraction(f: number): string {
    if (f > 0.88) return "#38bdf8"; // Shift blue/cyan
    if (f > 0.72) return "#ef4444"; // Red
    if (f > 0.5) return "#f59e0b"; // Amber
    return "#22c55e"; // Green
  }

  const leds = $derived.by(() => {
    const n = ledCount;
    const half = Math.floor(n / 2);
    return Array.from({ length: n }, (_, i) => {
      if (style === "center") {
        // Outer to center convergence
        const distFromEdge = i < half ? i : n - 1 - i;
        const step = distFromEdge / Math.max(1, half - 1);
        const threshold = 0.55 + step * 0.42;
        return {
          lit: rpmFrac >= threshold,
          color: flash ? "#38bdf8" : colorForFraction(step),
        };
      } else {
        const step = i / Math.max(1, n - 1);
        const threshold = 0.55 + step * 0.42;
        return {
          lit: rpmFrac >= threshold,
          color: flash ? "#38bdf8" : colorForFraction(step),
        };
      }
    });
  });
</script>

<div
  class={[
    "hud relative flex flex-col gap-1.5 px-3 py-2 transition-all",
    flash && "ring-2 ring-sky-400 shadow-[0_0_25px_#38bdf8]",
  ]}
  style:width="{width}px"
>
  {#if p?.speedLimiter}
    <div class="animate-pulse rounded bg-warn py-0.5 text-center font-display text-xs font-black tracking-[0.2em] text-black uppercase">
      PIT LIMITER ACTIVO
    </div>
  {:else if flash}
    <div class="animate-pulse rounded bg-sky-400 py-0.5 text-center font-display text-xs font-black tracking-[0.25em] text-black uppercase">
      ¡CAMBIAR MARCHA!
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <!-- Left LEDs (or full bar if showGear is false) -->
    <div class="flex flex-1 items-center gap-1" class:animate-pulse={flash}>
      {#each showGear ? leds.slice(0, Math.floor(leds.length / 2)) : leds as led}
        <div
          class="h-4 flex-1 rounded-[3px] transition-all duration-75"
          style:background={led.lit ? led.color : "rgb(255 255 255 / 0.08)"}
          style:box-shadow={led.lit ? `0 0 10px ${led.color}` : "none"}
        ></div>
      {/each}
    </div>

    {#if showGear}
      <div
        class={[
          "flex h-9 min-w-[42px] items-center justify-center rounded-lg border-2 px-2 font-display text-2xl font-black tabular-nums",
          flash
            ? "border-sky-400 bg-sky-500/30 text-white"
            : p?.speedLimiter
              ? "border-warn text-warn"
              : "border-accent bg-accent/20 text-white",
        ]}
      >
        {gear}
      </div>

      <div class="flex flex-1 items-center gap-1" class:animate-pulse={flash}>
        {#each leds.slice(Math.floor(leds.length / 2)) as led}
          <div
            class="h-4 flex-1 rounded-[3px] transition-all duration-75"
            style:background={led.lit ? led.color : "rgb(255 255 255 / 0.08)"}
            style:box-shadow={led.lit ? `0 0 10px ${led.color}` : "none"}
          ></div>
        {/each}
      </div>
    {/if}
  </div>

  {#if showRpm}
    <div class="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
      <span class="flex items-center gap-1 text-accent">
        <img src="/mdt-logo.png" alt="" class="h-3 w-3 object-contain" />
        MDT SHIFT
      </span>
      <span class="tabular-nums text-fg/90">{rpmText} <span class="text-muted">RPM</span></span>
    </div>
  {/if}
</div>
