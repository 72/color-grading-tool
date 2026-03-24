// ═══════════════════════════════════════════════════════════════════════════════
// CineGrade — WGSL Cinematic Color Grading Pipeline
//
// A single-pass fragment shader implementing a professional color grading
// pipeline: linearize → exposure → contrast → black point → highlight rolloff
// → tone curves → color wheels → HSL targeting → saturation → grain → output.
//
// Designed for real-time preview on WebGPU with per-tile uniform buffers.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Uniform buffer: tightly packed as vec4s for alignment ────────────────────

struct GradeParams {
  // .x = exposure_bias, .y = contrast_ratio, .z = black_point, .w = global_saturation
  exposure : vec4<f32>,
  // .xyz = hue RGB (pre-computed on CPU), .w = saturation_intensity
  lift_color  : vec4<f32>,
  gamma_color : vec4<f32>,
  gain_color  : vec4<f32>,
  // .x = lift_lum, .y = gamma_lum, .z = gain_lum, .w = grain_amount (0–24)
  luminances : vec4<f32>,
  // .x = bloom (reserved), .y = curves_enabled (0/1), .z = hsl_count (0–6), .w = frame_seed
  effects : vec4<f32>,
  // 6 HSL qualifiers × 2 vec4 each = 12 vec4s
  // Even indices [0,2,4,6,8,10]: (target_hue, hue_range, hue_shift, sat_scale)
  // Odd indices  [1,3,5,7,9,11]: (lum_offset, softness, 0, 0)
  hsl : array<vec4<f32>, 12>,
};

@group(0) @binding(0) var source_tex     : texture_2d<f32>;
@group(0) @binding(1) var source_sampler : sampler;
@group(0) @binding(2) var<uniform> params : GradeParams;
@group(0) @binding(3) var<storage, read> tone_curves : array<f32>; // 1024 entries

