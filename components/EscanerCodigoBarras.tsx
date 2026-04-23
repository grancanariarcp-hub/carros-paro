'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onResult: (codigo: string) => void
  onClose: () => void
}

export default function EscanerCodigoBarras({ onResult, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(true)
  const [resultado, setResultado] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const readerRef = useRef<any>(null)
  const yaLeyoRef = useRef(false)

  useEffect(() => {
    let montado = true

    async function iniciar() {
      try {
        // Cargar ZXing
        if (!(window as any).ZXing) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('No se pudo cargar el escáner'))
            document.head.appendChild(script)
          })
        }

        if (!montado) return

        // Obtener cámara
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        })

        if (!montado) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Iniciar lector ZXing
        const ZXing = (window as any).ZXing
        const hints = new Map()
        const formats = [
          ZXing.BarcodeFormat.CODE_128,
          ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.CODE_93,
          ZXing.BarcodeFormat.EAN_13,
          ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.ITF,
          ZXing.BarcodeFormat.PDF_417,
          ZXing.BarcodeFormat.DATA_MATRIX,
          ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.AZTEC,
          ZXing.BarcodeFormat.CODABAR,
        ]
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats)
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true)

        const reader = new ZXing.MultiFormatReader()
        reader.setHints(hints)
        readerRef.current = reader

        if (montado) setIniciando(false)

        // Loop de escaneo
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        function escanear() {
          if (!montado || yaLeyoRef.current) return
          const video = videoRef.current
          if (!video || video.readyState < 2) {
            requestAnimationFrame(escanear)
            return
          }

          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)

          try {
            const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height)
            if (imageData) {
              const luminanceSource = new ZXing.RGBLuminanceSource(imageData.data, canvas.width, canvas.height)
              const binaryBitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminanceSource))
              const result = reader.decode(binaryBitmap)
              if (result && !yaLeyoRef.current) {
                yaLeyoRef.current = true
                detener()
                if (montado) {
                  setResultado(result.getText())
                  setTimeout(() => onResult(result.getText()), 300)
                }
              }
            }
          } catch {
            // Sin código en este frame — continuar
          }

          if (!yaLeyoRef.current && montado) {
            requestAnimationFrame(escanear)
          }
        }

        requestAnimationFrame(escanear)

      } catch (err: any) {
        if (montado) {
          if (err.name === 'NotAllowedError') {
            setError('Permiso de cámara denegado. Activa la cámara en los ajustes del navegador.')
          } else {
            setError(err.message || 'No se pudo acceder a la cámara')
          }
          setIniciando(false)
        }
      }
    }

    iniciar()

    return () => {
      montado = false
      detener()
    }
  }, [])

  function detener() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  function cerrar() {
    yaLeyoRef.current = true
    detener()
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: '20px', overflow: 'hidden',
        width: '100%', maxWidth: '400px', margin: '0 1rem',
      }}>
        {/* Header */}
        <div style={{
          background: '#111827', padding: '1rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{color: 'white', fontWeight: 700, fontSize: '0.9rem'}}>Escanear código</div>
            <div style={{color: '#9ca3af', fontSize: '0.7rem', marginTop: '2px'}}>
              Centra el código en el recuadro
            </div>
          </div>
          <button onClick={cerrar} style={{
            color: '#9ca3af', background: 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: '8px', width: '32px', height: '32px',
            cursor: 'pointer', fontSize: '1.1rem',
          }}>✕</button>
        </div>

        {/* Visor */}
        <div style={{position: 'relative', background: '#000', minHeight: '240px', overflow: 'hidden'}}>

          {/* Video */}
          <video
            ref={videoRef}
            style={{width: '100%', display: iniciando || error ? 'none' : 'block'}}
            muted playsInline
          />

          {/* Guía de escaneo */}
          {!iniciando && !error && !resultado && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                width: '280px', height: '140px', position: 'relative',
              }}>
                {/* Esquinas del visor */}
                {[
                  {top:0, left:0, borderTop:'3px solid #3b82f6', borderLeft:'3px solid #3b82f6'},
                  {top:0, right:0, borderTop:'3px solid #3b82f6', borderRight:'3px solid #3b82f6'},
                  {bottom:0, left:0, borderBottom:'3px solid #3b82f6', borderLeft:'3px solid #3b82f6'},
                  {bottom:0, right:0, borderBottom:'3px solid #3b82f6', borderRight:'3px solid #3b82f6'},
                ].map((s, i) => (
                  <div key={i} style={{position:'absolute', width:'20px', height:'20px', ...s}} />
                ))}
                {/* Línea de escaneo animada */}
                <div style={{
                  position: 'absolute', left: '8px', right: '8px', height: '2px',
                  background: 'rgba(59,130,246,0.8)',
                  animation: 'scan 2s linear infinite',
                  top: '50%',
                }} />
              </div>
            </div>
          )}

          {/* Estado iniciando */}
          {iniciando && !error && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: '#111',
            }}>
              <div style={{color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center'}}>
                <div style={{marginBottom: '8px', fontSize: '1.5rem'}}>📷</div>
                Iniciando cámara...
              </div>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)',
            }}>
              <div style={{textAlign: 'center', color: 'white'}}>
                <div style={{fontSize: '2rem', marginBottom: '8px'}}>✓</div>
                <div style={{fontSize: '0.9rem', fontWeight: 700}}>Código leído</div>
                <div style={{fontSize: '0.75rem', color: '#93c5fd', marginTop: '4px'}}>{resultado}</div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '2rem', textAlign: 'center', minHeight: '240px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', background: '#111',
            }}>
              <div style={{fontSize: '2rem', marginBottom: '8px'}}>⚠️</div>
              <div style={{color: '#ef4444', fontSize: '0.8rem', fontWeight: 600}}>Error de cámara</div>
              <div style={{color: '#9ca3af', fontSize: '0.72rem', marginTop: '4px', padding: '0 1rem'}}>{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding: '1rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb'}}>
          <div style={{fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', marginBottom: '0.75rem'}}>
            Code 128 · EAN · QR · Data Matrix · PDF417 y más
          </div>
          <button onClick={cerrar} style={{
            width: '100%', padding: '0.6rem', background: 'white',
            border: '1px solid #e5e7eb', borderRadius: '10px',
            fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: 'pointer',
          }}>Cancelar</button>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 10%; }
          50% { top: 85%; }
          100% { top: 10%; }
        }
      `}</style>
    </div>
  )
}
