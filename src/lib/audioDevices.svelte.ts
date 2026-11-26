import { config } from "./config.svelte";

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

class AudioDevicesStore {
  inputs = $state<AudioDeviceOption[]>([]);
  outputs = $state<AudioDeviceOption[]>([]);
  loading = $state(false);
  error = $state("");

  async refresh(requestPermission = false) {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    this.loading = true;
    this.error = "";
    try {
      if (requestPermission && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
        } catch (e) {
          this.error = "Permiso de micrófono denegado o sin micrófono conectado.";
        }
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      const ins: AudioDeviceOption[] = [];
      const outs: AudioDeviceOption[] = [];
      let inIdx = 1;
      let outIdx = 1;
      for (const d of list) {
        if (!d.deviceId || d.deviceId === "default" || d.deviceId === "communications") continue;
        if (d.kind === "audioinput") {
          ins.push({ deviceId: d.deviceId, label: d.label || `Micrófono ${inIdx++}` });
        } else if (d.kind === "audiooutput") {
          outs.push({ deviceId: d.deviceId, label: d.label || `Salida de audio ${outIdx++}` });
        }
      }
      this.inputs = ins;
      this.outputs = outs;
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }
}

export const audioDevices = new AudioDevicesStore();

/** Routes an HTMLAudioElement or AudioContext to the user-selected output device (if configured). */
export function applyOutputSink(target: HTMLAudioElement | AudioContext | null | undefined) {
  if (!target) return;
  const sinkId = config.value.general.audioOutputId?.trim();
  if (!sinkId) return;
  const anyTarget = target as any;
  if (typeof anyTarget.setSinkId === "function") {
    void Promise.resolve(anyTarget.setSinkId(sinkId)).catch(() => {});
  }
}

function encodeMonoPcm16WavBase64(chunks: Float32Array[], sampleRate: number): { wavBase64: string; peak: number } {
  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Float32Array(totalLen);
  let off = 0;
  let peak = 0;
  for (const c of chunks) {
    merged.set(c, off);
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i]);
      if (a > peak) peak = a;
    }
    off += c.length;
  }

  // Gentle auto-gain boost for quiet headsets (keep pure silence untouched)
  const gain = peak > 0.004 && peak < 0.72 ? Math.min(6.0, 0.72 / peak) : 1.0;

  const targetRate = 16000;
  const ratio = sampleRate / targetRate;
  const speechLen = Math.max(1, Math.floor(merged.length / ratio));
  // Pad 200ms leading silence + 250ms trailing silence so STT never clips first/last syllables
  const leadPad = Math.floor(targetRate * 0.2);
  const trailPad = Math.floor(targetRate * 0.25);
  const outLen = leadPad + speechLen + trailPad;
  const pcm = new Int16Array(outLen);

  // Box-filter averaging downsample to avoid aliasing distortion
  for (let i = 0; i < speechLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j];
    const avg = (sum / (end - start)) * gain;
    const s = Math.max(-1, Math.min(1, avg));
    pcm[leadPad + i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const wavBuf = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(wavBuf);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(pos + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, targetRate, true);
  v.setUint32(28, targetRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  new Uint8Array(wavBuf, 44).set(new Uint8Array(pcm.buffer));

  const bytes = new Uint8Array(wavBuf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { wavBase64: btoa(bin), peak };
}

export interface HoldMicSession {
  stop: () => Promise<{ wavBase64: string; durationMs: number; peak: number }>;
}

/**
 * Starts true Push-To-Talk recording from the chosen microphone (or default if empty).
 * Keeps recording strictly until `stop()` is called on button release!
 */
export async function startHoldMicRecording(
  deviceId: string,
  onLevel?: (level: number) => void,
): Promise<HoldMicSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Micrófono no disponible en este entorno");
  }

  const baseAudio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  let stream: MediaStream;
  if (deviceId) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...baseAudio, deviceId: { exact: deviceId } },
      });
    } catch {
      // Fallback to default mic if stored deviceId is unplugged/changed
      stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
    }
  } else {
    stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio });
  }

  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new Ctor();
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  // Route through a muted GainNode so WebView2 fires onaudioprocess with zero mic feedback/echo
  const silentGain = ctx.createGain();
  silentGain.gain.value = 0;

  const chunks: Float32Array[] = [];
  const sampleRate = ctx.sampleRate;
  const startedAt = performance.now();
  let stopped = false;

  processor.onaudioprocess = (ev) => {
    if (stopped) return;
    const ch = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(ch));
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < ch.length; i += 4) sum += ch[i] * ch[i];
      const rms = Math.sqrt(sum / Math.max(1, ch.length / 4));
      onLevel(Math.min(1, rms * 7.5));
    }
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(ctx.destination);

  return {
    stop: async () => {
      if (stopped) return { wavBase64: "", durationMs: 0, peak: 0 };
      stopped = true;
      onLevel?.(0);
      const durationMs = performance.now() - startedAt;
      processor.disconnect();
      silentGain.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => {});
      if (chunks.length === 0 || durationMs < 220) {
        return { wavBase64: "", durationMs, peak: 0 };
      }
      const { wavBase64, peak } = encodeMonoPcm16WavBase64(chunks, sampleRate);
      return { wavBase64, durationMs, peak };
    },
  };
}

/**
 * Records speech from a specific microphone deviceId into a 16kHz 16-bit mono PCM WAV (base64),
 * automatically stopping ~750ms after the driver finishes speaking (or after maxMs).
 */
export async function captureMicWavBase64(deviceId: string, maxMs = 5500): Promise<string> {
  const session = await startHoldMicRecording(deviceId);
  await new Promise((r) => setTimeout(r, maxMs));
  const { wavBase64 } = await session.stop();
  return wavBase64;
}
