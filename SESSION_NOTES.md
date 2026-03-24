# CineGrade — Session Notes

## What we built

A browser-based cinematic color grading tool. The user uploads an image and the app applies multiple cinematic color presets in parallel, displaying them side-by-side for comparison. All processing is done client-side — no image data leaves the browser.

---

## Rendering engine: WebGPU + WGSL (refactored from Canvas 2D)

As of the latest session, the entire pixel-processing pipeline has been migrated from CPU-based Canvas 2D to **GPU-based WebGPU with WGSL shaders**. This is a major architectural change.

### What changed

- **Old approach:** `getImageData` → per-pixel JS loop → `putImageData` → `canvas.toDataURL('jpeg')` → set `<img src>`. Every slider change re-encoded a JPEG.
- **New approach:** Each tile owns a `<canvas>` element rendered directly by WebGPU. Slider changes just update a GPU uniform buffer and re-dispatch a single draw call. No JPEG encoding, no CPU pixel loops.

### New files

| File | Role |
|------|------|
| `src/gpu/shaders/colorGrade.wgsl` | WGSL fragment shader — full grading pipeline in a single pass |
| `src/gpu/WebGPURenderer.js` | Renderer class — device management, pipeline, per-tile rendering, tone-curve LUT computation (Fritsch-Carlson monotone cubic spline) |
| `src/components/ToneCurveEditor.jsx` | Interactive canvas-based RGB curve editor (Master/R/G/B tabs, draggable control points, DPI-aware) |
| `src/components/HSLPanel.jsx` | HSL targeting panel — up to 6 qualifiers with hue presets, range/shift/sat/lum/softness sliders |
| `src/components/WebGPUUnsupported.jsx` | Fallback screen for browsers without WebGPU support |

### WGSL shader pipeline (single fragment pass)

1. sRGB → Linear (gamma 2.2)
2. Exposure (EV stops via `pow(2, bias)`)
3. Contrast (power-pivot at 18% middle gray)
4. Black point / shadow lift (non-linear power-based)
5. Highlight roll-off (filmic soft-knee compression above 0.8)
6. **Tone curves** — per-channel LUT sampling with linear interpolation (1024-entry storage buffer: Master/R/G/B × 256)
7. Color wheels — Lift/Gamma/Gain with smooth overlapping tonal weights
8. **HSL targeting** — up to 6 hue qualifiers with smooth cosine falloff
9. Global saturation (Rec.709 luma-preserving)
10. Film grain (procedural gold noise in display space)
11. Linear → sRGB

### Key architecture decisions

- **WebGPU-only** — no Canvas 2D or WebGL fallback. Shows a friendly unsupported-browser screen if WebGPU isn't available.
- **Single uber-shader** — all grading stages in one fragment pass to avoid multi-pass texture bouncing. Functions are modular within the shader for readability.
- **React owns the canvases** — each `GradeTile` renders its own `<canvas>` in JSX. `GradeGrid` receives refs via `onCanvasRef` and configures them as WebGPU render targets. This avoids the timing bugs of manual DOM insertion.
- **`requestAnimationFrame` before first render** — ensures React's commit phase has completed and all canvas refs are populated before WebGPU contexts are configured.
- **Tone curves use a storage buffer** — 1024 `f32` values (4 channels × 256 entries). The CPU computes a monotone cubic spline from control points and uploads the LUT. The shader does linear interpolation between adjacent entries.
- **HSL qualifiers use the uniform buffer** — packed as 12 `vec4<f32>` (6 qualifiers × 2 vec4 each). The shader converts to HSL, applies hue-windowed adjustments with `smoothstep` falloff, converts back.

### Gotchas / lessons learned

- `target` is a **reserved keyword** in WGSL — use `tgt_hue` or similar instead.
- WebGPU canvases must be **in the DOM and visible** when rendered to, or the composited frame may not display. Solution: always keep the canvas `display: block` and overlay the loading shimmer on top with absolute positioning.
- Uniform buffer structs in WGSL have strict alignment rules. Packing everything into `vec4<f32>` arrays avoids padding surprises.
- Bloom requires multi-pass rendering (blur → composite). Currently reserved in the uniform buffer but **not yet implemented** as a shader effect — it would need a separate blur pass. The parameter is accepted but has no visual effect.

---

## Key features completed

### Output grid
- Tiles laid out with flex-wrap (max 1600px wide)
- Aspect ratio preserved: landscape → 720px max, portrait → 320px max
- Metadata (preset name + cinematic term) and download button below each image

### Synchronized magnifying lens
- Circular 2.5× zoom lens synced across all tiles
- Uses a 2D canvas overlay that draws from the WebGPU canvas via `drawImage`

### Color presets (4 total)
1. **Naturalism** — clean, neutral, faithful reproduction
2. **Stark Clinical** — cold, desaturated, high-key
3. **Primary Clean** — punchy Technicolor feel (has a subtle S-curve on master tone curve)
4. **Nostalgic Sepia** — warm golden wash (has HSL qualifiers: desaturates greens and blues)

### Grade popup (click any tile)
- Draggable window with **3 tabs**: Grade, Curves, HSL
- **Grade tab**: exposure, saturation, color wheels (Shadows/Midtones/Highlights tabs), effects
- **Curves tab**: interactive tone curve editor with Master/R/G/B channels, click to add points, double-click to remove, DPI-aware rendering
- **HSL tab**: add up to 6 hue qualifiers with preset hue buttons, range/shift/saturation/luminance/softness sliders
- Reset to preset, Copy JSON
- Closes on outside click or Escape

---

## Architecture

| File | Role |
|------|------|
| `src/gpu/shaders/colorGrade.wgsl` | WGSL shader — full grading pipeline |
| `src/gpu/WebGPURenderer.js` | GPU device, pipeline, per-tile rendering, curve LUT math |
| `src/data/presets.json` | Preset definitions with tone_curves and hsl_targeting |
| `src/components/GradeGrid.jsx` | Orchestrator — canvas refs, GPU init, popup state |
| `src/components/GradeTile.jsx` | Tile — owns GPU canvas, lens, metadata, download |
| `src/components/GradePopup.jsx` | Draggable popup — Grade/Curves/HSL tabs |
| `src/components/ToneCurveEditor.jsx` | Interactive spline curve editor |
| `src/components/HSLPanel.jsx` | HSL qualifier panel |
| `src/components/WebGPUUnsupported.jsx` | Browser fallback screen |
| `src/components/ImageUpload.jsx` | Upload screen (drag-and-drop) |
| `src/components/Header.jsx` | Top nav bar |
| `src/utils/colorProcessor.js` | Image loader only (grading logic removed) |
| `tailwind.config.js` | Cinema design tokens |
| `src/index.css` | Base styles + `.cinema-range` slider CSS |

---

## Possible next steps

- **Implement multi-pass bloom** — requires horizontal + vertical blur passes and a screen-blend composite
- Add more presets (teal-orange blockbuster, bleach bypass, cross-process)
- Allow saving custom presets from adjusted popup values
- Export `.cube` LUT files from current parameters
- Before/after toggle (split-screen or A/B flip)
- Support RAW or higher bit-depth input via WASM decoder
- Histogram / waveform / vectorscope overlays (compute shaders)
