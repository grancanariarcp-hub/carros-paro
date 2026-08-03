/**
 * Quién puede activar las notificaciones de cada usuario.
 *
 * `perfiles.recibir_alertas` viene desactivado de fábrica, así que un usuario
 * nuevo no recibe nada hasta que alguien se lo enciende. Comprobado el
 * 2026-08-02 en producción: solo 1 de 8 usuarios activos lo tenía puesto, y
 * era el superadmin — ni el administrador del hospital ni las supervisoras.
 *
 * Que ese interruptor esté en manos del administrador de cada centro es una
 * decisión deliberada: es quien sabe a quién debe llegarle un aviso de carro
 * no operativo en su hospital. Aquí se comprueba que efectivamente puede, y
 * que no alcanza a otros centros.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

describe('Activar notificaciones — quién puede', () => {
  it('el administrador SÍ puede activarlas a un usuario de su hospital', async () => {
    const svc = serviceClient()
    await svc.from('perfiles')
      .update({ recibir_alertas: false }).eq('id', fx.users.supervisorA1.id)

    const sb = await clientForUser(fx.users.adminA as any)
    const { error } = await sb.from('perfiles')
      .update({ recibir_alertas: true }).eq('id', fx.users.supervisorA1.id)
    expect(error, error?.message).toBeNull()

    const { data } = await svc.from('perfiles')
      .select('recibir_alertas').eq('id', fx.users.supervisorA1.id).single()
    expect(data!.recibir_alertas, 'el admin no pudo activarlas').toBe(true)
  }, 30_000)

  it('el administrador de OTRO hospital no puede tocarlas', async () => {
    const svc = serviceClient()
    await svc.from('perfiles')
      .update({ recibir_alertas: false }).eq('id', fx.users.supervisorA1.id)

    const sb = await clientForUser(fx.users.adminB as any)
    await sb.from('perfiles')
      .update({ recibir_alertas: true }).eq('id', fx.users.supervisorA1.id)

    // Un UPDATE bloqueado por RLS no devuelve error: simplemente no afecta a
    // ninguna fila. Hay que mirar el dato, no el error.
    const { data } = await svc.from('perfiles')
      .select('recibir_alertas').eq('id', fx.users.supervisorA1.id).single()
    expect(data!.recibir_alertas, 'un admin de otro hospital las activó').toBe(false)
  }, 30_000)

  it('un supervisor no puede activárselas a otro', async () => {
    const svc = serviceClient()
    await svc.from('perfiles')
      .update({ recibir_alertas: false }).eq('id', fx.users.calidadA.id)

    const sb = await clientForUser(fx.users.supervisorA1 as any)
    await sb.from('perfiles')
      .update({ recibir_alertas: true }).eq('id', fx.users.calidadA.id)

    const { data } = await svc.from('perfiles')
      .select('recibir_alertas').eq('id', fx.users.calidadA.id).single()
    expect(data!.recibir_alertas, 'un supervisor pudo activárselas a otro').toBe(false)
  }, 30_000)
})

describe('Activar notificaciones — el superadmin', () => {
  it('puede activarlas a usuarios de CUALQUIER hospital', async () => {
    // Se comprueba aparte del administrador porque la política que lo permite
    // es otra rama (es_superadmin()), y podría fallar sin que se notara: en el
    // panel de superadmin la campana no daría error, simplemente no cambiaría.
    const svc = serviceClient()
    const superadmin = fx.users.calidadA
    await svc.from('perfiles').update({ rol: 'superadmin' }).eq('id', superadmin.id)
    await svc.from('perfiles').update({ recibir_alertas: false }).eq('id', fx.users.supervisorB1.id)

    try {
      const sb = await clientForUser(superadmin as any)
      const { error } = await sb.from('perfiles')
        .update({ recibir_alertas: true }).eq('id', fx.users.supervisorB1.id)
      expect(error, error?.message).toBeNull()

      const { data } = await svc.from('perfiles')
        .select('recibir_alertas').eq('id', fx.users.supervisorB1.id).single()
      expect(data!.recibir_alertas, 'el superadmin no pudo activarlas en otro hospital').toBe(true)
    } finally {
      await svc.from('perfiles').update({ rol: 'calidad' }).eq('id', superadmin.id)
    }
  }, 30_000)
})

describe('Valor de fábrica', () => {
  it('un usuario nuevo NO recibe alertas hasta que alguien se lo active', async () => {
    // No es un descuido sino el diseño: nadie empieza a recibir correos sin
    // que un responsable lo decida. Pero conviene tenerlo fijado por escrito,
    // porque explica por qué un hospital recién dado de alta no recibe avisos
    // hasta que el administrador los reparte.
    const svc = serviceClient()
    const { data } = await svc.from('perfiles')
      .select('recibir_alertas').eq('id', fx.users.adminB.id).single()

    expect(data!.recibir_alertas).toBe(false)
  }, 30_000)
})
