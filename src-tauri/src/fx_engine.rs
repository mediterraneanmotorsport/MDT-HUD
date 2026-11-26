//! Native GPU Post-Processing Engine (`MDT-FX Engine`) for Windows.
//!
//! Captures the game monitor GPU-to-GPU via DXGI Desktop Duplication, runs a
//! custom DirectX 11 HLSL pixel shader (AMD FidelityFX CAS Sharpening, ACES
//! Filmic Tonemapping, 3D `.cube` LUTs, Chromatic Aberration, Speed Radial
//! Blur, Lift/Gamma/Gain, Kerb Micro-Shake, Vignette, Film Grain) and presents
//! to a click-through borderless window positioned strictly BELOW the MDT-HUD
//! overlay and ABOVE Le Mans Ultimate.
//!
//! Uses `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on both the FX
//! window and the HUD overlay while active so DXGI captures ONLY the game and
//! the HUD remains 100% razor-sharp on top with zero feedback loop.

use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFxParams {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub only_on_track: bool,
    #[serde(default = "default_one")]
    pub contrast: f32,
    #[serde(default = "default_one")]
    pub saturation: f32,
    #[serde(default)]
    pub vibrance: f32,
    #[serde(default = "default_one")]
    pub brightness: f32,
    #[serde(default)]
    pub exposure: f32,
    #[serde(default)]
    pub warmth: f32,
    #[serde(default)]
    pub tint: f32,
    #[serde(default)]
    pub aces_tonemap: f32,
    #[serde(default)]
    pub cas_sharpen: f32,
    #[serde(default)]
    pub chromatic_aberration: f32,
    #[serde(default)]
    pub speed_blur: f32,
    #[serde(default)]
    pub vignette: f32,
    #[serde(default = "default_true")]
    pub speed_vignette: bool,
    #[serde(default)]
    pub gforce_vignette: bool,
    #[serde(default = "default_true")]
    pub camera_shake: bool,
    #[serde(default)]
    pub film_grain: f32,
    #[serde(default)]
    pub scanlines: f32,
    #[serde(default)]
    pub lut_strength: f32,
    /// 0 = None, 1 = WEC Film, 2 = F1 T-Cam, 3 = Kodak 2383, 4 = GoPro, 5 = Night HDR, 6 = Custom .cube
    #[serde(default)]
    pub lut_preset: u32,
    // --- 9 Pro Realism Shaders (all optional, 0 / false = bypassed) ---
    #[serde(default)]
    pub bloom: f32,
    #[serde(default)]
    pub halation: f32,
    #[serde(default)]
    pub lens_distortion: f32,
    #[serde(default)]
    pub clarity: f32,
    #[serde(default)]
    pub dehaze: f32,
    #[serde(default)]
    pub anamorphic_flare: f32,
    #[serde(default)]
    pub lift: f32,
    #[serde(default = "default_one")]
    pub gamma: f32,
    #[serde(default = "default_one")]
    pub gain: f32,
    #[serde(default)]
    pub auto_exposure: bool,
    #[serde(default)]
    pub gforce_shift: bool,
    #[serde(default)]
    pub rpm_vibration: bool,
    #[serde(default)]
    pub auto_weather_time_fx: bool,
    // --- 7 Lighting & Photorealism Shaders (all optional, 0.0 = bypassed) ---
    #[serde(default)]
    pub agx_tonemap: f32,
    #[serde(default)]
    pub gi_bounce: f32,
    #[serde(default)]
    pub pro_mist: f32,
    #[serde(default)]
    pub local_hdr: f32,
    #[serde(default)]
    pub highlight_rolloff: f32,
    #[serde(default)]
    pub split_shadow_cool: f32,
    #[serde(default)]
    pub split_highlight_warm: f32,
    #[serde(default)]
    pub shadow_depth: f32,
    /// 0.0 = full FX, 0.01..0.99 = vertical split-screen (left = original LMU, right = MDT-FX)
    #[serde(default)]
    pub split_screen: f32,
    #[serde(default = "default_one")]
    pub camera_shake_intensity: f32,
    #[serde(default = "default_one")]
    pub rpm_vibration_intensity: f32,
    // --- 6 Next-Gen Multi-Pass / Temporal HLSL Shaders (#1, #2, #4, #7, #8, #10) ---
    #[serde(default)]
    pub pyramidal_bloom: f32,
    #[serde(default)]
    pub grass_realism: f32,
    #[serde(default)]
    pub sky_realism: f32,
    #[serde(default)]
    pub sun_god_rays: f32,
    #[serde(default)]
    pub film_35mm: f32,
    #[serde(default)]
    pub heat_haze: f32,
    #[serde(default)]
    pub temporal_motion_blur: f32,
    // --- Lumen-Style Multi-Scale Screen-Space GI (W/8 -> W/32 FP16 Radiance Pyramid) ---
    #[serde(default)]
    pub lumen_gi: f32,
    #[serde(default)]
    pub lumen_sky_bounce: f32,
    // --- Pro Color Management: Linear Color Space & Color Gamut Profiles ---
    #[serde(default)]
    pub linear_color_space: bool,
    /// 0 = sRGB Native, 1 = Rec.709 (2.4 Broadcast), 2 = Rec.709 HLG, 3 = DCI-P3, 4 = BT.2020, 5 = ACEScg
    #[serde(default)]
    pub color_space: u32,
    #[serde(default = "default_one")]
    pub color_space_strength: f32,
    #[serde(default)]
    pub taa_antialias: f32,
    /// Single-pass ultra-fast GPU mode (skips heavy multi-pass bloom/radiance/god-rays for max FPS)
    #[serde(default)]
    pub performance_mode: bool,
    // --- Pro Optics & Camera Shaders: FXAA 3.11, Replay DoF, Smooth Iris Auto-Exposure & RealLongExposure ---
    #[serde(default)]
    pub fxaa_antialias: f32,
    #[serde(default)]
    pub cinematic_dof: f32,
    #[serde(default = "default_half")]
    pub dof_focus: f32,
    /// Cinema iris speed for Auto-Exposure: 0.05 (ultra-slow ~4s) .. 1.0 (~1s), default 0.22 (~2.2s, zero flash)
    #[serde(default = "default_ae_speed")]
    pub auto_exposure_speed: f32,
    /// RealLongExposure / Camera Shutter multi-frame accumulation (0 = off, 1 = long broadcast shutter)
    #[serde(default)]
    pub long_exposure: f32,
    // --- Real Broadcast Onboard Optics (WEC / IMSA miniature camera signature) ---
    /// 6-point optical aperture diffraction starburst around bright headlights & sun
    #[serde(default)]
    pub starburst: f32,
    /// Light-reactive polycarbonate windshield & dirty lens scatter (only lights up on sun/headlights)
    #[serde(default)]
    pub dirty_lens: f32,
    /// Real WEC/IMSA broadcast CMOS sensor look (4:2:2 chroma softness, highlight knee, matte charcoal toe)
    #[serde(default)]
    pub broadcast_sensor: f32,
    /// Wet asphalt specular reflections (boosted automatically by live LMU rain telemetry)
    #[serde(default)]
    pub wet_reflections: f32,
    /// 10-bit Blue-Noise Debanding (eliminates sky/sunset/night gradient banding)
    #[serde(default)]
    pub deband: f32,
    // --- ReShade Onboard Pack Shaders (SurfaceBlur, DPX Film, Analog VHS/RF) ---
    /// Edge-preserving Bilateral Surface Blur (SurfaceBlur.fx / BilateralCS.fx)
    #[serde(default)]
    pub surface_blur: f32,
    /// Photochemical DPX Film Color & Contrast (DPX.fx + Broadcast Tint)
    #[serde(default)]
    pub dpx_film: f32,
    /// Analog Broadcast RF / VHS Chroma Bleed & Interlace (VHS_RA.fx / Interlaced.fx)
    #[serde(default)]
    pub vhs_rf: f32,
}

fn default_true() -> bool { true }
fn default_one() -> f32 { 1.0 }
fn default_half() -> f32 { 0.5 }
fn default_ae_speed() -> f32 { 0.22 }

