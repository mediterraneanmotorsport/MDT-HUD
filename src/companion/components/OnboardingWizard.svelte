<script lang="ts">
  import { onMount } from "svelte";
  import { api, isNativeTauri } from "../../lib/api";
  import { config, createMdtTemplateProfile, saveConfig, type Units } from "../../lib/config.svelte";
  import { generateQrMatrix } from "../../lib/qr";
  import { toasts } from "../../lib/toasts.svelte";
  import type { MonitorInfo } from "../../lib/types";
  import { wheelControl } from "../../lib/wheelControl.svelte";

  let {
    open = $bindable(false),
  }: {
    open: boolean;
  } = $props();

  let step = $state(0);
  let monitors = $state<MonitorInfo[]>([]);
  let chosenTemplate = $state<"competicion" | "broadcast" | "minimalista" | "keep">("keep");

  const qrMatrix = $derived(generateQrMatrix(wheelControl.mobileUrl));

  onMount(async () => {
    if (isNativeTauri()) {
      monitors = await api.listMonitors().catch(() => []);
    }
  });

  function setUnits(u: Units) {
    config.value.general.units = u;
    saveConfig();
  }

  function setMonitor(name: string) {
    config.value.general.monitor = name;
    saveConfig();
    if (isNativeTauri()) void api.setOverlayMonitor(name);
  }

  function finish() {
    if (chosenTemplate !== "keep") {
      createMdtTemplateProfile(chosenTemplate);
    }
    try {
      localStorage.setItem("mdt_onboarding_done_v1", "true");
    } catch {}
    open = false;
    toasts.push("¡MDT-HUD configurado y listo para pista!", { kind: "success" });
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
    <div class="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-accent/45 bg-[#0b1320] shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 bg-black/40 px-5 py-4">
        <div class="flex items-center gap-3">
          <img src="/mdt-logo.png" alt="MDT" class="h-8 w-8 object-contain" />
          <div>
            <div class="font-display text-base font-black text-white">Asistente de Inicio · MDT-HUD</div>
            <div class="text-[11px] text-white/55">Paso {step + 1} de 4 · Configuración rápida en 30 segundos</div>
          </div>
        </div>
        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white cursor-pointer"
          onclick={finish}
        >Omitir</button>
      </div>

      <!-- Progress bar -->
      <div class="h-1 w-full bg-white/10">
        <div class="h-full bg-accent transition-all duration-300" style:width="{((step + 1) / 4) * 100}%"></div>
      </div>

      <!-- Body -->
      <div class="p-6 text-sm">
        {#if step === 0}
          <h3 class="font-display text-lg font-black text-white">1. Elige tus unidades de telemetría</h3>
          <p class="mt-1 text-xs text-white/60">Puedes cambiarlas en cualquier momento desde Ajustes.</p>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              class={[
                "rounded-xl border p-4 text-left transition cursor-pointer",
                config.value.general.units === "metric" ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-black/35 text-white/70 hover:bg-white/5",
              ]}
              onclick={() => setUnits("metric")}
            >
              <div class="font-display text-base font-black">🇪🇺 Métrico (WEC)</div>
              <div class="mt-1 text-xs opacity-70">km/h · °C · kPa · Litros</div>
            </button>
            <button
              type="button"
              class={[
                "rounded-xl border p-4 text-left transition cursor-pointer",
                config.value.general.units === "imperial" ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-black/35 text-white/70 hover:bg-white/5",
              ]}
              onclick={() => setUnits("imperial")}
            >
              <div class="font-display text-base font-black">🇺🇸 Imperial</div>
              <div class="mt-1 text-xs opacity-70">mph · °F · PSI · Galones</div>
            </button>
          </div>

        {:else if step === 1}
          <h3 class="font-display text-lg font-black text-white">2. Selecciona el monitor del Overlay</h3>
          <p class="mt-1 text-xs text-white/60">Recuerda ejecutar Le Mans Ultimate en modo Ventana sin bordes (Borderless).</p>
          <div class="mt-4 space-y-2">
            <button
              type="button"
              class={[
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition cursor-pointer",
                config.value.general.monitor === "" ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-black/35 text-white/75 hover:bg-white/5",
              ]}
              onclick={() => setMonitor("")}
            >
              <span class="font-bold">Monitor Principal (Recomendado)</span>
              <span class="text-xs text-accent">Por defecto</span>
            </button>
            {#each monitors as m (m.name)}
              <button
                type="button"
                class={[
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition cursor-pointer",
                  config.value.general.monitor === m.name ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-black/35 text-white/75 hover:bg-white/5",
                ]}
                onclick={() => setMonitor(m.name)}
              >
                <span class="font-bold">{m.name} {m.primary ? "(Principal)" : ""}</span>
                <span class="font-mono text-xs text-white/60">{m.width}×{m.height}</span>
              </button>
            {/each}
            <button
              type="button"
              class={[
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition cursor-pointer",
                config.value.general.monitor === "__all__" ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-black/35 text-white/75 hover:bg-white/5",
              ]}
              onclick={() => setMonitor("__all__")}
            >
              <span class="font-bold">Todos los monitores (Triple Screen)</span>
              <span class="text-xs text-white/60">Multimonitor</span>
            </button>
          </div>

        {:else if step === 2}
          <h3 class="font-display text-lg font-black text-white">3. Plantilla inicial de Overlays</h3>
          <p class="mt-1 text-xs text-white/60">Elige cómo quieres empezar (siempre puedes personalizarlo luego con Ctrl+Shift+F9).</p>
          <div class="mt-4 grid grid-cols-2 gap-2.5">
            {#each [
              { id: "keep", icon: "✓", title: "Mantener actual", desc: "Conserva tu distribución actual" },
              { id: "competicion", icon: "🏎️", title: "Competición Pro", desc: "Dashboard, Radar, Relativo, Fuel, Delta y Mapa" },
              { id: "minimalista", icon: "⚡", title: "Minimalista", desc: "Limpio y despejado para VR / inmersión" },
              { id: "broadcast", icon: "📺", title: "Broadcast TV", desc: "Torre de tiempos, ticker y duelos de retransmisión" },
            ] as tpl (tpl.id)}
              <button
                type="button"
                class={[
                  "rounded-xl border p-3 text-left transition cursor-pointer",
                  chosenTemplate === tpl.id ? "border-accent bg-accent/20 text-white" : "border-white/10 bg-black/35 text-white/75 hover:bg-white/5",
                ]}
                onclick={() => (chosenTemplate = tpl.id as typeof chosenTemplate)}
              >
                <div class="font-bold">{tpl.icon} {tpl.title}</div>
                <div class="mt-0.5 text-[11px] opacity-70">{tpl.desc}</div>
              </button>
            {/each}
          </div>

        {:else}
          <h3 class="font-display text-lg font-black text-white">4. Conecta tu Móvil o Tablet (Opcional)</h3>
          <p class="mt-1 text-xs text-white/60">Escanea el QR con la cámara de tu móvil en el mismo Wi-Fi para usar el DDU o el Pit Wall en tiempo real.</p>
          <div class="mt-4 flex items-center gap-4 rounded-xl border border-white/10 bg-black/40 p-4">
            <div class="shrink-0 rounded-lg bg-white p-2">
              <svg width="96" height="96" viewBox="0 0 {qrMatrix.length} {qrMatrix.length}">
                {#each qrMatrix as row, y}
                  {#each row as cell, x}
                    {#if cell}
                      <rect {x} {y} width="1" height="1" fill="#000" />
                    {/if}
                  {/each}
                {/each}
              </svg>
            </div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="truncate rounded bg-black/60 px-2.5 py-1.5 font-mono text-xs text-accent-hi">{wheelControl.mobileUrl}</div>
              {#if !wheelControl.firewallOpen}
                <button
                  type="button"
                  class="btn btn-primary text-xs"
                  onclick={() => wheelControl.openFirewall()}
                >🛡️ Abrir puerto 1420 en Firewall</button>
              {:else}
                <div class="text-xs font-bold text-emerald-400">✓ Puerto LAN 1420 abierto y listo</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between border-t border-white/10 bg-black/40 px-5 py-3">
        <button
          type="button"
          disabled={step === 0}
          class="rounded-lg border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-30 cursor-pointer"
          onclick={() => (step = Math.max(0, step - 1))}
        >← Anterior</button>

        {#if step < 3}
          <button
            type="button"
            class="rounded-lg bg-accent px-5 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
            onclick={() => (step += 1)}
          >Siguiente →</button>
        {:else}
          <button
            type="button"
            class="rounded-lg bg-emerald-500 px-5 py-1.5 text-xs font-black text-black hover:bg-emerald-400 cursor-pointer"
            onclick={finish}
          >✓ Empezar a correr</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
