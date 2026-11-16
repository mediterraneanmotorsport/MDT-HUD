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
  </svg>
</div>
