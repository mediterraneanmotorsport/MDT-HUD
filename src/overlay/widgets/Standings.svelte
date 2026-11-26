<script lang="ts">
  import { api } from "../../lib/api";
  import { config, type Units } from "../../lib/config.svelte";
  import { classColor, clock, gap, isTeammate, lapTime, penaltyBadge, penaltyTitle, sessionLabel, shortName, timeOfDay } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";
  import CarLogo from "../CarLogo.svelte";
  import EnergyBadge from "../EnergyBadge.svelte";
  import TyreBadge from "../TyreBadge.svelte";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const snap = $derived(live.snap);
  const isRace = $derived(snap?.session.kind === "race");
  const teammates = $derived(config.value.general.teammates);

  // Session header: lap-limited races count laps, everything else counts down the clock.
  const me = $derived(
    snap?.vehicles.find((v) =>
      snap.focusedSlot != null
        ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot
        : v.isPlayer,
    ),
  );
  const remaining = $derived.by(() => {
    const s = snap?.session;
    if (!s) return "–";
    if (s.maxLaps > 0 && s.maxLaps < 10000 && s.endEt <= 0) {
      const leaderLaps = Math.max(0, ...(snap?.vehicles.map((v) => v.totalLaps) ?? []));
      return `${Math.min(leaderLaps + 1, s.maxLaps)} / ${s.maxLaps}`;
    }
    return clock(s.timeRemaining);
  });
  const classSize = $derived(me ? (snap?.vehicles.filter((v) => v.class === me.class).length ?? 0) : 0);
  // Backend estimate: exact for lap-limited sessions, from average lap time for timed ones.
  const lapsLeft = $derived.by(() => {
    const l = snap?.strategy.lapsRemaining ?? 0;
    return l > 0 && isFinite(l) ? `~${l.toFixed(1)}` : "–";
  });

  interface Row {
    v: Vehicle;
    gap: string;
    interval: string;
  }

  const groups = $derived.by(() => {
    if (!snap) return [];
    const myClass = snap.vehicles.find((v) => v.isPlayer)?.class;
    const byClass = new Map<string, Vehicle[]>();
    for (const v of [...snap.vehicles].sort((a, b) => a.place - b.place)) {
      if (opts.classes === "mine" && myClass != null && v.class !== myClass) continue;
      if (!byClass.has(v.class)) byClass.set(v.class, []);
      byClass.get(v.class)!.push(v);
    }
    const entries = [...byClass.entries()];
    if (opts.myClassFirst && myClass != null) entries.sort(([a], [b]) => Number(b === myClass) - Number(a === myClass));
    const around = Math.max(0, opts.around ?? 1);
    return entries.map(([cls, cars]) => {
      const leader = cars[0];
      const limit = Math.max(1, (cls === myClass ? opts.maxRows : opts.maxRowsOther) ?? 8);
      const bests = cars.map((v) => v.bestLap).filter((t) => t > 0);
      const classBest = bests.length ? Math.min(...bests) : 0;
      const rows: Row[] = cars.map((v, i) => {
        if (i === 0) return { v, gap: isRace ? "Líder" : lapTime(v.bestLap), interval: "" };
        const prev = cars[i - 1];
        if (!isRace) {
          const d = v.bestLap > 0 && leader.bestLap > 0 ? v.bestLap - leader.bestLap : 0;
          const di = v.bestLap > 0 && prev.bestLap > 0 ? v.bestLap - prev.bestLap : 0;
          return { v, gap: d > 0 ? `+${d.toFixed(3)}` : "–", interval: di > 0 ? `+${di.toFixed(3)}` : "" };
        }
        return {
          v,
          gap: gap(v.timeBehindLeader - leader.timeBehindLeader, v.lapsBehindLeader - leader.lapsBehindLeader),
          interval: gap(v.timeBehindLeader - prev.timeBehindLeader, v.lapsBehindLeader - prev.lapsBehindLeader),
        };
      });
      // Keep the player visible: top rows plus the cars around the player.
      let visible = rows.slice(0, limit);
      const pi = rows.findIndex((r) => r.v.isPlayer);
      if (pi >= limit) {
        const top = Math.max(1, limit - (2 * around + 1));
        let start = Math.max(top, pi - around);
        let end = Math.min(rows.length, pi + around + 1);
        // Not enough room for the whole window: drop cars behind first, then ahead.
        while (top + end - start > limit && end > pi + 1) end--;
        while (top + end - start > limit && start < pi) start++;
        visible = [...rows.slice(0, top), ...rows.slice(start, end)];
      }
      return { cls, count: cars.length, classBest, rows: visible };
    });
  });

  const startGridMap = new Map<number, number>();
  $effect(() => {
    if (!snap?.vehicles) return;
    for (const v of snap.vehicles) {
      if (!startGridMap.has(v.id)) {
        startGridMap.set(v.id, v.qualification > 0 ? v.qualification : v.place);
      } else if (v.qualification > 0 && startGridMap.get(v.id) !== v.qualification) {
        startGridMap.set(v.id, v.qualification);
      }
    }
  });

  // Track pit duration per vehicle + pit exit flash animation
  interface PitInfo {
    inPits: boolean;
    pitStartMs: number;
    lastDurationSec: number;
  }
  const pitTracker = new Map<number, PitInfo>();
  let pitExitFlash = $state<Record<number, boolean>>({});
  const pitExitTimers = new Map<number, ReturnType<typeof setTimeout>>();

  $effect(() => {
    if (!snap?.vehicles) return;
    const now = Date.now();
    for (const v of snap.vehicles) {
      let info = pitTracker.get(v.id);
      if (!info) {
        info = { inPits: v.inPits, pitStartMs: v.inPits ? now : 0, lastDurationSec: 0 };
        pitTracker.set(v.id, info);
      } else {
        if (v.inPits && !info.inPits) {
          info.inPits = true;
          info.pitStartMs = now;
        } else if (!v.inPits && info.inPits) {
          info.inPits = false;
          if (info.pitStartMs > 0) {
            info.lastDurationSec = Math.round((now - info.pitStartMs) / 100) / 10;
          }
          if (opts.animatePitAlerts ?? true) {
            pitExitFlash = { ...pitExitFlash, [v.id]: true };
            if (pitExitTimers.has(v.id)) clearTimeout(pitExitTimers.get(v.id)!);
            pitExitTimers.set(
              v.id,
              setTimeout(() => {
                const next = { ...pitExitFlash };
                delete next[v.id];
                pitExitFlash = next;
              }, 1800),
            );
          }
        }
      }
    }
  });

  // Track fastest lap (purple) & personal best (green) flash per vehicle
  const prevLastLaps = new Map<number, number>();
  let lapFlash = $state<Record<number, "purple" | "green">>({});
  const lapFlashTimers = new Map<number, ReturnType<typeof setTimeout>>();

  $effect(() => {
    if (!((opts.animateSectorFlash ?? true) && (config.value.general.animations?.sectorSweepFlash ?? true)) || !snap?.vehicles) return;
    const classBestMap = new Map<string, number>();
    for (const v of snap.vehicles) {
      if (v.bestLap > 0) {
        const cur = classBestMap.get(v.class) ?? Infinity;
        if (v.bestLap < cur) classBestMap.set(v.class, v.bestLap);
      }
    }
    for (const v of snap.vehicles) {
      const prev = prevLastLaps.get(v.id);
      if (prev !== undefined && v.lastLap > 0 && Math.abs(v.lastLap - prev) > 0.001) {
        const classBest = classBestMap.get(v.class) ?? Infinity;
        let kind: "purple" | "green" | null = null;
        if (v.lastLap <= classBest + 0.001) kind = "purple";
        else if (v.bestLap > 0 && v.lastLap <= v.bestLap + 0.001) kind = "green";
        if (kind) {
          lapFlash = { ...lapFlash, [v.id]: kind };
          if (lapFlashTimers.has(v.id)) clearTimeout(lapFlashTimers.get(v.id)!);
          lapFlashTimers.set(
            v.id,
            setTimeout(() => {
              const next = { ...lapFlash };
              delete next[v.id];
              lapFlash = next;
            }, 2400),
          );
        }
      }
      prevLastLaps.set(v.id, v.lastLap);
    }
  });

  function getPitDurationDisplay(v: Vehicle): string {
    const info = pitTracker.get(v.id);
    if (v.inPits && info?.pitStartMs) {
      const liveSec = ((Date.now() - info.pitStartMs) / 1000).toFixed(1);
      return `${liveSec}s`;
    }
    if (info && info.lastDurationSec > 0) {
      return `${info.lastDurationSec.toFixed(1)}s`;
    }
    return "–";
  }

  function getVehicleDamage(v: Vehicle): number | null {
    if (v.isPlayer && snap?.player?.damage) {
      const d = snap.player.damage;
      const suspAvg = d.suspension.reduce((a, b) => a + b, 0) / 4;
      return Math.round(((d.aero + suspAvg) / 2) * 100);
    }
    if (snap?.focusedSlot != null && (v.slotId === snap.focusedSlot || v.id === snap.focusedSlot)) {
      if (snap?.player?.damage) {
        const d = snap.player.damage;
        const suspAvg = d.suspension.reduce((a, b) => a + b, 0) / 4;
        return Math.round(((d.aero + suspAvg) / 2) * 100);
      }
    }
    return null;
  }

  // WEC Position Change Animation Tracker (Green for gain, Red for loss + delta badge)
  let prevPlaces = new Map<number, number>();
  let positionAnims = $state<Record<number, { dir: "up" | "down"; delta: number }>>({});
  let animTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  $effect(() => {
    const enabled = (opts.animatePositions ?? true) && (config.value.general.animations?.standingsOvertake ?? true);
    if (!enabled || !snap?.vehicles) return;
    for (const v of snap.vehicles) {
      const prev = prevPlaces.get(v.id);
      if (prev !== undefined && prev !== v.place) {
        const delta = prev - v.place;
        const dir = delta > 0 ? "up" : "down";
        positionAnims = { ...positionAnims, [v.id]: { dir, delta: Math.abs(delta) } };
        if (animTimeouts.has(v.id)) clearTimeout(animTimeouts.get(v.id)!);
        const timer = setTimeout(() => {
          const next = { ...positionAnims };
          delete next[v.id];
          positionAnims = next;
        }, 2800);
        animTimeouts.set(v.id, timer);
      }
      prevPlaces.set(v.id, v.place);
    }
  });

  const columns = $derived(
    [
      "22px", // position
      opts.showPosGained ? "32px" : "", // posiciones ganadas / perdidas
      "36px", // number
      opts.showLogo ? "18px" : "",
      "minmax(130px,1fr)", // driver
      opts.showDamage ? "40px" : "", // daño %
      opts.showPenalties ? "34px" : "", // sanciones
      opts.showTyres ? "18px" : "",
      opts.showEnergy ? "40px" : "",
      opts.showPits ? "36px" : "",
      opts.showPitDuration ? "48px" : "", // tiempo boxes
      opts.showLast ? "70px" : "",
      opts.showBest ? "70px" : "",
      "64px", // gap
      opts.showInterval ? "56px" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );

  /** Lap time highlight: purple = class best, green = the driver's personal best (only for last laps). */
  function tone(t: number, v: Vehicle, classBest: number, personal: boolean): string | undefined {
    if (!opts.colorTimes || t <= 0) return undefined;
    if (classBest > 0 && t <= classBest + 1e-4) return "var(--color-best)";
    if (personal && v.bestLap > 0 && t <= v.bestLap + 1e-4) return "var(--color-good)";
    return undefined;
  }
</script>

{#snippet posGainedBadge(v: Vehicle)}
  {@const start = v.qualification > 0 ? v.qualification : (startGridMap.get(v.id) ?? v.place)}
  {@const diff = start - v.place}
  <span
    class={[
      "flex items-center justify-center font-mono text-[10px] font-bold tabular-nums",
      diff > 0 ? "text-[#22c55e]" : diff < 0 ? "text-[#ef4444]" : "text-muted/60",
    ]}
    title="Parrilla: P{start} → Actual: P{v.place} ({diff > 0 ? `+${diff} ganadas` : diff < 0 ? `${diff} perdidas` : 'sin cambios'})"
  >
    {#if diff > 0}
      ▲+{diff}
    {:else if diff < 0}
      ▼{diff}
    {:else}
      =
    {/if}
  </span>
{/snippet}

{#snippet time(t: number, color: string | undefined, cls: string)}
  <span class="text-right">
    <span
      class={["rounded-[4px] px-1", cls, color && "font-semibold text-white opacity-100!"]}
      style:background={color}>{lapTime(t)}</span
    >
  </span>
{/snippet}

{#snippet stat(label: string, value: string)}
  <span class="flex items-baseline gap-1.5">
    <span class="hud-label">{label}</span>
    <span class="hud-value text-[14px]">{value}</span>
  </span>
{/snippet}

<div class="hud w-max min-w-[380px] py-1.5 text-[14px]">
  {#if opts.showBranding ?? true}
    <div class="mx-1.5 mb-1 flex items-center justify-between border-b border-white/10 px-1.5 pb-1">
      <div class="flex items-center gap-2">
        <img src="/mdt-logo.png" alt="MDT" class="h-4 w-auto object-contain" draggable="false" />
        <span class="font-display text-[13px] font-extrabold tracking-wider text-fg uppercase italic">MDT-HUD</span>
      </div>
      <div class="flex items-center gap-2">
        {#if live.snap?.focusedSlot != null}
          <button
            type="button"
            class="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white shadow hover:bg-accent-hi transition-colors cursor-pointer"
            title="Restablecer enfoque a tu coche"
            onclick={() => api.setFocusedSlot(null)}
          >
            ✕ Mi coche
          </button>
        {/if}
        <span class="font-display text-[10px] font-semibold tracking-[0.2em] text-accent-hi uppercase">Mediterranean Motorsport</span>
      </div>
    </div>
  {/if}
  {#if opts.showSession && snap}
    <div class="mx-1.5 mb-1 flex items-baseline gap-3.5 border-b border-white/10 px-1.5 pb-1">
      {@render stat(sessionLabel(snap.session.kind), remaining)}
      {#if me}
        <span class="flex items-baseline gap-1.5">
          <span class="h-2 w-2 self-center rounded-full" style:background={classColor(me.class)}></span>
          <span class="hud-value text-[14px]">P{me.classPlace}<span class="text-[11px] text-muted">/{classSize}</span></span>
        </span>
        {@render stat("Gen", `P${me.place}`)}
      {/if}
      {@render stat("Vueltas", String(me?.totalLaps ?? 0))}
      {@render stat("Rest.", lapsLeft)}
      <span class="ml-auto hud-value text-[14px]">{timeOfDay(snap.session.timeOfDay)}</span>
    </div>
  {/if}
  {#each groups as g (g.cls)}
    <div class="flex items-center gap-2 px-3 pt-1.5 pb-1">
      <span class="h-2.5 w-2.5 rounded-full" style:background={classColor(g.cls)}></span>
      <span class="hud-title text-fg!">{g.cls || "Categoría"}</span>
      <span class="text-[12px] text-faint">{g.count}</span>
    </div>
    {#each g.rows as r, i (r.v.id)}
      {@const mate = isTeammate(r.v, teammates)}
      {@const isTargetFocused = live.snap?.focusedSlot != null ? (r.v.slotId === live.snap.focusedSlot || r.v.id === live.snap.focusedSlot) : r.v.isPlayer}
      {@const anim = positionAnims[r.v.id]}
      {@const lFlash = lapFlash[r.v.id]}
      {@const pExit = pitExitFlash[r.v.id]}
      <div
        class={[
          "mx-1.5 grid h-[26px] items-center gap-x-2 rounded-md px-1.5 cursor-pointer transition-all duration-300 relative",
          anim?.dir === "up" && "mdt-anim-pos-up bg-emerald-950/75 ring-2 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] border-l-4 border-emerald-400 font-bold",
          anim?.dir === "down" && "mdt-anim-pos-down bg-rose-950/75 ring-2 ring-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)] border-l-4 border-rose-500 font-bold",
          !anim && lFlash === "purple" && "mdt-anim-sector-purple mdt-shimmer-overlay",
          !anim && lFlash === "green" && "mdt-anim-sector-green mdt-shimmer-overlay",
          !anim && !lFlash && pExit && "mdt-anim-pit-exit",
          !anim && isTargetFocused
            ? "bg-accent text-white shadow-[0_0_12px_var(--color-accent)] ring-1 ring-white/60 font-bold"
            : !anim && mate
              ? "bg-accent/20 ring-1 ring-accent/60"
              : !anim && i % 2 === 1 && "bg-white/[0.03]",
          (r.v.finishStatus === 2 || r.v.finishStatus === 3) && "opacity-50",
        ]}
        style:grid-template-columns={columns}
        onclick={() => {
          const targetSlot = r.v.slotId ?? r.v.id;
          api.focusVehicle(targetSlot);
          api.setFocusedSlot(targetSlot);
        }}
        title="Click para enfocar coche #{r.v.number} {r.v.driver} en el juego y cargar su telemetría"
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            const targetSlot = r.v.slotId ?? r.v.id;
            api.focusVehicle(targetSlot);
            api.setFocusedSlot(targetSlot);
          }
        }}
      >
        <span class="text-right font-semibold flex items-center justify-end gap-0.5">
          {#if anim?.dir === "up"}
            <span class="rounded bg-emerald-500/25 px-0.5 text-emerald-300 font-black text-[9px] leading-tight">▲+{anim.delta}</span>
          {:else if anim?.dir === "down"}
            <span class="rounded bg-rose-500/25 px-0.5 text-rose-300 font-black text-[9px] leading-tight">▼-{anim.delta}</span>
          {/if}
          <span>{r.v.classPlace}</span>
        </span>
        {#if opts.showPosGained}{@render posGainedBadge(r.v)}{/if}
        <span
          class="rounded-[4px] text-center text-[12px] leading-[18px] font-bold text-white"
          style:background={classColor(r.v.class)}
          style:box-shadow={r.v.isPlayer ? "0 0 0 1px rgb(255 255 255 / 0.6)" : undefined}>{r.v.number || "–"}</span
        >
        {#if opts.showLogo}<CarLogo model={r.v.model} entry={r.v.vehicle} />{/if}
        <span class="flex min-w-0 items-center gap-1.5">
          {#if mate}
            <img src="/mdt-logo.png" alt="MDT" title="Compañero MDT" class="h-3.5 w-auto shrink-0 object-contain" />
          {/if}
          <span class="truncate font-medium">{shortName(r.v.driver)}</span>
          {#if r.v.finishStatus === 1}
            <span class="checkered h-3.5 w-5 shrink-0 rounded-[3px] ring-1 ring-white/40" style="--check: 3.5px" title="Finalizado"></span>
          {:else if r.v.finishStatus === 2}
            <span class="rounded-[4px] bg-white/15 px-1 text-[10px] leading-4 font-bold text-muted">DNF</span>
          {:else if r.v.finishStatus === 3}
            <span class="rounded-[4px] bg-bad px-1 text-[10px] leading-4 font-bold text-white">DQ</span>
          {:else if r.v.inGarage}
            <span class="rounded-[4px] bg-white/15 px-1 text-[10px] leading-4 font-bold text-fg">GAR</span>
          {:else if r.v.inPits}
            <span class={["rounded-[4px] bg-white px-1 text-[10px] leading-4 font-bold text-black", (opts.animatePitAlerts ?? true) && "mdt-anim-pit-badge"]}>PIT</span>
          {/if}
          {#if !opts.showPenalties && r.v.numPenalties > 0 && r.v.finishStatus < 2}
            <span
              class="shrink-0 rounded-[4px] bg-warn px-1 text-[10px] leading-4 font-bold text-black"
              title={penaltyTitle(r.v)}>{penaltyBadge(r.v)}</span
            >
          {/if}
        </span>
        {#if opts.showDamage}
          {@const dmg = getVehicleDamage(r.v)}
          <span
            class={[
              "text-center font-mono text-[11px] font-bold",
              dmg != null && dmg > 25 ? "text-bad" : dmg != null && dmg > 0 ? "text-warn" : "text-muted",
            ]}
            title="Daño del vehículo"
          >
            {dmg != null ? `${dmg}%` : "–"}
          </span>
        {/if}
        {#if opts.showPenalties}
          <span class="flex items-center justify-center">
            {#if r.v.numPenalties > 0}
              <span
                class="rounded bg-warn px-1 text-[10px] leading-4 font-black text-black"
                title={penaltyTitle(r.v)}
              >
                {penaltyBadge(r.v)}
              </span>
            {:else}
              <span class="text-[11px] text-muted/50 font-mono">0</span>
            {/if}
          </span>
        {/if}
        {#if opts.showTyres}
          <TyreBadge compounds={r.v.tyreCompounds} wear={r.v.tyreWear} laps={r.v.tyreLaps} />
        {/if}
        {#if opts.showEnergy}<EnergyBadge value={r.v.virtualEnergy} />{/if}
        {#if opts.showPits}
          <span class="text-right text-[13px]"><span class="text-[10px] opacity-50">PS</span> {r.v.numPitstops}</span>
        {/if}
        {#if opts.showPitDuration}
          {@const pDur = getPitDurationDisplay(r.v)}
          <span
            class={[
              "text-right font-mono text-[11px] font-bold tabular-nums",
              r.v.inPits ? "text-accent animate-pulse" : "text-fg/80",
            ]}
            title={r.v.inPits ? "Tiempo en boxes actual" : "Última parada en boxes"}
          >
            {pDur}
          </span>
        {/if}
        {#if opts.showLast}{@render time(r.v.lastLap, tone(r.v.lastLap, r.v, g.classBest, true), "text-[13px] opacity-75")}{/if}
        {#if opts.showBest}{@render time(r.v.bestLap, tone(r.v.bestLap, r.v, g.classBest, false), "text-[13px] opacity-75")}{/if}
        {#if !isRace && i === 0}
          {@render time(r.v.bestLap, tone(r.v.bestLap, r.v, g.classBest, false), "font-medium")}
        {:else}
          <span class="text-right font-medium">{r.gap}</span>
        {/if}
        {#if opts.showInterval}<span class="text-right text-[13px] opacity-65">{r.interval}</span>{/if}
      </div>
    {/each}
  {:else}
    <div class="px-3 py-2 text-muted">Sin sesión</div>
  {/each}
</div>
