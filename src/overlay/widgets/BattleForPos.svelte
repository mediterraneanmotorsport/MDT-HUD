<script lang="ts">
  import { api } from "../../lib/api";
  import type { Units } from "../../lib/config.svelte";
  import { classColor, gap, shortName, speed, speedUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const threshold = $derived(Number(opts.deltaThreshold ?? 1.0));
  const showTyres = $derived(opts.showTyres ?? true);
  const showInterval = $derived(opts.showInterval ?? true);
  const showSpeed = $derived(opts.showSpeed ?? true);
  const showClassBadge = $derived(opts.showClassBadge ?? true);
  const sameClassOnly = $derived(opts.sameClassOnly ?? true);

  // Demo fixture cars for edit / demo mode
  const demoAhead: Vehicle = {
    id: 101,
    place: 3,
    classPlace: 3,
    driver: "M. Kirchhöfer",
    vehicle: "#38 Jota Sport",
    team: "Jota Sport",
    class: "Hypercar",
    isPlayer: false,
    totalLaps: 14,
    lapDist: 3400,
    sector: 2,
    bestLap: 201.45,
    lastLap: 201.88,
    bestS1: 32.1,
    bestS2: 44.5,
    lastS1: 32.2,
    lastS2: 44.6,
    curS1: 32.3,
    curS2: 44.7,
    timeBehindNext: 0.42,
    lapsBehindNext: 0,
    timeBehindLeader: 4.8,
    lapsBehindLeader: 0,
    timeIntoLap: 45,
    estimatedLapTime: 202.0,
    inPits: false,
    pitState: 0,
    inGarage: false,
    numPitstops: 1,
    numPenalties: 0,
    finishStatus: 0,
    qualification: 0,
    flag: 0,
    fuelFraction: 0.65,
    speed: 78.4,
    pos: [0, 0, 0],
    control: 0,
    number: "38",
    tyreCompounds: ["Hard", "Hard", "Hard", "Hard"],
  };

  const demoChaser: Vehicle = {
    id: 102,
    place: 4,
    classPlace: 4,
    driver: "A. Pier Guidi",
    vehicle: "#51 Ferrari AF Corse",
    team: "Ferrari AF Corse",
    class: "Hypercar",
    isPlayer: true,
    totalLaps: 14,
    lapDist: 3370,
    sector: 2,
    bestLap: 201.2,
    lastLap: 201.4,
    bestS1: 32.0,
    bestS2: 44.3,
    lastS1: 32.1,
    lastS2: 44.4,
    curS1: 32.1,
    curS2: 44.5,
    timeBehindNext: 0.42,
    lapsBehindNext: 0,
    timeBehindLeader: 5.22,
    lapsBehindLeader: 0,
    timeIntoLap: 45.42,
    estimatedLapTime: 201.5,
    inPits: false,
    pitState: 0,
    inGarage: false,
    numPitstops: 1,
    numPenalties: 0,
    finishStatus: 0,
    qualification: 0,
    flag: 0,
    fuelFraction: 0.62,
    speed: 80.1,
    pos: [0, 0, 0],
    control: 0,
    number: "51",
    tyreCompounds: ["Medium", "Medium", "Medium", "Medium"],
  };

  // Find active battle in live telemetry
  const activeBattle = $derived.by<{ ahead: Vehicle; chaser: Vehicle; diff: number; place: number } | null>(() => {
    if (edit) {
      return { ahead: demoAhead, chaser: demoChaser, diff: 0.42, place: 3 };
    }
    const snap = live.snap;
    if (!snap || !snap.vehicles || snap.vehicles.length < 2) return null;

    const vehicles = [...snap.vehicles].sort((a, b) => a.place - b.place);

    // If there's a player, check battles involving player first
    const pIdx = vehicles.findIndex((v) => v.isPlayer);
    if (pIdx >= 0) {
      // Check ahead
      if (pIdx > 0) {
        const ahead = vehicles[pIdx - 1];
        const me = vehicles[pIdx];
        if (!sameClassOnly || ahead.class === me.class) {
          const diff = Math.max(0, me.timeBehindLeader - ahead.timeBehindLeader);
          if (diff > 0.05 && diff <= threshold && !ahead.inPits && !me.inPits) {
            return { ahead, chaser: me, diff, place: ahead.place };
          }
        }
      }
      // Check behind
      if (pIdx < vehicles.length - 1) {
        const behind = vehicles[pIdx + 1];
        const me = vehicles[pIdx];
        if (!sameClassOnly || behind.class === me.class) {
          const diff = Math.max(0, behind.timeBehindLeader - me.timeBehindLeader);
          if (diff > 0.05 && diff <= threshold && !behind.inPits && !me.inPits) {
            return { ahead: me, chaser: behind, diff, place: me.place };
          }
        }
      }
    }

    // Broadcast mode / global scan for the tightest battle in field
    let bestBattle: { ahead: Vehicle; chaser: Vehicle; diff: number; place: number } | null = null;
    let minDiff = threshold;

    for (let i = 0; i < vehicles.length - 1; i++) {
      const a = vehicles[i];
      const b = vehicles[i + 1];
      if (a.inPits || b.inPits) continue;
      if (sameClassOnly && a.class !== b.class) continue;

      const diff = Math.max(0, b.timeBehindLeader - a.timeBehindLeader);
      if (diff > 0.05 && diff <= minDiff) {
        minDiff = diff;
        bestBattle = { ahead: a, chaser: b, diff, place: a.place };
      }
    }

    return bestBattle;
  });

  let lastBattleSoundTime = 0;
  let prevHadBattle = false;

  $effect(() => {
    const hasBattle = Boolean(activeBattle);
    if (hasBattle && !prevHadBattle && !edit) {
      const now = Date.now();
      if (opts.soundAlert !== false && now - lastBattleSoundTime > 20000) {
        lastBattleSoundTime = now;
        try {
          const audio = new Audio(`/Sound/Batalla/Battle.mp3?t=${now}`);
          audio.volume = Math.max(0.05, Math.min(1.0, opts.soundVolume ?? 0.8));
          audio.play().catch(() => {});
        } catch {
          // audio playback failed or user hasn't interacted
        }
      }
    }
    prevHadBattle = hasBattle;
  });
</script>

{#if activeBattle}
  {@const b = activeBattle}
  {@const cls = b.ahead.class}
  {@const cColor = classColor(cls)}
  {@const tensionPct = Math.max(10, Math.min(100, Math.round((1 - b.diff / Math.max(1, threshold)) * 100)))}

  <div class="hud relative flex flex-col overflow-hidden rounded-xl border border-white/20 bg-[#06101e]/95 p-3 shadow-2xl backdrop-blur-md select-none min-w-[340px] max-w-[420px] animate-in fade-in zoom-in-95 duration-200">
    <!-- Header: Battle Banner -->
    <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
      <div class="flex items-center gap-2">
        <span class="inline-flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping"></span>
        <span class="font-display text-xs font-black tracking-wider text-red-400 uppercase">
          ⚔️ BATTLE FOR P{b.place}
        </span>
      </div>
      {#if showClassBadge}
        <span
          class="rounded px-2 py-0.5 text-[10px] font-black tracking-wider text-white uppercase shadow-sm"
          style:background={cColor}
        >
          {cls}
        </span>
      {/if}
    </div>

    <!-- Drivers Duel Rows -->
    <div class="flex flex-col gap-1.5 font-mono text-xs">
      <!-- Car Ahead (Defender) -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={[
          "flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors border cursor-pointer hover:border-accent",
          b.ahead.isPlayer ? "border-accent bg-accent/25" : "border-white/10 bg-white/[0.04]"
        ]}
        onclick={() => {
          const s = b.ahead.slotId ?? b.ahead.id;
          api.focusVehicle(s);
          api.setFocusedSlot(s);
        }}
        title="Click para enfocar y ver telemetría de #{b.ahead.number || b.ahead.id} {b.ahead.driver}"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="flex h-5 w-6 items-center justify-center rounded font-bold text-white shadow-sm" style:background={cColor}>
            {b.ahead.place}
          </span>
          <span class="font-bold text-white/50">#{b.ahead.number || b.ahead.id}</span>
          <span class="truncate font-sans font-extrabold text-white">{shortName(b.ahead.driver)}</span>
          {#if showTyres && b.ahead.tyreCompounds?.[0]}
            <span class="rounded bg-black/40 px-1.5 py-0.2 text-[9px] font-bold text-white/70">
              {b.ahead.tyreCompounds[0].slice(0, 1)}
            </span>
          {/if}
        </div>
        {#if showSpeed}
          <span class="text-[11px] font-semibold text-white/70">
            {Math.round(speed(b.ahead.speed, units))} {speedUnit(units)}
          </span>
        {/if}
      </div>

      <!-- Gap / Proximity Indicator Bar -->
      <div class="flex items-center justify-between px-2 text-[10px] font-bold">
        <span class="text-white/40">Diferencia</span>
        {#if showInterval}
          <span class="rounded bg-red-500/20 px-2 py-0.5 font-mono text-xs font-black text-red-400 border border-red-500/40">
            +{b.diff.toFixed(2)}s
          </span>
        {/if}
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10 mx-auto px-1">
        <div
          class="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500"
          style:width="{tensionPct}%"
        ></div>
      </div>

      <!-- Chaser (Attacker) -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={[
          "flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors border cursor-pointer hover:border-accent",
          b.chaser.isPlayer ? "border-accent bg-accent/25" : "border-white/10 bg-white/[0.04]"
        ]}
        onclick={() => {
          const s = b.chaser.slotId ?? b.chaser.id;
          api.focusVehicle(s);
          api.setFocusedSlot(s);
        }}
        title="Click para enfocar y ver telemetría de #{b.chaser.number || b.chaser.id} {b.chaser.driver}"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="flex h-5 w-6 items-center justify-center rounded font-bold text-white shadow-sm" style:background={cColor}>
            {b.chaser.place}
          </span>
          <span class="font-bold text-white/50">#{b.chaser.number || b.chaser.id}</span>
          <span class="truncate font-sans font-extrabold text-white">{shortName(b.chaser.driver)}</span>
          {#if showTyres && b.chaser.tyreCompounds?.[0]}
            <span class="rounded bg-black/40 px-1.5 py-0.2 text-[9px] font-bold text-white/70">
              {b.chaser.tyreCompounds[0].slice(0, 1)}
            </span>
          {/if}
        </div>
        {#if showSpeed}
          <span class="text-[11px] font-semibold text-white/70">
            {Math.round(speed(b.chaser.speed, units))} {speedUnit(units)}
          </span>
        {/if}
      </div>
    </div>
  </div>
{/if}
