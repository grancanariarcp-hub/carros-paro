import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1d4ed8',
}

export const metadata: Metadata = {
  title: 'ÁSTOR — Control. Trazabilidad. Seguridad clínica.',
  description: 'Plataforma de gestión y auditoría de material crítico hospitalario. Desarrollado por CRITIC SL.',
  applicationName: 'ÁSTOR',
  manifest: '/manifest.json',
  keywords: ['carros de parada', 'hospital', 'auditoría', 'material crítico', 'ÁSTOR', 'CRITIC SL'],
  authors: [{ name: 'CRITIC SL', url: 'https://astormanager.com' }],
  creator: 'CRITIC SL — Servicios Médicos',
  publisher: 'CRITIC SL — Servicios Médicos',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ÁSTOR',
  },
  icons: {
    icon: '/icon-192.png',
    apple: [
      { url: '/icon-192.png', sizes: '192x192' },
      { url: '/icon-512.png', sizes: '512x512' },
    ],
  },
  openGraph: {
    title: 'ÁSTOR — Gestión de Material Crítico Hospitalario',
    description: 'Plataforma de gestión y auditoría de material crítico hospitalario.',
    url: 'https://astormanager.com',
    siteName: 'ÁSTOR',
    locale: 'es_ES',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#1d4ed8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ÁSTOR" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="ÁSTOR" />
        <meta name="msapplication-TileColor" content="#1d4ed8" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              fontSize: '0.82rem',
              fontFamily: 'system-ui, sans-serif',
              borderRadius: '8px',
              padding: '10px 16px',
            },
          }}
        />
      </body>
    </html>
  )
}
