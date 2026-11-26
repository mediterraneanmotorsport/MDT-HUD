//! Native Windows WASAPI Process-Loopback Spatial Audio Engine (`MDT-Audio3D`).
//!
//! Captures ONLY `Le Mans Ultimate.exe`'s live audio stream via Windows 10/11
//! WASAPI Process Loopback (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`),
//! processes it at 48 kHz stereo float32 through a real-time Rust DSP chain
//! (Binaural HRTF Crossfeed, 7.1 Virtual Surround, 8D G-Force Rotator, Carbon
//! Cockpit Early Reflections, Sub-Bass Exhaust Harmonic Exciter, Helmet
//! Acoustic Resonance & High-Speed Aero Wind) and renders the parallel wet
//! spatial bus back to the default audio output device.

use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio3DParams {
    #[serde(default)]
    pub enabled: bool,
    /// 0 = Binaural HRTF, 1 = 7.1 Virtual Surround, 2 = 8D Dinámico, 3 = 5.1 Cockpit
    #[serde(default)]
    pub mode: u32,
    #[serde(default = "default_mix")]
    pub wet_mix: f32,
    #[serde(default = "default_width")]
    pub spatial_width: f32,
    #[serde(default = "default_reverb")]
    pub cockpit_reverb: f32,
    #[serde(default = "default_bass")]
    pub sub_bass_punch: f32,
    #[serde(default)]
    pub helmet_resonance: f32,
    #[serde(default = "default_true")]
    pub gforce_panning: bool,
    #[serde(default)]
    pub aero_wind: f32,
    // --- #3: 5-Band Parametric EQ (-12..+12 dB) + Auto-Class Profile ---
    #[serde(default)]
    pub eq_sub_db: f32,      // 60 Hz Low-Shelf
    #[serde(default)]
    pub eq_bass_db: f32,     // 180 Hz Peaking
    #[serde(default)]
    pub eq_mid_db: f32,      // 650 Hz Peaking
    #[serde(default)]
    pub eq_presence_db: f32, // 2400 Hz Peaking
    #[serde(default)]
    pub eq_air_db: f32,      // 8000 Hz High-Shelf
    #[serde(default)]
    pub auto_by_class: bool,
    // --- #4: Spatial Rival Proximity Audio (Doppler Left/Right) ---
    #[serde(default = "default_prox")]
    pub rival_proximity: f32,
}

fn default_true() -> bool { true }
fn default_mix() -> f32 { 0.48 }
fn default_width() -> f32 { 0.72 }
fn default_reverb() -> f32 { 0.36 }
fn default_bass() -> f32 { 0.42 }
fn default_prox() -> f32 { 0.45 }