impl Default for NativeFxParams {
    fn default() -> Self {
        Self {
            enabled: false,
            only_on_track: true,
            contrast: 1.0,
            saturation: 1.0,
            vibrance: 0.0,
            brightness: 1.0,
            exposure: 0.0,
            warmth: 0.0,
            tint: 0.0,
            aces_tonemap: 0.0,
            cas_sharpen: 0.0,
            chromatic_aberration: 0.0,
            speed_blur: 0.0,
            vignette: 0.0,
            speed_vignette: true,
            gforce_vignette: false,
            camera_shake: true,
            film_grain: 0.0,
            scanlines: 0.0,
            lut_strength: 0.0,
            lut_preset: 0,
            bloom: 0.0,
            halation: 0.0,
            lens_distortion: 0.0,
            clarity: 0.0,
            dehaze: 0.0,
            anamorphic_flare: 0.0,
            lift: 0.0,
            gamma: 1.0,
            gain: 1.0,
            auto_exposure: false,
            gforce_shift: false,
            rpm_vibration: false,
            auto_weather_time_fx: false,
            agx_tonemap: 0.0,
            gi_bounce: 0.0,
            pro_mist: 0.0,
            local_hdr: 0.0,
            highlight_rolloff: 0.0,
            split_shadow_cool: 0.0,
            split_highlight_warm: 0.0,
            shadow_depth: 0.0,
            split_screen: 0.0,
            camera_shake_intensity: 1.0,
            rpm_vibration_intensity: 1.0,
            pyramidal_bloom: 0.0,
            grass_realism: 0.0,
            sky_realism: 0.0,
            sun_god_rays: 0.0,
            film_35mm: 0.0,
            heat_haze: 0.0,
            temporal_motion_blur: 0.0,
            lumen_gi: 0.0,
            lumen_sky_bounce: 0.0,
            linear_color_space: false,
            color_space: 0,
            color_space_strength: 1.0,
            taa_antialias: 0.0,
            performance_mode: false,
            fxaa_antialias: 0.0,
            cinematic_dof: 0.0,
            dof_focus: 0.5,
            auto_exposure_speed: 0.22,
            long_exposure: 0.0,
            starburst: 0.0,
            dirty_lens: 0.0,
            broadcast_sensor: 0.0,
            wet_reflections: 0.0,
            deband: 0.0,
            surface_blur: 0.0,
            dpx_film: 0.0,
            vhs_rf: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFxStatus {
    pub running: bool,
    pub fps: f32,
    pub lut_name: String,
    pub lut_size: u32,
    pub last_error: String,
}

#[derive(Clone)]
pub struct ParsedCubeLut {
    pub name: String,
    pub size: u32,
    /// RGBA32F flattened (size * size * size * 4 floats)
    pub data: Vec<f32>,
    pub version: u64,
}

pub struct FxEngineHandle {
    pub params: Arc<Mutex<NativeFxParams>>,
    pub lut: Arc<Mutex<Option<ParsedCubeLut>>>,
    pub status: Arc<Mutex<NativeFxStatus>>,
    pub overlay_hwnd: Arc<Mutex<isize>>,
    pub companion_hwnd: Arc<Mutex<isize>>,
}

impl FxEngineHandle {
    pub fn new(shared: Arc<crate::engine::Shared>) -> Self {
        let params = Arc::new(Mutex::new(NativeFxParams::default()));
        let lut: Arc<Mutex<Option<ParsedCubeLut>>> = Arc::new(Mutex::new(None));
        let status = Arc::new(Mutex::new(NativeFxStatus {
            running: false,
            fps: 0.0,
            lut_name: String::new(),
            lut_size: 0,
            last_error: String::new(),
        }));
        let overlay_hwnd = Arc::new(Mutex::new(0isize));
        let companion_hwnd = Arc::new(Mutex::new(0isize));

        #[cfg(target_os = "windows")]
        {
            let p = Arc::clone(&params);
            let l = Arc::clone(&lut);
            let s = Arc::clone(&status);
            let h = Arc::clone(&overlay_hwnd);
            let c = Arc::clone(&companion_hwnd);
            let sh = Arc::clone(&shared);
            std::thread::Builder::new()
                .name("mdt-fx-d3d11".into())
                .spawn(move || win_d3d11::run_fx_loop(p, l, s, h, c, sh))
                .ok();
        }

        Self { params, lut, status, overlay_hwnd, companion_hwnd }
    }

    pub fn update_params(&self, next: NativeFxParams) {
        if let Ok(mut g) = self.params.lock() {
            *g = next;
        }
    }

    pub fn set_overlay_hwnd(&self, hwnd: isize) {
        if let Ok(mut g) = self.overlay_hwnd.lock() {
            *g = hwnd;
        }
    }

    pub fn set_companion_hwnd(&self, hwnd: isize) {
        if let Ok(mut g) = self.companion_hwnd.lock() {
            *g = hwnd;
        }
    }

    pub fn load_cube_lut_text(&self, name: String, content: &str) -> Result<u32, String> {
        let parsed = parse_cube_lut(name, content)?;
        let size = parsed.size;
        let lut_name = parsed.name.clone();
        if let Ok(mut g) = self.lut.lock() {
            let next_ver = g.as_ref().map(|x| x.version + 1).unwrap_or(1);
            *g = Some(ParsedCubeLut { version: next_ver, ..parsed });
        }
        if let Ok(mut st) = self.status.lock() {
            st.lut_name = lut_name;
            st.lut_size = size;
        }
        Ok(size)
    }

    pub fn clear_cube_lut(&self) {
        if let Ok(mut g) = self.lut.lock() {
            *g = None;
        }
        if let Ok(mut st) = self.status.lock() {
            st.lut_name.clear();
            st.lut_size = 0;
        }
    }

    pub fn get_status(&self) -> NativeFxStatus {
        self.status
            .lock()
            .map(|g| g.clone())
            .unwrap_or(NativeFxStatus {
                running: false,
                fps: 0.0,
                lut_name: String::new(),
                lut_size: 0,
                last_error: String::new(),
            })
    }
}

/// Parses standard Adobe / DaVinci Resolve `.cube` 3D LUT text into RGBA32F.
pub fn parse_cube_lut(name: String, text: &str) -> Result<ParsedCubeLut, String> {
    let mut size: u32 = 0;
    let mut values: Vec<f32> = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("LUT_3D_SIZE") {
            size = rest
                .trim()
                .parse::<u32>()
                .map_err(|_| "LUT_3D_SIZE inválido en el archivo .cube".to_string())?;
            if !(2..=65).contains(&size) {
                return Err(format!("Tamaño de LUT 3D no soportado: {size} (esperado 2..65)"));
            }
            values.reserve((size * size * size * 4) as usize);
            continue;
        }
        if line.starts_with("TITLE")
            || line.starts_with("DOMAIN_MIN")
            || line.starts_with("DOMAIN_MAX")
            || line.starts_with("LUT_1D_SIZE")
        {
            continue;
        }
        let mut parts = line.split_whitespace();
        if let (Some(r), Some(g), Some(b)) = (parts.next(), parts.next(), parts.next()) {
            if let (Ok(rf), Ok(gf), Ok(bf)) = (r.parse::<f32>(), g.parse::<f32>(), b.parse::<f32>()) {
                values.push(rf.clamp(0.0, 1.0));
                values.push(gf.clamp(0.0, 1.0));
                values.push(bf.clamp(0.0, 1.0));
                values.push(1.0);
            }
        }
    }
    if size == 0 {
        return Err("No se encontró LUT_3D_SIZE en el archivo .cube".into());
    }
    let expected = (size * size * size * 4) as usize;
    if values.len() != expected {
        return Err(format!(
            "El archivo .cube contiene {} entradas RGB, se esperaban {}",
            values.len() / 4,
            expected / 4
        ));
    }
    Ok(ParsedCubeLut { name, size, data: values, version: 1 })
}

#[cfg(target_os = "windows")]
mod win_d3d11 {
    use super::*;
    use std::ffi::c_void;
    use std::time::{Duration, Instant};

    use windows::core::{s, w, Interface, PCSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
    use windows::Win32::Graphics::Direct3D::{
        D3D_DRIVER_TYPE_HARDWARE, D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST,
    };
    use windows::Win32::Graphics::Direct3D11::*;
    use windows::Win32::Graphics::Dxgi::Common::*;
    use windows::Win32::Graphics::Dxgi::*;
    use windows::Win32::Graphics::Gdi::{
        CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_DIFF,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::*;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct FxCBuffer {
        resolution: [f32; 2],
        time_sec: f32,
        speed_kmh: f32,

        contrast: f32,
        saturation: f32,
        vibrance: f32,
        brightness: f32,

        exposure: f32,
        warmth: f32,
        tint: f32,
        aces_tonemap: f32,

        cas_sharpen: f32,
        chromatic_aberration: f32,
        speed_blur: f32,
        vignette: f32,

        film_grain: f32,
        scanlines: f32,
        lut_strength: f32,
        lut_preset: f32,

        brake_g: f32,
        shake_amt: f32,
        has_custom_lut: f32,
        speed_vignette: f32,

        // Row 7..10 (16-byte aligned)
        bloom: f32,
        halation: f32,
        lens_distortion: f32,
        clarity: f32,

        dehaze: f32,
        anamorphic_flare: f32,
        lift: f32,
        gamma: f32,

        gain: f32,
        auto_exposure: f32,
        g_shift_x: f32,
        g_shift_y: f32,

        // Row 11..12: Lighting & Photorealism (16-byte aligned)
        agx_tonemap: f32,
        gi_bounce: f32,
        pro_mist: f32,
        local_hdr: f32,

        highlight_rolloff: f32,
        split_shadow_cool: f32,
        split_highlight_warm: f32,
        shadow_depth: f32,

        // Row 13: Split-screen & temporally-smoothed auto-exposure + high-freq RPM vib
        split_screen: f32,
        auto_ev_smooth: f32,
        rpm_vib_amt: f32,
        track_temp: f32,

        // Row 14..15: Next-Gen Shaders (16-byte aligned)
        pyramidal_bloom: f32,
        grass_realism: f32,
        sky_realism: f32,
        sun_god_rays: f32,

        film_35mm: f32,
        heat_haze: f32,
        temporal_motion_blur: f32,
        has_prev_frame: f32,

        // Row 16..17: Lumen-Style GI, Color Management, TAA & Performance Mode (16-byte aligned)
        lumen_gi: f32,
        lumen_sky_bounce: f32,
        linear_color_space: f32,
        color_space: f32,

        color_space_strength: f32,
        taa_antialias: f32,
        performance_mode: f32,
        fxaa_antialias: f32,

        // Row 18: Replay DoF & RealLongExposure (16-byte aligned)
        cinematic_dof: f32,
        dof_focus: f32,
        long_exposure: f32,
        has_accum: f32,

        // Row 19..20: Real Broadcast Onboard Optics (16-byte aligned)
        starburst: f32,
        dirty_lens: f32,
        broadcast_sensor: f32,
        wet_reflections: f32,

        deband: f32,
        rain_amount: f32,
        surface_blur: f32,
        dpx_film: f32,

        // Row 21: Analog Broadcast RF/VHS (16-byte aligned)
        vhs_rf: f32,
        _pad2: f32,
        _pad3: f32,
        _pad4: f32,
    }

    const FX_SHADER_HLSL: &str = r#"
Texture2D<float4> srcTex : register(t0);
Texture3D<float4> lutTex : register(t1);
Texture2D<float4> bloomTex : register(t2);
Texture2D<float4> prevTex : register(t3);
Texture2D<float4> radTex1 : register(t4);
Texture2D<float4> radTex2 : register(t5);
Texture2D<float4> accumTex : register(t6);
SamplerState linSamp : register(s0);

cbuffer FxParams : register(b0) {
    float2 resolution;
    float time_sec;
    float speed_kmh;

    float contrast;
    float saturation;
    float vibrance;
    float brightness;

    float exposure;
    float warmth;
    float tint;
    float aces_tonemap;

    float cas_sharpen;
    float chromatic_aberration;
    float speed_blur;
    float vignette;

    float film_grain;
    float scanlines;
    float lut_strength;
    float lut_preset;

    float brake_g;
    float shake_amt;
    float has_custom_lut;
    float speed_vignette;

    float bloom;
    float halation;
    float lens_distortion;
    float clarity;

    float dehaze;
    float anamorphic_flare;
    float lift;
    float gamma;

    float gain;
    float auto_exposure;
    float g_shift_x;
    float g_shift_y;

    float agx_tonemap;
    float gi_bounce;
    float pro_mist;
    float local_hdr;

    float highlight_rolloff;
    float split_shadow_cool;
    float split_highlight_warm;
    float shadow_depth;

    float split_screen;
    float auto_ev_smooth;
    float rpm_vib_amt;
    float track_temp;

    float pyramidal_bloom;
    float grass_realism;
    float sky_realism;
    float sun_god_rays;

    float film_35mm;
    float heat_haze;
    float temporal_motion_blur;
    float has_prev_frame;

    float lumen_gi;
    float lumen_sky_bounce;
    float linear_color_space;
    float color_space;

    float color_space_strength;
    float taa_antialias;
    float performance_mode;
    float fxaa_antialias;

    float cinematic_dof;
    float dof_focus;
    float long_exposure;
    float has_accum;

    float starburst;
    float dirty_lens;
    float broadcast_sensor;
    float wet_reflections;

    float deband;
    float rain_amount;
    float surface_blur;
    float dpx_film;

    float vhs_rf;
    float _pad2;
    float _pad3;
    float _pad4;
};

struct VSOut {
    float4 pos : SV_Position;
    float2 uv  : TEXCOORD0;
};

VSOut VSMain(uint id : SV_VertexID) {
    VSOut o;
    float2 uv = float2((id << 1) & 2, id & 2);
    o.uv = uv;
    o.pos = float4(uv * float2(2.0, -2.0) + float2(-1.0, 1.0), 0.0, 1.0);
    return o;
}

float3 AcesFilm(float3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
}

// Exact IEC 61966-2-1 sRGB EOTF (Gamma -> Physical Linear Light)
float3 SrgbToLinear(float3 c) {
    c = max(c, 0.0);
    float3 lo = c / 12.92;
    float3 hi = pow((c + 0.055) / 1.055, 2.4);
    return lerp(lo, hi, step(0.04045, c));
}

// Exact IEC 61966-2-1 sRGB OETF (Physical Linear Light -> Display sRGB)
float3 LinearToSrgb(float3 c) {
    c = max(c, 0.0);
    float3 lo = c * 12.92;
    float3 hi = 1.055 * pow(c, 1.0 / 2.4) - 0.055;
    return saturate(lerp(lo, hi, step(0.0031308, c)));
}

// #1 AgX Filmic Tonemapping (Fixed: operates in true linear light so midtones NEVER wash out to white!)
float3 AgxTonemap(float3 val, bool alreadyLinear) {
    float3x3 agxMat = float3x3(
        0.84247906, 0.07843360, 0.07922375,
        0.04232824, 0.87846864, 0.07916613,
        0.04237565, 0.07843360, 0.87914297
    );
    float3x3 agxMatInv = float3x3(
        1.19687900, -0.09802088, -0.09902974,
       -0.05289685,  1.15190313, -0.09896118,
       -0.05297163, -0.09804345,  1.15107367
    );
    // Convert sRGB -> Linear first when not already in Linear Space!
    float3 lin = alreadyLinear ? max(val, 1e-5) : max(SrgbToLinear(val), 1e-5);
    float3 x = mul(agxMat, lin);
    x = clamp(log2(max(x, 1e-6)), -12.47393, 4.026069);
    x = (x + 12.47393) / 16.5;
    // Official AgX 6th-order sigmoid curve
    float3 x2 = x * x;
    float3 x4 = x2 * x2;
    float3 y = 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    float3 outSrgb = saturate(mul(agxMatInv, saturate(y)));
    // Subtle punchy AgX look (prevents milky blacks while keeping silky highlight desaturation)
    outSrgb = pow(max(outSrgb, 1e-5), 1.08);
    return alreadyLinear ? SrgbToLinear(outSrgb) : saturate(outSrgb);
}

float Hash12(float2 p) {
    float3 p3 = frac(float3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return frac((p3.x + p3.y) * p3.z);
}

// Timothy Lottes FXAA 3.11-style GPU Edge Anti-Aliasing (cleans fences/kerbs/white lines with zero cockpit blur)
float3 ApplyFXAA(float2 uv, float amount) {
    float2 px = 1.0 / max(resolution, float2(1.0, 1.0));
    float3 rgbM  = srcTex.SampleLevel(linSamp, uv, 0).rgb;
    if (amount <= 0.001) return rgbM;
    float3 rgbNW = srcTex.SampleLevel(linSamp, saturate(uv + float2(-px.x, -px.y)), 0).rgb;
    float3 rgbNE = srcTex.SampleLevel(linSamp, saturate(uv + float2( px.x, -px.y)), 0).rgb;
    float3 rgbSW = srcTex.SampleLevel(linSamp, saturate(uv + float2(-px.x,  px.y)), 0).rgb;
    float3 rgbSE = srcTex.SampleLevel(linSamp, saturate(uv + float2( px.x,  px.y)), 0).rgb;

    float3 lumaW = float3(0.299, 0.587, 0.114);
    float lumaNW = dot(rgbNW, lumaW);
    float lumaNE = dot(rgbNE, lumaW);
    float lumaSW = dot(rgbSW, lumaW);
    float lumaSE = dot(rgbSE, lumaW);
    float lumaM  = dot(rgbM,  lumaW);

    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    float range = lumaMax - lumaMin;
    if (range < max(0.0312, lumaMax * 0.10)) return rgbM;

    float2 dir;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.125), 1.0 / 128.0);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, float2(-8.0, -8.0), float2(8.0, 8.0)) * px;

    float3 rgbA = 0.5 * (
        srcTex.SampleLevel(linSamp, saturate(uv + dir * (1.0 / 3.0 - 0.5)), 0).rgb +
        srcTex.SampleLevel(linSamp, saturate(uv + dir * (2.0 / 3.0 - 0.5)), 0).rgb
    );
    float3 rgbB = rgbA * 0.5 + 0.25 * (
        srcTex.SampleLevel(linSamp, saturate(uv + dir * -0.5), 0).rgb +
        srcTex.SampleLevel(linSamp, saturate(uv + dir *  0.5), 0).rgb
    );
    float lumaB = dot(rgbB, lumaW);
    float3 fxaaCol = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
    return lerp(rgbM, fxaaCol, saturate(amount));
}

// AMD FidelityFX CAS-style 5-tap Contrast Adaptive Sharpening
float3 ApplyCAS(float2 uv, float amount) {
    float2 px = 1.0 / max(resolution, float2(1.0, 1.0));
    float3 e = (fxaa_antialias > 0.001) ? ApplyFXAA(uv, fxaa_antialias) : srcTex.SampleLevel(linSamp, uv, 0).rgb;
    if (amount <= 0.001) return e;
    float3 b = srcTex.SampleLevel(linSamp, uv + float2(0.0, -px.y), 0).rgb;
    float3 d = srcTex.SampleLevel(linSamp, uv + float2(-px.x, 0.0), 0).rgb;
    float3 f = srcTex.SampleLevel(linSamp, uv + float2(px.x, 0.0), 0).rgb;
    float3 h = srcTex.SampleLevel(linSamp, uv + float2(0.0, px.y), 0).rgb;

    float3 mn = min(e, min(min(b, d), min(f, h)));
    float3 mx = max(e, max(max(b, d), max(f, h)));
    float3 amp = saturate(min(mn, 1.0 - mx) / max(mx, 0.0001));
    amp = sqrt(amp);
    float peak = -1.0 / lerp(8.0, 5.0, saturate(amount));
    float3 w = amp * peak;
    float3 sharpened = (e + (b + d + f + h) * w) / (1.0 + 4.0 * w);
    return saturate(lerp(e, sharpened, saturate(amount)));
}

float3 ApplyBuiltinLut(float3 c, float preset) {
    int id = (int)(preset + 0.5);
    float luma = dot(c, float3(0.2126, 0.7152, 0.0722));
    if (id == 1) {
        // WEC Le Mans Film
        float3 sh = lerp(c, c * float3(0.92, 0.96, 1.06), saturate(1.0 - luma * 1.4));
        float3 hi = lerp(sh, sh * float3(1.07, 1.02, 0.92), saturate(luma * 1.2 - 0.2));
        return saturate(AcesFilm(hi * 1.08));
    } else if (id == 2) {
        // F1 T-Cam Broadcast
        float3 res = c * float3(0.97, 1.01, 1.05);
        res = pow(saturate(res), 0.96);
        return saturate(lerp(float3(luma, luma, luma), res, 1.08));
    } else if (id == 3) {
        // Kodak 2383 Cinema
        float3 teal = float3(0.88, 1.00, 1.06);
        float3 gold = float3(1.10, 1.01, 0.88);
        float3 graded = c * lerp(teal, gold, smoothstep(0.15, 0.85, luma));
        graded = graded * graded * (3.0 - 2.0 * graded);
        return saturate(lerp(c, graded, 0.78));
    } else if (id == 4) {
        // GoPro Action Visor
        float3 res = pow(saturate(c * 1.06), 1.08);
        return saturate(lerp(float3(luma, luma, luma), res, 1.22));
    } else if (id == 5) {
        // Night HDR Endurance
        float3 res = saturate((c - 0.03) * 1.14);
        res *= float3(0.94, 0.99, 1.08);
        return saturate(res + max(0.0, luma - 0.75) * 0.25);
    } else if (id == 7) {
        // IMSA Real Onboard (Calibrated Road Atlanta: clean charcoal cockpit, removes LMU green cast, natural broadcast palette)
        float3 clean = float3(c.r, c.g * 0.968, c.b * 1.018);
        // Keep blacks rich matte charcoal (0.018 floor) and preserve exposure without washing to white
        float floorLift = 0.018 * (1.0 - smoothstep(0.0, 0.28, luma));
        float3 res = saturate(clean * 0.96 + floorLift);
        float rL = dot(res, float3(0.2126, 0.7152, 0.0722));
        // Soft broadcast CMOS chroma (tames oversaturated game grass/blues/yellows)
        res = lerp(float3(rL, rL, rL), res, 0.76);
        // Subtle cool-slate polycarbonate windshield tint in midtones
        float mid = smoothstep(0.22, 0.78, rL);
        res = saturate(res + float3(0.0, 0.0, mid * 0.014));
        return res;
    }
    return c;
}

// RealLongExposure / Camera Shutter persistent accumulation pass (t0=current, t6=previous accum)
float4 PSAccum(VSOut inp) : SV_Target {
    float3 cur = srcTex.SampleLevel(linSamp, inp.uv, 0).rgb;
    if (has_accum < 0.5 || long_exposure <= 0.001) {
        return float4(cur, 1.0);
    }
    float3 prev = accumTex.SampleLevel(linSamp, inp.uv, 0).rgb;
    // Cinema shutter retention: long_exposure 0.0..1.0 -> 0%..84% smooth exponential exposure trail
    float keep = clamp(long_exposure * 0.84, 0.0, 0.84);
    // Preserve bright headlight / brake-light streaks naturally while avoiding ghosting on dark edges
    float3 blended = lerp(cur, prev, keep);
    return float4(blended, 1.0);
}

// Pass 1 for #1 Multi-Pass Dual-Kawase Pyramidal Bloom: bright-pass extract + 4-tap downsample
float4 PSBloomExtract(VSOut inp) : SV_Target {
    float2 px = 2.0 / max(resolution, float2(1.0, 1.0));
    float3 c = (
        srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x, -px.y)), 0).rgb +
        srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x, -px.y)), 0).rgb +
        srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x,  px.y)), 0).rgb +
        srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x,  px.y)), 0).rgb
    ) * 0.25;
    float l = dot(c, float3(0.2126, 0.7152, 0.0722));
    float knee = smoothstep(0.56, 0.88, l);
    return float4(c * knee, 1.0);
}

