<script lang="ts">
  import { config, type Units } from "../../lib/config.svelte";
  import { MFD_PAGES, wheelControl } from "../../lib/wheelControl.svelte";
  import Damage from "./Damage.svelte";
  import Fuel from "./Fuel.svelte";
  import LiftCoast from "./LiftCoast.svelte";
  import PaceCatch from "./PaceCatch.svelte";
  import Relative from "./Relative.svelte";
  import Standings from "./Standings.svelte";
  import TrackLimits from "./TrackLimits.svelte";
  import Tyres from "./Tyres.svelte";

  let { units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  // Exclude "ddu-only" in the PC MFD panel so it always shows a telemetry page (0..4)
  const PC_PAGES = MFD_PAGES.slice(0, 5);
  const currentIdx = $derived(wheelControl.page % PC_PAGES.length);
  const currentPage = $derived(PC_PAGES[currentIdx]);

  const wCfg = $derived(config.value.widgets);
</script>

<div class="flex flex-col gap-1.5">
  <!-- MFD Header Pill Bar -->
  <div class="hud flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
    <div class="flex items-center gap-1.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
      <span class="font-display text-[11px] font-extrabold tracking-wider text-accent uppercase">
        MFD · {currentPage.shortTitle}
      </span>
    </div>

    <div class="flex items-center gap-1">
      {#each PC_PAGES as p, i (p.id)}
        <button
          type="button"
          class={[
            "h-2 rounded-full transition-all",
            i === currentIdx ? "w-5 bg-accent shadow-[0_0_8px_var(--color-accent)]" : "w-2 bg-white/20 hover:bg-white/40",
          ]}
          title={p.title}
          onclick={() => wheelControl.setPage(i)}
        ></button>
      {/each}
    </div>
  </div>

  <!-- Active Page Content -->
  {#if currentPage.id === "relative"}
    <Relative opts={wCfg.relative?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "standings"}
    <Standings opts={{ ...(wCfg.standings?.options ?? {}), maxRows: 6, maxRowsOther: 4 }} {units} {edit} />
  {:else if currentPage.id === "damage-tyres"}
    <div class="flex items-start gap-2">
      <Tyres opts={wCfg.tyres?.options ?? {}} {units} {edit} />
      <Damage opts={{ ...(wCfg.damage?.options ?? {}), showCar: true }} {units} {edit} />
    </div>
  {:else if currentPage.id === "fuel-lift"}
    <div class="flex flex-col gap-1.5">
      <Fuel opts={wCfg.fuel?.options ?? {}} {units} {edit} />
      <LiftCoast opts={wCfg.liftcoast?.options ?? {}} {units} {edit} />
    </div>
  {:else if currentPage.id === "pace-limits"}
    <div class="flex flex-col gap-1.5">
      <PaceCatch opts={wCfg.pacecatch?.options ?? {}} {units} {edit} />
      <TrackLimits opts={{ ...(wCfg.tracklimits?.options ?? {}), showAlways: true }} {units} {edit} />
    </div>
  {/if}
</div>