impl Default for Audio3DParams {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: 0,
            wet_mix: default_mix(),
            spatial_width: default_width(),
            cockpit_reverb: default_reverb(),
            sub_bass_punch: default_bass(),
            helmet_resonance: 0.2,
            gforce_panning: true,
            aero_wind: 0.18,
            eq_sub_db: 0.0,
            eq_bass_db: 0.0,
            eq_mid_db: 0.0,
            eq_presence_db: 0.0,
            eq_air_db: 0.0,
            auto_by_class: false,
            rival_proximity: default_prox(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio3DStatus {
    pub running: bool,
    pub lmu_pid: u32,
    pub sample_rate: u32,
    pub peak_level: f32,
    pub last_error: String,
}

pub struct Audio3DEngineHandle {
    pub params: Arc<Mutex<Audio3DParams>>,
    pub status: Arc<Mutex<Audio3DStatus>>,
}

impl Audio3DEngineHandle {
    pub fn new(shared: Arc<crate::engine::Shared>) -> Self {
        let params = Arc::new(Mutex::new(Audio3DParams::default()));
        let status = Arc::new(Mutex::new(Audio3DStatus {
            running: false,
            lmu_pid: 0,
            sample_rate: 48000,
            peak_level: 0.0,
            last_error: String::new(),
        }));

        #[cfg(target_os = "windows")]
        {
            let p = Arc::clone(&params);
            let s = Arc::clone(&status);
            let sh = Arc::clone(&shared);
            std::thread::Builder::new()
                .name("mdt-audio3d-wasapi".into())
                .spawn(move || win_wasapi::run_audio_loop(p, s, sh))
                .ok();
        }

        Self { params, status }
    }

    pub fn update_params(&self, next: Audio3DParams) {
        if let Ok(mut g) = self.params.lock() {
            *g = next;
        }
    }

    pub fn get_status(&self) -> Audio3DStatus {
        self.status
            .lock()
            .map(|g| g.clone())
            .unwrap_or(Audio3DStatus {
                running: false,
                lmu_pid: 0,
                sample_rate: 48000,
                peak_level: 0.0,
                last_error: String::new(),
            })
    }
}

/// Stereo 2nd-order Biquad filter (Audio EQ Cookbook) for the 5-Band Parametric EQ.
#[derive(Clone, Copy)]
struct BiquadStereo {
    b0: f32, b1: f32, b2: f32, a1: f32, a2: f32,
    z1_l: f32, z2_l: f32,
    z1_r: f32, z2_r: f32,
}

impl BiquadStereo {
    fn identity() -> Self {
        Self { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0, z1_l: 0.0, z2_l: 0.0, z1_r: 0.0, z2_r: 0.0 }
    }

    fn set_peaking(&mut self, sr: f32, freq: f32, q: f32, db: f32) {
        if db.abs() < 0.05 {
            self.b0 = 1.0; self.b1 = 0.0; self.b2 = 0.0; self.a1 = 0.0; self.a2 = 0.0;
            return;
        }
        let a = 10.0f32.powf(db / 40.0);
        let w0 = std::f32::consts::TAU * (freq / sr);
        let cos_w0 = w0.cos();
        let alpha = w0.sin() / (2.0 * q);
        let a0 = 1.0 + alpha / a;
        self.b0 = (1.0 + alpha * a) / a0;
        self.b1 = (-2.0 * cos_w0) / a0;
        self.b2 = (1.0 - alpha * a) / a0;
        self.a1 = (-2.0 * cos_w0) / a0;
        self.a2 = (1.0 - alpha / a) / a0;
    }

    fn set_low_shelf(&mut self, sr: f32, freq: f32, db: f32) {
        if db.abs() < 0.05 {
            self.b0 = 1.0; self.b1 = 0.0; self.b2 = 0.0; self.a1 = 0.0; self.a2 = 0.0;
            return;
        }
        let a = 10.0f32.powf(db / 40.0);
        let w0 = std::f32::consts::TAU * (freq / sr);
        let cos_w0 = w0.cos();
        let alpha = w0.sin() * 0.5 * 2.0f32.sqrt();
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        self.b0 = (a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha)) / a0;
        self.b1 = (2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0)) / a0;
        self.b2 = (a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha)) / a0;
        self.a1 = (-2.0 * ((a - 1.0) + (a + 1.0) * cos_w0)) / a0;
        self.a2 = ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha) / a0;
    }

    fn set_high_shelf(&mut self, sr: f32, freq: f32, db: f32) {
        if db.abs() < 0.05 {
            self.b0 = 1.0; self.b1 = 0.0; self.b2 = 0.0; self.a1 = 0.0; self.a2 = 0.0;
            return;
        }
        let a = 10.0f32.powf(db / 40.0);
        let w0 = std::f32::consts::TAU * (freq / sr);
        let cos_w0 = w0.cos();
        let alpha = w0.sin() * 0.5 * 2.0f32.sqrt();
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        self.b0 = (a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha)) / a0;
        self.b1 = (-2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0)) / a0;
        self.b2 = (a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha)) / a0;
        self.a1 = (2.0 * ((a - 1.0) - (a + 1.0) * cos_w0)) / a0;
        self.a2 = ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha) / a0;
    }

    #[inline]
    fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        let ol = self.b0 * l + self.z1_l;
        self.z1_l = self.b1 * l - self.a1 * ol + self.z2_l;
        self.z2_l = self.b2 * l - self.a2 * ol;
        let or = self.b0 * r + self.z1_r;
        self.z1_r = self.b1 * r - self.a1 * or + self.z2_r;
        self.z2_r = self.b2 * r - self.a2 * or;
        (ol, or)
    }
}

