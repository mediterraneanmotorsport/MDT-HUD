<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { config, loadConfig, recoverWidgetsToPrimaryScreen, resetLayout, saveConfig, switchProfile, syncActiveProfile, WIDGETS } from "../lib/config.svelte";
  import { live, startLive } from "../lib/live.svelte";
  import { overlayLayout } from "../lib/overlayLayout.svelte";
  import { smartGuides } from "../lib/smartGuides.svelte";
  import { spotter } from "../lib/spotter.svelte";
  import { testAlert } from "../lib/testAlert.svelte";
  import SoftwareRepaint from "./SoftwareRepaint.svelte";
  import Logo from "../lib/Logo.svelte";
  import WidgetFrame from "./WidgetFrame.svelte";
  import { COMPONENTS } from "./widgets";

  let saveMessage = $state("");
  let demoStartedForEditing = $state(false);
  let widgetPickerOpen = $state(false);
  let widgetSearch = $state("");
  let selectedWidgetId = $state<string | null>(null);
  let panicMode = $state(false);
  let toolbarOffsetX = $state(0);
  let toolbarOffsetY = $state(0);
  let toolbarDrag: { px: number; py: number; ox: number; oy: number } | null = null;

  function onToolbarPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input")) return;
    toolbarDrag = { px: e.clientX, py: e.clientY, ox: toolbarOffsetX, oy: toolbarOffsetY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onToolbarPointerMove(e: PointerEvent) {
    if (!toolbarDrag) return;
    toolbarOffsetX = toolbarDrag.ox + (e.clientX - toolbarDrag.px);
    toolbarOffsetY = toolbarDrag.oy + (e.clientY - toolbarDrag.py);
  }

  function onToolbarPointerUp() {
    toolbarDrag = null;
  }

  const ESSENTIAL_WIDGETS = new Set(["customdash", "dashboard", "radar", "flags", "spotter", "rpm", "inputs"]);

  function handleOverlayKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    // Panic / Clean HUD Mode toggle (default F10)
    const panicKey = (config.value.general.panicModeKey || "F10").trim().toLowerCase();
    if (panicKey && (e.key.toLowerCase() === panicKey || e.code.toLowerCase() === panicKey)) {
      e.preventDefault();
      panicMode = !panicMode;
      return;
    }

    // Fine arrow-key positioning for selected widget in Edit Mode
    if (!edit || !selectedWidgetId) return;
    const cfg = effectiveWidgets[selectedWidgetId];
    if (!cfg || cfg.locked) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      cfg.x -= step;
      saveConfig();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      cfg.x += step;
      saveConfig();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cfg.y -= step;
      saveConfig();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      cfg.y += step;
      saveConfig();
    } else if (e.key === "Escape") {
      selectedWidgetId = null;
    }
  }

  function toggleWidgetInEdit(id: string, enable: boolean) {
    const cfg = effectiveWidgets[id];
    if (!cfg) return;
    cfg.enabled = enable;
    if (enable) {
      const maxW = overlayLayout.logicalPrimaryWidth || 1920;
      const maxH = overlayLayout.logicalPrimaryHeight || 1080;
      if (cfg.x < 0 || cfg.x > maxW - 80 || cfg.y < 0 || cfg.y > maxH - 60) {
        cfg.x = Math.round(maxW / 2 - 120);
        cfg.y = Math.round(maxH / 2 - 160);
      }
    }
    if (isBroadcastUrl && effectiveProfile && effectiveProfileId !== config.value.activeProfile) {
      effectiveProfile.widgets = effectiveWidgets;
    } else {
      syncActiveProfile();
    }
    saveConfig();
    const meta = WIDGETS.find((w) => w.id === id);
    saveMessage = enable ? `+ ${meta?.name ?? id}` : `✕ ${meta?.name ?? id}`;
    setTimeout(() => {
      if (saveMessage.endsWith(meta?.name ?? id)) saveMessage = "";
    }, 2000);
  }

  const filteredPickerWidgets = $derived.by(() => {
    const q = widgetSearch.trim().toLowerCase();
    return WIDGETS.filter((w) => {
      if (!q) return true;
      return w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q) || w.id.toLowerCase().includes(q);
    });
  });

  onMount(() => {
    startLive();
    loadConfig();
    overlayLayout.init();
    testAlert.init();
  });

  const edit = $derived(live.status.editMode);

  // If user exits edit mode, automatically turn off demo mode if it was activated for editing
  $effect(() => {
    if (!edit) {
      widgetPickerOpen = false;
      if (demoStartedForEditing && live.status.demo) {
        demoStartedForEditing = false;
        api.setDemoMode(false);
      }
    }
  });

  function toggleDemo() {
    if (live.status.demo) {
      demoStartedForEditing = false;
      api.setDemoMode(false);
    } else {
      demoStartedForEditing = true;
      api.setDemoMode(true);
    }
  }

  const isBroadcastUrl = typeof window !== "undefined" && (location.hash.includes("broadcast") || location.pathname.includes("broadcast"));
  const isBroadcast = $derived(Boolean(config.value.general.broadcastMode) || isBroadcastUrl);

  // Dual profile isolation: Broadcast mode uses its dedicated broadcast profile without modifying the driver's active HUD profile!
  const effectiveProfileId = $derived(
    isBroadcastUrl && config.value.general.broadcastProfileId && config.value.profiles[config.value.general.broadcastProfileId]
      ? config.value.general.broadcastProfileId
      : config.value.activeProfile
  );
  const effectiveProfile = $derived(config.value.profiles[effectiveProfileId]);
  const effectiveWidgets = $derived(
    isBroadcastUrl && effectiveProfile ? effectiveProfile.widgets : config.value.widgets
  );

  let lastProfileId = "";
  let profileAnimKey = $state(0);
  $effect(() => {
    const pid = effectiveProfileId;
    if (lastProfileId && pid && pid !== lastProfileId && (config.value.general.animateProfileSwitch ?? true)) {
      profileAnimKey += 1;
    }
    lastProfileId = pid;
  });

  $effect(() => {
    if (config.loaded) {
      void api.setBroadcastMode(isBroadcast);
    }
  });

  function finishEditing() {
    if (live.status.demo) {
      demoStartedForEditing = false;
      api.setDemoMode(false);
    }
    if (isBroadcastUrl && effectiveProfile && effectiveProfileId !== config.value.activeProfile) {
      effectiveProfile.widgets = effectiveWidgets;
    } else {
      syncActiveProfile();
    }
    saveConfig();
    api.setEditMode(false);
  }

  const onTrack = $derived(!!live.snap?.player && live.snap.inRealtime);
  const trackOk = $derived(!config.value.general.onlyOnTrack || onTrack || isBroadcast);
  const focusOk = $derived(!config.value.general.hideUnfocused || live.status.gameFocused || live.status.demo || isBroadcast);
  const isSpotterSpeaking = $derived(Boolean(spotter.currentTransmission));
  const hasActiveTestAlert = $derived(Object.keys(testAlert.activeUntil).length > 0);
  const show = $derived(config.loaded && (edit || (trackOk && focusOk) || isSpotterSpeaking || hasActiveTestAlert));

  // Auto Night Dimming based on LMU in-game time of day (seconds since midnight)
  const nightMultiplier = $derived.by(() => {
    if (edit || !config.value.general.autoNightDim) return 1;
    const tod = live.snap?.session?.timeOfDay;
    if (typeof tod !== "number" || tod <= 0) return 1;
    const secInDay = ((tod % 86400) + 86400) % 86400;
    const isNight = secInDay < 6.5 * 3600 || secInDay >= 20.5 * 3600;
    if (!isNight) return 1;
    return Math.max(0.35, Math.min(1, config.value.general.nightOpacity ?? 0.68));
  });

  const batteryFull = $derived(
    !!live.snap?.player && live.snap.player.electricMotorState > 0 && live.snap.player.battery >= 0.975,
  );
