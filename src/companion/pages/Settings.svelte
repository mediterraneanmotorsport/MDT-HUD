<script lang="ts">
  import { api } from "../../lib/api";
  import { config, createMdtTemplateProfile, HUD_THEMES, saveConfig, switchProfile, toggleBroadcastMode, type HudTheme } from "../../lib/config.svelte";
  import type { MonitorInfo } from "../../lib/types";
  import { live } from "../../lib/live.svelte";
  import { SPOTTER_EVENTS, spotter } from "../../lib/spotter.svelte";
  import { REPO_URL, starOnGitHub } from "../../lib/star.svelte";
  import { checkForUpdate, downloadLatestRelease, installUpdate, updater } from "../../lib/updater.svelte";
  import { testDiscordWebhook } from "../../lib/discord";
  import Toggle from "../components/Toggle.svelte";

  const g = $derived(config.value.general);
  const sp = $derived(config.value.spotter);
  const dc = $derived(config.value.discord);

  let starError = $state(false);
  const star = () => starOnGitHub().catch(() => (starError = true));

  let testingDiscord = $state(false);
  let discordMsg = $state("");

  async function handleTestDiscord() {
    if (testingDiscord) return;
    testingDiscord = true;
    discordMsg = "";
    try {
      const res = await testDiscordWebhook(dc.webhookUrl);
      if (res.ok) {
        discordMsg = "✓ ¡Mensaje de prueba enviado con éxito a tu Discord!";
      } else {
        discordMsg = `⚠️ Error: ${res.error}`;
      }
    } catch (e) {
      discordMsg = `⚠️ Error: ${String(e)}`;
    } finally {
      testingDiscord = false;
      setTimeout(() => (discordMsg = ""), 5000);
    }
  }

  let monitors = $state<MonitorInfo[]>([]);
  const refreshMonitors = () => api.listMonitors().then((m) => (monitors = m)).catch(() => {});
  refreshMonitors();
  const monitorLabel = (m: MonitorInfo) => {
    const n = m.name.match(/DISPLAY(\d+)$/i)?.[1];
    return `${n ? `Pantalla ${n}` : m.name} · ${m.width}×${m.height}${m.primary ? " (principal)" : ""}`;
  };
</script>

