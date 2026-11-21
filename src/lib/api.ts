import { invoke } from "@tauri-apps/api/core";

export function isNativeTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !(window as any).__MDT_MOCK__;
}
import type {
  BoardSummary,
  DailySchedule,
  Filters,
  LapRecord,
  LapTrace,
  Leaderboard,
  MonitorInfo,
  OnlineMe,
  OverlayLayoutInfo,
  PersonalBest,
  SessionSummary,
  Snapshot,
  Status,
  TrackMap,
  UploadState,
} from "./types";

export const api = {
  getSnapshot: () => invoke<Snapshot>("get_snapshot"),
  getStatus: () => invoke<Status>("get_status"),
  latestRelease: () => invoke<{ version: string; notes: string }>("latest_release"),
  getConfig: () => invoke<unknown>("get_config"),
  saveConfig: (config: unknown) => invoke<void>("save_config", { config }),
  getMobileNetworkInfo: () =>
    invoke<{ ips: string[]; port: number; url: string; pitwallUrl: string; firewallOpen: boolean }>(
      "get_mobile_network_info",
    ),
  openMobileFirewall: () => invoke<boolean>("open_mobile_firewall"),
  openSpotterFolder: () => invoke<void>("open_spotter_folder"),
  getSpotterManifest: async (): Promise<Record<string, Record<string, string[]>> | null> => {
    if (isNativeTauri()) {
      return invoke<Record<string, Record<string, string[]>>>("get_spotter_manifest").catch(() => null);
    }
    const res = await fetch("/__spotter_files", { cache: "no-store" }).catch(() => null);
    if (res && res.ok) return res.json().catch(() => null);
    return null;
  },
  focusVehicle: async (slotId: number): Promise<boolean> => {
    // Safety guard: while the main driver is actively driving on track, block focusing any other driver
    if (typeof window !== "undefined" && (window as any).__MDT_IS_MAIN_ON_TRACK__?.()) {
      const mainSlot = (window as any).__MDT_MAIN_PLAYER_SLOT__?.();
      if (mainSlot != null && slotId !== mainSlot) {
        return false;
      }
    }
    console.log(`[MDT] Intentando enfocar vehículo Slot ${slotId}...`);
    // 1. Desktop Tauri IPC
    if (isNativeTauri()) {
      try {
        const ok = await invoke<boolean>("focus_vehicle", { slotId });
        if (ok) {
          console.log(`[MDT] ✓ Enfocado vía Tauri IPC al Slot ${slotId}`);
          return true;
        }
      } catch (e) {
        console.warn(`[MDT] Tauri IPC focus_vehicle falló:`, e);
      }
    }
    // 2. Proxy local /lmu-api/rest/watch/focus/{slotId}
    try {
      const res = await fetch(`/lmu-api/rest/watch/focus/${slotId}`, {
        method: "PUT",
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok !== false) {
          console.log(`[MDT] ✓ Enfocado vía /lmu-api al Slot ${slotId}`);
          return true;
        }
      }
    } catch (e) {
      console.warn(`[MDT] Proxy /lmu-api falló:`, e);
    }
    // 3. Direct mobile server endpoint
    try {
      const res = await fetch(`/rest/watch/focus/${slotId}`, {
        method: "PUT",
        headers: { accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok !== false) {
          console.log(`[MDT] ✓ Enfocado vía /rest/watch/focus al Slot ${slotId}`);
          return true;
        }
      }
    } catch {}
    // 4. Query relay /__focus_vehicle?slotId={slotId}
    try {
      const res = await fetch(`/__focus_vehicle?slotId=${slotId}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok !== false) {
          console.log(`[MDT] ✓ Enfocado vía /__focus_vehicle al Slot ${slotId}`);
          return true;
        }
      }
    } catch {}
    // 5. Direct LMU REST call (only succeeds if browser doesn't block CORS)
    try {
      const res = await fetch(`http://127.0.0.1:6397/rest/watch/focus/${slotId}`, {
        method: "PUT",
        headers: { accept: "application/json" },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
  setEditMode: (enabled: boolean) => invoke<void>("set_edit_mode", { enabled }),
  setOverlayVisible: (visible: boolean) => invoke<void>("set_overlay_visible", { visible }),
  setDemoMode: (enabled: boolean) => invoke<void>("set_demo_mode", { enabled }),
  setFocusedSlot: async (slotId: number | null) => {
    if (slotId != null && typeof window !== "undefined" && (window as any).__MDT_IS_MAIN_ON_TRACK__?.()) {
      const mainSlot = (window as any).__MDT_MAIN_PLAYER_SLOT__?.();
      if (mainSlot != null && slotId !== mainSlot) {
        return;
      }
    }
    if (isNativeTauri()) {
      return invoke<void>("set_focused_slot", { slotId }).catch(() => {});
    }
    return fetch("/__mobile_focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId }),
    }).catch(() => {});
  },
  setBroadcastMode: async (enabled: boolean) => {
    if (isNativeTauri()) {
      return invoke<void>("set_broadcast_mode", { enabled }).catch(() => {});
    }
  },
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  getOverlayLayout: () => invoke<OverlayLayoutInfo>("get_overlay_layout"),
  getAutoStart: () => (isNativeTauri() ? invoke<boolean>("get_auto_start").catch(() => false) : Promise.resolve(false)),
  setAutoStart: (enabled: boolean) => (isNativeTauri() ? invoke<boolean>("set_auto_start", { enabled }).catch(() => false) : Promise.resolve(false)),
  getPreviewSnapshot: () => invoke<Snapshot>("get_preview_snapshot"),
  listSessions: (opts: { track?: string | null; car?: string | null; limit?: number; offset?: number } = {}) =>
    invoke<SessionSummary[]>("list_sessions", opts),
  listLaps: (sessionId: number) => invoke<LapRecord[]>("list_laps", { sessionId }),
  listTrackLaps: (track: string, car?: string | null, validOnly = false, limit = 200) =>
    invoke<LapRecord[]>("list_track_laps", { track, car, validOnly, limit }),
  getLapTrace: (lapId: number) => invoke<LapTrace>("get_lap_trace", { lapId }),
  personalBests: () => invoke<PersonalBest[]>("personal_bests"),
  getFilters: () => invoke<Filters>("get_filters"),
  getTrackMap: (track: string) => invoke<TrackMap | null>("get_track_map", { track }),
  deleteLap: (lapId: number) => invoke<void>("delete_lap", { lapId }),
  deleteSession: (sessionId: number) => invoke<void>("delete_session", { sessionId }),
  dailyRaces: (force = false) => invoke<DailySchedule>("daily_races", { force }),
  onlineRegister: (displayName: string | null) => invoke<OnlineMe>("online_register", { displayName }),
  onlineMe: () => invoke<OnlineMe>("online_me"),
  onlineSetDisplayName: (displayName: string | null) => invoke<OnlineMe>("online_set_display_name", { displayName }),
  onlineDeleteData: () => invoke<void>("online_delete_data"),
  uploadLaps: (lapIds: number[]) => invoke<number>("upload_laps", { lapIds }),
  lapUploadStates: () => invoke<UploadState[]>("lap_upload_states"),
  removeLapUpload: (lapId: number) => invoke<void>("remove_lap_upload", { lapId }),
  leaderboard: (query: {
    track: string;
    carClass: string;
    car?: string | null;
    sessionType?: string | null;
    gameVersion?: number | null;
    limit?: number;
    offset?: number;
  }) => invoke<Leaderboard>("leaderboard", { query }),
  leaderboardBoards: () => invoke<BoardSummary[]>("leaderboard_boards"),
  rankedLapTrace: (remoteId: string) => invoke<LapTrace>("ranked_lap_trace", { remoteId }),
};

export const focusDriver = (slotId: number) => api.focusVehicle(slotId);