// Pass 2 for #1 Multi-Pass Dual-Kawase Pyramidal Bloom: wide 9-tap Kawase blur into quarter-res
float4 PSBloomBlur(VSOut inp) : SV_Target {
    float2 px = 4.0 / max(resolution, float2(1.0, 1.0));
    float3 s = srcTex.SampleLevel(linSamp, inp.uv, 0).rgb * 0.22;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x,  px.y)), 0).rgb * 0.12;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x,  px.y)), 0).rgb * 0.12;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x, -px.y)), 0).rgb * 0.12;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x, -px.y)), 0).rgb * 0.12;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x * 2.0, 0.0)), 0).rgb * 0.075;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x * 2.0, 0.0)), 0).rgb * 0.075;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(0.0,  px.y * 2.0)), 0).rgb * 0.075;
    s += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(0.0, -px.y * 2.0)), 0).rgb * 0.075;
    return float4(s, 1.0);
}

// Lumen-Style Pass A: Linear-light 9-tap radiance downsample into W/8 x H/8
float4 PSRadianceDown(VSOut inp) : SV_Target {
    float2 px = 8.0 / max(resolution, float2(1.0, 1.0));
    float3 acc = float3(0.0, 0.0, 0.0);
    [unroll]
    for (int y = -1; y <= 1; y++) {
        [unroll]
        for (int x = -1; x <= 1; x++) {
            float3 s = srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(x, y) * px), 0).rgb;
            acc += s * s; // approximate linear light energy
        }
    }
    return float4(acc * (1.0 / 9.0), 1.0);
}

// Lumen-Style Pass B: Broad environmental radiance field into W/32 x H/32
float4 PSRadianceWide(VSOut inp) : SV_Target {
    float2 px = 24.0 / max(resolution, float2(1.0, 1.0));
    float3 acc = srcTex.SampleLevel(linSamp, inp.uv, 0).rgb * 0.20;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x,  px.y)), 0).rgb * 0.12;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x,  px.y)), 0).rgb * 0.12;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x, -px.y)), 0).rgb * 0.12;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x, -px.y)), 0).rgb * 0.12;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2( px.x * 2.0, 0.0)), 0).rgb * 0.08;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(-px.x * 2.0, 0.0)), 0).rgb * 0.08;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(0.0,  px.y * 2.0)), 0).rgb * 0.08;
    acc += srcTex.SampleLevel(linSamp, saturate(inp.uv + float2(0.0, -px.y * 2.0)), 0).rgb * 0.08;
    return float4(acc, 1.0);
}

float3 RgbToHsl(float3 c) {
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float l = (mx + mn) * 0.5;
    float d = mx - mn;
    float s = (d < 1e-5) ? 0.0 : d / (1.0 - abs(2.0 * l - 1.0));
    float h = 0.0;
    if (d >= 1e-5) {
        if (mx == c.r) h = fmod((c.g - c.b) / d + 6.0, 6.0);
        else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
        else h = (c.r - c.g) / d + 4.0;
        h /= 6.0;
    }
    return float3(h, s, l);
}

float3 HslToRgb(float3 hsl) {
    float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
    float x = c * (1.0 - abs(fmod(hsl.x * 6.0, 2.0) - 1.0));
    float m = hsl.z - c * 0.5;
    float h6 = hsl.x * 6.0;
    float3 rgb = (h6 < 1.0) ? float3(c, x, 0.0)
               : (h6 < 2.0) ? float3(x, c, 0.0)
               : (h6 < 3.0) ? float3(0.0, c, x)
               : (h6 < 4.0) ? float3(0.0, x, c)
               : (h6 < 5.0) ? float3(x, 0.0, c)
                            : float3(c, 0.0, x);
    return saturate(rgb + m);
}

// Color Space & Gamut Profiles (1=Rec.709 2.4, 2=Rec.709 HLG, 3=DCI-P3, 4=BT.2020, 5=ACEScg)
float3 ApplyColorSpaceProfile(float3 srgbCol, float mode, float strength) {
    int id = (int)round(mode);
    if (id <= 0 || strength <= 0.001) return srgbCol;

    float3 lin = SrgbToLinear(srgbCol);
    float3 mapped = srgbCol;

    if (id == 1) {
        // Rec.709 / BT.1886 Broadcast (pure 2.4 broadcast display response, crisp WEC/IMSA blacks)
        float3 rec = pow(max(lin, 0.0), 1.0 / 2.2);
        float3 bt1886 = pow(max(srgbCol, 0.0), 2.4 / 2.2);
        mapped = saturate(lerp(rec, bt1886, 0.72));
    } else if (id == 2) {
        // Rec.709 HLG (ITU-R BT.2100 Hybrid Log-Gamma onboard broadcast dynamic range)
        float3 e = max(lin * 1.15, 0.0);
        float3 lo = sqrt(3.0 * e);
        float3 hi = 0.17883277 * log(max(12.0 * e - 0.28466892, 1e-5)) + 0.55991073;
        float3 hlg = lerp(lo, hi, step(1.0 / 12.0, e));
        mapped = saturate(lerp(srgbCol, hlg, 0.78));
    } else if (id == 3) {
        // DCI-P3 / Display P3 Wide Cinema Gamut (richer cinema reds & greens with smooth gamut guard)
        float3x3 srgbToP3Expand = float3x3(
             1.2249, -0.2247,  0.0000,
            -0.0420,  1.0419,  0.0000,
            -0.0197, -0.0786,  1.0979
        );
        float3 p3Lin = max(mul(srgbToP3Expand, lin), 0.0);
        // Soft shoulder so expanded primaries never clip harshly on SDR monitors
        p3Lin = p3Lin / (1.0 + max(p3Lin - 0.85, 0.0) * 0.45);
        mapped = LinearToSrgb(lerp(lin, p3Lin, 0.70));
    } else if (id == 4) {
        // ITU-R BT.2020 UHD / HDR Wide Gamut (official CIE 1931 BT.2020 primary expansion + 10-bit OETF)
        float3x3 srgbTo2020Expand = float3x3(
             1.6605, -0.5876, -0.0728,
            -0.1246,  1.1329, -0.0083,
            -0.0182, -0.1006,  1.1187
        );
        float3 wide = max(mul(srgbTo2020Expand, lin), 0.0);
        // Perceptual gamut compression so BT.2020 saturation stays natural and silky
        float3 compressed = wide / (1.0 + wide * 0.22);
        float3 bt2020Lin = lerp(lin, compressed * 1.12, 0.48);
        // BT.2020 OETF transfer
        float3 lo = 4.5 * bt2020Lin;
        float3 hi = 1.0992968 * pow(max(bt2020Lin, 1e-5), 0.45) - 0.0992968;
        mapped = saturate(lerp(lo, hi, step(0.0180539, bt2020Lin)));
    } else if (id == 5) {
        // ACEScg (AP1 Cinema Pipeline: sRGB -> AP1 -> filmic AP1 rolloff -> display)
        float3x3 srgbToAp1 = float3x3(
            0.6131, 0.3395, 0.0474,
            0.0702, 0.9164, 0.0135,
            0.0206, 0.1096, 0.8698
        );
        float3x3 ap1ToSrgb = float3x3(
             1.7051, -0.6218, -0.0833,
            -0.1303,  1.1408, -0.0106,
            -0.0240, -0.1290,  1.1530
        );
        float3 ap1 = max(mul(srgbToAp1, lin * 1.18), 0.0);
        // Filmic RRT-style shoulder inside AP1 working space
        ap1 = (ap1 * (2.51 * ap1 + 0.03)) / (ap1 * (2.43 * ap1 + 0.59) + 0.14);
        float3 outLin = max(mul(ap1ToSrgb, ap1), 0.0);
        mapped = LinearToSrgb(outLin);
    }

    return saturate(lerp(srgbCol, mapped, saturate(strength)));
}

