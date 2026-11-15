import type { Units } from "./config.svelte";
import { classColor, dateTime, fuel, fuelUnit, lapTime, sectorTime, speed, speedUnit } from "./format";
import type { LapRecord, SessionSummary } from "./types";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderSessionSummaryBlob(
  session: SessionSummary,
  laps: LapRecord[],
  units: Units,
): Promise<Blob> {
  const logo = await loadImage("/mdt-logo.png");

  const cleanLaps = laps.filter((l) => l.valid && !l.outLap && !l.inLap && l.lapTime > 0);
  const shownLaps = laps.slice(0, 14); // Up to 14 rows in the table

  const W = 1200;
  const rowH = 34;
  const tableRows = Math.max(1, shownLaps.length);
  const H = 445 + tableRows * rowH + 76;
  const dpr = 2;

  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // 1. Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#060e1a");
  bg.addColorStop(0.5, "#0b192e");
  bg.addColorStop(1, "#050b14");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle technical grid
  ctx.strokeStyle = "rgba(34, 135, 236, 0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Ambient blue glow in top-left and bottom-right
  const glow = ctx.createRadialGradient(180, 90, 10, 180, 90, 420);
  glow.addColorStop(0, "rgba(34, 135, 236, 0.25)");
  glow.addColorStop(1, "rgba(34, 135, 236, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 2. Giant MDT Bull Watermark in background right
  if (logo) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    const wmW = 540;
    const wmH = (logo.height / logo.width) * wmW;
    ctx.drawImage(logo, W - wmW - 20, H / 2 - wmH / 2, wmW, wmH);
    ctx.restore();
  }

  // Top accent bar (#2287EC)
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, "#2287ec");
  topBar.addColorStop(0.5, "#60a5fa");
  topBar.addColorStop(1, "#2287ec");
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 6);

  // Outer border
  ctx.strokeStyle = "rgba(34, 135, 236, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // 3. Header with MDT Logos & Session Info
  const pad = 36;
  let logoEndX = pad;
  if (logo) {
    const lh = 68;
    const lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, pad, 28, lw, lh);
    logoEndX = pad + lw + 20;
  }

  ctx.fillStyle = "#2287ec";
  ctx.font = "800 13px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.fillText("MEDITERRANEAN MOTORSPORT  ·  MDT-HUD TELEMETRÍA OFICIAL", logoEndX, 42);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 32px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.fillText(session.track.toUpperCase(), logoEndX, 74);

  const driverName = (session.driver?.trim() || "Piloto MDT").toUpperCase();
  ctx.fillStyle = "#38bdf8";
  ctx.font = "800 16px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.fillText(`👤 PILOTO: ${driverName}`, logoEndX, 96);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 13px 'Barlow', 'Segoe UI', sans-serif";
  ctx.fillText(`${session.car}  ·  ${session.sessionType}  ·  ${dateTime(session.startedAt)}`, logoEndX, 116);

  // Right header badges: Pilot Badge + Category Badge
  const clsColor = classColor(session.carClass);

  // 1. Pilot Badge
  roundRect(ctx, W - pad - 380, 34, 195, 56, 10);
  ctx.fillStyle = "rgba(9, 22, 38, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#38bdf8";
  ctx.font = "800 11px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("PILOTO OFICIAL", W - pad - 195, 53);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 17px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.fillText(driverName, W - pad - 195, 77);

  // 2. Class Badge
  roundRect(ctx, W - pad - 170, 34, 170, 56, 10);
  ctx.fillStyle = "rgba(9, 22, 38, 0.9)";
  ctx.fill();
  ctx.strokeStyle = clsColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = clsColor;
  ctx.font = "800 11px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("CATEGORÍA", W - pad - 16, 53);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 22px 'Barlow Condensed', 'Segoe UI', sans-serif";
  ctx.fillText(session.carClass || "LMU", W - pad - 16, 78);
  ctx.textAlign = "left";

  // 4. Compute Session Metrics
  const bestLapObj = cleanLaps.reduce<LapRecord | null>((b, l) => (!b || l.lapTime < b.lapTime ? l : b), null);
  const bestS1 = cleanLaps.reduce((m, l) => (l.s1 > 0 && l.s1 < m ? l.s1 : m), Infinity);
  const bestS2 = cleanLaps.reduce((m, l) => (l.s2 > 0 && l.s2 < m ? l.s2 : m), Infinity);
  const bestS3 = cleanLaps.reduce((m, l) => (l.s3 > 0 && l.s3 < m ? l.s3 : m), Infinity);
  const optLap = isFinite(bestS1) && isFinite(bestS2) && isFinite(bestS3) ? bestS1 + bestS2 + bestS3 : null;

  const avgLap =
    cleanLaps.length > 0 ? cleanLaps.reduce((acc, l) => acc + l.lapTime, 0) / cleanLaps.length : null;
  const avgFuel =
    cleanLaps.length > 0 ? cleanLaps.reduce((acc, l) => acc + l.fuelUsed, 0) / cleanLaps.length : 0;
  const topSpd = laps.reduce((m, l) => (l.maxSpeed > m ? l.maxSpeed : m), 0);

  // 4 KPI Cards
  const cards = [
    {
      label: "MEJOR VUELTA (PB)",
      value: lapTime(bestLapObj?.lapTime ?? session.bestLap),
      sub: bestLapObj ? `Vuelta #${bestLapObj.lapNumber} · ${bestLapObj.compound || "Slick"}` : `${session.lapCount} vueltas`,
      accent: "#c084fc",
    },
    {
      label: "VUELTA ÓPTIMA TEÓRICA",
      value: optLap ? lapTime(optLap) : "–",
      sub:
        optLap && bestLapObj
          ? `Margen de mejora: -${Math.max(0, bestLapObj.lapTime - optLap).toFixed(3)}s`
          : "Suma de mejores sectores",
      accent: "#2287ec",
    },
    {
      label: "RITMO MEDIO (LIMPIAS)",
      value: avgLap ? lapTime(avgLap) : "–",
      sub: `${cleanLaps.length} de ${laps.length} vueltas válidas`,
      accent: "#22c55e",
    },
    {
      label: "CONSUMO MEDIO / VEL. MÁX",
      value: avgFuel > 0 ? `${fuel(avgFuel, units).toFixed(2)} ${fuelUnit(units)}/v` : "–",
      sub: topSpd > 0 ? `Vel. Punta: ${Math.round(speed(topSpd, units))} ${speedUnit(units)}` : "Telemetría MDT",
      accent: "#f59e0b",
    },
  ];

  const cardGap = 16;
  const cardW = (W - pad * 2 - cardGap * 3) / 4;
  const cardY = 142;
  const cardH = 98;

  cards.forEach((c, i) => {
    const cx = pad + i * (cardW + cardGap);
    roundRect(ctx, cx, cardY, cardW, cardH, 10);
    ctx.fillStyle = "rgba(9, 22, 38, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(34, 135, 236, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Left colored stripe
    roundRect(ctx, cx, cardY, 5, cardH, 3);
    ctx.fillStyle = c.accent;
    ctx.fill();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 12px 'Barlow Condensed', 'Segoe UI', sans-serif";
    ctx.fillText(c.label, cx + 16, cardY + 24);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 32px 'Barlow Condensed', 'Segoe UI', sans-serif";
    ctx.fillText(c.value, cx + 16, cardY + 60);

    ctx.fillStyle = c.accent;
    ctx.font = "600 12px 'Barlow', 'Segoe UI', sans-serif";
    ctx.fillText(c.sub, cx + 16, cardY + 83);
  });

  // 5. Lap Table
  const tableY = 260;
  const tableW = W - pad * 2;
  const tableH = 42 + tableRows * rowH;

  roundRect(ctx, pad, tableY, tableW, tableH, 10);
  ctx.fillStyle = "rgba(9, 22, 38, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 135, 236, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Table Header
  roundRect(ctx, pad, tableY, tableW, 40, 10);
  ctx.fillStyle = "rgba(34, 135, 236, 0.18)";
  ctx.fill();

  const cols = [
    { label: "VUELTA", x: pad + 20, align: "left" as const },
    { label: "TIEMPO DE VUELTA", x: pad + 130, align: "left" as const },
    { label: "SECTOR 1", x: pad + 340, align: "right" as const },
    { label: "SECTOR 2", x: pad + 470, align: "right" as const },
    { label: "SECTOR 3", x: pad + 600, align: "right" as const },
    { label: "COMPUESTO", x: pad + 760, align: "left" as const },
    { label: `COMB. (${fuelUnit(units)})`, x: pad + 950, align: "right" as const },
    { label: `VEL. MÁX (${speedUnit(units)})`, x: pad + tableW - 24, align: "right" as const },
  ];

  ctx.fillStyle = "#93c5fd";
  ctx.font = "700 12px 'Barlow Condensed', 'Segoe UI', sans-serif";
  for (const col of cols) {
    ctx.textAlign = col.align;
    ctx.fillText(col.label, col.x, tableY + 25);
  }

  shownLaps.forEach((l, idx) => {
    const ry = tableY + 40 + idx * rowH;
    const isBest = bestLapObj && l.id === bestLapObj.id;

    if (isBest) {
      ctx.fillStyle = "rgba(34, 135, 236, 0.22)";
      ctx.fillRect(pad + 1, ry, tableW - 2, rowH);
    } else if (idx % 2 === 1) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
      ctx.fillRect(pad + 1, ry, tableW - 2, rowH);
    }

    const textY = ry + 22;
    ctx.font = "700 14px 'Barlow', 'Segoe UI', sans-serif";

    // Lap #
    ctx.textAlign = "left";
    ctx.fillStyle = isBest ? "#60a5fa" : "#e2e8f0";
    const tag = l.outLap ? " (SAL)" : l.inLap ? " (ENT)" : !l.valid ? " (INV)" : "";
    ctx.fillText(`#${l.lapNumber}${tag}`, cols[0].x, textY);

    // Lap time
    ctx.fillStyle = isBest ? "#c084fc" : !l.valid ? "#f87171" : "#ffffff";
    ctx.font = isBest ? "800 15px 'Barlow', 'Segoe UI', sans-serif" : "600 14px 'Barlow', 'Segoe UI', sans-serif";
    ctx.fillText(lapTime(l.lapTime) + (isBest ? "  ★ PB" : ""), cols[1].x, textY);

    // S1, S2, S3
    ctx.font = "600 13px 'Barlow', 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = Math.abs(l.s1 - bestS1) < 0.002 ? "#c084fc" : "#cbd5e1";
    ctx.fillText(sectorTime(l.s1), cols[2].x, textY);

    ctx.fillStyle = Math.abs(l.s2 - bestS2) < 0.002 ? "#c084fc" : "#cbd5e1";
    ctx.fillText(sectorTime(l.s2), cols[3].x, textY);

    ctx.fillStyle = Math.abs(l.s3 - bestS3) < 0.002 ? "#c084fc" : "#cbd5e1";
    ctx.fillText(sectorTime(l.s3), cols[4].x, textY);

    // Compound
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(l.compound || "–", cols[5].x, textY);

    // Fuel
    ctx.textAlign = "right";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(l.fuelUsed > 0 ? fuel(l.fuelUsed, units).toFixed(2) : "–", cols[6].x, textY);

    // Max Speed
    ctx.fillText(l.maxSpeed > 0 ? String(Math.round(speed(l.maxSpeed, units))) : "–", cols[7].x, textY);
  });

  // 6. Footer with MDT Branding
  const footerY = H - 36;
  ctx.textAlign = "left";
  if (logo) {
    const fh = 24;
    const fw = (logo.width / logo.height) * fh;
    ctx.drawImage(logo, pad, footerY - 18, fw, fh);
    ctx.fillStyle = "#60a5fa";
    ctx.font = "800 13px 'Barlow Condensed', 'Segoe UI', sans-serif";
    ctx.fillText("MEDITERRANEAN MOTORSPORT  ·  MDT-HUD", pad + fw + 10, footerY - 2);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = "600 12px 'Barlow', 'Segoe UI', sans-serif";
  ctx.fillText("github.com/mediterraneanmotorsport/MDT-HUD", W - pad, footerY - 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen PNG."));
    }, "image/png");
  });
}
