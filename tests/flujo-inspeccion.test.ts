/**
 * El flujo que el hospital usa a diario: firmar un control y que quede como
 * prueba de lo que se revisó.
 *
 * Hasta ahora los tests cubrían permisos y aislamiento entre hospitales, pero
 * ni una línea de esto — y es lo que hace que la app sirva para algo. Si
 * alguien rompe el guardado de un control firmado, nada lo detectaba.
 *
 * Lo que se comprueba es lo que da valor legal a una inspección: que una vez
 * firmada, ni la cabecera ni el DETALLE puedan alterarse. Una firma que avala
 * un contenido modificable después no prueba nada.
 *
 * Apunta a astor-dev vía .env.test (ver tests/helpers.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

/** Crea una inspección FIRMADA con su item de detalle. Devuelve ambos ids. */
async function sembrarInspeccionFirmada() {
  const svc = serviceClient()

  const { data: insp, error: eInsp } = await svc.from('inspecciones').insert({
    carro_id: fx.carros.A1,
    tipo: 'mensual',
    resultado: 'operativo',
    auditor_id: fx.users.adminA.id,
    firmante_nombre: 'Dra. Prueba',
    firmante_usuario_id: fx.users.adminA.id,
    firmado_en: new Date().toISOString(),
  }).select().single()
  if (eInsp) throw new Error(`sembrar inspección: ${eInsp.message}`)

  const { data: item, error: eItem } = await svc.from('items_inspeccion').insert({
    inspeccion_id: insp.id,
    cantidad_ok: true,
    estado_ok: true,
    tiene_falla: false,
  }).select().single()
  if (eItem) throw new Error(`sembrar item: ${eItem.message}`)

  return { inspeccionId: insp.id as string, itemId: item.id as string }
}

describe('Inspección firmada — la cabecera es inmutable', () => {
  it('no se puede cambiar el resultado de una inspección firmada', async () => {
    const { inspeccionId } = await sembrarInspeccionFirmada()
    const svc = serviceClient()

    const { error } = await svc.from('inspecciones')
      .update({ resultado: 'no_operativo' })
      .eq('id', inspeccionId)

    expect(error, 'se pudo cambiar el resultado de una inspección firmada').toBeTruthy()
    expect(error?.message).toMatch(/firmada/i)
  }, 30_000)

  it('no se puede borrar una inspección firmada', async () => {
    const { inspeccionId } = await sembrarInspeccionFirmada()
    const svc = serviceClient()

    const { error } = await svc.from('inspecciones').delete().eq('id', inspeccionId)

    expect(error, 'se pudo borrar una inspección firmada').toBeTruthy()
  }, 30_000)
})

describe('Inspección firmada — el detalle también es inmutable', () => {
  it('un usuario del hospital NO puede alterar los items de una inspección firmada', async () => {
    // Este es el punto que da valor a la firma. La cabecera dice "operativo,
    // firmado por Dra. Prueba"; si el detalle de qué se revisó puede
    // reescribirse después, la firma no avala nada.
    const { itemId } = await sembrarInspeccionFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.from('items_inspeccion')
      .update({ tiene_falla: true, descripcion_falla: 'alterado despues de firmar' })
      .eq('id', itemId)

    expect(error, 'se pudo alterar el detalle de una inspección firmada').toBeTruthy()
  }, 30_000)

  it('un usuario del hospital NO puede borrar items de una inspección firmada', async () => {
    const { itemId } = await sembrarInspeccionFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    await sb.from('items_inspeccion').delete().eq('id', itemId)

    // Se comprueba con service_role: la fila debe seguir ahí. Un DELETE
    // bloqueado por RLS no devuelve error, simplemente no borra nada, así que
    // mirar `error` no bastaría.
    const svc = serviceClient()
    const { data } = await svc.from('items_inspeccion').select('id').eq('id', itemId)
    expect(data?.length, 'se borró el detalle de una inspección firmada').toBe(1)
  }, 30_000)
})

describe('El bloqueo no debe romper el guardado diario', () => {
  it('SÍ se pueden insertar items en una inspección recién firmada', async () => {
    // La pantalla de control crea la inspección YA firmada y a continuación
    // inserta sus items. Si el trigger bloqueara también el INSERT, cada
    // control que hiciera el hospital fallaría al guardar. Este test existe
    // para que nadie "endurezca" el trigger sin darse cuenta de eso.
    const svc = serviceClient()
    const { data: insp } = await svc.from('inspecciones').insert({
      carro_id: fx.carros.A1,
      tipo: 'mensual',
      resultado: 'operativo',
      auditor_id: fx.users.adminA.id,
      firmante_nombre: 'Dra. Prueba',
      firmado_en: new Date().toISOString(),
    }).select().single()

    const { error } = await svc.from('items_inspeccion').insert({
      inspeccion_id: insp!.id,
      cantidad_ok: true,
      estado_ok: true,
      tiene_falla: false,
    })

    expect(error, 'no se pudieron guardar los items de un control firmado').toBeNull()
  }, 30_000)
})

describe('Inspección sin firmar — sí se puede corregir', () => {
  it('una inspección aún no firmada admite cambios', async () => {
    // Lo contrario también importa: el bloqueo debe activarse al FIRMAR, no
    // antes. Si no, no se podría corregir un control a medio hacer.
    const svc = serviceClient()
    const { data: insp } = await svc.from('inspecciones').insert({
      carro_id: fx.carros.A1,
      tipo: 'mensual',
      resultado: 'operativo',
      auditor_id: fx.users.adminA.id,
      // sin firmado_en
    }).select().single()

    const { error } = await svc.from('inspecciones')
      .update({ resultado: 'condicional' })
      .eq('id', insp!.id)

    expect(error, 'una inspección sin firmar debería poder corregirse').toBeNull()
  }, 30_000)
})

describe('Inspecciones — aislamiento entre hospitales', () => {
  it('un admin de A NO puede crear una inspección sobre un carro de B', async () => {
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.from('inspecciones').insert({
      carro_id: fx.carros.B1,
      tipo: 'mensual',
      resultado: 'operativo',
      auditor_id: fx.users.adminA.id,
    })

    expect(error, 'se pudo inspeccionar un carro de otro hospital').toBeTruthy()
  }, 30_000)

  it('un admin de A NO ve las inspecciones del hospital B', async () => {
    const svc = serviceClient()
    const { data: inspB } = await svc.from('inspecciones').insert({
      carro_id: fx.carros.B1,
      tipo: 'mensual',
      resultado: 'operativo',
      auditor_id: fx.users.adminB.id,
    }).select().single()

    const sb = await clientForUser(fx.users.adminA as any)
    const { data } = await sb.from('inspecciones').select('id').eq('id', inspB!.id)

    expect(data?.length ?? 0, 'admin de A vio una inspección de B').toBe(0)
  }, 30_000)
})
