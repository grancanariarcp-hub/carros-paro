const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
}

// Wrapper de Sentry: instrumenta el build, sube sourcemaps a Sentry
// (solo si SENTRY_AUTH_TOKEN está disponible) y configura tunneling.
const hasSentryToken = !!process.env.SENTRY_AUTH_TOKEN

module.exports = withSentryConfig(nextConfig, {
  // Reduce ruido en la consola del build.
  silent: !process.env.CI,

  // Hace que las requests de Sentry pasen por /monitoring/ del propio
  // dominio, evitando bloqueos de adblockers que filtran *.sentry.io.
  tunnelRoute: '/monitoring',

  // Esconde el sourcemap del bundle público (usuario no los descarga).
  hideSourceMaps: true,

  // Sourcemaps y releases: solo si hay auth token (evita warnings en builds
  // sin token). Cuando configures SENTRY_AUTH_TOKEN, también descomenta
  // org/project para que el plugin sepa dónde subir.
  ...(hasSentryToken
    ? {
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // org: 'tu-org-slug',           // ver tu URL de Sentry
        // project: 'astor',
      }
    : {
        sourcemaps: { disable: true },
        release: { create: false },
      }),
})
