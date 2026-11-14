<script lang="ts">
  import type { Units } from "../../lib/config.svelte";
  import { classColor } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";

  let { opts }: { opts: Record<string, any>; units: Units; edit: boolean } = $props();

  const live = useLive();

  const minimal = $derived(opts.style === "minimal");
  const showTagline = $derived(opts.showTagline ?? true);
  const showAvatar = $derived(opts.showAvatar ?? true);
  const avatarDataUrl = $derived((opts.avatarDataUrl ?? "") as string);
  const showFlag = $derived(opts.showFlag ?? true);
  const showCarNumber = $derived(opts.showCarNumber ?? true);

  const me = $derived(live.snap?.vehicles.find((v) => v.isPlayer));
  const rawDriver = $derived(
    (opts.customDriverName && String(opts.customDriverName).trim()) ||
      live.snap?.session.playerName?.trim() ||
      me?.driver?.trim() ||
      "PILOTO MDT",
  );

  // Strip optional [ES] / (ESP) tag from display name if user puts it in their driver name
  const displayDriverName = $derived(
    rawDriver.replace(/^\s*[\[(][A-Za-z]{2,3}[\])]\s*|\s*[\[(][A-Za-z]{2,3}[\])]\s*$/g, "").trim() ||
      rawDriver,
  );

  const ISO3_TO_ISO2: Record<string, string> = {
    ESP: "ES", PRT: "PT", POR: "PT", AND: "AD", FRA: "FR", ITA: "IT", DEU: "DE", GER: "DE",
    GBR: "GB", UK: "GB", ENG: "GB", NLD: "NL", NED: "NL", BEL: "BE", CHE: "CH", SUI: "CH",
    AUT: "AT", MCO: "MC", MON: "MC", IRL: "IE", POL: "PL", SWE: "SE", NOR: "NO", FIN: "FI",
    DNK: "DK", DEN: "DK", USA: "US", CAN: "CA", MEX: "MX", ARG: "AR", BRA: "BR", CHL: "CL",
    CHI: "CL", COL: "CO", URY: "UY", URU: "UY", PER: "PE", VEN: "VE", JPN: "JP", AUS: "AU",
    NZL: "NZ", EUR: "EU",
  };

  function detectCountryCode(name: string, configured?: string): string {
    if (configured && configured !== "auto") return configured.toUpperCase();

    // 1. Check if driver name has [ES] or (ESP)
    const tagMatch = name.match(/[\[(]([A-Za-z]{2,3})[\])]/);
    if (tagMatch) {
      const token = tagMatch[1].toUpperCase();
      if (token.length === 2) return token;
      if (ISO3_TO_ISO2[token]) return ISO3_TO_ISO2[token];
    }

    // 2. Check OS / Browser TimeZone
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const tzMap: Record<string, string> = {
        "Europe/Madrid": "ES",
        "Atlantic/Canary": "ES",
        "Africa/Ceuta": "ES",
        "Europe/Lisbon": "PT",
        "Atlantic/Madeira": "PT",
        "Atlantic/Azores": "PT",
        "Europe/Andorra": "AD",
        "Europe/Paris": "FR",
        "Europe/Rome": "IT",
        "Europe/Berlin": "DE",
        "Europe/London": "GB",
        "Europe/Amsterdam": "NL",
        "Europe/Brussels": "BE",
        "Europe/Zurich": "CH",
        "Europe/Vienna": "AT",
        "Europe/Monaco": "MC",
        "Europe/Dublin": "IE",
        "Europe/Warsaw": "PL",
        "Europe/Stockholm": "SE",
        "Europe/Oslo": "NO",
        "Europe/Helsinki": "FI",
        "Europe/Copenhagen": "DK",
        "America/Mexico_City": "MX",
        "America/Monterrey": "MX",
        "America/Tijuana": "MX",
        "America/Argentina/Buenos_Aires": "AR",
        "America/Buenos_Aires": "AR",
        "America/Cordoba": "AR",
        "America/Sao_Paulo": "BR",
        "America/Santiago": "CL",
        "America/Bogota": "CO",
        "America/Montevideo": "UY",
        "America/Lima": "PE",
        "America/Caracas": "VE",
        "America/New_York": "US",
        "America/Chicago": "US",
        "America/Denver": "US",
        "America/Los_Angeles": "US",
        "America/Toronto": "CA",
        "America/Vancouver": "CA",
        "Asia/Tokyo": "JP",
        "Australia/Sydney": "AU",
        "Australia/Melbourne": "AU",
        "Pacific/Auckland": "NZ",
      };
      if (tzMap[tz]) return tzMap[tz];
    } catch {
      // ignore
    }

    // 3. Check navigator.language region subtag (e.g. es-ES, pt-PT, es-AR)
    try {
      const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
      for (const l of langs) {
        const parts = (l || "").split(/[-_]/);
        if (parts.length >= 2 && parts[1].length === 2) {
          return parts[1].toUpperCase();
        }
      }
    } catch {
      // ignore
    }

    return "ES";
  }

  const activeCountry = $derived(detectCountryCode(rawDriver, opts.countryCode));
  const carNum = $derived(me?.number ? `#${me.number}` : "");
  const carClassColor = $derived(classColor(me?.class ?? "HY"));
