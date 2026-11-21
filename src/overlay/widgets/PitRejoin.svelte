<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { classColor, shortName } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const pitLoss = $derived(Number(opts.pitLossSec ?? 32));
  const sameClassOnly = $derived(opts.sameClassOnly ?? true);
  const showGaps = $derived(opts.showGaps ?? true);

  interface RejoinPrediction {
    currentPos: number;
    rejoinPos: number;
    posDelta: number;
    ahead: { driver: string; number: string; gap: number; cls: string } | null;
    behind: { driver: string; number: string; gap: number; cls: string } | null;
    cleanAir: boolean;
    cls: string;
  }

  const prediction = $derived.by<RejoinPrediction | null>(() => {
    const snap = live.snap;
    const me = snap?.vehicles?.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );

    if (!snap || !me || !snap.vehicles?.length) {
      if (!edit) return null;
      return {
        currentPos: 3,
        rejoinPos: 6,
        posDelta: -3,
        ahead: { driver: "K. Estre", number: "6", gap: 1.8, cls: "Hypercar" },
        behind: { driver: "A. Fuoco", number: "50", gap: 2.4, cls: "Hypercar" },
        cleanAir: false,
        cls: "Hypercar",
      };
    }

    const lapRef = me.estimatedLapTime > 30 ? me.estimatedLapTime : me.bestLap > 30 ? me.bestLap : 120;
    const pool = snap.vehicles.filter((v) => !v.inGarage && (!sameClassOnly || v.class === me.class));
    if (pool.length === 0) return null;

    // Effective race time behind leader (combining lapsBehindLeader * lapRef + timeBehindLeader)
    const effectiveGap = (v: Vehicle) => (v.lapsBehindLeader || 0) * lapRef + (v.timeBehindLeader || 0);
    const myCurrentGap = effectiveGap(me);
    const myVirtualGap = myCurrentGap + pitLoss;

    const rivals = pool
      .filter((v) => v.id !== me.id)
      .map((v) => ({ v, t: effectiveGap(v) }))
      .sort((a, b) => a.t - b.t);

    let aheadItem: { v: Vehicle; t: number } | null = null;
    let behindItem: { v: Vehicle; t: number } | null = null;
    let carsAheadCount = 0;

    for (const r of rivals) {
      if (r.t <= myVirtualGap) {
        carsAheadCount++;
        aheadItem = r;
      } else if (!behindItem) {
        behindItem = r;
      }
    }

    const currentPos = sameClassOnly ? me.classPlace || me.place : me.place;
    const rejoinPos = carsAheadCount + 1;
    const aheadGap = aheadItem ? Math.max(0, myVirtualGap - aheadItem.t) : 99;
    const behindGap = behindItem ? Math.max(0, behindItem.t - myVirtualGap) : 99;
    const cleanAir = Math.min(aheadGap, behindGap) >= 2.5;

    return {
      currentPos,
      rejoinPos,
      posDelta: currentPos - rejoinPos,
      ahead: aheadItem
        ? { driver: aheadItem.v.driver, number: aheadItem.v.number, gap: aheadGap, cls: aheadItem.v.class }
        : null,
      behind: behindItem
        ? { driver: behindItem.v.driver, number: behindItem.v.number, gap: behindGap, cls: behindItem.v.class }
        : null,
      cleanAir,
      cls: me.class,
    };
  });
</script>

{#if prediction}
  <div class="hud w-[285px] select-none p-3 text-xs">
    <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
      <div class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full" style:background={classColor(prediction.cls)}></span>
        <span class="hud-title">PIT REJOIN ({pitLoss}s)</span>
      </div>
      <span
        class={[
          "rounded px-1.5 py-0.5 font-mono text-[10px] font-black uppercase",
          prediction.cleanAir
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
            : "bg-amber-500/20 text-amber-300 border border-amber-500/40",
        ]}
      >
        {prediction.cleanAir ? "AIRE LIMPIO" : "EN TRÁFICO"}
      </span>
    </div>

    <div class="mt-2 flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-2 border border-white/10">
      <div class="flex flex-col">
        <span class="text-[10px] text-muted uppercase">Salida estimada</span>
        <div class="flex items-baseline gap-2">
          <span class="font-display text-2xl font-black text-white">P{prediction.rejoinPos}</span>
          <span
            class={[
              "font-mono text-xs font-bold",
              prediction.posDelta < 0 ? "text-rose-400" : prediction.posDelta > 0 ? "text-emerald-400" : "text-muted",
            ]}
          >
            ({prediction.posDelta === 0 ? "=" : prediction.posDelta > 0 ? `+${prediction.posDelta}` : prediction.posDelta})
          </span>
        </div>
      </div>
      <div class="text-right font-mono text-[11px] text-muted">
        <div>Actual: <span class="font-bold text-fg">P{prediction.currentPos}</span></div>
        <div class="text-[10px] opacity-75">{sameClassOnly ? "En tu clase" : "General"}</div>
      </div>
    </div>

    {#if showGaps}
      <div class="mt-2 flex flex-col gap-1 font-mono text-[11px]">
        <div class="flex items-center justify-between rounded bg-black/30 px-2 py-1">
          <span class="text-muted truncate max-w-[175px]">
            ▲ {#if prediction.ahead}#{prediction.ahead.number} {shortName(prediction.ahead.driver)}{:else}Pista libre delante{/if}
          </span>
          <span class="font-bold text-cyan-300">
            {prediction.ahead ? `-${prediction.ahead.gap.toFixed(1)}s` : "–"}
          </span>
        </div>
        <div class="flex items-center justify-between rounded bg-black/30 px-2 py-1">
          <span class="text-muted truncate max-w-[175px]">
            ▼ {#if prediction.behind}#{prediction.behind.number} {shortName(prediction.behind.driver)}{:else}Pista libre detrás{/if}
          </span>
          <span class="font-bold text-amber-300">
            {prediction.behind ? `+${prediction.behind.gap.toFixed(1)}s` : "–"}
          </span>
        </div>
      </div>
    {/if}
  </div>
{/if}
