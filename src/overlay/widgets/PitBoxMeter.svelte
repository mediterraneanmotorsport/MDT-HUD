<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { speed, speedUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, units, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const snap = $derived(live.snap);
  const p = $derived(snap?.player);
  const me = $derived(snap?.vehicles?.find((v) => v.isPlayer) ?? null);
  const visible = $derived(edit || Boolean(opts.alwaysShow) || Boolean(p?.inPits));

  // Track stationary box stop duration in real time
  let stopSeconds = $state(0);
  let lastEt = 0;
  let wasStopped = false;

  $effect(() => {
    const curEt = snap?.session?.currentEt ?? 0;
    const inPits = Boolean(p?.inPits);
    const spd = p?.speed ?? 0;
    if (!inPits) {
      stopSeconds = 0;
      wasStopped = false;
      lastEt = curEt;
      return;
    }
    const dt = lastEt > 0 ? Math.max(0, Math.min(1, curEt - lastEt)) : 0;
    lastEt = curEt;
    if (spd < 1.2) {
      stopSeconds += dt;
      wasStopped = true;
    } else if (!wasStopped) {
      stopSeconds = 0;
    }
  });

  // LMU pitState: 0=none, 1=request, 2=entering, 3=stopped, 4=exiting
  const pitState = $derived(me?.pitState ?? (p?.inPits ? 2 : 0));
  const spdKmh = $derived((p?.speed ?? 0) * 3.6);
  const speedLimitKmh = $derived(Number(opts.pitLimitKmh ?? 60));
  const speeding = $derived(Boolean(p?.inPits) && spdKmh > speedLimitKmh + 1.5);

  const stageInfo = $derived.by(() => {
    if (edit && !p?.inPits) {
      return { title: "GUÍA DE BOXES · 25m", sub: "LISTO PARA PARAR", pct: 68, color: "#f59e0b", pulse: false };
    }
    if (pitState === 3 || (p?.inPits && (p?.speed ?? 0) < 1.2)) {
      return {
        title: `🛑 EN CAJÓN · ${stopSeconds.toFixed(1)}s`,
        sub: "SERVICIO EN CURSO · MANTÉN FRENO",
        pct: 100,
        color: "#ef4444",
        pulse: true,
      };
    }
    if (pitState === 4 || (wasStopped && (p?.speed ?? 0) >= 1.2)) {
      return {
        title: "🟢 SALIDA DE BOXES",
        sub: p?.speedLimiter ? "LIMITADOR ACTIVO · ACELERA" : "⚠️ ACTIVA EL LIMITADOR",
        pct: 100,
        color: "#22c55e",
        pulse: false,
      };
    }
    // Approaching box: estimate visual approach progress from pit speed
    const progress = Math.max(15, Math.min(92, 100 - (spdKmh / Math.max(40, speedLimitKmh)) * 65));
    return {
      title: speeding ? "⚠️ ¡EXCESO DE VELOCIDAD EN PIT!" : "APROXIMACIÓN AL BOX",
      sub: p?.speedLimiter
        ? `LIMITADOR OK · ${Math.round(speed(p?.speed ?? 0, units))} ${speedUnit(units)}`
        : `⚠️ ACTIVA LIMITADOR (${speedLimitKmh} km/h)`,
      pct: progress,
      color: speeding ? "#ef4444" : "#f59e0b",
      pulse: speeding,
    };
  });
</script>

{#if visible}
  <div
    class={[
      "hud w-[310px] border-2 p-3 shadow-2xl transition-all",
      stageInfo.pulse && "animate-pulse",
    ]}
    style:border-color={stageInfo.color}
    style:box-shadow="0 0 22px {stageInfo.color}44"
  >
    <div class="flex items-center justify-between">
      <span class="font-display text-xs font-black tracking-wider uppercase" style:color={stageInfo.color}>
        {stageInfo.title}
      </span>
      <span class="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[11px] font-black text-white tabular-nums">
        {Math.round(speed(p?.speed ?? 0, units))} {speedUnit(units)}
      </span>
    </div>

    <!-- Visual approach / stop bar -->
    <div class="relative mt-2 h-3.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
      <div
        class="h-full transition-all duration-100"
        style:width="{stageInfo.pct}%"
        style:background={stageInfo.color}
      ></div>
      <div class="pointer-events-none absolute inset-y-0 left-[33%] w-px bg-white/25"></div>
      <div class="pointer-events-none absolute inset-y-0 left-[66%] w-px bg-white/25"></div>
      <div class="pointer-events-none absolute inset-y-0 right-1 flex items-center font-mono text-[8px] font-black text-white">
        BOX
      </div>
    </div>

    <div class="mt-1.5 flex items-center justify-between text-[10px] font-bold">
      <span class={speeding || !p?.speedLimiter ? "text-amber-300" : "text-white/75"}>{stageInfo.sub}</span>
      {#if stopSeconds > 0}
        <span class="font-mono text-white tabular-nums">STOP {stopSeconds.toFixed(1)}s</span>
      {/if}
    </div>
  </div>
{/if}
