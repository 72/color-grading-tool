/**
 * CineGrade — Image loading utility.
 *
 * The per-pixel grading engine has been replaced by the WebGPU/WGSL
 * pipeline (see src/gpu/).  This module now only provides the image
 * loader that feeds the raw canvas to the GPU renderer.
 */

/**
 * Load an image File/Blob into an off-screen canvas at its natural size.
 * Returns a promise that resolves to { canvas, width, height, aspectRatio }.
 */
export function loadImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve({
        canvas,
        width: img.naturalWidth,
        height: img.naturalHeight,
        aspectRatio: img.naturalWidth / img.naturalHeight,
      })
    }
    img.onerror = reject
    img.src = url
  })
}
