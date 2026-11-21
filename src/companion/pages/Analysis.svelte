<script lang="ts">
  import { onMount } from "svelte";
  import { align, brakeZones, type Aligned, type BrakeZone } from "../../lib/analysis";
  import { api } from "../../lib/api";
  import { config } from "../../lib/config.svelte";
  import { dateTime, delta as fmtDelta, lapTime, sectorTime, speed as toSpeed, speedUnit, temp } from "../../lib/format";
  import type { LapRecord, LapTrace } from "../../lib/types";
  import AnalysisMap, { type ColorBy } from "../components/AnalysisMap.svelte";
  import TraceChart, { ChartGroup, type Series } from "../components/TraceChart.svelte";
  import { nav } from "../nav.svelte";

  const A = "#2287ec";
  const B = "#f59e0b";

  let tracks = $state<string[]>([]);
  let laps = $state<LapRecord[]>([]);
  let traceA = $state.raw<LapTrace | null>(null);
  let traceB = $state.raw<LapTrace | null>(null);
  let colorBy = $state<ColorBy>("speed");
  let cursorIdx = $state<number | null>(null);
  let loading = $state(false);
  let remoteError = $state("");
  const group = new ChartGroup();

  const units = $derived(config.value.general.units);
  const lapA = $derived(laps.find((l) => l.id === nav.lapA) ?? null);
  const lapB = $derived(laps.find((l) => l.id === nav.lapB) ?? null);

  onMount(async () => {
    tracks = (await api.getFilters()).tracks;
    if (!nav.track && tracks.length) nav.track = tracks[0];
  });

  // Laps for the selected track.
  $effect(() => {
    const track = nav.track;
    if (!track) return;
    api.listTrackLaps(track, null, false, 1000).then((l) => {
      if (nav.track !== track) return;
      laps = l;
      if (nav.lapA == null || !l.some((x) => x.id === nav.lapA)) {
        nav.lapA = l.find((x) => x.valid && !x.outLap && !x.inLap)?.id ?? l[0]?.id ?? null;
        nav.lapB = null;
      }
    });
  });

  $effect(() => {
    const a = nav.lapA;
    const b = nav.lapB;
    const remote = nav.remoteB;
    loading = true;
    remoteError = "";
    const loadB = b != null ? api.getLapTrace(b) : remote ? api.rankedLapTrace(remote.id) : null;
    Promise.all([
      a != null ? api.getLapTrace(a) : null,
      // A ranked lap may be gone or the server unreachable; still show lap A.
      Promise.resolve(loadB).catch((e) => {
        remoteError = String(e);
        return null;
      }),
    ]).then(([ta, tb]) => {
      if (nav.lapA !== a || nav.lapB !== b || nav.remoteB !== remote) return;
      traceA = ta;
      traceB = tb;
      loading = false;
      cursorIdx = null;
    });
  });

  /** Lap B's select value: a local lap id, "remote" or "" (none). */
  const bValue = $derived(nav.remoteB ? "remote" : nav.lapB != null ? String(nav.lapB) : "");
  function selectB(value: string) {
    if (value === "remote") return;
    nav.remoteB = null;
    nav.lapB = value ? Number(value) : null;
  }

  const data: Aligned | null = $derived(traceA && traceA.d.length > 10 ? align(traceA, traceB, 2) : null);
  const zonesA: BrakeZone[] = $derived(data ? brakeZones(data.a, data.d) : []);
  const zonesB: BrakeZone[] = $derived(data?.b ? brakeZones(data.b, data.d) : []);

  // Charts. Each `series` array is rebuilt only when the aligned data changes.
  const sp = (arr: Float64Array) => Array.from(arr, (v) => toSpeed(v, units));
  const pct = (arr: Float64Array) => Array.from(arr, (v) => v * 100);

  const charts = $derived.by(() => {
    if (!data) return [];
    const { a, b } = data;
    const list: { title: string; series: Series[]; height?: number; yRange?: [number, number]; format?: (v: number) => string }[] = [];
    if (data.delta) {
      list.push({
        title: "Delta (A − B, s)",
        series: [{ label: "Δ", data: data.delta, color: "#e8eaf0", fill: "rgb(232 234 240 / 0.06)" }],
        height: 110,
        format: (v) => (isFinite(v) ? (v > 0 ? "+" : "") + v.toFixed(3) : ""),
      });
    }
    list.push({
      title: `Velocidad (${speedUnit(units)})`,
      series: [
        { label: "A", data: sp(a.speed), color: A },
        ...(b ? [{ label: "B", data: sp(b.speed), color: B }] : []),
      ],
      height: 170,
    });
    list.push({
      title: "Acelerador (%)",
      series: [
        { label: "A", data: pct(a.throttle), color: "#2fbf71" },
        ...(b ? [{ label: "B", data: pct(b.throttle), color: B, dash: [4, 3] }] : []),
      ],
      yRange: [0, 102],
    });
    list.push({
      title: "Freno (%)",
      series: [
        { label: "A", data: pct(a.brake), color: "#e5484d" },
        ...(b ? [{ label: "B", data: pct(b.brake), color: B, dash: [4, 3] }] : []),
      ],
      yRange: [0, 102],
    });
    list.push({
      title: "Dirección (%)",
      series: [
        { label: "A", data: pct(a.steering), color: A },
        ...(b ? [{ label: "B", data: pct(b.steering), color: B }] : []),
      ],
      yRange: [-100, 100],
    });
    list.push({
      title: "Marcha",
      series: [
        { label: "A", data: a.gear, color: A, stepped: true },
        ...(b ? [{ label: "B", data: b.gear, color: B, stepped: true }] : []),
      ],
      height: 100,
    });
    list.push({
      title: "RPM",
      series: [
        { label: "A", data: a.rpm, color: A },
        ...(b ? [{ label: "B", data: b.rpm, color: B }] : []),
      ],
      height: 110,
    });
    list.push({
      title: "Temperatura superficial de neumáticos, vuelta A",
      series: [
        { label: "FL", data: Array.from(a.tyreFl, (v) => temp(v, units)), color: "#4c9aff" },
        { label: "FR", data: Array.from(a.tyreFr, (v) => temp(v, units)), color: "#2fbf71" },
        { label: "RL", data: Array.from(a.tyreRl, (v) => temp(v, units)), color: "#f2a33a" },
        { label: "RR", data: Array.from(a.tyreRr, (v) => temp(v, units)), color: "#e5484d" },
      ],
      height: 120,
    });
    return list;
  });

  const readout = $derived.by(() => {
    if (!data || cursorIdx == null) return null;
    const i = cursorIdx;
    const row = (c: Aligned["a"]) => ({
      t: c.t[i],
      speed: toSpeed(c.speed[i], units),
      gear: Math.round(c.gear[i]),
      throttle: c.throttle[i] * 100,
      brake: c.brake[i] * 100,
      steering: c.steering[i] * 100,
      gLat: c.gLat[i],
    });
    return { d: data.d[i], a: row(data.a), b: data.b ? row(data.b) : null, delta: data.delta?.[i] ?? null };
  });

  /** Pair each braking zone of A with B's zone that starts within 80 m, plus throttle application diff (#11). */
  const corners = $derived(
    zonesA.map((za, k) => {
      const da = data!.d[za.start];
      const zb = zonesB.find((z) => Math.abs(data!.d[z.start] - da) < 80) ?? null;
      const findThrottleIdx = (trace: Aligned["a"], fromIdx: number) => {
        const end = Math.min(trace.throttle.length - 1, fromIdx + 80);
        for (let i = fromIdx; i <= end; i++) {
          if (trace.throttle[i] >= 0.45) return i;
        }
        return fromIdx;
      };
      const thA = data!.d[findThrottleIdx(data!.a, za.end)];
      const thB = zb && data!.b ? data!.d[findThrottleIdx(data!.b, zb.end)] : null;
      const brakeDiff = zb ? data!.d[zb.start] - da : null;
      // throttleDiff > 0 means A gets on throttle later than B
      const throttleDiff = thB != null ? thA - thB : null;
      const deltaGain =
        data!.delta && zb
          ? data!.delta[Math.min(data!.d.length - 1, Math.max(za.end, zb.end) + 50)] - data!.delta[Math.max(0, Math.min(za.start, zb.start) - 25)]
          : null;
      const hints: string[] = [];
      if (brakeDiff != null && Math.abs(brakeDiff) >= 3) {
        hints.push(`frenas ${Math.abs(Math.round(brakeDiff))}m ${brakeDiff > 0 ? "antes" : "después"}`);
      }
      if (throttleDiff != null && Math.abs(throttleDiff) >= 3) {
        hints.push(`aceleras ${Math.abs(Math.round(throttleDiff))}m ${throttleDiff > 0 ? "más tarde" : "antes"}`);
      }
      return {
        n: k + 1,
        za,
        zb,
        brakeDiff,
        throttleDiff,
        minA: toSpeed(za.minSpeed, units),
        minB: zb ? toSpeed(zb.minSpeed, units) : null,
        deltaGain,
        hint: hints.join(" · "),
      };
    }),
  );

  // #11 Top 3 biggest time-loss corners for quick coaching
  const topLossCorners = $derived(
    corners
      .filter((c) => c.deltaGain != null && c.deltaGain > 0.015)
      .sort((a, b) => (b.deltaGain ?? 0) - (a.deltaGain ?? 0))
      .slice(0, 3),
  );

  function lapLabel(l: LapRecord) {
    const flags = [!l.valid && "inválida", l.outLap && "salida", l.inLap && "entrada"].filter(Boolean).join(", ");
    return `${lapTime(l.lapTime)} · V${l.lapNumber} · ${l.car} · ${dateTime(l.recordedAt)}${flags ? ` (${flags})` : ""}`;
  }

  const COLOR_MODES: { id: ColorBy; label: string }[] = [
    { id: "speed", label: "Velocidad" },
    { id: "inputs", label: "Pedales" },
    { id: "gear", label: "Marcha" },
    { id: "delta", label: "Ganancia" },
  ];
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && group.range && !(e.target instanceof HTMLSelectElement)) group.reset();
  }}
