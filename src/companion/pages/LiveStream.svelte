<script lang="ts">
  import { remoteStream, type ActiveLiveSession } from "../../lib/remoteStream.svelte";
  import { live } from "../../lib/live.svelte";
  import { config } from "../../lib/config.svelte";
  import { lapTime } from "../../lib/format";
  import PitWall from "../../mobile/PitWall.svelte";

  let filterClass = $state<string>("all");
  let showLocalPitwall = $state(false);

  const sessions = $derived(remoteStream.sessions);
  const filteredSessions = $derived(
    filterClass === "all"
      ? sessions
      : sessions.filter((s) => s.carClass?.toLowerCase().includes(filterClass.toLowerCase())),
  );

  function classBadgeColor(c: string) {
    const lower = (c || "").toLowerCase();
    if (lower.includes("hyper") || lower.includes("gmp") || lower.includes("lmh")) {
      return "bg-red-500/20 text-red-400 border-red-500/40";
    }
    if (lower.includes("p2") || lower.includes("lmp2")) {
      return "bg-blue-500/20 text-blue-400 border-blue-500/40";
    }
    return "bg-orange-500/20 text-orange-400 border-orange-500/40";
  }

  function handleConnect(s: ActiveLiveSession) {
    showLocalPitwall = false;
    remoteStream.startSpectating(s);
  }

  function handleExitSpectating() {
    remoteStream.stopSpectating();
    showLocalPitwall = false;
  }
</script>

