import { useState, useRef, useCallback, useEffect } from 'react'
import { computeCurveLUT } from '../gpu/WebGPURenderer'

/**
 * Interactive RGB tone-curve editor.
 *
 * Renders a canvas with a curve + draggable control points.
 * Supports Master, Red, Green, Blue channels via tabs.
 *
 * Props:
 *   toneCurves   — { enabled, master, red, green, blue } with arrays of { x, y }
 *   onChange      — (newToneCurves) => void
 */

const CANVAS_SIZE = 200     // logical px
const POINT_RADIUS = 5
const CHANNELS = ['master', 'red', 'green', 'blue']
const CHANNEL_COLORS = {
  master: '#ffffff',
  red:    '#ef4444',
  green:  '#22c55e',
  blue:   '#3b82f6',
}

const DEFAULT_POINTS = [{ x: 0, y: 0 }, { x: 1, y: 1 }]

export default function ToneCurveEditor({ toneCurves, onChange }) {
  const [activeChannel, setActiveChannel] = useState('master')
  const canvasRef = useRef(null)
  const draggingRef = useRef(null)   // { channel, index }

  const curves = toneCurves ?? {
    enabled: false,
    master: [...DEFAULT_POINTS],
    red:    [...DEFAULT_POINTS],
    green:  [...DEFAULT_POINTS],
    blue:   [...DEFAULT_POINTS],
  }

  const points = curves[activeChannel] ?? [...DEFAULT_POINTS]

  // ── Draw the curve ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const displaySize = CANVAS_SIZE

    // Scale canvas for high-DPI without changing CSS size
    canvas.width = displaySize * dpr
    canvas.height = displaySize * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const w = displaySize
    const h = displaySize

    ctx.clearRect(0, 0, w, h)

    // Background grid
    ctx.strokeStyle = '#1e1e1e'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      const p = (i / 4) * w
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke()
    }

    // Diagonal guide (identity)
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, h)
    ctx.lineTo(w, 0)
    ctx.stroke()

    // Draw inactive channels faintly
    for (const ch of CHANNELS) {
      if (ch === activeChannel) continue
      const lut = computeCurveLUT(curves[ch] ?? DEFAULT_POINTS)
      ctx.strokeStyle = CHANNEL_COLORS[ch] + '30'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * w
        const y = (1 - lut[i]) * h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // Draw active channel curve
    const lut = computeCurveLUT(points)
    ctx.strokeStyle = CHANNEL_COLORS[activeChannel]
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w
      const y = (1 - lut[i]) * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Control points
    for (const pt of points) {
      ctx.fillStyle = CHANNEL_COLORS[activeChannel]
      ctx.beginPath()
      ctx.arc(pt.x * w, (1 - pt.y) * h, POINT_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [points, activeChannel, curves])

  useEffect(() => { draw() }, [draw])

  // ── Interaction ───────────────────────────────────────────────────────────
  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)),
    }
  }

  const findNearestPoint = (pos) => {
    const w = CANVAS_SIZE
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const dx = (pos.x - points[i].x) * w
      const dy = (pos.y - points[i].y) * w
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < POINT_RADIUS * 3 && dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    return bestIdx
  }

  const handlePointerDown = (e) => {
    e.preventDefault()
    const pos = getCanvasPos(e)
    const idx = findNearestPoint(pos)

    if (idx >= 0) {
      // Start dragging existing point
      draggingRef.current = { channel: activeChannel, index: idx }
      canvasRef.current.setPointerCapture(e.pointerId)
    } else {
      // Add new point
      const newPoints = [...points, { x: pos.x, y: pos.y }].sort((a, b) => a.x - b.x)
      const newCurves = { ...curves, enabled: true, [activeChannel]: newPoints }
      onChange(newCurves)
    }
  }

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return
    const pos = getCanvasPos(e)
    const { index } = draggingRef.current
    const newPoints = [...points]

    // Don't move first/last point's X beyond its neighbours
    if (index === 0) {
      newPoints[0] = { x: 0, y: Math.max(0, Math.min(1, pos.y)) }
    } else if (index === newPoints.length - 1) {
      newPoints[index] = { x: 1, y: Math.max(0, Math.min(1, pos.y)) }
    } else {
      newPoints[index] = {
        x: Math.max(newPoints[index - 1].x + 0.01, Math.min(newPoints[index + 1].x - 0.01, pos.x)),
        y: Math.max(0, Math.min(1, pos.y)),
      }
    }

    const newCurves = { ...curves, enabled: true, [activeChannel]: newPoints }
    onChange(newCurves)
  }

  const handlePointerUp = () => {
    draggingRef.current = null
  }

  const handleDoubleClick = (e) => {
    // Double-click on a mid-point to remove it
    const pos = getCanvasPos(e)
    const idx = findNearestPoint(pos)
    if (idx > 0 && idx < points.length - 1) {
      const newPoints = points.filter((_, i) => i !== idx)
      const newCurves = { ...curves, enabled: true, [activeChannel]: newPoints }
      onChange(newCurves)
    }
  }

  const handleReset = () => {
    onChange({
      enabled: false,
      master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      red:    [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      green:  [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      blue:   [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    })
  }

  return (
    <div>
      {/* Channel tabs */}
      <div className="flex gap-1 mb-3 bg-cinema-card rounded-lg p-0.5">
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={[
              'flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors capitalize',
              activeChannel === ch
                ? 'bg-[#1e1e1e] text-white'
                : 'text-cinema-muted hover:text-white',
            ].join(' ')}
            style={activeChannel === ch ? { color: CHANNEL_COLORS[ch] } : undefined}
          >
            {ch === 'master' ? 'Master' : ch.charAt(0).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Curve canvas */}
      <div className="relative bg-cinema-bg rounded-lg border border-cinema-border overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{ width: '100%', aspectRatio: '1', cursor: 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-cinema-subtle text-[10px]">
          Click to add · Double-click to remove
        </span>
        <button
          onClick={handleReset}
          className="text-cinema-muted hover:text-white text-[11px] transition-colors"
        >
          Reset curves
        </button>
      </div>
    </div>
  )
}
