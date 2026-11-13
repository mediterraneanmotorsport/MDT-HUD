<script lang="ts">
  import { compoundStyle } from "../../lib/brands";
  import type { Units } from "../../lib/config.svelte";
  import { stintLapsLeft, wearAtStintEnd } from "../../lib/estimates";
  import { pressure, pressureUnit, temp } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Wheel } from "../../lib/types";

  const live = useLive();

  let { opts, units }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const p = $derived(live.snap?.player);
  const st = $derived(live.snap?.strategy);
  const me = $derived(live.snap?.vehicles.find((v) => v.isPlayer));
  const layer = $derived<"surface" | "core" | "both">(opts.tempLayer ?? "surface");

  /** Blue (cold) → green (optimal) → red (hot). */
  function tempColor(t: number, optimal: number) {
    const opt = optimal > 30 ? optimal : 90;
    const d = Math.max(-30, Math.min(30, t - opt));
    const hue = d < 0 ? 140 + (-d / 30) * 75 : 140 - (d / 30) * 140;
    return `hsl(${hue} 65% 42%)`;
  }

  /** Cold blue → green in the working range → orange → red when overheating. */
  function brakeColor(t: number) {
    const stops: [number, number][] = [
      [150, 215],
      [350, 140],
      [700, 140],
      [850, 35],
      [1000, 0],
    ];
    let hue = t <= stops[0][0] ? stops[0][1] : stops[stops.length - 1][1];
    for (let k = 1; k < stops.length; k++) {
      const [t0, h0] = stops[k - 1];
      const [t1, h1] = stops[k];
      if (t > t0 && t <= t1) hue = h0 + ((t - t0) / (t1 - t0)) * (h1 - h0);
    }
    return `hsl(${hue} 65% 42%)`;
  }

  /** Tread left when the stint ends at the average rate, null without data. */
  function stintEndWear(w: Wheel, i: number) {
    const rate = st?.tyreWearPerLap?.[i] ?? 0;
    const laps = st ? stintLapsLeft(st) : null;
    if (!st?.tyreSamples || rate <= 0 || laps == null) return null;
    return wearAtStintEnd(w.wear, rate, laps);
  }

  const compounds = $derived(p?.wheels.map((w) => w.compound) ?? []);
  const mixed = $derived(new Set(compounds).size > 1);
  const compound = $derived(compoundStyle(compounds[0] ?? ""));

  function windowBadge(w: Wheel): { label: string; cls: string } {
    const isWet = /wet|rain|inter/i.test(w.compound || "");
    const opt = w.optimalTemp > 30 ? w.optimalTemp : isWet ? 62 : 88;
    const zones = layer === "core" ? w.innerTemp : w.surfaceTemp;
    const avg = (zones[0] + zones[1] + zones[2]) / 3;
    const diff = avg - opt;
    if (diff < -10) return { label: "FRÍO", cls: "bg-sky-500/25 text-sky-300 border-sky-400/50" };
    if (diff > 11) return { label: "CAL", cls: "bg-bad/25 text-bad border-bad/50" };
    return { label: "ÓPT", cls: "bg-good/25 text-good border-good/50" };
  }

  const frontWearPct = $derived(
    p ? Math.round(((p.wheels[0].wear + p.wheels[1].wear) / 2) * 100) : 100,
  );
  const rearWearPct = $derived(
    p ? Math.round(((p.wheels[2].wear + p.wheels[3].wear) / 2) * 100) : 100,
  );
  const wearDiff = $derived(frontWearPct - rearWearPct); // negative = front more worn (understeer), positive = rear more worn (oversteer)
</script>

