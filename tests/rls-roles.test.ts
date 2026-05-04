/**
 * Tests RLS por rol autenticado: cada rol solo ve lo que le corresponde,
 * los hospitales están aislados, supervisor solo ve su servicio (excepto
 * vía lookup_codigo_barras), inspecciones firmadas son inmutables.
 *
 * Apunta a astor-dev. Crea fixtures temporales y los limpia al final.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupFixture, teardownFixture, clientForUser,
  type TestFixture,
} from './fixtures'

let fx: TestFixture

beforeAll(async () => {
  fx = await setupFixture()
}, 60_000)

afterAll(async () => {
  if (fx) await teardownFixture(fx)
}, 30_000)


describe('Aislamiento entre hospitales', () => {
  it('admin de hospital A NO ve carros de hospital B', async () => {
    const sb = await clientForUser(fx.users.adminA)
    const { data } = await sb.from('carros').select('id, codigo, hospital_id')
    const fromB = (data ?? []).filter(c => c.hospital_id === fx.hospitales.B)
    expect(fromB).toEqual([])
  })

  it('calidad de hospital A NO ve carros de hospital B', async () => {
    const sb = await clientForUser(fx.users.calidadA)
    const { data } = await sb.from('carros').select('id, hospital_id')
    const fromB = (data ?? []).filter(c => c.hospital_id === fx.hospitales.B)
    expect(fromB).toEqual([])
  })

  it('admin de A NO ve perfiles de B', async () => {
    const sb = await clientForUser(fx.users.adminA)
    const { data } = await sb.from('perfiles').select('id, hospital_id')
    const fromB = (data ?? []).filter(p => p.hospital_id === fx.hospitales.B)
    expect(fromB).toEqual([])
  })

  it('admin de A NO ve servicios de B', async () => {
    const sb = await clientForUser(fx.users.adminA)
    const { data } = await sb.from('servicios').select('id, hospital_id')
    const fromB = (data ?? []).filter(s => s.hospital_id === fx.hospitales.B)
    expect(fromB).toEqual([])
  })

  it('admin de B NO ve carros de A', async () => {
    const sb = await clientForUser(fx.users.adminB)
    const { data } = await sb.from('carros').select('id, hospital_id')
    const fromA = (data ?? []).filter(c => c.hospital_id === fx.hospitales.A)
    expect(fromA).toEqual([])
  })

  it('admin de A NO puede INSERTAR carro en hospital B', async () => {
    const sb = await clientForUser(fx.users.adminA)
    const { error } = await sb.from('carros').insert({
      hospital_id: fx.hospitales.B,
      codigo: `attack-${Date.now()}`,
      nombre: 'Carro inyectado por A',
    })
    // RLS rechaza el WITH CHECK
    expect(error).not.toBeNull()
  })
})


describe('Visibilidad por rol dentro de un hospital', () => {
  it('admin ve TODOS los carros de su hospital', async () => {
    const sb = await clientForUser(fx.users.adminA)
    const { data } = await sb.from('carros').select('id, servicio_id')
    const ids = (data ?? []).map(c => c.id)
    expect(ids).toContain(fx.carros.A1)
    expect(ids).toContain(fx.carros.A2)
  })

  it('calidad ve TODOS los carros de su hospital', async () => {
    const sb = await clientForUser(fx.users.calidadA)
    const { data } = await sb.from('carros').select('id, servicio_id')
    const ids = (data ?? []).map(c => c.id)
    expect(ids).toContain(fx.carros.A1)
    expect(ids).toContain(fx.carros.A2)
  })

  it('supervisor SOLO ve carros de su servicio en listados', async () => {
    const sb = await clientForUser(fx.users.supervisorA1)
    const { data } = await sb.from('carros').select('id, servicio_id')
    const ids = (data ?? []).map(c => c.id)
    expect(ids).toContain(fx.carros.A1)         // su servicio
    expect(ids).not.toContain(fx.carros.A2)     // OTRO servicio del mismo hospital
  })

  it('supervisor NO puede actualizar carro de OTRO servicio', async () => {
    const sb = await clientForUser(fx.users.supervisorA1)
    const { error, data } = await sb.from('carros')
      .update({ nombre: 'modificado por supervisor' })
      .eq('id', fx.carros.A2)
      .select()
    // El update no debe afectar ninguna fila (data vacío) o devolver error.
    // En RLS estricto, devolver array vacío es lo esperado.
    expect((data ?? []).length).toBe(0)
  })
})


describe('Lookup por código de barras (cross-servicio en mismo hospital)', () => {
  it('supervisor escanea código de carro de OTRO servicio del mismo hospital → SÍ ve', async () => {
    const { serviceClient } = await import('./helpers')
    const svc = serviceClient()
    // Obtenemos el código del carro A2 vía service_role (el supervisor NO lo
    // ve por SELECT normal — es exactamente lo que probamos: que SÍ lo ve
    // vía lookup_codigo_barras).
    const { data: cA2 } = await svc.from('carros')
      .select('codigo').eq('id', fx.carros.A2).single()
    expect(cA2?.codigo).toBeTruthy()

    const sb = await clientForUser(fx.users.supervisorA1)
    const { data, error } = await sb.rpc('lookup_codigo_barras', {
      p_codigo: cA2!.codigo,
    })
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect((data as any).tipo).toBe('carro')
    expect((data as any).id).toBe(fx.carros.A2)
  })

  it('supervisor de A NO encuentra códigos de hospital B (otro hospital)', async () => {
    const { serviceClient } = await import('./helpers')
    const svc = serviceClient()
    const { data: cB1 } = await svc.from('carros')
      .select('codigo').eq('id', fx.carros.B1).single()
    expect(cB1?.codigo).toBeTruthy()

    const sb = await clientForUser(fx.users.supervisorA1)
    const { data } = await sb.rpc('lookup_codigo_barras', { p_codigo: cB1!.codigo })
    // lookup_codigo_barras filtra por hospital del usuario → debe ser null
    expect(data).toBeNull()
  })
})


describe('Inmutabilidad ISO', () => {
  it('inspección firmada NO se puede modificar', async () => {
    // Sembramos una inspección firmada con service_role
    const { serviceClient } = await import('./helpers')
    const svc = serviceClient()

    const { data: insp } = await svc.from('inspecciones').insert({
      carro_id: fx.carros.A1,
      tipo: 'mensual',
      resultado: 'operativo',
      auditor_id: fx.users.adminA.id,
      fecha: new Date().toISOString(),
      firma_url: 'https://example.test/firma.png',
      firmante_nombre: 'Test Firmante',
      firmante_cargo: 'Calidad',
      firmado_en: new Date().toISOString(),
    }).select('id').single()

    expect(insp?.id).toBeTruthy()

    // Intentamos modificar resultado vía service_role (sin RLS) — debe rechazar
    // por el TRIGGER bloquear_inspeccion_firmada
    const { error } = await svc.from('inspecciones')
      .update({ resultado: 'no_operativo' })
      .eq('id', insp!.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/firmada/i)

    // Cleanup: forzar borrado se intenta sin éxito porque el trigger también
    // bloquea DELETE; lo desfirmamos primero o lo dejamos. Como cleanup,
    // dejamos en BD la fila — el teardown del fixture borra los carros (CASCADE
    // borra inspecciones).
  })
})


