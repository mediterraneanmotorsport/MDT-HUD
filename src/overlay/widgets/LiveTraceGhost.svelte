<script lang="ts">
  import { api, isNativeTauri } from "../../lib/api";
  import type { Units } from "../../lib/config.svelte";
  import { lapTime, speed } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { LapTrace } from "../../lib/types";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const HEIGHT = 104;
  const width = $derived(Math.round(opts.width ?? 360));
  const lookBehind = $derived(Math.max(80, Number(opts.lookBehindMeters ?? 260)));
  const lookAhead = $derived(Math.max(40, Number(opts.lookAheadMeters ?? 140)));
  const showSpeedDelta = $derived(opts.showSpeedDelta ?? true);

  let canvas: HTMLCanvasElement | undefined = $state();

  // Reference PB trace (loaded from SQLite DB or recorded in-session)
  let pbTrace = $state<LapTrace | null>(null);
  let pbLapTime = $state<number>(0);
  let pbSource = $state<"db" | "session" | "demo" | "none">("none");
  let loadedKey = "";

  // Live current-lap buffer indexed by distance (m)
  interface LivePt {
    d: number;
    throttle: number;
    brake: number;
    speed: number;
  }
  let livePts: LivePt[] = [];
  let lastDist = -1;
  let lastLapNum = -1;
  let speedDeltaKmh = $state<number | null>(null);

  async function loadReferencePb(track: string, car: string) {
    if (!isNativeTauri() || !track) return;
    try {
      let laps = await api.listTrackLaps(track, car || null, true, 30);
      if (!laps.length && car) {
        laps = await api.listTrackLaps(track, null, true, 30);
      }
      const valid = laps.filter((l) => l.valid && l.lapTime > 15 && !l.outLap && !l.inLap);
      if (!valid.length) return;
      valid.sort((a, b) => a.lapTime - b.lapTime);
      const best = valid[0];
      const trace = await api.getLapTrace(best.lapId);
      if (trace && trace.d && trace.d.length > 20) {
        pbTrace = trace;
        pbLapTime = best.lapTime;
        pbSource = "db";
      }
    } catch {}
  }

  function samplePbAtDist(trace: LapTrace, dist: number, trackLen: number): { throttle: number; brake: number; speed: number } | null {
    const arr = trace.d;
    const n = arr.length;
    if (n < 2) return null;
    let d = dist;
    if (trackLen > 100) {
      d = ((d % trackLen) + trackLen) % trackLen;
    }
    // Binary search for distance
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= d) lo = mid;
      else hi = mid;
    }
    const d0 = arr[lo];
    const d1 = arr[hi];
    const span = d1 - d0;
    const f = span > 0.001 ? Math.max(0, Math.min(1, (d - d0) / span)) : 0;
    return {
      throttle: trace.throttle[lo] + (trace.throttle[hi] - trace.throttle[lo]) * f,
      brake: trace.brake[lo] + (trace.brake[hi] - trace.brake[lo]) * f,
      speed: trace.speed[lo] + (trace.speed[hi] - trace.speed[lo]) * f,
    };
  }

  // Trigger DB load when track/car changes
  $effect(() => {
    const snap = live.snap;
    const track = snap?.session?.track ?? "";
    const car = snap?.player?.vehicleName ?? "";
    const key = `${track}|${car}`;
    if (track && key !== loadedKey) {
      loadedKey = key;
      pbTrace = null;
      pbLapTime = 0;
      pbSource = "none";
      livePts = [];
      void loadReferencePb(track, car);
    }
  });

  // Record live distance-indexed points & redraw canvas
  $effect(() => {
    const snap = live.snap;
    const p = snap?.player;
    const trackLen = snap?.session?.trackLength || 5000;

    if (edit || !p) {
      drawDemo();
      return;
    }

    // If a new lap started, optionally promote previous lap to session PB if faster
    if (lastLapNum >= 0 && p.lapNumber > lastLapNum) {
      const completed = snap?.timing?.lastLapTime ?? 0;
      if (
        snap?.timing?.lastLapValid &&
        completed > 15 &&
        livePts.length > 40 &&
        (pbLapTime <= 0 || completed < pbLapTime)
      ) {
        pbTrace = {
          t: livePts.map((_, i) => i * 0.05),
          d: livePts.map((pt) => pt.d),
          speed: livePts.map((pt) => pt.speed),
          throttle: livePts.map((pt) => pt.throttle),
          brake: livePts.map((pt) => pt.brake),
          steering: [],
          clutch: [],
          gear: [],
          rpm: [],
          x: [],
          z: [],
          gLat: [],
          gLong: [],
          abs: [],
          tc: [],
          tyreFl: [],
          tyreFr: [],
          tyreRl: [],
          tyreRr: [],
        };
        pbLapTime = completed;
        pbSource = "session";
      }
      livePts = [];
    }
    lastLapNum = p.lapNumber;

    const curD = p.lapDist;
    if (curD < lastDist - 200) {
      livePts = [];
    }
    if (Math.abs(curD - lastDist) >= 1.5 || livePts.length === 0) {
      livePts.push({ d: curD, throttle: p.throttle, brake: p.brake, speed: p.speed });
      if (livePts.length > 2600) livePts.shift();
      lastDist = curD;
    }

    if (pbTrace) {
      const ref = samplePbAtDist(pbTrace, curD, trackLen);
      speedDeltaKmh = ref ? Math.round(speed(p.speed - ref.speed, units)) : null;
    } else {
      speedDeltaKmh = null;
    }

    drawLive(curD, trackLen);
  });

  function setupCanvas() {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(HEIGHT * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);
    return ctx;
  }

  function drawGrid(ctx: CanvasRenderingContext2D, nowX: number) {
    const pad = 6;
    const yOf = (v: number) => HEIGHT - pad - v * (HEIGHT - pad * 2);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (const v of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, yOf(v));
      ctx.lineTo(width, yOf(v));
      ctx.stroke();
    }

    // Subtle shaded "Look-Ahead" zone to the right of NOW
    ctx.fillStyle = "rgba(34, 135, 236, 0.06)";
    ctx.fillRect(nowX, 0, width - nowX, HEIGHT);

    // Vertical NOW cursor line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, HEIGHT);
    ctx.stroke();
  }

  function drawLive(curD: number, trackLen: number) {
    const ctx = setupCanvas();
    if (!ctx) return;

    const totalSpan = lookBehind + lookAhead;
    const xOfRel = (relM: number) => ((relM + lookBehind) / totalSpan) * width;
    const pad = 6;
    const yOf = (v: number) => HEIGHT - pad - Math.max(0, Math.min(1, v)) * (HEIGHT - pad * 2);
    const nowX = xOfRel(0);

    drawGrid(ctx, nowX);

    // 1. Draw PB Ghost Trace (behind AND ahead of NOW so driver sees upcoming braking point!)
    if (pbTrace) {
      const steps = 90;
      const drawGhost = (field: "throttle" | "brake", color: string) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= steps; i++) {
          const relM = -lookBehind + (i / steps) * totalSpan;
          const pt = samplePbAtDist(pbTrace!, curD + relM, trackLen);
          if (!pt) continue;
          const x = xOfRel(relM);
          const y = yOf(pt[field]);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.restore();
      };
      drawGhost("throttle", "rgba(52, 211, 153, 0.55)");
      drawGhost("brake", "rgba(251, 113, 133, 0.72)");
    }

    // 2. Draw Live Current-Lap Trace up to NOW
    const drawCurrent = (field: "throttle" | "brake", color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (const pt of livePts) {
        let relM = pt.d - curD;
        if (relM < -lookBehind - 20 || relM > 5) continue;
        const x = xOfRel(relM);
        const y = yOf(pt[field]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };
    drawCurrent("throttle", "#22c55e");
    drawCurrent("brake", "#ef4444");
  }

  function drawDemo() {
    const ctx = setupCanvas();
    if (!ctx) return;
    const totalSpan = lookBehind + lookAhead;
    const nowX = (lookBehind / totalSpan) * width;
    const pad = 6;
    const yOf = (v: number) => HEIGHT - pad - v * (HEIGHT - pad * 2);

    drawGrid(ctx, nowX);

    // Simulated PB braking zone ahead of NOW
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
    ctx.beginPath();
    ctx.moveTo(0, yOf(1));
    ctx.lineTo(nowX * 0.85, yOf(1));
    ctx.lineTo(nowX * 1.05, yOf(0));
    ctx.lineTo(width * 0.85, yOf(0));
    ctx.lineTo(width, yOf(0.65));
    ctx.stroke();

    ctx.strokeStyle = "rgba(251, 113, 133, 0.75)";
    ctx.beginPath();
    ctx.moveTo(0, yOf(0));
    ctx.lineTo(nowX * 0.9, yOf(0));
    ctx.lineTo(nowX * 1.08, yOf(0.95));
    ctx.lineTo(width * 0.82, yOf(0.25));
    ctx.lineTo(width, yOf(0));
    ctx.stroke();
    ctx.restore();

    // Simulated Live Trace up to NOW
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#22c55e";
    ctx.beginPath();
    ctx.moveTo(0, yOf(1));
    ctx.lineTo(nowX * 0.78, yOf(1));
    ctx.lineTo(nowX, yOf(0.15));
    ctx.stroke();

    ctx.strokeStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(0, yOf(0));
    ctx.lineTo(nowX * 0.82, yOf(0));
    ctx.lineTo(nowX, yOf(0.75));
    ctx.stroke();
  }
</script>

<div class="hud flex flex-col gap-1 p-2" style:width="{width + 16}px">
  <div class="flex items-center justify-between px-0.5">
    <div class="flex items-center gap-2">
      <span class="hud-title">Trace Fantasma PB</span>
      {#if pbLapTime > 0}
        <span class="rounded bg-purple-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-300">
          PB {lapTime(pbLapTime)}
        </span>
      {:else if !edit}
        <span class="text-[10px] text-muted">Completa 1 vuelta válida para PB</span>
      {:else}
        <span class="rounded bg-purple-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-300">
          VISTA PREVIA · +{lookAhead}m
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2 font-mono text-[10px]">
      {#if showSpeedDelta && speedDeltaKmh != null}
        <span class={["font-black", speedDeltaKmh >= 0 ? "text-good" : "text-bad"]}>
          {speedDeltaKmh >= 0 ? `+${speedDeltaKmh}` : speedDeltaKmh} {units === "imperial" ? "mph" : "km/h"}
        </span>
      {/if}
      <span class="text-white/50">--- PB · ━ VIVO</span>
    </div>
  </div>
  <canvas bind:this={canvas} style:width="{width}px" style:height="{HEIGHT}px" class="block rounded bg-black/30"></canvas>
</div>
