import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff']
const MAX_SIZE_MB = 20

function FilmFrameIcon() {
  return (
    <svg className="w-10 h-10 text-cinema-subtle" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="10" width="40" height="28" rx="3" />
      <rect x="4" y="14" width="6" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
      <rect x="4" y="22" width="6" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
      <rect x="4" y="30" width="6" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
      <rect x="38" y="14" width="6" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
      <rect x="38" y="22" width="6" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
      <rect x="38" y="30" width="6" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.4" />
      <circle cx="24" cy="24" r="7" />
      <circle cx="24" cy="24" r="3" />
    </svg>
  )
}

export default function ImageUpload({ onImageLoaded }) {
  const [isDragging, setIsDragging]  = useState(false)
  const [error, setError]             = useState(null)
  const inputRef                      = useRef(null)

  const validate = (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Only JPEG, PNG, WebP, and TIFF files are supported.'
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File size must be under ${MAX_SIZE_MB} MB.`
    }
    return null
  }

  const handleFile = useCallback((file) => {
    setError(null)
    const err = validate(file)
    if (err) { setError(err); return }
    onImageLoaded(file)
  }, [onImageLoaded])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = ()  => setIsDragging(false)
  const onInputChange = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Hero copy */}
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      >
        <h1 className="text-4xl font-semibold text-white tracking-tight mb-3">
          Cinema color in seconds
        </h1>
        <p className="text-cinema-muted text-base max-w-md leading-relaxed">
          Upload any photo and instantly compare{' '}
          <span className="text-white font-medium">6 cinematic color grades</span> — all
          processed locally in your browser. Nothing leaves your device.
        </p>
      </motion.div>

      {/* Drop zone */}
      <motion.div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'relative w-full max-w-xl rounded-2xl border-2 border-dashed cursor-pointer',
          'flex flex-col items-center justify-center gap-5 py-16 px-8',
          'transition-colors duration-200 select-none',
          isDragging
            ? 'border-cinema-amber bg-cinema-amber/5'
            : 'border-cinema-subtle bg-cinema-card hover:border-cinema-muted hover:bg-cinema-hover',
        ].join(' ')}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.998 }}
      >
        <AnimatePresence mode="wait">
          {isDragging ? (
            <motion.div
              key="dragging"
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="w-14 h-14 rounded-full bg-cinema-amber/15 flex items-center justify-center">
                <svg className="w-7 h-7 text-cinema-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4m0 0L8 8m4-4l4 4" />
                  <path d="M4 20h16" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-cinema-amber font-medium">Drop to grade</span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              className="flex flex-col items-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <FilmFrameIcon />
              <div className="text-center">
                <p className="text-white font-medium mb-1">
                  Drop an image here
                </p>
                <p className="text-cinema-muted text-sm">
                  or{' '}
                  <span className="text-cinema-amber underline underline-offset-2">
                    browse your files
                  </span>
                </p>
              </div>
              <p className="text-cinema-subtle text-xs">
                JPEG, PNG, WebP, TIFF — up to 20 MB
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          onChange={onInputChange}
        />
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            className="mt-4 text-sm text-red-400 text-center"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Preset pill badges */}
      <motion.div
        className="mt-10 flex flex-wrap gap-2 justify-center max-w-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        {[
          'Cyan–Amber',
          'Silver Retention',
          'Low-Key Noir',
          'Golden Hour',
          'Monochromatic',
          'Naturalism',
        ].map((name) => (
          <span
            key={name}
            className="px-3 py-1 rounded-full text-xs bg-cinema-card border border-cinema-border text-cinema-muted"
          >
            {name}
          </span>
        ))}
      </motion.div>
    </motion.div>
  )
}
