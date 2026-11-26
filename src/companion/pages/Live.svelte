<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onDestroy, onMount } from "svelte";
  import { api, isNativeTauri } from "../../lib/api";
  import {
    applyCompleteOverlayTheme,
    config,
    HUD_THEMES,
    saveConfig,
    type PresetThemeId,
  } from "../../lib/config.svelte";
  import { lapTime, sessionLabel } from "../../lib/format";
  import { live } from "../../lib/live.svelte";
  import { generateQrMatrix } from "../../lib/qr";
  import { spotter } from "../../lib/spotter.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import type { LapRecord, LapRecordedEvent, SessionSummary } from "../../lib/types";
  import CarRender from "../../lib/CarRender.svelte";
  import TrackOutline from "../../lib/TrackOutline.svelte";
  import CarLogo from "../../overlay/CarLogo.svelte";
  import LapTable from "../components/LapTable.svelte";
  import RaceDebriefCard from "../components/RaceDebriefCard.svelte";
  import Toggle from "../components/Toggle.svelte";
  import { toasts } from "../../lib/toasts.svelte";
  import { nav } from "../nav.svelte";

  const snap = $derived(live.snap);
  const p = $derived(snap?.player);
  const units = $derived(config.value.general.units);
  const isLive = $derived(Boolean(snap && snap.source !== "none" && p));
  const meVehicle = $derived(snap?.vehicles?.find((v) => v.isPlayer));

  // Mobile DDU / PitWall / Streamer QR & Wheel Bindings state
  let copiedMobileUrl = $state(false);
  let showMobileOrderEditor = $state(false);
  let qrMode = $state<"mobile" | "pitwall" | "streamer">("mobile");
  let themeSweepKey = $state(0);
  const activeQrUrl = $derived(
    qrMode === "pitwall"
      ? wheelControl.mobileUrl.replace("#mobile", "#pitwall")
      : qrMode === "streamer"
        ? wheelControl.mobileUrl.replace("#mobile", "#streamer")
        : wheelControl.mobileUrl,
  );
  const qrMatrix = $derived(generateQrMatrix(activeQrUrl));

  function copyMobileUrl() {
    navigator.clipboard.writeText(activeQrUrl);
    copiedMobileUrl = true;
    setTimeout(() => (copiedMobileUrl = false), 2500);
  }

  function openMobilePreview(hashTarget: "#mobile" | "#pitwall" | "#streamer") {
    const url = `http://localhost:1420/${hashTarget}`;
    if ("__TAURI_INTERNALS__" in window) {
      openUrl(url).catch(() => window.open(url, "_blank"));
    } else {
      window.open(`/${hashTarget}`, "_blank");
    }
  }

  function setSpotterVoice(v: "Sara" | "Antonio") {
    config.value.spotter.profile = v;
    saveConfig();
  }

  async function toggleDemo() {
    const next = !live.status.demo;
    live.status = { ...live.status, demo: next };
    if (!next) {
      if (live.snap?.source === "demo") {
        live.snap = null;
      }
      if (!isNativeTauri()) {
        (window as any).__MDT_STOP_DEMO__?.();
      }
    }
    try {
      await api.setDemoMode(next);
    } catch {
      // ignore in browser preview
    }
  }

  function classAccent(cls: string): string {
    const c = (cls || "").toLowerCase();
    if (c.includes("hyper")) return "#e10600";
    if (c.includes("lmp2")) return "#1a85ff";
    if (c.includes("lmp3")) return "#a855f7";
    if (c.includes("gt")) return "#22c55e";
    return "var(--color-accent)";
  }

  // Live Timing Tower rows (up to 7 cars centered around player or top 7)
  const timingTower = $derived.by(() => {
    const list = snap?.vehicles ?? [];
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) => a.place - b.place);
    if (!meVehicle || sorted.length <= 7) return sorted.slice(0, 7);
    const idx = sorted.findIndex((v) => v.isPlayer);
    const start = Math.max(0, Math.min(sorted.length - 7, idx - 3));
    return sorted.slice(start, start + 7);
  });

  // Session & Laps history
  let session = $state<SessionSummary | null>(null);
  let laps = $state<LapRecord[]>([]);
  let toast = $state<string | null>(null);

  async function refresh(sessionId?: number) {
    const sessions = await api.listSessions({ limit: 1 });
    session = sessionId != null ? (sessions.find((s) => s.id === sessionId) ?? sessions[0] ?? null) : (sessions[0] ?? null);
    laps = session ? (await api.listLaps(session.id)).reverse() : [];
  }

  onMount(() => {
    refresh();
  });
  const unlisten = listen<LapRecordedEvent>("lap-recorded", (e) => {
    refresh(e.payload.sessionId);
    if (e.payload.personalBest) {
      toast = `NUEVO RÉCORD PERSONAL · ${lapTime(e.payload.lapTime)}`;
      toasts.push(`Nuevo Récord Personal: ${lapTime(e.payload.lapTime)}`, {
        desc: e.payload.track,
        kind: "success",
        durationMs: 5000,
      });
      setTimeout(() => (toast = null), 6000);
    }
  });
  onDestroy(() => unlisten.then((f) => f()));
