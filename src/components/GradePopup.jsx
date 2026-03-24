import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ToneCurveEditor from './ToneCurveEditor'
import HSLPanel from './HSLPanel'

// ── Path helpers ──────────────────────────────────────────────────────────────

function getByPath(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj)
}

function setByPath(obj, path, value) {
  const keys = path.split('.')
  const clone = structuredClone(obj)
  let cur = clone
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
  return clone
}

// ── Slider config ─────────────────────────────────────────────────────────────

const EXPOSURE_SLIDERS = [
  { label: 'Bias (EV)',    path: 'exposure.global_bias',    min: -1.5, max: 1.5, step: 0.01 },
  { label: 'Contrast',     path: 'exposure.contrast_ratio', min: 0.5,  max: 2.0, step: 0.01 },
  { label: 'Black Point',  path: 'exposure.black_point',    min: -0.3, max: 0.3, step: 0.005 },
]

const SAT_SLIDERS = [
  { label: 'Saturation', path: 'saturation.global_level', min: 0, max: 2.0, step: 0.01 },
]

const WHEEL_SECTIONS = [
  { label: 'Shadows',    prefix: 'color_wheels.lift'  },
  { label: 'Midtones',   prefix: 'color_wheels.gamma' },
  { label: 'Highlights', prefix: 'color_wheels.gain'  },
]

const WHEEL_SLIDERS = [
  { label: 'Hue',       suffix: 'hue_angle',            min: 0,    max: 360, step: 1   },
  { label: 'Intensity', suffix: 'saturation_intensity', min: 0,    max: 1,   step: 0.01 },
  { label: 'Luminance', suffix: 'luminance',            min: -0.5, max: 0.5, step: 0.005 },
]

const EFFECT_SLIDERS = [
  { label: 'Bloom', path: 'special_effects.highlight_bloom', min: 0, max: 1, step: 0.01 },
]

// ── Top-level tabs ────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { key: 'grade',  label: 'Grade'  },
  { key: 'curves', label: 'Curves' },
  { key: 'hsl',    label: 'HSL'    },
]

// ── SliderRow ─────────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, onChange }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="text-cinema-muted text-[11px] w-20 shrink-0 text-right leading-none">
        {label}
      </span>
      <input
        type="range"
        className="cinema-range flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="text-white/60 text-[11px] w-10 shrink-0 font-mono leading-none">
        {value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 2 : 0)}
      </span>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-cinema-subtle text-[10px] font-semibold uppercase tracking-widest mb-2 mt-4 first:mt-0">
      {children}
    </p>
  )
}

// ── GradePopup ────────────────────────────────────────────────────────────────

