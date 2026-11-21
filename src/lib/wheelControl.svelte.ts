import { api, isNativeTauri } from "./api";
import { applyCompleteOverlayTheme, config, cycleNextProfile, saveConfig, type PresetThemeId } from "./config.svelte";
import { toasts } from "./toasts.svelte";
import type { Snapshot } from "./types";

export type WheelGlobalAction = "toggleOverlay" | "toggleSpotter" | "nextProfile" | "markLapNote";

export type MfdPageId =
  | "dashboard"
  | "relative"
  | "standings"
  | "damage"
  | "tyres"
  | "fuel"
  | "liftcoast"
  | "pacecatch"
  | "tracklimits"
  | "electronics"
  | "radar"
  | "laptiming"
  | "trackmap"
  | "inputs"
  | "stintplanner"
  | "customdash";

export interface MfdPageDef {
  id: MfdPageId;
  short: string;
  shortTitle: string;
  title: string;
  description: string;
}

export const ALL_MOBILE_PAGES: MfdPageDef[] = [
  {
    id: "dashboard",
    short: "Dashboard DDU",
    shortTitle: "DASHBOARD DDU",
    title: "Cuadro de Mandos (Dashboard)",
    description: "Velocidad, marcha, luces LED de RPM, pedales y volante a pantalla completa.",
  },
  {
    id: "relative",
    short: "Relativo",
    shortTitle: "RELATIVO",
    title: "Relativo en Pista",
    description: "Coches cercanos en pista, diferencias en vivo, doblados y energía.",
  },
  {
    id: "standings",
    short: "Clasificación",
    shortTitle: "CLASIFICACIÓN",
    title: "Clasificación (Standings)",
    description: "Torre de tiempos de tu categoría y rivales con paradas y neumáticos.",
  },
  {
    id: "damage",
    short: "Daños",
    shortTitle: "DAÑOS DEL COCHE",
    title: "Daños del Coche",
    description: "Silueta detallada de daños de aerodinámica, alerones y suspensión.",
  },
  {
    id: "tyres",
    short: "Neumáticos",
    shortTitle: "NEUMÁTICOS Y FRENOS",
    title: "Neumáticos y Frenos",
    description: "Temperaturas, desgaste, ritmo por vuelta, vueltas restantes y frenos.",
  },
  {
    id: "fuel",
    short: "Combustible",
    shortTitle: "COMBUSTIBLE Y ENERGÍA",
    title: "Combustible y Energía",
    description: "Autonomía de combustible/energía, consumo por vuelta y parada estimada.",
  },
  {
    id: "liftcoast",
    short: "Lift & Coast",
    shortTitle: "LIFT & COAST",
    title: "Ahorro Lift & Coast",
    description: "Objetivo de ahorro por vuelta y regeneración híbrida ERS.",
  },
  {
    id: "pacecatch",
    short: "Cazador",
    shortTitle: "CAZADOR DE RIVALES",
    title: "Cazador de Rivales",
    description: "Vueltas estimadas para dar caza al coche de delante o ser alcanzado.",
  },
  {
    id: "tracklimits",
    short: "Límites",
    shortTitle: "LÍMITES DE PISTA",
    title: "Límites de Pista",
    description: "Contador de avisos y puntos de sanción por Track Limits.",
  },
  {
    id: "electronics",
    short: "Electrónica",
    shortTitle: "ELECTRÓNICA DEL COCHE",
    title: "Electrónica (TC / ABS / Mapa)",
    description: "Control de tracción, ABS, mapa motor, reparto de frenada y ARB.",
  },
  {
    id: "laptiming",
    short: "Tiempos Vuelta",
    shortTitle: "TIEMPOS Y SECTORES",
    title: "Tiempos por Vuelta y Sectores",
    description: "Tiempo actual, última vuelta, mejor vuelta y parciales S1/S2/S3.",
  },
  {
    id: "radar",
    short: "Radar",
    shortTitle: "RADAR SPOTTER",
    title: "Radar de Proximidad",
    description: "Vista cenital de coches en paralelo a izquierda y derecha.",
  },
  {
    id: "trackmap",
    short: "Mapa Circuito",
    shortTitle: "MAPA DEL CIRCUITO",
    title: "Mapa del Circuito en Vivo",
    description: "Trazado del circuito con posición GPS de todos los rivales y compañeros MDT.",
  },
  {
    id: "inputs",
    short: "Pedales/Volante",
    shortTitle: "TELEMETRÍA PEDALES",
    title: "Gráfico de Pedales y Dirección",
    description: "Traza en tiempo real de acelerador, freno, embrague y giro de volante.",
  },
  {
    id: "stintplanner",
    short: "Estrategia WEC",
    shortTitle: "ESTRATEGIA Y STINTS",
    title: "Calculadora de Estrategia y Stints WEC",
    description: "Paradas necesarias, repostaje exacto por parada, splash final y ahorro.",
  },
  {
    id: "customdash",
    short: "Dash Studio",
    shortTitle: "MDT DASH STUDIO",
    title: "Mi Dashboard Personalizado (Dash Studio)",
    description: "Tu volante o DDU personalizado diseñado en MDT Dash Studio a pantalla completa.",
  },
];

