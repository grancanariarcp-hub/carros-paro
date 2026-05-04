const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
}

// Wrapper de Sentry: instrumenta el build, sube sourcemaps a Sentry
// (solo si SENTRY_AUTH_TOKEN está disponible) y configura tunneling.
module.exports = withSentryConfig(nextConfig, {
  // Identificación del proyecto en Sentry — visible en URLs de errores.
  org: 'critic-sl',
  project: 'astor',

  // Reduce ruido en la consola del build.
  silent: !process.env.CI,

  // Hace que las requests de Sentry pasen por /monitoring/ del propio
  // dominio, evitando bloqueos de adblockers que filtran *.sentry.io.
  tunnelRoute: '/monitoring',

  // Subir sourcemaps SOLO si hay auth token (evita errores en CI sin auth).
  // En local sin token: skipea sourcemap upload.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Esconde el sourcemap del bundle público (usuario no los descarga).
  hideSourceMaps: true,
})