</script>

<div class="mx-auto max-w-[1480px] px-5 py-4 space-y-4">
  <!-- HERO SHOWROOM STAGE: REAL CAR RENDER + MANUFACTURER LOGO + CIRCUIT OUTLINE -->
  <header class="wec-stage relative overflow-hidden">
    {#if themeSweepKey > 0}
      {#key themeSweepKey}
        <div class="wec-sweep-flash z-20" aria-hidden="true"></div>
      {/key}
    {/if}
    <!-- Class-tinted diagonal studio spotlight -->
    <div
      class="pointer-events-none absolute inset-y-0 right-0 w-[66%] [clip-path:polygon(14%_0,100%_0,100%_100%,0_100%)]"
      style:background="linear-gradient(105deg, color-mix(in srgb, var(--color-accent) 22%, transparent) 0%, color-mix(in srgb, var(--color-accent) 6%, transparent) 55%, transparent 100%)"
    ></div>

    <!-- Subtle giant manufacturer watermark behind the car -->
    {#if p?.vehicleModel || p?.vehicleName || session?.car}
      <div class="pointer-events-none absolute top-1/2 left-[47%] -translate-x-1/2 -translate-y-1/2 text-white opacity-[0.045]">
        <CarLogo model={p?.vehicleModel || session?.car || ""} entry={p?.vehicleName || ""} size={195} />
      </div>
    {/if}

    <div class="relative z-10 grid min-h-[215px] items-center gap-4 px-6 py-5 lg:grid-cols-12">
      <!-- Left (5 cols): Brand Emblem + Car Identity + Track + Broadcast Actions -->
      <div class="flex flex-col justify-between gap-4 lg:col-span-5">
        <div class="flex items-start gap-4">
          <!-- Manufacturer Emblem Frame -->
          <div
            class="flex h-16 w-16 shrink-0 items-center justify-center rounded-[4px] border border-white/15 bg-[#090b10] p-2.5 text-white"
            style:border-left={`3px solid ${classAccent(p?.vehicleClass || "")}`}
          >
            {#if p?.vehicleModel || p?.vehicleName || session?.car}
              <CarLogo model={p?.vehicleModel || session?.car || ""} entry={p?.vehicleName || ""} size={42} />
            {:else}
              <img src="/mdt-logo.png" alt="MDT" class="h-full w-full object-contain" />
            {/if}
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-[2px] px-2 py-0.5 font-display text-[10px] font-bold tracking-[0.16em] text-white uppercase"
                style:background={snap?.source === "lmu" ? "#16a34a" : snap?.source === "demo" ? "#d97706" : "var(--color-accent)"}
              >
                {snap?.source === "lmu" ? "ON TRACK" : snap?.source === "demo" ? "DEMO LIVE" : "STANDBY"}
              </span>
              {#if p?.vehicleClass}
                <span
                  class="rounded-[2px] border px-1.5 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] uppercase"
                  style:border-color={classAccent(p.vehicleClass)}
                  style:color={classAccent(p.vehicleClass)}
                >
                  {p.vehicleClass}
                </span>
              {/if}
              {#if snap?.session?.kind && isLive}
                <span class="font-mono text-[10px] uppercase tracking-wider text-muted">{sessionLabel(snap.session.kind)}</span>
              {/if}
            </div>

            <div class="mt-1.5 flex items-baseline gap-2.5">
              {#if meVehicle?.number}
                <span class="font-display text-3xl leading-none font-bold italic text-accent-hi">#{meVehicle.number}</span>
              {/if}
              <h1 class="truncate font-display text-3xl leading-none font-bold tracking-[0.03em] text-white uppercase">
                {p ? (p.vehicleModel || p.vehicleName) : (session?.car || "MEDITERRANEAN MOTORSPORT")}
              </h1>
            </div>

            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span class="font-semibold text-fg uppercase tracking-wide">
                {isLive ? (snap?.session?.track || "CIRCUITO ACTIVO") : (session?.track || "Esperando a Le Mans Ultimate")}
              </span>
              {#if meVehicle?.team}
                <span class="text-white/20">·</span>
                <span class="truncate">{meVehicle.team}</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Primary Broadcast Action Deck -->
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class={[
              "btn px-3.5 py-1.5 font-display text-xs font-bold tracking-wider uppercase cursor-pointer",
              live.status.editMode ? "border-warn bg-warn text-black" : "btn-primary",
            ]}
            onclick={() => api.setEditMode(!live.status.editMode)}
          >
            {live.status.editMode ? "Salir Edición HUD" : "Editar Overlay"}
          </button>
          <button
            type="button"
            class={[
              "btn px-3 py-1.5 font-display text-xs font-bold tracking-wider uppercase cursor-pointer",
              live.status.demo ? "border-amber-400/70 bg-amber-500/20 text-amber-200" : "",
            ]}
            onclick={toggleDemo}
          >
            {live.status.demo ? "Detener Demo" : "Simular Demo"}
          </button>
          <button
            type="button"
            class="btn px-3 py-1.5 font-display text-xs font-bold tracking-wider uppercase cursor-pointer"
            onclick={() => openMobilePreview("#mobile")}
          >
            DDU Móvil
          </button>
          <button
            type="button"
            class="btn px-3 py-1.5 font-display text-xs font-bold tracking-wider uppercase cursor-pointer"
            onclick={() => openMobilePreview("#pitwall")}
          >
            Pit Wall
          </button>
          <button
            type="button"
            class="btn px-3 py-1.5 font-display text-xs font-bold tracking-wider uppercase cursor-pointer"
            onclick={() => openMobilePreview("#streamer")}
          >
            Streamer
          </button>
        </div>
      </div>

      <!-- Center (5 cols): REAL STUDIO CAR RENDER (FRONT 3/4) -->
      <div class="relative flex min-h-[168px] items-center justify-center lg:col-span-5">
        {#if p?.vehFile}
          <div class="pointer-events-none absolute bottom-2 h-5 w-[72%] rounded-full bg-black/70 blur-lg"></div>
          {#key p.vehFile}
            <CarRender
              file={p.vehFile}
              view="front"
              alt={p.vehicleModel || p.vehicleName}
              class="wec-car-rollin relative z-10 max-h-[205px] w-full max-w-[470px] object-contain drop-shadow-[0_16px_20px_rgba(0,0,0,0.8)]"
            />
          {/key}
        {:else}
          <div class="flex flex-col items-center justify-center text-center">
            <div class="font-mono text-[10px] font-bold tracking-[0.22em] text-accent-hi uppercase">PIT WALL // STANDBY</div>
            <p class="mt-1.5 max-w-xs text-xs text-muted">
              Inicia <b class="text-fg">Le Mans Ultimate</b> en modo Sin bordes o pulsa <b class="text-fg">Simular Demo</b> para ver el coche y la parrilla en directo.
            </p>
          </div>
        {/if}
      </div>

      <!-- Right (2 cols): REAL CIRCUIT OUTLINE + TRACK CONDITIONS -->
      <div class="hidden lg:flex flex-col items-center justify-between gap-2 border-l border-white/[0.08] pl-4 lg:col-span-2">
        <div class="flex h-[132px] w-full items-center justify-center">
          {#key snap?.session?.track || session?.track || ""}
            <TrackOutline
              track={snap?.session?.track || session?.track || ""}
              hideMissing
              class="wec-track-reveal h-full w-full text-white/80"
            />
          {/key}
        </div>
        <div class="w-full space-y-0.5 text-center font-mono text-[10px] uppercase tracking-wider">
          <div class="font-bold text-fg">
            {snap?.session?.weather ? `PISTA ${Math.round(snap.session.weather.trackTemp)}°C` : "PISTA --°C"}
          </div>
          <div class={snap?.session?.weather?.raining && snap.session.weather.raining > 0.05 ? "text-sky-400 font-bold" : "text-muted"}>
            {snap?.session?.weather?.raining && snap.session.weather.raining > 0.05
              ? `LLUVIA ${Math.round(snap.session.weather.raining * 100)}%`
              : "SECO · DRY"}
          </div>
        </div>
      </div>
    </div>
  </header>

  {#if toast}
    <div class="rounded-[4px] border border-purple-400/50 bg-purple-500/15 px-4 py-2 font-display text-xs font-bold tracking-[0.12em] text-purple-200 uppercase">
      {toast}
    </div>
  {/if}

  <!-- CLEAN 2-COLUMN OPERATIONS ROW (TIMING / MODULES + MASTER CONTROL RACK) -->
  <div class="grid gap-4 lg:grid-cols-12">
    <!-- Left (7 cols): Live Timing Tower when driving, or Studio Modules Hub in Standby -->
    <section class="card flex flex-col justify-between p-4 lg:col-span-7">
      {#if timingTower.length > 0}
        <div>
          <div class="mb-2.5 flex items-center justify-between border-b border-white/[0.07] pb-2">
            <span class="section-title">PARRILLA EN DIRECTO · LIVE TIMING</span>
            <span class="font-mono text-[10px] text-muted uppercase">{snap?.vehicles?.length} COCHES EN SESIÓN</span>
          </div>
          <div class="space-y-1 tnum">
            {#each timingTower as v (v.id)}
              <div
                class={[
                  "flex items-center gap-2.5 rounded-[3px] border px-2.5 py-1.5 text-xs",
                  v.isPlayer
                    ? "border-accent/60 bg-accent/15 text-white"
                    : "border-white/[0.05] bg-[#0a0c11] text-fg",
                ]}
              >
                <span class="h-4 w-[3px] shrink-0 rounded-[1px]" style:background={classAccent(v.class)}></span>
                <span class="w-6 font-display text-sm font-bold text-muted">P{v.place}</span>
                <span class="min-w-0 flex-1 truncate font-semibold">{v.driver}</span>
                <span class="hidden sm:inline truncate max-w-[160px] text-[11px] text-muted">{v.model || v.vehicle}</span>
                {#if v.inPits}
                  <span class="rounded-[2px] bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-amber-300">PIT</span>
                {:else}
                  <span class="w-16 text-right font-mono text-[11px] text-muted">
                    {v.place === 1 ? "LÍDER" : `+${v.timeBehindLeader.toFixed(1)}s`}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div>
          <div class="mb-3 flex items-center justify-between border-b border-white/[0.07] pb-2">
            <span class="section-title">SUBSISTEMAS MDT STUDIO</span>
            <span class="font-mono text-[10px] text-muted uppercase">ACCESO RÁPIDO</span>
          </div>
          <div class="grid gap-2.5 sm:grid-cols-2">
            <button type="button" class="wec-tile flex items-center justify-between p-3.5 text-left cursor-pointer" onclick={() => (nav.page = "overlays")}>
              <div>
                <div class="font-display text-sm font-bold tracking-wider text-white uppercase">Overlays HUD</div>
                <div class="mt-0.5 text-xs text-muted">Widgets en pista y perfiles</div>
              </div>
              <span class={["font-mono text-[10px] font-bold uppercase", live.status.overlayVisible ? "text-good" : "text-faint"]}>
                {live.status.overlayVisible ? "ON" : "OFF"}
              </span>
            </button>
            <button type="button" class="wec-tile flex items-center justify-between p-3.5 text-left cursor-pointer" onclick={() => (nav.page = "fx")}>
              <div>
                <div class="font-display text-sm font-bold tracking-wider text-white uppercase">Motor FX DirectX 11</div>
                <div class="mt-0.5 text-xs text-muted">Onboard real, LUTs y presets MDT</div>
              </div>
              <span class={["font-mono text-[10px] font-bold uppercase", config.value.general.onboardFx?.enabled ? "text-accent-hi" : "text-faint"]}>
                {config.value.general.onboardFx?.enabled ? "ON" : "OFF"}
              </span>
            </button>
            <button type="button" class="wec-tile flex items-center justify-between p-3.5 text-left cursor-pointer" onclick={() => (nav.page = "fx")}>
              <div>
                <div class="font-display text-sm font-bold tracking-wider text-white uppercase">MDT-Audio 3D</div>
                <div class="mt-0.5 text-xs text-muted">Audio espacial binaural en cabina</div>
              </div>
              <span class={["font-mono text-[10px] font-bold uppercase", config.value.general.audio3d?.enabled ? "text-sky-400" : "text-faint"]}>
                {config.value.general.audio3d?.enabled ? "ON" : "OFF"}
              </span>
            </button>
            <button type="button" class="wec-tile flex items-center justify-between p-3.5 text-left cursor-pointer" onclick={() => (nav.page = "settings")}>
              <div>
                <div class="font-display text-sm font-bold tracking-wider text-white uppercase">Spotter &amp; Ingeniero IA</div>
                <div class="mt-0.5 text-xs text-muted">Radio de pista y telemetría por voz</div>
              </div>
              <span class={["font-mono text-[10px] font-bold uppercase", config.value.spotter.enabled ? "text-emerald-400" : "text-faint"]}>
                {config.value.spotter.enabled ? config.value.spotter.profile : "OFF"}
              </span>
            </button>
          </div>
        </div>
      {/if}
    </section>

    <!-- Right (5 cols): Master Control Rack (Overlay, Theme Sync, Radio, Hotkeys) -->
    <section class="card flex flex-col justify-between gap-3.5 p-4 lg:col-span-5">
      <div class="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
        <div>
          <span class="section-title">CONTROL DE SESIÓN</span>
          <div class="text-[11px] text-muted">Overlay, tema visual y radio de pista</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-[10px] text-muted uppercase">HUD</span>
          <Toggle checked={live.status.overlayVisible} onchange={(v) => api.setOverlayVisible(v)} label="Mostrar overlay" />
        </div>
      </div>

      <!-- Theme Switcher (syncs BOTH Overlay AND Companion App!) -->
      <div>
        <div class="mb-1.5 font-display text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">
          TEMA VISUAL (APP + OVERLAY)
        </div>
        <div class="grid grid-cols-5 gap-1.5">
          {#each Object.entries(HUD_THEMES) as [id, t] (id)}
            <button
              type="button"
              class={[
                "flex flex-col items-center gap-1 rounded-[3px] border py-1.5 font-display text-[10px] font-bold uppercase transition cursor-pointer",
                config.value.general.theme === id
                  ? "border-accent bg-accent/20 text-white"
                  : "border-white/[0.08] bg-[#0a0c11] text-muted hover:border-white/20 hover:text-fg",
              ]}
              onclick={() => {
                applyCompleteOverlayTheme(id as PresetThemeId, true);
                wheelControl.setMobileTheme(id as PresetThemeId);
                themeSweepKey += 1;
              }}
              title={t.subtitle}
            >
              <span class="h-1.5 w-5 rounded-[1px]" style:background={t.accent}></span>
              {t.label.replace("MDT-", "")}
            </button>
          {/each}
        </div>
      </div>

      <!-- Radio Selector -->
      <div class="border-t border-white/[0.07] pt-3">
        <div class="mb-1.5 flex items-center justify-between">
          <span class="font-display text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">RADIO SPOTTER</span>
          <button
            type="button"
            class="font-mono text-[10px] font-bold text-accent-hi hover:underline uppercase cursor-pointer"
            onclick={() => spotter.trigger("Bandera Verde", true)}
          >
            PROBAR RADIO
          </button>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class={[
              "rounded-[3px] border py-1.5 font-display text-xs font-bold tracking-wider uppercase transition cursor-pointer",
              config.value.spotter.profile === "Sara"
                ? "border-accent bg-accent text-white"
                : "border-white/[0.08] bg-[#0a0c11] text-muted hover:text-fg",
            ]}
            onclick={() => setSpotterVoice("Sara")}
          >
            SARA
          </button>
          <button
            type="button"
            class={[
              "rounded-[3px] border py-1.5 font-display text-xs font-bold tracking-wider uppercase transition cursor-pointer",
              config.value.spotter.profile === "Antonio"
                ? "border-accent bg-accent text-white"
                : "border-white/[0.08] bg-[#0a0c11] text-muted hover:text-fg",
            ]}
            onclick={() => setSpotterVoice("Antonio")}
          >
            ANTONIO
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-white/[0.07] pt-2.5 font-mono text-[10px] text-muted">
        <span><kbd class="kbd mr-1">Ctrl+Shift+F9</kbd>Editar HUD</span>
        <span><kbd class="kbd mr-1">Ctrl+Shift+F10</kbd>Mostrar/Ocultar</span>
      </div>
    </section>
  </div>

  <!-- CONEXIÓN MÓVIL DDU, PIT WALL & STREAMER (QR EN DIRECTO + VOLANTE) -->
  <section class="card p-4 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="rounded-[2px] bg-accent/20 px-2 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] text-accent-hi uppercase">WI-FI · QR DIRECTO</span>
          <h2 class="section-title text-sm text-white">DDU MÓVIL, PIT WALL &amp; STREAMER DECK</h2>
        </div>
        <p class="mt-0.5 text-xs text-muted">
          Escanea el QR desde tu móvil o tablet (mismo Wi-Fi) para abrir el DDU, Muro de Ingenieros o Streamer Deck y controlar pantallas desde el volante.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" onclick={() => openMobilePreview("#mobile")} class="btn py-1 text-xs cursor-pointer">Abrir DDU Móvil</button>
        <button type="button" onclick={() => openMobilePreview("#pitwall")} class="btn py-1 text-xs cursor-pointer">Abrir Pit Wall</button>
        <button type="button" onclick={() => openMobilePreview("#streamer")} class="btn py-1 text-xs cursor-pointer">Abrir Streamer</button>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-12">
      <!-- Columna 1 (7 cols): Código QR + Selector Móvil/PitWall/Streamer + URL + IP + Firewall -->
      <div class="flex flex-col sm:flex-row gap-4 rounded-[4px] border border-white/[0.08] bg-[#0a0c11] p-3.5 lg:col-span-7">
        <div class="flex shrink-0 flex-col items-center justify-between gap-2">
          <div class="rounded-[4px] bg-white p-2" title="Escanea con la cámara de tu móvil o tablet">
            <svg width="108" height="108" viewBox="0 0 {qrMatrix.length} {qrMatrix.length}" shape-rendering="crispEdges">
              {#each qrMatrix as row, y}
                {#each row as dark, x}
                  {#if dark}
                    <rect {x} {y} width="1" height="1" fill="#000000" />
                  {/if}
                {/each}
              {/each}
            </svg>
          </div>
          <div class="grid w-full grid-cols-3 gap-1 text-[10px]">
            <button
              type="button"
              class={["rounded-[2px] py-0.5 font-display font-bold uppercase cursor-pointer", qrMode === "mobile" ? "bg-accent text-white" : "bg-surface-3 text-muted hover:text-fg"]}
              onclick={() => (qrMode = "mobile")}
            >Móvil</button>
            <button
              type="button"
              class={["rounded-[2px] py-0.5 font-display font-bold uppercase cursor-pointer", qrMode === "pitwall" ? "bg-accent text-white" : "bg-surface-3 text-muted hover:text-fg"]}
              onclick={() => (qrMode = "pitwall")}
            >PitWall</button>
            <button
              type="button"
              class={["rounded-[2px] py-0.5 font-display font-bold uppercase cursor-pointer", qrMode === "streamer" ? "bg-[#e10600] text-white" : "bg-surface-3 text-muted hover:text-fg"]}
              onclick={() => (qrMode = "streamer")}
            >Stream</button>
          </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
          <div>
            <div class="font-display text-[11px] font-bold tracking-[0.12em] text-muted uppercase">
              ENLACE WI-FI ({qrMode === "mobile" ? "DDU MÓVIL" : qrMode === "pitwall" ? "MURO PIT WALL" : "STREAMER DECK"})
            </div>
            <div class="mt-1.5 flex items-center gap-2">
              <input type="text" readonly class="field flex-1 font-mono text-xs select-all" value={activeQrUrl} />
              <button type="button" class="btn btn-primary text-xs cursor-pointer" onclick={copyMobileUrl}>
                {copiedMobileUrl ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          {#if wheelControl.lanIps.length > 0}
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span class="font-mono text-[10px] uppercase">IP PC:</span>
              {#each wheelControl.lanIps as ip}
                <button
                  type="button"
                  class={["rounded-[3px] px-2 py-0.5 font-mono text-[11px] font-bold cursor-pointer", wheelControl.selectedIp === ip ? "bg-accent text-white" : "bg-[#14171f] text-fg hover:text-accent-hi"]}
                  onclick={() => wheelControl.selectIp(ip)}
                >{ip}</button>
              {/each}
              <button
                type="button"
                class="rounded-[3px] border border-white/10 px-1.5 py-0.5 text-[10px] text-muted hover:text-white cursor-pointer"
                onclick={() => wheelControl.fetchMobileInfo()}
              >Actualizar</button>
            </div>
          {/if}

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-white/[0.08] bg-[#11141c] px-2.5 py-1.5 text-[11px]">
            {#if wheelControl.firewallOpen}
              <span class="flex items-center gap-1.5 font-semibold text-good">
                <span class="h-1.5 w-1.5 rounded-[1px] bg-good"></span>
                Firewall Windows: Puerto 1420 abierto
              </span>
              <button type="button" class="btn py-0.5 text-[10px] cursor-pointer" disabled={wheelControl.firewallBusy} onclick={() => wheelControl.openFirewall()}>
                {wheelControl.firewallBusy ? "Abriendo..." : "Reparar Firewall"}
              </button>
            {:else}
              <span class="flex items-center gap-1.5 font-semibold text-warn">
                <span class="h-1.5 w-1.5 rounded-[1px] bg-warn"></span>
                Firewall bloquea la conexión móvil
              </span>
              <button type="button" class="btn btn-primary py-0.5 text-[10px] cursor-pointer" disabled={wheelControl.firewallBusy} onclick={() => wheelControl.openFirewall()}>
                {wheelControl.firewallBusy ? "Autorizando..." : "Abrir Puerto 1420"}
              </button>
            {/if}
          </div>
        </div>
      </div>

      <!-- Columna 2 (5 cols): Botones del Volante + Pantallas activas del móvil -->
      <div class="flex flex-col justify-between gap-3 rounded-[4px] border border-white/[0.08] bg-[#0a0c11] p-3.5 lg:col-span-5">
        <div>
          <div class="flex items-center justify-between">
            <span class="font-display text-[11px] font-bold tracking-[0.12em] text-muted uppercase">BOTONES DEL VOLANTE / MFD</span>
            <span class="font-mono text-[10px] text-muted">
              {wheelControl.connectedGamepads.length > 0 ? `${wheelControl.connectedGamepads.length} USB` : "PULSA UN BOTÓN"}
            </span>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <div class="rounded-[3px] border border-white/[0.08] bg-[#11141c] p-2">
              <div class="text-[10.5px] text-muted">Siguiente MFD</div>
              <div class="mt-0.5 truncate font-mono text-xs font-bold text-accent-hi">{wheelControl.formatBinding(wheelControl.nextBind)}</div>
              <div class="mt-1.5">
                {#if wheelControl.learning === "next"}
                  <button type="button" class="btn w-full bg-warn! py-0.5 text-[11px] font-bold text-black cursor-pointer" onclick={() => wheelControl.cancelLearning()}>Pulsa... (Cancelar)</button>
                {:else}
                  <button type="button" class="btn w-full py-0.5 text-[11px] cursor-pointer" onclick={() => wheelControl.startLearning("next")}>Asignar</button>
                {/if}
              </div>
            </div>
            <div class="rounded-[3px] border border-white/[0.08] bg-[#11141c] p-2">
              <div class="text-[10.5px] text-muted">Anterior MFD</div>
              <div class="mt-0.5 truncate font-mono text-xs font-bold text-accent-hi">{wheelControl.formatBinding(wheelControl.prevBind)}</div>
              <div class="mt-1.5">
                {#if wheelControl.learning === "prev"}
                  <button type="button" class="btn w-full bg-warn! py-0.5 text-[11px] font-bold text-black cursor-pointer" onclick={() => wheelControl.cancelLearning()}>Pulsa... (Cancelar)</button>
                {:else}
                  <button type="button" class="btn w-full py-0.5 text-[11px] cursor-pointer" onclick={() => wheelControl.startLearning("prev")}>Asignar</button>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-2 border-t border-white/[0.07] pt-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                class="accent-accent"
                checked={wheelControl.autoPopups}
                onchange={(e) => wheelControl.setAutoPopups(e.currentTarget.checked)}
              />
              <span class="font-semibold text-fg">Pop-ups automáticos móvil</span>
            </label>
            <button type="button" class="font-mono text-[10px] font-bold text-accent-hi uppercase hover:underline cursor-pointer" onclick={() => (showMobileOrderEditor = !showMobileOrderEditor)}>
              {showMobileOrderEditor ? "Ocultar pantallas" : `Pantallas (${wheelControl.activePages.length})`}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <button type="button" class="btn px-2 py-0.5 text-[11px] cursor-pointer" onclick={() => wheelControl.prevPage()}>‹</button>
            {#each wheelControl.activePages as pg, i (pg.id)}
              <button
                type="button"
                class={["rounded-[3px] px-2 py-0.5 text-[11px] font-bold cursor-pointer", wheelControl.page === pg.id ? "bg-accent text-white" : "bg-[#14171f] text-muted hover:text-fg"]}
                onclick={() => wheelControl.setPage(i)}
              >
                {i + 1}. {pg.short}
              </button>
            {/each}
            <button type="button" class="btn px-2 py-0.5 text-[11px] cursor-pointer" onclick={() => wheelControl.nextPage()}>›</button>
          </div>
        </div>
      </div>
    </div>

    <div class="wec-accordion" data-open={showMobileOrderEditor}>
      <div>
        <div class="grid gap-3 rounded-[4px] border border-white/[0.08] bg-[#0a0c11] p-3.5 md:grid-cols-2">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-bold uppercase text-muted">
              <span>Orden en el móvil</span>
              <button type="button" class="text-accent-hi hover:underline cursor-pointer" onclick={() => wheelControl.resetPages()}>Restablecer</button>
            </div>
            {#each wheelControl.activePages as pg, idx (pg.id)}
              <div class="flex items-center justify-between rounded-[3px] border border-white/[0.07] bg-[#11141c] px-2.5 py-1 text-xs">
                <span class="font-semibold text-fg"><span class="mr-1 font-mono text-accent-hi">{idx + 1}.</span>{pg.title}</span>
                <div class="flex items-center gap-1">
                  <button type="button" class="rounded bg-surface-3 px-1.5 py-0.5 font-bold disabled:opacity-30 cursor-pointer" disabled={idx === 0} onclick={() => wheelControl.movePage(idx, -1)}>↑</button>
                  <button type="button" class="rounded bg-surface-3 px-1.5 py-0.5 font-bold disabled:opacity-30 cursor-pointer" disabled={idx === wheelControl.activePages.length - 1} onclick={() => wheelControl.movePage(idx, 1)}>↓</button>
                  <button type="button" class="rounded bg-bad/20 px-1.5 py-0.5 font-bold text-bad hover:bg-bad hover:text-white disabled:opacity-30 cursor-pointer" disabled={wheelControl.activePages.length <= 1} onclick={() => wheelControl.removePage(pg.id)}>✕</button>
                </div>
              </div>
            {/each}
          </div>
          <div>
            <div class="mb-1.5 text-[11px] font-bold uppercase text-muted">Añadir pantallas al móvil</div>
            {#if wheelControl.availableToAdd.length === 0}
              <div class="text-xs text-muted">Todas las pantallas están activas.</div>
            {:else}
              <div class="flex flex-wrap gap-1.5">
                {#each wheelControl.availableToAdd as avail (avail.id)}
                  <button type="button" class="rounded-[3px] border border-white/10 bg-[#11141c] px-2.5 py-1 text-xs font-semibold text-fg hover:border-accent cursor-pointer" onclick={() => wheelControl.addPage(avail.id)}>+ {avail.short}</button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- LAST SESSION DEBRIEF & LAP TABLE -->
  {#if session && laps.length > 0}
    <RaceDebriefCard {session} {laps} {units} />
  {/if}

  <div>
    <div class="mb-2 flex items-baseline justify-between">
      <h2 class="section-title">
        ÚLTIMA SESIÓN REGISTRADA
        {#if session}
          <span class="ml-2 font-sans text-xs font-normal normal-case tracking-normal text-muted">
            {session.track} · {session.car} · {session.sessionType}
          </span>
        {/if}
      </h2>
      {#if session}
        <button
          class="font-display text-xs font-bold tracking-wider text-accent-hi uppercase hover:underline cursor-pointer"
          onclick={() => {
            nav.sessionId = session!.id;
            nav.page = "sessions";
          }}
        >
          Abrir sesión completa →
        </button>
      {/if}
    </div>
    <LapTable {laps} onopen={(l) => nav.openAnalysis(l.track, l.id)} />
  </div>
</div>