export const DEFAULT_MOBILE_PAGE_IDS: MfdPageId[] = [
  "dashboard",
  "relative",
  "standings",
  "damage",
  "tyres",
  "fuel",
  "liftcoast",
  "pacecatch",
];

// Backwards-compatible export for components iterating over all known definitions
export const MFD_PAGES = ALL_MOBILE_PAGES;

export interface WheelButtonBind {
  kind: "gamepad" | "key";
  gamepadIndex?: number;
  buttonIndex?: number;
  gamepadId?: string;
  key?: string;
  label: string;
}

const STORAGE_KEY = "mdt_wheel_mfd_v3";

export const MOBILE_SERVER_BASE =
  typeof window !== "undefined" && isNativeTauri() && location.port !== "1420"
    ? "http://127.0.0.1:1420"
    : "";

class WheelController {
  pageIndex = $state(0);
  enabledPageIds = $state<MfdPageId[]>([...DEFAULT_MOBILE_PAGE_IDS]);
  mobileTheme = $state<PresetThemeId>("mdt-aura");
  autoPopups = $state(false);
  learning = $state<"next" | "prev" | WheelGlobalAction | null>(null);
  nextBind = $state<WheelButtonBind | null>({
    kind: "key",
    key: "PageDown",
    label: "Tecla AvPág (o asigna botón del volante)",
  });
  prevBind = $state<WheelButtonBind | null>({
    kind: "key",
    key: "PageUp",
    label: "Tecla RePág (o asigna botón del volante)",
  });
  /** #19 Global Steering Wheel Button Actions */
  actionBinds = $state<Record<WheelGlobalAction, WheelButtonBind | null>>({
    toggleOverlay: null,
    toggleSpotter: null,
    nextProfile: null,
    markLapNote: null,
  });
  telemetryMarks = $state<{ time: string; label: string }[]>([]);
  connectedGamepads = $state<string[]>([]);
  mobileUrl = $state(
    typeof window !== "undefined" && location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"
      ? `http://${location.hostname}:1420/#mobile`
      : "http://127.0.0.1:1420/#mobile",
  );
  pitwallUrl = $state(
    typeof window !== "undefined" && location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"
      ? `http://${location.hostname}:1420/#pitwall`
      : "http://127.0.0.1:1420/#pitwall",
  );
  lanIps = $state<string[]>([]);
  selectedIp = $state<string>("");
  firewallOpen = $state<boolean>(true);
  firewallBusy = $state<boolean>(false);
  lastPressedInfo = $state<string>("");

  private channel: BroadcastChannel | null = null;
  private prevPressed = new Map<string, boolean>();
  private baselinePressed = new Set<string>();
  private lastSyncSent = 0;
  private lastKnownSeq = 0;
  private lastKnownConfigSeq = 0;
  private started = false;

