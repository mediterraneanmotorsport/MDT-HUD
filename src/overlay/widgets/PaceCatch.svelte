<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { classColor, lapTime, shortName } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const sameClassOnly = $derived(opts.sameClassOnly ?? true);
  const showLastLap = $derived(opts.showLastLap ?? true);

  interface TargetInfo {
    car: Vehicle;
    gapSec: number;
    paceDiff: number | null; // Rival lastLap - My lastLap (positive = I am faster when chasing ahead, or rival is slower behind)
    lapsToCatch: number | null;
    statusText: string;
    statusColor: string;
  }

  const targets = $derived.by(() => {
    const snap = live.snap;
    if (!snap) return { ahead: null, behind: null, me: null };
    const me = snap.vehicles.find((v) => v.isPlayer) ?? null;
    if (!me) return { ahead: null, behind: null, me: null };

    const pool = snap.vehicles
      .filter((v) => !sameClassOnly || v.class === me.class)
      .sort((a, b) => a.place - b.place);

    const idx = pool.findIndex((v) => v.id === me.id);
    const carAhead = idx > 0 ? pool[idx - 1] : null;
    const carBehind = idx >= 0 && idx < pool.length - 1 ? pool[idx + 1] : null;

    function buildTarget(rival: Vehicle | null, isAhead: boolean): TargetInfo | null {
      if (!rival || !me) return null;

      // Gap between me and rival in seconds
      let gapSec = 0;
      if (isAhead) {
        if (me.timeBehindLeader > 0 && rival.timeBehindLeader >= 0 && me.timeBehindLeader >= rival.timeBehindLeader) {
          gapSec = me.timeBehindLeader - rival.timeBehindLeader;
        } else {
          gapSec = me.timeBehindNext > 0 ? me.timeBehindNext : 1.5;
        }
      } else {
        if (rival.timeBehindLeader > 0 && me.timeBehindLeader >= 0 && rival.timeBehindLeader >= me.timeBehindLeader) {
          gapSec = rival.timeBehindLeader - me.timeBehindLeader;
        } else {
          gapSec = rival.timeBehindNext > 0 ? rival.timeBehindNext : 1.5;
        }
      }

      const myLap = me.lastLap > 0 ? me.lastLap : me.bestLap;
      const rivLap = rival.lastLap > 0 ? rival.lastLap : rival.bestLap;

      if (myLap <= 0 || rivLap <= 0) {
        return {
          car: rival,
          gapSec,
          paceDiff: null,
          lapsToCatch: null,
          statusText: "Calculando ritmo…",
          statusColor: "text-muted",
        };
      }

      if (isAhead) {
        // Positive gain = I am faster than car ahead
        const gainPerLap = rivLap - myLap;
        if (gainPerLap > 0.03) {
          const laps = gapSec / gainPerLap;
          return {
            car: rival,
            gapSec,
            paceDiff: -gainPerLap,
            lapsToCatch: laps,
            statusText: laps < 50 ? `Alcanzas en ${laps.toFixed(1)} v` : `Recortando (${gainPerLap.toFixed(2)}s/v)`,
            statusColor: "text-good",
          };
        } else {
          const loss = Math.abs(gainPerLap);
          return {
            car: rival,
            gapSec,
            paceDiff: loss,
            lapsToCatch: null,
            statusText: loss < 0.05 ? "Mismo ritmo" : `Se escapa (+${loss.toFixed(2)}s/v)`,
            statusColor: loss < 0.05 ? "text-muted" : "text-warn",
          };
        }
      } else {
        // Car behind: positive threat = rival is faster than me
        const threatPerLap = myLap - rivLap;
        if (threatPerLap > 0.03) {
          const laps = gapSec / threatPerLap;
          return {
            car: rival,
            gapSec,
            paceDiff: threatPerLap,
            lapsToCatch: laps,
            statusText: laps < 50 ? `Te alcanza en ${laps.toFixed(1)} v` : `Acercándose (-${threatPerLap.toFixed(2)}s/v)`,
            statusColor: "text-bad",
          };
        } else {
          const pullAway = Math.abs(threatPerLap);
          return {
            car: rival,
            gapSec,
            paceDiff: -pullAway,
            lapsToCatch: null,
            statusText: pullAway < 0.05 ? "Mismo ritmo" : `Te alejas (+${pullAway.toFixed(2)}s/v)`,
            statusColor: "text-good",
          };
        }
      }
    }

    return {
      ahead: buildTarget(carAhead, true),
      behind: buildTarget(carBehind, false),
      me,
    };
  });
</script>

{#snippet targetCard(label: string, t: TargetInfo | null, isAhead: boolean)}
  <div class="hud-tile flex flex-col gap-1 px-2.5 py-2">
    <div class="flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
      <span class="flex items-center gap-1 text-accent">
        <span>{isAhead ? "▲ DELANTE" : "▼ DETRÁS"}</span>
        {#if t}
          <span class="rounded bg-white/10 px-1 py-px text-white">P{sameClassOnly ? t.car.classPlace : t.car.place}</span>
        {/if}
      </span>
      {#if t}
        <span class="font-display text-xs font-extrabold tabular-nums text-white">
          {isAhead ? "-" : "+"}{t.gapSec.toFixed(2)}s
        </span>
      {/if}
    </div>

    {#if t}
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <span
            class="rounded px-1 py-px font-display text-[11px] font-extrabold text-white"
            style:background={classColor(t.car.class)}
          >
            #{t.car.number || t.car.place}
          </span>
          <span class="truncate text-[13px] font-semibold text-white">{shortName(t.car.driver)}</span>
        </div>
        {#if showLastLap && (t.car.lastLap > 0 || t.car.bestLap > 0)}
          <span class="shrink-0 text-[11px] tabular-nums text-muted">
            Últ: {lapTime(t.car.lastLap > 0 ? t.car.lastLap : t.car.bestLap)}
          </span>
        {/if}
      </div>

      <div class="mt-0.5 flex items-center justify-between border-t border-white/10 pt-1 text-[11px] font-bold">
        <span class={t.statusColor}>{t.statusText}</span>
        {#if t.paceDiff != null}
          <span class={["tabular-nums", t.statusColor]}>
            {t.paceDiff > 0 ? `+${t.paceDiff.toFixed(2)}s/v` : `${t.paceDiff.toFixed(2)}s/v`}
          </span>
        {/if}
      </div>
    {:else}
      <div class="py-1 text-xs text-muted">
        {isAhead ? "Líder en pista (sin coche delante)" : "Sin coche detrás"}
      </div>
    {/if}
  </div>
{/snippet}

<div class="hud flex w-[285px] flex-col gap-1.5 p-2.5">
  <div class="flex items-center justify-between px-0.5">
    <div class="flex items-center gap-1.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
      <span class="hud-label text-accent">CAZADOR DE RIVALES</span>
    </div>
    {#if targets.me}
      <span class="text-[10px] font-bold tabular-nums text-muted">
        Mi últ: {lapTime(targets.me.lastLap > 0 ? targets.me.lastLap : targets.me.bestLap)}
      </span>
    {/if}
  </div>

  {@render targetCard("Delante", targets.ahead, true)}
  {@render targetCard("Detrás", targets.behind, false)}
</div>
