import type { Snapshot } from "./types";

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
  | "electronics";

export interface MfdPageDef {
  id: MfdPageId;
  short: string;
  shortTitle: string;
  title: string;
  description: string;
}

export const MFD_PAGES: MfdPageDef[] = [
  {
    id: "dashboard",
    short: "Dashboard DDU",
    shortTitle: "DASHBOARD DDU",
    title: "1 · Cuadro de Mandos (Dashboard)",
    description: "Velocidad, marcha, luces LED de RPM, pedales y volante a pantalla completa.",
  },
  {
    id: "relative",
    short: "Relativo",
    shortTitle: "RELATIVO",
    title: "2 · Relativo en Pista",
    description: "Coches cercanos en pista, diferencias en vivo, doblados y energía.",
  },
  {
    id: "standings",
    short: "Clasificación",
    shortTitle: "CLASIFICACIÓN",
    title: "3 · Clasificación (Standings)",
    description: "Torre de tiempos de tu categoría y rivales con paradas y neumáticos.",
  },
  {
    id: "damage",
    short: "Daños",
    shortTitle: "DAÑOS DEL COCHE",
    title: "4 · Daños del Coche",
    description: "Silueta detallada de daños de aerodinámica, alerones y suspensión.",
  },
  {
    id: "tyres",
    short: "Neumáticos",
    shortTitle: "NEUMÁTICOS Y FRENOS",
    title: "5 · Neumáticos y Frenos",
    description: "Temperaturas, desgaste, ritmo por vuelta, vueltas restantes y frenos.",
  },
  {
    id: "fuel",
    short: "Combustible",
    shortTitle: "COMBUSTIBLE Y ENERGÍA",
    title: "6 · Combustible y Energía",
    description: "Autonomía de combustible/energía, consumo por vuelta y parada estimada.",
  },
  {
    id: "liftcoast",
    short: "Lift & Coast",
    shortTitle: "LIFT & COAST",
    title: "7 · Ahorro Lift & Coast",
    description: "Objetivo de ahorro por vuelta y regeneración híbrida ERS.",
  },
  {
    id: "pacecatch",
    short: "Cazador",
    shortTitle: "CAZADOR DE RIVALES",
    title: "8 · Cazador de Rivales",
    description: "Vueltas estimadas para dar caza al coche de delante o ser alcanzado.",
  },
  {
    id: "tracklimits",
    short: "Límites",
    shortTitle: "LÍMITES DE PISTA",
    title: "9 · Límites de Pista",
    description: "Contador de avisos y puntos de sanción por Track Limits.",
  },
  {
    id: "electronics",
    short: "Electrónica",
    shortTitle: "ELECTRÓNICA DEL COCHE",
    title: "10 · Electrónica (TC / ABS / Mapa)",
    description: "Control de tracción, ABS, mapa motor, reparto de frenada y barra estabilizadora.",
  },
];

export interface WheelButtonBind {
  kind: "gamepad" | "key";
  gamepadIndex?: number;
  buttonIndex?: number;
  gamepadId?: string;
  key?: string;
  label: string;
}

const STORAGE_KEY = "mdt_wheel_mfd_v2";

class WheelController {
  pageIndex = $state(0);
  learning = $state<"next" | "prev" | null>(null);
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
  connectedGamepads = $state<string[]>([]);
  mobileUrl = $state("http://localhost:1420/#mobile");
  lanIps = $state<string[]>([]);
  lastPressedInfo = $state<string>("");

  private channel: BroadcastChannel | null = null;
  private prevPressed = new Map<string, boolean>();
  private baselinePressed = new Set<string>();
  private lastSyncSent = 0;
  private lastKnownSeq = 0;
  private started = false;

  get page(): MfdPageId {
    return MFD_PAGES[this.pageIndex % MFD_PAGES.length]?.id ?? "dashboard";
  }

