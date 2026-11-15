<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { config, type Units } from "../../lib/config.svelte";
  import { classColor, clock, isTeammate, lapTime, shortName } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const showFastestLaps = $derived(opts.showFastestLaps ?? true);
  const showSessionStatus = $derived(opts.showSessionStatus ?? true);
  const showIntervals = $derived(opts.showIntervals ?? true);
  const showTeammates = $derived(opts.showTeammates ?? true);
  const cycleSeconds = $derived(Math.max(3, Math.min(15, Number(opts.speed ?? 5))));

  let pageIndex = $state(0);

  onMount(() => {
    const timer = setInterval(() => {
      pageIndex = (pageIndex + 1) % 4;
    }, cycleSeconds * 1000);
    return () => clearInterval(timer);
  });

  const snap = $derived(live.snap);
  const session = $derived(snap?.session);
  const vehicles = $derived(snap?.vehicles ?? []);
  const sortedVehicles = $derived([...vehicles].sort((a, b) => a.place - b.place));
  const teammates = $derived(config.value.general.teammates);

  // Overall fastest lap across session
  const overallBest = $derived(
    sortedVehicles.reduce((best, v) => (v.bestLap > 0 && (best === 0 || v.bestLap < best) ? v.bestLap : best), 0)
  );

  // Class leaders
  const classLeaders = $derived.by<Vehicle[]>(() => {
    const seen = new Set<string>();
    const leaders: Vehicle[] = [];
    for (const v of sortedVehicles) {
      if (!seen.has(v.class)) {
        seen.add(v.class);
        leaders.push(v);
      }
    }
    return leaders;
  });

  // Flag info
  const flagText = $derived.by(() => {
    if (!session) return "BANDERA VERDE";
    if (session.yellowFlagState === 1) return "🟡 BANDERA AMARILLA (SECTOR)";
    if (session.yellowFlagState === 2) return "⚠️ FULL COURSE YELLOW (FCY)";
    if (session.yellowFlagState === 3) return "🚗 SAFETY CAR EN PISTA";
    return "🟢 PISTA LIBRE";
  });
</script>

