/**
 * Reapertura controlada de inspecciones firmadas.
 *
 * Una inspección firmada no se edita: se ENMIENDA. Alguien con autoridad la
 * reabre dejando constancia del motivo, se corrige, y al cerrarla queda el
 * sello de "modificado el ...". La firma original nunca se mueve.
 *
 * Lo que se comprueba aquí es que ese mecanismo no tenga puertas traseras: que
 * no pueda reabrir quien no debe, que no valga como excusa para tocar la firma
 * original, y que el estado cerrado siga siendo realmente inmutable.
 *
 * Apunta a astor-dev vía .env.test (ver tests/helpers.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

const MOTIVO = 'Faltaba anotar el laringoscopio del cajón 3'

/** Crea una inspección firmada con un item. */
async function sembrarFirmada() {
  const svc = serviceClient()
  const { data: insp } = await svc.from('inspecciones').insert({
    carro_id: fx.carros.A1,
    tipo: 'mensual',
    resultado: 'operativo',
    auditor_id: fx.users.adminA.id,
    firmante_nombre: 'Dra. Prueba',
    firmado_en: new Date().toISOString(),
  }).select().single()

  const { data: item } = await svc.from('items_inspeccion').insert({
    inspeccion_id: insp!.id, cantidad_ok: true, estado_ok: true, tiene_falla: false,
  }).select().single()

  return { inspeccionId: insp!.id as string, itemId: item!.id as string, firmadoEn: insp!.firmado_en }
}

describe('Reapertura — quién puede', () => {
  it('un administrador SÍ puede reabrir una inspección de su hospital', async () => {
    const { inspeccionId } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    const { data, error } = await sb.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId, p_motivo: MOTIVO,
    })

    expect(error, error?.message).toBeNull()
    expect(data?.reabierta_en).toBeTruthy()
    expect(data?.motivo_reapertura).toBe(MOTIVO)
    expect(data?.veces_reabierta).toBe(1)
  }, 30_000)

  it('un supervisor NO puede reabrir', async () => {
    const { inspeccionId } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.supervisorA1 as any)

    const { error } = await sb.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId, p_motivo: MOTIVO,
    })

    expect(error, 'un supervisor pudo reabrir una inspección firmada').toBeTruthy()
    // Sin acentos en la comparación: el mensaje llega de Postgres y la
    // codificación de los acentos no sobrevive el viaje de forma fiable.
    expect(error?.message).toMatch(/calidad pueden reabrir/i)
  }, 30_000)

  it('el administrador de OTRO hospital no puede reabrirla', async () => {
    const { inspeccionId } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.adminB as any)

    const { error } = await sb.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId, p_motivo: MOTIVO,
    })

    expect(error, 'un admin de otro hospital pudo reabrirla').toBeTruthy()
  }, 30_000)
})

describe('Reapertura — el motivo es obligatorio', () => {
  it('rechaza reabrir sin motivo', async () => {
    const { inspeccionId } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId, p_motivo: null,
    })

    expect(error, 'se pudo reabrir sin motivo').toBeTruthy()
    expect(error?.message).toMatch(/motivo/i)
  }, 30_000)

  it('rechaza un motivo demasiado corto', async () => {
    const { inspeccionId } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId, p_motivo: 'error',
    })

    expect(error, 'se coló un motivo de 5 caracteres').toBeTruthy()
  }, 30_000)
})

