/**
 * Perceptual 3D LUT Generator (Source LMU Screenshot -> Reference Real Photo)
 *
 * Uses exact sRGB <-> Linear <-> OKLab perceptual color space with:
 *  1. Smoothed 256-bin Monotone Luma CDF Matching (contrast, black floor, highlight shoulder)
 *  2. 3-Zone Luma-Stratified Chromatic Transfer (Shadows / Midtones / Highlights) in OKLab (a, b)
 *  3. Highlight & Black-Floor Protection (prevents white-out or crushed blacks)
 *  4. Standard Adobe / DaVinci Resolve `.cube` exporter (17³, 33³, or 65³)
 */

export type CubeLutSize = 17 | 33 | 65;

export interface LutGeneratorOptions {
  /** Strength of 3-zone OKLab chromatic transfer (0..1) */
  colorStrength: number;
  /** Strength of smoothed luma / contrast CDF curve (0..1) */
  lumaStrength: number;
  /** Protects pure blacks and highlights from color casts or clipping (0..1) */
  neutralProtect: number;
}

interface ZoneStats {
  meanA: number;
  meanB: number;
  stdA: number;
  stdB: number;
}

export interface LutTransferModel {
  /** 256-entry monotone luma transfer table (0..1 -> 0..1 in OKLab L) */
  lumaMap: Float32Array;
  srcZones: [ZoneStats, ZoneStats, ZoneStats];
  refZones: [ZoneStats, ZoneStats, ZoneStats];
}

// --- Exact sRGB <-> Linear <-> OKLab ---

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const clamped = c < 0 ? 0 : c > 1 ? 1 : c;
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l < 0 ? 0 : l);
  const m_ = Math.cbrt(m < 0 ? 0 : m);
  const s_ = Math.cbrt(s < 0 ? 0 : s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return [L, A, B];
}

function oklabToRgb(L: number, A: number, B: number): [number, number, number] {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Extracts downsampled RGBA pixels from an HTMLImageElement for fast statistical analysis. */
export function sampleImagePixels(img: HTMLImageElement, maxDim = 256): Uint8ClampedArray {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1));
  const w = Math.max(16, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(16, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function computeImageStats(rgba: Uint8ClampedArray): {
  cdf: Float32Array;
  zones: [ZoneStats, ZoneStats, ZoneStats];
} {
  const hist = new Float64Array(256);
  const wSum = [0, 0, 0];
  const aSum = [0, 0, 0];
  const bSum = [0, 0, 0];
  const a2Sum = [0, 0, 0];
  const b2Sum = [0, 0, 0];

  const nPix = rgba.length >> 2;
  let validCount = 0;

  for (let i = 0; i < nPix; i++) {
    const idx = i << 2;
    const alpha = rgba[idx + 3];
    if (alpha < 200) continue;
    const r = rgba[idx] / 255;
    const g = rgba[idx + 1] / 255;
    const b = rgba[idx + 2] / 255;
    const [L, A, B] = rgbToOklab(r, g, b);
    const bin = Math.min(255, Math.max(0, Math.round(L * 255)));
    hist[bin] += 1;
    validCount += 1;

    // Soft 3-zone weights: Shadows (0), Midtones (1), Highlights (2)
    const wSh = 1 - smoothstep(0.18, 0.45, L);
    const wHi = smoothstep(0.55, 0.84, L);
    const wMid = Math.max(0.05, 1 - wSh - wHi);
    const ws = [wSh, wMid, wHi];
    for (let z = 0; z < 3; z++) {
      const w = ws[z];
      wSum[z] += w;
      aSum[z] += A * w;
      bSum[z] += B * w;
      a2Sum[z] += A * A * w;
      b2Sum[z] += B * B * w;
    }
  }

  // Build normalized CDF with gentle Laplace smoothing so zero-count bins stay smooth
  const cdf = new Float32Array(256);
  const total = validCount + 256 * 0.5;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i] + 0.5;
    cdf[i] = acc / total;
  }

  const zones: [ZoneStats, ZoneStats, ZoneStats] = [0, 1, 2].map((z) => {
    const ws = Math.max(1e-5, wSum[z]);
    const meanA = aSum[z] / ws;
    const meanB = bSum[z] / ws;
    const varA = Math.max(1e-6, a2Sum[z] / ws - meanA * meanA);
    const varB = Math.max(1e-6, b2Sum[z] / ws - meanB * meanB);
    return {
      meanA,
      meanB,
      stdA: Math.sqrt(varA),
      stdB: Math.sqrt(varB),
    };
  }) as [ZoneStats, ZoneStats, ZoneStats];

  return { cdf, zones };
}

/** Analyzes Source (LMU) and Reference (Real Onboard) pixels to build a smooth OKLab transfer model. */
export function analyzeImagePair(
  srcRgba: Uint8ClampedArray,
  refRgba: Uint8ClampedArray,
): LutTransferModel {
  const src = computeImageStats(srcRgba);
  const ref = computeImageStats(refRgba);

  // Build monotone CDF-matched luma curve (src L -> ref L)
  const rawMap = new Float32Array(256);
  let refIdx = 0;
  for (let i = 0; i < 256; i++) {
    const p = src.cdf[i];
    while (refIdx < 255 && ref.cdf[refIdx] < p) {
      refIdx++;
    }
    rawMap[i] = refIdx / 255;
  }

  // Smooth the luma curve with 2 passes of a 9-tap Gaussian-like box filter to prevent banding/kinks
  const smooth = new Float32Array(256);
  const temp = new Float32Array(rawMap);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < 256; i++) {
      let s = 0;
      let w = 0;
      for (let k = -5; k <= 5; k++) {
        const j = Math.min(255, Math.max(0, i + k));
        const wk = 6 - Math.abs(k);
        s += temp[j] * wk;
        w += wk;
      }
      smooth[i] = s / w;
    }
    temp.set(smooth);
  }
  // Enforce gentle monotonicity and anchor endpoints smoothly
  for (let i = 1; i < 256; i++) {
    if (smooth[i] < smooth[i - 1]) smooth[i] = smooth[i - 1];
  }

  return {
    lumaMap: smooth,
    srcZones: src.zones,
    refZones: ref.zones,
  };
}

