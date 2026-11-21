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
  const animateFlash = $derived(opts.animateSectorFlash ?? true);
  const frac = $derived(value == null ? 0 : Math.max(-1, Math.min(1, value / range)));
  const color = $derived(value == null ? "var(--color-muted)" : value <= 0 ? "var(--color-good)" : "var(--color-bad)");
  const borderClass = $derived(
    value == null ? "" : value < -0.005 ? "hud-delta-good" : value > 0.005 ? "hud-delta-bad" : "",
  );

  // Track sector / lap completions to trigger purple (session best) or green (personal best) flash
  let prevS1 = -1;
  let prevS2 = -1;
  let prevLap = -1;
  let flashState = $state<{ kind: "purple" | "green"; label: string } | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  function triggerFlash(kind: "purple" | "green", label: string) {
    if (!animateFlash) return;
    flashState = { kind, label };
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashState = null;
    }, 2400);
  }

  $effect(() => {
    if (!snap || !animateFlash) return;
    const me = snap.vehicles.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );
    if (!me) return;

    const classCars = snap.vehicles.filter((v) => v.class === me.class);
    if (me.curS1 > 0 && prevS1 >= 0 && Math.abs(me.curS1 - prevS1) > 0.001) {
      const bestClassS1 = Math.min(...classCars.map((c) => c.bestS1).filter((t) => t > 0), Infinity);
      if (me.curS1 <= bestClassS1 + 0.001) triggerFlash("purple", "S1 MORADO");
      else if (me.bestS1 > 0 && me.curS1 <= me.bestS1 + 0.001) triggerFlash("green", "S1 VERDE");
    }
    if (me.curS2 > 0 && prevS2 >= 0 && Math.abs(me.curS2 - prevS2) > 0.001) {
      const bestClassS2 = Math.min(...classCars.map((c) => c.bestS2).filter((t) => t > 0), Infinity);
      if (me.curS2 <= bestClassS2 + 0.001) triggerFlash("purple", "S2 MORADO");
      else if (me.bestS2 > 0 && me.curS2 <= me.bestS2 + 0.001) triggerFlash("green", "S2 VERDE");
    }
    if (me.lastLap > 0 && prevLap >= 0 && Math.abs(me.lastLap - prevLap) > 0.001) {
      const bestClassLap = Math.min(...classCars.map((c) => c.bestLap).filter((t) => t > 0), Infinity);
      if (me.lastLap <= bestClassLap + 0.001) triggerFlash("purple", "VUELTA RÁPIDA");
      else if (me.bestLap > 0 && me.lastLap <= me.bestLap + 0.001) triggerFlash("green", "MEJOR PERSONAL");
    }

    prevS1 = me.curS1;
    prevS2 = me.curS2;
    prevLap = me.lastLap;
  });
</script>

<div
  class={[
    "hud relative w-[280px] px-3.5 py-3 transition-all duration-150",
    !flashState && borderClass,
    flashState?.kind === "purple" && "mdt-anim-sector-purple mdt-shimmer-overlay",
    flashState?.kind === "green" && "mdt-anim-sector-green mdt-shimmer-overlay",
  ]}
>
  <div class="flex items-center justify-between">
    {#if flashState}
      <span
        class={[
          "rounded px-1.5 py-0.5 font-display text-[10px] font-black tracking-wider uppercase text-white",
          flashState.kind === "purple" ? "bg-[#a855f7]" : "bg-[#16a34a]",
        ]}
      >
        {flashState.label}
      </span>
    {:else}
      <span class="hud-title">{usePb ? "Delta vs PB" : "Delta vs Mejor"}</span>
    {/if}
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
