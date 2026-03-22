import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import GradeTile from './GradeTile'
import presets from '../data/presets.json'
import { applyGrade, canvasToDataURL } from '../utils/colorProcessor'

/**
 * Renders the 2×3 comparison grid.
 *
 * Props:
 *   sourceCanvas — HTMLCanvasElement with the original image
 *   aspectRatio  — width / height of the original image
 *   fileName     — original file name (shown in the toolbar)
 */
export default function GradeGrid({ sourceCanvas, aspectRatio, fileName }) {
  // Array of { preset, dataUrl } — grows as each grade is computed
  const [tiles, setTiles]             = useState([])
  const [allDone, setAllDone]         = useState(false)
  const [hoverPos, setHoverPos]       = useState(null) // { xRatio, yRatio } | null
  const processingRef                 = useRef(false)

  const handleHoverChange = useCallback((pos) => setHoverPos(pos), [])

  // Process all 6 grades sequentially using a microtask loop so the
  // browser stays responsive and tiles appear one-by-one.
  useEffect(() => {
    if (!sourceCanvas || processingRef.current) return
    processingRef.current = true
    setTiles([])
    setAllDone(false)

    let cancelled = false

    async function runGrades() {
      for (const preset of presets) {
        if (cancelled) break
        // Yield to the browser between grades to keep the UI responsive
        await new Promise((r) => requestAnimationFrame(r))
        const gradedCanvas = applyGrade(sourceCanvas, preset)
        const dataUrl      = canvasToDataURL(gradedCanvas)
        if (!cancelled) {
          setTiles((prev) => [...prev, { preset, dataUrl }])
        }
      }
      if (!cancelled) setAllDone(true)
    }

    runGrades()

    return () => {
      cancelled = true
      processingRef.current = false
    }
  }, [sourceCanvas])

  // ── Download all graded images as a zip (native multi-download fallback) ──
  const handleDownloadAll = () => {
    tiles.forEach(({ preset, dataUrl }) => {
      const a = document.createElement('a')
      a.href     = dataUrl
      a.download = `cingrade_${preset.id}.jpg`
      a.click()
    })
  }

  return (
    <motion.div
      className="flex flex-col h-[calc(100vh-64px)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cinema-border">
        <div className="flex items-center gap-3">
          {/* Subtle progress dots */}
          <div className="flex gap-1">
            {presets.map((p, i) => (
              <motion.div
                key={p.id}
                className="w-1.5 h-1.5 rounded-full"
                animate={{
                  backgroundColor: i < tiles.length
                    ? '#F59E0B'
                    : '#404040',
                }}
                transition={{ duration: 0.25 }}
              />
            ))}
          </div>
          <span className="text-cinema-muted text-xs">
            {allDone
              ? `${presets.length} grades applied`
              : `Applying grade ${tiles.length + 1} of ${presets.length}…`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {fileName && (
            <span className="text-cinema-subtle text-xs hidden sm:block truncate max-w-[200px]">
              {fileName}
            </span>
          )}
          {allDone && (
            <motion.button
              onClick={handleDownloadAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cinema-card border border-cinema-border hover:border-cinema-muted text-white text-xs font-medium transition-colors"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              whileTap={{ scale: 0.96 }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M8 2v8m0 0L5 7m3 3l3-3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 13h12" strokeLinecap="round"/>
              </svg>
              Save all
            </motion.button>
          )}
        </div>
      </div>

      {/* ── 2 × 3 grid ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-wrap gap-4 p-6 max-w-[1600px] mx-auto w-full">
          {presets.map((preset, i) => {
            const tile = tiles.find((t) => t.preset.id === preset.id)
            return (
              <GradeTile
                key={preset.id}
                preset={preset}
                dataUrl={tile?.dataUrl ?? null}
                isLoading={!tile}
                index={i}
                aspectRatio={aspectRatio}
                hoverPos={hoverPos}
                onHoverChange={handleHoverChange}
              />
            )
          })}
        </div>
      </div>

      {/* ── Footer note ───────────────────────────────────────────────── */}
      {allDone && (
        <motion.p
          className="text-center text-cinema-subtle text-xs pb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          All processing is local — your image never leaves this browser tab.
        </motion.p>
      )}
    </motion.div>
  )
}
