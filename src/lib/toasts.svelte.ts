export type ToastKind = "info" | "success" | "warn" | "error";

export interface ToastItem {
  id: number;
  title: string;
  desc?: string;
  kind: ToastKind;
  durationMs: number;
  createdAt: number;
}

class ToastStore {
  items = $state<ToastItem[]>([]);
  private seq = 0;

  push(title: string, opts?: { desc?: string; kind?: ToastKind; durationMs?: number }) {
    const id = ++this.seq;
    const durationMs = opts?.durationMs ?? 3600;
    const item: ToastItem = {
      id,
      title,
      desc: opts?.desc,
      kind: opts?.kind ?? "info",
      durationMs,
      createdAt: Date.now(),
    };
    this.items = [...this.items.slice(-4), item];
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
    return id;
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new ToastStore();
