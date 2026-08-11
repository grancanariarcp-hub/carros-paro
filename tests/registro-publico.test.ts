/**
 * Lo que la aplicación enseña a quien todavía no tiene cuenta.
 *
 * El formulario de solicitud necesita listar los hospitales, y esa lista la ve
 * cualquiera que abra la página. De ahí salieron dos cosas:
 *
 *   · La tabla hospitales entera era legible sin iniciar sesión, con
 *     email_admin, plan y límites incluidos. Aquí se fija que ya no.
 *   · El aviso de "solicitud nueva" se intentaba crear desde el navegador
 *     buscando a los superadmin en `perfiles`, que un visitante sin sesión no
 *     puede ver: no se avisaba a nadie, nunca. Ahora lo hace un disparador.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, type TestFixture } from './fixtures'
import { serviceClient, anonClient } from './helpers'

let fx: TestFixture
const EMAIL = 'zz.registro.publico@astor.test'

beforeAll(async () => { fx = await setupFixture() }, 60_000)

afterAll(async () => {
  const svc = serviceClient()
  const { data } = await svc.from('solicitudes_registro').select('id').eq('email', EMAIL)
  for (const s of data || []) {
    await svc.from('notificaciones').delete().ilike('titulo', '%Persona Sin Cuenta%')
  }
  await svc.from('solicitudes_registro').delete().eq('email', EMAIL)
  if (fx) await teardownFixture(fx)
}, 40_000)

describe('Lo que ve alguien sin cuenta', () => {
  it('NO puede leer la tabla de hospitales', async () => {
    // Exponía email_admin —direcciones personales reales—, plan y límites de
    // contratación a cualquiera con la clave anónima, que va en el JavaScript
    // público de la página.
    const { data } = await anonClient().from('hospitales').select('*')
    expect(data?.length ?? 0, 'la tabla hospitales sigue siendo legible sin sesión').toBe(0)
  }, 30_000)

  it('sí ve la lista de centros, pero solo su nombre', async () => {
    const { data, error } = await anonClient()
      .from('hospitales_para_registro').select('*')

    expect(error, error?.message).toBeNull()
    expect(data?.length ?? 0, 'sin lista no hay centro que elegir').toBeGreaterThan(0)

    // Si algún día se le añaden columnas a la vista, se vuelve a publicar lo
    // que se acaba de cerrar. Por eso se comprueba la forma, no solo el acceso.
    expect(Object.keys(data![0]).sort()).toEqual(['id', 'nombre'])
  }, 30_000)

  it('ve los servicios de un centro concreto, no los de todos', async () => {
    const anon = anonClient()

    const { data, error } = await anon.rpc('servicios_para_registro', {
      p_hospital_id: fx.hospitales.A,
    })
    expect(error, error?.message).toBeNull()
    expect(Array.isArray(data)).toBe(true)

    // Es una función con hospital obligatorio, no una tabla abierta: no hay
    // forma de pedir el mapa de servicios de todos los centros de una vez.
    const { data: directo } = await anon.from('servicios').select('id')
    expect(directo?.length ?? 0, 'los servicios se leen sin sesión').toBe(0)
  }, 30_000)
})

describe('Una solicitud nueva avisa a quien debe aprobarla', () => {
  it('crea el aviso al superadmin sin que el visitante tenga sesión', async () => {
    const anon = anonClient()

    const { error } = await anon.from('solicitudes_registro').insert({
      nombre: 'Persona Sin Cuenta',
      email: EMAIL,
      hospital_id: fx.hospitales.A,
      rol_solicitado: 'auditor',
      estado: 'pendiente',
    })
    expect(error, error?.message).toBeNull()

    const svc = serviceClient()
    const { data: avisos } = await svc.from('notificaciones')
      .select('usuario_id, titulo, accion_url')
      .ilike('titulo', '%Persona Sin Cuenta%')

    // Sin esto, una solicitud solo se ve si alguien entra a mirar la pestaña
    // por su cuenta. Así es como se descubrió el fallo.
    expect(avisos?.length ?? 0, 'nadie fue avisado de la solicitud').toBeGreaterThan(0)
  }, 40_000)
})
