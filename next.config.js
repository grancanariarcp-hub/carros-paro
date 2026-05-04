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

  // Identificación del proyecto en Sentry. Coincide con la URL de tu org:
  //   https://gran-canaria-rcp.sentry.io/projects/javascript-nextjs/
  org: 'gran-canaria-rcp',
  project: 'javascript-nextjs',

  // Sourcemaps y releases: solo si hay auth token (evita warnings en builds
  // sin token). Configura SENTRY_AUTH_TOKEN en Vercel para activar la subida
  // automática de sourcemaps en cada deploy.
  ...(hasSentryToken
    ? { authToken: process.env.SENTRY_AUTH_TOKEN }
    : {
        sourcemaps: { disable: true },
        release: { create: false },
      }),
})
