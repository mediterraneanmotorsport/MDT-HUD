<script lang="ts">
  import type { Units } from "../../lib/config.svelte";

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const minimal = $derived(opts.style === "minimal");
  const showTagline = $derived(opts.showTagline ?? true);
</script>

<div
  class={[
    "flex items-center gap-2.5 px-3 py-1.5 select-none",
    minimal ? "drop-shadow-[0_2px_6px_rgb(0_0_0/0.85)]" : "hud",
  ]}
>
  <img src="/mdt-logo.png" alt="MDT" class="h-8 w-auto shrink-0 object-contain" draggable="false" />
  <div class="leading-none">
    <div class="font-display text-[20px] font-extrabold tracking-[0.05em] text-fg uppercase italic">
      MDT-HUD
    </div>
    {#if showTagline}
      <div class="mt-0.5 font-display text-[9px] font-semibold tracking-[0.22em] text-accent-hi uppercase">
        Mediterranean Motorsport
      </div>
    {/if}
  </div>
</div>
