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
    if (stored || !p) return;
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
      .filter((v) => !v.inGarage)
      .map((v) => {
        const [x, y] = project(f, v.pos[0], v.pos[2]);
        return { v, x, y };
      })
      // Draw the player last so it's on top.
      .sort((a, b) => Number(a.v.isPlayer) - Number(b.v.isPlayer)),
  );
</script>

<div class="hud p-1">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    {#if outline.length > 2}
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.18)" stroke-width="7" stroke-linejoin="round" />
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.55)" stroke-width="2" stroke-linejoin="round" />
    {:else}
      <text x={size / 2} y={size / 2} text-anchor="middle" fill="rgb(255 255 255 / 0.4)" font-size="11"
        >El mapa se genera tras 1 vuelta</text
      >
    {/if}
    {#each cars as c (c.v.id)}
      {@const mate = isTeammate(c.v, teammates)}
      {#if c.v.isPlayer}
        <circle cx={c.x} cy={c.y} r="6.5" fill="#fff" stroke="#000" stroke-width="1.5" />
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