/** Evaluates the perceptual OKLab transfer for a single sRGB pixel (0..1). */
export function applyTransferToPixel(
  r: number,
  g: number,
  b: number,
  model: LutTransferModel,
  opts: LutGeneratorOptions,
): [number, number, number] {
  const [L, A, B] = rgbToOklab(r, g, b);

  // 1. Smoothed Luma transfer with highlight & deep-black protection
  const fIdx = clamp01(L) * 255;
  const i0 = Math.floor(fIdx);
  const i1 = Math.min(255, i0 + 1);
  const frac = fIdx - i0;
  const mappedL = model.lumaMap[i0] * (1 - frac) + model.lumaMap[i1] * frac;

  // Neutral protection keeps extreme blacks/whites from washing out
  const extremeProt = opts.neutralProtect * (1 - smoothstep(0.02, 0.14, L) * (1 - smoothstep(0.86, 0.99, L)));
  const effLumaStr = clamp01(opts.lumaStrength) * (1 - extremeProt * 0.65);
  const outL = clamp01(L + (mappedL - L) * effLumaStr);

  // 2. 3-Zone OKLab chromatic transfer (Shadows / Midtones / Highlights)
  const wSh = 1 - smoothstep(0.18, 0.45, L);
  const wHi = smoothstep(0.55, 0.84, L);
  const wMid = Math.max(0, 1 - wSh - wHi);
  const wSum = wSh + wMid + wHi || 1;
  const weights = [wSh / wSum, wMid / wSum, wHi / wSum];

  let targetA = 0;
  let targetB = 0;
  for (let z = 0; z < 3; z++) {
    const sz = model.srcZones[z];
    const rz = model.refZones[z];
    // Clamp saturation ratio so muted reference photos never create neon/inverted colors
    const scaleA = Math.min(1.45, Math.max(0.45, rz.stdA / Math.max(0.012, sz.stdA)));
    const scaleB = Math.min(1.45, Math.max(0.45, rz.stdB / Math.max(0.012, sz.stdB)));
    const zA = (A - sz.meanA) * scaleA + rz.meanA;
    const zB = (B - sz.meanB) * scaleB + rz.meanB;
    targetA += zA * weights[z];
    targetB += zB * weights[z];
  }

  // Protect pure whites & pure blacks from getting unwanted tint casts
  const chromaGuard = 1 - opts.neutralProtect * (1 - smoothstep(0.04, 0.22, L) * (1 - smoothstep(0.80, 0.97, L)));
  const effColorStr = clamp01(opts.colorStrength) * chromaGuard;
  const outA = A + (targetA - A) * effColorStr;
  const outB = B + (targetB - B) * effColorStr;

  return oklabToRgb(outL, outA, outB);
}

/** Renders a live interactive Before / After split-screen preview onto a canvas. */
export function renderPreviewToCanvas(
  srcImg: HTMLImageElement,
  canvas: HTMLCanvasElement,
  model: LutTransferModel,
  opts: LutGeneratorOptions,
  splitRatio: number,
): void {
  const maxW = 720;
  const scale = Math.min(1, maxW / Math.max(srcImg.naturalWidth || srcImg.width, 1));
  const w = Math.max(64, Math.round((srcImg.naturalWidth || srcImg.width) * scale));
  const h = Math.max(64, Math.round((srcImg.naturalHeight || srcImg.height) * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(srcImg, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const splitX = Math.round(clamp01(splitRatio) * w);

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = splitX; x < w; x++) {
      const idx = (rowOff + x) << 2;
      const [or, og, ob] = applyTransferToPixel(
        d[idx] / 255,
        d[idx + 1] / 255,
        d[idx + 2] / 255,
        model,
        opts,
      );
      d[idx] = Math.round(clamp01(or) * 255);
      d[idx + 1] = Math.round(clamp01(og) * 255);
      d[idx + 2] = Math.round(clamp01(ob) * 255);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Draw crisp split divider line
  if (splitX > 2 && splitX < w - 2) {
    ctx.fillStyle = "rgba(56, 189, 248, 0.95)";
    ctx.fillRect(splitX - 1, 0, 2, h);
  }
}

/** Generates a standard Adobe / DaVinci Resolve `.cube` 3D LUT string (17³, 33³, or 65³). */
export function generateCubeLutText(
  title: string,
  size: CubeLutSize,
  model: LutTransferModel,
  opts: LutGeneratorOptions,
): string {
  const safeTitle = (title || "MDT Custom LUT").replace(/["\r\n]/g, "").trim();
  const lines: string[] = [
    `# Generated by MDT-HUD 3D LUT Studio (OKLab 3-Zone Perceptual Color Transfer)`,
    `TITLE "${safeTitle}"`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
    ``,
  ];

  const inv = 1 / (size - 1);
  // Standard Adobe .cube ordering: R fastest (inner), G middle, B slowest (outer)
  for (let bi = 0; bi < size; bi++) {
    const b = bi * inv;
    for (let gi = 0; gi < size; gi++) {
      const g = gi * inv;
      for (let ri = 0; ri < size; ri++) {
        const r = ri * inv;
        const [or, og, ob] = applyTransferToPixel(r, g, b, model, opts);
        lines.push(`${or.toFixed(6)} ${og.toFixed(6)} ${ob.toFixed(6)}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}
