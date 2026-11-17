<script lang="ts">
  import { config, type Units } from "../../lib/config.svelte";
  import { spotter, type ActiveSpotterTransmission } from "../../lib/spotter.svelte";

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const style = $derived(opts.style ?? "wec");
  const showText = $derived(opts.showText ?? true);
  const showEqualizer = $derived(opts.showEqualizer ?? true);
  const showProfile = $derived(opts.showProfile ?? true);
  const showCategoryBadge = $derived(opts.showCategoryBadge ?? true);

  // Simulated transmission in Edit Mode so the user can drag and preview the widget
  const previewTransmission: ActiveSpotterTransmission = {
    folder: "Sector Verde",
    label: "Sector verde (Mejora personal)",
    priority: 4,
    text: "Sector 1 en verde, mejorando tu marca personal.",
    profile: config.value.spotter?.profile || "Sara",
    category: "session",
    startedAt: 0,
  };

  const isPreview = $derived(edit || (typeof window !== "undefined" && !location.hash.includes("overlay")));
  const active = $derived(spotter.currentTransmission ?? (isPreview ? previewTransmission : null));
  const isTransmitting = $derived(spotter.playing || (isPreview && !spotter.currentTransmission));

  function getBadgeColor(ev: ActiveSpotterTransmission): { bg: string; text: string; border: string; glow: string } {
    if (ev.folder.includes("Purpura")) {
      return {
        bg: "bg-purple-900/60",
        text: "text-purple-300",
        border: "border-purple-500/60",
        glow: "shadow-[0_0_15px_rgba(168,85,247,0.4)]",
      };
    }
    if (ev.folder.includes("Verde")) {
      return {
        bg: "bg-emerald-900/60",
        text: "text-emerald-300",
        border: "border-emerald-500/60",
        glow: "shadow-[0_0_15px_rgba(16,185,129,0.35)]",
      };
    }
    if (ev.folder.includes("Victoria") || ev.folder.includes("Podio")) {
      return {
        bg: "bg-amber-900/60",
        text: "text-amber-300",
        border: "border-amber-500/60",
        glow: "shadow-[0_0_15px_rgba(245,158,11,0.35)]",
      };
    }
    if (ev.priority === 1) {
      return {
        bg: "bg-red-950/80",
        text: "text-red-400",
        border: "border-red-500/70",
        glow: "shadow-[0_0_15px_rgba(239,68,68,0.4)]",
      };
    }
    if (ev.priority === 2) {
      return {
        bg: "bg-yellow-950/80",
        text: "text-yellow-400",
        border: "border-yellow-500/70",
        glow: "shadow-[0_0_12px_rgba(234,179,8,0.35)]",
      };
    }
    return {
      bg: "bg-cyan-950/70",
      text: "text-cyan-300",
      border: "border-cyan-500/60",
      glow: "shadow-[0_0_12px_rgba(6,182,212,0.3)]",
    };
  }
</script>

{#if active}
  {@const colors = getBadgeColor(active)}

  <div
    class={[
      "hud select-none transition-all duration-300",
      style === "wec" && "min-w-[340px] max-w-[460px] rounded-xl border border-white/20 bg-[#060e1a]/95 p-3 shadow-2xl backdrop-blur-md",
      style === "compact" && "min-w-[280px] max-w-[380px] rounded-lg border border-white/15 bg-black/90 p-2.5 shadow-xl backdrop-blur-sm",
      style === "minimal" && "min-w-[260px] rounded-md border border-cyan-500/30 bg-black/75 px-3 py-2 shadow-lg backdrop-blur-xs",
      colors.glow,
      isTransmitting ? "scale-100 opacity-100" : "scale-[0.98] opacity-90",
    ]}
  >
    <!-- Top Header: Team Radio bar + Profile + Equalizer waves -->
    <div class="flex items-center justify-between border-b border-white/10 pb-1.5">
      <!-- Left: Radio Icon + Status + Profile -->
      <div class="flex items-center gap-2">
        <!-- Radio Headset Icon with Live Pulse -->
        <div class="relative flex items-center justify-center">
          <svg class="h-4 w-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
          {#if isTransmitting}
            <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
            <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500"></span>
          {/if}
        </div>

        <div class="flex flex-col">
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-[10px] font-black tracking-wider uppercase text-white/90">
              TEAM RADIO
            </span>
            {#if isTransmitting}
              <span class="rounded bg-red-500/25 border border-red-500/40 px-1 py-0.2 text-[8px] font-black tracking-widest text-red-400 uppercase animate-pulse">
                ON AIR
              </span>
            {/if}
          </div>

          {#if showProfile}
            <span class="text-[9px] font-bold text-white/60 uppercase tracking-wider">
              {active.profile} · Spotter
            </span>
          {/if}
        </div>
      </div>

      <!-- Right: Animated Sound Wave / Equalizer Bars -->
      {#if showEqualizer}
        <div class="flex items-end gap-1 h-4 px-1" title="Señal de audio en transmisión">
          <div class={["w-1 rounded-full bg-cyan-400", isTransmitting ? "eq-bar-1" : "h-1 opacity-40"]}></div>
          <div class={["w-1 rounded-full bg-cyan-400", isTransmitting ? "eq-bar-2" : "h-1.5 opacity-40"]}></div>
          <div class={["w-1 rounded-full bg-cyan-300", isTransmitting ? "eq-bar-3" : "h-2 opacity-40"]}></div>
          <div class={["w-1 rounded-full bg-cyan-300", isTransmitting ? "eq-bar-4" : "h-1 opacity-40"]}></div>
          <div class={["w-1 rounded-full bg-cyan-400", isTransmitting ? "eq-bar-5" : "h-2.5 opacity-40"]}></div>
          <div class={["w-1 rounded-full bg-cyan-400", isTransmitting ? "eq-bar-6" : "h-1 opacity-40"]}></div>
        </div>
      {/if}
    </div>

    <!-- Middle: Event Badge Tag -->
    {#if showCategoryBadge}
      <div class="mt-2 flex items-center justify-between">
        <span
          class={[
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] font-black tracking-wide uppercase",
            colors.bg,
            colors.text,
            colors.border,
          ]}
        >
          <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
          {active.folder}
        </span>

        {#if edit}
          <span class="text-[9px] font-bold text-white/40 uppercase tracking-widest">
            (Vista Previa)
          </span>
        {/if}
      </div>
    {/if}

    <!-- Bottom: Subtitle / Spoken Transcript Text -->
    {#if showText && active.text}
      <div class="mt-1.5 text-[12.5px] font-semibold leading-snug text-white/95 tracking-normal">
        "{active.text}"
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes eqBar {
    0%, 100% {
      height: 3px;
    }
    50% {
      height: 15px;
    }
  }

  .eq-bar-1 {
    animation: eqBar 0.38s ease-in-out infinite;
  }
  .eq-bar-2 {
    animation: eqBar 0.48s ease-in-out infinite 0.1s;
  }
  .eq-bar-3 {
    animation: eqBar 0.32s ease-in-out infinite 0.2s;
  }
  .eq-bar-4 {
    animation: eqBar 0.52s ease-in-out infinite 0.15s;
  }
  .eq-bar-5 {
    animation: eqBar 0.42s ease-in-out infinite 0.05s;
  }
  .eq-bar-6 {
    animation: eqBar 0.36s ease-in-out infinite 0.25s;
  }
</style>