  set page(val: MfdPageId | number) {
    if (typeof val === "number") {
      this.pageIndex = ((val % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
    } else {
      const idx = MFD_PAGES.findIndex((p) => p.id === val);
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
      if (typeof parsed.pageIndex === "number") {
        this.pageIndex = ((parsed.pageIndex % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
      }
      if (parsed.nextBind) this.nextBind = parsed.nextBind;
      if (parsed.prevBind) this.prevBind = parsed.prevBind;
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
          nextBind: this.nextBind,
          prevBind: this.prevBind,
        }),
      );
    } catch {
      // ignore
    }
  }

  startHost() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    void this.fetchMobileInfo();

    if ("BroadcastChannel" in window) {
      this.channel = new BroadcastChannel("mdt_mfd_channel");
      this.channel.onmessage = (ev) => {
        if (typeof ev.data?.page === "number") {
          this.pageIndex = ((ev.data.page % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
        }
      };
    }

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
        if (this.learning === "next") this.nextBind = bind;
        else this.prevBind = bind;
        this.learning = null;
        this.saveStored();
        return;
      }

      if (this.nextBind?.kind === "key" && (e.code === this.nextBind.key || e.key === this.nextBind.key)) {
        e.preventDefault();
        this.nextPage();
      } else if (this.prevBind?.kind === "key" && (e.code === this.prevBind.key || e.key === this.prevBind.key)) {
        e.preventDefault();
        this.prevPage();
      }
    });

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

              if (this.learning) {
                const bind: WheelButtonBind = {
                  kind: "gamepad",
                  gamepadIndex: gi,
                  buttonIndex: bi,
                  gamepadId: pad.id,
                  label: `${shortPadName} · Botón ${bi + 1}`,
                };
                if (this.learning === "next") this.nextBind = bind;
                else this.prevBind = bind;
                this.learning = null;
                this.saveStored();
                continue;
              }

              if (
                this.nextBind?.kind === "gamepad" &&
                this.nextBind.buttonIndex === bi &&
                (this.nextBind.gamepadIndex === gi || this.nextBind.gamepadId === pad.id)
              ) {
                this.nextPage();
              } else if (
                this.prevBind?.kind === "gamepad" &&
                this.prevBind.buttonIndex === bi &&
                (this.prevBind.gamepadIndex === gi || this.prevBind.gamepadId === pad.id)
              ) {
                this.prevPage();
              }
            } else if (!isDown) {
              this.baselinePressed.delete(k);
            }
          }
        }
        this.connectedGamepads = names;
      }
      requestAnimationFrame(pollGamepads);
    };
    requestAnimationFrame(pollGamepads);

    setInterval(async () => {
      try {
        const res = await fetch("/__mobile_state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.pageSeq === "number" && data.pageSeq > this.lastKnownSeq) {
          this.lastKnownSeq = data.pageSeq;
          if (typeof data.page === "number" && data.page !== this.pageIndex) {
            this.pageIndex = ((data.page % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
            this.channel?.postMessage({ page: this.pageIndex });
          }
        }
      } catch {
        // ignore
      }
    }, 350);
  }

  async fetchMobileInfo() {
    try {
      const res = await fetch("/__mobile_info", { cache: "no-store" });
      if (res.ok && res.headers.get("content-type")?.includes("json")) {
        const info = await res.json();
        if (info.url) this.mobileUrl = info.url;
        if (Array.isArray(info.ips)) this.lanIps = info.ips;
      }
    } catch {
      // ignore
    }
  }

  startLearning(target: "next" | "prev") {
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

  cancelLearning() {
    this.learning = null;
  }

  setPage(target: number | MfdPageId) {
    const idx =
      typeof target === "number"
        ? ((target % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length
        : Math.max(0, MFD_PAGES.findIndex((p) => p.id === target));
    this.pageIndex = idx;
    this.saveStored();
    this.channel?.postMessage({ page: idx });
    void fetch("/__mobile_state", {
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
    if (now - this.lastSyncSent < 65) return;
    this.lastSyncSent = now;
    void fetch("/__mobile_state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snap }),
    }).catch(() => {});
  }
}

export const wheelControl = new WheelController();
