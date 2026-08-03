/**
 * Aviso de inspecciones que se quedan reabiertas.
 *
 * Reabrir deja la inspección editable. Si nadie la cierra, se queda editable
 * indefinidamente y la firma deja de garantizar nada — lo contrario de para lo
 * que existe el mecanismo. Y nadie lo notaría: en los listados se ve igual que
 * cualquier otra.
 *
 * Se comprueba que el aviso salte cuando toca, que NO salte antes de tiempo, y
 * que no se repita cada mañana: un aviso diario que nadie puede silenciar
 * acaba ignorándose, y con él los que sí importan.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

const TIPO = 'inspeccion_reabierta_olvidada'

/** Inspección firmada y reabierta hace `diasAtras` días. */
async function sembrarReabierta(carroId: string, diasAtras: number) {
  const svc = serviceClient()
  const { data: insp, error } = await svc.from('inspecciones').insert({
    carro_id: carroId,
    tipo: 'mensual',
    resultado: 'operativo',
    auditor_id: fx.users.adminA.id,
    firmante_nombre: 'Dra. Prueba',
    firmado_en: new Date().toISOString(),
    reabierta_en: new Date(Date.now() - diasAtras * 86400000).toISOString(),
    reabierta_por: fx.users.adminA.id,
    motivo_reapertura: 'Faltaba anotar el laringoscopio',
    veces_reabierta: 1,
  }).select().single()
  if (error) throw new Error(`sembrar: ${error.message}`)
  return insp!.id as string
}

/** Borra los avisos de este tipo para dejar el escenario limpio. */
async function limpiarAvisos() {
  const svc = serviceClient()
  await svc.from('alertas').delete().eq('tipo', TIPO)
}

async function contarAvisos(carroId: string) {
  const svc = serviceClient()
  const { count } = await svc.from('alertas')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', TIPO).eq('carro_id', carroId)
  return count ?? 0
}

describe('Aviso de reapertura olvidada', () => {
  it('avisa de una inspección reabierta hace 5 días', async () => {
    await limpiarAvisos()
    await sembrarReabierta(fx.carros.A1, 5)

    const svc = serviceClient()
    const { data: creadas, error } = await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })

    expect(error, error?.message).toBeNull()
    expect(creadas, 'no se generó ningún aviso').toBeGreaterThan(0)
    expect(await contarAvisos(fx.carros.A1)).toBe(1)
  }, 40_000)

  it('el aviso dice quién la reabrió y por qué', async () => {
    // Un aviso que solo dice "hay algo abierto" obliga a investigar. El motivo
    // y el nombre son lo que permite resolverlo sin buscar nada.
    const svc = serviceClient()
    const { data } = await svc.from('alertas')
      .select('titulo, mensaje, severidad, hospital_id')
      .eq('tipo', TIPO).eq('carro_id', fx.carros.A1).single()

    expect(data!.mensaje).toContain('laringoscopio')
    expect(data!.severidad).toBe('alta')
    expect(data!.hospital_id, 'sin hospital no llega a nadie').toBe(fx.hospitales.A)
  }, 30_000)

  it('NO avisa de una reabierta hoy mismo', async () => {
    await limpiarAvisos()
    await sembrarReabierta(fx.carros.A2, 0)

    const svc = serviceClient()
    await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })

    expect(await contarAvisos(fx.carros.A2),
      'avisó de una reapertura recién hecha').toBe(0)
  }, 40_000)

  it('no repite el aviso mientras el anterior siga sin resolver', async () => {
    // Si avisara cada mañana, el ruido acabaría haciendo que se ignore — y con
    // él los avisos que sí importan.
    await limpiarAvisos()
    await sembrarReabierta(fx.carros.A1, 5)

    const svc = serviceClient()
    await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })
    await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })
    await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })

    expect(await contarAvisos(fx.carros.A1),
      'se duplicó el aviso en ejecuciones sucesivas').toBe(1)
  }, 40_000)

  it('vuelve a avisar si se resolvió el anterior y sigue abierta', async () => {
    // Resolver el aviso sin cerrar la inspección no debe dejarla en silencio
    // para siempre: al día siguiente vuelve a recordarlo.
    const svc = serviceClient()
    await svc.from('alertas').update({ resuelta: true })
      .eq('tipo', TIPO).eq('carro_id', fx.carros.A1)

    await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })

    const { count } = await svc.from('alertas')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', TIPO).eq('carro_id', fx.carros.A1).eq('resuelta', false)

    expect(count, 'no volvió a avisar tras resolver el anterior').toBe(1)
  }, 40_000)

  it('deja de avisar cuando la inspección se cierra', async () => {
    await limpiarAvisos()
    const inspId = await sembrarReabierta(fx.carros.A2, 5)

    const svc = serviceClient()
    await svc.from('inspecciones')
      .update({ reabierta_en: null, modificado_en: new Date().toISOString() })
      .eq('id', inspId)

    const { data: creadas } = await svc.rpc('alertar_inspecciones_reabiertas', { p_dias: 2 })
    expect(await contarAvisos(fx.carros.A2), 'avisó de una inspección ya cerrada').toBe(0)
  }, 40_000)
})
