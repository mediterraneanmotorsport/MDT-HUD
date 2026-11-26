<script lang="ts">
  import type { Snippet } from "svelte";
  import { config, saveConfig, type TrackEntryAnim, type WidgetConfig } from "../lib/config.svelte";
  import { live } from "../lib/live.svelte";
  import { overlayLayout } from "../lib/overlayLayout.svelte";
  import { smartGuides } from "../lib/smartGuides.svelte";

  let {
    id,
    name,
    edit,
    selected = false,
    customWidgets,
    profileAnimKey = 0,
    trackEntryAnimKey = 0,
    trackEntryAnim = "ignition",
    staggerIndex = 0,
    nightMultiplier = 1,
    onSelect,
    onConfigure,
    onRemove,
    children,
  }: {
    id: string;
    name: string;
    edit: boolean;
    selected?: boolean;
    customWidgets?: Record<string, WidgetConfig>;
    profileAnimKey?: number;
    trackEntryAnimKey?: number;
    trackEntryAnim?: TrackEntryAnim;
    staggerIndex?: number;
    nightMultiplier?: number;
    onSelect?: (id: string) => void;
    onConfigure?: (id: string) => void;
    onRemove?: (id: string) => void;
    children: Snippet;
  } = $props();

  const cfg: WidgetConfig = $derived(customWidgets ? (customWidgets[id] ?? config.value.widgets[id]) : config.value.widgets[id]);
  const g = $derived(config.value.general);

  let dragging = $state(false);
  let start = { px: 0, py: 0, x: 0, y: 0 };
  type ResizeDir = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
  let resizing = $state<ResizeDir | null>(null);
  let resizeStart = {
    px: 0,
    py: 0,
    x: 0,
    y: 0,
    size: 1,
    scaleX: 1,
    scaleY: 1,
    baseW: 200,
    baseH: 100,
    visW: 200,
    visH: 100,
  };
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

  const scaleXMult = $derived(cfg.scaleX ?? 1);
  const scaleYMult = $derived(cfg.scaleY ?? 1);
  const effScaleX = $derived(g.scale * cfg.size * scaleXMult);
  const effScaleY = $derived(g.scale * cfg.size * scaleYMult);

  function startResize(dir: ResizeDir, e: PointerEvent) {
    if (!edit || cfg.locked || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect?.(id);
    const rect = frameEl?.getBoundingClientRect();
    const curVisW = rect?.width || 200;
    const curVisH = rect?.height || 100;
    const curSx = Math.max(0.2, effScaleX);
    const curSy = Math.max(0.2, effScaleY);
    resizing = dir;
    resizeStart = {
      px: e.clientX,
      py: e.clientY,
      x: cfg.x,
      y: cfg.y,
      size: cfg.size,
      scaleX: cfg.scaleX ?? 1,
      scaleY: cfg.scaleY ?? 1,
      baseW: curVisW / curSx,
      baseH: curVisH / curSy,
      visW: curVisW,
      visH: curVisH,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveResize(e: PointerEvent) {
    if (!resizing) return;
    e.stopPropagation();
    const dx = e.clientX - resizeStart.px;
    const dy = e.clientY - resizeStart.py;
    const dir = resizing;
    const clampScale = (v: number) => Math.max(0.35, Math.min(3.0, Math.round(v * 100) / 100));

    if (dir === "e" || dir === "w") {
      // Independent horizontal transform (scaleX)
      const signedDx = dir === "e" ? dx : -dx;
      const targetVisW = Math.max(40, resizeStart.visW + signedDx);
      const ratio = targetVisW / Math.max(1, resizeStart.visW);
      const nextSx = clampScale(resizeStart.scaleX * ratio);
      cfg.scaleX = nextSx;
      if (dir === "w") {
        const actualVisW = resizeStart.baseW * g.scale * resizeStart.size * nextSx;
        cfg.x = Math.round(resizeStart.x + (resizeStart.visW - actualVisW));
      }
    } else if (dir === "n" || dir === "s") {
      // Independent vertical transform (scaleY)
      const signedDy = dir === "s" ? dy : -dy;
      const targetVisH = Math.max(30, resizeStart.visH + signedDy);
      const ratio = targetVisH / Math.max(1, resizeStart.visH);
      const nextSy = clampScale(resizeStart.scaleY * ratio);
      cfg.scaleY = nextSy;
      if (dir === "n") {
        const actualVisH = resizeStart.baseH * g.scale * resizeStart.size * nextSy;
        cfg.y = Math.round(resizeStart.y + (resizeStart.visH - actualVisH));
      }
    } else {
      // Diagonal corner resize: proportional uniform scale (cfg.size)
      const signedDx = dir.includes("e") ? dx : -dx;
      const signedDy = dir.includes("s") ? dy : -dy;
      const rx = (resizeStart.visW + signedDx) / Math.max(1, resizeStart.visW);
      const ry = (resizeStart.visH + signedDy) / Math.max(1, resizeStart.visH);
      const ratio = (rx + ry) / 2;
      const nextSize = clampScale(resizeStart.size * ratio);
      cfg.size = nextSize;
      if (dir.includes("w")) {
        const actualVisW = resizeStart.baseW * g.scale * nextSize * resizeStart.scaleX;
        cfg.x = Math.round(resizeStart.x + (resizeStart.visW - actualVisW));
      }
      if (dir.includes("n")) {
        const actualVisH = resizeStart.baseH * g.scale * nextSize * resizeStart.scaleY;
        cfg.y = Math.round(resizeStart.y + (resizeStart.visH - actualVisH));
      }
    }
  }

  function endResize(e: PointerEvent) {
    if (!resizing) return;
    e.stopPropagation();
    resizing = null;
    saveConfig();
  }

  function resetAxis(dir: ResizeDir, e: MouseEvent) {
    e.stopPropagation();
    if (dir === "e" || dir === "w") cfg.scaleX = 1;
    else if (dir === "n" || dir === "s") cfg.scaleY = 1;
    else {
      cfg.size = 1;
      cfg.scaleX = 1;
      cfg.scaleY = 1;
    }
    saveConfig();
  }

  // #9 Auto-Fade in Fast Corners: dims secondary widgets when cornering hard (|gLat| > 1.05G) and restores on straights/pits
  const cornerFadeMultiplier = $derived.by(() => {
    if (edit || !cfg.autoFadeInCorners) return 1;
    const p = live.snap?.player;
    if (!p || p.inPits) return 1;
    return Math.abs(p.gLat ?? 0) > 1.05 ? 0.22 : 1;
  });

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
    onSelect?.(id);
    if (cfg.locked) return;
    dragging = true;
    start = { px: e.clientX, py: e.clientY, x: cfg.x, y: cfg.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function centerHorizontally() {
    const w = frameEl?.getBoundingClientRect().width ?? 200;
    cfg.x = Math.round(((overlayLayout.logicalPrimaryWidth || 1920) - w) / 2);
    saveConfig();
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    let nextX = snap(start.x + e.clientX - start.px);
    let nextY = snap(start.y + e.clientY - start.py);
    if ((g.smartGuides ?? true) && frameEl) {
      const offX = isMulti ? overlayLayout.logicalOffsetX : 0;
      const offY = isMulti ? overlayLayout.logicalOffsetY : 0;
      const rect = frameEl.getBoundingClientRect();
      const snapped = smartGuides.snapToGuides(
        id,
        offX + nextX,
        offY + nextY,
        rect.width,
        rect.height,
        offX,
        offY,
        overlayLayout.logicalPrimaryWidth,
        overlayLayout.logicalPrimaryHeight,
      );
      nextX = Math.round(snapped.x - offX);
      nextY = Math.round(snapped.y - offY);
    }
    cfg.x = nextX;
    cfg.y = nextY;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    smartGuides.clear();
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
  data-widget-frame={id}
  class="absolute top-0 left-0 origin-top-left transition-opacity duration-700"
  class:pointer-events-auto={edit}
  class:cursor-move={edit && !cfg.locked}
  class:hover:z-20={edit}
  class:z-20={selected && !dragging}
  class:z-40={dragging}
  style:transform="translate({clampedX}px, {clampedY}px) scale({effScaleX}, {effScaleY})"
  style:opacity={g.opacity * cfg.alpha * nightMultiplier * cornerFadeMultiplier}
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
      style:border-color={cfg.locked ? "#f59e0b" : dragging || selected ? "#22d3ee" : "rgb(255 255 255 / 0.45)"}
      style:box-shadow={selected ? "0 0 12px rgba(34,211,238,0.35)" : "none"}
    ></div>
    <div
      class={[
        "absolute -top-6 left-0 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-md",
        cfg.locked ? "bg-amber-600" : selected ? "bg-cyan-600" : "bg-accent",
      ]}
    >
      <span class="pointer-events-none">{name}</span>
      <span class="pointer-events-none font-normal opacity-85 font-mono">
        {#if Math.abs(scaleXMult - 1) > 0.01 || Math.abs(scaleYMult - 1) > 0.01}
          {Math.round(effScaleX * 100)}%×{Math.round(effScaleY * 100)}%
        {:else}
          {Math.round(effScaleX * 100)}%
        {/if}
      </span>
      <button
        type="button"
        class="ml-1 flex h-4 px-1 cursor-pointer items-center justify-center rounded bg-black/30 text-[10px] leading-none text-white/90 hover:bg-black/60 transition-colors"
        title={cfg.locked ? "Desbloquear posición" : "Bloquear posición"}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          cfg.locked = !cfg.locked;
          saveConfig();
        }}
      >
        {cfg.locked ? "🔒" : "🔓"}
      </button>
      <button
        type="button"
        class={[
          "flex h-4 px-1 cursor-pointer items-center justify-center rounded text-[10px] leading-none transition-colors",
          cfg.autoFadeInCorners ? "bg-cyan-400 text-black font-bold" : "bg-black/30 text-white/80 hover:bg-black/60",
        ]}
        title={cfg.autoFadeInCorners ? "Auto-atenuar en curvas ACTIVO (clic para desactivar)" : "Activar auto-atenuar en curvas rápidas (brilla al 100% en rectas)"}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => {
          e.stopPropagation();
          cfg.autoFadeInCorners = !cfg.autoFadeInCorners;
          saveConfig();
        }}
      >
        👁️
      </button>
      {#if !cfg.locked}
        <button
          type="button"
          class="flex h-4 px-1 cursor-pointer items-center justify-center rounded bg-black/30 text-[9px] font-mono leading-none text-white/90 hover:bg-black/60 transition-colors"
          title="Restablecer tamaño al 100%"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            cfg.size = 1;
            cfg.scaleX = 1;
            cfg.scaleY = 1;
            saveConfig();
          }}
        >
          1:1
        </button>
        <button
          type="button"
          class="flex h-4 w-4 cursor-pointer items-center justify-center rounded bg-black/30 text-[10px] leading-none text-white/90 hover:bg-black/60 transition-colors"
          title="Centrar horizontalmente en pantalla"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            centerHorizontally();
          }}
        >
          ⌖
        </button>
      {/if}
      {#if onConfigure}
        <button
          type="button"
          class="flex h-4 w-4 cursor-pointer items-center justify-center rounded bg-black/30 text-[10px] leading-none text-white/90 hover:bg-cyan-500 hover:text-black transition-colors"
          title="Configurar parámetros de {name}"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            onSelect?.(id);
            onConfigure(id);
          }}
        >
          ⚙
        </button>
      {/if}
      {#if onRemove}
        <button
          type="button"
          class="flex h-4 w-4 cursor-pointer items-center justify-center rounded bg-black/30 text-[10px] leading-none text-white/90 hover:bg-red-600 hover:text-white transition-colors"
          title="Quitar {name} del overlay"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => {
            e.stopPropagation();
            onRemove(id);
          }}
        >
          ✕
        </button>
      {/if}
    </div>

    <!-- 8 Transform & Resize Handles: 4 Diagonal Corners + 2 Horizontal + 2 Vertical -->
    {#if !cfg.locked}
      {#each [
        { dir: "nw", cls: "-top-2 -left-2 cursor-nwse-resize h-3.5 w-3.5 rounded-full bg-cyan-400 border-2 border-black", title: "Redimensionar diagonal (doble clic = 100%)" },
        { dir: "ne", cls: "-top-2 -right-2 cursor-nesw-resize h-3.5 w-3.5 rounded-full bg-cyan-400 border-2 border-black", title: "Redimensionar diagonal (doble clic = 100%)" },
        { dir: "sw", cls: "-bottom-2 -left-2 cursor-nesw-resize h-3.5 w-3.5 rounded-full bg-cyan-400 border-2 border-black", title: "Redimensionar diagonal (doble clic = 100%)" },
        { dir: "se", cls: "-bottom-2 -right-2 cursor-nwse-resize h-3.5 w-3.5 rounded-full bg-cyan-400 border-2 border-black", title: "Redimensionar diagonal (doble clic = 100%)" },
        { dir: "n", cls: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize h-2.5 w-7 rounded-full bg-accent border border-white", title: "Estirar verticalmente (doble clic = 100%)" },
        { dir: "s", cls: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize h-2.5 w-7 rounded-full bg-accent border border-white", title: "Estirar verticalmente (doble clic = 100%)" },
        { dir: "w", cls: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize h-7 w-2.5 rounded-full bg-accent border border-white", title: "Estirar horizontalmente (doble clic = 100%)" },
        { dir: "e", cls: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize h-7 w-2.5 rounded-full bg-accent border border-white", title: "Estirar horizontalmente (doble clic = 100%)" },
      ] as h (h.dir)}
        <div
          class={["absolute z-30 shadow-md transition-transform hover:scale-125", h.cls]}
          title={h.title}
          role="presentation"
          onpointerdown={(e) => startResize(h.dir as ResizeDir, e)}
          onpointermove={moveResize}
          onpointerup={endResize}
          onpointercancel={endResize}
          ondblclick={(e) => resetAxis(h.dir as ResizeDir, e)}
        ></div>
      {/each}
    {/if}
  {/if}
  {#key `${profileAnimKey}-${trackEntryAnimKey}`}
    <div
      class={[
        edit && "pointer-events-none",
        trackEntryAnimKey > 0 && trackEntryAnim !== "none"
          ? `mdt-entry-${trackEntryAnim}`
          : profileAnimKey > 0
            ? "mdt-anim-profile-stagger"
            : "",
      ]}
      style:--stagger-delay="{staggerIndex * 24}ms"
      style:--entry-delay="{Math.min(staggerIndex * 45, 540)}ms"
    >
      {@render children()}
    </div>
  {/key}
</div>
