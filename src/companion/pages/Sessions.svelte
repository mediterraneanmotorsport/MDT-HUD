<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { renderSessionSummaryBlob } from "../../lib/exportSessionImage";
  import { sendSessionToDiscord } from "../../lib/discord";
  import { dateTime, lapTime } from "../../lib/format";
  import type { Filters, LapRecord, SessionSummary } from "../../lib/types";
  import { config } from "../../lib/config.svelte";
  import { uploadable, uploads } from "../../lib/uploads.svelte";
  import CarRender from "../../lib/CarRender.svelte";
  import TrackHero from "../../lib/TrackHero.svelte";
  import LapTable from "../components/LapTable.svelte";
  import { nav } from "../nav.svelte";

  let filters = $state<Filters>({ tracks: [], cars: [] });
  let track = $state<string>("");
  let car = $state<string>("");
  let sessions = $state<SessionSummary[]>([]);
  let laps = $state<LapRecord[]>([]);
  let selected = $state<number[]>([]);

  const current = $derived(sessions.find((s) => s.id === nav.sessionId) ?? null);

  async function loadSessions() {
    sessions = await api.listSessions({ track: track || null, car: car || null, limit: 500 });
    if (nav.sessionId == null || !sessions.some((s) => s.id === nav.sessionId)) nav.sessionId = sessions[0]?.id ?? null;
  }

  async function loadLaps(id: number | null) {
    selected = [];
    laps = id == null ? [] : await api.listLaps(id);
  }

  onMount(async () => {
    filters = await api.getFilters();
    await loadSessions();
  });

  $effect(() => {
    loadLaps(nav.sessionId);
  });

  function toggle(l: LapRecord) {
    if (selected.includes(l.id)) selected = selected.filter((x) => x !== l.id);
    else selected = [...selected, l.id].slice(-2);
  }

  async function deleteSession() {
    if (!current || !confirm(`¿Eliminar esta sesión y sus ${current.lapCount} vueltas?`)) return;
    await api.deleteSession(current.id);
    nav.sessionId = null;
    await loadSessions();
  }

  const fromGame = $derived(current?.source === "lmu");
  const toUpload = $derived(fromGame ? laps.filter((l) => uploadable(l) && !uploads.byLap[l.id]) : []);
  let uploadNote = $state("");

  async function uploadSession() {
    uploadNote = "";
    try {
      const queued = await api.uploadLaps(toUpload.map((l) => l.id));
      if (queued === 0) uploadNote = "Ninguna vuelta de esta sesión se puede subir.";
    } catch (e) {
      uploadNote = String(e);
    }
  }

  async function deleteLap(l: LapRecord) {
    if (!confirm(`¿Eliminar vuelta ${l.lapNumber} (${lapTime(l.lapTime)})?`)) return;
    await api.deleteLap(l.id);
    await loadLaps(nav.sessionId);
    await loadSessions();
  }

  let exporting = $state(false);
  let exportMsg = $state("");

  async function downloadSessionImage() {
    if (!current || exporting) return;
    exporting = true;
    exportMsg = "";
    try {
      const blob = await renderSessionSummaryBlob(current, laps, config.value.general.units);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTrack = current.track.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      a.href = url;
      a.download = `mdt-hud-${safeTrack}-${current.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
      exportMsg = "Imagen PNG con logos MDT descargada.";
    } catch (e) {
      exportMsg = `Error al generar imagen: ${String(e)}`;
    } finally {
      exporting = false;
      setTimeout(() => (exportMsg = ""), 4000);
    }
  }

  async function copySessionImage() {
    if (!current || exporting) return;
    exporting = true;
    exportMsg = "";
    try {
      const blob = await renderSessionSummaryBlob(current, laps, config.value.general.units);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      exportMsg = "¡Imagen MDT copiada al portapapeles! Ya puedes pegarla (Ctrl+V) en Discord.";
    } catch {
      await downloadSessionImage();
    } finally {
      exporting = false;
      setTimeout(() => (exportMsg = ""), 4000);
    }
  }

  async function postToDiscord() {
    if (!current || exporting) return;
    if (!config.value.discord?.webhookUrl) {
      exportMsg = "⚠️ Configura primero tu Webhook de Discord en la pestaña Ajustes.";
      return;
    }
    exporting = true;
    exportMsg = "Generando PNG con nombre del piloto y enviando a Discord...";
    try {
      const res = await sendSessionToDiscord(current, laps);
      if (res.ok) {
        exportMsg = "✓ ¡Sesión y gráfico PNG enviados a Discord con éxito!";
      } else {
        exportMsg = `⚠️ Error al enviar a Discord: ${res.error}`;
      }
    } catch (e) {
      exportMsg = `⚠️ Error: ${String(e)}`;
    } finally {
      exporting = false;
      setTimeout(() => (exportMsg = ""), 5000);
    }
  }
</script>

<div class="flex h-full">
  <aside class="flex w-[340px] shrink-0 flex-col border-r border-line">
    <div class="flex gap-2 border-b border-line p-3">
      <select class="min-w-0 flex-1 field text-sm" bind:value={track} onchange={loadSessions}>
        <option value="">Todos los circuitos</option>
        {#each filters.tracks as t}<option value={t}>{t}</option>{/each}
      </select>
      <select class="min-w-0 flex-1 field text-sm" bind:value={car} onchange={loadSessions}>
        <option value="">Todos los coches</option>
        {#each filters.cars as c}<option value={c}>{c}</option>{/each}
      </select>
    </div>
    <div class="flex-1 overflow-y-auto">
      {#each sessions as s (s.id)}
        <button
          class={["block w-full border-b border-line px-4 py-3 text-left", nav.sessionId === s.id ? "bg-surface-3" : "hover:bg-surface-2"]}
          onclick={() => (nav.sessionId = s.id)}
        >
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate font-medium">{s.track}</span>
            <span class="shrink-0 text-sm font-semibold text-best tnum">{lapTime(s.bestLap)}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs text-muted">{s.car} · {s.sessionType}{s.source === "demo" ? " · demo" : ""}</div>
              <div class="text-xs text-faint">{dateTime(s.startedAt)} · {s.lapCount} vueltas</div>
            </div>
            <CarRender file={s.vehFile} view="thumb" class="h-9 w-[90px] shrink-0 object-contain" />
          </div>
        </button>
      {:else}
        <div class="p-6 text-center text-sm text-muted">Aún no hay sesiones. ¡Da algunas vueltas!</div>
      {/each}
    </div>
  </aside>

  <section class="min-w-0 flex-1 overflow-y-auto p-6">
    {#if current}
      <div class="card mb-4 overflow-hidden">
        <TrackHero track={current.track} file={current.vehFile} alt={current.car}>
          <h1 class="page-title">{current.track}</h1>
          <div class="text-sm text-muted">
            {current.car} ({current.carClass}) · {current.sessionType}
          </div>
          <div class="text-sm text-faint">
            {dateTime(current.startedAt)}{current.gameVersion ? ` · versión del juego ${current.gameVersion}` : ""}
          </div>
        </TrackHero>
      </div>
      {#if uploadNote}<p class="mb-2 text-xs text-bad">{uploadNote}</p>{/if}
      {#if exportMsg}<p class="mb-2 text-xs font-semibold text-accent">{exportMsg}</p>{/if}
      <div class="mb-2 flex flex-wrap items-center justify-between gap-4">
        <p class="text-xs text-muted">Haz clic en las vueltas para seleccionarlas (A, luego B) y compararlas.</p>
        <div class="flex flex-wrap shrink-0 gap-2">
          <button
            class="btn btn-primary"
            disabled={selected.length === 0}
            onclick={() => nav.openAnalysis(current!.track, selected[0], selected[1] ?? null)}
          >
            {selected.length === 2 ? "Comparar A vs B" : "Analizar vuelta"}
          </button>
          <button class="btn" disabled={exporting} onclick={copySessionImage} title="Copia una tarjeta gráfica PNG con logos de MDT al portapapeles para pegar en Discord">
            📸 Copiar Imagen MDT (Discord)
          </button>
          <button class="btn" disabled={exporting} onclick={downloadSessionImage} title="Descargar tarjeta PNG con logos de MDT">
            ⬇ Exportar PNG MDT
          </button>
          <button class="btn bg-[#5865F2]/20 border border-[#5865F2]/40 text-fg hover:bg-[#5865F2]/30" disabled={exporting} onclick={postToDiscord} title="Generar PNG con nombre del piloto y enviar directamente a tu canal de Discord">
            💬 Enviar a Discord
          </button>
          <button class="btn hover:text-bad" onclick={deleteSession}>Eliminar sesión</button>
        </div>
      </div>
      <LapTable
        {laps}
        {selected}
        onselect={toggle}
        onopen={(l) => nav.openAnalysis(l.track, l.id)}
        ondelete={deleteLap}
        {fromGame}
      />
    {:else}
      <div class="p-10 text-center text-muted">Selecciona una sesión.</div>
    {/if}
  </section>
</div>