  get activePages(): MfdPageDef[] {
    const list = this.enabledPageIds
      .map((id) => ALL_MOBILE_PAGES.find((p) => p.id === id))
      .filter((p): p is MfdPageDef => !!p);
    return list.length > 0 ? list : [ALL_MOBILE_PAGES[0]];
  }

  get availableToAdd(): MfdPageDef[] {
    return ALL_MOBILE_PAGES.filter((p) => !this.enabledPageIds.includes(p.id));
  }

  get page(): MfdPageId {
    const pages = this.activePages;
    return pages[this.pageIndex % pages.length]?.id ?? "dashboard";
  }

  set page(val: MfdPageId | number) {
    const pages = this.activePages;
    if (typeof val === "number") {
      this.pageIndex = ((val % pages.length) + pages.length) % pages.length;
    } else {
      const idx = pages.findIndex((p) => p.id === val);
      if (idx >= 0) this.pageIndex = idx;
    }
  }

  constructor() {
    if (typeof window !== "undefined") {
      this.loadStored();
    }
  }

  formatBinding(b: WheelButtonBind | null): string {
    if (!b) return "Sin asignar";
    return b.label || (b.kind === "key" ? `Tecla ${b.key}` : `Botón ${(b.buttonIndex ?? 0) + 1}`);
  }

