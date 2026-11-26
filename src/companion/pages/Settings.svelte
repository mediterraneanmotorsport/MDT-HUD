<script lang="ts">
  import { onMount } from "svelte";
  import { emit } from "@tauri-apps/api/event";
  import { api, isNativeTauri } from "../../lib/api";
  import {
    config,
    createMdtTemplateProfile,
    DEFAULT_SHORTCUTS,
    exportFullProfileJson,
    HUD_THEMES,
    importFullProfileJson,
    saveConfig,
    switchProfile,
    toggleBroadcastMode,
    TRACK_ENTRY_ANIMS,
    type HudTheme,
    type TrackEntryAnim,
  } from "../../lib/config.svelte";
  import type { MonitorInfo } from "../../lib/types";
  import { live } from "../../lib/live.svelte";
  import { SPOTTER_EVENTS, spotter } from "../../lib/spotter.svelte";
  import { REPO_URL, starOnGitHub } from "../../lib/star.svelte";
  import {
    checkForUpdate,
    downloadLatestRelease,
    installUpdate,
    updater,
  } from "../../lib/updater.svelte";
  import { testDiscordWebhook } from "../../lib/discord";
  import { toasts } from "../../lib/toasts.svelte";
  import {
    wheelControl,
    type WheelGlobalAction,
  } from "../../lib/wheelControl.svelte";
  import {
    aiEngineer,
    friendlyOnnxVoiceName,
    VOICE_COMMANDS_GUIDE,
  } from "../../lib/aiEngineer.svelte";
  import { EDITABLE_SPOTTER_EVENTS } from "../../lib/spotterPhrases";
  import { audioDevices } from "../../lib/audioDevices.svelte";
  import Toggle from "../components/Toggle.svelte";
  import { remoteStream } from "../../lib/remoteStream.svelte";

  const g = $derived(config.value.general);
  const sp = $derived(config.value.spotter);
  const dc = $derived(config.value.discord);
  const bc = $derived(config.value.broadcast);
  const ai = $derived.by(() => {
    if (!config.value.aiEngineer) {
      config.value.aiEngineer = {
        enabled: false,
        brainMode: "local_rules",
        endpoint: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        personality: "wec_pro",
        voiceEngine: "onnx",
        onnxModelPath: "",
        onnxSpeed: 0.96,
        radioFilter: true,
        volume: 0.9,
        proactiveEnabled: false,
        proactiveEveryLaps: 3,
      };
    }
    return config.value.aiEngineer;
  });

  let aiPromptInput = $state("");
  let editingEventKey = $state("Salida a Pista");
  let packMsg = $state("");

  const customPersonalitiesList = $derived(
    Object.values(ai.customPersonalities ?? {}),
  );
  const activeCustomPersonality = $derived(
    ai.customPersonalities?.[ai.personality] ?? null,
  );

  function createCustomPersonality() {
    const id = `custom_${Date.now().toString(36)}`;
    const next = { ...(ai.customPersonalities ?? {}) };
    next[id] = {
      id,
      name: `Mi Ingeniero ${Object.keys(next).length + 1}`,
      description: "Personalidad personalizada de radio",
      llmPrompt:
        "Eres mi ingeniero de pista personal en Le Mans Ultimate. Habla en español natural, directo y conciso (máximo 20 palabras).",
      linkedVoiceProfile: ai.qwen3Profile || "",
      phrases: {
        "Salida a Pista": ["Radio activa, vamos a pista a darlo todo."],
        "Bandera Amarilla": ["Ojo, bandera amarilla delante, precaución."],
        "Bandera Azul": ["Bandera azul, coche rápido detrás."],
        "Victoria": ["Victoria, P1, carrerón increíble."],
        "Final Remontada": ["Gran remontada de {gained} posiciones hasta P{place}, enhorabuena."],
        "Final Pesimista": ["Día duro, hemos perdido {lost} posiciones hasta P{place}."],
      },
    };
    ai.customPersonalities = next;
    ai.personality = id;
    saveConfig();
    packMsg = "✓ Personalidad creada";
  }

  function deleteActiveCustomPersonality() {
    if (!activeCustomPersonality) return;
    const next = { ...(ai.customPersonalities ?? {}) };
    delete next[activeCustomPersonality.id];
    ai.customPersonalities = next;
    ai.personality = "wec_pro";
    saveConfig();
    packMsg = "Personalidad eliminada";
  }

  async function handleExportPersonality(includeWav: boolean) {
    if (!activeCustomPersonality) return;
    packMsg = "";
    try {
      const { filename, json } = await aiEngineer.exportPersonalityPack(
        activeCustomPersonality.id,
        includeWav,
      );
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      packMsg = includeWav
        ? `✓ Exportado ${filename} (con audio de referencia)`
        : `✓ Exportado ${filename}`;
    } catch (e) {
      packMsg = `⚠️ ${String(e)}`;
    }
  }

  function handleImportPersonalityFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await aiEngineer.importPersonalityPack(String(reader.result || ""));
        packMsg = res.voiceImported
          ? `✓ Importada '${res.name}' + voz '${res.voiceImported}' en VocesMDTQwen/`
          : `✓ Importada personalidad '${res.name}'`;
      } catch (e) {
        packMsg = `⚠️ ${String(e)}`;
      } finally {
        input.value = "";
      }
    };
    reader.readAsText(file);
  }
  let autoStartEnabled = $state(false);
  const WHEEL_GLOBAL_ACTIONS: {
    id: WheelGlobalAction;
    label: string;
    desc: string;
  }[] = [
    {
      id: "toggleOverlay",
      label: "Mostrar / Ocultar Overlay (Modo Pánico)",
      desc: "Oculta o recupera todo el HUD al vuelo desde el volante",
    },
    {
      id: "toggleSpotter",
      label: "Silenciar / Activar Spotter",
      desc: "Activa o silencia las voces de radio sin soltar el volante",
    },
    {
      id: "nextProfile",
      label: "Cambiar Perfil de Overlay",
      desc: "Alterna entre tus perfiles guardados (Competición, Broadcast, etc.)",
    },
    {
      id: "markLapNote",
      label: "Marcar Timestamp de Telemetría",
      desc: "Guarda la hora exacta para revisar un incidente o curva luego",
    },
    {
      id: "aiEngineerReport",
      label: "Ingeniero IA: Informe de Carrera",
      desc: "Pide por radio un resumen táctico instantáneo (pos, fuel, gomas)",
    },
    {
      id: "aiEngineerPtt",
      label: "Ingeniero IA: Radio PTT (Hablar)",
      desc: "Activa el micrófono para preguntar en voz alta al Ingeniero IA local",
    },
  ];

  const sc = $derived.by(() => {
    if (!g.shortcuts) {
      g.shortcuts = { ...DEFAULT_SHORTCUTS };
    }
    return g.shortcuts;
  });

  function resetShortcuts() {
    g.shortcuts = { ...DEFAULT_SHORTCUTS };
    saveConfig();
  }

  let starError = $state(false);
  const star = () => starOnGitHub().catch(() => (starError = true));

  onMount(() => {
    void aiEngineer.refreshVoices();
    void audioDevices.refresh(false);
    void spotter.refreshManifest();
    void api.getAutoStart().then((v) => (autoStartEnabled = v));
  });

  async function toggleAutoStart(v: boolean) {
    autoStartEnabled = await api.setAutoStart(v);
    toasts.push(
      autoStartEnabled
        ? "Inicio automático con Windows activado"
        : "Inicio automático desactivado",
      { kind: "success" },
    );
  }

  let testingDiscord = $state(false);
  let discordMsg = $state("");
  let profileImportInput = $state<HTMLInputElement | null>(null);
  let profileMsg = $state("");

  function handleExportProfile() {
    const json = exportFullProfileJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mdt-hud-setup-${new Date().toISOString().slice(0, 10)}.mdtprofile`;
    a.click();
    URL.revokeObjectURL(url);
    profileMsg =
      "✓ Archivo .mdtprofile exportado con todos tus perfiles y dashboards.";
    setTimeout(() => (profileMsg = ""), 4000);
  }

  function handleImportProfile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importFullProfileJson(String(reader.result));
      profileMsg = res.message;
      setTimeout(() => (profileMsg = ""), 4500);
    };
    reader.readAsText(file);
    input.value = "";
  }

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
  const refreshMonitors = () =>
    api
      .listMonitors()
      .then((m) => (monitors = m))
      .catch(() => {});
  refreshMonitors();
  const monitorLabel = (m: MonitorInfo) => {
    const n = m.name.match(/DISPLAY(\d+)$/i)?.[1];
    return `${n ? `Pantalla ${n}` : m.name} · ${m.width}×${m.height}${m.primary ? " (principal)" : ""}`;
  };

  type SettingsTab = "general" | "spotter" | "ai" | "shortcuts" | "integrations" | "all";
  let settingsTab = $state<SettingsTab>("general");
</script>

<div class="mx-auto max-w-5xl p-6">
  <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="page-title">Ajustes &amp; Ingeniero IA</h1>
      <p class="mt-0.5 text-sm text-muted">
        Configura pantalla, animaciones, Spotter de voz, MDT-QWEN, atajos e integraciones sin perderte en menús largos.
      </p>
    </div>
  </div>

  <!-- Sticky Glass Neo-Racing Category Tabs -->
  <div class="glass-dock sticky top-3 z-20 mb-6 flex flex-wrap items-center gap-1.5 rounded-2xl p-2">
    {#each [
      { id: "general", label: "⚙️ General y Animaciones" },
      { id: "ai", label: "🧠 Ingeniero IA (MDT-QWEN)" },
      { id: "spotter", label: "🎙️ Spotter de Voz" },
      { id: "shortcuts", label: "🎮 Atajos y Perfiles" },
      { id: "integrations", label: "🌐 Discord y Directo" },
      { id: "all", label: "✨ Ver todo" },
    ] as t (t.id)}
      <button
        type="button"
        class={[
          "rounded-xl px-3.5 py-2 text-xs font-bold tracking-wide transition-all cursor-pointer",
          settingsTab === t.id
            ? "btn-primary shadow-[0_0_16px_rgba(34,135,236,0.36)]"
            : "text-muted hover:bg-white/[0.06] hover:text-fg",
        ]}
        onclick={() => (settingsTab = t.id as SettingsTab)}
      >
        {t.label}
      </button>
    {/each}
  </div>

  {#if live.status.experimentalLinux}
    <div class="card mb-5 p-4 text-sm">
      <div class="font-medium">Soporte experimental en Linux</div>
      <p class="mt-1 text-muted">
        El soporte para Linux es experimental y ha sido probado en Hyprland con
        XWayland.
      </p>
    </div>
  {/if}

  {#if settingsTab === "spotter" || settingsTab === "all"}
  <!-- =========================================================================
       SPOTTER DE VOZ MDT (PERFIL / SARA / ANTONIO)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <img src="/mdt-logo.png" alt="MDT" class="h-5 w-5 object-contain" />
        <div>
          <div class="font-semibold text-fg">
            Spotter de Voz e Ingeniero de Pista (Sistema Aleatorio Anti-Bucle)
          </div>
          <div class="text-xs text-muted">
            Ruta de carpetas: <code
              >Perfil/{sp.profile}/&lt;Evento&gt;/1.wav, 2.wav, 3.wav...</code
            >
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="btn text-xs bg-accent/20 border border-accent/40 hover:bg-accent/30 text-fg transition-colors"
          onclick={() => api.openSpotterFolder()}
          title="Abre la carpeta %APPDATA%/MDT-HUD/Perfil/ para añadir o sustituir audios .wav"
        >
          Carpeta de voces (.wav)
        </button>
        <button class="btn text-xs" onclick={() => spotter.refreshManifest()}
          >Recargar carpetas .wav</button
        >
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
      <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-4">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted uppercase"
            >Perfil de Voz</span
          >
          <select class="field" bind:value={sp.profile} onchange={saveConfig}>
            {#each spotter.availableProfiles as prof (prof)}
              <option value={prof}>Perfil / {prof}</option>
            {/each}
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted uppercase"
            >Vol. Voz ({Math.round(sp.volume * 100)}%)</span
          >
          <div class="flex h-9 items-center gap-2">
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              bind:value={sp.volume}
              oninput={saveConfig}
              class="w-full accent-accent"
            />
          </div>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted uppercase"
            >Vol. Pitidos ({Math.round((sp.beepsVolume ?? 0.85) * 100)}%)</span
          >
          <div class="flex h-9 items-center gap-2">
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={sp.beepsVolume ?? 0.85}
              oninput={(e) => {
                sp.beepsVolume = Number(e.currentTarget.value);
                saveConfig();
              }}
              class="w-full accent-accent"
            />
          </div>
        </label>

        <div
          class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2"
        >
          <div>
            <div class="text-xs font-semibold">Efecto Radio WEC</div>
            <div class="text-[11px] text-muted">Filtro analógico</div>
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
        <div
          class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2"
        >
          <div>
            <div class="text-xs font-semibold text-fg">
              No molestar en curva rápida / frenada fuerte
            </div>
            <div class="text-[11px] text-muted">
              Retrasa avisos no urgentes (combustible, sectores, ritmo) hasta
              salir a recta. Tráfico y banderas siguen siendo inmediatos.
            </div>
          </div>
          <Toggle
            checked={Boolean(sp.quietInFastCorners)}
            label="No molestar en curva"
            onchange={(v) => {
              sp.quietInFastCorners = v;
              saveConfig();
            }}
          />
        </div>
      </div>

      <!-- Personalización del Nombre del Piloto en Radio -->
      <div class="grid gap-3 border-t border-line/60 px-4 py-3 sm:grid-cols-3 items-end">
        <label class="flex flex-col gap-1 text-xs">
          <span class="font-semibold text-fg">Nombre / Apodo del Piloto en Radio</span>
          <input
            type="text"
            class="field py-1.5 text-xs font-semibold"
            placeholder="Ej. Miguel"
            value={sp.driverName ?? ""}
            oninput={(e) => {
              sp.driverName = e.currentTarget.value;
              saveConfig();
            }}
          />
        </label>
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-muted">
            Frecuencia del nombre ({Math.round((sp.driverNameFrequency ?? 0.35) * 100)}%)
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={sp.driverNameFrequency ?? 0.35}
            oninput={(e) => {
              sp.driverNameFrequency = Number(e.currentTarget.value);
              saveConfig();
            }}
            class="accent-accent"
          />
        </label>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-primary px-3 py-1.5 text-xs cursor-pointer"
            onclick={() => spotter.testEvent("Bandera Azul")}
            title="Probar aviso con tu nombre en radio"
          >
            Probar «Bandera Azul»
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-4 px-4 py-3 text-xs">
        <span class="font-semibold text-muted uppercase"
          >Categorías activas:</span
        >
        <label class="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            class="accent-accent"
            bind:checked={sp.traffic}
            onchange={saveConfig}
          />
          <span>P1 · Tráfico en paralelo</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            class="accent-accent"
            bind:checked={sp.flags}
            onchange={saveConfig}
          />
          <span>P2 · Banderas y sanciones</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            class="accent-accent"
            bind:checked={sp.strategy}
            onchange={saveConfig}
          />
          <span>P3 · Estrategia y combustible</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            class="accent-accent"
            bind:checked={sp.carStatus}
            onchange={saveConfig}
          />
          <span>P4 · Daños y neumáticos</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            class="accent-accent"
            bind:checked={sp.session}
            onchange={saveConfig}
          />
          <span>P5 · Récords y carrera</span>
        </label>
        <label class="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            class="accent-accent"
            checked={sp.encouragement !== false}
            onchange={(e) => {
              sp.encouragement = e.currentTarget.checked;
              saveConfig();
            }}
          />
          <span>P5 · Mensajes de ánimo</span>
        </label>
      </div>

      <details class="group">
        <summary
          class="flex cursor-pointer items-center justify-between px-4 py-2.5 text-xs font-semibold text-accent hover:bg-surface-2"
        >
          <span
            >Ver las carpetas de eventos de "Perfil/{sp.profile}" ({SPOTTER_EVENTS.length}
            eventos) y probar sonidos</span
          >
          <span class="text-muted group-open:rotate-180">▼</span>
        </summary>
        <div
          class="max-h-72 overflow-y-auto border-t border-line bg-surface-2/40 p-3"
        >
          <table class="w-full text-xs">
            <thead class="text-left text-muted">
              <tr>
                <th class="pb-2">Prioridad</th>
                <th class="pb-2"
                  >Carpeta en <code>Perfil/{sp.profile}/</code></th
                >
                <th class="pb-2">Audios .wav</th>
                <th class="pb-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line/50">
              {#each SPOTTER_EVENTS as ev (ev.folder)}
                {@const count = spotter.getFilesFor(
                  sp.profile,
                  ev.folder,
                ).length}
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
                      <span class="font-semibold text-good"
                        >{count} archivo{count === 1 ? "" : "s"}</span
                      >
                    {:else}
                      <span class="text-muted"
                        >0 .wav {sp.ttsFallback
                          ? "(usando voz respaldo)"
                          : "(vacío)"}</span
                      >
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

  {/if}

  {#if settingsTab === "ai" || settingsTab === "all"}
  <!-- =========================================================================
       INGENIERO DE PISTA IA LOCAL + VOCES CLONADAS (.ONNX / PIPER TTS)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <span class="text-xl">🧠</span>
        <div>
          <div class="font-semibold text-fg">
            Ingeniero de Pista IA Local + Voces Clonadas (.onnx)
          </div>
          <div class="text-xs text-muted">
            Ingeniero estratégico 100% local independiente del Spotter. Habla
            con tus propias voces clonadas en formato <code
              class="font-mono text-fg">.onnx</code
            > (Piper TTS) y filtro radio WEC.
          </div>
        </div>
      </div>
      <Toggle
        checked={ai.enabled}
        label="Activar Ingeniero IA"
        onchange={(v) => {
          ai.enabled = v;
          saveConfig();
          if (v) void aiEngineer.refreshVoices();
        }}
      />
    </div>

    {#if ai.enabled}
      <div class="divide-y divide-line">
        <!-- 1. Motor de Voz Clonada .onnx -->
        <div class="space-y-3 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div
                class="text-xs font-bold uppercase tracking-wider text-cyan-300"
              >
                🎙️ Motor de Voz Clonada Local (.onnx / Piper TTS)
              </div>
              <div class="text-[11px] text-muted">
                Coloca <code class="font-mono text-fg">piper.exe</code> y tus
                modelos clonados (<code class="font-mono text-fg"
                  >tu_voz.onnx</code
                >
                + <code class="font-mono text-fg">tu_voz.onnx.json</code>) en la
                carpeta <code class="font-mono text-fg">VocesONNX</code>.
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="btn bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-400 hover:text-black px-2.5 py-1 text-xs font-bold cursor-pointer"
                disabled={aiEngineer.busy || aiEngineer.speaking}
                onclick={() => aiEngineer.testVoice()}
                title="Escuchar una transmisión de prueba del Ingeniero IA con la voz seleccionada"
              >
                {aiEngineer.speaking ? "📻 Hablando..." : "🔊 Probar voz IA"}
              </button>
              <button
                type="button"
                class="btn px-2.5 py-1 text-xs cursor-pointer"
                onclick={() => aiEngineer.openVoicesFolder()}
              >
                📂 Abrir VocesONNX
              </button>
              <button
                type="button"
                class="btn px-2.5 py-1 text-xs cursor-pointer"
                onclick={() => aiEngineer.refreshVoices()}
              >
                🔄 Refrescar
              </button>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span
              class={[
                "rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold",
                aiEngineer.voicesStatus?.piperFound
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300",
              ]}
            >
              {aiEngineer.voicesStatus?.piperFound
                ? "✓ piper.exe instalado"
                : "⚠️ Falta instalar Piper TTS"}
            </span>
            <span
              class="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-muted"
            >
              {aiEngineer.voicesStatus?.voices.length ?? 0} modelos .onnx encontrados
            </span>
            {#if !aiEngineer.voicesStatus?.piperFound || (aiEngineer.voicesStatus?.voices.length ?? 0) === 0}
              <button
                type="button"
                class="btn btn-primary px-3 py-1 text-xs font-bold cursor-pointer"
                disabled={aiEngineer.installing}
                onclick={() => aiEngineer.installPiper(true)}
              >
                {aiEngineer.installing
                  ? `Instalando (${aiEngineer.installPercent}%)...`
                  : "⬇️ Instalar Piper TTS + Voz Española (1 clic)"}
              </button>
            {/if}
          </div>
          {#if aiEngineer.installing || aiEngineer.installMessage}
            <div
              class="space-y-1 rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs"
            >
              <div class="flex items-center justify-between text-cyan-200">
                <span>{aiEngineer.installMessage}</span>
                <span class="font-mono font-bold"
                  >{aiEngineer.installPercent}%</span
                >
              </div>
              <div
                class="h-1.5 w-full overflow-hidden rounded-full bg-black/50"
              >
                <div
                  class="h-full bg-cyan-400 transition-all duration-300"
                  style:width="{aiEngineer.installPercent}%"
                ></div>
              </div>
            </div>
          {/if}

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-xs">
              <span class="font-semibold text-muted uppercase"
                >Motor de síntesis (100% Local)</span
              >
              <select
                class="field py-1.5 text-xs"
                bind:value={ai.voiceEngine}
                onchange={() => {
                  saveConfig();
                  if (ai.voiceEngine === "qwen3")
                    void aiEngineer.refreshQwen3Voices();
                }}
              >
                <option value="onnx"
                  >⚡ Ligero (.onnx en CPU · 49ms · 0% GPU)</option
                >
                <option value="qwen3"
                  >🔥 MDT-QWEN (CUDA / ROCm · FP16 / BF16)</option
                >
                <option value="system"
                  >Voz del sistema (Respaldo Windows)</option
                >
              </select>
            </label>

            {#if ai.voiceEngine === "qwen3"}
              <label class="flex flex-col gap-1 text-xs">
                <span class="font-semibold text-muted uppercase"
                  >Perfil de Voz de Referencia (VocesMDTQwen/)</span
                >
                <select
                  class="field py-1.5 text-xs"
                  value={ai.qwen3Profile ?? "Antonio"}
                  onchange={(e) => {
                    ai.qwen3Profile = e.currentTarget.value;
                    saveConfig();
                  }}
                >
                  {#each aiEngineer.qwen3Status?.profiles ?? [] as prof (prof.name)}
                    <option value={prof.name}>
                      {prof.name}
                      {prof.preloaded
                        ? " ⚡ (Precargado VRAM)"
                        : prof.hasAudio
                          ? prof.hasTranscript
                            ? " ✓ (ref.wav + ref.txt)"
                            : ` ✓ (${prof.audioFile})`
                          : " (⚠️ sin ref.wav)"}
                    </option>
                  {/each}
                  {#if (aiEngineer.qwen3Status?.profiles?.length ?? 0) === 0}
                    <option value={ai.qwen3Profile ?? "Antonio"}
                      >{ai.qwen3Profile ?? "Antonio"}</option
                    >
                  {/if}
                </select>
              </label>
            {:else}
              <label class="flex flex-col gap-1 text-xs">
                <span class="font-semibold text-muted uppercase"
                  >Voz Castellano Nativo / Clonada (.onnx)</span
                >
                <select
                  class="field py-1.5 text-xs"
                  bind:value={ai.onnxModelPath}
                  onchange={saveConfig}
                  disabled={ai.voiceEngine !== "onnx"}
                >
                  <option value="">(Ningún .onnx seleccionado)</option>
                  {#each aiEngineer.voicesStatus?.voices ?? [] as v (v.path)}
                    <option value={v.path}>
                      {friendlyOnnxVoiceName(v.name)}{v.hasConfig
                        ? " ✓"
                        : " (falta .onnx.json)"}
                    </option>
                  {/each}
                </select>
              </label>
            {/if}
          </div>

          {#if ai.voiceEngine === "qwen3"}
            <div
              class="space-y-3 rounded-lg border border-orange-500/35 bg-orange-950/15 p-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="space-y-0.5">
                  <div class="text-xs font-bold text-orange-300">
                    🔥 MDT-QWEN · Servidor Persistente GPU (CUDA / ROCm · FP16 / BF16)
                  </div>
                  <div class="text-[11px] text-muted">
                    Precarga todos los perfiles de <code
                      class="font-mono text-fg"
                      >VocesMDTQwen/&lt;Perfil&gt;/ref.wav</code
                    >
                    (+ <code class="font-mono text-fg">ref.txt</code> opcional) en
                    VRAM para mínima latencia.
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  {#if !aiEngineer.qwen3Status?.venvFound || !aiEngineer.qwen3Status?.whisperFound}
                    <button
                      type="button"
                      class="btn btn-primary px-2.5 py-1 text-xs font-bold cursor-pointer"
                      disabled={aiEngineer.qwen3Installing}
                      onclick={() => aiEngineer.installMdtQwen()}
                      title="Detecta automáticamente tu GPU (NVIDIA CUDA o AMD ROCm) e instala MDT-QWEN + Whisper STT en 1 clic"
                    >
                      {aiEngineer.qwen3Installing
                        ? `Instalando MDT-QWEN (${aiEngineer.qwen3InstallPercent}%)...`
                        : "⬇️ Instalar MDT-QWEN (1 clic)"}
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="btn bg-orange-500/25 border border-orange-400/50 text-orange-200 hover:bg-orange-400 hover:text-black px-2.5 py-1 text-xs font-bold cursor-pointer"
                    disabled={aiEngineer.qwen3Busy || aiEngineer.qwen3Installing}
                    onclick={() => aiEngineer.startQwen3Server()}
                  >
                    {aiEngineer.qwen3Busy
                      ? "Iniciando..."
                      : aiEngineer.qwen3Status?.serverRunning
                        ? "🔄 Recargar perfiles VRAM"
                        : "▶ Iniciar / Precargar MDT-QWEN"}
                  </button>
                  {#if aiEngineer.qwen3Status?.serverRunning}
                    <button
                      type="button"
                      class="btn px-2.5 py-1 text-xs cursor-pointer"
                      onclick={() => aiEngineer.stopQwen3Server()}
                    >
                      ⏹ Detener
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="btn bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 hover:bg-cyan-400 hover:text-black px-2.5 py-1 text-xs font-bold cursor-pointer"
                    disabled={!aiEngineer.qwen3Status?.serverReady || aiEngineer.prewarming}
                    onclick={() => aiEngineer.prewarmPersonalityCache()}
                    title="Pre-genera en disco todas las frases de la personalidad elegida para que suenen en <2ms en pista"
                  >
                    {aiEngineer.prewarming ? "⚡ Pre-generando..." : "⚡ Pre-generar caché personalidad"}
                  </button>
                  <button
                    type="button"
                    class="btn px-2.5 py-1 text-xs cursor-pointer"
                    disabled={aiEngineer.prewarming}
                    onclick={() => aiEngineer.clearVoiceCache()}
                    title="Borra los audios precacheados en disco (.cache) y memoria RAM para regenerarlos"
                  >
                    🧹 Limpiar caché
                  </button>
                  <button
                    type="button"
                    class="btn px-2.5 py-1 text-xs cursor-pointer"
                    onclick={() => aiEngineer.openQwen3VoicesFolder()}
                  >
                    📂 Abrir VocesMDTQwen
                  </button>
                  <button
                    type="button"
                    class="btn px-2.5 py-1 text-xs cursor-pointer"
                    onclick={() => aiEngineer.refreshQwen3Voices()}
                  >
                    🔄 Refrescar
                  </button>
                </div>
              </div>

              {#if aiEngineer.qwen3Installing || aiEngineer.qwen3InstallMessage}
                <div class="space-y-1 rounded-lg border border-orange-400/40 bg-orange-950/30 px-3 py-2 text-xs">
                  <div class="flex items-center justify-between text-orange-200">
                    <span>{aiEngineer.qwen3InstallMessage}</span>
                    <span class="font-mono font-bold">{aiEngineer.qwen3InstallPercent}%</span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                    <div class="h-full bg-orange-400 transition-all duration-300" style:width="{aiEngineer.qwen3InstallPercent}%"></div>
                  </div>
                </div>
              {/if}

              {#if aiEngineer.prewarming}
                {@const pct = aiEngineer.prewarmTotal > 0 ? Math.round((aiEngineer.prewarmDone / aiEngineer.prewarmTotal) * 100) : 0}
                {@const etaMins = Math.floor(aiEngineer.prewarmEtaSecs / 60)}
                {@const etaSecs = aiEngineer.prewarmEtaSecs % 60}
                <div class="space-y-1.5 rounded-lg border border-cyan-400/40 bg-cyan-950/30 px-3 py-2 text-xs">
                  <div class="flex flex-wrap items-center justify-between gap-2 text-cyan-200">
                    <span class="font-semibold">
                      ⚡ Pre-generando caché ({aiEngineer.prewarmDone}/{aiEngineer.prewarmTotal} · {pct}%)
                    </span>
                    <div class="flex items-center gap-2">
                      <span class="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                        ⏱️ {etaMins > 0 ? `~${etaMins}m ${etaSecs.toString().padStart(2, "0")}s` : `~${etaSecs}s`} restantes
                      </span>
                      <button
                        type="button"
                        class="rounded bg-red-500/25 border border-red-400/40 px-2 py-0.5 text-[10px] font-bold text-red-200 hover:bg-red-500 hover:text-white cursor-pointer"
                        onclick={() => aiEngineer.cancelPrewarm()}
                      >
                        ⏹ Cancelar
                      </button>
                    </div>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                    <div class="h-full bg-cyan-400 transition-all duration-300" style:width="{pct}%"></div>
                  </div>
                  {#if aiEngineer.prewarmCurrentPhrase}
                    <div class="truncate text-[10px] text-muted italic">
                      Generando: "{aiEngineer.prewarmCurrentPhrase}"
                    </div>
                  {/if}
                </div>
              {/if}

              <div
                class="flex flex-wrap items-center gap-2 text-[11px] font-mono"
              >
                {#if aiEngineer.qwen3Status?.serverReady}
                  <span
                    class="rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-bold text-emerald-300"
                  >
                    ✓ Listo · {aiEngineer.qwen3Status.backend} · {aiEngineer.qwen3Status.dtype.toUpperCase()}
                    ({aiEngineer.qwen3Status.gpu})
                  </span>
                {:else if aiEngineer.qwen3Status?.serverLoading}
                  <span
                    class="rounded-full bg-amber-500/20 px-2.5 py-0.5 font-bold text-amber-300 animate-pulse"
                  >
                    ⏳ Cargando Qwen3-TTS 0.6B y precargando voces en VRAM...
                  </span>
                {:else}
                  <span
                    class="rounded-full bg-white/10 px-2.5 py-0.5 text-muted"
                  >
                    ⏹ Servidor detenido (pulsa Iniciar / Precargar 0.6B)
                  </span>
                {/if}
                <span class="rounded-full bg-white/10 px-2.5 py-0.5 text-muted">
                  {aiEngineer.qwen3Status?.profiles.filter((p) => p.hasAudio)
                    .length ?? 0}/{aiEngineer.qwen3Status?.profiles.length ?? 0}
                  perfiles con audio
                </span>
                <span
                  class="rounded-full bg-white/10 px-2.5 py-0.5 text-cyan-200"
                >
                  💾 Caché: {aiEngineer.qwen3Status?.cacheFiles ?? 0} audios ({(
                    (aiEngineer.qwen3Status?.cacheBytes ?? 0) /
                    (1024 * 1024)
                  ).toFixed(2)} MB)
                </span>
              </div>

              {#if aiEngineer.qwen3Status?.error}
                <div
                  class="rounded border border-red-500/40 bg-red-950/30 px-2.5 py-1.5 text-[11px] text-red-200"
                >
                  ⚠️ {aiEngineer.qwen3Status.error}
                </div>
              {/if}

              <div class="grid gap-2.5 sm:grid-cols-3">
                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted">Aceleración GPU</span>
                  <select
                    class="field py-1.5 text-xs"
                    value={ai.qwen3Device ?? "auto"}
                    onchange={(e) => {
                      ai.qwen3Device = e.currentTarget.value as
                        | "auto"
                        | "cuda"
                        | "rocm"
                        | "cpu";
                      saveConfig();
                    }}
                  >
                    <option value="auto">Auto (CUDA NVIDIA / ROCm AMD)</option>
                    <option value="rocm">AMD Radeon (ROCm)</option>
                    <option value="cuda">NVIDIA (CUDA)</option>
                    <option value="cpu">CPU (sin GPU)</option>
                  </select>
                </label>

                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted">Precisión</span>
                  <select
                    class="field py-1.5 text-xs"
                    value={ai.qwen3Dtype ?? "fp16"}
                    onchange={(e) => {
                      ai.qwen3Dtype = e.currentTarget.value as
                        | "fp16"
                        | "bf16"
                        | "fp32";
                      saveConfig();
                    }}
                  >
                    <option value="fp16">FP16 (RTX 20/30/40)</option>
                    <option value="bf16">BF16 (BFloat16 / RX9070XT)</option>
                    <option value="fp32">FP32 (RTX 5000)</option>
                  </select>
                </label>

                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted">Endpoint local</span>
                  <input
                    type="url"
                    class="field py-1.5 font-mono text-xs"
                    value={ai.qwen3Endpoint ?? "http://127.0.0.1:18421"}
                    oninput={(e) => {
                      ai.qwen3Endpoint = e.currentTarget.value;
                      saveConfig();
                    }}
                  />
                </label>
              </div>

              <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted"
                  >Ruta a <code class="font-mono text-fg">python.exe</code> de
                  tu entorno ROCm/CUDA (opcional · vacío =
                  <code class="font-mono">python</code> del sistema)</span
                >
                <input
                  type="text"
                  class="field py-1.5 font-mono text-xs"
                  placeholder="Ej: C:\Users\Miguel\mi-proyecto-rocm\venv\Scripts\python.exe"
                  value={ai.qwen3PythonPath ?? ""}
                  oninput={(e) => {
                    ai.qwen3PythonPath = e.currentTarget.value;
                    saveConfig();
                  }}
                />
              </label>

              <div class="flex items-center justify-between gap-2 rounded-lg border border-orange-400/25 bg-black/25 px-3 py-2">
                <div>
                  <div class="text-xs font-semibold text-orange-200">
                    🚀 Auto-arrancar MDT-QWEN silenciosamente al abrir MDT-HUD
                  </div>
                  <div class="text-[11px] text-muted">
                    Levanta el servidor GPU en segundo plano al iniciar la app para tener la voz precargada en VRAM antes de salir a pista.
                  </div>
                </div>
                <Toggle
                  checked={Boolean(ai.qwen3AutoStart)}
                  label="Auto-arrancar MDT-QWEN"
                  onchange={(v) => {
                    ai.qwen3AutoStart = v;
                    saveConfig();
                  }}
                />
              </div>
            </div>
          {/if}

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label class="flex flex-col gap-1 text-xs">
              <span class="text-muted"
                >Velocidad ({ai.onnxSpeed.toFixed(2)}×)</span
              >
              <input
                type="range"
                min="0.75"
                max="1.25"
                step="0.02"
                bind:value={ai.onnxSpeed}
                oninput={saveConfig}
                class="accent-cyan-400"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-xs"
              title="Variación tonal (noise_scale): más bajo = más limpio, más alto = más expresivo"
            >
              <span class="text-muted"
                >Expresividad ({(ai.onnxNoiseScale ?? 0.62).toFixed(2)})</span
              >
              <input
                type="range"
                min="0.30"
                max="0.90"
                step="0.02"
                value={ai.onnxNoiseScale ?? 0.62}
                oninput={(e) => {
                  ai.onnxNoiseScale = Number(e.currentTarget.value);
                  saveConfig();
                }}
                class="accent-cyan-400"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-xs"
              title="Cadencia natural de sílabas (noise_w)"
            >
              <span class="text-muted"
                >Cadencia ({(ai.onnxNoiseW ?? 0.78).toFixed(2)})</span
              >
              <input
                type="range"
                min="0.40"
                max="0.95"
                step="0.02"
                value={ai.onnxNoiseW ?? 0.78}
                oninput={(e) => {
                  ai.onnxNoiseW = Number(e.currentTarget.value);
                  saveConfig();
                }}
                class="accent-cyan-400"
              />
            </label>
            <label class="flex flex-col gap-1 text-xs">
              <span class="text-muted"
                >Volumen ({Math.round(ai.volume * 100)}%)</span
              >
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                bind:value={ai.volume}
                oninput={saveConfig}
                class="accent-cyan-400"
              />
            </label>
            <label class="flex flex-col gap-1 text-xs">
              <span class="text-muted">Efecto de Radio</span>
              <select
                class="field py-1 text-xs"
                value={ai.radioPreset ?? (ai.radioFilter ? "wec" : "studio")}
                onchange={(e) => {
                  const v = e.currentTarget.value as "studio" | "wec" | "f1_vintage" | "walkie";
                  ai.radioPreset = v;
                  ai.radioFilter = v !== "studio";
                  saveConfig();
                }}
              >
                <option value="studio">🎙️ Estudio Limpio (Sin filtro)</option>
                <option value="wec">📻 Radio WEC Real (Recomendado)</option>
                <option value="f1_vintage">🏎️ Radio F1 Clásica (Saturada)</option>
                <option value="walkie">📡 Walkie-Talkie + Ruido Blanco</option>
              </select>
            </label>
          </div>
          <div
            class="flex items-center justify-between gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2"
          >
            <div>
              <div class="text-xs font-semibold text-cyan-200">
                🎙️ Usar esta voz .onnx para TODOS los avisos en pista (Spotter
                en vivo)
              </div>
              <div class="text-[11px] text-muted">
                Avisa en tiempo real de banderas, tráfico en paralelo,
                sanciones, combustible, sectores y lluvia usando tu voz clonada
                .onnx (con caché instantánea).
              </div>
            </div>
            <Toggle
              checked={ai.useForSpotterEvents ?? true}
              label="Usar voz ONNX en Spotter"
              onchange={(v) => {
                ai.useForSpotterEvents = v;
                saveConfig();
              }}
            />
          </div>
        </div>

        <!-- 2. Cerebro Local (Integrado / Ollama / LM Studio) -->
        <div class="space-y-3 p-4">
          <div class="text-xs font-bold uppercase tracking-wider text-accent">
            🧩 Cerebro IA (100% Local)
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <label class="flex flex-col gap-1 text-xs">
              <span class="font-semibold text-muted uppercase"
                >Modo de cerebro</span
              >
              <select
                class="field py-1.5 text-xs"
                bind:value={ai.brainMode}
                onchange={() => {
                  if (
                    ai.brainMode === "ollama" &&
                    !ai.endpoint.includes("11434")
                  )
                    ai.endpoint = "http://127.0.0.1:11434";
                  if (
                    ai.brainMode === "lmstudio" &&
                    !ai.endpoint.includes("1234")
                  )
                    ai.endpoint = "http://127.0.0.1:1234";
                  saveConfig();
                }}
              >
                <option value="local_rules"
                  >Motor Integrado MDT (incluido, sin programas extra)</option
                >
                <option value="ollama">Ollama Local (LLM libre en tu PC)</option
                >
                <option value="lmstudio">LM Studio / OpenAI Local</option>
              </select>
            </label>

            <label class="flex flex-col gap-1 text-xs">
              <span class="font-semibold text-muted uppercase"
                >Personalidad</span
              >
              <select
                class="field py-1.5 text-xs"
                bind:value={ai.personality}
                onchange={saveConfig}
              >
                <option value="wec_pro"
                  >Ingeniero WEC Profesional (Serio y preciso)</option
                >
                <option value="motivator"
                  >Ingeniero Motivador (Enérgico y cercano)</option
                >
                <option value="strategist"
                  >Estratega de Resistencia (Ritmo y datos)</option
                >
                <option value="streamer_hype"
                  >🔥 Showman (Vacilón e intenso)</option
                >
                {#each customPersonalitiesList as cp (cp.id)}
                  <option value={cp.id}>⭐ {cp.name} (Personalizada)</option>
                {/each}
              </select>
            </label>

            <div
              class="flex items-center justify-between rounded-lg border border-line bg-surface-2/40 px-3 py-1.5"
            >
              <div>
                <div class="text-xs font-semibold text-fg">
                  Proactivo cada {ai.proactiveEveryLaps} v.
                </div>
                <div class="text-[10px] text-muted">
                  Informe automático en pista
                </div>
              </div>
              <Toggle
                checked={ai.proactiveEnabled}
                label="Modo proactivo"
                onchange={(v) => {
                  ai.proactiveEnabled = v;
                  saveConfig();
                }}
              />
            </div>
          </div>

          {#if ai.brainMode !== "local_rules"}
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted">Endpoint local</span>
                <input
                  type="url"
                  class="field py-1.5 font-mono text-xs"
                  bind:value={ai.endpoint}
                  oninput={saveConfig}
                />
              </label>
              <label class="flex flex-col gap-1 text-xs">
                <span class="text-muted"
                  >Modelo local (ej. gemma3:4b, qwen2.5:3b, mdt-ingeniero)</span
                >
                <input
                  type="text"
                  class="field py-1.5 font-mono text-xs"
                  bind:value={ai.model}
                  oninput={saveConfig}
                />
              </label>
            </div>
          {/if}

          <!-- Editor de Personalidades Propias + Importar / Exportar (.mdtvoice.json con ref.wav) -->
          <div class="space-y-2.5 rounded-lg border border-line bg-surface-2/40 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="text-xs font-bold text-fg">
                  🎙️ Personalidades Propias y Paquetes Compartibles
                </div>
                <div class="text-[11px] text-muted">
                  Crea tus propias frases de radio y expórtalas solas o empaquetadas junto con tu audio de referencia (<code class="font-mono">ref.wav</code>).
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="btn btn-primary px-2.5 py-1 text-xs font-bold cursor-pointer"
                  onclick={createCustomPersonality}
                >
                  + Nueva personalidad
                </button>
                <label class="btn px-2.5 py-1 text-xs cursor-pointer">
                  📥 Importar Pack / JSON
                  <input
                    type="file"
                    accept=".json,.mdtvoice.json"
                    class="hidden"
                    onchange={handleImportPersonalityFile}
                  />
                </label>
                {#if activeCustomPersonality}
                  <button
                    type="button"
                    class="btn px-2.5 py-1 text-xs cursor-pointer"
                    onclick={() => handleExportPersonality(false)}
                    title="Exporta solo las frases y configuración de esta personalidad"
                  >
                    📤 Exportar JSON
                  </button>
                  <button
                    type="button"
                    class="btn bg-orange-500/20 border border-orange-400/40 text-orange-200 hover:bg-orange-400 hover:text-black px-2.5 py-1 text-xs font-bold cursor-pointer"
                    onclick={() => handleExportPersonality(true)}
                    title="Exporta la personalidad + el audio ref.wav y ref.txt del perfil vinculado en un solo archivo"
                  >
                    📦 Exportar + ref.wav
                  </button>
                  <button
                    type="button"
                    class="btn px-2 py-1 text-xs text-red-300 hover:bg-red-500 hover:text-white cursor-pointer"
                    onclick={deleteActiveCustomPersonality}
                    title="Eliminar esta personalidad personalizada"
                  >
                    🗑️
                  </button>
                {/if}
              </div>
            </div>

            {#if packMsg}
              <div class="text-[11px] font-semibold text-emerald-300">{packMsg}</div>
            {/if}

            {#if activeCustomPersonality}
              <div class="grid gap-2.5 pt-1 sm:grid-cols-2">
                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted">Nombre de la personalidad</span>
                  <input
                    type="text"
                    class="field py-1 text-xs"
                    value={activeCustomPersonality.name}
                    oninput={(e) => {
                      activeCustomPersonality.name = e.currentTarget.value;
                      saveConfig();
                    }}
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted">Perfil de voz MDT-QWEN vinculado (para exportar con ref.wav)</span>
                  <select
                    class="field py-1 text-xs"
                    value={activeCustomPersonality.linkedVoiceProfile ?? ""}
                    onchange={(e) => {
                      activeCustomPersonality.linkedVoiceProfile = e.currentTarget.value;
                      if (e.currentTarget.value) ai.qwen3Profile = e.currentTarget.value;
                      saveConfig();
                    }}
                  >
                    <option value="">(Usar perfil activo actual)</option>
                    {#each aiEngineer.qwen3Status?.profiles ?? [] as prof (prof.name)}
                      <option value={prof.name}>{prof.name}</option>
                    {/each}
                  </select>
                </label>
              </div>

              <div class="space-y-1.5 pt-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label class="flex items-center gap-2 text-xs">
                    <span class="font-semibold text-muted">Evento a editar:</span>
                    <select class="field py-1 text-xs" bind:value={editingEventKey}>
                      {#each EDITABLE_SPOTTER_EVENTS as ev (ev.key)}
                        <option value={ev.key}>{ev.label}</option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    class="btn px-2 py-0.5 text-[11px] cursor-pointer"
                    onclick={() => spotter.trigger(editingEventKey, true, { place: 2, classPlace: 2, sector: 1, gained: 4, lost: 3 })}
                  >
                    ▶ Probar frase
                  </button>
                </div>
                <textarea
                  rows="3"
                  class="field w-full font-sans text-xs"
                  placeholder="Escribe una frase por línea (se elegirán al azar sin repetir)..."
                  value={(activeCustomPersonality.phrases[editingEventKey] ?? []).join("\n")}
                  oninput={(e) => {
                    const lines = e.currentTarget.value
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean);
                    activeCustomPersonality.phrases[editingEventKey] = lines;
                    saveConfig();
                  }}
                ></textarea>
              </div>
            {/if}
          </div>
        </div>

        <!-- 3. Dispositivos de Audio de la Aplicación (Micrófono y Salida de Sonido) -->
        <div class="space-y-2.5 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div
                class="text-xs font-bold uppercase tracking-wider text-sky-300"
              >
                🎧 Dispositivos de Audio (Micrófono y Salida)
              </div>
              <div class="text-[11px] text-muted">
                Elige directamente qué micrófono escucha tu voz y por qué
                auriculares/altavoces suena el Spotter y el Ingeniero IA
                (independiente de Windows).
              </div>
            </div>
            <button
              type="button"
              class="btn px-2.5 py-1 text-xs cursor-pointer"
              disabled={audioDevices.loading}
              onclick={() => audioDevices.refresh(true)}
            >
              {audioDevices.loading
                ? "Detectando..."
                : "🔄 Detectar dispositivos"}
            </button>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-xs">
              <span class="font-semibold text-muted uppercase"
                >🎙️ Entrada de Micrófono (Radio PTT)</span
              >
              <select
                class="field py-1.5 text-xs"
                value={g.audioInputId ?? ""}
                onchange={(e) => {
                  g.audioInputId = e.currentTarget.value;
                  saveConfig();
                }}
              >
                <option value="">Predeterminado de Windows</option>
                {#each audioDevices.inputs as dev (dev.deviceId)}
                  <option value={dev.deviceId}>{dev.label}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1 text-xs">
              <span class="font-semibold text-muted uppercase"
                >🔊 Salida de Sonido (Spotter + IA)</span
              >
              <select
                class="field py-1.5 text-xs"
                value={g.audioOutputId ?? ""}
                onchange={(e) => {
                  g.audioOutputId = e.currentTarget.value;
                  saveConfig();
                }}
              >
                <option value="">Predeterminado de Windows</option>
                {#each audioDevices.outputs as dev (dev.deviceId)}
                  <option value={dev.deviceId}>{dev.label}</option>
                {/each}
              </select>
            </label>
          </div>
          {#if audioDevices.error}
            <div class="text-[11px] text-amber-300">
              ⚠️ {audioDevices.error}
            </div>
          {/if}
        </div>

        <!-- 4. Botón del Volante para Hablar con Spotter IA (PTT) -->
        <div class="space-y-2.5 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div
                class="text-xs font-bold uppercase tracking-wider text-emerald-300"
              >
                🎮 Botón del Volante para Hablar (Radio PTT)
              </div>
              <div class="text-[11px] text-muted">
                Asigna cualquier botón de tu volante (o tecla) para abrir el
                micrófono en pista y preguntarle en voz alta al Spotter IA.
                Escucharás un pitido al abrir el micro.
              </div>
            </div>
            {#if wheelControl.connectedGamepads.length > 0}
              <span
                class="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300"
              >
                ✓ Volante detectado
              </span>
            {/if}
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            {#each [{ id: "aiEngineerPtt" as WheelGlobalAction, title: "🎙️ Hablar por Radio (PTT)", sub: "Abre el micro y responde a tu pregunta" }, { id: "aiEngineerReport" as WheelGlobalAction, title: "📊 Pedir Informe Rápido", sub: "Resumen inmediato sin usar micro" }] as item (item.id)}
              {@const bound = wheelControl.actionBinds[item.id]}
              {@const isLearning = wheelControl.learning === item.id}
              <div
                class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="text-xs font-bold text-fg">{item.title}</div>
                  <div class="truncate text-[10px] text-muted">{item.sub}</div>
                </div>
                <div class="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    class={[
                      "rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                      isLearning
                        ? "border-amber-400 bg-amber-500 text-black animate-pulse"
                        : bound
                          ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                          : "border-white/15 bg-black/40 text-white hover:border-accent",
                    ]}
                    onclick={() =>
                      isLearning
                        ? wheelControl.cancelLearning()
                        : wheelControl.startLearning(item.id)}
                  >
                    {isLearning
                      ? "Pulsa botón..."
                      : bound
                        ? bound.label
                        : "Asignar botón"}
                  </button>
                  {#if bound}
                    <button
                      type="button"
                      class="rounded bg-white/10 px-1.5 py-1 text-[10px] text-muted hover:bg-red-500 hover:text-white cursor-pointer"
                      title="Quitar botón asignado"
                      onclick={() => wheelControl.clearActionBind(item.id)}
                      >✕</button
                    >
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <!-- Guía completa de comandos de voz y preguntas por radio (#3) -->
          <details class="rounded-lg border border-emerald-500/30 bg-emerald-950/15 px-3 py-2 text-xs">
            <summary class="cursor-pointer font-bold text-emerald-300 select-none">
              📖 Guía de Comandos de Voz: Todo lo que puedes pedir por radio (Manos Libres + Telemetría)
            </summary>
            <div class="mt-2.5 grid gap-3 sm:grid-cols-2">
              <div class="space-y-1.5">
                <div class="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  🎛️ Comandos de Acción (Controlan el HUD por voz)
                </div>
                {#each VOICE_COMMANDS_GUIDE.actions as item (item.say)}
                  <div class="rounded bg-black/30 px-2 py-1">
                    <div class="font-semibold text-fg">{item.say}</div>
                    <div class="text-[10px] text-muted">{item.does}</div>
                  </div>
                {/each}
              </div>
              <div class="space-y-1.5">
                <div class="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  📊 Preguntas de Telemetría y Estrategia
                </div>
                {#each VOICE_COMMANDS_GUIDE.questions as item (item.say)}
                  <div class="rounded bg-black/30 px-2 py-1">
                    <div class="font-semibold text-fg">{item.say}</div>
                    <div class="text-[10px] text-muted">{item.does}</div>
                  </div>
                {/each}
              </div>
            </div>
          </details>
        </div>

        <!-- 4. Consola de Prueba en Vivo -->
        <div class="space-y-2.5 bg-surface-2/30 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="text"
              class="field flex-1 py-1.5 text-xs"
              placeholder="Prueba una pregunta (ej. ¿Cómo voy de combustible y neumáticos?)"
              bind:value={aiPromptInput}
              onkeydown={(e) => {
                if (e.key === "Enter")
                  void aiEngineer.ask(aiPromptInput, live.snap);
              }}
            />
            <button
              type="button"
              class="btn btn-primary px-3 py-1.5 text-xs font-bold cursor-pointer"
              disabled={aiEngineer.busy}
              onclick={() => aiEngineer.ask(aiPromptInput, live.snap)}
            >
              {aiEngineer.busy ? "Pensando..." : "💬 Preguntar y Hablar"}
            </button>
            <button
              type="button"
              class={[
                "btn px-3 py-1.5 text-xs font-bold cursor-pointer select-none",
                aiEngineer.listening
                  ? "bg-red-500! text-white animate-pulse"
                  : "",
              ]}
              disabled={aiEngineer.busy && !aiEngineer.listening}
              onpointerdown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                void aiEngineer.beginPushToTalk(live.snap);
              }}
              onpointerup={() => void aiEngineer.endPushToTalk()}
              onpointercancel={() => void aiEngineer.endPushToTalk()}
              title="Mantén pulsado mientras hablas y suelta al terminar"
            >
              {aiEngineer.listening
                ? "🔴 Escuchando... (suelta para enviar)"
                : "🎙️ Mantén para hablar (PTT)"}
            </button>
          </div>
          {#if aiEngineer.lastQuestion}
            <div class="text-[11px] text-muted">
              <span class="font-bold text-emerald-300">🎙️ Escuchado:</span>
              "{aiEngineer.lastQuestion}"
            </div>
          {/if}
          {#if aiEngineer.lastAnswer}
            <div
              class="rounded-lg border border-cyan-500/30 bg-cyan-950/25 px-3 py-2 text-xs text-cyan-100"
            >
              <span class="font-bold text-cyan-300">📻 Ingeniero IA:</span>
              {aiEngineer.lastAnswer}
            </div>
          {/if}
          {#if aiEngineer.lastError}
            <div
              class="rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-1.5 text-[11px] text-amber-200"
            >
              ⚠️ {aiEngineer.lastError}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  {/if}

  {#if settingsTab === "integrations" || settingsTab === "all"}
  <!-- =========================================================================
       INTEGRACIÓN DISCORD (WEBHOOKS TELEMETRÍA)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <span class="text-xl">💬</span>
        <div>
          <div class="font-semibold text-fg">
            Integración con Discord (Webhooks)
          </div>
          <div class="text-xs text-muted">
            Exporta y envía automáticamente el gráfico PNG de telemetría con el
            nombre del piloto al finalizar cada sesión
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
            <div class="font-medium text-fg">
              Envío automático al terminar sesión
            </div>
            <div class="text-xs text-muted">
              Al cruzar la meta con bandera a cuadros o salir a boxes tras
              completar vueltas, genera el PNG y lo publica en Discord.
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
          <div
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs"
          >
            <div class="flex items-center gap-2">
              <span>🔒</span>
              <span class="font-semibold text-emerald-300">
                {dc.webhookUrl?.trim()
                  ? "Usando Webhook personalizado"
                  : "Canal Oficial MDT-HUD activo (Webhook protegido en backend)"}
              </span>
            </div>
            {#if dc.webhookUrl?.trim()}
              <button
                type="button"
                class="rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
                onclick={() => {
                  dc.webhookUrl = "";
                  saveConfig();
                }}
              >
                Usar oficial protegido
              </button>
            {/if}
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-muted uppercase"
              >Webhook Personalizado (Opcional · dejar vacío para canal oficial
              MDT)</span
            >
            <input
              type="url"
              class="field w-full font-mono text-xs"
              placeholder="Vacío = Canal Oficial MDT-HUD protegido (pega aquí tu webhook solo si quieres enviar a tu propio servidor)"
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
                <span
                  class={[
                    "text-xs font-bold",
                    discordMsg.startsWith("✓") ? "text-good" : "text-bad",
                  ]}
                >
                  {discordMsg}
                </span>
              {/if}
              <button
                class="btn text-xs bg-accent text-white font-bold hover:bg-accent-hi"
                onclick={handleTestDiscord}
                disabled={testingDiscord}
              >
                {testingDiscord ? "Enviando..." : "🧪 Probar Webhook"}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- =========================================================================
       RETRANSMISIÓN DE TELEMETRÍA EN DIRECTO (MDT LIVE)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <span class="text-xl">📡</span>
        <div>
          <div class="font-semibold text-fg">
            Retransmisión de Telemetría en Vivo (Emisor)
          </div>
          <div class="text-xs text-muted">
            Comparte automáticamente tus datos de telemetría en tiempo real
            mientras ruedas en pista para que el equipo pueda verte.
          </div>
        </div>
      </div>
      <Toggle
        checked={bc.enabled}
        label="Retransmitir en vivo"
        onchange={(v) => {
          bc.enabled = v;
          saveConfig();
        }}
      />
    </div>

    {#if bc.enabled}
      <div class="divide-y divide-line">
        <div class="flex items-center justify-between p-4 bg-accent/5">
          <div>
            <div class="font-medium text-fg">
              Estado de conexión de retransmisión
            </div>
            <div class="text-xs text-muted">
              {remoteStream.connected
                ? "Conectado al servidor de retransmisión oficial MDT"
                : "Conectando al servicio de retransmisión..."}
            </div>
          </div>
          <div
            class="flex items-center gap-1.5 text-xs font-semibold text-good"
          >
            <span
              class={[
                "h-2 w-2 rounded-full",
                remoteStream.connected ? "bg-good animate-pulse" : "bg-bad",
              ]}
            ></span>
            <span>{remoteStream.connected ? "En línea" : "Desconectado"}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-muted uppercase"
              >Nombre del Piloto a Mostrar</span
            >
            <input
              type="text"
              class="field w-full text-xs"
              placeholder={g.teammates?.split(",")[0]?.trim() || "Piloto MDT"}
              bind:value={bc.driverName}
              oninput={saveConfig}
            />
            <span class="text-[10px] text-muted"
              >Si se deja vacío, tomará tu nombre de piloto del juego o de
              compañeros MDT.</span
            >
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-muted uppercase"
              >Frecuencia de telemetría (Hz)</span
            >
            <select
              class="field text-xs"
              bind:value={bc.rateHz}
              onchange={saveConfig}
            >
              <option value={10}>10 Hz (Bajo consumo de datos - 20 KB/s)</option
              >
              <option value={15}
                >15 Hz (Recomendado - Fluido y ligero - 35 KB/s)</option
              >
              <option value={20}>20 Hz (Alta fidelidad - 50 KB/s)</option>
            </select>
            <span class="text-[10px] text-muted"
              >Frecuencia de refresco para los espectadores e ingenieros.</span
            >
          </label>
        </div>
      </div>
    {/if}
  </div>

  {/if}

  {#if settingsTab === "shortcuts" || settingsTab === "all"}
  <!-- =========================================================================
       MODO HUD LIMPIO / PÁNICO + EXPORTAR / IMPORTAR PERFIL COMPLETO (.mdtprofile)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <span class="text-base">📦</span>
        <div>
          <div class="font-semibold text-fg">
            Modo HUD Limpio y Copia de Seguridad (.mdtprofile)
          </div>
          <div class="text-xs text-muted">
            Oculta temporalmente los widgets secundarios en carrera y
            guarda/comparte tu configuración completa en un solo archivo.
          </div>
        </div>
      </div>
    </div>

    <div class="divide-y divide-line">
      <div class="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div class="font-medium text-fg">
            🛡️ Tecla Modo "HUD Limpio / Pánico"
          </div>
          <div class="text-xs text-muted">
            Pulsa esta tecla en pista para dejar solo lo esencial (Radar,
            Dashboard/Marcha, Banderas y Spotter). Pulsa de nuevo para restaurar
            todo.
          </div>
        </div>
        <input
          type="text"
          class="field w-32 text-center font-mono text-xs font-bold"
          value={g.panicModeKey || "F10"}
          onkeydown={(e) => {
            e.preventDefault();
            g.panicModeKey =
              e.key === "Escape" || e.key === "Backspace" ? "F10" : e.key;
            saveConfig();
          }}
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div class="font-medium text-fg">
            Exportar / Importar configuración completa
          </div>
          <div class="text-xs text-muted">
            Incluye todos tus perfiles de HUD, posiciones, tamaños, tema visual,
            spotter y todos tus diseños de Dash Studio.
          </div>
          {#if profileMsg}
            <div class="mt-1.5 text-xs font-semibold text-accent">
              {profileMsg}
            </div>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <input
            bind:this={profileImportInput}
            type="file"
            accept=".mdtprofile,.json"
            class="hidden"
            onchange={handleImportProfile}
          />
          <button
            type="button"
            class="btn btn-primary px-3 py-1.5 text-xs"
            onclick={handleExportProfile}
          >
            ⬇️ Exportar .mdtprofile
          </button>
          <button
            type="button"
            class="btn px-3 py-1.5 text-xs"
            onclick={() => profileImportInput?.click()}
          >
            ⬆️ Importar .mdtprofile
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- =========================================================================
       ATAJOS DE TECLADO GLOBALES (CONFIGURABLES)
       ========================================================================= -->
  <div class="mb-6 card overflow-hidden text-sm">
    <div
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3"
    >
      <div class="flex items-center gap-2.5">
        <span class="text-base">⌨️</span>
        <div>
          <div class="font-semibold text-fg">
            Atajos de Teclado Globales (Configurables)
          </div>
          <div class="text-xs text-muted">
            Funcionan en caliente incluso con Le Mans Ultimate en primer plano a
            pantalla completa.
          </div>
        </div>
      </div>
      <button
        class="btn text-xs bg-surface-3 hover:bg-line text-fg"
        onclick={resetShortcuts}
        title="Restablece las combinaciones de teclas a sus valores recomendados por defecto"
      >
        ↺ Restablecer atajos por defecto
      </button>
    </div>

    <div class="p-4 grid gap-4 sm:grid-cols-2">
      <!-- 1. Modo Edición -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/40 p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg">Modo Edición del HUD</span>
          <span class="text-[10px] font-mono text-muted"
            >Mover y redimensionar</span
          >
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F9"
          bind:value={sc.editMode}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Activa o desactiva el arrastre y reposicionamiento de widgets.</span
        >
      </div>

      <!-- 2. Mostrar / Ocultar Overlay -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/40 p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg"
            >Mostrar / Ocultar Overlay</span
          >
          <span class="text-[10px] font-mono text-muted"
            >Visibilidad en juego</span
          >
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F10"
          bind:value={sc.toggleOverlay}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Oculta o muestra instantáneamente todos los widgets en pantalla.</span
        >
      </div>

      <!-- 3. Silenciar / Activar Spotter -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/40 p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg"
            >Silenciar / Activar Spotter</span
          >
          <span class="text-[10px] font-mono text-muted">Radio de voz</span>
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F8"
          bind:value={sc.toggleSpotter}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Silencia o activa temporalmente las locuciones de voz del spotter.</span
        >
      </div>

      <!-- 4. Siguiente Perfil de HUD -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/40 p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg"
            >Cambiar al Siguiente Perfil</span
          >
          <span class="text-[10px] font-mono text-muted"
            >Rotación de perfiles</span
          >
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F7"
          bind:value={sc.nextProfile}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Alterna en caliente entre tus perfiles de HUD guardados.</span
        >
      </div>

      <!-- 5. Alternar Modo Broadcast -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/40 p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg">Alternar Modo Broadcast</span>
          <span class="text-[10px] font-mono text-muted"
            >Retransmisión TV / Stream</span
          >
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F6"
          bind:value={sc.toggleBroadcast}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Cambia al perfil de broadcast y mantiene el HUD activo para OBS.</span
        >
      </div>

      <!-- 6. Reenfocar al Coche del Jugador -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/40 p-3"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg"
            >Reenfocar al Coche del Jugador</span
          >
          <span class="text-[10px] font-mono text-muted"
            >Reset foco de telemetría</span
          >
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F5"
          bind:value={sc.resetFocus}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Devuelve el foco del HUD a tu vehículo si estabas inspeccionando a un
          rival.</span
        >
      </div>

      <!-- 7. Editor FX en Juego (Panel Flotante DirectX 11) -->
      <div
        class="flex flex-col gap-1.5 rounded-lg border border-accent/35 bg-accent/5 p-3 sm:col-span-2"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-fg"
            >🎛️ Editor FX en Juego (MDT-FX Flotante)</span
          >
          <span class="text-[10px] font-mono text-accent"
            >Ajustar shaders sobre LMU sin Alt-Tab</span
          >
        </div>
        <input
          type="text"
          class="field font-mono text-xs text-accent font-bold"
          placeholder="Ctrl+Shift+F4"
          bind:value={sc.fxEditor}
          oninput={saveConfig}
        />
        <span class="text-[10px] text-muted"
          >Abre o cierra el panel flotante de edición de shaders MDT-FX directamente encima de Le Mans Ultimate.</span
        >
      </div>
    </div>
  </div>
  {/if}

  {#if settingsTab === "general" || settingsTab === "all"}
  <div class="divide-y divide-line card text-sm">
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">
          Compañeros de equipo MDT (Resaltado en pista)
        </div>
        <div class="text-muted">
          Nombres de pilotos o tags de equipo separados por comas. Se resaltan
          con el toro de MDT en Clasificación, Relativo y Mapa.
        </div>
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
        <div class="text-muted">
          Elige un tema predefinido o personaliza el color de acento, borde y
          fondo.
        </div>
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
        <div class="text-muted">
          Velocidad, temperatura, presión y combustible.
        </div>
      </div>
      <select class="field" bind:value={g.units} onchange={saveConfig}>
        <option value="metric">Métrico (km/h, °C, kPa, L)</option>
        <option value="imperial">Imperial (mph, °F, psi, gal)</option>
      </select>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Monitor del overlay</div>
        <div class="text-muted">
          Pantalla donde se muestran los widgets. Elige aquella en la que
          ejecutas Le Mans Ultimate.
        </div>
      </div>
      <select
        class="field"
        bind:value={g.monitor}
        onchange={saveConfig}
        onfocus={refreshMonitors}
      >
        <option value="">Monitor principal</option>
        <option value="__all__">🖥️ Todos los monitores (Multi-pantalla)</option>
        {#each monitors as m (m.name)}
          <option value={m.name}>{monitorLabel(m)}</option>
        {/each}
        {#if g.monitor && !monitors.some((m) => m.name === g.monitor)}
          <option value={g.monitor}
            >{g.monitor} (no conectado, usando principal)</option
          >
        {/if}
      </select>
    </div>
    <div class="flex flex-col gap-3 p-4 bg-accent/5 border-l-2 border-accent">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium text-fg flex items-center gap-2">
            <span>📺 Modo Broadcast (Espectador / Streaming)</span>
            <span
              class="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent"
              >NUEVO</span
            >
          </div>
          <div class="text-xs text-muted">
            Mantiene el HUD y overlay interactivos y siempre visibles en
            streaming/repetición, cargando la telemetría del coche enfocado.
          </div>
        </div>
        <Toggle
          checked={Boolean(g.broadcastMode)}
          label="Modo Broadcast"
          onchange={(v) => toggleBroadcastMode(v)}
        />
      </div>

      {#if g.broadcastMode}
        <div
          class="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs"
        >
          <span class="font-semibold text-accent uppercase tracking-wider"
            >Perfil activo de Broadcast:</span
          >
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
            Consejo: Haz clic en cualquier piloto de la clasificación en el
            overlay para enfocar la cámara y mostrar su telemetría.
          </span>
        </div>
      {/if}
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Ocultar overlay fuera de pista</div>
        <div class="text-muted">
          Mostrar widgets solo mientras conduces (siempre visibles en el editor
          de diseño).
        </div>
      </div>
      <Toggle
        checked={g.onlyOnTrack}
        label="Ocultar fuera de pista"
        onchange={(v) => {
          g.onlyOnTrack = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Transición animada al cambiar de perfil</div>
        <div class="text-muted">
          Efecto escalonado suave (estilo TV) al rotar perfiles de HUD o
          alternar Modo Broadcast.
        </div>
      </div>
      <Toggle
        checked={g.animateProfileSwitch ?? true}
        label="Transición al cambiar perfil"
        onchange={(v) => {
          g.animateProfileSwitch = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3 p-4">
      <div class="min-w-0">
        <div class="font-medium">📺 Alertas de Broadcast Estilo TV (Lower Thirds automáticos)</div>
        <div class="text-muted">
          Dispara una gráfica televisiva animada de 5 s al marcar vuelta rápida, entrar en podio, entrar a boxes o salir Full Course Yellow.
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn bg-accent/20 border border-accent/40 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
          onclick={() => {
            if (isNativeTauri()) void emit("test-broadcast-alert");
          }}
        >
          ▶ Probar alerta TV
        </button>
        <Toggle
          checked={g.broadcastAlerts ?? true}
          label="Alertas Broadcast TV"
          onchange={(v) => {
            g.broadcastAlerts = v;
            saveConfig();
          }}
        />
      </div>
    </div>
    <!-- Centro de Animaciones HUD Opcionales (#1, #2, #3, #4, #7, #8) -->
    <div class="flex flex-col gap-3 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="font-medium">✨ Centro de Animaciones HUD (Todas opcionales)</div>
          <div class="text-muted text-xs">
            Activa o desactiva cada efecto visual de telemetría de forma independiente para adaptarlo a tu gusto.
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="btn bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500 hover:text-black cursor-pointer"
            onclick={() => {
              if (isNativeTauri()) void emit("test-checkered-banner");
            }}
          >
            🏁 Probar Bandera
          </button>
          <button
            type="button"
            class="btn bg-cyan-500/15 border border-cyan-500/40 px-2.5 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500 hover:text-black cursor-pointer"
            onclick={() => {
              if (isNativeTauri()) void emit("test-pitstop-anim");
            }}
          >
            🔧 Probar Pit Stop
          </button>
          <button
            type="button"
            class="btn bg-red-500/15 border border-red-500/40 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500 hover:text-white cursor-pointer"
            onclick={() => {
              if (isNativeTauri()) void emit("test-start-lights");
            }}
          >
            🚦 Probar Semáforo
          </button>
          <button
            type="button"
            class="btn bg-rose-500/15 border border-rose-500/40 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500 hover:text-white cursor-pointer"
            onclick={() => {
              if (isNativeTauri()) void emit("test-penalty-alert");
            }}
          >
            ⚠️ Probar Sanción
          </button>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {#each [
          { key: "standingsOvertake", title: "Adelantamientos en Clasificación", desc: "Destello verde/rojo con salto suave y badge ▲+N / ▼-N al cambiar posición." },
          { key: "dashboardGForcePulse", title: "Pulso G-Force en Dashboard", desc: "Borde rojo/ámbar en frenadas fuertes y brillo cian al acelerar a fondo." },
          { key: "sectorSweepFlash", title: "Barrido de Sectores Morado / Verde", desc: "Destello de luz al cerrar sectores récord o personales en Delta y Tiempos." },
          { key: "checkeredBanner", title: "Banner Bandera a Cuadros / Podio", desc: "Gráfica superior cinematográfica con cinta a cuadros al cruzar meta." },
          { key: "liveMicWaveform", title: "Ondas Reales del Micrófono (PTT)", desc: "Las barras del Team Radio reaccionan al volumen real de tu voz al hablar." },
          { key: "pitStopLiveAnim", title: "Animación de Pit Stop en Vivo", desc: "Panel con crono parado, cambio de las 4 ruedas y barra de repostaje/VE." },
          { key: "startLightsAnim", title: "Semáforo de Salida TV (5 Luces)", desc: "Barra superior sincronizada con las luces rojas y el apagado de salida." },
          { key: "absTcLockupPulse", title: "Pulso ABS / TC / Bloqueo", desc: "Destello reactivo en las ruedas y chips cuando actúa el ABS o el TC." },
          { key: "liftAndCoastAnim", title: "Animación Lift & Coast Dinámica", desc: "Aviso luminoso animado en el Dashboard al entrar en zona de levantar el pie." },
          { key: "dayNightTransition", title: "Transición Día → Atardecer → Noche", desc: "Brillo ambiental suave en el HUD adaptado a la hora del circuito." },
          { key: "penaltyAlertAnim", title: "Alerta Animada de Sanción", desc: "Tarjeta pulsante de Dirección de Carrera para Drive-Through y Stop & Go." },
          { key: "ersFlowAnim", title: "Flujo de Energía Híbrida / ERS", desc: "Corriente animada avanzando en Empuje y retrocediendo al Regenerar." },
          { key: "lapInvalidShake", title: "Sacudida de Vuelta Invalidada", desc: "Shake horizontal y flash rojo al anular vuelta por Track Limits." },
          { key: "electronicsPopupAnim", title: "Pop-up Volante de Electrónica", desc: "Tarjeta flotante con rebote al ajustar TC, ABS, BB, Map o ARB." },
        ] as item (item.key)}
          <div class="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-surface-2/60 px-3 py-2">
            <div class="min-w-0">
              <div class="text-xs font-semibold text-fg">{item.title}</div>
              <div class="text-[11px] text-muted leading-snug">{item.desc}</div>
            </div>
            <Toggle
              checked={g.animations?.[item.key as keyof NonNullable<typeof g.animations>] ?? true}
              label={item.title}
              onchange={(v) => {
                if (!g.animations) {
                  g.animations = {
                    standingsOvertake: true,
                    dashboardGForcePulse: true,
                    sectorSweepFlash: true,
                    checkeredBanner: true,
                    liveMicWaveform: true,
                    pitStopLiveAnim: true,
                    startLightsAnim: true,
                    absTcLockupPulse: true,
                    liftAndCoastAnim: true,
                    dayNightTransition: true,
                    penaltyAlertAnim: true,
                    ersFlowAnim: true,
                    lapInvalidShake: true,
                    electronicsPopupAnim: true,
                  };
                }
                (g.animations as Record<string, boolean>)[item.key] = v;
                saveConfig();
              }}
            />
          </div>
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3 p-4">
      <div class="min-w-0">
        <div class="font-medium">Animación de arranque al salir a pista</div>
        <div class="text-muted">
          Efecto cinematográfico estilo encendido de coche al detectar que sales
          a pista (5 estilos).
        </div>
      </div>
      <div class="flex items-center gap-2">
        <select
          class="field py-1.5 text-xs"
          value={g.trackEntryAnim ?? "ignition"}
          onchange={(e) => {
            g.trackEntryAnim = e.currentTarget.value as TrackEntryAnim;
            saveConfig();
            if (isNativeTauri()) void emit("test-track-entry-anim");
          }}
        >
          {#each TRACK_ENTRY_ANIMS as a (a.value)}
            <option value={a.value}>{a.label}</option>
          {/each}
        </select>
        <button
          type="button"
          class="btn bg-accent/20 border border-accent/40 px-2.5 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-white cursor-pointer"
          onclick={() => {
            if (isNativeTauri()) void emit("test-track-entry-anim");
          }}
          title="Ver ahora la animación de arranque en el overlay"
        >
          ▶ Probar
        </button>
      </div>
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Sonido de encendido al salir a pista</div>
        <div class="text-muted">
          Reproduce un sutil efecto electrónico de arranque sincronizado con la
          animación elegida.
        </div>
      </div>
      <Toggle
        checked={g.trackEntrySound ?? true}
        label="Sonido de encendido"
        onchange={(v) => {
          g.trackEntrySound = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">Modo Qualy / Hotlap automático (Opcional)</div>
        <div class="text-muted">
          En Clasificación oculta automáticamente widgets de resistencia
          (combustible, stint, clasificación) dejando solo pilotaje puro.
        </div>
      </div>
      <Toggle
        checked={Boolean(g.autoQualyMode)}
        label="Modo Qualy automático"
        onchange={(v) => {
          g.autoQualyMode = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">
          Luces ambientales perimetrales en pantalla (Opcional)
        </div>
        <div class="text-muted">
          Ilumina suavemente los bordes de la pantalla con bandera
          amarilla/azul, coche en paralelo (izq./der.) y aviso de cambio de
          marcha.
        </div>
      </div>
      <Toggle
        checked={Boolean(g.ambientEdgeLighting)}
        label="Ambient Edge Lighting"
        onchange={(v) => {
          g.ambientEdgeLighting = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium">
            Perfiles automáticos por categoría de coche
          </div>
          <div class="text-muted">
            Cambia automáticamente al perfil de overlay adecuado al subirte a un
            Hypercar, LMP2, LMP3 o LMGT3.
          </div>
        </div>
        <Toggle
          checked={Boolean(g.autoProfileByClass)}
          label="Perfiles por categoría"
          onchange={(v) => {
            g.autoProfileByClass = v;
            if (!g.classProfiles)
              g.classProfiles = { Hypercar: "", LMP2: "", LMP3: "", LMGT3: "" };
            saveConfig();
          }}
        />
      </div>
      {#if g.autoProfileByClass}
        <div
          class="grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-surface-2/50 p-3 sm:grid-cols-4"
        >
          {#each ["Hypercar", "LMP2", "LMP3", "LMGT3"] as cls (cls)}
            <label class="flex flex-col gap-1 text-xs">
              <span class="font-bold text-muted">{cls}</span>
              <select
                class="field py-1 text-xs"
                value={g.classProfiles?.[cls] ?? ""}
                onchange={(e) => {
                  if (!g.classProfiles) g.classProfiles = {};
                  g.classProfiles[cls] = e.currentTarget.value;
                  saveConfig();
                }}
              >
                <option value="">(Sin cambio)</option>
                {#each Object.entries(config.value.profiles) as [pid, prof] (pid)}
                  <option value={pid}>{prof.name}</option>
                {/each}
              </select>
            </label>
          {/each}
        </div>
      {/if}
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">
          Guías magnéticas de alineación (Smart Snap)
        </div>
        <div class="text-muted">
          Muestra líneas guía cian e imanta los widgets entre sí y con el centro
          de pantalla al editar.
        </div>
      </div>
      <Toggle
        checked={g.smartGuides ?? true}
        label="Guías magnéticas"
        onchange={(v) => {
          g.smartGuides = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between gap-6">
        <div>
          <div class="font-medium">
            🌙 Modo Noche automático (Baja luminosidad)
          </div>
          <div class="text-muted">
            Atenúa automáticamente la opacidad del HUD cuando anochece en
            circuito (20:30 – 06:30 en juego).
          </div>
        </div>
        <Toggle
          checked={Boolean(g.autoNightDim)}
          label="Modo Noche automático"
          onchange={(v) => {
            g.autoNightDim = v;
            saveConfig();
          }}
        />
      </div>
      {#if g.autoNightDim}
        <div
          class="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs"
        >
          <span class="text-muted font-medium">Opacidad durante la noche</span>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="35"
              max="95"
              step="5"
              value={Math.round((g.nightOpacity ?? 0.68) * 100)}
              oninput={(e) => {
                g.nightOpacity = Number(e.currentTarget.value) / 100;
                saveConfig();
              }}
              class="accent-accent w-32 cursor-pointer"
            />
            <span class="w-10 text-right font-mono font-bold text-fg"
              >{Math.round((g.nightOpacity ?? 0.68) * 100)}%</span
            >
          </div>
        </div>
      {/if}
    </div>
    <div class="flex items-center justify-between p-4">
      <div>
        <div class="font-medium">
          Ocultar overlay cuando el juego no está en primer plano
        </div>
        <div class="text-muted">
          Oculta los widgets al hacer Alt+Tab a otra ventana.
        </div>
      </div>
      <Toggle
        checked={g.hideUnfocused}
        label="Ocultar sin foco"
        onchange={(v) => {
          g.hideUnfocused = v;
          saveConfig();
        }}
      />
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Tasa de refresco del overlay</div>
        <div class="text-muted">
          Actualizaciones por segundo enviadas a los widgets.
        </div>
      </div>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="10"
          max="60"
          step="5"
          bind:value={g.updateHz}
          oninput={saveConfig}
          class="accent-accent"
        />
        <span class="w-12 text-right tnum">{g.updateHz} Hz</span>
      </div>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Ajuste a cuadrícula (Grid snap)</div>
        <div class="text-muted">Salto en píxeles al arrastrar widgets.</div>
      </div>
      <div class="flex items-center gap-3">
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          bind:value={g.snap}
          oninput={saveConfig}
          class="accent-accent"
        />
        <span class="w-12 text-right tnum">{g.snap} px</span>
      </div>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">🚀 Iniciar automáticamente con Windows</div>
        <div class="text-muted">
          Arranca MDT-HUD al encender el PC para que el overlay y servidor móvil
          estén siempre listos.
        </div>
      </div>
      <Toggle
        checked={autoStartEnabled}
        label="Iniciar con Windows"
        onchange={toggleAutoStart}
      />
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">
          📥 Minimizar a la bandeja del sistema al cerrar
        </div>
        <div class="text-muted">
          Al pulsar la X, la app queda en segundo plano junto al reloj de
          Windows (clic derecho en el icono para salir).
        </div>
      </div>
      <Toggle
        checked={Boolean(g.minimizeToTray)}
        label="Minimizar a bandeja"
        onchange={(v) => {
          g.minimizeToTray = v;
          saveConfig();
        }}
      />
    </div>

    <!-- #19 Botones del Volante para Acciones Globales -->
    <div class="p-4">
      <div class="mb-1 flex items-center justify-between">
        <div>
          <div class="font-medium">
            🎮 Botones del Volante para Acciones Globales
          </div>
          <div class="text-muted">
            Asigna botones físicos de tu volante (o teclado) para controlar
            MDT-HUD mientras conduces en pantalla completa.
          </div>
        </div>
        {#if wheelControl.learning && wheelControl.learning !== "next" && wheelControl.learning !== "prev"}
          <button
            type="button"
            class="btn text-xs text-warn"
            onclick={() => wheelControl.cancelLearning()}
          >
            Cancelar escucha...
          </button>
        {/if}
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        {#each WHEEL_GLOBAL_ACTIONS as act (act.id)}
          {@const isLearning = wheelControl.learning === act.id}
          {@const currentBind = wheelControl.actionBinds[act.id]}
          <div
            class="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/60 p-2.5 text-xs"
          >
            <div class="min-w-0">
              <div class="font-semibold text-fg">{act.label}</div>
              <div class="truncate text-[11px] text-muted">
                {wheelControl.formatBinding(currentBind)}
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class={[
                  "btn px-2 py-1 text-[11px] cursor-pointer",
                  isLearning
                    ? "bg-warn text-black animate-pulse font-bold"
                    : "btn-primary",
                ]}
                onclick={() =>
                  isLearning
                    ? wheelControl.cancelLearning()
                    : wheelControl.startLearning(act.id)}
              >
                {isLearning ? "Pulsa botón..." : "Asignar"}
              </button>
              {#if currentBind}
                <button
                  type="button"
                  class="rounded bg-white/10 px-1.5 py-1 text-[10px] text-muted hover:text-white cursor-pointer"
                  title="Quitar asignación"
                  onclick={() => wheelControl.clearActionBind(act.id)}>✕</button
                >
              {/if}
            </div>
          </div>
        {/each}
      </div>
      {#if wheelControl.telemetryMarks.length > 0}
        <div
          class="mt-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-[11px]"
        >
          <span class="font-bold text-accent-hi"
            >📌 Últimas marcas de volante:</span
          >
          <span class="ml-2 font-mono text-muted">
            {wheelControl.telemetryMarks
              .slice(0, 5)
              .map((m) => m.time)
              .join(" · ")}
          </span>
        </div>
      {/if}
    </div>

    <div class="p-4">
      <div class="font-medium">Carpeta de datos</div>
      <div class="mt-1 font-mono text-xs break-all text-muted">
        {live.status.dataDir}
      </div>
      <div class="mt-1 text-muted">
        Las vueltas se guardan localmente en <code>laps.db</code> (SQLite) dentro
        de esta carpeta.
      </div>
    </div>
    <div class="flex items-center justify-between gap-6 p-4">
      <div>
        <div class="font-medium">Mostrar novedades tras actualizar</div>
        <div class="text-muted">
          Muestra qué ha cambiado al abrir una versión nueva por primera vez.
        </div>
      </div>
      <Toggle
        checked={g.showChangelog}
        label="Mostrar novedades"
        onchange={(v) => {
          g.showChangelog = v;
          saveConfig();
        }}
      />
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
            <span title={updater.error}
              >No se pudo comprobar si hay actualizaciones.</span
            >
          {:else}
            Las actualizaciones se comprueban automáticamente al iniciar
            MDT-HUD.
          {/if}
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-2">
        <button
          class="btn"
          disabled={!updater.version}
          onclick={() => (updater.changelogOpen = true)}>Ver novedades</button
        >
        {#if updater.phase === "available"}
          <button class="btn btn-primary font-bold" onclick={installUpdate}
            >Instalar y reiniciar</button
          >
        {:else if updater.phase === "outdated"}
          <button
            class="btn btn-primary font-bold"
            onclick={downloadLatestRelease}
            >⬇️ Descargar e Instalar v{updater.available}</button
          >
        {:else}
          <button
            class="btn"
            disabled={updater.phase === "checking" ||
              updater.phase === "downloading"}
            onclick={checkForUpdate}
          >
            Buscar actualizaciones
          </button>
        {/if}
      </div>
    </div>

    <!-- Canal Beta & Rollback a versión estable v1.0.7 -->
    <div
      class="border-t border-line bg-surface-2/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
    >
      <div>
        <div class="font-semibold text-fg flex items-center gap-1.5">
          <span>🧪</span>
          <span>Versión 1.0.9 (Beta de Telemetría en Vivo & Pitwall)</span>
        </div>
        <div class="text-muted mt-0.5">
          Si experimentas problemas durante la beta o prefieres la versión
          anterior, puedes reinstalar la 1.0.7 estable en cualquier momento.
        </div>
      </div>
      <a
        class="btn bg-surface-3 hover:bg-surface-2 text-fg border border-line flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold text-xs transition-colors shadow-sm"
        href="https://github.com/mediterraneanmotorsport/MDT-HUD/releases/download/v1.0.7/MDT-HUD_1.0.7_x64-setup.exe"
        target="_blank"
        rel="noopener noreferrer"
        title="Descargar e instalar versión estable oficial v1.0.7"
      >
        <span>🔙</span>
        <span>Volver a v1.0.7 (Estable)</span>
      </a>
    </div>
  </div>
  {/if}

  <div class="mt-6 flex items-center justify-between gap-4 card p-4 text-sm">
    <div class="flex items-center gap-3">
      <img src="/mdt-logo.png" alt="MDT" class="h-10 w-auto object-contain" />
      <div>
        <div class="font-semibold text-fg">
          Mediterranean Motorsport · MDT-HUD
        </div>
        <div class="text-xs text-muted">
          Repositorio oficial y actualizaciones automáticas en GitHub.
        </div>
      </div>
    </div>
    {#if starError}
      <span class="select-text text-xs break-words text-bad" role="alert"
        >{REPO_URL}</span
      >
    {:else}
      <button class="btn shrink-0" onclick={star}>Abrir GitHub</button>
    {/if}
  </div>
</div>