/>

<div class="p-5">
  <div class="mb-4 flex flex-wrap items-end gap-3">
    <label class="flex flex-col gap-1 text-xs text-muted">
      Circuito
      <select class="min-w-[200px] field text-sm text-fg" bind:value={nav.track}>
        {#each tracks as t}<option value={t}>{t}</option>{/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs text-muted">
      <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style:background={A}></span>Vuelta A</span>
      <select class="w-[360px] field text-sm text-fg" bind:value={nav.lapA}>
        {#each laps as l (l.id)}<option value={l.id}>{lapLabel(l)}</option>{/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-xs text-muted">
      <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style:background={B}></span>Comparar con (B)</span>
      <select class="w-[360px] field text-sm text-fg" value={bValue} onchange={(e) => selectB(e.currentTarget.value)}>
        <option value="">Ninguna</option>
        {#if nav.remoteB}
          <option value="remote">Ranking: {lapTime(nav.remoteB.lapTime)} · {nav.remoteB.label}</option>
        {/if}
        {#each laps as l (l.id)}{#if l.id !== nav.lapA}<option value={String(l.id)}>{lapLabel(l)}</option>{/if}{/each}
      </select>
    </label>
    {#if nav.lapB != null}
      <button
        class="btn"
        onclick={() => ([nav.lapA, nav.lapB] = [nav.lapB, nav.lapA])}>Intercambiar</button
      >
    {/if}
    {#if laps.length && !nav.lapB && !nav.remoteB}
      <button
        class="btn"
        title="Comparar con tu vuelta limpia más rápida en este circuito"
        onclick={() => (nav.lapB = laps.find((l) => l.valid && !l.outLap && !l.inLap && l.id !== nav.lapA)?.id ?? null)}
        >vs mejor vuelta</button
      >
    {/if}
  </div>

  {#if remoteError}
    <p class="mb-3 text-sm text-bad">No se pudo cargar la vuelta de referencia: {remoteError}</p>
  {/if}

  {#if nav.remoteB && nav.track && !tracks.includes(nav.track)}
    <div class="card p-10 text-center text-muted">Aún no tienes vueltas en {nav.track}. Da algunas vueltas para comparar.</div>
  {:else if !tracks.length}
    <div class="card p-10 text-center text-muted">Aún no hay vueltas registradas.</div>
  {:else if !data}
    <div class="card p-10 text-center text-muted">{loading ? "Cargando…" : "Selecciona una vuelta."}</div>
  {:else}
    <div class="grid grid-cols-[minmax(0,1fr)_440px] gap-4">
      <div class="flex min-w-0 flex-col gap-2">
        {#each charts as c (c.title)}
          <TraceChart
            title={c.title}
            x={data.d}
            series={c.series}
            height={c.height}
            yRange={c.yRange}
            format={c.format}
            {group}
            syncKey="analysis"
            {cursorIdx}
            oncursor={(i) => (cursorIdx = i)}
          />
        {/each}
      </div>

      <div class="flex flex-col gap-3">
        <div class="sticky top-0 flex flex-col gap-3">
          <div class="flex gap-1 rounded-lg bg-surface p-1 text-sm">
            {#each COLOR_MODES as m}
              <button
                class={["flex-1 rounded-md py-1", colorBy === m.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg"]}
                disabled={m.id === "delta" && !data.delta}
                onclick={() => (colorBy = m.id)}>{m.label}</button
              >
            {/each}
          </div>
          <AnalysisMap {data} {colorBy} zones={zonesA} {cursorIdx} oncursor={(i) => (cursorIdx = i)} height={400} />

          <div class="card p-3 text-sm tnum">
            {#if readout}
              <div class="mb-2 flex justify-between text-xs text-muted">
                <span>{Math.round(readout.d)} m</span>
                {#if readout.delta != null}
                  <span class={readout.delta > 0 ? "text-bad" : "text-good"}>Δ {fmtDelta(readout.delta)}</span>
                {/if}
              </div>
              <div class="grid grid-cols-[60px_repeat(6,1fr)] gap-x-2 gap-y-1 text-right">
                <span></span><span class="text-xs text-muted">Tiempo</span><span class="text-xs text-muted">Vel</span><span class="text-xs text-muted">Mar</span><span class="text-xs text-muted">Acel</span><span class="text-xs text-muted">Fren</span><span class="text-xs text-muted">Dir</span>
                {#each [["A", readout.a, A], ...(readout.b ? [["B", readout.b, B]] : [])] as [label, r, color]}
                  {@const row = r as NonNullable<typeof readout>["a"]}
                  <span class="text-left font-semibold" style:color={color as string}>{label}</span>
                  <span>{lapTime(row.t, 2)}</span>
                  <span>{Math.round(row.speed)}</span>
                  <span>{row.gear}</span>
                  <span class="text-throttle">{Math.round(row.throttle)}%</span>
                  <span class="text-brake">{Math.round(row.brake)}%</span>
                  <span>{Math.round(row.steering)}%</span>
                {/each}
              </div>
            {:else}
              <div class="text-center text-xs text-muted">Pasa el ratón por las gráficas o el mapa para inspeccionar telemetría.</div>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-3 text-sm tnum">
            {#each [[lapA, A, "A"], [lapB, B, "B"]] as [l, color, name]}
              {@const lap = l as LapRecord | null}
              {#if lap}
                <div class="card p-3">
                  <div class="text-xs font-semibold" style:color={color as string}>Vuelta {name}</div>
                  <div class={["font-display text-xl font-semibold", !lap.valid && "text-bad"]}>{lapTime(lap.lapTime)}</div>
                  <div class="text-xs text-muted">{sectorTime(lap.s1)} · {sectorTime(lap.s2)} · {sectorTime(lap.s3)}</div>
                  <div class="text-xs text-muted">Máx. {Math.round(toSpeed(lap.maxSpeed, units))} {speedUnit(units)}</div>
                </div>
              {/if}
            {/each}
            {#if nav.remoteB && traceB}
              {@const r = nav.remoteB}
              <div class="card p-3">
                <div class="truncate text-xs font-semibold" style:color={B}>Vuelta B · {r.label}</div>
                <div class="font-display text-xl font-semibold">{lapTime(r.lapTime)}</div>
                <div class="text-xs text-muted">{sectorTime(r.s1)} · {sectorTime(r.s2)} · {sectorTime(r.s3)}</div>
                <div class="text-xs text-muted">Máx. {Math.round(toSpeed(Math.max(...traceB.speed), units))} {speedUnit(units)}</div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    {#if corners.length}
      <!-- #11 Coaching Summary: Top 3 Corners Where Time Is Lost -->
      {#if topLossCorners.length > 0}
        <div class="mt-6 rounded-xl border border-amber-400/35 bg-amber-950/15 p-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="font-display text-xs font-black tracking-wider text-amber-300 uppercase">🎯 DÓNDE PIERDES MÁS TIEMPO (CURVA A CURVA vs VUELTA B)</span>
            <span class="text-[11px] text-muted">Haz clic en una curva para inspeccionarla</span>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            {#each topLossCorners as tc (tc.n)}
              <button
                type="button"
                class="flex flex-col items-start rounded-lg border border-white/10 bg-black/35 p-2.5 text-left transition hover:border-amber-400 cursor-pointer"
                onclick={() => (cursorIdx = tc.za.start)}
              >
                <div class="flex w-full items-center justify-between">
                  <span class="font-display text-sm font-black text-white">Curva {tc.n}</span>
                  <span class="font-mono text-xs font-black text-bad">+{tc.deltaGain?.toFixed(3)}s</span>
                </div>
                <div class="mt-1 text-[11px] text-amber-200/85">
                  {tc.hint || `Vel. mín ${Math.round(tc.minA)} vs ${Math.round(tc.minB ?? tc.minA)} ${speedUnit(units)}`}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <h2 class="mt-6 mb-2 section-title">Comparador Curva a Curva (Frenada y Aceleración)</h2>
      <div class="overflow-hidden rounded-lg border border-line">
        <table class="w-full text-sm tnum">
          <thead class="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">Curva</th>
              <th class="px-3 py-2 font-medium">Frenada A</th>
              <th class="px-3 py-2 font-medium">Frenada vs B</th>
              <th class="px-3 py-2 font-medium">Aceleración vs B</th>
              <th class="px-3 py-2 font-medium">Vel. mín A / B</th>
              <th class="px-3 py-2 font-medium">Tiempo en zona</th>
            </tr>
          </thead>
          <tbody>
            {#each corners as c (c.n)}
              <tr class="cursor-pointer border-t border-line hover:bg-surface-2" onclick={() => (cursorIdx = c.za.start)}>
                <td class="px-3 py-1.5 font-semibold">C{c.n}</td>
                <td class="px-3 py-1.5">{Math.round(data.d[c.za.start])} m</td>
                <td class="px-3 py-1.5">
                  {#if c.brakeDiff != null}
                    <span class={c.brakeDiff > 0 ? "text-warn" : "text-good"}>
                      {Math.abs(Math.round(c.brakeDiff))} m {c.brakeDiff > 0 ? "antes" : "después"}
                    </span>
                  {:else}–{/if}
                </td>
                <td class="px-3 py-1.5">
                  {#if c.throttleDiff != null}
                    <span class={c.throttleDiff > 0 ? "text-warn" : "text-good"}>
                      {Math.abs(Math.round(c.throttleDiff))} m {c.throttleDiff > 0 ? "más tarde" : "antes"}
                    </span>
                  {:else}–{/if}
                </td>
                <td class="px-3 py-1.5">{Math.round(c.minA)} / {c.minB != null ? Math.round(c.minB) : "–"}</td>
                <td class="px-3 py-1.5">
                  {#if c.deltaGain != null}
                    <span class={c.deltaGain > 0 ? "text-bad" : "text-good"}>{fmtDelta(c.deltaGain)}</span>
                  {:else}–{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
