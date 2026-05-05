/**
 * Utilidades de compresión y optimización de imágenes en el navegador
 * antes de subirlas a Supabase Storage. Usa Canvas API (sin dependencias).
 *
 * Reduce el tamaño de archivo entre 70-95% sin pérdida visible:
 *   - Foto móvil 4032×3024 (5.2 MB) → 1600×1200 WebP q=0.85 (~180 KB)
 *   - Foto cámara 1920×1080 (450 KB) → 1600×900 WebP q=0.85 (~75 KB)
 *   - PNG logo 1024×1024 (320 KB) → 400×400 PNG (~30 KB) o WebP (~12 KB)
 *
 * Casos especiales:
 *   - SVG: se devuelve tal cual (vector = mínimo espacio nativo).
 *   - Imágenes ya pequeñas (<100KB y dentro de maxWidth): sin cambio.
 *   - Transparencia detectada: usa PNG o WebP (no JPEG que la perdería).
 */

export interface CompressOptions {
  /** Ancho máximo en píxeles. Default 1600. */
  maxWidth?: number
  /** Alto máximo en píxeles. Default 1600. */
  maxHeight?: number
  /** 0..1 — calidad para JPEG/WebP. Default 0.85. */
  quality?: number
  /**
   * 'auto' detecta si tiene transparencia y elige el formato óptimo.
   * Si fuerzas 'jpeg' y la imagen tiene transparencia, se pierde (fondo blanco).
   */
  format?: 'auto' | 'webp' | 'jpeg' | 'png'
  /** Tamaño máximo del original que se devuelve sin tocar (bytes). Default 100KB. */
  skipBelowSize?: number
}

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.85,
  format: 'auto',
  skipBelowSize: 100_000,
}

/** Detecta si el navegador soporta encoding WebP via canvas.toBlob. */
let _webpSupport: boolean | null = null
async function supportsWebP(): Promise<boolean> {
  if (_webpSupport !== null) return _webpSupport
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1; canvas.height = 1
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), 'image/webp', 0.85)
    )
    _webpSupport = !!blob && blob.type === 'image/webp'
  } catch {
    _webpSupport = false
  }
  return _webpSupport
}

/**
 * Detecta si una imagen tiene alguna transparencia (alpha < 255).
 * Solo se llama tras cargarla en canvas para no leer bytes innecesarios.
 */
function tieneTransparencia(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Muestreamos: 100 puntos repartidos. Si alguno tiene alpha < 255, es transparente.
  const stepX = Math.max(1, Math.floor(w / 10))
  const stepY = Math.max(1, Math.floor(h / 10))
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const pixel = ctx.getImageData(x, y, 1, 1).data
      if (pixel[3] < 255) return true
    }
  }
  return false
}

/**
 * Comprime una imagen. Devuelve un nuevo File listo para subir.
 *
 * Si el archivo es SVG, lo devuelve tal cual (ya es óptimo).
 * Si es muy pequeño (< skipBelowSize) y dentro de las dimensiones, sin cambio.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const o = { ...DEFAULTS, ...opts }

  // SVG: vectorial, ya óptimo
  if (file.type === 'image/svg+xml') return file

  // Si es muy pequeño, devolver tal cual (después de verificar dimensiones)
  if (file.size < o.skipBelowSize) {
    const dims = await getDimensions(file).catch(() => null)
    if (dims && dims.width <= o.maxWidth && dims.height <= o.maxHeight) {
      return file
    }
  }

  // Cargar imagen
  const img = await loadImageElement(file)

  // Calcular nuevas dimensiones manteniendo aspect ratio
  const ratio = Math.min(o.maxWidth / img.width, o.maxHeight / img.height, 1)
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)

  // Pintar en canvas
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('No se pudo crear el contexto canvas')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  // Decidir formato
  let mime = 'image/jpeg'
  let extension = 'jpg'
  if (o.format === 'auto') {
    // Si la imagen original es PNG o WebP, asumimos que puede tener transparencia
    const probableTransparente = file.type === 'image/png' || file.type === 'image/webp'
    const realmenteTransparente = probableTransparente && tieneTransparencia(ctx, w, h)
    if (realmenteTransparente) {
      // Mantener transparencia → WebP (mejor compresión que PNG) o PNG fallback
      const webp = await supportsWebP()
      mime = webp ? 'image/webp' : 'image/png'
      extension = webp ? 'webp' : 'png'
    } else {
      // Sin transparencia → WebP (mucho mejor que JPEG) o JPEG fallback
      const webp = await supportsWebP()
      mime = webp ? 'image/webp' : 'image/jpeg'
      extension = webp ? 'webp' : 'jpg'
    }
  } else {
    mime = `image/${o.format === 'jpeg' ? 'jpeg' : o.format}`
    extension = o.format === 'jpeg' ? 'jpg' : o.format
  }

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(b => resolve(b), mime, o.quality)
  )
  if (!blob) {
    // Fallback: si el formato pedido falló, devolver el original
    return file
  }

  // Si la "compresión" pesa MÁS que el original, devolver original
  if (blob.size >= file.size) return file

  // Renombrar respetando el nombre base (algunos servidores se sobre el ext)
  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.${extension}`, { type: mime })
}

/**
 * Compresor preconfigurado para fotos de incidencias y evidencias clínicas.
 * Calidad alta (suficiente para auditoría ISO) pero peso máx ~300 KB.
 */
export function compressFotoIncidencia(file: File): Promise<File> {
  return compressImage(file, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.85,
    format: 'auto',
  })
}

/**
 * Compresor preconfigurado para logos institucionales.
 * Logo no necesita ser muy grande (max 400px en lado mayor).
 */
export function compressLogo(file: File): Promise<File> {
  return compressImage(file, {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.92,
    format: 'auto',
  })
}

// ────────────────────────────────────────────────────────────────────────
// Internos
// ────────────────────────────────────────────────────────────────────────

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

async function getDimensions(file: File): Promise<{ width: number; height: number }> {
  const img = await loadImageElement(file)
  return { width: img.width, height: img.height }
}

/** Diagnóstico humano del ratio antes/después. */
export function ratioCompresion(antes: number, despues: number): string {
  if (antes === 0) return '—'
  const pct = Math.round((1 - despues / antes) * 100)
  return `${(antes / 1024).toFixed(0)} KB → ${(despues / 1024).toFixed(0)} KB (-${pct}%)`
}
