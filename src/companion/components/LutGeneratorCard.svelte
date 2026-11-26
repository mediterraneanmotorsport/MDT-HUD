<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { isNativeTauri } from "../../lib/api";
  import {
    analyzeImagePair,
    generateCubeLutText,
    renderPreviewToCanvas,
    sampleImagePixels,
    type CubeLutSize,
    type LutTransferModel,
  } from "../../lib/lutGenerator";

  let {
    onSaved,
  }: {
    onSaved: (res: { name: string; path: string; size: number }) => void;
  } = $props();

  let open = $state(false);
  let srcUrl = $state("");
  let refUrl = $state("");
  let srcImg: HTMLImageElement | null = null;
  let refImg: HTMLImageElement | null = null;
  let model = $state<LutTransferModel | null>(null);

  let lutName = $state("MDT-Onboard-Custom");
  let lutSize = $state<CubeLutSize>(33);
  let colorStrength = $state(0.85);
  let lumaStrength = $state(0.72);
  let neutralProtect = $state(0.6);
  let splitRatio = $state(0.5);

  let busy = $state(false);
  let statusMsg = $state("");

  let srcInput: HTMLInputElement | undefined = $state();
  let refInput: HTMLInputElement | undefined = $state();
  let previewCanvas: HTMLCanvasElement | undefined = $state();

  function loadImageFromFile(file: File): Promise<{ url: string; img: HTMLImageElement }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ url, img });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo cargar la imagen"));
      };
      img.src = url;
    });
  }

  async function onPickSource(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (srcUrl) URL.revokeObjectURL(srcUrl);
      const loaded = await loadImageFromFile(file);
      srcUrl = loaded.url;
      srcImg = loaded.img;
      recomputeModel();
    } catch (err) {
      statusMsg = `✗ ${String(err)}`;
    }
  }

  async function onPickRef(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (refUrl) URL.revokeObjectURL(refUrl);
      const loaded = await loadImageFromFile(file);
      refUrl = loaded.url;
      refImg = loaded.img;
      recomputeModel();
    } catch (err) {
      statusMsg = `✗ ${String(err)}`;
    }
  }

  function recomputeModel() {
    if (!srcImg || !refImg) return;
    statusMsg = "";
    const srcPix = sampleImagePixels(srcImg, 256);
    const refPix = sampleImagePixels(refImg, 256);
    model = analyzeImagePair(srcPix, refPix);
  }

  $effect(() => {
    const m = model;
    const canvas = previewCanvas;
    const cs = colorStrength;
    const ls = lumaStrength;
    const np = neutralProtect;
    const sp = splitRatio;
    if (!m || !canvas || !srcImg) return;
    renderPreviewToCanvas(
      srcImg,
      canvas,
      m,
      { colorStrength: cs, lumaStrength: ls, neutralProtect: np },
      sp,
    );
  });

  async function saveAndApplyLut() {
    if (!model) return;
    busy = true;
    statusMsg = `Generando cubo ${lutSize}³...`;
    // Yield one frame so UI updates before 65³ generation
    await new Promise((r) => setTimeout(r, 20));
    try {
      const content = generateCubeLutText(lutName, lutSize, model, {
        colorStrength,
        lumaStrength,
        neutralProtect,
      });
      if (isNativeTauri()) {
        const res = await invoke<{ name: string; path: string; size: number }>(
          "save_fx_cube_lut_file",
          { name: lutName, content },
        );
        statusMsg = `✓ Guardado y aplicado: ${res.name} (${res.size}³)`;
        onSaved(res);
      } else {
        downloadCubeText(content);
        statusMsg = `✓ Descargado ${lutName}.cube (${lutSize}³)`;
      }
    } catch (err) {
      statusMsg = `✗ ${String(err)}`;
    } finally {
      busy = false;
    }
  }

  function downloadCubeText(content?: string) {
    if (!model) return;
    const text =
      content ??
      generateCubeLutText(lutName, lutSize, model, {
        colorStrength,
        lumaStrength,
        neutralProtect,
      });
    const clean = (lutName.trim() || "MDT-Custom-LUT").replace(/\.cube$/i, "");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clean}.cube`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="card flex flex-col gap-3 p-4 border-accent/30">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <div class="text-sm font-bold text-fg">
        🧪 Generador de LUTs 3D desde Imagen Real (OKLab 3 Zonas · 17³ / 33³ / 65³)
      </div>
      <div class="text-xs text-muted">
        Sube una captura de <strong>LMU</strong> y una <strong>foto real de referencia</strong> (WEC, IMSA, F1...) para generar tu propio archivo <code>.cube</code> al instante con vista Antes/Después.
      </div>
    </div>
    <button
      type="button"
      class={[
        "btn px-3 py-1.5 text-xs font-bold cursor-pointer",
        open
          ? "bg-surface-2 border border-line text-fg hover:border-accent"
          : "bg-accent text-white hover:brightness-110",
      ]}
      onclick={() => (open = !open)}
    >
      {open ? "▲ Ocultar Generador" : "✨ Abrir Generador de LUTs"}
    </button>
  </div>

  {#if open}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
      <!-- Image 1: Source LMU -->
      <button
        type="button"
        class="group relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2/60 p-2 text-center hover:border-accent cursor-pointer"
        onclick={() => srcInput?.click()}
      >
        {#if srcUrl}
          <img src={srcUrl} alt="Captura LMU" class="h-full w-full rounded-lg object-cover" />
          <span class="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white">
            1. Origen: LMU (clic para cambiar)
          </span>
        {:else}
          <span class="text-lg">🏎️</span>
          <span class="mt-1 text-xs font-bold text-fg">1. Captura de LMU (Origen)</span>
          <span class="text-[11px] text-muted">Haz clic para elegir tu captura del juego (PNG/JPG)</span>
        {/if}
      </button>
      <input bind:this={srcInput} type="file" accept="image/*" class="hidden" onchange={onPickSource} />

      <!-- Image 2: Reference Real -->
      <button
        type="button"
        class="group relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2/60 p-2 text-center hover:border-accent cursor-pointer"
        onclick={() => refInput?.click()}
      >
        {#if refUrl}
          <img src={refUrl} alt="Referencia Real" class="h-full w-full rounded-lg object-cover" />
          <span class="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            2. Referencia Real (clic para cambiar)
          </span>
        {:else}
          <span class="text-lg">📹</span>
          <span class="mt-1 text-xs font-bold text-fg">2. Foto Real de Referencia (Destino)</span>
          <span class="text-[11px] text-muted">Elige la foto onboard real a la que quieres parecerte</span>
        {/if}
      </button>
      <input bind:this={refInput} type="file" accept="image/*" class="hidden" onchange={onPickRef} />
    </div>

    {#if model}
      <!-- Live Interactive Before / After Preview -->
      <div class="flex flex-col gap-2 rounded-xl border border-line bg-black/40 p-3">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-fg">👁️ Previsualización en Vivo (Izquierda: LMU · Derecha: Nuevo LUT 3D)</span>
          <span class="font-mono text-[11px] text-accent">Split {Math.round(splitRatio * 100)}%</span>
        </div>
        <div class="relative overflow-hidden rounded-lg border border-white/10 bg-black">
          <canvas bind:this={previewCanvas} class="block max-h-[340px] w-full object-contain"></canvas>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={splitRatio}
          aria-label="Divisor Antes y Después"
        />
      </div>

      <!-- Fine-tuning Sliders + Size Selector -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex flex-col gap-1">
          <div class="flex justify-between text-xs">
            <span class="font-medium text-fg">Fuerza de Color</span>
            <span class="font-mono font-bold text-accent">{Math.round(colorStrength * 100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" bind:value={colorStrength} />
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex justify-between text-xs">
            <span class="font-medium text-fg">Contraste / Luma</span>
            <span class="font-mono font-bold text-accent">{Math.round(lumaStrength * 100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" bind:value={lumaStrength} />
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex justify-between text-xs">
            <span class="font-medium text-fg">Proteger Blancos/Negros</span>
            <span class="font-mono font-bold text-accent">{Math.round(neutralProtect * 100)}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" bind:value={neutralProtect} />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-fg" for="lut-gen-size">Precisión del Cubo</label>
          <select id="lut-gen-size" class="field py-1 text-xs font-semibold" bind:value={lutSize}>
            <option value={17}>17×17×17 (Ligero · ~150 KB)</option>
            <option value={33}>33×33×33 (Estándar Cine · ~1 MB)</option>
            <option value={65}>65×65×65 (Ultra Master · ~7.5 MB)</option>
          </select>
        </div>
      </div>

      <!-- Save & Apply Bar -->
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="text"
            class="field w-52 py-1.5 text-xs font-semibold"
            placeholder="Nombre del LUT..."
            bind:value={lutName}
          />
          <button
            type="button"
            class="btn bg-accent px-3.5 py-1.5 text-xs font-bold text-white hover:brightness-110 cursor-pointer disabled:opacity-50"
            disabled={busy}
            onclick={saveAndApplyLut}
          >
            {busy ? "⏳ Generando..." : "💾 Guardar en MDT-FX-Presets y Aplicar"}
          </button>
          <button
            type="button"
            class="btn bg-surface-2 border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:border-accent cursor-pointer disabled:opacity-50"
            disabled={busy}
            onclick={() => downloadCubeText()}
          >
            ⬇️ Descargar .cube
          </button>
        </div>
        {#if statusMsg}
          <span class="text-xs font-semibold text-accent">{statusMsg}</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>
