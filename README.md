# CineGrade

A browser-based cinema color grading comparison tool. Upload any photo and instantly see it rendered across 6 professional cinematic presets in a 2×3 grid — entirely in your browser, with no data ever leaving your device.

![CineGrade preview](public/favicon.svg)

## Presets

| Preset | Style |
|---|---|
| **Cyan–Amber** | Blockbuster / High-Density Contrast |
| **Silver Retention** | ENR Process / Gritty / Industrial |
| **Low-Key Noir** | Chiaroscuro / Moody / Dramatic |
| **Golden Hour** | Nostalgic High-Key / Halation / Romantic |
| **Monochromatic** | Single-Hue Saturation (Matrix-style green) |
| **Naturalism** | Linear / Faithful Reproduction |

Each preset is defined as a JSON object in `src/data/presets.json` and implements a full lift / gamma / gain color wheel pipeline with exposure, contrast, saturation, and special effects (film grain, highlight bloom).

## Tech stack

- [React 18](https://react.dev) + [Vite](https://vitejs.dev)
- [Tailwind CSS v3](https://tailwindcss.com)
- [Framer Motion](https://www.framer.com/motion/)
- [Lucide React](https://lucide.dev) for icons
- Native Canvas 2D API for all image processing — no WebGL, no server

## Getting started

```bash
# Clone
git clone https://github.com/your-username/color-grading-tool.git
cd color-grading-tool

# Install
npm install

# Develop
npm run dev

# Build for production
npm run build

# Preview the production build locally
npm run preview
```

The dev server runs at `http://localhost:5173` by default.

## Adding or editing presets

Presets live in `src/data/presets.json`. Each entry follows this schema:

```json
{
  "id": "grade_my_preset",
  "name": "My Preset",
  "cinematic_term": "Style / Mood",
  "technical_summary": "One-line description of what this grade does.",
  "parameters": {
    "exposure": {
      "global_bias": 0.0,       // EV stops (-2 … +2)
      "contrast_ratio": 1.0,    // 0.5 = flat, 2.0 = very punchy
      "black_point": 0.0        // negative = crush, positive = lift (milky)
    },
    "saturation": {
      "global_level": 1.0       // 0 = B&W, 1 = neutral, 1.5 = vivid
    },
    "color_wheels": {
      "lift":  { "hue_angle": 0, "saturation_intensity": 0.0, "luminance": 0.0 },
      "gamma": { "hue_angle": 0, "saturation_intensity": 0.0, "luminance": 0.0 },
      "gain":  { "hue_angle": 0, "saturation_intensity": 0.0, "luminance": 0.0 }
    },
    "special_effects": {
      "film_grain": "none"       // "none" | "fine" | "medium" | "heavy"
    }
  }
}
```

`hue_angle` follows standard colour theory: 0° = red, 60° = yellow, 120° = green, 180° = cyan, 240° = blue, 300° = magenta.

## Privacy

All image processing is performed with the browser's Canvas 2D API. No image data, pixel values, or metadata is transmitted anywhere. There is no backend, no analytics, and no API keys required.

## License

MIT
