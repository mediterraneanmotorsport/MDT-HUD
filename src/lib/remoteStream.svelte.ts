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

class RemoteStreamStore {
  connected = $state(false);
  error = $state("");
  sessions = $state<ActiveLiveSession[]>([]);
  spectatingId = $state<string | null>(null);
  spectatingSession = $state<ActiveLiveSession | null>(null);
  isBroadcasting = $state(false);
  viewersCount = $state(0);

  private client: MqttClient | null = null;
  private myId = "mdt_" + Math.random().toString(36).slice(2, 10);
  private lastBroadcastAt = 0;
  private lastAnnounceAt = 0;
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private originalLocalSnap: Snapshot | null = null;
  private usingFallback = false;

  init() {
    if (this.client) return;
    this.connect(BROKER_PRIMARY);

    // Prune stale sessions every 2 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.sessions = this.sessions.filter((s) => now - s.updatedAt < 8000);
      if (this.spectatingId && !this.sessions.some((s) => s.id === this.spectatingId)) {
        // Driver stopped transmitting: keep last received state
      }
    }, 2000);
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

        const idx = this.sessions.findIndex((s) => s.id === item.id);
        if (idx >= 0) {
          this.sessions[idx] = { ...this.sessions[idx], ...item, updatedAt: Date.now() };
        } else {
          this.sessions = [...this.sessions, { ...item, updatedAt: Date.now() }];
        }

        if (this.spectatingId === item.id) {
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
      this.originalLocalSnap = structuredClone(live.snap);
    }

    // Inicializar inmediatamente un snapshot preliminar con la información de la sesión para vista instantánea
    live.snap = {
      source: "lmu",
      connected: true,
      inRealtime: !session.inPits,
      frame: 1,
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
        slotId: 1,
        driver: session.driver,
        carClass: session.carClass,
        vehicleModel: session.car,
        vehicleName: session.car,
        vehicleClass: session.carClass,
        speed: (session.speedKmh || 0) / 3.6,
        rpm: session.rpm || 0,
        gear: session.gear || 0,
        inPits: session.inPits,
        lapNumber: session.lap || 1,
        lastLapTime: session.lastLapTime || 0,
        bestLapTime: session.bestLapTime || 0,
        tc: 4,
        tcCut: 0,
        tcSlip: 0,
        abs: 2,
        motorMap: 1,
        brakeBiasFront: 0.56,
        fuel: 65,
        fuelCapacity: 110,
        battery: 0.9,
        electricMotorState: 1,
        throttle: 0,
        brake: 0,
        clutch: 0,
        wheels: [
          { wear: 0.95, pressure: 190, carcassTemp: 86, brakeTemp: 450 },
          { wear: 0.95, pressure: 190, carcassTemp: 87, brakeTemp: 455 },
          { wear: 0.94, pressure: 188, carcassTemp: 88, brakeTemp: 440 },
          { wear: 0.94, pressure: 188, carcassTemp: 89, brakeTemp: 445 },
        ],
      } as any,
      vehicles: [
        {
          id: 1,
          slotId: 1,
          driver: session.driver,
          carClass: session.carClass,
          class: session.carClass,
          model: session.car,
          place: 1,
          classPlace: 1,
          lap: session.lap || 1,
          totalLaps: session.lap || 1,
          bestLap: session.bestLapTime || 0,
          lastLap: session.lastLapTime || 0,
          isPlayer: true,
          inPits: session.inPits,
        } as any,
      ],
      timing: {} as any,
      strategy: {
        fuelPerLap: 2.7,
        lapsOfFuel: 24,
        lapsRemaining: 40,
      } as any,
    } as Snapshot;

    this.client?.subscribe(`${TELEMETRY_TOPIC_PREFIX}${session.id}`);
    console.log(`[MDT Live] Siguiendo en vivo a: ${session.driver} (${session.car})`);
  }

  /** Stop spectating and return to local telemetry */
  stopSpectating() {
    if (!this.spectatingId) return;
    this.client?.unsubscribe(`${TELEMETRY_TOPIC_PREFIX}${this.spectatingId}`);
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
