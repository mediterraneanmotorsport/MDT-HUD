//! Experimental External Neural Renderer (`MDT-NeuralFX` / Mini-DLSS 5 style) — 0% EAC Risk.
//!
//! Runs lightweight image-to-image neural relighting / photorealism ONNX models
//! (e.g. Illumination Adaptive Transformer `iat_exposure.onnx` or any user-loaded `.onnx`)
//! asynchronously on DirectML GPU at a low internal resolution (384x216 / 512x288 / 640x360),
//! then feeds the result to our DirectX 11 AMD FSR 1.0 (EASU + RCAS) upscaler + high-frequency
//! native detail transfer for maximum FPS and low latency on NVIDIA, AMD, and Intel GPUs.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use serde::Serialize;

pub const DEFAULT_NEURAL_MODEL: &str = "iat_exposure.onnx";
pub const DEFAULT_NEURAL_DATA: &str = "iat_exposure.onnx.data";

pub fn neural_res_dims(preset: u32) -> (usize, usize) {
    // All dimensions are exact multiples of 16 (required by U-Net / Transformer / IAT Reshape nodes)
    match preset {
        0 => (640, 352),   // Ultra-Fast ~360p
        1 => (960, 544),   // Balanced ~540p
        2 => (1280, 720),  // Quality 720p HD
        3 => (1600, 896),  // Ultra ~900p
        _ => (1920, 1088), // Native ~1080p Full HD
    }
}

pub fn neural_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("NeuralFX")
}

pub fn resolve_ort_dll(data_dir: &Path) -> Option<PathBuf> {
    let p1 = crate::ai_depth::ai_depth_dir(data_dir).join(crate::ai_depth::ORT_DLL_FILENAME);
    if p1.is_file() {
        return Some(p1);
    }
    let p2 = neural_dir(data_dir).join(crate::ai_depth::ORT_DLL_FILENAME);
    if p2.is_file() {
        return Some(p2);
    }
    None
}

