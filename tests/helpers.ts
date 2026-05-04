import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Carga las variables del archivo .env.local en process.env si no están ya
 * presentes (vitest no las carga por defecto como Next.js).
 */
function loadEnvLocal() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
  try {
    const path = join(process.cwd(), '.env.local')
    const content = readFileSync(path, 'utf-8')
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
    // si .env.local no existe, dejamos que falle más tarde con un mensaje claro
  }
}

loadEnvLocal()

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Asegúrate de tener .env.local configurado apuntando a astor-dev.'
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
