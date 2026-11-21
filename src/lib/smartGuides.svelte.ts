export interface GuideRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

class SmartGuidesState {
  /** Active vertical guide lines (viewport CSS x positions) */
  guidesX = $state<number[]>([]);
  /** Active horizontal guide lines (viewport CSS y positions) */
  guidesY = $state<number[]>([]);

  clear() {
    if (this.guidesX.length) this.guidesX = [];
    if (this.guidesY.length) this.guidesY = [];
  }

  /**
   * Computes magnetic snap adjustments against other widget frames and screen centers.
   * Returns snapped screen coordinates and updates active visual guide lines.
   */
  snapToGuides(
    draggingId: string,
    screenX: number,
    screenY: number,
    width: number,
    height: number,
    primaryOffsetX: number,
    primaryOffsetY: number,
    primaryWidth: number,
    primaryHeight: number,
    threshold = 7,
  ): { x: number; y: number } {
    const xTargets: number[] = [
      primaryOffsetX + primaryWidth / 2,
      primaryOffsetX + 20,
      primaryOffsetX + primaryWidth - 20,
    ];
    const yTargets: number[] = [
      primaryOffsetY + primaryHeight / 2,
      primaryOffsetY + 20,
      primaryOffsetY + primaryHeight - 20,
    ];

    if (typeof document !== "undefined") {
      const nodes = document.querySelectorAll<HTMLElement>("[data-widget-frame]");
      for (const el of nodes) {
        const oid = el.dataset.widgetFrame;
        if (!oid || oid === draggingId) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        xTargets.push(r.left, r.left + r.width / 2, r.right);
        yTargets.push(r.top, r.top + r.height / 2, r.bottom);
      }
    }

    const myXPoints = [
      { pos: screenX, offset: 0 },
      { pos: screenX + width / 2, offset: width / 2 },
      { pos: screenX + width, offset: width },
    ];
    const myYPoints = [
      { pos: screenY, offset: 0 },
      { pos: screenY + height / 2, offset: height / 2 },
      { pos: screenY + height, offset: height },
    ];

    let bestDx = threshold + 1;
    let snappedX = screenX;
    let activeX: number | null = null;

    for (const pt of myXPoints) {
      for (const t of xTargets) {
        const d = Math.abs(pt.pos - t);
        if (d < bestDx) {
          bestDx = d;
          snappedX = t - pt.offset;
          activeX = t;
        }
      }
    }

    let bestDy = threshold + 1;
    let snappedY = screenY;
    let activeY: number | null = null;

    for (const pt of myYPoints) {
      for (const t of yTargets) {
        const d = Math.abs(pt.pos - t);
        if (d < bestDy) {
          bestDy = d;
          snappedY = t - pt.offset;
          activeY = t;
        }
      }
    }

    this.guidesX = activeX != null ? [activeX] : [];
    this.guidesY = activeY != null ? [activeY] : [];

    return { x: snappedX, y: snappedY };
  }
}

export const smartGuides = new SmartGuidesState();
