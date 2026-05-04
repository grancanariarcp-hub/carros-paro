'use client'

// Error boundary global de la app. Captura errores no manejados en
// Server Components y Server Actions y los envía a Sentry.

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#dc2626' }}>
            Algo ha ido mal
          </h1>
          <p style={{ color: '#6b7280', maxWidth: '480px', textAlign: 'center', marginBottom: '1.5rem' }}>
            Hemos recibido el aviso del error y lo estamos investigando. Recarga la página
            para volver a intentarlo. Si el problema continúa, contacta con tu administrador.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              background: '#1d4ed8',
              color: 'white',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  )
}
