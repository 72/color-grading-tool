import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GradeTile from './GradeTile'
import GradePopup from './GradePopup'
import presets from '../data/presets.json'
import { applyGrade, canvasToDataURL } from '../utils/colorProcessor'

/**
 * Renders the comparison grid.
 *
 * Props:
 *   sourceCanvas — HTMLCanvasElement with the original image
 *   aspectRatio  — width / height of the original image
 *   fileName     — original file name (shown in the toolbar)
 */
export default function GradeGrid({ sourceCanvas, aspectRatio, fileName }) {
  const [tiles, setTiles]             = useState([])
  const [allDone, setAllDone]         = useState(false)
  const [hoverPos, setHoverPos]       = useState(null)

  // ── Popup state ────────────────────────────────────────────────────────────
  const [activeTileId, setActiveTileId]   = useState(null)
  const [anchorRect, setAnchorRect]       = useState(null)
  // overrides: { [presetId]: parameters object }
  const [overrides, setOverrides]         = useState({})
  // regraded data-urls for overridden tiles: { [presetId]: dataUrl }
  const [regraded, setRegraded]           = useState({})

  const processingRef = useRef(false)
  const rafRef        = useRef(null)

  const handleHoverChange = useCallback((pos) => setHoverPos(pos), [])

  // ── Initial grade pass ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!sourceCanvas || processingRef.current) return
    processingRef.current = true
    setTiles([])
    setAllDone(false)
    setOverrides({})
    setRegraded({})
    setActiveTileId(null)

    let cancelled = false

    async function runGrades() {
      for (const preset of presets) {
        if (cancelled) break
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

  // ── Popup: open / close ────────────────────────────────────────────────────
  const handleTileClick = useCallback((presetId, rect) => {
    setActiveTileId((prev) => (prev === presetId ? null : presetId))
    setAnchorRect(rect)
  }, [])

  const handleClose = useCallback(() => setActiveTileId(null), [])

  // ── Popup: real-time re-grade (rAF throttled) ──────────────────────────────
  const handleParamChange = useCallback((presetId, newParams) => {
    // Update overrides immediately (so sliders feel instant)
    setOverrides((prev) => ({ ...prev, [presetId]: newParams }))

    // Throttle canvas work to one rAF per tile
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const syntheticPreset = { parameters: newParams }
      const gradedCanvas = applyGrade(sourceCanvas, syntheticPreset)
      const dataUrl = canvasToDataURL(gradedCanvas)
      setRegraded((prev) => ({ ...prev, [presetId]: dataUrl }))
    })
  }, [sourceCanvas])

  // ── Popup: reset to original preset ───────────────────────────────────────
  const handleReset = useCallback((presetId) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[presetId]
      return next
    })
    setRegraded((prev) => {
      const next = { ...prev }
      delete next[presetId]
      return next
    })
  }, [])

  // ── Download all ───────────────────────────────────────────────────────────
  const handleDownloadAll = () => {
    tiles.forEach(({ preset, dataUrl }) => {
      const url = regraded[preset.id] ?? dataUrl
      const a = document.createElement('a')
      a.href     = url
      a.download = `cingrade_${preset.id}.jpg`
      a.click()
    })
  }

  // Active preset params (overridden or original)
  const activePreset   = presets.find((p) => p.id === activeTileId)
  const activeParams   = activeTileId
    ? (overrides[activeTileId] ?? activePreset?.parameters)
    : null

  return (
    <motion.div
      className="flex flex-col h-[calc(100vh-64px)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cinema-border">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {presets.map((p, i) => (
              <motion.div
                key={p.id}
                className="w-1.5 h-1.5 rounded-full"
                animate={{ backgroundColor: i < tiles.length ? '#F59E0B' : '#404040' }}
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

      {/* ── Tile grid ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-wrap gap-4 p-6 max-w-[1600px] mx-auto w-full">
          {presets.map((preset, i) => {
            const tile    = tiles.find((t) => t.preset.id === preset.id)
            const dataUrl = regraded[preset.id] ?? tile?.dataUrl ?? null
            return (
              <GradeTile
                key={preset.id}
                preset={preset}
                dataUrl={dataUrl}
                isLoading={!tile}
                index={i}
                aspectRatio={aspectRatio}
                hoverPos={hoverPos}
                onHoverChange={handleHoverChange}
                isActive={activeTileId === preset.id}
                onTileClick={handleTileClick}
              />
            )
          })}
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────────── */}
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

      {/* ── Grade popup ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeTileId && activeParams && anchorRect && (
          <GradePopup
            key={activeTileId}
            preset={activePreset}
            params={activeParams}
            anchorRect={anchorRect}
            onParamChange={(newParams) => handleParamChange(activeTileId, newParams)}
            onReset={() => handleReset(activeTileId)}
            onClose={handleClose}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
