<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onDestroy } from "svelte";
  import { api, isNativeTauri } from "../../lib/api";
  import { config, type Units } from "../../lib/config.svelte";
  import { classColor, isTeammate } from "../../lib/format";
  import { fit, pathFrom, project } from "../../lib/geometry";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const size = $derived(opts.size ?? 240);
  const showFrame = $derived(opts.showFrame ?? true);
  const track = $derived(live.snap?.session.track ?? "");
  const teammates = $derived(config.value.general.teammates);

  let stored = $state.raw<[number, number][] | null>(null);
  // Fallback outline built from the player's positions while no lap is stored.
  let trail = $state.raw<[number, number][]>([]);

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
        // fallback to api.getTrackMap
      }
    }
    const map = await api.getTrackMap(name).catch(() => null);
    if (name === track) stored = map?.points ?? null;
  }

  $effect(() => {
    loadMap(track);
  });

  const unlisten = listen<string>("track-map-updated", (e) => {
    if (e.payload === track) loadMap(track);
  });
  onDestroy(() => unlisten.then((f) => f()));

  $effect(() => {
    const p = live.snap?.player;
    if (stored || !p || !p.pos || !Array.isArray(p.pos) || p.pos.length < 3) return;
    const last = trail.at(-1);
    if (!last || Math.hypot(p.pos[0] - last[0], p.pos[2] - last[1]) > 15) {
      trail = [...trail, [p.pos[0], p.pos[2]]];
    }
  });

  const outline = $derived(stored ?? trail);
  const f = $derived(fit(outline, size, size, 10));
  const path = $derived(pathFrom(f, outline, !!stored));

  // Optional ghost point showing estimated pit-rejoin location on track
  const pitGhost = $derived.by<{ x: number; y: number } | null>(() => {
    if (!opts.showPitRejoin || outline.length < 10) return null;
    const snap = live.snap;
    const me = snap?.vehicles?.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );
    const trackLen = snap?.session?.trackLength ?? 0;
    if (!me || trackLen <= 100) return null;
    const estLap = me.estimatedLapTime > 30 ? me.estimatedLapTime : me.bestLap > 30 ? me.bestLap : 120;
    const pitLoss = Number(opts.pitLossSec ?? 32);
    const curFrac = ((me.lapDist % trackLen) + trackLen) % trackLen / trackLen;
    const ghostFrac = ((curFrac - pitLoss / estLap) % 1 + 1) % 1;
    const idx = Math.min(outline.length - 1, Math.max(0, Math.floor(ghostFrac * outline.length)));
    const pt = outline[idx];
    if (!pt) return null;
    const [x, y] = project(f, pt[0], pt[1]);
    return { x, y };
  });

  const cars = $derived(
    (live.snap?.vehicles ?? [])
      .filter((v) => !v.inGarage && Array.isArray(v.pos) && v.pos.length >= 3)
      .map((v) => {
        const [x, y] = project(f, v.pos[0], v.pos[2]);
        return { v, x, y };
      })
      // Draw the player / focused car last so it's on top.
      .sort((a, b) => {
        const aTarget = live.snap?.focusedSlot != null ? (a.v.slotId === live.snap.focusedSlot || a.v.id === live.snap.focusedSlot) : a.v.isPlayer;
        const bTarget = live.snap?.focusedSlot != null ? (b.v.slotId === live.snap.focusedSlot || b.v.id === live.snap.focusedSlot) : b.v.isPlayer;
        return Number(aTarget) - Number(bTarget);
      }),
  );
</script>

<div class={[showFrame ? "hud p-1" : "p-1 drop-shadow-[0_2px_8px_rgb(0_0_0/0.95)]"]}>
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    {#if outline.length > 2}
      {#if !showFrame}
        <path d={path} fill="none" stroke="rgb(0 0 0 / 0.8)" stroke-width="9" stroke-linejoin="round" />
      {/if}
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.22)" stroke-width="7" stroke-linejoin="round" />
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.68)" stroke-width="2" stroke-linejoin="round" />
    {:else}
      <text x={size / 2} y={size / 2} text-anchor="middle" fill="rgb(255 255 255 / 0.6)" font-size="11"
        >El mapa se genera tras 1 vuelta</text
      >
    {/if}
    {#each cars as c (c.v.id)}
      {@const mate = isTeammate(c.v, teammates)}
      {@const isTarget = live.snap?.focusedSlot != null ? (c.v.slotId === live.snap.focusedSlot || c.v.id === live.snap.focusedSlot) : c.v.isPlayer}
      {#if isTarget}
        <circle cx={c.x} cy={c.y} r="7.5" fill="var(--color-accent)" stroke="#fff" stroke-width="2" />
        <circle cx={c.x} cy={c.y} r="3" fill="#fff" />
      {:else if mate}
        <circle cx={c.x} cy={c.y} r="7.5" fill="none" stroke="#fff" stroke-width="1.5" />
        <circle
          cx={c.x}
          cy={c.y}
          r="5"
          fill="var(--color-accent)"
          stroke="#fff"
          stroke-width="1.2"
          opacity={c.v.inPits ? 0.5 : 1}
        />
      {:else}
        <circle
          cx={c.x}
          cy={c.y}
          r="4.5"
          fill={opts.classColors ? classColor(c.v.class) : "#c8ccd6"}
          stroke="rgb(0 0 0 / 0.6)"
          stroke-width="1"
          opacity={c.v.inPits ? 0.4 : 1}
        />
      {/if}
    {/each}
    {#if pitGhost}
      <g transform="translate({pitGhost.x}, {pitGhost.y})">
        <circle r="7" fill="rgb(6 182 212 / 0.25)" stroke="#22d3ee" stroke-width="1.5" stroke-dasharray="3 2" />
        <text y="-10" text-anchor="middle" fill="#22d3ee" font-size="9" font-weight="800" font-family="monospace">PIT</text>
      </g>
    {/if}
  </svg>
</div>
