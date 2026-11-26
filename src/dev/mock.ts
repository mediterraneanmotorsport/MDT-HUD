// Browser-only preview: fakes the Tauri backend with demo fixtures so the UI can
// be developed in a normal browser (`pnpm dev`, then open http://localhost:1420
// or http://localhost:1420/#overlay; add ?nolive to simulate the game not running,
// ?nolaps for a fresh install with nothing recorded, ?seen=0.6.0 to show the
// changelog as if updating from that version, ?launches=2 to show the GitHub
// star popup as if the app had been opened that many times before).
// Generate fixtures first:
//   cd src-tauri && cargo run --example export_fixtures -- ../src/dev/fixtures
import { emit } from "@tauri-apps/api/event";
import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { version } from "../../package.json";

function buildFallbackFixtures() {
  const OUTLINE: [number, number][] = [
    [0.15, 23.4], [0.3, 18.8], [0.9, 15.6], [1.8, 13.3], [4.9, 11.1], [4.9, 9.7],
    [7.7, 7.9], [9.3, 6.0], [10.7, 5.4], [13.3, 5.1], [13.9, 4.5], [14.6, 2.3],
    [16.6, 1.0], [19.5, 0.0], [23.3, 2.8], [27.6, 9.7], [35.6, 34.6], [35.2, 36.4],
    [36.6, 37.8], [37.3, 39.7], [46.7, 68.9], [48.1, 70.1], [47.8, 72.2], [49.2, 77.5],
    [50.4, 96.8], [49.7, 99.7], [49.3, 100.0], [36.7, 96.5], [27.1, 91.7], [21.5, 87.6],
    [18.2, 84.9], [16.8, 81.6], [11.1, 83.3], [8.5, 72.7], [4.9, 65.3], [2.2, 60.9],
    [2.4, 59.1], [4.3, 56.8], [4.7, 55.7], [4.4, 52.6], [2.6, 50.6], [2.1, 49.1],
    [2.4, 47.8], [4.0, 46.1], [4.3, 45.0], [3.8, 41.4], [4.0, 38.7], [1.9, 31.1],
    [1.0, 30.2], [0.7, 28.6], [0.0, 28.0],
  ];
  const trackLength = 13626;
  const pts: [number, number][] = OUTLINE.map(([x, y]) => [x * 100, -y * 100]);
  const dist: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const scale = trackLength / (dist[dist.length - 1] || 1);
  for (let i = 0; i < pts.length; i++) {
    pts[i] = [pts[i][0] * scale, pts[i][1] * scale];
    dist[i] *= scale;
  }

  const samplePos = (d: number): [number, number, number] => {
    const m = ((d % trackLength) + trackLength) % trackLength;
    let idx = 0;
    while (idx + 1 < dist.length && dist[idx + 1] < m) idx++;
    const next = (idx + 1) % pts.length;
    const span = (dist[idx + 1] ?? trackLength) - dist[idx] || 1;
    const f = Math.max(0, Math.min(1, (m - dist[idx]) / span));
    return [
      pts[idx][0] + (pts[next][0] - pts[idx][0]) * f,
      0,
      pts[idx][1] + (pts[next][1] - pts[idx][1]) * f,
    ];
  };

  const makeWheel = (tempBase: number, wear: number) => ({
    surfaceTemp: [tempBase + 3, tempBase, tempBase - 2] as [number, number, number],
    innerTemp: [tempBase + 5, tempBase + 2, tempBase - 1] as [number, number, number],
    carcassTemp: tempBase - 4,
    optimalTemp: 90,
    pressure: 170,
    wear,
    compound: "Medium",
    brakeTemp: 420,
    rideHeight: 0.045,
    flat: false,
    detached: false,
    surfaceType: 0,
  });

  const drivers = [
    { id: 1, place: 1, classPlace: 1, driver: "R. Kubica", vehicle: "#83 AF Corse", team: "AF Corse", class: "Hypercar", isPlayer: true, number: "83", model: "Ferrari 499P", bestLap: 201.432, lastLap: 201.884 },
    { id: 2, place: 2, classPlace: 2, driver: "M. García [MDT]", vehicle: "#6 MDT Motorsport", team: "Mediterranean Motorsport", class: "Hypercar", isPlayer: false, number: "6", model: "Porsche 963", bestLap: 201.610, lastLap: 202.105 },
    { id: 3, place: 3, classPlace: 3, driver: "K. Kobayashi", vehicle: "#7 Toyota Gazoo", team: "Toyota Gazoo", class: "Hypercar", isPlayer: false, number: "7", model: "Toyota GR010", bestLap: 201.950, lastLap: 202.310 },
    { id: 4, place: 4, classPlace: 4, driver: "A. Lynn", vehicle: "#2 Cadillac Racing", team: "Cadillac Racing", class: "Hypercar", isPlayer: false, number: "2", model: "Cadillac V-Series.R", bestLap: 202.340, lastLap: 202.800 },
    { id: 5, place: 5, classPlace: 1, driver: "L. Deletraz", vehicle: "#14 AO by TF", team: "AO by TF", class: "LMP2", isPlayer: false, number: "14", model: "Oreca 07", bestLap: 212.410, lastLap: 213.002 },
    { id: 6, place: 6, classPlace: 2, driver: "O. Jarvis", vehicle: "#22 United Autosports", team: "United Autosports", class: "LMP2", isPlayer: false, number: "22", model: "Oreca 07", bestLap: 212.880, lastLap: 213.450 },
    { id: 7, place: 7, classPlace: 1, driver: "V. Rossi", vehicle: "#46 Team WRT", team: "Team WRT", class: "LMGT3", isPlayer: false, number: "46", model: "BMW M4 GT3", bestLap: 236.120, lastLap: 236.710 },
    { id: 8, place: 8, classPlace: 2, driver: "R. Lietz", vehicle: "#91 Manthey EMA", team: "Manthey EMA", class: "LMGT3", isPlayer: false, number: "91", model: "Porsche 911 GT3 R", bestLap: 236.540, lastLap: 237.015 },
  ];

  const frames = Array.from({ length: 120 }, (_, f) => {
    const t = f * 0.25;
    const playerDist = (2500 + t * 72) % trackLength;
    const speed = 32 + 54 * (0.5 + 0.5 * Math.sin(t * 0.7));
    const throttle = speed > 52 ? 0.95 : 0.15;
    const brake = speed <= 52 ? 0.8 : 0.0;
    const gear = speed < 36 ? 1 : speed < 44 ? 2 : speed < 54 ? 3 : speed < 64 ? 4 : speed < 72 ? 5 : speed < 80 ? 6 : 7;
    const rpm = 5200 + ((speed % 11) / 11) * 3400;
    const step = Math.floor(f / 20);
    const tcVal = 4 + (step % 4);
    const absVal = 3 + ((step + 1) % 4);
    const mapVal = 1 + (step % 4);
    const bbVal = 0.54 + (step % 5) * 0.005;

    return {
      source: "demo",
      connected: true,
      inRealtime: true,
      frame: f,
      gameVersion: 1124,
      session: {
        track: "Le Mans (Demo)",
        trackLength,
        code: 1,
        kind: "race",
        phase: 5,
        currentEt: 1200 + t,
        endEt: 3600,
        timeRemaining: 2400 - t,
        maxLaps: 0,
        timeOfDay: 15 * 3600 + t,
        yellowFlagState: 0,
        sectorYellow: [false, false, false],
        sectorFlagsRaw: [11, 11, 11],
        startLight: 0,
        numRedLights: 0,
        playerName: "R. Kubica",
        weather: {
          ambientTemp: 24,
          trackTemp: 35,
          raining: 0,
          darkCloud: 0.15,
          cloudCoverage: 1,
          windSpeed: 3.2,
          windDirection: 0.8,
          minWetness: 0,
          maxWetness: 0,
          avgWetness: 0,
          gripLevel: 3,
        },
      },
      player: {
        id: 1,
        vehicleName: "#83 AF Corse",
        vehicleModel: "Ferrari 499P",
        vehFile: "83_26_AFCO45368276",
        vehicleClass: "Hypercar",
        elapsedTime: 1200 + t,
        lapNumber: 5,
        lapStartEt: 1165,
        lapDist: playerDist,
        sector: playerDist < trackLength / 3 ? 1 : playerDist < (trackLength * 2) / 3 ? 2 : 3,
        inPits: false,
        speed,
        gear,
        maxGears: 7,
        rpm,
        maxRpm: 8800,
        throttle,
        brake,
        clutch: 0,
        steering: 0.25 * Math.sin(t * 0.9),
        rawThrottle: throttle,
        rawBrake: brake,
        rawSteering: 0.25 * Math.sin(t * 0.9),
        steeringRangeDeg: 540,
        gLat: 1.4 * Math.sin(t * 0.9),
        gLong: throttle - brake * 2.2,
        pos: samplePos(playerDist),
        yaw: 0,
        fuel: 48.4 - t * 0.02,
        fuelCapacity: 75,
        virtualEnergy: 0.72 - t * 0.0003,
        battery: 0.64,
        regenKw: brake * 180,
        electricMotorState: brake > 0 ? 3 : 2,
        waterTemp: 88,
        oilTemp: 101,
        turboBoost: 1.4,
        deltaBest: -0.18 + 0.08 * Math.sin(t * 0.4),
        lapInvalidated: false,
        trackLimitsSteps: 1,
        trackLimitsStepsPerPenalty: 20,
        trackLimitsStepsPerPoint: 4,
        liftAndCoast: 0,
        tc: tcVal,
        tcMax: 11,
        tcSlip: 3 + (step % 3),
        tcCut: 2 + (step % 3),
        abs: absVal,
        absMax: 12,
        tcActive: throttle > 0.8 && gear <= 2,
        absActive: brake > 0.7,
        motorMap: mapVal,
        motorMapMax: 5,
        migration: 2 + (step % 3),
        frontArb: 3,
        rearArb: 2,
        brakeBiasFront: bbVal,
        speedLimiter: false,
        headlights: true,
        wipers: 0,
        ignition: 1,
        antiStall: false,
        ffb: 0.4 * Math.sin(t * 0.9),
        overheating: false,
        detached: false,
        dents: [0, 0, 0, 0, 0, 0, 0, 0],
        damage: { aero: 0.02, suspension: [0, 0, 0, 0] },
        lastImpactMagnitude: 0,
        lastImpactEt: 0,
        gapAhead: 0,
        gapBehind: 1.42,
        frontCompound: "Medium",
        rearCompound: "Medium",
        wheels: [makeWheel(86, 0.88), makeWheel(88, 0.86), makeWheel(89, 0.90), makeWheel(90, 0.89)],
      },
      vehicles: drivers.map((d, idx) => {
        const vDist = (playerDist - idx * 320 + trackLength) % trackLength;
        return {
          ...d,
          totalLaps: 5,
          lapDist: vDist,
          sector: vDist < trackLength / 3 ? 1 : vDist < (trackLength * 2) / 3 ? 2 : 3,
          bestS1: d.bestLap * 0.31,
          bestS2: d.bestLap * 0.38,
          lastS1: d.lastLap * 0.31,
          lastS2: d.lastLap * 0.38,
          curS1: d.bestLap * 0.31,
          curS2: 0,
          timeBehindNext: idx === 0 ? 0 : 1.4 + idx * 0.3,
          lapsBehindNext: 0,
          timeBehindLeader: idx * 2.1,
          lapsBehindLeader: 0,
          timeIntoLap: 35 + t,
          estimatedLapTime: d.bestLap,
          inPits: false,
          pitState: 0,
          inGarage: false,
          numPitstops: 1,
          numPenalties: idx === 3 ? 1 : 0,
          penalties: idx === 3 ? [{ kind: "driveThrough", seconds: 0, reason: "Track Limits" }] : [],
          finishStatus: 0,
          qualification: (idx === 0 ? 2 : idx === 1 ? 1 : idx + 1),
          flag: 0,
          fuelFraction: 0.65,
          control: idx === 0 ? 0 : 1,
          speed: speed * (1 - idx * 0.015),
          pos: samplePos(vDist),
          tyreCompounds: ["Medium", "Medium", "Medium", "Medium"],
          tyreWear: 0.88 - idx * 0.02,
          tyreLaps: 5,
          virtualEnergy: 0.72 - idx * 0.03,
        };
      }),
      timing: {
        currentLapTime: 35 + t,
        lastLapTime: 201.884,
        lastLapValid: true,
        sessionBest: 201.432,
        personalBest: 201.432,
        personalBestSectors: [62.41, 76.52, 62.502],
        sessionBestSectors: [62.41, 76.52, 62.502],
        lastSectors: [62.55, 76.71, 62.624],
        currentSectors: [62.38, 0, 0],
        deltaPb: -0.18,
        predictedLap: 201.252,
        stintLaps: 5,
        stintTime: 1012 + t,
      },
      strategy: {
        fuelPerLap: 6.8,
        vePerLap: 0.085,
        fuelLastLap: 6.75,
        veLastLap: 0.084,
        lapsOfFuel: 7.1,
        lapsOfVe: 8.4,
        lapsRemaining: 11.8,
        fuelToFinish: 80.2,
        veToFinish: 1.0,
        avgLapTime: 201.9,
        samples: 4,
        tyreWearPerLap: [0.024, 0.026, 0.02, 0.022],
        tyreWearLastLap: [0.024, 0.026, 0.02, 0.022],
        tyreSamples: 4,
      },
    };
  });

  const now = Math.floor(Date.now() / 1000);
  const laps = [
    { id: 1, sessionId: 1, lapNumber: 1, lapTime: 203.112, s1: 63.1, s2: 77.2, s3: 62.812, valid: true, outLap: false, inLap: false, fuelUsed: 6.8, veUsed: 0.085, maxSpeed: 88.2, track: "Le Mans (Demo)", car: "Ferrari 499P", carClass: "Hypercar", recordedAt: now - 600, sessionType: "Race" },
    { id: 2, sessionId: 1, lapNumber: 2, lapTime: 201.432, s1: 62.41, s2: 76.52, s3: 62.502, valid: true, outLap: false, inLap: false, fuelUsed: 6.75, veUsed: 0.084, maxSpeed: 88.9, track: "Le Mans (Demo)", car: "Ferrari 499P", carClass: "Hypercar", recordedAt: now - 398, sessionType: "Race" },
  ];
  const sampleTrace = {
    t: pts.map((_, i) => (i / pts.length) * 201.432),
    d: dist,
    speed: pts.map((_, i) => 55 + 32 * Math.abs(Math.sin(i * 0.3))),
    throttle: pts.map((_, i) => (i % 5 === 0 ? 0.2 : 1)),
    brake: pts.map((_, i) => (i % 5 === 0 ? 0.8 : 0)),
    steering: pts.map((_, i) => 0.3 * Math.sin(i * 0.5)),
    clutch: pts.map(() => 0),
    gear: pts.map((_, i) => (i % 5 === 0 ? 3 : 7)),
    rpm: pts.map((_, i) => 6500 + (i % 5) * 400),
    x: pts.map((p) => p[0]),
    z: pts.map((p) => p[1]),
    gLat: pts.map((_, i) => Math.sin(i * 0.5)),
    gLong: pts.map((_, i) => Math.cos(i * 0.5)),
    abs: pts.map(() => 0),
    tc: pts.map(() => 0),
    tyreFl: pts.map(() => 88),
    tyreFr: pts.map(() => 89),
    tyreRl: pts.map(() => 90),
    tyreRr: pts.map(() => 90),
  };

  return {
    frames,
    sessions: [
      {
        id: 1,
        startedAt: now - 1200,
        source: "demo",
        track: "Le Mans (Demo)",
        trackLength,
        sessionType: "Race",
        car: "Ferrari 499P",
        vehicleName: "#83 AF Corse",
        vehFile: "83_26_AFCO45368276",
        carClass: "Hypercar",
        driver: "R. Kubica",
        gameVersion: 1124,
        lapCount: 2,
        validLaps: 2,
        bestLap: 201.432,
      },
    ],
    laps,
    traces: { "1": sampleTrace, "2": sampleTrace },
    trackMap: { track: "Le Mans (Demo)", length: trackLength, points: pts, dist },
    personalBests: [
      {
        track: "Le Mans (Demo)",
        car: "Ferrari 499P",
        carClass: "Hypercar",
        lapId: 2,
        lapTime: 201.432,
        s1: 62.41,
        s2: 76.52,
        s3: 62.502,
        recordedAt: now - 398,
        lapCount: 2,
        fromGame: true,
      },
    ],
    filters: { tracks: ["Le Mans (Demo)"], cars: ["Ferrari 499P"] },
  };
}

