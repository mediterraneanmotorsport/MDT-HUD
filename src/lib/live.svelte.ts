import { listen } from "@tauri-apps/api/event";
import { getContext, setContext } from "svelte";
import { api, isNativeTauri } from "./api";
import { applyRemoteConfig, config } from "./config.svelte";
import { sendSessionToDiscord } from "./discord";
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
      location.pathname === "/mobile" ||
      location.pathname === "/dash" ||
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

  async function triggerAutoDiscordExport() {
    if (!config.value.discord?.enabled || !config.value.discord?.autoExport || !config.value.discord?.webhookUrl) {
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
    if (!remoteStream.spectatingId) {
      live.snap = e.payload;
    }
    if (!isRemoteView && !isOverlayWindow) {
      remoteStream.onLocalTelemetry(e.payload);
      spotter.update(e.payload);
      if (!isNativeTauri()) {
        wheelControl.pushSnapshotToMobile(e.payload);
      }

      // Check for session completion / transitions
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
  });
  await listen<boolean>("edit-mode", (e) => {
    live.status = { ...live.status, editMode: e.payload };
  });
  await listen<boolean>("overlay-visible", (e) => {
    live.status = { ...live.status, overlayVisible: e.payload };
  });
  await listen<boolean>("game-focused", (e) => {
    live.status = { ...live.status, gameFocused: e.payload };
  });
  await listen<boolean>("demo-mode", (e) => {
    live.status = { ...live.status, demo: e.payload };
  });
  if (!isRemoteView && !isOverlayWindow) {
    const [snap, status] = await Promise.all([api.getSnapshot(), api.getStatus()]);
    live.snap ??= snap;
    live.status = status;
    remoteStream.init();
  }

  // When loaded in a browser (e.g. OBS Studio Browser Source at localhost:1420),
  // stream live telemetry from the internal MDT HTTP server (30Hz SSE)
  if (!isNativeTauri() && typeof EventSource !== "undefined") {
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
