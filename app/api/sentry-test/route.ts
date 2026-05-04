import { NextResponse } from 'next/server'

// Endpoint de test para verificar que Sentry captura errores server-side.
// Acceder desde navegador: https://app.astormanager.com/api/sentry-test
// Lanza un error que Sentry debe registrar como issue.
//
// Eliminar este archivo cuando ya no se necesite el test.
export async function GET() {
  throw new Error('Sentry server-side test ' + new Date().toISOString())
  // typescript: lo siguiente nunca se alcanza
  return NextResponse.json({ ok: true })
}
