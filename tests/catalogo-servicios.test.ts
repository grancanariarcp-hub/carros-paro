/**
 * Catálogo de servicios y adopción por hospital.
 *
 * Los servicios del catálogo son plantillas compartidas; al adoptarlas, cada
 * hospital se queda con su propia COPIA. Lo que se comprueba aquí es que esa
 * copia respete el aislamiento entre centros —la base de toda la app— y que
 * adoptar dos veces no llene los desplegables de duplicados.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

/** Un servicio del catálogo cualquiera, para copiar en las pruebas. */
async function unaPlantilla() {
  const svc = serviceClient()
  const { data } = await svc.from('servicios')
    .select('id, nombre').eq('es_plantilla', true).eq('activo', true).limit(1)
  return data![0]
}

describe('Catálogo — quién puede adoptar', () => {
  it('un administrador adopta servicios para SU hospital', async () => {
    const plantilla = await unaPlantilla()
    const sb = await clientForUser(fx.users.adminA as any)

    const { data, error } = await sb.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: fx.hospitales.A,
      p_servicio_ids: [plantilla.id],
    })

    expect(error, error?.message).toBeNull()
    expect(Number(data)).toBeGreaterThanOrEqual(0)

    const svc = serviceClient()
    const { data: copia } = await svc.from('servicios')
      .select('id, hospital_id, es_plantilla')
      .eq('hospital_id', fx.hospitales.A).eq('nombre', plantilla.nombre).single()

    // La copia es del hospital y NO es plantilla: si lo fuera, editarla
    // cambiaría el catálogo para todos los demás centros.
    expect(copia!.hospital_id).toBe(fx.hospitales.A)
    expect(copia!.es_plantilla).toBe(false)
  }, 40_000)

  it('un administrador NO puede adoptar para otro hospital', async () => {
    const plantilla = await unaPlantilla()
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: fx.hospitales.B,
      p_servicio_ids: [plantilla.id],
    })

    expect(error, 'un admin llenó de servicios el hospital de otro').toBeTruthy()
    expect(error?.message).toMatch(/tu propio hospital/i)
  }, 30_000)

  it('un supervisor no puede adoptar servicios', async () => {
    const plantilla = await unaPlantilla()
    const sb = await clientForUser(fx.users.supervisorA1 as any)

    const { error } = await sb.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: fx.hospitales.A,
      p_servicio_ids: [plantilla.id],
    })

    expect(error, 'un supervisor pudo adoptar servicios').toBeTruthy()
  }, 30_000)
})

describe('Catálogo — sin duplicados', () => {
  it('adoptar dos veces el mismo servicio no lo duplica', async () => {
    // Un desplegable con "Urgencias" tres veces es inservible: nadie sabe cuál
    // elegir y los informes se parten en trozos.
    const plantilla = await unaPlantilla()
    const sb = await clientForUser(fx.users.adminA as any)

    await sb.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_servicio_ids: [plantilla.id],
    })
    await sb.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_servicio_ids: [plantilla.id],
    })

    const svc = serviceClient()
    const { count } = await svc.from('servicios')
      .select('id', { count: 'exact', head: true })
      .eq('hospital_id', fx.hospitales.A).eq('nombre', plantilla.nombre)
      .is('deleted_at', null)

    expect(count, 'se duplicó el servicio al adoptarlo dos veces').toBe(1)
  }, 40_000)
})

describe('Desactivar servicios', () => {
  it('el administrador puede desactivar un servicio de su hospital', async () => {
    const plantilla = await unaPlantilla()
    const sb = await clientForUser(fx.users.adminA as any)
    await sb.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_servicio_ids: [plantilla.id],
    })

    const svc = serviceClient()
    const { data: copia } = await svc.from('servicios')
      .select('id').eq('hospital_id', fx.hospitales.A).eq('nombre', plantilla.nombre).single()

    const { error } = await sb.from('servicios')
      .update({ activo: false }).eq('id', copia!.id)
    expect(error, error?.message).toBeNull()

    const { data } = await svc.from('servicios').select('activo').eq('id', copia!.id).single()
    expect(data!.activo).toBe(false)
  }, 40_000)

  it('NO puede desactivar un servicio de otro hospital', async () => {
    // Desactivar el servicio de otro centro le dejaría los carros sin
    // clasificar y a sus supervisores sin ver nada.
    const svc = serviceClient()
    const NOMBRE = 'Servicio prueba B'

    // Hay UNIQUE (hospital_id, nombre): sin limpiar antes, la segunda
    // ejecución del test choca con la fila que dejó la primera y falla por
    // donde no toca. El teardown del fixture no borra servicios.
    await svc.from('servicios').delete()
      .eq('hospital_id', fx.hospitales.B).eq('nombre', NOMBRE)

    const { data: servB, error: eInsert } = await svc.from('servicios')
      .insert({ nombre: NOMBRE, hospital_id: fx.hospitales.B, activo: true, es_plantilla: false })
      .select().single()
    expect(eInsert, eInsert?.message).toBeNull()

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      await sb.from('servicios').update({ activo: false }).eq('id', servB!.id)

      // RLS no da error en un UPDATE bloqueado: simplemente no afecta a
      // ninguna fila, así que hay que mirar el dato.
      const { data } = await svc.from('servicios').select('activo').eq('id', servB!.id).single()
      expect(data!.activo, 'un admin desactivó el servicio de otro hospital').toBe(true)
    } finally {
      await svc.from('servicios').delete().eq('id', servB!.id)
    }
  }, 40_000)
})

describe('Catálogo — visibilidad', () => {
  it('cualquier usuario autenticado ve el catálogo', async () => {
    // Sin verlo no hay de dónde elegir. Son nombres genéricos de servicios
    // hospitalarios, no datos de ningún centro.
    const sb = await clientForUser(fx.users.adminA as any)
    const { data } = await sb.from('servicios').select('id').eq('es_plantilla', true)

    expect(data?.length ?? 0, 'el catálogo no se ve').toBeGreaterThan(0)
  }, 30_000)

  it('el admin de A NO ve los servicios propios de B', async () => {
    const sb = await clientForUser(fx.users.adminA as any)
    const { data } = await sb.from('servicios')
      .select('id').eq('hospital_id', fx.hospitales.B)

    expect(data?.length ?? 0, 'se vieron servicios de otro hospital').toBe(0)
  }, 30_000)
})
