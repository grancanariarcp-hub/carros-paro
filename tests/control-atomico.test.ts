/**
 * El guardado de un control, como una sola operación.
 *
 * Antes la pantalla encadenaba seis escrituras sueltas y solo miraba el error
 * de la primera. Lo peor que podía pasar era que fallaran los ítems: quedaba
 * una inspección firmada y sin detalle, y como una inspección firmada es
 * inmutable, ese detalle ya no se podía añadir nunca.
 *
 * Estas pruebas llaman a registrar_control, que es exactamente lo que llama la
 * pantalla. Las que había antes reproducían la secuencia por su cuenta, así
 * que podían pasar mientras la aplicación fallaba.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

/** Los argumentos tal como los manda la pantalla de control. */
function argumentos(carroId: string, extra: Record<string, any> = {}) {
  return {
    p_carro_id: carroId,
    p_tipo: 'mensual',
    p_resultado: 'operativo',
    p_items: [
      { cantidad_ok: true,  estado_ok: true,  tiene_falla: false },
      { cantidad_ok: false, estado_ok: true,  tiene_falla: true,
        tipo_falla: 'menor', descripcion_falla: 'Falta material' },
    ],
    p_proximo_control: '2026-09-03',
    p_firma: { nombre: 'Dra. Prueba', cargo: 'Enfermera', firmado_en: new Date().toISOString() },
    p_desfibrilador: { numero_censo: 'C-1', modelo: 'X Series', marca: 'Zoll' },
    p_precintos: { retirado: '111', colocado: '222' },
    ...extra,
  }
}

/**
 * Cuántas inspecciones tiene el carro ahora mismo.
 *
 * Estas pruebas no borran lo que crean: una inspección firmada es inmutable a
 * propósito y el disparador tampoco deja borrarla, que es justo lo que se
 * quiere. Así que en vez de limpiar y contar desde cero, se compara el antes
 * con el después.
 */
async function cuantasInspecciones(carroId: string): Promise<number> {
  const { count } = await serviceClient().from('inspecciones')
    .select('id', { count: 'exact', head: true }).eq('carro_id', carroId)
  return count ?? 0
}

describe('Un control se guarda entero o no se guarda', () => {
  it('guarda inspección, ítems, carro, desfibrilador y auditoría', async () => {
    const sb = await clientForUser(fx.users.adminA as any)

    const { data: inspId, error } = await sb.rpc('registrar_control', argumentos(fx.carros.A1))
    expect(error, error?.message).toBeNull()
    expect(inspId).toBeTruthy()

    const svc = serviceClient()

    const { data: items } = await svc.from('items_inspeccion')
      .select('tiene_falla').eq('inspeccion_id', inspId)
    expect(items?.length, 'la inspección se quedó sin detalle').toBe(2)

    const { data: carro } = await svc.from('carros')
      .select('estado, proximo_control, ultimo_tipo_control').eq('id', fx.carros.A1).single()
    // Si esto no se actualiza, el carro se cae del calendario en silencio.
    expect(carro!.proximo_control, 'el carro no volvió a entrar en el calendario').toBe('2026-09-03')
    expect(carro!.estado).toBe('operativo')
    expect(carro!.ultimo_tipo_control).toBe('mensual')

    const { data: desf } = await svc.from('desfibriladores')
      .select('modelo, marca').eq('carro_id', fx.carros.A1).single()
    expect(desf!.modelo).toBe('X Series')

    // Cada control deja dos asientos: el genérico del disparador de cambios y
    // el del evento de negocio. Sin hospital no salen al filtrar por centro.
    const { data: log } = await svc.from('log_auditoria')
      .select('hospital_id, resultado, accion').eq('registro_id', inspId)

    expect(log?.length, 'no quedó registro de auditoría').toBeGreaterThan(0)
    const sinHospital = (log || []).filter(l => !l.hospital_id)
    expect(sinHospital.length,
      `${sinHospital.length} asiento(s) sin hospital: no saldrán al filtrar la auditoría`).toBe(0)

    const negocio = (log || []).find(l => l.accion === 'control_realizado')
    expect(negocio, 'no se registró el control como evento').toBeTruthy()
    expect(negocio!.resultado).toBe('exito')
  }, 40_000)

  it('si el control es inválido no deja NADA a medias', async () => {
    // Esta es la razón de ser de todo el cambio: antes, un fallo a mitad
    // dejaba una inspección firmada sin detalle, imposible de arreglar porque
    // una inspección firmada ya no se puede tocar.
    const antes = await cuantasInspecciones(fx.carros.A1)
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.rpc('registrar_control',
      argumentos(fx.carros.A1, { p_items: [] }))
    expect(error, 'se aceptó un control sin ítems').toBeTruthy()

    expect(await cuantasInspecciones(fx.carros.A1),
      'quedó una inspección huérfana tras el fallo').toBe(antes)
  }, 40_000)

  it('no se puede registrar un control en el carro de otro hospital', async () => {
    const antes = await cuantasInspecciones(fx.carros.B1)
    const sb = await clientForUser(fx.users.adminA as any)

    const { error } = await sb.rpc('registrar_control', argumentos(fx.carros.B1))
    expect(error, 'se firmó un control en el carro de otro hospital').toBeTruthy()

    expect(await cuantasInspecciones(fx.carros.B1),
      'quedó una inspección en el carro ajeno').toBe(antes)
  }, 40_000)

  it('un supervisor puede firmar el control de su propio servicio', async () => {
    // El caso normal: quien pasa el control a pie de carro es el supervisor.
    // Si esto se rompiera, la aplicación dejaría de servir para su trabajo.
    const sb = await clientForUser(fx.users.supervisorA1 as any)

    const { data: inspId, error } = await sb.rpc('registrar_control', argumentos(fx.carros.A1))
    expect(error, error?.message).toBeNull()

    const { data: items } = await serviceClient().from('items_inspeccion')
      .select('id').eq('inspeccion_id', inspId)
    expect(items?.length).toBe(2)
  }, 40_000)

  it('el detalle de un control firmado no se puede alterar despues', async () => {
    // Trazabilidad ISO 13485: lo firmado es lo que se comprobó.
    const sb = await clientForUser(fx.users.adminA as any)
    const { data: inspId } = await sb.rpc('registrar_control', argumentos(fx.carros.A1))

    const svc = serviceClient()
    const { data: items } = await svc.from('items_inspeccion')
      .select('id').eq('inspeccion_id', inspId).limit(1)

    const { error } = await svc.from('items_inspeccion')
      .update({ tiene_falla: false }).eq('id', items![0].id)
    expect(error, 'se pudo alterar el detalle de una inspección firmada').toBeTruthy()
  }, 40_000)
})
