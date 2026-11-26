<script lang="ts" module>
  export type ColorBy = "speed" | "inputs" | "gear" | "delta";
</script>

<script lang="ts">
  import type { Aligned, BrakeZone } from "../../lib/analysis";
  import { fit, project, type Fit } from "../../lib/geometry";

  let {
    data,
    colorBy,
    zones,
    cursorIdx,
    oncursor,
    height = 460,
  }: {
    data: Aligned;
    colorBy: ColorBy;
    zones: BrakeZone[];
    cursorIdx: number | null;
    oncursor: (idx: number | null) => void;
    height?: number;
  } = $props();

  let canvas: HTMLCanvasElement;
  let width = $state(400);
  let view = $state({ k: 1, tx: 0, ty: 0 });
  let drag = $state<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  // #16 Interactive 2D Ghost Replay state (time-synced Car A vs Ghost Car B)
  let playing = $state(false);
  let playbackSpeed = $state(1);
  let playTime = $state(0);

  const maxLapTime = $derived.by(() => {
    const tA = data.a.t[data.a.t.length - 1] || 0;
    const tB = data.b ? data.b.t[data.b.t.length - 1] || 0 : 0;
    return Math.max(tA, tB, 1);
  });

  function findIndexAtTime(tArr: Float64Array, t: number): number {
    let lo = 0;
    let hi = tArr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tArr[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  $effect(() => {
    void data;
    playing = false;
    playTime = 0;
  });

  $effect(() => {
    if (!playing || typeof window === "undefined") return;
    let rafId = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * playbackSpeed;
      last = now;
      playTime += dt;
      if (playTime >= maxLapTime) {
        playTime = 0;
      }
      const idxA = findIndexAtTime(data.a.t, playTime);
      oncursor(idxA);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  });

  const points = $derived.by(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i < data.d.length; i++) pts.push([data.a.x[i], data.a.z[i]]);
    return pts;
  });
  const base: Fit = $derived(fit(points, width, height, 24));

  // Reset zoom when a new lap is loaded.
  $effect(() => {
    void data;
    view = { k: 1, tx: 0, ty: 0 };
  });

  function toScreen(x: number, z: number): [number, number] {
    const [px, py] = project(base, x, z);
    return [px * view.k + view.tx, py * view.k + view.ty];
  }

  const GEAR_COLORS = ["#8b93a7", "#e5484d", "#f2a33a", "#f5d000", "#2fbf71", "#3ec7c7", "#3e8ef7", "#a15ef0", "#e85ab4"];

  function speedColor(v: number, lo: number, hi: number) {
    const f = Math.max(0, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
    return `hsl(${(1 - f) * 240} 85% 55%)`;
  }

  function segmentColor(i: number, lo: number, hi: number): string {
    const a = data.a;
    switch (colorBy) {
      case "speed":
        return speedColor(a.speed[i], lo, hi);
      case "inputs":
        if (a.brake[i] > 0.05) return `rgb(229 72 77 / ${0.35 + a.brake[i] * 0.65})`;
        if (a.throttle[i] > 0.05) return `rgb(47 191 113 / ${0.25 + a.throttle[i] * 0.75})`;
        return "#8b93a7";
      case "gear":
        return GEAR_COLORS[Math.max(0, Math.min(8, Math.round(a.gear[i])))];
      case "delta": {
        if (!data.delta) return "#8b93a7";
        const j = Math.min(data.delta.length - 1, i + 5);
        const k = Math.max(0, i - 5);
        const rate = (data.delta[j] - data.delta[k]) / Math.max(1, data.d[j] - data.d[k]);
        // Seconds lost per metre: red when A is losing time, green when gaining.
        const f = Math.max(-1, Math.min(1, rate * 400));
        return f > 0 ? `rgb(229 72 77 / ${0.3 + f * 0.7})` : `rgb(47 191 113 / ${0.3 - f * 0.7})`;
      }
    }
  }

  function draw() {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const n = data.d.length;
    const lw = Math.min(8, 3 * Math.sqrt(view.k));

    // Reference lap (B) as a wide faint ghost line.
    if (data.b) {
      ctx.strokeStyle = "rgb(56 189 248 / 0.4)";
      ctx.lineWidth = lw + 3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const [x, y] = toScreen(data.b.x[i], data.b.z[i]);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, data.a.speed[i]);
      hi = Math.max(hi, data.a.speed[i]);
    }

    ctx.lineWidth = lw;
    let prev = toScreen(data.a.x[0], data.a.z[0]);
    for (let i = 1; i < n; i++) {
      const cur = toScreen(data.a.x[i], data.a.z[i]);
      ctx.strokeStyle = segmentColor(i, lo, hi);
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(cur[0], cur[1]);
      ctx.stroke();
      prev = cur;
    }

    // Start/finish
    const [sx, sy] = toScreen(data.a.x[0], data.a.z[0]);
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx - 4, sy - 4, 8, 8);

    // Braking zone numbers
    ctx.font = "600 10px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    zones.forEach((z, k) => {
      const [x, y] = toScreen(data.a.x[z.start], data.a.z[z.start]);
      ctx.fillStyle = "rgb(229 72 77 / 0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(String(k + 1), x, y + 0.5);
    });

    if (cursorIdx != null && cursorIdx < n) {
      if (data.b) {
        // In Ghost Replay mode, draw Ghost B at the SAME elapsed time as Car A so you see them pull ahead/behind!
        const bIdx = playing ? findIndexAtTime(data.b.t, playTime) : cursorIdx;
        const [bx, by] = toScreen(data.b.x[bIdx], data.b.z[bIdx]);
        ctx.fillStyle = "#f59e0b";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (playing) {
          ctx.fillStyle = "#f59e0b";
          ctx.font = "700 10px Segoe UI";
          ctx.fillText("B", bx, by - 11);
        }
      }
      const [ax, ay] = toScreen(data.a.x[cursorIdx], data.a.z[cursorIdx]);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#2287ec";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ax, ay, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (playing) {
        ctx.fillStyle = "#62b0ff";
        ctx.font = "700 10px Segoe UI";
        ctx.fillText("A", ax, ay - 12);
      }
    }
  }

  $effect(() => {
    void [data, colorBy, zones, cursorIdx, width, height, view.k, view.tx, view.ty, base, playing, playTime];
    draw();
  });

  function nearest(mx: number, my: number): number | null {
    let best = -1;
    let bestD = 18 * 18;
    for (let i = 0; i < data.d.length; i += 2) {
      const [x, y] = toScreen(data.a.x[i], data.a.z[i]);
      const dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  }

  function onMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view = { ...view, tx: drag.tx + dx, ty: drag.ty + dy };
      return;
    }
    const idx = nearest(mx, my);
    if (idx != null) oncursor(idx);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const k = Math.max(1, Math.min(30, view.k * factor));
    const f = k / view.k;
    view = { k, tx: mx - (mx - view.tx) * f, ty: my - (my - view.ty) * f };
  }
