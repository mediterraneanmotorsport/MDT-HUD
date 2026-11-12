<script lang="ts">
  let { size = 28, wordmark = true, tagline = false }: { size?: number; wordmark?: boolean; tagline?: boolean } = $props();
</script>

<div class="flex items-center gap-2.5 select-none">
  <img
    src="/mdt-logo.png"
    alt="MDT-HUD"
    class="w-auto shrink-0 object-contain"
    style:height="{size * 1.25}px"
    draggable="false"
  />
  {#if wordmark}
    <div class="leading-none">
      <div
        class="font-display font-extrabold tracking-[0.04em] uppercase italic"
        style:font-size="{size * 0.86}px"
      >
        MDT-HUD
      </div>
      {#if tagline}
        <div class="mt-0.5 font-display text-[10px] font-semibold tracking-[0.32em] text-muted uppercase">
          LMU Telemetry
        </div>
      {/if}
    </div>
  {/if}
</div>
