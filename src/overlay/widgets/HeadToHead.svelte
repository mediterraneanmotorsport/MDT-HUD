<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { classColor, lapTime, shortName, speed, speedUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const mode = $derived(opts.mode ?? "auto_ahead");
  const showSectors = $derived(opts.showSectors ?? true);
  const showEnergy = $derived(opts.showEnergy ?? true);

  const pair = $derived.by<{ left: Vehicle; right: Vehicle; gapSec: number } | null>(() => {
    const snap = live.snap;
    if (!snap || !snap.vehicles || snap.vehicles.length < 2) {
      if (!edit) return null;
      const demoL = {
        id: 1, place: 1, classPlace: 1, driver: "K. Estre", number: "6", class: "Hypercar",
        speed: 82.4, bestLap: 201.12, lastLap: 201.48, bestS1: 31.9, bestS2: 44.1, curS1: 32.0, curS2: 44.3,
        tyreCompounds: ["Medium"], virtualEnergy: 0.71, numPitstops: 1, timeBehindLeader: 0,
      } as unknown as Vehicle;
      const demoR = {
        id: 2, place: 2, classPlace: 2, driver: "A. Pier Guidi", number: "51", class: "Hypercar",
        speed: 84.1, bestLap: 201.35, lastLap: 201.29, bestS1: 32.1, bestS2: 44.0, curS1: 31.95, curS2: 44.2,
        tyreCompounds: ["Soft"], virtualEnergy: 0.65, numPitstops: 1, timeBehindLeader: 0.64,
      } as unknown as Vehicle;
      return { left: demoL, right: demoR, gapSec: 0.64 };
    }

    const target = snap.vehicles.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    ) ?? snap.vehicles[0];

    const sameClass = [...snap.vehicles]
      .filter((v) => v.class === target.class && !v.inGarage)
      .sort((a, b) => a.place - b.place);

    if (sameClass.length < 2) return null;

    let left: Vehicle;
    let right: Vehicle;

    if (mode === "top2") {
      left = sameClass[0];
      right = sameClass[1];
    } else if (mode === "auto_leader") {
      left = sameClass[0];
      right = target.id === left.id ? sameClass[1] : target;
    } else {
      const idx = sameClass.findIndex((v) => v.id === target.id);
      if (idx > 0) {
        left = sameClass[idx - 1];
        right = sameClass[idx];
      } else {
        left = sameClass[0];
        right = sameClass[1];
      }
    }

    const gapSec = Math.abs((right.timeBehindLeader || 0) - (left.timeBehindLeader || 0));
    return { left, right, gapSec };
  });

  function fmtDelta(a: number, b: number): { text: string; winner: "left" | "right" | "tie" } {
    if (a <= 0 || b <= 0) return { text: "–", winner: "tie" };
    const d = b - a;
    if (Math.abs(d) < 0.002) return { text: "0.000", winner: "tie" };
    return {
      text: `${d > 0 ? "+" : ""}${d.toFixed(3)}`,
      winner: d > 0 ? "left" : "right",
    };
  }
</script>

