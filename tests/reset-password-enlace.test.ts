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

describe('resetear-password — destino del enlace', () => {
  it('el enlace lleva a /nueva-contrasena y no a SITE_URL', async () => {
    const sb = await clientForUser(fx.users.adminA as any)
    const { data: { session } } = await sb.auth.getSession()

    const res = await fetch(`${SUPABASE_URL}/functions/v1/resetear-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session!.access_token}`,
        'apikey': SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ usuario_id: fx.users.supervisorA1.id }),
    })

    const cuerpo = await res.json()
    expect(res.status).toBe(200)
    expect(cuerpo.ok).toBe(true)

    const destino = new URL(cuerpo.enlace).searchParams.get('redirect_to')
    expect(destino, 'el enlace no trae redirect_to').toBeTruthy()

    // Lo que falló en su día: Supabase sustituía el destino por SITE_URL.
    expect(destino).toContain('/nueva-contrasena')
    expect(destino).not.toContain('localhost:3000')
  }, 30_000)
})
