#!/usr/bin/env python3
"""
MDT-HUD Persistent Local Qwen3-TTS 0.6B Server
- Optimized for CUDA (NVIDIA), ROCm (AMD Radeon), and FP16 / BF16 inference.
- Preloads all reference voice profiles from VocesQwen3/<Profile>/ at startup
  and caches their voice_clone_prompt embeddings in VRAM for lowest latency.
- Includes an in-memory LRU WAV cache for instant (<2ms) replay of repeated spotter calls.
"""

import argparse
import hashlib
import io
import json
import os
import sys
import threading
import time
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Speed up AMD MIOpen solver selection on Windows ROCm before importing torch
os.environ.setdefault("MIOPEN_FIND_MODE", "FAST")
os.environ.setdefault("MIOPEN_LOG_LEVEL", "3")

AUDIO_EXTS = (".wav", ".mp3", ".flac", ".ogg", ".m4a")

# Core urgent on-track Spotter phrases pre-cached to disk in background so they play in <2ms during a race!
PRIORITY_SPOTTER_PHRASES = [
    "Coche a la izquierda",
    "Coche a la derecha",
    "Cuidado, tres en paralelo",
    "Libre",
    "Atención, bandera amarilla",
    "Bandera azul, coche rápido detrás",
    "Bandera verde, pista libre",
    "Atención, Full Course Yellow en pista",
    "Atención, tenemos una penalización",
    "Box en esta vuelta, combustible crítico",
    "Atención, quedan dos vueltas de combustible",
    "Entrando a calle de boxes, vigila la velocidad",
    "Saliendo de boxes, cuidado con la línea blanca",
    "Limitador activado",
    "Atención, hemos sufrido daños en el coche",
    "Radio check, te recibo alto y claro. Estás tercero en categoría, sigue empujando.",
]


