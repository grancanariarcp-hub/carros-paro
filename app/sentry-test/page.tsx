'use client'

import * as Sentry from '@sentry/nextjs'
import { useState } from 'react'

// Página de test temporal para verificar que Sentry recibe eventos.
// Eliminar tras validar la integración.
export default function SentryTestPage() {
  const [enviado, setEnviado] = useState<string | null>(null)

  function lanzarErrorCapturado() {
    const id = Sentry.captureException(
      new Error('Sentry client test (capturado) ' + new Date().toISOString())
    )
    setEnviado(`Error capturado y enviado. event_id: ${id}`)
  }

  function lanzarErrorNoCapturado() {
    setEnviado('Lanzando error sin capturar — el global handler debe enviarlo')
    setTimeout(() => {
      throw new Error('Sentry client test (no capturado) ' + new Date().toISOString())
    }, 100)
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h1>Sentry test</h1>
      <p style={{ color: '#6b7280' }}>
        Página temporal de diagnóstico. Comprueba que los errores llegan a Sentry.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={lanzarErrorCapturado}
          style={{ padding: '0.75rem 1.25rem', borderRadius: '0.5rem', background: '#1d4ed8', color: 'white', border: 'none', fontWeight: 600 }}
        >
          1) Capturar error (cliente)
        </button>

        <button
          onClick={lanzarErrorNoCapturado}
          style={{ padding: '0.75rem 1.25rem', borderRadius: '0.5rem', background: '#dc2626', color: 'white', border: 'none', fontWeight: 600 }}
        >
          2) Lanzar error sin capturar
        </button>

        <a
          href="/api/sentry-test"
          style={{ padding: '0.75rem 1.25rem', borderRadius: '0.5rem', background: '#7c3aed', color: 'white', textDecoration: 'none', fontWeight: 600 }}
        >
          3) Error server-side (route handler)
        </a>
      </div>

      {enviado && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
          {enviado}
        </div>
      )}

      <ol style={{ marginTop: '2rem', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.7 }}>
        <li>Pulsa los 3 botones (uno tras otro)</li>
        <li>Espera 30 segundos</li>
        <li>Ve a https://sentry.io → proyecto astor → Issues</li>
        <li>Deben aparecer 3 issues distintos: cliente capturado, cliente sin capturar, server route</li>
      </ol>

      <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#9ca3af' }}>
        Si no aparecen tras 1 minuto: revisa Network tab del navegador filtrando por
        &ldquo;monitoring&rdquo; — debe haber requests POST con status 200.
      </p>
    </div>
  )
}