/// Real-time 48kHz stereo float32 Spatial / Binaural / 7.1 / Cockpit DSP processor.
/// Outputs a phase-clean parallel wet spatial bus (surround reflections + binaural
/// HRTF side/rear channels + sub-bass exhaust harmonics + 5-band EQ + rival proximity + aero wind).
struct SpatialCockpitDsp {
    sr: f32,
    delay_l: Vec<f32>,
    delay_r: Vec<f32>,
    pos: usize,
    lp_sub_l: f32,
    lp_sub_r: f32,
    lp_shadow_l: f32,
    lp_shadow_r: f32,
    lp_helmet_l: f32,
    lp_helmet_r: f32,
    lp_wind: f32,
    hp_wind: f32,
    phase_8d: f32,
    prox_phase_l: f32,
    prox_phase_r: f32,
    prox_lp_l: f32,
    prox_lp_r: f32,
    eq_bands: [BiquadStereo; 5],
    last_eq_sig: [i32; 5],
    rng: u32,
}

impl SpatialCockpitDsp {
    fn new(sr: u32) -> Self {
        let len = ((sr as usize) / 10).max(4800); // 100ms ring buffer
        Self {
            sr: sr as f32,
            delay_l: vec![0.0; len],
            delay_r: vec![0.0; len],
            pos: 0,
            lp_sub_l: 0.0,
            lp_sub_r: 0.0,
            lp_shadow_l: 0.0,
            lp_shadow_r: 0.0,
            lp_helmet_l: 0.0,
            lp_helmet_r: 0.0,
            lp_wind: 0.0,
            hp_wind: 0.0,
            phase_8d: 0.0,
            prox_phase_l: 0.0,
            prox_phase_r: 0.0,
            prox_lp_l: 0.0,
            prox_lp_r: 0.0,
            eq_bands: [BiquadStereo::identity(); 5],
            last_eq_sig: [0; 5],
            rng: 0x1234_5678,
        }
    }

    fn update_eq(&mut self, gains: [f32; 5]) {
        let sig = [
            (gains[0] * 10.0).round() as i32,
            (gains[1] * 10.0).round() as i32,
            (gains[2] * 10.0).round() as i32,
            (gains[3] * 10.0).round() as i32,
            (gains[4] * 10.0).round() as i32,
        ];
        if sig == self.last_eq_sig {
            return;
        }
        self.last_eq_sig = sig;
        self.eq_bands[0].set_low_shelf(self.sr, 60.0, gains[0].clamp(-12.0, 12.0));
        self.eq_bands[1].set_peaking(self.sr, 180.0, 1.1, gains[1].clamp(-12.0, 12.0));
        self.eq_bands[2].set_peaking(self.sr, 650.0, 1.0, gains[2].clamp(-12.0, 12.0));
        self.eq_bands[3].set_peaking(self.sr, 2400.0, 1.2, gains[3].clamp(-12.0, 12.0));
        self.eq_bands[4].set_high_shelf(self.sr, 8000.0, gains[4].clamp(-12.0, 12.0));
    }

    #[inline]
    fn tap(&self, buf: &[f32], ms: f32) -> f32 {
        let d = ((ms * 0.001 * self.sr) as usize).clamp(1, buf.len() - 1);
        let idx = (self.pos + buf.len() - d) % buf.len();
        buf[idx]
    }

