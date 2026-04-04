import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Auditor Carros de Parada',
  description: 'Sistema de gestión de carros de parada cardíaca · Hospital Universitario de Gran Canaria Doctor Negrín',
  applicationName: 'Auditor Carros de Parada',
  manifest: '/manifest.json',
  keywords: ['carros de parada', 'hospital', 'auditoría', 'Gran Canaria', 'Doctor Negrín'],
  authors: [{ name: 'GranCanariaRCP', url: 'https://grancanariarcp.com' }],
  creator: 'GranCanariaRCP · Dr. Lübbe',
  publisher: 'Hospital Universitario de Gran Canaria Doctor Negrín',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  themeColor: '#1d4ed8',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Auditor Carros',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#1d4ed8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Auditor Carros" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      </body>
    </html>
  )
}
