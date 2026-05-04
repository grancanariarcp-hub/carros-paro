/**
 * Fixtures de tests RLS por roles autenticados.
 *
 * Crea dos hospitales (A y B) cada uno con: 1 admin, 1 calidad, 1 supervisor
 * (con servicio asignado), 2 servicios, 1 carro por servicio. Los users se
 * crean en auth.users vía service_role y se loguean para obtener tokens.
 *
 * Cada test ejecuta queries con el cliente autenticado del usuario que
 * corresponde y verifica el aislamiento (que A no ve B, que supervisor no ve
 * otros servicios, etc.).
 *
 * Cleanup: al final del run se eliminan todos los users (ON DELETE CASCADE
 * borra perfiles, lo de los hospitales B se borra al borrar el hospital).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceClient, SUPABASE_URL, SUPABASE_ANON_KEY } from './helpers'

const TEST_PREFIX = `tests-rls-${Date.now()}`

export interface TestFixture {
  hospitales: { A: string; B: string }
  servicios: {
    A1: string; A2: string
    B1: string; B2: string
  }
  users: {
    adminA: TestUser
    calidadA: TestUser
    supervisorA1: TestUser    // supervisor del servicio A1
    adminB: TestUser
    supervisorB1: TestUser
  }
  carros: {
    A1: string; A2: string    // carro del servicio A1 y A2
    B1: string
  }
}

export interface TestUser {
  id: string
  email: string
  password: string
  hospital_id: string
  servicio_id: string | null
  rol: string
}

/**
 * Crea un user en auth.users + perfil en public.perfiles.
 * Usa service_role (bypassa RLS).
 */
async function createTestUser(
  service: SupabaseClient,
  opts: {
    rol: string
    hospital_id: string
    servicio_id: string | null
    nombre: string
  }
): Promise<TestUser> {
  const password = `Test${Date.now()}!${Math.random().toString(36).slice(2, 6)}`
  const email = `${TEST_PREFIX}-${opts.rol}-${Math.random().toString(36).slice(2, 8)}@example.test`

  // 1) Crear user en auth (auto-confirm)
  const { data: created, error: e1 } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (e1) throw new Error(`createUser ${opts.rol}: ${e1.message}`)
  const userId = created.user!.id

  // 2) Crear perfil
  const { error: e2 } = await service.from('perfiles').insert({
    id: userId,
    hospital_id: opts.hospital_id,
    servicio_id: opts.servicio_id,
    nombre: opts.nombre,
    email,
    rol: opts.rol,
    activo: true,
  })
  if (e2) {
    // limpiar el user huérfano
    await service.auth.admin.deleteUser(userId).catch(() => {})
    throw new Error(`insert perfil ${opts.rol}: ${e2.message}`)
  }

  return { id: userId, email, password, hospital_id: opts.hospital_id,
           servicio_id: opts.servicio_id, rol: opts.rol }
}

/**
 * Devuelve un cliente Supabase autenticado como ese user, listo para
 * ejecutar queries con su rol/hospital.
 */
export async function clientForUser(user: TestUser): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await sb.auth.signInWithPassword({
    email: user.email, password: user.password,
  })
  if (error) throw new Error(`signin ${user.rol}: ${error.message}`)
  return sb
}

/**
 * Setup del fixture: hospitales, servicios, users, carros.
 * Idempotente para el hospital A (existe ya); B lo crea con id determinístico.
 */