export async function install() {
  (window as any).__MDT_MOCK__ = true;
  let fx: any;
  try {
    const res = await fetch(new URL("./fixtures/fixtures.json", import.meta.url));
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && ct.includes("json")) {
      fx = await res.json();
    } else {
      fx = buildFallbackFixtures();
    }
  } catch {
    fx = buildFallbackFixtures();
  }
  const params = new URLSearchParams(location.search);
  let config: unknown = {
    general: {
      ...(params.has("seen") && { lastSeenVersion: params.get("seen") }),
      ...(params.has("launches") && { launches: Number(params.get("launches")) }),
    },
  };
  let editMode = location.hash.includes("edit");
  const isRemoteMobileClient =
    location.hash.startsWith("#mobile") ||
    location.hash.startsWith("#dash") ||
    location.hash.startsWith("#pitwall") ||
    location.hash.startsWith("#streamer") ||
    location.pathname === "/mobile" ||
    location.pathname === "/dash" ||
    location.pathname === "/streamer" ||
    /android|iphone|ipod|ipad/i.test(navigator.userAgent);
  const noLive = params.has("nolive") || isRemoteMobileClient;
  if (params.has("nolaps")) Object.assign(fx, { sessions: [], laps: [], traces: {}, personalBests: [], filters: { tracks: [], cars: [] } });
  let previewFrame = 0;
  let onlineMe: { id: string; displayName: string | null; createdAt: number } | null = null;
  const uploadStates = new Map<number, { lapId: number; status: string; remoteId: string | null; error: string | null; trace: string | null }>();

  mockWindows("main");
  mockConvertFileSrc("linux");
  mockIPC(
    (cmd, args: any) => {
      switch (cmd) {
        case "plugin:app|version":
          return version;
        case "plugin:opener|open_url":
          window.open(args.url, "_blank", "noopener,noreferrer");
          return;
        case "get_snapshot":
          return noLive ? null : fx.frames[0];
        case "get_preview_snapshot":
          return fx.frames[previewFrame++ % fx.frames.length];
        case "get_status":
          return { demo: true, editMode, overlayVisible: true, gameFocused: false, experimentalLinux: false, dataDir: "C:\\mock" };
        case "list_monitors":
          return [
            { name: "\\\\.\\DISPLAY1", width: 2560, height: 1440, x: 0, y: 0, primary: true, scaleFactor: 1.0 },
            { name: "\\\\.\\DISPLAY2", width: 1920, height: 1080, x: 2560, y: 0, primary: false, scaleFactor: 1.0 },
          ];
        case "get_overlay_layout":
          return {
            isMultiMonitor: false,
            primaryOffsetX: 0,
            primaryOffsetY: 0,
            primaryWidth: 2560,
            primaryHeight: 1440,
            boundsX: 0,
            boundsY: 0,
            boundsWidth: 2560,
            boundsHeight: 1440,
            scaleFactor: 1.0,
          };
        case "get_config":
          return config;
        case "save_config":
          config = args.config;
          emit("config-changed", config);
          return;
        case "get_mobile_network_info":
          return {
            ips: ["192.168.1.100"],
            port: 1420,
            url: "http://192.168.1.100:1420/#mobile",
            pitwallUrl: "http://192.168.1.100:1420/#pitwall",
            firewallOpen: true,
          };
        case "open_mobile_firewall":
          return true;
        case "focus_vehicle":
          return fetch(`/lmu-api/rest/watch/focus/${args.slotId}`, {
            method: "PUT",
            headers: { accept: "application/json" },
          })
            .then((r) => r.ok)
            .catch(() => false);
        case "set_edit_mode":
          editMode = args.enabled;
          emit("edit-mode", editMode);
          return;
        case "list_sessions":
          // Fixtures come from the demo sim; present them as game data so online uploads can be previewed.
          return fx.sessions.map((s: any) => ({ ...s, source: "lmu", gameVersion: 1124 }));
        case "list_laps":
          return fx.laps;
        case "list_track_laps":
          return [...fx.laps].sort((a: any, b: any) => a.lapTime - b.lapTime);
        case "get_lap_trace":
          return fx.traces[String(args.lapId)];
        case "personal_bests":
          return fx.personalBests.map((b: any) => ({ ...b, fromGame: true }));
        case "get_filters":
          return fx.filters;
        case "get_track_map":
          return fx.trackMap;
        case "daily_races": {
          const at = (min: number) => Math.ceil(Date.now() / 300_000) * 300_000 + min * 60_000;
          const race = (name: string, tier: string, track: string, duration: string, first: number, every: number) => ({
            name, tier, track, duration, image: null,
            starts: [0, 1, 2, 3].map((i) => at(first + i * every)).filter((t) => t < at(0) + 4 * 3_600_000),
          });
          const races = [
            race("Logitech McLaren G Challenge Winter - Q2", "beginner", "Monza", "30 minutes", 5, 45),
            race("LMP3 Fixed", "beginner", "Le Mans", "32 minutes", 15, 45),
            race("LMGT3 Fixed", "beginner", "Fuji Wec 2023", "32 minutes", 25, 45),
            race("ELMS Sprint Trophy", "intermediate", "Spa Francorchamps", "44 minutes", 10, 60),
            race("LMGT3 Sprint Cup", "intermediate", "Laguna Seca", "44 minutes", 30, 60),
            race("Prototype Fixed", "intermediate", "Long Beach 2026", "44 minutes", 40, 60),
            race("One Stint Sprint", "advanced", "Bahrain Wec 2023", "55 minutes", 20, 90),
            race("ELMS Super 60", "advanced", "Portimao Wec 2023", "1h 13 minutes", 50, 90),
            race("WEC-Xperience", "advanced", "Silverstone 2025", "1h 14 minutes", 70, 90),
          ];
          return { races, fetchedAt: Date.now() };
        }
        case "online_register":
          onlineMe ??= { id: "mock-user", displayName: args.displayName ?? null, createdAt: Math.floor(Date.now() / 1000) };
          return onlineMe;
        case "online_me":
          if (!onlineMe) throw "Online features are not set up on this PC";
          return onlineMe;
        case "online_set_display_name":
          if (!onlineMe) throw "Online features are not set up on this PC";
          onlineMe.displayName = args.displayName?.trim() || null;
          return onlineMe;
        case "online_delete_data":
          onlineMe = null;
          uploadStates.clear();
          emit("lap-uploads-changed", null);
          return;
        case "upload_laps": {
          const ids: number[] = args.lapIds.filter((id: number) => !uploadStates.has(id));
          for (const id of ids) uploadStates.set(id, { lapId: id, status: "queued", remoteId: null, error: null, trace: null });
          emit("lap-uploads-changed", null);
          setTimeout(() => {
            for (const id of ids) uploadStates.set(id, { lapId: id, status: "ranked", remoteId: `mock-${id}`, error: null, trace: null });
            emit("lap-uploads-changed", null);
          }, 800);
          return ids.length;
        }
        case "ranked_lap_trace": {
          // Another driver's lap: a fixture lap made ~2% faster.
          const t = Object.values(fx.traces)[1] as any;
          return { ...t, t: t.t.map((x: number) => x * 0.98), speed: t.speed.map((x: number) => x * 1.02) };
        }
        case "lap_upload_states":
          return [...uploadStates.values()];
        case "remove_lap_upload":
          uploadStates.delete(args.lapId);
          emit("lap-uploads-changed", null);
          return;
        case "leaderboard_boards": {
          const pbs: any[] = fx.personalBests;
          return pbs.map((b) => ({ track: b.track, carClass: b.carClass, drivers: 12, bestLap: b.lapTime - 1.234, gameVersions: [1124, 1123] }));
        }
        case "leaderboard": {
          const q = args.query;
          const pb = (fx.personalBests as any[]).find((b) => b.track === q.track && b.carClass === q.carClass);
          const names = ["A. Laurent", null, "K. Tanaka", "J. Smith", null, "L. Novak", "P. Silva", "D. Müller"];
          const entries = names.map((driver, i) => {
            const t = (pb?.lapTime ?? 100) - 1.234 + i * 0.41;
            return {
              rank: i + 1, lapId: `other-${i}`, driver, car: pb?.car ?? "Car", vehicleName: "", sessionType: i % 2 ? "Race" : "Practice",
              gameVersion: i < 5 ? 1124 : 1123,
              hasTrace: i !== 2,
              lapTime: t, s1: t * 0.3, s2: t * 0.4, s3: t * 0.3, recordedAt: Math.floor(Date.now() / 1000) - i * 86400,
            };
          });
          const mine = pb && uploadStates.get(pb.lapId)?.remoteId;
          if (mine) {
            entries.splice(3, 0, { ...entries[3], lapId: mine, driver: onlineMe?.displayName ?? null, lapTime: pb.lapTime, s1: pb.s1, s2: pb.s2, s3: pb.s3 });
            entries.forEach((e, i) => (e.rank = i + 1));
          }
          const filtered = entries.filter(
            (e) => (!q.sessionType || e.sessionType === q.sessionType) && (!q.gameVersion || e.gameVersion === q.gameVersion),
          );
          return { entries: filtered, total: filtered.length };
        }
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );

  let demoInterval: ReturnType<typeof setInterval> | null = null;
  const startDemoLoop = () => {
    if (demoInterval) return;
    let i = 0;
    demoInterval = setInterval(() => {
      emit("snapshot", fx.frames[i++ % fx.frames.length]);
    }, 50);
  };
  const stopDemoLoop = () => {
    if (demoInterval) {
      clearInterval(demoInterval);
      demoInterval = null;
    }
  };
  (window as any).__MDT_START_DEMO__ = startDemoLoop;
  (window as any).__MDT_STOP_DEMO__ = stopDemoLoop;

  const isMobileClient =
    /android|iphone|ipod/i.test(navigator.userAgent) ||
    location.hash.includes("mobile") ||
    location.hash.includes("dash") ||
    location.hash.includes("ddu") ||
    location.hash.includes("pitwall") ||
    location.pathname.includes("mobile") ||
    location.pathname.includes("dash") ||
    location.pathname.includes("ddu") ||
    location.pathname.includes("pitwall");

  const forceDemo = new URLSearchParams(location.search).has("demo");

  if (!noLive && (!isMobileClient || forceDemo)) {
    startDemoLoop();
  }
}
