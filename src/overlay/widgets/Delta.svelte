<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { delta, lapTime } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const snap = $derived(live.snap);
  const usePb = $derived(opts.reference !== "session");
  const value = $derived.by(() => {
    if (!snap?.player) return null;
    if (usePb) return snap.timing.deltaPb;
    return snap.timing.sessionBest > 0 ? snap.player.deltaBest : null;
  });
  const predicted = $derived.by(() => {
    if (!snap || value == null) return null;
    const base = usePb ? snap.timing.personalBest : snap.timing.sessionBest;
    return base > 0 ? base + value : null;
  });
  const range = $derived(opts.range ?? 2);
  const frac = $derived(value == null ? 0 : Math.max(-1, Math.min(1, value / range)));
  const color = $derived(value == null ? "var(--color-muted)" : value <= 0 ? "var(--color-good)" : "var(--color-bad)");
  const borderClass = $derived(
    value == null ? "" : value < -0.005 ? "hud-delta-good" : value > 0.005 ? "hud-delta-bad" : "",
  );
</script>

<div class={["hud w-[280px] px-3.5 py-3 transition-all duration-150", borderClass]}>
  <div class="flex items-center justify-between">
    <span class="hud-title">{usePb ? "Delta vs PB" : "Delta vs Mejor"}</span>
    <span class="text-[13px] text-muted">{lapTime(predicted)}</span>
  </div>
  <div class="hud-value mt-1.5 text-center text-[40px]" style:color>{delta(value)}</div>
  <div class="relative mt-2.5 h-2 rounded-full bg-hud-2">
    <div class="absolute -top-1 left-1/2 h-4 w-0.5 -translate-x-1/2 rounded bg-white/60"></div>
    <div
      class="absolute top-0 h-full rounded-full transition-all duration-100"
      style:background={color}
      style:box-shadow={value != null ? `0 0 10px ${color}` : "none"}
      style:left={frac < 0 ? `${50 + frac * 50}%` : "50%"}
      style:width="{Math.abs(frac) * 50}%"
    ></div>
  </div>
</div>
