//! Experimental Monocular AI Depth Engine (`MDT-DepthAI`) — 100% External, 0% EAC Risk.
//!
//! Runs `Depth Anything V2 Small` (ONNX) asynchronously on a background worker thread
//! via ONNX Runtime + DirectML (GPU DirectX 12) over a tiny 280x154 downsampled copy
//! of the DXGI desktop frame. Never injects into or touches `Le Mans Ultimate.exe`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use serde::Serialize;

/// Exact 16:9 multiples of 14 (ViT-Small patch size 14) for ultra-fast GPU inference.
pub const DEPTH_W: usize = 280;
pub const DEPTH_H: usize = 154;

pub const MODEL_FILENAME: &str = "depth_anything_v2_vits.onnx";
pub const ORT_DLL_FILENAME: &str = "onnxruntime.dll";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDepthStatus {
    pub installed: bool,
    pub running: bool,
    pub fps: f32,
    pub backend: String,
    pub last_error: String,
}

pub fn ai_depth_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("AiDepth")
}

pub fn is_ai_depth_installed(data_dir: &Path) -> bool {
    let dir = ai_depth_dir(data_dir);
    dir.join(MODEL_FILENAME).is_file() && dir.join(ORT_DLL_FILENAME).is_file()
}

pub struct AiDepthHandle {
    data_dir: PathBuf,
    enabled: Arc<AtomicBool>,
    reload: Arc<AtomicBool>,
    input_slot: Arc<Mutex<Option<Vec<u8>>>>,
    output_map: Arc<Mutex<(u64, Vec<f32>)>>,
    status: Arc<Mutex<AiDepthStatus>>,
}

impl AiDepthHandle {
    pub fn new(data_dir: PathBuf) -> Self {
        let installed = is_ai_depth_installed(&data_dir);
        let enabled = Arc::new(AtomicBool::new(false));
        let reload = Arc::new(AtomicBool::new(false));
        let input_slot: Arc<Mutex<Option<Vec<u8>>>> = Arc::new(Mutex::new(None));
        let output_map: Arc<Mutex<(u64, Vec<f32>)>> =
            Arc::new(Mutex::new((0u64, vec![0.5f32; DEPTH_W * DEPTH_H])));
        let status = Arc::new(Mutex::new(AiDepthStatus {
            installed,
            running: false,
            fps: 0.0,
            backend: String::new(),
            last_error: String::new(),
        }));

        #[cfg(target_os = "windows")]
        {
            let dd = data_dir.clone();
            let en = Arc::clone(&enabled);
            let rl = Arc::clone(&reload);
            let inp = Arc::clone(&input_slot);
            let out = Arc::clone(&output_map);
            let st = Arc::clone(&status);
            std::thread::Builder::new()
                .name("mdt-ai-depth".into())
                .spawn(move || win_ort::run_depth_worker(dd, en, rl, inp, out, st))
                .ok();
        }

        Self {
            data_dir,
            enabled,
            reload,
            input_slot,
            output_map,
            status,
        }
    }

    pub fn set_enabled(&self, active: bool) {
        self.enabled.store(active, Ordering::Relaxed);
    }

    pub fn notify_installed(&self) {
        let inst = is_ai_depth_installed(&self.data_dir);
        if let Ok(mut st) = self.status.lock() {
            st.installed = inst;
            if inst {
                st.last_error.clear();
            }
        }
        self.reload.store(true, Ordering::Relaxed);
    }

    /// Non-blocking frame push from the D3D11 loop (drops frame if worker is busy).
    pub fn push_bgra_frame(&self, bgra: Vec<u8>) {
        if !self.enabled.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(mut slot) = self.input_slot.try_lock() {
            *slot = Some(bgra);
        }
    }

    /// Copies the latest normalized depth map (0.0 = near cockpit, 1.0 = far sky) if newer than `last_ver`.
    pub fn poll_depth_map(&self, last_ver: u64, dst: &mut Vec<f32>) -> Option<u64> {
        if let Ok(guard) = self.output_map.try_lock() {
            if guard.0 != last_ver && guard.1.len() == DEPTH_W * DEPTH_H {
                dst.clear();
                dst.extend_from_slice(&guard.1);
                return Some(guard.0);
            }
        }
        None
    }

