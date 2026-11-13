<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onDestroy, onMount } from "svelte";
  import { api } from "../../lib/api";
  import {
    applyCompleteOverlayTheme,
    config,
    createMdtTemplateProfile,
    HUD_THEMES,
    saveConfig,
    switchProfile,
    type PresetThemeId,
  } from "../../lib/config.svelte";
  import { delta, fuel, fuelUnit, lapTime, sessionLabel, speed, speedUnit } from "../../lib/format";
  import { live } from "../../lib/live.svelte";
  import { spotter } from "../../lib/spotter.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import type { LapRecord, LapRecordedEvent, SessionSummary } from "../../lib/types";
  import CarLogo from "../../overlay/CarLogo.svelte";
  import TrackHero from "../../lib/TrackHero.svelte";
  import LapTable from "../components/LapTable.svelte";
  import Toggle from "../components/Toggle.svelte";
  import { nav } from "../nav.svelte";

  const snap = $derived(live.snap);
  const p = $derived(snap?.player);
  const units = $derived(config.value.general.units);
  let copiedMobileUrl = $state(false);
  let showMobileOrderEditor = $state(false);

  function copyMobileUrl() {
    navigator.clipboard.writeText(wheelControl.mobileUrl);
    copiedMobileUrl = true;
    setTimeout(() => (copiedMobileUrl = false), 2500);
  }

  function setSpotterVoice(v: "Sara" | "Antonio") {
    config.value.spotter.profile = v;
    saveConfig();
  }

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
      toast = `Nuevo récord personal: ${lapTime(e.payload.lapTime)}`;
      setTimeout(() => (toast = null), 6000);
    }
  });
  onDestroy(() => unlisten.then((f) => f()));
</script>

