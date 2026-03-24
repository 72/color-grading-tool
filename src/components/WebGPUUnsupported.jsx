import { motion } from 'framer-motion'

/**
 * Friendly fallback screen shown when the browser doesn't support WebGPU.
 */
export default function WebGPUUnsupported() {
  return (
    <div className="min-h-screen bg-cinema-bg flex flex-col items-center justify-center px-6">
      <motion.div
        className="text-center max-w-lg"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* GPU icon */}
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-cinema-card border border-cinema-border flex items-center justify-center">
          <svg className="w-8 h-8 text-cinema-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <path d="M8 6V4m4 2V4m4 2V4M8 18v2m4-2v2m4-2v2" strokeLinecap="round" />
            <path d="M9 10l2 2-2 2m4-4l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-white tracking-tight mb-3">
          WebGPU Required
        </h1>

        <p className="text-cinema-muted text-base leading-relaxed mb-6">
          CineGrade uses WebGPU for real-time, GPU-accelerated color grading
          powered by WGSL shaders. Your browser doesn't support WebGPU yet.
        </p>

        <div className="bg-cinema-card border border-cinema-border rounded-xl p-5 text-left">
          <p className="text-white text-sm font-medium mb-3">Supported browsers</p>
          <ul className="space-y-2 text-cinema-muted text-sm">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Chrome 113+ / Edge 113+ (recommended)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
              Safari 18+ (macOS Sequoia / iOS 18)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
              Firefox Nightly (behind <code className="text-cinema-amber text-xs">dom.webgpu.enabled</code> flag)
            </li>
          </ul>
        </div>

        <p className="text-cinema-subtle text-xs mt-6">
          All image processing happens locally on your GPU — nothing is uploaded.
        </p>
      </motion.div>
    </div>
  )
}
