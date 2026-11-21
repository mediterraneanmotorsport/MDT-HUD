<script lang="ts">
  import { fly } from "svelte/transition";
  import { toasts, type ToastKind } from "../../lib/toasts.svelte";

  function kindStyles(kind: ToastKind): { border: string; bar: string; icon: string } {
    switch (kind) {
      case "success":
        return { border: "border-emerald-500/50", bar: "bg-emerald-400", icon: "✓" };
      case "warn":
        return { border: "border-amber-400/50", bar: "bg-amber-400", icon: "⚠" };
      case "error":
        return { border: "border-red-500/50", bar: "bg-red-500", icon: "✕" };
      default:
        return { border: "border-accent/50", bar: "bg-accent", icon: "ℹ" };
    }
  }
</script>

<div class="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-80 max-w-[92vw] flex-col gap-2">
  {#each toasts.items as item (item.id)}
    {@const st = kindStyles(item.kind)}
    <div
      transition:fly={{ x: 40, duration: 200 }}
      class={`pointer-events-auto relative overflow-hidden rounded-xl border ${st.border} bg-[#0b1320]/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-md`}
    >
      <div class="flex items-start gap-2.5">
        <span class={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-black ${st.bar}`}>
          {st.icon}
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold text-white">{item.title}</div>
          {#if item.desc}
            <div class="mt-0.5 text-[11px] text-white/65">{item.desc}</div>
          {/if}
        </div>
        <button
          type="button"
          class="rounded p-0.5 text-xs text-white/45 hover:bg-white/10 hover:text-white cursor-pointer"
          onclick={() => toasts.dismiss(item.id)}
        >✕</button>
      </div>
      {#if item.durationMs > 0}
        <div class="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class={`h-full ${st.bar} toast-progress`}
            style:animation-duration="{item.durationMs}ms"
          ></div>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  @keyframes toastShrink {
    from { width: 100%; }
    to { width: 0%; }
  }
  .toast-progress {
    animation-name: toastShrink;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
</style>
