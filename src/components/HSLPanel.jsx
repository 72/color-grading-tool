import { useCallback } from 'react'

/**
 * HSL Targeting panel — lets the user add qualifiers to selectively
 * adjust hue ranges in the image (e.g. "make blues more saturated").
 *
 * Props:
 *   hslTargeting — array of qualifier objects (up to 6)
 *   onChange     — (newArray) => void
 */

const MAX_QUALIFIERS = 6

const HUE_NAMES = [
  { angle: 0,   name: 'Red',     color: '#ef4444' },
  { angle: 30,  name: 'Orange',  color: '#f97316' },
  { angle: 60,  name: 'Yellow',  color: '#eab308' },
  { angle: 120, name: 'Green',   color: '#22c55e' },
  { angle: 180, name: 'Cyan',    color: '#06b6d4' },
  { angle: 240, name: 'Blue',    color: '#3b82f6' },
  { angle: 300, name: 'Magenta', color: '#a855f7' },
]

function defaultQualifier() {
  return {
    target_hue: 0,
    hue_range: 60,
    hue_shift: 0,
    sat_scale: 1.0,
    lum_offset: 0,
    softness: 30,
  }
}

function QualifierSlider({ label, value, min, max, step, onChange, unit }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="text-cinema-muted text-[11px] w-16 shrink-0 text-right leading-none">
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
      <span className="text-white/60 text-[11px] w-12 shrink-0 font-mono leading-none">
        {value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}{unit ?? ''}
      </span>
    </div>
  )
}

function HuePresetBar({ targetHue, onChange }) {
  return (
    <div className="flex gap-1 mb-2">
      {HUE_NAMES.map(({ angle, name, color }) => {
        const d = Math.abs(targetHue - angle)
        const isActive = Math.min(d, 360 - d) < 15
        return (
          <button
            key={angle}
            onClick={() => onChange(angle)}
            className={[
              'flex-1 py-1 rounded text-[9px] font-medium transition-all',
              isActive ? 'ring-1 ring-white/40' : 'opacity-60 hover:opacity-100',
            ].join(' ')}
            style={{ backgroundColor: color + '30', color }}
            title={name}
          >
            {name.slice(0, 3)}
          </button>
        )
      })}
    </div>
  )
}

export default function HSLPanel({ hslTargeting, onChange }) {
  const qualifiers = hslTargeting ?? []

  const handleAdd = useCallback(() => {
    if (qualifiers.length >= MAX_QUALIFIERS) return
    onChange([...qualifiers, defaultQualifier()])
  }, [qualifiers, onChange])

  const handleRemove = useCallback((idx) => {
    onChange(qualifiers.filter((_, i) => i !== idx))
  }, [qualifiers, onChange])

  const handleUpdate = useCallback((idx, field, value) => {
    const updated = qualifiers.map((q, i) =>
      i === idx ? { ...q, [field]: value } : q,
    )
    onChange(updated)
  }, [qualifiers, onChange])

  return (
    <div>
      {qualifiers.length === 0 && (
        <p className="text-cinema-subtle text-[11px] text-center py-4">
          No HSL qualifiers yet. Add one to target a specific hue range.
        </p>
      )}

      {qualifiers.map((q, idx) => (
        <div
          key={idx}
          className="mb-3 p-3 rounded-lg bg-cinema-bg border border-cinema-border"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-[11px] font-medium">
              Qualifier {idx + 1}
            </span>
            <button
              onClick={() => handleRemove(idx)}
              className="text-cinema-muted hover:text-red-400 text-[11px] transition-colors"
            >
              Remove
            </button>
          </div>

          <HuePresetBar
            targetHue={q.target_hue}
            onChange={(v) => handleUpdate(idx, 'target_hue', v)}
          />

          <div className="flex flex-col gap-2">
            <QualifierSlider
              label="Hue"
              value={q.target_hue}
              min={0} max={360} step={1}
              unit="°"
              onChange={(v) => handleUpdate(idx, 'target_hue', v)}
            />
            <QualifierSlider
              label="Range"
              value={q.hue_range}
              min={10} max={180} step={1}
              unit="°"
              onChange={(v) => handleUpdate(idx, 'hue_range', v)}
            />
            <QualifierSlider
              label="Shift"
              value={q.hue_shift}
              min={-180} max={180} step={1}
              unit="°"
              onChange={(v) => handleUpdate(idx, 'hue_shift', v)}
            />
            <QualifierSlider
              label="Saturation"
              value={q.sat_scale}
              min={0} max={3} step={0.01}
              onChange={(v) => handleUpdate(idx, 'sat_scale', v)}
            />
            <QualifierSlider
              label="Luminance"
              value={q.lum_offset}
              min={-0.5} max={0.5} step={0.005}
              onChange={(v) => handleUpdate(idx, 'lum_offset', v)}
            />
            <QualifierSlider
              label="Softness"
              value={q.softness}
              min={1} max={90} step={1}
              unit="°"
              onChange={(v) => handleUpdate(idx, 'softness', v)}
            />
          </div>
        </div>
      ))}

      {qualifiers.length < MAX_QUALIFIERS && (
        <button
          onClick={handleAdd}
          className="w-full py-2 rounded-lg border border-dashed border-cinema-border text-cinema-muted hover:text-white hover:border-cinema-muted text-[11px] font-medium transition-colors"
        >
          + Add qualifier
        </button>
      )}
    </div>
  )
}
