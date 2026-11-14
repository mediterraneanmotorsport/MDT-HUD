<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let {}: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const p = $derived(live.snap?.player);
  const MOTOR = ["N/D", "ESPERA", "EMPUJE", "REGEN"];
  const v = (val: number, max: number) =>
    max > 0 ? (val > 0 ? `${val}/${max}` : `OFF/${max}`) : val > 0 ? String(val) : "OFF";
</script>

<div class="hud w-[210px] p-2.5 text-[13px]">
  <div class="mb-1.5 flex items-center justify-between border-b border-hud-line pb-1">
    <span class="hud-title">Electrónica</span>
    {#if p}
      <span class="font-display text-xs font-bold text-accent">MARCHA {p.gear < 0 ? "R" : p.gear === 0 ? "N" : p.gear}</span>
    {/if}
  </div>
  {#if p}
    <div class="grid grid-cols-[1fr_auto] gap-y-0.5 tabular-nums">
      <span class="text-muted">TC</span>
      <span class="font-semibold" class:text-warn={p.tcActive}>{v(p.tc, p.tcMax)}</span>
      <span class="text-muted">TC Slip / Cut</span>
      <span class="font-semibold">{p.tcSlip > 0 || p.tcCut > 0 || p.tcMax > 0 ? `${p.tcSlip} / ${p.tcCut}` : "–"}</span>
      <span class="text-muted">ABS</span>
      <span class="font-semibold" class:text-warn={p.absActive}>{v(p.abs, p.absMax)}</span>
      <span class="text-muted">Mapa motor (MAP)</span>
      <span class="font-semibold">{p.motorMapMax > 0 ? `${p.motorMap}/${p.motorMapMax}` : p.motorMap > 0 ? p.motorMap : "1"}</span>
      <span class="text-muted">Migración (MIG)</span>
      <span class="font-semibold">{p.migration > 0 ? p.migration : "OFF"}</span>
      <span class="text-muted">ARB Del / Tras</span>
      <span class="font-semibold">{p.frontArb} / {p.rearArb}</span>
      <span class="text-muted">Reparto frenos (BB)</span>
      <span class="font-semibold">{(p.brakeBiasFront * 100).toFixed(1)}%</span>
    </div>
    {#if p.electricMotorState > 0}
      <div class="mt-2 border-t border-hud-line pt-2">
        <div class="flex justify-between">
          <span class="text-muted">Híbrido</span>
          <span class="font-semibold">{MOTOR[p.electricMotorState] ?? "–"}</span>
        </div>
        <div class="mt-1 h-1.5 rounded-full bg-hud-2">
          <div class="h-full rounded-full bg-good" style:width="{p.battery * 100}%"></div>
        </div>
        <div class="mt-0.5 flex justify-between text-[11px] text-muted">
          <span>Batería {Math.round(p.battery * 100)}%</span>
          <span>Regen {Math.round(p.regenKw)} kW</span>
        </div>
      </div>
    {/if}
  {:else}
    <div class="py-3 text-center text-muted">Sin coche</div>
  {/if}
</div>
