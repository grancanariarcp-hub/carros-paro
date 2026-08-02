// Configuración de Sentry para el navegador del usuario.
// Se inicializa cuando carga la app en el cliente.
//
// Se llamaba sentry.client.config.ts. Next lo cargaba mediante el plugin de
// webpack, un mecanismo que desaparece con Turbopack — el compilador al que
// Next está migrando. Con este nombre lo carga el propio framework, así que
// seguirá funcionando cuando ese cambio llegue.

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

/**
 * Instrumenta los cambios de página del enrutador.
 *
 * Sin esto, Sentry trata cada navegación interna como parte de la carga
 * inicial, así que un error al abrir la ficha de un carro aparecía atribuido a
 * la pantalla anterior. Con el hook, cada pantalla se mide y se atribuye por
 * separado, que es lo que hace útil el rastro cuando algo falla.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
