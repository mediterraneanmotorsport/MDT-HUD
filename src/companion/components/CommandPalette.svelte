<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { api, isNativeTauri } from "../../lib/api";
  import {
    applyCompleteOverlayTheme,
    config,
    HUD_THEMES,
    saveConfig,
    switchProfile,
    type PresetThemeId,
  } from "../../lib/config.svelte";
  import { live } from "../../lib/live.svelte";
  import { toasts } from "../../lib/toasts.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import { nav, type Page } from "../nav.svelte";

  let {
    open = $bindable(false),
    onOpenOnboarding,
  }: {
    open: boolean;
    onOpenOnboarding: () => void;
  } = $props();

  let query = $state("");
  let activeIdx = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  interface CmdItem {
    id: string;
    group: string;
    label: string;
    hint?: string;
    icon: string;
    run: () => void;
  }

  function openExternalHash(hash: "#mobile" | "#pitwall") {
    const url = `http://localhost:1420/${hash}`;
    if (isNativeTauri() && location.port !== "1420") {
      openUrl(url).catch(() => window.open(url, "_blank"));
    } else {
      window.open(`/${hash}`, "_blank");
    }
  }

  const allCommands = $derived.by<CmdItem[]>(() => {
    const navItems: CmdItem[] = [
      { id: "nav-live", group: "Navegación", label: "Ir a En Vivo (Command Center)", icon: "📡", run: () => (nav.page = "live") },
      { id: "nav-overlays", group: "Navegación", label: "Ir a Overlays", icon: "🧩", run: () => (nav.page = "overlays") },
      { id: "nav-dashstudio", group: "Navegación", label: "Ir a Dash Studio Pro", icon: "🎨", run: () => (nav.page = "dashstudio") },
      { id: "nav-sessions", group: "Navegación", label: "Ir a Sesiones", icon: "📋", run: () => (nav.page = "sessions") },
      { id: "nav-analysis", group: "Navegación", label: "Ir a Análisis de Telemetría", icon: "📈", run: () => (nav.page = "analysis") },
      { id: "nav-records", group: "Navegación", label: "Ir a Récords Personales", icon: "🏆", run: () => (nav.page = "records") },
      { id: "nav-schedule", group: "Navegación", label: "Ir a Horarios LMU", icon: "📅", run: () => (nav.page = "schedule") },
      { id: "nav-settings", group: "Navegación", label: "Ir a Ajustes", icon: "⚙️", run: () => (nav.page = "settings") },
    ];

    const actionItems: CmdItem[] = [
      {
        id: "act-edit",
        group: "Acciones rápidas",
        label: live.status.editMode ? "Terminar edición del Overlay" : "Editar diseño del Overlay",
        hint: "Ctrl+Shift+F9",
        icon: "✏️",
        run: () => {
          void api.setEditMode(!live.status.editMode);
          toasts.push(live.status.editMode ? "Modo edición desactivado" : "Modo edición activado", { kind: "info" });
        },
      },
      {
        id: "act-vis",
        group: "Acciones rápidas",
        label: live.status.overlayVisible ? "Ocultar Overlay (Modo Pánico)" : "Mostrar Overlay",
        hint: "Ctrl+Shift+F10",
        icon: "👁️",
        run: () => {
          void api.setOverlayVisible(!live.status.overlayVisible);
          toasts.push(live.status.overlayVisible ? "Overlay ocultado" : "Overlay visible", { kind: "info" });
        },
      },
      {
        id: "act-demo",
        group: "Acciones rápidas",
        label: live.status.demo ? "Desactivar Modo Demostración" : "Activar Modo Demostración",
        icon: "🎮",
        run: () => {
          void api.setDemoMode(!live.status.demo);
          toasts.push(live.status.demo ? "Modo demo desactivado" : "Modo demo activado", { kind: "info" });
        },
      },
      {
        id: "act-spotter",
        group: "Acciones rápidas",
        label: config.value.spotter.enabled ? "Silenciar Spotter" : "Activar Spotter",
        hint: "Ctrl+Shift+F8",
        icon: "🎙️",
        run: () => {
          config.value.spotter.enabled = !config.value.spotter.enabled;
          saveConfig();
          toasts.push(config.value.spotter.enabled ? "Spotter activado" : "Spotter silenciado", { kind: "success" });
        },
      },
      {
        id: "act-pitwall",
        group: "Acciones rápidas",
        label: "Abrir Pit Wall en navegador (#pitwall)",
        icon: "📡",
        run: () => openExternalHash("#pitwall"),
      },
      {
        id: "act-mobile",
        group: "Acciones rápidas",
        label: "Abrir DDU Móvil en navegador (#mobile)",
        icon: "📱",
        run: () => openExternalHash("#mobile"),
      },
      {
        id: "act-copy-mobile",
        group: "Acciones rápidas",
        label: "Copiar enlace Wi-Fi del Móvil",
        hint: wheelControl.mobileUrl,
        icon: "🔗",
        run: () => {
          navigator.clipboard.writeText(wheelControl.mobileUrl).catch(() => {});
          toasts.push("Enlace móvil copiado", { desc: wheelControl.mobileUrl, kind: "success" });
        },
      },
      {
        id: "act-wizard",
        group: "Acciones rápidas",
        label: "Abrir Asistente de Configuración Inicial",
        icon: "✨",
        run: () => onOpenOnboarding(),
      },
    ];

    const profileItems: CmdItem[] = Object.entries(config.value.profiles).map(([id, prof]) => ({
      id: `prof-${id}`,
      group: "Perfiles de Overlay",
      label: `Cambiar a perfil: ${prof.name}`,
      hint: config.value.activeProfile === id ? "Activo" : undefined,
      icon: "🗂️",
      run: () => {
        switchProfile(id);
        toasts.push(`Perfil aplicado: ${prof.name}`, { kind: "success" });
      },
    }));

    const themeItems: CmdItem[] = Object.entries(HUD_THEMES).map(([id, t]) => ({
      id: `theme-${id}`,
      group: "Temas Visuales",
      label: `Aplicar tema: ${t.label}`,
      hint: t.subtitle,
      icon: "🎨",
      run: () => {
        applyCompleteOverlayTheme(id as PresetThemeId, true);
        wheelControl.setMobileTheme(id as PresetThemeId);
        toasts.push(`Tema aplicado: ${t.label}`, { kind: "success" });
      },
    }));

    return [...actionItems, ...navItems, ...profileItems, ...themeItems];
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands.slice(0, 14);
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        (c.hint?.toLowerCase().includes(q) ?? false),
    );
  });

  $effect(() => {
    if (open) {
      query = "";
      activeIdx = 0;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  $effect(() => {
    if (activeIdx >= filtered.length) activeIdx = Math.max(0, filtered.length - 1);
  });

  function exec(item: CmdItem) {
    open = false;
    item.run();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      open = false;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = filtered.length ? (activeIdx + 1) % filtered.length : 0;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = filtered.length ? (activeIdx - 1 + filtered.length) % filtered.length : 0;
    } else if (e.key === "Enter" && filtered[activeIdx]) {
      e.preventDefault();
      exec(filtered[activeIdx]);
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
    onclick={() => (open = false)}
  >
    <div
      class="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-accent/40 bg-[#0b1320] shadow-2xl"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
        <span class="text-base text-accent">⌘</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKey}
          placeholder="Buscar comando, pestaña, perfil o tema..."
          class="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        <kbd class="kbd text-[10px]">ESC</kbd>
      </div>

      <div class="max-h-[55vh] overflow-y-auto p-2">
        {#each filtered as item, idx (item.id)}
          <button
            type="button"
            class={[
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition cursor-pointer",
              idx === activeIdx ? "bg-accent text-white" : "text-white/85 hover:bg-white/10",
            ]}
            onmouseenter={() => (activeIdx = idx)}
            onclick={() => exec(item)}
          >
            <span class="text-sm">{item.icon}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate font-semibold">{item.label}</div>
              <div class={["text-[10px]", idx === activeIdx ? "text-white/80" : "text-white/45"]}>{item.group}</div>
            </div>
            {#if item.hint}
              <span class={["shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]", idx === activeIdx ? "bg-black/25 text-white" : "bg-white/10 text-white/60"]}>
                {item.hint}
              </span>
            {/if}
          </button>
        {:else}
          <div class="py-8 text-center text-xs text-white/45">Sin resultados para "{query}"</div>
        {/each}
      </div>

      <div class="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-2 text-[10px] text-white/45">
        <span>↑↓ Navegar · Enter Ejecutar</span>
        <span>Paleta de Comandos MDT-HUD</span>
      </div>
    </div>
  </div>
{/if}
