<script lang="ts">
  import type { MotorsportIconId } from "../../lib/dashStudio.svelte";

  let {
    id,
    color = "currentColor",
    size = "100%",
  }: {
    id: MotorsportIconId;
    color?: string;
    size?: string;
  } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  style:width={size}
  style:height={size}
  class="block shrink-0"
>
  {#if id === "headlights"}
    <path d="M12 6c4 0 7 2.7 7 6s-3 6-7 6H9V6h3z" />
    <line x1="2" y1="8" x2="6" y2="8" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="2" y1="16" x2="6" y2="16" />
  {:else if id === "wipers"}
    <path d="M3 17a9 9 0 0 1 18 0" />
    <path d="M5 19h14" />
    <line x1="12" y1="19" x2="17" y2="7" />
    <circle cx="12" cy="19" r="1.5" fill={color} />
  {:else if id === "rain"}
    <path d="M6.5 14a4 4 0 0 1-.5-7.9A5.5 5.5 0 0 1 17 7a3.5 3.5 0 0 1 .5 7H6.5z" />
    <line x1="8" y1="17" x2="7" y2="21" />
    <line x1="12" y1="17" x2="11" y2="21" />
    <line x1="16" y1="17" x2="15" y2="21" />
  {:else if id === "fuel"}
    <rect x="4" y="4" width="10" height="16" rx="1.5" />
    <line x1="7" y1="9" x2="11" y2="9" />
    <path d="M14 9h2a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2V9l-3-3" />
    <line x1="3" y1="20" x2="15" y2="20" />
  {:else if id === "battery"}
    <rect x="2" y="7" width="18" height="10" rx="2" />
    <line x1="22" y1="10" x2="22" y2="14" />
    <path d="M11 9l-2 3h4l-2 3" />
  {:else if id === "bolt"}
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={color} stroke="none" />
  {:else if id === "engine"}
    <path d="M7 10V7h8v3h3l2 2v4l-2 2h-2v2H8v-2H6l-2-2v-4l2-2h1z" />
    <line x1="9" y1="4" x2="13" y2="4" />
    <line x1="11" y1="4" x2="11" y2="7" />
  {:else if id === "tyre"}
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="3" x2="12" y2="8" />
    <line x1="12" y1="16" x2="12" y2="21" />
    <line x1="3" y1="12" x2="8" y2="12" />
    <line x1="16" y1="12" x2="21" y2="12" />
  {:else if id === "brake"}
    <circle cx="12" cy="12" r="6" />
    <path d="M5 7a9 9 0 0 0 0 10" />
    <path d="M19 7a9 9 0 0 1 0 10" />
    <circle cx="12" cy="12" r="2" />
  {:else if id === "tc"}
    <path d="M5 17c1-3 3-3 4-6s3-3 4-6" />
    <path d="M11 17c1-3 3-3 4-6s3-3 4-6" />
    <line x1="4" y1="20" x2="20" y2="20" />
  {:else if id === "flag"}
    <line x1="5" y1="3" x2="5" y2="21" />
    <path d="M5 4h13l-2.5 4L18 12H5z" fill={color} />
  {:else if id === "pit"}
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 16V8h4a2.5 2.5 0 0 1 0 5H9" />
  {:else if id === "temp"}
    <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z" />
    <circle cx="12" cy="17" r="1.5" fill={color} />
  {:else}
    <path d="M10.3 3.9L1.8 18.5A2 2 0 0 0 3.5 21.5h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <circle cx="12" cy="17" r="0.8" fill={color} />
  {/if}
</svg>
