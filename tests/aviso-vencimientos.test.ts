/**
 * El aviso semanal de lo que caduca.
 *
 * Un medicamento caducado dentro de un carro de parada no se descubre en el
 * informe mensual: se descubre en la parada. Por eso el aviso va a buscar a
 * quien lleva el servicio, en vez de esperar a que alguien abra un informe.
 *
 * Lo que se comprueba: que avisa de lo que toca, que distingue lo ya caducado
 * (crítico) de lo que va a caducar (medio), que no repite el aviso cada semana
 * si el anterior sigue sin atender, y que llega a las personas del servicio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture
let cajonId: string

const PREFIJO = 'ZZ Material'

function enDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Borra los avisos y materiales de prueba para partir siempre de lo mismo. */
async function limpiar() {
  const svc = serviceClient()
  await svc.from('materiales').delete().ilike('nombre', `${PREFIJO}%`)
  await svc.from('notificaciones').delete().eq('tipo', 'material_vencimiento_proximo')
  await svc.from('alertas').delete().eq('tipo', 'material_vencimiento_proximo')
}

beforeAll(async () => {
  fx = await setupFixture()
  await limpiar()

  const svc = serviceClient()
  const { data: cajon } = await svc.from('cajones')
    .select('id').eq('carro_id', fx.carros.A1).limit(1).maybeSingle()

  if (cajon) {
    cajonId = cajon.id
  } else {
    const { data } = await svc.from('cajones')
      .insert({ carro_id: fx.carros.A1, nombre: 'ZZ Cajon prueba', orden: 99, activo: true })
      .select().single()
    cajonId = data!.id
  }
}, 60_000)

afterAll(async () => {
  await limpiar()
  await serviceClient().from('cajones').delete().eq('nombre', 'ZZ Cajon prueba')
  if (fx) await teardownFixture(fx)
}, 40_000)

/** Mete un material con la fecha de caducidad que se quiera. */
async function material(nombre: string, dias: number) {
  const { error } = await serviceClient().from('materiales').insert({
    cajon_id: cajonId, nombre: `${PREFIJO} ${nombre}`,
    cantidad_requerida: 1, activo: true,
    tiene_vencimiento: true, fecha_vencimiento: enDias(dias),
  })
  if (error) throw new Error(`material ${nombre}: ${error.message}`)
}

/** Lanza el aviso como lo hace pg_cron cada lunes. */
async function lanzarAviso(dias = 30) {
  const { data, error } = await serviceClient().rpc('avisar_vencimientos_proximos', { p_dias: dias })
  if (error) throw new Error(error.message)
  return Number(data)
}

describe('Aviso de vencimientos', () => {
  it('avisa de lo que caduca dentro del plazo y no de lo que queda lejos', async () => {
    await limpiar()
    await material('caduca pronto', 10)
    await material('caduca muy lejos', 400)

    expect(await lanzarAviso(30), 'no se creó ningún aviso').toBeGreaterThan(0)

    const { data: alertas } = await serviceClient().from('alertas')
      .select('titulo, mensaje, severidad')
      .eq('tipo', 'material_vencimiento_proximo')

    expect(alertas?.length).toBe(1)
    expect(alertas![0].mensaje, 'no nombra el material que caduca').toContain('caduca pronto')
    expect(alertas![0].mensaje, 'incluyó uno que caduca dentro de un año').not.toContain('muy lejos')
  }, 60_000)

  it('lo ya caducado es crítico, no un recordatorio', async () => {
    // Algo caducado dentro de un carro de parada no admite "ya lo miraré".
    await limpiar()
    await material('vencido', -5)

    await lanzarAviso(30)

    const { data } = await serviceClient().from('alertas')
      .select('severidad, titulo').eq('tipo', 'material_vencimiento_proximo').single()

    expect(data!.severidad).toBe('critica')
    expect(data!.titulo).toMatch(/CADUCADO/i)
  }, 60_000)

  it('no repite el aviso mientras el anterior siga sin atender', async () => {
    // Una bandeja con el mismo aviso cinco veces se deja de mirar, que es la
    // forma más rápida de que un aviso deje de servir para nada.
    await limpiar()
    await material('repetido', 10)

    expect(await lanzarAviso(30)).toBe(1)
    expect(await lanzarAviso(30), 'volvió a avisar de lo mismo').toBe(0)

    const { count } = await serviceClient().from('alertas')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'material_vencimiento_proximo')
    expect(count).toBe(1)
  }, 60_000)

  it('el aviso llega a la bandeja de quien tiene los avisos activados', async () => {
    // Una alerta que nadie ve en su bandeja no ha avisado de nada.
    //
    // Solo llega a quien los tenga activados, a propósito: los avisos también
    // salen por correo y no se le encienden a nadie sin que alguien lo decida.
    // El efecto secundario es que si nadie los activa, el sistema de alertas
    // entero funciona y no avisa a ninguna persona —que es exactamente lo que
    // estaba pasando en producción, con cero de nueve usuarios activados.
    await limpiar()
    const svc = serviceClient()
    await svc.from('perfiles')
      .update({ recibir_alertas: true }).eq('id', fx.users.adminA.id)

    try {
      await material('para avisar', 7)
      await lanzarAviso(30)

      const { data } = await svc.from('notificaciones')
        .select('usuario_id, titulo').eq('tipo', 'material_vencimiento_proximo')

      expect(data?.length ?? 0, 'la alerta no llegó a la bandeja de nadie').toBeGreaterThan(0)
    } finally {
      await svc.from('perfiles')
        .update({ recibir_alertas: false }).eq('id', fx.users.adminA.id)
    }
  }, 60_000)

  it('sin nadie con avisos activados, la alerta queda pero no avisa', async () => {
    // Se fija a propósito: es el estado real que tenía producción, y conviene
    // que quede escrito por qué la bandeja estaba vacía pese a haber alertas.
    await limpiar()
    await material('nadie escucha', 7)
    await lanzarAviso(30)

    const svc = serviceClient()
    const { count: alertas } = await svc.from('alertas')
      .select('id', { count: 'exact', head: true }).eq('tipo', 'material_vencimiento_proximo')
    const { count: avisos } = await svc.from('notificaciones')
      .select('id', { count: 'exact', head: true }).eq('tipo', 'material_vencimiento_proximo')

    expect(alertas, 'la alerta debería registrarse igualmente').toBe(1)
    expect(avisos, 'no debería avisar a quien no lo ha pedido').toBe(0)
  }, 60_000)
})
