import mqtt, { type MqttClient } from "mqtt";
import { live } from "./live.svelte";
import { config } from "./config.svelte";
import type { Snapshot, Vehicle } from "./types";

export interface ActiveLiveSession {
  id: string;
  driver: string;
  team: string;
  car: string;
  carClass: string;
  track: string;
  lap: number;
  lastLapTime: number;
  bestLapTime: number;
  speedKmh: number;
  gear: number;
  rpm: number;
  inPits: boolean;
  updatedAt: number;
}

const BROKER_PRIMARY = "wss://broker.hivemq.com:8884/mqtt";
const BROKER_FALLBACK = "wss://broker.emqx.io:8084/mqtt";
const SESSIONS_TOPIC = "mdt-hud/v1/sessions/announcements";
const TELEMETRY_TOPIC_PREFIX = "mdt-hud/v1/telemetry/";

function getPersistentClientId(): string {
  try {
    let id = localStorage.getItem("mdt_pubsub_client_id");
    if (!id) {
      id = "mdt_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("mdt_pubsub_client_id", id);
    }
    return id;
  } catch {
    return "mdt_" + Math.random().toString(36).slice(2, 10);
  }
}

class RemoteStreamStore {
  connected = $state(false);
  error = $state("");
  sessions = $state<ActiveLiveSession[]>([]);
  spectatingId = $state<string | null>(null);
  spectatingSession = $state<ActiveLiveSession | null>(null);
  isBroadcasting = $state(false);
  viewersCount = $state(0);

  private client: MqttClient | null = null;
  private myId = getPersistentClientId();
  private lastBroadcastAt = 0;
  private lastAnnounceAt = 0;
  private lastDriverName = "";
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private originalLocalSnap: Snapshot | null = null;
  private usingFallback = false;

  getLocalDriverName(): string {
    return this.lastDriverName || config.value.broadcast?.driverName?.trim() || "";
  }