float4 PSMain(VSOut inp) : SV_Target {
    float2 rawUv = inp.uv;
    // Live Split-Screen Antes / Después comparator (left = original LMU, right = MDT-FX)
    if (split_screen > 0.01 && split_screen < 0.99) {
        if (abs(rawUv.x - split_screen) < (1.5 / max(resolution.x, 1.0))) {
            return float4(0.25, 0.65, 1.0, 1.0);
        }
        if (rawUv.x < split_screen) {
            return float4(srcTex.SampleLevel(linSamp, rawUv, 0).rgb, 1.0);
        }
    }

    float2 uv = rawUv;

    // #2 Wide-Angle Barrel Lens Distortion (with auto-zoom so corners never clip)
    if (lens_distortion > 0.001) {
        float2 p = uv * 2.0 - 1.0;
        float k = lens_distortion * 0.14;
        float r2 = dot(p, p);
        float zoom = 1.0 / (1.0 + k * 1.15);
        p = p * (1.0 + k * r2) * zoom;
        uv = saturate(p * 0.5 + 0.5);
    }

    // #9 G-Force Optical Head Shift + Kerb / High-Freq RPM Chassis Vibration
    float shiftMag = abs(g_shift_x) + abs(g_shift_y);
    float totalVib = shake_amt + rpm_vib_amt;
    if (shiftMag > 0.0001 || totalVib > 0.0001) {
        float sx = 0.0;
        float sy = 0.0;
        if (shake_amt > 0.0001) {
            sx += sin(time_sec * 64.0) * shake_amt;
            sy += cos(time_sec * 82.0) * shake_amt * 0.85;
        }
        if (rpm_vib_amt > 0.0001) {
            // Crisp high-frequency engine/rollcage camera mount vibration
            sx += (sin(time_sec * 148.0) * 0.65 + sin(time_sec * 231.0) * 0.35) * rpm_vib_amt;
            sy += (cos(time_sec * 173.0) * 0.65 + cos(time_sec * 269.0) * 0.35) * rpm_vib_amt * 1.15;
        }
        float margin = 1.0 - min(0.04, shiftMag * 0.65 + totalVib * 2.2);
        uv = (uv - 0.5) * margin + 0.5;
        uv = saturate(uv + float2(g_shift_x + sx, g_shift_y + sy));
    }

    float2 centered = uv - 0.5;
    float dist = length(centered);
    float2 px = 1.0 / max(resolution, float2(1.0, 1.0));

    bool perfMode = (performance_mode > 0.5);

    // #8 Hot Asphalt Heat Haze (visible horizon thermal shimmer waves, skipped in Performance Mode)
    if (!perfMode && heat_haze > 0.001) {
        float tempFac = saturate((track_temp - 18.0) / 18.0);
        float horizonBand = smoothstep(0.30, 0.44, uv.y) * (1.0 - smoothstep(0.52, 0.68, uv.y));
        float spdFade = 1.0 - saturate((speed_kmh - 160.0) / 180.0) * 0.55;
        float wave = sin(uv.x * 85.0 + time_sec * 13.0) * cos(uv.y * 110.0 - time_sec * 18.0);
        float amp = heat_haze * max(0.55, tempFac) * horizonBand * spdFade * 0.0052;
        uv = saturate(uv + float2(wave * amp * 0.6, wave * amp));
    }

    // CAS Sharpening + Optional Radial Chromatic Aberration
    float3 col;
    if (chromatic_aberration > 0.001) {
        float2 caOff = centered * (chromatic_aberration * 0.012 * dist);
        float r = ApplyCAS(saturate(uv + caOff), cas_sharpen).r;
        float g = ApplyCAS(uv, cas_sharpen).g;
        float b = ApplyCAS(saturate(uv - caOff), cas_sharpen).b;
        col = float3(r, g, b);
    } else {
        col = ApplyCAS(uv, cas_sharpen);
    }

    // Edge-Preserving Bilateral Surface Blur (SurfaceBlur.fx — removes harsh CG noise while keeping edges crisp!)
    if (!perfMode && surface_blur > 0.001) {
        float2 bStep = px * (1.2 + surface_blur * 1.4);
        float3 bAcc = col;
        float wAcc = 1.0;
        float2 bDirs[8] = {
            float2( 1,  0), float2(-1,  0), float2( 0,  1), float2( 0, -1),
            float2( 1,  1), float2(-1,  1), float2( 1, -1), float2(-1, -1)
        };
        [unroll]
        for (int bi = 0; bi < 8; bi++) {
            float3 s = srcTex.SampleLevel(linSamp, saturate(uv + bDirs[bi] * bStep), 0).rgb;
            float diff = length(s - col);
            // Bilateral range weight: preserves edges > ~0.09 delta
            float w = exp(-diff * diff * 95.0);
            bAcc += s * w;
            wAcc += w;
        }
        col = lerp(col, bAcc / wAcc, saturate(surface_blur * 0.85));
    }

    // Speed Radial Motion Blur (keeps center apex crisp, blurs outer edges > 165 km/h)
    if (speed_blur > 0.001 && speed_kmh > 165.0) {
        float spdFac = saturate((speed_kmh - 165.0) / 155.0);
        float edgeMask = smoothstep(0.22, 0.68, dist);
        float2 dir = centered * (speed_blur * spdFac * edgeMask * 0.038);
        float3 acc = col * 0.4;
        acc += srcTex.SampleLevel(linSamp, saturate(uv - dir * 0.35), 0).rgb * 0.25;
        acc += srcTex.SampleLevel(linSamp, saturate(uv - dir * 0.70), 0).rgb * 0.20;
        acc += srcTex.SampleLevel(linSamp, saturate(uv - dir * 1.00), 0).rgb * 0.15;
        col = acc;
    }

    // #6 Smart Temporal Anti-Aliasing (skipped in Performance Mode)
    if (!perfMode && taa_antialias > 0.001 && has_prev_frame > 0.5) {
        float3 n0 = srcTex.SampleLevel(linSamp, saturate(uv + float2( px.x,  0.0)), 0).rgb;
        float3 n1 = srcTex.SampleLevel(linSamp, saturate(uv + float2(-px.x,  0.0)), 0).rgb;
        float3 n2 = srcTex.SampleLevel(linSamp, saturate(uv + float2( 0.0,  px.y)), 0).rgb;
        float3 n3 = srcTex.SampleLevel(linSamp, saturate(uv + float2( 0.0, -px.y)), 0).rgb;
        float3 minC = min(col, min(min(n0, n1), min(n2, n3)));
        float3 maxC = max(col, max(max(n0, n1), max(n2, n3)));
        float3 prevTaa = clamp(prevTex.SampleLevel(linSamp, uv, 0).rgb, minC, maxC);
        float edgeContrast = length(maxC - minC);
        float taaMask = smoothstep(0.02, 0.22, edgeContrast);
        col = lerp(col, prevTaa, saturate(taa_antialias * taaMask * 0.65));
    }

    // #10 Frame-History Temporal Motion Blur (works in replays & driving, scales smoothly with speed, skipped in Performance Mode)
    if (!perfMode && temporal_motion_blur > 0.001 && has_prev_frame > 0.5) {
        float3 prevCol = prevTex.SampleLevel(linSamp, uv, 0).rgb;
        float diff = length(col - prevCol);
        float spdFac = max(0.42, saturate((speed_kmh - 30.0) / 180.0));
        float motionMask = smoothstep(0.025, 0.20, diff) * smoothstep(0.10, 0.48, dist);
        col = lerp(col, prevCol, saturate(temporal_motion_blur * spdFac * motionMask * 0.68));
    }

    // RealLongExposure / Camera Shutter Motion Blur (persistent GPU exposure accumulation, skipped in Performance Mode)
    if (!perfMode && long_exposure > 0.001 && has_accum > 0.5) {
        float3 accCol = accumTex.SampleLevel(linSamp, uv, 0).rgb;
        col = lerp(col, accCol, saturate(long_exposure * 0.92));
    }

    // Cinematic Replay Depth of Field (12-tap golden-angle photographic bokeh around vertical focus plane)
    if (!perfMode && cinematic_dof > 0.001) {
        float focusDist = abs(uv.y - dof_focus);
        float coc = smoothstep(0.08, 0.42, focusDist) * cinematic_dof;
        if (coc > 0.005) {
            float aspect = resolution.x / max(resolution.y, 1.0);
            float2 radius = float2(coc * 11.0 / max(resolution.x, 1.0), coc * 11.0 / max(resolution.y, 1.0));
            // Preserve aspect-correct circular bokeh
            radius.x *= (1.0 / max(aspect, 0.5)) * 1.4;
            float3 bokehSum = col;
            float wSum = 1.0;
            const float golden = 2.39996323;
            [unroll]
            for (int k = 1; k <= 12; k++) {
                float r = sqrt(float(k) / 12.0);
                float ang = float(k) * golden;
                float2 off = float2(cos(ang), sin(ang)) * r * radius;
                float3 s = srcTex.SampleLevel(linSamp, saturate(uv + off), 0).rgb;
                // Highlight-weighted photographic bokeh
                float sw = 1.0 + max(0.0, dot(s, float3(0.2126, 0.7152, 0.0722)) - 0.72) * 1.6;
                bokehSum += s * sw;
                wSum += sw;
            }
            col = lerp(col, bokehSum / wSum, saturate(coc * 1.35));
        }
    }

    // 🌟 Lumen-Style Multi-Scale Screen-Space GI (skipped in Performance Mode)
    if (!perfMode && (lumen_gi > 0.001 || lumen_sky_bounce > 0.001)) {
        float3 linCol = col * col;
        float3 radMed = radTex1.SampleLevel(linSamp, uv, 0).rgb;
        float3 radWide = radTex2.SampleLevel(linSamp, uv, 0).rgb;
        float3 skyRad = radTex2.SampleLevel(linSamp, float2(uv.x, 0.14), 0).rgb;
        float curL = dot(col, float3(0.2126, 0.7152, 0.0722));
        float shadowW = pow(saturate(1.0 - curL), 1.35);

        if (lumen_gi > 0.001) {
            // Multi-scale colored indirect bounce into shadows & midtones
            float3 indirect = radMed * 0.58 + radWide * 0.42;
            linCol += indirect * (shadowW * lumen_gi * 0.42);
            // Soft indirect contact occlusion where pixel is darker than its local radiance field
            float radL = dot(radMed, float3(0.2126, 0.7152, 0.0722));
            float occ = saturate((radL - curL * curL) * 2.6) * smoothstep(0.42, 0.04, curL);
            linCol *= (1.0 - occ * lumen_gi * 0.34);
        }
        if (lumen_sky_bounce > 0.001) {
            // Live hemispherical sky-light tint from the real upper sky of LMU
            linCol += skyRad * (shadowW * lumen_sky_bounce * 0.26);
        }
        col = saturate(sqrt(max(linCol, 0.0)));
    }

    // #1 Multi-Pass Dual-Kawase Pyramidal Bloom (skipped in Performance Mode)
    if (!perfMode && pyramidal_bloom > 0.001) {
        float3 pyr = bloomTex.SampleLevel(linSamp, uv, 0).rgb;
        col = saturate(col + pyr * (pyramidal_bloom * 0.85));
    }

    // #4 Volumetric Sun God-Rays (10-tap radial sky light shafts, skipped in Performance Mode)
    if (!perfMode && sun_god_rays > 0.001) {
        float2 sunOrigin = float2(0.5, 0.14);
        float2 deltaUv = (uv - sunOrigin) * (1.0 / 10.0) * 0.78;
        float2 sampleUv = uv;
        float decay = 1.0;
        float3 rays = float3(0.0, 0.0, 0.0);
        [unroll]
        for (int r = 0; r < 10; r++) {
            sampleUv -= deltaUv;
            float3 s = srcTex.SampleLevel(linSamp, saturate(sampleUv), 0).rgb;
            float sl = dot(s, float3(0.2126, 0.7152, 0.0722));
            rays += s * smoothstep(0.60, 0.90, sl) * decay;
            decay *= 0.86;
        }
        float upperW = 1.0 - smoothstep(0.55, 0.95, uv.y) * 0.55;
        col = saturate(col + rays * float3(1.06, 0.98, 0.86) * (sun_god_rays * 0.14 * upperW));
    }

    // #3 Clarity (Local Micro-Contrast weighted to midtones for asphalt/cockpit realism)
    if (clarity > 0.001) {
        float2 cOff = px * 4.5;
        float3 blur = (
            srcTex.SampleLevel(linSamp, saturate(uv + float2(cOff.x, cOff.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-cOff.x, cOff.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(cOff.x, -cOff.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-cOff.x, -cOff.y)), 0).rgb
        ) * 0.25;
        float l = dot(col, float3(0.2126, 0.7152, 0.0722));
        float midMask = saturate(4.0 * l * (1.0 - l));
        col = saturate(col + (col - blur) * (clarity * 0.68 * midMask));
    }

    // #1 Optical Bloom & Film Halation (skipped in Performance Mode)
    if (!perfMode && (bloom > 0.001 || halation > 0.001)) {
        float2 bOff1 = px * 6.0;
        float2 bOff2 = px * 14.0;
        float3 bSum = float3(0.0, 0.0, 0.0);
        float2 dirs[4] = { float2(1, 0), float2(-1, 0), float2(0, 1), float2(0, -1) };
        [unroll]
        for (int i = 0; i < 4; i++) {
            float3 s1 = srcTex.SampleLevel(linSamp, saturate(uv + dirs[i] * bOff1), 0).rgb;
            float3 s2 = srcTex.SampleLevel(linSamp, saturate(uv + dirs[i] * bOff2), 0).rgb;
            bSum += max(0.0, s1 - 0.70) * 0.65 + max(0.0, s2 - 0.74) * 0.45;
        }
        bSum *= 0.25;
        if (bloom > 0.001) {
            col += bSum * (bloom * 0.95);
        }
        if (halation > 0.001) {
            // Warm red-amber film halation fringe around specular highlights
            col += float3(bSum.r * 1.15, bSum.g * 0.42, bSum.b * 0.14) * (halation * 0.85);
        }
    }

    // #5 Anamorphic Horizontal Lens Flare (skipped in Performance Mode)
    if (!perfMode && anamorphic_flare > 0.001) {
        float3 flare = float3(0.0, 0.0, 0.0);
        [unroll]
        for (int j = 1; j <= 4; j++) {
            float dx = px.x * (float(j) * 16.0);
            float w = 1.0 - float(j) * 0.2;
            float3 flL = max(0.0, srcTex.SampleLevel(linSamp, saturate(uv - float2(dx, 0.0)), 0).rgb - 0.80);
            float3 flR = max(0.0, srcTex.SampleLevel(linSamp, saturate(uv + float2(dx, 0.0)), 0).rgb - 0.80);
            flare += (flL + flR) * w;
        }
        col += flare * float3(0.45, 0.72, 1.15) * (anamorphic_flare * 0.42);
    }

    // Real Broadcast Onboard: 6-Point Optical Aperture Starburst (headlights at night & low sun)
    if (!perfMode && starburst > 0.001) {
        float3 star = float3(0.0, 0.0, 0.0);
        float2 axes[3] = {
            float2(1.0, 0.0),
            float2(0.5, 0.8660254),
            float2(-0.5, 0.8660254)
        };
        [unroll]
        for (int a = 0; a < 3; a++) {
            float2 d = axes[a] * px;
            [unroll]
            for (int st = 1; st <= 4; st++) {
                float stepPx = float(st) * 7.5;
                float w = (1.0 - float(st) * 0.19) * 0.34;
                float3 sP = srcTex.SampleLevel(linSamp, saturate(uv + d * stepPx), 0).rgb;
                float3 sN = srcTex.SampleLevel(linSamp, saturate(uv - d * stepPx), 0).rgb;
                float lP = dot(sP, float3(0.2126, 0.7152, 0.0722));
                float lN = dot(sN, float3(0.2126, 0.7152, 0.0722));
                star += (sP * smoothstep(0.84, 0.99, lP) + sN * smoothstep(0.84, 0.99, lN)) * w;
            }
        }
        col = saturate(col + star * (starburst * 0.48));
    }

    // Real Broadcast Onboard: Light-Reactive Polycarbonate Windshield / Dirty Lens Scatter
    if (!perfMode && dirty_lens > 0.001) {
        // Sample wide ambient glare around this pixel (only bright sun/headlights illuminate windshield dust!)
        float3 glare = (
            srcTex.SampleLevel(linSamp, saturate(uv + float2(px.x * 28.0,  px.y * 22.0)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-px.x * 28.0, px.y * 22.0)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(px.x * 28.0, -px.y * 22.0)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-px.x * 28.0, -px.y * 22.0)), 0).rgb
        ) * 0.25;
        float gL = dot(glare, float3(0.2126, 0.7152, 0.0722));
        float lightGate = smoothstep(0.58, 0.92, gL);
        if (lightGate > 0.005) {
            // Procedural multi-scale rubber specks & micro-scratches, kept clear around central racing apex
            float2 cell1 = floor(uv * float2(18.0, 11.0));
            float2 f1 = frac(uv * float2(18.0, 11.0)) - 0.5;
            float rnd1 = Hash12(cell1 + 13.7);
            float speck1 = smoothstep(0.26, 0.03, length(f1)) * step(0.62, rnd1);
            float2 cell2 = floor(uv * float2(42.0, 24.0));
            float2 f2 = frac(uv * float2(42.0, 24.0)) - 0.5;
            float rnd2 = Hash12(cell2 + 71.3);
            float speck2 = smoothstep(0.22, 0.02, length(f2)) * step(0.74, rnd2);
            float haze = 0.25 + speck1 * 0.55 + speck2 * 0.40;
            float apexClear = smoothstep(0.14, 0.50, dist);
            col = saturate(col + glare * (haze * lightGate * apexClear * dirty_lens * 0.34));
        }
    }

    // Real Broadcast Onboard: Wet Asphalt Specular Reflections (boosted by live LMU rain telemetry)
    if (!perfMode && wet_reflections > 0.001) {
        float wetMask = (rain_amount > 0.03) ? saturate(0.35 + rain_amount * 0.85) : 0.35;
        float roadBand = smoothstep(0.50, 0.72, uv.y) * (1.0 - smoothstep(0.84, 0.96, uv.y));
        if (roadBand > 0.005) {
            // Sample vertically above to catch brake lights, headlights & sky reflecting off wet asphalt
            float2 reflUv1 = float2(uv.x, saturate(uv.y - (uv.y - 0.46) * 0.85));
            float2 reflUv2 = float2(uv.x, saturate(uv.y - (uv.y - 0.46) * 1.35));
            float3 r1 = srcTex.SampleLevel(linSamp, reflUv1, 0).rgb;
            float3 r2 = srcTex.SampleLevel(linSamp, reflUv2, 0).rgb;
            float3 refl = r1 * 0.62 + r2 * 0.38;
            float rL = dot(refl, float3(0.2126, 0.7152, 0.0722));
            float curL = dot(col, float3(0.2126, 0.7152, 0.0722));
            // Only darken & reflect on darker asphalt pixels (never wash out bright white cockpit/kerbs)
            float asphaltGate = saturate(1.0 - smoothstep(0.18, 0.52, curL));
            float specGate = smoothstep(0.42, 0.90, rL);
            float strength = wet_reflections * wetMask * roadBand * asphaltGate;
            col = saturate(col * (1.0 - strength * 0.22) + refl * (specGate * strength * 0.52));
        }
    }

    // #2 Screen-Space Global Illumination / Color Bounce & #4 Black Pro-Mist 1/4 (skipped in Performance Mode)
    if (!perfMode && (gi_bounce > 0.001 || pro_mist > 0.001 || local_hdr > 0.001)) {
        float2 wide1 = px * 22.0;
        float2 wide2 = px * 46.0;
        float3 env = (
            srcTex.SampleLevel(linSamp, saturate(uv + float2(wide1.x, wide1.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-wide1.x, wide1.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(wide1.x, -wide1.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-wide1.x, -wide1.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(wide2.x, 0.0)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(-wide2.x, 0.0)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(0.0, wide2.y)), 0).rgb +
            srcTex.SampleLevel(linSamp, saturate(uv + float2(0.0, -wide2.y)), 0).rgb
        ) * 0.125;

        // #2 GI Color Bounce: gently bounces surrounding light color into darker shadows
        if (gi_bounce > 0.001) {
            float curL = dot(col, float3(0.2126, 0.7152, 0.0722));
            float shadowMask = saturate(1.0 - curL * 1.45);
            col = saturate(col + env * env * shadowMask * (gi_bounce * 0.55));
        }

        // #4 Black Pro-Mist 1/4: silky screen-blended diffusion veil on upper midtones & highs
        if (pro_mist > 0.001) {
            float3 mist = max(0.0, env - 0.38) * 1.35;
            float3 screened = 1.0 - (1.0 - col) * (1.0 - mist * (pro_mist * 0.52));
            col = saturate(screened);
        }

        // #5 Local Tone Mapping / Fake HDR: lifts dark cockpit shadows without blowing bright sky
        if (local_hdr > 0.001) {
            float localL = dot(env, float3(0.2126, 0.7152, 0.0722));
            float curL = dot(col, float3(0.2126, 0.7152, 0.0722));
            float liftAmt = saturate(0.45 - localL) * saturate(1.0 - curL * 1.15);
            float compressAmt = saturate(localL - 0.62) * saturate(curL - 0.55);
            col = saturate(col * (1.0 + liftAmt * local_hdr * 0.85 - compressAmt * local_hdr * 0.32));
        }
    }

    // #4 Atmospheric Dehaze (removes flat washed-out 3D veil)
    if (dehaze > 0.001) {
        float minCh = min(col.r, min(col.g, col.b));
        float hazeEst = saturate(minCh * 0.35);
        col = saturate((col - hazeEst * dehaze * 0.45) / max(0.55, 1.0 - dehaze * 0.22));
    }

    // Optional Linear Color Space Pipeline (EOTF: sRGB -> Physical Linear Light)
    bool useLinear = (linear_color_space > 0.5);
    if (useLinear) {
        col = SrgbToLinear(col);
    }

    // #7 Temporally-Smoothed Camera Sensor Auto-Exposure (computed with EMA inertia in Rust -> ZERO flicker!)
    float autoEv = (auto_exposure > 0.5) ? auto_ev_smooth : 0.0;

    // Exposure & Brightness (in physical stops when Linear Color Space is enabled)
    col *= exp2(exposure + autoEv) * brightness;

    // #6 3-Way Color Balance: Lift (Shadows) / Gamma (Midtones) / Gain (Highlights)
    col = max(col * gain + lift * (1.0 - saturate(col)), 0.0);
    if (!useLinear) {
        col = saturate(col);
    }
    if (abs(gamma - 1.0) > 0.005) {
        col = pow(max(col, 0.0001), 1.0 / max(0.35, gamma));
    }

    // ACES Filmic Tonemapping
    if (aces_tonemap > 0.001) {
        col = lerp(col, AcesFilm(col * (useLinear ? 1.0 : 1.15)), saturate(aces_tonemap));
    }

    // #1 AgX Filmic Tonemapping (fixed: true linear space -> rich contrast & silky highlight roll-off, ZERO white-out!)
    if (agx_tonemap > 0.001) {
        col = lerp(col, AgxTonemap(col, useLinear), saturate(agx_tonemap));
    }

    // #7 Highlight Roll-Off (smooth photographic shoulder above 0.72 luminance)
    if (highlight_rolloff > 0.001) {
        float hl = dot(col, float3(0.2126, 0.7152, 0.0722));
        float thresh = useLinear ? 0.50 : 0.72;
        if (hl > thresh) {
            float excess = hl - thresh;
            float rolled = thresh + (excess / (1.0 + excess * (1.8 * highlight_rolloff + 0.2)));
            col *= (rolled / max(hl, 0.0001));
        }
    }

    // #8 Split Toning of Outdoor Lighting (Cool Sky Shadows + Warm Direct Sunlight Highlights)
    if (split_shadow_cool > 0.001 || split_highlight_warm > 0.001) {
        float sl = dot(col, float3(0.2126, 0.7152, 0.0722));
        float shW = saturate(1.0 - smoothstep(0.05, 0.48, sl));
        float hiW = smoothstep(0.48, 0.92, sl);
        float3 coolTint = float3(0.86, 0.95, 1.14);
        float3 warmTint = float3(1.12, 1.03, 0.88);
        col = lerp(col, col * coolTint, shW * split_shadow_cool * 0.55);
        col = lerp(col, col * warmTint, hiW * split_highlight_warm * 0.55);
        if (!useLinear) col = saturate(col);
    }

    // #9 Micro-Shadow Depth / Contact Occlusion (deepens crevices under cars & kerbs)
    if (shadow_depth > 0.001) {
        float dl = dot(col, float3(0.2126, 0.7152, 0.0722));
        float darkMask = saturate(1.0 - smoothstep(0.02, 0.30, dl));
        col *= (1.0 - darkMask * shadow_depth * 0.42);
    }

    // Color Temperature (Warmth) & Tint
    col.r *= (1.0 + warmth * 0.14);
    col.b *= (1.0 - warmth * 0.14);
    col.g *= (1.0 + tint * 0.10);

    // Return from Physical Linear Light -> Display sRGB (OETF) before display-referred Contrast / HSL / LUTs
    if (useLinear) {
        col = LinearToSrgb(col);
    } else {
        col = saturate(col);
    }

    // Contrast S-Curve around mid-grey
    col = saturate((col - 0.5) * contrast + 0.5);

    // Smart Vibrance + Saturation
    float luma = dot(col, float3(0.2126, 0.7152, 0.0722));
    float maxC = max(col.r, max(col.g, col.b));
    float minC = min(col.r, min(col.g, col.b));
    float curSat = maxC - minC;
    float vibAmt = vibrance * (1.0 - curSat);
    col = saturate(lerp(float3(luma, luma, luma), col, saturation + vibAmt));

    // #2 Selective HSL Realism (tames radioactive sim grass & oversaturated electric skies)
    if (grass_realism > 0.001 || sky_realism > 0.001) {
        float3 hsl = RgbToHsl(col);
        if (grass_realism > 0.001) {
            float gMask = smoothstep(0.13, 0.21, hsl.x) * (1.0 - smoothstep(0.40, 0.48, hsl.x));
            hsl.y *= (1.0 - gMask * grass_realism * 0.54);
            hsl.z *= (1.0 - gMask * grass_realism * 0.16);
            hsl.x = frac(hsl.x - gMask * grass_realism * 0.032 + 1.0);
        }
        if (sky_realism > 0.001) {
            float bMask = smoothstep(0.48, 0.55, hsl.x) * (1.0 - smoothstep(0.67, 0.75, hsl.x));
            hsl.y *= (1.0 - bMask * sky_realism * 0.44);
            hsl.z *= (1.0 - bMask * sky_realism * 0.12);
        }
        col = HslToRgb(hsl);
    }

    // #7 35mm Photochemical Film Emulation (Dye Crosstalk matrix + luminance-aware organic grain)
    if (film_35mm > 0.001) {
        float3x3 dyeMat = float3x3(
            0.94, 0.05, 0.01,
            0.03, 0.93, 0.04,
            0.02, 0.06, 0.92
        );
        float3 filmCol = saturate(mul(dyeMat, col));
        // Subtle film shoulder + shadow toe
        filmCol = saturate(filmCol * 0.96 + 0.02);
        float fl = dot(filmCol, float3(0.2126, 0.7152, 0.0722));
        float grainMask = saturate(1.0 - smoothstep(0.35, 0.88, fl));
        float gNoise = Hash12(uv * resolution + frac(time_sec * 23.7) * 100.0) - 0.5;
        filmCol = saturate(filmCol + gNoise * grainMask * (film_35mm * 0.075));
        col = lerp(col, filmCol, saturate(film_35mm));
    }

    // Photochemical DPX Film Curve (DPX.fx — classic broadcast/cinema RGB separation & contrast)
    if (dpx_film > 0.001) {
        float3 dpx = pow(max(col, 0.0001), float3(1.04, 1.01, 0.97));
        // Classic DPX S-curve + slight broadcast warmth in highlights / cool slate shadows
        float3 curved = dpx * dpx * (3.0 - 2.0 * dpx);
        dpx = lerp(dpx, curved, 0.32);
        float dL = dot(dpx, float3(0.2126, 0.7152, 0.0722));
        dpx = saturate(lerp(float3(dL, dL, dL), dpx, 1.12));
        col = lerp(col, dpx, saturate(dpx_film * 0.75));
    }

    // Color Space / Gamut Profile (Rec.709, HLG, DCI-P3, BT.2020, ACEScg)
    if (color_space > 0.5 && color_space_strength > 0.001) {
        col = ApplyColorSpaceProfile(col, color_space, color_space_strength);
    }

    // Built-in Onboard LUTs (1..5, 7=IMSA Real) or Custom 3D .cube LUT (6)
    if (lut_strength > 0.001) {
        if (abs(lut_preset - 6.0) < 0.5 && has_custom_lut > 0.5) {
            float3 lutCol = lutTex.SampleLevel(linSamp, saturate(col), 0).rgb;
            col = lerp(col, lutCol, saturate(lut_strength));
        } else if (lut_preset > 0.5 && abs(lut_preset - 6.0) >= 0.5) {
            float3 lutCol = ApplyBuiltinLut(col, lut_preset);
            col = lerp(col, lutCol, saturate(lut_strength));
        }
    }

    // Optical Lens Vignette + Dynamic Speed Tunnel
    float spdVig = (speed_vignette > 0.5 && speed_kmh > 190.0)
        ? saturate((speed_kmh - 190.0) / 140.0) * 0.28
        : 0.0;
    float totVig = saturate(vignette + spdVig);
    if (totVig > 0.001) {
        float vigMask = smoothstep(0.35, 0.92, dist * 1.28);
        col *= (1.0 - vigMask * totVig * 0.85);
    }

    // Heavy Braking G-Force Subtle Warm Edge Bloom
    if (brake_g > 0.001) {
        float edge = smoothstep(0.42, 0.85, dist * 1.2);
        col = lerp(col, col + float3(0.38, 0.04, 0.02), edge * brake_g);
    }

    // Subtle Sensor Film Grain
    if (film_grain > 0.001) {
        float n = Hash12(uv * resolution + frac(time_sec * 17.3) * 100.0) - 0.5;
        col = saturate(col + n * film_grain * 0.22);
    }

    // Broadcast / Retro Scanlines
    if (scanlines > 0.001) {
        float sl = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
        col *= (1.0 - scanlines * 0.35 * sl);
    }

    // Analog Broadcast RF / VHS Signal (VHS_RA.fx / Interlaced.fx — horizontal chroma bleed + subtle RF noise & interlace)
    if (vhs_rf > 0.001) {
        float v = saturate(vhs_rf);
        float bleedPx = (2.5 + v * 5.0) * px.x;
        float3 cL = srcTex.SampleLevel(linSamp, saturate(uv - float2(bleedPx, 0.0)), 0).rgb;
        float3 cR = srcTex.SampleLevel(linSamp, saturate(uv + float2(bleedPx, 0.0)), 0).rgb;
        float yCur = dot(col, float3(0.299, 0.587, 0.114));
        float3 chromaAvg = (cL + cR) * 0.5;
        float yAvg = dot(chromaAvg, float3(0.299, 0.587, 0.114));
        float3 rfCol = saturate(float3(yCur, yCur, yCur) + (chromaAvg - float3(yAvg, yAvg, yAvg)) * 1.15);
        // Subtle 480i/576i broadcast interlace & analog tape noise
        float interlace = (fmod(floor(uv.y * resolution.y * 0.5), 2.0) < 1.0) ? 1.0 : (1.0 - v * 0.10);
        float rfNoise = (Hash12(float2(uv.x * 420.0, floor(uv.y * 240.0) + frac(time_sec * 30.0) * 50.0)) - 0.5) * (v * 0.07);
        col = saturate(lerp(col, rfCol * interlace + rfNoise, v * 0.85));
    }

    // Real WEC/IMSA Broadcast CMOS Sensor Look (4:2:2 chroma softness + matte charcoal toe + smooth broadcast knee)
    if (broadcast_sensor > 0.001) {
        float bs = saturate(broadcast_sensor);
        // 1. Subtle 4:2:2 horizontal chroma softening (keeps luminance 100% razor-sharp!)
        float3 cL = srcTex.SampleLevel(linSamp, saturate(uv - float2(px.x * 1.5, 0.0)), 0).rgb;
        float3 cR = srcTex.SampleLevel(linSamp, saturate(uv + float2(px.x * 1.5, 0.0)), 0).rgb;
        float3 avgNb = (cL + cR) * 0.5;
        float curY = dot(col, float3(0.2126, 0.7152, 0.0722));
        float nbY  = dot(avgNb, float3(0.2126, 0.7152, 0.0722));
        float3 softChroma = saturate(float3(curY, curY, curY) + (avgNb - float3(nbY, nbY, nbY)));
        col = lerp(col, softChroma, bs * 0.24);
        // 2. Matte charcoal black toe (prevents crushed CG #000000 in carbon cockpits)
        float toe = 0.016 * bs * (1.0 - smoothstep(0.0, 0.24, curY));
        col = saturate(col + toe);
        // 3. Broadcast CMOS soft highlight knee (silky bright sky/kerb compression without white-out)
        float hiKnee = smoothstep(0.78, 1.0, curY);
        col = lerp(col, col * float3(0.985, 0.99, 1.0), hiKnee * bs * 0.35);
    }

    // 10-Bit Blue-Noise Debanding (eliminates 8-bit sky/sunset/night gradient banding)
    if (deband > 0.001) {
        float n1 = Hash12(uv * resolution + float2(11.3, 27.9));
        float n2 = Hash12(uv * resolution + float2(53.1, 7.4));
        // Triangular PDF dither (zero mean, visually invisible)
        float tri = (n1 + n2 - 1.0);
        col = saturate(col + tri * (deband * (1.5 / 255.0)));
    }

    return float4(saturate(col), 1.0);
}
"#;

    unsafe extern "system" fn fx_wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn set_window_capture_excluded(hwnd_raw: isize, exclude: bool) {
        if hwnd_raw == 0 {
            return;
        }
        unsafe {
            let hwnd = HWND(hwnd_raw as *mut c_void);
            let affinity = if exclude { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
            let _ = SetWindowDisplayAffinity(hwnd, affinity);
        }
    }

    fn create_fx_window(width: i32, height: i32, x: i32, y: i32) -> Result<HWND, String> {
        unsafe {
            let hinst = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW: {e}"))?;
            let class_name = w!("MDT_HUD_FX_D3D11_WND");
            let wc = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(fx_wnd_proc),
                hInstance: hinst.into(),
                lpszClassName: class_name,
                ..Default::default()
            };
            let _ = RegisterClassExW(&wc);

            let ex_style = WS_EX_TOPMOST
                | WS_EX_TRANSPARENT
                | WS_EX_LAYERED
                | WS_EX_TOOLWINDOW
                | WS_EX_NOACTIVATE;
            let hwnd = CreateWindowExW(
                ex_style,
                class_name,
                w!("MDT-FX Native GPU"),
                WS_POPUP,
                x,
                y,
                width,
                height,
                None,
                None,
                Some(hinst.into()),
                None,
            )
            .map_err(|e| format!("CreateWindowExW: {e}"))?;

            let _ = SetLayeredWindowAttributes(hwnd, windows::Win32::Foundation::COLORREF(0), 255, LWA_ALPHA);
            let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
            Ok(hwnd)
        }
    }

    fn compile_shader(entry: PCSTR, target: PCSTR) -> Result<Vec<u8>, String> {
        unsafe {
            let mut blob = None;
            let mut err_blob = None;
            let res = D3DCompile(
                FX_SHADER_HLSL.as_ptr() as *const c_void,
                FX_SHADER_HLSL.len(),
                None,
                None,
                None,
                entry,
                target,
                0,
                0,
                &mut blob,
                Some(&mut err_blob),
            );
            if let Err(e) = res {
                let msg = err_blob
                    .map(|b| {
                        let slice = std::slice::from_raw_parts(b.GetBufferPointer() as *const u8, b.GetBufferSize());
                        String::from_utf8_lossy(slice).to_string()
                    })
                    .unwrap_or_else(|| e.to_string());
                return Err(format!("Error compilando shader HLSL: {msg}"));
            }
            let b = blob.ok_or_else(|| "Blob HLSL vacío".to_string())?;
            let slice = std::slice::from_raw_parts(b.GetBufferPointer() as *const u8, b.GetBufferSize());
            Ok(slice.to_vec())
        }
    }

    fn upload_3d_lut(
        device: &ID3D11Device,
        lut: &ParsedCubeLut,
    ) -> Result<ID3D11ShaderResourceView, String> {
        unsafe {
            let desc = D3D11_TEXTURE3D_DESC {
                Width: lut.size,
                Height: lut.size,
                Depth: lut.size,
                MipLevels: 1,
                Format: DXGI_FORMAT_R32G32B32A32_FLOAT,
                Usage: D3D11_USAGE_IMMUTABLE,
                BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };
            let row_pitch = lut.size * 16;
            let slice_pitch = row_pitch * lut.size;
            let init = D3D11_SUBRESOURCE_DATA {
                pSysMem: lut.data.as_ptr() as *const c_void,
                SysMemPitch: row_pitch,
                SysMemSlicePitch: slice_pitch,
            };
            let mut tex: Option<ID3D11Texture3D> = None;
            device
                .CreateTexture3D(&desc, Some(&init), Some(&mut tex))
                .map_err(|e| format!("CreateTexture3D LUT: {e}"))?;
            let tex = tex.ok_or_else(|| "Texture3D LUT vacía".to_string())?;
            let mut srv: Option<ID3D11ShaderResourceView> = None;
            device
                .CreateShaderResourceView(&tex, None, Some(&mut srv))
                .map_err(|e| format!("CreateSRV LUT: {e}"))?;
            srv.ok_or_else(|| "SRV LUT vacío".to_string())
        }
    }

    fn place_below_overlay(fx_hwnd: HWND, overlay_hwnd_raw: isize, rect: &RECT) {
        unsafe {
            let insert_after = if overlay_hwnd_raw != 0 {
                HWND(overlay_hwnd_raw as *mut c_void)
            } else {
                HWND_TOPMOST
            };
            let _ = SetWindowPos(
                fx_hwnd,
                Some(insert_after),
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
    }

    /// Dynamically punches a pixel-exact rectangular cutout in the D3D11 FX window
    /// whenever the MDT-HUD Companion app is in the foreground on the same monitor,
    /// so sliders and previews stay 100% crisp & unaffected while LMU renders live FX around it.
    fn sync_companion_cutout(
        fx_hwnd: HWND,
        fx_rect: &RECT,
        comp_hwnd_raw: isize,
        last_cutout: &mut Option<[i32; 4]>,
    ) {
        let mut desired: Option<[i32; 4]> = None;
        if comp_hwnd_raw != 0 {
            unsafe {
                let comp_hwnd = HWND(comp_hwnd_raw as *mut c_void);
                if IsWindowVisible(comp_hwnd).as_bool() && !IsIconic(comp_hwnd).as_bool() {
                    let fg = GetForegroundWindow();
                    let mut fg_pid = 0u32;
                    if !fg.0.is_null() {
                        GetWindowThreadProcessId(fg, Some(&mut fg_pid));
                    }
                    let my_pid = std::process::id();
                    if fg == comp_hwnd || fg_pid == my_pid {
                        let mut cr = RECT::default();
                        if GetWindowRect(comp_hwnd, &mut cr).is_ok() {
                            let w = fx_rect.right - fx_rect.left;
                            let h = fx_rect.bottom - fx_rect.top;
                            let x1 = (cr.left - fx_rect.left).max(0);
                            let y1 = (cr.top - fx_rect.top).max(0);
                            let x2 = (cr.right - fx_rect.left).min(w);
                            let y2 = (cr.bottom - fx_rect.top).min(h);
                            if x2 > x1 && y2 > y1 {
                                desired = Some([x1, y1, x2, y2]);
                            }
                        }
                    }
                }
            }
        }

        if desired != *last_cutout {
            *last_cutout = desired;
            unsafe {
                if let Some([x1, y1, x2, y2]) = desired {
                    let w = fx_rect.right - fx_rect.left;
                    let h = fx_rect.bottom - fx_rect.top;
                    let full = CreateRectRgn(0, 0, w, h);
                    let hole = CreateRectRgn(x1, y1, x2, y2);
                    let _ = CombineRgn(Some(full), Some(full), Some(hole), RGN_DIFF);
                    let _ = DeleteObject(hole.into());
                    // Windows takes ownership of `full` when SetWindowRgn succeeds
                    if SetWindowRgn(fx_hwnd, Some(full), true) == 0 {
                        let _ = DeleteObject(full.into());
                    }
                } else {
                    let _ = SetWindowRgn(fx_hwnd, None, true);
                }
            }
        }
    }

    struct ActivePipeline {
        hwnd: HWND,
        rect: RECT,
        device: ID3D11Device,
        ctx: ID3D11DeviceContext,
        swapchain: IDXGISwapChain1,
        rtv: ID3D11RenderTargetView,
        dupl: IDXGIOutputDuplication,
        copy_tex: ID3D11Texture2D,
        copy_srv: ID3D11ShaderResourceView,
        // #10 Temporal history texture (previous desktop frame for motion blur)
        prev_tex: ID3D11Texture2D,
        prev_srv: ID3D11ShaderResourceView,
        has_prev_frame: bool,
        // RealLongExposure / Camera Shutter ping-pong accumulation buffers
        accum_rt: [ID3D11RenderTargetView; 2],
        accum_srv: [ID3D11ShaderResourceView; 2],
        accum_idx: usize,
        has_accum: bool,
        ps_accum: ID3D11PixelShader,
        // #1 Multi-pass Dual-Kawase Bloom pyramid (half-res + quarter-res)
        bloom_rt1: ID3D11RenderTargetView,
        bloom_srv1: ID3D11ShaderResourceView,
        bloom_rt2: ID3D11RenderTargetView,
        bloom_srv2: ID3D11ShaderResourceView,
        ps_bloom_extract: ID3D11PixelShader,
        ps_bloom_blur: ID3D11PixelShader,
        // Lumen-Style Multi-Scale GI Radiance Pyramid (W/8 + W/32)
        rad_rt1: ID3D11RenderTargetView,
        rad_srv1: ID3D11ShaderResourceView,
        rad_rt2: ID3D11RenderTargetView,
        rad_srv2: ID3D11ShaderResourceView,
        ps_rad_down: ID3D11PixelShader,
        ps_rad_wide: ID3D11PixelShader,
        vs: ID3D11VertexShader,
        ps: ID3D11PixelShader,
        sampler: ID3D11SamplerState,
        cbuffer: ID3D11Buffer,
        lut_srv: Option<ID3D11ShaderResourceView>,
        lut_ver: u64,
        // Tiny 1x1 staging texel sampler for flicker-free temporally-smoothed Auto-Exposure
        meter_staging: ID3D11Texture2D,
        // Last applied companion cutout region in local FX window coordinates
        last_cutout: Option<[i32; 4]>,
    }

    impl ActivePipeline {
        fn create(overlay_hwnd_raw: isize) -> Result<Self, String> {
            unsafe {
                let mut device: Option<ID3D11Device> = None;
                let mut ctx: Option<ID3D11DeviceContext> = None;
                D3D11CreateDevice(
                    None,
                    D3D_DRIVER_TYPE_HARDWARE,
                    windows::Win32::Foundation::HMODULE::default(),
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    None,
                    Some(&mut ctx),
                )
                .map_err(|e| format!("D3D11CreateDevice: {e}"))?;
                let device = device.ok_or_else(|| "ID3D11Device nulo".to_string())?;
                let ctx = ctx.ok_or_else(|| "ID3D11DeviceContext nulo".to_string())?;

                let dxgi_dev: IDXGIDevice = device.cast().map_err(|e| format!("IDXGIDevice: {e}"))?;
                let adapter: IDXGIAdapter = dxgi_dev.GetAdapter().map_err(|e| format!("GetAdapter: {e}"))?;
                let output: IDXGIOutput = adapter.EnumOutputs(0).map_err(|e| format!("EnumOutputs(0): {e}"))?;
                let out_desc = output.GetDesc().map_err(|e| format!("Output GetDesc: {e}"))?;
                let rect = out_desc.DesktopCoordinates;
                let width = (rect.right - rect.left).max(1) as u32;
                let height = (rect.bottom - rect.top).max(1) as u32;

                let output1: IDXGIOutput1 = output.cast().map_err(|e| format!("IDXGIOutput1: {e}"))?;
                let dupl = output1
                    .DuplicateOutput(&device)
                    .map_err(|e| format!("DuplicateOutput (DXGI): {e}"))?;

                let hwnd = create_fx_window(width as i32, height as i32, rect.left, rect.top)?;
                place_below_overlay(hwnd, overlay_hwnd_raw, &rect);

                let factory: IDXGIFactory2 = adapter
                    .GetParent()
                    .map_err(|e| format!("IDXGIFactory2: {e}"))?;
                let sc_desc = DXGI_SWAP_CHAIN_DESC1 {
                    Width: width,
                    Height: height,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    Stereo: false.into(),
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                    BufferCount: 2,
                    Scaling: DXGI_SCALING_STRETCH,
                    SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
                    AlphaMode: DXGI_ALPHA_MODE_IGNORE,
                    Flags: 0,
                };
                let swapchain = factory
                    .CreateSwapChainForHwnd(&device, hwnd, &sc_desc, None, None)
                    .map_err(|e| format!("CreateSwapChainForHwnd: {e}"))?;

                let backbuf: ID3D11Texture2D = swapchain
                    .GetBuffer(0)
                    .map_err(|e| format!("SwapChain GetBuffer: {e}"))?;
                let mut rtv: Option<ID3D11RenderTargetView> = None;
                device
                    .CreateRenderTargetView(&backbuf, None, Some(&mut rtv))
                    .map_err(|e| format!("CreateRTV: {e}"))?;
                let rtv = rtv.ok_or_else(|| "RTV nulo".to_string())?;

                // GPU-only copy texture for acquired desktop frames
                let copy_desc = D3D11_TEXTURE2D_DESC {
                    Width: width,
                    Height: height,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_DEFAULT,
                    BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                    CPUAccessFlags: 0,
                    MiscFlags: 0,
                };
                let mut copy_tex: Option<ID3D11Texture2D> = None;
                device
                    .CreateTexture2D(&copy_desc, None, Some(&mut copy_tex))
                    .map_err(|e| format!("CreateTexture2D copy: {e}"))?;
                let copy_tex = copy_tex.ok_or_else(|| "copy_tex nulo".to_string())?;
                let mut copy_srv: Option<ID3D11ShaderResourceView> = None;
                device
                    .CreateShaderResourceView(&copy_tex, None, Some(&mut copy_srv))
                    .map_err(|e| format!("CreateSRV copy: {e}"))?;
                let copy_srv = copy_srv.ok_or_else(|| "copy_srv nulo".to_string())?;

                // #10 Temporal history texture (previous frame)
                let mut prev_tex: Option<ID3D11Texture2D> = None;
                device
                    .CreateTexture2D(&copy_desc, None, Some(&mut prev_tex))
                    .map_err(|e| format!("CreateTexture2D prev: {e}"))?;
                let prev_tex = prev_tex.ok_or_else(|| "prev_tex nulo".to_string())?;
                let mut prev_srv: Option<ID3D11ShaderResourceView> = None;
                device
                    .CreateShaderResourceView(&prev_tex, None, Some(&mut prev_srv))
                    .map_err(|e| format!("CreateSRV prev: {e}"))?;
                let prev_srv = prev_srv.ok_or_else(|| "prev_srv nulo".to_string())?;

                // #1 Dual-Kawase Pyramidal Bloom RTs (W/2 x H/2 and W/4 x H/4)
                let make_rt = |w: u32, h: u32| -> Result<(ID3D11RenderTargetView, ID3D11ShaderResourceView), String> {
                    let d = D3D11_TEXTURE2D_DESC {
                        Width: w.max(1),
                        Height: h.max(1),
                        MipLevels: 1,
                        ArraySize: 1,
                        Format: DXGI_FORMAT_R16G16B16A16_FLOAT,
                        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                        Usage: D3D11_USAGE_DEFAULT,
                        BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
                        CPUAccessFlags: 0,
                        MiscFlags: 0,
                    };
                    let mut t: Option<ID3D11Texture2D> = None;
                    device.CreateTexture2D(&d, None, Some(&mut t)).map_err(|e| format!("CreateRT tex: {e}"))?;
                    let t = t.ok_or_else(|| "RT tex nulo".to_string())?;
                    let mut r: Option<ID3D11RenderTargetView> = None;
                    device.CreateRenderTargetView(&t, None, Some(&mut r)).map_err(|e| format!("CreateRTV bloom: {e}"))?;
                    let mut s: Option<ID3D11ShaderResourceView> = None;
                    device.CreateShaderResourceView(&t, None, Some(&mut s)).map_err(|e| format!("CreateSRV bloom: {e}"))?;
                    Ok((r.unwrap(), s.unwrap()))
                };
                let (bloom_rt1, bloom_srv1) = make_rt(width / 2, height / 2)?;
                let (bloom_rt2, bloom_srv2) = make_rt(width / 4, height / 4)?;
                let (rad_rt1, rad_srv1) = make_rt(width / 8, height / 8)?;
                let (rad_rt2, rad_srv2) = make_rt(width / 32, height / 32)?;
                let (accum_rt0, accum_srv0) = make_rt(width, height)?;
                let (accum_rt1, accum_srv1) = make_rt(width, height)?;

                // Compile & create HLSL shaders
                let vs_bytes = compile_shader(s!("VSMain"), s!("vs_5_0"))?;
                let ps_bytes = compile_shader(s!("PSMain"), s!("ps_5_0"))?;
                let ps_be_bytes = compile_shader(s!("PSBloomExtract"), s!("ps_5_0"))?;
                let ps_bb_bytes = compile_shader(s!("PSBloomBlur"), s!("ps_5_0"))?;
                let ps_rd_bytes = compile_shader(s!("PSRadianceDown"), s!("ps_5_0"))?;
                let ps_rw_bytes = compile_shader(s!("PSRadianceWide"), s!("ps_5_0"))?;
                let ps_acc_bytes = compile_shader(s!("PSAccum"), s!("ps_5_0"))?;
                let mut vs: Option<ID3D11VertexShader> = None;
                device
                    .CreateVertexShader(&vs_bytes, None, Some(&mut vs))
                    .map_err(|e| format!("CreateVS: {e}"))?;
                let vs = vs.ok_or_else(|| "VS nulo".to_string())?;
                let mut ps: Option<ID3D11PixelShader> = None;
                device
                    .CreatePixelShader(&ps_bytes, None, Some(&mut ps))
                    .map_err(|e| format!("CreatePS: {e}"))?;
                let ps = ps.ok_or_else(|| "PS nulo".to_string())?;
                let mut ps_bloom_extract: Option<ID3D11PixelShader> = None;
                device
                    .CreatePixelShader(&ps_be_bytes, None, Some(&mut ps_bloom_extract))
                    .map_err(|e| format!("CreatePSBloomExtract: {e}"))?;
                let ps_bloom_extract = ps_bloom_extract.ok_or_else(|| "ps_bloom_extract nulo".to_string())?;
                let mut ps_bloom_blur: Option<ID3D11PixelShader> = None;
                device
                    .CreatePixelShader(&ps_bb_bytes, None, Some(&mut ps_bloom_blur))
                    .map_err(|e| format!("CreatePSBloomBlur: {e}"))?;
                let ps_bloom_blur = ps_bloom_blur.ok_or_else(|| "ps_bloom_blur nulo".to_string())?;
                let mut ps_rad_down: Option<ID3D11PixelShader> = None;
                device
                    .CreatePixelShader(&ps_rd_bytes, None, Some(&mut ps_rad_down))
                    .map_err(|e| format!("CreatePSRadDown: {e}"))?;
                let ps_rad_down = ps_rad_down.ok_or_else(|| "ps_rad_down nulo".to_string())?;
                let mut ps_rad_wide: Option<ID3D11PixelShader> = None;
                device
                    .CreatePixelShader(&ps_rw_bytes, None, Some(&mut ps_rad_wide))
                    .map_err(|e| format!("CreatePSRadWide: {e}"))?;
                let ps_rad_wide = ps_rad_wide.ok_or_else(|| "ps_rad_wide nulo".to_string())?;
                let mut ps_accum: Option<ID3D11PixelShader> = None;
                device
                    .CreatePixelShader(&ps_acc_bytes, None, Some(&mut ps_accum))
                    .map_err(|e| format!("CreatePSAccum: {e}"))?;
                let ps_accum = ps_accum.ok_or_else(|| "ps_accum nulo".to_string())?;

                let samp_desc = D3D11_SAMPLER_DESC {
                    Filter: D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                    AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                    ComparisonFunc: D3D11_COMPARISON_NEVER,
                    MinLOD: 0.0,
                    MaxLOD: D3D11_FLOAT32_MAX,
                    ..Default::default()
                };
                let mut sampler: Option<ID3D11SamplerState> = None;
                device
                    .CreateSamplerState(&samp_desc, Some(&mut sampler))
                    .map_err(|e| format!("CreateSamplerState: {e}"))?;
                let sampler = sampler.ok_or_else(|| "Sampler nulo".to_string())?;

                let cb_desc = D3D11_BUFFER_DESC {
                    ByteWidth: std::mem::size_of::<FxCBuffer>() as u32,
                    Usage: D3D11_USAGE_DYNAMIC,
                    BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
                    CPUAccessFlags: D3D11_CPU_ACCESS_WRITE.0 as u32,
                    MiscFlags: 0,
                    StructureByteStride: 0,
                };
                let mut cbuffer: Option<ID3D11Buffer> = None;
                device
                    .CreateBuffer(&cb_desc, None, Some(&mut cbuffer))
                    .map_err(|e| format!("CreateBuffer CB: {e}"))?;
                let cbuffer = cbuffer.ok_or_else(|| "CBuffer nulo".to_string())?;

                // Tiny 16x16 staging texture for flicker-free temporally-smoothed Auto-Exposure metering
                let meter_desc = D3D11_TEXTURE2D_DESC {
                    Width: 16,
                    Height: 16,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                    MiscFlags: 0,
                };
                let mut meter_staging: Option<ID3D11Texture2D> = None;
                device
                    .CreateTexture2D(&meter_desc, None, Some(&mut meter_staging))
                    .map_err(|e| format!("CreateTexture2D meter: {e}"))?;
                let meter_staging = meter_staging.ok_or_else(|| "meter_staging nulo".to_string())?;

                Ok(Self {
                    hwnd,
                    rect,
                    device,
                    ctx,
                    swapchain,
                    rtv,
                    dupl,
                    copy_tex,
                    copy_srv,
                    prev_tex,
                    prev_srv,
                    has_prev_frame: false,
                    accum_rt: [accum_rt0, accum_rt1],
                    accum_srv: [accum_srv0, accum_srv1],
                    accum_idx: 0,
                    has_accum: false,
                    ps_accum,
                    bloom_rt1,
                    bloom_srv1,
                    bloom_rt2,
                    bloom_srv2,
                    ps_bloom_extract,
                    ps_bloom_blur,
                    rad_rt1,
                    rad_srv1,
                    rad_rt2,
                    rad_srv2,
                    ps_rad_down,
                    ps_rad_wide,
                    vs,
                    ps,
                    sampler,
                    cbuffer,
                    lut_srv: None,
                    lut_ver: 0,
                    meter_staging,
                    last_cutout: None,
                })
            }
        }

        fn destroy(self) {
            unsafe {
                let _ = ShowWindow(self.hwnd, SW_HIDE);
                let _ = DestroyWindow(self.hwnd);
            }
        }
    }

    pub fn run_fx_loop(
        params: Arc<Mutex<NativeFxParams>>,
        lut_store: Arc<Mutex<Option<ParsedCubeLut>>>,
        status: Arc<Mutex<NativeFxStatus>>,
        overlay_hwnd: Arc<Mutex<isize>>,
        companion_hwnd: Arc<Mutex<isize>>,
        shared: Arc<crate::engine::Shared>,
    ) {
        let mut pipe: Option<ActivePipeline> = None;
        let start = Instant::now();
        let mut fps_timer = Instant::now();
        let mut frames = 0u32;
        let mut z_sync_counter = 0u32;
        let mut smooth_gx = 0.0f32;
        let mut smooth_gy = 0.0f32;
        let mut smooth_auto_ev = 0.0f32;
        let mut target_auto_ev = 0.0f32;
        let mut smooth_luma = 0.42f32;
        let mut meter_tick = 0u32;

        loop {
            let p = params.lock().map(|g| g.clone()).unwrap_or_default();
            let (in_realtime, speed_kmh, brake, throttle, on_kerb, g_lat, g_long, rpm_frac, tod_sec, raining, track_temp) = {
                let snap = shared.latest.read().ok();
                if let Some(s) = snap {
                    let rt = s.connected && s.in_realtime;
                    let tod = s.session.time_of_day as f32;
                    let rain = s.session.weather.raining as f32;
                    let t_temp = s.session.weather.track_temp as f32;
                    if let Some(pl) = &s.player {
                        let spd = (pl.speed as f32) * 3.6;
                        let kerb = spd > 50.0 && pl.wheels.iter().any(|w| w.surface_type > 0);
                        let rpm_f = if pl.max_rpm > 100.0 {
                            ((pl.rpm / pl.max_rpm) as f32).clamp(0.0, 1.0)
                        } else {
                            0.0
                        };
                        (rt, spd, pl.brake as f32, pl.throttle as f32, kerb, pl.g_lat as f32, pl.g_long as f32, rpm_f, tod, rain, t_temp)
                    } else {
                        (rt, 0.0f32, 0.0f32, 0.0f32, false, 0.0f32, 0.0f32, 0.0f32, tod, rain, t_temp)
                    }
                } else {
                    (false, 0.0f32, 0.0f32, 0.0f32, false, 0.0f32, 0.0f32, 0.0f32, 43200.0f32, 0.0f32, 30.0f32)
                }
            };

            let should_run = p.enabled && (!p.only_on_track || in_realtime);
            let ov_hwnd = overlay_hwnd.lock().map(|g| *g).unwrap_or(0);
            let comp_hwnd = companion_hwnd.lock().map(|g| *g).unwrap_or(0);

            if !should_run {
                if let Some(active) = pipe.take() {
                    active.destroy();
                    set_window_capture_excluded(ov_hwnd, false);
                    if let Ok(mut st) = status.lock() {
                        st.running = false;
                        st.fps = 0.0;
                    }
                }
                std::thread::sleep(Duration::from_millis(80));
                continue;
            }

            // Initialize D3D11 + DXGI pipeline when activated
            if pipe.is_none() {
                set_window_capture_excluded(ov_hwnd, true);
                match ActivePipeline::create(ov_hwnd) {
                    Ok(mut active) => {
                        sync_companion_cutout(active.hwnd, &active.rect, comp_hwnd, &mut active.last_cutout);
                        pipe = Some(active);
                        if let Ok(mut st) = status.lock() {
                            st.running = true;
                            st.last_error.clear();
                        }
                    }
                    Err(err) => {
                        set_window_capture_excluded(ov_hwnd, false);
                        if let Ok(mut st) = status.lock() {
                            st.running = false;
                            st.last_error = err;
                        }
                        std::thread::sleep(Duration::from_millis(600));
                        continue;
                    }
                }
            }

            let active = pipe.as_mut().unwrap();

            // Keep Companion window completely sharp & unaffected whenever it's focused on this monitor
            sync_companion_cutout(active.hwnd, &active.rect, comp_hwnd, &mut active.last_cutout);

            // Pump Win32 messages for our FX window so Windows never marks it unresponsive
            unsafe {
                let mut msg = MSG::default();
                while PeekMessageW(&mut msg, Some(active.hwnd), 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }

            // Periodically ensure FX window stays strictly below HUD overlay in Z-order
            z_sync_counter = z_sync_counter.wrapping_add(1);
            if z_sync_counter % 90 == 0 {
                set_window_capture_excluded(ov_hwnd, true);
                place_below_overlay(active.hwnd, ov_hwnd, &active.rect);
            }

            // Upload new custom .cube 3D LUT if changed
            if let Ok(g) = lut_store.lock() {
                if let Some(lut) = g.as_ref() {
                    if lut.version != active.lut_ver {
                        if let Ok(srv) = upload_3d_lut(&active.device, lut) {
                            active.lut_srv = Some(srv);
                            active.lut_ver = lut.version;
                        }
                    }
                } else if active.lut_srv.is_some() {
                    active.lut_srv = None;
                    active.lut_ver = 0;
                }
            }

            // Acquire next desktop frame via DXGI Desktop Duplication (16ms timeout)
            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut resource: Option<IDXGIResource> = None;
            let acq = unsafe { active.dupl.AcquireNextFrame(16, &mut frame_info, &mut resource) };

            match acq {
                Ok(()) => {
                    if let Some(res) = resource {
                        if let Ok(tex) = res.cast::<ID3D11Texture2D>() {
                            unsafe {
                                active.ctx.CopyResource(&active.copy_tex, &tex);
                            }
                        }
                    }
                    unsafe {
                        let _ = active.dupl.ReleaseFrame();
                    }
                }
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => {
                    // No new frame from monitor yet; still re-render if animated grain/shake or just sleep briefly
                }
                Err(_) => {
                    // Display mode change / access lost -> rebuild pipeline cleanly
                    if let Some(old) = pipe.take() {
                        old.destroy();
                    }
                    std::thread::sleep(Duration::from_millis(250));
                    continue;
                }
            }

            // Update HLSL Constant Buffer
            let width = (active.rect.right - active.rect.left).max(1) as f32;
            let height = (active.rect.bottom - active.rect.top).max(1) as f32;
            let brake_g = if p.gforce_vignette && brake > 0.65 && speed_kmh > 65.0 {
                ((brake - 0.6) * 0.85).clamp(0.0, 0.45)
            } else {
                0.0
            };
            // Flicker-free Auto-Exposure metering (samples a 16x16 center-sky/track patch every 8 frames + silky EMA smoothing)
            meter_tick = meter_tick.wrapping_add(1);
            if p.auto_exposure && meter_tick % 8 == 0 {
                let w_u = (active.rect.right - active.rect.left).max(64) as u32;
                let h_u = (active.rect.bottom - active.rect.top).max(64) as u32;
                let box_src = D3D11_BOX {
                    left: (w_u / 2).saturating_sub(8),
                    top: (h_u * 45 / 100).saturating_sub(8),
                    front: 0,
                    right: (w_u / 2).saturating_sub(8) + 16,
                    bottom: (h_u * 45 / 100).saturating_sub(8) + 16,
                    back: 1,
                };
                unsafe {
                    active.ctx.CopySubresourceRegion(&active.meter_staging, 0, 0, 0, 0, &active.copy_tex, 0, Some(&box_src));
                    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                    if active.ctx.Map(&active.meter_staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).is_ok() {
                        let mut sum_l = 0.0f32;
                        let pitch = mapped.RowPitch as usize;
                        let base = mapped.pData as *const u8;
                        for row in 0..16usize {
                            let row_ptr = base.add(row * pitch);
                            for col_i in 0..16usize {
                                let b = *row_ptr.add(col_i * 4) as f32 / 255.0;
                                let g = *row_ptr.add(col_i * 4 + 1) as f32 / 255.0;
                                let r = *row_ptr.add(col_i * 4 + 2) as f32 / 255.0;
                                sum_l += 0.2126 * r + 0.7152 * g + 0.0722 * b;
                            }
                        }
                        active.ctx.Unmap(&active.meter_staging, 0);
                        let avg_l = sum_l / 256.0;
                        // Pre-filter luminance with strong inertia so a single passing car/gantry NEVER triggers a flash!
                        smooth_luma += (avg_l - smooth_luma) * 0.14;
                        let diff = 0.42 - smooth_luma;
                        // Wide deadzone (±0.05) + gentle cinema iris range (-0.22..+0.24 EV)
                        target_auto_ev = if diff.abs() < 0.05 {
                            0.0
                        } else {
                            let signed = if diff > 0.0 { diff - 0.05 } else { diff + 0.05 };
                            (signed * 0.58).clamp(-0.22, 0.24)
                        };
                    }
                }
            } else if !p.auto_exposure {
                target_auto_ev = 0.0;
            }
            // Cinema-grade iris adaptation with strict per-frame slew limiter (ZERO flashes!)
            let iris_speed = p.auto_exposure_speed.clamp(0.05, 1.0);
            let ema_alpha = 0.004 + iris_speed * 0.020;
            let max_step = 0.0005 + iris_speed * 0.0022;
            let raw_delta = (target_auto_ev - smooth_auto_ev) * ema_alpha;
            smooth_auto_ev += raw_delta.clamp(-max_step, max_step);

            let shake_scale = p.camera_shake_intensity.clamp(0.05, 2.5);
            let shake_amt = if p.camera_shake {
                if on_kerb {
                    // Realistic rollcage kerb impact (~2.4 px at 1440p @ 100%, ~1.4 px @ 60%)
                    (0.0017 * shake_scale).clamp(0.0, 0.0048)
                } else if speed_kmh > 275.0 {
                    // Subtle high-speed aero buffeting (~0.7 px at 1440p @ 100%)
                    (0.0005 * shake_scale).clamp(0.0, 0.0016)
                } else {
                    0.0
                }
            } else {
                0.0
            };
            // #9 Realistic fine high-frequency RPM camera-mount vibration (~1.1 px at redline @ 100%, ZERO dizzying bounce)
            let rpm_scale = p.rpm_vibration_intensity.clamp(0.05, 2.5);
            let rpm_vib_amt = if p.rpm_vibration && rpm_frac > 0.45 {
                let rev_curve = ((rpm_frac - 0.45) / 0.55).clamp(0.0, 1.0);
                let load = 0.55 + 0.45 * throttle.clamp(0.0, 1.0);
                let redline_boost = if rpm_frac > 0.86 { 1.30 } else { 1.0 };
                (rev_curve * rev_curve * 0.00085 * load * redline_boost * rpm_scale).clamp(0.0, 0.0028)
            } else {
                0.0
            };
            // #9 G-Force smooth optical shift
            let target_gx = if p.gforce_shift {
                (g_lat * 0.0045).clamp(-0.016, 0.016)
            } else {
                0.0
            };
            let target_gy = if p.gforce_shift {
                (-g_long * 0.0035).clamp(-0.012, 0.012)
            } else {
                0.0
            };
            smooth_gx += (target_gx - smooth_gx) * 0.16;
            smooth_gy += (target_gy - smooth_gy) * 0.16;

            // #10 Auto Day -> Dusk -> Night -> Rain dynamic look adaptation
            let mut eff_warmth = p.warmth;
            let mut eff_contrast = p.contrast;
            let mut eff_bloom = p.bloom;
            let mut eff_flare = p.anamorphic_flare;
            let mut eff_clarity = p.clarity;
            if p.auto_weather_time_fx {
                let is_night = tod_sec >= 73800.0 || tod_sec < 19800.0;
                let is_dusk = (tod_sec >= 66600.0 && tod_sec < 73800.0) || (tod_sec >= 19800.0 && tod_sec < 25200.0);
                if is_night {
                    eff_warmth -= 0.18;
                    eff_contrast += 0.08;
                    eff_bloom = (eff_bloom + 0.25).min(1.0);
                    eff_flare = (eff_flare + 0.18).min(1.0);
                } else if is_dusk {
                    eff_warmth += 0.22;
                    eff_bloom = (eff_bloom + 0.16).min(1.0);
                    eff_flare = (eff_flare + 0.10).min(1.0);
                }
                if raining > 0.06 {
                    let rf = raining.clamp(0.0, 1.0);
                    eff_warmth -= 0.16 * rf;
                    eff_clarity = (eff_clarity + 0.16 * rf).min(1.0);
                    eff_bloom = (eff_bloom + 0.18 * rf).min(1.0);
                }
            }

            let cb = FxCBuffer {
                resolution: [width, height],
                time_sec: start.elapsed().as_secs_f32(),
                speed_kmh,
                contrast: eff_contrast,
                saturation: p.saturation,
                vibrance: p.vibrance,
                brightness: p.brightness,
                exposure: p.exposure,
                warmth: eff_warmth,
                tint: p.tint,
                aces_tonemap: p.aces_tonemap,
                cas_sharpen: p.cas_sharpen,
                chromatic_aberration: p.chromatic_aberration,
                speed_blur: p.speed_blur,
                vignette: p.vignette,
                film_grain: p.film_grain,
                scanlines: p.scanlines,
                lut_strength: p.lut_strength,
                lut_preset: p.lut_preset as f32,
                brake_g,
                shake_amt,
                has_custom_lut: if active.lut_srv.is_some() { 1.0 } else { 0.0 },
                speed_vignette: if p.speed_vignette { 1.0 } else { 0.0 },
                bloom: eff_bloom,
                halation: p.halation,
                lens_distortion: p.lens_distortion,
                clarity: eff_clarity,
                dehaze: p.dehaze,
                anamorphic_flare: eff_flare,
                lift: p.lift,
                gamma: p.gamma,
                gain: p.gain,
                auto_exposure: if p.auto_exposure { 1.0 } else { 0.0 },
                g_shift_x: smooth_gx,
                g_shift_y: smooth_gy,
                agx_tonemap: p.agx_tonemap,
                gi_bounce: p.gi_bounce,
                pro_mist: p.pro_mist,
                local_hdr: p.local_hdr,
                highlight_rolloff: p.highlight_rolloff,
                split_shadow_cool: p.split_shadow_cool,
                split_highlight_warm: p.split_highlight_warm,
                shadow_depth: p.shadow_depth,
                split_screen: p.split_screen,
                auto_ev_smooth: smooth_auto_ev,
                rpm_vib_amt,
                track_temp,
                pyramidal_bloom: p.pyramidal_bloom,
                grass_realism: p.grass_realism,
                sky_realism: p.sky_realism,
                sun_god_rays: p.sun_god_rays,
                film_35mm: p.film_35mm,
                heat_haze: p.heat_haze,
                temporal_motion_blur: p.temporal_motion_blur,
                has_prev_frame: if active.has_prev_frame { 1.0 } else { 0.0 },
                lumen_gi: p.lumen_gi,
                lumen_sky_bounce: p.lumen_sky_bounce,
                linear_color_space: if p.linear_color_space { 1.0 } else { 0.0 },
                color_space: p.color_space as f32,
                color_space_strength: p.color_space_strength,
                taa_antialias: p.taa_antialias,
                performance_mode: if p.performance_mode { 1.0 } else { 0.0 },
                fxaa_antialias: p.fxaa_antialias,
                cinematic_dof: p.cinematic_dof,
                dof_focus: p.dof_focus,
                long_exposure: p.long_exposure,
                has_accum: if active.has_accum { 1.0 } else { 0.0 },
                starburst: p.starburst,
                dirty_lens: p.dirty_lens,
                broadcast_sensor: p.broadcast_sensor,
                wet_reflections: p.wet_reflections,
                deband: p.deband,
                rain_amount: raining.clamp(0.0, 1.0),
                surface_blur: p.surface_blur,
                dpx_film: p.dpx_film,
                vhs_rf: p.vhs_rf,
                _pad2: 0.0,
                _pad3: 0.0,
                _pad4: 0.0,
            };

            unsafe {
                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                if active
                    .ctx
                    .Map(&active.cbuffer, 0, D3D11_MAP_WRITE_DISCARD, 0, Some(&mut mapped))
                    .is_ok()
                {
                    std::ptr::copy_nonoverlapping(&cb, mapped.pData as *mut FxCBuffer, 1);
                    active.ctx.Unmap(&active.cbuffer, 0);
                }

                active.ctx.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
                active.ctx.VSSetShader(&active.vs, None);
                active.ctx.PSSetSamplers(0, Some(&[Some(active.sampler.clone())]));
                active.ctx.PSSetConstantBuffers(0, Some(&[Some(active.cbuffer.clone())]));

                // RealLongExposure / Camera Shutter accumulation pass (skipped in Performance Mode)
                if !p.performance_mode && p.long_exposure > 0.001 {
                    let read_idx = active.accum_idx;
                    let write_idx = 1 - read_idx;
                    let vp_acc = D3D11_VIEWPORT {
                        TopLeftX: 0.0,
                        TopLeftY: 0.0,
                        Width: width,
                        Height: height,
                        MinDepth: 0.0,
                        MaxDepth: 1.0,
                    };
                    active.ctx.PSSetShaderResources(0, Some(&[None, None, None, None, None, None, None]));
                    active.ctx.RSSetViewports(Some(&[vp_acc]));
                    active.ctx.OMSetRenderTargets(Some(&[Some(active.accum_rt[write_idx].clone())]), None);
                    active.ctx.PSSetShader(&active.ps_accum, None);
                    active.ctx.PSSetShaderResources(
                        0,
                        Some(&[
                            Some(active.copy_srv.clone()),
                            None,
                            None,
                            None,
                            None,
                            None,
                            Some(active.accum_srv[read_idx].clone()),
                        ]),
                    );
                    active.ctx.Draw(3, 0);
                    active.accum_idx = write_idx;
                    active.has_accum = true;
                } else {
                    active.has_accum = false;
                }

                // #1 Multi-Pass Dual-Kawase Pyramidal Bloom (skipped in Performance Mode)
                if !p.performance_mode && p.pyramidal_bloom > 0.001 {
                    let vp1 = D3D11_VIEWPORT {
                        TopLeftX: 0.0,
                        TopLeftY: 0.0,
                        Width: (width * 0.5).max(1.0),
                        Height: (height * 0.5).max(1.0),
                        MinDepth: 0.0,
                        MaxDepth: 1.0,
                    };
                    active.ctx.PSSetShaderResources(0, Some(&[None, None, None, None, None, None, None]));
                    active.ctx.RSSetViewports(Some(&[vp1]));
                    active.ctx.OMSetRenderTargets(Some(&[Some(active.bloom_rt1.clone())]), None);
                    active.ctx.PSSetShader(&active.ps_bloom_extract, None);
                    active.ctx.PSSetShaderResources(0, Some(&[Some(active.copy_srv.clone())]));
                    active.ctx.Draw(3, 0);

                    let vp2 = D3D11_VIEWPORT {
                        TopLeftX: 0.0,
                        TopLeftY: 0.0,
                        Width: (width * 0.25).max(1.0),
                        Height: (height * 0.25).max(1.0),
                        MinDepth: 0.0,
                        MaxDepth: 1.0,
                    };
                    active.ctx.PSSetShaderResources(0, Some(&[None, None, None, None, None, None, None]));
                    active.ctx.RSSetViewports(Some(&[vp2]));
                    active.ctx.OMSetRenderTargets(Some(&[Some(active.bloom_rt2.clone())]), None);
                    active.ctx.PSSetShader(&active.ps_bloom_blur, None);
                    active.ctx.PSSetShaderResources(0, Some(&[Some(active.bloom_srv1.clone())]));
                    active.ctx.Draw(3, 0);
                }

                // 🌟 Lumen-Style Multi-Scale Radiance Pyramid (skipped in Performance Mode)
                if !p.performance_mode && (p.lumen_gi > 0.001 || p.lumen_sky_bounce > 0.001) {
                    let vpr1 = D3D11_VIEWPORT {
                        TopLeftX: 0.0,
                        TopLeftY: 0.0,
                        Width: (width / 8.0).max(1.0),
                        Height: (height / 8.0).max(1.0),
                        MinDepth: 0.0,
                        MaxDepth: 1.0,
                    };
                    active.ctx.PSSetShaderResources(0, Some(&[None, None, None, None, None, None, None]));
                    active.ctx.RSSetViewports(Some(&[vpr1]));
                    active.ctx.OMSetRenderTargets(Some(&[Some(active.rad_rt1.clone())]), None);
                    active.ctx.PSSetShader(&active.ps_rad_down, None);
                    active.ctx.PSSetShaderResources(0, Some(&[Some(active.copy_srv.clone())]));
                    active.ctx.Draw(3, 0);

                    let vpr2 = D3D11_VIEWPORT {
                        TopLeftX: 0.0,
                        TopLeftY: 0.0,
                        Width: (width / 32.0).max(1.0),
                        Height: (height / 32.0).max(1.0),
                        MinDepth: 0.0,
                        MaxDepth: 1.0,
                    };
                    active.ctx.PSSetShaderResources(0, Some(&[None, None, None, None, None, None, None]));
                    active.ctx.RSSetViewports(Some(&[vpr2]));
                    active.ctx.OMSetRenderTargets(Some(&[Some(active.rad_rt2.clone())]), None);
                    active.ctx.PSSetShader(&active.ps_rad_wide, None);
                    active.ctx.PSSetShaderResources(0, Some(&[Some(active.rad_srv1.clone())]));
                    active.ctx.Draw(3, 0);
                }

                // Final Main Pass (Single-pass ultra-fast GPU path in Performance Mode!)
                let vp = D3D11_VIEWPORT {
                    TopLeftX: 0.0,
                    TopLeftY: 0.0,
                    Width: width,
                    Height: height,
                    MinDepth: 0.0,
                    MaxDepth: 1.0,
                };
                active.ctx.PSSetShaderResources(0, Some(&[None, None, None, None, None, None, None]));
                active.ctx.RSSetViewports(Some(&[vp]));
                active.ctx.OMSetRenderTargets(Some(&[Some(active.rtv.clone())]), None);
                active.ctx.PSSetShader(&active.ps, None);
                active.ctx.PSSetShaderResources(
                    0,
                    Some(&[
                        Some(active.copy_srv.clone()),
                        active.lut_srv.clone(),
                        Some(active.bloom_srv2.clone()),
                        Some(active.prev_srv.clone()),
                        Some(active.rad_srv1.clone()),
                        Some(active.rad_srv2.clone()),
                        Some(active.accum_srv[active.accum_idx].clone()),
                    ]),
                );
                active.ctx.Draw(3, 0);
                let _ = active.swapchain.Present(1, DXGI_PRESENT(0));

                // Save current frame into prev_tex ONLY when Temporal Motion Blur or Smart TAA is active (skipped in Performance Mode)
                if !p.performance_mode && (p.temporal_motion_blur > 0.001 || p.taa_antialias > 0.001) {
                    active.ctx.CopyResource(&active.prev_tex, &active.copy_tex);
                    active.has_prev_frame = true;
                } else {
                    active.has_prev_frame = false;
                }
            }

            frames += 1;
            if fps_timer.elapsed() >= Duration::from_secs(1) {
                let fps = frames as f32 / fps_timer.elapsed().as_secs_f32();
                frames = 0;
                fps_timer = Instant::now();
                if let Ok(mut st) = status.lock() {
                    st.fps = (fps * 10.0).round() / 10.0;
                    st.running = true;
                }
            }
        }
    }
}
