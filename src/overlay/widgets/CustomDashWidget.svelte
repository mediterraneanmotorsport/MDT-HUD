<script lang="ts">
  import { onDestroy } from "svelte";
  import { scale } from "svelte/transition";
  import { config, saveConfig, type Units } from "../../lib/config.svelte";
  import {
    evalCondition,
    evalCustomFormula,
    evalTelemetryBinding,
    type CustomDashboard,
    type DashElement,
    type SimOverrides,
  } from "../../lib/dashStudio.svelte";
  import { classColor, temp, tempUnit, pressure, pressureUnit } from "../../lib/format";
  import { useLive } from "../../lib/live.svelte";
  import MotorsportIcon from "./MotorsportIcon.svelte";
  import Radar from "./Radar.svelte";
  import TrackMap from "./TrackMap.svelte";

  const live = useLive();

  let {
    opts = {},
    units = "metric",
    edit = false,
    dashboardOverride,
    pageIndexOverride,
    previewTick = 0,
    simOverrides,
    testPopup = null,
    testBootSeq = 0,
  }: {
    opts?: Record<string, any>;
    units?: Units;
    edit?: boolean;
    dashboardOverride?: CustomDashboard | null;
    pageIndexOverride?: number;
    previewTick?: number;
    simOverrides?: SimOverrides;
    testPopup?: { title: string; value: string; color: string; seq: number } | null;
    testBootSeq?: number;
  } = $props();

  const dash = $derived.by<CustomDashboard | null>(() => {
    void config.revision;
    if (dashboardOverride) return dashboardOverride;
    const list = config.value.customDashboards ?? [];
    if (list.length === 0) return null;

    // Auto-Switch by car / class ONLY when actively driving in LMU (never hijack in edit/demo mode)
    const p = live.snap?.player;
    if (!edit && live.snap?.source === "lmu" && p) {
      const carText = `${p.vehicleName || ""} ${p.vehicleModel || ""} ${p.vehicleClass || ""}`.toLowerCase();
      if (carText.trim()) {
        for (const d of list) {
          if (!d.autoCarMatch || !d.autoCarMatch.trim()) continue;
          const terms = d.autoCarMatch
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (terms.some((t) => carText.includes(t))) {
            return d;
          }
        }
      }
    }

    if (opts.dashboardId) {
      return list.find((d) => d.id === opts.dashboardId) ?? list[0];
    }
    return list[0];
  });

  let localPageIdx = $state(0);
  const pages = $derived.by(() => {
    if (!dash) return [];
    if (dash.pages && dash.pages.length > 0) return dash.pages;
    return [{ id: "main", name: "Carrera", elements: dash.elements ?? [] }];
  });
  const activePageIdx = $derived.by(() => {
    void config.revision;
    const raw =
      pageIndexOverride != null
        ? pageIndexOverride
        : typeof opts.pageIndex === "number"
          ? opts.pageIndex
          : localPageIdx;
    return Math.max(0, Math.min(pages.length - 1, raw));
  });
  const activeElements = $derived(pages[activePageIdx]?.elements ?? []);

  // Rolling buffer for Live Pedal Trace elements (throttle + brake)
  // Plain non-reactive arrays avoid reading/writing $state inside $effect (which would loop infinitely)
  const TRACE_SAMPLES = 70;
  const rawThrottle: number[] = Array(TRACE_SAMPLES).fill(0);
  const rawBrake: number[] = Array(TRACE_SAMPLES).fill(0);
  let traceThrottlePts = $state("");
  let traceBrakePts = $state("");

  function polylinePoints(arr: number[]): string {
    const n = arr.length;
    if (n < 2) return "";
    let out = "";
    for (let i = 0; i < n; i++) {
      if (i > 0) out += " ";
      out += `${((i / (n - 1)) * 100).toFixed(1)},${(100 - arr[i]).toFixed(1)}`;
    }
    return out;
  }

  $effect(() => {
    const snap = live.snap;
    const tick = previewTick;
    const sim = simOverrides;
    const u = units;
    const hasTrace = activeElements.some((e) => e.type === "trace" && e.visible);
    if (!hasTrace) return;
    const th = evalTelemetryBinding(snap, "throttlePct", u, 0, tick, sim).num;
    const br = evalTelemetryBinding(snap, "brakePct", u, 0, tick, sim).num;
    rawThrottle.shift();
    rawThrottle.push(Math.max(0, Math.min(100, th)));
    rawBrake.shift();
    rawBrake.push(Math.max(0, Math.min(100, br)));
    traceThrottlePts = polylinePoints(rawThrottle);
    traceBrakePts = polylinePoints(rawBrake);
  });

  onDestroy(() => {
    clearTimeout(popupTimer);
    clearTimeout(bootTimer);
    clearInterval(bootSweepTimer);
  });

  // Boot / Ignition Sequence Engine (supports 5 multi-element animations: LEDs + buttons/dials/panels)
  let bootActive = $state(false);
  let bootRunKey = $state(0);
  let bootSweepPct = $state<number | null>(null);
  let bootTimer: ReturnType<typeof setTimeout> | undefined;
  let bootSweepTimer: ReturnType<typeof setInterval> | undefined;
  let lastTestBootSeq = 0;
  let prevIgnition = -1;

  function triggerBootSequence() {
    const mode = dash?.bootAnimation;
    if (!mode || mode === "none") return;
    clearTimeout(bootTimer);
    clearInterval(bootSweepTimer);
    bootRunKey += 1;
    bootActive = true;

    if (mode === "ignition-sweep" || mode === "gt3-boot") {
      const start = performance.now();
      bootSweepPct = 0;
      bootSweepTimer = setInterval(() => {
        const t = (performance.now() - start) / 1000;
        if (t >= 1.15) {
          bootSweepPct = null;
          clearInterval(bootSweepTimer);
          return;
        }
        // Triangle sweep 0 -> 100 -> 0
        const frac = t / 1.15;
        bootSweepPct = frac < 0.55 ? (frac / 0.55) * 100 : ((1 - frac) / 0.45) * 100;
      }, 30);
    }

    bootTimer = setTimeout(() => {
      bootActive = false;
      bootSweepPct = null;
    }, 1450);
  }

  $effect(() => {
    if (testBootSeq > 0 && testBootSeq !== lastTestBootSeq) {
      lastTestBootSeq = testBootSeq;
      triggerBootSequence();
    }
  });

  $effect(() => {
    if (edit) return;
    const ign = live.snap?.player?.ignition ?? -1;
    if (prevIgnition === 0 && ign > 0) {
      triggerBootSequence();
    }
    prevIgnition = ign;
  });

  function setSyncedPage(nextIdx: number, showToast = false) {
    if (pages.length <= 1) return;
    const clamped = ((nextIdx % pages.length) + pages.length) % pages.length;
    localPageIdx = clamped;
    if (pageIndexOverride == null && config.value.widgets.customdash) {
      config.value.widgets.customdash.options.pageIndex = clamped;
      saveConfig();
    }
    if (showToast) {
      const pg = pages[clamped];
      if (pg) {
        showPopup(`PÁGINA ${clamped + 1}/${pages.length}`, pg.name.toUpperCase(), "#38bdf8");
      }
    }
  }

  function cyclePage(delta = 1) {
    setSyncedPage(activePageIdx + delta, true);
  }

  // Keyboard & Gamepad/Wheel button listener for cycling dashboard pages in-game
  $effect(() => {
    if (edit || pageIndexOverride != null || pages.length <= 1) return;
    const keyBind = dash?.pageCycleKey?.trim();
    const gpBtn = dash?.pageCycleGamepadBtn;
    if (!keyBind && (gpBtn == null || gpBtn < 0)) return;

    const onKey = (e: KeyboardEvent) => {
      if (!keyBind) return;
      if (e.key.toLowerCase() === keyBind.toLowerCase() || e.code.toLowerCase() === keyBind.toLowerCase()) {
        cyclePage(1);
      }
    };
    if (keyBind) window.addEventListener("keydown", onKey);

    let gpTimer: ReturnType<typeof setInterval> | undefined;
    let wasPressed = false;
    if (gpBtn != null && gpBtn >= 0 && typeof navigator !== "undefined" && navigator.getGamepads) {
      gpTimer = setInterval(() => {
        const pads = navigator.getGamepads();
        let pressed = false;
        for (const pad of pads) {
          if (pad && pad.buttons[gpBtn]?.pressed) {
            pressed = true;
            break;
          }
        }
        if (pressed && !wasPressed) cyclePage(1);
        wasPressed = pressed;
      }, 80);
    }

    return () => {
      if (keyBind) window.removeEventListener("keydown", onKey);
      if (gpTimer) clearInterval(gpTimer);
    };
  });

  function fmtSec(s: number): string {
    if (!Number.isFinite(s) || s <= 0) return "--.---";
    return s.toFixed(3);
  }

  function buildRelatives(count = 2) {
    const vehicles = live.snap?.vehicles ?? [];
    const me = vehicles.find((v) => v.isPlayer);
    const trackLen = live.snap?.session?.trackLength || 5000;
    if (!me || vehicles.length <= 1) {
      const demo = [
        { pos: 3, name: "M. Estre", cls: "Hypercar", gap: -1.8, isMe: false },
        { pos: 4, name: "A. Pier Guidi", cls: "Hypercar", gap: -0.6, isMe: false },
        { pos: 5, name: "TÚ (MDT)", cls: "Hypercar", gap: 0, isMe: true },
        { pos: 6, name: "K. Vanthoor", cls: "Hypercar", gap: 0.9, isMe: false },
        { pos: 7, name: "N. Nielsen", cls: "Hypercar", gap: 2.3, isMe: false },
      ];
      return demo.slice(Math.max(0, 2 - count), Math.min(5, 3 + count));
    }
    const meSpd = Math.max(25, live.snap?.player?.speed || 50);
    const scored = vehicles
      .filter((v) => !v.inGarage)
      .map((v) => {
        let diff = v.lapDist - me.lapDist;
        if (diff > trackLen / 2) diff -= trackLen;
        if (diff < -trackLen / 2) diff += trackLen;
        const gapSec = v.isPlayer ? 0 : -diff / meSpd;
        return { pos: v.place, name: v.driver, cls: v.class, gap: gapSec, isMe: v.isPlayer, diff };
      });
    const ahead = scored
      .filter((v) => !v.isMe && v.diff > 0)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, count)
      .reverse();
    const behind = scored
      .filter((v) => !v.isMe && v.diff <= 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, count);
    const meRow = scored.find((v) => v.isMe) ?? { pos: me.place, name: me.driver, cls: me.class, gap: 0, isMe: true };
    return [...ahead, meRow, ...behind];
  }

  // Automatic Steering-Wheel Pop-ups (TC, TC Slip, TC Cut, ABS, Brake Bias, Migration, Map, ARBs, Lights, Wipers, Fuel, PB)
  let popup = $state<{ title: string; value: string; color: string; seq: number } | null>(null);
  let popupSeq = 0;
  let popupTimer: ReturnType<typeof setTimeout> | undefined;
  let prevElec = {
    init: false,
    tc: -1,
    tcSlip: -1,
    tcCut: -1,
    abs: -1,
    bb: -1,
    mig: -99,
    map: -1,
    fArb: -1,
    rArb: -1,
    lights: false,
    wipers: -1,
    lowFuelWarned: false,
    batFullWarned: false,
    pbLap: 0,
    sbLap: 0,
  };

  function showPopup(title: string, value: string, color: string) {
    popupSeq += 1;
    popup = { title, value, color, seq: popupSeq };
    clearTimeout(popupTimer);
    popupTimer = setTimeout(() => {
      popup = null;
    }, 2300);
  }

  let lastTestSeq = 0;
  $effect(() => {
    if (testPopup && testPopup.seq !== lastTestSeq) {
      lastTestSeq = testPopup.seq;
      showPopup(testPopup.title, testPopup.value, testPopup.color);
    }
  });

  $effect(() => {
    if (!dash?.autoPopups || edit) return;
    const p = live.snap?.player;
    if (!p) return;
    const tm = live.snap?.timing;
    const st = live.snap?.strategy;
    const bb = Number((p.brakeBiasFront > 1 ? p.brakeBiasFront : p.brakeBiasFront * 100).toFixed(1));
    const mig = Number((p.migration ?? 0).toFixed(1));

    if (prevElec.init) {
      if (p.tc !== prevElec.tc) showPopup("TRACTION CONTROL", `TC ${p.tc}`, "#38bdf8");
      else if (p.tcSlip !== prevElec.tcSlip) showPopup("TC SLIP", `TCS ${p.tcSlip}`, "#84cc16");
      else if (p.tcCut !== prevElec.tcCut) showPopup("TC CUT", `TCC ${p.tcCut}`, "#fb923c");
      else if (p.abs !== prevElec.abs) showPopup("ABS LEVEL", `ABS ${p.abs}`, "#a78bfa");
      else if (Math.abs(bb - prevElec.bb) >= 0.05) showPopup("BRAKE BIAS", `${bb.toFixed(1)}%`, "#facc15");
      else if (Math.abs(mig - prevElec.mig) >= 0.05) showPopup("BRAKE MIGRATION", `${mig.toFixed(1)}%`, "#f59e0b");
      else if (p.motorMap !== prevElec.map) showPopup("ENGINE MAP", `MAP ${p.motorMap}`, "#22c55e");
      else if (p.frontArb !== prevElec.fArb) showPopup("FRONT ARB", `F-ARB ${p.frontArb}`, "#60a5fa");
      else if (p.rearArb !== prevElec.rArb) showPopup("REAR ARB", `R-ARB ${p.rearArb}`, "#2dd4bf");
      else if (p.headlights !== prevElec.lights) showPopup("HEADLIGHTS", p.headlights ? "ON" : "OFF", "#38bdf8");
      else if (p.wipers !== prevElec.wipers) showPopup("WIPERS", p.wipers > 0 ? `SPEED ${p.wipers}` : "OFF", "#94a3b8");
      else if (tm && tm.sessionBest > 0 && prevElec.sbLap > 0 && tm.sessionBest < prevElec.sbLap - 0.001) {
        showPopup("PURPLE LAP!", "SESSION BEST", "#c084fc");
      } else if (tm && tm.personalBest > 0 && prevElec.pbLap > 0 && tm.personalBest < prevElec.pbLap - 0.001) {
        showPopup("PERSONAL BEST!", "NEW PB LAP", "#22c55e");
      } else if (st && st.lapsOfFuel > 0 && st.lapsOfFuel <= 2.0 && !prevElec.lowFuelWarned) {
        prevElec.lowFuelWarned = true;
        showPopup("LOW FUEL WARNING", `${st.lapsOfFuel.toFixed(1)} LAPS`, "#ef4444");
      } else if (p.electricMotorState > 0 && p.battery >= 0.98 && !prevElec.batFullWarned) {
        prevElec.batFullWarned = true;
        showPopup("HYBRID BATTERY", "100% FULL", "#22c55e");
      }
    }
    if (st && st.lapsOfFuel > 2.8) prevElec.lowFuelWarned = false;
    if (p.battery < 0.90) prevElec.batFullWarned = false;

    prevElec.init = true;
    prevElec.tc = p.tc;
    prevElec.tcSlip = p.tcSlip;
    prevElec.tcCut = p.tcCut;
    prevElec.abs = p.abs;
    prevElec.bb = bb;
    prevElec.mig = mig;
    prevElec.map = p.motorMap;
    prevElec.fArb = p.frontArb;
    prevElec.rArb = p.rearArb;
    prevElec.lights = p.headlights;
    prevElec.wipers = p.wipers;
    prevElec.pbLap = tm?.personalBest ?? prevElec.pbLap;
    prevElec.sbLap = tm?.sessionBest ?? prevElec.sbLap;
  });

  // Track gear changes for subtle pop animation
  let lastGearVal = -99;
  let gearPopTick = $state(0);
  $effect(() => {
    const g = evalTelemetryBinding(live.snap, "gear", units, 0, previewTick, simOverrides).num;
    if (lastGearVal !== -99 && g !== lastGearVal) {
      gearPopTick += 1;
    }
    lastGearVal = g;
  });

  const shiftFlashActive = $derived(
    Boolean(dash?.shiftFlashEnabled) &&
      evalTelemetryBinding(live.snap, "rpmPct", units, 0, previewTick, simOverrides).num >= 95,
  );

  const blueFlagOn = $derived(
    evalTelemetryBinding(live.snap, "blueFlag", units, 0, previewTick, simOverrides).bool,
  );

  // Side LED strip state (Left & Right 5-LED vertical alerts: Spotter Car Left/Right, Yellow/Blue Flags, Pit Limiter, Redline)
  const sideLeds = $derived.by(() => {
    if (!dash?.sideLedsEnabled) return { show: false, left: "", right: "", blinkL: false, blinkR: false };
    let carLeft = false;
    let carRight = false;
    const p = live.snap?.player;
    const vehicles = live.snap?.vehicles ?? [];
    if (p && vehicles.length > 1) {
      const cos = Math.cos(p.yaw);
      const sin = Math.sin(p.yaw);
      for (const v of vehicles) {
        if (v.isPlayer || v.inGarage || v.inPits) continue;
        const dx = v.pos[0] - p.pos[0];
        const dz = v.pos[2] - p.pos[2];
        const lat = dx * cos - dz * sin;
        const lon = dx * sin + dz * cos;
        if (Math.abs(lon) <= 5.5 && Math.abs(lat) <= 4.2) {
          if (lat < -0.5) carLeft = true;
          if (lat > 0.5) carRight = true;
        }
      }
    }
    const resolveSide = (carSide: boolean) => {
      if (carSide) return { color: "#f97316", blink: true };
      if (shiftFlashActive) return { color: "#ef4444", blink: true };
      if (yellowFlagOn) return { color: "#facc15", blink: true };
      if (blueFlagOn) return { color: "#3b82f6", blink: true };
      if (pitLimiterOn) return { color: "#f59e0b", blink: false };
      return { color: "", blink: false };
    };
    const l = resolveSide(carLeft);
    const r = resolveSide(carRight);
    return { show: true, left: l.color, right: r.color, blinkL: l.blink, blinkR: r.blink };
  });

  const pitLimiterOn = $derived(
    Boolean(dash?.autoPopups) && evalTelemetryBinding(live.snap, "speedLimiter", units, 0, previewTick, simOverrides).bool,
  );
  const yellowFlagOn = $derived(
    Boolean(dash?.autoPopups) && evalTelemetryBinding(live.snap, "yellowFlag", units, 0, previewTick, simOverrides).bool,
  );

  function fontClass(fam?: string): string {
    if (fam === "mono") return "font-mono";
    if (fam === "sans") return "font-sans";
    if (fam === "digital") return "dash-font-digital";
    if (fam === "f1") return "dash-font-f1";
    if (fam === "retro") return "dash-font-retro";
    return "font-display";
  }

  function evalEl(el: DashElement) {
    if (el.customFormula && el.customFormula.trim()) {
      return evalCustomFormula(el.customFormula, live.snap, units, el.decimals ?? 1, previewTick, simOverrides);
    }
    return evalTelemetryBinding(live.snap, el.binding, units, el.decimals, previewTick, simOverrides);
  }

  function isElementVisible(el: DashElement): boolean {
    if (!el.visible) return false;
    if (!el.visibilityRule?.enabled) return true;
    const ev = evalTelemetryBinding(live.snap, el.visibilityRule.binding, units, 2, previewTick, simOverrides);
    return evalCondition(ev.num, el.visibilityRule.op, el.visibilityRule.value);
  }

  function resolveColor(el: DashElement, fallback: string): { color: string; blink: boolean } {
    const rule = el.colorRule;
    if (!rule?.enabled) return { color: fallback, blink: false };
    const ev = evalTelemetryBinding(live.snap, rule.binding || el.binding, units, 2, previewTick, simOverrides);
    if (rule.stops && rule.stops.length > 0) {
      const sorted = [...rule.stops].sort((a, b) => b.threshold - a.threshold);
      for (const s of sorted) {
        if (ev.num >= s.threshold) {
          return { color: s.color, blink: Boolean(s.blink) };
        }
      }
      const lowest = sorted[sorted.length - 1];
      return { color: lowest.color, blink: Boolean(lowest.blink) };
    }
    if (rule.highThreshold != null && ev.num >= rule.highThreshold && rule.highColor) {
      return { color: rule.highColor, blink: Boolean(rule.blinkOnTrigger) };
    }
    if (rule.lowThreshold != null && ev.num <= rule.lowThreshold && rule.lowColor) {
      return { color: rule.lowColor, blink: Boolean(rule.blinkOnTrigger) };
    }
    return { color: fallback, blink: false };
  }

  function bgWithGradient(base: string | undefined, to: string | undefined, angle = 135): string {
    const b = base?.trim() || "transparent";
    const t = to?.trim();
    if (t) {
      if (b === "transparent" && t === "transparent") return "transparent";
      return `linear-gradient(${angle}deg, ${b}, ${t})`;
    }
    return b;
  }

  function dashPatternCss(pat?: CustomDashboard["bgPattern"]): { image: string; size?: string } | null {
    if (!pat || pat === "none") return null;
    if (pat === "carbon") {
      return {
        image:
          "linear-gradient(27deg, rgba(255,255,255,0.045) 5px, transparent 5px), linear-gradient(207deg, rgba(255,255,255,0.045) 5px, transparent 5px), linear-gradient(27deg, rgba(0,0,0,0.35) 5px, transparent 5px), linear-gradient(207deg, rgba(0,0,0,0.35) 5px, transparent 5px)",
        size: "12px 12px",
      };
    }
    if (pat === "grid") {
      return {
        image:
          "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
        size: "20px 20px",
      };
    }
    if (pat === "scanlines") {
      return {
        image: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 4px)",
      };
    }
    if (pat === "brushed") {
      return {
        image:
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 3px), linear-gradient(180deg, rgba(255,255,255,0.06), transparent 45%, rgba(0,0,0,0.25))",
      };
    }
    if (pat === "dots") {
      return {
        image: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
        size: "10px 10px",
      };
    }
    return null;
  }

  function dashBoxShadow(d: CustomDashboard): string | undefined {
    const parts: string[] = [];
    const fs = d.frameShadow ?? "deep";
    if (fs === "soft") parts.push("0 10px 28px rgba(0,0,0,0.45)");
    else if (fs === "deep") parts.push("0 22px 50px rgba(0,0,0,0.75)");
    else if (fs === "bezel") parts.push("inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 10px rgba(0,0,0,0.7), 0 18px 40px rgba(0,0,0,0.8)");
    if (d.accentGlowColor && (d.accentGlowSize ?? 0) > 0) {
      parts.push(`0 0 ${d.accentGlowSize}px ${d.accentGlowColor}`);
    }
    return parts.length > 0 ? parts.join(", ") : undefined;
  }

  function clipPathStyle(shape?: DashElement["clipShape"]): string | undefined {
    if (!shape || shape === "none") return undefined;
    if (shape === "chamfer") return "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)";
    if (shape === "slant-right") return "polygon(10% 0, 100% 0, 90% 100%, 0 100%)";
    if (shape === "slant-left") return "polygon(0 0, 90% 0, 100% 100%, 10% 100%)";
    if (shape === "chevron") return "polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%, 8% 50%)";
    return undefined;
  }

  function elementTransform(el: DashElement): string | undefined {
    const t: string[] = [];
    if (el.rotateX || el.rotateY) t.push("perspective(600px)");
    if (el.rotateX) t.push(`rotateX(${el.rotateX}deg)`);
    if (el.rotateY) t.push(`rotateY(${el.rotateY}deg)`);
    if (el.rotation) t.push(`rotate(${el.rotation}deg)`);
    if (el.skewX) t.push(`skewX(${el.skewX}deg)`);
    return t.length > 0 ? t.join(" ") : undefined;
  }

  function style3dShadow(s3d?: DashElement["style3d"]): string | undefined {
    if (!s3d || s3d === "none") return undefined;
    if (s3d === "emboss") return "inset 0 2px 3px rgba(255,255,255,0.28), inset 0 -3px 6px rgba(0,0,0,0.75), 0 4px 10px rgba(0,0,0,0.55)";
    if (s3d === "bevel") return "inset 0 3px 4px rgba(255,255,255,0.38), inset 0 -4px 7px rgba(0,0,0,0.8), 0 6px 14px rgba(0,0,0,0.65)";
    if (s3d === "extrude") return "0 2px 0 #1e293b, 0 4px 0 #0f172a, 0 6px 0 #020617, 0 12px 20px rgba(0,0,0,0.85)";
    if (s3d === "glass3d") return "inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -10px 20px rgba(0,0,0,0.35), 0 10px 24px rgba(0,0,0,0.55)";
    return undefined;
  }

  function dash3dTransform(d: CustomDashboard): string | undefined {
    const tx = d.tiltX ?? 0;
    const ty = d.tiltY ?? 0;
    if (!tx && !ty) return undefined;
    const p = d.perspective3d || 900;
    return `perspective(${p}px) rotateX(${tx}deg) rotateY(${ty}deg)`;
  }

  function elementFilter(el: DashElement): string | undefined {
    const f: string[] = [];
    if (el.glowColor && el.glowSize) f.push(`drop-shadow(0 0 ${el.glowSize}px ${el.glowColor})`);
    if (el.shadowBlur) f.push(`drop-shadow(0 4px ${el.shadowBlur}px ${el.shadowColor || "rgba(0,0,0,0.75)"})`);
    return f.length > 0 ? f.join(" ") : undefined;
  }

  function textShadowCss(el: DashElement): string | undefined {
    if (!el.textShadowBlur) return undefined;
    return `0 2px ${el.textShadowBlur}px ${el.textShadowColor || "rgba(0,0,0,0.85)"}`;
  }

  function tyreColor(c: number): string {
    if (c < 62) return "#38bdf8";
    if (c < 98) return "#22c55e";
    if (c < 110) return "#f59e0b";
    return "#ef4444";
  }
