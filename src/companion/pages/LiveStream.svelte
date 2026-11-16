<script lang="ts">
  import { remoteStream, type ActiveLiveSession } from "../../lib/remoteStream.svelte";
  import { live } from "../../lib/live.svelte";
  import { config } from "../../lib/config.svelte";
  import { nav } from "../nav.svelte";
  import { lapTime } from "../../lib/format";

  let filterClass = $state<string>("all");

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
</script>

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

    <!-- Indicador de emisión del usuario -->
    <div class="flex items-center gap-2 text-xs">
      {#if remoteStream.isBroadcasting}
        <div class="flex items-center gap-2 rounded-lg bg-good/15 border border-good/40 px-3 py-1.5 text-good font-semibold">
          <span class="h-2.5 w-2.5 rounded-full bg-good animate-ping"></span>
          <span>EMITIENDO TU TELEMETRÍA EN VIVO</span>
        </div>
      {:else if config.value.broadcast.enabled}
        <div class="flex items-center gap-2 rounded-lg bg-surface-2 border border-line px-3 py-1.5 text-muted">
          <span class="h-2 w-2 rounded-full bg-accent/60"></span>
          <span>Retransmisión activa (esperando a que entres a pista)</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Banner si estás actualmente espectando a alguien -->
  {#if remoteStream.spectatingId && remoteStream.spectatingSession}
    {@const s = remoteStream.spectatingSession}
    <div class="mb-6 rounded-xl border-2 border-accent bg-accent/10 p-5 shadow-lg backdrop-blur-sm">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 rounded-xl bg-accent/30 border border-accent/50 flex items-center justify-center text-2xl font-bold text-fg">
            🏎️
          </div>
          <div>
            <div class="text-xs font-bold uppercase tracking-wider text-accent">Siguiendo en vivo a</div>
            <div class="text-xl font-bold text-fg flex items-center gap-2">
              <span>{s.driver}</span>
              <span class={["text-xs px-2 py-0.5 rounded border font-semibold", classBadgeColor(s.carClass)]}>
                {s.carClass || "LMU"}
              </span>
            </div>
            <div class="text-xs text-muted mt-0.5">
              <span>{s.car}</span> · <span>📍 {s.track}</span> · <span class="font-bold text-fg">Vuelta {s.lap}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            class="btn bg-accent text-white font-bold hover:bg-accent-hi text-xs flex items-center gap-1.5"
            onclick={() => (nav.page = "live")}
          >
            <span>📊 Ver Telemetría en Vivo</span>
          </button>
          <button
            class="btn bg-surface-2 border border-line hover:bg-surface-3 text-fg text-xs font-semibold"
            onclick={() => remoteStream.stopSpectating()}
          >
            ✕ Desconectar y volver a mi coche
          </button>
        </div>
      </div>
    </div>
  {/if}

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
          class={[
            "rounded-xl border bg-surface-1 p-5 transition-all hover:border-accent/60 hover:shadow-md",
            remoteStream.spectatingId === s.id ? "border-accent ring-2 ring-accent/30 bg-accent/5" : "border-line",
          ]}
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

          <div class="flex items-center justify-between gap-3 pt-1">
            <div class="flex items-center gap-3 text-xs text-muted font-mono">
              <span>🏎️ <b class="text-fg">{s.speedKmh}</b> km/h</span>
              <span>⚙️ Marcha <b class="text-fg">{s.gear === 0 ? "N" : s.gear === -1 ? "R" : s.gear}</b></span>
            </div>

            {#if remoteStream.spectatingId === s.id}
              <button
                class="btn bg-accent text-white text-xs font-bold"
                onclick={() => (nav.page = "live")}
              >
                ✓ Viendo ahora mismo
              </button>
            {:else}
              <button
                class="btn bg-accent/20 border border-accent/40 text-fg hover:bg-accent text-xs font-bold transition-all"
                onclick={() => remoteStream.startSpectating(s)}
              >
                ⚡ Conectar en Vivo
              </button>
            {/if}
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

      <div class="mt-6 rounded-lg border border-line bg-surface-2/60 p-4 max-w-lg text-left text-xs text-muted">
        <div class="font-semibold text-fg flex items-center gap-1.5 mb-1">
          <span>💡</span>
          <span>¿Cómo funciona la retransmisión?</span>
        </div>
        <div>
          Tu telemetría se comparte de forma automática y transparente al salir a pista en el simulador. Puedes gestionar o desactivar esta función en cualquier momento en <button class="text-accent underline font-semibold" onclick={() => (nav.page = "settings")}>Ajustes → Retransmisión</button>.
        </div>
      </div>
    </div>
  {/if}
</div>
