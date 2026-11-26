<script lang="ts">
  import { onMount } from "svelte";
  import { applyRemoteConfig, config, HUD_THEMES, loadConfig } from "../lib/config.svelte";
  import { classColor, clock, lapTime, shortName } from "../lib/format";
  import { isMainDriverOnTrack, live, startLive } from "../lib/live.svelte";
  import { mobileNoSleep } from "../lib/noSleep";
  import type { Snapshot, Vehicle } from "../lib/types";
  import { MOBILE_SERVER_BASE, wheelControl } from "../lib/wheelControl.svelte";

  type DeckTab = "main" | "widgets" | "cameras" | "themes" | "streamdeck";
  let activeTab = $state<DeckTab>("main");
  let selectedClass = $state<string>("ALL");
  let wakeLockActive = $state(false);
  let feedback = $state<string>("");
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let copiedUrlId = $state<string>("");

  // Live host state synced from Rust /__mobile_snap
  let overlayVisible = $state(true);
  let editMode = $state(false);
  let demoMode = $state(false);
  let broadcastMode = $state(false);

  const snap = $derived(live.snap);
  const s = $derived(snap?.session);
  const vehicles = $derived([...(snap?.vehicles ?? [])].sort((a, b) => a.place - b.place));
  const me = $derived(vehicles.find((v) => v.isPlayer) ?? null);
  const mainOnTrack = $derived(isMainDriverOnTrack(snap));
  const activeProfileName = $derived(config.value.profiles[config.value.activeProfile]?.name ?? "Principal");
  const spotterOn = $derived(Boolean(config.value.spotter?.enabled));

  const availableClasses = $derived.by(() => {
    const set = new Set<string>();
    for (const v of vehicles) if (v.class) set.add(v.class.trim());
    return Array.from(set).sort();
  });

  const filteredVehicles = $derived.by(() => {
    if (selectedClass === "ALL") return vehicles;
    return vehicles.filter((v) => (v.class || "").toLowerCase().includes(selectedClass.toLowerCase()));
  });

  function flashFeedback(msg: string) {
    feedback = msg;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => (feedback = ""), 2200);
  }

  async function sendCmd(action: string, value = "", label = "") {
    if (
      mainOnTrack &&
      (action === "focus_driver" || action === "focus_leader" || action === "focus_battle")
    ) {
      flashFeedback("🔒 Piloto en pista · Cambio de cámara bloqueado");
      return;
    }
    try {
      const res = await fetch(`${MOBILE_SERVER_BASE}/__streamer_cmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      if (res.ok) {
        if (label) flashFeedback(`✓ ${label}`);
      } else {
        flashFeedback("⚠️ Error enviando comando");
      }
    } catch {
      flashFeedback("⚠️ Sin conexión con PC");
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  async function toggleWakeLock() {
    if (wakeLockActive) {
      mobileNoSleep.disable();
      wakeLockActive = false;
    } else {
      wakeLockActive = await mobileNoSleep.enable();
    }
  }

  function copyHttpUrl(id: string, url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    copiedUrlId = id;
    flashFeedback("📋 URL copiada para Stream Deck");
    setTimeout(() => (copiedUrlId = ""), 2000);
  }

  const baseOrigin = $derived(typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:1420");

  const STREAMDECK_WIDGETS: { id: string; label: string; icon: string; group: string }[] = [
    { id: "standings", label: "Clasificación", icon: "🏆", group: "Broadcast" },
    { id: "relative", label: "Relativo", icon: "⏱️", group: "Broadcast" },
    { id: "battleforpos", label: "Duelo Posición", icon: "⚔️", group: "Broadcast" },
    { id: "broadcastticker", label: "Ticker TV", icon: "📺", group: "Broadcast" },
    { id: "driverlowerthird", label: "Lower Third", icon: "🏷️", group: "Broadcast" },
    { id: "headtohead", label: "Cara a Cara", icon: "🆚", group: "Broadcast" },
    { id: "gridpodium", label: "Parrilla / Podio", icon: "🥇", group: "Broadcast" },
    { id: "trackmap", label: "Mapa Circuito", icon: "🗺️", group: "Pista" },
    { id: "radar", label: "Radar Spotter", icon: "📡", group: "Pista" },
    { id: "dashboard", label: "Dashboard", icon: "🏎️", group: "Piloto" },
    { id: "customdash", label: "Dash Studio", icon: "🎨", group: "Piloto" },
    { id: "pitbox", label: "Guía Boxes", icon: "🛑", group: "Piloto" },
    { id: "inputs", label: "Pedales", icon: "📊", group: "Piloto" },
    { id: "weather", label: "Clima", icon: "🌧️", group: "Pista" },
    { id: "flags", label: "Banderas", icon: "🚩", group: "Pista" },
    { id: "spotter", label: "Team Radio", icon: "🎙️", group: "Broadcast" },
  ];

  const HTTP_ENDPOINTS: { id: string; label: string; action: string; value?: string }[] = [
    { id: "tog-hud", label: "Mostrar / Ocultar Overlay", action: "toggle_overlay" },
    { id: "tog-bc", label: "Alternar Modo Broadcast", action: "toggle_broadcast" },
    { id: "tog-edit", label: "Modo Edición Overlay", action: "toggle_edit" },
    { id: "tog-spot", label: "Silenciar / Activar Spotter", action: "toggle_spotter" },
    { id: "next-prof", label: "Siguiente Perfil de Overlay", action: "next_profile" },
    { id: "foc-bat", label: "Cámara: Batalla más cerrada", action: "focus_battle" },
    { id: "foc-lead", label: "Cámara: Líder de carrera", action: "focus_leader" },
    { id: "foc-me", label: "Cámara: Volver a mi coche", action: "focus_player" },
    { id: "mob-next", label: "Móvil DDU: Siguiente página", action: "mobile_page_next" },
    { id: "mob-prev", label: "Móvil DDU: Página anterior", action: "mobile_page_prev" },
    { id: "tog-demo", label: "Activar / Parar Modo Demo", action: "toggle_demo" },
    { id: "w-stand", label: "Toggle Widget Clasificación", action: "toggle_widget", value: "standings" },
    { id: "w-battle", label: "Toggle Widget Duelo TV", action: "toggle_widget", value: "battleforpos" },
    { id: "w-ticker", label: "Toggle Widget Ticker TV", action: "toggle_widget", value: "broadcastticker" },
  ];

  onMount(() => {
    void loadConfig();
    void startLive();
    wheelControl.startHost();

    let mounted = true;
    let lastConfigSeq = -1;
    let activeCtrl: AbortController | null = null;

    const syncLoop = async () => {
      while (mounted) {
        const t0 = performance.now();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const ctrl = new AbortController();
          activeCtrl = ctrl;
          timeoutId = setTimeout(() => ctrl.abort(), 1200);
          const qs = lastConfigSeq >= 0 ? `?cfgSeq=${lastConfigSeq}` : "";
          const res = await fetch(`${MOBILE_SERVER_BASE}/__mobile_snap${qs}`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.appConfig) applyRemoteConfig(data.appConfig);
            if (data.snap) {
              (window as any).__MDT_STOP_DEMO__?.();
              live.snap = data.snap as Snapshot;
            }
            if (typeof data.configSeq === "number") lastConfigSeq = data.configSeq;
            if (typeof data.overlayVisible === "boolean") overlayVisible = data.overlayVisible;
            if (typeof data.editMode === "boolean") editMode = data.editMode;
            if (typeof data.demo === "boolean") demoMode = data.demo;
            if (typeof data.broadcastMode === "boolean") broadcastMode = data.broadcastMode;
          }
        } catch {
          // retry
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          activeCtrl = null;
        }
        const elapsed = performance.now() - t0;
        await new Promise((r) => setTimeout(r, Math.max(40, 120 - elapsed)));
      }
    };
    void syncLoop();
    void mobileNoSleep.enable().then((ok) => (wakeLockActive = ok));

    return () => {
      mounted = false;
      activeCtrl?.abort();
      mobileNoSleep.disable();
    };
  });
</script>

<div
  translate="no"
  class="notranslate flex h-dvh w-dvw flex-col overflow-hidden bg-[#060a12] font-sans text-white select-none"
>
  <!-- Top Stream Deck Status Bar -->
  <header class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b1220] px-3 py-2 shadow-lg">
    <div class="flex items-center gap-2.5">
      <img src="/mdt-logo.png" alt="MDT" class="h-6 w-6 object-contain" />
      <div>
        <div class="flex items-center gap-2">
          <span class="font-display text-sm font-black tracking-wider text-white uppercase">MDT STREAMER DECK</span>
          <span class={["h-2 w-2 rounded-full", snap?.source === "lmu" ? "bg-emerald-400 animate-pulse" : snap?.source === "demo" ? "bg-amber-400" : "bg-white/25"]}></span>
          {#if broadcastMode}
            <span class="rounded bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-black text-white animate-pulse">ON AIR</span>
          {/if}
        </div>
        <div class="text-[10px] text-white/55">
          {s?.track || "Sin sesión"} · {s ? clock(s.timeRemaining) : "--:--"} · Perfil: <b class="text-accent-hi">{activeProfileName}</b>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      {#if feedback}
        <span class="rounded-full border border-accent/50 bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-accent-hi">
          {feedback}
        </span>
      {/if}
      <a href="/#mobile" class="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/75 hover:bg-white/15">📱 DDU</a>
      <a href="/#pitwall" class="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/75 hover:bg-white/15">📡 PitWall</a>
      <button
        type="button"
        class={[
          "rounded-lg border px-2 py-1 text-xs font-bold cursor-pointer",
          wakeLockActive ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-white/15 bg-white/10 text-white/60",
        ]}
        title="Mantener pantalla encendida"
        onclick={toggleWakeLock}
      >☀️</button>
      <button
        type="button"
        class="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs font-bold text-white hover:bg-white/20 cursor-pointer"
        title="Pantalla completa"
        onclick={toggleFullscreen}
      >⛶</button>
    </div>
  </header>

  <!-- Deck Navigation Tabs -->
  <nav class="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-[#090f1a] px-2.5 py-1.5 text-xs font-bold">
    {#each [
      { id: "main", label: "🎛️ Principal" },
      { id: "widgets", label: "📺 Widgets HUD" },
      { id: "cameras", label: "🎥 Cámaras" },
      { id: "themes", label: "🎨 Perfiles & Temas" },
      { id: "streamdeck", label: "🔗 Stream Deck URLs" },
    ] as t (t.id)}
      <button
        type="button"
        class={[
          "shrink-0 rounded-lg px-3 py-1.5 transition cursor-pointer",
          activeTab === t.id ? "bg-accent text-white shadow-[0_0_12px_var(--color-accent)]" : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white",
        ]}
        onclick={() => (activeTab = t.id as DeckTab)}
      >
        {t.label}
      </button>
    {/each}
  </nav>

  <!-- Deck Body -->
  <main class="min-h-0 flex-1 overflow-y-auto p-3">
    <!-- TAB 1: MAIN STREAM DECK PAD GRID -->
    {#if activeTab === "main"}
      <div class="mx-auto grid max-w-4xl grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        <button
          type="button"
          class={["deck-pad", overlayVisible ? "border-emerald-400/70 bg-emerald-950/45 shadow-[0_0_16px_rgba(16,185,129,0.25)]" : "border-red-500/70 bg-red-950/45"]}
          onclick={() => sendCmd("toggle_overlay", "", overlayVisible ? "HUD Oculto" : "HUD Visible")}
        >
          <span class="text-2xl">{overlayVisible ? "👁️" : "🙈"}</span>
          <span class="font-display text-xs font-black uppercase">{overlayVisible ? "HUD VISIBLE" : "HUD OCULTO"}</span>
          <span class="text-[10px] opacity-65">Mostrar / Ocultar</span>
        </button>

        <button
          type="button"
          class={["deck-pad", broadcastMode ? "border-red-500 bg-red-950/55 shadow-[0_0_18px_rgba(239,68,68,0.4)]" : "border-white/15 bg-white/5"]}
          onclick={() => sendCmd("toggle_broadcast", "", "Modo Broadcast")}
        >
          <span class="text-2xl">📺</span>
          <span class="font-display text-xs font-black uppercase">BROADCAST {broadcastMode ? "ON" : "OFF"}</span>
          <span class="text-[10px] opacity-65">Perfil TV / OBS</span>
        </button>

        <button
          type="button"
          class={["deck-pad", editMode ? "border-amber-400 bg-amber-950/50 shadow-[0_0_16px_rgba(245,158,11,0.35)]" : "border-white/15 bg-white/5"]}
          onclick={() => sendCmd("toggle_edit", "", "Modo Edición")}
        >
          <span class="text-2xl">✏️</span>
          <span class="font-display text-xs font-black uppercase">EDITAR {editMode ? "ACTIVO" : "HUD"}</span>
          <span class="text-[10px] opacity-65">Mover / Escalar</span>
        </button>

        <button
          type="button"
          class={["deck-pad", spotterOn ? "border-sky-400/70 bg-sky-950/45" : "border-white/15 bg-white/5"]}
          onclick={() => sendCmd("toggle_spotter", "", spotterOn ? "Spotter Silenciado" : "Spotter Activado")}
        >
          <span class="text-2xl">{spotterOn ? "🎙️" : "🔇"}</span>
          <span class="font-display text-xs font-black uppercase">SPOTTER {spotterOn ? "ON" : "OFF"}</span>
          <span class="text-[10px] opacity-65">Radio Ingeniero</span>
        </button>

        <button
          type="button"
          class="deck-pad border-indigo-400/50 bg-indigo-950/35"
          onclick={() => sendCmd("next_profile", "", "Siguiente Perfil")}
        >
          <span class="text-2xl">🗂️</span>
          <span class="font-display text-xs font-black uppercase">SIG. PERFIL</span>
          <span class="truncate text-[10px] text-indigo-200">{activeProfileName}</span>
        </button>

        <button
          type="button"
          disabled={mainOnTrack}
          class="deck-pad border-amber-400/50 bg-amber-950/30 disabled:opacity-35"
          onclick={() => sendCmd("focus_battle", "", "Cámara en Batalla")}
        >
          <span class="text-2xl">⚔️</span>
          <span class="font-display text-xs font-black uppercase">ENFOCAR BATALLA</span>
          <span class="text-[10px] opacity-65">Duelo más cerrado</span>
        </button>

        <button
          type="button"
          disabled={mainOnTrack}
          class="deck-pad border-fuchsia-400/50 bg-fuchsia-950/30 disabled:opacity-35"
          onclick={() => sendCmd("focus_leader", "", "Cámara en Líder")}
        >
          <span class="text-2xl">👑</span>
          <span class="font-display text-xs font-black uppercase">ENFOCAR LÍDER</span>
          <span class="text-[10px] opacity-65">P1 Absoluto</span>
        </button>

        <button
          type="button"
          class="deck-pad border-cyan-400/50 bg-cyan-950/30"
          onclick={() => sendCmd("focus_player", "", "Volver a Mi Coche")}
        >
          <span class="text-2xl">🏠</span>
          <span class="font-display text-xs font-black uppercase">MI COCHE</span>
          <span class="text-[10px] opacity-65">{me ? `#${me.number || me.id}` : "Piloto"}</span>
        </button>

        <button
          type="button"
          class={["deck-pad", demoMode ? "border-amber-400 bg-amber-950/45" : "border-white/15 bg-white/5"]}
          onclick={() => sendCmd("toggle_demo", "", "Modo Demo")}
        >
          <span class="text-2xl">🎮</span>
          <span class="font-display text-xs font-black uppercase">DEMO {demoMode ? "ON" : "OFF"}</span>
          <span class="text-[10px] opacity-65">Datos simulación</span>
        </button>

        <button
          type="button"
          class="deck-pad border-white/15 bg-white/5"
          onclick={() => sendCmd("mobile_page_prev", "", "Página Móvil Anterior")}
        >
          <span class="text-2xl">◀️</span>
          <span class="font-display text-xs font-black uppercase">PÁG MÓVIL -</span>
          <span class="text-[10px] opacity-65">DDU Anterior</span>
        </button>

        <button
          type="button"
          class="deck-pad border-white/15 bg-white/5"
          onclick={() => sendCmd("mobile_page_next", "", "Siguiente Página Móvil")}
        >
          <span class="text-2xl">▶️</span>
          <span class="font-display text-xs font-black uppercase">PÁG MÓVIL +</span>
          <span class="text-[10px] opacity-65">DDU Siguiente</span>
        </button>

        <button
          type="button"
          class="deck-pad border-red-500/60 bg-red-950/40"
          onclick={() => sendCmd("hide_overlay", "", "Modo Pánico (HUD Oculto)")}
        >
          <span class="text-2xl">🚨</span>
          <span class="font-display text-xs font-black uppercase text-red-300">PÁNICO OFF</span>
          <span class="text-[10px] opacity-65">Limpiar pantalla</span>
        </button>
      </div>

    <!-- TAB 2: LIVE WIDGET ON/OFF TOGGLES -->
    {:else if activeTab === "widgets"}
      <div class="mx-auto max-w-4xl">
        <p class="mb-2.5 text-xs text-white/60">Toca cualquier botón para encender o apagar ese widget en directo en el overlay:</p>
        <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {#each STREAMDECK_WIDGETS as w (w.id)}
            {@const isOn = Boolean(config.value.widgets[w.id]?.enabled)}
            <button
              type="button"
              class={[
                "deck-pad",
                isOn
                  ? "border-emerald-400/75 bg-emerald-950/40 shadow-[0_0_14px_rgba(16,185,129,0.22)]"
                  : "border-white/10 bg-white/[0.03] opacity-65",
              ]}
              onclick={() => sendCmd("toggle_widget", w.id, `${w.label} ${isOn ? "OFF" : "ON"}`)}
            >
              <span class="text-2xl">{w.icon}</span>
              <span class="font-display text-xs font-black uppercase">{w.label}</span>
              <span class={["rounded px-1.5 py-0.2 font-mono text-[9px] font-black", isOn ? "bg-emerald-400 text-black" : "bg-white/10 text-white/60"]}>
                {isOn ? "ACTIVO" : "APAGADO"}
              </span>
            </button>
          {/each}
        </div>
      </div>

    <!-- TAB 3: LIVE CAMERA SWITCHER -->
    {:else if activeTab === "cameras"}
      <div class="mx-auto max-w-4xl space-y-3">
        {#if mainOnTrack}
          <div class="rounded-xl border border-amber-400/50 bg-amber-950/35 px-3 py-2 text-xs font-bold text-amber-200">
            🔒 Piloto principal conduciendo en pista: el cambio de cámara a otros pilotos está bloqueado por seguridad.
          </div>
        {/if}

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1">
            <button
              type="button"
              class={["rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer", selectedClass === "ALL" ? "bg-accent text-white" : "bg-white/10 text-white/65"]}
              onclick={() => (selectedClass = "ALL")}
            >TODAS ({vehicles.length})</button>
            {#each availableClasses as c (c)}
              <button
                type="button"
                class={["rounded-lg px-2.5 py-1 text-xs font-bold uppercase cursor-pointer", selectedClass === c ? "bg-accent text-white" : "bg-white/10 text-white/65"]}
                onclick={() => (selectedClass = c)}
              >{c}</button>
            {/each}
          </div>
          <div class="flex gap-1.5">
            <button type="button" disabled={mainOnTrack} class="rounded-lg bg-amber-500/25 px-2.5 py-1 text-xs font-bold text-amber-200 disabled:opacity-35 cursor-pointer" onclick={() => sendCmd("focus_battle", "", "Batalla")}>⚔️ Batalla</button>
            <button type="button" disabled={mainOnTrack} class="rounded-lg bg-fuchsia-500/25 px-2.5 py-1 text-xs font-bold text-fuchsia-200 disabled:opacity-35 cursor-pointer" onclick={() => sendCmd("focus_leader", "", "Líder")}>👑 Líder</button>
            <button type="button" class="rounded-lg bg-cyan-500/25 px-2.5 py-1 text-xs font-bold text-cyan-200 cursor-pointer" onclick={() => sendCmd("focus_player", "", "Mi Coche")}>🏠 Mi Coche</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {#each filteredVehicles as v (v.id)}
            <button
              type="button"
              disabled={mainOnTrack && !v.isPlayer}
              class={[
                "flex flex-col items-start rounded-xl border p-2.5 text-left transition active:scale-95 cursor-pointer disabled:opacity-40",
                v.isPlayer ? "border-accent bg-accent/20" : "border-white/10 bg-white/5 hover:border-cyan-400/60 hover:bg-white/10",
              ]}
              onclick={() => sendCmd("focus_driver", String(v.slotId ?? v.id), `Cámara #${v.number || v.id} ${shortName(v.driver)}`)}
            >
              <div class="flex w-full items-center justify-between">
                <span class="rounded px-1.5 py-0.5 font-mono text-[10px] font-black text-white" style:background={classColor(v.class)}>
                  P{v.place} · #{v.number || v.id}
                </span>
                {#if v.inPits}
                  <span class="rounded bg-red-600 px-1 text-[9px] font-black text-white">PIT</span>
                {/if}
              </div>
              <div class="mt-1.5 w-full truncate text-xs font-bold text-white">{shortName(v.driver)}</div>
              <div class="mt-0.5 flex w-full justify-between font-mono text-[10px] text-white/55">
                <span>{v.place === 1 ? "Líder" : `+${v.timeBehindLeader.toFixed(1)}s`}</span>
                <span>{lapTime(v.lastLap)}</span>
              </div>
            </button>
          {:else}
            <div class="col-span-full py-10 text-center text-xs text-white/45">Sin vehículos en pista actualmente.</div>
          {/each}
        </div>
      </div>

    <!-- TAB 4: PROFILES & THEMES -->
    {:else if activeTab === "themes"}
      <div class="mx-auto max-w-4xl space-y-5">
        <div>
          <h3 class="mb-2 font-display text-xs font-black tracking-wider text-white/60 uppercase">Perfiles de Overlay</h3>
          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {#each Object.entries(config.value.profiles) as [id, prof] (id)}
              {@const isAct = config.value.activeProfile === id}
              <button
                type="button"
                class={["deck-pad", isAct ? "border-accent bg-accent/25 shadow-[0_0_16px_var(--color-accent)]" : "border-white/15 bg-white/5"]}
                onclick={() => sendCmd("set_profile", id, `Perfil: ${prof.name}`)}
              >
                <span class="text-xl">🗂️</span>
                <span class="font-display text-xs font-black uppercase">{prof.name}</span>
                <span class="text-[10px] opacity-70">{isAct ? "● ACTIVO" : "Aplicar perfil"}</span>
              </button>
            {/each}
          </div>
        </div>

        <div>
          <h3 class="mb-2 font-display text-xs font-black tracking-wider text-white/60 uppercase">Temas Visuales (PC + Móvil)</h3>
          <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
            {#each Object.entries(HUD_THEMES) as [id, t] (id)}
              {@const isAct = config.value.general.theme === id}
              <button
                type="button"
                class={["deck-pad", isAct ? "border-accent bg-accent/25" : "border-white/15 bg-white/5"]}
                onclick={() => sendCmd("set_theme", id, `Tema: ${t.label}`)}
              >
                <div class="flex items-center gap-1.5">
                  <span class="h-3.5 w-3.5 rounded-full" style:background={t.accent}></span>
                  <span class="h-3.5 w-3.5 rounded-full" style:background={t.secondary}></span>
                </div>
                <span class="font-display text-xs font-black uppercase">{t.label}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>

    <!-- TAB 5: STREAM DECK HTTP ENDPOINTS -->
    {:else}
      <div class="mx-auto max-w-4xl space-y-2">
        <div class="rounded-xl border border-accent/35 bg-accent/10 p-3 text-xs text-white/85">
          <b>Integración Elgato Stream Deck / Touch Portal / Bitfocus Companion:</b><br />
          Añade una acción <b>"Sitio Web / HTTP GET"</b> (en segundo plano) en tu Stream Deck y pega cualquiera de estas URLs:
        </div>
        <div class="space-y-1.5">
          {#each HTTP_ENDPOINTS as ep (ep.id)}
            {@const fullUrl = `${baseOrigin}/__streamer_cmd?action=${ep.action}${ep.value ? `&value=${ep.value}` : ""}`}
            <div class="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
              <div class="min-w-0">
                <div class="text-xs font-bold text-white">{ep.label}</div>
                <div class="truncate font-mono text-[10px] text-cyan-300">{fullUrl}</div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                onclick={() => copyHttpUrl(ep.id, fullUrl)}
              >
                {copiedUrlId === ep.id ? "✓ Copiado" : "Copiar URL"}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .deck-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: 92px;
    padding: 0.75rem 0.5rem;
    border-radius: 0.9rem;
    border-width: 2px;
    text-align: center;
    cursor: pointer;
    transition: transform 90ms ease, background-color 150ms ease, border-color 150ms ease;
  }
  .deck-pad:active {
    transform: scale(0.94);
  }
</style>
