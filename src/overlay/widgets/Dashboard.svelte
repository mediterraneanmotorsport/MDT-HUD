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
  const motor = $derived(
    p?.electricMotorState === 3
      ? { label: "REGEN", color: "var(--color-clutch)" }
      : p?.electricMotorState === 2
        ? { label: "DEPLOY", color: "var(--color-good)" }
        : { label: "IDLE", color: "var(--color-muted)" },
  );
  const batteryColor = $derived(
    p?.electricMotorState === 3 ? "var(--color-clutch)" : battery < 0.15 ? "var(--color-bad)" : "var(--color-good)",
  );

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
  <div
    class={[
      "flex items-baseline justify-between rounded-md px-2 py-1 transition-colors",
      active ? "bg-warn text-black shadow-[0_0_10px_var(--color-warn)]" : "hud-tile",
    ]}
    style:border-left={!active && accentColor ? `2px solid ${accentColor}` : undefined}
  >
    <span class={["text-[10px] font-bold tracking-wider uppercase", active ? "text-black/80" : "text-muted"]}>{label}</span>
    <span class="text-[13px] font-bold tabular-nums">{value}</span>
  </div>
{/snippet}

{#snippet indicator(title: string, color: string | null, icon: Snippet)}
  <div
    {title}
    class={["grid h-7 place-items-center rounded-md transition-colors", color ? "bg-hud-2 ring-1 ring-white/10" : "text-faint opacity-50"]}
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
      {@render indicator("Limitador Pit", p.speedLimiter ? WARN : null, limiterIcon)}
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
      {@render chip("TC", p.tcMax > 0 ? p.tc : "–", p.tcActive, "#f59e0b")}
      {@render chip("ABS", p.absMax > 0 ? p.abs : "–", p.absActive, "#38bdf8")}
      {@render chip("MAP", p.motorMapMax > 0 ? p.motorMap : "–", false, "#22c55e")}
      {@render chip("BB", (p.brakeBiasFront * 100).toFixed(1), false, "#ef4444")}
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
      flash && "ring-2 ring-accent shadow-[0_0_25px_rgb(34_135_236_/_0.6)]",
    ]}
  >
    {#if showMdtLogo}
      <img
        src="/mdt-logo.png"
        alt=""
        class="pointer-events-none absolute -right-3 -bottom-3 h-24 w-24 object-contain opacity-[0.07]"
      />
    {/if}

    <!-- Pit limiter banner -->
    {#if p?.speedLimiter}
      <div class="mb-2 animate-pulse rounded bg-warn py-0.5 text-center font-display text-xs font-extrabold tracking-widest text-black uppercase">
        LIMITADOR DE PIT ACTIVO
      </div>
    {/if}

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
        <div class="hud-label mt-1">{speedUnit(units)}</div>
      </div>

      <!-- Center: Framed Gear Box -->
      <div
        class={[
          "relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-xl border-2 bg-gradient-to-b from-accent/25 to-black/50 shadow-inner transition-colors",
          flash
            ? "border-sky-400 bg-sky-500/30 text-white shadow-[0_0_18px_#38bdf8]"
            : p?.speedLimiter
              ? "border-warn text-warn"
              : "border-accent/70 text-white",
        ]}
      >
        <span class="hud-value text-[58px] leading-none font-black">{gear}</span>
        <span class="absolute top-1 left-1.5 text-[8px] font-bold tracking-widest text-accent/80 uppercase">GEAR</span>
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
      "hud w-[380px] overflow-hidden rounded-xl border-2 border-accent/40 bg-[#070a10]/95 p-2.5 shadow-2xl",
      flash && "border-sky-400 bg-sky-950/60",
    ]}
  >
    <!-- Top LED Strip -->
    {@render rpmHeader("h-3")}

    <!-- DDU Header Bar -->
    <div class="mt-1.5 flex items-center justify-between border-b border-white/10 pb-1 text-[10px] font-bold tracking-wider uppercase">
      <div class="flex items-center gap-1.5">
        {#if showMdtLogo}
          <img src="/mdt-logo.png" alt="MDT" class="h-3.5 w-3.5 object-contain" />
        {/if}
        <span class="text-accent">MDT DDU-PRO</span>
      </div>
      {#if p?.speedLimiter}
        <span class="animate-pulse rounded bg-warn px-1.5 py-px text-black">PIT LIMITER</span>
      {:else if p?.tcActive}
        <span class="rounded bg-amber-500 px-1.5 py-px text-black">TC ACTIVE</span>
      {:else if p?.absActive}
        <span class="rounded bg-sky-400 px-1.5 py-px text-black">ABS ACTIVE</span>
      {:else}
        <span class="text-muted">PAGE 1 · RACE</span>
      {/if}
      <span class="tabular-nums text-white/80">{rpmText} RPM</span>
    </div>

    <!-- Main 3-Column Technical Grid -->
    <div class="mt-2 grid grid-cols-[1fr_92px_1fr] gap-2">
      <!-- Left Column Cells -->
      <div class="flex flex-col justify-between gap-1.5">
        <div class="rounded border border-white/10 bg-black/50 px-2.5 py-1.5">
          <div class="text-[9px] font-bold tracking-wider text-muted uppercase">VELOCIDAD ({speedUnit(units)})</div>
          <div class="hud-value text-[34px] leading-none font-black">{spdText}</div>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <div class={["rounded border px-2 py-1", p?.tcActive ? "border-warn bg-warn text-black" : "border-amber-500/40 bg-amber-500/10"]}>
            <div class={["text-[9px] font-bold", p?.tcActive ? "text-black" : "text-amber-400"]}>TC</div>
            <div class="font-display text-lg leading-tight font-bold tabular-nums">{p && p.tcMax > 0 ? p.tc : "–"}</div>
          </div>
          <div class={["rounded border px-2 py-1", p?.absActive ? "border-sky-400 bg-sky-400 text-black" : "border-sky-500/40 bg-sky-500/10"]}>
            <div class={["text-[9px] font-bold", p?.absActive ? "text-black" : "text-sky-400"]}>ABS</div>
            <div class="font-display text-lg leading-tight font-bold tabular-nums">{p && p.absMax > 0 ? p.abs : "–"}</div>
          </div>
        </div>
      </div>

      <!-- Center Giant Gear Cell -->
      <div
        class={[
          "flex flex-col items-center justify-center rounded-lg border-2 bg-black/70 py-1",
          flash ? "border-sky-400 bg-sky-500/30 text-sky-200" : p?.speedLimiter ? "border-warn text-warn" : "border-accent text-white",
        ]}
      >
        <span class="text-[9px] font-bold tracking-widest text-muted uppercase">GEAR</span>
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
        <div class="grid grid-cols-2 gap-1.5">
          <div class="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1">
            <div class="text-[9px] font-bold text-emerald-400">MAP</div>
            <div class="font-display text-lg leading-tight font-bold tabular-nums">{p && p.motorMapMax > 0 ? p.motorMap : "–"}</div>
          </div>
          <div class="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1">
            <div class="text-[9px] font-bold text-rose-400">BB</div>
            <div class="font-display text-base leading-tight font-bold tabular-nums">{p ? (p.brakeBiasFront * 100).toFixed(1) : "–"}</div>
          </div>
        </div>
      </div>
    </div>

    {#if opts.showBattery && hybrid && p}
      <div class="mt-2 flex items-center gap-2 rounded border border-white/10 bg-black/50 px-2 py-1">
        <span class="text-[10px] font-bold text-accent">HYBRID</span>
        <div class="h-2 flex-1 overflow-hidden rounded-sm bg-hud-2">
          <div class="h-full transition-[width] duration-150" style:width="{battery * 100}%" style:background={batteryColor}></div>
        </div>
        <span class="text-xs font-bold tabular-nums">{Math.round(battery * 100)}%</span>
        <span class="text-[10px] font-bold uppercase" style:color={motor.color}>{motor.label}</span>
      </div>
    {/if}

    {#if opts.showIndicators && p}
      <div class="mt-2 grid grid-cols-6 gap-1">
        {@render indicator("Luces", p.headlights ? ON : null, headlightIcon)}
        {@render indicator("Limitador Pit", p.speedLimiter ? WARN : null, limiterIcon)}
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
  <div class="hud w-[340px] p-3">
    <div class="flex items-center justify-between gap-3">
      <!-- Left: Speed & Wheel -->
      <div class="flex flex-col items-start">
        {#if showMdtLogo}
          <div class="mb-1 flex items-center gap-1">
            <img src="/mdt-logo.png" alt="MDT" class="h-4 w-4 object-contain" />
            <span class="font-display text-[10px] font-extrabold tracking-wider text-accent uppercase">MDT</span>
          </div>
        {/if}
        <div class="hud-value text-[38px] leading-none font-bold">{spdText}</div>
        <div class="hud-label mt-0.5">{speedUnit(units)}</div>
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
          <span class={["hud-value text-[54px] leading-none font-black", flash && "animate-pulse text-sky-400"]}>{gear}</span>
          <span class="mt-0.5 text-[11px] font-bold tabular-nums text-muted">{rpmText}</span>
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
  <div class="hud flex items-center gap-3 px-3.5 py-2">
    {#if showMdtLogo}
      <img src="/mdt-logo.png" alt="MDT" class="h-7 w-7 shrink-0 object-contain" />
    {/if}

    <!-- Gear pill -->
    <div
      class={[
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 font-display text-3xl font-black",
        flash ? "border-sky-400 bg-sky-500/30 text-white" : p?.speedLimiter ? "border-warn text-warn" : "border-accent bg-accent/15 text-white",
      ]}
    >
      {gear}
    </div>

    <!-- Speed -->
    <div class="min-w-[68px]">
      <div class="hud-value text-[28px] leading-none font-bold">{spdText}</div>
      <div class="hud-label mt-0.5 text-[9px]">{speedUnit(units)}</div>
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
        {@render chip("TC", p.tcMax > 0 ? p.tc : "–", p.tcActive)}
        {@render chip("ABS", p.absMax > 0 ? p.abs : "–", p.absActive)}
        {@render chip("BB", (p.brakeBiasFront * 100).toFixed(1), false)}
      </div>
    {/if}
  </div>

<!-- =========================================================================
     MODE 5: CLÁSICO ESTÁNDAR
     ========================================================================= -->
{:else}
  <div class="hud w-[320px] p-3">
    {@render rpmHeader("h-2")}

    <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-end">
      <div>
        <div class="hud-value text-[40px]">{spdText}</div>
        <div class="hud-label mt-1">{speedUnit(units)}</div>
      </div>
      <div class={["hud-value px-4 text-[64px] font-bold", p?.speedLimiter && "text-warn"]}>{gear}</div>
      <div class="text-right">
        <div class="hud-value text-[24px]">{rpmText}</div>
        <div class="hud-label mt-1">rpm</div>
      </div>
    </div>

    {@render extraRows()}
  </div>
{/if}
