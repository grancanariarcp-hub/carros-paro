'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onResult: (codigo: string) => void
  onClose: () => void
}

export default function EscanerCodigoBarras({ onResult, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(true)
  const [leido, setLeido] = useState<string | null>(null)
  const scannerRef = useRef<any>(null)
  const yaLeyoRef = useRef(false)
  const idRef = useRef('scanner-' + Date.now())

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

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = (window as any)

        // Todos los formatos disponibles en la librería
        const formatos = Html5QrcodeSupportedFormats
          ? Object.keys(Html5QrcodeSupportedFormats)
              .filter(k => !isNaN(Number(k)))
              .map(k => Number(k))
          : [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]

        const scanner = new Html5Qrcode(idRef.current, { verbose: false })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 280, height: 180 },
            aspectRatio: 1.5,
            formatsToSupport: formatos,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          (text: string) => {
            if (yaLeyoRef.current) return
            yaLeyoRef.current = true
            setLeido(text)
            const s = scannerRef.current
            scannerRef.current = null
            if (s) {
              s.stop().catch(() => {}).finally(() => {
                if (montado) setTimeout(() => onResult(text), 500)
              })
            } else {
              if (montado) setTimeout(() => onResult(text), 500)
            }
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
        {/* Header */}
        <div style={{
          background: '#111827', padding: '1rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{color: 'white', fontWeight: 700, fontSize: '0.9rem'}}>Escanear código</div>
            <div style={{color: '#9ca3af', fontSize: '0.7rem', marginTop: '2px'}}>
              Centra el código en el recuadro azul
            </div>
          </div>
          <button onClick={cerrar} style={{
            color: '#9ca3af', background: 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: '8px', width: '32px', height: '32px',
            cursor: 'pointer', fontSize: '1.1rem',
          }}>✕</button>
        </div>

        {/* Visor */}
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

          {leido && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)', zIndex: 10,
            }}>
              <div style={{textAlign: 'center', color: 'white'}}>
                <div style={{fontSize: '2.5rem', marginBottom: '8px'}}>✓</div>
                <div style={{fontSize: '0.9rem', fontWeight: 700}}>Código leído</div>
                <div style={{fontSize: '0.72rem', color: '#93c5fd', marginTop: '6px', padding: '0 1rem', wordBreak: 'break-all'}}>{leido}</div>
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
    </div>
  )
}
