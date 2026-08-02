import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Carga variables de entorno en process.env (vitest no las carga por defecto
 * como hace Next.js).
 *
 * Orden de prioridad: `.env.test` antes que `.env.local`. Así los tests
 * apuntan al proyecto de desarrollo aunque .env.local tenga producción, que
 * es lo normal porque es el archivo del que vive la app.
 */
function loadEnvFile(nombre: string) {
  try {
    const content = readFileSync(join(process.cwd(), nombre), 'utf-8')
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // si el archivo no existe seguimos: fallará más tarde con un mensaje claro
  }
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  loadEnvFile('.env.test')
  loadEnvFile('.env.local')
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Asegúrate de tener .env.local configurado apuntando a un entorno de desarrollo.'
  )
}

/**
 * SEGURO ANTI-PRODUCCIÓN
 *
 * Esta suite NO es de solo lectura: `setupFixture` crea hospitales, usuarios
 * en auth.users, servicios y carros, y los borra al terminar. Si el proceso
 * falla dentro de `beforeAll`, el teardown no llega a ejecutarse y quedan
 * filas huérfanas.
 *
 * Como los tests leen la URL de .env.local — el mismo archivo que usa la app
 * para funcionar — basta con tener configurada la producción para que un
 * `npm test` escriba en la base de datos real del hospital. Ocurrió el
 * 2026-08-02: quedó un "Hospital Test B" huérfano en producción.
 *
 * De ahí este corte. Para ejecutar los tests, apunta .env.local a un proyecto
 * de desarrollo o a Supabase local (`npx supabase start`).
 */
const REF_PRODUCCION = 'agpawdoibqdptgdkcktv'

const refActual = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0]
  } catch {
    return ''
  }
})()

if (refActual === REF_PRODUCCION && process.env.PERMITIR_TESTS_EN_PRODUCCION !== 'si') {
  throw new Error(
    '\n\n' +
    '  ⛔ TESTS ABORTADOS: .env.local apunta a PRODUCCIÓN\n\n' +
    `     proyecto detectado : ${refActual}\n` +
    `     URL                : ${SUPABASE_URL}\n\n` +
    '     Esta suite CREA Y BORRA hospitales, usuarios y carros. Ejecutarla\n' +
    '     contra producción corrompe los datos reales del hospital.\n\n' +
    '     Apunta .env.local a un proyecto de desarrollo, o levanta Supabase\n' +
    '     en local con `npx supabase start`.\n\n' +
    '     Si de verdad sabes lo que haces:  PERMITIR_TESTS_EN_PRODUCCION=si npm test\n'
  )
}

/**
 * Cliente anónimo (sin login). Simula a un atacante con la anon key pública
 * intentando leer datos directamente vía REST. Si las políticas RLS están
 * bien, NO debe poder leer nada de las tablas con datos sensibles.
 */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Cliente con service_role (bypassa RLS). Solo para sembrado / limpieza
 * de fixtures en tests. NUNCA usar este cliente para validar políticas RLS.
 */
export function serviceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no configurada en .env.local. ' +
      'Necesaria para sembrar fixtures.'
    )
  }
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
