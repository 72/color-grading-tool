import { useState, useRef } from 'react'
import { motion } from 'framer-motion'

const LENS_SIZE = 144  // lens diameter in px
const ZOOM      = 2.5

/**
 * Props:
 *   preset        — preset metadata
 *   dataUrl       — graded JPEG data-URL
 *   isLoading     — show shimmer while processing
 *   index         — stagger delay index
 *   aspectRatio   — width/height of the source image
 *   hoverPos      — { xRatio, yRatio } | null  (shared across all tiles)
 *   onHoverChange — (pos | null) => void
 */
export default function GradeTile({
  preset, dataUrl, isLoading, index, aspectRatio, hoverPos, onHoverChange,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const imageRef = useRef(null)

  const handleDownload = (e) => {
    e.stopPropagation()
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href     = dataUrl
    a.download = `${preset.id}.jpg`
    a.click()
  }

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onHoverChange({
      xRatio: (e.clientX - rect.left) / rect.width,
      yRatio: (e.clientY - rect.top)  / rect.height,
    })
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    onHoverChange(null)
  }

  // ── Lens ──────────────────────────────────────────────────────────────
  const imgW = imageRef.current?.offsetWidth  ?? 0
  const imgH = imageRef.current?.offsetHeight ?? 0

  const showLens = !!hoverPos && !!dataUrl && !isLoading && imgW > 0

  const lensX = showLens ? hoverPos.xRatio * imgW : 0
  const lensY = showLens ? hoverPos.yRatio * imgH : 0

  // bgH derived from aspectRatio so the zoomed image is never stretched
  const bgW   = imgW * ZOOM
  const bgH   = bgW / aspectRatio
  const yZoom = imgH > 0 ? bgH / imgH : ZOOM

  const bgX = -(lensX * ZOOM  - LENS_SIZE / 2)
  const bgY = -(lensY * yZoom - LENS_SIZE / 2)

  // Landscape (aspectRatio > 1): cap width at 720px, height derives from ratio.
  // Portrait (aspectRatio < 1): cap width at 320px, height derives from ratio
  //   (e.g. 9:16 → 320px wide, ~568px tall).
  // Square (aspectRatio === 1): rendered as a 320×320 square.
  const tileWidth = aspectRatio > 1 ? 'min(720px, 100%)' : '320px'

  return (
    <motion.div
      className="flex flex-col flex-none rounded-xl border border-cinema-border bg-cinema-card"
      style={{ width: tileWidth }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: index * 0.07,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* ── Image (lens is clipped here) ─────────────────────────────── */}
      <div
        ref={imageRef}
        className="relative overflow-hidden rounded-t-xl"
        style={{
          aspectRatio,
          cursor: isHovered && dataUrl && !isLoading ? 'none' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        {isLoading || !dataUrl ? (
          <div className="absolute inset-0 bg-cinema-card">
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(90deg, #161616 25%, #1e1e1e 50%, #161616 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.6s infinite',
              }}
            />
          </div>
        ) : (
          <img
            src={dataUrl}
            alt={preset.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* Magnifier lens */}
        {showLens && (
          <div
            style={{
              position: 'absolute',
              width:  LENS_SIZE,
              height: LENS_SIZE,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.7)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.55)',
              backgroundImage: `url(${dataUrl})`,
              backgroundSize: `${bgW}px ${bgH}px`,
              backgroundPosition: `${bgX}px ${bgY}px`,
              backgroundRepeat: 'no-repeat',
              left: lensX - LENS_SIZE / 2,
              top:  lensY - LENS_SIZE / 2,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        )}
      </div>

      {/* ── Metadata (below the image) ───────────────────────────────── */}
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
            dataUrl ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 opacity-40 cursor-default',
          ].join(' ')}
          whileTap={dataUrl ? { scale: 0.9 } : {}}
          title="Save image"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M8 2v8m0 0L5 7m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 13h12" strokeLinecap="round"/>
          </svg>
        </motion.button>
      </div>
    </motion.div>
  )
}