    #[inline]
    fn next_noise(&mut self) -> f32 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        ((x as f32) / (u32::MAX as f32)) * 2.0 - 1.0
    }

    fn process_frame(
        &mut self,
        in_l: f32,
        in_r: f32,
        p: &Audio3DParams,
        g_lat: f32,
        speed_kmh: f32,
        prox_l: f32,
        prox_r: f32,
    ) -> (f32, f32) {
        let len = self.delay_l.len();
        self.delay_l[self.pos] = in_l;
        self.delay_r[self.pos] = in_r;

        // 1. Mid/Side decomposition for clean parallel spatial width
        let mid = (in_l + in_r) * 0.5;
        let side = (in_l - in_r) * 0.5;

        // 2. Mode-specific Binaural / 7.1 / 8D / 5.1 virtual surround taps
        // ITD (Interaural Time Delay ~0.45ms..0.70ms) + head-shadow lowpass
        let itd_ms = match p.mode {
            0 => 0.58, // Binaural HRTF
            1 => 0.68, // 7.1 Virtual Surround
            2 => 0.62, // 8D Dynamic
            _ => 0.45, // 5.1 Cockpit
        };
        let cross_l = self.tap(&self.delay_r, itd_ms);
        let cross_r = self.tap(&self.delay_l, itd_ms);
        // Head-shadow low-pass (~2.8 kHz)
        let alpha_sh = 0.28;
        self.lp_shadow_l += alpha_sh * (cross_l - self.lp_shadow_l);
        self.lp_shadow_r += alpha_sh * (cross_r - self.lp_shadow_r);

        let width = p.spatial_width.clamp(0.0, 1.0);
        let mut wet_l = side * (0.85 * width) - self.lp_shadow_l * (0.28 * width);
        let mut wet_r = -side * (0.85 * width) - self.lp_shadow_r * (0.28 * width);

        // Extra virtual rear/side surround channels for 7.1 & 5.1 modes
        if p.mode == 1 || p.mode == 3 {
            let rear_l = self.tap(&self.delay_l, 11.5) * 0.34 - self.tap(&self.delay_r, 17.2) * 0.22;
            let rear_r = self.tap(&self.delay_r, 12.1) * 0.34 - self.tap(&self.delay_l, 16.8) * 0.22;
            let surr_gain = if p.mode == 1 { 0.62 } else { 0.45 };
            wet_l += rear_l * surr_gain * width;
            wet_r += rear_r * surr_gain * width;
        }

        // 3. Carbon-Fiber Cockpit Early Reflections (ultra-short 4..24ms taps)
        if p.cockpit_reverb > 0.005 {
            let er_l = self.tap(&self.delay_l, 4.3) * 0.38
                + self.tap(&self.delay_r, 8.9) * 0.28
                + self.tap(&self.delay_l, 14.7) * 0.20
                + self.tap(&self.delay_r, 22.4) * 0.14;
            let er_r = self.tap(&self.delay_r, 4.8) * 0.38
                + self.tap(&self.delay_l, 9.4) * 0.28
                + self.tap(&self.delay_r, 15.3) * 0.20
                + self.tap(&self.delay_l, 23.1) * 0.14;
            wet_l += er_l * p.cockpit_reverb * 0.55;
            wet_r += er_r * p.cockpit_reverb * 0.55;
        }

        // 4. Sub-Bass Exhaust Harmonic Exciter (45..135 Hz warm saturation)
        if p.sub_bass_punch > 0.005 {
            let alpha_sub = 0.018; // ~135Hz at 48kHz
            self.lp_sub_l += alpha_sub * (in_l - self.lp_sub_l);
            self.lp_sub_r += alpha_sub * (in_r - self.lp_sub_r);
            let exc_l = (self.lp_sub_l * 2.4).tanh() * p.sub_bass_punch * 0.65;
            let exc_r = (self.lp_sub_r * 2.4).tanh() * p.sub_bass_punch * 0.65;
            wet_l += exc_l;
            wet_r += exc_r;
        }

        // 5. Helmet Acoustic Warmth / Interior Resonance
        if p.helmet_resonance > 0.005 {
            let alpha_h = 0.09; // ~700Hz warm body
            self.lp_helmet_l += alpha_h * (mid - self.lp_helmet_l);
            self.lp_helmet_r += alpha_h * (mid - self.lp_helmet_r);
            wet_l += self.lp_helmet_l * p.helmet_resonance * 0.35;
            wet_r += self.lp_helmet_r * p.helmet_resonance * 0.35;
        }

        // 6. 8D Azimuth Rotation & Telemetry G-Force Panning
        let mut pan = 0.0f32;
        if p.mode == 2 {
            self.phase_8d = (self.phase_8d + 1.15 / self.sr) % std::f32::consts::TAU;
            pan += self.phase_8d.sin() * 0.42;
        }
        if p.gforce_panning {
            pan += (g_lat * 0.16).clamp(-0.38, 0.38);
        }
        if pan.abs() > 0.001 {
            let pan_c = pan.clamp(-0.65, 0.65);
            let gain_l = 1.0 - pan_c.max(0.0);
            let gain_r = 1.0 + pan_c.min(0.0);
            wet_l *= gain_l;
            wet_r *= gain_r;
        }

        // 7. Subtle High-Speed Cockpit Aero Wind (>140 km/h)
        if p.aero_wind > 0.005 && speed_kmh > 140.0 {
            let spd_fac = ((speed_kmh - 140.0) / 180.0).clamp(0.0, 1.0);
            let n = self.next_noise();
            self.lp_wind += 0.065 * (n - self.lp_wind);
            self.hp_wind += 0.008 * (self.lp_wind - self.hp_wind);
            let wind = (self.lp_wind - self.hp_wind) * spd_fac * spd_fac * p.aero_wind * 0.14;
            wet_l += wind;
            wet_r += wind * 0.96;
        }

        // 8. #4 Spatial Rival Proximity Audio (Doppler Side-by-Side Left / Right Whoosh)
        if p.rival_proximity > 0.005 && (prox_l > 0.02 || prox_r > 0.02) {
            let base_freq = 115.0 + (speed_kmh * 0.48).min(180.0);
            let n_l = self.next_noise();
            let n_r = self.next_noise();
            if prox_l > 0.02 {
                self.prox_phase_l = (self.prox_phase_l + (base_freq * (1.0 + prox_l * 0.14)) / self.sr) % 1.0;
                let rumble = (self.prox_phase_l * std::f32::consts::TAU).sin() * 0.45 + n_l * 0.55;
                self.prox_lp_l += 0.055 * (rumble - self.prox_lp_l);
                let sig = self.prox_lp_l * prox_l * p.rival_proximity * 0.34;
                wet_l += sig;
                wet_r += sig * 0.16; // subtle contralateral bleed
            }
            if prox_r > 0.02 {
                self.prox_phase_r = (self.prox_phase_r + (base_freq * (1.0 + prox_r * 0.14)) / self.sr) % 1.0;
                let rumble = (self.prox_phase_r * std::f32::consts::TAU).sin() * 0.45 + n_r * 0.55;
                self.prox_lp_r += 0.055 * (rumble - self.prox_lp_r);
                let sig = self.prox_lp_r * prox_r * p.rival_proximity * 0.34;
                wet_r += sig;
                wet_l += sig * 0.16;
            }
        }

        // 9. #3 5-Band Parametric Biquad EQ on the spatial bus
        for b in &mut self.eq_bands {
            let (el, er) = b.process(wet_l, wet_r);
            wet_l = el;
            wet_r = er;
        }

        self.pos = (self.pos + 1) % len;

        // Soft limiter to guarantee zero clipping
        let mix = p.wet_mix.clamp(0.0, 1.0);
        let out_l = (wet_l * mix).tanh() * 0.92;
        let out_r = (wet_r * mix).tanh() * 0.92;
        (out_l, out_r)
    }
}

