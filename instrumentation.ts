// Punto de instrumentación de Next.js. Carga el config de Sentry adecuado
// según el runtime (Node o Edge). El config del cliente se inyecta vía
// el plugin de webpack en next.config.js.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