<div class="hud relative flex h-10 w-[960px] max-w-full items-center overflow-hidden rounded-lg border border-white/20 bg-[#071220]/95 px-3 text-xs shadow-2xl backdrop-blur-md select-none">
  <!-- Left TV Branding Badge -->
  <div class="flex h-full items-center gap-2 border-r border-white/15 pr-3">
    <div class="flex items-center gap-1.5 font-display text-xs font-black tracking-widest text-[#2287ec] uppercase">
      <img src="/mdt-logo.png" alt="MDT" class="h-5 w-5 object-contain" />
      <span>MDT·WEC</span>
    </div>
    {#if showSessionStatus && session}
      <span class="rounded bg-black/50 px-2 py-0.5 font-mono text-[11px] font-bold text-white/80">
        L{session.maxLaps > 0 ? `${vehicles[0]?.totalLaps ?? 0}/${session.maxLaps}` : vehicles[0]?.totalLaps ?? 0}
      </span>
      <span class="font-mono text-[11px] font-bold text-accent">
        ⏱️ {clock(session.timeRemaining)}
      </span>
    {/if}
  </div>

  <!-- Dynamic Center Ticker Items (Cycling automatically) -->
  <div class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-3">
    {#if pageIndex === 0}
      <!-- Page 0: Status & Flags & Track -->
      <div class="flex w-full items-center justify-between text-xs animate-in fade-in duration-300">
        <span class="font-sans font-bold text-white/90 uppercase tracking-wide">
          📍 {session?.track ?? "Circuito de Le Mans"} · {session?.kind ? session.kind.toUpperCase() : "CARRERA WEC"}
        </span>
        <span class={[
          "rounded px-2.5 py-0.5 font-mono font-black text-xs uppercase",
          session?.yellowFlagState ? "bg-amber-500/25 text-amber-400 border border-amber-500/50" : "bg-emerald-500/20 text-emerald-400"
        ]}>
          {flagText}
        </span>
      </div>
    {:else if pageIndex === 1}
      <!-- Page 1: Class Leaders (Hypercar, LMP2, LMGT3) -->
      <div class="flex w-full items-center gap-4 overflow-x-auto text-xs animate-in fade-in duration-300">
        <span class="font-display text-[10px] font-black text-white/50 uppercase tracking-wider">
          LÍDERES DE CLASE:
        </span>
        {#each classLeaders as leader (leader.id)}
          {@const cCol = classColor(leader.class)}
          <div class="flex items-center gap-1.5 font-mono">
            <span class="rounded px-1.5 py-0.2 text-[9px] font-black text-white" style:background={cCol}>
              {leader.class.slice(0, 3)}
            </span>
            <span class="font-sans font-bold text-white">#{leader.number || leader.id} {shortName(leader.driver)}</span>
            {#if leader.bestLap > 0}
              <span class="text-[10px] text-white/60">({lapTime(leader.bestLap)})</span>
            {/if}
          </div>
        {/each}
      </div>
    {:else if pageIndex === 2}
      <!-- Page 2: Top 4 Drivers Standings -->
      <div class="flex w-full items-center gap-4 overflow-x-auto text-xs animate-in fade-in duration-300">
        <span class="font-display text-[10px] font-black text-white/50 uppercase tracking-wider">
          TOP POSICIONES:
        </span>
        {#each sortedVehicles.slice(0, 4) as v, idx (v.id)}
          {@const isMate = isTeammate(v, teammates)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="flex items-center gap-1 font-mono cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded transition-colors"
            onclick={() => {
              const s = v.slotId ?? v.id;
              api.focusVehicle(s);
              api.setFocusedSlot(s);
            }}
            title="Click para enfocar coche #{v.number || v.id} {v.driver}"
          >
            <span class="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white" style:background={v.isPlayer ? "#2287ec" : classColor(v.class)}>
              {v.place}
            </span>
            <span class="font-sans font-extrabold text-white">{shortName(v.driver)}</span>
            {#if isMate}
              <img src="/mdt-logo.png" alt="MDT" class="h-3 w-3 object-contain" />
            {/if}
            {#if showIntervals && idx > 0}
              <span class="text-[10px] text-white/60">+{v.timeBehindLeader.toFixed(1)}s</span>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <!-- Page 3: Fastest Lap Highlight -->
      <div class="flex w-full items-center justify-between text-xs animate-in fade-in duration-300">
        <div class="flex items-center gap-2">
          <span class="rounded bg-fuchsia-500/20 px-2 py-0.5 font-display text-[10px] font-black text-fuchsia-400 uppercase border border-fuchsia-500/40">
            ⚡ RECORD DE VUELTA
          </span>
          {#if sortedVehicles.find((v) => v.bestLap === overallBest)}
            {@const fCar = sortedVehicles.find((v) => v.bestLap === overallBest)!}
            <span class="font-sans font-bold text-white">
              #{fCar.number || fCar.id} {shortName(fCar.driver)} ({fCar.class})
            </span>
            <span class="font-mono font-black text-fuchsia-400">
              {lapTime(overallBest)}
            </span>
          {:else}
            <span class="font-mono text-white/60">Sin vuelta rápida registrada</span>
          {/if}
        </div>
        <span class="font-mono text-[10px] text-white/40">MDT TELEMETRY LIVE</span>
      </div>
    {/if}
  </div>

  <!-- Right Cycle Indicator Dots -->
  <div class="flex items-center gap-1 border-l border-white/15 pl-3">
    {#each [0, 1, 2, 3] as idx}
      <span
        class={[
          "h-1.5 w-1.5 rounded-full transition-all duration-300",
          pageIndex === idx ? "w-3 bg-accent shadow" : "bg-white/20"
        ]}
      ></span>
    {/each}
  </div>
</div>