</script>

{#snippet flagSvg(code: string)}
  <svg
    viewBox="0 0 24 16"
    class="h-3.5 w-5 shrink-0 rounded-[2px] border border-white/25 shadow-sm"
    aria-label={code}
  >
    {#if code === "ES"}
      <rect width="24" height="16" fill="#AA151B" />
      <rect y="4" width="24" height="8" fill="#F1BF00" />
      <rect x="5" y="5.5" width="2.5" height="5" rx="0.8" fill="#AA151B" />
    {:else if code === "PT"}
      <rect width="24" height="16" fill="#FF0000" />
      <rect width="9.5" height="16" fill="#006600" />
      <circle cx="9.5" cy="8" r="3" fill="#FFFF00" />
      <rect x="8.3" y="6.8" width="2.4" height="2.4" rx="0.5" fill="#FF0000" />
    {:else if code === "AD"}
      <rect width="8" height="16" fill="#10069F" />
      <rect x="8" width="8" height="16" fill="#FEDD00" />
      <rect x="16" width="8" height="16" fill="#D50032" />
      <rect x="10.2" y="5.5" width="3.6" height="5" rx="0.7" fill="#D50032" />
    {:else if code === "FR"}
      <rect width="8" height="16" fill="#002395" />
      <rect x="8" width="8" height="16" fill="#FFFFFF" />
      <rect x="16" width="8" height="16" fill="#ED2939" />
    {:else if code === "IT"}
      <rect width="8" height="16" fill="#009246" />
      <rect x="8" width="8" height="16" fill="#FFFFFF" />
      <rect x="16" width="8" height="16" fill="#CE2B37" />
    {:else if code === "DE"}
      <rect width="24" height="5.33" fill="#000000" />
      <rect y="5.33" width="24" height="5.33" fill="#DD0000" />
      <rect y="10.66" width="24" height="5.34" fill="#FFCE00" />
    {:else if code === "GB"}
      <rect width="24" height="16" fill="#012169" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFFFFF" stroke-width="3.2" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" stroke-width="1.6" />
      <path d="M12,0 V16 M0,8 H24" stroke="#FFFFFF" stroke-width="5" />
      <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" stroke-width="3" />
    {:else if code === "NL"}
      <rect width="24" height="5.33" fill="#AE1C28" />
      <rect y="5.33" width="24" height="5.33" fill="#FFFFFF" />
      <rect y="10.66" width="24" height="5.34" fill="#21468B" />
    {:else if code === "BE"}
      <rect width="8" height="16" fill="#000000" />
      <rect x="8" width="8" height="16" fill="#FDDA24" />
      <rect x="16" width="8" height="16" fill="#EF3340" />
    {:else if code === "CH"}
      <rect width="24" height="16" fill="#DA291C" />
      <rect x="10.2" y="3" width="3.6" height="10" fill="#FFFFFF" />
      <rect x="7" y="6.2" width="10" height="3.6" fill="#FFFFFF" />
    {:else if code === "AT"}
      <rect width="24" height="5.33" fill="#ED2939" />
      <rect y="5.33" width="24" height="5.33" fill="#FFFFFF" />
      <rect y="10.66" width="24" height="5.34" fill="#ED2939" />
    {:else if code === "MC"}
      <rect width="24" height="8" fill="#CE1126" />
      <rect y="8" width="24" height="8" fill="#FFFFFF" />
    {:else if code === "IE"}
      <rect width="8" height="16" fill="#169B62" />
      <rect x="8" width="8" height="16" fill="#FFFFFF" />
      <rect x="16" width="8" height="16" fill="#FF883E" />
    {:else if code === "PL"}
      <rect width="24" height="8" fill="#FFFFFF" />
      <rect y="8" width="24" height="8" fill="#DC143C" />
    {:else if code === "SE"}
      <rect width="24" height="16" fill="#006AA7" />
      <rect x="7" width="3.2" height="16" fill="#FECC02" />
      <rect y="6.4" width="24" height="3.2" fill="#FECC02" />
    {:else if code === "NO"}
      <rect width="24" height="16" fill="#BA0C2F" />
      <rect x="6.5" width="4.2" height="16" fill="#FFFFFF" />
      <rect y="5.9" width="24" height="4.2" fill="#FFFFFF" />
      <rect x="7.5" width="2.2" height="16" fill="#00205B" />
      <rect y="6.9" width="24" height="2.2" fill="#00205B" />
    {:else if code === "FI"}
      <rect width="24" height="16" fill="#FFFFFF" />
      <rect x="7" width="3.5" height="16" fill="#003580" />
      <rect y="6.2" width="24" height="3.5" fill="#003580" />
    {:else if code === "DK"}
      <rect width="24" height="16" fill="#C8102E" />
      <rect x="7" width="3.2" height="16" fill="#FFFFFF" />
      <rect y="6.4" width="24" height="3.2" fill="#FFFFFF" />
    {:else if code === "US"}
      <rect width="24" height="16" fill="#B22234" />
      <path d="M0,2.5 H24 M0,5.5 H24 M0,8.5 H24 M0,11.5 H24 M0,14.5 H24" stroke="#FFFFFF" stroke-width="1.3" />
      <rect width="11" height="8.5" fill="#3C3B6E" />
      <circle cx="3" cy="2.5" r="0.7" fill="#FFF" />
      <circle cx="5.5" cy="2.5" r="0.7" fill="#FFF" />
      <circle cx="8" cy="2.5" r="0.7" fill="#FFF" />
      <circle cx="4.2" cy="4.5" r="0.7" fill="#FFF" />
      <circle cx="6.8" cy="4.5" r="0.7" fill="#FFF" />
      <circle cx="3" cy="6.5" r="0.7" fill="#FFF" />
      <circle cx="5.5" cy="6.5" r="0.7" fill="#FFF" />
      <circle cx="8" cy="6.5" r="0.7" fill="#FFF" />
    {:else if code === "CA"}
      <rect width="6" height="16" fill="#FF0000" />
      <rect x="6" width="12" height="16" fill="#FFFFFF" />
      <rect x="18" width="6" height="16" fill="#FF0000" />
      <path d="M12,3.5 L13.5,6.5 L16,6 L14,9.5 L15,11.5 L12.5,11.5 L12.5,13.5 L11.5,13.5 L11.5,11.5 L9,11.5 L10,9.5 L8,6 L10.5,6.5 Z" fill="#FF0000" />
    {:else if code === "MX"}
      <rect width="8" height="16" fill="#006847" />
      <rect x="8" width="8" height="16" fill="#FFFFFF" />
      <rect x="16" width="8" height="16" fill="#CE1126" />
      <circle cx="12" cy="8" r="2" fill="#8C5A2B" />
    {:else if code === "AR"}
      <rect width="24" height="5.33" fill="#74ACDF" />
      <rect y="5.33" width="24" height="5.33" fill="#FFFFFF" />
      <rect y="10.66" width="24" height="5.34" fill="#74ACDF" />
      <circle cx="12" cy="8" r="1.8" fill="#F6B40E" />
    {:else if code === "BR"}
      <rect width="24" height="16" fill="#009739" />
      <polygon points="12,2 21,8 12,14 3,8" fill="#FEDD00" />
      <circle cx="12" cy="8" r="3.2" fill="#012169" />
    {:else if code === "CL"}
      <rect width="24" height="8" fill="#FFFFFF" />
      <rect y="8" width="24" height="8" fill="#D52B1E" />
      <rect width="8" height="8" fill="#0039A6" />
      <circle cx="4" cy="4" r="1.6" fill="#FFFFFF" />
    {:else if code === "CO"}
      <rect width="24" height="8" fill="#FCD116" />
      <rect y="8" width="24" height="4" fill="#003893" />
      <rect y="12" width="24" height="4" fill="#CE1126" />
    {:else if code === "UY"}
      <rect width="24" height="16" fill="#FFFFFF" />
      <path d="M0,2.5 H24 M0,6.5 H24 M0,10.5 H24 M0,14.5 H24" stroke="#0038A8" stroke-width="1.6" />
      <rect width="9" height="8" fill="#FFFFFF" />
      <circle cx="4.5" cy="4" r="2.2" fill="#FCD116" />
    {:else if code === "PE"}
      <rect width="8" height="16" fill="#D91023" />
      <rect x="8" width="8" height="16" fill="#FFFFFF" />
      <rect x="16" width="8" height="16" fill="#D91023" />
    {:else if code === "VE"}
      <rect width="24" height="5.33" fill="#FCE300" />
      <rect y="5.33" width="24" height="5.33" fill="#00247D" />
      <rect y="10.66" width="24" height="5.34" fill="#CF142B" />
    {:else if code === "JP"}
      <rect width="24" height="16" fill="#FFFFFF" />
      <circle cx="12" cy="8" r="4.5" fill="#BC002D" />
    {:else if code === "AU" || code === "NZ"}
      <rect width="24" height="16" fill="#012169" />
      <rect width="11" height="8" fill="#012169" />
      <path d="M0,0 L11,8 M11,0 L0,8" stroke="#FFFFFF" stroke-width="1.6" />
      <path d="M5.5,0 V8 M0,4 H11" stroke="#FFFFFF" stroke-width="2.5" />
      <path d="M5.5,0 V8 M0,4 H11" stroke="#C8102E" stroke-width="1.3" />
      <circle cx="18" cy="5" r="1.1" fill={code === "NZ" ? "#C8102E" : "#FFFFFF"} />
      <circle cx="16" cy="9" r="1" fill={code === "NZ" ? "#C8102E" : "#FFFFFF"} />
      <circle cx="19" cy="12" r="1.2" fill={code === "NZ" ? "#C8102E" : "#FFFFFF"} />
      <circle cx="6" cy="12.5" r="1.5" fill="#FFFFFF" />
    {:else}
      <!-- EU / Default -->
      <rect width="24" height="16" fill="#003399" />
      <circle cx="12" cy="8" r="4.8" fill="none" stroke="#FFCC00" stroke-width="1.4" stroke-dasharray="1.2 1.3" />
    {/if}
  </svg>
{/snippet}

<div
  class={[
    "flex items-center gap-3 px-3.5 py-2 select-none",
    minimal ? "drop-shadow-[0_2px_8px_rgb(0_0_0/0.9)]" : "hud",
  ]}
>
  <img src="/mdt-logo.png" alt="MDT" class="h-8 w-auto shrink-0 object-contain" draggable="false" />

  {#if showAvatar && avatarDataUrl}
    <div class="relative h-10 w-10 shrink-0 rounded-full p-[1.5px] shadow-[0_0_12px_var(--color-accent)]" style="background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hi));">
      <img
        src={avatarDataUrl}
        alt={displayDriverName}
        class="h-full w-full rounded-full bg-surface object-cover"
        draggable="false"
      />
    </div>
  {/if}

  <div class="min-w-0 leading-none">
    <div class="flex items-center gap-2">
      <span class="truncate font-display text-[19px] font-extrabold tracking-[0.04em] text-fg uppercase">
        {displayDriverName}
      </span>

      {#if showCarNumber && carNum}
        <span
          class="rounded px-1.5 py-0.5 font-mono text-[11px] font-black tracking-tight text-black shadow-sm"
          style:background={carClassColor}
        >
          {carNum}
        </span>
      {/if}

      {#if showFlag}
        <span class="inline-flex items-center gap-1 rounded bg-white/8 px-1.5 py-0.5 border border-white/12" title={`País: ${activeCountry}`}>
          {@render flagSvg(activeCountry)}
          <span class="font-mono text-[9px] font-bold tracking-wider text-white/85">{activeCountry}</span>
        </span>
      {/if}
    </div>

    {#if showTagline}
      <div class="mt-1 flex items-center gap-1.5 font-display text-[9px] font-semibold tracking-[0.22em] text-accent-hi uppercase">
        <span>Mediterranean Motorsport</span>
      </div>
    {/if}
  </div>
</div>
