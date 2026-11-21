<script lang="ts">
  import { scale } from "svelte/transition";
  import type { Units } from "../../lib/config.svelte";
  import { classColor } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const range = $derived(opts.range ?? 14);
  const autoHide = $derived(opts.autoHide ?? false);
  const showRings = $derived(opts.showRings ?? true);
  const animate = $derived(opts.animateTransitions ?? true);

  let prevPos: [number, number] | null = null;
  let heading: [number, number] = [0, -1];

  interface Blip {
    id: number;
    lat: number; // m: negative = left, positive = right
    lon: number; // m: positive = ahead, negative = behind
    color: string;
  }

  const state = $derived.by(() => {
    const snap = live.snap;
    const p = snap?.player;
    if (!snap || !p) return { blips: [] as Blip[], leftAlert: 0, rightAlert: 0 };

    // Determine forward unit vector from yaw or movement delta.
    let fx = Math.sin(p.yaw);
    let fz = -Math.cos(p.yaw);
    if (Math.abs(p.yaw) < 1e-4 && prevPos) {
      const mx = p.pos[0] - prevPos[0];
      const mz = p.pos[2] - prevPos[1];
      const d = Math.hypot(mx, mz);
      if (d > 0.05) {
        fx = mx / d;
        fz = mz / d;
        heading = [fx, fz];
      } else {
        [fx, fz] = heading;
      }
    }
    prevPos = [p.pos[0], p.pos[2]];
    // Right unit vector
    const rx = -fz;
    const rz = fx;

    const blips: Blip[] = [];
    for (const v of snap.vehicles) {
      if (v.isPlayer || v.inGarage) continue;
      const wx = v.pos[0] - p.pos[0];
      const wz = v.pos[2] - p.pos[2];
      const dist = Math.hypot(wx, wz);
      if (dist > range * 1.45) continue;
      const lon = wx * fx + wz * fz;
      let lat = wx * rx + wz * rz;
      if (snap.source === "demo" && Math.abs(lat) < 1.2) {
        lat = v.id % 2 === 0 ? -2.6 : 2.6;
      }
      if (Math.abs(lon) <= range && Math.abs(lat) <= range * 0.85) {
        blips.push({ id: v.id, lat, lon, color: classColor(v.class) });
      }
    }

    // In demo mode, if no car happens to be inside the 14m box at this instant, synthesize a passing car so the preview is always informative.
    if (snap.source === "demo" && blips.length === 0) {
      const t = snap.session.currentEt;
      const lon = ((t * 4) % (range * 1.6)) - range * 0.8;
      blips.push({ id: 99, lat: -2.5, lon, color: "#3e8ef7" });
    }

    // Alert level: 0 = clear, 1 = approaching (< 6.5m lon), 2 = overlap alongside (< 3.2m lon)
    let leftAlert = 0;
    let rightAlert = 0;
    for (const b of blips) {
      if (Math.abs(b.lat) > 6.5) continue;
      const al = Math.abs(b.lon);
      const level = al <= 3.2 ? 2 : al <= 6.8 ? 1 : 0;
      if (b.lat < -0.5) leftAlert = Math.max(leftAlert, level);
      if (b.lat > 0.5) rightAlert = Math.max(rightAlert, level);
    }

    return { blips, leftAlert, rightAlert };
  });

  const visible = $derived(edit || !autoHide || state.blips.length > 0);
  const SIZE = 168;
  const HALF = SIZE / 2;
  const pxPerMeter = $derived((HALF - 18) / range);

  // Smooth 60/144fps interpolation between telemetry snapshots (eliminates stepping at 20-30 Hz)
  let smoothBlips = $state<Blip[]>([]);
  const smoothedMap = new Map<number, Blip>();
  let latestTargetBlips: Blip[] = [];

  $effect(() => {
    latestTargetBlips = state.blips;
    const activeIds = new Set<number>();
    for (const b of latestTargetBlips) {
      activeIds.add(b.id);
      const existing = smoothedMap.get(b.id);
      if (!existing || Math.hypot(b.lat - existing.lat, b.lon - existing.lon) > 8) {
        smoothedMap.set(b.id, { ...b });
      } else {
        existing.color = b.color;
      }
    }
    for (const id of Array.from(smoothedMap.keys())) {
      if (!activeIds.has(id)) smoothedMap.delete(id);
    }
    if (latestTargetBlips.length === 0) {
      smoothBlips = [];
    } else if (smoothBlips.length === 0) {
      smoothBlips = latestTargetBlips.map((b) => ({ ...b }));
    }
  });

  $effect(() => {
    if (!visible || state.blips.length === 0 || typeof window === "undefined") return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      // Fast critically-damped exponential smoothing (~38ms time constant): silky at 60-144fps with minimal latency
      const alpha = 1 - Math.exp(-26 * dt);
      const next: Blip[] = [];

      for (const target of latestTargetBlips) {
        let cur = smoothedMap.get(target.id);
        if (!cur) {
          cur = { ...target };
          smoothedMap.set(target.id, cur);
        } else {
          cur.lat += (target.lat - cur.lat) * alpha;
          cur.lon += (target.lon - cur.lon) * alpha;
          cur.color = target.color;
        }
        next.push({ id: cur.id, lat: cur.lat, lon: cur.lon, color: cur.color });
      }
      smoothBlips = next;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  });
