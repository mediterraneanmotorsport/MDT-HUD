<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { lapTime } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const maxLaps = $derived(Number(opts.maxLaps ?? 8));
  const showTrend = $derived(opts.showTrend ?? true);

  interface StintLap {
    lap: number;
    time: number;
  }

  let history = $state<StintLap[]>([]);
  let lastRecordedLap = -1;
  let lastSessionKey = "";
  let wasInPits = false;

  $effect(() => {
    const snap = live.snap;
    const me = snap?.vehicles?.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );
    if (!snap || !me) return;

    const sKey = `${snap.session.track}:${snap.session.code}:${me.id}`;
    if (sKey !== lastSessionKey) {
      history = [];
      lastRecordedLap = me.totalLaps;
      lastSessionKey = sKey;
      wasInPits = me.inPits;
      return;
    }

    // Reset stint history after exiting a pitstop
    if (wasInPits && !me.inPits) {
      history = [];
    }
    wasInPits = me.inPits;

    if (me.totalLaps > lastRecordedLap && me.lastLap > 20 && me.lastLap < 600) {
      lastRecordedLap = me.totalLaps;
      const next = [...history, { lap: me.totalLaps, time: me.lastLap }];
      history = next.slice(-15);
    }
  });

  const demoLaps: StintLap[] = [
    { lap: 4, time: 118.42 },
    { lap: 5, time: 118.18 },
    { lap: 6, time: 118.25 },
    { lap: 7, time: 118.48 },
    { lap: 8, time: 118.71 },
    { lap: 9, time: 119.05 },
  ];

  const laps = $derived(history.length > 0 ? history.slice(-maxLaps) : edit ? demoLaps.slice(-maxLaps) : []);

  const stats = $derived.by(() => {
    if (laps.length === 0) return null;
    const times = laps.map((l) => l.time);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const avgT = times.reduce((a, b) => a + b, 0) / times.length;
    const latest = times[times.length - 1];
    const dropOff = latest - minT;

    let status: { label: string; cls: string } = {
      label: "RITMO SÓLIDO",
      cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    };
    if (dropOff >= 0.85) {
      status = { label: "CLIFF / BOXES", cls: "bg-rose-500/25 text-rose-300 border-rose-500/50 animate-pulse" };
    } else if (dropOff >= 0.35) {
      status = { label: "DEGRADANDO", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
    }

    return { minT, maxT, avgT, latest, dropOff, status };
  });
</script>

{#if stats || edit}
  <div class="hud w-[290px] select-none p-3 text-xs">
    <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
      <span class="hud-title">RITMO DE STINT</span>
      {#if stats && showTrend}
        <span class={["rounded border px-1.5 py-0.5 font-mono text-[9px] font-black uppercase", stats.status.cls]}>
          {stats.status.label}
        </span>
      {/if}
    </div>

    {#if stats && laps.length > 0}
      {@const span = Math.max(0.5, stats.maxT - stats.minT)}
      <!-- Mini bar chart of recent laps (taller = slower / more degradation) -->
      <div class="mt-2.5 flex h-[64px] items-end gap-1.5 px-1">
        {#each laps as item (item.lap)}
          {@const deltaFromBest = item.time - stats.minT}
          {@const hPct = Math.max(18, Math.min(100, 22 + (deltaFromBest / span) * 78))}
          {@const barColor =
            deltaFromBest <= 0.05
              ? "#22c55e"
              : deltaFromBest < 0.4
                ? "#38bdf8"
                : deltaFromBest < 0.85
                  ? "#f59e0b"
                  : "#ef4444"}
          <div class="flex flex-1 flex-col items-center gap-1 h-full justify-end" title="V{item.lap}: {lapTime(item.time)} (+{deltaFromBest.toFixed(2)}s)">
            <div
              class="w-full rounded-t transition-all duration-300"
              style:height="{hPct}%"
              style:background={barColor}
            ></div>
            <span class="font-mono text-[9px] text-muted">V{item.lap}</span>
          </div>
        {/each}
      </div>

      <div class="mt-2 grid grid-cols-3 gap-1.5 border-t border-white/10 pt-2 font-mono text-[10px]">
        <div>
          <div class="text-muted">Mejor</div>
          <div class="font-bold text-emerald-400">{lapTime(stats.minT)}</div>
        </div>
        <div>
          <div class="text-muted">Última</div>
          <div class="font-bold text-white">{lapTime(stats.latest)}</div>
        </div>
        <div class="text-right">
          <div class="text-muted">Caída</div>
          <div class={["font-bold", stats.dropOff >= 0.85 ? "text-rose-400" : stats.dropOff >= 0.35 ? "text-amber-300" : "text-emerald-400"]}>
            +{stats.dropOff.toFixed(2)}s
          </div>
        </div>
      </div>
    {:else}
      <div class="py-4 text-center text-[11px] text-muted">
        Completa vueltas para analizar la degradación del stint.
      </div>
    {/if}
  </div>
{/if}
