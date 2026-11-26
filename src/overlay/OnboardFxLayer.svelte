<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { isNativeTauri } from "../lib/api";
  import { config, DEFAULT_ONBOARD_FX } from "../lib/config.svelte";
  import type { Snapshot } from "../lib/types";

  let {
    snap,
    edit = false,
    trackOk = true,
    focusOk = true,
  }: {
    snap: Snapshot | null;
    edit?: boolean;
    trackOk?: boolean;
    focusOk?: boolean;
  } = $props();

  const fx = $derived(config.value.general.onboardFx ?? DEFAULT_ONBOARD_FX);
  const visible = $derived(
    fx.enabled && !edit && focusOk && (!fx.onlyOnTrack || trackOk),
  );

  // Push live FX parameters directly to our Native DirectX 11 HLSL GPU Engine in Rust!
  $effect(() => {
    if (!isNativeTauri()) return;
    const f = fx;
    void invoke("update_native_fx", {
      params: {
        enabled: Boolean(f.enabled && !edit),
        onlyOnTrack: Boolean(f.onlyOnTrack),
        contrast: f.contrast ?? 1.0,
        saturation: f.saturation ?? 1.0,
        vibrance: f.vibrance ?? 0.0,
        brightness: f.brightness ?? 1.0,
        exposure: f.exposure ?? 0.0,
        warmth: (f.warmth ?? 0) / 30.0,
        tint: (f.tint ?? 0) / 30.0,
        acesTonemap: f.acesTonemap ?? 0.0,
        casSharpen: f.casSharpen ?? 0.0,
        chromaticAberration: f.chromaticAberration ?? 0.0,
        speedBlur: f.speedBlur ?? 0.0,
        vignette: f.vignette ?? 0.0,
        speedVignette: Boolean(f.speedVignette),
        gforceVignette: Boolean(f.gForceVignette),
        cameraShake: Boolean(f.cameraShake),
        filmGrain: f.filmGrain ?? 0.0,
        scanlines: f.scanlines ?? 0.0,
        lutStrength: f.lutStrength ?? 0.0,
        lutPreset: f.lutPreset ?? 0,
        bloom: f.bloom ?? 0.0,
        halation: f.halation ?? 0.0,
        lensDistortion: f.lensDistortion ?? 0.0,
        clarity: f.clarity ?? 0.0,
        dehaze: f.dehaze ?? 0.0,
        anamorphicFlare: f.anamorphicFlare ?? 0.0,
        lift: f.lift ?? 0.0,
        gamma: f.gamma ?? 1.0,
        gain: f.gain ?? 1.0,
        autoExposure: Boolean(f.autoExposure),
        gforceShift: Boolean(f.gforceShift),
        rpmVibration: Boolean(f.rpmVibration),
        autoWeatherTimeFx: Boolean(f.autoWeatherTimeFx),
        agxTonemap: f.agxTonemap ?? 0.0,
        giBounce: f.giBounce ?? 0.0,
        proMist: f.proMist ?? 0.0,
        localHdr: f.localHdr ?? 0.0,
        highlightRolloff: f.highlightRolloff ?? 0.0,
        splitShadowCool: f.splitShadowCool ?? 0.0,
        splitHighlightWarm: f.splitHighlightWarm ?? 0.0,
        shadowDepth: f.shadowDepth ?? 0.0,
        splitScreen: f.splitScreen ?? 0.0,
        cameraShakeIntensity: f.cameraShakeIntensity ?? 1.0,
        rpmVibrationIntensity: f.rpmVibrationIntensity ?? 1.0,
        pyramidalBloom: f.pyramidalBloom ?? 0.0,
        grassRealism: f.grassRealism ?? 0.0,
        skyRealism: f.skyRealism ?? 0.0,
        sunGodRays: f.sunGodRays ?? 0.0,
        film35mm: f.film35mm ?? 0.0,
        heatHaze: f.heatHaze ?? 0.0,
        temporalMotionBlur: f.temporalMotionBlur ?? 0.0,
        lumenGi: f.lumenGi ?? 0.0,
        lumenSkyBounce: f.lumenSkyBounce ?? 0.0,
        linearColorSpace: Boolean(f.linearColorSpace),
        colorSpace: f.colorSpace ?? 0,
        colorSpaceStrength: f.colorSpaceStrength ?? 1.0,
        taaAntialias: f.taaAntialias ?? 0.0,
        performanceMode: Boolean(f.performanceMode),
        fxaaAntialias: f.fxaaAntialias ?? 0.0,
        cinematicDof: f.cinematicDof ?? 0.0,
        dofFocus: f.dofFocus ?? 0.5,
        autoExposureSpeed: f.autoExposureSpeed ?? 0.22,
        longExposure: f.longExposure ?? 0.0,
        starburst: f.starburst ?? 0.0,
        dirtyLens: f.dirtyLens ?? 0.0,
        broadcastSensor: f.broadcastSensor ?? 0.0,
        wetReflections: f.wetReflections ?? 0.0,
        deband: f.deband ?? 0.0,
        surfaceBlur: f.surfaceBlur ?? 0.0,
        dpxFilm: f.dpxFilm ?? 0.0,
        vhsRf: f.vhsRf ?? 0.0,
      },
    }).catch(() => {});
  });

  // Auto-load persisted custom .cube LUT file when lutPreset === 6
  let lastLoadedLutPath = "";
  $effect(() => {
    const f = fx;
    if (!isNativeTauri()) return;
    if (f.lutPreset === 6 && f.customLutPath && f.customLutPath !== lastLoadedLutPath) {
      lastLoadedLutPath = f.customLutPath;
      void invoke("load_fx_cube_lut_file", { path: f.customLutPath }).catch(() => {});
    }
  });

  const p = $derived(snap?.player);
  const speedKmh = $derived(p ? p.speed * 3.6 : 0);
  const raining = $derived(snap?.session?.weather?.raining ?? 0);

  // Micro-shake for optical visor/dirt/REC overlays (game image shake runs in D3D11 HLSL)
  const onKerb = $derived(
    Boolean(
      fx.cameraShake &&
        p &&
        speedKmh > 55 &&
        (p as any).wheels?.some((w: { surfaceType?: number }) => (w.surfaceType ?? 0) > 0),
    ),
  );
  const highSpeedShake = $derived(Boolean(fx.cameraShake && !onKerb && speedKmh > 280));
  const shakeClass = $derived(onKerb ? "fx-kerb-shake" : highSpeedShake ? "fx-speed-shake" : "");

  // Dynamic raindrops on outer edges when raining
  const showRain = $derived(fx.rainDrops && raining > 0.04);
  const rainDuration = $derived(Math.max(0.4, 1.7 - Math.min(1.25, (speedKmh / 280) * 1.25)));
  const rainDropsList = [
    { left: "4%", delay: "0s", size: 1.0 },
    { left: "9%", delay: "0.4s", size: 0.85 },
    { left: "15%", delay: "0.9s", size: 1.15 },
    { left: "84%", delay: "0.2s", size: 0.95 },
    { left: "90%", delay: "0.7s", size: 1.2 },
    { left: "95%", delay: "1.1s", size: 0.9 },
    { left: "22%", delay: "1.3s", size: 0.8 },
    { left: "78%", delay: "0.55s", size: 0.85 },
  ];