  init() {
    if (this.client) return;
    this.connect(BROKER_PRIMARY);

    // Prune stale sessions every 1.5 seconds (prune if silent for > 5s)
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.sessions = this.sessions.filter((s) => now - s.updatedAt < 5000);
      if (this.spectatingId && !this.sessions.some((s) => s.id === this.spectatingId)) {
        // Driver stopped transmitting: keep last received state
      }
    }, 1500);
  }

  private connect(url: string) {
    try {
      this.client = mqtt.connect(url, {
        clientId: this.myId,
        clean: true,
        connectTimeout: 7000,
        reconnectPeriod: 5000,
        keepalive: 30,
      });

      this.client.on("connect", () => {
        this.connected = true;
        this.error = "";
        console.log(`[MDT Live] Conectado exitosamente al broker MQTT (${url})`);
        this.client?.subscribe(SESSIONS_TOPIC);
        if (this.spectatingId) {
          this.client?.subscribe(`${TELEMETRY_TOPIC_PREFIX}${this.spectatingId}`);
        }
      });

      this.client.on("message", (topic, message) => {
        this.handleMessage(topic, message.toString());
      });

      this.client.on("error", (err) => {
        this.connected = false;
        this.error = err.message;
        console.warn(`[MDT Live] Error en broker (${url}):`, err.message);
        if (!this.usingFallback) {
          this.usingFallback = true;
          this.client?.end(true);
          setTimeout(() => this.connect(BROKER_FALLBACK), 2000);
        }
      });

      this.client.on("offline", () => {
        this.connected = false;
      });
    } catch (e) {
      this.error = String(e);
    }
  }

  private handleMessage(topic: string, text: string) {
    try {
      if (topic === SESSIONS_TOPIC) {
        const item: ActiveLiveSession = JSON.parse(text);
        if (!item || !item.id || item.id === this.myId) return;

        // Descartar si el anuncio pertenece al propio piloto local
        const myDriver = this.getLocalDriverName().toLowerCase().trim();
        const itemDriver = (item.driver || "").toLowerCase().trim();
        if (myDriver && itemDriver && itemDriver === myDriver) {
          return;
        }

        // Buscar si ya existe la sesión por ID o por nombre del piloto (evita duplicados si el piloto reconecta o emite desde otra instancia)
        const idx = this.sessions.findIndex(
          (s) =>
            s.id === item.id ||
            (s.driver && item.driver && s.driver.toLowerCase().trim() === itemDriver)
        );

        if (idx >= 0) {
          this.sessions[idx] = { ...this.sessions[idx], ...item, updatedAt: Date.now() };
        } else {
          this.sessions = [...this.sessions, { ...item, updatedAt: Date.now() }];
        }

        if (this.spectatingId === item.id || (this.spectatingSession?.driver && this.spectatingSession.driver.toLowerCase().trim() === itemDriver)) {
          this.spectatingSession = this.sessions.find((s) => s.id === item.id) || item;
        }
      } else if (this.spectatingId && topic === `${TELEMETRY_TOPIC_PREFIX}${this.spectatingId}`) {
        const remoteSnap: Snapshot = JSON.parse(text);
        if (remoteSnap && (remoteSnap.session || remoteSnap.vehicles?.length || remoteSnap.player)) {
          // Feed remote snapshot into live state so all widgets and Pitwall display it in real time
          live.snap = remoteSnap;
        }
      }
    } catch {
      // Ignorar mensajes malformados
    }
  }

  /** Called every frame or tick from live.svelte.ts when new local telemetry is produced */
  onLocalTelemetry(snap: Snapshot) {
    if (!config.value.broadcast?.enabled || !this.client || !this.connected) {
      this.isBroadcasting = false;
      return;
    }

    // Retransmitir si hay una sesión activa de LMU (incluso en el garaje/boxes) o modo demo
    const hasActiveSession = Boolean(
      (snap.connected && snap.session && snap.session.track && snap.session.track.trim().length > 0) ||
      live.status.demo ||
      (snap.connected && snap.vehicles && snap.vehicles.length > 0)
    );

    if (!hasActiveSession) {
      this.isBroadcasting = false;
      return;
    }

    this.isBroadcasting = true;
    const now = Date.now();

    const playerVeh = snap.vehicles?.find((v) => v.isPlayer);
    const sessionPlayer = snap.session?.playerName?.trim();
    const vehDriver = playerVeh?.driver?.trim();

    // Extraer el nombre real del piloto
    let driverName = config.value.broadcast?.driverName?.trim();
    if (!driverName) {
      if (sessionPlayer && sessionPlayer.toLowerCase() !== "player" && sessionPlayer.toLowerCase() !== "driver" && sessionPlayer !== "—") {
        driverName = sessionPlayer;
      } else if (vehDriver && vehDriver.toLowerCase() !== "player" && vehDriver.toLowerCase() !== "driver" && vehDriver !== "—") {
        driverName = vehDriver;
      } else if (sessionPlayer && sessionPlayer !== "—") {
        driverName = sessionPlayer;
      } else if (vehDriver && vehDriver !== "—") {
        driverName = vehDriver;
      } else {
        driverName = "Piloto MDT";
      }
    }
    this.lastDriverName = driverName;

    const inTrack = Boolean(snap.inRealtime || live.status.demo);
    const inPits = Boolean(!inTrack || snap.player?.inPits || !snap.player);

    const carName = playerVeh?.model || snap.session?.car || snap.player?.vehicleModel || "LMU Car";
    const carClassName = playerVeh?.class || snap.player?.carClass || snap.player?.vehicleClass || "LMU";

    // 1. Announce session metadata every 2 seconds
    if (now - this.lastAnnounceAt >= 2000) {
      this.lastAnnounceAt = now;

      const announcement: ActiveLiveSession = {
        id: this.myId,
        driver: driverName,
        team: "Mediterranean Motorsport",
        car: carName,
        carClass: carClassName,
        track: snap.session?.track || "Circuito en vivo",
        lap: snap.player?.lapNumber || playerVeh?.totalLaps || 1,
        lastLapTime: snap.player?.lastLapTime || playerVeh?.lastLap || 0,
        bestLapTime: snap.player?.bestLapTime || playerVeh?.bestLap || 0,
        speedKmh: Math.round((snap.player?.speed || 0) * 3.6),
        gear: snap.player?.gear ?? 0,
        rpm: Math.round(snap.player?.rpm || 0),
        inPits,
        updatedAt: now,
      };

      this.client.publish(SESSIONS_TOPIC, JSON.stringify(announcement));
    }

    // 2. Broadcast high-frequency telemetry at ~15 Hz
    const intervalMs = Math.max(40, Math.floor(1000 / (config.value.broadcast?.rateHz || 15)));
    if (now - this.lastBroadcastAt >= intervalMs) {
      this.lastBroadcastAt = now;

      // Si el jugador está en garaje y snap.player es null, construir snapshot completo con el playerVeh
      const broadcastSnap = snap.player ? snap : {
        ...snap,
        player: {
          slotId: playerVeh?.slotId ?? 1,
          driver: driverName,
          vehicleModel: carName,
          vehicleName: playerVeh?.driver || driverName,
          vehicleClass: carClassName,
          carClass: carClassName,
          speed: 0,
          gear: 0,
          rpm: 0,
          inPits: true,
          lapNumber: playerVeh?.totalLaps || 0,
          lastLapTime: playerVeh?.lastLap || 0,
          bestLapTime: playerVeh?.bestLap || 0,
          tc: 4,
          tcCut: 0,
          tcSlip: 0,
          abs: 2,
          motorMap: 1,
          brakeBiasFront: 0.56,
          fuel: 65,
          fuelCapacity: 110,
          battery: 0.9,
          electricMotorState: 0,
          throttle: 0,
          brake: 0,
          clutch: 0,
          wheels: [
            { wear: 1, pressure: 190, carcassTemp: 85, brakeTemp: 350 },
            { wear: 1, pressure: 190, carcassTemp: 85, brakeTemp: 350 },
            { wear: 1, pressure: 190, carcassTemp: 85, brakeTemp: 350 },
            { wear: 1, pressure: 190, carcassTemp: 85, brakeTemp: 350 }
          ],
        } as any,
      };

      this.client.publish(`${TELEMETRY_TOPIC_PREFIX}${this.myId}`, JSON.stringify(broadcastSnap));
    }
  }

  /** Start spectating another driver */
  startSpectating(session: ActiveLiveSession) {
    if (this.spectatingId) {
      this.stopSpectating();
    }
    this.spectatingId = session.id;
    this.spectatingSession = session;
    if (live.snap) {
      try {
        this.originalLocalSnap = JSON.parse(JSON.stringify(live.snap));
      } catch {
        this.originalLocalSnap = null;
      }
    }

    // Inicializar inmediatamente un snapshot preliminar con la información de la sesión para vista instantánea
    live.snap = {
      source: "lmu",
      connected: true,
      inRealtime: !session.inPits,
      frame: 1,
      gameVersion: 1,
      session: {
        track: session.track,
        trackLength: 4909,
        code: 2,
        kind: "race",
        phase: 5,
        currentEt: 120,
        endEt: 3600,
        timeRemaining: 3480,
        maxLaps: 0,
        timeOfDay: 43200,
        yellowFlagState: 0,
        sectorYellow: [false, false, false],
        sectorFlagsRaw: [0, 0, 0],
        startLight: 0,
        numRedLights: 0,
        playerName: session.driver,
        weather: {
          ambientTemp: 22,
          trackTemp: 28,
          raining: 0,
          darkCloud: 0.1,
          cloudCoverage: 0.2,
          windSpeed: 2.5,
          windDirection: 0,
          minWetness: 0,
          maxWetness: 0,
          avgWetness: 0,
          gripLevel: 1,
        },
      },
      player: {
        id: 1,
        slotId: 1,
        driver: session.driver,
        carClass: session.carClass || "LMU",
        vehicleModel: session.car || "LMU Car",
        vehicleName: session.car || "LMU Car",
        vehFile: "",
        vehicleClass: session.carClass || "LMU",
        elapsedTime: 120,
        speed: (session.speedKmh || 0) / 3.6,
        rpm: session.rpm || 0,
        maxRpm: 8500,
        gear: session.gear || 0,
        maxGears: 6,
        inPits: session.inPits,
        lapNumber: session.lap || 1,
        lapStartEt: 0,
        lapDist: 0,
        sector: 1,
        lastLapTime: session.lastLapTime || 0,
        bestLapTime: session.bestLapTime || 0,
        tc: 4,
        tcMax: 10,
        tcCut: 0,
        tcSlip: 0,
        abs: 2,
        absMax: 10,
        tcActive: false,
        absActive: false,
        motorMap: 1,
        motorMapMax: 5,
        brakeBiasFront: 0.56,
        fuel: 65,
        fuelCapacity: 110,
        battery: 0.9,
        regenKw: 0,
        virtualEnergy: 0.85,
        electricMotorState: 1,
        throttle: 0,
        brake: 0,
        clutch: 0,
        rawThrottle: 0,
        rawBrake: 0,
        rawSteering: 0,
        steering: 0,
        steeringRangeDeg: 540,
        gLat: 0,
        gLong: 0,
        pos: [0, 0, 0],
        yaw: 0,
        waterTemp: 85,
        oilTemp: 90,
        turboBoost: 0,
        deltaBest: 0,
        lapInvalidated: false,
        trackLimitsSteps: 0,
        trackLimitsStepsPerPenalty: 3,
        trackLimitsStepsPerPoint: 1,
        liftAndCoast: 0,
        migration: 0,
        frontArb: 0,
        rearArb: 0,
        speedLimiter: false,
        headlights: false,
        wipers: 0,
        ignition: 1,
        antiStall: false,
        ffb: 0,
        overheating: false,
        detached: false,
        dents: [],
        damage: null,
        lastImpactMagnitude: 0,
        lastImpactEt: 0,
        gapAhead: 0,
        gapBehind: 0,
        frontCompound: "DRY",
        rearCompound: "DRY",
        wheels: [
          { wear: 0.95, pressure: 190, carcassTemp: 86, brakeTemp: 450, innerTemp: 86, middleTemp: 86, outerTemp: 86 },
          { wear: 0.95, pressure: 190, carcassTemp: 87, brakeTemp: 455, innerTemp: 87, middleTemp: 87, outerTemp: 87 },
          { wear: 0.94, pressure: 188, carcassTemp: 88, brakeTemp: 440, innerTemp: 88, middleTemp: 88, outerTemp: 88 },
          { wear: 0.94, pressure: 188, carcassTemp: 89, brakeTemp: 445, innerTemp: 89, middleTemp: 89, outerTemp: 89 },
        ] as any,
      } as any,
      vehicles: [
        {
          id: 1,
          slotId: 1,
          driver: session.driver,
          carClass: session.carClass || "LMU",
          class: session.carClass || "LMU",
          vehicle: session.car || "LMU Car",
          model: session.car || "LMU Car",
          team: session.team || "Mediterranean Motorsport",
          place: 1,
          classPlace: 1,
          lap: session.lap || 1,
          totalLaps: session.lap || 1,
          lapDist: 0,
          sector: 1,
          bestLap: session.bestLapTime || 0,
          lastLap: session.lastLapTime || 0,
          bestS1: 0,
          bestS2: 0,
          lastS1: 0,
          lastS2: 0,
          curS1: 0,
          curS2: 0,
          timeBehindNext: 0,
          lapsBehindNext: 0,
          timeBehindLeader: 0,
          lapsBehindLeader: 0,
          timeIntoLap: 0,
          estimatedLapTime: session.bestLapTime || 0,
          isPlayer: true,
          inPits: session.inPits,
          pitState: 0,
          inGarage: false,
          numPitstops: 0,
          numPenalties: 0,
          penalties: [],
          finishStatus: 0,
          qualification: 1,
          flag: 0,
          fuelFraction: 0.6,
          control: 0,
          speed: (session.speedKmh || 0) / 3.6,
          pos: [0, 0, 0],
        } as any,
      ],
      timing: {} as any,
      strategy: {
        fuelPerLap: 2.7,
        lapsOfFuel: 24,
        lapsRemaining: 40,
      } as any,
    } as Snapshot;

    try {
      this.client?.subscribe(`${TELEMETRY_TOPIC_PREFIX}${session.id}`);
    } catch (e) {
      console.warn("[MDT Live] Error al suscribir:", e);
    }
    console.log(`[MDT Live] Siguiendo en vivo a: ${session.driver} (${session.car})`);
  }

  /** Stop spectating and return to local telemetry */
  stopSpectating() {
    if (!this.spectatingId) return;
    try {
      this.client?.unsubscribe(`${TELEMETRY_TOPIC_PREFIX}${this.spectatingId}`);
    } catch {}
    console.log(`[MDT Live] Desconectado del piloto ${this.spectatingSession?.driver}`);
    this.spectatingId = null;
    this.spectatingSession = null;
    if (this.originalLocalSnap) {
      live.snap = this.originalLocalSnap;
      this.originalLocalSnap = null;
    }
  }
}

export const remoteStream = new RemoteStreamStore();