// ── Vertex stage: fullscreen triangle ────────────────────────────────────────

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid : u32) -> VertexOutput {
  // Over-sized triangle that covers clip space [-1,1]
  let x = f32(i32(vid) / 2) * 4.0 - 1.0;
  let y = f32(i32(vid) & 1) * 4.0 - 1.0;
  var out : VertexOutput;
  out.position = vec4<f32>(x, y, 0.0, 1.0);
  // UV: 0→1 across the quad, Y flipped so (0,0) = top-left of texture
  out.uv = vec2<f32>((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

// ── Colour math helpers ─────────────────────────────────────────────────────

const PIVOT : f32 = 0.18;           // 18% middle gray
const REC709_LUMA = vec3<f32>(0.2126, 0.7152, 0.0722);
const WHEEL_SCALE : f32 = 1.1;      // subtle professional intensity

fn srgb_to_linear(c : vec3<f32>) -> vec3<f32> {
  return pow(max(c, vec3<f32>(0.0)), vec3<f32>(2.2));
}

fn linear_to_srgb(c : vec3<f32>) -> vec3<f32> {
  return pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}

/// Smooth, overlapping tonal weights (shadow / midtone / highlight).
/// Uses power functions for cinematographic transitions.
fn tonal_weights(luma : f32) -> vec3<f32> {
  let shadow    = pow(max(0.0, 1.0 - luma / 0.7), 2.0);
  let highlight = pow(max(0.0, (luma - 0.3) / 0.7), 2.0);
  let midtone   = max(0.0, 1.0 - shadow - highlight);
  return vec3<f32>(shadow, midtone, highlight);
}

/// Filmic highlight roll-off (soft-knee compression above 0.8).
fn rolloff(v : f32) -> f32 {
  if (v > 0.8) {
    return 0.8 + (1.0 - exp(-(v - 0.8) * 2.0)) * 0.2;
  }
  return v;
}

// ── Tone curve LUT sampling with linear interpolation ────────────────────────

fn sample_curve(channel_offset : u32, value : f32) -> f32 {
  let scaled = clamp(value, 0.0, 1.0) * 255.0;
  let lo = u32(floor(scaled));
  let hi = min(lo + 1u, 255u);
  let t  = fract(scaled);
  return mix(tone_curves[channel_offset + lo], tone_curves[channel_offset + hi], t);
}

// ── RGB ↔ HSL conversion ────────────────────────────────────────────────────

fn rgb_to_hsl(rgb : vec3<f32>) -> vec3<f32> {
  let cmax = max(rgb.r, max(rgb.g, rgb.b));
  let cmin = min(rgb.r, min(rgb.g, rgb.b));
  let delta = cmax - cmin;
  let L = (cmax + cmin) * 0.5;

  if (delta < 1e-6) {
    return vec3<f32>(0.0, 0.0, L);
  }

  let S = select(
    delta / (2.0 - cmax - cmin),
    delta / (cmax + cmin),
    L < 0.5
  );

  var H : f32;
  if (cmax == rgb.r) {
    H = (rgb.g - rgb.b) / delta;
    if (H < 0.0) { H += 6.0; }
  } else if (cmax == rgb.g) {
    H = (rgb.b - rgb.r) / delta + 2.0;
  } else {
    H = (rgb.r - rgb.g) / delta + 4.0;
  }
  H *= 60.0;

  return vec3<f32>(H, S, L);
}

fn hue_to_channel(p : f32, q : f32, t_in : f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5)        { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl_to_rgb(hsl : vec3<f32>) -> vec3<f32> {
  let H = hsl.x;
  let S = hsl.y;
  let L = hsl.z;

  if (S < 1e-6) {
    return vec3<f32>(L, L, L);
  }

  let q = select(L + S - L * S, L * (1.0 + S), L < 0.5);
  let p = 2.0 * L - q;
  let h_norm = H / 360.0;

  return vec3<f32>(
    hue_to_channel(p, q, h_norm + 1.0 / 3.0),
    hue_to_channel(p, q, h_norm),
    hue_to_channel(p, q, h_norm - 1.0 / 3.0),
  );
}

// ── Procedural film grain (gold noise) ──────────────────────────────────────

fn gold_noise(uv : vec2<f32>, seed : f32) -> f32 {
  let PHI = 1.6180339887;
  return fract(tan(distance(uv * PHI, uv) * seed) * uv.x);
}

// ── Angular distance on the hue wheel (0–180°) ─────────────────────────────

fn hue_distance(a : f32, b : f32) -> f32 {
  let d = abs(a - b);
  return min(d, 360.0 - d);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FRAGMENT MAIN — full grading pipeline
// ═══════════════════════════════════════════════════════════════════════════════

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  let src = textureSample(source_tex, source_sampler, in.uv);
  var rgb = src.rgb;

  // ── 1. Linearize (sRGB → linear) ──────────────────────────────────────────
  rgb = srgb_to_linear(rgb);

  // ── 2. Exposure (EV stops) ────────────────────────────────────────────────
  let ev_factor = pow(2.0, params.exposure.x);
  rgb *= ev_factor;

  // ── 3. Contrast (power-pivot at 18% gray) ────────────────────────────────
  let contrast = params.exposure.y;
  if (contrast != 1.0) {
    rgb = pow(max(vec3<f32>(1e-6), rgb / PIVOT), vec3<f32>(contrast)) * PIVOT;
  }

  // ── 4. Black point / shadow lift ──────────────────────────────────────────
  let bp = params.exposure.z;
  if (bp > 0.0) {
    let lift_factor = bp * 0.5;
    rgb += lift_factor * pow(max(vec3<f32>(0.0), 1.0 - rgb), vec3<f32>(4.0));
  } else if (bp < 0.0) {
    rgb = max(vec3<f32>(0.0), rgb + bp);
  }

  // ── 5. Highlight roll-off (filmic soft-knee) ─────────────────────────────
  rgb = vec3<f32>(rolloff(rgb.r), rolloff(rgb.g), rolloff(rgb.b));

  // ── 6. Tone curves ────────────────────────────────────────────────────────
  if (params.effects.y > 0.5) {
    // Clamp to [0,1] for LUT sampling (linear space)
    let clamped = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // Master curve (indices 0–255)
    var curved = vec3<f32>(
      sample_curve(0u,   clamped.r),
      sample_curve(0u,   clamped.g),
      sample_curve(0u,   clamped.b),
    );

    // Per-channel curves (R: 256–511, G: 512–767, B: 768–1023)
    curved = vec3<f32>(
      sample_curve(256u, curved.r),
      sample_curve(512u, curved.g),
      sample_curve(768u, curved.b),
    );

    rgb = curved;
  }

  // ── 7. Colour wheels (Lift / Gamma / Gain) ────────────────────────────────
  let luma = dot(rgb, REC709_LUMA);
  let tw   = tonal_weights(min(luma, 1.0));

  // Lift (shadows)
  let lift_tint = (params.lift_color.rgb - 0.5) * params.lift_color.w * WHEEL_SCALE;
  rgb += lift_tint * tw.x + params.luminances.x * tw.x;

  // Gamma (midtones)
  let gamma_tint = (params.gamma_color.rgb - 0.5) * params.gamma_color.w * WHEEL_SCALE;
  rgb += gamma_tint * tw.y + params.luminances.y * tw.y;

  // Gain (highlights)
  let gain_tint = (params.gain_color.rgb - 0.5) * params.gain_color.w * WHEEL_SCALE;
  rgb += gain_tint * tw.z + params.luminances.z * tw.z;

  // ── 8. HSL targeting ──────────────────────────────────────────────────────
  let hsl_count = u32(params.effects.z);
  if (hsl_count > 0u) {
    // Work in HSL space — values clamped to avoid artefacts
    var hsl = rgb_to_hsl(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)));

    for (var i = 0u; i < hsl_count; i++) {
      let a = params.hsl[i * 2u];       // (target_hue, hue_range, hue_shift, sat_scale)
      let b = params.hsl[i * 2u + 1u];  // (lum_offset, softness, _, _)

      let tgt_hue  = a.x;
      let range    = a.y;
      let shift    = a.z;
      let sat_mult = a.w;
      let lum_off  = b.x;
      let softness = max(b.y, 1.0);

      // Smooth hue window with cosine falloff
      let dist = hue_distance(hsl.x, tgt_hue);
      let half_range = range * 0.5;
      if (dist < half_range + softness) {
        var weight : f32;
        if (dist < half_range) {
          weight = 1.0;
        } else {
          weight = 1.0 - smoothstep(half_range, half_range + softness, dist);
        }
        hsl.x = hsl.x + shift * weight;
        hsl.y = clamp(hsl.y * mix(1.0, sat_mult, weight), 0.0, 1.0);
        hsl.z = clamp(hsl.z + lum_off * weight, 0.0, 1.0);
      }
    }

    // Wrap hue
    hsl.x = ((hsl.x % 360.0) + 360.0) % 360.0;
    rgb = hsl_to_rgb(hsl);
  }

  // ── 9. Global saturation ──────────────────────────────────────────────────
  let luma_final = dot(rgb, REC709_LUMA);
  let sat = params.exposure.w;
  rgb = vec3<f32>(luma_final) + (rgb - luma_final) * sat;

  // ── 10. Delinearize (linear → sRGB) ───────────────────────────────────────
  rgb = linear_to_srgb(rgb);

  // ── 11. Film grain (applied in display space) ─────────────────────────────
  let grain = params.luminances.w;
  if (grain > 0.0) {
    let noise = (gold_noise(in.uv * 1000.0, params.effects.w) - 0.5) * grain / 255.0;
    rgb += noise;
  }

  return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
