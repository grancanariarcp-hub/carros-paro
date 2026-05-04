// Configuración de Sentry para el navegador del usuario.
// Se inicializa cuando carga la app en el cliente.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Volumen de eventos de performance que se envían (0..1).
  // En producción reducimos para no quemar la cuota gratuita.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Etiquetar entorno para filtrar en el dashboard.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // Recibe console.error/warn como breadcrumbs (contexto de los errores).
  // No las envía como eventos: solo aparecen al lado del error real.
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,            // ISO/RGPD: nunca grabamos texto del usuario
      blockAllMedia: true,           // tampoco fotos / firmas
    }),
  ],

  // Session Replay: 10% de sesiones normales, 100% si hay error.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // No envíes nada si no hay DSN (desarrollo local sin .env)
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})
