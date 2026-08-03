/**
 * Catálogo compartido de plantillas de carro.
 *
 * Montar la lista de comprobación de un carro de parada desde cero son
 * decenas de ítems, y hacerlo mal se paga en una parada. El catálogo da un
 * punto de partida revisado y cada hospital se queda con su COPIA: al ajustar
 * cantidades o añadir secciones no puede tocar la lista de otro centro, ni el
 * historial de inspecciones firmadas que cuelga de ella.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture
let plantillaCatalogo: string
let otraDelCatalogo: string

const PREFIJO = 'ZZ Plantilla'

/** Deja el catálogo y las copias como estaban, pase lo que pase. */
async function limpiar() {
  await serviceClient().from('plantillas').delete().ilike('nombre', `${PREFIJO}%`)
}

/**
 * Borra las copias que tenga el hospital A, no las del catálogo.
 *
 * Adoptar una plantilla ya adoptada se rechaza, así que sin esto cada prueba
 * arrastraría el resultado de la anterior y fallaría por donde no toca.
 */
async function borrarCopiasDeA() {
  await serviceClient().from('plantillas').delete()
    .eq('hospital_id', fx.hospitales.A).ilike('nombre', `${PREFIJO}%`)
}

beforeAll(async () => {
  fx = await setupFixture()
  await limpiar()

  // Una plantilla de catálogo con una sección y dos ítems: lo mínimo para
  // comprobar que la copia arrastra el contenido, no solo la cabecera.
  const svc = serviceClient()
  const { data: p } = await svc.from('plantillas').insert({
    nombre: `${PREFIJO} del catalogo`,
    descripcion: 'Lista de comprobacion estandar',
    hospital_id: null, es_plantilla: true, es_base: false, activo: true,
  }).select().single()
  plantillaCatalogo = p!.id

  const { data: s } = await svc.from('plantilla_secciones').insert({
    plantilla_id: plantillaCatalogo, nombre: 'Materiales',
    tipo: 'materiales', orden: 1, obligatoria: true, activo: true,
  }).select().single()

  await svc.from('plantilla_items').insert([
    { seccion_id: s!.id, nombre: 'Adrenalina 1 mg', orden: 1, tipo_campo: 'cantidad', cantidad_esperada: 5, activo: true },
    { seccion_id: s!.id, nombre: 'Amiodarona 150 mg', orden: 2, tipo_campo: 'cantidad', cantidad_esperada: 2, activo: true },
  ])

  // Una segunda, distinta, para poder comprobar el choque de nombres sin que
  // salte antes la regla de "esta plantilla ya la adoptaste".
  const { data: otra } = await svc.from('plantillas').insert({
    nombre: `${PREFIJO} otra del catalogo`,
    hospital_id: null, es_plantilla: true, es_base: false, activo: true,
  }).select().single()
  otraDelCatalogo = otra!.id
}, 60_000)

afterAll(async () => {
  await limpiar()
  if (fx) await teardownFixture(fx)
}, 30_000)

