// Punto de instrumentación de Next.js. Carga el config de Sentry adecuado
// según el runtime (Node o Edge). El del navegador vive en
// instrumentation-client.ts.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Envía a Sentry los errores que ocurren en el servidor: renderizado SSR,
 * middleware y Server Components.
 *
 * Sin este hook, Sentry solo recogía lo que fallaba en el navegador. Es decir,
 * si el middleware de sesión reventaba o el servidor no lograba renderizar una
 * página, nadie se enteraba: el usuario veía un error y aquí no llegaba nada.
 * En una app que un hospital usa a diario, eso es media red de seguridad.
 *
 * Next lo llama solo; solo hay que exportarlo con este nombre.
 */
export const onRequestError = Sentry.captureRequestError