<div class="mx-auto max-w-3xl p-6">
  <h1 class="mb-5 page-title">Ajustes</h1>

  {#if live.status.experimentalLinux}
    <div class="card mb-5 p-4 text-sm">
      <div class="font-medium">Soporte experimental en Linux</div>
      <p class="mt-1 text-muted">El soporte para Linux es experimental y ha sido probado en Hyprland con XWayland.</p>
    </div>
  {/if}

  <!-- =========================================================================
       SPOTTER DE VOZ MDT (PERFIL / SARA / ANTONIO)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
      <div class="flex items-center gap-2.5">
        <img src="/mdt-logo.png" alt="MDT" class="h-5 w-5 object-contain" />
        <div>
          <div class="font-semibold text-fg">Spotter de Voz e Ingeniero de Pista (Sistema Aleatorio Anti-Bucle)</div>
          <div class="text-xs text-muted">
            Ruta de carpetas: <code>Perfil/{sp.profile}/&lt;Evento&gt;/Audio1.wav, 2.wav...</code>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="btn text-xs bg-accent/20 border border-accent/40 hover:bg-accent/30 text-fg transition-colors"
          onclick={() => api.openSpotterFolder()}
          title="Abre la carpeta %APPDATA%/MDT-HUD/Perfil/ para añadir o sustituir audios .wav"
        >
          📁 Abrir carpeta de voces (.wav)
        </button>
        <button class="btn text-xs" onclick={() => spotter.refreshManifest()}>Recargar carpetas .wav</button>
        <Toggle
          checked={sp.enabled}
          label="Activar Spotter"
          onchange={(v) => {
            sp.enabled = v;
            saveConfig();
          }}
        />
      </div>
    </div>

    <div class="divide-y divide-line">
      <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted uppercase">Perfil de Voz</span>
          <select class="field" bind:value={sp.profile} onchange={saveConfig}>
            {#each spotter.availableProfiles as prof (prof)}
              <option value={prof}>Perfil / {prof}</option>
            {/each}
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted uppercase">Volumen ({Math.round(sp.volume * 100)}%)</span>
          <div class="flex h-9 items-center gap-2">
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              bind:value={sp.volume}
              oninput={saveConfig}
              class="w-full accent-accent"
            />
          </div>
        </label>

        <div class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
          <div>
            <div class="text-xs font-semibold">Efecto Radio WEC (Walkie-Talkie)</div>
            <div class="text-[11px] text-muted">Filtro de radio de carreras y clic de micrófono</div>
          </div>
          <Toggle
            checked={sp.radioEffect}
            label="Efecto Radio"
            onchange={(v) => {
              sp.radioEffect = v;
              saveConfig();
            }}
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-4 px-4 py-3 text-xs">
        <span class="font-semibold text-muted uppercase">Categorías activas:</span>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" class="accent-accent" bind:checked={sp.traffic} onchange={saveConfig} />
          <span>P1 · Tráfico en paralelo</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" class="accent-accent" bind:checked={sp.flags} onchange={saveConfig} />
          <span>P2 · Banderas y sanciones</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" class="accent-accent" bind:checked={sp.strategy} onchange={saveConfig} />
          <span>P3 · Estrategia y combustible</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" class="accent-accent" bind:checked={sp.carStatus} onchange={saveConfig} />
          <span>P4 · Daños y neumáticos</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" class="accent-accent" bind:checked={sp.session} onchange={saveConfig} />
          <span>P5 · Récords y carrera</span>
        </label>
      </div>

      <details class="group">
        <summary class="flex cursor-pointer items-center justify-between px-4 py-2.5 text-xs font-semibold text-accent hover:bg-surface-2">
          <span>Ver las 17 carpetas de audio de "Perfil/{sp.profile}" y probar sonidos</span>
          <span class="text-muted group-open:rotate-180">▼</span>
        </summary>
        <div class="max-h-72 overflow-y-auto border-t border-line bg-surface-2/40 p-3">
          <table class="w-full text-xs">
            <thead class="text-left text-muted">
              <tr>
                <th class="pb-2">Prioridad</th>
                <th class="pb-2">Carpeta en <code>Perfil/{sp.profile}/</code></th>
                <th class="pb-2">Audios .wav</th>
                <th class="pb-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line/50">
              {#each SPOTTER_EVENTS as ev (ev.folder)}
                {@const count = spotter.getFilesFor(sp.profile, ev.folder).length}
                <tr>
                  <td class="py-1.5">
                    <span
                      class={[
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        ev.priority === 1
                          ? "bg-bad/20 text-bad"
                          : ev.priority === 2
                            ? "bg-warn/20 text-warn"
                            : "bg-accent/20 text-accent",
                      ]}
                    >
                      P{ev.priority}
                    </span>
                  </td>
                  <td class="py-1.5 font-mono text-fg">
                    Perfil/{sp.profile}/{ev.folder}/
                  </td>
                  <td class="py-1.5">
                    {#if count > 0}
                      <span class="font-semibold text-good">{count} archivo{count === 1 ? "" : "s"}</span>
                    {:else}
                      <span class="text-muted">0 .wav {sp.ttsFallback ? "(usando voz respaldo)" : "(vacío)"}</span>
                    {/if}
                  </td>
                  <td class="py-1.5 text-right">
                    <button
                      class="rounded bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-fg hover:bg-accent hover:text-white"
                      onclick={() => spotter.trigger(ev.folder, true)}
                    >
                      ▶ Probar
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </div>

  <!-- =========================================================================
       INTEGRACIÓN DISCORD (WEBHOOKS TELEMETRÍA)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
      <div class="flex items-center gap-2.5">
        <span class="text-xl">💬</span>
        <div>
          <div class="font-semibold text-fg">Integración con Discord (Webhooks)</div>
          <div class="text-xs text-muted">
            Exporta y envía automáticamente el gráfico PNG de telemetría con el nombre del piloto al finalizar cada sesión
          </div>
        </div>
      </div>
      <Toggle
        checked={dc.enabled}
        label="Activar Discord"
        onchange={(v) => {
          dc.enabled = v;
          saveConfig();
        }}
      />
    </div>

    {#if dc.enabled}
      <div class="divide-y divide-line">
        <div class="flex items-center justify-between p-4 bg-accent/5">
          <div>
            <div class="font-medium text-fg">Envío automático al terminar sesión</div>
            <div class="text-xs text-muted">
              Al cruzar la meta con bandera a cuadros o salir a boxes tras completar vueltas, genera el PNG y lo publica en Discord.
            </div>
          </div>
          <Toggle
            checked={dc.autoExport}
            label="Auto-exportar a Discord"
            onchange={(v) => {
              dc.autoExport = v;
              saveConfig();
            }}
          />
        </div>

        <div class="flex flex-col gap-2 p-4">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-muted uppercase">URL del Webhook de Discord</span>
            <input
              type="url"
              class="field w-full font-mono text-xs"
              placeholder="https://discord.com/api/webhooks/1234567890/abcdefg..."
              bind:value={dc.webhookUrl}
              oninput={saveConfig}
            />
          </label>
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label class="flex items-center gap-2 text-xs">
              <span class="text-muted">Nombre del Bot:</span>
              <input
                type="text"
                class="field py-1 text-xs w-48"
                placeholder="Ingeniera MDT"
                bind:value={dc.botName}
                oninput={saveConfig}
              />
            </label>
            <div class="flex items-center gap-2">
              {#if discordMsg}
                <span class={["text-xs font-bold", discordMsg.startsWith("✓") ? "text-good" : "text-bad"]}>
                  {discordMsg}
                </span>
              {/if}
              <button
                class="btn text-xs bg-accent text-white font-bold hover:bg-accent-hi"
                onclick={handleTestDiscord}
                disabled={testingDiscord || !dc.webhookUrl}
              >
                {testingDiscord ? "Enviando..." : "🧪 Probar Webhook"}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="divide-y divide-line card text-sm">
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Compañeros de equipo MDT (Resaltado en pista)</div>
        <div class="text-muted">Nombres de pilotos o tags de equipo separados por comas. Se resaltan con el toro de MDT en Clasificación, Relativo y Mapa.</div>
      </div>
      <input
        class="field w-64 shrink-0"
        placeholder="MDT, Mediterranean, M. García"
        bind:value={g.teammates}
        oninput={saveConfig}
      />
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Tema y color del HUD</div>
        <div class="text-muted">Elige un tema predefinido o personaliza el color de acento, borde y fondo.</div>
      </div>
      <div class="flex items-center gap-2">
        <select
          class="field"
          value={g.theme}
          onchange={(e) => {
            const t = e.currentTarget.value as HudTheme;
            g.theme = t;
            if (t !== "custom") {
              const p = HUD_THEMES[t];
              g.accentColor = p.accent;
              g.hudBgColor = p.bg;
              g.hudBorderOpacity = p.borderOpacity;
            }
            saveConfig();
          }}
        >
          {#each Object.entries(HUD_THEMES) as [id, t] (id)}
            <option value={id}>{t.label}</option>
          {/each}
          <option value="custom">Personalizado</option>
        </select>
        <input
          type="color"
          title="Color de acento y borde"
          value={g.accentColor}
          oninput={(e) => {
            g.theme = "custom";
            g.accentColor = e.currentTarget.value;
            saveConfig();
          }}
          class="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
        />
      </div>
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Unidades</div>
        <div class="text-muted">Velocidad, temperatura, presión y combustible.</div>
      </div>
      <select class="field" bind:value={g.units} onchange={saveConfig}>
        <option value="metric">Métrico (km/h, °C, kPa, L)</option>
        <option value="imperial">Imperial (mph, °F, psi, gal)</option>
      </select>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Monitor del overlay</div>
        <div class="text-muted">Pantalla donde se muestran los widgets. Elige aquella en la que ejecutas Le Mans Ultimate.</div>
      </div>
      <select class="field" bind:value={g.monitor} onchange={saveConfig} onfocus={refreshMonitors}>
        <option value="">Monitor principal</option>
        {#each monitors as m (m.name)}
          <option value={m.name}>{monitorLabel(m)}</option>
        {/each}
        {#if g.monitor && !monitors.some((m) => m.name === g.monitor)}
          <option value={g.monitor}>{g.monitor} (no conectado, usando principal)</option>
        {/if}
      </select>
    </div>
    <div class="flex flex-col gap-3 p-4 bg-accent/5 border-l-2 border-accent">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium text-fg flex items-center gap-2">
            <span>📺 Modo Broadcast (Espectador / Streaming)</span>
            <span class="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">NUEVO</span>
          </div>
          <div class="text-xs text-muted">
            Mantiene el HUD y overlay interactivos y siempre visibles en streaming/repetición, cargando la telemetría del coche enfocado.
          </div>
        </div>
        <Toggle checked={Boolean(g.broadcastMode)} label="Modo Broadcast" onchange={(v) => toggleBroadcastMode(v)} />
      </div>

      {#if g.broadcastMode}
        <div class="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
          <span class="font-semibold text-accent uppercase tracking-wider">Perfil activo de Broadcast:</span>
          <select
            class="field py-1 text-xs"
            value={config.value.activeProfile}
            onchange={(e) => {
              const id = e.currentTarget.value;
              g.broadcastProfileId = id;
              switchProfile(id);
              saveConfig();
            }}
          >
            {#each Object.entries(config.value.profiles) as [id, p] (id)}
              <option value={id}>{p.name}</option>
            {/each}
          </select>
          <button
            type="button"
            class="btn bg-accent text-white px-2.5 py-1 text-xs font-bold hover:bg-accent-hi"
            onclick={() => {
              createMdtTemplateProfile("broadcast");
              g.broadcastProfileId = config.value.activeProfile;
              saveConfig();
            }}
          >
            + Crear nuevo perfil Broadcast
          </button>
          <span class="text-[11px] text-muted">
            Consejo: Haz clic en cualquier piloto de la clasificación en el overlay para enfocar la cámara y mostrar su telemetría.
          </span>
        </div>
      {/if}
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Ocultar overlay fuera de pista</div>
        <div class="text-muted">Mostrar widgets solo mientras conduces (siempre visibles en el editor de diseño).</div>
      </div>
      <Toggle checked={g.onlyOnTrack} label="Ocultar fuera de pista" onchange={(v) => { g.onlyOnTrack = v; saveConfig(); }} />
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Ocultar overlay cuando el juego no está en primer plano</div>
        <div class="text-muted">Oculta los widgets al hacer Alt+Tab a otra ventana.</div>
      </div>
      <Toggle checked={g.hideUnfocused} label="Ocultar sin foco" onchange={(v) => { g.hideUnfocused = v; saveConfig(); }} />
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Tasa de refresco del overlay</div>
        <div class="text-muted">Actualizaciones por segundo enviadas a los widgets.</div>
      </div>
      <div class="flex items-center gap-3">
        <input type="range" min="10" max="60" step="5" bind:value={g.updateHz} oninput={saveConfig} class="accent-accent" />
        <span class="w-12 text-right tnum">{g.updateHz} Hz</span>
      </div>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Ajuste a cuadrícula (Grid snap)</div>
        <div class="text-muted">Salto en píxeles al arrastrar widgets.</div>
      </div>
      <div class="flex items-center gap-3">
        <input type="range" min="1" max="20" step="1" bind:value={g.snap} oninput={saveConfig} class="accent-accent" />
        <span class="w-12 text-right tnum">{g.snap} px</span>
      </div>
    </div>
    <div class="p-4">
      <div class="font-medium">Carpeta de datos</div>
      <div class="mt-1 font-mono text-xs break-all text-muted">{live.status.dataDir}</div>
      <div class="mt-1 text-muted">Las vueltas se guardan localmente en <code>laps.db</code> (SQLite) dentro de esta carpeta.</div>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Mostrar novedades tras actualizar</div>
        <div class="text-muted">Muestra qué ha cambiado al abrir una versión nueva por primera vez.</div>
      </div>
      <Toggle checked={g.showChangelog} label="Mostrar novedades" onchange={(v) => { g.showChangelog = v; saveConfig(); }} />
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Versión {updater.version || "0.11.0"}</div>
        <div class="text-muted">
          {#if updater.phase === "outdated"}
            La versión {updater.available} está disponible.
          {:else if updater.phase === "checking"}
            Buscando actualizaciones…
          {:else if updater.phase === "available"}
            La versión {updater.available} está lista para instalar.
          {:else if updater.phase === "downloading"}
            Descargando actualización… {Math.round(updater.progress * 100)}%
          {:else if updater.phase === "upToDate"}
            Estás en la última versión.
          {:else if updater.phase === "error"}
            <span title={updater.error}>No se pudo comprobar si hay actualizaciones.</span>
          {:else}
            Las actualizaciones se comprueban automáticamente al iniciar MDT-HUD.
          {/if}
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-2">
        <button class="btn" disabled={!updater.version} onclick={() => (updater.changelogOpen = true)}>Ver novedades</button>
        {#if updater.phase === "available"}
          <button class="btn btn-primary font-bold" onclick={installUpdate}>Instalar y reiniciar</button>
        {:else if updater.phase === "outdated"}
          <button class="btn btn-primary font-bold" onclick={downloadLatestRelease}>⬇️ Descargar e Instalar v{updater.available}</button>
        {:else}
          <button class="btn" disabled={updater.phase === "checking" || updater.phase === "downloading"} onclick={checkForUpdate}>
            Buscar actualizaciones
          </button>
        {/if}
      </div>
    </div>
  </div>

  <div class="mt-6 flex items-center justify-between gap-4 card p-4 text-sm">
    <div class="flex items-center gap-3">
      <img src="/mdt-logo.png" alt="MDT" class="h-10 w-auto object-contain" />
      <div>
        <div class="font-semibold text-fg">Mediterranean Motorsport · MDT-HUD</div>
        <div class="text-xs text-muted">Repositorio oficial y actualizaciones automáticas en GitHub.</div>
      </div>
    </div>
    {#if starError}
      <span class="select-text text-xs break-words text-bad" role="alert">{REPO_URL}</span>
    {:else}
      <button class="btn shrink-0" onclick={star}>Abrir GitHub</button>
    {/if}
  </div>
</div>
