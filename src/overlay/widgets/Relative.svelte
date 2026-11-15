<script lang="ts">
  import { api } from "../../lib/api";
  import { config, type Units } from "../../lib/config.svelte";
  import { relativeGap } from "../../lib/estimates";
  import { classColor, isTeammate, lapTime, penaltyBadge, penaltyTitle, shortName } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";
  import CarLogo from "../CarLogo.svelte";
  import EnergyBadge from "../EnergyBadge.svelte";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();
  const teammates = $derived(config.value.general.teammates);

  interface Row {
    v: Vehicle;
    /** Seconds; positive = ahead on track. */
    gap: number;
    /** +1 car is a lap (or more) ahead in the race, -1 behind, 0 same lap. */
    lapDiff: number;
  }

  const rows = $derived.by((): Row[] => {
    const snap = live.snap;
    const me = snap?.vehicles.find((v) =>
      snap.focusedSlot != null
        ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot
        : v.isPlayer,
    );
    if (!snap || !me) return [];
    const len = snap.session.trackLength || 1;
    const lapTime = me.estimatedLapTime > 0 ? me.estimatedLapTime : snap.strategy.avgLapTime || 100;
    const myTotal = me.totalLaps * len + me.lapDist;

    const others: Row[] = snap.vehicles
      .filter((v) => (snap.focusedSlot != null ? v.slotId !== snap.focusedSlot && v.id !== snap.focusedSlot : !v.isPlayer) && !v.inGarage)
      .map((v) => {
        let d = v.lapDist - me.lapDist;
        if (d > len / 2) d -= len;
        if (d < -len / 2) d += len;
        const raceDiff = v.totalLaps * len + v.lapDist - myTotal - d;
        return { v, gap: relativeGap(me, v, len, lapTime), lapDiff: Math.round(raceDiff / len) };
      });
    const ahead = others
      .filter((r) => r.gap >= 0)
      .sort((a, b) => a.gap - b.gap)
      .slice(0, opts.ahead ?? 3)
      .reverse();
    const behind = others
      .filter((r) => r.gap < 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, opts.behind ?? 3);
    return [...ahead, { v: me, gap: 0, lapDiff: 0 }, ...behind];
  });

  function nameColor(r: Row) {
    if (r.v.isPlayer || !(opts.colorLapped ?? true)) return undefined;
    if (r.lapDiff > 0) return "#38bdf8"; // Cian: vuelta ganada / cuidado bandera azul
    if (r.lapDiff < 0) return "#fb923c"; // Naranja: coche doblado
    return undefined;
  }

  const meCar = $derived(live.snap?.vehicles.find((v) => v.isPlayer) ?? null);
  const showEnergy = $derived(opts.showEnergy ?? true);
  const showPaceDiff = $derived(opts.showPaceDiff ?? true);
  // Use every car in the session, including those outside the relative rows.
  const classBests = $derived.by(() => {
    const bests = new Map<string, number>();
    for (const v of live.snap?.vehicles ?? []) {
      if (v.bestLap > 0) bests.set(v.class, Math.min(bests.get(v.class) ?? Infinity, v.bestLap));
    }
    return bests;
  });

  /** Purple = class best; green = personal best on the last lap. */
  function tone(t: number, v: Vehicle, personal: boolean): string | undefined {
    if (!opts.colorTimes || t <= 0) return undefined;
    const classBest = classBests.get(v.class) ?? 0;
    if (classBest > 0 && t <= classBest + 1e-4) return "var(--color-best)";
    if (personal && v.bestLap > 0 && t <= v.bestLap + 1e-4) return "var(--color-good)";
    return undefined;
  }

  const width = $derived(
    300 + (showEnergy ? 46 : 0) + (showPaceDiff ? 54 : 0) + (opts.showLast ? 78 : 0) + (opts.showBest ? 78 : 0),
  );
  const columns = $derived(
    [
      "22px", // position
      "36px", // number
      "18px", // logo
      "minmax(0,1fr)", // driver
      "auto", // pit and penalty status
      showEnergy ? "40px" : "",
      showPaceDiff ? "48px" : "",
      opts.showLast ? "70px" : "",
      opts.showBest ? "70px" : "",
      "48px", // gap
    ]
      .filter(Boolean)
      .join(" "),
  );
