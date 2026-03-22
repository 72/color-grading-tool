# AI Generation Prompt: Professional CineGrade Tool

Build a high-end, single-page React application for cinematic color grading called "CineGrade." The application must feel like a professional post-production suite (e.g., DaVinci Resolve or Adobe Premiere) rather than a simple photo filter app.

## 1. Visual Identity & UI
- **Aesthetic**: Deep charcoal/obsidian dark mode interface. Use a high-density, "utilitarian-chic" layout with thin borders, monospaced typography for metadata, and a strict grid system.
- **Layout**: 
    - A slim, persistent header with branding and global actions.
    - A prominent "Hero" area for the original image upload.
    - A sophisticated "Grade Grid" displaying a real-time gallery of the uploaded image processed through various cinematic presets.
    - Each "Tile" in the grid should show the preset name, its cinematic intent (e.g., "High-Key Noir"), and a technical summary.

## 2. Technical Architecture
- **Framework**: React with Tailwind CSS for styling.
- **Core Engine**: Implement a high-performance, client-side pixel manipulation engine using the HTML5 Canvas API.
- **Processing Pipeline**:
    - **Linear-Space Workflow**: All color math must occur in linear light space (converting sRGB to Linear before processing and back to sRGB for display).
    - **Tonal Range Control**: Use smooth, overlapping power-function curves (not linear ramps) to define Shadows, Midtones, and Highlights.
    - **Contrast Model**: Implement an S-Curve contrast model that pivots at 18% gray (Middle Gray).
    - **Highlight Roll-off**: Include a soft-knee compression curve for highlights to prevent digital clipping and emulate film-stock halation.
    - **Shadow Management**: Use a non-linear black-lift function that "milks" the deep blacks without washing out midtone density.

## 3. Data Structure (Cinematographer's Preset Schema)
Structure a `presets.json` file as if it were exported from a professional grading console. Each preset object should contain:
- **Metadata**: Unique ID, Display Name, "Cinematic Term" (e.g., "Day-for-Night"), and a "Technical Summary" explaining the color science.
- **Exposure Module**: Global bias (EV stops), Contrast ratio, and Black point (lift/crush).
- **Saturation Module**: Global chrominance levels.
- **Color Wheels (Lift/Gamma/Gain)**: A tripartite model where each wheel defines:
    - **Hue Angle**: The color vector of the tint (0-360°).
    - **Saturation Intensity**: The strength of the tint wash.
    - **Luminance**: Fine-tuned brightness offsets for that specific tonal range.
- **Special Effects Module**: Support for parameterized "Film Grain" (varying intensity/density) and "Highlight Bloom" (diffusion/glow intensity).

## 4. Interaction Design
- **Upload**: Drag-and-drop zone that extracts image metadata and initializes the canvas at natural resolution.
- **Real-time Preview**: As presets are applied, the engine should mutate pixel data in-place for maximum performance, providing near-instant visual feedback.
- **Download**: Ability to export the processed canvas as a high-quality, delinearized JPEG.
