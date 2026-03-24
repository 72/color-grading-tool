/**
 * CineGrade — WebGPU Renderer
 *
 * Manages the GPU device, render pipeline, and per-tile rendering.
 * Each tile gets its own uniform buffer + bind group while sharing
 * a single pipeline and source texture across the entire grid.
 */

import shaderCode from './shaders/colorGrade.wgsl?raw'

// ── Hue-angle → RGB helper (mirrors the WGSL pre-computation) ───────────────

function hueAngleToRGB(angleDeg) {
  const h = ((angleDeg % 360) + 360) % 360
  const x = 1 - Math.abs((h / 60) % 2 - 1)
  let r, g, b
  if      (h < 60)  { r = 1; g = x; b = 0 }
  else if (h < 120) { r = x; g = 1; b = 0 }
  else if (h < 180) { r = 0; g = 1; b = x }
  else if (h < 240) { r = 0; g = x; b = 1 }
  else if (h < 300) { r = x; g = 0; b = 1 }
  else              { r = 1; g = 0; b = x }
  return [r, g, b]
}

function grainAmountFromType(type) {
  return { fine: 7, medium: 14, heavy: 24 }[type] ?? 0
}

// ── Identity tone-curve LUT (1024 floats: Master/R/G/B × 256) ──────────────

function createIdentityCurveLUT() {
  const lut = new Float32Array(1024)
  for (let ch = 0; ch < 4; ch++) {
    for (let i = 0; i < 256; i++) {
      lut[ch * 256 + i] = i / 255
    }
  }
  return lut
}

// ── Monotone cubic spline interpolation (Fritsch–Carlson) ───────────────────

function computeCurveLUT(controlPoints) {
  // controlPoints: array of { x, y } sorted by x, in [0,1]
  if (!controlPoints || controlPoints.length < 2) {
    const lut = new Float32Array(256)
    for (let i = 0; i < 256; i++) lut[i] = i / 255
    return lut
  }

  const pts = [...controlPoints].sort((a, b) => a.x - b.x)
  const n = pts.length

  // Compute slopes
  const delta = []
  for (let i = 0; i < n - 1; i++) {
    delta.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x))
  }

  // Compute tangents using Fritsch-Carlson
  const m = new Array(n)
  m[0] = delta[0]
  m[n - 1] = delta[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      m[i] = 0
    } else {
      m[i] = (delta[i - 1] + delta[i]) / 2
    }
  }

  // Enforce monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-10) {
      m[i] = 0
      m[i + 1] = 0
    } else {
      const alpha = m[i] / delta[i]
      const beta = m[i + 1] / delta[i]
      const tau = alpha * alpha + beta * beta
      if (tau > 9) {
        const s = 3 / Math.sqrt(tau)
        m[i] = s * alpha * delta[i]
        m[i + 1] = s * beta * delta[i]
      }
    }
  }

  // Evaluate at 256 points
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = i / 255
    // Clamp to control point range
    if (x <= pts[0].x) { lut[i] = pts[0].y; continue }
    if (x >= pts[n - 1].x) { lut[i] = pts[n - 1].y; continue }

    // Find segment
    let seg = 0
    for (let j = 0; j < n - 1; j++) {
      if (x >= pts[j].x && x < pts[j + 1].x) { seg = j; break }
    }

    const h = pts[seg + 1].x - pts[seg].x
    const t = (x - pts[seg].x) / h
    const t2 = t * t
    const t3 = t2 * t

    // Hermite basis
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2

    lut[i] = Math.max(0, Math.min(1,
      h00 * pts[seg].y + h10 * h * m[seg] + h01 * pts[seg + 1].y + h11 * h * m[seg + 1]
    ))
  }
  return lut
}

// ═════════════════════════════════════════════════════════════════════════════
// WebGPURenderer class
// ═════════════════════════════════════════════════════════════════════════════

