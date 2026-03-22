import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Header     from './components/Header'
import ImageUpload from './components/ImageUpload'
import GradeGrid  from './components/GradeGrid'
import { loadImageToCanvas } from './utils/colorProcessor'

/**
 * Top-level app shell — manages the two main view states:
 *   'upload'  — no image loaded yet (drop zone + hero copy)
 *   'grading' — image has been loaded, show the 2×3 grade grid
 */
export default function App() {
  const [view, setView]                 = useState('upload')
  const [sourceCanvas, setSourceCanvas] = useState(null)
  const [aspectRatio, setAspectRatio]   = useState(16 / 9)
  const [fileName, setFileName]         = useState('')

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

  const handleReset = useCallback(() => {
    setView('upload')
    setSourceCanvas(null)
    setFileName('')
  }, [])

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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
