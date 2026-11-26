import { listen } from "@tauri-apps/api/event";
import { getContext, setContext } from "svelte";
import { api, isNativeTauri } from "./api";
import {
  applyCompleteOverlayTheme,
  applyRemoteConfig,
  config,
  cycleNextProfile,
  saveConfig,
  switchProfile,
  toggleBroadcastMode,
  type PresetThemeId,
} from "./config.svelte";
import { sendSessionToDiscord } from "./discord";
import { aiEngineer } from "./aiEngineer.svelte";
import { remoteStream } from "./remoteStream.svelte";
import { spotter } from "./spotter.svelte";
import type { Snapshot, Status } from "./types";
import { wheelControl } from "./wheelControl.svelte";

class Live {
  /** Latest telemetry snapshot. `$state.raw` avoids deep-proxying ~40 KB of data at 30 Hz. */
  snap = $state.raw<Snapshot | null>(null);
  status = $state.raw<Status>({ demo: false, editMode: false, overlayVisible: true, gameFocused: false, dataDir: "", experimentalLinux: false });
}

export const live = new Live();

/**
 * Returns true when the main human player is actively driving on track in LMU.
 * Used to lock camera/driver switching in PitWall & Mobile and to gate the spotter.
 */
export function isMainDriverOnTrack(snap: Snapshot | null): boolean {
  if (!snap || !snap.connected || !snap.inRealtime || snap.source !== "lmu") return false;
  const me = snap.vehicles?.find((v) => v.isPlayer);
  if (!me || me.inGarage) return false;
  return me.control === 0;
}

if (typeof window !== "undefined") {
  (window as any).__MDT_IS_MAIN_ON_TRACK__ = () => isMainDriverOnTrack(live.snap);
  (window as any).__MDT_MAIN_PLAYER_SLOT__ = () => {
    const me = live.snap?.vehicles?.find((v) => v.isPlayer);
    return me ? (me.slotId ?? me.id) : null;
  };
}

/** Where widgets read telemetry from. */
export interface LiveSource {
  readonly snap: Snapshot | null;
}

const LIVE_KEY = Symbol("live");

/** Gives child widgets a different telemetry source (e.g. the companion's preview). */
export function provideLive(source: LiveSource) {
  setContext(LIVE_KEY, source);
}

/** The telemetry source for a widget: the one provided by a parent, else the global live data. */
export function useLive(): LiveSource {
  return getContext<LiveSource | undefined>(LIVE_KEY) ?? live;
}

let started = false;

