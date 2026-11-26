import { invoke } from "@tauri-apps/api/core";
import { isNativeTauri } from "./api";
import { renderSessionSummaryBlob } from "./exportSessionImage";
import { config } from "./config.svelte";
import type { LapRecord, SessionSummary } from "./types";
import { dateTime, lapTime } from "./format";

export interface DiscordPostResult {
  ok: boolean;
  error?: string;
}

export const DEFAULT_BOT_NAME = "Ingeniera MDT";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result ?? "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Error leyendo PNG"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Sends a finished session summary card and rendered PNG graphic to Discord.
 * When no custom webhook is configured, the official protected webhook is resolved
 * exclusively inside the Rust backend (never exposed in JS, config.json, or DevTools).
 */
export async function sendSessionToDiscord(
  session: SessionSummary,
  laps: LapRecord[],
  customWebhook?: string,
): Promise<DiscordPostResult> {
  const customUrl = (customWebhook ?? config.value.discord?.webhookUrl ?? "").trim();

  try {
    const cleanLaps = laps.filter((l) => l.valid && !l.outLap && !l.inLap && l.lapTime > 0);
    const bestLap = cleanLaps.reduce((best, l) => (l.lapTime < best ? l.lapTime : best), session.bestLap || 0);
    const bestStr = bestLap > 0 ? lapTime(bestLap) : "–";
    const driverName = session.driver?.trim() || config.value.general?.teammates?.split(",")[0]?.trim() || "Piloto MDT";
    const trackName = session.track?.trim() || "Circuito";
    const carName = session.car?.trim() || session.vehicleName || "Coche";
    const carClass = session.carClass || "LMU";

    const content =
      `🏁 **Sesión Finalizada · MDT-HUD Telemetría Oficial**\n` +
      `👤 **Piloto:** **${driverName}**\n` +
      `📍 **Circuito:** ${trackName}\n` +
      `🏎️ **Coche:** ${carName} (${carClass})\n` +
      `⏱️ **Mejor Vuelta:** \`${bestStr}\` · **Vueltas completadas:** ${laps.length} (${cleanLaps.length} válidas)\n` +
      `📅 **Fecha:** ${dateTime(session.startedAt)}`;

    const botName = config.value.discord?.botName?.trim() || DEFAULT_BOT_NAME;
    const blob = await renderSessionSummaryBlob(session, laps, config.value.general.units);

    if (isNativeTauri()) {
      const imagePngBase64 = await blobToBase64(blob);
      await invoke("send_discord_webhook", {
        customWebhook: customUrl.startsWith("https://") ? customUrl : null,
        username: botName,
        content,
        imagePngBase64,
        filename: `mdt-session-${session.id}.png`,
      });
      return { ok: true };
    }

    if (!customUrl.startsWith("https://")) {
      return { ok: false, error: "El envío al canal oficial protegido solo está disponible desde la app de escritorio." };
    }
    const formData = new FormData();
    formData.append("username", botName);
    formData.append("content", content);
    formData.append("file", blob, `mdt-session-${session.id}.png`);
    const res = await fetch(customUrl, { method: "POST", body: formData });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Discord respondió error HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Sends a quick test notification to verify the Discord Webhook configuration.
 */
export async function testDiscordWebhook(webhookUrl?: string): Promise<DiscordPostResult> {
  const customUrl = (webhookUrl ?? config.value.discord?.webhookUrl ?? "").trim();
  const botName = config.value.discord?.botName?.trim() || DEFAULT_BOT_NAME;
  const content = `✅ **Conexión Exitosa con MDT-HUD**\nEl Webhook oficial de Discord está correctamente enlazado con **${botName}**. Al terminar una sesión en pista, el sistema generará y enviará automáticamente el gráfico PNG de telemetría con el nombre del piloto (**${config.value.general.teammates || "Piloto MDT"}**), tiempos y mejores vueltas. 🏎️💨`;

  try {
    if (isNativeTauri()) {
      await invoke("send_discord_webhook", {
        customWebhook: customUrl.startsWith("https://") ? customUrl : null,
        username: botName,
        content,
        imagePngBase64: null,
        filename: null,
      });
      return { ok: true };
    }

    if (!customUrl.startsWith("https://")) {
      return { ok: false, error: "Introduce una URL válida de webhook de Discord o prueba desde la app de escritorio." };
    }
    const res = await fetch(customUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: botName, content }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Discord respondió error HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
