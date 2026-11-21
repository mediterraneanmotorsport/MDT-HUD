<script lang="ts">
  import { fly } from "svelte/transition";
  import type { Units } from "../../lib/config.svelte";
  import { classColor, lapTime } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import CarLogo from "../CarLogo.svelte";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const alwaysVisible = $derived(opts.alwaysVisible ?? false);
  const displaySeconds = $derived(Number(opts.displaySeconds ?? 6));
  const showLogo = $derived(opts.showLogo ?? true);
  const showStats = $derived(opts.showStats ?? true);

  let lastFocusedId = $state<number | null>(null);
  let visibleUntil = $state(0);
  let now = $state(Date.now());

  $effect(() => {
    const snap = live.snap;
    const target = snap?.vehicles?.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );
    if (target && target.id !== lastFocusedId) {
      if (lastFocusedId !== null) {
        visibleUntil = Date.now() + displaySeconds * 1000;
      }
      lastFocusedId = target.id;
    }
    now = Date.now();
  });

  // Periodic tick while visible so it auto-hides cleanly even if telemetry pauses
  $effect(() => {
    if (alwaysVisible || edit || visibleUntil <= Date.now()) return;
    const ms = Math.max(50, visibleUntil - Date.now() + 50);
    const t = setTimeout(() => {
      now = Date.now();
    }, ms);
    return () => clearTimeout(t);
  });

  const driver = $derived.by(() => {
    const snap = live.snap;
    const target = snap?.vehicles?.find((v) =>
      snap.focusedSlot != null ? v.slotId === snap.focusedSlot || v.id === snap.focusedSlot : v.isPlayer,
    );
    if (target) return target;
    if (!edit) return null;
    return {
      id: 51,
      place: 2,
      classPlace: 2,
      driver: "Alessandro Pier Guidi",
      team: "Ferrari AF Corse",
      vehicle: "#51 Ferrari 499P",
      model: "Ferrari 499P",
      class: "Hypercar",
      number: "51",
      qualification: 5,
      numPitstops: 2,
      bestLap: 201.428,
      lastLap: 202.114,
      tyreCompounds: ["Medium", "Medium", "Medium", "Medium"],
      virtualEnergy: 0.64,
    };
  });

  const show = $derived(Boolean(driver) && (edit || alwaysVisible || now < visibleUntil));
</script>

{#if show && driver}
  {@const cColor = classColor(driver.class)}
  {@const posDelta = driver.qualification > 0 ? driver.qualification - driver.place : 0}
  <div
    transition:fly={{ y: 24, duration: 300 }}
    class="hud mdt-shimmer-overlay relative w-[470px] overflow-hidden rounded-xl border border-white/20 bg-[#060f1e]/95 shadow-2xl backdrop-blur-md select-none"
  >
    <!-- Top Accent Bar -->
    <div class="h-1 w-full" style:background={cColor}></div>

    <div class="flex items-center justify-between gap-3 px-4 py-2.5">
      <!-- Left: Position + Number + Name -->
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-white shadow-lg"
          style:background={cColor}
        >
          <span class="text-[9px] font-bold uppercase tracking-widest opacity-80">POS</span>
          <span class="font-display text-2xl font-black leading-none">{driver.classPlace || driver.place}</span>
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-mono text-sm font-black text-accent">#{driver.number || driver.id}</span>
            {#if showLogo}
              <CarLogo model={driver.model} entry={driver.vehicle} />
            {/if}
            <span class="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white/90">
              {driver.class}
            </span>
          </div>
          <div class="truncate font-display text-xl font-black tracking-wide text-white uppercase leading-tight">
            {driver.driver}
          </div>
          <div class="truncate text-[11px] font-medium text-muted">
            {driver.team || driver.vehicle}
          </div>
        </div>
      </div>

      <!-- Right: MDT Logo -->
      <div class="flex flex-col items-end justify-between self-stretch shrink-0">
        <img src="/mdt-logo.png" alt="MDT" class="h-7 w-auto object-contain opacity-90" />
        {#if driver.qualification > 0}
          <span
            class={[
              "rounded px-1.5 py-0.5 font-mono text-[10px] font-black",
              posDelta > 0
                ? "bg-emerald-500/20 text-emerald-400"
                : posDelta < 0
                  ? "bg-rose-500/20 text-rose-400"
                  : "bg-white/10 text-muted",
            ]}
          >
            {posDelta > 0 ? `▲ +${posDelta}` : posDelta < 0 ? `▼ ${posDelta}` : `= P${driver.qualification}`}
          </span>
        {/if}
      </div>
    </div>

    {#if showStats}
      <div class="grid grid-cols-4 gap-2 border-t border-white/10 bg-black/40 px-4 py-1.5 font-mono text-[11px]">
        <div>
          <span class="text-[9px] text-muted uppercase block">Mejor Vuelta</span>
          <span class="font-bold text-white">{lapTime(driver.bestLap)}</span>
        </div>
        <div>
          <span class="text-[9px] text-muted uppercase block">Neumáticos</span>
          <span class="font-bold text-cyan-300">{driver.tyreCompounds?.[0] || "–"}</span>
        </div>
        <div>
          <span class="text-[9px] text-muted uppercase block">Paradas</span>
          <span class="font-bold text-white">{driver.numPitstops ?? 0} PS</span>
        </div>
        <div class="text-right">
          <span class="text-[9px] text-muted uppercase block">Energía</span>
          <span class="font-bold text-emerald-400">
            {driver.virtualEnergy != null ? `${Math.round(driver.virtualEnergy * 100)}%` : "–"}
          </span>
        </div>
      </div>
    {/if}
  </div>
{/if}