</script>

{#if visible}
  <!-- Pure optical layer strictly BELOW HUD widgets (z-0); Color Grading, CAS, 3D LUTs, ACES, Speed Blur & CA run natively in Rust DirectX 11 -->
  <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none">
    <!-- Helmet Visor Curved Frame -->
    {#if fx.visorFrame}
      <div
        class={["absolute -inset-x-2 -top-2 h-[9.5vh]", shakeClass]}
        style="background: linear-gradient(180deg, rgba(4,6,10,0.9) 0%, rgba(4,6,10,0.45) 55%, transparent 100%); border-bottom-left-radius: 50% 24px; border-bottom-right-radius: 50% 24px;"
      ></div>
      <div
        class={["absolute -inset-x-2 -bottom-2 h-[7.5vh]", shakeClass]}
        style="background: linear-gradient(0deg, rgba(4,6,10,0.84) 0%, rgba(4,6,10,0.32) 55%, transparent 100%);"
      ></div>
    {/if}

    <!-- Windshield / Visor Micro-Dirt & Edge Glare (center apex stays clear) -->
    {#if fx.visorDirt > 0.01}
      <div
        class={["absolute -inset-2", shakeClass]}
        style:opacity={fx.visorDirt.toFixed(2)}
        style="background-image:
          radial-gradient(circle at 12% 18%, rgba(255,255,255,0.28) 0px, transparent 3.5px),
          radial-gradient(circle at 87% 22%, rgba(255,255,255,0.24) 0px, transparent 4px),
          radial-gradient(circle at 18% 82%, rgba(255,255,255,0.22) 0px, transparent 3.5px),
          radial-gradient(circle at 82% 76%, rgba(255,255,255,0.26) 0px, transparent 4.5px),
          radial-gradient(ellipse at 85% 12%, rgba(255,245,220,0.16) 0%, transparent 26%),
          radial-gradient(ellipse at 14% 15%, rgba(200,230,255,0.14) 0%, transparent 22%);"
      ></div>
    {/if}

    <!-- Dynamic Raindrops on Outer Edges when raining -->
    {#if showRain}
      <div class="absolute inset-0 overflow-hidden" style:opacity={Math.min(0.92, 0.35 + raining * 0.65)}>
        {#each rainDropsList as d, i (i)}
          <div
            class="fx-rain-streak absolute top-0 w-[2.5px] rounded-full bg-gradient-to-b from-transparent via-sky-100/80 to-white"
            style:left={d.left}
            style:height="{Math.round(32 * d.size)}px"
            style:animation-duration="{rainDuration.toFixed(2)}s"
            style:animation-delay={d.delay}
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Optional Onboard Camera REC Badge -->
    {#if fx.recBadge}
      <div class={["absolute top-4 left-5 flex items-center gap-2 rounded bg-black/55 px-2.5 py-1 font-mono text-[11px] font-bold tracking-widest text-white/90", shakeClass]}>
        <span class="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
        <span>REC</span>
        <span class="text-white/50">|</span>
        <span class="text-white/80">ONBOARD CAM</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .fx-rain-streak {
    animation-name: fx-rain-fall;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }

  @keyframes fx-rain-fall {
    0% { transform: translateY(-40px) translateX(0); opacity: 0; }
    15% { opacity: 0.9; }
    85% { opacity: 0.75; }
    100% { transform: translateY(105vh) translateX(20px); opacity: 0; }
  }

  @keyframes fx-kerb-shake-kf {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(-2px, 1.5px); }
    50% { transform: translate(2px, -1.5px); }
    75% { transform: translate(-1.5px, -1px); }
  }
  .fx-kerb-shake {
    animation: fx-kerb-shake-kf 0.11s linear infinite;
  }

  @keyframes fx-speed-shake-kf {
    0%, 100% { transform: translate(0, 0); }
    33% { transform: translate(0.8px, -0.6px); }
    66% { transform: translate(-0.8px, 0.6px); }
  }
  .fx-speed-shake {
    animation: fx-speed-shake-kf 0.14s linear infinite;
  }
</style>