export default function GradePopup({ params, preset, anchorRect, onParamChange, onReset, onClose }) {
  const [copied, setCopied]         = useState(false)
  const [mainTab, setMainTab]       = useState('grade')
  const [wheelTab, setWheelTab]     = useState(0)
  const popupRef                    = useRef(null)
  const dragRef                     = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const POPUP_W                     = 520
  const POPUP_MAX_H                 = 580

  // ── Initial position ──────────────────────────────────────────────────────
  const initTop  = anchorRect.bottom + 8
  const initLeft = Math.max(12, Math.min(
    anchorRect.left + anchorRect.width / 2 - POPUP_W / 2,
    window.innerWidth - POPUP_W - 12,
  ))
  const [pos, setPos] = useState({ x: initLeft, y: initTop })

  // ── Drag logic ────────────────────────────────────────────────────────────
  const handleHeaderPointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    setIsDragging(true)
  }

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e) => {
      const { startX, startY, origX, origY } = dragRef.current
      setPos({ x: origX + e.clientX - startX, y: origY + e.clientY - startY })
    }
    const onUp = () => setIsDragging(false)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [isDragging])

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function onPointerDown(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Change helpers ────────────────────────────────────────────────────────
  const handleChange = useCallback((path, value) => {
    onParamChange(setByPath(params, path, value))
  }, [params, onParamChange])

  const handleCurvesChange = useCallback((newCurves) => {
    onParamChange({ ...params, tone_curves: newCurves })
  }, [params, onParamChange])

  const handleHSLChange = useCallback((newHSL) => {
    onParamChange({ ...params, hsl_targeting: newHSL })
  }, [params, onParamChange])

  // ── Copy JSON ─────────────────────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(params, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <motion.div
      ref={popupRef}
      style={{ position: 'fixed', zIndex: 9999, top: pos.y, left: pos.x, width: POPUP_W }}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-xl border border-cinema-border bg-[#0e0e0e] shadow-2xl overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-cinema-border"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onPointerDown={handleHeaderPointerDown}
      >
        <div>
          <p className="text-white text-sm font-medium leading-tight">{preset.name}</p>
          <p className="text-cinema-muted text-[11px] leading-tight mt-0.5">{preset.cinematic_term}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded-md text-cinema-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ── Main tab bar ──────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-cinema-border">
        {MAIN_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            className={[
              'flex-1 py-2.5 text-[11px] font-medium transition-colors',
              mainTab === key
                ? 'text-cinema-amber border-b-2 border-cinema-amber -mb-px'
                : 'text-cinema-muted hover:text-white',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3 overflow-y-auto" style={{ maxHeight: POPUP_MAX_H - 140 }}>
        {mainTab === 'grade' && (
          <>
            {/* Exposure */}
            <SectionLabel>Exposure</SectionLabel>
            <div className="flex flex-col gap-2">
              {EXPOSURE_SLIDERS.map(({ label, path, min, max, step }) => (
                <SliderRow
                  key={path}
                  label={label}
                  value={getByPath(params, path) ?? 0}
                  min={min} max={max} step={step}
                  onChange={(v) => handleChange(path, v)}
                />
              ))}
            </div>

            {/* Saturation */}
            <SectionLabel>Saturation</SectionLabel>
            <div className="flex flex-col gap-2">
              {SAT_SLIDERS.map(({ label, path, min, max, step }) => (
                <SliderRow
                  key={path}
                  label={label}
                  value={getByPath(params, path) ?? 1}
                  min={min} max={max} step={step}
                  onChange={(v) => handleChange(path, v)}
                />
              ))}
            </div>

            {/* Colour Wheels */}
            <SectionLabel>Color Wheels</SectionLabel>
            <div className="flex gap-1 mb-3 bg-cinema-card rounded-lg p-0.5">
              {WHEEL_SECTIONS.map(({ label }, i) => (
                <button
                  key={label}
                  onClick={() => setWheelTab(i)}
                  className={[
                    'flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                    wheelTab === i
                      ? 'bg-[#1e1e1e] text-white'
                      : 'text-cinema-muted hover:text-white',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {WHEEL_SLIDERS.map(({ label: sLabel, suffix, min, max, step }) => {
                const path = `${WHEEL_SECTIONS[wheelTab].prefix}.${suffix}`
                return (
                  <SliderRow
                    key={path}
                    label={sLabel}
                    value={getByPath(params, path) ?? 0}
                    min={min} max={max} step={step}
                    onChange={(v) => handleChange(path, v)}
                  />
                )
              })}
            </div>

            {/* Effects */}
            <SectionLabel>Effects</SectionLabel>
            <div className="flex flex-col gap-2">
              {EFFECT_SLIDERS.map(({ label, path, min, max, step }) => (
                <SliderRow
                  key={path}
                  label={label}
                  value={getByPath(params, path) ?? 0}
                  min={min} max={max} step={step}
                  onChange={(v) => handleChange(path, v)}
                />
              ))}
            </div>
          </>
        )}

        {mainTab === 'curves' && (
          <ToneCurveEditor
            toneCurves={params.tone_curves}
            onChange={handleCurvesChange}
          />
        )}

        {mainTab === 'hsl' && (
          <HSLPanel
            hslTargeting={params.hsl_targeting}
            onChange={handleHSLChange}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-cinema-border">
        <button
          onClick={onReset}
          className="text-cinema-muted hover:text-white text-xs transition-colors"
        >
          Reset to preset
        </button>

        <div className="flex items-center gap-2">
          <AnimatePresence>
            {copied && (
              <motion.span
                key="copied"
                className="text-cinema-amber text-xs"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.18 }}
              >
                Color grading values added to your clipboard.
              </motion.span>
            )}
          </AnimatePresence>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cinema-card border border-cinema-border hover:border-cinema-muted text-white text-xs font-medium transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="5" y="5" width="8" height="9" rx="1.5" strokeLinejoin="round" />
              <path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1" strokeLinecap="round" />
            </svg>
            Copy JSON
          </button>
        </div>
      </div>
    </motion.div>,
    document.body,
  )
}
