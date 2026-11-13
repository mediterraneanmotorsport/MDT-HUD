import type { Snapshot } from "./types";

export interface MfdPageDef {
  id: "relative" | "standings" | "damage-tyres" | "fuel-lift" | "pace-limits" | "ddu-only";
  shortTitle: string;
  title: string;
  description: string;
}

export const MFD_PAGES: MfdPageDef[] = [
  {
    id: "relative",
    shortTitle: "RELATIVO",
    title: "1 · Relativo en Pista",
    description: "Coches cercanos en pista, diferencias en vivo, doblados y energía.",
  },
  {
    id: "standings",
    shortTitle: "CLASIFICACIÓN",
    title: "2 · Clasificación (Standings)",
    description: "Torre de tiempos de tu categoría y rivales con paradas y neumáticos.",
  },
  {
    id: "damage-tyres",
    shortTitle: "DAÑOS / GOMAS",
    title: "3 · Daños del Coche y Neumáticos",
    description: "Silueta de daños de aerodinámica/suspensión + temperaturas y desgaste de gomas.",
  },
  {
    id: "fuel-lift",
    shortTitle: "COMBUSTIBLE",
    title: "4 · Combustible, Energía y Lift & Coast",
    description: "Autonomía de combustible/energía, calculadora de ahorro y regeneración ERS.",
  },
  {
    id: "pace-limits",
    shortTitle: "CAZADOR / LÍMITES",
    title: "5 · Cazador de Rivales y Track Limits",
    description: "Vueltas para alcanzar al coche de delante/detrás + puntos de límites de pista.",
  },
  {
    id: "ddu-only",
    shortTitle: "SOLO DDU",
    title: "6 · Solo Cuadro de Mandos DDU",
    description: "Velocidad, marcha, luces LED de RPM, pedales y electrónica a pantalla completa.",
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

const STORAGE_KEY = "mdt_wheel_mfd_v1";

class WheelController {
  page = $state(0);
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

  constructor() {
    if (typeof window !== "undefined") {
      this.loadStored();
    }
  }

  private loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.page === "number") this.page = parsed.page % MFD_PAGES.length;
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
          page: this.page,
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
          this.page = ((ev.data.page % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
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

            // Rising edge detection (ignore buttons that are permanently held down like toggle switches when starting learning)
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

    // Periodically check if the mobile phone changed the page via touch
    setInterval(async () => {
      try {
        const res = await fetch("/__mobile_state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.pageSeq === "number" && data.pageSeq > this.lastKnownSeq) {
          this.lastKnownSeq = data.pageSeq;
          if (typeof data.page === "number" && data.page !== this.page) {
            this.page = ((data.page % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
            this.channel?.postMessage({ page: this.page });
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

  setPage(idx: number) {
    const next = ((idx % MFD_PAGES.length) + MFD_PAGES.length) % MFD_PAGES.length;
    this.page = next;
    this.saveStored();
    this.channel?.postMessage({ page: next });
    void fetch("/__mobile_state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: next }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.pageSeq === "number") this.lastKnownSeq = d.pageSeq;
      })
      .catch(() => {});
  }

  nextPage() {
    this.setPage(this.page + 1);
  }

  prevPage() {
    this.setPage(this.page - 1);
  }

  /** Pushes telemetry snapshot from the PC to the Vite mobile relay (~15 Hz max). */
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
