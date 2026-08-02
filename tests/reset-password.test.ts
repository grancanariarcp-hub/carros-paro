/**
 * Límite de autoridad de la Edge Function `resetear-password`.
 *
 * Es una función que entrega credenciales de acceso a otras cuentas, así que
 * su control de permisos es una frontera de seguridad y merece cobertura
 * propia. Lo que se comprueba aquí es que NO se pueda:
 *
 *   - restablecer usuarios de otro hospital
 *   - restablecer a un superadmin siendo admin de un centro
 *   - restablecer nada sin ser administrador
 *   - llamar a la función sin sesión
 *
 * Apunta a astor-dev vía .env.test (ver tests/helpers.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { SUPABASE_URL, SUPABASE_ANON_KEY, serviceClient } from './helpers'

const ENDPOINT = `${SUPABASE_URL}/functions/v1/resetear-password`

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

/** Llama a la función con la sesión de un usuario del fixture. */
async function resetearComo(
  usuario: { email: string; password: string; rol: string },
  destinoId: string,
): Promise<{ status: number; cuerpo: any }> {
  const sb = await clientForUser(usuario as any)
  const { data: { session } } = await sb.auth.getSession()
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session!.access_token}`,
      'apikey': SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ usuario_id: destinoId }),
  })
  return { status: res.status, cuerpo: await res.json() }
}

describe('resetear-password — quién puede', () => {
  it('un admin SÍ puede restablecer a un usuario de su propio hospital', async () => {
    const r = await resetearComo(fx.users.adminA, fx.users.supervisorA1.id)
    expect(r.status).toBe(200)
    expect(r.cuerpo.ok).toBe(true)
    // Devuelve un enlace de recuperación, nunca una contraseña.
    expect(r.cuerpo.enlace).toContain('http')
    expect(r.cuerpo).not.toHaveProperty('password')
  }, 30_000)

  it('un supervisor NO puede restablecer a nadie', async () => {
    const r = await resetearComo(fx.users.supervisorA1, fx.users.adminA.id)
    expect(r.status).toBe(403)
    expect(r.cuerpo.ok).toBe(false)
  }, 30_000)
})

describe('resetear-password — aislamiento entre hospitales', () => {
  it('el admin de A NO puede restablecer a un usuario del hospital B', async () => {
    const r = await resetearComo(fx.users.adminA, fx.users.supervisorB1.id)
    expect(r.status).toBe(403)
    expect(r.cuerpo.ok).toBe(false)
    expect(r.cuerpo.enlace).toBeUndefined()
  }, 30_000)

  it('el admin de B NO puede restablecer a un usuario del hospital A', async () => {
    const r = await resetearComo(fx.users.adminB, fx.users.supervisorA1.id)
    expect(r.status).toBe(403)
    expect(r.cuerpo.enlace).toBeUndefined()
  }, 30_000)
})

describe('resetear-password — escalada de privilegios', () => {
  it('un admin de hospital NO puede restablecer a un superadmin', async () => {
    // Ascendemos temporalmente a supervisorA1 a superadmin: así comprobamos que
    // el corte mira el ROL del destino, no solo su hospital.
    const svc = serviceClient()
    const destino = fx.users.supervisorA1.id
    await svc.from('perfiles').update({ rol: 'superadmin' }).eq('id', destino)

    try {
      const r = await resetearComo(fx.users.adminA, destino)
      expect(r.status).toBe(403)
      expect(r.cuerpo.enlace).toBeUndefined()
    } finally {
      await svc.from('perfiles').update({ rol: 'supervisor' }).eq('id', destino)
    }
  }, 30_000)
})

describe('resetear-password — sin sesión', () => {
  it('rechaza la llamada sin cabecera Authorization', async () => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY! },
      body: JSON.stringify({ usuario_id: fx.users.supervisorA1.id }),
    })
    expect(res.status).toBe(401)
  }, 30_000)

  it('exige usuario_id', async () => {
    const sb = await clientForUser(fx.users.adminA as any)
    const { data: { session } } = await sb.auth.getSession()
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session!.access_token}`,
        'apikey': SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  }, 30_000)
})
