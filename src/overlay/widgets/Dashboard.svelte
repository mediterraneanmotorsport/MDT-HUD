<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Units } from "../../lib/config.svelte";
  import { speed, speedUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, units }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const p = $derived(live.snap?.player);
  const style = $derived((opts.style ?? "wec") as "wec" | "ddu" | "radial" | "compact" | "classic");
  const rpmStyle = $derived((opts.rpmStyle ?? "leds") as "leds" | "center" | "bar");
  const showMdtLogo = $derived(opts.showMdtLogo ?? true);
  const showPedals = $derived(opts.showPedals ?? true);
  const showSteeringWheel = $derived(opts.showSteeringWheel ?? true);
  const shiftFlash = $derived(opts.shiftFlash ?? true);

  const rpmFrac = $derived(p && p.maxRpm > 0 ? Math.min(1, Math.max(0, p.rpm / p.maxRpm)) : 0);
  const gear = $derived(!p ? "–" : p.gear < 0 ? "R" : p.gear === 0 ? "N" : String(p.gear));
  const spdVal = $derived(p ? Math.round(speed(p.speed, units)) : 0);
  const spdText = $derived(p ? String(spdVal) : "–");
  const rpmText = $derived(p ? String(Math.round(p.rpm)) : "–");

  // Shift light colour: green → amber → red → cyan/blue flash at the limiter.
  const rpmColor = $derived(
    rpmFrac > 0.96 ? "#38bdf8" : rpmFrac > 0.9 ? "#ef4444" : rpmFrac > 0.8 ? "#f59e0b" : "#22c55e",
  );
  const flash = $derived(shiftFlash && rpmFrac > 0.965);

  const ON = "#38bdf8";
  const WARN = "#f5a524";
  const engineColor = $derived(!p ? null : p.overheating ? "#ff4646" : p.ignition === 0 || p.antiStall ? WARN : null);

  // electricMotorState: 0 = no hybrid, 1 = idle, 2 = deploying, 3 = regenerating.
  const hybrid = $derived(!!p && p.electricMotorState > 0);
  const battery = $derived(p ? Math.max(0, Math.min(1, p.battery)) : 0);
  const batteryFull = $derived(hybrid && battery >= 0.975);
  const snap = $derived(live.snap);
  const me = $derived(
    snap?.vehicles.find((v) =>
      snap.focusedSlot != null
        ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot
        : v.isPlayer,
    ),
  );
  const isYellowFlag = $derived(
    Boolean(
      snap &&
        (snap.session.yellowFlagState > 0 ||
          snap.session.phase === 6 ||
          (me && !me.inPits && snap.session.sectorYellow[me.sector - 1])),
    ),
  );
  const isBlueFlag = $derived(Boolean(me?.flag === 6));
  const isPitLimiter = $derived(Boolean(p?.speedLimiter));
  const noIconBg = $derived(Boolean(opts.transparentIcons ?? opts.noIconBg ?? false));
  const deltaVal = $derived(
    live.snap?.timing.deltaPb ?? (live.snap?.timing.sessionBest && p ? p.deltaBest : null),
  );
  const hudAlertClass = $derived(
    isYellowFlag
      ? "border-2 border-[#ffd400] ring-4 ring-[#ffd400]/70 shadow-[0_0_24px_#ffd400] animate-pulse"
      : isBlueFlag
        ? "border-2 border-[#1d6cf2] ring-4 ring-[#1d6cf2]/70 shadow-[0_0_24px_#1d6cf2] animate-pulse"
        : batteryFull
          ? "hud-battery-full"
          : (opts.deltaBorder ?? true) && deltaVal != null
            ? deltaVal < -0.005
              ? "hud-delta-good"
              : deltaVal > 0.005
                ? "hud-delta-bad"
                : ""
            : "",
  );
  const motor = $derived(
    batteryFull
      ? { label: "100% LLENA", color: "#00ff66" }
      : p?.electricMotorState === 3
        ? { label: "REGEN", color: "var(--color-clutch)" }
        : p?.electricMotorState === 2
          ? { label: "EMPUJE", color: "var(--color-good)" }
          : { label: "ESPERA", color: "var(--color-muted)" },
  );
  const batteryColor = $derived(
    batteryFull
      ? "#00ff66"
      : p?.electricMotorState === 3
        ? "var(--color-clutch)"
        : battery < 0.15
          ? "var(--color-bad)"
          : "var(--color-good)",
  );

  // Formatted electronics values (identical across all Dashboard styles, PC & Mobile)
  const tcText = $derived(!p ? "–" : p.tc > 0 ? String(p.tc) : "OFF");
  const absText = $derived(!p ? "–" : p.abs > 0 ? String(p.abs) : "OFF");
  const mapText = $derived(!p ? "–" : p.motorMap > 0 ? String(p.motorMap) : p.motorMapMax > 0 ? "0" : "1");
  const bbText = $derived(!p || p.brakeBiasFront <= 0 ? "–" : `${(p.brakeBiasFront * 100).toFixed(1)}%`);
  const hasSubElectronics = $derived(
    !!p && (p.tcSlip > 0 || p.tcCut > 0 || p.migration > 0 || p.frontArb > 0 || p.rearArb > 0),
  );

  // Highlight chips & show large popup when the driver changes TC, ABS, MAP, BB, Slip, Cut, Migration or ARB
  let changedKey = $state<string | null>(null);
  let changedBanner = $state<string | null>(null);
  let changedPopup = $state<{ title: string; value: string; color: string } | null>(null);
  let changedTimer: ReturnType<typeof setTimeout> | null = null;
  let lastElecSig = "";
  let prevElec: {
    tc: number;
    tcSlip: number;
    tcCut: number;
    abs: number;
    map: number;
    bb: string;
    mig: number;
    fArb: number;
    rArb: number;
  } | null = null;

  function markChanged(key: string, banner: string, title: string, value: string, color: string) {
    changedKey = key;
    changedBanner = banner;
    changedPopup = { title, value, color };
    if (changedTimer) clearTimeout(changedTimer);
    changedTimer = setTimeout(() => {
      changedKey = null;
      changedBanner = null;
      changedPopup = null;
    }, 2200);
  }

  $effect(() => {
    if (!p) {
      prevElec = null;
      lastElecSig = "";
      return;
    }
    const bb = (p.brakeBiasFront * 100).toFixed(1);
    const sig = `${p.tc}|${p.tcSlip}|${p.tcCut}|${p.abs}|${p.motorMap}|${bb}|${p.migration}|${p.frontArb}|${p.rearArb}`;
    if (sig === lastElecSig) return;
    lastElecSig = sig;
    if (prevElec) {
      if (p.tc !== prevElec.tc)
        markChanged("TC", `TC ${p.tc > 0 ? p.tc : "OFF"}`, "CONTROL DE TRACCIÓN (TC)", p.tc > 0 ? String(p.tc) : "OFF", "#f59e0b");
      else if (p.tcSlip !== prevElec.tcSlip)
        markChanged("TC", `TC SLIP ${p.tcSlip}`, "TC SLIP", String(p.tcSlip), "#f59e0b");
      else if (p.tcCut !== prevElec.tcCut)
        markChanged("TC", `TC CUT ${p.tcCut}`, "TC CUT", String(p.tcCut), "#f59e0b");
      else if (p.abs !== prevElec.abs)
        markChanged("ABS", `ABS ${p.abs > 0 ? p.abs : "OFF"}`, "SISTEMA ABS", p.abs > 0 ? String(p.abs) : "OFF", "#38bdf8");
      else if (p.motorMap !== prevElec.map)
        markChanged("MAP", `MAPA ${p.motorMap}`, "MAPA MOTOR (MAP)", String(p.motorMap), "#22c55e");
      else if (bb !== prevElec.bb)
        markChanged("BB", `BB ${bb}%`, "REPARTO DE FRENADA (BB)", `${bb}%`, "#ef4444");
      else if (p.migration !== prevElec.mig)
        markChanged("BB", `MIGRACIÓN ${p.migration}`, "MIGRACIÓN FRENADA", String(p.migration), "#ef4444");
      else if (p.frontArb !== prevElec.fArb || p.rearArb !== prevElec.rArb)
        markChanged("ARB", `ARB ${p.frontArb}/${p.rearArb}`, "BARRAS ESTABILIZADORAS", `${p.frontArb} / ${p.rearArb}`, "#38bdf8");
    }
    prevElec = {
      tc: p.tc,
      tcSlip: p.tcSlip,
      tcCut: p.tcCut,
      abs: p.abs,
      map: p.motorMap,
      bb,
      mig: p.migration,
      fArb: p.frontArb,
      rArb: p.rearArb,
    };
  });

  const ffb = $derived(p ? Math.max(-1, Math.min(1, p.ffb)) : 0);
  const clipping = $derived(Math.abs(ffb) >= 0.99);

  // Steering angle in degrees (assuming roughly ±270° visual lock for steering input -1..1)
  const steerDeg = $derived((p?.steering ?? 0) * 180);
  const throttlePct = $derived(Math.round((p?.throttle ?? 0) * 100));
  const brakePct = $derived(Math.round((p?.brake ?? 0) * 100));

  const LED_COUNT = 15;
  function ledColor(index: number, total: number): string {
    const f = (index + 1) / total;
    if (f > 0.88) return "#38bdf8"; // Pit/shift blue-cyan
    if (f > 0.72) return "#ef4444"; // Red
    if (f > 0.52) return "#f59e0b"; // Amber
    return "#22c55e"; // Green
  }
