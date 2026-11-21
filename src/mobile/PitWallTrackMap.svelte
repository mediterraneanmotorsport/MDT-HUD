<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onDestroy } from "svelte";
  import { api, isNativeTauri } from "../lib/api";
  import { config } from "../lib/config.svelte";
  import { classColor, isTeammate, shortName } from "../lib/format";
  import { fit, project } from "../lib/geometry";
  import { useLive } from "../lib/live.svelte";
  import type { Vehicle } from "../lib/types";

  const live = useLive();

  let {
    size = 240,
    selectedVehicleId = null,
    pinnedIds = [],
    showPitRejoin = true,
    pitLossSec = 34,
    onSelectVehicle,
  }: {
    size?: number;
    selectedVehicleId?: number | null;
    pinnedIds?: number[];
    showPitRejoin?: boolean;
    pitLossSec?: number;
    onSelectVehicle?: (v: Vehicle) => void;
  } = $props();

  let zoom = $state<1 | 1.6 | 2.4>(1);
  let stored = $state.raw<[number, number][] | null>(null);
  let trail = $state.raw<[number, number][]>([]);

  const snap = $derived(live.snap);
  const track = $derived(snap?.session?.track ?? "");
  const teammates = $derived(config.value.general.teammates);
  const sectorYellow = $derived(snap?.session?.sectorYellow ?? [false, false, false]);
  const isWet = $derived((snap?.session?.weather?.avgWetness ?? 0) > 0.15 || (snap?.session?.weather?.raining ?? 0) > 0.05);

  async function loadMap(name: string) {
    stored = null;
    trail = [];
    if (!name) return;
    if (!isNativeTauri()) {
      try {
        const res = await fetch(`/__mobile_track_map?track=${encodeURIComponent(name)}`, { cache: "no-store" });
        if (res.ok) {
          const map = await res.json();
          if (name === track && map?.points?.length) {
            stored = map.points;
            return;
          }
        }
      } catch {
        // fallback
      }
    }
    const map = await api.getTrackMap(name).catch(() => null);
    if (name === track) stored = map?.points ?? null;
  }

  $effect(() => {
    void loadMap(track);
  });

  const unlisten = listen<string>("track-map-updated", (e) => {
    if (e.payload === track) void loadMap(track);
  });
  onDestroy(() => {
    void unlisten.then((f) => f());
  });

  $effect(() => {
    const p = snap?.player;
    if (stored || !p || !p.pos || !Array.isArray(p.pos) || p.pos.length < 3) return;
    const last = trail.at(-1);
    if (!last || Math.hypot(p.pos[0] - last[0], p.pos[2] - last[1]) > 15) {
      trail = [...trail, [p.pos[0], p.pos[2]]];
    }
  });

  const outline = $derived(stored ?? trail);
  const f = $derived(fit(outline, size, size, 14));

  function slicePath(pts: [number, number][], startIdx: number, endIdx: number, closeToStart = false): string {
    if (pts.length < 2) return "";
    const out: string[] = [];
    for (let i = startIdx; i <= Math.min(endIdx, pts.length - 1); i++) {
      const [x, y] = project(f, pts[i][0], pts[i][1]);
      out.push(`${out.length === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    if (closeToStart && pts.length > 2) {
      const [x, y] = project(f, pts[0][0], pts[0][1]);
      out.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return out.join(" ");
  }

  const sectorPaths = $derived.by(() => {
    const n = outline.length;
    if (n < 6) return ["", "", ""];
    const i1 = Math.floor(n / 3);
    const i2 = Math.floor((n * 2) / 3);
    return [
      slicePath(outline, 0, i1, false),
      slicePath(outline, i1, i2, false),
      slicePath(outline, i2, n - 1, !!stored),
    ];
  });

  const startFinishPt = $derived.by(() => {
    if (outline.length < 2) return null;
    const [x, y] = project(f, outline[0][0], outline[0][1]);
    return { x, y };
  });

  const pitZonePt = $derived.by(() => {
    if (outline.length < 10) return null;
    const idx = Math.max(0, outline.length - Math.max(2, Math.floor(outline.length * 0.04)));
    const [x, y] = project(f, outline[idx][0], outline[idx][1]);
    return { x, y };
  });

  const targetCarId = $derived(
    selectedVehicleId ?? snap?.focusedSlot ?? snap?.vehicles?.find((v) => v.isPlayer)?.id ?? null,
  );

  const cars = $derived(
    (snap?.vehicles ?? [])
      .filter((v) => !v.inGarage && Array.isArray(v.pos) && v.pos.length >= 3)
      .map((v) => {
        const [x, y] = project(f, v.pos[0], v.pos[2]);
        const isFocused = v.id === targetCarId || v.slotId === targetCarId;
        const isPinned = pinnedIds.includes(v.id);
        const mate = isTeammate(v, teammates);
        return { v, x, y, isFocused, isPinned, mate };
      })
      .sort((a, b) => {
        const pa = (a.isFocused ? 4 : 0) + (a.v.isPlayer ? 3 : 0) + (a.isPinned ? 2 : 0) + (a.mate ? 1 : 0);
        const pb = (b.isFocused ? 4 : 0) + (b.v.isPlayer ? 3 : 0) + (b.isPinned ? 2 : 0) + (b.mate ? 1 : 0);
        return pa - pb;
      }),
  );

  // Pit Rejoin Predictor ghost point on map
  const pitGhost = $derived.by<{ x: number; y: number } | null>(() => {
    if (!showPitRejoin || outline.length < 10 || !snap) return null;
    const me = snap.vehicles?.find((v) => v.id === targetCarId || v.slotId === targetCarId) ?? snap.vehicles?.find((v) => v.isPlayer);
    const trackLen = snap.session?.trackLength ?? 0;
    if (!me || trackLen <= 100) return null;
    const estLap = me.estimatedLapTime > 30 ? me.estimatedLapTime : me.bestLap > 30 ? me.bestLap : 120;
    const curFrac = (((me.lapDist % trackLen) + trackLen) % trackLen) / trackLen;
    const ghostFrac = (((curFrac - pitLossSec / estLap) % 1) + 1) % 1;
    const idx = Math.min(outline.length - 1, Math.max(0, Math.floor(ghostFrac * outline.length)));
    const pt = outline[idx];
    if (!pt) return null;
    const [x, y] = project(f, pt[0], pt[1]);
    return { x, y };
  });

  // Dynamic viewBox for zoom centered on focused/player car
  const viewBox = $derived.by(() => {
    if (zoom <= 1) return `0 0 ${size} ${size}`;
    const target = cars.find((c) => c.isFocused) ?? cars.find((c) => c.v.isPlayer);
    const cx = target?.x ?? size / 2;
    const cy = target?.y ?? size / 2;
    const w = size / zoom;
    const h = size / zoom;
    const x = Math.max(0, Math.min(size - w, cx - w / 2));
    const y = Math.max(0, Math.min(size - h, cy - h / 2));
    return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  });

  const sectorColors = ["#38bdf8", "#a78bfa", "#34d399"];
</script>

<div class="relative flex flex-col items-center">
  <!-- Zoom & Sector Status Bar -->
  <div class="mb-1 flex w-full items-center justify-between gap-1 text-[9px] font-bold">
    <div class="flex items-center gap-1">
      {#each [0, 1, 2] as si}
        <span
          class={[
            "rounded px-1.5 py-0.5 font-mono uppercase transition-all",
            sectorYellow[si]
              ? "animate-pulse bg-[#ffd400] text-black shadow-[0_0_8px_#ffd400]"
              : "bg-white/10 text-white/70",
          ]}
        >
          S{si + 1}{sectorYellow[si] ? " ⚠" : ""}
        </span>
      {/each}
      {#if isWet}
        <span class="rounded bg-sky-500/30 px-1.5 py-0.5 text-sky-300">💧 WET</span>
      {/if}
    </div>
    <div class="flex items-center gap-0.5 rounded bg-black/50 p-0.5">
      {#each [1, 1.6, 2.4] as z (z)}
        <button
          type="button"
          class={[
            "rounded px-1.5 py-0.5 font-mono text-[9px] transition cursor-pointer",
            zoom === z ? "bg-accent text-white" : "text-white/50 hover:text-white",
          ]}
          onclick={() => (zoom = z as 1 | 1.6 | 2.4)}
        >
          {z === 1 ? "1x" : z === 1.6 ? "1.6x" : "2.4x"}
        </button>
      {/each}
    </div>
  </div>

  <!-- Interactive SVG Track Map -->
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    class="rounded-lg bg-black/35 transition-[viewBox] duration-150"
  >
    {#if outline.length > 5}
      <!-- Track base outline -->
      {#each sectorPaths as sp, si}
        {#if sp}
          <path
            d={sp}
            fill="none"
            stroke={sectorYellow[si] ? "rgba(255, 212, 0, 0.35)" : isWet ? "rgba(56, 189, 248, 0.22)" : "rgba(255,255,255,0.16)"}
            stroke-width={sectorYellow[si] ? 10 : 7}
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <path
            d={sp}
            fill="none"
            stroke={sectorYellow[si] ? "#ffd400" : isWet ? "#38bdf8" : sectorColors[si]}
            stroke-width={sectorYellow[si] ? 3.2 : 2.2}
            stroke-linejoin="round"
            stroke-linecap="round"
            opacity={sectorYellow[si] ? 1 : 0.72}
          />
        {/if}
      {/each}

      <!-- Start / Finish Line -->
      {#if startFinishPt}
        <g transform="translate({startFinishPt.x}, {startFinishPt.y})">
          <circle r="4.5" fill="#ffffff" stroke="#000000" stroke-width="1.5" />
          <text y="-7" text-anchor="middle" fill="#ffffff" font-size="7" font-weight="900" font-family="monospace">S/F</text>
        </g>
      {/if}

      <!-- Pit Entry Marker -->
      {#if pitZonePt}
        <g transform="translate({pitZonePt.x}, {pitZonePt.y})">
          <rect x="-9" y="-4" width="18" height="8" rx="2" fill="rgba(239,68,68,0.85)" />
          <text y="2.5" text-anchor="middle" fill="#ffffff" font-size="6" font-weight="900" font-family="monospace">PIT</text>
        </g>
      {/if}
    {:else}
      <text x={size / 2} y={size / 2} text-anchor="middle" fill="rgba(255,255,255,0.55)" font-size="11">
        El mapa se genera tras 1 vuelta
      </text>
    {/if}

    <!-- Pit Rejoin Ghost Marker -->
    {#if pitGhost}
      <g transform="translate({pitGhost.x}, {pitGhost.y})">
        <circle r="8.5" fill="rgba(6, 182, 212, 0.22)" stroke="#22d3ee" stroke-width="1.6" stroke-dasharray="3 2" />
        <text y="-10.5" text-anchor="middle" fill="#22d3ee" font-size="7.5" font-weight="900" font-family="monospace">REJOIN</text>
      </g>
    {/if}

    <!-- Clickable Car Dots -->
    {#each cars as c (c.v.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <g
        transform="translate({c.x}, {c.y})"
        class="cursor-pointer"
        onclick={() => onSelectVehicle?.(c.v)}
      >
        <title>P{c.v.place} #{c.v.number || c.v.id} {shortName(c.v.driver)} ({c.v.class}) — Clic para enfocar</title>

        {#if c.isPinned}
          <circle r="10" fill="none" stroke="#facc15" stroke-width="1.6" stroke-dasharray="2.5 2" />
        {/if}

        {#if c.isFocused}
          <circle r="11" fill="none" stroke="#22d3ee" stroke-width="1.8" opacity="0.75">
            <animate attributeName="r" values="8;13;8" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle r="7.5" fill="var(--color-accent, #2287ec)" stroke="#ffffff" stroke-width="2" />
          <text y="2.6" text-anchor="middle" fill="#ffffff" font-size="6.5" font-weight="900" font-family="monospace">
            {c.v.number || c.v.place}
          </text>
        {:else if c.v.isPlayer}
          <circle r="7" fill="var(--color-accent, #2287ec)" stroke="#ffffff" stroke-width="1.8" />
          <circle r="2.5" fill="#ffffff" />
        {:else if c.mate}
          <circle r="7.5" fill="none" stroke="#ffffff" stroke-width="1.4" />
          <circle r="5" fill="var(--color-accent, #2287ec)" stroke="#ffffff" stroke-width="1" opacity={c.v.inPits ? 0.5 : 1} />
        {:else}
          <circle
            r={c.isPinned ? 6 : 4.8}
            fill={classColor(c.v.class)}
            stroke={c.isPinned ? "#facc15" : "rgba(0,0,0,0.75)"}
            stroke-width={c.isPinned ? 1.6 : 1}
            opacity={c.v.inPits ? 0.45 : 1}
          />
          {#if c.isPinned || zoom > 1}
            <text y="-7.5" text-anchor="middle" fill={c.isPinned ? "#facc15" : "#ffffff"} font-size="6.5" font-weight="800" font-family="monospace">
              #{c.v.number || c.v.place}
            </text>
          {/if}
        {/if}
      </g>
    {/each}
  </svg>
</div>