describe('Reapertura — el ciclo completo', () => {
  it('reabierta admite cambios; cerrada vuelve a bloquearlos', async () => {
    const { inspeccionId, itemId } = await sembrarFirmada()
    const sb  = await clientForUser(fx.users.adminA as any)
    const svc = serviceClient()

    // Cerrada: no se puede tocar el detalle.
    const antes = await sb.from('items_inspeccion')
      .update({ tiene_falla: true }).eq('id', itemId)
    expect(antes.error, 'se pudo tocar el detalle estando cerrada').toBeTruthy()

    // Reabrir.
    const { error: eAbrir } = await sb.rpc('reabrir_inspeccion', {
      p_inspeccion_id: inspeccionId, p_motivo: MOTIVO,
    })
    expect(eAbrir, eAbrir?.message).toBeNull()

    // Abierta: ahora sí.
    const durante = await svc.from('items_inspeccion')
      .update({ tiene_falla: true, descripcion_falla: 'Faltaba el laringoscopio' })
      .eq('id', itemId)
    expect(durante.error, 'no se pudo corregir con la inspección reabierta').toBeNull()

    // Cerrar.
    const { data: cerrada, error: eCerrar } = await sb.rpc('cerrar_inspeccion', {
      p_inspeccion_id: inspeccionId,
    })
    expect(eCerrar, eCerrar?.message).toBeNull()
    expect(cerrada?.reabierta_en).toBeNull()
    expect(cerrada?.modificado_en, 'no quedó sello de modificación').toBeTruthy()

    // Cerrada otra vez: vuelve a estar bloqueada.
    const despues = await svc.from('items_inspeccion')
      .update({ tiene_falla: false }).eq('id', itemId)
    expect(despues.error, 'siguió editable tras cerrar').toBeTruthy()
  }, 40_000)

  it('la fecha de firma original NO cambia al enmendar', async () => {
    // Es la razón de ser de todo esto: la inspección firmada el día X seguirá
    // diciendo que se firmó el día X, por muchas enmiendas que reciba.
    const { inspeccionId, firmadoEn } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    await sb.rpc('reabrir_inspeccion', { p_inspeccion_id: inspeccionId, p_motivo: MOTIVO })
    await sb.rpc('cerrar_inspeccion',  { p_inspeccion_id: inspeccionId })

    const svc = serviceClient()
    const { data } = await svc.from('inspecciones')
      .select('firmado_en, modificado_en, veces_reabierta').eq('id', inspeccionId).single()

    expect(data!.firmado_en).toBe(firmadoEn)
    expect(data!.modificado_en).toBeTruthy()
    expect(data!.veces_reabierta).toBe(1)
  }, 40_000)

  it('ni siquiera reabierta se puede alterar la firma', async () => {
    // Si se pudiera "desfirmar" al reabrir, todo el mecanismo sería decorativo:
    // bastaría con reabrir y borrar firmado_en para editar a placer.
    const { inspeccionId } = await sembrarFirmada()
    const sb  = await clientForUser(fx.users.adminA as any)
    const svc = serviceClient()

    await sb.rpc('reabrir_inspeccion', { p_inspeccion_id: inspeccionId, p_motivo: MOTIVO })

    const { error } = await svc.from('inspecciones')
      .update({ firmado_en: null, firmante_nombre: 'Otro' }).eq('id', inspeccionId)

    expect(error, 'se pudo borrar la firma de una inspección reabierta').toBeTruthy()
    expect(error?.message).toMatch(/firma/i)
  }, 30_000)
})

describe('Reapertura — queda en la auditoría', () => {
  it('registra quién reabrió, cuándo y por qué', async () => {
    const { inspeccionId } = await sembrarFirmada()
    const sb = await clientForUser(fx.users.adminA as any)

    await sb.rpc('reabrir_inspeccion', { p_inspeccion_id: inspeccionId, p_motivo: MOTIVO })

    const svc = serviceClient()
    const { data } = await svc.from('log_auditoria')
      .select('usuario_id, accion, detalle, fecha')
      .eq('registro_id', inspeccionId)
      .eq('accion', 'inspeccion_reabierta')

    expect(data?.length, 'la reapertura no quedó registrada').toBe(1)
    expect(data![0].usuario_id).toBe(fx.users.adminA.id)
    expect((data![0].detalle as any).motivo).toBe(MOTIVO)
    expect(data![0].fecha).toBeTruthy()
  }, 30_000)
})