def scan_profiles(voices_dir: Path) -> Dict[str, Dict[str, Any]]:
    profiles: Dict[str, Dict[str, Any]] = {}
    if not voices_dir.is_dir():
        return profiles
    for entry in sorted(voices_dir.iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_dir() or entry.name.startswith(".") or entry.name.startswith("__"):
            continue
        audio_file: Optional[Path] = None
        # Prefer ref.wav / ref.* first
        for cand in ("ref.wav", "ref.flac", "ref.mp3", "ref.ogg"):
            p = entry / cand
            if p.is_file():
                audio_file = p
                break
        if audio_file is None:
            for f in sorted(entry.iterdir(), key=lambda p: p.name.lower()):
                if f.is_file() and f.suffix.lower() in AUDIO_EXTS:
                    audio_file = f
                    break
        ref_txt_path = entry / "ref.txt"
        ref_text = ""
        if ref_txt_path.is_file():
            try:
                ref_text = ref_txt_path.read_text(encoding="utf-8", errors="ignore").strip()
            except Exception:
                ref_text = ""
        profiles[entry.name] = {
            "name": entry.name,
            "dir": str(entry),
            "audio_path": str(audio_file) if audio_file else "",
            "audio_file": audio_file.name if audio_file else "",
            "ref_text": ref_text,
            "has_audio": audio_file is not None,
            "has_transcript": bool(ref_text),
        }
    return profiles


class Qwen3TtsEngine:
    def __init__(self, voices_dir: Path, model_id: str, device_pref: str, dtype_pref: str):
        self.voices_dir = voices_dir
        self.model_id = model_id
        self.device_pref = device_pref.lower().strip()
        self.dtype_pref = dtype_pref.lower().strip()

        self.ready = False
        self.loading = True
        self.error = ""
        self.backend = "initializing"
        self.device_str = "cpu"
        self.gpu_name = ""
        self.dtype_str = "fp32"

        self.model = None
        self.torch = None
        self.dtype = None
        self.profiles: Dict[str, Dict[str, Any]] = {}
        self.prompt_cache: Dict[str, Any] = {}
        self.xvec_prompt_cache: Dict[str, Any] = {}
        self.wav_cache: "OrderedDict[Tuple[str, str, str], bytes]" = OrderedDict()
        self.wav_cache_max = 192
        self.infer_lock = threading.Lock()
        self.live_waiters = 0
        self.stop_event = threading.Event()
        self.prewarm_done = 0
        self.prewarm_total = len(PRIORITY_SPOTTER_PHRASES)

    def _disk_cache_path(self, prof_key: str, language: str, clean_text: str) -> Optional[Path]:
        info = self.profiles.get(prof_key)
        if not info:
            return None
        prof_dir = Path(info["dir"])
        cache_dir = prof_dir / ".cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        audio_mtime = 0
        try:
            if info["audio_path"]:
                audio_mtime = int(Path(info["audio_path"]).stat().st_mtime)
        except Exception:
            pass
        sig = f"{self.model_id}|{prof_key}|{audio_mtime}|{info['has_transcript']}|{language}|{clean_text}"
        digest = hashlib.sha1(sig.encode("utf-8")).hexdigest()[:20]
        return cache_dir / f"{digest}.wav"

    def _background_prewarm(self):
        if not self.prompt_cache:
            return
        # Prewarm urgent spotter phrases on disk for the first profile, yielding to live requests
        first_prof = next(iter(self.prompt_cache.keys()))
        done = 0
        for phrase in PRIORITY_SPOTTER_PHRASES:
            if self.stop_event.is_set() or not self.ready:
                break
            # Yield immediately whenever a real live PTT/spotter request is waiting
            while self.live_waiters > 0 and not self.stop_event.is_set():
                time.sleep(0.15)
            if self.stop_event.is_set():
                break
            disk_p = self._disk_cache_path(first_prof, "Spanish", phrase)
            if disk_p is not None and disk_p.is_file():
                done += 1
                self.prewarm_done = done
                continue
            try:
                _ = self.synthesize(phrase, first_prof, "Spanish", use_cache=True, _is_live=False)
                done += 1
                self.prewarm_done = done
            except Exception:
                pass
            time.sleep(0.05)
        print(
            f"[MDT Qwen3-TTS] Pre-caché en disco completada para '{first_prof}': {done}/{len(PRIORITY_SPOTTER_PHRASES)} avisos instantáneos (<2ms).",
            flush=True,
        )

    def _resolve_device_and_dtype(self, torch):
        cuda_ok = torch.cuda.is_available()
        is_rocm = bool(getattr(torch.version, "hip", None))

        if self.device_pref == "cpu" or not cuda_ok:
            device = "cpu"
            backend = "CPU"
            gpu_name = "CPU"
            dtype = torch.float32
            dtype_str = "fp32"
        else:
            device = "cuda:0"
            gpu_name = torch.cuda.get_device_name(0)
            backend = "ROCm (AMD)" if is_rocm else "CUDA (NVIDIA)"
            if self.dtype_pref == "bf16":
                dtype = torch.bfloat16
                dtype_str = "bf16"
            elif self.dtype_pref == "fp32":
                dtype = torch.float32
                dtype_str = "fp32"
            else:
                dtype = torch.float16
                dtype_str = "fp16"

        return device, backend, gpu_name, dtype, dtype_str

    def load(self):
        self.loading = True
        self.error = ""
        try:
            import torch  # type: ignore

            self.torch = torch
            self.device_str, self.backend, self.gpu_name, self.dtype, self.dtype_str = (
                self._resolve_device_and_dtype(torch)
            )

            if self.device_str.startswith("cuda"):
                is_rocm = bool(getattr(torch.version, "hip", None))
                try:
                    if is_rocm:
                        # On Windows ROCm (RDNA3/RDNA4), avoid MIOpen exhaustive probing & AOTriton TDR crashes
                        torch.backends.cudnn.benchmark = False
                        if hasattr(torch.backends.cuda, "enable_flash_sdp"):
                            torch.backends.cuda.enable_flash_sdp(False)
                        if hasattr(torch.backends.cuda, "enable_mem_efficient_sdp"):
                            torch.backends.cuda.enable_mem_efficient_sdp(False)
                        if hasattr(torch.backends.cuda, "enable_math_sdp"):
                            torch.backends.cuda.enable_math_sdp(True)
                    else:
                        torch.backends.cuda.matmul.allow_tf32 = True
                        torch.backends.cudnn.allow_tf32 = True
                        torch.backends.cudnn.benchmark = True
                        torch.set_float32_matmul_precision("high")
                except Exception:
                    pass

            try:
                from qwen_tts import Qwen3TTSModel  # type: ignore
            except ImportError as e:
                raise RuntimeError(
                    "Paquete 'qwen-tts' no instalado en este entorno Python. "
                    "Instala con: pip install -U qwen-tts soundfile"
                ) from e

            print(
                f"[MDT Qwen3-TTS] Cargando {self.model_id} en {self.backend} ({self.gpu_name}) [{self.dtype_str}]...",
                flush=True,
            )
            t0 = time.perf_counter()

            # Try SDPA first (fastest on CUDA & modern ROCm), fallback cleanly to eager if needed
            load_kwargs: Dict[str, Any] = {
                "device_map": self.device_str,
                "dtype": self.dtype,
            }
            try:
                self.model = Qwen3TTSModel.from_pretrained(
                    self.model_id,
                    attn_implementation="sdpa",
                    **load_kwargs,
                )
            except Exception:
                self.model = Qwen3TTSModel.from_pretrained(
                    self.model_id,
                    **load_kwargs,
                )

            dt = time.perf_counter() - t0
            print(f"[MDT Qwen3-TTS] Modelo cargado en {dt:.2f}s.", flush=True)

            self.reload_profiles()

            # Warm up GPU kernels BEFORE marking ready=True so incoming UI requests never block behind warmup
            if self.prompt_cache:
                first_prof = next(iter(self.prompt_cache.keys()))
                try:
                    print(f"[MDT Qwen3-TTS] Calentando kernels GPU con perfil '{first_prof}'...", flush=True)
                    _ = self.synthesize("Radio check.", first_prof, "Spanish", use_cache=False, _allow_loading=True)
                except Exception as warm_err:
                    print(f"[MDT Qwen3-TTS] Aviso en warmup: {warm_err}", flush=True)

            self.ready = True
            self.loading = False
            print("[MDT Qwen3-TTS] Servidor listo para síntesis en baja latencia.", flush=True)
            threading.Thread(target=self._background_prewarm, daemon=True).start()
        except Exception as e:
            self.error = str(e)
            self.ready = False
            self.loading = False
            print(f"[MDT Qwen3-TTS] ERROR: {e}", file=sys.stderr, flush=True)

    def reload_profiles(self) -> List[str]:
        self.profiles = scan_profiles(self.voices_dir)
        new_cache: Dict[str, Any] = {}
        new_xvec_cache: Dict[str, Any] = {}
        if self.model is not None:
            with self.infer_lock:
                for name, info in self.profiles.items():
                    if not info["has_audio"]:
                        continue
                    try:
                        with self.torch.inference_mode():
                            # Always precompute fast x-vector prompt (rock-solid for short 1-4 word calls & fallback)
                            xvec_prompt = self.model.create_voice_clone_prompt(
                                ref_audio=info["audio_path"],
                                x_vector_only_mode=True,
                            )
                            new_xvec_cache[name] = xvec_prompt

                            if info["has_transcript"]:
                                prompt = self.model.create_voice_clone_prompt(
                                    ref_audio=info["audio_path"],
                                    ref_text=info["ref_text"],
                                    x_vector_only_mode=False,
                                )
                            else:
                                prompt = xvec_prompt
                        new_cache[name] = prompt
                        print(
                            f"[MDT Qwen3-TTS] Perfil '{name}' precargado en VRAM "
                            f"({'audio+texto + x-vector' if info['has_transcript'] else 'x-vector solo audio'}).",
                            flush=True,
                        )
                    except Exception as e:
                        print(f"[MDT Qwen3-TTS] No se pudo precargar '{name}': {e}", file=sys.stderr, flush=True)
        self.prompt_cache = new_cache
        self.xvec_prompt_cache = new_xvec_cache
        self.wav_cache.clear()
        return list(self.prompt_cache.keys())

    def synthesize(
        self,
        text: str,
        profile: str,
        language: str = "Spanish",
        use_cache: bool = True,
        _allow_loading: bool = False,
        _is_live: bool = True,
    ) -> bytes:
        if (not self.ready and not _allow_loading) or self.model is None:
            raise RuntimeError(self.error or "El modelo Qwen3-TTS aún se está cargando.")

        clean_text = text.strip()
        if not clean_text:
            raise ValueError("Texto vacío.")

        # Resolve profile (exact or case-insensitive or first available)
        prof_key = profile.strip()
        if prof_key not in self.prompt_cache:
            lower_map = {k.lower(): k for k in self.prompt_cache.keys()}
            if prof_key.lower() in lower_map:
                prof_key = lower_map[prof_key.lower()]
            elif self.prompt_cache:
                prof_key = next(iter(self.prompt_cache.keys()))
            else:
                raise RuntimeError(
                    "No hay ningún perfil con audio de referencia (ref.wav) precargado en VocesQwen3."
                )

        cache_key = (prof_key, language, clean_text)
        if use_cache and cache_key in self.wav_cache:
            self.wav_cache.move_to_end(cache_key)
            return self.wav_cache[cache_key]

        # Check persistent disk cache (instant <2ms even across app/PC restarts!)
        disk_path = self._disk_cache_path(prof_key, language, clean_text) if use_cache else None
        if disk_path is not None and disk_path.is_file():
            try:
                wav_bytes = disk_path.read_bytes()
                if len(wav_bytes) > 64:
                    self.wav_cache[cache_key] = wav_bytes
                    if len(self.wav_cache) > self.wav_cache_max:
                        self.wav_cache.popitem(last=False)
                    return wav_bytes
            except Exception:
                pass

        import numpy as np  # type: ignore
        import soundfile as sf  # type: ignore

        # Ensure terminal punctuation so Qwen3 emits EOS cleanly on short 1-4 word calls
        tts_text = clean_text
        if tts_text[-1] not in ".!?…":
            tts_text = tts_text + "."

        word_count = len(tts_text.split())
        # Short 1-4 word phrases ("Libre.", "Bandera amarilla.") are much faster & more reliable with x-vector prompt
        use_xvec = word_count <= 4 and prof_key in self.xvec_prompt_cache
        prompt = self.xvec_prompt_cache[prof_key] if use_xvec else self.prompt_cache[prof_key]
        t0 = time.perf_counter()

        # Tight token budget (~12 Hz audio codec) so short phrases never stall for 19s!
        if word_count <= 3:
            est_tokens = 36
        elif word_count <= 6:
            est_tokens = 56
        else:
            est_tokens = max(60, min(135, word_count * 7 + 16))

        def _run_gen(active_prompt: Any) -> Tuple[Any, int]:
            gen_kwargs: Dict[str, Any] = {
                "text": tts_text,
                "language": language or "Spanish",
                "voice_clone_prompt": active_prompt,
                "max_new_tokens": est_tokens,
                "use_cache": True,
                "do_sample": True,
                "top_p": 0.85,
                "repetition_penalty": 1.08,
            }
            try:
                wavs, sr_out = self.model.generate_voice_clone(
                    subtalker_dosample=False,
                    **gen_kwargs,
                )
            except TypeError:
                gen_kwargs.pop("repetition_penalty", None)
                wavs, sr_out = self.model.generate_voice_clone(**gen_kwargs)
            return wavs[0], sr_out

        if _is_live:
            self.live_waiters += 1
        try:
            with self.infer_lock:
                with self.torch.inference_mode():
                    wav_arr, sr = _run_gen(prompt)
                    peak = float(np.max(np.abs(wav_arr))) if len(wav_arr) > 0 else 0.0
                    # If first attempt produced silence/near-empty audio, retry once with x-vector fallback
                    if (peak < 0.015 or len(wav_arr) < int(sr * 0.18)) and prof_key in self.xvec_prompt_cache:
                        print(f"[MDT Qwen3-TTS] Audio casi silencioso para '{tts_text}', reintentando con x-vector...", flush=True)
                        wav_arr, sr = _run_gen(self.xvec_prompt_cache[prof_key])
                        peak = float(np.max(np.abs(wav_arr))) if len(wav_arr) > 0 else 0.0
        finally:
            if _is_live:
                self.live_waiters = max(0, self.live_waiters - 1)

        if len(wav_arr) == 0 or peak < 0.01:
            raise RuntimeError(f"Qwen3-TTS generó audio vacío para: '{tts_text}'")

        # Trim excessive leading/trailing silence (keep 80ms natural margin) and normalize low gain
        arr = np.asarray(wav_arr, dtype=np.float32)
        active_idx = np.where(np.abs(arr) > max(0.012, peak * 0.04))[0]
        if len(active_idx) > 0:
            pad = int(sr * 0.08)
            start_i = max(0, int(active_idx[0]) - pad)
            end_i = min(len(arr), int(active_idx[-1]) + pad)
            arr = arr[start_i:end_i]
        cur_peak = float(np.max(np.abs(arr))) if len(arr) > 0 else 0.0
        if 0.01 < cur_peak < 0.65:
            arr = np.clip(arr * min(3.0, 0.78 / cur_peak), -0.99, 0.99)

        buf = io.BytesIO()
        sf.write(buf, arr, sr, format="WAV", subtype="PCM_16")
        wav_bytes = buf.getvalue()

        ms = (time.perf_counter() - t0) * 1000.0
        print(
            f"[MDT Qwen3-TTS] '{prof_key}' ({'xvec' if use_xvec else 'icl'}) '{tts_text}' -> {ms:.0f} ms ({len(arr)/sr:.2f}s)",
            flush=True,
        )

        if use_cache:
            self.wav_cache[cache_key] = wav_bytes
            if len(self.wav_cache) > self.wav_cache_max:
                self.wav_cache.popitem(last=False)
            if disk_path is not None:
                try:
                    disk_path.write_bytes(wav_bytes)
                except Exception:
                    pass

        return wav_bytes


class _NullCtx:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def make_handler(engine: Qwen3TtsEngine, server_ref: Dict[str, Any]):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _send_json(self, code: int, obj: Any):
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path.startswith("/health"):
                self._send_json(
                    200,
                    {
                        "status": "ready" if engine.ready else ("loading" if engine.loading else "error"),
                        "ready": engine.ready,
                        "loading": engine.loading,
                        "backend": engine.backend,
                        "device": engine.device_str,
                        "gpu": engine.gpu_name,
                        "dtype": engine.dtype_str,
                        "model": engine.model_id,
                        "cachedPrompts": list(engine.prompt_cache.keys()),
                        "error": engine.error,
                    },
                )
            else:
                self._send_json(404, {"error": "Not found"})

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(length) if length > 0 else b"{}"
            try:
                payload = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                payload = {}

            if self.path.startswith("/reload"):
                loaded = engine.reload_profiles()
                self._send_json(200, {"ok": True, "cachedPrompts": loaded})
                return

            if self.path.startswith("/shutdown"):
                engine.stop_event.set()
                self._send_json(200, {"ok": True})
                srv = server_ref.get("server")
                if srv is not None:
                    threading.Thread(target=srv.shutdown, daemon=True).start()
                return

            if self.path.startswith("/synthesize"):
                try:
                    text = str(payload.get("text", "")).strip()
                    profile = str(payload.get("profile", "")).strip()
                    language = str(payload.get("language", "Spanish")).strip() or "Spanish"
                    wav_bytes = engine.synthesize(text, profile, language)
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/wav")
                    self.send_header("Content-Length", str(len(wav_bytes)))
                    self.end_headers()
                    self.wfile.write(wav_bytes)
                except Exception as e:
                    self._send_json(500, {"error": str(e)})
                return

            self._send_json(404, {"error": "Not found"})

    return Handler


def main():
    parser = argparse.ArgumentParser(description="MDT-HUD Qwen3-TTS 0.6B Local Server")
    parser.add_argument("--voices-dir", required=True, help="Carpeta VocesQwen3 con subcarpetas por perfil")
    parser.add_argument("--model", default="Qwen/Qwen3-TTS-12Hz-0.6B-Base")
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "rocm", "cpu"])
    parser.add_argument("--dtype", default="fp16", choices=["fp16", "bf16", "fp32"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18421)
    args = parser.parse_args()

    engine = Qwen3TtsEngine(
        voices_dir=Path(args.voices_dir),
        model_id=args.model,
        device_pref=args.device,
        dtype_pref=args.dtype,
    )

    server_ref: Dict[str, Any] = {}
    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(engine, server_ref))
    server_ref["server"] = httpd

    # Load model in background so /health immediately responds with status="loading"
    threading.Thread(target=engine.load, daemon=True).start()

    print(f"[MDT Qwen3-TTS] Escuchando en http://{args.host}:{args.port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
