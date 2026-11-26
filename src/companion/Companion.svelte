<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { isNativeTauri } from "../lib/api";
  import { aiEngineer } from "../lib/aiEngineer.svelte";
  import {
    applyCompleteOverlayTheme,
    config,
    HUD_THEMES,
    loadConfig,
    type PresetThemeId,
  } from "../lib/config.svelte";
  import { watchUploads } from "../lib/uploads.svelte";
  import { live, startLive } from "../lib/live.svelte";
  import Logo from "../lib/Logo.svelte";
  import { initStarPrompt } from "../lib/star.svelte";
  import {
    downloadLatestRelease,
    initUpdater,
    installUpdate,
    updater,
  } from "../lib/updater.svelte";
  import { wheelControl } from "../lib/wheelControl.svelte";
  import { nav, type Page } from "./nav.svelte";
  import ChangelogDialog from "./components/ChangelogDialog.svelte";
  import CommandPalette from "./components/CommandPalette.svelte";
  import OnboardingWizard from "./components/OnboardingWizard.svelte";
  import StarPrompt from "./components/StarPrompt.svelte";
  import ToastHost from "./components/ToastHost.svelte";
  import Analysis from "./pages/Analysis.svelte";
  import Live from "./pages/Live.svelte";
  import LiveStream from "./pages/LiveStream.svelte";
  import Overlays from "./pages/Overlays.svelte";
  import DashStudio from "./pages/DashStudio.svelte";
  import FxStudio from "./pages/FxStudio.svelte";
  import Rankings from "./pages/Rankings.svelte";
  import Records from "./pages/Records.svelte";
  import Schedule from "./pages/Schedule.svelte";
  import Sessions from "./pages/Sessions.svelte";
  import Settings from "./pages/Settings.svelte";
  import { remoteStream } from "../lib/remoteStream.svelte";
  import { toasts } from "../lib/toasts.svelte";

  let maximized = $state(false);
  let reportIssueError = $state(false);
  let sidebarCollapsed = $state(false);
  let showCommandPalette = $state(false);
  let showOnboarding = $state(false);
  let telemetryHz = $state(0);
  const ISSUE_URL =
    "https://github.com/mediterraneanmotorsport/MDT-HUD/issues/new/choose";

  async function reportIssue(event: MouseEvent) {
    if (!isNativeTauri()) return;
    event.preventDefault();
    reportIssueError = false;
    try {
      await openUrl(ISSUE_URL);
    } catch {
      reportIssueError = true;
    }
  }

  onMount(() => {
    startLive();
    void loadConfig()
      .then(() => {
        const ai = config.value.aiEngineer;
        if (
          ai?.enabled &&
          ai.voiceEngine === "qwen3" &&
          ai.qwen3AutoStart &&
          isNativeTauri()
        ) {
          void aiEngineer.startQwen3Server();
        }
      })
      .then(initUpdater)
      .then(initStarPrompt);
    watchUploads();

    try {
      sidebarCollapsed =
        localStorage.getItem("mdt_sidebar_collapsed") === "true";
      if (localStorage.getItem("mdt_onboarding_done_v1") !== "true") {
        setTimeout(() => (showOnboarding = true), 700);
      }
    } catch {}

    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        showCommandPalette = !showCommandPalette;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const idx = Number(e.key) - 1;
        const flat = NAV_GROUPS.flatMap((g) => g.items);
        if (idx >= 0 && idx < flat.length) {
          e.preventDefault();
          nav.page = flat[idx].id;
        }
      }
    };
    window.addEventListener("keydown", onGlobalKey);

    // Track real telemetry Hz for the sidebar mini-widget
    let lastFrame = live.snap?.frame ?? 0;
    const hzTimer = setInterval(() => {
      const f = live.snap?.frame ?? 0;
      telemetryHz = Math.max(0, Math.min(120, f - lastFrame));
      lastFrame = f;
    }, 1000);

    if (!isNativeTauri()) {
      return () => {
        window.removeEventListener("keydown", onGlobalKey);
        clearInterval(hzTimer);
      };
    }

    const appWindow = getCurrentWindow();
    void appWindow.isMaximized().then((value) => (maximized = value));
    let unlistenResize: (() => void) | undefined;
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then((value) => (maximized = value));
      })
      .then((unlisten) => (unlistenResize = unlisten));

    return () => {
      window.removeEventListener("keydown", onGlobalKey);
      clearInterval(hzTimer);
      unlistenResize?.();
    };
  });

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem("mdt_sidebar_collapsed", String(sidebarCollapsed));
    } catch {}
  }

  function startDragging(event: MouseEvent) {
    if (event.button === 0 && isNativeTauri()) {
      void getCurrentWindow().startDragging();
    }
  }

  async function toggleMaximize() {
    if (!isNativeTauri()) return;
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    maximized = await appWindow.isMaximized();
  }

  function quickSelectTheme(id: PresetThemeId) {
    applyCompleteOverlayTheme(id, true);
    wheelControl.setMobileTheme(id);
  }

  const NAV_GROUPS: {
    group: string;
    items: { id: Page; label: string; icon: string }[];
  }[] = [
    {
      group: "CARRERA",
      items: [
        { id: "live", label: "En vivo", icon: "M3 12h4l3-8 4 16 3-8h4" },
        {
          id: "livestream",
          label: "En Directo",
          icon: "M4.9 19.1A10 10 0 0 1 12 2a10 10 0 0 1 7.1 17.1 M7.8 16.2A6 6 0 0 1 12 6a6 6 0 0 1 4.2 10.2 M12 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
        },
        {
          id: "schedule",
          label: "Horarios",
          icon: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4 M12 13v3l2 1",
        },
      ],
    },
    {
      group: "STUDIO · HUD & FX",
      items: [
        {
          id: "overlays",
          label: "Overlays",
          icon: "M4 5h16v14H4z M8 9h5 M8 13h8",
        },
        {
          id: "dashstudio",
          label: "Dash Studio",
          icon: "M3 3h7v7H3z M14 3h7v4h-7z M14 10h7v11h-7z M3 13h7v8H3z",
        },
        {
          id: "fx",
          label: "FX & Audio3D",
          icon: "M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M4 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
        },
      ],
    },
    {
      group: "TELEMETRÍA",
      items: [
        {
          id: "sessions",
          label: "Sesiones",
          icon: "M4 6h16 M4 12h16 M4 18h10",
        },
        {
          id: "analysis",
          label: "Análisis",
          icon: "M4 19V5 M4 19h16 M7 15l4-5 3 3 5-7",
        },
        {
          id: "records",
          label: "Récords",
          icon: "M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 6h3v2a3 3 0 0 1-3 3 M7 6H4v2a3 3 0 0 0 3 3",
        },
      ],
    },
    {
      group: "SISTEMA",
      items: [
        {
          id: "settings",
          label: "Ajustes & IA",
          icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12h2 M3 12h2 M12 3v2 M12 19v2 M17 7l1.5-1.5 M5.5 18.5 7 17 M17 17l1.5 1.5 M5.5 5.5 7 7",
        },
      ],
    },
  ];

  const snap = $derived(live.snap);
  const meCar = $derived(snap?.vehicles?.find((v) => v.isPlayer));

  // Sliding spring tab indicator + magnetic hover ghost + directional page transition
  const FLAT_PAGES = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
  let navEl = $state<HTMLElement | null>(null);
  let tabRefs: Record<string, HTMLButtonElement | null> = {};
  let activeBar = $state({ left: 0, width: 0, visible: false });
  let hoverPill = $state({ left: 0, width: 0, visible: false });
  let prevPageIdx = 0;
  let pageDir = $state<1 | -1>(1);

  function measureTab(id: Page): { left: number; width: number } | null {
    const el = tabRefs[id];
    if (!el || !navEl) return null;
    const navRect = navEl.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left - navRect.left + navEl.scrollLeft,
      width: rect.width,
    };
  }

  function syncActiveTabBar() {
    const m = measureTab(nav.page);
    if (!m) return;
    activeBar = { left: m.left, width: m.width, visible: true };
  }

  $effect(() => {
    const curIdx = FLAT_PAGES.indexOf(nav.page);
    if (curIdx >= 0 && curIdx !== prevPageIdx) {
      pageDir = curIdx > prevPageIdx ? 1 : -1;
      prevPageIdx = curIdx;
    }
    requestAnimationFrame(syncActiveTabBar);
  });

  function onTabEnter(id: Page) {
    const m = measureTab(id);
    if (!m) return;
    hoverPill = { left: m.left, width: m.width, visible: true };
  }

  function onNavLeave() {
    hoverPill = { ...hoverPill, visible: false };
  }
  const statusText = $derived(
    !snap || snap.source === "none"
      ? "STANDBY · LMU"
      : snap.source === "demo"
        ? "DEMO ACTIVO"
        : snap.player
          ? `${snap.session.track || "EN PISTA"}`
          : "LMU · MENÚS",
  );
  const statusColor = $derived(
    !snap || snap.source === "none"
      ? "bg-faint"
      : snap.source === "demo"
        ? "bg-warn"
        : "bg-good",
  );
  const topStripeClass = $derived(
    remoteStream.isBroadcasting || remoteStream.spectatingId
      ? "from-[#e10600] via-[#ff3b30] to-[#1a85ff]"
      : snap?.session?.yellowFlagState || snap?.session?.phase === 6
        ? "from-[#f59e0b] via-[#fbbf24] to-transparent"
        : snap?.source === "lmu"
          ? "from-[#22c55e] via-[#1a85ff] to-transparent"
          : "from-[#e10600] via-[#1a85ff] to-transparent",
  );
