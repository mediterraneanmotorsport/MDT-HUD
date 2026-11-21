<script lang="ts">
  import { onDestroy } from "svelte";
  import { config, saveConfig, syncActiveProfile } from "../../lib/config.svelte";
  import {
    createDefaultElement,
    createTemplateDashboard,
    DEFAULT_SIM_OVERRIDES,
    ensureDashPages,
    MOTORSPORT_ICONS,
    TELEMETRY_BINDINGS,
    uid,
    type ConditionOp,
    type CustomDashboard,
    type DashColorStop,
    type DashElement,
    type DashElementType,
    type DashTemplateId,
    type SimOverrides,
  } from "../../lib/dashStudio.svelte";
  import { wheelControl } from "../../lib/wheelControl.svelte";
  import CustomDashWidget from "../../overlay/widgets/CustomDashWidget.svelte";
  import MotorsportIcon from "../../overlay/widgets/MotorsportIcon.svelte";

  // Ensure at least one custom dashboard exists and normalize legacy dashboards without pages
  $effect(() => {
    if (!config.value.customDashboards || config.value.customDashboards.length === 0) {
      config.value.customDashboards = [createTemplateDashboard("gt3-pro")];
      saveConfig();
      return;
    }
    let normalized = false;
    for (const d of config.value.customDashboards) {
      if (!d.pages || d.pages.length === 0) {
        ensureDashPages(d);
        normalized = true;
      }
    }
    if (normalized) saveConfig();
  });

  const dashboards = $derived(config.value.customDashboards ?? []);
  let activeDashId = $state("");
  const activeDash = $derived<CustomDashboard | null>(
    dashboards.find((d) => d.id === activeDashId) ?? dashboards[0] ?? null,
  );

  $effect(() => {
    if (activeDash && activeDashId !== activeDash.id) {
      activeDashId = activeDash.id;
      activePageIdx = 0;
      selectedIds = [];
    }
  });

  // Multi-page management (pure $derived — never mutate state inside $derived)
  let activePageIdx = $state(0);
  const pages = $derived.by(() => {
    if (!activeDash) return [];
    if (activeDash.pages && activeDash.pages.length > 0) return activeDash.pages;
    return [{ id: "main", name: "Carrera", elements: activeDash.elements ?? [] }];
  });
  const activePage = $derived(pages[Math.min(activePageIdx, Math.max(0, pages.length - 1))] ?? null);

  function syncPrimaryElements() {
    if (activeDash && pages[0]) {
      activeDash.elements = pages[0].elements;
    }
  }

  function addPage() {
    if (!activeDash) return;
    const list = ensureDashPages(activeDash);
    const next = { id: uid("page"), name: `Página ${list.length + 1}`, elements: [] as DashElement[] };
    activeDash.pages = [...list, next];
    activePageIdx = activeDash.pages.length - 1;
    selectedIds = [];
    saveConfig();
  }

  function deletePage(idx: number) {
    if (!activeDash || pages.length <= 1) return;
    activeDash.pages = pages.filter((_, i) => i !== idx);
    activePageIdx = Math.max(0, Math.min(activePageIdx, activeDash.pages.length - 1));
    selectedIds = [];
    syncPrimaryElements();
    saveConfig();
  }

  // Multi-selection (Shift + Click)
  let selectedIds = $state<string[]>([]);
  const primarySelectedId = $derived(selectedIds[selectedIds.length - 1] ?? null);
  const selectedEl = $derived<DashElement | null>(
    activePage?.elements.find((e) => e.id === primarySelectedId) ?? null,
  );

  let zoom = $state(1);
  let gridSnap = $state(4);
  let showGrid = $state(true);
  let simulateLive = $state(true);
  let showSimPanel = $state(false);
  let simOverrides = $state<SimOverrides>({ ...DEFAULT_SIM_OVERRIDES });
  let previewTick = $state(0);
  let statusMsg = $state("");
  let importInput = $state<HTMLInputElement | null>(null);
  let imgUploadInput = $state<HTMLInputElement | null>(null);
  let bgImgUploadInput = $state<HTMLInputElement | null>(null);
  let copiedStyle = $state<Partial<DashElement> | null>(null);
  let capturingWheelBtn = $state(false);
  let wheelCaptureTimer: ReturnType<typeof setInterval> | undefined;
  let testPopup = $state<{ title: string; value: string; color: string; seq: number } | null>(null);
  let testAnimIdx = 0;
  let testBootSeq = $state(0);

  // Rulers, Grid Duplicate (Matrix), Layer Search & Collapsible Groups
  let showRulers = $state(true);
  let showMatrixPanel = $state(false);
  let matrixCols = $state(4);
  let matrixRows = $state(1);
  let matrixGapX = $state(12);
  let matrixGapY = $state(12);
  let layerSearch = $state("");
  let collapsedGroups = $state<Record<string, boolean>>({});

  function duplicateInMatrix() {
    if (!activePage || !selectedEl) return;
    const cols = Math.max(1, Math.min(8, matrixCols));
    const rows = Math.max(1, Math.min(6, matrixRows));
    if (cols * rows <= 1) return;
    pushUndo();
    const copies: DashElement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c === 0) continue;
        copies.push({
          ...structuredClone($state.snapshot(selectedEl)),
          id: uid(selectedEl.type),
          name: `${selectedEl.name} ${r * cols + c + 1}`,
          x: Math.round(selectedEl.x + c * (selectedEl.w + matrixGapX)),
          y: Math.round(selectedEl.y + r * (selectedEl.h + matrixGapY)),
        });
      }
    }
    activePage.elements = [...activePage.elements, ...copies];
    selectedIds = [selectedEl.id, ...copies.map((c) => c.id)];
    showMatrixPanel = false;
    syncPrimaryElements();
    saveConfig();
    flashStatus(`⊞ Matriz ${cols}×${rows} creada (${copies.length + 1} elem.)`);
  }

  function batchShowAll() {
    if (!activePage) return;
    pushUndo();
    activePage.elements.forEach((e) => (e.visible = true));
    syncPrimaryElements();
    saveConfig();
  }

  function batchUnlockAll() {
    if (!activePage) return;
    pushUndo();
    activePage.elements.forEach((e) => (e.locked = false));
    syncPrimaryElements();
    saveConfig();
  }

  function batchToggleSelectedVisible() {
    if (!activePage || selectedIds.length === 0) return;
    pushUndo();
    const sel = activePage.elements.filter((e) => selectedIds.includes(e.id));
    const anyVisible = sel.some((e) => e.visible);
    sel.forEach((e) => (e.visible = !anyVisible));
    syncPrimaryElements();
    saveConfig();
  }

  function batchToggleSelectedLock() {
    if (!activePage || selectedIds.length === 0) return;
    pushUndo();
    const sel = activePage.elements.filter((e) => selectedIds.includes(e.id));
    const anyUnlocked = sel.some((e) => !e.locked);
    sel.forEach((e) => (e.locked = anyUnlocked));
    syncPrimaryElements();
    saveConfig();
  }

  function renameGroup(gid: string, newName: string) {
    if (!activePage) return;
    for (const el of activePage.elements) {
      if (el.groupId === gid) el.groupName = newName;
    }
    syncPrimaryElements();
    saveConfig();
  }

  const filteredLayerItems = $derived.by(() => {
    if (!activePage) return [] as Array<{ kind: "group"; gid: string; name: string; members: DashElement[] } | { kind: "el"; el: DashElement }>;
    const q = layerSearch.trim().toLowerCase();
    const rev = [...activePage.elements].reverse().filter((e) => {
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || (e.groupName ?? "").toLowerCase().includes(q) || e.type.toLowerCase().includes(q);
    });
    const seenGroups = new Set<string>();
    const out: Array<{ kind: "group"; gid: string; name: string; members: DashElement[] } | { kind: "el"; el: DashElement }> = [];
    let groupCounter = 0;
    for (const el of rev) {
      if (el.groupId) {
        if (seenGroups.has(el.groupId)) continue;
        seenGroups.add(el.groupId);
        groupCounter += 1;
        const members = rev.filter((m) => m.groupId === el.groupId);
        const name = members.find((m) => m.groupName)?.groupName || `Grupo ${groupCounter}`;
        out.push({ kind: "group", gid: el.groupId, name, members });
      } else {
        out.push({ kind: "el", el });
      }
    }
    return out;
  });

  function triggerBootPreview() {
    if (!activeDash) return;
    if (!activeDash.bootAnimation || activeDash.bootAnimation === "none") {
      activeDash.bootAnimation = "ignition-sweep";
      saveConfig();
    }
    testBootSeq += 1;
  }

  function triggerTestAnim() {
    const samples = [
      { title: "TRACTION CONTROL", value: "TC 5", color: "#38bdf8" },
      { title: "BRAKE BIAS", value: "58.5%", color: "#facc15" },
      { title: "ENGINE MAP", value: "MAP 3", color: "#22c55e" },
      { title: "FRONT ARB", value: "F-ARB 4", color: "#60a5fa" },
      { title: "BRAKE MIGRATION", value: "+1.5% F", color: "#f59e0b" },
      { title: "PURPLE LAP!", value: "SESSION BEST", color: "#c084fc" },
      { title: "LOW FUEL WARNING", value: "1.8 LAPS", color: "#ef4444" },
    ];
    const s = samples[testAnimIdx % samples.length];
    testAnimIdx += 1;
    testPopup = { ...s, seq: testAnimIdx };
  }

  function groupSelected() {
    if (!activePage || selectedIds.length < 2) return;
    pushUndo();
    const gid = uid("grp");
    for (const el of activePage.elements) {
      if (selectedIds.includes(el.id)) el.groupId = gid;
    }
    syncPrimaryElements();
    saveConfig();
    flashStatus(`🔗 ${selectedIds.length} elementos agrupados`);
  }

  function ungroupSelected() {
    if (!activePage || selectedIds.length === 0) return;
    pushUndo();
    const gids = new Set(
      activePage.elements.filter((e) => selectedIds.includes(e.id) && e.groupId).map((e) => e.groupId!),
    );
    if (gids.size === 0) return;
    for (const el of activePage.elements) {
      if (el.groupId && gids.has(el.groupId)) delete el.groupId;
    }
    syncPrimaryElements();
    saveConfig();
    flashStatus("✂️ Grupo separado");
  }

  const hasGroupedSelection = $derived(
    Boolean(activePage && activePage.elements.some((e) => selectedIds.includes(e.id) && e.groupId)),
  );

  function copySelectedStyle() {
    if (!selectedEl) return;
    copiedStyle = {
      color: selectedEl.color,
      bgColor: selectedEl.bgColor,
      gradientTo: selectedEl.gradientTo,
      gradientAngle: selectedEl.gradientAngle,
      borderColor: selectedEl.borderColor,
      borderWidth: selectedEl.borderWidth,
      borderStyle: selectedEl.borderStyle,
      borderRadius: selectedEl.borderRadius,
      backdropBlur: selectedEl.backdropBlur,
      glowColor: selectedEl.glowColor,
      glowSize: selectedEl.glowSize,
      shadowColor: selectedEl.shadowColor,
      shadowBlur: selectedEl.shadowBlur,
      clipShape: selectedEl.clipShape,
      skewX: selectedEl.skewX,
      fontFamily: selectedEl.fontFamily,
      fontWeight: selectedEl.fontWeight,
      italic: selectedEl.italic,
      uppercase: selectedEl.uppercase,
      letterSpacing: selectedEl.letterSpacing,
      textShadowColor: selectedEl.textShadowColor,
      textShadowBlur: selectedEl.textShadowBlur,
      fillColor: selectedEl.fillColor,
      trackColor: selectedEl.trackColor,
      opacity: selectedEl.opacity,
    };
    flashStatus("📋 Estilo copiado (Ctrl+Alt+V para pegar)");
  }

  function pasteStyleToSelected() {
    if (!activePage || !copiedStyle || selectedIds.length === 0) return;
    pushUndo();
    for (const el of activePage.elements) {
      if (!selectedIds.includes(el.id)) continue;
      Object.assign(el, copiedStyle);
    }
    syncPrimaryElements();
    saveConfig();
    flashStatus(`🖌️ Estilo pegado en ${selectedIds.length} elem.`);
  }

  function toggleCaptureWheelBtn() {
    if (capturingWheelBtn) {
      capturingWheelBtn = false;
      clearInterval(wheelCaptureTimer);
      return;
    }
    if (!activeDash || typeof navigator === "undefined" || !navigator.getGamepads) {
      flashStatus("⚠️ No se detectó API de volante/gamepad");
      return;
    }
    capturingWheelBtn = true;
    flashStatus("🎮 Pulsa un botón de tu volante...");
    wheelCaptureTimer = setInterval(() => {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (!pad) continue;
        for (let i = 0; i < pad.buttons.length; i++) {
          if (pad.buttons[i]?.pressed) {
            if (activeDash) {
              activeDash.pageCycleGamepadBtn = i;
              saveConfig();
              flashStatus(`✓ Botón de volante #${i + 1} asignado`);
            }
            capturingWheelBtn = false;
            clearInterval(wheelCaptureTimer);
            return;
          }
        }
      }
    }, 60);
  }

  // Studio canvas magnetic snap guides
  let guideX = $state<number | null>(null);
  let guideY = $state<number | null>(null);

  // Undo / Redo stacks
  let undoStack = $state<string[]>([]);
  let redoStack = $state<string[]>([]);

  function pushUndo() {
    if (!activePage) return;
    undoStack = [...undoStack.slice(-29), JSON.stringify(activePage.elements)];
    redoStack = [];
  }

  function undo() {
    if (!activePage || undoStack.length === 0) return;
    redoStack = [...redoStack, JSON.stringify(activePage.elements)];
    const prev = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    activePage.elements = JSON.parse(prev);
    syncPrimaryElements();
    saveConfig();
  }

  function redo() {
    if (!activePage || redoStack.length === 0) return;
    undoStack = [...undoStack, JSON.stringify(activePage.elements)];
    const next = redoStack[redoStack.length - 1];
    redoStack = redoStack.slice(0, -1);
    activePage.elements = JSON.parse(next);
    syncPrimaryElements();
    saveConfig();
  }

  const tickTimer = setInterval(() => {
    if (simulateLive && !simOverrides.enabled && !dragState) previewTick += 1;
  }, 120);
  onDestroy(() => {
    clearInterval(tickTimer);
    clearInterval(wheelCaptureTimer);
  });

  function flashStatus(msg: string) {
    statusMsg = msg;
    setTimeout(() => {
      if (statusMsg === msg) statusMsg = "";
    }, 2800);
  }

  function addTemplate(tpl: DashTemplateId) {
    const d = createTemplateDashboard(tpl);
    config.value.customDashboards = [...dashboards, d];
    activeDashId = d.id;
    activePageIdx = 0;
    selectedIds = [];
    undoStack = [];
    redoStack = [];
    saveConfig();
    flashStatus(`✓ Plantilla "${d.name}" creada`);
  }

  function deleteActiveDash() {
    if (!activeDash || dashboards.length <= 1) return;
    config.value.customDashboards = dashboards.filter((d) => d.id !== activeDash.id);
    activeDashId = config.value.customDashboards[0]?.id ?? "";
    selectedIds = [];
    saveConfig();
    flashStatus("Dashboard eliminado");
  }

  function addElement(type: DashElementType) {
    if (!activeDash || !activePage) return;
    pushUndo();
    const x = Math.round(activeDash.width / 2 - 70);
    const y = Math.round(activeDash.height / 2 - 24);
    const el = createDefaultElement(type, Math.max(8, x), Math.max(8, y));
    activePage.elements = [...activePage.elements, el];
    selectedIds = [el.id];
    syncPrimaryElements();
    saveConfig();
  }

  function duplicateSelected() {
    if (!activePage || selectedIds.length === 0) return;
    pushUndo();
    const copies: DashElement[] = [];
    for (const id of selectedIds) {
      const orig = activePage.elements.find((e) => e.id === id);
      if (!orig) continue;
      copies.push({
        ...structuredClone(orig),
        id: uid(orig.type),
        name: `${orig.name} (copia)`,
        x: orig.x + 14,
        y: orig.y + 14,
      });
    }
    activePage.elements = [...activePage.elements, ...copies];
    selectedIds = copies.map((c) => c.id);
    syncPrimaryElements();
    saveConfig();
  }

  function deleteElements(ids: string[]) {
    if (!activePage || ids.length === 0) return;
    pushUndo();
    const set = new Set(ids);
    activePage.elements = activePage.elements.filter((e) => !set.has(e.id));
    selectedIds = selectedIds.filter((id) => !set.has(id));
    syncPrimaryElements();
    saveConfig();
  }

  function moveLayer(id: string, delta: number) {
    if (!activePage) return;
    const idx = activePage.elements.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= activePage.elements.length) return;
    pushUndo();
    const arr = [...activePage.elements];
    const [item] = arr.splice(idx, 1);
    arr.splice(target, 0, item);
    activePage.elements = arr;
    syncPrimaryElements();
    saveConfig();
  }

  // Alignment & Distribution helpers
  function alignSelected(mode: "left" | "centerH" | "right" | "top" | "centerV" | "bottom" | "canvasCenter" | "distH") {
    if (!activeDash || !activePage || selectedIds.length === 0) return;
    const els = activePage.elements.filter((e) => selectedIds.includes(e.id) && !e.locked);
    if (els.length === 0) return;
    pushUndo();

    if (mode === "canvasCenter") {
      for (const e of els) {
        e.x = Math.round((activeDash.width - e.w) / 2);
        e.y = Math.round((activeDash.height - e.h) / 2);
      }
    } else if (els.length === 1) {
      const e = els[0];
      if (mode === "left") e.x = 12;
      if (mode === "centerH") e.x = Math.round((activeDash.width - e.w) / 2);
      if (mode === "right") e.x = activeDash.width - e.w - 12;
      if (mode === "top") e.y = 12;
      if (mode === "centerV") e.y = Math.round((activeDash.height - e.h) / 2);
      if (mode === "bottom") e.y = activeDash.height - e.h - 12;
    } else {
      const minX = Math.min(...els.map((e) => e.x));
      const maxR = Math.max(...els.map((e) => e.x + e.w));
      const minY = Math.min(...els.map((e) => e.y));
      const maxB = Math.max(...els.map((e) => e.y + e.h));
      const midX = (minX + maxR) / 2;
      const midY = (minY + maxB) / 2;

      if (mode === "left") els.forEach((e) => (e.x = minX));
      if (mode === "right") els.forEach((e) => (e.x = maxR - e.w));
      if (mode === "centerH") els.forEach((e) => (e.x = Math.round(midX - e.w / 2)));
      if (mode === "top") els.forEach((e) => (e.y = minY));
      if (mode === "bottom") els.forEach((e) => (e.y = maxB - e.h));
      if (mode === "centerV") els.forEach((e) => (e.y = Math.round(midY - e.h / 2)));
      if (mode === "distH" && els.length >= 3) {
        const sorted = [...els].sort((a, b) => a.x - b.x);
        const totalW = sorted.reduce((s, e) => s + e.w, 0);
        const span = maxR - minX;
        const gap = (span - totalW) / (sorted.length - 1);
        let cur = minX;
        for (const e of sorted) {
          e.x = Math.round(cur);
          cur += e.w + gap;
        }
      }
    }
    syncPrimaryElements();
    saveConfig();
  }

  function activateInOverlay() {
    if (!activeDash) return;
    const w = config.value.widgets.customdash;
    if (w) {
      w.enabled = true;
      w.options.dashboardId = activeDash.id;
      w.options.pageIndex = activePageIdx;
      syncActiveProfile();
      saveConfig();
      flashStatus(`🚀 "${activeDash.name}" activado en el Overlay PC y OBS`);
    }
  }

  function sendToMobileDdu() {
    if (!activeDash) return;
    const w = config.value.widgets.customdash;
    if (w) {
      w.options.dashboardId = activeDash.id;
      w.options.pageIndex = activePageIdx;
      syncActiveProfile();
      saveConfig();
    }
    wheelControl.activatePage("customdash", $state.snapshot(config.value));
    flashStatus(`📱 "${activeDash.name}" enviado al Móvil / Tablet DDU`);
  }

  function exportDash() {
    if (!activeDash) return;
    const blob = new Blob([JSON.stringify(activeDash, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeDash.name.replace(/[^a-z0-9_-]+/gi, "_")}.mdtdash`;
    a.click();
    URL.revokeObjectURL(url);
    flashStatus("✓ Archivo .mdtdash exportado");
  }

  function handleImportDash(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CustomDashboard;
        if (!parsed || (!Array.isArray(parsed.elements) && !Array.isArray(parsed.pages))) {
          throw new Error("Formato inválido");
        }
        parsed.id = uid("dash");
        ensureDashPages(parsed);
        config.value.customDashboards = [...dashboards, parsed];
        activeDashId = parsed.id;
        activePageIdx = 0;
        selectedIds = [];
        saveConfig();
        flashStatus(`✓ "${parsed.name}" importado`);
      } catch {
        flashStatus("⚠️ Archivo .mdtdash no válido");
      }
    };
    reader.readAsText(file);
    input.value = "";
  }

  function handleElementImageUpload(e: Event) {
    if (!selectedEl) return;
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!selectedEl) return;
      pushUndo();
      selectedEl.imageUrl = String(reader.result);
      saveConfig();
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function handleDashBgImageUpload(e: Event) {
    if (!activeDash) return;
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!activeDash) return;
      activeDash.bgImageUrl = String(reader.result);
      if (activeDash.bgImageOpacity == null) activeDash.bgImageOpacity = 0.35;
      saveConfig();
      flashStatus("✓ Imagen de fondo aplicada");
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  function parseColorAlpha(val: string | undefined, fallbackHex = "#101826"): { hex: string; alpha: number } {
    if (!val || val.trim() === "" || val.trim().toLowerCase() === "transparent") {
      return { hex: fallbackHex, alpha: 0 };
    }
    const v = val.trim();
    const rgbaMatch = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (rgbaMatch) {
      const r = Math.min(255, Number(rgbaMatch[1])).toString(16).padStart(2, "0");
      const g = Math.min(255, Number(rgbaMatch[2])).toString(16).padStart(2, "0");
      const b = Math.min(255, Number(rgbaMatch[3])).toString(16).padStart(2, "0");
      const a = rgbaMatch[4] != null ? Math.max(0, Math.min(1, Number(rgbaMatch[4]))) : 1;
      return { hex: `#${r}${g}${b}`, alpha: a };
    }
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      return { hex: v, alpha: 1 };
    }
    if (/^#[0-9a-f]{8}$/i.test(v)) {
      const a = parseInt(v.slice(7, 9), 16) / 255;
      return { hex: v.slice(0, 7), alpha: Number(a.toFixed(2)) };
    }
    return { hex: fallbackHex, alpha: 1 };
  }

  function buildRgba(hex: string, alpha: number): string {
    const a = Math.max(0, Math.min(1, Number(alpha.toFixed(2))));
    if (a <= 0.005) return "transparent";
    if (a >= 0.995) return hex;
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  const elBg = $derived(parseColorAlpha(selectedEl?.bgColor, "#101826"));
  const elGrad = $derived(parseColorAlpha(selectedEl?.gradientTo, "#1e293b"));
  const elBrd = $derived(parseColorAlpha(selectedEl?.borderColor, "#38bdf8"));
  const dashBg = $derived(parseColorAlpha(activeDash?.bgColor, "#0a0d12"));
  const dashGrad = $derived(parseColorAlpha(activeDash?.bgGradientTo, "#141d2e"));
  const dashBrd = $derived(parseColorAlpha(activeDash?.borderColor, "#334155"));

  function applyDashThemePreset(preset: "carbon" | "porsche" | "ferrari" | "bmw" | "cyber" | "glass" | "transparent") {
    if (!activeDash) return;
    if (preset === "carbon") {
      activeDash.bgColor = "#0a0d12";
      activeDash.bgGradientTo = "#141a24";
      activeDash.bgGradientAngle = 145;
      activeDash.bgPattern = "carbon";
      activeDash.borderColor = "#2287ec";
      activeDash.borderWidth = 2;
      activeDash.borderRadius = 16;
      activeDash.frameShadow = "bezel";
      activeDash.accentGlowColor = "#2287ec";
      activeDash.accentGlowSize = 14;
      activeDash.bgOpacity = 0.96;
    } else if (preset === "porsche") {
      activeDash.bgColor = "#0d0d10";
      activeDash.bgGradientTo = "#1c1c22";
      activeDash.bgGradientAngle = 180;
      activeDash.bgPattern = "brushed";
      activeDash.borderColor = "#e11d48";
      activeDash.borderWidth = 2;
      activeDash.borderRadius = 12;
      activeDash.frameShadow = "bezel";
      activeDash.accentGlowColor = "#e11d48";
      activeDash.accentGlowSize = 10;
      activeDash.bgOpacity = 0.98;
    } else if (preset === "ferrari") {
      activeDash.bgColor = "#140808";
      activeDash.bgGradientTo = "#2b0d0d";
      activeDash.bgGradientAngle = 135;
      activeDash.bgPattern = "carbon";
      activeDash.borderColor = "#facc15";
      activeDash.borderWidth = 2;
      activeDash.borderRadius = 14;
      activeDash.frameShadow = "deep";
      activeDash.accentGlowColor = "#ef4444";
      activeDash.accentGlowSize = 16;
      activeDash.bgOpacity = 0.96;
    } else if (preset === "bmw") {
      activeDash.bgColor = "#080e1a";
      activeDash.bgGradientTo = "#0f1c36";
      activeDash.bgGradientAngle = 120;
      activeDash.bgPattern = "grid";
      activeDash.borderColor = "#38bdf8";
      activeDash.borderWidth = 2;
      activeDash.borderRadius = 14;
      activeDash.frameShadow = "bezel";
      activeDash.accentGlowColor = "#38bdf8";
      activeDash.accentGlowSize = 12;
      activeDash.bgOpacity = 0.95;
    } else if (preset === "cyber") {
      activeDash.bgColor = "#090616";
      activeDash.bgGradientTo = "#190c33";
      activeDash.bgGradientAngle = 135;
      activeDash.bgPattern = "scanlines";
      activeDash.borderColor = "#22d3ee";
      activeDash.borderWidth = 2;
      activeDash.borderRadius = 18;
      activeDash.frameShadow = "deep";
      activeDash.accentGlowColor = "#a855f7";
      activeDash.accentGlowSize = 22;
      activeDash.bgOpacity = 0.92;
    } else if (preset === "glass") {
      activeDash.bgColor = "rgba(11, 17, 27, 0.72)";
      activeDash.bgGradientTo = "";
      activeDash.bgPattern = "none";
      activeDash.borderColor = "rgba(255,255,255,0.22)";
      activeDash.borderWidth = 1;
      activeDash.borderRadius = 20;
      activeDash.frameShadow = "soft";
      activeDash.accentGlowColor = "";
      activeDash.accentGlowSize = 0;
      activeDash.bgOpacity = 1;
    } else if (preset === "transparent") {
      activeDash.bgColor = "transparent";
      activeDash.bgGradientTo = "";
      activeDash.bgPattern = "none";
      activeDash.bgImageUrl = "";
      activeDash.borderColor = "transparent";
      activeDash.borderWidth = 0;
      activeDash.frameShadow = "none";
      activeDash.accentGlowColor = "";
      activeDash.accentGlowSize = 0;
      activeDash.bgOpacity = 1;
    }
    saveConfig();
    flashStatus(`🎨 Tema "${preset.toUpperCase()}" aplicado`);
  }

  function applyElementStylePreset(preset: "glass" | "neon" | "racing" | "carbon" | "clean") {
    if (!selectedEl) return;
    pushUndo();
    if (preset === "glass") {
      selectedEl.bgColor = "rgba(255,255,255,0.07)";
      selectedEl.gradientTo = "";
      selectedEl.borderColor = "rgba(255,255,255,0.22)";
      selectedEl.borderWidth = 1;
      selectedEl.borderStyle = "solid";
      selectedEl.borderRadius = 10;
      selectedEl.backdropBlur = 10;
      selectedEl.clipShape = "none";
      selectedEl.skewX = 0;
      selectedEl.glowSize = 0;
      selectedEl.shadowBlur = 8;
    } else if (preset === "neon") {
      selectedEl.bgColor = "rgba(10,18,34,0.85)";
      selectedEl.gradientTo = "#13294b";
      selectedEl.gradientAngle = 135;
      selectedEl.borderColor = "#22d3ee";
      selectedEl.borderWidth = 2;
      selectedEl.borderStyle = "solid";
      selectedEl.borderRadius = 10;
      selectedEl.glowColor = "#22d3ee";
      selectedEl.glowSize = 10;
      selectedEl.textShadowColor = "#22d3ee";
      selectedEl.textShadowBlur = 8;
      selectedEl.clipShape = "chamfer";
    } else if (preset === "racing") {
      selectedEl.bgColor = "#111622";
      selectedEl.gradientTo = "#1e293b";
      selectedEl.gradientAngle = 110;
      selectedEl.borderColor = "#ef4444";
      selectedEl.borderWidth = 2;
      selectedEl.borderStyle = "solid";
      selectedEl.borderRadius = 4;
      selectedEl.clipShape = "slant-right";
      selectedEl.italic = true;
      selectedEl.uppercase = true;
      selectedEl.fontWeight = 900;
      selectedEl.textShadowColor = "#000000";
      selectedEl.textShadowBlur = 6;
    } else if (preset === "carbon") {
      selectedEl.bgColor = "#0d1017";
      selectedEl.gradientTo = "#1b2130";
      selectedEl.gradientAngle = 180;
      selectedEl.borderColor = "rgba(255,255,255,0.16)";
      selectedEl.borderWidth = 1;
      selectedEl.borderStyle = "solid";
      selectedEl.borderRadius = 8;
      selectedEl.clipShape = "chamfer";
      selectedEl.shadowBlur = 10;
      selectedEl.shadowColor = "#000000";
    } else if (preset === "clean") {
      selectedEl.bgColor = "transparent";
      selectedEl.gradientTo = "";
      selectedEl.borderWidth = 0;
      selectedEl.backdropBlur = 0;
      selectedEl.glowSize = 0;
      selectedEl.shadowBlur = 0;
      selectedEl.clipShape = "none";
      selectedEl.skewX = 0;
    }
    saveConfig();
  }

  // Interactive Canvas Drag (single or multi-select) & Resize + Magnetic Snap Guides
  type DragMode = "move" | "nw" | "ne" | "sw" | "se";
  let dragState: {
    mode: DragMode;
    leadId: string;
    startClientX: number;
    startClientY: number;
    origins: Map<string, { x: number; y: number; w: number; h: number }>;
    pushed: boolean;
  } | null = null;

  function snap(v: number): number {
    return Math.round(v / gridSnap) * gridSnap;
  }

  function startPointer(e: PointerEvent, el: DashElement, mode: DragMode) {
    e.stopPropagation();
    const groupMembers =
      el.groupId && !e.altKey && activePage
        ? activePage.elements.filter((item) => item.groupId === el.groupId).map((item) => item.id)
        : [el.id];

    if (e.shiftKey && mode === "move") {
      if (selectedIds.includes(el.id)) {
        const rm = new Set(groupMembers);
        selectedIds = selectedIds.filter((id) => !rm.has(id));
      } else {
        selectedIds = [...new Set([...selectedIds, ...groupMembers])];
      }
      return;
    } else if (!selectedIds.includes(el.id)) {
      selectedIds = groupMembers;
    }

    if (el.locked || !activePage) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const origins = new Map<string, { x: number; y: number; w: number; h: number }>();
    const idsToMove = mode === "move" ? selectedIds : [el.id];
    for (const id of idsToMove) {
      const target = activePage.elements.find((item) => item.id === id);
      if (target && !target.locked) {
        origins.set(id, { x: target.x, y: target.y, w: target.w, h: target.h });
      }
    }

    dragState = {
      mode,
      leadId: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origins,
      pushed: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragState || !activeDash || !activePage) return;
    const dx = (e.clientX - dragState.startClientX) / zoom;
    const dy = (e.clientY - dragState.startClientY) / zoom;
    if (!dragState.pushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
      pushUndo();
      dragState.pushed = true;
    }

    if (dragState.mode === "move") {
      const leadOrig = dragState.origins.get(dragState.leadId);
      if (!leadOrig) return;
      let targetX = snap(leadOrig.x + dx);
      let targetY = snap(leadOrig.y + dy);

      // Magnetic snap to canvas center & other non-selected elements
      const xTargets = [activeDash.width / 2, 12, activeDash.width - 12];
      const yTargets = [activeDash.height / 2, 12, activeDash.height - 12];
      for (const other of activePage.elements) {
        if (dragState.origins.has(other.id) || !other.visible) continue;
        xTargets.push(other.x, other.x + other.w / 2, other.x + other.w);
        yTargets.push(other.y, other.y + other.h / 2, other.y + other.h);
      }

      const SNAP_T = 6;
      let bestDx = SNAP_T + 1;
      let gx: number | null = null;
      for (const off of [0, leadOrig.w / 2, leadOrig.w]) {
        for (const t of xTargets) {
          const dist = Math.abs(targetX + off - t);
          if (dist < bestDx) {
            bestDx = dist;
            targetX = Math.round(t - off);
            gx = t;
          }
        }
      }

      let bestDy = SNAP_T + 1;
      let gy: number | null = null;
      for (const off of [0, leadOrig.h / 2, leadOrig.h]) {
        for (const t of yTargets) {
          const dist = Math.abs(targetY + off - t);
          if (dist < bestDy) {
            bestDy = dist;
            targetY = Math.round(t - off);
            gy = t;
          }
        }
      }

      guideX = gx;
      guideY = gy;

      const deltaX = targetX - leadOrig.x;
      const deltaY = targetY - leadOrig.y;
      for (const [id, orig] of dragState.origins.entries()) {
        const el = activePage.elements.find((item) => item.id === id);
        if (el) {
          el.x = orig.x + deltaX;
          el.y = orig.y + deltaY;
        }
      }
    } else {
      const el = activePage.elements.find((x) => x.id === dragState!.leadId);
      const orig = dragState.origins.get(dragState.leadId);
      if (!el || !orig) return;
      if (dragState.mode === "se") {
        el.w = Math.max(16, snap(orig.w + dx));
        el.h = Math.max(12, snap(orig.h + dy));
      } else if (dragState.mode === "sw") {
        const nw = Math.max(16, snap(orig.w - dx));
        el.x = orig.x + (orig.w - nw);
        el.w = nw;
        el.h = Math.max(12, snap(orig.h + dy));
      } else if (dragState.mode === "ne") {
        el.w = Math.max(16, snap(orig.w + dx));
        const nh = Math.max(12, snap(orig.h - dy));
        el.y = orig.y + (orig.h - nh);
        el.h = nh;
      } else if (dragState.mode === "nw") {
        const nw = Math.max(16, snap(orig.w - dx));
        const nh = Math.max(12, snap(orig.h - dy));
        el.x = orig.x + (orig.w - nw);
        el.y = orig.y + (orig.h - nh);
        el.w = nw;
        el.h = nh;
      }
    }
  }

  function onPointerUp() {
    if (!dragState) return;
    const changed = dragState.pushed;
    dragState = null;
    guideX = null;
    guideY = null;
    if (changed) {
      syncPrimaryElements();
      saveConfig();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "c" && selectedEl) {
      e.preventDefault();
      copySelectedStyle();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "v" && copiedStyle && selectedIds.length > 0) {
      e.preventDefault();
      pasteStyleToSelected();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
      e.preventDefault();
      if (e.shiftKey) ungroupSelected();
      else groupSelected();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedIds.length > 0) {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (!activePage || selectedIds.length === 0) return;

    const step = e.shiftKey ? 10 : gridSnap;
    const els = activePage.elements.filter((el) => selectedIds.includes(el.id) && !el.locked);
    if (els.length === 0) return;

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteElements(selectedIds);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      els.forEach((el) => (el.x -= step));
      syncPrimaryElements();
      saveConfig();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      els.forEach((el) => (el.x += step));
      syncPrimaryElements();
      saveConfig();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els.forEach((el) => (el.y -= step));
      syncPrimaryElements();
      saveConfig();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els.forEach((el) => (el.y += step));
      syncPrimaryElements();
      saveConfig();
    }
  }

  const BINDING_CATEGORIES = [...new Set(TELEMETRY_BINDINGS.map((b) => b.category))];
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col overflow-hidden">
  <!-- TOP STUDIO TOOLBAR -->
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2 text-xs">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="font-display text-sm font-black tracking-wider text-accent uppercase mr-1">🎨 Dash Studio</span>
      <select class="field py-1 text-xs" bind:value={activeDashId}>
        {#each dashboards as d (d.id)}
          <option value={d.id}>{d.name} ({d.width}×{d.height})</option>
        {/each}
      </select>

      <select
        class="field py-1 text-xs"
        onchange={(e) => {
          const val = e.currentTarget.value as DashTemplateId | "";
          if (val) addTemplate(val);
          e.currentTarget.value = "";
        }}
      >
        <option value="">+ Nueva plantilla...</option>
        <option value="cadillac-vseries">🇺🇸 Cadillac V-Series.R Hypercar</option>
        <option value="toyota-gr010">🇯🇵 Toyota GR010 Gazoo Racing</option>
        <option value="hypercar-endurance">🏎️ Hypercar Endurance Pro (Delta + 2 pág.)</option>
        <option value="aston-vantage-gt3">🟢 Vantage GT3 Circular (7 Diales)</option>
        <option value="bosch-ddu-s2">📟 Bosch DDU S2 Wireframe (RPM 0-8)</option>
        <option value="porsche-963">🏁 Porsche 963 LMDh WEC (2 páginas)</option>
        <option value="ferrari-499p">🐎 Ferrari 499P Hypercar</option>
        <option value="bmw-m4-gt3">🔵 BMW M4 GT3 Motorsport</option>
        <option value="f1-halo">📺 F1 Halo Telemetry Bar (OBS)</option>
        <option value="gt3-pro">🏎️ GT3 Pro Steering Dash</option>
        <option value="hypercar-wec">⚡ Hypercar WEC DDU Pro</option>
        <option value="broadcast-strip">📺 Broadcast TV Strip (OBS)</option>
        <option value="blank">📄 Lienzo en Blanco</option>
      </select>

      {#if dashboards.length > 1}
        <button class="btn px-2 py-1 text-xs text-bad" onclick={deleteActiveDash} title="Eliminar dashboard">🗑️</button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <button class="btn px-2 py-1 text-xs" disabled={undoStack.length === 0} onclick={undo} title="Deshacer (Ctrl+Z)">↶</button>
      <button class="btn px-2 py-1 text-xs" disabled={redoStack.length === 0} onclick={redo} title="Rehacer (Ctrl+Y)">↷</button>

      <select class="field py-1 text-xs" bind:value={zoom} title="Zoom">
        <option value={0.75}>75%</option>
        <option value={1}>100%</option>
        <option value={1.25}>125%</option>
      </select>

      <button
        class={["btn px-2 py-1 text-xs", showSimPanel && "bg-amber-500/20 text-amber-300 border-amber-500/40"]}
        onclick={() => {
          showSimPanel = !showSimPanel;
          simOverrides.enabled = showSimPanel;
        }}
        title="Abrir panel de simulación manual (RPM, pedales, Pit Limiter, banderas)"
      >
        🎛️ Simulador
      </button>

      <button class="btn px-2 py-1 text-xs" onclick={exportDash} title="Exportar .mdtdash">⬇</button>
      <input bind:this={importInput} type="file" accept=".mdtdash,.json" class="hidden" onchange={handleImportDash} />
      <button class="btn px-2 py-1 text-xs" onclick={() => importInput?.click()} title="Importar .mdtdash">⬆</button>

      <button class="btn bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500 hover:text-black px-2.5 py-1 text-xs font-bold" onclick={sendToMobileDdu}>
        📱 Enviar a Móvil
      </button>
      <button class="btn btn-primary px-3 py-1 text-xs font-bold" onclick={activateInOverlay}>
        🚀 Activar en Overlay
      </button>
    </div>
  </div>

  <!-- SECONDARY BAR: MULTI-PAGE TABS + ALIGNMENT TOOLS -->
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs">
    <!-- Pages -->
    <div class="flex flex-wrap items-center gap-1">
      <span class="text-[10px] font-bold text-muted uppercase mr-1">Páginas:</span>
      {#each pages as pg, idx (pg.id)}
        <div class={["flex items-center gap-1 rounded px-2 py-0.5 border", activePageIdx === idx ? "bg-accent/25 border-accent text-white font-bold" : "bg-surface-2 border-line text-muted hover:text-fg"]}>
          <button
            type="button"
            class="cursor-pointer"
            onclick={() => {
              activePageIdx = idx;
              selectedIds = [];
              if (activeDash && config.value.widgets.customdash?.options?.dashboardId === activeDash.id) {
                config.value.widgets.customdash.options.pageIndex = idx;
                saveConfig();
              }
            }}
          >
            {pg.name}
          </button>
          {#if pages.length > 1}
            <button type="button" class="text-[10px] text-bad hover:opacity-100 opacity-60 cursor-pointer" onclick={() => deletePage(idx)}>✕</button>
          {/if}
        </div>
      {/each}
      <button type="button" class="btn px-2 py-0.5 text-[11px]" onclick={addPage}>+ Página</button>
    </div>

    <!-- Alignment & Distribution -->
    <div class="flex flex-wrap items-center gap-1">
      <span class="text-[10px] text-muted mr-1">
        {selectedIds.length > 1 ? `${selectedIds.length} sel.` : "Alinear:"}
      </span>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("left")} title="Alinear izquierda">⫷</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("centerH")} title="Centrar horizontal">⫼</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("right")} title="Alinear derecha">⫸</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("top")} title="Alinear arriba">⫯</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("centerV")} title="Centrar vertical">⫰</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("bottom")} title="Alinear abajo">⫱</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length === 0} onclick={() => alignSelected("canvasCenter")} title="Centrar en lienzo">🎯</button>
      <button class="btn px-1.5 py-0.5 text-[10px]" disabled={selectedIds.length < 3} onclick={() => alignSelected("distH")} title="Distribuir horizontalmente (3+ elem.)">⬌</button>
      <div class="mx-1 h-4 w-px bg-line"></div>
      <button class="btn px-2 py-0.5 text-[10px]" disabled={selectedIds.length < 2} onclick={groupSelected} title="Agrupar selección (Ctrl+G)">🔗 Agrupar</button>
      {#if hasGroupedSelection}
        <button class="btn px-2 py-0.5 text-[10px]" onclick={ungroupSelected} title="Desagrupar (Ctrl+Shift+G)">✂️ Soltar</button>
      {/if}
      <button class="btn px-2 py-0.5 text-[10px]" disabled={!selectedEl} onclick={copySelectedStyle} title="Copiar estilo visual (Ctrl+Alt+C)">📋 Estilo</button>
      <button class="btn px-2 py-0.5 text-[10px]" disabled={!copiedStyle || selectedIds.length === 0} onclick={pasteStyleToSelected} title="Pegar estilo visual (Ctrl+Alt+V)">🖌️ Pegar</button>
      <button class={["btn px-2 py-0.5 text-[10px]", showMatrixPanel && "btn-primary"]} disabled={!selectedEl} onclick={() => (showMatrixPanel = !showMatrixPanel)} title="Duplicar elemento en matriz (filas × columnas)">⊞ Matriz</button>
      <button class={["btn px-2 py-0.5 text-[10px]", showRulers && "btn-primary"]} onclick={() => (showRulers = !showRulers)} title="Mostrar/ocultar reglas de precisión">📏 Reglas</button>
    </div>
  </div>

  <!-- GRID DUPLICATE (MATRIX) BAR -->
  {#if showMatrixPanel && selectedEl}
    <div class="flex flex-wrap items-center gap-3 border-b border-cyan-500/30 bg-cyan-950/25 px-4 py-1.5 text-[11px]">
      <span class="font-display font-black text-cyan-300 uppercase">⊞ Duplicar en Matriz ({selectedEl.name}):</span>
      <label class="flex items-center gap-1">
        <span class="text-muted">Cols</span>
        <input type="number" min="1" max="8" bind:value={matrixCols} class="field w-12 py-0.5 text-center text-xs" />
      </label>
      <label class="flex items-center gap-1">
        <span class="text-muted">Filas</span>
        <input type="number" min="1" max="6" bind:value={matrixRows} class="field w-12 py-0.5 text-center text-xs" />
      </label>
      <label class="flex items-center gap-1">
        <span class="text-muted">Gap X</span>
        <input type="number" min="-50" max="200" bind:value={matrixGapX} class="field w-14 py-0.5 text-center text-xs" />
      </label>
      <label class="flex items-center gap-1">
        <span class="text-muted">Gap Y</span>
        <input type="number" min="-50" max="200" bind:value={matrixGapY} class="field w-14 py-0.5 text-center text-xs" />
      </label>
      <button type="button" class="btn btn-primary px-3 py-0.5 text-[11px]" onclick={duplicateInMatrix}>✓ Generar {matrixCols}×{matrixRows}</button>
      <button type="button" class="btn px-2 py-0.5 text-[11px]" onclick={() => (showMatrixPanel = false)}>✕</button>
    </div>
  {/if}

  <!-- INTERACTIVE MANUAL SIMULATOR PANEL -->
  {#if showSimPanel}
    <div class="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-950/25 px-4 py-2 text-[11px]">
      <span class="font-display font-black text-amber-300 uppercase">🎛️ Simulación Manual:</span>
      <label class="flex items-center gap-1.5">
        <span class="text-muted">RPM</span>
        <input type="range" min="0" max="100" bind:value={simOverrides.rpmPct} class="w-20 accent-amber-400" />
        <span class="w-7 font-mono">{simOverrides.rpmPct}%</span>
      </label>
      <label class="flex items-center gap-1.5">
        <span class="text-muted">Vel</span>
        <input type="range" min="0" max="340" bind:value={simOverrides.speed} class="w-20 accent-cyan-400" />
        <span class="w-8 font-mono">{simOverrides.speed}</span>
      </label>
      <label class="flex items-center gap-1.5">
        <span class="text-muted">Marcha</span>
        <input type="number" min="-1" max="8" bind:value={simOverrides.gear} class="field w-12 py-0.5 text-center text-xs" />
      </label>
      <label class="flex items-center gap-1.5">
        <span class="text-emerald-400">Gas</span>
        <input type="range" min="0" max="100" bind:value={simOverrides.throttlePct} class="w-16 accent-emerald-400" />
      </label>
      <label class="flex items-center gap-1.5">
        <span class="text-rose-400">Freno</span>
        <input type="range" min="0" max="100" bind:value={simOverrides.brakePct} class="w-16 accent-rose-400" />
      </label>
      <label class="flex items-center gap-1.5">
        <span class="text-muted">Delta</span>
        <input type="range" min="-2" max="2" step="0.05" bind:value={simOverrides.deltaBest} class="w-16 accent-accent" />
        <span class="w-10 font-mono">{simOverrides.deltaBest.toFixed(2)}</span>
      </label>
      <div class="flex items-center gap-1.5">
        <button class={["btn px-2 py-0.5 text-[10px]", simOverrides.speedLimiter && "bg-amber-400 text-black font-black"]} onclick={() => (simOverrides.speedLimiter = !simOverrides.speedLimiter)}>PIT LIM</button>
        <button class={["btn px-2 py-0.5 text-[10px]", simOverrides.tcActive && "bg-amber-500 text-black font-black"]} onclick={() => (simOverrides.tcActive = !simOverrides.tcActive)}>TC</button>
        <button class={["btn px-2 py-0.5 text-[10px]", simOverrides.absActive && "bg-red-500 text-white font-black"]} onclick={() => (simOverrides.absActive = !simOverrides.absActive)}>ABS</button>
        <button class={["btn px-2 py-0.5 text-[10px]", simOverrides.yellowFlag && "bg-yellow-400 text-black font-black"]} onclick={() => (simOverrides.yellowFlag = !simOverrides.yellowFlag)}>FCY</button>
      </div>
    </div>
  {/if}

  {#if statusMsg}
    <div class="bg-accent/20 border-b border-accent/40 px-4 py-1 text-center text-xs font-bold text-accent">
      {statusMsg}
    </div>
  {/if}

  <!-- 3-COLUMN STUDIO WORKSPACE -->
  <div class="grid min-h-0 flex-1 grid-cols-[235px_1fr_315px]">
    <!-- LEFT: TOOLBOX & LAYERS -->
    <div class="flex min-h-0 flex-col border-r border-line bg-surface p-2.5 text-xs">
      <div class="mb-1.5 font-display text-[11px] font-black tracking-wider text-muted uppercase">Complementos Pro (18)</div>
      <div class="grid grid-cols-2 gap-1 pb-2.5 border-b border-line">
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("text")}>🔤 Texto</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("bar")}>▬ Barra</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("leds")}>🚥 RPM / LEDs</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("delta")}>⚡ Barra Delta</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("icon")}>💡 Icono SVG</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("radial")}>◔ Circular</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("needle")}>⏲ Aguja</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("trace")}>📈 Pedales</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("tyreblock")}>🛞 Neumáticos</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("minimap")}>🗺️ Mapa</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("gmeter")}>🧭 G-Meter</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("steering")}>🎡 Volante</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("relatives")}>📊 Relatives</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("sectors")}>⏱️ Sectores</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("indicator")}>🚨 Piloto</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("miniradar")}>📡 Radar</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("rect")}>▢ Panel</button>
        <button class="btn justify-start px-2 py-1 text-[11px]" onclick={() => addElement("image")}>🖼️ Imagen</button>
      </div>

      <div class="mt-2 mb-1 flex items-center justify-between gap-1">
        <span class="font-display text-[11px] font-black tracking-wider text-muted uppercase">
          Capas ({activePage?.elements.length ?? 0})
        </span>
        <div class="flex items-center gap-1">
          {#if selectedIds.length > 0}
            <button type="button" class="rounded bg-white/10 px-1 py-0.5 text-[9px] hover:bg-white/20" title="Ocultar/Mostrar selección" onclick={batchToggleSelectedVisible}>👁</button>
            <button type="button" class="rounded bg-white/10 px-1 py-0.5 text-[9px] hover:bg-white/20" title="Bloquear/Desbloquear selección" onclick={batchToggleSelectedLock}>🔒</button>
            <button class="text-[10px] text-accent hover:underline ml-0.5" onclick={() => (selectedIds = [])}>Lienzo</button>
          {:else}
            <button type="button" class="text-[9px] text-muted hover:text-white" title="Mostrar todas las capas" onclick={batchShowAll}>👁 Todas</button>
            <button type="button" class="text-[9px] text-muted hover:text-white" title="Desbloquear todas las capas" onclick={batchUnlockAll}>🔓</button>
          {/if}
        </div>
      </div>

      <input
        type="text"
        class="field mb-1.5 py-0.5! text-[10px]!"
        placeholder="🔍 Buscar capa o grupo..."
        bind:value={layerSearch}
      />

      <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {#if activePage}
          {#each filteredLayerItems as item (item.kind === "group" ? item.gid : item.el.id)}
            {#if item.kind === "group"}
              {@const isCol = Boolean(collapsedGroups[item.gid])}
              {@const grpIds = item.members.map((m) => m.id)}
              {@const allSel = grpIds.every((id) => selectedIds.includes(id))}
              <div class="rounded border border-cyan-500/30 bg-cyan-950/20">
                <div class={["flex items-center gap-1 px-1.5 py-1", allSel && "bg-cyan-500/25"]}>
                  <button
                    type="button"
                    class="text-[10px] text-cyan-300 cursor-pointer"
                    onclick={() => (collapsedGroups[item.gid] = !isCol)}
                  >{isCol ? "▸" : "▾"}</button>
                  <input
                    type="text"
                    class="min-w-0 flex-1 bg-transparent text-[10px] font-bold text-cyan-200 outline-none focus:bg-black/40 rounded px-0.5"
                    value={item.name}
                    oninput={(e) => renameGroup(item.gid, e.currentTarget.value)}
                    onclick={(e) => {
                      e.stopPropagation();
                      selectedIds = grpIds;
                    }}
                  />
                  <span class="text-[9px] text-muted">{item.members.length}</span>
                  <button
                    type="button"
                    class="text-[10px] opacity-70 hover:opacity-100"
                    title="Ocultar/Mostrar grupo"
                    onclick={() => {
                      const anyVis = item.members.some((m) => m.visible);
                      item.members.forEach((m) => (m.visible = !anyVis));
                      saveConfig();
                    }}
                  >{item.members.some((m) => m.visible) ? "👁" : "🚫"}</button>
                  <button
                    type="button"
                    class="text-[10px] opacity-70 hover:opacity-100"
                    title="Bloquear/Desbloquear grupo"
                    onclick={() => {
                      const anyUnl = item.members.some((m) => !m.locked);
                      item.members.forEach((m) => (m.locked = anyUnl));
                      saveConfig();
                    }}
                  >{item.members.every((m) => m.locked) ? "🔒" : "🔓"}</button>
                </div>
                {#if !isCol}
                  <div class="flex flex-col gap-0.5 border-t border-cyan-500/20 p-1">
                    {#each item.members as el (el.id)}
                      {@const isSel = selectedIds.includes(el.id)}
                      <div
                        class={[
                          "flex items-center gap-1 rounded px-1.5 py-1 cursor-pointer transition-colors",
                          isSel ? "bg-accent/25 ring-1 ring-accent text-white font-bold" : "bg-surface-2/60 hover:bg-surface-3 text-fg",
                        ]}
                        onclick={(e) => {
                          if (e.shiftKey) selectedIds = isSel ? selectedIds.filter((id) => id !== el.id) : [...selectedIds, el.id];
                          else selectedIds = [el.id];
                        }}
                        role="button"
                        tabindex="0"
                        onkeydown={(e) => e.key === "Enter" && (selectedIds = [el.id])}
                      >
                        <span class="min-w-0 flex-1 truncate text-[10px]">{el.name}</span>
                        <button type="button" class="opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); el.visible = !el.visible; saveConfig(); }}>{el.visible ? "👁" : "🚫"}</button>
                        <button type="button" class="opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); el.locked = !el.locked; saveConfig(); }}>{el.locked ? "🔒" : "🔓"}</button>
                        <button type="button" class="text-bad opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); deleteElements([el.id]); }}>✕</button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              {@const el = item.el}
              {@const isSel = selectedIds.includes(el.id)}
              <div
                class={[
                  "flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer transition-colors",
                  isSel ? "bg-accent/25 ring-1 ring-accent text-white font-bold" : "bg-surface-2/60 hover:bg-surface-3 text-fg",
                ]}
                onclick={(e) => {
                  if (e.shiftKey) {
                    selectedIds = isSel ? selectedIds.filter((id) => id !== el.id) : [...selectedIds, el.id];
                  } else {
                    selectedIds = [el.id];
                  }
                }}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && (selectedIds = [el.id])}
              >
                <span class="min-w-0 flex-1 truncate text-[11px]">{el.name}</span>
                <button type="button" class="opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); el.visible = !el.visible; saveConfig(); }}>
                  {el.visible ? "👁" : "🚫"}
                </button>
                <button type="button" class="opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); el.locked = !el.locked; saveConfig(); }}>
                  {el.locked ? "🔒" : "🔓"}
                </button>
                <button type="button" class="opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); moveLayer(el.id, 1); }}>↑</button>
                <button type="button" class="opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); moveLayer(el.id, -1); }}>↓</button>
                <button type="button" class="text-bad opacity-70 hover:opacity-100" onclick={(e) => { e.stopPropagation(); deleteElements([el.id]); }}>✕</button>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>

    <!-- CENTER: INTERACTIVE VISUAL CANVAS -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#030711] p-8"
      style={showGrid
        ? "background-image: radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px); background-size: 20px 20px;"
        : ""}
      onclick={() => (selectedIds = [])}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
    >
      {#if activeDash && activePage}
        <div
          class="relative origin-center shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
          style:transform="scale({zoom})"
          style:width="{activeDash.width}px"
          style:height="{activeDash.height}px"
          style:background-image="linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.05) 75%)"
          style:background-size="16px 16px"
          style:background-position="0 0, 0 8px, 8px -8px, -8px 0px"
          style:border-radius="{activeDash.borderRadius}px"
          onclick={(e) => e.stopPropagation()}
        >
          {#if showRulers}
            <!-- Top Precision Ruler -->
            <div class="pointer-events-none absolute -top-5 left-0 right-0 h-4 border-b border-white/20 bg-black/70 font-mono text-[8px] text-white/55">
              {#each Array(Math.floor(activeDash.width / 50) + 1) as _, ri}
                <div class="absolute bottom-0 flex flex-col items-start" style:left="{ri * 50}px">
                  <span class="pl-0.5 leading-none">{ri % 2 === 0 ? ri * 50 : ""}</span>
                  <div class={["w-px bg-white/40", ri % 2 === 0 ? "h-2" : "h-1"]}></div>
                </div>
              {/each}
            </div>
            <!-- Left Precision Ruler -->
            <div class="pointer-events-none absolute top-0 bottom-0 -left-6 w-5 border-r border-white/20 bg-black/70 font-mono text-[8px] text-white/55">
              {#each Array(Math.floor(activeDash.height / 50) + 1) as _, ri}
                <div class="absolute right-0 flex items-center" style:top="{ri * 50}px">
                  <span class="pr-0.5 leading-none">{ri % 2 === 0 ? ri * 50 : ""}</span>
                  <div class={["h-px bg-white/40", ri % 2 === 0 ? "w-2" : "w-1"]}></div>
                </div>
              {/each}
            </div>
          {/if}

          <CustomDashWidget
            dashboardOverride={activeDash}
            pageIndexOverride={activePageIdx}
            units={config.value.general.units}
            edit={true}
            {previewTick}
            {simOverrides}
            {testPopup}
            {testBootSeq}
          />

          <!-- Studio Magnetic Snap Guides -->
          {#if guideX != null}
            <div class="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-cyan-400 shadow-[0_0_8px_#22d3ee]" style:left="{guideX}px"></div>
          {/if}
          {#if guideY != null}
            <div class="pointer-events-none absolute left-0 right-0 z-30 h-px bg-cyan-400 shadow-[0_0_8px_#22d3ee]" style:top="{guideY}px"></div>
          {/if}

          <!-- Interactive Selection / Drag / Resize Overlay -->
          {#each activePage.elements as el (el.id)}
            {#if el.visible}
              {@const isSel = selectedIds.includes(el.id)}
              <div
                class={[
                  "absolute box-border transition-colors",
                  el.locked ? "cursor-not-allowed" : "cursor-move",
                  isSel
                    ? "border-2 border-cyan-400 bg-cyan-400/10 z-20"
                    : "border border-transparent hover:border-white/35 z-10",
                ]}
                style:left="{el.x}px"
                style:top="{el.y}px"
                style:width="{el.w}px"
                style:height="{el.h}px"
                onpointerdown={(e) => startPointer(e, el, "move")}
              >
                {#if isSel && !el.locked && selectedIds.length === 1}
                  <div class="pointer-events-none absolute -top-5 left-0 rounded bg-cyan-500 px-1.5 py-0.2 font-mono text-[9px] font-black text-black whitespace-nowrap">
                    {el.name} ({Math.round(el.x)}, {Math.round(el.y)} · {Math.round(el.w)}×{Math.round(el.h)})
                  </div>
                  <div class="absolute -top-1.5 -left-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-white border border-cyan-600" onpointerdown={(e) => startPointer(e, el, "nw")}></div>
                  <div class="absolute -top-1.5 -right-1.5 h-3 w-3 cursor-nesw-resize rounded-sm bg-white border border-cyan-600" onpointerdown={(e) => startPointer(e, el, "ne")}></div>
                  <div class="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize rounded-sm bg-white border border-cyan-600" onpointerdown={(e) => startPointer(e, el, "sw")}></div>
                  <div class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-white border border-cyan-600" onpointerdown={(e) => startPointer(e, el, "se")}></div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <!-- RIGHT: PROPERTY INSPECTOR -->
    <div class="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-3 text-xs">
      {#if selectedEl}
        <div class="flex items-center justify-between border-b border-line pb-2">
          <span class="font-display text-xs font-black tracking-wider text-accent uppercase">Propiedades: {selectedEl.type}</span>
          <div class="flex gap-1">
            <button class="btn px-2 py-0.5 text-[10px]" onclick={duplicateSelected}>Duplicar</button>
            <button class="btn px-2 py-0.5 text-[10px] text-bad" onclick={() => deleteElements(selectedIds)}>Eliminar</button>
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] font-bold text-muted uppercase">Nombre de capa</span>
          <input class="field py-1 text-xs" bind:value={selectedEl.name} oninput={saveConfig} />
        </label>

        <!-- Geometry + Rotation -->
        <div class="grid grid-cols-4 gap-1.5">
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">X</span>
            <input type="number" class="field py-1 text-xs" bind:value={selectedEl.x} oninput={saveConfig} />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Y</span>
            <input type="number" class="field py-1 text-xs" bind:value={selectedEl.y} oninput={saveConfig} />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Ancho</span>
            <input type="number" class="field py-1 text-xs" bind:value={selectedEl.w} oninput={saveConfig} />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Alto</span>
            <input type="number" class="field py-1 text-xs" bind:value={selectedEl.h} oninput={saveConfig} />
          </label>
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Rotación ({selectedEl.rotation ?? 0}°)</span>
            <input type="range" min="-180" max="180" step="1" value={selectedEl.rotation ?? 0} oninput={(e) => { selectedEl.rotation = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Opacidad ({Math.round(selectedEl.opacity * 100)}%)</span>
            <input type="range" min="0.1" max="1" step="0.05" bind:value={selectedEl.opacity} oninput={saveConfig} class="accent-accent" />
          </label>
        </div>

        <!-- Telemetry Data Binding & Custom Formula -->
        {#if !["rect", "image", "trace", "delta", "tyreblock", "minimap", "miniradar", "gmeter", "steering", "relatives", "sectors"].includes(selectedEl.type)}
          <label class="flex flex-col gap-1 border-t border-line pt-2.5">
            <span class="text-[10px] font-bold text-accent uppercase">📡 Dato de Telemetría</span>
            <select class="field py-1 text-xs" bind:value={selectedEl.binding} onchange={saveConfig}>
              {#each BINDING_CATEGORIES as cat}
                <optgroup label={cat}>
                  {#each TELEMETRY_BINDINGS.filter((b) => b.category === cat) as b (b.id)}
                    <option value={b.id}>{b.label}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[10px] font-bold text-muted uppercase">🧮 Fórmula personalizada (opcional)</span>
            <input
              class="field py-1 font-mono text-[11px]"
              placeholder="Ej: fuel / 2.8  o  rpmPct * 0.9"
              bind:value={selectedEl.customFormula}
              oninput={saveConfig}
            />
          </label>
        {/if}

        <!-- Text Options -->
        {#if selectedEl.type === "text"}
          {#if !selectedEl.customFormula && (!selectedEl.binding || selectedEl.binding === "none")}
            <label class="flex flex-col gap-1">
              <span class="text-[10px] text-muted uppercase">Texto fijo</span>
              <input class="field py-1 text-xs" bind:value={selectedEl.staticText} oninput={saveConfig} />
            </label>
          {:else}
            <div class="grid grid-cols-3 gap-1.5">
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted uppercase">Prefijo</span>
                <input class="field py-1 text-xs" bind:value={selectedEl.prefix} oninput={saveConfig} />
              </label>
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted uppercase">Sufijo</span>
                <input class="field py-1 text-xs" bind:value={selectedEl.suffix} oninput={saveConfig} />
              </label>
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted uppercase">Decimales</span>
                <input type="number" min="0" max="3" class="field py-1 text-xs" bind:value={selectedEl.decimals} oninput={saveConfig} />
              </label>
            </div>
          {/if}

          <div class="grid grid-cols-3 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Tamaño px</span>
              <input type="number" min="8" max="200" class="field py-1 text-xs" bind:value={selectedEl.fontSize} oninput={saveConfig} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Fuente</span>
              <select class="field py-1 text-xs" bind:value={selectedEl.fontFamily} onchange={saveConfig}>
                <option value="display">Display</option>
                <option value="mono">Mono</option>
                <option value="sans">Sans</option>
                <option value="digital">Digital LED</option>
                <option value="f1">F1 Racing</option>
                <option value="retro">LCD Retro</option>
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Alinear</span>
              <select class="field py-1 text-xs" bind:value={selectedEl.textAlign} onchange={saveConfig}>
                <option value="left">Izq</option>
                <option value="center">Centro</option>
                <option value="right">Der</option>
              </select>
            </label>
          </div>

          <div class="grid grid-cols-3 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Peso</span>
              <select class="field py-1 text-xs" bind:value={selectedEl.fontWeight} onchange={saveConfig}>
                <option value={400}>Normal</option>
                <option value={600}>SemiBold</option>
                <option value={700}>Bold</option>
                <option value={900}>Black</option>
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Espaciado</span>
              <input type="number" min="-2" max="14" class="field py-1 text-xs" value={selectedEl.letterSpacing ?? 0} oninput={(e) => { selectedEl.letterSpacing = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
            <div class="flex items-end gap-1">
              <button
                type="button"
                class={["btn flex-1 py-1 text-[10px] font-bold italic", selectedEl.italic && "btn-primary"]}
                title="Cursiva"
                onclick={() => { selectedEl.italic = !selectedEl.italic; saveConfig(); }}
              >I</button>
              <button
                type="button"
                class={["btn flex-1 py-1 text-[10px] font-bold", selectedEl.uppercase && "btn-primary"]}
                title="Mayúsculas"
                onclick={() => { selectedEl.uppercase = !selectedEl.uppercase; saveConfig(); }}
              >AA</button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Color texto</span>
              <input type="color" bind:value={selectedEl.color} oninput={saveConfig} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Sombra txt</span>
              <div class="flex items-center gap-1">
                <input type="color" value={selectedEl.textShadowColor || "#000000"} oninput={(e) => { selectedEl.textShadowColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-5 cursor-pointer bg-transparent" />
                <input type="number" min="0" max="24" class="w-9 bg-transparent text-right font-mono text-[10px]" value={selectedEl.textShadowBlur ?? 0} oninput={(e) => { selectedEl.textShadowBlur = Number(e.currentTarget.value); saveConfig(); }} />
              </div>
            </label>
          </div>
        {/if}

        <!-- Bar / Radial / Needle Options -->
        {#if selectedEl.type === "bar" || selectedEl.type === "radial" || selectedEl.type === "needle"}
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Mínimo</span>
              <input type="number" class="field py-1 text-xs" bind:value={selectedEl.min} oninput={saveConfig} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Máximo</span>
              <input type="number" class="field py-1 text-xs" bind:value={selectedEl.max} oninput={saveConfig} />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Color</span>
              <input type="color" bind:value={selectedEl.fillColor} oninput={saveConfig} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
            {#if selectedEl.type === "bar"}
              <select class="field py-1 text-xs" bind:value={selectedEl.orientation} onchange={saveConfig}>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            {:else if selectedEl.type === "needle"}
              <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
                <span class="text-[10px] text-muted">Roja %</span>
                <input type="number" min="50" max="100" class="w-12 bg-transparent text-right font-mono" bind:value={selectedEl.needleRedlinePct} oninput={saveConfig} />
              </label>
            {:else}
              <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
                <span class="text-[10px] text-muted">Grosor</span>
                <input type="number" min="3" max="24" class="w-12 bg-transparent text-right font-mono" bind:value={selectedEl.strokeWidth} oninput={saveConfig} />
              </label>
            {/if}
          </div>
          {#if selectedEl.type === "bar"}
            <div class="grid grid-cols-2 gap-1.5">
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted uppercase">Segmentos (0=lisa)</span>
                <input type="number" min="0" max="40" class="field py-1 text-xs" value={selectedEl.segments ?? 0} oninput={(e) => { selectedEl.segments = Number(e.currentTarget.value); saveConfig(); }} />
              </label>
              <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1 mt-3">
                <span class="text-[10px] text-muted">Pista</span>
                <input type="color" value={selectedEl.trackColor?.startsWith("#") ? selectedEl.trackColor : "#263042"} oninput={(e) => { selectedEl.trackColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-7 cursor-pointer bg-transparent" />
              </label>
            </div>
          {/if}
        {/if}

        <!-- Trace Colors -->
        {#if selectedEl.type === "trace"}
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Acelerador</span>
              <input type="color" value={selectedEl.fillColor || "#22c55e"} oninput={(e) => { selectedEl.fillColor = e.currentTarget.value; saveConfig(); }} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Freno</span>
              <input type="color" value={selectedEl.trackColor || "#ef4444"} oninput={(e) => { selectedEl.trackColor = e.currentTarget.value; saveConfig(); }} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
          </div>
        {/if}

        <!-- Tyreblock Options -->
        {#if selectedEl.type === "tyreblock"}
          <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/60 p-2">
            <span class="text-[10px] font-bold text-accent uppercase">🛞 Datos de Neumáticos</span>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedEl.showCompound ?? true} onchange={(e) => { selectedEl.showCompound = e.currentTarget.checked; saveConfig(); }} class="accent-accent" />
              <span>Mostrar compuesto (S / M / H / W)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedEl.showTyreWear ?? true} onchange={(e) => { selectedEl.showTyreWear = e.currentTarget.checked; saveConfig(); }} class="accent-accent" />
              <span>Mostrar desgaste (%)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedEl.showBrakeTemp ?? true} onchange={(e) => { selectedEl.showBrakeTemp = e.currentTarget.checked; saveConfig(); }} class="accent-accent" />
              <span>Mostrar temp. discos de freno</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedEl.showTyrePress ?? false} onchange={(e) => { selectedEl.showTyrePress = e.currentTarget.checked; saveConfig(); }} class="accent-accent" />
              <span>Mostrar presión (kPa / PSI)</span>
            </label>
          </div>
        {/if}

        <!-- Track Map Options -->
        {#if selectedEl.type === "minimap"}
          <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/60 p-2">
            <span class="text-[10px] font-bold text-accent uppercase">🗺️ Opciones del Mapa</span>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedEl.showClassColors ?? true} onchange={(e) => { selectedEl.showClassColors = e.currentTarget.checked; saveConfig(); }} class="accent-accent" />
              <span>Colores de puntos por categoría</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedEl.showTrackFrame ?? false} onchange={(e) => { selectedEl.showTrackFrame = e.currentTarget.checked; saveConfig(); }} class="accent-accent" />
              <span>Mostrar marco interior del mapa</span>
            </label>
          </div>
        {/if}

        <!-- G-Meter Options -->
        {#if selectedEl.type === "gmeter"}
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Escala máx. (G)</span>
              <input type="number" min="1" max="6" step="0.5" class="field py-1 text-xs" value={selectedEl.gMax ?? 3} oninput={(e) => { selectedEl.gMax = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1 mt-3">
              <span class="text-[10px] text-muted">Color punto</span>
              <input type="color" value={selectedEl.fillColor || "#22d3ee"} oninput={(e) => { selectedEl.fillColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-7 cursor-pointer bg-transparent" />
            </label>
          </div>
        {/if}

        <!-- Steering Wheel Options -->
        {#if selectedEl.type === "steering"}
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Marca centro</span>
              <input type="color" value={selectedEl.fillColor || "#facc15"} oninput={(e) => { selectedEl.fillColor = e.currentTarget.value; saveConfig(); }} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Texto grados</span>
              <input type="color" value={selectedEl.color || "#ffffff"} oninput={(e) => { selectedEl.color = e.currentTarget.value; saveConfig(); }} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
          </div>
        {/if}

        <!-- Relatives Options -->
        {#if selectedEl.type === "relatives"}
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Coches delante / detrás ({selectedEl.relativesCount ?? 2})</span>
            <input type="range" min="1" max="4" step="1" value={selectedEl.relativesCount ?? 2} oninput={(e) => { selectedEl.relativesCount = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
          </label>
        {/if}

        <!-- LED Strip / RPM Bar Options -->
        {#if selectedEl.type === "leds"}
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] font-bold text-accent uppercase">Estilo Barra RPM / LEDs</span>
            <select
              class="field py-1 text-xs"
              value={selectedEl.ledMode ?? "standard"}
              onchange={(e) => {
                selectedEl.ledMode = e.currentTarget.value as any;
                saveConfig();
              }}
            >
              <option value="standard">LEDs Estándar (Izq → Der)</option>
              <option value="convergent">LEDs Convergentes (→ Centro ←)</option>
              <option value="dual-bar">Doble Barra Convergente (→ Centro ←)</option>
              <option value="classic-bar">Barra Clásica con Escala (0..8)</option>
            </select>
          </label>
          {#if selectedEl.ledMode === "classic-bar"}
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Escala máxima (ej. 8 = 8.000 RPM)</span>
              <input type="number" min="4" max="16" class="field py-1 text-xs" value={selectedEl.rpmScaleMax ?? 8} oninput={(e) => { selectedEl.rpmScaleMax = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
          {:else if selectedEl.ledMode !== "dual-bar"}
            <div class="grid grid-cols-2 gap-1.5">
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted uppercase">Nº de LEDs</span>
                <input type="number" min="4" max="30" class="field py-1 text-xs" bind:value={selectedEl.ledCount} oninput={saveConfig} />
              </label>
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted uppercase">Forma</span>
                <select class="field py-1 text-xs" bind:value={selectedEl.ledShape} onchange={saveConfig}>
                  <option value="circle">Círculos</option>
                  <option value="bar">Barras</option>
                </select>
              </label>
            </div>
          {/if}
          <div class="grid grid-cols-3 gap-1.5">
            <label class="flex flex-col items-center rounded border border-line bg-surface-2 p-1">
              <span class="text-[9px] text-muted">Bajas</span>
              <input type="color" bind:value={selectedEl.ledGreenColor} oninput={saveConfig} class="h-5 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex flex-col items-center rounded border border-line bg-surface-2 p-1">
              <span class="text-[9px] text-muted">Medias</span>
              <input type="color" bind:value={selectedEl.ledYellowColor} oninput={saveConfig} class="h-5 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex flex-col items-center rounded border border-line bg-surface-2 p-1">
              <span class="text-[9px] text-muted">Altas</span>
              <input type="color" bind:value={selectedEl.ledRedColor} oninput={saveConfig} class="h-5 w-8 cursor-pointer bg-transparent" />
            </label>
          </div>
        {/if}

        <!-- Delta Bar Options -->
        {#if selectedEl.type === "delta"}
          <div class="grid grid-cols-2 gap-1.5 rounded border border-line bg-surface-2/60 p-2">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Estilo Delta</span>
              <select class="field py-1 text-[11px]" value={selectedEl.deltaStyle ?? "hypercar-bar"} onchange={(e) => { selectedEl.deltaStyle = e.currentTarget.value as any; saveConfig(); }}>
                <option value="hypercar-bar">Hypercar Escala</option>
                <option value="split-bar">Barra Centro ±</option>
                <option value="compact">Caja Compacta</option>
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Rango (± seg)</span>
              <input type="number" min="0.5" max="5" step="0.5" class="field py-1 text-xs" value={selectedEl.deltaRange ?? 2.0} oninput={(e) => { selectedEl.deltaRange = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
          </div>
        {/if}

        <!-- Motorsport SVG Icon Library -->
        {#if selectedEl.type === "icon"}
          <div class="flex flex-col gap-2 rounded border border-line bg-surface-2/60 p-2">
            <span class="text-[10px] font-bold text-accent uppercase">💡 Biblioteca de Iconos Motorsport</span>
            <div class="grid grid-cols-5 gap-1">
              {#each MOTORSPORT_ICONS as ic (ic.id)}
                <button
                  type="button"
                  title={ic.label}
                  class={[
                    "flex flex-col items-center justify-center gap-0.5 rounded border p-1.5 transition-colors cursor-pointer",
                    selectedEl.iconId === ic.id
                      ? "border-accent bg-accent/25 text-white"
                      : "border-white/10 bg-black/40 text-muted hover:border-white/30 hover:text-white",
                  ]}
                  onclick={() => {
                    selectedEl.iconId = ic.id;
                    selectedEl.binding = ic.defaultBinding;
                    selectedEl.activeTextColor = ic.activeColor;
                    selectedEl.name = `Icono ${ic.label}`;
                    saveConfig();
                  }}
                >
                  <MotorsportIcon id={ic.id} color={selectedEl.iconId === ic.id ? ic.activeColor : "currentColor"} size="18px" />
                  <span class="text-[8px] truncate w-full text-center">{ic.label}</span>
                </button>
              {/each}
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
                <span class="text-[9px] text-muted">Color ON</span>
                <input type="color" value={selectedEl.activeTextColor || "#38bdf8"} oninput={(e) => { selectedEl.activeTextColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-7 cursor-pointer bg-transparent" />
              </label>
              <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
                <span class="text-[9px] text-muted">Color OFF</span>
                <input type="color" value={parseColorAlpha(selectedEl.color, "#475569").hex} oninput={(e) => { selectedEl.color = buildRgba(e.currentTarget.value, 0.35); saveConfig(); }} class="h-5 w-7 cursor-pointer bg-transparent" />
              </label>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={selectedEl.activeBlink} onchange={saveConfig} class="accent-accent" />
              <span class="text-[10px]">Parpadear cuando esté activo</span>
            </label>
          </div>
        {/if}

        <!-- Indicator Options -->
        {#if selectedEl.type === "indicator"}
          <label class="flex flex-col gap-1">
            <span class="text-[10px] text-muted uppercase">Etiqueta</span>
            <input class="field py-1 text-xs" bind:value={selectedEl.staticText} oninput={saveConfig} />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Fondo ON</span>
              <input type="color" bind:value={selectedEl.activeBgColor} oninput={saveConfig} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Texto ON</span>
              <input type="color" bind:value={selectedEl.activeTextColor} oninput={saveConfig} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={selectedEl.activeBlink} onchange={saveConfig} class="accent-accent" />
            <span>Parpadear cuando esté activo</span>
          </label>
        {/if}

        <!-- Rect Options -->
        {#if selectedEl.type === "rect"}
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Fondo</span>
              <input type="color" bind:value={selectedEl.bgColor} oninput={saveConfig} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[10px] text-muted">Borde</span>
              <input type="color" bind:value={selectedEl.borderColor} oninput={saveConfig} class="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Grosor borde</span>
              <input type="number" min="0" max="8" class="field py-1 text-xs" bind:value={selectedEl.borderWidth} oninput={saveConfig} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Radio px</span>
              <input type="number" min="0" max="50" class="field py-1 text-xs" bind:value={selectedEl.borderRadius} oninput={saveConfig} />
            </label>
          </div>
        {/if}

        <!-- Image Upload -->
        {#if selectedEl.type === "image"}
          <input bind:this={imgUploadInput} type="file" accept="image/*" class="hidden" onchange={handleElementImageUpload} />
          <div class="flex gap-2">
            <button class="btn btn-primary flex-1 py-1.5 text-xs" onclick={() => imgUploadInput?.click()}>📁 Subir PNG/SVG</button>
            <button class="btn py-1.5 text-xs" onclick={() => { selectedEl.imageUrl = "/mdt-logo.png"; saveConfig(); }}>Logo MDT</button>
          </div>
        {/if}

        <!-- Advanced Visual Styling: Presets, Shape, Box, Borders, Gradient, Blur, Glow & Shadow -->
        <div class="border-t border-line pt-2.5 flex flex-col gap-2">
          <span class="text-[10px] font-bold text-accent uppercase">🎨 Estética, Forma y Efectos</span>

          <!-- 1-Click Element Style Presets -->
          <div class="flex flex-wrap gap-1">
            {#each [
              { id: "glass", label: "Cristal" },
              { id: "neon", label: "Neón" },
              { id: "racing", label: "Racing F1" },
              { id: "carbon", label: "Carbono" },
              { id: "clean", label: "Sin caja" },
            ] as p}
              <button
                type="button"
                class="btn px-2 py-0.5 text-[10px]"
                onclick={() => applyElementStylePreset(p.id as any)}
              >{p.label}</button>
            {/each}
          </div>

          <!-- Racing Shape / Skew -->
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Forma / Recorte</span>
              <select class="field py-1 text-[11px]" value={selectedEl.clipShape ?? "none"} onchange={(e) => { selectedEl.clipShape = e.currentTarget.value as any; saveConfig(); }}>
                <option value="none">Rectángulo</option>
                <option value="chamfer">Biselado 45°</option>
                <option value="slant-right">Inclinado F1 →</option>
                <option value="slant-left">Inclinado ←</option>
                <option value="chevron">Flecha / Aero</option>
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Inclinación ({selectedEl.skewX ?? 0}°)</span>
              <input type="range" min="-20" max="20" step="1" value={selectedEl.skewX ?? 0} oninput={(e) => { selectedEl.skewX = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent mt-1.5" />
            </label>
          </div>

          <!-- Background & Gradient (with full Alpha Transparency & Transparent stops) -->
          <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/60 p-2">
            <div class="flex items-center justify-between gap-1.5">
              <span class="text-[9px] font-bold text-muted uppercase">Fondo ({Math.round(elBg.alpha * 100)}%)</span>
              <div class="flex items-center gap-1">
                <input
                  type="color"
                  value={elBg.hex}
                  oninput={(e) => {
                    selectedEl.bgColor = buildRgba(e.currentTarget.value, elBg.alpha > 0 ? elBg.alpha : 1);
                    saveConfig();
                  }}
                  class="h-5 w-6 cursor-pointer bg-transparent"
                />
                <button
                  type="button"
                  class={["rounded px-1.5 py-0.5 text-[9px] font-bold border", selectedEl.bgColor === "transparent" ? "border-cyan-400 bg-cyan-500/25 text-cyan-200" : "border-white/15 bg-black/40 text-muted hover:text-white"]}
                  title="Poner fondo totalmente transparente (compatible con degradados)"
                  onclick={() => {
                    selectedEl.bgColor = "transparent";
                    saveConfig();
                  }}
                >Transp.</button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={elBg.alpha}
              oninput={(e) => {
                selectedEl.bgColor = buildRgba(elBg.hex, Number(e.currentTarget.value));
                saveConfig();
              }}
              class="accent-accent"
            />

            <div class="mt-1 flex items-center justify-between gap-1.5 border-t border-white/10 pt-1.5">
              <span class="text-[9px] font-bold text-muted uppercase">
                Degradado {selectedEl.gradientTo ? `(${Math.round(elGrad.alpha * 100)}%)` : "(OFF)"}
              </span>
              <div class="flex items-center gap-1">
                <input
                  type="color"
                  value={elGrad.hex}
                  oninput={(e) => {
                    selectedEl.gradientTo = buildRgba(e.currentTarget.value, selectedEl.gradientTo && elGrad.alpha > 0 ? elGrad.alpha : 1);
                    saveConfig();
                  }}
                  class="h-5 w-6 cursor-pointer bg-transparent"
                />
                <button
                  type="button"
                  class={["rounded px-1.5 py-0.5 text-[9px] font-bold border", selectedEl.gradientTo === "transparent" ? "border-cyan-400 bg-cyan-500/25 text-cyan-200" : "border-white/15 bg-black/40 text-muted hover:text-white"]}
                  title="Degradar hacia transparente (ej. Color → Transparente)"
                  onclick={() => {
                    selectedEl.gradientTo = "transparent";
                    saveConfig();
                  }}
                >Transp.</button>
                {#if selectedEl.gradientTo}
                  <button
                    type="button"
                    class="rounded bg-black/40 px-1 py-0.5 text-[9px] text-red-400 hover:text-red-300"
                    title="Desactivar degradado"
                    onclick={() => {
                      selectedEl.gradientTo = "";
                      saveConfig();
                    }}
                  >✕</button>
                {/if}
              </div>
            </div>
            {#if selectedEl.gradientTo}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={elGrad.alpha}
                oninput={(e) => {
                  selectedEl.gradientTo = buildRgba(elGrad.hex, Number(e.currentTarget.value));
                  saveConfig();
                }}
                class="accent-accent"
              />
              <label class="flex flex-col gap-0.5">
                <span class="text-[9px] text-muted">Ángulo degradado ({selectedEl.gradientAngle ?? 135}°)</span>
                <input type="range" min="0" max="360" step="5" value={selectedEl.gradientAngle ?? 135} oninput={(e) => { selectedEl.gradientAngle = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
              </label>
            {/if}
          </div>

          <!-- Border & Radius (works on any element) -->
          <div class="grid grid-cols-3 gap-1.5">
            <div class="flex items-center justify-between rounded border border-line bg-surface-2 px-1.5 py-1">
              <span class="text-[9px] text-muted">Borde</span>
              <div class="flex items-center gap-0.5">
                <input type="color" value={elBrd.hex} oninput={(e) => { selectedEl.borderColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-5 cursor-pointer bg-transparent" />
                <button
                  type="button"
                  class="rounded bg-black/40 px-1 text-[9px] text-muted hover:text-white"
                  title="Borde transparente"
                  onclick={() => { selectedEl.borderColor = "transparent"; saveConfig(); }}
                >∅</button>
              </div>
            </div>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Grosor</span>
              <input type="number" min="0" max="8" class="field py-0.5 text-xs" value={selectedEl.borderWidth ?? 0} oninput={(e) => { selectedEl.borderWidth = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Radio</span>
              <input type="number" min="0" max="50" class="field py-0.5 text-xs" value={selectedEl.borderRadius ?? 6} oninput={(e) => { selectedEl.borderRadius = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Estilo borde</span>
              <select class="field py-0.5 text-[11px]" value={selectedEl.borderStyle ?? "solid"} onchange={(e) => { selectedEl.borderStyle = e.currentTarget.value as any; saveConfig(); }}>
                <option value="solid">Sólido</option>
                <option value="dashed">Discontinuo</option>
                <option value="dotted">Puntos</option>
                <option value="double">Doble</option>
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Blur cristal (px)</span>
              <input type="number" min="0" max="24" class="field py-0.5 text-xs" value={selectedEl.backdropBlur ?? 0} oninput={(e) => { selectedEl.backdropBlur = Number(e.currentTarget.value); saveConfig(); }} />
            </label>
          </div>

          <!-- 3D Depth Styles & Element Animation -->
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">🧊 Estilo 3D</span>
              <select class="field py-1 text-[11px]" value={selectedEl.style3d ?? "none"} onchange={(e) => { selectedEl.style3d = e.currentTarget.value as any; saveConfig(); }}>
                <option value="none">Plano (2D)</option>
                <option value="emboss">Relieve Emboss 3D</option>
                <option value="bevel">Bisel Botón 3D</option>
                <option value="extrude">Bloque Extruido 3D</option>
                <option value="glass3d">Cristal 3D Reflejo</option>
              </select>
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">✨ Animación</span>
              <select class="field py-1 text-[11px]" value={selectedEl.animEffect ?? "none"} onchange={(e) => { selectedEl.animEffect = e.currentTarget.value as any; saveConfig(); }}>
                <option value="none">Ninguna</option>
                <option value="gear-pop">Pop al cambiar marcha</option>
                <option value="breathe">Respiración suave</option>
                <option value="neon-pulse">Pulso Neón</option>
              </select>
            </label>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Giro 3D X ({selectedEl.rotateX ?? 0}°)</span>
              <input type="range" min="-45" max="45" step="1" value={selectedEl.rotateX ?? 0} oninput={(e) => { selectedEl.rotateX = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Giro 3D Y ({selectedEl.rotateY ?? 0}°)</span>
              <input type="range" min="-45" max="45" step="1" value={selectedEl.rotateY ?? 0} oninput={(e) => { selectedEl.rotateY = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
            </label>
          </div>

          <!-- Glow & Drop Shadow -->
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[9px] text-muted">Neón</span>
              <div class="flex items-center gap-1">
                <input type="color" value={selectedEl.glowColor || "#2287ec"} oninput={(e) => { selectedEl.glowColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-5 cursor-pointer bg-transparent" />
                <input type="number" min="0" max="30" class="w-9 bg-transparent text-right font-mono text-[10px]" value={selectedEl.glowSize ?? 0} oninput={(e) => { selectedEl.glowSize = Number(e.currentTarget.value); saveConfig(); }} />
              </div>
            </label>
            <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
              <span class="text-[9px] text-muted">Sombra</span>
              <div class="flex items-center gap-1">
                <input type="color" value={selectedEl.shadowColor || "#000000"} oninput={(e) => { selectedEl.shadowColor = e.currentTarget.value; saveConfig(); }} class="h-5 w-5 cursor-pointer bg-transparent" />
                <input type="number" min="0" max="30" class="w-9 bg-transparent text-right font-mono text-[10px]" value={selectedEl.shadowBlur ?? 0} oninput={(e) => { selectedEl.shadowBlur = Number(e.currentTarget.value); saveConfig(); }} />
              </div>
            </label>
          </div>
        </div>

        <!-- Conditional Multi-Stop Traffic-Light Color Rule -->
        {#if selectedEl.type === "text" || selectedEl.type === "bar" || selectedEl.type === "radial" || selectedEl.type === "needle" || selectedEl.type === "icon"}
          <div class="border-t border-line pt-2.5 flex flex-col gap-2">
            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-[10px] font-bold text-amber-300 uppercase">🚦 Color condicional (Semáforo)</span>
              <input
                type="checkbox"
                checked={Boolean(selectedEl.colorRule?.enabled)}
                onchange={(e) => {
                  const defaultStops: DashColorStop[] = selectedEl.colorRule?.stops?.length
                    ? selectedEl.colorRule.stops
                    : [
                        { threshold: 90, color: "#ef4444", blink: true },
                        { threshold: 70, color: "#f59e0b", blink: false },
                        { threshold: 0, color: "#22c55e", blink: false },
                      ];
                  selectedEl.colorRule = {
                    enabled: e.currentTarget.checked,
                    binding: selectedEl.colorRule?.binding || selectedEl.binding || "rpmPct",
                    stops: defaultStops,
                  };
                  saveConfig();
                }}
                class="accent-accent"
              />
            </label>
            {#if selectedEl.colorRule?.enabled}
              <div class="flex flex-col gap-2 rounded bg-surface-2/60 p-2">
                <!-- 1-click multi-stop presets -->
                <div class="flex flex-wrap gap-1">
                  {#each [
                    { label: "🛞 Gomas", stops: [{ threshold: 110, color: "#ef4444", blink: true }, { threshold: 98, color: "#f59e0b", blink: false }, { threshold: 65, color: "#22c55e", blink: false }, { threshold: 0, color: "#38bdf8", blink: false }] },
                    { label: "🔥 Frenos", stops: [{ threshold: 750, color: "#ef4444", blink: true }, { threshold: 550, color: "#f59e0b", blink: false }, { threshold: 300, color: "#22c55e", blink: false }, { threshold: 0, color: "#38bdf8", blink: false }] },
                    { label: "⛽ Fuel%", stops: [{ threshold: 45, color: "#22c55e", blink: false }, { threshold: 18, color: "#facc15", blink: false }, { threshold: 0, color: "#ef4444", blink: true }] },
                    { label: "⚡ RPM%", stops: [{ threshold: 94, color: "#ef4444", blink: true }, { threshold: 82, color: "#facc15", blink: false }, { threshold: 0, color: "#22c55e", blink: false }] },
                  ] as preset}
                    <button
                      type="button"
                      class="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] text-muted hover:border-amber-400 hover:text-white"
                      onclick={() => {
                        if (!selectedEl.colorRule) return;
                        selectedEl.colorRule.stops = preset.stops.map((s) => ({ ...s }));
                        saveConfig();
                      }}
                    >{preset.label}</button>
                  {/each}
                </div>

                <!-- Editable stops list -->
                {#if selectedEl.colorRule.stops && selectedEl.colorRule.stops.length > 0}
                  <div class="flex flex-col gap-1">
                    {#each selectedEl.colorRule.stops as stop, si (si)}
                      <div class="flex items-center gap-1 rounded bg-black/35 px-1.5 py-1">
                        <span class="text-[9px] text-muted">≥</span>
                        <input
                          type="number"
                          step="0.1"
                          class="field w-14 py-0.5! text-[10px]! font-mono"
                          bind:value={stop.threshold}
                          oninput={saveConfig}
                        />
                        <input
                          type="color"
                          bind:value={stop.color}
                          oninput={saveConfig}
                          class="h-5 w-7 cursor-pointer bg-transparent"
                        />
                        <button
                          type="button"
                          title="Parpadear en este tramo"
                          class={["rounded px-1 py-0.5 text-[9px]", stop.blink ? "bg-amber-400 text-black font-black" : "bg-white/10 text-muted"]}
                          onclick={() => {
                            stop.blink = !stop.blink;
                            saveConfig();
                          }}
                        >⚡</button>
                        <button
                          type="button"
                          title="Quitar tramo"
                          class="ml-auto text-[10px] text-red-400 hover:text-red-300"
                          onclick={() => {
                            if (!selectedEl.colorRule?.stops) return;
                            selectedEl.colorRule.stops = selectedEl.colorRule.stops.filter((_, idx) => idx !== si);
                            saveConfig();
                          }}
                        >✕</button>
                      </div>
                    {/each}
                  </div>
                {/if}

                <button
                  type="button"
                  class="btn py-0.5 text-[10px]"
                  onclick={() => {
                    if (!selectedEl.colorRule) return;
                    const list = selectedEl.colorRule.stops ?? [];
                    selectedEl.colorRule.stops = [...list, { threshold: 50, color: "#38bdf8", blink: false }];
                    saveConfig();
                  }}
                >
                  + Añadir tramo de color
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Conditional Visibility Rule -->
        <div class="border-t border-line pt-2.5 flex flex-col gap-2">
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-[10px] font-bold text-cyan-300 uppercase">👁️ Visibilidad condicional</span>
            <input
              type="checkbox"
              checked={Boolean(selectedEl.visibilityRule?.enabled)}
              onchange={(e) => {
                selectedEl.visibilityRule = {
                  enabled: e.currentTarget.checked,
                  binding: selectedEl.visibilityRule?.binding || "speedLimiter",
                  op: (selectedEl.visibilityRule?.op ?? "==") as ConditionOp,
                  value: selectedEl.visibilityRule?.value ?? 1,
                };
                saveConfig();
              }}
              class="accent-accent"
            />
          </label>
          {#if selectedEl.visibilityRule?.enabled}
            <div class="flex flex-col gap-1.5 rounded bg-surface-2/60 p-2">
              <select class="field py-1 text-[11px]" bind:value={selectedEl.visibilityRule.binding} onchange={saveConfig}>
                {#each TELEMETRY_BINDINGS.filter((b) => b.id !== "none") as b (b.id)}
                  <option value={b.id}>{b.label}</option>
                {/each}
              </select>
              <div class="grid grid-cols-2 gap-1.5">
                <select class="field py-1 text-xs" bind:value={selectedEl.visibilityRule.op} onchange={saveConfig}>
                  <option value="==">Igual (==)</option>
                  <option value="!=">Distinto (!=)</option>
                  <option value=">">Mayor (&gt;)</option>
                  <option value=">=">Mayor/Igual (&gt;=)</option>
                  <option value="<">Menor (&lt;)</option>
                  <option value="<=">Menor/Igual (&lt;=)</option>
                </select>
                <input type="number" step="0.1" class="field py-1 text-xs" bind:value={selectedEl.visibilityRule.value} oninput={saveConfig} />
              </div>
            </div>
          {/if}
        </div>
      {:else if activeDash && activePage}
        <!-- DASHBOARD CANVAS PROPERTIES -->
        <div class="border-b border-line pb-2 font-display text-xs font-black tracking-wider text-accent uppercase">
          Propiedades del Lienzo
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] font-bold text-muted uppercase">Nombre del Dashboard</span>
          <input class="field py-1 text-xs" bind:value={activeDash.name} oninput={saveConfig} />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] font-bold text-muted uppercase">Nombre de Página Activa</span>
          <input class="field py-1 text-xs" bind:value={activePage.name} oninput={saveConfig} />
        </label>

        <!-- Dashboard Animations & Pop-ups -->
        <div class="flex flex-col gap-2 rounded border border-line bg-surface-2/60 p-2.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-amber-300 uppercase">✨ Animaciones del Dashboard</span>
            <div class="flex gap-1">
              <button type="button" class="btn bg-amber-500/20! border-amber-400/50! text-amber-200! px-2 py-0.5 text-[10px] font-bold" onclick={triggerTestAnim} title="Probar pop-up">
                ⚡ Pop-up
              </button>
              <button type="button" class="btn bg-cyan-500/20! border-cyan-400/50! text-cyan-200! px-2 py-0.5 text-[10px] font-bold" onclick={triggerBootPreview} title="Probar animación de arranque">
                🚀 Arranque
              </button>
            </div>
          </div>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Animación de Arranque / Ignición (LEDs + Botones)</span>
            <select
              class="field py-1 text-[11px]"
              value={activeDash.bootAnimation ?? "none"}
              onchange={(e) => {
                activeDash.bootAnimation = e.currentTarget.value as any;
                saveConfig();
                if (activeDash.bootAnimation !== "none") triggerBootPreview();
              }}
            >
              <option value="none">Desactivada</option>
              <option value="ignition-sweep">Chequeo Ignición (Barrido LEDs + Botones)</option>
              <option value="cascade">Cascada Escalonada (Pop secuencial)</option>
              <option value="cyber-scan">Escáner Láser Telemetría</option>
              <option value="matrix-build">Ensamblaje 3D Cockpit</option>
              <option value="gt3-boot">GT3 System Check + Encendido</option>
            </select>
          </label>
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-[11px] text-fg">Pop-ups (TC, TCS, TCC, ABS, BB, Mig, Mapa, ARB, Fuel, PB)</span>
            <input
              type="checkbox"
              checked={activeDash.autoPopups ?? true}
              onchange={(e) => {
                activeDash.autoPopups = e.currentTarget.checked;
                saveConfig();
              }}
              class="accent-accent shrink-0 ml-2"
            />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Estilo de animación Pop-up</span>
            <select
              class="field py-1 text-[11px]"
              value={activeDash.popupAnimation ?? "zoom"}
              onchange={(e) => {
                activeDash.popupAnimation = e.currentTarget.value as any;
                saveConfig();
              }}
            >
              <option value="zoom">Zoom Motorsport</option>
              <option value="slide-up">Deslizar hacia arriba</option>
              <option value="flip3d">Giro 3D (Flip)</option>
              <option value="glitch">Glitch Racing</option>
              <option value="banner">Banner superior</option>
            </select>
          </label>
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-[11px] text-fg">Destello rojo al corte RPM (Shift Flash)</span>
            <input
              type="checkbox"
              checked={activeDash.shiftFlashEnabled ?? true}
              onchange={(e) => {
                activeDash.shiftFlashEnabled = e.currentTarget.checked;
                saveConfig();
              }}
              class="accent-accent"
            />
          </label>
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-[11px] text-fg">Efecto Pop al cambiar de marcha</span>
            <input
              type="checkbox"
              checked={activeDash.gearAnimEnabled ?? true}
              onchange={(e) => {
                activeDash.gearAnimEnabled = e.currentTarget.checked;
                saveConfig();
              }}
              class="accent-accent"
            />
          </label>
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-[11px] text-fg">LEDs laterales de alerta (Spotter / Banderas / Corte)</span>
            <input
              type="checkbox"
              checked={activeDash.sideLedsEnabled ?? false}
              onchange={(e) => {
                activeDash.sideLedsEnabled = e.currentTarget.checked;
                saveConfig();
              }}
              class="accent-accent"
            />
          </label>
        </div>

        <!-- 3D Cockpit Perspective -->
        <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/50 p-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-purple-300 uppercase">🧊 Perspectiva 3D Cockpit</span>
            {#if (activeDash.tiltX ?? 0) !== 0 || (activeDash.tiltY ?? 0) !== 0}
              <button type="button" class="text-[9px] text-accent hover:underline" onclick={() => { activeDash.tiltX = 0; activeDash.tiltY = 0; saveConfig(); }}>Reset 3D</button>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Inclinación X ({activeDash.tiltX ?? 0}°)</span>
              <input type="range" min="-25" max="25" step="1" value={activeDash.tiltX ?? 0} oninput={(e) => { activeDash.tiltX = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
            </label>
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Inclinación Y ({activeDash.tiltY ?? 0}°)</span>
              <input type="range" min="-25" max="25" step="1" value={activeDash.tiltY ?? 0} oninput={(e) => { activeDash.tiltY = Number(e.currentTarget.value); saveConfig(); }} class="accent-accent" />
            </label>
          </div>
        </div>

        <!-- Auto-Switch by Car / Class -->
        <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/50 p-2">
          <span class="text-[10px] font-bold text-emerald-300 uppercase">🏎️ Auto-Switch por coche / clase</span>
          <input
            class="field py-1 text-[11px]"
            placeholder="Ej: 963, Porsche  o  GT3, Ferrari"
            value={activeDash.autoCarMatch ?? ""}
            oninput={(e) => {
              activeDash.autoCarMatch = e.currentTarget.value;
              saveConfig();
            }}
          />
          <div class="flex flex-wrap gap-1">
            {#each ["Hypercar", "LMP2", "LMGT3", "963", "499P", "M4"] as tag}
              <button
                type="button"
                class="rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-muted hover:bg-accent/25 hover:text-white"
                onclick={() => {
                  const cur = (activeDash.autoCarMatch ?? "").trim();
                  activeDash.autoCarMatch = cur ? `${cur}, ${tag}` : tag;
                  saveConfig();
                }}
              >+{tag}</button>
            {/each}
          </div>
        </div>

        <!-- Page Cycle Key / Wheel Button -->
        <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/50 p-2">
          <span class="text-[10px] font-bold text-cyan-300 uppercase">🎮 Cambiar página en pista</span>
          <div class="grid grid-cols-2 gap-1.5">
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Tecla (ej. PageDown)</span>
              <input
                class="field py-1 font-mono text-[11px]"
                placeholder="PageDown"
                value={activeDash.pageCycleKey ?? ""}
                onkeydown={(e) => {
                  e.preventDefault();
                  if (e.key === "Backspace" || e.key === "Escape") {
                    activeDash.pageCycleKey = "";
                  } else {
                    activeDash.pageCycleKey = e.key;
                  }
                  saveConfig();
                }}
              />
            </label>
            <div class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Botón Volante</span>
              <div class="flex gap-1">
                <button
                  type="button"
                  class={["btn flex-1 py-1 text-[10px]", capturingWheelBtn && "bg-amber-400! text-black! font-black"]}
                  onclick={toggleCaptureWheelBtn}
                >
                  {capturingWheelBtn
                    ? "Pulsa..."
                    : activeDash.pageCycleGamepadBtn != null
                      ? `Btn #${activeDash.pageCycleGamepadBtn + 1}`
                      : "Asignar"}
                </button>
                {#if activeDash.pageCycleGamepadBtn != null}
                  <button
                    type="button"
                    class="btn px-1.5 py-1 text-[10px] text-red-400"
                    title="Quitar botón"
                    onclick={() => {
                      activeDash.pageCycleGamepadBtn = null;
                      saveConfig();
                    }}
                  >✕</button>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Ancho (px)</span>
            <input type="number" min="160" max="1920" class="field py-1 text-xs" bind:value={activeDash.width} oninput={saveConfig} />
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Alto (px)</span>
            <input type="number" min="60" max="1080" class="field py-1 text-xs" bind:value={activeDash.height} oninput={saveConfig} />
          </label>
        </div>

        <div class="flex flex-wrap gap-1">
          {#each [
            { label: "640×320", w: 640, h: 320 },
            { label: "800×480 DDU", w: 800, h: 480 },
            { label: "760×130 Halo", w: 760, h: 130 },
            { label: "480×272 Vocore", w: 480, h: 272 },
          ] as pre}
            <button
              class="btn px-2 py-0.5 text-[10px]"
              onclick={() => {
                activeDash.width = pre.w;
                activeDash.height = pre.h;
                saveConfig();
              }}
            >
              {pre.label}
            </button>
          {/each}
        </div>

        <!-- 1-Click Aesthetic Canvas Themes -->
        <div class="border-t border-line pt-2.5 flex flex-col gap-1.5">
          <span class="text-[10px] font-bold text-accent uppercase">🎨 Temas estéticos (1 clic)</span>
          <div class="grid grid-cols-3 gap-1">
            {#each [
              { id: "carbon", label: "Carbono" },
              { id: "porsche", label: "Porsche" },
              { id: "ferrari", label: "Ferrari" },
              { id: "bmw", label: "BMW M" },
              { id: "cyber", label: "Cyber Neón" },
              { id: "glass", label: "Cristal" },
              { id: "transparent", label: "Sin fondo" },
            ] as theme}
              <button
                type="button"
                class="btn py-1 text-[10px]"
                onclick={() => applyDashThemePreset(theme.id as any)}
              >
                {theme.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Texture / Background Pattern -->
        <label class="flex flex-col gap-1">
          <span class="text-[10px] font-bold text-muted uppercase">Textura de fondo</span>
          <select
            class="field py-1 text-xs"
            value={activeDash.bgPattern ?? "none"}
            onchange={(e) => {
              activeDash.bgPattern = e.currentTarget.value as any;
              saveConfig();
            }}
          >
            <option value="none">Liso / Degradado</option>
            <option value="carbon">Fibra de Carbono</option>
            <option value="grid">Rejilla Telemetría</option>
            <option value="scanlines">Líneas LCD / CRT</option>
            <option value="brushed">Metal Cepillado</option>
            <option value="dots">Matriz LED</option>
          </select>
        </label>

        <!-- Canvas Background & Gradient with Transparency -->
        <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/60 p-2 pt-1.5">
          <div class="flex items-center justify-between gap-1.5">
            <span class="text-[10px] font-bold text-muted uppercase">Fondo ({Math.round(dashBg.alpha * 100)}%)</span>
            <div class="flex items-center gap-1">
              <input
                type="color"
                value={dashBg.hex}
                oninput={(e) => {
                  activeDash.bgColor = buildRgba(e.currentTarget.value, dashBg.alpha > 0 ? dashBg.alpha : 1);
                  saveConfig();
                }}
                class="h-6 w-7 cursor-pointer bg-transparent"
              />
              <button
                type="button"
                class={["rounded px-1.5 py-0.5 text-[9px] font-bold border", activeDash.bgColor === "transparent" ? "border-cyan-400 bg-cyan-500/25 text-cyan-200" : "border-white/15 bg-black/40 text-muted hover:text-white"]}
                title="Lienzo sin fondo (transparente)"
                onclick={() => {
                  activeDash.bgColor = "transparent";
                  saveConfig();
                }}
              >Transp.</button>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={dashBg.alpha}
            oninput={(e) => {
              activeDash.bgColor = buildRgba(dashBg.hex, Number(e.currentTarget.value));
              saveConfig();
            }}
            class="accent-accent"
          />

          <div class="mt-1 flex items-center justify-between gap-1.5 border-t border-white/10 pt-1.5">
            <span class="text-[10px] font-bold text-muted uppercase">
              Degradado {activeDash.bgGradientTo ? `(${Math.round(dashGrad.alpha * 100)}%)` : "(OFF)"}
            </span>
            <div class="flex items-center gap-1">
              <input
                type="color"
                value={dashGrad.hex}
                oninput={(e) => {
                  activeDash.bgGradientTo = buildRgba(e.currentTarget.value, activeDash.bgGradientTo && dashGrad.alpha > 0 ? dashGrad.alpha : 1);
                  saveConfig();
                }}
                class="h-6 w-7 cursor-pointer bg-transparent"
              />
              <button
                type="button"
                class={["rounded px-1.5 py-0.5 text-[9px] font-bold border", activeDash.bgGradientTo === "transparent" ? "border-cyan-400 bg-cyan-500/25 text-cyan-200" : "border-white/15 bg-black/40 text-muted hover:text-white"]}
                title="Degradado hacia transparente (ej. Color → Transparente)"
                onclick={() => {
                  activeDash.bgGradientTo = "transparent";
                  saveConfig();
                }}
              >Transp.</button>
              {#if activeDash.bgGradientTo}
                <button
                  type="button"
                  class="rounded bg-black/40 px-1 py-0.5 text-[9px] text-red-400"
                  title="Quitar degradado"
                  onclick={() => {
                    activeDash.bgGradientTo = "";
                    saveConfig();
                  }}
                >✕</button>
              {/if}
            </div>
          </div>

          {#if activeDash.bgGradientTo}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={dashGrad.alpha}
              oninput={(e) => {
                activeDash.bgGradientTo = buildRgba(dashGrad.hex, Number(e.currentTarget.value));
                saveConfig();
              }}
              class="accent-accent"
            />
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted uppercase">Ángulo degradado ({activeDash.bgGradientAngle ?? 135}°)</span>
              <input
                type="range"
                min="0"
                max="360"
                step="5"
                value={activeDash.bgGradientAngle ?? 135}
                oninput={(e) => {
                  activeDash.bgGradientAngle = Number(e.currentTarget.value);
                  saveConfig();
                }}
                class="accent-accent"
              />
            </label>
          {/if}
        </div>

        <!-- Custom Background Image -->
        <div class="flex flex-col gap-1.5 rounded border border-line bg-surface-2/50 p-2">
          <span class="text-[10px] font-bold text-muted uppercase">🖼️ Imagen de fondo</span>
          <input bind:this={bgImgUploadInput} type="file" accept="image/*" class="hidden" onchange={handleDashBgImageUpload} />
          <div class="flex gap-1.5">
            <button type="button" class="btn flex-1 py-1 text-[10px]" onclick={() => bgImgUploadInput?.click()}>📁 Subir fondo</button>
            {#if activeDash.bgImageUrl}
              <button
                type="button"
                class="btn py-1 text-[10px] text-red-400"
                onclick={() => {
                  activeDash.bgImageUrl = "";
                  saveConfig();
                }}
              >✕ Quitar</button>
            {/if}
          </div>
          {#if activeDash.bgImageUrl}
            <label class="flex flex-col gap-0.5">
              <span class="text-[9px] text-muted">Opacidad imagen ({Math.round((activeDash.bgImageOpacity ?? 0.35) * 100)}%)</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={activeDash.bgImageOpacity ?? 0.35}
                oninput={(e) => {
                  activeDash.bgImageOpacity = Number(e.currentTarget.value);
                  saveConfig();
                }}
                class="accent-accent"
              />
            </label>
          {/if}
        </div>

        <!-- Frame / Bezel / Outer Glow -->
        <div class="grid grid-cols-2 gap-1.5">
          <div class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1">
            <span class="text-[10px] text-muted">Borde</span>
            <div class="flex items-center gap-1">
              <input type="color" value={dashBrd.hex} oninput={(e) => { activeDash.borderColor = e.currentTarget.value; saveConfig(); }} class="h-6 w-7 cursor-pointer bg-transparent" />
              <button
                type="button"
                class="rounded bg-black/40 px-1 text-[9px] text-muted hover:text-white"
                title="Borde transparente"
                onclick={() => { activeDash.borderColor = "transparent"; activeDash.borderWidth = 0; saveConfig(); }}
              >∅</button>
            </div>
          </div>
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Grosor borde</span>
            <input
              type="number"
              min="0"
              max="8"
              class="field py-1 text-xs"
              value={activeDash.borderWidth ?? 1}
              oninput={(e) => {
                activeDash.borderWidth = Number(e.currentTarget.value);
                saveConfig();
              }}
            />
          </label>
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <label class="flex flex-col gap-0.5">
            <span class="text-[9px] text-muted uppercase">Carcasa / Sombra</span>
            <select
              class="field py-1 text-[11px]"
              value={activeDash.frameShadow ?? "deep"}
              onchange={(e) => {
                activeDash.frameShadow = e.currentTarget.value as any;
                saveConfig();
              }}
            >
              <option value="none">Ninguna</option>
              <option value="soft">Suave</option>
              <option value="deep">Profunda</option>
              <option value="bezel">Carcasa 3D Bezel</option>
            </select>
          </label>
          <label class="flex items-center justify-between rounded border border-line bg-surface-2 px-2 py-1 mt-3">
            <span class="text-[9px] text-muted">Halo</span>
            <div class="flex items-center gap-1">
              <input
                type="color"
                value={activeDash.accentGlowColor || "#2287ec"}
                oninput={(e) => {
                  activeDash.accentGlowColor = e.currentTarget.value;
                  saveConfig();
                }}
                class="h-5 w-5 cursor-pointer bg-transparent"
              />
              <input
                type="number"
                min="0"
                max="40"
                class="w-9 bg-transparent text-right font-mono text-[10px]"
                value={activeDash.accentGlowSize ?? 0}
                oninput={(e) => {
                  activeDash.accentGlowSize = Number(e.currentTarget.value);
                  saveConfig();
                }}
              />
            </div>
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-muted uppercase">Opacidad de fondo ({Math.round(activeDash.bgOpacity * 100)}%)</span>
          <input type="range" min="0.1" max="1" step="0.05" bind:value={activeDash.bgOpacity} oninput={saveConfig} class="accent-accent" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-[10px] text-muted uppercase">Radio esquinas ({activeDash.borderRadius}px)</span>
          <input type="range" min="0" max="65" step="2" bind:value={activeDash.borderRadius} oninput={saveConfig} class="accent-accent" />
        </label>

        <div class="mt-1 rounded-lg border border-line bg-surface-2/60 p-2.5 text-[11px] text-muted leading-relaxed">
          <strong class="text-fg">Atajos del Studio:</strong><br />
          • <code>Shift + Clic</code>: selección múltiple para mover o alinear bloques.<br />
          • <code>Flechas</code> (o <code>Shift+Flecha</code>): ajuste fino al píxel.<br />
          • <code>Ctrl+D</code> duplicar · <code>Ctrl+Z/Y</code> deshacer/rehacer.
        </div>
      {/if}
    </div>
  </div>
</div>
