'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onResult: (codigo: string) => void
  onClose: () => void
}

// Formatos soportados en html5-qrcode 2.3.8
// https://github.com/mebjas/html5-qrcode/blob/master/src/core.ts
const FORMATOS_BARCODE = [
  0,  // QR_CODE
  1,  // AZTEC
  2,  // CODABAR
  3,  // CODE_39
  4,  // CODE_93
  5,  // CODE_128  ← el más común en hospitales
  6,  // DATA_MATRIX
  7,  // MAXICODE
  8,  // ITF
  9,  // EAN_13
  10, // EAN_8
  11, // PDF_417
  12, // RSS_14
  13, // RSS_EXPANDED
  14, // UPC_A
  15, // UPC_E
  16, // UPC_EAN_EXTENSION
]

export default function EscanerCodigoBarras({ onResult, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(true)
  const scannerRef = useRef<any>(null)
  const yaLeyoRef = useRef(false)
  const idRef = useRef('escanerQR-' + Date.now())

  useEffect(() => {
    let montado = true

    async function iniciar() {
      try {
        if (!(window as any).Html5Qrcode) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('No se pudo cargar el escáner'))
            document.head.appendChild(script)
          })
        }

        if (!montado) return

        const scanner = new (window as any).Html5Qrcode(idRef.current)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.7,
            formatsToSupport: FORMATOS_BARCODE,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true
            },
          },
          (decodedText: string) => {
            if (yaLeyoRef.current) return
            yaLeyoRef.current = true
            const s = scannerRef.current
            scannerRef.current = null
            const finish = () => { if (montado) onResult(decodedText) }
            if (s) s.stop().catch(() => {}).finally(finish)
            else finish()
          },
          () => {}
        )

        if (montado) setIniciando(false)

      } catch (err: any) {
        if (montado) {
          setError(err.message || 'No se pudo acceder a la cámara')
          setIniciando(false)
        }
      }
    }

    iniciar()

    return () => {
      montado = false
      const s = scannerRef.current
      scannerRef.current = null
      if (s) s.stop().catch(() => {})
    }
  }, [])

  function cerrar() {
    yaLeyoRef.current = true
    const s = scannerRef.current
    scannerRef.current = null
    if (s) s.stop().catch(() => {}).finally(() => onClose())
    else onClose()
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

        <div style={{position: 'relative', background: '#000', minHeight: '220px'}}>
          {iniciando && !error && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: '#111', zIndex: 10,
            }}>
              <div style={{color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center'}}>
                <div style={{marginBottom: '8px', fontSize: '1.5rem'}}>📷</div>
                Iniciando cámara...
              </div>
            </div>
          )}
          {error ? (
            <div style={{
              padding: '2rem', textAlign: 'center', minHeight: '220px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', background: '#111',
            }}>
              <div style={{fontSize: '2rem', marginBottom: '8px'}}>⚠️</div>
              <div style={{color: '#ef4444', fontSize: '0.8rem', fontWeight: 600}}>Error de cámara</div>
              <div style={{color: '#9ca3af', fontSize: '0.72rem', marginTop: '4px', padding: '0 1rem'}}>{error}</div>
            </div>
          ) : (
            <div id={idRef.current} style={{width: '100%'}} />
          )}
        </div>

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
    </div>
  )
}
