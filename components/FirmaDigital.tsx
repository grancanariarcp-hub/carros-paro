'use client'
import { useRef, useState, useEffect, useCallback } from 'react'

export interface DatosFirma {
  blob: Blob           // PNG de la firma
  nombre: string
  cargo: string
  firmadoEn: Date
}

interface Props {
  nombreSugerido?: string   // Pre-rellena el nombre con el del auditor autenticado
  cargoSugerido?: string
  onConfirmar: (datos: DatosFirma) => void
  onCancelar: () => void
  guardando?: boolean
}

export default function FirmaDigital({
  nombreSugerido = '',
  cargoSugerido = '',
  onConfirmar,
  onCancelar,
  guardando = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dibujando, setDibujando] = useState(false)
  const [hayTrazo, setHayTrazo] = useState(false)
  const [nombre, setNombre] = useState(nombreSugerido)
  const [cargo, setCargo] = useState(cargoSugerido)
  const ultimoPunto = useRef<{ x: number; y: number } | null>(null)

  // Inicializar canvas con fondo blanco
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Fondo blanco explícito para que el PNG no sea transparente
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Línea guía para la firma
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(24, canvas.height - 40)
    ctx.lineTo(canvas.width - 24, canvas.height - 40)
    ctx.stroke()
    ctx.setLineDash([])
  }, [])

  function coordsFromEvent(
    e: React.TouchEvent | React.MouseEvent,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      }
    } else {
      return {
        x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
        y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
      }
    }
  }

  function iniciarTrazo(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    setDibujando(true)
    setHayTrazo(true)
    ultimoPunto.current = coordsFromEvent(e, canvas)
  }

  function continuar(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    if (!dibujando) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !ultimoPunto.current) return

    const punto = coordsFromEvent(e, canvas)

    ctx.beginPath()
    ctx.moveTo(ultimoPunto.current.x, ultimoPunto.current.y)
    ctx.lineTo(punto.x, punto.y)
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    ultimoPunto.current = punto
  }

  function terminarTrazo(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    setDibujando(false)
    ultimoPunto.current = null
  }

  function limpiar() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Redibujar línea guía
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(24, canvas.height - 40)
    ctx.lineTo(canvas.width - 24, canvas.height - 40)
    ctx.stroke()
    ctx.setLineDash([])

    setHayTrazo(false)
  }

  async function confirmar() {
    if (!hayTrazo) return
    if (!nombre.trim()) return

    const canvas = canvasRef.current
    if (!canvas) return

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => {
        if (b) resolve(b)
        else reject(new Error('No se pudo generar el PNG'))
      }, 'image/png', 0.92)
    })

    onConfirmar({
      blob,
      nombre: nombre.trim(),
      cargo: cargo.trim(),
      firmadoEn: new Date(),
    })
  }

  const camposOk = hayTrazo && nombre.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Firma del control</div>
            <div className="text-xs text-gray-400">Firma en el recuadro con el dedo</div>
          </div>
          <button onClick={onCancelar} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-3">
          {/* Datos del firmante */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre *</label>
              <input
                type="text"
                className="input"
                placeholder="Nombre completo"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label">Cargo</label>
              <input
                type="text"
                className="input"
                placeholder="Ej: Enfermera/o"
                value={cargo}
                onChange={e => setCargo(e.target.value)}
              />
            </div>
          </div>

          {/* Canvas de firma */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Firma *</label>
              {hayTrazo && (
                <button
                  onClick={limpiar}
                  className="text-xs text-blue-600 font-semibold">
                  Borrar y repetir
                </button>
              )}
            </div>

            <div className="relative border-2 border-gray-200 rounded-2xl overflow-hidden bg-white"
              style={{ touchAction: 'none' }}>
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="w-full"
                style={{ cursor: 'crosshair', display: 'block' }}
                onMouseDown={iniciarTrazo}
                onMouseMove={continuar}
                onMouseUp={terminarTrazo}
                onMouseLeave={terminarTrazo}
                onTouchStart={iniciarTrazo}
                onTouchMove={continuar}
                onTouchEnd={terminarTrazo}
              />
              {!hayTrazo && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-gray-300 text-sm select-none">Firma aquí</span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Firma con el dedo o el ratón. Al confirmar, se guardará como imagen con fecha y hora.
            </p>
          </div>

          {/* Timestamp informativo */}
          <div className="px-3 py-2 bg-gray-50 rounded-xl text-xs text-gray-500">
            📅 Se registrará como: <strong>{new Date().toLocaleString('es-ES', {
              day: '2-digit', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}</strong>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!camposOk || guardando}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {guardando ? 'Guardando...' : 'Confirmar y guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
