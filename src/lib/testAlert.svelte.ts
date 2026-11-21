import { emit, listen } from "@tauri-apps/api/event";
import { isNativeTauri } from "./api";

export const REACTIVE_WIDGET_IDS = new Set([
  "spotter",
  "battleforpos",
  "flags",
  "multiclasstraffic",
  "driverlowerthird",
  "gridpodium",
]);

class TestAlertBus {
  activeUntil = $state<Record<string, number>>({});
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private channel: BroadcastChannel | null = null;
  private started = false;

  private ensureChannel() {
    if (!this.channel && typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel("mdt-test-widget");
      } catch {}
    }
    return this.channel;
  }

  private activateLocal(id: string, durationMs = 4500) {
    const until = Date.now() + durationMs;
    this.activeUntil = { ...this.activeUntil, [id]: until };
    if (this.timers.has(id)) clearTimeout(this.timers.get(id)!);
    this.timers.set(
      id,
      setTimeout(() => {
        const next = { ...this.activeUntil };
        delete next[id];
        this.activeUntil = next;
      }, durationMs),
    );
  }

  /** Called from Companion UI to fire a live preview alert on the Overlay / OBS */
  trigger(id: string, durationMs = 4500) {
    this.activateLocal(id, durationMs);
    if (isNativeTauri()) {
      void emit("mdt-test-widget", { id, durationMs });
    }
    try {
      this.ensureChannel()?.postMessage({ id, durationMs });
    } catch {}
  }

  isTesting(id: string): boolean {
    const until = this.activeUntil[id];
    return typeof until === "number" && until > Date.now();
  }

  init() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    if (isNativeTauri()) {
      void listen<{ id: string; durationMs?: number }>("mdt-test-widget", (e) => {
        if (e.payload?.id) this.activateLocal(e.payload.id, e.payload.durationMs ?? 4500);
      });
    }
    const ch = this.ensureChannel();
    if (ch) {
      ch.onmessage = (e) => {
        if (e.data?.id) this.activateLocal(e.data.id, e.data.durationMs ?? 4500);
      };
    }
  }
}

export const testAlert = new TestAlertBus();
