import { useState, useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './components/Header'
import ImageUpload from './components/ImageUpload'
import GradeGrid from './components/GradeGrid'
import WebGPUUnsupported from './components/WebGPUUnsupported'
import WebGPURenderer from './gpu/WebGPURenderer'
import { loadImageToCanvas } from './utils/colorProcessor'

/**
 * Top-level app shell — manages view state and the shared WebGPU renderer.
 *
 * Views:
 *   'loading'  — initialising WebGPU
 *   'unsupported' — browser doesn't support WebGPU
 *   'upload'   — no image loaded yet
 *   'grading'  — image loaded, show the grade grid
 */
export default function App() {
  const [view, setView]                 = useState('loading')
  const [sourceCanvas, setSourceCanvas] = useState(null)
  const [aspectRatio, setAspectRatio]   = useState(16 / 9)
  const [fileName, setFileName]         = useState('')
  const rendererRef                     = useRef(null)

  // ── Initialise WebGPU on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function initGPU() {
      const supported = await WebGPURenderer.isSupported()
      if (!supported || cancelled) {
        if (!cancelled) setView('unsupported')
        return
      }

      const renderer = new WebGPURenderer()
      try {
        await renderer.init()
        if (!cancelled) {
          rendererRef.current = renderer
          setView('upload')
        }
      } catch (err) {
        console.error('WebGPU init failed:', err)
        if (!cancelled) setView('unsupported')
      }
    }

    initGPU()

    return () => {
      cancelled = true
      rendererRef.current?.destroy()
    }
  }, [])

  // ── Image loaded callback ─────────────────────────────────────────────────
  const handleImageLoaded = useCallback(async (file) => {
    try {
      const { canvas, aspectRatio: ar } = await loadImageToCanvas(file)
      setSourceCanvas(canvas)
      setAspectRatio(ar)
      setFileName(file.name)
      setView('grading')
    } catch (err) {
      console.error('Failed to load image:', err)
    }
  }, [])

  // ── Reset to upload view ──────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setView('upload')
    setSourceCanvas(null)
    setFileName('')
  }, [])

  // ── Unsupported browser ───────────────────────────────────────────────────
  if (view === 'unsupported') {
    return <WebGPUUnsupported />
  }

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-cinema-bg flex items-center justify-center">
        <motion.div
          className="text-cinema-muted text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Initialising WebGPU…
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cinema-bg flex flex-col">
      <Header hasImage={view === 'grading'} onReset={handleReset} />

      <main className="flex-1 relative overflow-y-auto">
        <AnimatePresence mode="wait">
          {view === 'upload' ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <ImageUpload onImageLoaded={handleImageLoaded} />
            </motion.div>
          ) : (
            <motion.div
              key="grading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="h-full"
            >
              <GradeGrid
                sourceCanvas={sourceCanvas}
                aspectRatio={aspectRatio}
                fileName={fileName}
                renderer={rendererRef.current}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
