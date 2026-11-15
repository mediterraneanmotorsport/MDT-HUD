import { renderSessionSummaryBlob } from "./exportSessionImage";
import { config } from "./config.svelte";
import type { LapRecord, SessionSummary } from "./types";
import { dateTime, lapTime } from "./format";

export interface DiscordPostResult {
  ok: boolean;
  error?: string;
}

export const DEFAULT_DISCORD_WEBHOOK =
  "https://discord.com/api/webhooks/1571662308269232189/Y9Sv1n8yOwKUjWJbzJxxJgg-ipdOJLhAWlw0EcasB23RT97Z1WVgV2v_q6Ci6w6mgVEX";
export const DEFAULT_BOT_NAME = "Ingeniera MDT";

/**
 * Sends a finished session summary card and rendered PNG graphic to Discord via Webhook.
 */
export async function sendSessionToDiscord(
  session: SessionSummary,
  laps: LapRecord[],
  customWebhook?: string,
): Promise<DiscordPostResult> {
  const webhookUrl = (customWebhook || config.value.discord?.webhookUrl || DEFAULT_DISCORD_WEBHOOK).trim();
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    return { ok: false, error: "URL del webhook de Discord no configurada" };
  }

  try {
    const cleanLaps = laps.filter((l) => l.valid && !l.outLap && !l.inLap && l.lapTime > 0);
    const bestLap = cleanLaps.reduce((best, l) => (l.lapTime < best ? l.lapTime : best), session.bestLap || 0);
    const bestStr = bestLap > 0 ? lapTime(bestLap) : "–";
    const driverName = session.driver?.trim() || config.value.general?.teammates?.split(",")[0]?.trim() || "Piloto MDT";
    const trackName = session.track?.trim() || "Circuito";
    const carName = session.car?.trim() || session.vehicleName || "Coche";
    const carClass = session.carClass || "LMU";
    const sessionType = session.sessionType || "Sesión";

    const content =
      `🏁 **Sesión Finalizada · MDT-HUD Telemetría Oficial**\n` +
      `👤 **Piloto:** **${driverName}**\n` +
      `📍 **Circuito:** ${trackName}\n` +
      `🏎️ **Coche:** ${carName} (${carClass})\n` +
      `⏱️ **Mejor Vuelta:** \`${bestStr}\` · **Vueltas completadas:** ${laps.length} (${cleanLaps.length} válidas)\n` +
      `📅 **Fecha:** ${dateTime(session.startedAt)}`;

    const botName = config.value.discord?.botName?.trim() || DEFAULT_BOT_NAME;

    // 1. Generate PNG graphic with driver name prominently shown
    const blob = await renderSessionSummaryBlob(session, laps, config.value.general.units);

    // 2. Prepare multipart/form-data for Discord API
    const formData = new FormData();
    formData.append("username", botName);
    formData.append("content", content);
    formData.append("file", blob, `mdt-session-${session.id}.png`);

    const res = await fetch(webhookUrl, {
      method: "POST",
      body: formData,
    });

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
  const url = (webhookUrl || config.value.discord?.webhookUrl || DEFAULT_DISCORD_WEBHOOK).trim();
  if (!url || !url.startsWith("http")) {
    return { ok: false, error: "Introduce una URL válida de webhook de Discord (https://discord.com/api/webhooks/...)" };
  }
  try {
    const botName = config.value.discord?.botName?.trim() || DEFAULT_BOT_NAME;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: botName,
        content: `✅ **Conexión Exitosa con MDT-HUD**\nEl Webhook oficial de Discord está correctamente enlazado con **${botName}**. Al terminar una sesión en pista, el sistema generará y enviará automáticamente el gráfico PNG de telemetría con el nombre del piloto (**${config.value.general.teammates || "Piloto MDT"}**), tiempos y mejores vueltas. 🏎️💨`,
      }),
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