pub fn is_neural_fx_installed(data_dir: &Path, custom_model: Option<&Path>) -> bool {
    let has_dll = resolve_ort_dll(data_dir).is_some();
    if !has_dll {
        return false;
    }
    if let Some(p) = custom_model {
        if p.is_file() {
            return true;
        }
    }
    neural_dir(data_dir).join(DEFAULT_NEURAL_MODEL).is_file()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeuralFxStatus {
    pub installed: bool,
    pub running: bool,
    pub fps: f32,
    pub latency_ms: f32,
    pub backend: String,
    pub model_name: String,
    pub width: u32,
    pub height: u32,
    pub last_error: String,
}

pub struct NeuralOutputFrame {
    pub version: u64,
    pub width: usize,
    pub height: usize,
    pub bgra: Vec<u8>,
}

pub struct NeuralFxHandle {
    data_dir: PathBuf,
    enabled: Arc<AtomicBool>,
    res_preset: Arc<AtomicU32>,
    reload: Arc<AtomicBool>,
    custom_model_path: Arc<Mutex<Option<PathBuf>>>,
    input_slot: Arc<Mutex<Option<(usize, usize, Vec<u8>)>>>,
    output_frame: Arc<Mutex<NeuralOutputFrame>>,
    status: Arc<Mutex<NeuralFxStatus>>,
}

impl NeuralFxHandle {
    pub fn new(data_dir: PathBuf) -> Self {
        let installed = is_neural_fx_installed(&data_dir, None);
        let enabled = Arc::new(AtomicBool::new(false));
        let res_preset = Arc::new(AtomicU32::new(1));
        let reload = Arc::new(AtomicBool::new(false));
        let custom_model_path: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
        let input_slot: Arc<Mutex<Option<(usize, usize, Vec<u8>)>>> = Arc::new(Mutex::new(None));
        let output_frame = Arc::new(Mutex::new(NeuralOutputFrame {
            version: 0,
            width: 512,
            height: 288,
            bgra: vec![0u8; 512 * 288 * 4],
        }));
        let status = Arc::new(Mutex::new(NeuralFxStatus {
            installed,
            running: false,
            fps: 0.0,
            latency_ms: 0.0,
            backend: String::new(),
            model_name: DEFAULT_NEURAL_MODEL.to_string(),
            width: 512,
            height: 288,
            last_error: String::new(),
        }));

        #[cfg(target_os = "windows")]
        {
            let dd = data_dir.clone();
            let en = Arc::clone(&enabled);
            let rp = Arc::clone(&res_preset);
            let rl = Arc::clone(&reload);
            let cm = Arc::clone(&custom_model_path);
            let inp = Arc::clone(&input_slot);
            let out = Arc::clone(&output_frame);
            let st = Arc::clone(&status);
            std::thread::Builder::new()
                .name("mdt-neural-fx".into())
                .spawn(move || win_neural::run_neural_worker(dd, en, rp, rl, cm, inp, out, st))
                .ok();
        }

        Self {
            data_dir,
            enabled,
            res_preset,
            reload,
            custom_model_path,
            input_slot,
            output_frame,
            status,
        }
    }

    pub fn configure(&self, active: bool, res_preset: u32) {
        self.enabled.store(active, Ordering::Relaxed);
        self.res_preset.store(res_preset.min(4), Ordering::Relaxed);
    }

    pub fn notify_installed(&self) {
        let cm = self.custom_model_path.lock().ok().and_then(|g| g.clone());
        let inst = is_neural_fx_installed(&self.data_dir, cm.as_deref());
        if let Ok(mut st) = self.status.lock() {
            st.installed = inst;
            if inst {
                st.last_error.clear();
            }
        }
        self.reload.store(true, Ordering::Relaxed);
    }

    pub fn set_custom_model(&self, path: Option<PathBuf>) {
        if let Ok(mut g) = self.custom_model_path.lock() {
            *g = path.clone();
        }
        if let Ok(mut st) = self.status.lock() {
            st.model_name = path
                .as_ref()
                .and_then(|p| p.file_name().and_then(|s| s.to_str()))
                .unwrap_or(DEFAULT_NEURAL_MODEL)
                .to_string();
            st.installed = is_neural_fx_installed(&self.data_dir, path.as_deref());
            st.last_error.clear();
        }
        self.reload.store(true, Ordering::Relaxed);
    }

    pub fn is_ready_for_frame(&self) -> bool {
        if !self.enabled.load(Ordering::Relaxed) {
            return false;
        }
        self.input_slot
            .try_lock()
            .map(|g| g.is_none())
            .unwrap_or(false)
    }

    pub fn push_bgra_frame(&self, w: usize, h: usize, bgra: Vec<u8>) {
        if !self.enabled.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(mut slot) = self.input_slot.try_lock() {
            *slot = Some((w, h, bgra));
        }
    }

    pub fn poll_output(&self, last_ver: u64, dst: &mut Vec<u8>) -> Option<(u64, usize, usize)> {
        if let Ok(guard) = self.output_frame.try_lock() {
            if guard.version != last_ver && guard.bgra.len() == guard.width * guard.height * 4 {
                dst.clear();
                dst.extend_from_slice(&guard.bgra);
                return Some((guard.version, guard.width, guard.height));
            }
        }
        None
    }

    pub fn get_status(&self) -> NeuralFxStatus {
        let cm = self.custom_model_path.lock().ok().and_then(|g| g.clone());
        let inst = is_neural_fx_installed(&self.data_dir, cm.as_deref());
        let (w, h) = neural_res_dims(self.res_preset.load(Ordering::Relaxed));
        if let Ok(mut st) = self.status.lock() {
            st.installed = inst;
            st.width = w as u32;
            st.height = h as u32;
            return st.clone();
        }
        NeuralFxStatus {
            installed: inst,
            running: false,
            fps: 0.0,
            latency_ms: 0.0,
            backend: String::new(),
            model_name: DEFAULT_NEURAL_MODEL.to_string(),
            width: w as u32,
            height: h as u32,
            last_error: String::new(),
        }
    }
}

#[cfg(target_os = "windows")]
mod win_neural {
    use super::*;
    use std::time::{Duration, Instant};

    use ort::ep;
    use ort::session::Session;
    use ort::value::Tensor;

    fn load_session(
        data_dir: &Path,
        custom_path: Option<&Path>,
        w: usize,
        h: usize,
        force_cpu: bool,
    ) -> Result<(Session, String, String), String> {
        let dll_path = resolve_ort_dll(data_dir)
            .ok_or_else(|| "Motor DirectML no instalado (pulsa Instalar Motor Neural)".to_string())?;
        let model_path = match custom_path {
            Some(p) if p.is_file() => p.to_path_buf(),
            _ => neural_dir(data_dir).join(DEFAULT_NEURAL_MODEL),
        };
        if !model_path.is_file() {
            return Err("Modelo Neural ONNX no instalado (pulsa Instalar Motor Neural)".into());
        }
        let model_name = model_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(DEFAULT_NEURAL_MODEL)
            .to_string();

        let env = crate::ai_depth::win_ort::ensure_ort_env(&dll_path)?;

        if !force_cpu {
            let dml_res: Result<Session, String> = (|| {
                let mut b = Session::builder(&env).map_err(|e| e.to_string())?;
                // Fix symbolic dynamic axes so DirectML compiles Reshape/View nodes natively on GPU!
                b = b
                    .with_dimension_override("batch", 1)
                    .map_err(|e| e.to_string())?;
                b = b
                    .with_dimension_override("height", h as i64)
                    .map_err(|e| e.to_string())?;
                b = b
                    .with_dimension_override("width", w as i64)
                    .map_err(|e| e.to_string())?;
                b = b
                    .with_execution_providers([ep::DirectML::default().build()])
                    .map_err(|e| e.to_string())?;
                b.commit_from_file(&model_path).map_err(|e| e.to_string())
            })();
            if let Ok(sess) = dml_res {
                return Ok((sess, "DirectML GPU".to_string(), model_name));
            }
        }

        // Keep CPU fallback light (2 threads max) so it NEVER starves Le Mans Ultimate
        let mut b = Session::builder(&env).map_err(|e| format!("Session builder: {e}"))?;
        b = b.with_intra_threads(2).map_err(|e| format!("intra_threads: {e}"))?;
        let cpu_sess = b
            .commit_from_file(&model_path)
            .map_err(|e| format!("Error cargando modelo Neural ONNX: {e}"))?;
        Ok((
            cpu_sess,
            if force_cpu { "CPU (Ligero · 2 hilos)".to_string() } else { "CPU".to_string() },
            model_name,
        ))
    }

    pub fn run_neural_worker(
        data_dir: PathBuf,
        enabled: Arc<AtomicBool>,
        res_preset: Arc<AtomicU32>,
        reload: Arc<AtomicBool>,
        custom_model_path: Arc<Mutex<Option<PathBuf>>>,
        input_slot: Arc<Mutex<Option<(usize, usize, Vec<u8>)>>>,
        output_frame: Arc<Mutex<NeuralOutputFrame>>,
        status: Arc<Mutex<NeuralFxStatus>>,
    ) {
        let mut session: Option<Session> = None;
        let mut sess_dims: (usize, usize) = (0, 0);
        let mut force_cpu = false;
        let mut ver: u64 = 0;
        let mut fps_timer = Instant::now();
        let mut frames = 0u32;
        let mut ema_ms = 0.0f32;

        loop {
            if !enabled.load(Ordering::Relaxed) {
                if session.is_some() {
                    session = None;
                    sess_dims = (0, 0);
                    if let Ok(mut st) = status.lock() {
                        st.running = false;
                        st.fps = 0.0;
                    }
                }
                std::thread::sleep(Duration::from_millis(120));
                continue;
            }

            let cur_dims = neural_res_dims(res_preset.load(Ordering::Relaxed));
            if reload.swap(false, Ordering::Relaxed) || sess_dims != cur_dims {
                session = None;
                force_cpu = false;
                sess_dims = cur_dims;
            }

            if session.is_none() {
                let cm = custom_model_path.lock().ok().and_then(|g| g.clone());
                match load_session(&data_dir, cm.as_deref(), cur_dims.0, cur_dims.1, force_cpu) {
                    Ok((sess, backend, model_name)) => {
                        session = Some(sess);
                        sess_dims = cur_dims;
                        if let Ok(mut st) = status.lock() {
                            st.installed = true;
                            st.running = true;
                            st.backend = backend;
                            st.model_name = model_name;
                            st.last_error.clear();
                        }
                    }
                    Err(err) => {
                        if let Ok(mut st) = status.lock() {
                            st.installed = is_neural_fx_installed(&data_dir, cm.as_deref());
                            st.running = false;
                            st.fps = 0.0;
                            st.last_error = err;
                        }
                        std::thread::sleep(Duration::from_millis(800));
                        continue;
                    }
                }
            }

            let frame_opt = input_slot.lock().ok().and_then(|mut g| g.take());
            let Some((w, h, bgra)) = frame_opt else {
                std::thread::sleep(Duration::from_millis(4));
                continue;
            };
            let plane = w * h;
            if bgra.len() < plane * 4 || plane == 0 {
                continue;
            }

            let t0 = Instant::now();

            // Convert BGRA u8 -> RGB NCHW f32 [1, 3, H, W] in [0.0 .. 1.0]
            let mut nchw = vec![0.0f32; 3 * plane];
            for i in 0..plane {
                let p = i * 4;
                nchw[i] = (bgra[p + 2] as f32) * (1.0 / 255.0);
                nchw[plane + i] = (bgra[p + 1] as f32) * (1.0 / 255.0);
                nchw[plane * 2 + i] = (bgra[p] as f32) * (1.0 / 255.0);
            }

            let Some(sess) = session.as_mut() else { continue };
            let input_tensor = match Tensor::from_array(([1usize, 3, h, w], nchw)) {
                Ok(t) => t,
                Err(e) => {
                    if let Ok(mut st) = status.lock() {
                        st.last_error = format!("Tensor Neural: {e}");
                    }
                    std::thread::sleep(Duration::from_millis(150));
                    continue;
                }
            };

            let mut need_cpu_fallback = false;
            match sess.run(ort::inputs![input_tensor]) {
                Ok(outputs) => {
                    // Pick the image output tensor (last 4D [1, 3, H, W] output — IAT outputs (mul, add, enhanced_img))
                    let mut chosen: Option<(usize, usize, Vec<f32>)> = None;
                    for idx in (0..outputs.len()).rev() {
                        if let Ok((shape, data)) = outputs[idx].try_extract_tensor::<f32>() {
                            let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
                            if dims.len() == 4 && dims[1] == 3 && dims[2] >= 32 && dims[3] >= 32 {
                                chosen = Some((dims[3], dims[2], data.to_vec()));
                                break;
                            }
                        }
                    }

                    if let Some((ow, oh, data)) = chosen {
                        let oplane = ow * oh;
                        if data.len() >= oplane * 3 {
                            // Auto-detect value range: [0..1], [-1..1], or [0..255]
                            let mut max_v = 0.0f32;
                            let mut min_v = 0.0f32;
                            let step = (oplane / 256).max(1);
                            for i in (0..oplane).step_by(step) {
                                let v = data[i];
                                if v.is_finite() {
                                    if v > max_v { max_v = v; }
                                    if v < min_v { min_v = v; }
                                }
                            }
                            let is_255 = max_v > 2.5;
                            let is_neg1 = !is_255 && min_v < -0.15;

                            let mut out_bgra = vec![255u8; oplane * 4];
                            for i in 0..oplane {
                                let mut r = data[i];
                                let mut g = data[oplane + i];
                                let mut b = data[oplane * 2 + i];
                                if is_255 {
                                    r *= 1.0 / 255.0;
                                    g *= 1.0 / 255.0;
                                    b *= 1.0 / 255.0;
                                } else if is_neg1 {
                                    r = r * 0.5 + 0.5;
                                    g = g * 0.5 + 0.5;
                                    b = b * 0.5 + 0.5;
                                }
                                let p = i * 4;
                                out_bgra[p] = (b.clamp(0.0, 1.0) * 255.0) as u8;
                                out_bgra[p + 1] = (g.clamp(0.0, 1.0) * 255.0) as u8;
                                out_bgra[p + 2] = (r.clamp(0.0, 1.0) * 255.0) as u8;
                                out_bgra[p + 3] = 255;
                            }
                            ver = ver.wrapping_add(1);
                            if let Ok(mut out) = output_frame.lock() {
                                out.version = ver;
                                out.width = ow;
                                out.height = oh;
                                out.bgra = out_bgra;
                            }
                        }
                    }

                    let ms = t0.elapsed().as_secs_f32() * 1000.0;
                    ema_ms = if ema_ms < 0.01 { ms } else { ema_ms * 0.85 + ms * 0.15 };
                    frames += 1;
                    let el = fps_timer.elapsed().as_secs_f32();
                    if el >= 1.0 {
                        if let Ok(mut st) = status.lock() {
                            st.running = true;
                            st.fps = (frames as f32) / el;
                            st.latency_ms = (ema_ms * 10.0).round() / 10.0;
                            st.last_error.clear();
                        }
                        frames = 0;
                        fps_timer = Instant::now();
                    }
                }
                Err(e) => {
                    let msg = e.to_string();
                    // If DirectML rejects a dynamic Reshape/View node at runtime, seamlessly fall back to multi-threaded CPU
                    if !force_cpu && (msg.contains("DmlExecutionProvider") || msg.contains("80070057") || msg.contains("Reshape")) {
                        force_cpu = true;
                        need_cpu_fallback = true;
                        if let Ok(mut st) = status.lock() {
                            st.last_error.clear();
                        }
                    } else {
                        if let Ok(mut st) = status.lock() {
                            st.last_error = format!("Inferencia Neural: {msg}");
                        }
                        std::thread::sleep(Duration::from_millis(250));
                    }
                }
            }
            if need_cpu_fallback {
                session = None;
                continue;
            }
        }
    }
}