</script>

{#if dash}
  {@const pat = dashPatternCss(dash.bgPattern)}
  <div
    class="relative overflow-hidden select-none transition-transform duration-200"
    style:width="{dash.width}px"
    style:height="{dash.height}px"
    style:background={bgWithGradient(dash.bgColor, dash.bgGradientTo, dash.bgGradientAngle ?? 135)}
    style:border-radius="{dash.borderRadius}px"
    style:border="{dash.borderWidth ?? 1}px solid {dash.borderColor || 'rgba(255,255,255,0.18)'}"
    style:box-shadow={dashBoxShadow(dash)}
    style:transform={dash3dTransform(dash)}
    style:opacity={dash.bgOpacity}
  >
    {#if pat}
      <div
        class="pointer-events-none absolute inset-0"
        style:background-image={pat.image}
        style:background-size={pat.size}
      ></div>
    {/if}
    {#if dash.bgImageUrl}
      <img
        src={dash.bgImageUrl}
        alt=""
        class="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style:opacity={dash.bgImageOpacity ?? 0.35}
      />
    {/if}

    {#if shiftFlashActive}
      <div class="pointer-events-none absolute inset-0 z-25 border-[4px] border-red-500/90 bg-red-500/12 dash-shift-flash" style:border-radius="{dash.borderRadius}px"></div>
    {/if}

    {#if sideLeds.show}
      <!-- Left Vertical Alert LED Strip -->
      <div class={["pointer-events-none absolute left-1 top-1/2 z-25 flex -translate-y-1/2 flex-col gap-1.5", sideLeds.blinkL && "animate-pulse"]}>
        {#each Array(5) as _}
          <div
            class="h-2.5 w-2 rounded-full transition-colors duration-75"
            style:background={sideLeds.left || "rgba(255,255,255,0.10)"}
            style:box-shadow={sideLeds.left ? `0 0 10px ${sideLeds.left}` : "none"}
          ></div>
        {/each}
      </div>
      <!-- Right Vertical Alert LED Strip -->
      <div class={["pointer-events-none absolute right-1 top-1/2 z-25 flex -translate-y-1/2 flex-col gap-1.5", sideLeds.blinkR && "animate-pulse"]}>
        {#each Array(5) as _}
          <div
            class="h-2.5 w-2 rounded-full transition-colors duration-75"
            style:background={sideLeds.right || "rgba(255,255,255,0.10)"}
            style:box-shadow={sideLeds.right ? `0 0 10px ${sideLeds.right}` : "none"}
          ></div>
        {/each}
      </div>
    {/if}

    {#if bootActive && dash.bootAnimation === "cyber-scan"}
      <div class="pointer-events-none absolute inset-y-0 z-35 w-16 dash-boot-laser"></div>
    {/if}

    {#if bootActive && dash.bootAnimation === "gt3-boot"}
      {#key bootRunKey}
        <div class="pointer-events-none absolute inset-0 z-35 flex flex-col items-center justify-center bg-black/92 dash-boot-splash">
          <div class="font-display text-2xl font-black tracking-[0.25em] text-white uppercase">{dash.name}</div>
          <div class="mt-1 font-mono text-[10px] font-bold tracking-[0.3em] text-accent uppercase">SYSTEM CHECK · OK</div>
          <div class="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
            <div class="h-full bg-accent dash-boot-progress"></div>
          </div>
        </div>
      {/key}
    {/if}

    {#each activeElements as el, elIdx (el.id)}
      {#if isElementVisible(el)}
        {@const ev = evalEl(el)}
        {@const dynColor = resolveColor(el, el.color ?? "#ffffff")}
        {@const dynFill = resolveColor(el, el.fillColor ?? "#22c55e")}
        {@const rotStyle = elementTransform(el)}
        {@const glowStyle = elementFilter(el)}
        {@const clipStyle = clipPathStyle(el.clipShape)}
        {@const bStyle = el.borderStyle ?? "solid"}
        {@const s3dShadow = style3dShadow(el.style3d)}
        {@const bootClass =
          bootActive && dash.bootAnimation === "ignition-sweep"
            ? "dash-boot-el-sweep"
            : bootActive && dash.bootAnimation === "cascade"
              ? "dash-boot-el-cascade"
              : bootActive && dash.bootAnimation === "cyber-scan"
                ? "dash-boot-el-scan"
                : bootActive && dash.bootAnimation === "matrix-build"
                  ? "dash-boot-el-matrix"
                  : bootActive && dash.bootAnimation === "gt3-boot"
                    ? "dash-boot-el-gt3"
                    : ""}

        <div
          class={[
            "absolute box-border",
            dynColor.blink && "animate-pulse",
            el.animEffect === "breathe" && "dash-anim-breathe",
            el.animEffect === "neon-pulse" && "dash-anim-neon",
            bootClass,
          ]}
          style:--boot-delay="{Math.min(elIdx * 24, 650)}ms"
          style:left="{el.x}px"
          style:top="{el.y}px"
          style:width="{el.w}px"
          style:height="{el.h}px"
          style:opacity={el.opacity}
          style:transform={rotStyle}
          style:filter={glowStyle}
        >
          {#if el.type === "rect"}
            <div
              class="relative h-full w-full overflow-hidden"
              style:background={bgWithGradient(el.bgColor ?? "rgba(255,255,255,0.05)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.15)'}"
              style:border-radius="{el.borderRadius ?? 8}px"
              style:box-shadow={s3dShadow}
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              {#if el.style3d === "glass3d"}
                <div class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent"></div>
              {/if}
            </div>

          {:else if el.type === "text"}
            {@const displayText =
              !el.customFormula && (!el.binding || el.binding === "none")
                ? el.staticText ?? ""
                : `${el.prefix ?? ""}${ev.text}${el.suffix ?? ""}`}
            {@const popKey = (el.animEffect === "gear-pop" || (dash.gearAnimEnabled && el.binding === "gear")) ? gearPopTick : 0}
            <div
              class={[
                "relative flex h-full w-full items-center overflow-hidden px-1 leading-none tabular-nums",
                fontClass(el.fontFamily),
                el.italic && "italic",
                el.uppercase && "uppercase",
                el.textAlign === "left"
                  ? "justify-start text-left"
                  : el.textAlign === "right"
                    ? "justify-end text-right"
                    : "justify-center text-center",
              ]}
              style:font-size="{el.fontSize ?? 28}px"
              style:font-weight={el.fontWeight ?? 800}
              style:letter-spacing={el.letterSpacing ? `${el.letterSpacing}px` : undefined}
              style:text-shadow={textShadowCss(el)}
              style:color={dynColor.color}
              style:background={bgWithGradient(el.bgColor ?? "transparent", el.gradientTo, el.gradientAngle)}
              style:border={el.borderWidth ? `${el.borderWidth}px ${bStyle} ${el.borderColor ?? "transparent"}` : "none"}
              style:border-radius="{el.borderRadius ?? 0}px"
              style:box-shadow={s3dShadow}
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              {#key popKey}
                <span class={["truncate", popKey > 0 && "dash-anim-gear-pop"]}>{displayText}</span>
              {/key}
            </div>

          {:else if el.type === "bar"}
            {@const minV = el.min ?? 0}
            {@const maxV = el.max ?? 100}
            {@const pct = Math.max(0, Math.min(100, ((ev.num - minV) / Math.max(0.0001, maxV - minV)) * 100))}
            {@const isVert = el.orientation === "vertical"}
            {@const segs = Math.max(0, Math.min(40, el.segments ?? 0))}
            <div
              class="relative h-full w-full overflow-hidden"
              style:background={segs > 0 ? "transparent" : (el.trackColor ?? "rgba(255,255,255,0.12)")}
              style:border={el.borderWidth ? `${el.borderWidth}px ${bStyle} ${el.borderColor ?? "rgba(255,255,255,0.2)"}` : "none"}
              style:border-radius="{el.borderRadius ?? 6}px"
              style:clip-path={clipStyle}
            >
              {#if segs > 0}
                {@const litSegs = Math.round((pct / 100) * segs)}
                <div class={["flex h-full w-full gap-[2px]", isVert ? "flex-col-reverse" : "flex-row"]}>
                  {#each Array(segs) as _, si}
                    <div
                      class="flex-1 rounded-[2px] transition-colors duration-75"
                      style:background={si < litSegs ? dynFill.color : (el.trackColor ?? "rgba(255,255,255,0.12)")}
                    ></div>
                  {/each}
                </div>
              {:else}
                <div
                  class="absolute transition-all duration-75"
                  style:background={bgWithGradient(dynFill.color, el.gradientTo, isVert ? 0 : 90)}
                  style:left="0"
                  style:bottom="0"
                  style:top={isVert ? "auto" : "0"}
                  style:width={isVert ? "100%" : `${pct}%`}
                  style:height={isVert ? `${pct}%` : "100%"}
                ></div>
              {/if}
            </div>

          {:else if el.type === "radial"}
            {@const minV = el.min ?? 0}
            {@const maxV = el.max ?? 100}
            {@const pct = Math.max(0, Math.min(1, (ev.num - minV) / Math.max(0.0001, maxV - minV)))}
            {@const sw = el.strokeWidth ?? 10}
            {@const r = 50 - sw / 2 - 2}
            {@const circ = 2 * Math.PI * r}
            {@const arcLen = circ * 0.78}
            {@const dashOffset = arcLen * (1 - pct)}
            <div class="relative flex h-full w-full items-center justify-center">
              <svg class="h-full w-full" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={el.trackColor ?? "rgba(255,255,255,0.12)"}
                  stroke-width={sw}
                  stroke-dasharray="{arcLen} {circ}"
                  stroke-linecap="round"
                  transform="rotate(130 50 50)"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={dynFill.color}
                  stroke-width={sw}
                  stroke-dasharray="{arcLen} {circ}"
                  stroke-dashoffset={dashOffset}
                  stroke-linecap="round"
                  transform="rotate(130 50 50)"
                  class="transition-all duration-75"
                />
              </svg>
              <div
                class="absolute inset-0 flex items-center justify-center font-display font-black tabular-nums"
                style:font-size="{el.fontSize ?? 20}px"
                style:color={el.color ?? "#ffffff"}
              >
                {el.prefix ?? ""}{ev.text}{el.suffix ?? ""}
              </div>
            </div>

          {:else if el.type === "needle"}
            {@const minV = el.min ?? 0}
            {@const maxV = el.max ?? 100}
            {@const pct = Math.max(0, Math.min(1, (ev.num - minV) / Math.max(0.0001, maxV - minV)))}
            {@const startA = el.needleStartAngle ?? -135}
            {@const endA = el.needleEndAngle ?? 135}
            {@const angle = startA + pct * (endA - startA)}
            {@const redStart = (el.needleRedlinePct ?? 85) / 100}
            <div class="relative flex h-full w-full items-center justify-center">
              <svg class="h-full w-full" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.14)" stroke-width="2" />
                {#each Array(11) as _, t}
                  {@const frac = t / 10}
                  {@const a = ((startA + frac * (endA - startA) - 90) * Math.PI) / 180}
                  {@const x1 = 60 + Math.cos(a) * 43}
                  {@const y1 = 60 + Math.sin(a) * 43}
                  {@const x2 = 60 + Math.cos(a) * 50}
                  {@const y2 = 60 + Math.sin(a) * 50}
                  <line
                    {x1}
                    {y1}
                    {x2}
                    {y2}
                    stroke={frac >= redStart ? "#ef4444" : "rgba(255,255,255,0.65)"}
                    stroke-width={t % 2 === 0 ? "2.4" : "1.2"}
                    stroke-linecap="round"
                  />
                {/each}
                <!-- Animated Needle -->
                <g transform="rotate({angle} 60 60)" class="transition-transform duration-75">
                  <line x1="60" y1="68" x2="60" y2="18" stroke={dynFill.color} stroke-width="3" stroke-linecap="round" />
                  <circle cx="60" cy="60" r="6" fill="#ffffff" stroke={dynFill.color} stroke-width="2" />
                </g>
              </svg>
              <div
                class="absolute bottom-3 font-display font-black tabular-nums"
                style:font-size="{Math.max(12, Math.round((el.fontSize ?? 22) * 0.72))}px"
                style:color={el.color ?? "#ffffff"}
              >
                {el.prefix ?? ""}{ev.text}{el.suffix ?? ""}
              </div>
            </div>

          {:else if el.type === "leds"}
            {@const mode = el.ledMode ?? "standard"}
            {@const count = Math.max(4, Math.min(30, el.ledCount ?? 15))}
            {@const pct = bootSweepPct != null ? bootSweepPct : Math.max(0, Math.min(100, ev.num))}
            {@const redlineFlash = pct >= (el.ledFlashPct ?? 95)}
            {@const gCol = el.ledGreenColor ?? "#22c55e"}
            {@const yCol = el.ledYellowColor ?? "#facc15"}
            {@const rCol = el.ledRedColor ?? "#ef4444"}

            {#if mode === "dual-bar"}
              <!-- Doble barra convergente (se llena desde ambos extremos hacia el centro) -->
              {@const halfPct = pct / 2}
              <div
                class={["relative flex h-full w-full items-center overflow-hidden", redlineFlash && "animate-pulse"]}
                style:background={el.trackColor ?? "rgba(255,255,255,0.10)"}
                style:border-radius="{el.borderRadius ?? 6}px"
                style:box-shadow={s3dShadow}
              >
                <div
                  class="absolute inset-y-0 left-0 transition-all duration-75"
                  style:width="{halfPct}%"
                  style:background={redlineFlash ? rCol : `linear-gradient(90deg, ${gCol} 0%, ${yCol} 65%, ${rCol} 100%)`}
                  style:box-shadow="0 0 12px {redlineFlash ? rCol : yCol}"
                ></div>
                <div
                  class="absolute inset-y-0 right-0 transition-all duration-75"
                  style:width="{halfPct}%"
                  style:background={redlineFlash ? rCol : `linear-gradient(270deg, ${gCol} 0%, ${yCol} 65%, ${rCol} 100%)`}
                  style:box-shadow="0 0 12px {redlineFlash ? rCol : yCol}"
                ></div>
                <div class="pointer-events-none absolute left-1/2 inset-y-0 w-[2px] -translate-x-1/2 bg-white/40"></div>
              </div>

            {:else if mode === "classic-bar"}
              <!-- Barra clásica con escala numérica (estilo Bosch DDU S2: 0 1 2 3 4 5 6 7 8) -->
              {@const scaleMax = Math.max(4, Math.min(16, el.rpmScaleMax ?? 8))}
              <div class={["flex h-full w-full flex-col justify-between", redlineFlash && "animate-pulse"]}>
                <div class="flex justify-between px-0.5 font-sans text-[13px] font-bold leading-none text-white tabular-nums">
                  {#each Array(scaleMax + 1) as _, n}
                    <span>{n}</span>
                  {/each}
                </div>
                <div
                  class="relative mt-1 flex-1 w-full overflow-hidden"
                  style:background={el.trackColor ?? "rgba(255,255,255,0.08)"}
                  style:border-radius="{el.borderRadius ?? 2}px"
                  style:box-shadow={s3dShadow}
                >
                  <div
                    class="absolute inset-y-0 left-0 transition-all duration-75"
                    style:width="{pct}%"
                    style:background={redlineFlash ? rCol : pct >= 85 ? yCol : gCol}
                  ></div>
                  <!-- Vertical scale tick dividers -->
                  <div class="pointer-events-none absolute inset-0 flex justify-between">
                    {#each Array(scaleMax + 1) as _}
                      <div class="h-full w-[1.5px] bg-white/80"></div>
                    {/each}
                  </div>
                </div>
              </div>

            {:else if mode === "convergent"}
              <!-- LEDs convergentes hacia el centro -->
              {@const half = Math.ceil(count / 2)}
              {@const litHalf = Math.round((pct / 100) * half)}
              <div class={["flex h-full w-full items-center justify-between gap-1 px-1", redlineFlash && "animate-pulse"]}>
                {#each Array(count) as _, i}
                  {@const distEdge = Math.min(i, count - 1 - i)}
                  {@const frac = (distEdge + 1) / half}
                  {@const isLit = distEdge < litHalf}
                  {@const ledColor = redlineFlash ? rCol : frac <= 0.5 ? gCol : frac <= 0.8 ? yCol : rCol}
                  <div
                    class={[
                      "h-full transition-colors duration-75",
                      el.ledShape === "bar" ? "flex-1 rounded-sm" : "aspect-square rounded-full",
                    ]}
                    style:background={isLit ? ledColor : "rgba(255,255,255,0.12)"}
                    style:box-shadow={isLit ? `0 0 10px ${ledColor}` : "none"}
                  ></div>
                {/each}
              </div>

            {:else}
              <!-- LEDs estándar izquierda -> derecha -->
              {@const litCount = Math.round((pct / 100) * count)}
              <div class={["flex h-full w-full items-center justify-between gap-1 px-1", redlineFlash && "animate-pulse"]}>
                {#each Array(count) as _, i}
                  {@const frac = (i + 1) / count}
                  {@const isLit = i < litCount}
                  {@const ledColor = redlineFlash ? rCol : frac <= 0.55 ? gCol : frac <= 0.82 ? yCol : rCol}
                  <div
                    class={[
                      "h-full transition-colors duration-75",
                      el.ledShape === "bar" ? "flex-1 rounded-sm" : "aspect-square rounded-full",
                    ]}
                    style:background={isLit ? ledColor : "rgba(255,255,255,0.12)"}
                    style:box-shadow={isLit ? `0 0 10px ${ledColor}` : "none"}
                  ></div>
                {/each}
              </div>
            {/if}

          {:else if el.type === "delta"}
            {@const dVal = ev.num}
            {@const dRange = Math.max(0.5, el.deltaRange ?? 2.0)}
            {@const dStyle = el.deltaStyle ?? "hypercar-bar"}
            {@const clampedPct = Math.max(-1, Math.min(1, dVal / dRange))}
            {@const markerLeft = 50 + clampedPct * 50}
            {#if dStyle === "hypercar-bar"}
              <!-- Barra Delta Hypercar (azul -> verde -> 0 -> naranja -> rojo + escala) -->
              <div
                class="flex h-full w-full flex-col justify-between overflow-hidden px-1 py-0.5"
                style:background={bgWithGradient(el.bgColor ?? "transparent", el.gradientTo, el.gradientAngle)}
                style:border-radius="{el.borderRadius ?? 4}px"
                style:box-shadow={s3dShadow}
              >
                <div class="relative h-[46%] w-full overflow-hidden rounded-[2px] border border-white/25">
                  <div class="grid h-full w-full grid-cols-4">
                    <div class="bg-[#1d4ed8]"></div>
                    <div class="bg-[#22c55e]"></div>
                    <div class="bg-[#f59e0b]"></div>
                    <div class="bg-[#dc2626]"></div>
                  </div>
                  <!-- Ticks -->
                  <div class="pointer-events-none absolute inset-0 flex justify-between px-[4%]">
                    {#each Array(21) as _, ti}
                      <div class={["self-center w-px", ti % 5 === 0 ? "h-full bg-white/75" : "h-1/2 bg-white/45"]}></div>
                    {/each}
                  </div>
                  <!-- Live Delta Marker -->
                  <div
                    class="absolute inset-y-0 w-[4px] -translate-x-1/2 bg-white shadow-[0_0_10px_#ffffff] transition-all duration-75"
                    style:left="{markerLeft}%"
                  ></div>
                </div>
                <div class="flex items-center justify-between px-1 font-sans text-[10px] font-bold leading-none text-white/85 tabular-nums">
                  <span>-{(dRange * 0.75).toFixed(1)}</span>
                  <span>-{(dRange * 0.5).toFixed(1)}</span>
                  <span>-{(dRange * 0.25).toFixed(1)}</span>
                  <span class="font-black text-white">0</span>
                  <span>+{(dRange * 0.25).toFixed(1)}</span>
                  <span>+{(dRange * 0.5).toFixed(1)}</span>
                  <span>+{(dRange * 0.75).toFixed(1)}</span>
                </div>
                <div class="text-center font-sans text-[8px] font-bold tracking-widest text-white/55 uppercase leading-none">
                  LAP TIME DELTA ({dVal > 0 ? "+" : ""}{dVal.toFixed(2)}s)
                </div>
              </div>

            {:else if dStyle === "split-bar"}
              <!-- Barra Delta bidireccional limpia desde el centro -->
              {@const isFast = dVal <= 0}
              {@const fillW = Math.abs(clampedPct) * 50}
              <div
                class="flex h-full w-full flex-col justify-between p-1.5"
                style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.5)", el.gradientTo, el.gradientAngle)}
                style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.16)'}"
                style:border-radius="{el.borderRadius ?? 8}px"
                style:box-shadow={s3dShadow}
              >
                <div class="flex items-center justify-between font-mono text-xs font-black tabular-nums">
                  <span class="text-[9px] text-muted uppercase">DELTA</span>
                  <span style:color={isFast ? "#22c55e" : "#ef4444"}>{dVal > 0 ? "+" : ""}{dVal.toFixed(3)}s</span>
                </div>
                <div class="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    class="absolute inset-y-0 transition-all duration-75"
                    style:left={isFast ? `${50 - fillW}%` : "50%"}
                    style:width="{fillW}%"
                    style:background={isFast ? "#22c55e" : "#ef4444"}
                  ></div>
                  <div class="absolute left-1/2 inset-y-0 w-[2px] -translate-x-1/2 bg-white/70"></div>
                </div>
              </div>

            {:else}
              <!-- Compacto -->
              {@const isFast = dVal <= 0}
              <div
                class="flex h-full w-full items-center justify-center font-display font-black tabular-nums"
                style:font-size="{Math.max(16, Math.round(el.h * 0.55))}px"
                style:background={isFast ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)"}
                style:border="2px solid {isFast ? '#22c55e' : '#ef4444'}"
                style:border-radius="{el.borderRadius ?? 8}px"
                style:color={isFast ? "#4ade80" : "#f87171"}
                style:box-shadow={s3dShadow}
              >
                {dVal > 0 ? "+" : ""}{dVal.toFixed(2)}s
              </div>
            {/if}

          {:else if el.type === "trace"}
            <div
              class="relative h-full w-full overflow-hidden p-1"
              style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.45)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.12)'}"
              style:border-radius="{el.borderRadius ?? 8}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              <svg class="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
                <polyline
                  fill="none"
                  stroke={el.fillColor || "#22c55e"}
                  stroke-width="2.5"
                  points={traceThrottlePts}
                />
                <polyline
                  fill="none"
                  stroke={el.trackColor || "#ef4444"}
                  stroke-width="2.5"
                  points={traceBrakePts}
                />
              </svg>
            </div>

          {:else if el.type === "tyreblock"}
            {@const p = live.snap?.player}
            {@const showWear = el.showTyreWear ?? true}
            {@const showBrake = el.showBrakeTemp ?? true}
            {@const showPress = el.showTyrePress ?? false}
            {@const showComp = el.showCompound ?? true}
            {@const wheels = [
              { id: "FL", t: p ? (p.wheels[0].surfaceTemp[0] + p.wheels[0].surfaceTemp[1] + p.wheels[0].surfaceTemp[2]) / 3 : 86, w: p ? p.wheels[0].wear * 100 : 84, b: p ? p.wheels[0].brakeTemp : 520, pr: p ? p.wheels[0].pressure : 184, c: p?.wheels[0].compound || "M" },
              { id: "FR", t: p ? (p.wheels[1].surfaceTemp[0] + p.wheels[1].surfaceTemp[1] + p.wheels[1].surfaceTemp[2]) / 3 : 88, w: p ? p.wheels[1].wear * 100 : 81, b: p ? p.wheels[1].brakeTemp : 510, pr: p ? p.wheels[1].pressure : 185, c: p?.wheels[1].compound || "M" },
              { id: "RL", t: p ? (p.wheels[2].surfaceTemp[0] + p.wheels[2].surfaceTemp[1] + p.wheels[2].surfaceTemp[2]) / 3 : 82, w: p ? p.wheels[2].wear * 100 : 87, b: p ? p.wheels[2].brakeTemp : 440, pr: p ? p.wheels[2].pressure : 178, c: p?.wheels[2].compound || "M" },
              { id: "RR", t: p ? (p.wheels[3].surfaceTemp[0] + p.wheels[3].surfaceTemp[1] + p.wheels[3].surfaceTemp[2]) / 3 : 84, w: p ? p.wheels[3].wear * 100 : 86, b: p ? p.wheels[3].brakeTemp : 435, pr: p ? p.wheels[3].pressure : 179, c: p?.wheels[3].compound || "M" },
            ]}
            <div
              class="grid h-full w-full grid-cols-2 gap-1.5 p-1.5 font-mono text-[10px]"
              style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.45)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.14)'}"
              style:border-radius="{el.borderRadius ?? 10}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              {#each wheels as w (w.id)}
                {@const tc = tyreColor(w.t)}
                {@const compChar = (w.c || "M").slice(0, 1).toUpperCase()}
                <div class="flex flex-col justify-between rounded bg-black/55 px-1.5 py-1 border-l-2" style:border-left-color={tc}>
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-black text-white/75">
                      {w.id}{#if showComp}<span class="ml-1 rounded bg-white/10 px-1 text-[8px] text-amber-300">{compChar}</span>{/if}
                    </span>
                    <span class="font-bold" style:color={tc}>{Math.round(temp(w.t, units))}{tempUnit(units)}</span>
                  </div>
                  {#if showWear || showBrake || showPress}
                    <div class="flex items-center justify-between gap-1 text-[9px] text-muted">
                      {#if showWear}<span>{Math.round(w.w)}%</span>{/if}
                      {#if showPress}<span class="text-cyan-300">{pressure(w.pr, units).toFixed(units === "imperial" ? 1 : 0)}{pressureUnit(units)}</span>{/if}
                      {#if showBrake}<span class="text-amber-300">{Math.round(temp(w.b, units))}°</span>{/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>

          {:else if el.type === "minimap"}
            <div
              class="flex h-full w-full items-center justify-center overflow-hidden p-1"
              style:background={bgWithGradient(el.bgColor ?? "transparent", el.gradientTo, el.gradientAngle)}
              style:border={el.borderWidth ? `${el.borderWidth}px ${bStyle} ${el.borderColor ?? "rgba(255,255,255,0.14)"}` : "none"}
              style:border-radius="{el.borderRadius ?? 12}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              <TrackMap
                opts={{
                  size: Math.max(60, Math.min(el.w, el.h) - 10),
                  showFrame: Boolean(el.showTrackFrame),
                  classColors: el.showClassColors ?? true,
                }}
                {units}
                {edit}
              />
            </div>

          {:else if el.type === "miniradar"}
            <div class="flex h-full w-full items-center justify-center overflow-hidden" style:transform="scale({Math.min(el.w, el.h) / 168})">
              <Radar opts={{ range: 14, autoHide: false, showRings: true, animateTransitions: true }} {units} {edit} />
            </div>

          {:else if el.type === "gmeter"}
            {@const p = live.snap?.player}
            {@const gMax = Math.max(1, el.gMax ?? 3)}
            {@const gLat = p ? p.gLat : Math.sin(previewTick * 0.14) * 1.85}
            {@const gLong = p ? p.gLong : Math.cos(previewTick * 0.11) * 1.45}
            {@const dotX = 50 + Math.max(-1, Math.min(1, gLat / gMax)) * 38}
            {@const dotY = 50 - Math.max(-1, Math.min(1, gLong / gMax)) * 38}
            <div
              class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-1"
              style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.45)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.14)'}"
              style:border-radius="{el.borderRadius ?? 12}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              <svg class="h-full w-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.18)" stroke-width="1.2" />
                <circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" />
                <circle cx="50" cy="50" r="13" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
                <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
                <line x1="50" y1="10" x2="50" y2="90" stroke="rgba(255,255,255,0.14)" stroke-width="1" />
                <line x1="50" y1="50" x2={dotX} y2={dotY} stroke={dynFill.color} stroke-width="1.8" opacity="0.65" />
                <circle cx={dotX} cy={dotY} r="5.5" fill={dynFill.color} />
                <circle cx={dotX} cy={dotY} r="2.2" fill="#ffffff" />
              </svg>
              <div class="pointer-events-none absolute bottom-1 left-1.5 right-1.5 flex justify-between font-mono text-[8px] font-bold text-white/75 tabular-nums">
                <span>L {Math.abs(gLat).toFixed(1)}G</span>
                <span>A {Math.abs(gLong).toFixed(1)}G</span>
              </div>
            </div>

          {:else if el.type === "steering"}
            {@const p = live.snap?.player}
            {@const maxDeg = (p?.steeringRangeDeg && p.steeringRangeDeg > 0 ? p.steeringRangeDeg : 360) / 2}
            {@const steerVal = p ? p.steering : Math.sin(previewTick * 0.12) * 0.55}
            {@const deg = steerVal * maxDeg}
            <div
              class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-1.5"
              style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.40)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.14)'}"
              style:border-radius="{el.borderRadius ?? 12}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              <svg class="h-[82%] w-[82%]" viewBox="0 0 100 100">
                <g transform="rotate({deg.toFixed(1)} 50 50)">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="9" />
                  <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" />
                  <!-- Top center stripe -->
                  <line x1="50" y1="8" x2="50" y2="17" stroke={dynFill.color} stroke-width="6" stroke-linecap="round" />
                  <!-- Spokes -->
                  <line x1="16" y1="50" x2="84" y2="50" stroke="rgba(255,255,255,0.55)" stroke-width="6" stroke-linecap="round" />
                  <line x1="50" y1="50" x2="50" y2="84" stroke="rgba(255,255,255,0.55)" stroke-width="6" stroke-linecap="round" />
                  <circle cx="50" cy="50" r="10" fill="#111827" stroke={dynFill.color} stroke-width="2.5" />
                </g>
              </svg>
              <div class="font-mono text-[10px] font-black tabular-nums leading-none" style:color={el.color ?? "#ffffff"}>
                {deg > 0 ? "+" : ""}{Math.round(deg)}°
              </div>
            </div>

          {:else if el.type === "relatives"}
            {@const rows = buildRelatives(el.relativesCount ?? 2)}
            <div
              class="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden px-2 py-1.5 font-mono text-[10px]"
              style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.50)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.14)'}"
              style:border-radius="{el.borderRadius ?? 10}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              {#each rows as r, ri (ri)}
                <div
                  class={[
                    "flex items-center justify-between gap-2 rounded px-1.5 py-0.5 leading-tight",
                    r.isMe ? "bg-accent/30 font-black text-white" : "text-white/80",
                  ]}
                >
                  <div class="flex min-w-0 items-center gap-1.5">
                    <span class="h-2.5 w-1 shrink-0 rounded-full" style:background={classColor(r.cls)}></span>
                    <span class="w-4 shrink-0 text-right text-[9px] text-muted">P{r.pos}</span>
                    <span class="truncate">{r.name}</span>
                  </div>
                  <span
                    class={[
                      "shrink-0 font-bold tabular-nums",
                      r.isMe ? "text-amber-300" : r.gap < 0 ? "text-red-400" : "text-emerald-400",
                    ]}
                  >
                    {r.isMe ? "—" : `${r.gap > 0 ? "+" : ""}${r.gap.toFixed(1)}s`}
                  </span>
                </div>
              {/each}
            </div>

          {:else if el.type === "sectors"}
            {@const tm = live.snap?.timing}
            {@const secs = [0, 1, 2].map((i) => {
              const cur = tm?.currentSectors?.[i] ?? 0;
              const last = tm?.lastSectors?.[i] ?? 0;
              const val = cur > 0 ? cur : last;
              const pb = tm?.personalBestSectors?.[i] ?? 0;
              const sb = tm?.sessionBestSectors?.[i] ?? 0;
              if (!tm) {
                const demoVals = [31.482, 42.109, 28.764];
                const demoCols = ["#a855f7", "#22c55e", "#facc15"];
                return { label: `S${i + 1}`, val: demoVals[i], color: demoCols[i] };
              }
              let color = "#ffffff";
              if (val > 0 && sb > 0 && val <= sb + 0.001) color = "#c084fc";
              else if (val > 0 && pb > 0 && val <= pb + 0.001) color = "#4ade80";
              else if (val > 0) color = "#facc15";
              return { label: `S${i + 1}`, val, color };
            })}
            <div
              class="grid h-full w-full grid-cols-3 gap-1.5 p-1.5 font-mono"
              style:background={bgWithGradient(el.bgColor ?? "rgba(0,0,0,0.50)", el.gradientTo, el.gradientAngle)}
              style:border="{el.borderWidth ?? 1}px {bStyle} {el.borderColor ?? 'rgba(255,255,255,0.14)'}"
              style:border-radius="{el.borderRadius ?? 10}px"
              style:clip-path={clipStyle}
              style:backdrop-filter={el.backdropBlur ? `blur(${el.backdropBlur}px)` : undefined}
            >
              {#each secs as s (s.label)}
                <div class="flex flex-col items-center justify-center rounded bg-black/50 px-1 py-0.5 border-b-2" style:border-bottom-color={s.color}>
                  <span class="text-[8px] font-bold text-muted">{s.label}</span>
                  <span class="text-[11px] font-black tabular-nums" style:color={s.color}>{fmtSec(s.val)}</span>
                </div>
              {/each}
            </div>

          {:else if el.type === "indicator"}
            {@const isActive = ev.bool}
            <div
              class={[
                "flex h-full w-full items-center justify-center px-1.5 font-display font-black uppercase tracking-wider transition-all duration-100",
                el.italic && "italic",
                isActive && el.activeBlink && "animate-pulse",
              ]}
              style:font-size="{el.fontSize ?? 13}px"
              style:letter-spacing={el.letterSpacing ? `${el.letterSpacing}px` : undefined}
              style:text-shadow={textShadowCss(el)}
              style:border={el.borderWidth ? `${el.borderWidth}px ${bStyle} ${el.borderColor ?? "rgba(255,255,255,0.2)"}` : "none"}
              style:border-radius="{el.borderRadius ?? 6}px"
              style:clip-path={clipStyle}
              style:background={isActive ? (el.activeBgColor ?? "#eab308") : bgWithGradient(el.bgColor ?? "rgba(255,255,255,0.06)", el.gradientTo, el.gradientAngle)}
              style:color={isActive ? (el.activeTextColor ?? "#000000") : (el.color ?? "rgba(255,255,255,0.35)")}
              style:box-shadow={isActive ? `0 0 14px ${el.activeBgColor ?? "#eab308"}` : "none"}
            >
              {el.staticText || el.name}
            </div>

          {:else if el.type === "icon"}
            {@const isActive = ev.bool}
            {@const hasRule = Boolean(el.colorRule?.enabled)}
            {@const iconColor = hasRule ? dynColor.color : isActive ? (el.activeTextColor ?? "#38bdf8") : (el.color ?? "rgba(255,255,255,0.22)")}
            {@const iconBlink = hasRule ? dynColor.blink : Boolean(isActive && el.activeBlink)}
            <div
              class={[
                "flex h-full w-full items-center justify-center p-1 transition-all duration-100",
                iconBlink && "animate-pulse",
              ]}
              style:background={bgWithGradient(el.bgColor ?? "transparent", el.gradientTo, el.gradientAngle)}
              style:border={el.borderWidth ? `${el.borderWidth}px ${bStyle} ${el.borderColor ?? "rgba(255,255,255,0.16)"}` : "none"}
              style:border-radius="{el.borderRadius ?? 8}px"
              style:box-shadow={s3dShadow}
              style:clip-path={clipStyle}
              style:filter={(isActive || hasRule) ? `drop-shadow(0 0 8px ${iconColor})` : undefined}
            >
              <MotorsportIcon id={el.iconId ?? "headlights"} color={iconColor} size="85%" />
            </div>

          {:else if el.type === "image" && el.imageUrl}
            <img
              src={el.imageUrl}
              alt={el.name}
              class={["h-full w-full pointer-events-none", el.objectFit === "cover" ? "object-cover" : "object-contain"]}
              draggable="false"
            />
          {/if}
        </div>
      {/if}
    {/each}

    <!-- Automatic Steering-Wheel Pop-ups (TC / TC Slip / TC Cut / ABS / BB / Mig / Map / ARB / Fuel / PB) -->
    {#if popup}
      {@const pAnim = dash.popupAnimation ?? "zoom"}
      {#key popup.seq}
        <div
          class={[
            "pointer-events-none absolute z-30 text-center shadow-2xl backdrop-blur-md",
            pAnim === "banner"
              ? "inset-x-0 top-0 border-b-2 bg-black/92 px-4 py-2 dash-pop-banner"
              : "inset-x-10 top-1/2 -translate-y-1/2 rounded-xl border-2 bg-black/92 px-4 py-3",
            pAnim === "zoom" && "dash-pop-zoom",
            pAnim === "slide-up" && "dash-pop-slide",
            pAnim === "flip3d" && "dash-pop-flip3d",
            pAnim === "glitch" && "dash-pop-glitch",
          ]}
          style:border-color={popup.color}
          style:box-shadow="0 0 24px {popup.color}55"
        >
          <div class="font-mono text-[10px] font-bold tracking-widest uppercase text-white/70">{popup.title}</div>
          <div class="font-display text-3xl font-black tracking-wider uppercase" style:color={popup.color}>{popup.value}</div>
        </div>
      {/key}
    {:else if pitLimiterOn}
      <div class="pointer-events-none absolute inset-x-0 top-0 z-30 bg-amber-400 py-1 text-center font-display text-xs font-black tracking-widest text-black uppercase animate-pulse">
        ⚠️ PIT LIMITER ACTIVO ⚠️
      </div>
    {:else if yellowFlagOn}
      <div class="pointer-events-none absolute inset-x-0 top-0 z-30 bg-yellow-400 py-1 text-center font-display text-xs font-black tracking-widest text-black uppercase">
        ⚠️ BANDERA AMARILLA / FCY ⚠️
      </div>
    {/if}

    <!-- Multi-page switcher pills (only shown when dashboard has >1 page and not controlled by Studio) -->
    {#if pages.length > 1 && pageIndexOverride == null}
      <div class="absolute right-2 bottom-1.5 z-20 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
        {#each pages as pg, idx (pg.id)}
          <button
            type="button"
            class={[
              "rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors cursor-pointer",
              activePageIdx === idx ? "bg-accent text-white" : "text-white/60 hover:text-white",
            ]}
            onclick={() => setSyncedPage(idx, false)}
          >
            {pg.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else if edit}
  <div class="hud px-4 py-3 text-xs text-muted">
    Abre la pestaña <strong>Dash Studio</strong> para diseñar tu dashboard personalizado.
  </div>
{/if}

<style>
  @keyframes dashPopZoom {
    0% { opacity: 0; transform: translateY(-50%) scale(0.75); }
    100% { opacity: 1; transform: translateY(-50%) scale(1); }
  }
  @keyframes dashPopSlide {
    0% { opacity: 0; transform: translateY(-20%) scale(0.96); }
    100% { opacity: 1; transform: translateY(-50%) scale(1); }
  }
  @keyframes dashPopFlip3d {
    0% { opacity: 0; transform: translateY(-50%) perspective(500px) rotateX(-68deg); }
    100% { opacity: 1; transform: translateY(-50%) perspective(500px) rotateX(0deg); }
  }
  @keyframes dashPopGlitch {
    0% { opacity: 0; transform: translateY(-50%) skewX(-18deg) translateX(-14px); }
    45% { opacity: 1; transform: translateY(-50%) skewX(8deg) translateX(6px); }
    100% { opacity: 1; transform: translateY(-50%) skewX(0deg) translateX(0); }
  }
  @keyframes dashPopBanner {
    0% { opacity: 0; transform: translateY(-100%); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes dashGearPop {
    0% { transform: scale(1.24); }
    100% { transform: scale(1); }
  }
  @keyframes dashBreathe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.72; }
  }
  @keyframes dashNeonPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.35); }
  }
  @keyframes dashShiftFlash {
    0%, 100% { opacity: 0.95; }
    50% { opacity: 0.25; }
  }

  .dash-pop-zoom { animation: dashPopZoom 180ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
  .dash-pop-slide { animation: dashPopSlide 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
  .dash-pop-flip3d { animation: dashPopFlip3d 240ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
  .dash-pop-glitch { animation: dashPopGlitch 200ms ease-out forwards; }
  .dash-pop-banner { animation: dashPopBanner 180ms ease-out forwards; }
  .dash-anim-gear-pop { display: inline-block; animation: dashGearPop 160ms cubic-bezier(0.22, 1, 0.36, 1); }
  .dash-anim-breathe { animation: dashBreathe 2.2s ease-in-out infinite; }
  .dash-anim-neon { animation: dashNeonPulse 1.4s ease-in-out infinite; }
  .dash-shift-flash { animation: dashShiftFlash 160ms linear infinite; }

  /* Extra Racing Fonts */
  .dash-font-digital {
    font-family: "Consolas", "Courier New", ui-monospace, monospace;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 8px currentColor;
  }
  .dash-font-f1 {
    font-family: "Barlow Condensed", "Arial Narrow", sans-serif;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-style: italic;
  }
  .dash-font-retro {
    font-family: "Lucida Console", "Courier New", monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Multi-Element Boot / Ignition Animations (LEDs + Buttons + Dials + Panels) */
  @keyframes bootElSweep {
    0% { opacity: 0.15; filter: brightness(0.4); }
    45% { opacity: 1; filter: brightness(1.85) drop-shadow(0 0 10px rgba(56, 189, 248, 0.8)); }
    100% { opacity: 1; filter: brightness(1); }
  }
  @keyframes bootElCascade {
    0% { opacity: 0; transform: translateY(10px) scale(0.86); }
    70% { opacity: 1; transform: translateY(-2px) scale(1.04); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes bootElScan {
    0% { opacity: 0; filter: brightness(2.2) saturate(1.8); }
    100% { opacity: 1; filter: brightness(1) saturate(1); }
  }
  @keyframes bootElMatrix {
    0% { opacity: 0; transform: perspective(500px) rotateX(-75deg) scale(0.9); }
    100% { opacity: 1; transform: perspective(500px) rotateX(0deg) scale(1); }
  }
  @keyframes bootElGt3 {
    0%, 45% { opacity: 0.15; filter: brightness(0.4); }
    75% { opacity: 1; filter: brightness(1.6); }
    100% { opacity: 1; filter: brightness(1); }
  }
  @keyframes bootLaser {
    0% { left: -12%; opacity: 0.95; }
    100% { left: 108%; opacity: 0; }
  }
  @keyframes bootSplash {
    0%, 62% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes bootProgress {
    0% { width: 0%; }
    100% { width: 100%; }
  }

  .dash-boot-el-sweep { animation: bootElSweep 520ms ease-out var(--boot-delay, 0ms) both; }
  .dash-boot-el-cascade { animation: bootElCascade 420ms cubic-bezier(0.22, 1, 0.36, 1) var(--boot-delay, 0ms) both; }
  .dash-boot-el-scan { animation: bootElScan 380ms ease-out var(--boot-delay, 0ms) both; }
  .dash-boot-el-matrix { animation: bootElMatrix 480ms cubic-bezier(0.22, 1, 0.36, 1) var(--boot-delay, 0ms) both; }
  .dash-boot-el-gt3 { animation: bootElGt3 950ms ease-out var(--boot-delay, 0ms) both; }
  .dash-boot-laser {
    background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.75), #ffffff, rgba(34, 211, 238, 0.75), transparent);
    animation: bootLaser 950ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
  }
  .dash-boot-splash { animation: bootSplash 1100ms ease-out forwards; }
  .dash-boot-progress { animation: bootProgress 720ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
</style>