</script>

{#snippet rpmHeader(heightClass = "h-2.5")}
  {#if rpmStyle === "leds"}
    <div class="grid grid-cols-15 gap-1" class:animate-pulse={flash}>
      {#each { length: LED_COUNT } as _, i}
        {@const threshold = 0.55 + (i / LED_COUNT) * 0.43}
        {@const lit = rpmFrac >= threshold}
        {@const c = flash ? "#38bdf8" : ledColor(i, LED_COUNT)}
        <div
          class={["rounded-[2px] transition-all duration-75", heightClass]}
          style:background={lit ? c : "rgb(255 255 255 / 0.08)"}
          style:box-shadow={lit ? `0 0 8px ${c}` : "none"}
        ></div>
      {/each}
    </div>
  {:else if rpmStyle === "center"}
    <div class={["relative flex items-center overflow-hidden rounded-full bg-hud-2", heightClass]} class:animate-pulse={flash}>
      <div
        class="h-full rounded-r-full transition-[width] duration-75"
        style:width="{rpmFrac * 50}%"
        style:background={rpmColor}
        style:box-shadow="0 0 10px {rpmColor}"
      ></div>
      <div
        class="ml-auto h-full rounded-l-full transition-[width] duration-75"
        style:width="{rpmFrac * 50}%"
        style:background={rpmColor}
        style:box-shadow="0 0 10px {rpmColor}"
      ></div>
      <div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/40"></div>
    </div>
  {:else}
    <div class={["overflow-hidden rounded-full bg-hud-2", heightClass]} class:animate-pulse={flash}>
      <div
        class="h-full rounded-full transition-[width] duration-75"
        style:width="{rpmFrac * 100}%"
        style:background={rpmColor}
        style:box-shadow="0 0 10px {rpmColor}"
      ></div>
    </div>
  {/if}
{/snippet}

{#snippet steeringWheelSvg(size = 38)}
  <div class="flex flex-col items-center justify-center" title="Ángulo de volante">
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      class="transition-transform duration-75"
      style:transform="rotate({steerDeg}deg)"
    >
      <!-- Outer GT/Hypercar rim -->
      <rect x="5" y="9" width="38" height="30" rx="11" fill="none" stroke="currentColor" stroke-width="4" class="text-white/85" />
      <!-- Center hub & spokes -->
      <path d="M9 24h30M24 24v14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" class="text-white/70" />
      <circle cx="24" cy="24" r="5" fill="var(--color-accent)" />
      <!-- Top center stripe -->
      <rect x="22" y="7" width="4" height="5" rx="1" fill="var(--color-accent)" />
    </svg>
  </div>
{/snippet}

{#snippet pedalPair(barH = "h-16")}
  <div class="flex items-end gap-1.5">
    <div class="flex flex-col items-center gap-0.5">
      <div class={["relative w-2.5 overflow-hidden rounded-sm bg-black/50 ring-1 ring-white/10", barH]}>
        <div
          class="absolute inset-x-0 bottom-0 transition-[height] duration-75"
          style:height="{(p?.brake ?? 0) * 100}%"
          style:background={p?.absActive ? "var(--color-warn)" : "var(--color-brake)"}
        ></div>
      </div>
      <span class="text-[9px] font-bold text-brake">F</span>
    </div>
    <div class="flex flex-col items-center gap-0.5">
      <div class={["relative w-2.5 overflow-hidden rounded-sm bg-black/50 ring-1 ring-white/10", barH]}>
        <div
          class="absolute inset-x-0 bottom-0 transition-[height] duration-75"
          style:height="{(p?.throttle ?? 0) * 100}%"
          style:background="var(--color-throttle)"
        ></div>
      </div>
      <span class="text-[9px] font-bold text-throttle">A</span>
    </div>
  </div>
{/snippet}

{#snippet chip(label: string, value: string | number, active: boolean, accentColor?: string)}
  {@const isChanged = changedKey === label}
  <div
    class={[
      "flex items-baseline justify-between rounded-md px-2 py-1 transition-all duration-150",
      active || isChanged ? "bg-warn text-black shadow-[0_0_12px_var(--color-warn)] ring-1 ring-white" : "hud-tile",
    ]}
    style:border-left={!active && !isChanged && accentColor ? `2px solid ${accentColor}` : undefined}
  >
    <span class={["text-[10px] font-bold tracking-wider uppercase", active || isChanged ? "text-black/80" : "text-muted"]}>{label}</span>
    <span class="text-[13px] font-bold tabular-nums">{value}</span>
  </div>
{/snippet}

{#snippet indicator(title: string, color: string | null, icon: Snippet)}
  <div
    {title}
    class={[
      "grid h-7 place-items-center rounded-md transition-colors",
      noIconBg
        ? (color ? "ring-1 ring-white/10" : "text-faint opacity-40")
        : (color ? "bg-hud-2 ring-1 ring-white/10" : "bg-black/20 text-faint opacity-50"),
    ]}
    style:color
  >
    <svg
      viewBox="0 0 24 24"
      class="size-4.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {@render icon()}
    </svg>
  </div>
{/snippet}

{#snippet headlightIcon()}
  <path d="M13 5c4 0 7 3.1 7 7s-3 7-7 7c-1 0-1.5-.6-1.5-1.5v-11C11.5 5.6 12 5 13 5Z" />
  <path d="M3 7h5.5M3 10.3h5.5M3 13.7h5.5M3 17h5.5" />
{/snippet}

{#snippet limiterIcon()}
  <path d="M4.2 17a9 9 0 1 1 15.6 0" />
  <path d="m12 13 4-4.5" />
  <circle cx="12" cy="13" r="1.2" fill="currentColor" />
  <path d="M6.5 13H5M19 13h-1.5M12 6.5V5" />
{/snippet}

{#snippet tcIcon()}
  <rect x="6" y="6" width="12" height="12" rx="1.5" />
  <path d="M9.5 9.5h5M12 9.5v5.5" />
  <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
{/snippet}

{#snippet absIcon()}
  <circle cx="12" cy="12" r="6.5" />
  <path d="M4.5 6.5a9.5 9.5 0 0 0 0 11M19.5 6.5a9.5 9.5 0 0 1 0 11" />
  <text x="12" y="14.2" text-anchor="middle" font-size="5.5" font-weight="700" fill="currentColor" stroke="none">ABS</text>
{/snippet}

{#snippet wiperIcon()}
  <path d="M3 17a11 11 0 0 1 18 0" />
  <path d="M12 18 7.5 8.5" />
  <circle cx="12" cy="18" r="1" fill="currentColor" />
{/snippet}

{#snippet engineIcon()}
  <path d="M8 7h5M10.5 7v3" />
  <path d="M3 12v4M3 14h2M5 10h10l2 2h2v-1.5M21 10.5V17M21 15h-2l-2 2H8l-3-3v-4Z" />
{/snippet}

{#snippet extraRows()}
  {#if opts.showIndicators && p}
    <div class="mt-2.5 grid grid-cols-6 gap-1.5">
      {@render indicator("Luces", p.headlights ? ON : null, headlightIcon)}
      {@render indicator("Limitador Pit", isPitLimiter ? WARN : null, limiterIcon)}
      {@render indicator("Control de tracción", p.tcActive ? WARN : null, tcIcon)}
      {@render indicator("ABS", p.absActive ? WARN : null, absIcon)}
      {@render indicator("Limpiaparabrisas", p.wipers > 0 ? ON : null, wiperIcon)}
      {@render indicator("Motor", engineColor, engineIcon)}
    </div>
  {/if}

  {#if opts.showBattery && hybrid && p}
    <div class="mt-2 flex items-center gap-2 rounded-md bg-black/25 px-2 py-1">
      <svg viewBox="0 0 24 24" class="size-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-hud-2">
        <div class="h-full rounded-full transition-[width] duration-150" style:width="{battery * 100}%" style:background={batteryColor}></div>
      </div>
      <span class="w-8 text-right text-[12px] font-bold tabular-nums">{Math.round(battery * 100)}%</span>
      <span class="w-12 text-right text-[10px] font-bold tracking-wider uppercase" style:color={motor.color}>{motor.label}</span>
    </div>
  {/if}

  {#if opts.showFfb && p}
    <div class="mt-2 flex items-center gap-2">
      <span class={["w-7 text-[10px] font-bold", clipping ? "text-bad" : "text-muted"]}>FFB</span>
      <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-hud-2">
        <div class="absolute inset-y-0 left-1/2 w-px bg-hud-line"></div>
        <div
          class="absolute inset-y-0"
          style:left="{ffb < 0 ? 50 + ffb * 50 : 50}%"
          style:width="{Math.abs(ffb) * 50}%"
          style:background={clipping ? "var(--color-bad)" : "var(--color-steer)"}
        ></div>
      </div>
      <span class={["w-9 text-right text-[12px] font-bold tabular-nums", clipping && "text-bad"]}>{Math.round(Math.abs(ffb) * 100)}%</span>
    </div>
  {/if}

  {#if opts.showSettings && p}
    <div class="mt-2.5 grid grid-cols-4 gap-1.5">
      {@render chip("TC", tcText, p.tcActive, "#f59e0b")}
      {@render chip("ABS", absText, p.absActive, "#38bdf8")}
      {@render chip("MAP", mapText, false, "#22c55e")}
      {@render chip("BB", bbText, false, "#ef4444")}
    </div>
    {#if hasSubElectronics}
      <div class="mt-1 grid grid-cols-4 gap-1 text-[10px] tabular-nums">
        <div class="flex items-center justify-between rounded bg-black/35 px-1.5 py-0.5 text-muted">
          <span>SLIP</span>
          <b class="text-fg">{p.tcSlip > 0 ? p.tcSlip : "–"}</b>
        </div>
        <div class="flex items-center justify-between rounded bg-black/35 px-1.5 py-0.5 text-muted">
          <span>CUT</span>
          <b class="text-fg">{p.tcCut > 0 ? p.tcCut : "–"}</b>
        </div>
        <div class="flex items-center justify-between rounded bg-black/35 px-1.5 py-0.5 text-muted">
          <span>MIG</span>
          <b class="text-fg">{p.migration > 0 ? p.migration : "–"}</b>
        </div>
        <div class="flex items-center justify-between rounded bg-black/35 px-1.5 py-0.5 text-muted">
          <span>ARB</span>
          <b class="text-fg">{p.frontArb > 0 || p.rearArb > 0 ? `${p.frontArb}/${p.rearArb}` : "–"}</b>
        </div>
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet pitLimiterBanner()}
  {#if isYellowFlag}
    <div class="mb-2 animate-pulse rounded bg-[#ffd400] py-0.5 text-center font-display text-xs font-black tracking-widest text-black uppercase shadow-[0_0_15px_#ffd400]">
      ⚠️ BANDERA AMARILLA
    </div>
  {:else if isBlueFlag}
    <div class="mb-2 animate-pulse rounded bg-[#1d6cf2] py-0.5 text-center font-display text-xs font-black tracking-widest text-white uppercase shadow-[0_0_15px_#1d6cf2]">
      🟦 BANDERA AZUL · CEDE EL PASO
    </div>
  {/if}
  {#if isPitLimiter}
    <div class="mb-2 animate-pulse rounded bg-warn py-0.5 text-center font-display text-xs font-extrabold tracking-widest text-black uppercase">
      LIMITADOR DE PIT ACTIVO
    </div>
  {/if}
  {#if changedBanner}
    <div class="mb-1.5 rounded bg-accent/90 py-0.5 text-center font-display text-[11px] font-black tracking-widest text-white uppercase shadow">
      ⚙ {changedBanner}
    </div>
  {/if}
{/snippet}

{#snippet batteryFullBanner()}
  {#if batteryFull}
    <div
      class="mb-2 flex animate-pulse items-center justify-center gap-1.5 rounded bg-[#00ff66] py-0.5 text-center font-display text-xs font-black tracking-widest text-black uppercase shadow-[0_0_18px_#00ff66]"
    >
      <span>⚡ BATERÍA 100% LLENA · DESPLEGAR ERS</span>
    </div>
  {/if}
{/snippet}

{#snippet bigRotaryOverlay()}
  {#if changedPopup}
    <div class="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-2">
      <div
        class="flex flex-col items-center justify-center rounded-2xl border-4 bg-[#070e1b]/95 px-6 py-3.5 shadow-2xl backdrop-blur-md transition-all duration-150"
        style:border-color={changedPopup.color}
        style:box-shadow="0 0 35px {changedPopup.color}"
      >
        <span class="font-display text-[10px] font-black tracking-[0.25em] text-white/80 uppercase" style:color={changedPopup.color}>
          {changedPopup.title}
        </span>
        <span class="mt-0.5 font-display text-4xl sm:text-5xl font-black text-white tracking-wider tabular-nums">
          {changedPopup.value}
        </span>
      </div>
    </div>
  {/if}
{/snippet}

<!-- =========================================================================
     MODE 1: WEC / BROADCAST MDT (Deportivo con LEDs, caja central azul MDT)
     ========================================================================= -->
{#if style === "wec"}
  <div
    class={[
      "hud relative w-[360px] overflow-hidden p-3 transition-colors",
      hudAlertClass,
      flash && "ring-2 ring-accent shadow-[0_0_25px_rgb(34_135_236_/_0.6)]",
    ]}
  >
    {@render bigRotaryOverlay()}
    {#if showMdtLogo}
      <img
        src="/mdt-logo.png"
        alt=""
        class="pointer-events-none absolute -right-3 -bottom-3 h-24 w-24 object-contain opacity-[0.07]"
      />
    {/if}

    {@render batteryFullBanner()}
    {@render pitLimiterBanner()}
    {@render rpmHeader("h-2.5")}

    <div class="mt-2.5 flex items-center justify-between gap-2.5">
      <!-- Left: Speed + MDT Mini Header -->
      <div class="flex min-w-[92px] flex-col">
        {#if showMdtLogo}
          <div class="mb-0.5 flex items-center gap-1">
            <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
            <span class="font-display text-[10px] font-extrabold tracking-wider text-accent uppercase">MDT-HUD</span>
          </div>
        {/if}
        <div class="hud-value text-[42px] leading-none font-extrabold">{spdText}</div>
        <div class="hud-label mt-1">VELOCIDAD ({speedUnit(units)})</div>
      </div>

      <!-- Center: Framed Gear Box -->
      <div
        class={[
          "relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-xl border-2 bg-gradient-to-b from-accent/25 to-black/50 shadow-inner transition-colors",
          flash
            ? "border-sky-400 bg-sky-500/30 text-white shadow-[0_0_18px_#38bdf8]"
            : isPitLimiter
              ? "border-warn text-warn"
              : "border-accent/70 text-white",
        ]}
      >
        <span class="hud-value text-[58px] leading-none font-black">{gear}</span>
        <span class="absolute top-1 left-1.5 text-[8px] font-bold tracking-widest text-accent/80 uppercase">MARCHA</span>
      </div>

      <!-- Right: RPM + Steering + Pedals -->
      <div class="flex items-center gap-2.5">
        <div class="flex flex-col items-end">
          {#if showSteeringWheel}
            {@render steeringWheelSvg(34)}
          {/if}
          <div class="hud-value mt-1 text-[22px] leading-none">{rpmText}</div>
          <div class="hud-label mt-0.5">RPM</div>
        </div>
        {#if showPedals}
          {@render pedalPair("h-[66px]")}
        {/if}
      </div>
    </div>

    {@render extraRows()}
  </div>

<!-- =========================================================================
     MODE 2: COSWORTH / MOTEC DDU (Pantalla técnica Hypercar / GT3)
     ========================================================================= -->
{:else if style === "ddu"}
  <div
    class={[
      "hud relative w-[380px] overflow-hidden rounded-xl border-2 border-accent/40 bg-[#070a10]/95 p-2.5 shadow-2xl",
      hudAlertClass,
      flash && "border-sky-400 bg-sky-950/60",
    ]}
  >
    {@render bigRotaryOverlay()}
    {@render batteryFullBanner()}
    {@render pitLimiterBanner()}
    <!-- Top LED Strip -->
    {@render rpmHeader("h-3")}

    <!-- DDU Header Bar -->
    <div class="mt-1.5 flex items-center justify-between border-b border-white/10 pb-1 text-[10px] font-bold tracking-wider uppercase">
      <div class="flex items-center gap-1.5">
        {#if showMdtLogo}
          <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
        {/if}
        <span class="text-accent">MDT-HUD</span>
      </div>
      {#if isPitLimiter}
        <span class="animate-pulse rounded bg-warn px-1.5 py-px text-black">LIMITADOR DE PIT</span>
      {:else if p?.tcActive}
        <span class="rounded bg-amber-500 px-1.5 py-px text-black">TC ACTIVO</span>
      {:else if p?.absActive}
        <span class="rounded bg-sky-400 px-1.5 py-px text-black">ABS ACTIVO</span>
      {:else}
        <span class="text-muted">PÁG 1 · CARRERA</span>
      {/if}
      <span class="tabular-nums text-white/80">{rpmText} RPM</span>
    </div>

    <!-- Main 3-Column Technical Grid -->
    <div class="mt-2 grid grid-cols-[1fr_92px_1fr] gap-2">
      <!-- Left Column Cells -->
      <div class="flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between rounded border border-white/10 bg-black/50 px-2.5 py-1.5">
          <div>
            <div class="text-[9px] font-bold tracking-wider text-muted uppercase">VELOCIDAD ({speedUnit(units)})</div>
            <div class="hud-value text-[34px] leading-none font-black">{spdText}</div>
          </div>
          {#if showSteeringWheel}
            {@render steeringWheelSvg(30)}
          {/if}
        </div>
        {#if opts.showSettings ?? true}
          <div class="grid grid-cols-2 gap-1.5">
            <div class={["rounded border px-2 py-1 transition-all", p?.tcActive || changedKey === "TC" ? "border-warn bg-warn text-black shadow-[0_0_10px_var(--color-warn)]" : "border-amber-500/40 bg-amber-500/10"]}>
              <div class={["text-[9px] font-bold", p?.tcActive || changedKey === "TC" ? "text-black" : "text-amber-400"]}>TC</div>
              <div class="font-display text-lg leading-tight font-bold tabular-nums">{tcText}</div>
            </div>
            <div class={["rounded border px-2 py-1 transition-all", p?.absActive || changedKey === "ABS" ? "border-sky-400 bg-sky-400 text-black shadow-[0_0_10px_#38bdf8]" : "border-sky-500/40 bg-sky-500/10"]}>
              <div class={["text-[9px] font-bold", p?.absActive || changedKey === "ABS" ? "text-black" : "text-sky-400"]}>ABS</div>
              <div class="font-display text-lg leading-tight font-bold tabular-nums">{absText}</div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Center Giant Gear Cell -->
      <div
        class={[
          "flex flex-col items-center justify-center rounded-lg border-2 bg-black/70 py-1",
          flash ? "border-sky-400 bg-sky-500/30 text-sky-200" : isPitLimiter ? "border-warn text-warn" : "border-accent text-white",
        ]}
      >
        <span class="text-[9px] font-bold tracking-widest text-muted uppercase">MARCHA</span>
        <span class="hud-value text-[68px] leading-none font-black">{gear}</span>
      </div>

      <!-- Right Column Cells -->
      <div class="flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between rounded border border-white/10 bg-black/50 px-2.5 py-1.5">
          <div>
            <div class="text-[9px] font-bold tracking-wider text-muted uppercase">FRENO / ACEL</div>
            <div class="mt-0.5 flex items-baseline gap-1.5 font-display text-sm font-bold tabular-nums">
              <span class="text-brake">{brakePct}%</span>
              <span class="text-muted">/</span>
              <span class="text-throttle">{throttlePct}%</span>
            </div>
          </div>
          {#if showPedals}
            {@render pedalPair("h-10")}
          {/if}
        </div>
        {#if opts.showSettings ?? true}
          <div class="grid grid-cols-2 gap-1.5">
            <div class={["rounded border px-2 py-1 transition-all", changedKey === "MAP" ? "border-emerald-300 bg-emerald-400 text-black shadow-[0_0_10px_#22c55e]" : "border-emerald-500/40 bg-emerald-500/10"]}>
              <div class={["text-[9px] font-bold", changedKey === "MAP" ? "text-black" : "text-emerald-400"]}>MAP</div>
              <div class="font-display text-lg leading-tight font-bold tabular-nums">{mapText}</div>
            </div>
            <div class={["rounded border px-2 py-1 transition-all", changedKey === "BB" ? "border-rose-300 bg-rose-400 text-black shadow-[0_0_10px_#ef4444]" : "border-rose-500/40 bg-rose-500/10"]}>
              <div class={["text-[9px] font-bold", changedKey === "BB" ? "text-black" : "text-rose-400"]}>BB</div>
              <div class="font-display text-base leading-tight font-bold tabular-nums">{bbText}</div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if opts.showSettings && hasSubElectronics && p}
      <div class="mt-1.5 grid grid-cols-4 gap-1 text-[10px] tabular-nums">
        <div class="flex items-center justify-between rounded bg-black/45 px-1.5 py-0.5 text-muted">
          <span>SLIP</span>
          <b class="text-fg">{p.tcSlip > 0 ? p.tcSlip : "–"}</b>
        </div>
        <div class="flex items-center justify-between rounded bg-black/45 px-1.5 py-0.5 text-muted">
          <span>CUT</span>
          <b class="text-fg">{p.tcCut > 0 ? p.tcCut : "–"}</b>
        </div>
        <div class="flex items-center justify-between rounded bg-black/45 px-1.5 py-0.5 text-muted">
          <span>MIG</span>
          <b class="text-fg">{p.migration > 0 ? p.migration : "–"}</b>
        </div>
        <div class="flex items-center justify-between rounded bg-black/45 px-1.5 py-0.5 text-muted">
          <span>ARB</span>
          <b class="text-fg">{p.frontArb > 0 || p.rearArb > 0 ? `${p.frontArb}/${p.rearArb}` : "–"}</b>
        </div>
      </div>
    {/if}

    {#if opts.showBattery && hybrid && p}
      <div class="mt-2 flex items-center gap-2 rounded border border-white/10 bg-black/50 px-2 py-1">
        <span class="text-[10px] font-bold text-accent">HÍBRIDO</span>
        <div class="h-2 flex-1 overflow-hidden rounded-sm bg-hud-2">
          <div class="h-full transition-[width] duration-150" style:width="{battery * 100}%" style:background={batteryColor}></div>
        </div>
        <span class="text-xs font-bold tabular-nums">{Math.round(battery * 100)}%</span>
        <span class="text-[10px] font-bold uppercase" style:color={motor.color}>{motor.label}</span>
      </div>
    {/if}

    {#if opts.showFfb && p}
      <div class="mt-2 flex items-center gap-2">
        <span class={["w-7 text-[10px] font-bold", clipping ? "text-bad" : "text-muted"]}>FFB</span>
        <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-hud-2">
          <div class="absolute inset-y-0 left-1/2 w-px bg-hud-line"></div>
          <div
            class="absolute inset-y-0"
            style:left="{ffb < 0 ? 50 + ffb * 50 : 50}%"
            style:width="{Math.abs(ffb) * 50}%"
            style:background={clipping ? "var(--color-bad)" : "var(--color-steer)"}
          ></div>
        </div>
        <span class={["w-9 text-right text-[12px] font-bold tabular-nums", clipping && "text-bad"]}>{Math.round(Math.abs(ffb) * 100)}%</span>
      </div>
    {/if}

    {#if opts.showIndicators && p}
      <div class="mt-2 grid grid-cols-6 gap-1">
        {@render indicator("Luces", p.headlights ? ON : null, headlightIcon)}
        {@render indicator("Limitador Pit", isPitLimiter ? WARN : null, limiterIcon)}
        {@render indicator("Control de tracción", p.tcActive ? WARN : null, tcIcon)}
        {@render indicator("ABS", p.absActive ? WARN : null, absIcon)}
        {@render indicator("Limpiaparabrisas", p.wipers > 0 ? ON : null, wiperIcon)}
        {@render indicator("Motor", engineColor, engineIcon)}
      </div>
    {/if}
  </div>

<!-- =========================================================================
     MODE 3: TACÓMETRO CIRCULAR (RADIAL) + VOLANTE EN VIVO
     ========================================================================= -->
{:else if style === "radial"}
  {@const R = 52}
  {@const CIRC = 2 * Math.PI * R}
  {@const ARC = CIRC * 0.75}
  <div class={["hud relative w-[340px] p-3", hudAlertClass]}>
    {@render bigRotaryOverlay()}
    {@render batteryFullBanner()}
    {@render pitLimiterBanner()}
    <div class="flex items-center justify-between gap-3">
      <!-- Left: Speed & Wheel -->
      <div class="flex flex-col items-start">
        {#if showMdtLogo}
          <div class="mb-1 flex items-center gap-1">
            <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
            <span class="font-display text-[10px] font-extrabold tracking-wider text-accent uppercase">MDT-HUD</span>
          </div>
        {/if}
        <div class="hud-value text-[38px] leading-none font-bold">{spdText}</div>
        <div class="hud-label mt-0.5">VELOCIDAD ({speedUnit(units)})</div>
        {#if showSteeringWheel}
          <div class="mt-2">
            {@render steeringWheelSvg(40)}
          </div>
        {/if}
      </div>

      <!-- Center: Radial Tachometer Gauge -->
      <div class="relative flex h-[126px] w-[126px] shrink-0 items-center justify-center">
        <svg viewBox="0 0 120 120" class="h-full w-full rotate-[135deg]">
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="rgb(255 255 255 / 0.1)"
            stroke-width="9"
            stroke-dasharray="{ARC} {CIRC}"
            stroke-linecap="round"
          />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={rpmColor}
            stroke-width="9"
            stroke-dasharray="{ARC * rpmFrac} {CIRC}"
            stroke-linecap="round"
            style:filter="drop-shadow(0 0 6px {rpmColor})"
            class="transition-all duration-75"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-[8px] font-bold tracking-widest text-muted uppercase">MARCHA</span>
          <span class={["hud-value text-[50px] leading-none font-black", flash && "animate-pulse text-sky-400"]}>{gear}</span>
          <span class="mt-0.5 text-[10px] font-bold tabular-nums text-muted">{rpmText} RPM</span>
        </div>
      </div>

      <!-- Right: Pedals -->
      {#if showPedals}
        <div class="flex flex-col items-center">
          {@render pedalPair("h-[88px]")}
        </div>
      {/if}
    </div>

    {@render extraRows()}
  </div>

<!-- =========================================================================
     MODE 4: BARRA HORIZONTAL COMPACTA
     ========================================================================= -->
{:else if style === "compact"}
  <div class={["hud relative flex items-center gap-3 px-3.5 py-2", hudAlertClass]}>
    {@render bigRotaryOverlay()}
    {#if batteryFull}
      <span class="animate-pulse rounded bg-[#00ff66] px-2 py-0.5 font-display text-[11px] font-black text-black shadow-[0_0_12px_#00ff66]">
        ⚡ BAT 100%
      </span>
    {/if}
    {#if isPitLimiter}
      <span class="animate-pulse rounded bg-warn px-2 py-0.5 font-display text-[11px] font-black text-black">
        LIMITADOR PIT
      </span>
    {/if}
    {#if showMdtLogo}
      <img src="/mdt-logo.png" alt="MDT" class="h-7 w-7 shrink-0 object-contain" />
    {/if}

    <!-- Gear pill -->
    <div
      class={[
        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 font-display text-3xl font-black",
        flash ? "border-sky-400 bg-sky-500/30 text-white" : isPitLimiter ? "border-warn text-warn" : "border-accent bg-accent/15 text-white",
      ]}
      title="Marcha"
    >
      {gear}
    </div>

    <!-- Speed -->
    <div class="min-w-[68px]">
      <div class="hud-value text-[28px] leading-none font-bold">{spdText}</div>
      <div class="hud-label mt-0.5 text-[9px]">VELOCIDAD ({speedUnit(units)})</div>
    </div>

    <!-- RPM bar + value -->
    <div class="flex w-[140px] flex-col gap-1">
      {@render rpmHeader("h-2")}
      <div class="flex justify-between text-[10px] font-semibold tabular-nums text-muted">
        <span>RPM</span>
        <span class="text-fg">{rpmText}</span>
      </div>
    </div>

    {#if showPedals}
      {@render pedalPair("h-9")}
    {/if}

    {#if showSteeringWheel}
      {@render steeringWheelSvg(32)}
    {/if}

    {#if opts.showBattery && hybrid && p}
      <div class="flex flex-col items-end">
        <span class="text-[9px] font-bold uppercase" style:color={motor.color}>{motor.label}</span>
        <span class="text-xs font-bold tabular-nums">{Math.round(battery * 100)}%</span>
      </div>
    {/if}

    {#if opts.showSettings && p}
      <div class="flex gap-1 border-l border-hud-line pl-2.5">
        {@render chip("TC", tcText, p.tcActive, "#f59e0b")}
        {@render chip("ABS", absText, p.absActive, "#38bdf8")}
        {@render chip("MAP", mapText, false, "#22c55e")}
        {@render chip("BB", bbText, false, "#ef4444")}
      </div>
    {/if}
  </div>

<!-- =========================================================================
     MODE 5: CLÁSICO ESTÁNDAR
     ========================================================================= -->
{:else}
  <div class={["hud relative w-[340px] p-3", hudAlertClass]}>
    {@render bigRotaryOverlay()}
    {@render batteryFullBanner()}
    {@render pitLimiterBanner()}
    {@render rpmHeader("h-2")}

    <div class="mt-3 flex items-end justify-between gap-2">
      <div>
        {#if showMdtLogo}
          <div class="mb-0.5 flex items-center gap-1">
            <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
            <span class="font-display text-[10px] font-extrabold tracking-wider text-accent uppercase">MDT-HUD</span>
          </div>
        {/if}
        <div class="hud-value text-[40px]">{spdText}</div>
        <div class="hud-label mt-1">VELOCIDAD ({speedUnit(units)})</div>
      </div>
      <div class="flex flex-col items-center px-3">
        <span class="text-[9px] font-bold tracking-widest text-muted uppercase">MARCHA</span>
        <div class={["hud-value text-[64px] leading-none font-bold", isPitLimiter && "text-warn"]}>{gear}</div>
      </div>
      <div class="flex items-end gap-2">
        <div class="flex flex-col items-end text-right">
          {#if showSteeringWheel}
            {@render steeringWheelSvg(32)}
          {/if}
          <div class="hud-value mt-1 text-[24px]">{rpmText}</div>
          <div class="hud-label mt-1">RPM</div>
        </div>
        {#if showPedals}
          {@render pedalPair("h-14")}
        {/if}
      </div>
    </div>

    {@render extraRows()}
  </div>
{/if}
