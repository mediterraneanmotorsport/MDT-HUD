<script lang="ts">
  import { config, type Units } from "../../lib/config.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import Damage from "./Damage.svelte";
  import Dashboard from "./Dashboard.svelte";
  import Electronics from "./Electronics.svelte";
  import Fuel from "./Fuel.svelte";
  import Inputs from "./Inputs.svelte";
  import LapTiming from "./LapTiming.svelte";
  import LiftCoast from "./LiftCoast.svelte";
  import PaceCatch from "./PaceCatch.svelte";
  import Radar from "./Radar.svelte";
  import Relative from "./Relative.svelte";
  import Standings from "./Standings.svelte";
  import TrackLimits from "./TrackLimits.svelte";
  import TrackMap from "./TrackMap.svelte";
  import Tyres from "./Tyres.svelte";

  let { units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const activePages = $derived(wheelControl.activePages);
  const currentIdx = $derived(wheelControl.pageIndex % activePages.length);
  const currentPage = $derived(activePages[currentIdx] ?? activePages[0]);
  const wCfg = $derived(config.value.widgets);
</script>

<!-- Único Overlay Individual controlado por el botón del volante -->
<div class="flex flex-col gap-1">
  {#if currentPage.id === "dashboard"}
    <Dashboard opts={wCfg.dashboard?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "relative"}
    <Relative opts={wCfg.relative?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "standings"}
    <Standings opts={{ ...(wCfg.standings?.options ?? {}), maxRows: 6, maxRowsOther: 4 }} {units} {edit} />
  {:else if currentPage.id === "damage"}
    <Damage opts={{ ...(wCfg.damage?.options ?? {}), showCar: true }} {units} {edit} />
  {:else if currentPage.id === "tyres"}
    <Tyres opts={wCfg.tyres?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "fuel"}
    <Fuel opts={wCfg.fuel?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "liftcoast"}
    <LiftCoast opts={wCfg.liftcoast?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "pacecatch"}
    <PaceCatch opts={wCfg.pacecatch?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "tracklimits"}
    <TrackLimits opts={{ ...(wCfg.tracklimits?.options ?? {}), showAlways: true }} {units} {edit} />
  {:else if currentPage.id === "electronics"}
    <Electronics opts={wCfg.electronics?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "laptiming"}
    <LapTiming opts={wCfg.laptiming?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "radar"}
    <Radar opts={wCfg.radar?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "trackmap"}
    <TrackMap opts={wCfg.trackmap?.options ?? {}} {units} {edit} />
  {:else if currentPage.id === "inputs"}
    <Inputs opts={wCfg.inputs?.options ?? {}} {units} {edit} />
  {/if}
</div>
