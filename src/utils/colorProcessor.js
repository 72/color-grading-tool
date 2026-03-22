/**
 * CineGrade — Canvas-based cinematic color grading engine.
 *
 * Implements a simplified but visually faithful version of the
 * lift / gamma / gain color wheel model used in professional
 * grading applications (DaVinci Resolve, Baselight, etc.).
 *
 * All processing is done client-side — no pixels ever leave
 * the user's browser.
 */

// ---------------------------------------------------------------------------
// Colour math helpers
// ---------------------------------------------------------------------------

/**
 * Convert a hue angle (0–360°) to a full-saturation RGB triplet [0, 1].
 */
function hueAngleToRGB(angleDeg) {
  const h = ((angleDeg % 360) + 360) % 360
  const c = 1 
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))

  let r, g, b
  if      (h < 60)  { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }

  return [r, g, b]
}

/**
 * Approximate sRGB to Linear conversion (Gamma 2.2).
 */
function sRGBToLinear(val) {
  return Math.pow(val, 2.2)
}

/**
 * Approximate Linear to sRGB conversion (Gamma 1/2.2).
 */
function linearToSRGB(val) {
  return Math.pow(Math.max(0, val), 1 / 2.2)
}

/**
 * Compute smooth, overlapping tonal weights for a given luma value [0, 1].
 * Uses overlapping power functions for a natural, cinematographic transition
 * instead of hard-edged linear ramps.
 */
function tonalWeights(luma) {
  // Shadow weight: peaks at 0, tapers off towards 0.7
  const shadow = Math.pow(Math.max(0, 1 - luma / 0.7), 2)
  // Highlight weight: peaks at 1, tapers off towards 0.3
  const highlight = Math.pow(Math.max(0, (luma - 0.3) / 0.7), 2)
  // Midtone weight: smooth bell curve peaking at 0.5
  const midtone = Math.max(0, 1 - shadow - highlight)
  
  return { shadow, midtone, highlight }
}

// ---------------------------------------------------------------------------
// Core per-pixel grade pass
// ---------------------------------------------------------------------------

/**
 * Apply a single color-grade preset to a flat Uint8ClampedArray of RGBA
 * pixel data (mutates in-place for performance).
 */
function gradePixels(data, params) {
  const { exposure, saturation, color_wheels } = params

  const evFactor      = Math.pow(2, exposure.global_bias    ?? 0)
  const contrastRatio = exposure.contrast_ratio ?? 1.0
  const blackPoint    = exposure.black_point    ?? 0.0
  const globalSat     = saturation.global_level ?? 1.0

  // Pre-compute hue RGB vectors once for the whole image
  const liftHue  = hueAngleToRGB(color_wheels.lift.hue_angle)
  const gammaHue = hueAngleToRGB(color_wheels.gamma.hue_angle)
  const gainHue  = hueAngleToRGB(color_wheels.gain.hue_angle)

  const liftSatI  = color_wheels.lift.saturation_intensity  ?? 0
  const liftLum   = color_wheels.lift.luminance             ?? 0
  const gammaSatI = color_wheels.gamma.saturation_intensity ?? 0
  const gammaLum  = color_wheels.gamma.luminance            ?? 0
  const gainSatI  = color_wheels.gain.saturation_intensity  ?? 0
  const gainLum   = color_wheels.gain.luminance             ?? 0

  // 18% gray pivot for cinematic contrast
  const PIVOT = 0.18

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]     / 255
    let g = data[i + 1] / 255
    let b = data[i + 2] / 255

    // ── 1. Linearize ───────────────────────────────────────────────────
    r = sRGBToLinear(r)
    g = sRGBToLinear(g)
    b = sRGBToLinear(b)

    // ── 2. Exposure (Linear multiply) ──────────────────────────────────
    r *= evFactor
    g *= evFactor
    b *= evFactor

    // ── 3. Contrast (S-Curve pivoting at 18% gray) ─────────────────────
    if (contrastRatio !== 1.0) {
      // Use a more nuanced power-pivot that preserves midtone integrity
      r = Math.pow(Math.max(1e-6, r / PIVOT), contrastRatio) * PIVOT
      g = Math.pow(Math.max(1e-6, g / PIVOT), contrastRatio) * PIVOT
      b = Math.pow(Math.max(1e-6, b / PIVOT), contrastRatio) * PIVOT
    }

    // ── 4. Black point / Shadow lift ───────────────────────────────────
    // Instead of a linear offset, we use a power-based lift to keep the
    // midtones and highlights grounded while only "milking" the deep blacks.
    if (blackPoint > 0) {
      const liftFactor = blackPoint * 0.5
      r = r + liftFactor * Math.pow(Math.max(0, 1 - r), 4)
      g = g + liftFactor * Math.pow(Math.max(0, 1 - g), 4)
      b = b + liftFactor * Math.pow(Math.max(0, 1 - b), 4)
    } else if (blackPoint < 0) {
      // Crushed blacks (linear subtractions are fine for crushing)
      r = Math.max(0, r + blackPoint)
      g = Math.max(0, g + blackPoint)
      b = Math.max(0, b + blackPoint)
    }

    // ── 5. Highlight Roll-off (Filmic Compression) ─────────────────────
    // Prevents harsh digital clipping by softly compressing values > 0.9
    const rollOff = (val) => val > 0.8 ? 0.8 + (1 - Math.exp(-(val - 0.8) * 2)) * 0.2 : val
    r = rollOff(r)
    g = rollOff(g)
    b = rollOff(b)

    // ── 6. Colour wheels (Tints in linear space) ───────────────────────
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const { shadow: sw, midtone: mw, highlight: hw } = tonalWeights(Math.min(1, luma))

    // Scale factor for subtler, more professional intensity
    const SCALE = 1.1

    // Lift (Shadows)
    r += (liftHue[0] - 0.5) * sw * liftSatI * SCALE + liftLum * sw
    g += (liftHue[1] - 0.5) * sw * liftSatI * SCALE + liftLum * sw
    b += (liftHue[2] - 0.5) * sw * liftSatI * SCALE + liftLum * sw

    // Gamma (Midtones)
    r += (gammaHue[0] - 0.5) * mw * gammaSatI * SCALE + gammaLum * mw
    g += (gammaHue[1] - 0.5) * mw * gammaSatI * SCALE + gammaLum * mw
    b += (gammaHue[2] - 0.5) * mw * gammaSatI * SCALE + gammaLum * mw

    // Gain (Highlights)
    r += (gainHue[0] - 0.5) * hw * gainSatI * SCALE + gainLum * hw
    g += (gainHue[1] - 0.5) * hw * gainSatI * SCALE + gainLum * hw
    b += (gainHue[2] - 0.5) * hw * gainSatI * SCALE + gainLum * hw

    // ── 6. Global saturation ───────────────────────────────────────────
    const lumaFinal = 0.2126 * r + 0.7152 * g + 0.0722 * b
    r = lumaFinal + (r - lumaFinal) * globalSat
    g = lumaFinal + (g - lumaFinal) * globalSat
    b = lumaFinal + (b - lumaFinal) * globalSat

    // ── 7. Write back (Delinearize & Clamp) ────────────────────────────
    data[i]     = Math.round(Math.min(255, linearToSRGB(r) * 255))
    data[i + 1] = Math.round(Math.min(255, linearToSRGB(g) * 255))
    data[i + 2] = Math.round(Math.min(255, linearToSRGB(b) * 255))
  }
}