{#if pair}
  {@const l = pair.left}
  {@const r = pair.right}
  {@const cColor = classColor(l.class)}
  {@const spL = Math.round(speed(l.speed, units))}
  {@const spR = Math.round(speed(r.speed, units))}
  {@const maxSp = Math.max(100, spL, spR)}
  {@const bestDiff = fmtDelta(l.bestLap, r.bestLap)}
  {@const lastDiff = fmtDelta(l.lastLap, r.lastLap)}

  <div class="hud w-[440px] select-none overflow-hidden rounded-xl border border-white/20 bg-[#060f1e]/95 p-3 shadow-2xl backdrop-blur-md text-xs">
    <!-- Header -->
    <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
      <div class="flex items-center gap-2">
        <span class="rounded px-1.5 py-0.5 text-[9px] font-black uppercase text-white" style:background={cColor}>
          {l.class}
        </span>
        <span class="hud-title">HEAD TO HEAD</span>
      </div>
      <span class="rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] font-black text-accent">
        GAP {pair.gapSec.toFixed(2)}s
      </span>
    </div>

    <!-- Driver Titles -->
    <div class="grid grid-cols-2 gap-3 pb-2 border-b border-white/10">
      <div class="flex flex-col">
        <div class="flex items-center gap-1.5">
          <span class="rounded px-1.5 py-0.5 font-mono text-[10px] font-black text-white" style:background={cColor}>P{l.classPlace || l.place}</span>
          <span class="font-mono text-[11px] font-bold text-white/60">#{l.number || l.id}</span>
        </div>
        <span class="mt-0.5 truncate font-display text-sm font-black text-white uppercase">{shortName(l.driver)}</span>
      </div>
      <div class="flex flex-col items-end text-right">
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-[11px] font-bold text-white/60">#{r.number || r.id}</span>
          <span class="rounded px-1.5 py-0.5 font-mono text-[10px] font-black text-white" style:background={cColor}>P{r.classPlace || r.place}</span>
        </div>
        <span class="mt-0.5 truncate font-display text-sm font-black text-white uppercase">{shortName(r.driver)}</span>
      </div>
    </div>

    <!-- Speed Bar Comparison -->
    <div class="mt-2 flex flex-col gap-1">
      <div class="flex items-center justify-between font-mono text-[11px]">
        <span class={["font-black", spL > spR ? "text-emerald-400" : "text-white"]}>{spL} {speedUnit(units)}</span>
        <span class="text-[9px] font-bold uppercase text-muted">Velocidad</span>
        <span class={["font-black", spR > spL ? "text-emerald-400" : "text-white"]}>{spR} {speedUnit(units)}</span>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <div class="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-white/10">
          <div class="h-full bg-cyan-400 transition-all duration-150" style:width="{Math.round((spL / maxSp) * 100)}%"></div>
        </div>
        <div class="flex h-1.5 justify-start overflow-hidden rounded-r-full bg-white/10">
          <div class="h-full bg-amber-400 transition-all duration-150" style:width="{Math.round((spR / maxSp) * 100)}%"></div>
        </div>
      </div>
    </div>

    <!-- Lap & Sector Rows -->
    <div class="mt-2.5 flex flex-col gap-1 font-mono text-[11px]">
      <div class="grid grid-cols-3 items-center rounded bg-white/[0.03] px-2 py-1">
        <span class={[bestDiff.winner === "left" ? "font-bold text-emerald-400" : "text-white/85"]}>{lapTime(l.bestLap)}</span>
        <span class="text-center text-[9px] font-bold uppercase text-muted">Mejor Vuelta</span>
        <span class={["text-right", bestDiff.winner === "right" ? "font-bold text-emerald-400" : "text-white/85"]}>{lapTime(r.bestLap)}</span>
      </div>

      <div class="grid grid-cols-3 items-center rounded bg-white/[0.03] px-2 py-1">
        <span class={[lastDiff.winner === "left" ? "font-bold text-emerald-400" : "text-white/85"]}>{lapTime(l.lastLap)}</span>
        <span class="text-center text-[9px] font-bold uppercase text-muted">Última Vuelta</span>
        <span class={["text-right", lastDiff.winner === "right" ? "font-bold text-emerald-400" : "text-white/85"]}>{lapTime(r.lastLap)}</span>
      </div>

      {#if showSectors}
        <div class="grid grid-cols-3 items-center rounded bg-white/[0.03] px-2 py-1 text-[10px]">
          <span class="text-white/80">S1 {l.bestS1 > 0 ? l.bestS1.toFixed(2) : "–"} · S2 {l.bestS2 > 0 ? l.bestS2.toFixed(2) : "–"}</span>
          <span class="text-center text-[9px] font-bold uppercase text-muted">Sectores</span>
          <span class="text-right text-white/80">S1 {r.bestS1 > 0 ? r.bestS1.toFixed(2) : "–"} · S2 {r.bestS2 > 0 ? r.bestS2.toFixed(2) : "–"}</span>
        </div>
      {/if}

      {#if showEnergy}
        <div class="grid grid-cols-3 items-center rounded bg-white/[0.03] px-2 py-1 text-[10px]">
          <span class="text-cyan-300 font-bold">
            {l.tyreCompounds?.[0]?.slice(0, 3) || "–"} · {l.virtualEnergy != null ? `${Math.round(l.virtualEnergy * 100)}%` : "–"} · {l.numPitstops}PS
          </span>
          <span class="text-center text-[9px] font-bold uppercase text-muted">Stint</span>
          <span class="text-right text-amber-300 font-bold">
            {r.tyreCompounds?.[0]?.slice(0, 3) || "–"} · {r.virtualEnergy != null ? `${Math.round(r.virtualEnergy * 100)}%` : "–"} · {r.numPitstops}PS
          </span>
        </div>
      {/if}
    </div>
  </div>
{/if}
