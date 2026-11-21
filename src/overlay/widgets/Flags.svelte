<script lang="ts">
  import { scale } from "svelte/transition";
  import type { Units } from "../../lib/config.svelte";
  import { penaltyText } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const animate = $derived(opts.animateTransitions ?? true);

  interface Banner {
    id: string;
    text: string;
    sub?: string;
    bg: string;
    fg: string;
    /** Pattern utility drawn behind the banner; text then sits on dark chips (e.g. chequered). */
    pattern?: string;
    shimmer?: boolean;
  }

  const TRACK_LIMITS_SHOW_MS = 6000;
  const GREEN_FLAG_SHOW_MS = 3500;

  // Track-limit steps only accumulate, so warn when they increase rather than while non-zero.
  let lastSteps = -1;
  let trackLimitsUntil = $state(0);
  let wasCaution = false;
  let greenFlagUntil = $state(0);
  let now = $state(Date.now());

  $effect(() => {
    const snap = live.snap;
    const steps = snap?.player?.trackLimitsSteps ?? -1;
    if (lastSteps >= 0 && steps > lastSteps) trackLimitsUntil = Date.now() + TRACK_LIMITS_SHOW_MS;
    lastSteps = steps;

    const s = snap?.session;
    const me = snap?.vehicles.find((v) => v.isPlayer);
    const isCaution = Boolean(
      s &&
        (s.phase === 6 ||
          s.yellowFlagState > 0 ||
          s.phase === 7 ||
          (me && !me.inPits && s.sectorYellow[me.sector - 1])),
    );
    if (wasCaution && !isCaution && s && s.phase === 5) {
      greenFlagUntil = Date.now() + GREEN_FLAG_SHOW_MS;
    }
    wasCaution = isCaution;
    now = Date.now();
  });

  const view = $derived.by(() => {
    const snap = live.snap;
    const s = snap?.session;
    const p = snap?.player;
    const me = snap?.vehicles.find((v) => v.isPlayer);
    const banners: Banner[] = [];
    let lights: { total: number; lit: number } | null = null;
    if (!s) return { banners, lights };

    if (s.phase === 4 && s.numRedLights > 0) {
      lights = { total: s.numRedLights, lit: Math.min(s.startLight, s.numRedLights) };
    }
    if (s.phase === 6 || s.yellowFlagState > 0) {
      banners.push({ id: "fcy", text: "Full Course Yellow", bg: "#ffd400", fg: "#111", shimmer: true });
    } else if (me && !me.inPits && s.sectorYellow[me.sector - 1]) {
      // Only warn about a local yellow in the player's sector.
      banners.push({ id: `yel-${me.sector}`, text: "Bandera amarilla", sub: `S${me.sector}`, bg: "#ffd400", fg: "#111", shimmer: true });
    } else if (animate && now < greenFlagUntil && s.phase === 5) {
      banners.push({ id: "green", text: "Bandera verde", sub: "Pista libre", bg: "#16a34a", fg: "#fff", shimmer: true });
    }
    if (s.phase === 7) banners.push({ id: "red", text: "Sesión detenida", bg: "#e3101f", fg: "#fff", shimmer: true });
    if (s.phase === 8) banners.push({ id: "cheq", text: "Bandera a cuadros", bg: "", fg: "#fff", pattern: "checkered" });
    if (me?.flag === 6) banners.push({ id: "blue", text: "Bandera azul", sub: "Cede el paso", bg: "#1d6cf2", fg: "#fff", shimmer: true });
    if (p && now < trackLimitsUntil) {
      const perPoint = Math.max(1, p.trackLimitsStepsPerPoint);
      banners.push({
        id: "tl",
        text: "Límites de pista",
        sub: `${p.trackLimitsSteps / perPoint} / ${p.trackLimitsStepsPerPenalty / perPoint} pts`,
        bg: "#f5a524",
        fg: "#111",
      });
    }
    if (me && me.numPenalties > 0) {
      const next = me.penalties[0];
      const more = me.numPenalties > 1 ? ` (+${me.numPenalties - 1})` : "";
      banners.push({
        id: "pen",
        text: "Sanción",
        sub: next ? penaltyText(next) + more : `×${me.numPenalties}`,
        bg: "#111",
        fg: "#fff",
      });
    }
    return { banners, lights };
  });
</script>

{#if view.banners.length || view.lights || edit}
  <div class="flex w-[300px] flex-col gap-1.5">
    {#if view.lights}
      <div
        transition:scale={animate ? { start: 0.85, duration: 220 } : { duration: 0 }}
        class="hud flex justify-center gap-2 p-2.5"
      >
        {#each Array(view.lights.total) as _, i}
          <div class="h-7 w-7 rounded-full transition-colors duration-75" style:background={i < view.lights.lit ? "#e3101f" : "rgb(255 255 255 / 0.1)"}></div>
        {/each}
      </div>
    {/if}
    {#each view.banners as b (b.id)}
      {#if b.pattern}
        <div
          transition:scale={animate ? { start: 0.85, duration: 220 } : { duration: 0 }}
          class={[
            "flex items-center justify-between rounded-[10px] px-2 py-1.5 shadow-lg",
            b.pattern,
            animate && "mdt-anim-flag-expand",
          ]}
          style:color={b.fg}
        >
          <span class="rounded-md bg-black/85 px-2 py-0.5 text-[17px] font-bold">{b.text}</span>
          {#if b.sub}<span class="rounded-md bg-black/85 px-2 py-0.5 text-sm font-semibold">{b.sub}</span>{/if}
        </div>
      {:else}
        <div
          transition:scale={animate ? { start: 0.85, duration: 220 } : { duration: 0 }}
          class={[
            "relative overflow-hidden flex items-baseline justify-between rounded-[10px] px-4 py-2 shadow-lg",
            animate && "mdt-anim-flag-expand",
            animate && b.shimmer && "mdt-shimmer-loop",
          ]}
          style:background={b.bg}
          style:color={b.fg}
        >
          <span class="text-[17px] font-bold">{b.text}</span>
          {#if b.sub}<span class="text-sm font-semibold opacity-75">{b.sub}</span>{/if}
        </div>
      {/if}
    {/each}
    {#if edit && !view.banners.length && !view.lights}
      <div class="hud px-4 py-2 text-[17px] font-bold text-muted">Banderas</div>
    {/if}
  </div>
{/if}
