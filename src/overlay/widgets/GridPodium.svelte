<script lang="ts">
  import { scale } from "svelte/transition";
  import type { Units } from "../../lib/config.svelte";
  import { classColor, lapTime, shortName } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import type { Vehicle } from "../../lib/types";

  const live = useLive();

  let { opts, edit }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const displayMode = $derived(opts.displayMode ?? "auto"); // "auto" | "force_grid" | "force_podium"
  const showGrid = $derived(opts.showGrid ?? true);
  const showPodium = $derived(opts.showPodium ?? true);
  const maxGridRows = $derived(Number(opts.maxGridRows ?? 10));

  const activeMode = $derived.by<"grid" | "podium" | null>(() => {
    if (displayMode === "force_grid") return "grid";
    if (displayMode === "force_podium") return "podium";
    const phase = live.snap?.session?.phase ?? -1;
    if (showPodium && phase === 8) return "podium";
    if (showGrid && phase >= 1 && phase <= 4) return "grid";
    if (edit) return "podium";
    return null;
  });

  const demoVehicles: Vehicle[] = [
    { id: 1, place: 1, classPlace: 1, driver: "A. Pier Guidi", team: "Ferrari AF Corse", number: "51", class: "Hypercar", bestLap: 201.12, qualification: 1 } as Vehicle,
    { id: 2, place: 2, classPlace: 2, driver: "K. Estre", team: "Porsche Penske", number: "6", class: "Hypercar", bestLap: 201.44, qualification: 2 } as Vehicle,
    { id: 3, place: 3, classPlace: 3, driver: "S. Buemi", team: "Toyota Gazoo", number: "8", class: "Hypercar", bestLap: 201.89, qualification: 3 } as Vehicle,
    { id: 4, place: 4, classPlace: 1, driver: "A. Rovera", team: "Vista AF Corse", number: "55", class: "LMGT3", bestLap: 235.12, qualification: 4 } as Vehicle,
    { id: 5, place: 5, classPlace: 2, driver: "V. Rossi", team: "Team WRT", number: "46", class: "LMGT3", bestLap: 235.61, qualification: 5 } as Vehicle,
    { id: 6, place: 6, classPlace: 3, driver: "K. Bachler", team: "Manthey PureRxcing", number: "92", class: "LMGT3", bestLap: 235.94, qualification: 6 } as Vehicle,
  ];

  const groupedPodium = $derived.by(() => {
    const list = live.snap?.vehicles?.length ? live.snap.vehicles : edit ? demoVehicles : [];
    const byClass = new Map<string, Vehicle[]>();
    for (const v of [...list].sort((a, b) => a.place - b.place)) {
      if (!byClass.has(v.class)) byClass.set(v.class, []);
      byClass.get(v.class)!.push(v);
    }
    return [...byClass.entries()].map(([cls, cars]) => ({
      cls,
      top3: cars.slice(0, 3),
    }));
  });

  const gridList = $derived.by(() => {
    const list = live.snap?.vehicles?.length ? live.snap.vehicles : edit ? demoVehicles : [];
    return [...list]
      .sort((a, b) => (a.qualification || a.place) - (b.qualification || b.place))
      .slice(0, maxGridRows);
  });

  const medalStyles = [
    "border-amber-400/70 bg-amber-500/15 text-amber-300",
    "border-slate-300/60 bg-slate-300/10 text-slate-200",
    "border-orange-500/60 bg-orange-500/15 text-orange-300",
  ];
</script>

{#if activeMode}
  <div
    transition:scale={{ start: 0.94, duration: 280 }}
    class="hud mdt-shimmer-overlay w-[540px] select-none overflow-hidden rounded-xl border border-white/20 bg-[#050d1b]/95 p-4 shadow-2xl backdrop-blur-md"
  >
    <!-- TV Header -->
    <div class="mb-3 flex items-center justify-between border-b border-white/15 pb-2">
      <div class="flex items-center gap-2.5">
        <img src="/mdt-logo.png" alt="MDT" class="h-7 w-auto object-contain" />
        <div>
          <div class="font-display text-lg font-black tracking-wider text-white uppercase leading-none">
            {activeMode === "podium" ? "🏆 PODIO FINAL DE CARRERA" : "🏁 PARRILLA DE SALIDA"}
          </div>
          <div class="text-[10px] font-semibold tracking-widest text-accent-hi uppercase">
            {live.snap?.session?.track || "Mediterranean Motorsport Broadcast"}
          </div>
        </div>
      </div>
      {#if edit}
        <span class="rounded bg-white/10 px-2 py-0.5 font-mono text-[9px] font-bold text-muted uppercase">VISTA PREVIA</span>
      {/if}
    </div>

    {#if activeMode === "podium"}
      <div class="flex flex-col gap-3">
        {#each groupedPodium as group (group.cls)}
          {@const cColor = classColor(group.cls)}
          <div>
            <div class="mb-1.5 flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full" style:background={cColor}></span>
              <span class="font-display text-xs font-black tracking-wider text-white uppercase">{group.cls}</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
              {#each group.top3 as car, idx (car.id)}
                <div class={["flex flex-col rounded-lg border p-2", medalStyles[idx] ?? "border-white/15 bg-white/5"]}>
                  <div class="flex items-center justify-between">
                    <span class="font-display text-lg font-black leading-none">P{idx + 1}</span>
                    <span class="rounded px-1.5 py-0.5 font-mono text-[10px] font-black text-white" style:background={cColor}>
                      #{car.number || car.id}
                    </span>
                  </div>
                  <div class="mt-1 truncate font-sans text-xs font-extrabold text-white">{shortName(car.driver)}</div>
                  <div class="truncate text-[10px] text-white/60">{car.team || "–"}</div>
                  {#if car.bestLap > 0}
                    <div class="mt-1 font-mono text-[10px] font-bold text-white/80">BL {lapTime(car.bestLap)}</div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Starting Grid 2-column staggered layout -->
      <div class="grid grid-cols-2 gap-1.5 font-mono text-xs">
        {#each gridList as car, idx (car.id)}
          {@const cColor = classColor(car.class)}
          <div class="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-5 text-right font-black text-accent">P{idx + 1}</span>
              <span class="rounded px-1.5 py-0.5 text-[10px] font-black text-white" style:background={cColor}>
                #{car.number || car.id}
              </span>
              <span class="truncate font-sans text-xs font-bold text-white">{shortName(car.driver)}</span>
            </div>
            <span class="text-[10px] text-muted shrink-0">{car.bestLap > 0 ? lapTime(car.bestLap) : car.class.slice(0, 3)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
