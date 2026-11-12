<script lang="ts">
  import {
    config,
    createMdtTemplateProfile,
    createProfile,
    deleteProfile,
    exportActiveProfileJson,
    importProfileFromObject,
    renameProfile,
    switchProfile,
  } from "../../lib/config.svelte";

  type Mode = { kind: "idle" } | { kind: "rename" } | { kind: "new"; fromDefaults: boolean } | { kind: "delete" };

  let mode = $state<Mode>({ kind: "idle" });
  let name = $state("");
  let input = $state<HTMLInputElement>();
  let fileInput = $state<HTMLInputElement>();
  let feedback = $state("");

  const active = $derived(config.value.activeProfile);
  const profiles = $derived(Object.entries(config.value.profiles));
  const activeName = $derived(config.value.profiles[active]?.name ?? "");

  function start(m: Mode) {
    mode = m;
    name = m.kind === "rename" ? activeName : m.kind === "new" ? `${activeName} copia` : "";
    if (m.kind === "new" && m.fromDefaults) name = "Nuevo perfil";
    queueMicrotask(() => input?.select());
  }

  function commit() {
    const n = name.trim();
    if (!n) return;
    if (mode.kind === "rename") renameProfile(active, n);
    else if (mode.kind === "new") createProfile(n, mode.fromDefaults);
    mode = { kind: "idle" };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") mode = { kind: "idle" };
  }

  function exportProfile() {
    const { filename, content } = exportActiveProfileJson();
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    feedback = `Exportado: ${filename}`;
    setTimeout(() => (feedback = ""), 3500);
  }

  async function onImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const importedName = importProfileFromObject(JSON.parse(text));
      feedback = `Perfil importado: "${importedName}"`;
    } catch (err) {
      feedback = `Error al importar: ${err instanceof Error ? err.message : String(err)}`;
    }
    (e.currentTarget as HTMLInputElement).value = "";
    setTimeout(() => (feedback = ""), 4000);
  }
</script>

<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 card px-5 py-3 text-sm">
  <span class="text-xs font-semibold tracking-wider text-muted uppercase">Perfil</span>

  {#if mode.kind === "rename" || mode.kind === "new"}
    <input
      bind:this={input}
      bind:value={name}
      onkeydown={onKey}
      class="field w-56"
      placeholder="Nombre del perfil"
      maxlength="40"
    />
    <button class="btn btn-primary" disabled={!name.trim()} onclick={commit}>
      {mode.kind === "rename" ? "Renombrar" : "Crear"}
    </button>
    <button class="btn" onclick={() => (mode = { kind: "idle" })}>Cancelar</button>
    {#if mode.kind === "new"}
      <span class="text-xs text-muted">
        {mode.fromDefaults ? "Empieza desde el diseño por defecto." : `Empieza como copia de “${activeName}”.`}
      </span>
    {/if}
  {:else if mode.kind === "delete"}
    <span>¿Eliminar “{activeName}”? Esta acción no se puede deshacer.</span>
    <button
      class="btn bg-bad! text-white"
      onclick={() => {
        deleteProfile(active);
        mode = { kind: "idle" };
      }}>Eliminar</button
    >
    <button class="btn" onclick={() => (mode = { kind: "idle" })}>Cancelar</button>
  {:else}
    <select class="field w-56" value={active} onchange={(e) => switchProfile(e.currentTarget.value)}>
      {#each profiles as [id, p] (id)}<option value={id}>{p.name}</option>{/each}
    </select>
    <div class="flex flex-wrap gap-2">
      <button class="btn" onclick={() => start({ kind: "new", fromDefaults: false })}>Duplicar</button>
      <button class="btn" onclick={() => start({ kind: "new", fromDefaults: true })}>Nuevo</button>
      <button class="btn" onclick={() => start({ kind: "rename" })}>Renombrar</button>
      <button class="btn" disabled={profiles.length < 2} onclick={() => start({ kind: "delete" })}>Eliminar</button>
      <select
        class="field text-xs font-semibold text-accent"
        value=""
        onchange={(e) => {
          const val = e.currentTarget.value as "competicion" | "streamer" | "minimalista" | "";
          if (val) createMdtTemplateProfile(val);
          e.currentTarget.value = "";
        }}
      >
        <option value="">+ Plantilla MDT…</option>
        <option value="competicion">MDT Competición (Pro)</option>
        <option value="streamer">MDT Streamer / Broadcast</option>
        <option value="minimalista">MDT Minimalista</option>
      </select>
      <button class="btn" title="Exportar perfil a archivo .mdthud.json para compartir con el equipo" onclick={exportProfile}>
        Exportar .json
      </button>
      <button class="btn" title="Importar perfil .mdthud.json de un compañero" onclick={() => fileInput?.click()}>
        Importar .json
      </button>
      <input bind:this={fileInput} type="file" accept=".json" class="hidden" onchange={onImportFile} />
    </div>
    {#if feedback}
      <span class="text-xs font-semibold text-accent">{feedback}</span>
    {:else}
      <span class="text-xs text-muted">Comparte tus perfiles de HUD con el equipo exportando el archivo <code>.mdthud.json</code>.</span>
    {/if}
  {/if}
</div>
