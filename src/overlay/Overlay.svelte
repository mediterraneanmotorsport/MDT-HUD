<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { config, loadConfig, recoverWidgetsToPrimaryScreen, resetLayout, saveConfig, switchProfile, syncActiveProfile, WIDGETS } from "../lib/config.svelte";
  import { live, startLive } from "../lib/live.svelte";
  import { overlayLayout } from "../lib/overlayLayout.svelte";
  import { spotter } from "../lib/spotter.svelte";
  import SoftwareRepaint from "./SoftwareRepaint.svelte";
  import Logo from "../lib/Logo.svelte";
  import WidgetFrame from "./WidgetFrame.svelte";
  import { COMPONENTS } from "./widgets";

  let saveMessage = $state("");
  let demoStartedForEditing = $state(false);

  onMount(() => {
    startLive();
    loadConfig();
    overlayLayout.init();
  });

  const edit = $derived(live.status.editMode);

  // If user exits edit mode, automatically turn off demo mode if it was activated for editing
  $effect(() => {
    if (!edit && demoStartedForEditing && live.status.demo) {
      demoStartedForEditing = false;
      api.setDemoMode(false);
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
  const show = $derived(config.loaded && (edit || (trackOk && focusOk) || isSpotterSpeaking));
  const batteryFull = $derived(
    !!live.snap?.player && live.snap.player.electricMotorState > 0 && live.snap.player.battery >= 0.975,
  );
</script>

<SoftwareRepaint active={show} />

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
  <div
    class="hud fixed z-20 flex items-center gap-4 px-4 py-3 text-sm shadow-2xl"
    style:left="{overlayLayout.info.isMultiMonitor ? overlayLayout.logicalOffsetX + (overlayLayout.logicalPrimaryWidth / 2) : (typeof window !== 'undefined' ? window.innerWidth / 2 : 960)}px"
    style:top="{overlayLayout.info.isMultiMonitor ? overlayLayout.logicalOffsetY + (overlayLayout.logicalPrimaryHeight / 2) : (typeof window !== 'undefined' ? window.innerHeight / 2 : 540)}px"
    style:transform="translate(-50%, -50%)"
  >
    <Logo size={22} />
    <div class="h-8 w-px bg-white/10"></div>
    <div>
      <div class="hud-title">Editar diseño del HUD</div>
      <div class="text-xs text-muted">Arrastra para mover · rueda para tamaño · <kbd class="kbd">Shift</kbd> + rueda para todos · <kbd class="kbd">Ctrl+Shift+F9</kbd> para terminar</div>
    </div>
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
      🎯 Reubicar en pantalla principal
    </button>
    <button class="btn px-3! py-1.5! text-xs!" onclick={resetLayout}>Restablecer</button>
    <button class="btn btn-primary px-4! py-1.5! text-xs!" onclick={finishEditing}>Listo</button>
  </div>
{/if}

{#if show}
  {#each WIDGETS as meta (meta.id)}
    {@const cfg = effectiveWidgets[meta.id]}
    {#if cfg && cfg.enabled}
      {@const Widget = COMPONENTS[meta.id]}
      {@const isSpotter = meta.id === "spotter"}
      {@const shouldRender = edit || (trackOk && focusOk) || (isSpotter && isSpotterSpeaking)}
      {#if shouldRender}
        <WidgetFrame id={meta.id} name={meta.name} {edit} customWidgets={effectiveWidgets}>
          <Widget opts={cfg.options} units={config.value.general.units} {edit} />
        </WidgetFrame>
      {/if}
    {/if}
  {/each}
{/if}
