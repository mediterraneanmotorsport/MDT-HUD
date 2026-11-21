<script lang="ts">
  import { lapTime, shortName } from "../lib/format";
  import type { Vehicle } from "../lib/types";

  export interface RecordedDriverLap {
    lap: number;
    time: number;
    s1: number;
    s2: number;
    s3: number;
    compound: string;
    pit: boolean;
  }

  let {
    driver,
    laps,
    overallBest,
    trackName,
    onCopyDiscord,
    onClose,
  }: {
    driver: Vehicle | null;
    laps: RecordedDriverLap[];
    overallBest: number;
    trackName: string;
    onCopyDiscord: () => Promise<void>;
    onClose: () => void;
  } = $props();

  let copied = $state(false);

  const driverBest = $derived.by(() => {
    const valid = laps.map((l) => l.time).filter((t) => t > 0);
    return valid.length ? Math.min(...valid) : driver?.bestLap ?? 0;
  });

  function exportCsv() {
    if (!driver) return;
    const header = "Vuelta,Tiempo,S1,S2,S3,Compuesto,Pit";
    const rows = laps.map((l) =>
      [
        l.lap,
        l.time > 0 ? l.time.toFixed(3) : "",
        l.s1 > 0 ? l.s1.toFixed(3) : "",
        l.s2 > 0 ? l.s2.toFixed(3) : "",
        l.s3 > 0 ? l.s3.toFixed(3) : "",
        l.compound || "",
        l.pit ? "PIT" : "",
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (driver.driver || "piloto").replace(/[^a-z0-9_-]/gi, "_");
    a.href = url;
    a.download = `mdt-pitwall-vueltas-${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    await onCopyDiscord();
    copied = true;
    setTimeout(() => (copied = false), 2500);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md" onclick={onClose}>
  <div
    class="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#0d131f] shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="flex items-center justify-between border-b border-white/10 bg-black/45 px-5 py-3.5">
      <div>
        <div class="font-display text-base font-black text-white">
          📜 Registro de Vueltas · {driver ? `#${driver.number || driver.id} ${shortName(driver.driver)}` : "Piloto"}
        </div>
        <div class="text-[11px] text-white/50">
          {trackName || "Circuito"} · {laps.length} vueltas registradas en esta sesión · Mejor: {lapTime(driverBest)}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-indigo-400/50 bg-indigo-500/20 px-2.5 py-1 text-xs font-bold text-indigo-200 hover:bg-indigo-500/35 cursor-pointer"
          onclick={handleCopy}
        >
          {copied ? "✓ ¡Copiado!" : "📋 Copiar Discord"}
        </button>
        <button
          type="button"
          class="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-200 hover:bg-emerald-500/35 cursor-pointer"
          onclick={exportCsv}
        >
          ⬇️ CSV
        </button>
        <button
          type="button"
          class="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white cursor-pointer"
          onclick={onClose}
        >✕</button>
      </div>
    </div>

    <div class="grid grid-cols-[52px_1fr_76px_76px_76px_64px_46px] gap-1 border-b border-white/10 bg-black/30 px-4 py-1.5 font-mono text-[10px] font-black text-white/60 uppercase">
      <span>VTA</span>
      <span>TIEMPO</span>
      <span class="text-right">S1</span>
      <span class="text-right">S2</span>
      <span class="text-right">S3</span>
      <span class="text-center">GOMA</span>
      <span class="text-center">PIT</span>
    </div>

    <div class="flex-1 divide-y divide-white/5 overflow-y-auto px-2 py-1 font-mono text-xs tabular-nums">
      {#each [...laps].reverse() as l (l.lap)}
        {@const isOverall = overallBest > 0 && l.time > 0 && l.time <= overallBest + 0.002}
        {@const isPersonal = driverBest > 0 && l.time > 0 && l.time <= driverBest + 0.002}
        <div class="grid grid-cols-[52px_1fr_76px_76px_76px_64px_46px] items-center gap-1 rounded px-2 py-1.5 hover:bg-white/5">
          <span class="font-bold text-white/70">L{l.lap}</span>
          <span
            class={[
              "font-black",
              isOverall ? "text-[#ff00ff]" : isPersonal ? "text-[#00ff66]" : "text-white",
            ]}
          >
            {lapTime(l.time)}
          </span>
          <span class="text-right text-white/80">{l.s1 > 0 ? l.s1.toFixed(3) : "-"}</span>
          <span class="text-right text-white/80">{l.s2 > 0 ? l.s2.toFixed(3) : "-"}</span>
          <span class="text-right text-white/80">{l.s3 > 0 ? l.s3.toFixed(3) : "-"}</span>
          <span class="text-center text-[10px] text-amber-300">{(l.compound || "M").slice(0, 4)}</span>
          <span class="text-center">
            {#if l.pit}
              <span class="rounded bg-red-600 px-1 py-0.5 text-[9px] font-black text-white">PIT</span>
            {:else}
              <span class="text-white/25">–</span>
            {/if}
          </span>
        </div>
      {:else}
        <div class="py-10 text-center text-xs text-white/45">
          Aún no se han completado vueltas desde que abriste el Pit Wall. Cada vuelta completada se registrará aquí automáticamente.
        </div>
      {/each}
    </div>
  </div>
</div>
