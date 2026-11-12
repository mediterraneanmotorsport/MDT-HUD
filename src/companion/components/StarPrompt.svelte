<script lang="ts">
  import { dismissStarPrompt, REPO_URL, starOnGitHub, starPrompt } from "../../lib/star.svelte";
  import { updater } from "../../lib/updater.svelte";

  let openError = $state(false);

  async function star() {
    openError = false;
    try {
      await starOnGitHub();
    } catch {
      openError = true;
    }
  }
</script>

{#if starPrompt.open && !updater.changelogOpen}
  <aside
    class="fixed right-5 bottom-5 z-40 w-80 rounded-xl border border-line bg-surface p-4 text-sm shadow-2xl"
    role="status"
    aria-labelledby="star-prompt-title"
  >
    <div class="flex items-start justify-between gap-3">
      <div id="star-prompt-title" class="flex items-center gap-2 font-medium text-fg">
        <svg class="text-accent" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>
        ¿Te gusta MDT-HUD?
      </div>
      <button class="-mt-1 -mr-1 rounded p-1 text-muted transition-colors hover:bg-surface-3 hover:text-fg" aria-label="Cerrar" title="Cerrar" onclick={dismissStarPrompt}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" /></svg>
      </button>
    </div>
    <p class="mt-1.5 text-muted">Si te gusta la app del equipo, déjanos una estrella en GitHub.</p>
    {#if openError}
      <p class="mt-2 select-text text-xs break-words text-bad" role="alert">No se pudo abrir el navegador. Visita {REPO_URL} para dejar una estrella.</p>
    {/if}
    <button class="btn btn-primary mt-3 w-full" onclick={star}>Estrella en GitHub</button>
  </aside>
{/if}