</script>

<svelte:window onkeydown={handleOverlayKeydown} />

<SoftwareRepaint active={show} />

{#if panicMode && !edit}
  <div class="pointer-events-none fixed top-2 right-3 z-40 rounded-full border border-amber-400/50 bg-black/80 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-300 shadow-lg backdrop-blur-sm">
    🛡️ HUD LIMPIO ({config.value.general.panicModeKey || "F10"})
  </div>
{/if}

{#if show && batteryFull}
  <div
    class="pointer-events-none fixed inset-0 z-10 border-[3px] border-[#00ff66] hud-battery-full"
  ></div>
{/if}

{#if edit}
  <div
    class="pointer-events-none fixed inset-0"
    style="background-image: linear-gradient(rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px); background-size: 40px 40px; background-color: rgb(0 0 0 / 0.25);"
  ></div>

  <!-- Smart Magnetic Snap Guide Lines -->
  {#each smartGuides.guidesX as gx (gx)}
    <div
      class="pointer-events-none fixed top-0 bottom-0 z-30 w-px bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
      style:left="{gx}px"
    ></div>
  {/each}
  {#each smartGuides.guidesY as gy (gy)}
    <div
      class="pointer-events-none fixed left-0 right-0 z-30 h-px bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
      style:top="{gy}px"
    ></div>
  {/each}
  <div
    class="fixed z-30 flex flex-col items-center gap-2.5"
    style:left="{(overlayLayout.info.isMultiMonitor ? overlayLayout.logicalOffsetX + (overlayLayout.logicalPrimaryWidth / 2) : (typeof window !== 'undefined' ? window.innerWidth / 2 : 960)) + toolbarOffsetX}px"
    style:top="{(overlayLayout.info.isMultiMonitor ? overlayLayout.logicalOffsetY + 24 : 24) + toolbarOffsetY}px"
    style:transform="translate(-50%, 0)"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="hud flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 text-sm shadow-2xl max-w-[94vw] cursor-grab active:cursor-grabbing"
      onpointerdown={onToolbarPointerDown}
      onpointermove={onToolbarPointerMove}
      onpointerup={onToolbarPointerUp}
      onpointercancel={onToolbarPointerUp}
    >
      <Logo size={22} />
      <div class="h-8 w-px bg-white/10"></div>
      <div>
        <div class="hud-title">Editar diseño del HUD</div>
        <div class="text-xs text-muted">Arrastra · flechas <kbd class="kbd">↑↓←→</kbd> ajuste fino · <kbd class="kbd">🔒</kbd> bloquear · <kbd class="kbd">✕</kbd> quitar · <kbd class="kbd">Ctrl+Shift+F9</kbd> terminar</div>
      </div>
      <button
        class={["btn px-3! py-1.5! text-xs! font-bold", widgetPickerOpen ? "bg-emerald-500! text-black border-emerald-400!" : "bg-emerald-500/20! border-emerald-400/50! text-emerald-300! hover:bg-emerald-500! hover:text-black!"]}
        onclick={() => (widgetPickerOpen = !widgetPickerOpen)}
      >
        {widgetPickerOpen ? "✕ Cerrar widgets" : "＋ Añadir / Quitar widgets"}
      </button>
      <button
        class={["btn px-3! py-1.5! text-xs! font-bold", live.status.demo ? "bg-warn! text-black" : ""]}
        onclick={toggleDemo}
      >
        {live.status.demo ? "✕ Quitar demo" : "Datos demo"}
      </button>
      {#if Object.keys(config.value.profiles).length > 1}
        <select
          class="field py-1.5! text-xs!"
          title="Perfil"
          value={config.value.activeProfile}
          onchange={(e) => switchProfile(e.currentTarget.value)}
        >
          {#each Object.entries(config.value.profiles) as [id, p] (id)}<option value={id}>{p.name}</option>{/each}
        </select>
      {/if}
      <button
        class="btn bg-accent text-white px-3! py-1.5! text-xs! font-bold hover:bg-accent-hi"
        title="Guardar perfil actual en disco"
        onclick={() => {
          syncActiveProfile();
          saveConfig();
          saveMessage = "✓ Guardado";
          setTimeout(() => (saveMessage = ""), 2500);
        }}
      >
        {saveMessage || "💾 Guardar perfil"}
      </button>
      <button
        class="btn bg-accent/20 border border-accent/40 text-accent font-bold px-3! py-1.5! text-xs! hover:bg-accent hover:text-white transition-colors"
        title="Si algún widget se ha salido de la pantalla o se ha perdido en un punto muerto, haz clic para devolver todos los widgets visibles a la pantalla principal"
        onclick={() => {
          recoverWidgetsToPrimaryScreen(overlayLayout.logicalPrimaryWidth, overlayLayout.logicalPrimaryHeight);
          saveMessage = "✓ Reubicados";
          setTimeout(() => (saveMessage = ""), 2500);
        }}
      >
        🎯 Reubicar
      </button>
      <button class="btn px-3! py-1.5! text-xs!" onclick={resetLayout}>Restablecer</button>
      <button class="btn btn-primary px-4! py-1.5! text-xs!" onclick={finishEditing}>Listo</button>
    </div>

    {#if widgetPickerOpen}
      <div class="hud flex w-[680px] max-w-[92vw] max-h-[55vh] flex-col gap-2.5 p-3.5 shadow-2xl border border-white/15">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="font-display text-sm font-black uppercase tracking-wider text-emerald-300">Gestor rápido de Widgets</span>
            <span class="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-muted">
              {WIDGETS.filter((w) => effectiveWidgets[w.id]?.enabled).length} / {WIDGETS.length} activos
            </span>
          </div>
          <input
            type="text"
            class="field w-56 py-1! text-xs!"
            placeholder="🔍 Buscar widget..."
            bind:value={widgetSearch}
          />
        </div>

        <div class="grid grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {#each filteredPickerWidgets as meta (meta.id)}
            {@const isOn = Boolean(effectiveWidgets[meta.id]?.enabled)}
            <button
              type="button"
              class={[
                "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer",
                isOn
                  ? "border-emerald-400/50 bg-emerald-500/15 hover:bg-red-500/20 hover:border-red-400/60 group"
                  : "border-white/10 bg-black/40 hover:border-accent hover:bg-accent/15",
              ]}
              onclick={() => toggleWidgetInEdit(meta.id, !isOn)}
            >
              <div class="min-w-0">
                <div class="truncate text-xs font-bold text-white">{meta.name}</div>
                <div class="truncate text-[10px] text-muted">{meta.description}</div>
              </div>
              <span
                class={[
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  isOn ? "bg-emerald-500/30 text-emerald-200 group-hover:bg-red-500/40 group-hover:text-red-100" : "bg-white/10 text-white/80",
                ]}
              >
                {isOn ? "ON · ✕" : "＋"}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

{#if show}
  {#each WIDGETS as meta, idx (meta.id)}
    {@const cfg = effectiveWidgets[meta.id]}
    {@const isTesting = testAlert.isTesting(meta.id)}
    {@const panicHidden = panicMode && !edit && !isTesting && !ESSENTIAL_WIDGETS.has(meta.id)}
    {#if cfg && (cfg.enabled || isTesting) && !panicHidden}
      {@const Widget = COMPONENTS[meta.id]}
      {@const isSpotter = meta.id === "spotter"}
      {@const shouldRender = edit || isTesting || (trackOk && focusOk) || (isSpotter && isSpotterSpeaking)}
      {#if shouldRender}
        <WidgetFrame
          id={meta.id}
          name={meta.name}
          {edit}
          selected={selectedWidgetId === meta.id}
          customWidgets={effectiveWidgets}
          {profileAnimKey}
          staggerIndex={idx}
          {nightMultiplier}
          onSelect={(wid) => (selectedWidgetId = wid)}
          onRemove={(wid) => {
            if (selectedWidgetId === wid) selectedWidgetId = null;
            toggleWidgetInEdit(wid, false);
          }}
        >
          <Widget opts={cfg.options} units={config.value.general.units} edit={edit || isTesting} />
        </WidgetFrame>
      {/if}
    {/if}
  {/each}
{/if}