export default class WebGPURenderer {
  constructor() {
    this.device = null
    this.pipeline = null
    this.sampler = null
    this.sourceTexture = null
    this.canvasFormat = null
    this.bindGroupLayout = null
    this._ready = false
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  /**
   * Check browser support.
   */
  static async isSupported() {
    if (!navigator.gpu) return false
    try {
      const adapter = await navigator.gpu.requestAdapter()
      return !!adapter
    } catch {
      return false
    }
  }

  /**
   * Acquire adapter + device, compile shaders, build the render pipeline.
   */
  async init() {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    })
    if (!adapter) throw new Error('WebGPU adapter unavailable')

    this.device = await adapter.requestDevice()
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat()

    // Shader module
    const shaderModule = this.device.createShaderModule({ code: shaderCode })

    // Sampler (bilinear filtering for smooth display scaling)
    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    })

    // Bind group layout
    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    })

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    })

    // Render pipeline
    this.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-list' },
    })

    this._ready = true
  }

  get ready() { return this._ready }

  // ── Source image upload ────────────────────────────────────────────────────

  /**
   * Upload the source image (from an HTMLCanvasElement) to a GPU texture.
   * Call this once per image load; tiles share this texture.
   */
  uploadSourceImage(canvas) {
    if (this.sourceTexture) {
      this.sourceTexture.destroy()
    }

    const { width, height } = canvas

    this.sourceTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })

    // Copy pixels from canvas → GPU texture
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, width, height)

    this.device.queue.writeTexture(
      { texture: this.sourceTexture },
      imageData.data,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height },
    )

    this.sourceWidth = width
    this.sourceHeight = height
  }

  // ── Tile renderer creation ────────────────────────────────────────────────

  /**
   * Prepare a tile renderer: configure a <canvas> element for WebGPU output
   * and allocate GPU resources (uniform buffer, tone-curve buffer, bind group).
   *
   * Returns a TileHandle used with `render()`.
   */
  createTileRenderer(canvasEl) {
    const ctx = canvasEl.getContext('webgpu')
    if (!ctx) throw new Error('WebGPU context unavailable on canvas element')
    ctx.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'premultiplied',
    })

    const uniformBuffer = this.device.createBuffer({
      size: 288,  // 72 × f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const curveBuffer = this.device.createBuffer({
      size: 1024 * 4,  // 1024 × f32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Write identity curve
    this.device.queue.writeBuffer(curveBuffer, 0, createIdentityCurveLUT())

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.sourceTexture.createView() },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: uniformBuffer } },
        { binding: 3, resource: { buffer: curveBuffer } },
      ],
    })

    return { ctx, uniformBuffer, curveBuffer, bindGroup, canvasEl }
  }

  /**
   * Rebuild the bind group for a tile (needed after source texture changes).
   */
  rebuildBindGroup(tile) {
    tile.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: this.sourceTexture.createView() },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: tile.uniformBuffer } },
        { binding: 3, resource: { buffer: tile.curveBuffer } },
      ],
    })
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /**
   * Build the Float32Array uniform data from a CineGrade parameter object.
   */
  buildUniformData(gradeParams) {
    const data = new Float32Array(72)  // 288 bytes

    const { exposure, saturation, color_wheels, special_effects, tone_curves, hsl_targeting } = gradeParams

    // vec4[0]: exposure
    data[0] = exposure?.global_bias ?? 0
    data[1] = exposure?.contrast_ratio ?? 1
    data[2] = exposure?.black_point ?? 0
    data[3] = saturation?.global_level ?? 1

    // vec4[1]: lift colour wheel
    const liftHue = hueAngleToRGB(color_wheels?.lift?.hue_angle ?? 0)
    data[4] = liftHue[0]
    data[5] = liftHue[1]
    data[6] = liftHue[2]
    data[7] = color_wheels?.lift?.saturation_intensity ?? 0

    // vec4[2]: gamma colour wheel
    const gammaHue = hueAngleToRGB(color_wheels?.gamma?.hue_angle ?? 0)
    data[8]  = gammaHue[0]
    data[9]  = gammaHue[1]
    data[10] = gammaHue[2]
    data[11] = color_wheels?.gamma?.saturation_intensity ?? 0

    // vec4[3]: gain colour wheel
    const gainHue = hueAngleToRGB(color_wheels?.gain?.hue_angle ?? 0)
    data[12] = gainHue[0]
    data[13] = gainHue[1]
    data[14] = gainHue[2]
    data[15] = color_wheels?.gain?.saturation_intensity ?? 0

    // vec4[4]: luminances + grain
    data[16] = color_wheels?.lift?.luminance ?? 0
    data[17] = color_wheels?.gamma?.luminance ?? 0
    data[18] = color_wheels?.gain?.luminance ?? 0
    data[19] = grainAmountFromType(special_effects?.film_grain)

    // vec4[5]: effects
    data[20] = special_effects?.highlight_bloom ?? 0     // reserved
    data[21] = tone_curves?.enabled ? 1 : 0
    data[22] = hsl_targeting?.length ?? 0
    data[23] = Math.random() * 10000                     // grain seed

    // HSL qualifiers (up to 6, each occupying 2 × vec4 = 8 floats)
    const hslTargets = hsl_targeting ?? []
    for (let i = 0; i < Math.min(6, hslTargets.length); i++) {
      const offset = 24 + i * 8
      const q = hslTargets[i]
      data[offset]     = q.target_hue ?? 0
      data[offset + 1] = q.hue_range ?? 60
      data[offset + 2] = q.hue_shift ?? 0
      data[offset + 3] = q.sat_scale ?? 1
      data[offset + 4] = q.lum_offset ?? 0
      data[offset + 5] = q.softness ?? 30
      data[offset + 6] = 0
      data[offset + 7] = 0
    }

    return data
  }

  /**
   * Build the tone-curve storage-buffer data from the preset's curve points.
   */
  buildCurveData(toneCurves) {
    if (!toneCurves?.enabled) return createIdentityCurveLUT()

    const masterLUT = computeCurveLUT(toneCurves.master)
    const redLUT    = computeCurveLUT(toneCurves.red)
    const greenLUT  = computeCurveLUT(toneCurves.green)
    const blueLUT   = computeCurveLUT(toneCurves.blue)

    const data = new Float32Array(1024)
    data.set(masterLUT, 0)
    data.set(redLUT, 256)
    data.set(greenLUT, 512)
    data.set(blueLUT, 768)
    return data
  }

  /**
   * Render a graded frame to a tile's canvas.
   */
  render(tile, gradeParams) {
    if (!this._ready || !this.sourceTexture) return

    // Upload uniforms
    const uniformData = this.buildUniformData(gradeParams)
    this.device.queue.writeBuffer(tile.uniformBuffer, 0, uniformData)

    // Upload tone curves
    const curveData = this.buildCurveData(gradeParams.tone_curves)
    this.device.queue.writeBuffer(tile.curveBuffer, 0, curveData)

    // Encode + submit render pass
    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: tile.ctx.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: 'store',
      }],
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, tile.bindGroup)
    pass.draw(3)  // fullscreen triangle
    pass.end()

    this.device.queue.submit([encoder.finish()])
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  /**
   * Export a tile's current render as a JPEG data-URL.
   * Copies from the WebGPU canvas to a 2D canvas for encoding.
   */
  exportToDataURL(tile, quality = 0.92) {
    const src = tile.canvasEl
    const tmp = document.createElement('canvas')
    tmp.width = src.width
    tmp.height = src.height
    const ctx = tmp.getContext('2d')
    ctx.drawImage(src, 0, 0)
    return tmp.toDataURL('image/jpeg', quality)
  }

  /**
   * Export a tile's current render as a Blob (async).
   */
  exportToBlob(tile, type = 'image/jpeg', quality = 0.92) {
    const src = tile.canvasEl
    const tmp = document.createElement('canvas')
    tmp.width = src.width
    tmp.height = src.height
    const ctx = tmp.getContext('2d')
    ctx.drawImage(src, 0, 0)
    return new Promise((resolve) => tmp.toBlob(resolve, type, quality))
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroyTile(tile) {
    tile.uniformBuffer?.destroy()
    tile.curveBuffer?.destroy()
  }

  destroy() {
    this.sourceTexture?.destroy()
    this.device?.destroy()
    this._ready = false
  }
}

// Re-export the curve computation for use by the ToneCurveEditor
export { computeCurveLUT, createIdentityCurveLUT, hueAngleToRGB }
