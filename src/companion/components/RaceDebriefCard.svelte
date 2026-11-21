<script lang="ts">
  import { fuel, fuelUnit, lapTime, speed, speedUnit } from "../../lib/format";
  import { toasts } from "../../lib/toasts.svelte";
  import type { Units } from "../../lib/config.svelte";
  import type { LapRecord, SessionSummary } from "../../lib/types";

  let {
    session,
    laps,
    units,
  }: {
    session: SessionSummary;
    laps: LapRecord[];
    units: Units;
  } = $props();

  const stats = $derived.by(() => {
    const valid = laps.filter((l) => l.valid && !l.outLap && !l.inLap && l.lapTime > 0);
    const cleanPct = laps.length > 0 ? Math.round((valid.length / laps.length) * 100) : 0;
    const best = valid.length ? Math.min(...valid.map((l) => l.lapTime)) : session.bestLap ?? 0;
    const avg = valid.length ? valid.reduce((a, b) => a + b.lapTime, 0) / valid.length : 0;
    const variance =
      valid.length > 1 ? valid.reduce((a, b) => a + (b.lapTime - avg) ** 2, 0) / valid.length : 0;
    const consistency = Math.sqrt(variance);
    const fuelLaps = laps.filter((l) => l.fuelUsed > 0);
    const avgFuel = fuelLaps.length ? fuelLaps.reduce((a, b) => a + b.fuelUsed, 0) / fuelLaps.length : 0;
    const topSpeed = laps.length ? Math.max(...laps.map((l) => l.maxSpeed || 0)) : 0;
    return { validCount: valid.length, cleanPct, best, avg, consistency, avgFuel, topSpeed };
  });

  async function copyDiscordCard() {
    const text = [
      `**🏁 MDT-HUD · RESUMEN DE SESIÓN (${session.sessionType})**`,
      `📍 **Circuito:** ${session.track} · 🏎️ **Coche:** ${session.car} (${session.carClass})`,
      `⏱️ **Mejor Vuelta:** \`${lapTime(stats.best)}\` · **Media:** \`${lapTime(stats.avg)}\``,
      `📊 **Consistencia:** \`±${stats.consistency.toFixed(3)}s\` · **Limpias:** ${stats.cleanPct}% (${stats.validCount}/${laps.length})`,
      `⛽ **Consumo Medio:** ${fuel(stats.avgFuel, units).toFixed(2)} ${fuelUnit(units)}/vta · 🚀 **Vel. Punta:** ${Math.round(speed(stats.topSpeed, units))} ${speedUnit(units)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toasts.push("Resumen de sesión copiado para Discord", { kind: "success" });
    } catch {
      toasts.push("No se pudo copiar al portapapeles", { kind: "error" });
    }
  }

  function downloadPngCard() {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 460;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 960, 460);
    grad.addColorStop(0, "#071120");
    grad.addColorStop(0.6, "#0d1f38");
    grad.addColorStop(1, "#050b14");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 960, 460);

    // Top accent bar
    ctx.fillStyle = "#2287ec";
    ctx.fillRect(0, 0, 960, 8);

    // Header text
    ctx.fillStyle = "#62b0ff";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText("MEDITERRANEAN MOTORSPORT · RACE DEBRIEF CARD", 40, 52);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 38px sans-serif";
    ctx.fillText(session.track || "Le Mans Ultimate", 40, 102);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`${session.car} · ${session.carClass} · ${session.sessionType.toUpperCase()}`, 40, 136);

    // 6 Metric tiles
    const cards = [
      { label: "MEJOR VUELTA", val: lapTime(stats.best), color: "#c084fc" },
      { label: "RITMO MEDIO", val: lapTime(stats.avg), color: "#38bdf8" },
      { label: "CONSISTENCIA", val: `±${stats.consistency.toFixed(3)}s`, color: "#4ade80" },
      { label: "VUELTAS LIMPIAS", val: `${stats.cleanPct}% (${stats.validCount}/${laps.length})`, color: "#facc15" },
      { label: "CONSUMO / VTA", val: `${fuel(stats.avgFuel, units).toFixed(2)} ${fuelUnit(units)}`, color: "#fb923c" },
      { label: "VELOCIDAD PUNTA", val: `${Math.round(speed(stats.topSpeed, units))} ${speedUnit(units)}`, color: "#ffffff" },
    ];

    cards.forEach((c, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 40 + col * 300;
      const y = 175 + row * 125;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(x, y, 280, 104);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, 280, 104);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(c.label, x + 18, y + 32);

      ctx.fillStyle = c.color;
      ctx.font = "900 30px monospace";
      ctx.fillText(c.val, x + 18, y + 78);
    });

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "13px sans-serif";
    ctx.fillText(`Generado por MDT-HUD · Piloto: ${session.driver || "MDT"}`, 40, 438);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `MDT-Debrief-${(session.track || "LMU").replace(/[^a-z0-9_-]/gi, "_")}.png`;
    a.click();
    toasts.push("Tarjeta PNG descargada", { desc: "Lista para compartir en Discord", kind: "success" });
  }
</script>

<section class="mt-4 card border-accent/30 bg-gradient-to-br from-surface via-surface to-accent/5 p-4">
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-accent-hi uppercase">RACE DEBRIEF</span>
        <span class="text-sm font-bold text-fg">{session.track} · {session.car}</span>
      </div>
      <div class="mt-0.5 text-xs text-muted">Resumen automático de tu última sesión ({session.sessionType})</div>
    </div>
    <div class="flex items-center gap-2">
      <button type="button" class="btn px-2.5 py-1 text-xs cursor-pointer" onclick={copyDiscordCard}>
        📋 Copiar Discord
      </button>
      <button type="button" class="btn btn-primary px-2.5 py-1 text-xs cursor-pointer" onclick={downloadPngCard}>
        🖼️ Descargar PNG
      </button>
    </div>
  </div>

  <div class="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 tnum">
    <div class="rounded-lg bg-surface-2 p-2.5">
      <div class="text-[10px] font-bold text-muted uppercase">Mejor Vuelta</div>
      <div class="mt-0.5 font-display text-lg font-black text-best">{lapTime(stats.best)}</div>
    </div>
    <div class="rounded-lg bg-surface-2 p-2.5">
      <div class="text-[10px] font-bold text-muted uppercase">Ritmo Medio</div>
      <div class="mt-0.5 font-display text-lg font-black text-accent-hi">{lapTime(stats.avg)}</div>
    </div>
    <div class="rounded-lg bg-surface-2 p-2.5">
      <div class="text-[10px] font-bold text-muted uppercase">Consistencia</div>
      <div class="mt-0.5 font-display text-lg font-black text-good">±{stats.consistency.toFixed(3)}s</div>
    </div>
    <div class="rounded-lg bg-surface-2 p-2.5">
      <div class="text-[10px] font-bold text-muted uppercase">Vueltas Limpias</div>
      <div class="mt-0.5 font-display text-lg font-black text-warn">{stats.cleanPct}% <span class="text-xs font-normal text-muted">({stats.validCount}/{laps.length})</span></div>
    </div>
    <div class="rounded-lg bg-surface-2 p-2.5">
      <div class="text-[10px] font-bold text-muted uppercase">Consumo / Vta</div>
      <div class="mt-0.5 font-display text-lg font-black text-fg">{fuel(stats.avgFuel, units).toFixed(2)} <span class="text-xs text-muted">{fuelUnit(units)}</span></div>
    </div>
    <div class="rounded-lg bg-surface-2 p-2.5">
      <div class="text-[10px] font-bold text-muted uppercase">Vel. Punta</div>
      <div class="mt-0.5 font-display text-lg font-black text-fg">{Math.round(speed(stats.topSpeed, units))} <span class="text-xs text-muted">{speedUnit(units)}</span></div>
    </div>
  </div>
</section>