export async function setupFixture(): Promise<TestFixture> {
  const service = serviceClient()

  // Hospital A: el demo del seed (ya existe)
  const HOSPITAL_A = '00000000-0000-0000-0000-000000000001'

  // Hospital B: lo creamos con id propio determinístico para tests
  const HOSPITAL_B = '00000000-0000-0000-0000-0000000000B0'
  await service.from('hospitales').upsert({
    id: HOSPITAL_B,
    slug: `${TEST_PREFIX}-hosp-b`,
    nombre: 'Hospital Test B',
    plan: 'enterprise',
    max_carros: 100,
    max_usuarios: 50,
    activo: true,
  }, { onConflict: 'id' })

  // Servicios — A1 y A2 ya existen (Urgencias, UCI). Cogemos sus ids.
  const { data: servA } = await service.from('servicios')
    .select('id, nombre').eq('hospital_id', HOSPITAL_A)
    .in('nombre', ['Urgencias', 'UCI'])
  const A1 = servA!.find(s => s.nombre === 'Urgencias')!.id
  const A2 = servA!.find(s => s.nombre === 'UCI')!.id

  // Servicios B (creamos)
  const { data: servB1Created } = await service.from('servicios').upsert({
    id: '00000000-0000-0000-0000-0000000000B1',
    hospital_id: HOSPITAL_B,
    nombre: 'Urgencias B',
    activo: true,
  }, { onConflict: 'id' }).select().single()
  const { data: servB2Created } = await service.from('servicios').upsert({
    id: '00000000-0000-0000-0000-0000000000B2',
    hospital_id: HOSPITAL_B,
    nombre: 'UCI B',
    activo: true,
  }, { onConflict: 'id' }).select().single()
  const B1 = servB1Created!.id
  const B2 = servB2Created!.id

  // Users
  const adminA = await createTestUser(service, {
    rol: 'administrador', hospital_id: HOSPITAL_A, servicio_id: null, nombre: 'Admin A',
  })
  const calidadA = await createTestUser(service, {
    rol: 'calidad', hospital_id: HOSPITAL_A, servicio_id: null, nombre: 'Calidad A',
  })
  const supervisorA1 = await createTestUser(service, {
    rol: 'supervisor', hospital_id: HOSPITAL_A, servicio_id: A1, nombre: 'Supervisor A1',
  })
  const adminB = await createTestUser(service, {
    rol: 'administrador', hospital_id: HOSPITAL_B, servicio_id: null, nombre: 'Admin B',
  })
  const supervisorB1 = await createTestUser(service, {
    rol: 'supervisor', hospital_id: HOSPITAL_B, servicio_id: B1, nombre: 'Supervisor B1',
  })

  // Carros (uno por servicio)
  const carroA1 = await service.from('carros').insert({
    hospital_id: HOSPITAL_A,
    servicio_id: A1,
    codigo: `${TEST_PREFIX}-CAR-A1`,
    nombre: 'Carro Urgencias A',
  }).select('id').single()
  const carroA2 = await service.from('carros').insert({
    hospital_id: HOSPITAL_A,
    servicio_id: A2,
    codigo: `${TEST_PREFIX}-CAR-A2`,
    nombre: 'Carro UCI A',
  }).select('id').single()
  const carroB1 = await service.from('carros').insert({
    hospital_id: HOSPITAL_B,
    servicio_id: B1,
    codigo: `${TEST_PREFIX}-CAR-B1`,
    nombre: 'Carro Urgencias B',
  }).select('id').single()

  return {
    hospitales: { A: HOSPITAL_A, B: HOSPITAL_B },
    servicios: { A1, A2, B1, B2 },
    users: { adminA, calidadA, supervisorA1, adminB, supervisorB1 },
    carros: {
      A1: carroA1.data!.id,
      A2: carroA2.data!.id,
      B1: carroB1.data!.id,
    },
  }
}

/**
 * Limpia los datos creados por el fixture. Aprovecha ON DELETE CASCADE:
 * borrar el hospital B borra sus servicios/carros/perfiles. Los carros del
 * hospital A se borran por código (con nuestro prefijo), y los users de A
 * se borran de auth (cascade hace el resto).
 */
export async function teardownFixture(fx: TestFixture) {
  const service = serviceClient()

  // 1) Borrar carros con nuestro prefijo en A
  await service.from('carros').delete().like('codigo', `${TEST_PREFIX}%`)

  // 2) Borrar users (perfiles caen por cascade FK auth.users)
  for (const u of Object.values(fx.users)) {
    await service.auth.admin.deleteUser(u.id).catch(() => {})
  }

  // 3) Borrar hospital B (cascade limpia sus servicios)
  await service.from('hospitales').delete().eq('id', fx.hospitales.B)
}
