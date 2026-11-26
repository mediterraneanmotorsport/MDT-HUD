<script lang="ts">
  let { checked, onchange, label }: { checked: boolean; onchange: (v: boolean) => void; label?: string } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  class={[
    "relative h-[22px] w-[40px] shrink-0 rounded-[4px] border transition-colors duration-150 cursor-pointer",
    checked
      ? "border-accent-hi bg-accent"
      : "border-white/[0.14] bg-[#1a1e28] hover:border-white/25",
  ]}
  onclick={() => onchange(!checked)}
>
  <span
    class="absolute top-[2px] left-[2px] h-[16px] w-[16px] rounded-[2px] bg-[#f3f5f8] transition-transform duration-150 ease-out"
    style:transform={checked ? "translateX(18px)" : "translateX(0)"}
  ></span>
</button>
