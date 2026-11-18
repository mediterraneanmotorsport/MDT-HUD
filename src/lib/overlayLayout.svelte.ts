import { listen } from "@tauri-apps/api/event";
import { api, isNativeTauri } from "./api";
import type { OverlayLayoutInfo } from "./types";

class OverlayLayout {
  info = $state<OverlayLayoutInfo>({
    isMultiMonitor: false,
    primaryOffsetX: 0,
    primaryOffsetY: 0,
    primaryWidth: 1920,
    primaryHeight: 1080,
    boundsX: 0,
    boundsY: 0,
    boundsWidth: 1920,
    boundsHeight: 1080,
    scaleFactor: 1.0,
  });

  /** Logical offset in CSS pixels from the left edge of the overlay window to the left edge of the primary monitor */
  logicalOffsetX = $derived.by(() => {
    if (!this.info.isMultiMonitor) return 0;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return Math.round(this.info.primaryOffsetX / dpr);
  });

  /** Logical offset in CSS pixels from the top edge of the overlay window to the top edge of the primary monitor */
  logicalOffsetY = $derived.by(() => {
    if (!this.info.isMultiMonitor) return 0;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return Math.round(this.info.primaryOffsetY / dpr);
  });

  /** Width in CSS pixels of the primary monitor */
  logicalPrimaryWidth = $derived.by(() => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return Math.round(this.info.primaryWidth / dpr) || (typeof window !== "undefined" ? window.innerWidth : 1920);
  });

  /** Height in CSS pixels of the primary monitor */
  logicalPrimaryHeight = $derived.by(() => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return Math.round(this.info.primaryHeight / dpr) || (typeof window !== "undefined" ? window.innerHeight : 1080);
  });

  private started = false;

  async refresh() {
    if (!isNativeTauri()) return;
    try {
      const layout = await api.getOverlayLayout();
      if (layout) {
        this.info = layout;
      }
    } catch {}
  }

  init() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    void this.refresh();
    void listen("overlay-layout-changed", () => {
      void this.refresh();
    });
    void listen("config-changed", () => {
      void this.refresh();
    });
    window.addEventListener("resize", () => {
      void this.refresh();
    });
  }
}

export const overlayLayout = new OverlayLayout();
