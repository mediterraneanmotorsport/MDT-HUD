<script lang="ts">
  import type { Snippet } from "svelte";
  import { config, saveConfig, type WidgetConfig } from "../lib/config.svelte";
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
    staggerIndex = 0,
    nightMultiplier = 1,
    onSelect,
    onRemove,
    children,
  }: {
    id: string;
    name: string;
    edit: boolean;
    selected?: boolean;
    customWidgets?: Record<string, WidgetConfig>;
    profileAnimKey?: number;
    staggerIndex?: number;
    nightMultiplier?: number;
    onSelect?: (id: string) => void;
    onRemove?: (id: string) => void;
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
  style:transform="translate({clampedX}px, {clampedY}px) scale({scaleVal})"
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
      <span class="pointer-events-none font-normal opacity-80">{Math.round(g.scale * cfg.size * 100)}%</span>
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
  {/if}
  {#key profileAnimKey}
    <div
      class={[edit && "pointer-events-none", profileAnimKey > 0 && "mdt-anim-profile-stagger"]}
      style:--stagger-delay="{staggerIndex * 24}ms"
    >
      {@render children()}
    </div>
  {/key}
</div>