<div class="mx-auto max-w-6xl p-6">
  <!-- 6. Mediterranean Motorsport Command Center Header -->
  <section class="relative mb-5 overflow-hidden rounded-xl border border-[#2287EC]/35 bg-gradient-to-r from-[#091526] via-[#0d1f38] to-[#0a1220] p-4 shadow-lg">
    <div class="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[#2287EC]/15 blur-3xl"></div>
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <img src="/mdt-logo.png" alt="Mediterranean Motorsport" class="h-12 w-12 rounded-xl border border-[#2287EC]/40 bg-black/40 p-1 object-contain shadow-md" />
        <div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold tracking-[0.2em] text-[#2287EC] uppercase">Mediterranean Motorsport</span>
            <span class="rounded bg-[#2287EC]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#62b0ff]">COMMAND CENTER</span>
          </div>
          <h1 class="text-xl font-extrabold tracking-tight text-white">MDT-HUD · Telemetría & Spotter WEC</h1>
        </div>
      </div>

      <!-- Controles rápidos: Tema Overlay PC + Perfil HUD + Spotter -->
      <div class="flex flex-wrap items-center gap-2.5 text-xs">
        <div class="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5">
          <span class="text-muted">Tema PC:</span>
          {#each Object.entries(HUD_THEMES) as [id, t] (id)}
            <button
              class={[
                "flex items-center gap-1 rounded px-2 py-1 font-display text-xs font-extrabold transition",
                config.value.general.theme === id
                  ? "bg-accent text-white shadow"
                  : "text-muted hover:bg-white/10 hover:text-white",
              ]}
              onclick={() => applyCompleteOverlayTheme(id as PresetThemeId, true)}
              title={t.subtitle}
            >
              <span class="h-2 w-2 rounded-full" style:background={t.accent}></span>
              {t.label}
            </button>
          {/each}
        </div>

        <div class="flex items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-3 py-1.5">
          <span class="text-muted">Spotter:</span>
          <button
            class={["rounded px-2 py-1 font-bold transition", config.value.spotter.profile === "Sara" ? "bg-[#2287EC] text-white" : "text-muted hover:text-white"]}
            onclick={() => setSpotterVoice("Sara")}
          >Sara</button>
          <button
            class={["rounded px-2 py-1 font-bold transition", config.value.spotter.profile === "Antonio" ? "bg-[#2287EC] text-white" : "text-muted hover:text-white"]}
            onclick={() => setSpotterVoice("Antonio")}
          >Antonio</button>
          <button
            class="btn px-2 py-1 text-[11px]"
            onclick={() => spotter.trigger("Bandera Verde", true)}
            title="Probar voz del Spotter"
          >🔊 Probar</button>
        </div>
      </div>
    </div>
    {#if toast}
      <div class="mt-3 inline-block rounded-full bg-best/15 px-3 py-1 text-sm font-semibold text-best">{toast}</div>
    {/if}
  </section>

  <div class="grid gap-4 lg:grid-cols-3">
    <section class="card overflow-hidden lg:col-span-2">
      {#if !snap || snap.source === "none"}
        <div class="p-5">
          <div class="text-xl font-semibold">Esperando a Le Mans Ultimate</div>
          <p class="mt-2 max-w-xl text-sm text-muted">
            Inicia el juego y sal a pista. Ejecútalo en modo <b class="text-fg">sin bordes (borderless)</b> o ventana para que el
            overlay se dibuje encima. No necesita plugins adicionales: MDT-HUD lee la memoria compartida nativa de LMU.
          </p>
        </div>
      {:else}
        <TrackHero track={snap.session.track} file={p?.vehFile} alt={p?.vehicleModel}>
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-hi">{sessionLabel(snap.session.kind)}</span>
            {#if snap.source === "demo"}
              <span class="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-semibold text-warn">Datos demo</span>
            {/if}
          </div>
          <div class="mt-2 truncate text-2xl font-bold">{snap.session.track || "—"}</div>
          <div class="mt-1 flex items-center gap-2 text-sm text-muted">
            {#if p}
              <CarLogo model={p.vehicleModel} entry={p.vehicleName} size={15} />
              {p.vehicleModel || p.vehicleName} · {p.vehicleClass}
            {:else}Fuera del coche{/if}
          </div>
        </TrackHero>
        {#if p}
          <div class="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2 border-t border-line p-4 tnum">
            {#each [
              [`Vuelta ${p.lapNumber + 1}`, lapTime(snap.timing.currentLapTime, 1), ""],
              ["Velocidad", `${Math.round(speed(p.speed, units))}`, speedUnit(units)],
              ["Marcha", p.gear < 0 ? "R" : p.gear === 0 ? "N" : String(p.gear), ""],
              ["Δ PB", delta(snap.timing.deltaPb), ""],
              ["Mejor", lapTime(snap.timing.sessionBest), ""],
              ["Comb.", fuel(p.fuel, units).toFixed(1), fuelUnit(units)],
            ] as [label, value, unit]}
              <div class="rounded-lg bg-surface-2 px-3 py-2.5">
                <div class="text-xs text-muted">{label}</div>
                <div class="mt-0.5 font-display text-2xl font-semibold whitespace-nowrap">{value} <span class="text-xs font-medium text-muted">{unit}</span></div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>

    <section class="flex flex-col gap-3 card p-4 text-sm">
      <div class="section-title text-sm text-muted">Overlay</div>
      <div class="flex items-center justify-between">
        <span>Mostrar overlay</span>
        <Toggle checked={live.status.overlayVisible} onchange={(v) => api.setOverlayVisible(v)} label="Mostrar overlay" />
      </div>
      <div class="flex items-center justify-between">
        <span>Datos de demostración</span>
        <Toggle checked={live.status.demo} onchange={(v) => api.setDemoMode(v)} label="Datos de demostración" />
      </div>
      <button
        class={["btn mt-1", live.status.editMode ? "bg-warn! text-black" : "btn-primary"]}
        onclick={() => api.setEditMode(!live.status.editMode)}
      >
        {live.status.editMode ? "Terminar edición de diseño" : "Editar diseño del overlay"}
      </button>
      <div class="text-xs leading-relaxed text-muted">
        <kbd class="kbd">Ctrl+Shift+F9</kbd> editar diseño<br />
        <kbd class="kbd">Ctrl+Shift+F10</kbd> mostrar / ocultar
      </div>
    </section>
  </div>

  <!-- Pantalla Móvil DDU + Control por Botones del Volante -->
  <section class="mt-4 card border-[#2287EC]/30 p-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="rounded bg-[#2287EC]/20 px-2 py-0.5 text-[11px] font-bold text-[#62b0ff] uppercase">NUEVO · DDU MÓVIL & MFD</span>
          <h2 class="text-base font-bold text-white">Dashboard en el Móvil + Botones del Volante</h2>
        </div>
        <p class="mt-1 text-xs text-muted">
          Abre el enlace en el navegador de tu móvil (conectado al mismo Wi-Fi) y usa cualquier botón de tu volante para cambiar en tiempo real entre
          <b>Relativo</b>, <b>Clasificación</b>, <b>Daños y Neumáticos</b>, <b>Combustible</b> y <b>Cazador</b>.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <a
          href="/#mobile"
          target="_blank"
          class="btn border border-[#2287EC]/40 bg-[#2287EC]/15 text-xs font-semibold text-[#62b0ff] hover:bg-[#2287EC]/25"
        >📱 Vista previa DDU Móvil</a>
      </div>
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      <!-- Columna 1: URL Wi-Fi para el móvil -->
      <div class="rounded-xl border border-line bg-surface-2 p-3.5">
        <div class="text-xs font-semibold tracking-wider text-muted uppercase">1. Conectar Móvil o Tablet por Wi-Fi</div>
        <div class="mt-2 flex items-center gap-2">
          <input
            type="text"
            readonly
            class="field flex-1 font-mono text-xs select-all"
            value={wheelControl.mobileUrl}
          />
          <button class="btn btn-primary text-xs" onclick={copyMobileUrl}>
            {copiedMobileUrl ? "✓ Copiado" : "Copiar enlace"}
          </button>
        </div>
        {#if wheelControl.lanIps.length > 1}
          <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span>Otras IPs detectadas:</span>
            {#each wheelControl.lanIps as ip}
              <button
                class="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-fg hover:text-[#62b0ff]"
                onclick={() => (wheelControl.mobileUrl = `http://${ip}:1420/#mobile`)}
              >http://{ip}:1420/#mobile</button>
            {/each}
          </div>
        {/if}
        <div class="mt-2.5 text-[11px] text-muted">
          💡 En tu móvil, abre Chrome o Safari, entra en esa dirección y pulsa <b>"⛶ Pantalla Completa"</b>. La pantalla no se apagará mientras conduces.
        </div>
      </div>

      <!-- Columna 2: Asignación de botones del volante -->
      <div class="rounded-xl border border-line bg-surface-2 p-3.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold tracking-wider text-muted uppercase">2. Botones del Volante / Teclado</span>
          <span class="text-[11px] text-muted">
            {#if wheelControl.connectedGamepads.length > 0}
              🟢 {wheelControl.connectedGamepads.length} mando(s)/volante(s) USB
            {:else}
              ⚪ Pulsa un botón del volante para activarlo
            {/if}
          </span>
        </div>

        <div class="mt-2.5 grid grid-cols-2 gap-2.5">
          <!-- Botón Siguiente Pantalla -->
          <div class="rounded-lg border border-white/10 bg-black/30 p-2.5">
            <div class="text-[11px] text-muted">Siguiente pantalla MFD ▶</div>
            <div class="mt-1 truncate font-mono text-xs font-bold text-[#62b0ff]">
              {wheelControl.formatBinding(wheelControl.nextBind)}
            </div>
            <div class="mt-2 flex items-center gap-1.5">
              {#if wheelControl.learning === "next"}
                <button class="btn w-full bg-warn! py-1 text-xs font-bold text-black" onclick={() => wheelControl.cancelLearning()}>
                  Pulsa botón del volante... (Cancelar)
                </button>
              {:else}
                <button class="btn flex-1 py-1 text-xs" onclick={() => wheelControl.startLearning("next")}>
                  🎮 Asignar botón
                </button>
              {/if}
            </div>
          </div>

          <!-- Botón Pantalla Anterior -->
          <div class="rounded-lg border border-white/10 bg-black/30 p-2.5">
            <div class="text-[11px] text-muted">◀ Pantalla MFD anterior</div>
            <div class="mt-1 truncate font-mono text-xs font-bold text-[#62b0ff]">
              {wheelControl.formatBinding(wheelControl.prevBind)}
            </div>
            <div class="mt-2 flex items-center gap-1.5">
              {#if wheelControl.learning === "prev"}
                <button class="btn w-full bg-warn! py-1 text-xs font-bold text-black" onclick={() => wheelControl.cancelLearning()}>
                  Pulsa botón del volante... (Cancelar)
                </button>
              {:else}
                <button class="btn flex-1 py-1 text-xs" onclick={() => wheelControl.startLearning("prev")}>
                  🎮 Asignar botón
                </button>
              {/if}
            </div>
          </div>
        </div>

        {#if wheelControl.lastPressedInfo}
          <div class="mt-2 text-[11px] text-muted">
            Última entrada detectada: <span class="font-mono text-fg">{wheelControl.lastPressedInfo}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Tema del Móvil + Barra de páginas MFD en vivo -->
    <div class="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-muted">Tema del Móvil:</span>
        {#each Object.entries(HUD_THEMES) as [id, t] (id)}
          <button
            class={[
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-display text-xs font-extrabold transition",
              wheelControl.mobileTheme === id
                ? "border-accent bg-accent text-white shadow"
                : "border-line bg-surface-2 text-muted hover:text-fg",
            ]}
            onclick={() => wheelControl.setMobileTheme(id as PresetThemeId)}
          >
            <span class="h-2 w-2 rounded-full" style:background={t.accent}></span>
            {t.label}
          </button>
        {/each}
      </div>

      <button
        class="btn border border-accent/40 bg-accent/15 text-xs font-semibold text-accent-hi"
        onclick={() => (showMobileOrderEditor = !showMobileOrderEditor)}
      >
        {showMobileOrderEditor ? "▲ Ocultar editor de pantallas" : "⚙️ Ordenar / Añadir / Eliminar pantallas del móvil"}
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
      <span class="text-xs font-semibold text-muted">
        Pantallas activas en el Móvil ({wheelControl.activePages.length}):
      </span>
      <div class="flex flex-wrap items-center gap-1.5">
        <button class="btn px-2.5 py-1 text-xs" onclick={() => wheelControl.prevPage()}>◀ Ant.</button>
        {#each wheelControl.activePages as pg, i (pg.id)}
          <button
            class={[
              "rounded-lg px-2.5 py-1 text-xs font-bold transition",
              wheelControl.page === pg.id
                ? "bg-accent text-white shadow"
                : "bg-surface-2 text-muted hover:text-fg",
            ]}
            onclick={() => wheelControl.setPage(i)}
          >
            {i + 1}. {pg.short}
          </button>
        {/each}
        <button class="btn px-2.5 py-1 text-xs" onclick={() => wheelControl.nextPage()}>Sig. ▶</button>
      </div>
    </div>

    {#if showMobileOrderEditor}
      <div class="mt-3.5 grid gap-4 rounded-xl border border-line bg-surface-2/70 p-4 md:grid-cols-2">
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-bold tracking-wider text-muted uppercase">
              Orden actual en el Móvil (usa ↑ ↓ o ✕)
            </span>
            <button class="text-xs text-accent hover:underline" onclick={() => wheelControl.resetPages()}>
              Restablecer por defecto
            </button>
          </div>
          <div class="space-y-1.5">
            {#each wheelControl.activePages as pg, idx (pg.id)}
              <div class="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-1.5 text-xs">
                <span class="font-semibold text-fg">
                  <span class="mr-1.5 font-mono text-accent">{idx + 1}.</span>{pg.title}
                </span>
                <div class="flex items-center gap-1">
                  <button
                    class="rounded bg-surface-3 px-2 py-0.5 font-bold hover:bg-line disabled:opacity-30"
                    disabled={idx === 0}
                    title="Subir posición"
                    onclick={() => wheelControl.movePage(idx, -1)}
                  >↑</button>
                  <button
                    class="rounded bg-surface-3 px-2 py-0.5 font-bold hover:bg-line disabled:opacity-30"
                    disabled={idx === wheelControl.activePages.length - 1}
                    title="Bajar posición"
                    onclick={() => wheelControl.movePage(idx, 1)}
                  >↓</button>
                  <button
                    class="ml-1 rounded bg-bad/20 px-2 py-0.5 font-bold text-bad hover:bg-bad hover:text-white disabled:opacity-30"
                    disabled={wheelControl.activePages.length <= 1}
                    title="Eliminar del móvil"
                    onclick={() => wheelControl.removePage(pg.id)}
                  >✕</button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div>
          <div class="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
            Añadir nuevos Dashboards al Móvil
          </div>
          {#if wheelControl.availableToAdd.length === 0}
            <div class="rounded-lg border border-line bg-surface p-3 text-xs text-muted">
              Todos los dashboards disponibles están activos en la rotación del móvil.
            </div>
          {:else}
            <div class="flex flex-wrap gap-1.5">
              {#each wheelControl.availableToAdd as avail (avail.id)}
                <button
                  class="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg hover:border-accent hover:text-accent"
                  onclick={() => wheelControl.addPage(avail.id)}
                >
                  + {avail.short}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <div class="mt-6 mb-2 flex items-baseline justify-between">
    <h2 class="section-title">
      Última sesión
      {#if session}<span class="ml-2 text-sm font-normal text-muted">{session.track} · {session.car} · {session.sessionType}</span>{/if}
    </h2>
    {#if session}
      <button class="text-sm text-accent hover:underline" onclick={() => { nav.sessionId = session!.id; nav.page = "sessions"; }}>Abrir sesión</button>
    {/if}
  </div>
  <LapTable {laps} onopen={(l) => nav.openAnalysis(l.track, l.id)} />
</div>