{#snippet pressureLabel(w: Wheel)}
  {@const win = windowBadge(w)}
  <div class={["flex items-center justify-center gap-1 text-center text-[11px] leading-none", w.flat ? "font-bold text-bad" : "text-muted"]} title="Presión y ventana térmica">
    {#if w.flat}
      FLAT
    {:else}
      <span>{pressure(w.pressure, units).toFixed(units === "imperial" ? 1 : 0)}<span class="ml-px text-[9px]">{pressureUnit(units)}</span></span>
      <span class={["rounded border px-1 py-px text-[8px] font-extrabold", win.cls]}>{win.label}</span>
    {/if}
  </div>
{/snippet}

<!-- Tyre seen from above: stripes coloured by the left / centre / right temperature, with their average on top. -->
{#snippet tyre(w: Wheel)}
  {@const zones = layer === "core" ? w.innerTemp : w.surfaceTemp}
  {@const avg = (zones[0] + zones[1] + zones[2]) / 3}
  {@const core = (w.innerTemp[0] + w.innerTemp[1] + w.innerTemp[2]) / 3}
  <div class="relative flex h-[58px] w-[42px] overflow-hidden rounded-[8px] bg-black" class:opacity-40={w.detached}>
    {#each zones as t}
      <div class="flex-1" style:background={tempColor(t, w.optimalTemp)}></div>
    {/each}
    <div class="absolute inset-0 flex flex-col items-center justify-center leading-none text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
      <span class="relative text-[15px] font-semibold">{Math.round(temp(avg, units))}<span class="absolute left-full">°</span></span>
      {#if layer === "both"}
        <span class="relative mt-1 text-[11px] opacity-80" title="Core">{Math.round(temp(core, units))}<span class="absolute left-full">°</span></span>
      {/if}
    </div>
  </div>
{/snippet}

<!-- Brake on the inboard side: a short bar coloured by its temperature, with the value right above it. -->
{#snippet brake(w: Wheel)}
  <div class="flex h-[58px] flex-col items-center justify-center gap-1 px-1.5" title="Brake temperature">
    <!-- The degree sign hangs outside so the digits stay centred over the bar. -->
    <span class="relative text-[11px] leading-none text-muted">{Math.round(temp(w.brakeTemp, units))}<span class="absolute left-full">°</span></span>
    <div class="h-[26px] w-[8px] rounded-[3px]" style:background={brakeColor(w.brakeTemp)}></div>
  </div>
{/snippet}

{#snippet info(w: Wheel, i: number)}
  {@const rate = st?.tyreSamples ? st.tyreWearPerLap[i] : 0}
  {@const end = stintEndWear(w, i)}
  {@const limitFrac = (opts.wearLimit ?? 30) / 100}
  {@const lapsToLimit = rate > 0 ? Math.max(0, (w.wear - limitFrac) / rate) : null}
  {@const worn = (end != null && end <= limitFrac) || w.wear <= limitFrac}
  <div class={["flex h-full flex-col justify-center leading-tight whitespace-nowrap", i % 2 === 0 ? "items-end text-right" : "items-start"]}>
    <span class={["text-[17px] font-semibold", w.wear <= limitFrac && "text-bad"]} title="Vida restante">{Math.round(w.wear * 100)}<span class="text-[11px] font-normal text-muted">%</span></span>
    {#if opts.showWearRate}
      <span class="text-[12px] text-muted" title="Desgaste medio por vuelta">{rate > 0 ? `−${(rate * 100).toFixed(2)}` : "–"}<span class="text-[9px]">/vta</span></span>
      <span class={["text-[12px]", worn ? "text-warn" : "text-muted"]} title="Vida estimada al final del stint"
        >{end == null ? "–" : Math.round(end * 100)}<span class="text-[9px]">% fin</span></span
      >
    {/if}
    {#if (opts.showLapsLeft ?? true) && lapsToLimit != null}
      <span class={["text-[11px] font-semibold", lapsToLimit < 3 ? "text-bad" : "text-accent"]} title="Vueltas estimadas hasta el límite de desgaste">
        ~{lapsToLimit > 99 ? "99+" : lapsToLimit.toFixed(1)}<span class="text-[9px] font-normal">v</span>
      </span>
    {/if}
  </div>
{/snippet}

{#snippet axle(a: number, b: number)}
  <div class="grid grid-cols-[1fr_auto_auto_1fr] items-end gap-x-2.5">
    <div class="h-[58px]">{@render info(p!.wheels[a], a)}</div>
    {#each [a, b] as i}
      {@const w = p!.wheels[i]}
      <!-- Pressure above the tyre, brake on the inboard side with its temperature above it. -->
      <div class={["flex items-end gap-1.5", i === b && "flex-row-reverse"]}>
        <div class="flex flex-col items-center gap-1">
          {@render pressureLabel(w)}
          {@render tyre(w)}
        </div>
        {#if opts.showBrakes}{@render brake(w)}{/if}
      </div>
    {/each}
    <div class="h-[58px]">{@render info(p!.wheels[b], b)}</div>
  </div>
{/snippet}

<div class="hud w-[288px] p-3">
  <div class="mb-2 flex items-center justify-between">
    <span class="hud-title">Neumáticos{layer === "core" ? " · int." : ""}</span>
    {#if compounds.some(Boolean)}
      <span class="flex items-center gap-1.5 text-[12px] text-muted">
        {#if mixed}
          <!-- One dot per corner, laid out like the car seen from above. -->
          <span class="grid grid-cols-2 gap-px">
            {#each compounds as c}
              <span class="h-1.5 w-1.5 rounded-full" style:background={compoundStyle(c).color}></span>
            {/each}
          </span>
          {[...new Set(compounds)].join("/")}{me ? ` · ${me.tyreLaps} vtas` : ""}
        {:else}
          <span class="h-2 w-2 rounded-full" style:background={compound.color}></span>
          {compounds[0]}{me ? ` · ${me.tyreLaps} vtas` : ""}
        {/if}
      </span>
    {/if}
  </div>
  {#if p}
    <div class="flex flex-col gap-3">
      {@render axle(0, 1)}
      {@render axle(2, 3)}
    </div>
    <!-- Equilibrio de Desgaste Delantero vs Trasero -->
    <div class="mt-2.5 flex items-center justify-between rounded-md bg-black/30 px-2 py-1 text-[10px]">
      <span class="font-semibold text-muted">BAL D/T: <b class="text-fg">{frontWearPct}%</b> / <b class="text-fg">{rearWearPct}%</b></span>
      {#if wearDiff <= -4}
        <span class="font-bold text-warn">Subviraje (Del. {wearDiff}%)</span>
      {:else if wearDiff >= 4}
        <span class="font-bold text-bad">Sobreviraje (Tras. −{wearDiff}%)</span>
      {:else}
        <span class="font-bold text-good">Equilibrado ({wearDiff >= 0 ? `+${wearDiff}` : wearDiff}%)</span>
      {/if}
    </div>
    {#if opts.showWearRate && st && !st.tyreSamples}
      <div class="mt-1.5 text-[10px] text-faint">El desgaste aparece tras una vuelta con bandera verde.</div>
    {/if}
  {:else}
    <div class="py-6 text-center text-sm text-muted">Sin coche</div>
  {/if}
</div>