    pub fn get_status(&self) -> AiDepthStatus {
        let inst = is_ai_depth_installed(&self.data_dir);
        if let Ok(mut st) = self.status.lock() {
            st.installed = inst;
            return st.clone();
        }
        AiDepthStatus {
            installed: inst,
            running: false,
            fps: 0.0,
            backend: String::new(),
            last_error: String::new(),
        }
    }
}

#[cfg(target_os = "windows")]
pub mod win_ort {
    use super::*;
    use std::sync::OnceLock;
    use std::time::{Duration, Instant};

    use ort::environment::Environment;
    use ort::ep;
    use ort::session::Session;
    use ort::value::Tensor;

    static ORT_ENV: OnceLock<Result<Environment, String>> = OnceLock::new();

    /// Shared process-wide ONNX Runtime environment (used by both AI Depth and Neural FX).
    pub fn ensure_ort_env(dll_path: &Path) -> Result<Environment, String> {
        let res = ORT_ENV.get_or_init(|| {
            ort::init_from(dll_path)
                .map_err(|e| format!("ort::init_from: {e}"))?
                .build()
                .map_err(|e| format!("ort env build: {e}"))
        });
        res.clone()
    }

    fn load_session(data_dir: &Path) -> Result<(Session, String), String> {
        let dir = ai_depth_dir(data_dir);
        let dll_path = dir.join(ORT_DLL_FILENAME);
        let model_path = dir.join(MODEL_FILENAME);
        if !dll_path.is_file() || !model_path.is_file() {
            return Err("Motor IA Depth no instalado (pulsa Instalar Motor IA)".into());
        }
        let env = ensure_ort_env(&dll_path)?;

        // Try DirectML GPU first (works on NVIDIA, AMD, Intel DX12 GPUs)
        let dml_res: Result<Session, String> = (|| {
            let mut b = Session::builder(&env).map_err(|e| e.to_string())?;
            b = b
                .with_execution_providers([ep::DirectML::default().build()])
                .map_err(|e| e.to_string())?;
            b.commit_from_file(&model_path).map_err(|e| e.to_string())
        })();

        match dml_res {
            Ok(sess) => Ok((sess, "DirectML GPU".to_string())),
            Err(_) => {
                // Clean fallback to CPU if DirectML provider fails
                let mut b = Session::builder(&env).map_err(|e| format!("Session builder: {e}"))?;
                b = b.with_intra_threads(4).map_err(|e| format!("intra_threads: {e}"))?;
                let cpu_sess = b
                    .commit_from_file(&model_path)
                    .map_err(|e| format!("Error cargando modelo ONNX: {e}"))?;
                Ok((cpu_sess, "CPU (Fallback)".to_string()))
            }
        }
    }