// ---------------------------------------------------------------------------
// Special effects
// ---------------------------------------------------------------------------

function applyFilmGrain(data, grainType) {
  const amount = { fine: 7, medium: 14, heavy: 24 }[grainType] ?? 0
  if (!amount) return
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    data[i]     = Math.min(255, Math.max(0, data[i]     + n))
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n))
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n))
  }
}

/**
 * Soft highlight bloom — draws a blurred, brightened copy of the canvas
 * on top using the 'screen' composite operation.
 */
function applyBloom(canvas, ctx, intensity) {
  if (!intensity || intensity <= 0) return

  const blurRadius = Math.max(4, Math.round(canvas.width * 0.015))

  const glow = document.createElement('canvas')
  glow.width  = canvas.width
  glow.height = canvas.height
  const gc = glow.getContext('2d')
  gc.filter = `blur(${blurRadius}px) brightness(1.6)`
  gc.drawImage(canvas, 0, 0)

  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = Math.min(0.55, intensity * 0.5)
  ctx.drawImage(glow, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a cinematic color-grade preset to a source canvas.
 *
 * @param {HTMLCanvasElement} sourceCanvas  — the original (unmodified) image
 * @param {Object}            preset        — one entry from presets.json
 * @returns {HTMLCanvasElement}             — a new canvas with the grade applied
 */
export function applyGrade(sourceCanvas, preset) {
  const out = document.createElement('canvas')
  out.width  = sourceCanvas.width
  out.height = sourceCanvas.height
  const ctx  = out.getContext('2d')

  ctx.drawImage(sourceCanvas, 0, 0)

  const imageData = ctx.getImageData(0, 0, out.width, out.height)
  gradePixels(imageData.data, preset.parameters)

  const { film_grain, highlight_bloom } = preset.parameters.special_effects ?? {}
  if (film_grain && film_grain !== 'none') {
    applyFilmGrain(imageData.data, film_grain)
  }

  ctx.putImageData(imageData, 0, 0)

  if (highlight_bloom) {
    applyBloom(out, ctx, highlight_bloom)
  }

  return out
}

/**
 * Load an image File/Blob into an off-screen canvas at its natural size.
 * Returns a promise that resolves to { canvas, width, height, aspectRatio }.
 */
export function loadImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve({
        canvas,
        width:       img.naturalWidth,
        height:      img.naturalHeight,
        aspectRatio: img.naturalWidth / img.naturalHeight,
      })
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Convert a canvas to a JPEG data-URL (used for display in <img> tags).
 */
export function canvasToDataURL(canvas, quality = 0.92) {
  return canvas.toDataURL('image/jpeg', quality)
}
