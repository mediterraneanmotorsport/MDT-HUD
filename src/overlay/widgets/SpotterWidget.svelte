<script lang="ts">
  import { fly } from "svelte/transition";
  import { config, type Units } from "../../lib/config.svelte";
  import { useLive } from "../../lib/live.svelte";
  import { spotter, type ActiveSpotterTransmission } from "../../lib/spotter.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const style = $derived(opts.style ?? "wec");
  const showText = $derived(opts.showText ?? true);
  const showEqualizer = $derived(opts.showEqualizer ?? true);
  const showProfile = $derived(opts.showProfile ?? true);
  const showCategoryBadge = $derived(opts.showCategoryBadge ?? true);
  const animate = $derived(opts.animateTransitions ?? true);

  const playerVehicle = $derived.by(() => {
    const snap = live.snap;
    if (!snap || !snap.vehicles) return null;
    return snap.vehicles.find((v) => v.isPlayer) ?? snap.vehicles.find((v) => v.isFocused) ?? snap.vehicles[0] ?? null;
  });

  const carNumber = $derived.by(() => {
    if (edit) return "1";
    return playerVehicle?.number || "1";
  });

  const driverLastName = $derived.by(() => {
    if (edit) return "VERSTAPPEN";
    const name = playerVehicle?.driverName || config.value.broadcast?.driverName || config.value.general?.teammates?.split(",")[0]?.trim() || "VERSTAPPEN";
    const parts = name.trim().split(/\s+/);
    return (parts.length > 0 ? parts[parts.length - 1] : "PILOTO").toUpperCase();
  });

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

  const isLiveOverlay =
    typeof window !== "undefined" &&
    (location.hash.toLowerCase().includes("overlay") ||
      location.hash.toLowerCase().includes("broadcast") ||
      location.pathname.toLowerCase() === "/overlay" ||
      location.pathname.toLowerCase() === "/broadcast");
  const isPreview = $derived(edit || !isLiveOverlay);
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
    transition:fly={animate ? { x: -28, duration: 280 } : { duration: 0 }}
    class={[animate && "mdt-anim-radio-enter mdt-shimmer-overlay rounded-xl"]}
  >

  <!-- 1. ESTILO FÓRMULA 1 (TV BROADCAST GRAPHIC - EXACT REPLICA CON LOGO MDT) -->
  {#if style === "f1"}
    <div
      class={[
        "hud select-none transition-all duration-300 min-w-[340px] max-w-[440px] shadow-2xl",
        isTransmitting ? "scale-100 opacity-100" : "scale-[0.98] opacity-90",
      ]}
    >
      <!-- TV Broadcast Radio Badge (Exact replica de la gráfica televisiva F1 con logo MDT) -->
      <div class="relative overflow-hidden rounded-xl border border-blue-500/30 bg-[#070e1c]/95 p-3.5 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.85)]">
        <!-- Main Badge Header Row -->
        <div class="flex items-center justify-between gap-4">
          <!-- Left: Big Number + (Driver Surname / RADIO) -->
          <div class="flex items-center gap-3.5">
            <!-- Big Electric Blue Car Number -->
            <div class="flex items-center justify-center min-w-[38px]">
              <span class="font-display text-4xl md:text-5xl font-black text-[#1e75ff] leading-none drop-shadow-[0_2px_10px_rgba(30,117,255,0.45)]">
                {carNumber}
              </span>
            </div>

            <!-- Driver Surname & RADIO -->
            <div class="flex flex-col justify-center">
              <span class="font-display text-base font-black tracking-wider text-[#1e75ff] uppercase leading-tight drop-shadow-sm">
                {driverLastName}
              </span>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="font-display text-lg font-black tracking-widest text-white uppercase leading-none">
                  RADIO
                </span>
                {#if isTransmitting}
                  <span class="inline-flex h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Right: Audio Wave Equalizer (Top) + MDT Logo (Bottom) -->
          <div class="flex flex-col items-end justify-between self-stretch shrink-0 min-h-[46px]">
            {#if showEqualizer}
              <div class="flex items-end gap-1 h-3.5 pt-0.5">
                <div class={["w-1 rounded-sm bg-[#1e75ff]", isTransmitting ? "eq-bar-1" : "h-1 opacity-40"]}></div>
                <div class={["w-1 rounded-sm bg-[#1e75ff]", isTransmitting ? "eq-bar-2" : "h-1.5 opacity-40"]}></div>
                <div class={["w-1 rounded-sm bg-white", isTransmitting ? "eq-bar-3" : "h-2 opacity-40"]}></div>
                <div class={["w-1 rounded-sm bg-[#1e75ff]", isTransmitting ? "eq-bar-4" : "h-1 opacity-40"]}></div>
                <div class={["w-1 rounded-sm bg-white", isTransmitting ? "eq-bar-5" : "h-2.5 opacity-40"]}></div>
              </div>
            {:else}
              <div></div>
            {/if}

            <!-- Logo de MDT añadido al team radio -->
            <div class="mt-2 flex items-center justify-end">
              <img src="/mdt-logo.png" alt="MDT" class="h-6 w-auto max-w-[80px] object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            </div>
          </div>
        </div>

        <!-- Optional Category Badge -->
        {#if showCategoryBadge}
          <div class="mt-2.5 flex items-center justify-between border-t border-white/10 pt-1.5">
            <span class={["inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-display text-[10px] font-black tracking-wider uppercase border", colors.bg, colors.text, colors.border]}>
              {active.folder}
            </span>
            {#if edit}
              <span class="text-[9px] font-mono text-muted uppercase tracking-widest">(VISTA PREVIA)</span>
            {/if}
          </div>
        {/if}

        <!-- Radio Transcription Text Subtitle -->
        {#if showText && active.text}
          <div class={["mt-2 rounded bg-black/50 border border-white/10 p-2 font-sans text-[12.5px] font-bold leading-snug text-white tracking-wide uppercase italic", animate && "mdt-anim-radio-subtitle"]}>
            "{active.text}"
          </div>
        {/if}
      </div>
    </div>

  <!-- 2. ESTILO CÁPSULA DEPORTIVA COMPACTA -->
  {:else if style === "compact"}
    <div
      class={[
        "hud select-none transition-all duration-300 flex items-center gap-3 rounded-full border border-white/20 bg-black/90 px-4 py-2 shadow-xl backdrop-blur-md",
        colors.glow,
        isTransmitting ? "scale-100 opacity-100 ring-1 ring-cyan-400/50" : "scale-[0.98] opacity-90",
      ]}
    >
      <!-- Pulsing Dot -->
      <div class="relative flex items-center justify-center shrink-0">
        <span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>
        {#if isTransmitting}
          <span class="absolute h-4 w-4 rounded-full bg-red-500/50 animate-ping"></span>
        {/if}
      </div>

      <!-- Profile & Message -->
      <div class="flex flex-col min-w-0 pr-1">
        <div class="flex items-center gap-2">
          <span class="font-mono text-[10px] font-black text-cyan-300 uppercase tracking-wider">
            {active.profile}
          </span>
          {#if showCategoryBadge}
            <span class={["rounded px-1.5 py-0.2 text-[9px] font-bold uppercase", colors.text]}>
              · {active.folder}
            </span>
          {/if}
        </div>
        {#if showText && active.text}
          <span class="truncate text-[12px] font-semibold text-white/95 max-w-[320px]">
            {active.text}
          </span>
        {/if}
      </div>

      <!-- Equalizer -->
      {#if showEqualizer}
        <div class="flex items-end gap-1 h-3.5 pl-1 shrink-0">
          <div class={["w-0.5 rounded-full bg-cyan-400", isTransmitting ? "eq-bar-1" : "h-1 opacity-40"]}></div>
          <div class={["w-0.5 rounded-full bg-cyan-400", isTransmitting ? "eq-bar-3" : "h-2 opacity-40"]}></div>
          <div class={["w-0.5 rounded-full bg-cyan-300", isTransmitting ? "eq-bar-5" : "h-1 opacity-40"]}></div>
        </div>
      {/if}
    </div>

  <!-- 3. ESTILO TÁCTICO CYBERPUNK / INGENIERO DE PISTA -->
  {:else if style === "cyber"}
    <div
      class={[
        "hud select-none transition-all duration-300 min-w-[320px] max-w-[420px] rounded-sm border-2 border-cyan-500/60 bg-[#020b14]/95 p-2.5 shadow-[0_0_20px_rgba(6,182,212,0.35)] backdrop-blur-md",
        isTransmitting ? "scale-100 opacity-100" : "scale-[0.98] opacity-90",
      ]}
    >
      <!-- Tactical Header: Monospace Frequency & Channel -->
      <div class="flex items-center justify-between border-b border-cyan-500/30 pb-1 font-mono text-[9px] text-cyan-400/80">
        <div class="flex items-center gap-2">
          <span class="font-black text-cyan-300">[COMMS 454.025 MHz]</span>
          <span>CH-01</span>
        </div>
        <div class="flex items-center gap-1.5 font-bold">
          {#if isTransmitting}
            <span class="text-red-400 animate-pulse">● TX ON</span>
          {:else}
            <span class="text-muted">STANDBY</span>
          {/if}
          <span>// {active.profile.toUpperCase()}</span>
        </div>
      </div>

      <!-- Badge and Equalizer -->
      <div class="mt-2 flex items-center justify-between">
        {#if showCategoryBadge}
          <div class="flex items-center gap-1.5 font-mono text-[10px] font-bold text-amber-300 uppercase tracking-wider">
            <span>&gt; EVT:</span>
            <span class="bg-amber-950/70 border border-amber-500/40 px-1.5 py-0.5 rounded text-amber-200">
              {active.folder}
            </span>
          </div>
        {/if}
        {#if showEqualizer}
          <div class="flex items-end gap-1 h-3.5">
            <div class={["w-1 bg-cyan-400", isTransmitting ? "eq-bar-1" : "h-1 opacity-40"]}></div>
            <div class={["w-1 bg-cyan-300", isTransmitting ? "eq-bar-2" : "h-1.5 opacity-40"]}></div>
            <div class={["w-1 bg-cyan-400", isTransmitting ? "eq-bar-3" : "h-2 opacity-40"]}></div>
            <div class={["w-1 bg-cyan-300", isTransmitting ? "eq-bar-4" : "h-1 opacity-40"]}></div>
            <div class={["w-1 bg-cyan-400", isTransmitting ? "eq-bar-5" : "h-2.5 opacity-40"]}></div>
          </div>
        {/if}
      </div>

      <!-- Tactical Text Subtitle -->
      {#if showText && active.text}
        <div class="mt-2 rounded bg-black/60 border border-cyan-900/60 p-2 font-mono text-[12px] font-semibold text-cyan-100 leading-snug">
          "{active.text}"
        </div>
      {/if}
    </div>

  <!-- 4. ESTILO WEC OFICIAL (BROADCAST / LE MANS) -->
  {:else}
    <div
      class={[
        "hud select-none transition-all duration-300 min-w-[340px] max-w-[460px] rounded-xl border border-white/20 bg-[#060e1a]/95 p-3 shadow-2xl backdrop-blur-md",
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
        <div class={["mt-1.5 text-[12.5px] font-semibold leading-snug text-white/95 tracking-normal", animate && "mdt-anim-radio-subtitle"]}>
          "{active.text}"
        </div>
      {/if}
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