</script>

{#if visible}
  <div
    transition:scale={animate ? { start: 0.84, duration: 180 } : { duration: 0 }}
    class={["hud relative grid place-items-center p-2", animate && "mdt-anim-radar-in"]}
    style:width="{SIZE}px"
    style:height="{SIZE}px"
  >
    <svg width={SIZE - 16} height={SIZE - 16} viewBox="-{HALF} -{HALF} {SIZE} {SIZE}" class="overflow-visible">
      {#if showRings}
        <circle cx="0" cy="0" r={HALF - 8} fill="none" stroke="rgb(255 255 255 / 0.08)" stroke-width="1" />
        <circle cx="0" cy="0" r={(HALF - 8) * 0.55} fill="none" stroke="rgb(255 255 255 / 0.08)" stroke-dasharray="3 3" stroke-width="1" />
        <line x1="-{HALF - 8}" y1="0" x2={HALF - 8} y2="0" stroke="rgb(255 255 255 / 0.06)" stroke-width="1" />
        <line x1="0" y1="-{HALF - 8}" x2="0" y2={HALF - 8} stroke="rgb(255 255 255 / 0.06)" stroke-width="1" />
      {/if}

      <!-- Left proximity arc -->
      {#if state.leftAlert > 0}
        <path
          d="M -54 -42 A 68 68 0 0 0 -54 42"
          fill="none"
          stroke={state.leftAlert === 2 ? "#ff4646" : "#f5a524"}
          stroke-width={state.leftAlert === 2 ? "6" : "4"}
          stroke-linecap="round"
          class={[animate && state.leftAlert === 2 && "mdt-anim-radar-arc-danger"]}
        />
      {/if}

      <!-- Right proximity arc -->
      {#if state.rightAlert > 0}
        <path
          d="M 54 -42 A 68 68 0 0 1 54 42"
          fill="none"
          stroke={state.rightAlert === 2 ? "#ff4646" : "#f5a524"}
          stroke-width={state.rightAlert === 2 ? "6" : "4"}
          stroke-linecap="round"
          class={[animate && state.rightAlert === 2 && "mdt-anim-radar-arc-danger"]}
        />
      {/if}

      <!-- Player car in center -->
      <rect
        x="-7"
        y="-14"
        width="14"
        height="28"
        rx="4"
        fill="var(--color-accent)"
        stroke="#ffffff"
        stroke-width="1.5"
      />
      <path d="M -4 -9 L 0 -12 L 4 -9" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />

      <!-- Nearby cars (interpolated at display refresh rate) -->
      {#each smoothBlips as b (b.id)}
        {@const cx = b.lat * pxPerMeter}
        {@const cy = -b.lon * pxPerMeter}
        {@const overlap = Math.abs(b.lon) <= 3.2 && Math.abs(b.lat) <= 6.5}
        <rect
          x="-6.5"
          y="-13"
          width="13"
          height="26"
          rx="3.5"
          transform="translate({cx.toFixed(2)}, {cy.toFixed(2)})"
          fill={overlap ? "#ff4646" : b.color}
          stroke="#ffffff"
          stroke-width={overlap ? "1.8" : "1"}
        />
      {/each}
    </svg>
  </div>
{/if}
