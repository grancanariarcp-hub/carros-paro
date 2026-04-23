'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onResult: (codigo: string) => void
  onClose: () => void
}

export default function EscanerCodigoBarras({ onResult, onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(true)
  const scannerRef = useRef<any>(null)
  const divId = 'escanerQR'

  useEffect(() => {
    let html5QrCode: any = null

    async function iniciar() {
      try {
        // Cargar librería dinámicamente
        if (!(window as any).Html5Qrcode) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('No se pudo cargar el escáner'))
            document.head.appendChild(script)
          })
        }

        html5QrCode = new (window as any).Html5Qrcode(divId)
        scannerRef.current = html5QrCode

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.5,
            formatsToSupport: [
              0,  // QR_CODE
              1,  // AZTEC
              2,  // CODABAR
              3,  // CODE_39
              4,  // CODE_93
              5,  // CODE_128
              6,  // DATA_MATRIX
              8,  // EAN_8
              9,  // EAN_13
              11, // ITF
              13, // PDF_417
              14, // RSS_14
              15, // RSS_EXPANDED
              16, // UPC_A
              17, // UPC_E
            ],
          },
          (decodedText: string) => {
            // Éxito — parar escáner y devolver resultado
            html5QrCode.stop().catch(() => {})
            onResult(decodedText)
          },
          () => {} // Error de frame — ignorar
        )
        setIniciando(false)
      } catch (err: any) {
        setError(err.message || 'No se pudo acceder a la cámara')
        setIniciando(false)
      }
    }

    iniciar()

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
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
              Apunta la cámara al código de barras o QR
            </div>
          </div>
          <button onClick={onClose} style={{
            color: '#9ca3af', background: 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: '8px', width: '32px', height: '32px',
            cursor: 'pointer', fontSize: '1rem', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Visor */}
        <div style={{position: 'relative', background: '#000'}}>
          {iniciando && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: '#111', zIndex: 10, minHeight: '200px',
            }}>
              <div style={{color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center'}}>
                <div style={{marginBottom: '8px', fontSize: '1.5rem'}}>📷</div>
                Iniciando cámara...
              </div>
            </div>
          )}
          {error ? (
            <div style={{
              padding: '2rem', textAlign: 'center', minHeight: '200px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', background: '#111',
            }}>
              <div style={{fontSize: '2rem', marginBottom: '8px'}}>⚠️</div>
              <div style={{color: '#ef4444', fontSize: '0.8rem', marginBottom: '4px', fontWeight: 600}}>
                Error de cámara
              </div>
              <div style={{color: '#9ca3af', fontSize: '0.72rem'}}>{error}</div>
            </div>
          ) : (
            <div id={divId} style={{width: '100%'}} />
          )}
        </div>

        {/* Footer */}
        <div style={{padding: '1rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb'}}>
          <div style={{fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', marginBottom: '0.75rem'}}>
            Soporta Code 128, EAN, QR, Data Matrix y otros formatos estándar
          </div>
          <button onClick={onClose} style={{
            width: '100%', padding: '0.6rem', background: 'white',
            border: '1px solid #e5e7eb', borderRadius: '10px',
            fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: 'pointer',
          }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
