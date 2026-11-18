<script lang="ts">
  import type { Snippet } from "svelte";
  import { config, saveConfig, type WidgetConfig } from "../lib/config.svelte";
  import { overlayLayout } from "../lib/overlayLayout.svelte";

  let {
    id,
    name,
    edit,
    customWidgets,
    children,
  }: {
    id: string;
    name: string;
    edit: boolean;
    customWidgets?: Record<string, WidgetConfig>;
    children: Snippet;
  } = $props();

  const cfg: WidgetConfig = $derived(customWidgets ? (customWidgets[id] ?? config.value.widgets[id]) : config.value.widgets[id]);
  const g = $derived(config.value.general);

  let dragging = $state(false);
  let start = { px: 0, py: 0, x: 0, y: 0 };
  let frameEl: HTMLDivElement | undefined = $state();
  let vpW = $state(typeof window !== "undefined" ? window.innerWidth : 1920);
  let vpH = $state(typeof window !== "undefined" ? window.innerHeight : 1080);

  $effect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      vpW = window.innerWidth || 1920;
      vpH = window.innerHeight || 1080;
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const scaleVal = $derived(g.scale * cfg.size);

  // Posicionamiento consistente anclado siempre al Monitor Principal:
  // En modo multimonitor ("__all__"), sumamos el desplazamiento del monitor principal dentro de la ventana global.
  const isMulti = $derived(overlayLayout.info.isMultiMonitor);
  const rawX = $derived((isMulti ? overlayLayout.logicalOffsetX : 0) + cfg.x);
  const rawY = $derived((isMulti ? overlayLayout.logicalOffsetY : 0) + cfg.y);

  // En modo monitor individual ("Monitor principal"), evitamos que los widgets se pierdan fuera de pantalla
  const clampedX = $derived(
    isMulti || edit
      ? rawX
      : Math.max(10, Math.min(vpW - 100, rawX))
  );
  const clampedY = $derived(
    isMulti || edit
      ? rawY
      : Math.max(10, Math.min(vpH - 40, rawY))
  );

  function snap(v: number) {
    const s = config.value.general.snap || 1;
    return Math.round(v / s) * s;
  }

  function onPointerDown(e: PointerEvent) {
    if (!edit || e.button !== 0) return;
    dragging = true;
    start = { px: e.clientX, py: e.clientY, x: cfg.x, y: cfg.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    cfg.x = snap(start.x + e.clientX - start.px);
    cfg.y = snap(start.y + e.clientY - start.py);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    saveConfig();
  }

  // Scroll resizes this widget; Shift + scroll resizes every widget.
  function onWheel(e: WheelEvent) {
    if (!edit) return;
    e.preventDefault();
    const step = (e.deltaY || e.deltaX) < 0 ? 0.05 : -0.05;
    const bump = (v: number) => Math.min(3, Math.max(0.4, Math.round((v + step) * 100) / 100));
    if (e.shiftKey) g.scale = bump(g.scale);
    else cfg.size = bump(cfg.size);
    saveConfig();
  }
</script>

<div
  bind:this={frameEl}
  class="absolute top-0 left-0 origin-top-left"
  class:cursor-move={edit}
  class:z-10={dragging}
  style:transform="translate({clampedX}px, {clampedY}px) scale({scaleVal})"
  style:opacity={g.opacity * cfg.alpha}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  role="presentation"
>
  {#if edit}
    <div
      class="pointer-events-none absolute -inset-1 rounded-[10px] border border-dashed"
      style:border-color={dragging ? "var(--color-accent)" : "rgb(255 255 255 / 0.45)"}
    ></div>
    <div
      class="pointer-events-none absolute -top-6 left-0 flex items-center gap-2 rounded-md bg-accent px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap text-white"
    >
      {name}
      <span class="font-normal opacity-80">{Math.round(g.scale * cfg.size * 100)}%</span>
    </div>
  {/if}
  <div class:pointer-events-none={edit}>
    {@render children()}
  </div>
</div>
