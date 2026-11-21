<script lang="ts">
  import { scale } from "svelte/transition";
  import type { Units } from "../../lib/config.svelte";
  import { classColor, shortName } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const behindThreshold = $derived(Number(opts.behindThreshold ?? 2.5));
  const aheadThreshold = $derived(Number(opts.aheadThreshold ?? 2.0));
  const showFasterBehind = $derived(opts.showFasterBehind ?? true);
  const showSlowerAhead = $derived(opts.showSlowerAhead ?? true);

  function classRank(cls: string): number {
    const c = (cls || "").toLowerCase();
    if (c.includes("hyper") || c.includes("lmh") || c.includes("lmdh") || c.includes("lmp1")) return 3;
    if (c.includes("lmp2") || c.includes("p2")) return 2;
    if (c.includes("lmp3") || c.includes("p3")) return 1.5;
    return 1; // GT3 / LMGT3 / GTE
  }

  interface TrafficAlert {
    type: "faster_behind" | "slower_ahead";
    cls: string;
    driver: string;
    number: string;
    gapSec: number;
    closingKph: number;
  }

  const alert = $derived.by<TrafficAlert | null>(() => {
    const snap = live.snap;
    const me = snap?.vehicles?.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );
    const trackLen = snap?.session?.trackLength ?? 0;

    if (!snap || !me || !snap.inRealtime || me.inPits || me.inGarage || trackLen <= 100) {
      if (!edit) return null;
      return {
        type: "faster_behind",
        cls: "Hypercar",
        driver: "A. Pier Guidi",
        number: "51",
        gapSec: 1.4,
        closingKph: 38,
      };
    }

    const myRank = classRank(me.class);
    const estLap = me.estimatedLapTime > 30 ? me.estimatedLapTime : me.bestLap > 30 ? me.bestLap : 120;
    const mySpeed = Math.max(20, me.speed);

    let bestBehind: TrafficAlert | null = null;
    let bestAhead: TrafficAlert | null = null;

    for (const v of snap.vehicles) {
      if (v.id === me.id || v.inPits || v.inGarage) continue;
      const r = classRank(v.class);
      if (r === myRank) continue;

      // Signed physical track distance: positive = v is ahead of me, negative = v is behind me
      let dDist = v.lapDist - me.lapDist;
      if (dDist > trackLen / 2) dDist -= trackLen;
      if (dDist < -trackLen / 2) dDist += trackLen;

      const avgSpeed = Math.max(20, (v.speed + mySpeed) / 2);
      const gapSec = Math.abs(dDist) / avgSpeed;
      const closingKph = Math.round(Math.max(0, (v.speed - mySpeed) * 3.6 * (dDist < 0 ? 1 : -1)));

      if (showFasterBehind && r > myRank && dDist < 0 && gapSec <= behindThreshold) {
        if (!bestBehind || gapSec < bestBehind.gapSec) {
          bestBehind = {
            type: "faster_behind",
            cls: v.class,
            driver: v.driver,
            number: v.number || String(v.id),
            gapSec,
            closingKph,
          };
        }
      } else if (showSlowerAhead && r < myRank && dDist > 0 && gapSec <= aheadThreshold) {
        if (!bestAhead || gapSec < bestAhead.gapSec) {
          bestAhead = {
            type: "slower_ahead",
            cls: v.class,
            driver: v.driver,
            number: v.number || String(v.id),
            gapSec,
            closingKph,
          };
        }
      }
    }

    // Prioritize faster car behind (blue flag danger) over slower car ahead
    return bestBehind ?? bestAhead;
  });
</script>

{#if alert}
  {@const isBehind = alert.type === "faster_behind"}
  {@const cColor = classColor(alert.cls)}
  <div
    transition:scale={{ start: 0.9, duration: 200 }}
    class={[
      "hud relative flex w-[310px] items-center justify-between gap-3 overflow-hidden px-3 py-2.5 shadow-2xl select-none",
      isBehind ? "border-l-4 border-l-[#1d6cf2] mdt-shimmer-loop" : "border-l-4 border-l-[#f5a524]",
    ]}
  >
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="flex items-center gap-1.5">
        <span
          class="rounded px-1.5 py-0.5 font-display text-[10px] font-black uppercase text-white"
          style:background={cColor}
        >
          {alert.cls}
        </span>
        <span
          class={[
            "font-display text-[11px] font-black tracking-wider uppercase",
            isBehind ? "text-blue-400" : "text-amber-400",
          ]}
        >
          {isBehind ? "▲ TRÁFICO RÁPIDO DETRÁS" : "▼ TRÁFICO LENTO DELANTE"}
        </span>
      </div>
      <div class="flex items-center gap-1.5 text-xs">
        <span class="font-mono font-bold text-white/60">#{alert.number}</span>
        <span class="truncate font-semibold text-white">{shortName(alert.driver)}</span>
      </div>
    </div>

    <div class="shrink-0 text-right font-mono">
      <div class={["text-lg font-black leading-none", isBehind ? "text-blue-300" : "text-amber-300"]}>
        {alert.gapSec.toFixed(1)}s
      </div>
      {#if alert.closingKph > 4}
        <div class="mt-0.5 text-[10px] font-bold text-muted">+{alert.closingKph} km/h</div>
      {/if}
    </div>
  </div>
{/if}
