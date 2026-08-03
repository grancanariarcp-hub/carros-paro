/**
 * Reglas de la base alrededor de un control, y el aviso de carro no operativo.
 *
 * OJO: la pantalla ya NO guarda así. Desde que el control se escribe en una
 * sola transacción, la ruta real es la función registrar_control, y quien la
 * vigila es tests/control-atomico.test.ts. Estas pruebas reproducen la
 * secuencia por su cuenta, así que pueden pasar mientras la aplicación falla:
 * sirven para fijar las reglas de la base (aislamiento, restricciones) y el
 * aviso de "no operativo", que sigue lanzándose desde el cliente a propósito
 * —un fallo del aviso no debe tirar atrás un control ya firmado.
 *
 * De escribir estas pruebas salió un fallo real: la alerta de "carro no
 * operativo" se creaba con un insert directo sin hospital_id, y las funciones
 * de email y push buscan destinatarios POR HOSPITAL — así que el aviso no
 * llegaba a nadie. Aquí se fija el comportamiento correcto.
 *
 * Apunta a astor-dev vía .env.test (ver tests/helpers.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'
import { proximoControl } from '../lib/utils'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => { if (fx) await teardownFixture(fx) }, 30_000)

/** Reproduce el guardado tal como lo hace la pantalla de control. */
async function guardarControl(opciones: {
  carroId: string
  resultado: 'operativo' | 'condicional' | 'no_operativo'
  hospitalId: string
  tipo?: string
}) {
  const { carroId, resultado, hospitalId, tipo = 'mensual' } = opciones
  const svc = serviceClient()

  const { data: insp, error: eInsp } = await svc.from('inspecciones').insert({
    carro_id: carroId,
    tipo,
    resultado,
    auditor_id: fx.users.adminA.id,
    firmante_nombre: 'Dra. Prueba',
    firmante_usuario_id: fx.users.adminA.id,
    firmado_en: new Date().toISOString(),
  }).select().single()
  if (eInsp) throw new Error(`inspección: ${eInsp.message}`)

  const { error: eItems } = await svc.from('items_inspeccion').insert([
    { inspeccion_id: insp.id, cantidad_ok: true,  estado_ok: true,  tiene_falla: false },
    { inspeccion_id: insp.id, cantidad_ok: false, estado_ok: true,  tiene_falla: true,
      tipo_falla: resultado === 'no_operativo' ? 'grave' : 'menor',
      descripcion_falla: 'Falta material' },
  ])
  if (eItems) throw new Error(`items: ${eItems.message}`)

  const proximo = tipo !== 'post_uso' ? proximoControl('mensual') : null
  const { error: eCarro } = await svc.from('carros').update({
    estado: resultado,
    ultimo_control: new Date().toISOString(),
    ultimo_tipo_control: tipo,
    ...(proximo ? { proximo_control: proximo } : {}),
  }).eq('id', carroId)
  if (eCarro) throw new Error(`carro: ${eCarro.message}`)

  let alertaId: string | null = null
  if (resultado === 'no_operativo') {
    const { data, error } = await svc.rpc('crear_alerta_con_notificaciones', {
      p_hospital_id: hospitalId,
      p_tipo:        'carro_no_operativo',
      p_severidad:   'critica',
      p_titulo:      'Carro NO OPERATIVO',
      p_mensaje:     'Declarado no operativo en control de prueba',
      p_carro_id:    carroId,
      p_servicio_id: null,
    })
    if (error) throw new Error(`alerta: ${error.message}`)
    alertaId = data as string
  }

  return { inspeccionId: insp.id as string, alertaId }
}

describe('Guardar un control — lo que queda registrado', () => {
  it('los items quedan asociados a la inspección', async () => {
    const { inspeccionId } = await guardarControl({
      carroId: fx.carros.A1, resultado: 'operativo', hospitalId: fx.hospitales.A,
    })

    const svc = serviceClient()
    const { data } = await svc.from('items_inspeccion')
      .select('id, tiene_falla').eq('inspeccion_id', inspeccionId)

    expect(data?.length, 'no se guardaron los dos items').toBe(2)
    expect(data!.filter(i => i.tiene_falla).length).toBe(1)
  }, 40_000)

  it('el carro adopta el estado del control y programa el siguiente', async () => {
    await guardarControl({
      carroId: fx.carros.A2, resultado: 'condicional', hospitalId: fx.hospitales.A,
    })

    const svc = serviceClient()
    const { data: carro } = await svc.from('carros')
      .select('estado, ultimo_control, ultimo_tipo_control, proximo_control')
      .eq('id', fx.carros.A2).single()

    expect(carro!.estado).toBe('condicional')
    expect(carro!.ultimo_control, 'no se registró la fecha del control').toBeTruthy()
    expect(carro!.ultimo_tipo_control).toBe('mensual')
    // Un carro sin próxima fecha desaparece de los avisos de vencimiento.
    expect(carro!.proximo_control, 'no se programó el próximo control').toBeTruthy()
    expect(new Date(carro!.proximo_control!).getTime()).toBeGreaterThan(Date.now())
  }, 40_000)
})