<!-- MODO PITWALL ACTIVO: Ya sea espectando a un piloto remoto o viendo el pitwall propio -->
{#if (remoteStream.spectatingId && remoteStream.spectatingSession) || showLocalPitwall}
  {@const s = remoteStream.spectatingSession}
  <div class="flex h-full flex-col bg-[#070b12] text-white">
    <!-- Barra superior de control del Pitwall en vivo -->
    <header class="flex shrink-0 items-center justify-between border-b border-line bg-surface-1/90 px-4 py-2.5 backdrop-blur-md">
      <div class="flex items-center gap-3">
        {#if s}
          <span class="flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/50 px-2.5 py-0.5 text-xs font-bold text-red-400">
            <span class="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
            <span>EN DIRECTO</span>
          </span>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-fg">{s.driver}</span>
            <span class={["text-[10px] px-1.5 py-0.2 rounded border font-semibold", classBadgeColor(s.carClass)]}>
              {s.carClass || "LMU"}
            </span>
          </div>
          <div class="hidden md:flex items-center gap-2 text-xs text-muted">
            <span>🏎️ {s.car}</span>
            <span>·</span>
            <span>📍 {s.track}</span>
            <span>·</span>
            <span class="font-bold text-fg">Vuelta {s.lap}</span>
          </div>
        {:else}
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-good animate-pulse"></span>
            <span class="text-sm font-bold text-fg">MDT Pitwall Oficial (Telemetría Local / Demostración)</span>
          </div>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <button
          class="btn bg-surface-2 border border-line hover:bg-surface-3 text-fg text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          onclick={handleExitSpectating}
        >
          <span>✕</span>
          <span>{s ? "Salir y ver lista de pilotos" : "Cerrar Pitwall"}</span>
        </button>
      </div>
    </header>

    <!-- Componente Pitwall con toda la información disponible (Leaderboard, Mapa, Neumáticos, Pedales, Consumos, Tiempos) -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <PitWall embedded={true} />
    </div>
  </div>
{:else}
  <!-- VISTA DE LISTA DE PILOTOS EN DIRECTO -->
  <div class="mx-auto max-w-5xl p-6">
    <!-- Cabecera -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="page-title text-2xl font-bold flex items-center gap-2">
            <span>📡</span>
            <span>Telemetría en Directo</span>
          </h1>
          <span
            class={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
              remoteStream.connected
                ? "bg-good/15 text-good border-good/30"
                : "bg-bad/15 text-bad border-bad/30",
            ]}
          >
            <span class={["h-2 w-2 rounded-full", remoteStream.connected ? "bg-good animate-pulse" : "bg-bad"]}></span>
            {remoteStream.connected ? "Red MDT En Línea" : "Conectando..."}
          </span>
        </div>
        <p class="mt-1 text-sm text-muted">
          Observa en tiempo real la telemetría, pedales, presiones y estrategia de tus compañeros de equipo en Le Mans Ultimate.
        </p>
      </div>

      <!-- Acciones de cabecera -->
      <div class="flex items-center gap-3">
        <button
          class="btn bg-accent/20 border border-accent/50 hover:bg-accent/30 text-fg text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
          onclick={() => (showLocalPitwall = true)}
          title="Ver tu propio muro de telemetría Pitwall completo"
        >
          <span>🖥️</span>
          <span>Ver mi Pitwall Completo</span>
        </button>

        {#if remoteStream.isBroadcasting}
          <div class="flex items-center gap-2 rounded-lg bg-good/15 border border-good/40 px-3 py-1.5 text-good font-semibold text-xs">
            <span class="h-2 w-2 rounded-full bg-good animate-ping"></span>
            <span>EMITIENDO TU SESIÓN</span>
          </div>
        {:else if config.value.broadcast.enabled}
          <div class="flex items-center gap-2 rounded-lg bg-surface-2 border border-line px-3 py-1.5 text-muted text-xs">
            <span class="h-2 w-2 rounded-full bg-accent/60"></span>
            <span>Retransmisión activa</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Filtros de categoría -->
    <div class="mb-4 flex items-center justify-between gap-4">
      <div class="flex items-center gap-2 text-xs">
        <span class="font-semibold text-muted uppercase">Filtrar:</span>
        <button
          class={["px-2.5 py-1 rounded-md font-semibold transition-colors", filterClass === "all" ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-fg"]}
          onclick={() => (filterClass = "all")}
        >
          Todos ({sessions.length})
        </button>
        <button
          class={["px-2.5 py-1 rounded-md font-semibold transition-colors", filterClass === "hyper" ? "bg-red-500 text-white" : "bg-surface-2 text-muted hover:text-fg"]}
          onclick={() => (filterClass = "hyper")}
        >
          Hypercar
        </button>
        <button
          class={["px-2.5 py-1 rounded-md font-semibold transition-colors", filterClass === "p2" ? "bg-blue-500 text-white" : "bg-surface-2 text-muted hover:text-fg"]}
          onclick={() => (filterClass = "p2")}
        >
          LMP2
        </button>
        <button
          class={["px-2.5 py-1 rounded-md font-semibold transition-colors", filterClass === "gt" ? "bg-orange-500 text-white" : "bg-surface-2 text-muted hover:text-fg"]}
          onclick={() => (filterClass = "gt")}
        >
          LMGT3
        </button>
      </div>

      <div class="text-xs text-muted">
        <span>{sessions.length} piloto{sessions.length === 1 ? "" : "s"} transmitiendo</span>
      </div>
    </div>

    <!-- Lista de pilotos en directo -->
    {#if filteredSessions.length > 0}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        {#each filteredSessions as s (s.id)}
          <div
            class="rounded-xl border border-line bg-surface-1 p-5 transition-all hover:border-accent/60 hover:shadow-lg"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-lg bg-surface-3 border border-line flex items-center justify-center font-bold text-fg">
                  {s.driver.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-fg text-base">{s.driver}</span>
                    <span class={["text-[10px] px-1.5 py-0.2 rounded border font-semibold", classBadgeColor(s.carClass)]}>
                      {s.carClass}
                    </span>
                  </div>
                  <div class="text-xs text-muted truncate max-w-[200px]">{s.team || "Mediterranean Motorsport"}</div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 text-xs text-good font-semibold bg-good/10 border border-good/25 px-2 py-0.5 rounded-full">
                <span class="h-2 w-2 rounded-full bg-good animate-pulse"></span>
                <span>EN VIVO</span>
              </div>
            </div>

            <!-- Datos de telemetría y carrera -->
            <div class="my-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-2/60 p-2.5 text-center text-xs">
              <div>
                <div class="text-[10px] uppercase text-muted font-semibold">Circuito</div>
                <div class="font-bold text-fg truncate mt-0.5" title={s.track}>{s.track}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase text-muted font-semibold">Vuelta</div>
                <div class="font-bold text-fg mt-0.5">{s.lap}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase text-muted font-semibold">Mejor Vuelta</div>
                <div class="font-mono font-bold text-fg mt-0.5">
                  {s.bestLapTime > 0 ? lapTime(s.bestLapTime) : "–"}
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 pt-1 border-t border-line/60">
              <div class="flex items-center gap-3 text-xs text-muted font-mono">
                <span>🏎️ <b class="text-fg">{s.speedKmh}</b> km/h</span>
                <span>⚙️ <b class="text-fg">{s.gear === 0 ? "N" : s.gear === -1 ? "R" : s.gear}</b></span>
              </div>

              <button
                class="btn bg-accent text-white hover:bg-accent-hi text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md"
                onclick={() => handleConnect(s)}
              >
                <span>⚡</span>
                <span>Ver Telemetría en Vivo (Pitwall)</span>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Estado vacío si nadie está transmitiendo -->
      <div class="card my-8 flex flex-col items-center justify-center p-12 text-center">
        <div class="h-16 w-16 rounded-2xl bg-surface-2 border border-line flex items-center justify-center text-3xl mb-4">
          📡
        </div>
        <h3 class="text-lg font-bold text-fg">No hay pilotos en pista en este momento</h3>
        <p class="mt-1.5 max-w-md text-sm text-muted">
          En cuanto cualquier piloto del equipo entre a rodar en Le Mans Ultimate con MDT-HUD abierto, su sesión aparecerá aquí al instante para que puedas seguir su telemetría en tiempo real.
        </p>

        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            class="btn bg-accent text-white hover:bg-accent-hi text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2"
            onclick={() => (showLocalPitwall = true)}
          >
            <span>🖥️</span>
            <span>Abrir Muro de Telemetría (Pitwall) con datos locales / demo</span>
          </button>
        </div>

        <div class="mt-6 rounded-lg border border-line bg-surface-2/60 p-4 max-w-lg text-left text-xs text-muted">
          <div class="font-semibold text-fg flex items-center gap-1.5 mb-1">
            <span>💡</span>
            <span>Retransmisión Automática de Telemetría</span>
          </div>
          <div>
            Tu telemetría se comparte de forma automática con tu nombre de piloto al salir a pista en el simulador. Puedes consultar o desactivar esta opción en Ajustes.
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