</script>

<div class="relative flex h-full flex-col bg-transparent">
  <!-- Session-Reactive Top 2px WEC / F1 TV Broadcast Stripe -->
  <div
    class={[
      "h-[2px] w-full shrink-0 bg-gradient-to-r transition-colors duration-500",
      topStripeClass,
    ]}
  ></div>

  <!-- Top Race Control Telemetry Header (solid background, zero blur for 0% GPU overhead) -->
  <header
    class="flex h-11 shrink-0 items-stretch border-b border-white/[0.09] bg-[#0b0d12]"
  >
    <div
      class="flex min-w-0 flex-1 cursor-default items-center gap-3 px-4"
      onmousedown={startDragging}
      ondblclick={toggleMaximize}
    >
      <Logo size={20} tagline />

      <!-- Live Broadcast Telemetry Ticker -->
      <div
        class="ml-2 hidden xl:flex items-center gap-2 border-l border-white/[0.09] pl-3 font-mono text-[10.5px] uppercase tracking-wider"
      >
        <span class={["h-2 w-2 rounded-[1px]", statusColor]}></span>
        <span class="font-bold text-fg max-w-[190px] truncate"
          >{statusText}</span
        >
        {#if snap?.player}
          <span class="text-white/15">|</span>
          {#if meCar}
            <span class="font-bold text-accent-hi"
              >P{meCar.classPlace || meCar.place}</span
            >
            <span class="text-white/15">|</span>
          {/if}
          <span class="text-fg tnum"
            >{Math.round(snap.player.speed * 3.6)} KM/H</span
          >
          <span class="text-white/15">|</span>
          <span class="text-muted tnum"
            >G{snap.player.gear < 0
              ? "R"
              : snap.player.gear === 0
                ? "N"
                : snap.player.gear}</span
          >
          <span class="text-white/15">|</span>
          <span class="text-muted tnum"
            >FUEL {snap.player.fuel.toFixed(1)}L</span
          >
          {#if snap.player.virtualEnergy > 0}
            <span class="text-white/15">|</span>
            <span class="text-sky-400 tnum"
              >VE {Math.round(snap.player.virtualEnergy * 100)}%</span
            >
          {/if}
        {:else}
          <span class="text-white/15">|</span>
          <span class="text-muted">PIT WALL TELEMETRY BRIDGE</span>
        {/if}
        <span class="text-white/15">|</span>
        <span class="text-faint tnum"
          >{telemetryHz > 0 ? `${telemetryHz}HZ` : "IDLE"}</span
        >
      </div>

      {#if remoteStream.spectatingId && remoteStream.spectatingSession}
        <div
          class="ml-2 flex items-center gap-2 rounded border border-[#e10600]/60 bg-[#e10600]/15 px-2.5 py-0.5 text-[11px]"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-[#e10600]"></span>
          <span class="font-bold uppercase tracking-wider text-fg"
            >LIVE · {remoteStream.spectatingSession.driver}</span
          >
          <button
            class="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted hover:text-white transition-colors cursor-pointer"
            onclick={() => remoteStream.stopSpectating()}
            title="Volver a mi telemetría"
          >
            Salir
          </button>
        </div>
      {:else if remoteStream.isBroadcasting}
        <div
          class="ml-2 hidden sm:flex items-center gap-1.5 rounded border border-[#e10600]/60 bg-[#e10600]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-[#e10600] animate-pulse"
          ></span>
          <span>ON AIR</span>
        </div>
      {/if}
    </div>

    <!-- Right Hardware Controls: Subsystems + Search + Report + Window Controls -->
    <div class="hidden items-center gap-2 px-3 sm:flex">
      <div
        class="hidden md:flex items-center overflow-hidden rounded border border-white/[0.09] bg-[#12151d] font-display text-[11px] font-bold tracking-[0.08em] uppercase"
      >
        <button
          type="button"
          class={[
            "flex items-center gap-1.5 px-2.5 py-1 transition cursor-pointer border-r border-white/[0.08]",
            config.value.general.onboardFx?.enabled
              ? "bg-accent/25 text-white"
              : "text-muted hover:bg-white/[0.04] hover:text-fg",
          ]}
          onclick={() => (nav.page = "fx")}
          title="FX Onboard DirectX 11"
        >
          <span
            class={[
              "h-1.5 w-1.5 rounded-[1px]",
              config.value.general.onboardFx?.enabled
                ? "bg-accent"
                : "bg-faint",
            ]}
          ></span>
          FX
        </button>
        <button
          type="button"
          class={[
            "flex items-center gap-1.5 px-2.5 py-1 transition cursor-pointer border-r border-white/[0.08]",
            config.value.general.audio3d?.enabled
              ? "bg-sky-500/25 text-white"
              : "text-muted hover:bg-white/[0.04] hover:text-fg",
          ]}
          onclick={() => (nav.page = "fx")}
          title="MDT-Audio3D"
        >
          <span
            class={[
              "h-1.5 w-1.5 rounded-[1px]",
              config.value.general.audio3d?.enabled ? "bg-sky-400" : "bg-faint",
            ]}
          ></span>
          3D
        </button>
        <button
          type="button"
          class={[
            "flex items-center gap-1.5 px-2.5 py-1 transition cursor-pointer",
            config.value.aiEngineer?.enabled || config.value.spotter.enabled
              ? "bg-emerald-500/20 text-white"
              : "text-muted hover:bg-white/[0.04] hover:text-fg",
          ]}
          onclick={() => (nav.page = "settings")}
          title="Spotter & Ingeniero IA"
        >
          <span
            class={[
              "h-1.5 w-1.5 rounded-[1px]",
              config.value.aiEngineer?.enabled || config.value.spotter.enabled
                ? "bg-emerald-400"
                : "bg-faint",
            ]}
          ></span>
          RADIO
        </button>
      </div>

      <button
        type="button"
        class="flex items-center gap-2 rounded border border-white/[0.09] bg-[#12151d] px-2.5 py-1 text-[11px] font-medium text-muted transition hover:border-white/25 hover:text-fg cursor-pointer"
        onclick={() => (showCommandPalette = true)}
        title="Paleta de comandos rápida (Ctrl+K)"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
          ><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg
        >
        <kbd class="kbd text-[9px]">Ctrl+K</kbd>
      </button>

      <a
        class="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-[#12151d] text-muted transition hover:border-white/25 hover:text-fg"
        href={ISSUE_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Reportar un problema en GitHub"
        onclick={reportIssue}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><circle cx="12" cy="12" r="9" /><path d="M12 8v4 M12 16h.01" /></svg
        >
      </a>
    </div>

    <div class="flex shrink-0 items-stretch">
      <button
        class="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface-3 hover:text-fg"
        aria-label="Minimize window"
        title="Minimize"
        onclick={() => {
          if (isNativeTauri()) void getCurrentWindow().minimize();
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          ><path d="M3 7h8" stroke="currentColor" stroke-width="1.2" /></svg
        >
      </button>
      <button
        class="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface-3 hover:text-fg"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        title={maximized ? "Restore" : "Maximize"}
        onclick={toggleMaximize}
      >
        {#if maximized}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            ><path
              d="M4.5 3.5h6v6h-6zM3.5 5.5v5h5"
              stroke="currentColor"
              stroke-width="1.1"
            /></svg
          >
        {:else}
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            ><rect
              x="3.5"
              y="3.5"
              width="7"
              height="7"
              stroke="currentColor"
              stroke-width="1.1"
            /></svg
          >
        {/if}
      </button>
      <button
        class="flex w-11 items-center justify-center text-muted transition-colors hover:bg-[#e10600] hover:text-white"
        aria-label="Close window"
        title="Close"
        onclick={() => {
          if (isNativeTauri()) void getCurrentWindow().close();
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          ><path
            d="m3.5 3.5 7 7m0-7-7 7"
            stroke="currentColor"
            stroke-width="1.2"
          /></svg
        >
      </button>
    </div>
  </header>

  <!-- Top FIA WEC Broadcast Navigation Bar (sliding spring bar + magnetic hover ghost) -->
  <nav
    bind:this={navEl}
    aria-label="Navegación principal"
    class="relative flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.09] bg-[#0e1017] px-4"
    onmouseleave={onNavLeave}
  >
    <!-- Magnetic hover ghost background -->
    <span
      class="wec-tab-hover"
      style:transform={`translate3d(${hoverPill.left}px, 0, 0)`}
      style:width={`${hoverPill.width}px`}
      style:opacity={hoverPill.visible ? 1 : 0}
      aria-hidden="true"
    ></span>

    <!-- Sliding spring active underline -->
    {#if activeBar.visible}
      <span
        class="wec-tab-indicator"
        style:transform={`translate3d(${activeBar.left}px, 0, 0)`}
        style:width={`${activeBar.width}px`}
        aria-hidden="true"
      ></span>
    {/if}

    {#each NAV_GROUPS as grp, gIdx (grp.group)}
      {#if gIdx > 0}
        <div class="mx-2.5 h-5 w-[1px] shrink-0 bg-white/[0.12]"></div>
      {/if}
      <div class="z-10 flex shrink-0 items-center gap-1">
        {#each grp.items as p (p.id)}
          <button
            bind:this={tabRefs[p.id]}
            type="button"
            class={[
              "group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2.5 font-display text-[13px] font-bold tracking-[0.07em] uppercase transition-colors cursor-pointer active:scale-[0.97]",
              nav.page === p.id
                ? "text-white"
                : "text-muted hover:text-fg",
            ]}
            title={p.label}
            onmouseenter={() => onTabEnter(p.id)}
            onclick={() => (nav.page = p.id)}
          >
            <svg
              class={[
                "shrink-0 transition-colors",
                nav.page === p.id
                  ? "text-accent-hi wec-tab-icon-active"
                  : "text-muted group-hover:text-fg",
              ]}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d={p.icon} />
            </svg>
            <span>{p.label}</span>
          </button>
        {/each}
      </div>
    {/each}
  </nav>

  <!-- Full-Width Widescreen Stage -->
  <div class="relative flex min-h-0 flex-1 flex-col">
    {#if updater.phase === "available" || updater.phase === "downloading" || updater.phase === "outdated"}
      <div
        class="flex items-center justify-between border-b border-accent/35 bg-accent/12 px-5 py-1.5 text-xs"
      >
        <span class="font-semibold text-fg">
          Nueva versión <span class="font-mono text-accent-hi"
            >v{updater.available}</span
          > disponible para MDT-HUD.
        </span>
        {#if updater.phase === "outdated"}
          <button
            class="btn btn-primary py-1 text-[11px]"
            onclick={downloadLatestRelease}
          >
            Descargar v{updater.available}
          </button>
        {:else}
          <button
            class="btn btn-primary py-1 text-[11px]"
            disabled={updater.phase === "downloading"}
            onclick={installUpdate}
          >
            {updater.phase === "downloading"
              ? `Descargando ${Math.round(updater.progress * 100)}%`
              : "Instalar y reiniciar"}
          </button>
        {/if}
      </div>
    {/if}

    <main class="min-w-0 flex-1 overflow-y-auto pb-6">
      {#key nav.page}
        <div class={pageDir >= 0 ? "wec-page-enter-right" : "wec-page-enter-left"}>
          {#if nav.page === "live"}
            <Live />
          {:else if nav.page === "livestream"}
            <LiveStream />
          {:else if nav.page === "overlays"}
            <Overlays />
          {:else if nav.page === "dashstudio"}
            <DashStudio />
          {:else if nav.page === "fx"}
            <FxStudio />
          {:else if nav.page === "sessions"}
            <Sessions />
          {:else if nav.page === "analysis"}
            <Analysis />
          {:else if nav.page === "records"}
            <Records />
          {:else if nav.page === "rankings"}
            <Rankings />
          {:else if nav.page === "schedule"}
            <Schedule />
          {:else}
            <Settings />
          {/if}
        </div>
      {/key}
    </main>
  </div>
</div>

<ChangelogDialog />
<StarPrompt />
<CommandPalette
  bind:open={showCommandPalette}
  onOpenOnboarding={() => (showOnboarding = true)}
/>
<OnboardingWizard bind:open={showOnboarding} />
<ToastHost />
