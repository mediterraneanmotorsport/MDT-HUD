<script lang="ts">
  import { config, type Units } from "../../lib/config.svelte";
  import { useLive } from "../../lib/live.svelte";
  import type { Snapshot } from "../../lib/types";
  import { wheelControl, type MfdPageId } from "../../lib/wheelControl.svelte";
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
  import StintPlanner from "./StintPlanner.svelte";
  import TrackLimits from "./TrackLimits.svelte";
  import TrackMap from "./TrackMap.svelte";
  import Tyres from "./Tyres.svelte";

  const live = useLive();

  let { units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  let overridePageId = $state<MfdPageId | null>(null);
  let overrideReason = $state<string>("");
  let overrideTimer: ReturnType<typeof setTimeout> | null = null;
  let prevDentSum = -1;
  let prevInPits: boolean | null = null;
  let prevCutPts = -1;

  function triggerTemporaryPage(pageId: MfdPageId, reason: string, durationMs = 5000) {
    overridePageId = pageId;
    overrideReason = reason;
    if (overrideTimer) clearTimeout(overrideTimer);
    overrideTimer = setTimeout(() => {
      overridePageId = null;
      overrideReason = "";
    }, durationMs);
  }

  function checkAutoPopups(s: Snapshot | null) {
    const p = s?.player;
    if (!p) {
      prevDentSum = -1;
      prevInPits = null;
      prevCutPts = -1;
      return;
    }
    const dentSum = p.dents.reduce((a, b) => a + b, 0) + (p.detached ? 10 : 0);
    const inPits = !!p.inPits;
    const cutPts = p.trackLimitsSteps ?? 0;

    if (wheelControl.autoPopups) {
      if (prevDentSum >= 0 && dentSum > prevDentSum) {
        triggerTemporaryPage("damage", "⚠️ DAÑOS DETECTADOS", 5000);
      } else if (prevInPits === false && inPits === true) {
        triggerTemporaryPage("fuel", "🔧 ENTRADA A BOXES · REPOSTAJE", 6000);
      } else if (prevCutPts >= 0 && cutPts > prevCutPts) {
        triggerTemporaryPage("tracklimits", "⚠️ AVISO DE LÍMITES DE PISTA", 4000);
      }
    }

    prevDentSum = dentSum;
    prevInPits = inPits;
    prevCutPts = cutPts;
  }

  $effect(() => {
    checkAutoPopups(live.snap);
  });

  const activePages = $derived(wheelControl.activePages);
  const currentIdx = $derived(wheelControl.pageIndex % activePages.length);
  const currentPage = $derived(activePages[currentIdx] ?? activePages[0]);
  const effectivePageId = $derived<MfdPageId>(overridePageId ?? currentPage.id);
  const wCfg = $derived(config.value.widgets);
</script>

<!-- Único Overlay Individual controlado por el botón del volante (sincronizado con DDU Móvil) -->
<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between rounded-md border border-accent/40 bg-black/80 px-2.5 py-0.5 text-[10px]">
    <div class="flex items-center gap-1.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-3 w-3 object-contain" />
      <span class="font-display font-bold tracking-wider text-accent-hi uppercase">
        {currentIdx + 1}/{activePages.length} · {currentPage.shortTitle}
      </span>
    </div>
    {#if overrideReason}
      <span class="font-display font-black text-warn uppercase">{overrideReason}</span>
    {/if}
  </div>

  {#if effectivePageId === "dashboard"}
    <Dashboard opts={wCfg.dashboard?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "relative"}
    <Relative opts={wCfg.relative?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "standings"}
    <Standings opts={{ ...(wCfg.standings?.options ?? {}), maxRows: 8, maxRowsOther: 4 }} {units} {edit} />
  {:else if effectivePageId === "damage"}
    <Damage opts={{ ...(wCfg.damage?.options ?? {}), showCar: true }} {units} {edit} />
  {:else if effectivePageId === "tyres"}
    <Tyres opts={wCfg.tyres?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "fuel"}
    <Fuel opts={wCfg.fuel?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "liftcoast"}
    <LiftCoast opts={wCfg.liftcoast?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "pacecatch"}
    <PaceCatch opts={wCfg.pacecatch?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "tracklimits"}
    <TrackLimits opts={{ ...(wCfg.tracklimits?.options ?? {}), showAlways: true }} {units} {edit} />
  {:else if effectivePageId === "electronics"}
    <Electronics opts={wCfg.electronics?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "laptiming"}
    <LapTiming opts={wCfg.laptiming?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "radar"}
    <Radar opts={{ ...(wCfg.radar?.options ?? {}), autoHide: false }} {units} {edit} />
  {:else if effectivePageId === "trackmap"}
    <TrackMap opts={wCfg.trackmap?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "inputs"}
    <Inputs opts={wCfg.inputs?.options ?? {}} {units} {edit} />
  {:else if effectivePageId === "stintplanner"}
    <StintPlanner opts={wCfg.stintplanner?.options ?? {}} {units} {edit} />
  {/if}
</div>
