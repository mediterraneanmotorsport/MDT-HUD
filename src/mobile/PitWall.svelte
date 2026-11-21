<script lang="ts">
  import { flip } from "svelte/animate";
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { api } from "../lib/api";
  import { applyRemoteConfig, config, loadConfig, type Units } from "../lib/config.svelte";
  import {
    classColor,
    clock,
    fuel,
    fuelUnit,
    isTeammate,
    lapTime,
    shortName,
    timeOfDay,
    vePct,
  } from "../lib/format";
  import { isMainDriverOnTrack, live, startLive } from "../lib/live.svelte";
  import { mobileNoSleep } from "../lib/noSleep";
  import type { Snapshot, Vehicle } from "../lib/types";
  import { MOBILE_SERVER_BASE, wheelControl } from "../lib/wheelControl.svelte";
  import Damage from "../overlay/widgets/Damage.svelte";
  import Dashboard from "../overlay/widgets/Dashboard.svelte";
  import Delta from "../overlay/widgets/Delta.svelte";
  import Electronics from "../overlay/widgets/Electronics.svelte";
  import LapTiming from "../overlay/widgets/LapTiming.svelte";
  import Relative from "../overlay/widgets/Relative.svelte";
  import Standings from "../overlay/widgets/Standings.svelte";
  import Tyres from "../overlay/widgets/Tyres.svelte";
  import PitWallCustomizeModal from "./PitWallCustomizeModal.svelte";
  import PitWallLapLogModal, { type RecordedDriverLap } from "./PitWallLapLogModal.svelte";
  import PitWallTrackMap from "./PitWallTrackMap.svelte";
  import {
    DEFAULT_PITWALL_CONFIG,
    DEFAULT_RIGHT_ORDER,
    PITWALL_THEMES,
    type PitwallConfig,
    type PitwallPreset,
    type PitwallRightModuleId,
    type PitwallViewMode,
  } from "./pitwallTypes";

  let { embedded = false } = $props();

  let rootEl = $state<HTMLDivElement | null>(null);
  let mainSplitEl = $state<HTMLElement | null>(null);

  // View mode: "lovely" | "engineer" | "tablet" (#3)
  let viewMode = $state<PitwallViewMode>("lovely");
  let showCustomizeModal = $state(false);
  let showLapLogModal = $state(false);
  let selectedVehicleId = $state<number | null>(null);
  let focusStatusMsg = $state<string>("");
  let selectedClass = $state<string>("ALL");
  let wakeLockActive = $state(false);
  let isDraggingSplit = $state(false);
  let lastAutoDirSwitch = 0;

  let pitwallConfig = $state<PitwallConfig>(structuredClone(DEFAULT_PITWALL_CONFIG));

  const activeSnap = $derived(live.snap);
  const p = $derived(activeSnap?.player);
  const st = $derived(activeSnap?.strategy);
  const s = $derived(activeSnap?.session);
  const vehicles = $derived(activeSnap?.vehicles ?? []);
  const me = $derived(vehicles.find((v) => v.isPlayer) ?? null);
  const mainDriverOnTrack = $derived(isMainDriverOnTrack(activeSnap));
  const teammates = $derived(config.value.general.teammates);
  const batteryFull = $derived(!!p && p.electricMotorState > 0 && p.battery >= 0.975);

  // #28 Stint Timeline tracking per car & #38 Session Lap Log per car
  interface StintEntry {
    compound: string;
    laps: number;
  }
  let stintHistory = $state<Record<number, StintEntry[]>>({});
  let driverLapLogs = $state<Record<number, RecordedDriverLap[]>>({});
  const lastRecordedLapNum = new Map<number, number>();
  const lastStintPitCount = new Map<number, number>();

  // Dedicated unit formatters for PitWall custom units (PSI/BAR/kPa, C/F, km/h/mph)
  const widgetUnits = $derived<Units>(pitwallConfig.units.speed === "mph" ? "imperial" : "metric");
  function fmtSpd(ms: number): number {
    return pitwallConfig.units.speed === "mph" ? ms * 2.236936 : ms * 3.6;
  }
  function spdUnitLabel(): string {
    return pitwallConfig.units.speed === "mph" ? "MPH" : "KM/H";
  }
  function fmtTemp(c: number): number {
    return pitwallConfig.units.temp === "f" ? c * 1.8 + 32 : c;
  }
  function fmtPress(kpa: number): number {
    if (pitwallConfig.units.pressure === "psi") return kpa * 0.1450377;
    if (pitwallConfig.units.pressure === "bar") return kpa / 100;
    return kpa;
  }
  function pressUnitLabel(): string {
    return pitwallConfig.units.pressure.toUpperCase();
  }

  // #9 Enhanced Pit Stop Tracking: total pit lane time + stationary box time
  interface PitRecord {
    inPits: boolean;
    pitStartEt: number;
    currentDuration: number;
    stopDuration: number;
    lastStopTickEt: number;
    lastPitDuration: number;
    lastStopDuration: number;
    pitCount: number;
  }
  let pitRecords = $state<Record<number, PitRecord>>({});

  // #6 Position change flashes (overtake green/red) & #8 Purple/Green lap flashes
  let posFlash = $state<Record<number, { dir: "up" | "down"; until: number }>>({});
  let lapFlash = $state<Record<number, { kind: "purple" | "green"; until: number }>>({});

  // #2 Race Control Event Feed
  interface RaceEvent {
    id: number;
    time: string;
    kind: "yellow" | "green" | "pit" | "purple" | "penalty" | "leader" | "rain";
    badge: string;
    text: string;
  }
  let raceEvents = $state<RaceEvent[]>([]);
  let eventSeq = 0;

  function pushRaceEvent(kind: RaceEvent["kind"], badge: string, text: string) {
    const tStr = s ? clock(s.currentEt) : new Date().toTimeString().slice(0, 8);
    eventSeq += 1;
    raceEvents = [{ id: eventSeq, time: tStr, kind, badge, text }, ...raceEvents.slice(0, 39)];
  }

  // Plain non-reactive trackers for edge detection (never cause reactive loops)
  const prevPlaces = new Map<number, number>();
  const prevBestLaps = new Map<number, number>();
  const prevLastLaps = new Map<number, number>();
  const prevPenalties = new Map<number, number>();
  const startGridMap = new Map<number, number>();
  let prevOverallBest = 0;
  let prevLeaderId = -1;
  let prevYellowAny = false;
  let prevRaining = false;
  let greenClearUntil = $state(0);

  // Sparkline history (non-reactive buffers + reactive snapshots every 250ms)
  const rawSpd: number[] = [];
  const rawRpm: number[] = [];
  const rawFl: number[] = [];
  const rawFr: number[] = [];
  const rawRl: number[] = [];
  const rawRr: number[] = [];
  let historySpeed = $state<number[]>([]);
  let historyRpm = $state<number[]>([]);
  let historyTirePressures = $state<{ fl: number[]; fr: number[]; rl: number[]; rr: number[] }>({
    fl: [],
    fr: [],
    rl: [],
    rr: [],
  });
  let lastHistSample = 0;

  // Main edge-detection & tracking effect
  $effect(() => {
    const snap = activeSnap;
    if (!snap) return;
    const nowMs = Date.now();
    const curEt = snap.session?.currentEt ?? nowMs / 1000;
    const list = snap.vehicles ?? [];

    // Session flags / rain edge detection (#2 & #7)
    const yellowAny = Boolean(
      snap.session &&
        (snap.session.yellowFlagState > 0 ||
          snap.session.phase === 6 ||
          snap.session.sectorYellow?.some(Boolean)),
    );
    if (yellowAny && !prevYellowAny) {
      const secs = (snap.session?.sectorYellow ?? [])
        .map((y, i) => (y ? `S${i + 1}` : ""))
        .filter(Boolean)
        .join(", ");
      const label = snap.session?.phase === 6 ? "FCY / SC" : secs ? `AMARILLA ${secs}` : "BANDERA AMARILLA";
      pushRaceEvent("yellow", label, secs ? `Precaución en sector ${secs}` : "Precaución general en pista");
    } else if (!yellowAny && prevYellowAny) {
      greenClearUntil = nowMs + 4000;
      pushRaceEvent("green", "BANDERA VERDE", "Pista despejada · Ritmo normal");
    }
    prevYellowAny = yellowAny;

    const rainingNow = (snap.session?.weather?.raining ?? 0) > 0.05;
    if (rainingNow && !prevRaining) {
      pushRaceEvent("rain", "LLUVIA", `Lluvia detectada en pista (${Math.round((snap.session?.weather?.raining ?? 0) * 100)}%)`);
    } else if (!rainingNow && prevRaining) {
      pushRaceEvent("green", "SECO", "Ha dejado de llover en el circuito");
    }
    prevRaining = rainingNow;

    // Leader change detection
    const leader = list.find((v) => v.place === 1);
    if (leader && prevLeaderId !== -1 && leader.id !== prevLeaderId) {
      pushRaceEvent("leader", "NUEVO LÍDER", `#${leader.number || leader.id} ${shortName(leader.driver)} toma el liderato`);
    }
    if (leader) prevLeaderId = leader.id;

    // Overall best calculation
    let curOverall = prevOverallBest;
    for (const v of list) {
      if (v.bestLap > 0 && (curOverall === 0 || v.bestLap < curOverall)) {
        curOverall = v.bestLap;
      }
    }

    let posChanged = false;
    let lapChanged = false;
    const nextPosFlash = { ...posFlash };
    const nextLapFlash = { ...lapFlash };

    for (const v of list) {
      // Starting grid memory
      if (!startGridMap.has(v.id)) {
        startGridMap.set(v.id, v.qualification > 0 ? v.qualification : v.place);
      } else if (v.qualification > 0 && startGridMap.get(v.id) !== v.qualification) {
        startGridMap.set(v.id, v.qualification);
      }

      // #6 Position change flash
      const oldPlace = prevPlaces.get(v.id);
      if (oldPlace != null && oldPlace !== v.place) {
        nextPosFlash[v.id] = { dir: v.place < oldPlace ? "up" : "down", until: nowMs + 2600 };
        posChanged = true;
      }
      prevPlaces.set(v.id, v.place);

      // #8 Purple / Green lap flash + Race Control purple event
      const oldBest = prevBestLaps.get(v.id) ?? 0;
      const oldLast = prevLastLaps.get(v.id) ?? 0;
      if (v.bestLap > 0 && oldBest > 0 && v.bestLap < oldBest - 0.002) {
        const isPurple = curOverall > 0 && v.bestLap <= curOverall + 0.002;
        nextLapFlash[v.id] = { kind: isPurple ? "purple" : "green", until: nowMs + 3500 };
        lapChanged = true;
        if (isPurple && (prevOverallBest === 0 || v.bestLap < prevOverallBest - 0.002)) {
          prevOverallBest = v.bestLap;
          pushRaceEvent("purple", "VUELTA RÁPIDA", `#${v.number || v.id} ${shortName(v.driver)} marca ${lapTime(v.bestLap)}`);
        }
      } else if (v.lastLap > 0 && oldLast > 0 && Math.abs(v.lastLap - oldLast) > 0.002) {
        if (v.bestLap > 0 && v.lastLap <= v.bestLap + 0.002) {
          nextLapFlash[v.id] = { kind: "green", until: nowMs + 3000 };
          lapChanged = true;
        }
      }
      if (v.bestLap > 0) prevBestLaps.set(v.id, v.bestLap);
      if (v.lastLap > 0) prevLastLaps.set(v.id, v.lastLap);

      // #38 Record completed laps per driver for Lap Log modal & CSV export
      const prevLapN = lastRecordedLapNum.get(v.id);
      const compName = v.tyreCompounds?.[0] || (v.isPlayer ? p?.frontCompound : "") || "Medium";
      if (prevLapN != null && v.totalLaps > prevLapN && v.lastLap > 0) {
        const s1 = v.lastS1 > 0 ? v.lastS1 : 0;
        const s2 = s1 > 0 && v.lastS2 > s1 ? v.lastS2 - s1 : 0;
        const s3 = v.lastS2 > 0 && v.lastLap > v.lastS2 ? v.lastLap - v.lastS2 : 0;
        const existing = driverLapLogs[v.id] ?? [];
        if (!existing.some((l) => l.lap === v.totalLaps)) {
          driverLapLogs[v.id] = [
            ...existing.slice(-80),
            { lap: v.totalLaps, time: v.lastLap, s1, s2, s3, compound: compName, pit: Boolean(v.inPits) },
          ];
        }
      }
      if (v.totalLaps >= 0) lastRecordedLapNum.set(v.id, v.totalLaps);

      // #28 Stint Timeline tracking per vehicle
      const stints = stintHistory[v.id];
      const prevPits = lastStintPitCount.get(v.id) ?? v.numPitstops;
      const curStintLaps = Math.max(1, v.tyreLaps ?? 1);
      if (!stints) {
        stintHistory[v.id] = [{ compound: compName, laps: curStintLaps }];
      } else {
        const lastStint = stints[stints.length - 1];
        if (v.numPitstops > prevPits || (lastStint && lastStint.compound !== compName && !v.inPits)) {
          stintHistory[v.id] = [...stints.slice(-5), { compound: compName, laps: curStintLaps }];
        } else if (lastStint) {
          lastStint.laps = Math.max(lastStint.laps, curStintLaps);
        }
      }
      lastStintPitCount.set(v.id, v.numPitstops);

      // Penalty detection
      const oldPen = prevPenalties.get(v.id) ?? v.numPenalties;
      if (v.numPenalties > oldPen) {
        pushRaceEvent("penalty", "SANCIÓN", `#${v.number || v.id} ${shortName(v.driver)} recibe penalización`);
      }
      prevPenalties.set(v.id, v.numPenalties);

      // #9 Pit lane + stationary box chronometer
      const rec = pitRecords[v.id];
      if (v.inPits) {
        if (!rec || !rec.inPits) {
          pitRecords[v.id] = {
            inPits: true,
            pitStartEt: curEt,
            currentDuration: 0,
            stopDuration: 0,
            lastStopTickEt: curEt,
            lastPitDuration: rec?.lastPitDuration ?? 0,
            lastStopDuration: rec?.lastStopDuration ?? 0,
            pitCount: v.numPitstops,
          };
          pushRaceEvent("pit", "ENTRA A BOX", `#${v.number || v.id} ${shortName(v.driver)} (P${v.place}) entra al pit lane`);
        } else {
          const dt = Math.max(0, Math.min(2, curEt - rec.lastStopTickEt));
          rec.lastStopTickEt = curEt;
          rec.currentDuration = Math.max(0, curEt - rec.pitStartEt);
          if ((v.speed ?? 0) < 1.5) {
            rec.stopDuration += dt;
          }
          if (v.numPitstops > rec.pitCount) rec.pitCount = v.numPitstops;
        }
      } else if (rec && rec.inPits) {
        const totalD = rec.currentDuration > 0 ? rec.currentDuration : Math.max(0, curEt - rec.pitStartEt);
        rec.lastPitDuration = totalD > 0 ? totalD : rec.lastPitDuration;
        rec.lastStopDuration = rec.stopDuration > 0 ? rec.stopDuration : rec.lastStopDuration;
        rec.inPits = false;
        rec.currentDuration = 0;
        rec.stopDuration = 0;
        rec.pitCount = v.numPitstops;
        if (totalD > 3) {
          const stopTxt = rec.lastStopDuration > 1 ? ` · parado ${rec.lastStopDuration.toFixed(1)}s` : "";
          pushRaceEvent("pit", "SALE DE BOX", `#${v.number || v.id} ${shortName(v.driver)} sale (${totalD.toFixed(1)}s${stopTxt})`);
        }
      }
    }

    if (prevOverallBest === 0 && curOverall > 0) prevOverallBest = curOverall;
    if (posChanged) posFlash = nextPosFlash;
    if (lapChanged) lapFlash = nextLapFlash;

    // Sparkline sampling every 250ms
    if (nowMs - lastHistSample > 250 && snap.player) {
      lastHistSample = nowMs;
      const pl = snap.player;
      rawSpd.push(fmtSpd(pl.speed ?? 0));
      if (rawSpd.length > 42) rawSpd.shift();
      rawRpm.push(pl.rpm ?? 0);
      if (rawRpm.length > 42) rawRpm.shift();
      historySpeed = [...rawSpd];
      historyRpm = [...rawRpm];

      if (pl.wheels && pl.wheels.length >= 4) {
        rawFl.push(fmtPress(pl.wheels[0]?.pressure ?? 190));
        rawFr.push(fmtPress(pl.wheels[1]?.pressure ?? 190));
        rawRl.push(fmtPress(pl.wheels[2]?.pressure ?? 190));
        rawRr.push(fmtPress(pl.wheels[3]?.pressure ?? 190));
        if (rawFl.length > 42) rawFl.shift();
        if (rawFr.length > 42) rawFr.shift();
        if (rawRl.length > 42) rawRl.shift();
        if (rawRr.length > 42) rawRr.shift();
        historyTirePressures = { fl: [...rawFl], fr: [...rawFr], rl: [...rawRl], rr: [...rawRr] };
      }
    }
  });

  function createSparkline(pts: number[], w: number, h: number, minVal?: number, maxVal?: number): string {
    if (!pts || pts.length < 2) return "";
    const min = minVal ?? Math.min(...pts);
    const max = maxVal ?? Math.max(...pts);
    const range = max - min || 1;
    return pts
      .map((val, i) => {
        const x = (i / (pts.length - 1)) * w;
        const y = h - ((val - min) / range) * (h - 6) - 3;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  // #20 Bulletproof 30 Hz direct sync via /__mobile_snap + Anti-Sleep
  async function toggleWakeLock() {
    if (wakeLockActive) {
      mobileNoSleep.disable();
      wakeLockActive = false;
    } else {
      wakeLockActive = await mobileNoSleep.enable();
    }
  }

  onMount(() => {
    void loadConfig();
    void startLive();
    wheelControl.startHost();

    try {
      const savedConfig = localStorage.getItem("mdt_pitwall_config_v4") || localStorage.getItem("mdt_pitwall_config_v3");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const mergedOrder = Array.isArray(parsed.rightOrder)
          ? ([
              ...parsed.rightOrder.filter((id: string) => DEFAULT_RIGHT_ORDER.includes(id as PitwallRightModuleId)),
              ...DEFAULT_RIGHT_ORDER.filter((id) => !parsed.rightOrder.includes(id)),
            ] as PitwallRightModuleId[])
          : [...DEFAULT_RIGHT_ORDER];
        pitwallConfig = {
          ...structuredClone(DEFAULT_PITWALL_CONFIG),
          ...parsed,
          rightOrder: mergedOrder,
          pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds : [],
          autoDirector: { ...DEFAULT_PITWALL_CONFIG.autoDirector, ...(parsed.autoDirector || {}) },
          columns: { ...DEFAULT_PITWALL_CONFIG.columns, ...(parsed.columns || {}) },
          modules: { ...DEFAULT_PITWALL_CONFIG.modules, ...(parsed.modules || {}) },
          units: { ...DEFAULT_PITWALL_CONFIG.units, ...(parsed.units || {}) },
        };
      }
      const savedMode = localStorage.getItem("mdt_pitwall_view_mode_v2");
      if (savedMode === "tablet" || savedMode === "lovely" || savedMode === "engineer") {
        viewMode = savedMode;
      }
    } catch {}

    if (embedded) return;

    let mounted = true;
    let lastConfigSeq = -1;
    let activeCtrl: AbortController | null = null;

    const handlePayload = (data: any) => {
      if (!data) return;
      if (data.appConfig) applyRemoteConfig(data.appConfig);
      if (data.snap) {
        (window as any).__MDT_STOP_DEMO__?.();
        live.snap = data.snap as Snapshot;
      }
      if (typeof data.configSeq === "number") {
        lastConfigSeq = data.configSeq;
      }
      if (typeof data.mobileTheme === "string") {
        wheelControl.mobileTheme = data.mobileTheme;
      }
    };

    const syncLoop = async () => {
      while (mounted) {
        const t0 = performance.now();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const ctrl = new AbortController();
          activeCtrl = ctrl;
          timeoutId = setTimeout(() => ctrl.abort(), 1200);
          const qs = lastConfigSeq >= 0 ? `?cfgSeq=${lastConfigSeq}` : "";
          const res = await fetch(`${MOBILE_SERVER_BASE}/__mobile_snap${qs}`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (res.ok) {
            handlePayload(await res.json());
          }
        } catch {
          // retry next tick
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          activeCtrl = null;
        }
        const elapsed = performance.now() - t0;
        await new Promise((r) => setTimeout(r, Math.max(12, 33 - elapsed)));
      }
    };
    void syncLoop();
    void mobileNoSleep.enable().then((ok) => (wakeLockActive = ok));

    return () => {
      mounted = false;
      activeCtrl?.abort();
      mobileNoSleep.disable();
    };
  });

  function saveConfig() {
    try {
      localStorage.setItem("mdt_pitwall_config_v4", JSON.stringify(pitwallConfig));
    } catch {}
  }

  function resetConfig() {
    pitwallConfig = structuredClone(DEFAULT_PITWALL_CONFIG);
    saveConfig();
  }

  function applyPreset(preset: PitwallPreset) {
    viewMode = preset.viewMode;
    try {
      localStorage.setItem("mdt_pitwall_view_mode_v2", preset.viewMode);
    } catch {}
    pitwallConfig = {
      ...pitwallConfig,
      ...preset.patch,
      columns: { ...pitwallConfig.columns, ...(preset.patch.columns ?? {}) },
      modules: { ...pitwallConfig.modules, ...(preset.patch.modules ?? {}) },
    };
    saveConfig();
  }

  function setViewMode(mode: PitwallViewMode) {
    if (pitwallConfig.locked) return;
    viewMode = mode;
    try {
      localStorage.setItem("mdt_pitwall_view_mode_v2", mode);
    } catch {}
  }

  function togglePin(id: number, e?: MouseEvent) {
    e?.stopPropagation();
    if (pitwallConfig.locked) return;
    if (pitwallConfig.pinnedIds.includes(id)) {
      pitwallConfig.pinnedIds = pitwallConfig.pinnedIds.filter((x) => x !== id);
    } else {
      pitwallConfig.pinnedIds = [...pitwallConfig.pinnedIds, id];
    }
    saveConfig();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  // Keep selectedVehicle locked to main driver whenever the main driver is actively driving on track
  $effect(() => {
    if (mainDriverOnTrack && me && selectedVehicleId !== me.id) {
      selectedVehicleId = me.id;
    }
  });

  // #34 Auto-Director: switches camera to tightest battle (<1.2s) in chosen category every N seconds
  // Automatically paused when mainDriverOnTrack is true!
  $effect(() => {
    if (!pitwallConfig.autoDirector?.enabled || mainDriverOnTrack) return;
    const cat = pitwallConfig.autoDirector.category || "ALL";
    const intervalMs = Math.max(8, pitwallConfig.autoDirector.intervalSec || 22) * 1000;
    const now = Date.now();
    if (now - lastAutoDirSwitch < intervalMs) return;

    const pool = sortedVehicles.filter(
      (v) =>
        !v.inPits &&
        !v.inGarage &&
        (cat === "ALL" || (v.class || "").toLowerCase().includes(cat.toLowerCase())),
    );
    let bestBattle: { attacker: Vehicle; gap: number } | null = null;
    for (let i = 1; i < pool.length; i++) {
      const ahead = pool[i - 1];
      const behind = pool[i];
      const gapSec = Math.abs((behind.timeBehindLeader ?? 0) - (ahead.timeBehindLeader ?? 0));
      if (gapSec > 0.02 && gapSec <= 1.2 && (!bestBattle || gapSec < bestBattle.gap)) {
        bestBattle = { attacker: behind, gap: gapSec };
      }
    }
    if (bestBattle && bestBattle.attacker.id !== selectedVehicleId) {
      lastAutoDirSwitch = now;
      void focusDriver(bestBattle.attacker);
    }
  });

  async function focusDriver(target: Vehicle | number) {
    const slotId = typeof target === "number" ? target : (target?.slotId ?? target?.id ?? 0);
    const v = typeof target === "number" ? vehicles.find((car) => (car.slotId ?? car.id) === target) : target;

    // Safety rule: if the main driver is on track, NEVER allow selecting/focusing another driver
    if (mainDriverOnTrack && me && v && v.id !== me.id) {
      focusStatusMsg = "🔒 En pista · Cambio de piloto bloqueado";
      setTimeout(() => {
        if (focusStatusMsg.startsWith("🔒")) focusStatusMsg = "";
      }, 2500);
      return;
    }

    selectedVehicleId = v?.id ?? slotId;
    const name = v ? `${shortName(v.driver)} (#${v.number || v.id})` : `Slot ${slotId}`;
    focusStatusMsg = `Enfocando a ${name}...`;
    try {
      void api.setFocusedSlot(slotId);
      const ok = await api.focusVehicle(slotId);
      focusStatusMsg = ok ? `✓ Enfocando #${v?.number || slotId} ${v ? shortName(v.driver) : ""}` : `🎥 Vista PitWall: ${name}`;
      setTimeout(() => {
        focusStatusMsg = "";
      }, 3500);
    } catch {
      focusStatusMsg = `🎥 Vista PitWall: ${name}`;
    }
  }

  // Draggable vertical splitter (#11) — disabled when locked (#40)
  function startSplitDrag(e: PointerEvent) {
    if (pitwallConfig.locked) return;
    e.preventDefault();
    isDraggingSplit = true;
    const onMove = (ev: PointerEvent) => {
      if (!mainSplitEl) return;
      const rect = mainSplitEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.round(((ev.clientX - rect.left) / rect.width) * 100);
      pitwallConfig.splitPct = Math.max(45, Math.min(75, pct));
    };
    const onUp = () => {
      isDraggingSplit = false;
      saveConfig();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // #39 Copy formatted Discord Race / Stint summary
  async function copyDiscordReport() {
    const car = displayCar;
    const laps = car ? (driverLapLogs[car.id] ?? []) : [];
    const lines = [
      `**🏁 MDT-HUD PIT WALL · INFORME DE CARRERA**`,
      `📍 **Circuito:** ${s?.track || "LMU"} (${(s?.kind || "race").toUpperCase()})`,
      car ? `🏎️ **Piloto:** #${car.number || car.id} ${shortName(car.driver)} · **P${car.place}** (${car.class})` : "",
      car ? `⏱️ **Mejor Vuelta:** \`${lapTime(car.bestLap)}\` · **Última:** \`${lapTime(car.lastLap)}\` · **Paradas:** ${car.numPitstops ?? 0}` : "",
      `⛽ **Fuel:** ${fuel(currentFuel, widgetUnits).toFixed(1)} ${fuelUnit(widgetUnits)} (${lapsOfFuel.toFixed(1)} vtas) · **VE:** ${Math.round(vePct(p?.virtualEnergy ?? 0))}%`,
      laps.length ? `📜 **Últimas vueltas:** ${laps.slice(-5).map((l) => `L${l.lap}: ${lapTime(l.time)}`).join(" | ")}` : "",
      raceEvents.length ? `🚩 **Últimos eventos:** ${raceEvents.slice(0, 3).map((e) => `[${e.badge}] ${e.text}`).join(" · ")}` : "",
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      focusStatusMsg = "📋 Resumen copiado para Discord";
      setTimeout(() => (focusStatusMsg = ""), 2500);
    } catch {
      focusStatusMsg = "⚠️ No se pudo copiar al portapapeles";
      setTimeout(() => (focusStatusMsg = ""), 2500);
    }
  }

  // Derived data
  const availableClasses = $derived.by(() => {
    const set = new Set<string>();
    for (const v of vehicles) if (v.class) set.add(v.class.trim());
    return Array.from(set).sort();
  });

  const sortedVehicles = $derived([...vehicles].sort((a, b) => a.place - b.place));

  const filteredVehicles = $derived.by(() => {
    if (selectedClass === "ALL") return sortedVehicles;
    return sortedVehicles.filter((v) => (v.class || "").toLowerCase().includes(selectedClass.toLowerCase()));
  });

  const pinnedVehicles = $derived(
    sortedVehicles.filter((v) => pitwallConfig.pinnedIds.includes(v.id) || isTeammate(v, teammates)),
  );

  const selectedVehicle = $derived(
    vehicles.find((v) => v.id === selectedVehicleId) ?? me ?? sortedVehicles[0] ?? null,
  );

  const overallBest = $derived.by(() => {
    const times = vehicles.map((v) => v.bestLap).filter((t) => t > 0);
    return times.length ? Math.min(...times) : 0;
  });

  // #5 Pit Window & Rejoin Predictor (both position and surrounding cars)
  const pitRejoinPrediction = $derived.by(() => {
    const target = selectedVehicle ?? me;
    if (!target || sortedVehicles.length < 2) return null;
    const projectedTime = (target.timeBehindLeader ?? 0) + pitwallConfig.pitLossSec;
    const others = sortedVehicles.filter((v) => v.id !== target.id && !v.inGarage);
    let insertAfterIdx = -1;
    let predictedPos = 1;
    for (let i = 0; i < others.length; i++) {
      if ((others[i].timeBehindLeader ?? 0) < projectedTime) {
        predictedPos = others[i].place + (others[i].place > target.place ? 0 : 1);
        insertAfterIdx = i;
      } else {
        break;
      }
    }
    const carAhead = insertAfterIdx >= 0 ? others[insertAfterIdx] : null;
    const carBehind = insertAfterIdx + 1 < others.length ? others[insertAfterIdx + 1] : null;
    return {
      targetId: target.id,
      predictedPos: Math.min(sortedVehicles.length, Math.max(1, predictedPos)),
      afterCarId: carAhead?.id ?? null,
      carAhead,
      carBehind,
    };
  });

  // #4 Head-to-Head Battle Card (auto-detects closest rival within 1.8s)
  const activeBattle = $derived.by(() => {
    const refCar = selectedVehicle ?? me;
    if (!refCar || sortedVehicles.length < 2) return null;
    const idx = sortedVehicles.findIndex((v) => v.id === refCar.id);
    if (idx < 0) return null;
    const ahead = idx > 0 ? sortedVehicles[idx - 1] : null;
    const behind = idx < sortedVehicles.length - 1 ? sortedVehicles[idx + 1] : null;
    const gapAhead = ahead ? Math.abs((refCar.timeBehindLeader ?? 0) - (ahead.timeBehindLeader ?? 0)) : Infinity;
    const gapBehind = behind ? Math.abs((behind.timeBehindLeader ?? 0) - (refCar.timeBehindLeader ?? 0)) : Infinity;
    if (gapAhead <= 1.8 && gapAhead <= gapBehind && ahead) {
      return { role: "ATAQUE" as const, refCar, rival: ahead, gapSec: gapAhead };
    }
    if (gapBehind <= 1.8 && behind) {
      return { role: "DEFENSA" as const, refCar, rival: behind, gapSec: gapBehind };
    }
    return null;
  });

  // #7 Cinematic Broadcast Flag Banner State
  const flagBanner = $derived.by<{
    kind: "fcy" | "yellow" | "blue" | "rain" | "green";
    title: string;
    subtitle: string;
    bgClass: string;
    borderClass: string;
  } | null>(() => {
    if (!pitwallConfig.modules.flagBanners || !s) return null;
    const secs = (s.sectorYellow ?? []).map((y, i) => (y ? `SECTOR ${i + 1}` : "")).filter(Boolean);
    if (s.phase === 6) {
      return {
        kind: "fcy",
        title: "⚠️ FULL COURSE YELLOW / SAFETY CAR",
        subtitle: "Velocidad limitada · Ventana estratégica de boxes abierta",
        bgClass: "bg-[#ffd400] text-black",
        borderClass: "border-[#ffd400] shadow-[0_0_25px_rgba(255,212,0,0.45)]",
      };
    }
    if (s.yellowFlagState > 0 || secs.length > 0) {
      return {
        kind: "yellow",
        title: `⚠️ BANDERA AMARILLA${secs.length ? ` · ${secs.join(" / ")}` : ""}`,
        subtitle: "Precaución en pista · Prohibido adelantar en zona afectada",
        bgClass: "bg-[#facc15] text-black",
        borderClass: "border-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.4)]",
      };
    }
    if (me?.flag === 6) {
      return {
        kind: "blue",
        title: "🟦 BANDERA AZUL",
        subtitle: "Coche más rápido aproximándose · Ceder el paso",
        bgClass: "bg-[#1d6cf2] text-white",
        borderClass: "border-[#1d6cf2] shadow-[0_0_20px_rgba(29,108,242,0.45)]",
      };
    }
    if ((s.weather?.raining ?? 0) > 0.15) {
      return {
        kind: "rain",
        title: `🌧️ ALERTA DE LLUVIA (${Math.round((s.weather?.raining ?? 0) * 100)}%)`,
        subtitle: `Humedad en pista ${Math.round((s.weather?.avgWetness ?? 0) * 100)}% · Evaluar paso a neumáticos de agua`,
        bgClass: "bg-sky-500 text-black",
        borderClass: "border-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.4)]",
      };
    }
    if (Date.now() < greenClearUntil) {
      return {
        kind: "green",
        title: "🟢 BANDERA VERDE · PISTA LIBRE",
        subtitle: "Condiciones normales de carrera restablecidas",
        bgClass: "bg-emerald-500 text-black",
        borderClass: "border-emerald-400",
      };
    }
    return null;
  });

  const weather = $derived(s?.weather);
  const weatherIcon = $derived.by(() => {
    if (!weather) return { icon: "☀️", label: "Despejado", desc: "Pista seca" };
    const r = weather.raining;
    const c = weather.cloudCoverage;
    if (r >= 0.7) return { icon: "⛈️", label: "Tormenta", desc: "Extrema humedad" };
    if (r >= 0.35) return { icon: "🌧️", label: "Lluvia Fuerte", desc: "Pista mojada" };
    if (r > 0) return { icon: "🌦️", label: "Lluvia Ligera", desc: "Húmedo" };
    if (c >= 0.65) return { icon: "☁️", label: "Nublado", desc: "Seco" };
    if (c >= 0.25) return { icon: "⛅", label: "Parcial", desc: "Seco" };
    return { icon: "☀️", label: "Soleado", desc: "Pista seca" };
  });

  const forecastEstimate = $derived.by(() => {
    if (!weather || !s) return { text: "Estable ~10m", minutes: 10 };
    const rain = weather.raining;
    const wet = weather.avgWetness;
    const minsLeft = 5 - Math.floor((s.currentEt % 300) / 60);
    if (rain > 0.4) return { text: `Lluvia persistente · Ventana ~${minsLeft}m`, minutes: minsLeft };
    if (rain > 0.05) return { text: `Lluvia ligera · Secado ~${minsLeft + 5}m`, minutes: minsLeft + 5 };
    if (weather.darkCloud > 0.5) return { text: `Frente nuboso · Lluvia en ~${minsLeft}m`, minutes: minsLeft };
    if (wet > 0.2) return { text: `Pista secándose (~${minsLeft + 5}m para slick)`, minutes: minsLeft + 5 };
    return { text: `Estable · Próx. informe en ~${minsLeft}m`, minutes: minsLeft };
  });

  const relativeRivals = $derived.by(() => {
    if (!sortedVehicles.length || !me) return { ahead: null as Vehicle | null, behind: null as Vehicle | null };
    const myIdx = sortedVehicles.findIndex((v) => v.id === me.id);
    return {
      ahead: myIdx > 0 ? sortedVehicles[myIdx - 1] : null,
      behind: myIdx >= 0 && myIdx < sortedVehicles.length - 1 ? sortedVehicles[myIdx + 1] : null,
    };
  });

  const currentFuel = $derived(p?.fuel ?? 0);
  const avgFuelPerLap = $derived(st?.fuelPerLap ?? 0);
  const lapsOfFuel = $derived(st?.lapsOfFuel ?? (avgFuelPerLap > 0 ? currentFuel / avgFuelPerLap : 0));
  const lcScore = $derived(p?.liftAndCoast ?? 0);
  const estTimeLeft = $derived.by(() => {
    if (!st || st.fuelPerLap <= 0 || !me?.lastLap) return "–";
    return clock(lapsOfFuel * me.lastLap);
  });
  const atFinishLine = $derived.by(() => {
    if (!st || st.lapsRemaining <= 0 || avgFuelPerLap <= 0) return currentFuel.toFixed(1);
    return (currentFuel - st.lapsRemaining * avgFuelPerLap).toFixed(1);
  });

  const themeMeta = $derived(PITWALL_THEMES[pitwallConfig.theme] ?? PITWALL_THEMES["lovely-dark"]);
  const effectiveAccent = $derived(pitwallConfig.customAccent || themeMeta.accent);

  const densityRowClass = $derived.by(() => {
    if (pitwallConfig.density === "compact") return "py-0.5 text-[10px]";
    if (pitwallConfig.density === "spacious") return "py-2.5 text-xs";
    return "py-1.5 text-[11px]";
  });

  const fontScaleClass = $derived(
    pitwallConfig.fontScale === "sm" ? "text-[11px]" : pitwallConfig.fontScale === "lg" ? "text-[14px]" : "text-[12px]",
  );

  // #18 Estimate VE laps remaining for any rival
  function estVeLaps(v: Vehicle): string {
    const pct = vePct(v.virtualEnergy ?? 0);
    if (pct <= 0.1) return "";
    const perLapPct = st && st.vePerLap > 0.005 ? vePct(st.vePerLap) : 7.5;
    const laps = pct / perLapPct;
    return `~${laps.toFixed(1)}L`;
  }

  /**
   * Computes individual (non-cumulative) S1, S2, S3 sector durations for any vehicle.
   * LMU reports `curS2` / `lastS2` as cumulative (S1 + S2), so:
   *  - S1 = s1
   *  - S2 = s2_cumulative - s1
   *  - S3 = lapTime - s2_cumulative
   * While a lap is in progress (`curS1 > 0`), shows completed sectors of the current lap
   * and `-` (0) for sectors not yet completed; otherwise falls back to the last completed lap.
   */
  function vehicleSectors(v: Vehicle | null | undefined): [number, number, number] {
    if (!v) return [0, 0, 0];
    if (v.curS1 > 0) {
      const s1 = v.curS1;
      const s2 = v.curS2 > s1 ? v.curS2 - s1 : 0;
      return [s1, s2, 0];
    }
    const s1 = v.lastS1 > 0 ? v.lastS1 : 0;
    const s2 = s1 > 0 && v.lastS2 > s1 ? v.lastS2 - s1 : 0;
    const s3 = v.lastS2 > 0 && v.lastLap > v.lastS2 ? v.lastLap - v.lastS2 : 0;
    return [s1, s2, s3];
  }

  /** Live running timer of the vehicle's current sector (resets to 0.000 at each sector line). */
  function liveCurrentSectorTime(v: Vehicle | null | undefined): { sector: number; time: number } {
    if (!v || !v.timeIntoLap || v.timeIntoLap <= 0) return { sector: v?.sector || 1, time: 0 };
    if (v.curS2 > 0 && v.timeIntoLap >= v.curS2) {
      return { sector: 3, time: Math.max(0, v.timeIntoLap - v.curS2) };
    }
    if (v.curS1 > 0 && v.timeIntoLap >= v.curS1) {
      return { sector: 2, time: Math.max(0, v.timeIntoLap - v.curS1) };
    }
    return { sector: 1, time: Math.max(0, v.timeIntoLap) };
  }

  const displayCar = $derived(selectedVehicle ?? me);
  const displaySectors = $derived(vehicleSectors(displayCar));
  const displayLiveSector = $derived(liveCurrentSectorTime(displayCar));

  // #23 Racing thermal heatmap color (Celsius -> blue/cyan/green/orange/red)
  function tyreHeatColor(celsius: number): string {
    if (celsius < 58) return "#2563eb"; // frío azul
    if (celsius < 74) return "#06b6d4"; // templado cian
    if (celsius < 96) return "#22c55e"; // óptimo verde
    if (celsius < 108) return "#f59e0b"; // caliente ámbar
    return "#ef4444"; // sobrecalentado rojo
  }

  // #24 Tyre wear degradation per lap & laps until 30% critical threshold
  const tyreDegInfo = $derived.by(() => {
    const wheels = p?.wheels ?? [];
    const perLap = st?.tyreWearPerLap ?? [0, 0, 0, 0];
    const labels = ["FL", "FR", "RL", "RR"];
    const items = [0, 1, 2, 3].map((idx) => {
      const wearPct = (wheels[idx]?.wear ?? 1) * 100;
      const ratePct = Math.max(0, (perLap[idx] ?? 0) * 100);
      const lapsTo30 = ratePct > 0.05 ? Math.max(0, (wearPct - 30) / ratePct) : null;
      return { id: labels[idx], wearPct, ratePct, lapsTo30 };
    });
    const critical = items
      .filter((x) => x.lapsTo30 != null && x.lapsTo30 <= 12)
      .sort((a, b) => (a.lapsTo30 ?? 99) - (b.lapsTo30 ?? 99))[0] ?? null;
    return { items, critical };
  });

  // #29 Traffic / Lapped Car Predictor (closing cars ahead or faster class approaching from behind)
  const trafficAlerts = $derived.by(() => {
    const refCar = displayCar;
    const trackLen = s?.trackLength ?? 0;
    if (!refCar || trackLen < 500 || vehicles.length < 2) return [];
    const mySpeed = Math.max(15, refCar.speed ?? 0);
    const myClass = (refCar.class || "").toLowerCase();
    const classRank = (c: string) =>
      c.includes("hyper") || c.includes("lmh") || c.includes("lmdh") ? 3 : c.includes("lmp") ? 2 : 1;
    const myRank = classRank(myClass);

    const alerts: { kind: "catching" | "approaching"; car: Vehicle; etaSec: number; distM: number }[] = [];
    for (const v of vehicles) {
      if (v.id === refCar.id || v.inGarage || v.inPits) continue;
      const vRank = classRank((v.class || "").toLowerCase());
      if (vRank === myRank) continue;
      let diff = v.lapDist - refCar.lapDist;
      if (diff > trackLen / 2) diff -= trackLen;
      if (diff < -trackLen / 2) diff += trackLen;
      const vSpeed = Math.max(12, v.speed ?? 0);

      // Faster car catching slower class ahead
      if (myRank > vRank && diff > 25 && diff < 1200) {
        const closing = Math.max(3, mySpeed - vSpeed);
        const eta = diff / closing;
        if (eta <= 35) alerts.push({ kind: "catching", car: v, etaSec: eta, distM: diff });
      }
      // Slower car being caught by faster class from behind
      if (vRank > myRank && diff < -25 && diff > -1200) {
        const closing = Math.max(3, vSpeed - mySpeed);
        const eta = Math.abs(diff) / closing;
        if (eta <= 30) alerts.push({ kind: "approaching", car: v, etaSec: eta, distM: Math.abs(diff) });
      }
    }
    return alerts.sort((a, b) => a.etaSec - b.etaSec).slice(0, 4);
  });

  // #35 Penalized cars across the grid + player Track Limits
  const penalizedCars = $derived(
    sortedVehicles.filter((v) => (v.numPenalties ?? 0) > 0 || (v.penalties?.length ?? 0) > 0),
  );
  const playerTrackLimits = $derived.by(() => {
    if (!p || !p.trackLimitsStepsPerPenalty || !p.trackLimitsStepsPerPoint) return null;
    const have = p.trackLimitsSteps / p.trackLimitsStepsPerPoint;
    const max = p.trackLimitsStepsPerPenalty / p.trackLimitsStepsPerPoint;
    return { have, max, pct: Math.min(100, (have / Math.max(1, max)) * 100) };
  });

  // #28 Compound badge colors for Stint Timeline
  function compoundStyle(comp: string): { code: string; bg: string; fg: string } {
    const c = (comp || "").toLowerCase();
    if (c.includes("soft")) return { code: "S", bg: "#ef4444", fg: "#ffffff" };
    if (c.includes("hard")) return { code: "H", bg: "#e2e8f0", fg: "#0f172a" };
    if (c.includes("wet") || c.includes("rain")) return { code: "W", bg: "#3b82f6", fg: "#ffffff" };
    if (c.includes("inter")) return { code: "I", bg: "#22c55e", fg: "#000000" };
    return { code: "M", bg: "#facc15", fg: "#000000" };
  }
</script>

{#snippet posDiffBadge(v: Vehicle)}
  {@const start = v.qualification > 0 ? v.qualification : (startGridMap.get(v.id) ?? v.place)}
  {@const diff = start - v.place}
  <span
    class={[
      "inline-flex items-center gap-0.5 font-mono text-[10px] font-bold",
      diff > 0 ? "text-[#00ff66]" : diff < 0 ? "text-[#ff3b30]" : "text-white/40",
    ]}
  >
    {#if diff > 0}▲{diff}{:else if diff < 0}▼{Math.abs(diff)}{:else}–{/if}
  </span>
{/snippet}

{#snippet rightModuleBlock(modId: PitwallRightModuleId)}
  {#if modId === "trackmap" && (pitwallConfig.modules.trackmap || pitwallConfig.modules.weather)}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-3 shadow`}>
      <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
        <div>
          <div class="font-display text-sm font-black text-white">{s?.track || "Circuito"}</div>
          <div class="text-[10px] text-white/50">MAPA INTERACTIVO · CLIC EN COCHE PARA ENFOCAR</div>
        </div>
        <div class="font-mono text-sm font-bold" style:color={effectiveAccent}>
          {s?.timeOfDay ? timeOfDay(s.timeOfDay) : "12:00"}
        </div>
      </div>

      <div class="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
        {#if pitwallConfig.modules.trackmap}
          <div class="flex flex-col items-center">
            <PitWallTrackMap
              size={215}
              selectedVehicleId={selectedVehicleId}
              pinnedIds={pitwallConfig.pinnedIds}
              showPitRejoin={pitwallConfig.modules.pitRejoin}
              pitLossSec={pitwallConfig.pitLossSec}
              onSelectVehicle={(v) => focusDriver(v)}
            />
            {#if pitwallConfig.modules.pitRejoin && pitRejoinPrediction}
              <div class="mt-1.5 w-full rounded border border-cyan-400/40 bg-cyan-950/40 px-2 py-1 text-center font-mono text-[10px] text-cyan-300">
                ⬇ REJOIN (~{pitwallConfig.pitLossSec}s): <b class="text-white">P{pitRejoinPrediction.predictedPos}</b>
                {#if pitRejoinPrediction.carAhead}
                  <span class="text-white/60"> tras #{pitRejoinPrediction.carAhead.number || pitRejoinPrediction.carAhead.place}</span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if pitwallConfig.modules.weather}
          <div class="space-y-2 text-xs">
            <div class="flex items-center gap-2 rounded bg-black/40 p-2">
              <span class="text-2xl">{weatherIcon.icon}</span>
              <div>
                <div class="font-bold text-white">{weatherIcon.label}</div>
                <div class="text-[10px] text-white/50">{weatherIcon.desc}</div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-1.5 text-center font-mono text-[11px]">
              <div class="rounded bg-black/40 p-1.5">
                <div class="text-[8px] text-white/40 uppercase">PISTA / AMB</div>
                <div class="font-black text-white">
                  {Math.round(fmtTemp(weather?.trackTemp ?? 25))}° / {Math.round(fmtTemp(weather?.ambientTemp ?? 22))}°
                </div>
              </div>
              <div class="rounded bg-black/40 p-1.5">
                <div class="text-[8px] text-white/40 uppercase">VIENTO / WET</div>
                <div class="font-black text-white">
                  {Math.round(weather?.windSpeed ?? 0)}m/s · {Math.round((weather?.avgWetness ?? 0) * 100)}%
                </div>
              </div>
            </div>
            <div class="rounded border border-white/15 bg-black/40 p-2 text-[10px]">
              <div class="font-bold" style:color={effectiveAccent}>⏱️ Predicción (5-10m):</div>
              <div class="mt-0.5 font-medium text-white/90">{forecastEstimate.text}</div>
            </div>
          </div>
        {/if}
      </div>
    </div>

  {:else if modId === "battleCard" && pitwallConfig.modules.battleCard && activeBattle}
    {@const b = activeBattle}
    {@const paceDelta = b.refCar.lastLap > 0 && b.rival.lastLap > 0 ? b.rival.lastLap - b.refCar.lastLap : null}
    <div
      transition:fly={{ y: -8, duration: 200 }}
      class={`rounded-lg border p-3 shadow-lg ${b.role === "ATAQUE" ? "border-emerald-400/50 bg-emerald-950/25" : "border-rose-500/50 bg-rose-950/25"}`}
    >
      <div class="mb-2 flex items-center justify-between">
        <span class={["rounded px-2 py-0.5 font-display text-[10px] font-black tracking-wider uppercase", b.role === "ATAQUE" ? "bg-emerald-400 text-black" : "bg-rose-500 text-white"]}>
          ⚔️ DUELO DIRECTO · {b.role}
        </span>
        <span class="font-mono text-sm font-black text-white">
          {b.role === "ATAQUE" ? "-" : "+"}{b.gapSec.toFixed(2)}s
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div class="rounded bg-black/45 p-2 border-l-2" style:border-left-color={effectiveAccent}>
          <div class="truncate text-xs font-black text-white">P{b.refCar.place} #{b.refCar.number || b.refCar.id} {shortName(b.refCar.driver)}</div>
          <div class="mt-1 flex justify-between text-[10px] text-white/70">
            <span>Vel: <b class="text-white">{Math.round(fmtSpd(b.refCar.speed ?? 0))}</b></span>
            <span>VE: <b class="text-cyan-300">{Math.round(vePct(b.refCar.virtualEnergy ?? 0))}%</b></span>
          </div>
          <div class="mt-0.5 flex justify-between text-[10px] text-white/70">
            <span>Últ: <b class="text-white">{lapTime(b.refCar.lastLap)}</b></span>
            <span>Goma: <b>{Math.round((b.refCar.tyreWear ?? 1) * 100)}%</b></span>
          </div>
        </div>
        <div class="rounded bg-black/45 p-2 border-l-2 border-amber-400">
          <div class="truncate text-xs font-black text-white">P{b.rival.place} #{b.rival.number || b.rival.id} {shortName(b.rival.driver)}</div>
          <div class="mt-1 flex justify-between text-[10px] text-white/70">
            <span>Vel: <b class="text-white">{Math.round(fmtSpd(b.rival.speed ?? 0))}</b></span>
            <span>VE: <b class="text-cyan-300">{Math.round(vePct(b.rival.virtualEnergy ?? 0))}%</b></span>
          </div>
          <div class="mt-0.5 flex justify-between text-[10px] text-white/70">
            <span>Últ: <b class="text-white">{lapTime(b.rival.lastLap)}</b></span>
            <span>Goma: <b>{Math.round((b.rival.tyreWear ?? 1) * 100)}%</b></span>
          </div>
        </div>
      </div>
      {#if paceDelta != null}
        <div class="mt-1.5 text-center font-mono text-[10px] font-bold">
          Tendencia última vuelta:
          <span class={paceDelta > 0 ? "text-emerald-400" : "text-rose-400"}>
            {paceDelta > 0 ? `+${paceDelta.toFixed(2)}s más rápido` : `${Math.abs(paceDelta).toFixed(2)}s más lento`}
          </span>
        </div>
      {/if}
    </div>

  {:else if modId === "raceControl" && pitwallConfig.modules.raceControl}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-2.5 shadow`}>
      <div class="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black tracking-wider text-white/60 uppercase">🚩 RACE CONTROL · DIRECCIÓN DE CARRERA</span>
        <span class="font-mono text-[9px] text-white/40">{raceEvents.length} eventos</span>
      </div>
      <div class="max-h-28 space-y-1 overflow-y-auto pr-1 text-[10px]">
        {#each raceEvents as ev (ev.id)}
          <div
            transition:fly={{ x: -10, duration: 180 }}
            class="flex items-center gap-1.5 rounded bg-black/35 px-2 py-1"
          >
            <span class="shrink-0 font-mono text-[9px] text-white/40">{ev.time}</span>
            <span
              class={[
                "shrink-0 rounded px-1.5 py-0.2 font-mono text-[8px] font-black uppercase",
                ev.kind === "yellow" ? "bg-[#ffd400] text-black" :
                ev.kind === "green" ? "bg-emerald-500 text-black" :
                ev.kind === "purple" ? "bg-fuchsia-500 text-white" :
                ev.kind === "pit" ? "bg-cyan-500 text-black" :
                ev.kind === "penalty" ? "bg-red-600 text-white" :
                ev.kind === "rain" ? "bg-sky-400 text-black" :
                "bg-amber-400 text-black",
              ]}
            >
              {ev.badge}
            </span>
            <span class="truncate text-white/90">{ev.text}</span>
          </div>
        {:else}
          <div class="py-2 text-center text-[10px] text-white/40">Sin incidencias · Pista en condiciones normales</div>
        {/each}
      </div>
    </div>

  {:else if modId === "telemetryPedals" && pitwallConfig.modules.telemetryPedals}
    <div class={`grid grid-cols-3 gap-2 rounded-lg border ${themeMeta.card} p-3 shadow`}>
      <div class="flex items-end justify-center gap-2">
        <div class="flex flex-col items-center gap-1">
          <div class="flex h-20 w-3 items-end overflow-hidden rounded-full bg-white/10">
            <div class="w-full bg-blue-500 transition-all duration-75" style:height="{Math.round((p?.clutch ?? 0) * 100)}%"></div>
          </div>
          <span class="text-[8px] font-bold text-white/50">C</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <div class="flex h-20 w-4 items-end overflow-hidden rounded-full bg-white/10">
            <div class="w-full bg-[#ff3b30] shadow-[0_0_8px_#ff3b30] transition-all duration-75" style:height="{Math.round((p?.brake ?? 0) * 100)}%"></div>
          </div>
          <span class="text-[8px] font-bold text-[#ff3b30]">B</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <div class="flex h-20 w-4 items-end overflow-hidden rounded-full bg-white/10">
            <div class="w-full bg-[#00ff66] shadow-[0_0_8px_#00ff66] transition-all duration-75" style:height="{Math.round((p?.throttle ?? 0) * 100)}%"></div>
          </div>
          <span class="text-[8px] font-bold text-[#00ff66]">T</span>
        </div>
      </div>

      <div class="flex flex-col items-center justify-between rounded bg-black/40 p-2">
        <span class="text-[9px] font-bold text-white/40 uppercase">VELOCIDAD</span>
        <div class="flex flex-col items-center">
          <span class="font-mono text-2xl font-black text-white">{Math.round(fmtSpd(p?.speed ?? 0))}</span>
          <span class="text-[8px] font-semibold text-white/60">{spdUnitLabel()}</span>
        </div>
        <svg class="h-6 w-full overflow-hidden" viewBox="0 0 100 24">
          <path d={createSparkline(historySpeed, 100, 24)} fill="none" stroke="#00ff66" stroke-width="1.5" />
        </svg>
      </div>

      <div class="flex flex-col items-center justify-between rounded bg-black/40 p-2">
        <span class="text-[9px] font-bold text-white/40 uppercase">MARCHA / RPM</span>
        <div class="flex flex-col items-center">
          <span class="font-mono text-2xl font-black" style:color={effectiveAccent}>
            {p?.gear === 0 ? "N" : p?.gear === -1 ? "R" : p?.gear ?? "–"}
          </span>
          <span class="font-mono text-[9px] text-white/70">{Math.round(p?.rpm ?? 0)} RPM</span>
        </div>
        <svg class="h-6 w-full overflow-hidden" viewBox="0 0 100 24">
          <path d={createSparkline(historyRpm, 100, 24)} fill="none" stroke="#ffcc00" stroke-width="1.5" />
        </svg>
      </div>
    </div>

  {:else if modId === "trafficRadar" && pitwallConfig.modules.trafficRadar}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-2.5 shadow`}>
      <div class="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black tracking-wider text-white/60 uppercase">🚦 PREDICTOR DE TRÁFICO / DOBLADOS</span>
        <span class="font-mono text-[9px] text-white/40">{trafficAlerts.length} alertas</span>
      </div>
      {#if trafficAlerts.length > 0}
        <div class="space-y-1 text-[10px]">
          {#each trafficAlerts as al (al.car.id)}
            <button
              type="button"
              class={[
                "flex w-full items-center justify-between rounded px-2 py-1 text-left transition cursor-pointer",
                al.kind === "approaching"
                  ? "border border-sky-400/50 bg-sky-950/40 text-sky-200 hover:bg-sky-900/50"
                  : "border border-amber-400/40 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40",
              ]}
              onclick={() => focusDriver(al.car)}
            >
              <span class="truncate">
                {al.kind === "approaching" ? "🔵 Viene" : "⚡ Alcanzas"}
                <b> #{al.car.number || al.car.id} {shortName(al.car.driver)}</b>
                <span class="opacity-70"> ({(al.car.class || "").slice(0, 5)})</span>
              </span>
              <span class="ml-2 shrink-0 font-mono font-black text-white">~{Math.max(1, Math.round(al.etaSec))}s</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="py-1.5 text-center text-[10px] text-emerald-400/80">✓ Aire limpio · Sin tráfico multiclase cercano</div>
      {/if}
    </div>

  {:else if modId === "penalties" && pitwallConfig.modules.penalties}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-2.5 shadow`}>
      <div class="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black tracking-wider text-white/60 uppercase">⚖️ PENALIZACIONES & TRACK LIMITS</span>
        <span class="font-mono text-[9px] text-amber-300">{penalizedCars.length} activas</span>
      </div>
      {#if playerTrackLimits}
        <div class="mb-2 rounded bg-black/40 p-1.5">
          <div class="mb-0.5 flex justify-between font-mono text-[9px] font-bold">
            <span class="text-white/60">TUS TRACK LIMITS</span>
            <span class={playerTrackLimits.pct >= 75 ? "text-red-400" : "text-amber-300"}>
              {playerTrackLimits.have.toFixed(1)} / {playerTrackLimits.max.toFixed(0)} pts
            </span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full transition-all"
              style:width="{playerTrackLimits.pct}%"
              style:background={playerTrackLimits.pct >= 75 ? "#ef4444" : "#f59e0b"}
            ></div>
          </div>
        </div>
      {/if}
      {#if penalizedCars.length > 0}
        <div class="max-h-24 space-y-1 overflow-y-auto text-[10px]">
          {#each penalizedCars as pv (pv.id)}
            <button
              type="button"
              class="flex w-full items-center justify-between rounded border border-red-500/35 bg-red-950/30 px-2 py-1 text-left hover:bg-red-900/40 cursor-pointer"
              onclick={() => focusDriver(pv)}
            >
              <span class="truncate font-bold text-white">P{pv.place} #{pv.number || pv.id} {shortName(pv.driver)}</span>
              <span class="ml-2 shrink-0 rounded bg-red-600 px-1.5 py-0.2 font-mono text-[9px] font-black text-white">
                {pv.penalties?.[0]?.kind === "stopAndGo" ? "S&G" : pv.penalties?.[0]?.kind === "driveThrough" ? "DT" : `${pv.numPenalties} PEN`}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="py-1 text-center text-[10px] text-white/40">Sin coches con penalización pendiente</div>
      {/if}
    </div>

  {:else if modId === "stintTimeline" && pitwallConfig.modules.stintTimeline}
    {@const timelineCars = sortedVehicles.filter((v, i) => i < 6 || v.isPlayer || v.id === selectedVehicleId || pitwallConfig.pinnedIds.includes(v.id)).slice(0, 8)}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-2.5 shadow`}>
      <div class="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black tracking-wider text-white/60 uppercase">📊 LÍNEA TEMPORAL DE STINTS</span>
        <span class="font-mono text-[9px] text-white/40">Compuesto · Vueltas</span>
      </div>
      <div class="space-y-1 text-[10px]">
        {#each timelineCars as tc (tc.id)}
          {@const stints = stintHistory[tc.id] ?? [{ compound: tc.tyreCompounds?.[0] || "M", laps: Math.max(1, tc.tyreLaps ?? 1) }]}
          <div class="flex items-center gap-1.5">
            <span class="w-16 shrink-0 truncate font-mono text-[9px] font-bold text-white/80">
              P{tc.place} #{tc.number || tc.id}
            </span>
            <div class="flex flex-1 items-center gap-1 overflow-hidden">
              {#each stints as stItem, si (si)}
                {@const cs = compoundStyle(stItem.compound)}
                <div
                  class="flex h-4 items-center justify-center rounded px-1.5 font-mono text-[9px] font-black shadow-sm"
                  style:flex={Math.max(1, stItem.laps)}
                  style:background={cs.bg}
                  style:color={cs.fg}
                  title="{stItem.compound} · {stItem.laps} vueltas"
                >
                  {cs.code}·{stItem.laps}L
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

  {:else if modId === "tyres" && pitwallConfig.modules.tyres}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-3 shadow`}>
      <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black text-white/50 uppercase">🛞 MAPA CALOR NEUMÁTICOS & DEGRADACIÓN</span>
        <span class="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white">
          {p?.frontCompound || "MEDIUM"}
        </span>
      </div>
      {#if tyreDegInfo.critical}
        <div class="mb-2 rounded border border-amber-400/50 bg-amber-950/40 px-2 py-1 text-center font-mono text-[10px] font-bold text-amber-300">
          ⚠️ {tyreDegInfo.critical.id} crítico (&lt;30%) en ~{tyreDegInfo.critical.lapsTo30?.toFixed(1)} vtas (-{tyreDegInfo.critical.ratePct.toFixed(1)}%/vta)
        </div>
      {/if}
      <div class="grid grid-cols-2 gap-2 font-mono text-xs">
        {#each [
          { id: "FL", idx: 0 },
          { id: "FR", idx: 1 },
          { id: "RL", idx: 2 },
          { id: "RR", idx: 3 },
        ] as wheel (wheel.id)}
          {@const w = p?.wheels?.[wheel.idx]}
          {@const deg = tyreDegInfo.items[wheel.idx]}
          {@const t0 = w?.surfaceTemp?.[0] ?? 86}
          {@const t1 = w?.surfaceTemp?.[1] ?? 85}
          {@const t2 = w?.surfaceTemp?.[2] ?? 84}
          <div class="rounded border border-white/10 bg-black/45 p-2">
            <div class="flex items-center justify-between text-[10px]">
              <span class="font-black text-white/70">{wheel.id}</span>
              <span class={deg.wearPct < 35 ? "font-black text-red-400" : deg.wearPct < 60 ? "text-amber-300" : "text-emerald-300"}>
                {Math.round(deg.wearPct)}%
              </span>
            </div>
            <!-- #23 3-Band Thermal Heatmap (Inner / Mid / Outer) -->
            <div class="my-1.5 grid grid-cols-3 gap-0.5 overflow-hidden rounded">
              <div class="py-1 text-center text-[9px] font-black text-black" style:background={tyreHeatColor(t0)}>
                {Math.round(fmtTemp(t0))}°
              </div>
              <div class="py-1 text-center text-[9px] font-black text-black" style:background={tyreHeatColor(t1)}>
                {Math.round(fmtTemp(t1))}°
              </div>
              <div class="py-1 text-center text-[9px] font-black text-black" style:background={tyreHeatColor(t2)}>
                {Math.round(fmtTemp(t2))}°
              </div>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm font-black text-white">
                {fmtPress(w?.pressure ?? 190).toFixed(pitwallConfig.units.pressure === "bar" ? 2 : 1)}
                <span class="text-[8px] font-normal text-white/40">{pressUnitLabel()}</span>
              </span>
              <span class="text-[9px] text-orange-400">{Math.round(fmtTemp(w?.brakeTemp ?? 450))}°</span>
            </div>
            <!-- #24 Wear rate & estimated laps left -->
            <div class="mt-0.5 flex items-center justify-between text-[8px] text-white/55">
              <span>{deg.ratePct > 0.05 ? `-${deg.ratePct.toFixed(1)}%/vta` : "Estable"}</span>
              <span>{deg.lapsTo30 != null ? `~${deg.lapsTo30.toFixed(0)}L >30%` : ""}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>

  {:else if modId === "tyreHistory" && pitwallConfig.modules.tyreHistory}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-3 shadow`}>
      <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black text-white/50 uppercase">TYRE HISTORY PRESSURE</span>
        <div class="flex items-center gap-2 font-mono text-[9px] font-bold">
          <span class="text-[#ff3b30]">FL {fmtPress(p?.wheels?.[0]?.pressure ?? 190).toFixed(1)}</span>
          <span class="text-[#ff9500]">FR {fmtPress(p?.wheels?.[1]?.pressure ?? 190).toFixed(1)}</span>
          <span class="text-[#007aff]">RL {fmtPress(p?.wheels?.[2]?.pressure ?? 190).toFixed(1)}</span>
          <span class="text-[#af52de]">RR {fmtPress(p?.wheels?.[3]?.pressure ?? 190).toFixed(1)}</span>
        </div>
      </div>
      <div class="relative h-20 w-full overflow-hidden rounded bg-black/40 p-1">
        <svg class="h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
          <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
          <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
          <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
          <path d={createSparkline(historyTirePressures.fl, 100, 40)} fill="none" stroke="#ff3b30" stroke-width="1.2" />
          <path d={createSparkline(historyTirePressures.fr, 100, 40)} fill="none" stroke="#ff9500" stroke-width="1.2" />
          <path d={createSparkline(historyTirePressures.rl, 100, 40)} fill="none" stroke="#007aff" stroke-width="1.2" />
          <path d={createSparkline(historyTirePressures.rr, 100, 40)} fill="none" stroke="#af52de" stroke-width="1.2" />
        </svg>
      </div>
    </div>

  {:else if modId === "damage" && pitwallConfig.modules.damage}
    <div class={`flex flex-col rounded-lg border ${themeMeta.card} p-3 shadow`}>
      <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
        <span class="text-[10px] font-black text-white/50 uppercase">DAMAGE STATE</span>
        <span class="text-[10px] font-bold text-[#00ff66]">
          {(p?.damage?.aero ?? 0) === 0 ? "Aero OK" : `Aero -${Math.round((p?.damage?.aero ?? 0) * 100)}%`}
        </span>
      </div>
      <div class="flex items-center justify-around">
        <Damage opts={{ showCar: true }} units={widgetUnits} edit={false} />
      </div>
    </div>
  {/if}
{/snippet}

{#snippet leaderboardPanel()}
  <div class={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border ${themeMeta.card} shadow-md`}>
    <!-- Header + Class Filters -->
    <div class="flex h-8 shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-3 text-[10px] font-bold text-white/60">
      <div class="flex items-center gap-2">
        <span class="tracking-wider uppercase">LEADERBOARD ({filteredVehicles.length}/{vehicles.length})</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class={["rounded px-1.5 py-0.5 text-[9px] font-bold transition cursor-pointer", selectedClass === "ALL" ? "bg-accent text-white" : "bg-white/10 text-white/60 hover:text-white"]}
            onclick={() => (selectedClass = "ALL")}
          >TODAS</button>
          {#each availableClasses as c (c)}
            <button
              type="button"
              class={["rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition cursor-pointer", selectedClass === c ? "bg-accent text-white" : "bg-white/10 text-white/60 hover:text-white"]}
              onclick={() => (selectedClass = c)}
            >{c.slice(0, 8)}</button>
          {/each}
        </div>
      </div>
      <span class="hidden text-[9px] text-white/40 sm:inline">Clic = Enfocar · ★ = Vigilar rival</span>
    </div>

    <!-- #14 Pinned / Watched Rivals Strip -->
    {#if pitwallConfig.modules.pinnedStrip && pinnedVehicles.length > 0}
      <div class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-amber-400/25 bg-amber-950/20 px-2.5 py-1 text-[10px]">
        <span class="shrink-0 font-display text-[9px] font-black tracking-wider text-amber-400 uppercase">★ VIGILADOS:</span>
        {#each pinnedVehicles as pv (pv.id)}
          <button
            type="button"
            class="flex shrink-0 items-center gap-1.5 rounded border border-amber-400/35 bg-black/50 px-2 py-0.5 font-mono text-[10px] hover:border-amber-300 cursor-pointer"
            onclick={() => focusDriver(pv)}
          >
            <span class="font-black text-amber-300">P{pv.place}</span>
            <span class="font-bold text-white">#{pv.number || pv.id} {shortName(pv.driver)}</span>
            {#if pv.inPits}
              <span class="rounded bg-red-600 px-1 text-[8px] font-black text-white animate-pulse">PIT</span>
            {:else}
              <span class="text-cyan-300">{Math.round(vePct(pv.virtualEnergy ?? 0))}%VE</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Table Header -->
    <div class="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#121926]/90 px-2 py-1 text-[10px] font-extrabold text-white/60 uppercase">
      <span class="w-4 text-center">★</span>
      <span class="w-8 text-center">POS</span>
      {#if pitwallConfig.columns.diff}<span class="w-9 text-center">DIFF</span>{/if}
      {#if pitwallConfig.columns.cls}<span class="w-11 text-center">CLS</span>{/if}
      <span class="min-w-[110px] flex-1">DRIVER / TEAM</span>
      {#if pitwallConfig.columns.pit}<span class="w-28 text-center">PIT / CRONO</span>{/if}
      {#if pitwallConfig.columns.ve}<span class="w-20 text-center">VE / STINT</span>{/if}
      {#if pitwallConfig.columns.lap}<span class="w-9 text-center">LAP</span>{/if}
      {#if pitwallConfig.columns.gap}<span class="w-14 text-right">GAP</span>{/if}
      {#if pitwallConfig.columns.interval}<span class="w-13 text-right">INT</span>{/if}
      {#if pitwallConfig.columns.bestLap}<span class="w-17 text-center">BEST</span>{/if}
      {#if pitwallConfig.columns.lastLap}<span class="w-17 text-center">LAST</span>{/if}
      {#if pitwallConfig.columns.sectors}
        <span class="w-14 text-right">S1</span>
        <span class="w-14 text-right">S2</span>
        <span class="w-14 text-right">S3</span>
      {/if}
    </div>

    <!-- Rows with #6 FLIP animation, #8 Lap flash, #9 Live Pit Chrono, #18 VE/Stint & #5 Rejoin Marker -->
    <div class="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
      {#each filteredVehicles as v, idx (v.id)}
        {@const mate = isTeammate(v, teammates)}
        {@const isPinned = pitwallConfig.pinnedIds.includes(v.id)}
        {@const isSelected = selectedVehicleId === v.id}
        {@const isClassBest = overallBest > 0 && v.bestLap > 0 && v.bestLap <= overallBest + 1e-4}
        {@const prevCar = idx > 0 ? filteredVehicles[idx - 1] : null}
        {@const gapInt = prevCar ? Math.max(0, v.timeBehindLeader - prevCar.timeBehindLeader) : 0}
        {@const pitRec = pitRecords[v.id]}
        {@const pFlash = posFlash[v.id] && posFlash[v.id].until > Date.now() ? posFlash[v.id].dir : null}
        {@const lFlash = lapFlash[v.id] && lapFlash[v.id].until > Date.now() ? lapFlash[v.id].kind : null}
        {@const veVal = vePct(v.virtualEnergy ?? 0)}

        <div animate:flip={{ duration: 280 }}>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            role="button"
            tabindex="0"
            class={[
              "flex cursor-pointer items-center gap-1 px-2 transition-colors select-none",
              densityRowClass,
              v.isPlayer
                ? "border-l-4 bg-accent/25 font-bold text-white"
                : isSelected
                  ? "border-l-4 border-cyan-400 bg-cyan-500/20 text-white"
                  : isPinned
                    ? "border-l-2 border-amber-400 bg-amber-500/10"
                    : mate
                      ? "border-l-2 border-accent/60 bg-accent/10"
                      : idx % 2 === 1 ? "bg-white/[0.02]" : "bg-transparent",
              pFlash === "up" && "pw-flash-up",
              pFlash === "down" && "pw-flash-down",
              lFlash === "purple" && "pw-flash-purple",
              lFlash === "green" && "pw-flash-green",
              "hover:bg-white/10",
            ]}
            style:border-left-color={v.isPlayer ? effectiveAccent : undefined}
            onclick={() => focusDriver(v)}
            title="Haz clic para enfocar este piloto"
          >
            <!-- #14 Star Pin Button -->
            <button
              type="button"
              class={["w-4 text-center text-xs transition cursor-pointer", isPinned ? "text-amber-400" : "text-white/20 hover:text-amber-300"]}
              title={isPinned ? "Dejar de vigilar rival" : "Vigilar rival (fijar arriba y en mapa)"}
              onclick={(e) => togglePin(v.id, e)}
            >★</button>

            <!-- Pos -->
            <div class="flex w-8 justify-center">
              <span
                class="flex h-5 w-6 items-center justify-center rounded text-[10px] font-black text-white"
                style:background={v.isPlayer ? effectiveAccent : classColor(v.class)}
              >
                {v.place}
              </span>
            </div>

            {#if pitwallConfig.columns.diff}
              <div class="w-9 text-center">{@render posDiffBadge(v)}</div>
            {/if}

            {#if pitwallConfig.columns.cls}
              <div class="flex w-11 justify-center">
                <span class="rounded px-1 py-0.5 text-[9px] font-black tracking-wider text-white uppercase" style:background={classColor(v.class)}>
                  {(v.class || "LMU").slice(0, 3)}
                </span>
              </div>
            {/if}

            <!-- Driver -->
            <div class="flex min-w-[110px] flex-1 items-center gap-1.5 overflow-hidden">
              {#if mate}
                <img src="/mdt-logo.png" alt="MDT" class="h-3 w-3 shrink-0 object-contain" />
              {/if}
              <span class="text-[10px] font-bold text-white/50">#{v.number || v.id}</span>
              <span class="truncate font-semibold text-white">{shortName(v.driver)}</span>
              {#if isSelected}
                <span class="rounded bg-cyan-400/25 px-1 text-[8px] font-black text-cyan-300">CAM</span>
              {/if}
            </div>

            <!-- #9 Live Pit Lane + Stationary Stop Chronometer -->
            {#if pitwallConfig.columns.pit}
              <div class="w-28 text-center font-mono text-[10px]">
                {#if v.inPits}
                  {@const curT = pitRec?.currentDuration ?? 0}
                  {@const stopT = pitRec?.stopDuration ?? 0}
                  <span class="inline-flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse">
                    PIT {curT.toFixed(0)}s{#if stopT > 0.5}<span class="text-amber-200">({stopT.toFixed(0)}s)</span>{/if}
                  </span>
                {:else if (pitRec?.lastPitDuration ?? 0) > 0}
                  <span class="font-bold text-white/90">
                    {v.numPitstops}P <span style:color={effectiveAccent}>({pitRec!.lastPitDuration.toFixed(0)}s)</span>
                  </span>
                {:else}
                  <span class="text-white/55">{v.numPitstops ?? 0}P · {v.tyreLaps ?? 0}L</span>
                {/if}
              </div>
            {/if}

            <!-- #18 Virtual Energy & Stint Age -->
            {#if pitwallConfig.columns.ve}
              <div class="flex w-20 flex-col items-center justify-center px-1 font-mono text-[9px]">
                {#if veVal > 0.5}
                  <div class="flex w-full items-center justify-between leading-none">
                    <span class={veVal < 15 ? "font-black text-red-400" : veVal < 35 ? "text-amber-300" : "text-emerald-300"}>
                      {Math.round(veVal)}%
                    </span>
                    <span class="text-[8px] text-white/50">{estVeLaps(v)}</span>
                  </div>
                  <div class="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      class="h-full transition-all duration-300"
                      style:width="{Math.min(100, veVal)}%"
                      style:background={veVal < 15 ? "#ef4444" : veVal < 35 ? "#f59e0b" : "#10b981"}
                    ></div>
                  </div>
                {:else}
                  <span class="text-white/40">{v.tyreLaps ?? 0}L stint</span>
                {/if}
              </div>
            {/if}

            {#if pitwallConfig.columns.lap}
              <div class="w-9 text-center font-mono text-white/80">L{v.totalLaps}</div>
            {/if}

            {#if pitwallConfig.columns.gap}
              <div class="w-14 text-right font-mono text-white/90">
                {idx === 0 ? "Líder" : `+${v.timeBehindLeader.toFixed(2)}`}
              </div>
            {/if}

            {#if pitwallConfig.columns.interval}
              <div class="w-13 text-right font-mono text-white/70">
                {idx === 0 ? "–" : `+${gapInt.toFixed(2)}`}
              </div>
            {/if}

            {#if pitwallConfig.columns.bestLap}
              <div class={["w-17 text-center font-mono font-bold", isClassBest ? "text-[#ff00ff]" : v.bestLap > 0 ? "text-[#00ff66]" : "text-white/40"]}>
                {lapTime(v.bestLap)}
              </div>
            {/if}

            {#if pitwallConfig.columns.lastLap}
              <div class={["w-17 text-center font-mono font-bold", lFlash === "purple" ? "text-[#ff00ff]" : lFlash === "green" ? "text-[#00ff66]" : "text-white/90"]}>
                {lapTime(v.lastLap)}
              </div>
            {/if}

            {#if pitwallConfig.columns.sectors}
              {@const [sec1, sec2, sec3] = vehicleSectors(v)}
              <div class="w-14 text-right font-mono text-[10px] text-white/85 tabular-nums">{sec1 > 0 ? sec1.toFixed(3) : "-"}</div>
              <div class="w-14 text-right font-mono text-[10px] text-white/85 tabular-nums">{sec2 > 0 ? sec2.toFixed(3) : "-"}</div>
              <div class="w-14 text-right font-mono text-[10px] text-white/85 tabular-nums">{sec3 > 0 ? sec3.toFixed(3) : "-"}</div>
            {/if}
          </div>

          <!-- #5 Pit Rejoin Ghost Row inside Leaderboard -->
          {#if pitwallConfig.modules.pitRejoin && pitRejoinPrediction && pitRejoinPrediction.afterCarId === v.id && v.id !== pitRejoinPrediction.targetId}
            <div class="flex items-center justify-between border-y border-dashed border-cyan-400/60 bg-cyan-950/35 px-3 py-0.5 font-mono text-[10px] text-cyan-300">
              <span>⬇ REJOIN ESTIMADO TRAS BOX (~{pitwallConfig.pitLossSec}s) → <b class="text-white">P{pitRejoinPrediction.predictedPos}</b></span>
              <span class="text-[9px] text-cyan-200/75">
                Detrás de #{v.number || v.id} {shortName(v.driver)}
              </span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<div
  bind:this={rootEl}
  translate="no"
  style:--color-accent={effectiveAccent}
  class={[
    "notranslate font-sans text-white select-none",
    fontScaleClass,
    themeMeta.bg,
    embedded ? "flex h-full w-full flex-col overflow-y-auto" : "flex h-dvh w-dvw flex-col overflow-hidden",
    flagBanner ? `border-[3px] ${flagBanner.borderClass}` : batteryFull ? "border-[3px] border-[#00ff66]" : "",
  ]}
>
  <!-- =========================================================================
       #7 BANNER CINEMATOGRÁFICO DE BANDERAS Y ESTADO DE PISTA
       ========================================================================= -->
  {#if flagBanner}
    <div
      transition:fly={{ y: -28, duration: 220 }}
      class={`pw-flag-banner relative flex shrink-0 items-center justify-between overflow-hidden px-4 py-1.5 font-display text-xs font-black tracking-widest uppercase ${flagBanner.bgClass}`}
    >
      <span class="z-10">{flagBanner.title}</span>
      <span class="z-10 hidden font-sans text-[11px] font-bold opacity-85 sm:inline">{flagBanner.subtitle}</span>
    </div>
  {/if}

  <!-- #40 Floating Exit Zen Mode Button -->
  {#if pitwallConfig.zenMode}
    <button
      type="button"
      class="fixed top-2 right-2 z-50 rounded-full border border-white/25 bg-black/75 px-3 py-1 text-[10px] font-bold text-white/80 opacity-40 backdrop-blur-md transition hover:opacity-100 cursor-pointer"
      onclick={() => {
        pitwallConfig.zenMode = false;
        saveConfig();
      }}
    >
      🧘 Salir Modo Zen
    </button>
  {/if}

  <!-- =========================================================================
       BARRA DE ESTADO SUPERIOR
       ========================================================================= -->
  {#if pitwallConfig.modules.header && !pitwallConfig.zenMode}
    <header class={`flex h-13 shrink-0 items-center justify-between border-b ${themeMeta.header} px-3.5 shadow-lg`}>
      <div class="flex items-center gap-4 lg:gap-6">
        <div class="flex items-center gap-2">
          <span class="rounded bg-white/10 px-2 py-0.5 text-xs font-black tracking-wider uppercase">
            {s?.kind === "race" ? "RACE" : s?.kind === "qualify" ? "QUALIFY" : "PRACTICE"}
          </span>
          <span class="font-mono text-lg font-black text-white">
            L{me?.totalLaps ?? 0}{s?.maxLaps ? `/${s.maxLaps}` : ""}
          </span>
        </div>

        <div class="flex flex-col">
          <span class="text-[8px] font-bold tracking-widest text-white/50 uppercase">POSITION</span>
          <span class="font-mono text-lg font-black leading-none text-white">
            {me?.place ?? 1}<span class="text-xs font-normal text-white/40">/{vehicles.length || 1}</span>
          </span>
        </div>

        <div class="flex flex-col">
          <span class="text-[8px] font-bold tracking-widest text-white/50 uppercase">TIME LEFT</span>
          <span class="font-mono text-lg font-black leading-none text-white">
            {s ? clock(s.timeRemaining) : "–"}
          </span>
        </div>

        <div class="hidden items-center gap-4 xl:flex">
          <div class="flex flex-col">
            <span class="text-[8px] font-bold tracking-widest text-white/50 uppercase">LAST LAP</span>
            <span class="font-mono text-base font-bold leading-none text-[#ff00ff]">{lapTime(me?.lastLap ?? 0)}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-[8px] font-bold tracking-widest text-white/50 uppercase">BEST LAP</span>
            <span class="font-mono text-base font-bold leading-none text-[#00ff66]">{lapTime(me?.bestLap ?? 0)}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-[8px] font-bold tracking-widest text-white/50 uppercase">OVERALL BEST</span>
            <span class="font-mono text-base font-bold leading-none text-[#00e5ff]">{lapTime(overallBest)}</span>
          </div>
        </div>
      </div>

      <!-- Controls: #34 Auto-Director + #3 3 Modes + #38 Lap Log + #39 Discord + #40 Lock/Zen + #20 Anti-Sleep -->
      <div class="flex items-center gap-1">
        {#if focusStatusMsg}
          <span transition:fade={{ duration: 150 }} class="hidden rounded bg-cyan-500/20 px-2 py-1 text-[10px] font-bold text-cyan-300 xl:inline">
            {focusStatusMsg}
          </span>
        {/if}

        <!-- #34 Auto-Director con selector de categoría -->
        <div class="hidden items-center gap-0.5 rounded-lg border border-white/15 bg-black/55 p-0.5 text-[10px] font-bold md:flex">
          <button
            type="button"
            disabled={pitwallConfig.locked}
            class={[
              "rounded px-1.5 py-1 transition cursor-pointer disabled:opacity-40",
              pitwallConfig.autoDirector.enabled
                ? mainDriverOnTrack
                  ? "bg-amber-500/30 text-amber-200"
                  : "bg-red-600 text-white animate-pulse"
                : "text-white/60 hover:text-white",
            ]}
            title={mainDriverOnTrack ? "Auto-Director pausado mientras conduces en pista" : "Activar/desactivar Auto-Director de cámara"}
            onclick={() => {
              pitwallConfig.autoDirector.enabled = !pitwallConfig.autoDirector.enabled;
              saveConfig();
            }}
          >
            🎬 {pitwallConfig.autoDirector.enabled ? (mainDriverOnTrack ? "PAUSA" : "AUTO") : "Dir"}
          </button>
          {#if pitwallConfig.autoDirector.enabled}
            <select
              class="rounded bg-black/70 px-1 py-0.5 text-[10px] font-bold text-white outline-none"
              bind:value={pitwallConfig.autoDirector.category}
              onchange={saveConfig}
              title="Categoría a enfocar en Auto-Director"
            >
              <option value="ALL">Todas</option>
              {#each availableClasses as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
          {/if}
        </div>

        <div class="flex rounded-lg border border-white/15 bg-black/60 p-0.5 text-[11px] font-bold">
          <button
            type="button"
            class={["rounded px-2 py-1 transition cursor-pointer", viewMode === "lovely" ? "bg-accent text-white" : "text-white/60 hover:text-white"]}
            onclick={() => setViewMode("lovely")}
          >🖥️ Lovely</button>
          <button
            type="button"
            class={["rounded px-2 py-1 transition cursor-pointer", viewMode === "engineer" ? "bg-accent text-white" : "text-white/60 hover:text-white"]}
            onclick={() => setViewMode("engineer")}
          >🧠 Ingeniero</button>
          <button
            type="button"
            class={["rounded px-2 py-1 transition cursor-pointer", viewMode === "tablet" ? "bg-accent text-white" : "text-white/60 hover:text-white"]}
            onclick={() => setViewMode("tablet")}
          >📱 Tablet</button>
        </div>

        <!-- #38 Lap Log & #39 Copy Discord -->
        <button
          type="button"
          class="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
          title="Registro completo de vueltas y exportar CSV / Discord"
          onclick={() => (showLapLogModal = true)}
        >📜</button>

        <button
          type="button"
          class="hidden rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-2 py-1 text-[11px] font-bold text-indigo-200 hover:bg-indigo-500/35 cursor-pointer sm:inline-block"
          title="Copiar resumen de carrera formateado para Discord"
          onclick={copyDiscordReport}
        >📋</button>

        <!-- #40 Lock Layout & Zen Mode -->
        <button
          type="button"
          class={[
            "rounded-lg border px-2 py-1 text-[11px] font-bold transition cursor-pointer",
            pitwallConfig.locked ? "border-amber-400/60 bg-amber-500/25 text-amber-300" : "border-white/15 bg-white/10 text-white/60 hover:text-white",
          ]}
          title={pitwallConfig.locked ? "Desbloquear edición del Pit Wall" : "Bloquear toques accidentales (Lock Layout)"}
          onclick={() => {
            pitwallConfig.locked = !pitwallConfig.locked;
            saveConfig();
          }}
        >{pitwallConfig.locked ? "🔒" : "🔓"}</button>

        <button
          type="button"
          class="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-white/75 hover:bg-white/20 hover:text-white cursor-pointer"
          title="Modo Zen (ocultar barra superior)"
          onclick={() => {
            pitwallConfig.zenMode = true;
            saveConfig();
          }}
        >🧘</button>

        <button
          type="button"
          class={[
            "rounded-lg border px-2 py-1 text-[11px] font-bold transition cursor-pointer",
            wakeLockActive ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300" : "border-white/15 bg-white/10 text-white/60 hover:text-white",
          ]}
          title={wakeLockActive ? "Pantalla siempre encendida ACTIVA" : "Activar pantalla siempre encendida"}
          onclick={toggleWakeLock}
        >☀️</button>

        <button
          type="button"
          disabled={pitwallConfig.locked}
          class="flex items-center gap-1 rounded-lg border border-accent/50 bg-accent/25 px-2.5 py-1 text-[11px] font-bold text-white shadow transition hover:bg-accent disabled:opacity-40 cursor-pointer"
          onclick={() => (showCustomizeModal = true)}
        >
          <span>⚙️</span>
          <span class="hidden lg:inline">Personalizar</span>
        </button>

        <button
          type="button"
          class="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20 cursor-pointer"
          onclick={toggleFullscreen}
          title="Pantalla Completa"
        >⛶</button>
      </div>
    </header>
  {/if}

  <!-- =========================================================================
       MODO 1: LOVELY PITWALL (CON SEPARADOR ARRASTRABLE #11 Y PANELES REORDENABLES)
       ========================================================================= -->
  {#if viewMode === "lovely"}
    <main
      bind:this={mainSplitEl}
      class={["flex min-h-0 flex-1 flex-col gap-2 p-2.5 lg:flex-row lg:gap-0", embedded ? "overflow-y-auto" : "overflow-hidden"]}
    >
      <!-- Left Column -->
      <div
        class="flex h-full min-h-0 flex-col gap-2 overflow-hidden"
        style:flex="0 0 {pitwallConfig.splitPct}%"
      >
        {#if pitwallConfig.modules.leaderboard}
          {@render leaderboardPanel()}
        {/if}

        <!-- TRACK RELATIVE BAR -->
        {#if pitwallConfig.modules.relativeBar}
          <div class={`flex h-10 shrink-0 items-center justify-between rounded-lg border ${themeMeta.card} px-3 font-mono text-xs shadow`}>
            <div class="flex items-center gap-2">
              {#if relativeRivals.behind}
                <span class="rounded px-1.5 py-0.5 text-[10px] font-black text-white uppercase" style:background={classColor(relativeRivals.behind.class)}>
                  {(relativeRivals.behind.class || "LMU").slice(0, 3)}
                </span>
                <span class="font-bold text-white">{shortName(relativeRivals.behind.driver)}</span>
                <span class="font-black text-[#00ff66]">
                  +{(relativeRivals.behind.timeBehindLeader - (me?.timeBehindLeader ?? 0)).toFixed(2)}s
                </span>
              {:else}
                <span class="text-white/40">– Sin rival detrás</span>
              {/if}
            </div>
            <span class="text-[10px] font-black tracking-widest text-white/40 uppercase">◄ RELATIVE ►</span>
            <div class="flex items-center gap-2">
              {#if relativeRivals.ahead}
                <span class="font-black text-[#ff3b30]">
                  -{((me?.timeBehindLeader ?? 0) - relativeRivals.ahead.timeBehindLeader).toFixed(2)}s
                </span>
                <span class="font-bold text-white">{shortName(relativeRivals.ahead.driver)}</span>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-black text-white uppercase" style:background={classColor(relativeRivals.ahead.class)}>
                  {(relativeRivals.ahead.class || "LMU").slice(0, 3)}
                </span>
              {:else}
                <span class="text-white/40">– Líder absoluto</span>
              {/if}
            </div>
          </div>
        {/if}

        <!-- BOTTOM TELEMETRY ROW -->
        {#if pitwallConfig.modules.bottomTelemetry}
          <div class="grid h-34 shrink-0 grid-cols-2 gap-2 xl:grid-cols-4">
            <div class={`flex flex-col justify-between rounded-lg border ${themeMeta.card} p-2`}>
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">LAP TIMES</span>
                {#if displayCar}
                  <span class="truncate text-[9px] font-bold text-cyan-300">#{displayCar.number || displayCar.id}</span>
                {/if}
              </div>
              <div class="space-y-0.5">
                <div class="flex items-baseline justify-between">
                  <span class="text-[9px] text-white/40">EST</span>
                  <span class="font-mono text-base font-black text-[#ffcc00]">{lapTime(displayCar?.estimatedLapTime ?? 0)}</span>
                </div>
                <div class="flex items-baseline justify-between">
                  <span class="text-[9px] text-white/40">LAST</span>
                  <span class="font-mono text-sm font-bold text-[#ff00ff]">{lapTime(displayCar?.lastLap ?? 0)}</span>
                </div>
                <div class="flex items-baseline justify-between">
                  <span class="text-[9px] text-white/40">BEST</span>
                  <span class="font-mono text-sm font-bold text-[#00ff66]">{lapTime(displayCar?.bestLap ?? 0)}</span>
                </div>
              </div>
            </div>

            <div class={`flex flex-col justify-between rounded-lg border ${themeMeta.card} p-2`}>
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">SECTORS (S{displayLiveSector.sector})</span>
                {#if displayCar}
                  <span class="truncate text-[9px] font-bold text-cyan-300">#{displayCar.number || displayCar.id}</span>
                {/if}
              </div>
              <div class="space-y-0.5 font-mono text-xs tabular-nums">
                <div class="text-base font-black text-[#ffcc00]">
                  {displayLiveSector.time > 0 ? displayLiveSector.time.toFixed(3) : "0.000"}
                </div>
                <div class="flex justify-between"><span class="text-white/50">S1</span><b>{displaySectors[0] > 0 ? displaySectors[0].toFixed(3) : "-"}</b></div>
                <div class="flex justify-between"><span class="text-white/50">S2</span><b>{displaySectors[1] > 0 ? displaySectors[1].toFixed(3) : "-"}</b></div>
                <div class="flex justify-between"><span class="text-white/50">S3</span><b>{displaySectors[2] > 0 ? displaySectors[2].toFixed(3) : "-"}</b></div>
              </div>
            </div>

            <div class={`flex flex-col justify-between rounded-lg border ${themeMeta.card} p-2`}>
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">ELECTRONICS</span>
              <div class="grid grid-cols-5 gap-1 text-center">
                <div class="rounded border border-cyan-500/50 bg-cyan-950/40 p-0.5">
                  <div class="text-[7px] font-bold text-cyan-400">TC</div>
                  <div class="font-mono text-sm font-black text-cyan-400">{p?.tc ?? 0}</div>
                </div>
                <div class="rounded border border-cyan-500/50 bg-cyan-950/40 p-0.5">
                  <div class="text-[7px] font-bold text-cyan-400">CUT</div>
                  <div class="font-mono text-sm font-black text-cyan-400">{p?.tcCut ?? 0}</div>
                </div>
                <div class="rounded border border-yellow-500/50 bg-yellow-950/40 p-0.5">
                  <div class="text-[7px] font-bold text-yellow-400">ABS</div>
                  <div class="font-mono text-sm font-black text-yellow-400">{p?.abs ?? 0}</div>
                </div>
                <div class="rounded border border-red-500/50 bg-red-950/40 p-0.5">
                  <div class="text-[7px] font-bold text-red-400">BB</div>
                  <div class="font-mono text-xs font-black text-red-400">
                    {p?.brakeBiasFront ? (p.brakeBiasFront > 1 ? p.brakeBiasFront : p.brakeBiasFront * 100).toFixed(1) : "55.0"}
                  </div>
                </div>
                <div class="rounded border border-green-500/50 bg-green-950/40 p-0.5">
                  <div class="text-[7px] font-bold text-green-400">MAP</div>
                  <div class="font-mono text-sm font-black text-green-400">{p?.motorMap ?? 1}</div>
                </div>
              </div>
              <div class="text-center text-[10px] text-white/60">
                ERS: <b class="text-emerald-300">{Math.round((p?.battery ?? 0) * 100)}%</b> · VE: <b class="text-cyan-300">{Math.round(vePct(p?.virtualEnergy ?? 0))}%</b>
              </div>
            </div>

            <div class={`flex flex-col justify-between rounded-lg border ${themeMeta.card} p-2`}>
              <span class="text-[9px] font-black tracking-wider text-white/50 uppercase">FUEL & STRATEGY</span>
              <div class="grid grid-cols-4 gap-1 text-center font-mono">
                <div>
                  <div class="text-sm font-black text-[#ff3b30]">{fuel(currentFuel, widgetUnits).toFixed(1)}</div>
                  <div class="text-[7px] text-white/50">{fuelUnit(widgetUnits)}</div>
                </div>
                <div>
                  <div class="text-sm font-black text-white">{avgFuelPerLap > 0 ? fuel(avgFuelPerLap, widgetUnits).toFixed(2) : "–"}</div>
                  <div class="text-[7px] text-white/50">/VTA</div>
                </div>
                <div>
                  <div class="text-sm font-black text-[#00ff66]">{lapsOfFuel > 0 ? lapsOfFuel.toFixed(1) : "–"}</div>
                  <div class="text-[7px] text-white/50">VTAS</div>
                </div>
                <div>
                  <div class="text-sm font-black text-white">{atFinishLine}</div>
                  <div class="text-[7px] text-white/50">META</div>
                </div>
              </div>
              <div>
                <div class="mb-0.5 flex justify-between text-[8px] font-bold uppercase">
                  <span class="text-white/60">Lift & Coast</span>
                  <span class={lcScore > 0.4 ? "text-[#00ff66]" : "text-white"}>{Math.round(lcScore * 100)}%</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded bg-white/10">
                  <div class="h-full bg-gradient-to-r from-accent to-[#00ff66]" style:width="{Math.min(100, Math.max(0, lcScore * 100))}%"></div>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- #11 Draggable Vertical Splitter -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class={["hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center lg:flex group"]}
        onpointerdown={startSplitDrag}
        title="Arrastra para ajustar el ancho de las columnas"
      >
        <div class={["h-14 w-1 rounded-full transition-colors", isDraggingSplit ? "bg-accent" : "bg-white/15 group-hover:bg-accent"]}></div>
      </div>

      <!-- Right Column (Reorderable Modules + Focused Car Card) -->
      <div class="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {#each pitwallConfig.rightOrder as modId (modId)}
          {@render rightModuleBlock(modId)}
        {/each}

        <!-- #10 Focused Driver Live Card -->
        {#if selectedVehicle}
          {#key selectedVehicle.id}
            <div in:fade={{ duration: 160 }} class="rounded-lg border border-cyan-400/45 bg-cyan-950/25 p-3 shadow">
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-[10px] font-black tracking-wider text-cyan-300 uppercase">
                  🎥 ENFOCANDO A #{selectedVehicle.number || selectedVehicle.id}
                </span>
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    class="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                    onclick={(e) => togglePin(selectedVehicle.id, e)}
                  >
                    {pitwallConfig.pinnedIds.includes(selectedVehicle.id) ? "★ Vigilado" : "☆ Vigilar"}
                  </button>
                  <button
                    type="button"
                    class="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white hover:opacity-90 cursor-pointer"
                    onclick={() => focusDriver(selectedVehicle)}
                  >Reenfocar</button>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-black text-white">{shortName(selectedVehicle.driver)}</div>
                  <div class="text-[10px] text-white/60">{selectedVehicle.team || selectedVehicle.vehicle}</div>
                </div>
                <div class="text-right font-mono">
                  <div class="text-xs font-bold text-white">P{selectedVehicle.place} ({selectedVehicle.class})</div>
                  <div class="text-[10px] text-cyan-300">
                    VE {Math.round(vePct(selectedVehicle.virtualEnergy ?? 0))}% · {selectedVehicle.numPitstops ?? 0} pits
                  </div>
                </div>
              </div>
              <div class="mt-2 grid grid-cols-3 gap-1.5 rounded bg-black/40 p-1.5 text-center font-mono text-[10px] tabular-nums">
                <div>
                  <div class="text-[8px] text-white/45">S1</div>
                  <div class="font-bold text-white">{displaySectors[0] > 0 ? displaySectors[0].toFixed(3) : "-"}</div>
                </div>
                <div>
                  <div class="text-[8px] text-white/45">S2</div>
                  <div class="font-bold text-white">{displaySectors[1] > 0 ? displaySectors[1].toFixed(3) : "-"}</div>
                </div>
                <div>
                  <div class="text-[8px] text-white/45">S3</div>
                  <div class="font-bold text-white">{displaySectors[2] > 0 ? displaySectors[2].toFixed(3) : "-"}</div>
                </div>
              </div>
              {#if me && selectedVehicle.id !== me.id}
                <div class="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-xs">
                  <span class="text-white/60">Diferencia contigo:</span>
                  <span class="font-mono font-bold text-cyan-300">
                    {(Number(selectedVehicle.timeBehindLeader || 0) - Number(me.timeBehindLeader || 0)).toFixed(2)}s
                  </span>
                  <button type="button" class="text-[10px] text-white/70 underline hover:text-white cursor-pointer" onclick={() => focusDriver(me)}>
                    Volver a mi coche
                  </button>
                </div>
              {/if}
            </div>
          {/key}
        {/if}
      </div>
    </main>

  <!-- =========================================================================
       #3 MODO 2: INGENIERO DE PISTA (ESTRATEGIA, RACE CONTROL, DUELO Y REJOIN)
       ========================================================================= -->
  {:else if viewMode === "engineer"}
    <main class="grid min-h-0 flex-1 grid-cols-12 gap-2.5 overflow-hidden p-2.5">
      <!-- Columna 1: Leaderboard Estratégico con VE/Stint y Rejoin (7 cols) -->
      <div class="col-span-12 flex min-h-0 flex-col gap-2 overflow-hidden lg:col-span-7">
        {@render leaderboardPanel()}
        <!-- Race Control Feed siempre visible en modo Ingeniero -->
        {@render rightModuleBlock("raceControl")}
      </div>

      <!-- Columna 2: Mapa Interactivo + Duelo Directo + Estrategia & Neumáticos (5 cols) -->
      <div class="col-span-12 flex min-h-0 flex-col gap-2 overflow-y-auto lg:col-span-5">
        {@render rightModuleBlock("trackmap")}
        {@render rightModuleBlock("battleCard")}

        <!-- Tarjeta Resumen Estrategia Resistencia -->
        <div class={`rounded-lg border ${themeMeta.card} p-3 shadow`}>
          <div class="mb-2 flex items-center justify-between border-b border-white/10 pb-1">
            <span class="text-[10px] font-black tracking-wider text-white/60 uppercase">🧠 ESTRATEGIA STINT & ENERGÍA</span>
            <span class="font-mono text-[11px] font-bold text-emerald-400">
              {lapsOfFuel > 0 ? `${lapsOfFuel.toFixed(1)} vtas fuel` : "–"} · {estTimeLeft}
            </span>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center font-mono text-xs">
            <div class="rounded bg-black/40 p-1.5">
              <div class="text-[8px] text-white/40 uppercase">FUEL</div>
              <div class="font-black text-white">{fuel(currentFuel, widgetUnits).toFixed(1)} {fuelUnit(widgetUnits)}</div>
            </div>
            <div class="rounded bg-black/40 p-1.5">
              <div class="text-[8px] text-white/40 uppercase">VE</div>
              <div class="font-black text-cyan-300">{Math.round(vePct(p?.virtualEnergy ?? 0))}%</div>
            </div>
            <div class="rounded bg-black/40 p-1.5">
              <div class="text-[8px] text-white/40 uppercase">VTAS VE</div>
              <div class="font-black text-emerald-300">{st?.lapsOfVe ? st.lapsOfVe.toFixed(1) : "–"}</div>
            </div>
            <div class="rounded bg-black/40 p-1.5">
              <div class="text-[8px] text-white/40 uppercase">REJOIN</div>
              <div class="font-black text-cyan-300">{pitRejoinPrediction ? `P${pitRejoinPrediction.predictedPos}` : "–"}</div>
            </div>
          </div>
        </div>

        {@render rightModuleBlock("tyres")}
        {@render rightModuleBlock("telemetryPedals")}
      </div>
    </main>

  <!-- =========================================================================
       MODO 3: TABLET (DASHBOARD COMPLETO SIN SCROLL)
       ========================================================================= -->
  {:else}
    <main class="grid h-full min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-hidden p-3 md:grid-cols-3">
      <div class="flex flex-col gap-2.5 overflow-y-auto">
        {@render rightModuleBlock("battleCard")}
        {@render rightModuleBlock("raceControl")}
        {#if pitwallConfig.modules.tyres}
          <Tyres opts={{ showBrakes: true, showWearRate: true, showLapsLeft: true }} units={widgetUnits} edit={false} />
        {/if}
      </div>

      <div class="flex flex-col items-center gap-2.5 overflow-y-auto">
        <Delta opts={{ reference: "pb", range: 2 }} units={widgetUnits} edit={false} />
        <Dashboard opts={config.value.widgets.dashboard?.options ?? {}} units={widgetUnits} edit={false} />
        <LapTiming opts={{ showSectors: true }} units={widgetUnits} edit={false} />
        <Electronics opts={{}} units={widgetUnits} edit={false} />
      </div>

      <div class="flex flex-col gap-2.5 overflow-y-auto">
        {#if pitwallConfig.modules.trackmap}
          <div class={`flex justify-center rounded-lg border ${themeMeta.card} p-2`}>
            <PitWallTrackMap
              size={220}
              selectedVehicleId={selectedVehicleId}
              pinnedIds={pitwallConfig.pinnedIds}
              showPitRejoin={pitwallConfig.modules.pitRejoin}
              pitLossSec={pitwallConfig.pitLossSec}
              onSelectVehicle={(v) => focusDriver(v)}
            />
          </div>
        {/if}
        <Standings
          opts={{ ...(config.value.widgets.standings?.options ?? {}), showBranding: true, maxRows: 8, maxRowsOther: 4, showPosGained: true }}
          units={widgetUnits}
          edit={false}
        />
        <Relative
          opts={{ ...(config.value.widgets.relative?.options ?? {}), ahead: 3, behind: 3, showPaceDiff: true, showEnergy: true }}
          units={widgetUnits}
          edit={false}
        />
      </div>
    </main>
  {/if}

  <!-- Modal de Personalización Avanzada (#11, #12, #13) -->
  {#if showCustomizeModal}
    <PitWallCustomizeModal
      bind:pitwallConfig
      onApplyPreset={applyPreset}
      onSave={saveConfig}
      onReset={resetConfig}
      onClose={() => (showCustomizeModal = false)}
    />
  {/if}

  <!-- #38 + #39 Modal de Registro de Vueltas & Exportación Discord/CSV -->
  {#if showLapLogModal}
    <PitWallLapLogModal
      driver={displayCar}
      laps={displayCar ? (driverLapLogs[displayCar.id] ?? []) : []}
      {overallBest}
      trackName={s?.track ?? ""}
      onCopyDiscord={copyDiscordReport}
      onClose={() => (showLapLogModal = false)}
    />
  {/if}
</div>

<style>
  @keyframes pwFlashUp {
    0% { background-color: rgba(16, 185, 129, 0.42); }
    100% { background-color: transparent; }
  }
  @keyframes pwFlashDown {
    0% { background-color: rgba(239, 68, 68, 0.38); }
    100% { background-color: transparent; }
  }
  @keyframes pwFlashPurple {
    0% { background-color: rgba(217, 70, 239, 0.45); box-shadow: inset 0 0 18px rgba(217, 70, 239, 0.65); }
    100% { background-color: transparent; box-shadow: none; }
  }
  @keyframes pwFlashGreen {
    0% { background-color: rgba(34, 197, 94, 0.35); box-shadow: inset 0 0 14px rgba(34, 197, 94, 0.5); }
    100% { background-color: transparent; box-shadow: none; }
  }
  @keyframes pwScanline {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }

  .pw-flash-up { animation: pwFlashUp 2.2s ease-out; }
  .pw-flash-down { animation: pwFlashDown 2.2s ease-out; }
  .pw-flash-purple { animation: pwFlashPurple 3s ease-out; }
  .pw-flash-green { animation: pwFlashGreen 2.6s ease-out; }

  .pw-flag-banner::after {
    content: "";
    position: absolute;
    inset: 0;
    width: 45%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    animation: pwScanline 2.2s linear infinite;
    pointer-events: none;
  }
</style>
