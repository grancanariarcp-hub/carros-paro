/**
 * Aprobar una solicitud de registro tiene que dar de alta a alguien.
 *
 * Antes solo marcaba la fila como aprobada. La solicitud desaparecía de la
 * bandeja —que solo muestra las pendientes— y la persona seguía sin cuenta,
 * sin perfil y sin poder entrar, sin que nadie tuviera forma de notarlo. Le
 * pasó a dos personas reales antes de detectarse.
 *
 * Lo que se comprueba aquí es que después de aprobar existan las tres cosas
 * que hacen falta para entrar: cuenta, correo confirmado y perfil. Sin
 * cualquiera de ellas, la persona figura como usuario y no puede pasar de la
 * pantalla de acceso.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient, SUPABASE_URL, SUPABASE_ANON_KEY } from './helpers'

let fx: TestFixture

const EMAIL = 'zz.solicitud.prueba@astor.test'

beforeAll(async () => { fx = await setupFixture() }, 60_000)

afterAll(async () => {
  const svc = serviceClient()
  await svc.from('solicitudes_registro').delete().eq('email', EMAIL)
  await svc.from('perfiles').delete().eq('email', EMAIL)

  // La cuenta de acceso va aparte de su perfil; si se queda, la siguiente
  // ejecución encuentra un correo ya registrado y falla por donde no toca.
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = data?.users?.find(x => x.email?.toLowerCase() === EMAIL)
  if (u) await svc.auth.admin.deleteUser(u.id)

  if (fx) await teardownFixture(fx)
}, 40_000)

/** Llama a la Edge Function como lo hace la pantalla, con la sesión del usuario. */
async function aprobarComo(usuario: any, cuerpo: Record<string, unknown>) {
  const sb = await clientForUser(usuario)
  const { data: { session } } = await sb.auth.getSession()

  const res = await fetch(`${SUPABASE_URL}/functions/v1/aprobar-solicitud`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session!.access_token}`,
      'apikey': SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify(cuerpo),
  })
  return res.json()
}

/** Deja una solicitud pendiente igual que la que llega desde el formulario. */
async function solicitudPendiente() {
  const svc = serviceClient()
  await svc.from('solicitudes_registro').delete().eq('email', EMAIL)

  const { data, error } = await svc.from('solicitudes_registro').insert({
    nombre: 'Persona De Prueba',
    email: EMAIL,
    hospital_nombre: 'Hospital escrito a mano',
    rol_solicitado: 'auditor',
    estado: 'pendiente',
  }).select().single()

  if (error) throw new Error(`no se pudo crear la solicitud: ${error.message}`)
  return data
}

describe('Aprobar una solicitud', () => {
  it('crea cuenta, perfil y deja la solicitud aprobada', async () => {
    const solicitud = await solicitudPendiente()

    const cuerpo = await aprobarComo(fx.users.adminA, {
      solicitud_id: solicitud.id,
      hospital_id: fx.hospitales.A,
      rol: 'auditor',
    })
    expect(cuerpo.ok, cuerpo.error).toBe(true)

    const svc = serviceClient()

    // 1) El perfil: sin él la aplicación no sabe quién eres.
    const { data: perfil } = await svc.from('perfiles')
      .select('rol, activo, hospital_id, nombre').eq('email', EMAIL).single()
    expect(perfil, 'no se creó el perfil: la persona no podría usar la app').toBeTruthy()
    expect(perfil!.activo).toBe(true)
    expect(perfil!.rol).toBe('auditor')
    expect(perfil!.hospital_id).toBe(fx.hospitales.A)

    // 2) La cuenta, con el correo confirmado. Sin confirmar, Supabase no deja
    //    iniciar sesión, que es exactamente lo que bloqueó a dos personas.
    const { data: usuarios } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const cuenta = usuarios?.users?.find(u => u.email?.toLowerCase() === EMAIL)
    expect(cuenta, 'no se creó la cuenta de acceso').toBeTruthy()
    expect(cuenta!.email_confirmed_at, 'el correo quedó sin confirmar: no podría entrar').toBeTruthy()

    // 3) Y un enlace con el que entrar la primera vez.
    expect(cuerpo.enlace, 'no se devolvió enlace de acceso').toBeTruthy()

    const { data: sol } = await svc.from('solicitudes_registro')
      .select('estado').eq('id', solicitud.id).single()
    expect(sol!.estado).toBe('aprobada')
  }, 60_000)

  it('un supervisor sin servicio se rechaza antes de crear nada', async () => {
    // Un supervisor sin servicio no ve ningún carro, así que darlo de alta así
    // sería darle una cuenta que no sirve para nada.
    const solicitud = await solicitudPendiente()

    const cuerpo = await aprobarComo(fx.users.adminA, {
      solicitud_id: solicitud.id,
      hospital_id: fx.hospitales.A,
      rol: 'supervisor',
    })
    expect(cuerpo.ok).toBe(false)
    expect(cuerpo.error).toMatch(/servicio/i)

    const svc = serviceClient()
    const { data: sol } = await svc.from('solicitudes_registro')
      .select('estado').eq('id', solicitud.id).single()
    // Sigue pendiente: se puede reintentar en vez de desaparecer sin que nadie
    // haya sido dado de alta, que es el fallo original.
    expect(sol!.estado, 'la solicitud se dio por gestionada sin dar de alta a nadie').toBe('pendiente')
  }, 60_000)

  it('un administrador no puede aprobar para otro hospital', async () => {
    const solicitud = await solicitudPendiente()

    const cuerpo = await aprobarComo(fx.users.adminA, {
      solicitud_id: solicitud.id,
      hospital_id: fx.hospitales.B,
      rol: 'auditor',
    })
    expect(cuerpo.ok, 'un admin dio de alta a alguien en el hospital de otro').toBe(false)
  }, 60_000)

  it('un supervisor no puede aprobar solicitudes', async () => {
    const solicitud = await solicitudPendiente()

    const cuerpo = await aprobarComo(fx.users.supervisorA1, {
      solicitud_id: solicitud.id,
      hospital_id: fx.hospitales.A,
      rol: 'auditor',
    })
    expect(cuerpo.ok, 'un supervisor dio de alta a un usuario').toBe(false)
  }, 60_000)
})
