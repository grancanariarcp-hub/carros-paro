/**
 * El enlace que devuelve `resetear-password` debe apuntar a la pantalla donde
 * el usuario fija su contraseña, no a otro sitio.
 *
 * Existe esta prueba porque el flujo se rompió justo ahí: Supabase valida el
 * `redirect_to` contra `uri_allow_list` y, si no encaja, lo SUSTITUYE en
 * silencio por SITE_URL en vez de dar error. El proyecto tenía la lista vacía
 * y SITE_URL en http://localhost:3000, así que todos los enlaces llevaban a un
 * localhost inexistente y el usuario veía "invalid" sin más pista.
 *
 * Un fallo de configuración, no de código, y por eso no lo atrapaba ninguna
 * prueba. Ahora sí.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

/** Pide un enlace, opcionalmente declarando un Origin concreto. */
async function pedirEnlace(origen?: string): Promise<string> {
  const sb = await clientForUser(fx.users.adminA as any)
  const { data: { session } } = await sb.auth.getSession()

  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session!.access_token}`,
    'apikey': SUPABASE_ANON_KEY!,
  }
  if (origen) cabeceras['Origin'] = origen

  const res = await fetch(`${SUPABASE_URL}/functions/v1/resetear-password`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ usuario_id: fx.users.supervisorA1.id }),
  })
  const cuerpo = await res.json()
  expect(res.status, JSON.stringify(cuerpo)).toBe(200)
  return new URL(cuerpo.enlace).searchParams.get('redirect_to') ?? ''
}

describe('resetear-password — destino del enlace', () => {
  it('lleva a /nueva-contrasena y no a SITE_URL', async () => {
    const destino = await pedirEnlace()
    expect(destino).toContain('/nueva-contrasena')
    // Lo que falló en su día: Supabase sustituía el destino por SITE_URL.
    expect(destino).not.toContain('localhost:3000')
  }, 30_000)

  it('vuelve al mismo sitio desde el que se pidió', async () => {
    // Si el destino se fijara a producción, una vista previa generaría enlaces
    // que llevan a producción, donde la pantalla puede no existir todavía.
    const preview = 'https://carros-paro-git-reset-password-grancanariarcp-hubs-projects.vercel.app'
    const destino = await pedirEnlace(preview)
    expect(destino).toBe(`${preview}/nueva-contrasena`)
  }, 30_000)

  it('ignora un Origin desconocido en vez de obedecerlo', async () => {
    // Obedecer al Origin a ciegas sería un redirect abierto: bastaría con
    // pedir el enlace desde una web propia para que el token acabara allí.
    const destino = await pedirEnlace('https://sitio-de-un-atacante.example')
    expect(destino).not.toContain('atacante')
    expect(destino).toContain('/nueva-contrasena')
  }, 30_000)
})
