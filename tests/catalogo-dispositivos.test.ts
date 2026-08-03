/**
 * Catálogo de modelos de dispositivo.
 *
 * Aquí no se guardan aparatos, se guardan MODELOS: un "Zoll X Series" es el
 * mismo en todos los centros, así que el catálogo es único y cada hospital
 * elige cuáles usa. Lo que se comprueba es el límite: un administrador de
 * centro puede crear plantillas para el suyo, pero no tocar el catálogo
 * compartido ni el de otro hospital.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFixture, teardownFixture, clientForUser, type TestFixture } from './fixtures'
import { serviceClient } from './helpers'

let fx: TestFixture

beforeAll(async () => { fx = await setupFixture() }, 60_000)
afterAll(async () => {
  // Las plantillas no las borra el teardown del fixture: se limpian por nombre
  // para que la siguiente ejecución no choque con el índice único.
  await serviceClient().from('plantillas_dispositivo').delete().ilike('nombre', 'ZZ Prueba%')
  if (fx) await teardownFixture(fx)
}, 30_000)

/** Nombre único por prueba, para que un fallo no arrastre a las demás. */
const nombre = (sufijo: string) => `ZZ Prueba ${sufijo}`

async function limpiar(n: string) {
  await serviceClient().from('plantillas_dispositivo').delete().eq('nombre', n)
}

describe('Plantillas propias del hospital', () => {
  it('el administrador crea una plantilla para su hospital', async () => {
    const n = nombre('Monitor propio')
    await limpiar(n)

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { error } = await sb.from('plantillas_dispositivo').insert({
        nombre: n, marca: 'Mindray', modelo: 'BeneVision N12',
        hospital_id: fx.hospitales.A,
      })
      expect(error, error?.message).toBeNull()

      const { data } = await serviceClient().from('plantillas_dispositivo')
        .select('hospital_id, requiere_calibracion, activo').eq('nombre', n).single()
      expect(data!.hospital_id).toBe(fx.hospitales.A)
      expect(data!.activo).toBe(true)
    } finally {
      await limpiar(n)
    }
  }, 40_000)

  it('NO puede crear una plantilla en el catálogo compartido', async () => {
    // El catálogo es de todos los centros. Si cada hospital pudiera escribir en
    // él, se llenaría de modelos que no le sirven a nadie más.
    const n = nombre('Colada en catalogo')
    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { error } = await sb.from('plantillas_dispositivo').insert({
        nombre: n, marca: 'Zoll', modelo: 'X Series', hospital_id: null,
      })
      expect(error, 'un admin escribió en el catálogo global').toBeTruthy()
    } finally {
      await limpiar(n)
    }
  }, 30_000)

  it('NO puede crear una plantilla en otro hospital', async () => {
    const n = nombre('Colada en B')
    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { error } = await sb.from('plantillas_dispositivo').insert({
        nombre: n, hospital_id: fx.hospitales.B,
      })
      expect(error, 'un admin creó una plantilla en el hospital de otro').toBeTruthy()
    } finally {
      await limpiar(n)
    }
  }, 30_000)

  it('un supervisor no puede crear plantillas', async () => {
    const n = nombre('Colada por supervisor')
    try {
      const sb = await clientForUser(fx.users.supervisorA1 as any)
      const { error } = await sb.from('plantillas_dispositivo').insert({
        nombre: n, hospital_id: fx.hospitales.A,
      })
      expect(error, 'un supervisor creó una plantilla').toBeTruthy()
    } finally {
      await limpiar(n)
    }
  }, 30_000)

  it('rechaza el mismo modelo dos veces en el mismo hospital', async () => {
    // Dos "Zoll X Series" en el desplegable: nadie sabe cuál elegir y el
    // inventario por modelo se parte en dos trozos que no suman.
    const n = nombre('Repetida')
    await limpiar(n)

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const fila = { nombre: n, marca: 'Zoll', modelo: 'X Series', hospital_id: fx.hospitales.A }

      const { error: primero } = await sb.from('plantillas_dispositivo').insert(fila)
      expect(primero, primero?.message).toBeNull()

      const { error: segundo } = await sb.from('plantillas_dispositivo')
        .insert({ ...fila, nombre: `  ${n.toLowerCase()} `, marca: 'ZOLL', modelo: ' x series' })
      expect(segundo?.code, 'se coló una plantilla duplicada').toBe('23505')
    } finally {
      await serviceClient().from('plantillas_dispositivo').delete().ilike('nombre', `%${n}%`)
    }
  }, 40_000)
})

describe('Visibilidad del catálogo', () => {
  it('cualquier usuario del hospital ve el catálogo compartido', async () => {
    // Sin verlo no hay de dónde elegir al dar de alta un aparato.
    const n = nombre('Del catalogo')
    await limpiar(n)
    await serviceClient().from('plantillas_dispositivo')
      .insert({ nombre: n, marca: 'Philips', modelo: 'HeartStart MRx', hospital_id: null })

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { data } = await sb.from('plantillas_dispositivo').select('id').eq('nombre', n)
      expect(data?.length ?? 0, 'el catálogo no se ve').toBe(1)
    } finally {
      await limpiar(n)
    }
  }, 40_000)

  it('el admin de A NO ve las plantillas propias de B', async () => {
    const n = nombre('Privada de B')
    await limpiar(n)
    await serviceClient().from('plantillas_dispositivo')
      .insert({ nombre: n, hospital_id: fx.hospitales.B })

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { data } = await sb.from('plantillas_dispositivo').select('id').eq('nombre', n)
      expect(data?.length ?? 0, 'se vieron plantillas de otro hospital').toBe(0)
    } finally {
      await limpiar(n)
    }
  }, 40_000)
})

describe('Adopción de modelos del catálogo', () => {
  it('el administrador adopta un modelo para su hospital', async () => {
    const n = nombre('Para adoptar')
    await limpiar(n)
    const { data: plantilla } = await serviceClient().from('plantillas_dispositivo')
      .insert({ nombre: n, marca: 'Medtronic', modelo: 'McGrath MAC', hospital_id: null })
      .select().single()

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { error } = await sb.from('plantillas_dispositivo_hospital')
        .insert({ hospital_id: fx.hospitales.A, plantilla_id: plantilla!.id })
      expect(error, error?.message).toBeNull()

      // Adoptar dos veces no debe duplicar: la clave primaria es (hospital, plantilla).
      const { error: repetida } = await sb.from('plantillas_dispositivo_hospital')
        .insert({ hospital_id: fx.hospitales.A, plantilla_id: plantilla!.id })
      expect(repetida?.code, 'se adoptó dos veces el mismo modelo').toBe('23505')
    } finally {
      await limpiar(n)   // la adopción cae con ella (on delete cascade)
    }
  }, 40_000)

  it('NO puede adoptar modelos para otro hospital', async () => {
    const n = nombre('Adopcion ajena')
    await limpiar(n)
    const { data: plantilla } = await serviceClient().from('plantillas_dispositivo')
      .insert({ nombre: n, hospital_id: null }).select().single()

    try {
      const sb = await clientForUser(fx.users.adminA as any)
      const { error } = await sb.from('plantillas_dispositivo_hospital')
        .insert({ hospital_id: fx.hospitales.B, plantilla_id: plantilla!.id })
      expect(error, 'un admin adoptó modelos para el hospital de otro').toBeTruthy()
    } finally {
      await limpiar(n)
    }
  }, 40_000)
})