</script>

{#snippet time(t: number, color: string | undefined, label: string)}
  <span class="text-right" title={label}>
    <span
      class={["rounded-[4px] px-1 text-[13px] opacity-75", color && "font-semibold text-white opacity-100!"]}
      style:background={color}>{lapTime(t)}</span
    >
  </span>
{/snippet}

<div class="hud py-1.5 text-[14px]" style:width="{width}px">
  {#each rows as r (r.v.id)}
    {@const mate = isTeammate(r.v, teammates)}
    <div
      class={[
        "mx-1.5 grid h-[26px] items-center gap-x-2 rounded-md px-1.5 cursor-pointer transition-colors hover:ring-1 hover:ring-accent",
        r.v.isPlayer
          ? "bg-accent text-white"
          : mate && "bg-accent/20 ring-1 ring-accent/60",
      ]}
      style:grid-template-columns={columns}
      onclick={() => {
        const s = r.v.slotId ?? r.v.id;
        api.focusVehicle(s);
        api.setFocusedSlot(s);
      }}
      title="Click para enfocar coche #{r.v.number} {r.v.driver} en el juego y ver su telemetría"
      role="button"
      tabindex="0"
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          const s = r.v.slotId ?? r.v.id;
          api.focusVehicle(s);
          api.setFocusedSlot(s);
        }
      }}
    >
      <span class="text-right font-semibold">{r.v.classPlace}</span>
      <span class="rounded-[4px] text-center text-[12px] leading-[18px] font-bold text-white" style:background={classColor(r.v.class)}>{r.v.number || "–"}</span>
      <CarLogo model={r.v.model} entry={r.v.vehicle} />
      <span class="flex min-w-0 items-center gap-1.5">
        {#if mate}
          <img src="/mdt-logo.png" alt="MDT" title="Compañero MDT" class="h-3.5 w-auto shrink-0 object-contain" />
        {/if}
        <span class="truncate font-medium" style:color={nameColor(r)}>{shortName(r.v.driver)}</span>
      </span>
      <span class="flex gap-1">
        {#if r.v.inPits}<span class="rounded-[4px] bg-white px-1 text-[10px] leading-4 font-bold text-black">PIT</span>{/if}
        {#if r.v.numPenalties > 0}
          <span
            class="rounded-[4px] bg-warn px-1 text-[10px] leading-4 font-bold text-black"
            title={penaltyTitle(r.v)}>{penaltyBadge(r.v)}</span
          >
        {/if}
      </span>
      {#if showEnergy}
        <EnergyBadge value={r.v.virtualEnergy} />
      {/if}
      {#if showPaceDiff}
        {@const myLap = meCar ? (meCar.lastLap > 0 ? meCar.lastLap : meCar.bestLap) : 0}
        {@const rivLap = r.v.lastLap > 0 ? r.v.lastLap : r.v.bestLap}
        {@const diff = !r.v.isPlayer && myLap > 0 && rivLap > 0 ? rivLap - myLap : null}
        <span
          class={[
            "text-right text-[11px] font-semibold tabular-nums",
            diff == null ? "text-muted" : diff > 0 ? "text-good" : "text-bad",
          ]}
          title="Diferencia de ritmo en la última vuelta (verde = eres más rápido)"
        >
          {diff == null ? "" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}s`}
        </span>
      {/if}
      {#if opts.showLast}
        {@render time(r.v.lastLap, tone(r.v.lastLap, r.v, true), "Última vuelta")}
      {/if}
      {#if opts.showBest}
        {@render time(r.v.bestLap, tone(r.v.bestLap, r.v, false), "Mejor vuelta")}
      {/if}
      <span class="text-right font-semibold">{r.v.isPlayer ? "" : (r.gap > 0 ? "−" : "+") + Math.abs(r.gap).toFixed(1)}</span>
    </div>
  {:else}
    <div class="px-3 py-2 text-muted">Sin coches</div>
  {/each}
</div>