  private loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.enabledPageIds) && parsed.enabledPageIds.length > 0) {
        const valid = parsed.enabledPageIds.filter((id: string) =>
          ALL_MOBILE_PAGES.some((p) => p.id === id),
        ) as MfdPageId[];
        if (valid.length > 0) this.enabledPageIds = valid;
      }
      if (typeof parsed.mobileTheme === "string") {
        this.mobileTheme = parsed.mobileTheme as PresetThemeId;
      }
      if (typeof parsed.autoPopups === "boolean") {
        this.autoPopups = parsed.autoPopups;
      }
      if (typeof parsed.pageIndex === "number") {
        const len = this.activePages.length;
        this.pageIndex = ((parsed.pageIndex % len) + len) % len;
      }
      if (parsed.nextBind) this.nextBind = parsed.nextBind;
      if (parsed.prevBind) this.prevBind = parsed.prevBind;
      if (parsed.actionBinds && typeof parsed.actionBinds === "object") {
        this.actionBinds = { ...this.actionBinds, ...parsed.actionBinds };
      }
      if (Array.isArray(parsed.telemetryMarks)) {
        this.telemetryMarks = parsed.telemetryMarks.slice(0, 30);
      }
    } catch {
      // ignore
    }
  }

  private saveStored() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pageIndex: this.pageIndex,
          enabledPageIds: this.enabledPageIds,
          mobileTheme: this.mobileTheme,
          autoPopups: this.autoPopups,
          nextBind: this.nextBind,
          prevBind: this.prevBind,
          actionBinds: this.actionBinds,
          telemetryMarks: this.telemetryMarks.slice(0, 30),
        }),
      );
    } catch {
      // ignore
    }
  }

  private syncConfigToServer() {
    this.saveStored();
    this.channel?.postMessage({
      page: this.pageIndex,
      pages: $state.snapshot(this.enabledPageIds),
      mobileTheme: this.mobileTheme,
      autoPopups: this.autoPopups,
    });
    void fetch(`${MOBILE_SERVER_BASE}/__mobile_state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: this.pageIndex,
        pages: $state.snapshot(this.enabledPageIds),
        mobileTheme: this.mobileTheme,
        autoPopups: this.autoPopups,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.pageSeq === "number") this.lastKnownSeq = d.pageSeq;
        if (typeof d.configSeq === "number") this.lastKnownConfigSeq = d.configSeq;
      })
      .catch(() => {});
  }

  movePage(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= this.enabledPageIds.length) return;
    const currentId = this.page;
    const copy = [...this.enabledPageIds];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    this.enabledPageIds = copy;
    const newIdx = copy.indexOf(currentId);
    if (newIdx >= 0) this.pageIndex = newIdx;
    this.syncConfigToServer();
  }

  removePage(id: MfdPageId) {
    if (this.enabledPageIds.length <= 1) return; // Keep at least 1 page
    const copy = this.enabledPageIds.filter((x) => x !== id);
    if (copy.length === 0) return;
    this.enabledPageIds = copy;
    if (this.pageIndex >= copy.length) {
      this.pageIndex = copy.length - 1;
    }
    this.syncConfigToServer();
  }

  addPage(id: MfdPageId) {
    if (this.enabledPageIds.includes(id)) return;
    this.enabledPageIds = [...this.enabledPageIds, id];
    this.syncConfigToServer();
  }

  /** Atomically adds a page (if needed), switches to it, and optionally pushes the latest appConfig in a single request. */
  activatePage(id: MfdPageId, appConfig?: unknown) {
    if (!this.enabledPageIds.includes(id)) {
      this.enabledPageIds = [...this.enabledPageIds, id];
    }
    const idx = this.enabledPageIds.indexOf(id);
    if (idx >= 0) {
      this.pageIndex = idx;
    }
    this.saveStored();
    const payload: Record<string, unknown> = {
      page: this.pageIndex,
      pages: $state.snapshot(this.enabledPageIds),
      mobileTheme: this.mobileTheme,
      autoPopups: this.autoPopups,
    };
    if (appConfig) payload.appConfig = appConfig;
    this.channel?.postMessage(payload);
    void fetch(`${MOBILE_SERVER_BASE}/__mobile_state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.pageSeq === "number") this.lastKnownSeq = d.pageSeq;
        if (typeof d.configSeq === "number") this.lastKnownConfigSeq = d.configSeq;
      })
      .catch(() => {});
  }

  resetPages() {
    this.enabledPageIds = [...DEFAULT_MOBILE_PAGE_IDS];
    this.pageIndex = 0;
    this.syncConfigToServer();
  }

  setMobileTheme(theme: PresetThemeId, syncPcTheme = true) {
    this.mobileTheme = theme;
    this.syncConfigToServer();
    if (syncPcTheme) {
      applyCompleteOverlayTheme(theme, true);
    }
  }

  setAutoPopups(val: boolean) {
    this.autoPopups = val;
    this.syncConfigToServer();
  }

  startHost() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    void this.fetchMobileInfo();
    const isClientView =
      location.hash.startsWith("#mobile") ||
      location.hash.startsWith("#dash") ||
      location.hash.startsWith("#pitwall") ||
      location.pathname === "/mobile" ||
      location.pathname === "/dash" ||
      /android|iphone|ipod/i.test(navigator.userAgent);

    const isOverlayWindow = location.hash.startsWith("#overlay");

    if (!isClientView && !isOverlayWindow) {
      // Only the PC Companion pushes initial config on startup
      this.syncConfigToServer();
      setInterval(() => {
        void this.fetchMobileInfo();
      }, 5000);
    }

    if ("BroadcastChannel" in window) {
      this.channel = new BroadcastChannel("mdt_mfd_channel");
      this.channel.onmessage = (ev) => {
        if (Array.isArray(ev.data?.pages) && ev.data.pages.length > 0) {
          this.enabledPageIds = ev.data.pages;
        }
        if (typeof ev.data?.mobileTheme === "string") {
          this.mobileTheme = ev.data.mobileTheme;
        }
        if (typeof ev.data?.page === "number") {
          const len = this.activePages.length;
          this.pageIndex = ((ev.data.page % len) + len) % len;
        }
        if ("nextBind" in (ev.data ?? {})) {
          this.nextBind = ev.data.nextBind;
        }
        if ("prevBind" in (ev.data ?? {})) {
          this.prevBind = ev.data.prevBind;
        }
        if ("actionBinds" in (ev.data ?? {})) {
          this.actionBinds = { ...this.actionBinds, ...ev.data.actionBinds };
        }
      };
    }

    const triggerWheelPage = (dir: 1 | -1) => {
      // Cross-window dedup so Companion + Overlay never double-step on the same wheel press
      try {
        const nowMs = Date.now();
        const lastMs = Number(localStorage.getItem("mdt_wheel_last_step") || "0");
        if (nowMs - lastMs < 260) return;
        localStorage.setItem("mdt_wheel_last_step", String(nowMs));
      } catch {}
      if (dir === 1) this.nextPage();
      else this.prevPage();
    };

    const triggerGlobalAction = (action: WheelGlobalAction) => {
      try {
        const nowMs = Date.now();
        const k = `mdt_wheel_act_${action}`;
        const lastMs = Number(localStorage.getItem(k) || "0");
        if (nowMs - lastMs < 350) return;
        localStorage.setItem(k, String(nowMs));
      } catch {}
      if (action === "toggleOverlay") {
        void api.getStatus().then((st) => api.setOverlayVisible(!st.overlayVisible)).catch(() => {});
        toasts.push("Overlay alternado desde volante", { kind: "info", durationMs: 2000 });
      } else if (action === "toggleSpotter") {
        config.value.spotter.enabled = !config.value.spotter.enabled;
        saveConfig();
        toasts.push(config.value.spotter.enabled ? "🎙️ Spotter activado" : "🔇 Spotter silenciado", { kind: "info", durationMs: 2200 });
      } else if (action === "nextProfile") {
        cycleNextProfile();
        const activeName = config.value.profiles[config.value.activeProfile]?.name ?? "Perfil";
        toasts.push(`🗂️ Perfil: ${activeName}`, { kind: "success", durationMs: 2200 });
      } else if (action === "markLapNote") {
        const stamp = new Date().toTimeString().slice(0, 8);
        this.telemetryMarks = [{ time: stamp, label: `Marca volante (${stamp})` }, ...this.telemetryMarks.slice(0, 29)];
        this.saveStored();
        toasts.push(`📌 Marca de telemetría guardada (${stamp})`, { kind: "success", durationMs: 2400 });
      }
    };

    const assignLearnedBind = (bind: WheelButtonBind) => {
      const target = this.learning;
      if (!target) return;
      if (target === "next") this.nextBind = bind;
      else if (target === "prev") this.prevBind = bind;
      else this.actionBinds = { ...this.actionBinds, [target]: bind };
      this.learning = null;
      this.saveStored();
      this.channel?.postMessage({
        nextBind: $state.snapshot(this.nextBind),
        prevBind: $state.snapshot(this.prevBind),
        actionBinds: $state.snapshot(this.actionBinds),
      });
    };

    if (!isClientView) {
      if (!isOverlayWindow) {
        window.addEventListener("keydown", (e) => {
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLSelectElement ||
            e.target instanceof HTMLTextAreaElement
          ) {
            return;
          }
          if (this.learning) {
            e.preventDefault();
            if (e.key === "Escape") {
              this.learning = null;
              return;
            }
            const bind: WheelButtonBind = {
              kind: "key",
              key: e.code || e.key,
              label: `Tecla ${e.key.toUpperCase()}`,
            };
            assignLearnedBind(bind);
            return;
          }

          if (this.nextBind?.kind === "key" && (e.code === this.nextBind.key || e.key === this.nextBind.key)) {
            e.preventDefault();
            triggerWheelPage(1);
          } else if (this.prevBind?.kind === "key" && (e.code === this.prevBind.key || e.key === this.prevBind.key)) {
            e.preventDefault();
            triggerWheelPage(-1);
          } else {
            for (const [act, b] of Object.entries(this.actionBinds) as [WheelGlobalAction, WheelButtonBind | null][]) {
              if (b?.kind === "key" && (e.code === b.key || e.key === b.key)) {
                e.preventDefault();
                triggerGlobalAction(act);
                break;
              }
            }
          }
        });
      }

      // Poll gamepads via setInterval (50ms) in BOTH Companion and always-on-top Overlay window
      // so steering wheel buttons work reliably even while LMU is fullscreen and Companion is minimized!
      const pollGamepads = () => {
        if (typeof navigator !== "undefined" && "getGamepads" in navigator) {
          const pads = navigator.getGamepads ? navigator.getGamepads() : [];
          const names: string[] = [];
          for (let gi = 0; gi < pads.length; gi++) {
            const pad = pads[gi];
            if (!pad) continue;
            const shortPadName = pad.id.replace(/\s*\([^)]*\)\s*/g, "").trim() || `Volante/Mando #${gi + 1}`;
            names.push(shortPadName);

            for (let bi = 0; bi < pad.buttons.length; bi++) {
              const k = `${gi}:${bi}`;
              const isDown = pad.buttons[bi]?.pressed ?? false;
              const wasDown = this.prevPressed.get(k) ?? false;
              this.prevPressed.set(k, isDown);

              if (isDown && !wasDown && !this.baselinePressed.has(k)) {
                this.lastPressedInfo = `${shortPadName} · Botón ${bi + 1}`;

                if (!isOverlayWindow && this.learning) {
                  const bind: WheelButtonBind = {
                    kind: "gamepad",
                    gamepadIndex: gi,
                    buttonIndex: bi,
                    gamepadId: pad.id,
                    label: `${shortPadName} · Botón ${bi + 1}`,
                  };
                  assignLearnedBind(bind);
                  continue;
                }

                if (
                  this.nextBind?.kind === "gamepad" &&
                  this.nextBind.buttonIndex === bi &&
                  (this.nextBind.gamepadIndex === gi || this.nextBind.gamepadId === pad.id)
                ) {
                  triggerWheelPage(1);
                } else if (
                  this.prevBind?.kind === "gamepad" &&
                  this.prevBind.buttonIndex === bi &&
                  (this.prevBind.gamepadIndex === gi || this.prevBind.gamepadId === pad.id)
                ) {
                  triggerWheelPage(-1);
                } else {
                  for (const [act, b] of Object.entries(this.actionBinds) as [WheelGlobalAction, WheelButtonBind | null][]) {
                    if (
                      b?.kind === "gamepad" &&
                      b.buttonIndex === bi &&
                      (b.gamepadIndex === gi || b.gamepadId === pad.id)
                    ) {
                      triggerGlobalAction(act);
                      break;
                    }
                  }
                }
              } else if (!isDown) {
                this.baselinePressed.delete(k);
              }
            }
          }
          if (!isOverlayWindow) {
            this.connectedGamepads = names;
          }
        }
      };
      setInterval(pollGamepads, 50);
    }

    if (!isClientView) {
      setInterval(async () => {
        try {
          const res = await fetch(`${MOBILE_SERVER_BASE}/__mobile_state`, { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.configSeq === "number" && data.configSeq > this.lastKnownConfigSeq) {
            this.lastKnownConfigSeq = data.configSeq;
            if (Array.isArray(data.pages) && data.pages.length > 0) {
              this.enabledPageIds = data.pages;
            }
            if (typeof data.mobileTheme === "string") {
              const newTheme = data.mobileTheme as PresetThemeId;
              if (this.mobileTheme !== newTheme) {
                this.mobileTheme = newTheme;
              }
            }
            if (typeof data.autoPopups === "boolean") {
              this.autoPopups = data.autoPopups;
            }
            this.saveStored();
          }
          if (typeof data.pageSeq === "number" && data.pageSeq > this.lastKnownSeq) {
            this.lastKnownSeq = data.pageSeq;
            const len = this.activePages.length;
            if (typeof data.page === "number" && data.page !== this.pageIndex) {
              this.pageIndex = ((data.page % len) + len) % len;
              this.channel?.postMessage({ page: this.pageIndex });
            }
          }
        } catch {
          // ignore
        }
      }, 350);
    }
  }

  selectIp(ip: string) {
    this.selectedIp = ip;
    this.mobileUrl = `http://${ip}:1420/#mobile`;
    this.pitwallUrl = `http://${ip}:1420/#pitwall`;
  }

  async openFirewall(): Promise<boolean> {
    if (this.firewallBusy) return this.firewallOpen;
    this.firewallBusy = true;
    try {
      if (isNativeTauri()) {
        const ok = await api.openMobileFirewall();
        this.firewallOpen = ok;
      }
      await this.fetchMobileInfo();
      return this.firewallOpen;
    } catch {
      return false;
    } finally {
      this.firewallBusy = false;
    }
  }

  async fetchMobileInfo() {
    try {
      let info: { ips?: string[]; port?: number; url?: string; pitwallUrl?: string; firewallOpen?: boolean } | null = null;
      if (isNativeTauri()) {
        info = await api.getMobileNetworkInfo().catch(() => null);
      }
      if (!info) {
        const res = await fetch(`${MOBILE_SERVER_BASE}/__mobile_info`, { cache: "no-store" });
        if (res.ok && res.headers.get("content-type")?.includes("json")) {
          info = await res.json();
        }
      }
      if (info) {
        if (typeof info.firewallOpen === "boolean") {
          this.firewallOpen = info.firewallOpen;
        }
        if (Array.isArray(info.ips) && info.ips.length > 0) {
          this.lanIps = info.ips;
          const activeIp = this.selectedIp && info.ips.includes(this.selectedIp) ? this.selectedIp : info.ips[0];
          this.selectedIp = activeIp;
          const port = info.port || 1420;
          this.mobileUrl = `http://${activeIp}:${port}/#mobile`;
          this.pitwallUrl = `http://${activeIp}:${port}/#pitwall`;
        } else if (info.url) {
          this.mobileUrl = info.url;
          this.pitwallUrl = info.url.replace("#mobile", "#pitwall");
        }
      }
    } catch {
      // ignore
    }
  }

  startLearning(target: "next" | "prev" | WheelGlobalAction) {
    this.baselinePressed.clear();
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      for (let gi = 0; gi < pads.length; gi++) {
        const pad = pads[gi];
        if (!pad) continue;
        for (let bi = 0; bi < pad.buttons.length; bi++) {
          if (pad.buttons[bi]?.pressed) {
            this.baselinePressed.add(`${gi}:${bi}`);
          }
        }
      }
    }
    this.learning = target;
  }

  clearActionBind(action: WheelGlobalAction) {
    this.actionBinds = { ...this.actionBinds, [action]: null };
    this.saveStored();
    this.channel?.postMessage({ actionBinds: $state.snapshot(this.actionBinds) });
  }

  cancelLearning() {
    this.learning = null;
  }

  setPage(target: number | MfdPageId) {
    const pages = this.activePages;
    const idx =
      typeof target === "number"
        ? ((target % pages.length) + pages.length) % pages.length
        : Math.max(0, pages.findIndex((p) => p.id === target));
    this.pageIndex = idx;
    this.saveStored();
    this.channel?.postMessage({ page: idx });
    void fetch(`${MOBILE_SERVER_BASE}/__mobile_state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: idx }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.pageSeq === "number") this.lastKnownSeq = d.pageSeq;
      })
      .catch(() => {});
  }

  nextPage() {
    this.setPage(this.pageIndex + 1);
  }

  prevPage() {
    this.setPage(this.pageIndex - 1);
  }

  pushSnapshotToMobile(snap: Snapshot | null) {
    if (!snap) return;
    const now = performance.now();
    if (now - this.lastSyncSent < 33) return;
    this.lastSyncSent = now;
    void fetch(`${MOBILE_SERVER_BASE}/__mobile_state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snap }),
    }).catch(() => {});
  }
}

export const wheelControl = new WheelController();
