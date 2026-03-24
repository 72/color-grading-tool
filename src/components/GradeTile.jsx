import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

const LENS_SIZE = 144
const ZOOM = 2.5

/**
 * A single graded-image tile.
 *
 * The <canvas> element lives in JSX (React manages its lifecycle).
 * GradeGrid receives the canvas ref via onCanvasRef and uses it
 * as a WebGPU render target.
 *
 * Props:
 *   preset         — preset metadata
 *   renderer       — WebGPURenderer instance
 *   tileHandle     — GPU tile handle (null while loading)
 *   isLoading      — true until the GPU has rendered this tile
 *   index          — stagger animation index
 *   aspectRatio    — source image width/height
 *   sourceWidth    — source image pixel width
 *   sourceHeight   — source image pixel height
 *   hoverPos       — { xRatio, yRatio } | null (shared across tiles)
 *   onHoverChange  — (pos | null) => void
 *   isActive       — true when popup is open for this tile
 *   onTileClick    — (presetId, DOMRect) => void
 *   onCanvasRef    — (presetId, canvasEl | null) => void
 */
export default function GradeTile({
  preset, renderer, tileHandle, isLoading, index,
  aspectRatio, sourceWidth, sourceHeight,
  hoverPos, onHoverChange, isActive, onTileClick,
  onCanvasRef,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const imageAreaRef = useRef(null)
  const lensCanvasRef = useRef(null)
  const gpuCanvasRef = useRef(null)

  // ── Forward GPU canvas ref to parent (stable callback) ────────────────────
  const setGpuCanvasRef = useCallback((el) => {
    gpuCanvasRef.current = el
    onCanvasRef?.(preset.id, el)
  }, [preset.id, onCanvasRef])

  // ── Download (export from GPU canvas → JPEG) ─────────────────────────────
  const handleDownload = (e) => {
    e.stopPropagation()
    if (!tileHandle || !renderer) return
    const dataUrl = renderer.exportToDataURL(tileHandle)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `cingrade_${preset.id}.jpg`
    a.click()
  }

  // ── Mouse tracking ────────────────────────────────────────────────────────
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onHoverChange({
      xRatio: (e.clientX - rect.left) / rect.width,
      yRatio: (e.clientY - rect.top) / rect.height,
    })
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    onHoverChange(null)
  }

  const handleTileClick = (e) => {
    if (e.target.closest('button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    onTileClick?.(preset.id, rect)
  }

  // ── Lens: draw zoomed portion from the GPU canvas ─────────────────────────
  const containerEl = imageAreaRef.current
  const containerW = containerEl?.offsetWidth ?? 0
  const containerH = containerEl?.offsetHeight ?? 0
  const gpuCanvas = gpuCanvasRef.current

  const showLens = !!hoverPos && !!gpuCanvas && !isLoading && containerW > 0

  useEffect(() => {
    if (!showLens || !lensCanvasRef.current || !gpuCanvas) return

    const lensCtx = lensCanvasRef.current.getContext('2d')
    if (!lensCtx) return

    const scaleX = gpuCanvas.width / containerW
    const scaleY = gpuCanvas.height / containerH
    const srcCenterX = hoverPos.xRatio * gpuCanvas.width
    const srcCenterY = hoverPos.yRatio * gpuCanvas.height
    const srcW = (LENS_SIZE / ZOOM) * scaleX
    const srcH = (LENS_SIZE / ZOOM) * scaleY

    // Clamp source rect to canvas bounds to avoid distortion at edges
    const srcX = Math.max(0, Math.min(gpuCanvas.width - srcW, srcCenterX - srcW / 2))
    const srcY = Math.max(0, Math.min(gpuCanvas.height - srcH, srcCenterY - srcH / 2))

    lensCtx.clearRect(0, 0, LENS_SIZE, LENS_SIZE)
    lensCtx.drawImage(
      gpuCanvas,
      srcX, srcY, srcW, srcH,
      0, 0, LENS_SIZE, LENS_SIZE,
    )
  }, [showLens, hoverPos, gpuCanvas, containerW, containerH])

  // ── Tile sizing ───────────────────────────────────────────────────────────
  const tileWidth = aspectRatio > 1 ? 'min(720px, 100%)' : '320px'

  const lensX = showLens ? hoverPos.xRatio * containerW : 0
  const lensY = showLens ? hoverPos.yRatio * containerH : 0

  return (
    <motion.div
      className={[
        'flex flex-col flex-none rounded-xl border bg-cinema-card cursor-pointer',
        isActive ? 'border-cinema-amber' : 'border-cinema-border',
      ].join(' ')}
      style={{ width: tileWidth }}
      onClick={handleTileClick}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: index * 0.07,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* ── Image area ───────────────────────────────────────────────────── */}
      <div
        ref={imageAreaRef}
        className="relative overflow-hidden rounded-t-xl"
        style={{
          aspectRatio,
          cursor: isHovered && !isLoading ? 'none' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        {/* GPU canvas — always in the DOM, rendered by WebGPU */}
        <canvas
          ref={setGpuCanvasRef}
          width={sourceWidth || 1}
          height={sourceHeight || 1}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* Loading shimmer — overlays the canvas until GPU render completes */}
        {isLoading && (
          <div className="absolute inset-0 bg-cinema-card z-10">
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, #161616 25%, #1e1e1e 50%, #161616 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.6s infinite',
              }}
            />
          </div>
        )}

        {/* Magnifier lens */}
        {showLens && (
          <div
            style={{
              position: 'absolute',
              width: LENS_SIZE,
              height: LENS_SIZE,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.7)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.55)',
              overflow: 'hidden',
              left: lensX - LENS_SIZE / 2,
              top: lensY - LENS_SIZE / 2,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            <canvas
              ref={lensCanvasRef}
              width={LENS_SIZE}
              height={LENS_SIZE}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}
      </div>

      {/* ── Metadata bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-cinema-border">
        <div className="min-w-0">
          <p className="text-white text-sm font-medium leading-tight truncate">
            {preset.name}
          </p>
          <p className="text-white/50 text-[11px] mt-0.5 leading-tight truncate">
            {preset.cinematic_term}
          </p>
        </div>

        <motion.button
          onClick={handleDownload}
          className={[
            'flex items-center justify-center w-7 h-7 rounded-lg text-white transition-colors shrink-0',
            !isLoading ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 opacity-40 cursor-default',
          ].join(' ')}
          whileTap={!isLoading ? { scale: 0.9 } : {}}
          title="Save image"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M8 2v8m0 0L5 7m3 3l3-3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 13h12" strokeLinecap="round" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  )
}