export async function startLive() {
  if (started) return;
  started = true;
  const isRemoteView =
    typeof window !== "undefined" &&
    (location.hash.startsWith("#mobile") ||
      location.hash.startsWith("#dash") ||
      location.hash.startsWith("#pitwall") ||
      location.hash.startsWith("#streamer") ||
      location.pathname === "/mobile" ||
      location.pathname === "/dash" ||
      location.pathname === "/streamer" ||
      /android|iphone|ipod|ipad/i.test(navigator.userAgent));
  const isOverlayWindow = typeof window !== "undefined" && location.hash.startsWith("#overlay");
  wheelControl.startHost();

  let lastSessionCode = -1;
  let lastSessionTrack = "";
  let lastPhase = -1;
  let lastInRealtime = false;
  let lastLapNumber = 0;
  let lastExportedSessionId: number | null = null;
  let exitGarageTimer: ReturnType<typeof setTimeout> | undefined;
  let lastDemoOrEditExit = 0;
  let lastCompanionSnapAt = 0;
  let lastCompanionSource = "";

  async function triggerAutoDiscordExport() {
    if (live.status.demo || live.status.editMode || Date.now() - lastDemoOrEditExit < 15000) {
      return;
    }
    if (!config.value.discord?.enabled || !config.value.discord?.autoExport) {
      return;
    }
    const sessions = await api.listSessions({ limit: 1 }).catch(() => []);
    const latest = sessions[0];
    if (!latest || latest.lapCount < 1 || latest.id === lastExportedSessionId) return;

    const laps = await api.listLaps(latest.id).catch(() => []);
    if (!laps || laps.length === 0) return;

    lastExportedSessionId = latest.id;
    console.log(`[MDT] Auto-exportando sesión ${latest.id} con gráfico PNG a Discord...`);
    const res = await sendSessionToDiscord(latest, laps);
    if (res.ok) {
      console.log(`[MDT] ✓ Sesión ${latest.id} exportada y enviada a Discord exitosamente.`);
    } else {
      console.warn(`[MDT] Error al auto-exportar sesión a Discord:`, res.error);
    }
  }

  await listen<Snapshot>("snapshot", (e) => {
    const snap = e.payload;
    // Drop stale in-flight demo frames right after the user clicks "Detener Demo"
    if (snap.source === "demo" && !live.status.demo && Date.now() - lastDemoOrEditExit < 1200) {
      return;
    }
    if (!remoteStream.spectatingId) {
      if (!isOverlayWindow && !isRemoteView) {
        // Companion UI only needs ~6 Hz reactive DOM updates (cuts Companion CPU/GPU by ~90%)
        const now = performance.now();
        if (snap.source !== lastCompanionSource || now - lastCompanionSnapAt >= 160) {
          lastCompanionSnapAt = now;
          lastCompanionSource = snap.source;
          live.snap = snap;
        }
      } else {
        live.snap = snap;
      }
    }
    if (!isRemoteView && !isOverlayWindow) {
      remoteStream.onLocalTelemetry(e.payload);

      // #1 Auto-switch HUD profile by car class (Hypercar / LMP2 / LMP3 / LMGT3)
      if (config.value.general.autoProfileByClass && e.payload.player?.vehicleClass) {
        const rawCls = e.payload.player.vehicleClass.toLowerCase();
        const normCls =
          rawCls.includes("hyper") || rawCls.includes("lmh") || rawCls.includes("lmdh")
            ? "Hypercar"
            : rawCls.includes("lmp2")
              ? "LMP2"
              : rawCls.includes("lmp3")
                ? "LMP3"
                : rawCls.includes("gt")
                  ? "LMGT3"
                  : "";
        const targetProf = normCls ? config.value.general.classProfiles?.[normCls] : "";
        if (targetProf && targetProf !== config.value.activeProfile && config.value.profiles[targetProf]) {
          switchProfile(targetProf);
        }
      }

      spotter.update(e.payload);
      aiEngineer.onTelemetry(e.payload);
      if (!isNativeTauri()) {
        wheelControl.pushSnapshotToMobile(e.payload);
      }

      // Check for session completion / transitions (ignored during demo or edit mode)
      if (!live.status.demo && !live.status.editMode && Date.now() - lastDemoOrEditExit >= 15000) {
        const s = e.payload.session;
        const p = e.payload.player;
        if (s) {
          if (lastPhase >= 0 && lastPhase < 7 && s.phase >= 7) {
            setTimeout(triggerAutoDiscordExport, 1500);
          }
          if (lastSessionCode !== -1 && (s.code !== lastSessionCode || (lastSessionTrack && s.track !== lastSessionTrack))) {
            setTimeout(triggerAutoDiscordExport, 1000);
          }
          lastSessionCode = s.code;
          lastSessionTrack = s.track;
          lastPhase = s.phase;
        }
        if (p) {
          if (lastInRealtime && !e.payload.inRealtime && lastLapNumber > 0) {
            clearTimeout(exitGarageTimer);
            exitGarageTimer = setTimeout(triggerAutoDiscordExport, 3000);
          }
          lastInRealtime = e.payload.inRealtime;
          lastLapNumber = p.lapNumber;
        }
      }
    }
  });
  await listen<boolean>("edit-mode", (e) => {
    if (live.status.editMode && !e.payload) {
      lastDemoOrEditExit = Date.now();
      clearTimeout(exitGarageTimer);
      lastSessionCode = -1;
      lastPhase = -1;
      lastInRealtime = false;
      lastLapNumber = 0;
    }
    live.status = { ...live.status, editMode: e.payload };
  });
  await listen<boolean>("overlay-visible", (e) => {
    live.status = { ...live.status, overlayVisible: e.payload };
  });
  await listen<boolean>("game-focused", (e) => {
    live.status = { ...live.status, gameFocused: e.payload };
  });
  await listen<boolean>("demo-mode", (e) => {
    if (!e.payload) {
      lastDemoOrEditExit = Date.now();
      clearTimeout(exitGarageTimer);
      lastSessionCode = -1;
      lastPhase = -1;
      lastInRealtime = false;
      lastLapNumber = 0;
      if (live.snap?.source === "demo") {
        live.snap = null;
        lastCompanionSource = "none";
      }
    }
    live.status = { ...live.status, demo: e.payload };
  });
  await listen("shortcut-toggle-spotter", () => {
    config.value.spotter.enabled = !config.value.spotter.enabled;
    saveConfig();
  });
  await listen("shortcut-next-profile", () => {
    cycleNextProfile();
  });
  await listen("shortcut-toggle-broadcast", () => {
    toggleBroadcastMode();
  });
  await listen("shortcut-reset-focus", () => {
    if (live.snap?.vehicles) {
      for (const v of live.snap.vehicles) {
        v.isFocused = v.isPlayer;
      }
    }
  });
  await listen<{ action?: string; value?: string }>("streamer-action", (e) => {
    if (isRemoteView || isOverlayWindow) return;
    const act = e.payload?.action;
    const val = e.payload?.value ?? "";
    if (act === "toggle_broadcast") {
      toggleBroadcastMode();
    } else if (act === "toggle_spotter") {
      config.value.spotter.enabled = !config.value.spotter.enabled;
      saveConfig();
    } else if (act === "next_profile") {
      cycleNextProfile();
    } else if (act === "set_profile" && val && config.value.profiles[val]) {
      switchProfile(val);
    } else if (act === "set_theme" && val) {
      applyCompleteOverlayTheme(val as PresetThemeId, true);
      wheelControl.setMobileTheme(val as PresetThemeId);
    } else if (act === "toggle_widget" && val && config.value.widgets[val]) {
      config.value.widgets[val].enabled = !config.value.widgets[val].enabled;
      saveConfig();
    }
  });
  if (!isRemoteView && !isOverlayWindow) {
    const [snap, status] = await Promise.all([api.getSnapshot(), api.getStatus()]);
    live.snap ??= snap;
    live.status = status;
    remoteStream.init();
  }

  // When loaded in a browser (e.g. OBS Studio Browser Source at localhost:1420),
  // stream live telemetry from the internal MDT HTTP server (30Hz SSE).
  // Mobile/Pitwall views manage their own dedicated sync loop, so skip duplicate SSE there.
  if (!isNativeTauri() && !isRemoteView && typeof EventSource !== "undefined") {
    try {
      const sse = new EventSource("/__mobile_stream");
      sse.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data?.snap && (data.snap.source === "lmu" || data.snap.player || data.snap.vehicles?.length)) {
            (window as any).__MDT_STOP_DEMO__?.();
            live.snap = data.snap;
          }
          if (data?.appConfig) {
            applyRemoteConfig(data.appConfig);
          }
        } catch {}
      };
    } catch {}
  }
}