</script>

<div class="relative overflow-hidden card" bind:clientWidth={width}>
  <canvas
    bind:this={canvas}
    style:width="{width}px"
    style:height="{height}px"
    class={["block", drag ? "cursor-grabbing" : "cursor-crosshair"]}
    onpointermove={onMove}
    onpointerdown={(e) => {
      drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
      canvas.setPointerCapture(e.pointerId);
    }}
    onpointerup={() => (drag = null)}
    onwheel={onWheel}
    ondblclick={() => (view = { k: 1, tx: 0, ty: 0 })}
  ></canvas>
  {#if view.k > 1 || view.tx || view.ty}
    <div class="absolute top-2 right-2 flex items-center gap-2 rounded-md border border-accent-lo bg-surface-2/90 py-0.5 pr-0.5 pl-2 text-xs">
      <span class="tnum text-muted">{view.k.toFixed(1)}×</span>
      <button class="btn h-6 px-2 text-xs" onclick={() => (view = { k: 1, tx: 0, ty: 0 })}>Restablecer vista</button>
    </div>
  {/if}
  <div class="pointer-events-none absolute bottom-10 left-3 text-[11px] text-faint">Rueda para zoom · arrastra para mover · doble clic para restablecer</div>

  <!-- #16 Ghost Replay Controls Bar -->
  <div class="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/90 px-3 py-2 text-xs">
    <button
      type="button"
      class={[
        "rounded-md px-2.5 py-1 font-bold transition-colors cursor-pointer",
        playing ? "bg-amber-500 text-black" : "bg-accent text-white hover:bg-accent-hi",
      ]}
      onclick={() => {
        if (!playing && cursorIdx != null && cursorIdx < data.a.t.length) {
          playTime = data.a.t[cursorIdx];
        }
        playing = !playing;
      }}
    >
      {playing ? "⏸ Pausar" : "▶ Replay Fantasma 2D"}
    </button>
    <div class="flex items-center gap-1">
      {#each [0.5, 1, 2, 4] as spd (spd)}
        <button
          type="button"
          class={[
            "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold cursor-pointer",
            playbackSpeed === spd ? "bg-white/20 text-white" : "bg-black/30 text-muted hover:text-white",
          ]}
          onclick={() => (playbackSpeed = spd)}
        >
          {spd}×
        </button>
      {/each}
    </div>
    <input
      type="range"
      min="0"
      max={maxLapTime}
      step="0.05"
      value={playTime}
      oninput={(e) => {
        playTime = Number(e.currentTarget.value);
        oncursor(findIndexAtTime(data.a.t, playTime));
      }}
      class="flex-1 accent-accent cursor-pointer"
    />
    <span class="w-16 text-right font-mono text-[11px] text-muted tnum">
      {playTime.toFixed(1)}s
    </span>
    {#if data.delta && cursorIdx != null && cursorIdx < data.delta.length}
      {@const dVal = data.delta[cursorIdx]}
      <span class={["rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tnum", dVal <= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"]}>
        Δ {dVal > 0 ? "+" : ""}{dVal.toFixed(3)}s
      </span>
    {/if}
  </div>
</div>