describe('Adoptar una plantilla del catálogo', () => {
  it('el administrador la adopta y se copia con secciones e ítems', async () => {
    const NOMBRE = `${PREFIJO} adoptada`
    await borrarCopiasDeA()
    const sb = await clientForUser(fx.users.adminA as any)

    const { data: nuevaId, error } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.A,
      p_plantilla_id: plantillaCatalogo,
      p_nombre: NOMBRE,
    })
    expect(error, error?.message).toBeNull()
    expect(nuevaId).toBeTruthy()

    const svc = serviceClient()
    const { data: copia } = await svc.from('plantillas')
      .select('hospital_id, es_plantilla, es_base, activo').eq('id', nuevaId).single()

    // Si la copia siguiera marcada como catálogo, editarla cambiaría la lista
    // de todos los demás centros.
    expect(copia!.es_plantilla).toBe(false)
    expect(copia!.hospital_id).toBe(fx.hospitales.A)
    // Cuál es la plantilla por defecto lo decide cada hospital, no el catálogo.
    expect(copia!.es_base).toBe(false)

    const { data: secciones } = await svc.from('plantilla_secciones')
      .select('id, nombre').eq('plantilla_id', nuevaId)
    expect(secciones?.length, 'la copia se quedó sin secciones').toBe(1)

    const { data: items } = await svc.from('plantilla_items')
      .select('nombre, cantidad_esperada').eq('seccion_id', secciones![0].id).order('orden')
    expect(items?.length, 'la copia se quedó sin ítems').toBe(2)
    expect(items![0].cantidad_esperada, 'no se copiaron las cantidades').toBe(5)
  }, 40_000)

  it('adoptar la misma plantilla otra vez se rechaza aunque cambie el nombre', async () => {
    // Dos listas idénticas en el desplegable y nadie sabe cuál usar. Que se le
    // ponga otro nombre no las hace distintas.
    await borrarCopiasDeA()
    const sb = await clientForUser(fx.users.adminA as any)

    const { error: primera } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_plantilla_id: plantillaCatalogo,
      p_nombre: `${PREFIJO} primera vez`,
    })
    expect(primera, primera?.message).toBeNull()

    const { error: segunda } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_plantilla_id: plantillaCatalogo,
      p_nombre: `${PREFIJO} con otro nombre`,
    })
    expect(segunda, 'se adoptó dos veces la misma plantilla').toBeTruthy()
    expect(segunda?.message).toMatch(/ya adopto/i)
  }, 40_000)

  it('no deja dos plantillas con el mismo nombre en un hospital', async () => {
    const NOMBRE = `${PREFIJO} nombre en uso`
    await borrarCopiasDeA()
    const sb = await clientForUser(fx.users.adminA as any)

    const { error: primera } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_plantilla_id: plantillaCatalogo, p_nombre: NOMBRE,
    })
    expect(primera, primera?.message).toBeNull()

    // Otra plantilla del catálogo, mismo nombre: choca por nombre, no por
    // procedencia.
    const { error: segunda } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.A, p_plantilla_id: otraDelCatalogo, p_nombre: NOMBRE,
    })
    expect(segunda, 'se colaron dos plantillas con el mismo nombre').toBeTruthy()
    expect(segunda?.message).toMatch(/ya tiene una plantilla/i)
  }, 40_000)

  it('un administrador NO puede adoptar para otro hospital', async () => {
    const sb = await clientForUser(fx.users.adminA as any)
    const { error } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.B,
      p_plantilla_id: plantillaCatalogo,
      p_nombre: `${PREFIJO} colada en B`,
    })
    expect(error, 'un admin metió una plantilla en el hospital de otro').toBeTruthy()
    expect(error?.message).toMatch(/tu propio hospital/i)
  }, 30_000)

  it('un supervisor no puede adoptar plantillas', async () => {
    const sb = await clientForUser(fx.users.supervisorA1 as any)
    const { error } = await sb.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: fx.hospitales.A,
      p_plantilla_id: plantillaCatalogo,
      p_nombre: `${PREFIJO} colada por supervisor`,
    })
    expect(error, 'un supervisor adoptó una plantilla').toBeTruthy()
  }, 30_000)
})

describe('El catálogo solo lo amplía el superadmin', () => {
  it('un administrador NO puede escribir en el catálogo', async () => {
    // Si cada centro pudiera, el catálogo se llenaría de listas locales sin
    // revisar, que es justo lo contrario de para lo que existe.
    const NOMBRE = `${PREFIJO} colada en catalogo`
    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { error } = await sb.from('plantillas').insert({
        nombre: NOMBRE, hospital_id: null, es_plantilla: true, activo: true,
      })
      expect(error, 'un admin amplió el catálogo compartido').toBeTruthy()
    } finally {
      await serviceClient().from('plantillas').delete().eq('nombre', NOMBRE)
    }
  }, 30_000)

  it('cualquier administrador ve el catálogo', async () => {
    const sb = await clientForUser(fx.users.adminA as any)
    const { data } = await sb.from('plantillas').select('id').eq('es_plantilla', true)
    expect(data?.length ?? 0, 'el catálogo no se ve y no hay de dónde elegir').toBeGreaterThan(0)
  }, 30_000)
})

describe('Aislamiento entre hospitales', () => {
  it('el admin de A no ve la plantilla de B ni su contenido', async () => {
    // Las políticas de secciones e ítems se apoyan en la de plantillas. Que la
    // cadena aísle de verdad conviene comprobarlo, no darlo por supuesto: una
    // lista de comprobación dice cómo trabaja un centro por dentro.
    const svc = serviceClient()
    const NOMBRE = `${PREFIJO} privada de B`

    const { data: pB } = await svc.from('plantillas').insert({
      nombre: NOMBRE, hospital_id: fx.hospitales.B, es_plantilla: false, activo: true,
    }).select().single()
    const { data: sB } = await svc.from('plantilla_secciones').insert({
      plantilla_id: pB!.id, nombre: 'Seccion de B', tipo: 'materiales', orden: 1, activo: true,
    }).select().single()
    await svc.from('plantilla_items').insert({
      seccion_id: sB!.id, nombre: 'Item de B', orden: 1, tipo_campo: 'cantidad', activo: true,
    })

    try {
      const sb = await clientForUser(fx.users.adminA as any)

      const { data: plantillas } = await sb.from('plantillas').select('id').eq('id', pB!.id)
      expect(plantillas?.length ?? 0, 'se vio la plantilla de otro hospital').toBe(0)

      const { data: secciones } = await sb.from('plantilla_secciones')
        .select('id').eq('plantilla_id', pB!.id)
      expect(secciones?.length ?? 0, 'se vieron las secciones de otro hospital').toBe(0)

      const { data: items } = await sb.from('plantilla_items')
        .select('id').eq('seccion_id', sB!.id)
      expect(items?.length ?? 0, 'se vieron los ítems de otro hospital').toBe(0)
    } finally {
      await svc.from('plantillas').delete().eq('id', pB!.id)
    }
  }, 40_000)
})
