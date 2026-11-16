import mqtt, { type MqttClient } from "mqtt";
import { live } from "./live.svelte";
import { config } from "./config.svelte";
import type { Snapshot } from "./types";

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
        // If the spectated driver stopped transmitting, notify but keep last data
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
        if (remoteSnap && remoteSnap.player) {
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

    // Only broadcast if in realtime in game or in demo mode
    const inTrack = snap.inRealtime || live.status.demo;
    if (!inTrack || !snap.player) {
      this.isBroadcasting = false;
      return;
    }

    this.isBroadcasting = true;
    const now = Date.now();

    // 1. Announce session metadata every 2 seconds
    if (now - this.lastAnnounceAt >= 2000) {
      this.lastAnnounceAt = now;
      const playerVeh = snap.vehicles?.find((v) => v.isPlayer);
      const sessionPlayer = snap.session?.playerName?.trim();
      const vehDriver = playerVeh?.driver?.trim();

      let driverName = config.value.broadcast?.driverName?.trim();
      if (!driverName) {
        if (sessionPlayer && !sessionPlayer.toLowerCase().includes("mdt") && sessionPlayer.toLowerCase() !== "player" && sessionPlayer.toLowerCase() !== "driver") {
          driverName = sessionPlayer;
        } else if (vehDriver && !vehDriver.toLowerCase().includes("mdt") && vehDriver.toLowerCase() !== "player") {
          driverName = vehDriver;
        } else if (sessionPlayer && sessionPlayer.toLowerCase() !== "player") {
          driverName = sessionPlayer;
        } else if (vehDriver) {
          driverName = vehDriver;
        } else {
          driverName = "Piloto MDT";
        }
      }

      const announcement: ActiveLiveSession = {
        id: this.myId,
        driver: driverName,
        team: "Mediterranean Motorsport",
        car: snap.session?.car || snap.player.carClass || "GT3 / Hypercar",
        carClass: snap.player.carClass || "LMU",
        track: snap.session?.track || "Circuito en vivo",
        lap: snap.player.lapNumber || 1,
        lastLapTime: snap.player.lastLapTime || 0,
        bestLapTime: snap.player.bestLapTime || 0,
        speedKmh: Math.round((snap.player.speed || 0) * 3.6),
        gear: snap.player.gear ?? 0,
        rpm: Math.round(snap.player.rpm || 0),
        inPits: Boolean(snap.player.inPits),
        updatedAt: now,
      };

      this.client.publish(SESSIONS_TOPIC, JSON.stringify(announcement));
    }

    // 2. Broadcast high-frequency telemetry at ~15 Hz
    const intervalMs = Math.max(40, Math.floor(1000 / (config.value.broadcast?.rateHz || 15)));
    if (now - this.lastBroadcastAt >= intervalMs) {
      this.lastBroadcastAt = now;
      // Send the snapshot payload
      this.client.publish(`${TELEMETRY_TOPIC_PREFIX}${this.myId}`, JSON.stringify(snap));
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