    pub fn run_depth_worker(
        data_dir: PathBuf,
        enabled: Arc<AtomicBool>,
        reload: Arc<AtomicBool>,
        input_slot: Arc<Mutex<Option<Vec<u8>>>>,
        output_map: Arc<Mutex<(u64, Vec<f32>)>>,
        status: Arc<Mutex<AiDepthStatus>>,
    ) {
        let mut session: Option<Session> = None;
        let mut nchw = vec![0.0f32; 3 * DEPTH_W * DEPTH_H];
        let mut norm_buf = vec![0.5f32; DEPTH_W * DEPTH_H];
        let mut ver: u64 = 0;
        let mut ema_min = 0.0f32;
        let mut ema_max = 10.0f32;
        let mut has_ema = false;
        let mut fps_timer = Instant::now();
        let mut frames = 0u32;

        loop {
            if !enabled.load(Ordering::Relaxed) {
                if session.is_some() {
                    session = None;
                    if let Ok(mut st) = status.lock() {
                        st.running = false;
                        st.fps = 0.0;
                    }
                }
                std::thread::sleep(Duration::from_millis(120));
                continue;
            }

            if reload.swap(false, Ordering::Relaxed) {
                session = None;
            }

            if session.is_none() {
                match load_session(&data_dir) {
                    Ok((sess, backend)) => {
                        session = Some(sess);
                        has_ema = false;
                        if let Ok(mut st) = status.lock() {
                            st.installed = true;
                            st.running = true;
                            st.backend = backend;
                            st.last_error.clear();
                        }
                    }
                    Err(err) => {
                        if let Ok(mut st) = status.lock() {
                            st.installed = is_ai_depth_installed(&data_dir);
                            st.running = false;
                            st.fps = 0.0;
                            st.last_error = err;
                        }
                        std::thread::sleep(Duration::from_millis(800));
                        continue;
                    }
                }
            }

            let bgra_opt = input_slot.lock().ok().and_then(|mut g| g.take());
            let Some(bgra) = bgra_opt else {
                std::thread::sleep(Duration::from_millis(8));
                continue;
            };
            if bgra.len() < DEPTH_W * DEPTH_H * 4 {
                continue;
            }

            // Convert BGRA u8 -> ImageNet-normalized NCHW f32 [1, 3, DEPTH_H, DEPTH_W]
            let plane = DEPTH_W * DEPTH_H;
            const MEAN: [f32; 3] = [0.485, 0.456, 0.406];
            const INV_STD: [f32; 3] = [1.0 / 0.229, 1.0 / 0.224, 1.0 / 0.225];
            for i in 0..plane {
                let p = i * 4;
                let b = (bgra[p] as f32) * (1.0 / 255.0);
                let g = (bgra[p + 1] as f32) * (1.0 / 255.0);
                let r = (bgra[p + 2] as f32) * (1.0 / 255.0);
                nchw[i] = (r - MEAN[0]) * INV_STD[0];
                nchw[plane + i] = (g - MEAN[1]) * INV_STD[1];
                nchw[plane * 2 + i] = (b - MEAN[2]) * INV_STD[2];
            }

            let Some(sess) = session.as_mut() else { continue };
            let input_tensor = match Tensor::from_array(([1usize, 3, DEPTH_H, DEPTH_W], nchw.clone())) {
                Ok(t) => t,
                Err(e) => {
                    if let Ok(mut st) = status.lock() {
                        st.last_error = format!("Tensor input: {e}");
                    }
                    std::thread::sleep(Duration::from_millis(200));
                    continue;
                }
            };

            let run_res = sess.run(ort::inputs![input_tensor]);
            match run_res {
                Ok(outputs) => {
                    if let Ok((_shape, data)) = outputs[0].try_extract_tensor::<f32>() {
                        if data.len() >= plane {
                            // Robust min/max with temporal EMA so depth never flickers under bridges/tunnels
                            let mut fmin = f32::INFINITY;
                            let mut fmax = f32::NEG_INFINITY;
                            for &v in &data[..plane] {
                                if v.is_finite() {
                                    if v < fmin { fmin = v; }
                                    if v > fmax { fmax = v; }
                                }
                            }
                            if fmax > fmin + 1e-4 {
                                if !has_ema {
                                    ema_min = fmin;
                                    ema_max = fmax;
                                    has_ema = true;
                                } else {
                                    ema_min += (fmin - ema_min) * 0.12;
                                    ema_max += (fmax - ema_max) * 0.12;
                                }
                                let inv_span = 1.0 / (ema_max - ema_min).max(1e-4);
                                for i in 0..plane {
                                    let v = data[i];
                                    // Depth Anything outputs disparity (high = close, low = far) -> invert to 0=near, 1=far
                                    let disp = ((v - ema_min) * inv_span).clamp(0.0, 1.0);
                                    norm_buf[i] = 1.0 - disp;
                                }
                                ver = ver.wrapping_add(1);
                                if let Ok(mut out) = output_map.lock() {
                                    out.0 = ver;
                                    out.1.copy_from_slice(&norm_buf);
                                }
                            }
                        }
                    }

                    frames += 1;
                    let el = fps_timer.elapsed().as_secs_f32();
                    if el >= 1.0 {
                        if let Ok(mut st) = status.lock() {
                            st.running = true;
                            st.fps = (frames as f32) / el;
                            st.last_error.clear();
                        }
                        frames = 0;
                        fps_timer = Instant::now();
                    }
                }
                Err(e) => {
                    if let Ok(mut st) = status.lock() {
                        st.last_error = format!("Inferencia IA Depth: {e}");
                    }
                    std::thread::sleep(Duration::from_millis(250));
                }
            }
        }
    }
}