#[cfg(target_os = "windows")]
mod win_wasapi {
    use super::*;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    use windows::core::{implement, GUID, IUnknown, Interface, Result as WinResult};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, BLOB, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Variant::VT_BLOB;

    fn find_lmu_pid() -> Option<u32> {
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            let mut found = None;
            if Process32FirstW(snap, &mut entry).is_ok() {
                loop {
                    let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    let name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_ascii_lowercase();
                    if name == "le mans ultimate.exe" || name == "lmu.exe" {
                        found = Some(entry.th32ProcessID);
                        break;
                    }
                    if Process32NextW(snap, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snap);
            found
        }
    }

    #[implement(IActivateAudioInterfaceCompletionHandler)]
    struct ActivationHandler {
        done: Arc<AtomicBool>,
        result: Arc<Mutex<Option<WinResult<IAudioClient>>>>,
    }

    impl IActivateAudioInterfaceCompletionHandler_Impl for ActivationHandler_Impl {
        fn ActivateCompleted(
            &self,
            activateoperation: windows::core::Ref<'_, IActivateAudioInterfaceAsyncOperation>,
        ) -> WinResult<()> {
            if let Some(op) = activateoperation.as_ref() {
                unsafe {
                    let mut hr = windows::core::HRESULT(0);
                    let mut iface: Option<IUnknown> = None;
                    let res = op.GetActivateResult(&mut hr, &mut iface).and_then(|_| {
                        hr.ok()?;
                        let unk = iface.ok_or_else(|| windows::core::Error::from_win32())?;
                        unk.cast::<IAudioClient>()
                    });
                    if let Ok(mut g) = self.result.lock() {
                        *g = Some(res);
                    }
                }
            }
            self.done.store(true, Ordering::Release);
            Ok(())
        }
    }

    fn activate_process_loopback(pid: u32) -> Result<IAudioClient, String> {
        unsafe {
            let mut act_params = AUDIOCLIENT_ACTIVATION_PARAMS {
                ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
                Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                    ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                        TargetProcessId: pid,
                        ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                    },
                },
            };

            // CRITICAL: Wrap PROPVARIANT in ManuallyDrop so its Drop impl NEVER calls
            // PropVariantClear -> CoTaskMemFree on our stack-allocated `act_params`!
            let prop = std::mem::ManuallyDrop::new(PROPVARIANT {
                Anonymous: PROPVARIANT_0 {
                    Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                        vt: VT_BLOB,
                        wReserved1: 0,
                        wReserved2: 0,
                        wReserved3: 0,
                        Anonymous: PROPVARIANT_0_0_0 {
                            blob: BLOB {
                                cbSize: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                                pBlobData: (&mut act_params as *mut AUDIOCLIENT_ACTIVATION_PARAMS) as *mut u8,
                            },
                        },
                    }),
                },
            });

            let done = Arc::new(AtomicBool::new(false));
            let result: Arc<Mutex<Option<WinResult<IAudioClient>>>> = Arc::new(Mutex::new(None));
            let handler: IActivateAudioInterfaceCompletionHandler = ActivationHandler {
                done: Arc::clone(&done),
                result: Arc::clone(&result),
            }
            .into();

            let _op = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(&*prop),
                &handler,
            )
            .map_err(|e| format!("ActivateAudioInterfaceAsync: {e}"))?;

            // Wait up to 2s for completion callback
            for _ in 0..200 {
                if done.load(Ordering::Acquire) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            let inner = result
                .lock()
                .ok()
                .and_then(|mut g| g.take())
                .ok_or_else(|| "Timeout activando Process Loopback WASAPI".to_string())?;
            inner.map_err(|e| format!("Process Loopback falló: {e}"))
        }
    }

    fn make_float_stereo_format(sr: u32) -> WAVEFORMATEXTENSIBLE {
        WAVEFORMATEXTENSIBLE {
            Format: WAVEFORMATEX {
                wFormatTag: 0xFFFE, // WAVE_FORMAT_EXTENSIBLE
                nChannels: 2,
                nSamplesPerSec: sr,
                nAvgBytesPerSec: sr * 8,
                nBlockAlign: 8,
                wBitsPerSample: 32,
                cbSize: 22,
            },
            Samples: WAVEFORMATEXTENSIBLE_0 { wValidBitsPerSample: 32 },
            dwChannelMask: 0x3, // FRONT_LEFT | FRONT_RIGHT
            // KSDATAFORMAT_SUBTYPE_IEEE_FLOAT ({00000003-0000-0010-8000-00aa00389b71})
            SubFormat: GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71),
        }
    }

    fn run_active_session(
        pid: u32,
        params: &Arc<Mutex<Audio3DParams>>,
        status: &Arc<Mutex<Audio3DStatus>>,
        shared: &Arc<crate::engine::Shared>,
    ) -> Result<(), String> {
        unsafe {
            let sr: u32 = 48000;
            let fmt = make_float_stereo_format(sr);

            // 1. Capture client (Process Loopback targeting ONLY LMU!)
            let cap_client = activate_process_loopback(pid)?;
            cap_client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                    200_000, // 20ms buffer
                    0,
                    &fmt.Format,
                    None,
                )
                .map_err(|e| format!("Capture Initialize: {e}"))?;
            let capture: IAudioCaptureClient = cap_client
                .GetService()
                .map_err(|e| format!("GetService Capture: {e}"))?;

            // 2. Render client (Default Windows output device)
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("IMMDeviceEnumerator: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("GetDefaultAudioEndpoint: {e}"))?;
            let ren_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("Render Activate: {e}"))?;
            ren_client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                    300_000, // 30ms buffer
                    0,
                    &fmt.Format,
                    None,
                )
                .map_err(|e| format!("Render Initialize: {e}"))?;
            let ren_buf_frames = ren_client
                .GetBufferSize()
                .map_err(|e| format!("Render GetBufferSize: {e}"))?;
            let render: IAudioRenderClient = ren_client
                .GetService()
                .map_err(|e| format!("GetService Render: {e}"))?;

            cap_client.Start().map_err(|e| format!("Capture Start: {e}"))?;
            ren_client.Start().map_err(|e| format!("Render Start: {e}"))?;

            if let Ok(mut st) = status.lock() {
                st.running = true;
                st.lmu_pid = pid;
                st.sample_rate = sr;
                st.last_error.clear();
            }

            let mut dsp = SpatialCockpitDsp::new(sr);
            let mut out_interleaved: Vec<f32> = Vec::with_capacity(4096);
            let mut check_pid_tick = 0u32;

            loop {
                let p = params.lock().map(|g| g.clone()).unwrap_or_default();
                if !p.enabled {
                    break;
                }

                // Periodically verify LMU is still running
                check_pid_tick = check_pid_tick.wrapping_add(1);
                if check_pid_tick % 200 == 0 && find_lmu_pid() != Some(pid) {
                    break;
                }

                let (g_lat, speed_kmh, prox_l, prox_r, class_eq_off) = {
                    if let Ok(snap) = shared.latest.read() {
                        if let Some(pl) = &snap.player {
                            let spd = (pl.speed as f32) * 3.6;
                            let mut pl_prox = 0.0f32;
                            let mut pr_prox = 0.0f32;
                            if p.rival_proximity > 0.005 && spd > 25.0 && !pl.in_pits {
                                let cy = (pl.yaw as f32).cos();
                                let sy = (pl.yaw as f32).sin();
                                for v in &snap.vehicles {
                                    if v.is_player || v.in_pits {
                                        continue;
                                    }
                                    let dx = (v.pos[0] - pl.pos[0]) as f32;
                                    let dz = (v.pos[2] - pl.pos[2]) as f32;
                                    let dist_sq = dx * dx + dz * dz;
                                    if dist_sq > 144.0 || dist_sq < 0.25 {
                                        continue;
                                    }
                                    let lat = dx * cy - dz * sy;
                                    let lon = dx * sy + dz * cy;
                                    if lon.abs() < 11.0 && lat.abs() < 5.8 {
                                        let prox = (1.0 - (dist_sq.sqrt() / 12.0)).clamp(0.0, 1.0);
                                        if lat < -0.35 {
                                            pl_prox = pl_prox.max(prox);
                                        } else if lat > 0.35 {
                                            pr_prox = pr_prox.max(prox);
                                        }
                                    }
                                }
                            }
                            let c_off = if p.auto_by_class {
                                let cls = pl.vehicle_class.to_ascii_lowercase();
                                if cls.contains("gt3") || cls.contains("gte") {
                                    [2.5f32, 1.8, 0.5, 0.5, 0.0]
                                } else if cls.contains("lmp") {
                                    [0.8, 0.5, 1.2, 2.8, 1.2]
                                } else if cls.contains("hyper") {
                                    [1.5, 0.5, 0.0, 1.6, 2.6]
                                } else {
                                    [0.0; 5]
                                }
                            } else {
                                [0.0; 5]
                            };
                            (pl.g_lat as f32, spd, pl_prox, pr_prox, c_off)
                        } else {
                            (0.0, 0.0, 0.0, 0.0, [0.0; 5])
                        }
                    } else {
                        (0.0, 0.0, 0.0, 0.0, [0.0; 5])
                    }
                };

                dsp.update_eq([
                    p.eq_sub_db + class_eq_off[0],
                    p.eq_bass_db + class_eq_off[1],
                    p.eq_mid_db + class_eq_off[2],
                    p.eq_presence_db + class_eq_off[3],
                    p.eq_air_db + class_eq_off[4],
                ]);

                let mut peak = 0.0f32;
                loop {
                    let pkt_len = capture.GetNextPacketSize().unwrap_or(0);
                    if pkt_len == 0 {
                        break;
                    }
                    let mut data_ptr: *mut u8 = std::ptr::null_mut();
                    let mut frames_avail: u32 = 0;
                    let mut flags: u32 = 0;
                    if capture
                        .GetBuffer(&mut data_ptr, &mut frames_avail, &mut flags, None, None)
                        .is_err()
                    {
                        break;
                    }

                    let silent = (flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)) != 0 || data_ptr.is_null();
                    let n = frames_avail as usize;
                    out_interleaved.clear();
                    out_interleaved.reserve(n * 2);

                    if silent {
                        for _ in 0..n {
                            let (ol, or) = dsp.process_frame(0.0, 0.0, &p, g_lat, speed_kmh, prox_l, prox_r);
                            peak = peak.max(ol.abs()).max(or.abs());
                            out_interleaved.push(ol);
                            out_interleaved.push(or);
                        }
                    } else {
                        let samples = std::slice::from_raw_parts(data_ptr as *const f32, n * 2);
                        for i in 0..n {
                            let (ol, or) = dsp.process_frame(samples[i * 2], samples[i * 2 + 1], &p, g_lat, speed_kmh, prox_l, prox_r);
                            peak = peak.max(ol.abs()).max(or.abs());
                            out_interleaved.push(ol);
                            out_interleaved.push(or);
                        }
                    }

                    let _ = capture.ReleaseBuffer(frames_avail);

                    // Push processed spatial bus into render buffer
                    if let Ok(padding) = ren_client.GetCurrentPadding() {
                        let free = ren_buf_frames.saturating_sub(padding) as usize;
                        let to_write = n.min(free);
                        if to_write > 0 {
                            if let Ok(ren_ptr) = render.GetBuffer(to_write as u32) {
                                std::ptr::copy_nonoverlapping(
                                    out_interleaved.as_ptr() as *const c_void,
                                    ren_ptr as *mut c_void,
                                    to_write * 8,
                                );
                                let _ = render.ReleaseBuffer(to_write as u32, 0);
                            }
                        }
                    }
                }

                if let Ok(mut st) = status.lock() {
                    st.peak_level = (st.peak_level * 0.72 + peak * 0.28).clamp(0.0, 1.0);
                }

                std::thread::sleep(Duration::from_millis(6));
            }

            let _ = cap_client.Stop();
            let _ = ren_client.Stop();
            Ok(())
        }
    }

    pub fn run_audio_loop(
        params: Arc<Mutex<Audio3DParams>>,
        status: Arc<Mutex<Audio3DStatus>>,
        shared: Arc<crate::engine::Shared>,
    ) {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        loop {
            let enabled = params.lock().map(|g| g.enabled).unwrap_or(false);
            if !enabled {
                if let Ok(mut st) = status.lock() {
                    st.running = false;
                    st.peak_level = 0.0;
                }
                std::thread::sleep(Duration::from_millis(120));
                continue;
            }

            let Some(pid) = find_lmu_pid() else {
                if let Ok(mut st) = status.lock() {
                    st.running = false;
                    st.lmu_pid = 0;
                    st.peak_level = 0.0;
                    st.last_error = "Esperando a que se abra Le Mans Ultimate.exe...".into();
                }
                std::thread::sleep(Duration::from_millis(600));
                continue;
            };

            if let Err(err) = run_active_session(pid, &params, &status, &shared) {
                if let Ok(mut st) = status.lock() {
                    st.running = false;
                    st.peak_level = 0.0;
                    st.last_error = err;
                }
                std::thread::sleep(Duration::from_millis(800));
            } else if let Ok(mut st) = status.lock() {
                st.running = false;
                st.peak_level = 0.0;
            }
        }

        #[allow(unreachable_code)]
        unsafe {
            CoUninitialize();
        }
    }
}