describe('Carro no operativo — el aviso tiene que llegar', () => {
  it('la alerta se crea CON hospital, que es lo que usa el aviso', async () => {
    // El fallo original: sin hospital_id, las Edge Functions de email y push
    // no encuentran a quién avisar y el carro se queda no operativo en
    // silencio.
    const { alertaId } = await guardarControl({
      carroId: fx.carros.A1, resultado: 'no_operativo', hospitalId: fx.hospitales.A,
    })

    expect(alertaId, 'no se creó la alerta').toBeTruthy()

    const svc = serviceClient()
    const { data: alerta } = await svc.from('alertas')
      .select('hospital_id, severidad, tipo, resuelta').eq('id', alertaId!).single()

    expect(alerta!.hospital_id, 'la alerta salió sin hospital: nadie sería avisado')
      .toBe(fx.hospitales.A)
    expect(alerta!.severidad).toBe('critica')
    expect(alerta!.tipo).toBe('carro_no_operativo')
    expect(alerta!.resuelta).toBe(false)
  }, 40_000)

  it('genera notificaciones en la app para los responsables', async () => {
    // El insert directo tampoco creaba estas filas, así que la campana de la
    // app no se enteraba aunque el email sí saliera.
    //
    // Se activa recibir_alertas explícitamente porque su valor por defecto es
    // FALSE: un administrador recién creado no recibe nada hasta que alguien
    // se lo activa. En producción solo 1 de 8 usuarios lo tenía puesto
    // (comprobado el 2026-08-02), así que esto no es una peculiaridad del
    // test sino cómo se comporta la app de fábrica.
    const svc = serviceClient()
    await svc.from('perfiles')
      .update({ recibir_alertas: true }).eq('id', fx.users.adminA.id)

    const { alertaId } = await guardarControl({
      carroId: fx.carros.A1, resultado: 'no_operativo', hospitalId: fx.hospitales.A,
    })
    expect(alertaId).toBeTruthy()

    const { data } = await svc.from('notificaciones')
      .select('usuario_id, tipo')
      .eq('hospital_id', fx.hospitales.A)
      .eq('tipo', 'carro_no_operativo')

    expect(data?.length ?? 0, 'ningún responsable recibió notificación').toBeGreaterThan(0)
  }, 40_000)

  it('rechaza crear una alerta sin hospital', async () => {
    // La red de seguridad: si alguien vuelve al insert directo sin hospital,
    // debe fallar en vez de crear un aviso que no avisa.
    const svc = serviceClient()
    const { error } = await svc.rpc('crear_alerta_con_notificaciones', {
      p_hospital_id: null,
      p_tipo:        'carro_no_operativo',
      p_severidad:   'critica',
      p_titulo:      'Sin hospital',
      p_mensaje:     'No debería crearse',
      p_carro_id:    fx.carros.A1,
      p_servicio_id: null,
    })

    expect(error, 'se creó una alerta sin hospital').toBeTruthy()
    expect(error?.message).toMatch(/hospital_id/i)
  }, 30_000)

  it('un control operativo NO genera alerta', async () => {
    const svc = serviceClient()
    const { count: antes } = await svc.from('alertas')
      .select('id', { count: 'exact', head: true })
      .eq('carro_id', fx.carros.A2).eq('tipo', 'carro_no_operativo')

    await guardarControl({
      carroId: fx.carros.A2, resultado: 'operativo', hospitalId: fx.hospitales.A,
    })

    const { count: despues } = await svc.from('alertas')
      .select('id', { count: 'exact', head: true })
      .eq('carro_id', fx.carros.A2).eq('tipo', 'carro_no_operativo')

    expect(despues, 'un control correcto generó una alerta').toBe(antes ?? 0)
  }, 40_000)
})
