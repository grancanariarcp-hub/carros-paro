import { NextResponse } from 'next/server'

// Endpoint de test para verificar que Sentry captura errores server-side.
// Acceder desde navegador: https://app.astormanager.com/api/sentry-test
// Lanza un error que Sentry debe registrar como issue.
//
// `force-dynamic` evita que Next.js intente pre-renderizar este route
// en build (lo que provoca un error como pretendíamos pero rompe el build).
//
// Eliminar este archivo cuando ya no se necesite el test.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  throw new Error('Sentry server-side test ' + new Date().toISOString())
  return NextResponse.json({ ok: true })
}
