'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { urlVisible } from '@/lib/evidencias'

/**
 * Muestra una firma, un precinto o una foto de incidencia.
 *
 * Las evidencias ya no son públicas —la firma manuscrita de cada inspección se
 * descargaba con solo tener la URL—, así que hay que pedir un enlace firmado
 * antes de poder verlas. Este componente lo hace por su cuenta para que las
 * pantallas no tengan que saberlo.
 *
 * Mientras llega el enlace se deja el hueco reservado con el mismo tamaño: sin
 * eso, la ficha da un salto cuando aparece la imagen.
 */
export default function ImagenEvidencia({
  src,
  alt,
  className,
  style,
  crossOrigin,
}: {
  src: string | null | undefined
  alt: string
  className?: string
  style?: React.CSSProperties
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let vigente = true
    setFallo(false)

    if (!src) { setUrl(null); return }

    urlVisible(createClient(), src).then(u => { if (vigente) setUrl(u) })
    return () => { vigente = false }
  }, [src])

  if (!src) return null

  if (fallo) {
    return (
      <div className={className} style={{
        ...style,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f3f4f6', color: '#9ca3af', fontSize: '0.7rem',
        textAlign: 'center', padding: '0.5rem',
      }}>
        No se pudo cargar la imagen
      </div>
    )
  }

  if (!url) {
    // Hueco del mismo tamaño, para que nada salte al llegar la imagen.
    return <div className={className} style={{ ...style, background: '#f3f4f6' }} aria-hidden="true" />
  }

  return (
    <img src={url} alt={alt} className={className} style={style}
      crossOrigin={crossOrigin} onError={() => setFallo(true)} />
  )
}
