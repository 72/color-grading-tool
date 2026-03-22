import { motion } from 'framer-motion'

export default function Header({ hasImage, onReset }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-cinema-border">
      {/* Logo + wordmark */}
      <motion.div
        className="flex items-center gap-3 cursor-pointer select-none"
        onClick={hasImage ? onReset : undefined}
        whileHover={hasImage ? { opacity: 0.75 } : {}}
        transition={{ duration: 0.15 }}
      >
        {/* Icon — 2×2 grid of squares with one amber accent */}
        <div className="grid grid-cols-2 gap-[3px] w-7 h-7">
          <div className="rounded-[2px] bg-cinema-amber" />
          <div className="rounded-[2px] bg-cinema-subtle" />
          <div className="rounded-[2px] bg-cinema-subtle" />
          <div className="rounded-[2px] bg-cinema-subtle" />
        </div>

        <span className="text-white font-semibold tracking-tight text-lg leading-none">
          CineGrade
        </span>
      </motion.div>

      {/* Right slot */}
      <div className="flex items-center gap-4">
        {hasImage && (
          <motion.button
            onClick={onReset}
            className="text-sm text-cinema-muted hover:text-white transition-colors duration-150 px-3 py-1.5 rounded-md hover:bg-cinema-hover"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
          >
            New image
          </motion.button>
        )}

        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cinema-muted hover:text-white transition-colors duration-150"
          aria-label="GitHub"
        >
          <svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>
      </div>
    </header>
  )
}
