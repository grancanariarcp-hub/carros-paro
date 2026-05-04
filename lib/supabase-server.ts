import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase para Server Components y Route Handlers (SSR).
 * Lee y escribe cookies para mantener la sesión sincronizada con el navegador.
 */
export function createServerSupabaseClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // En Server Components no se pueden setear cookies; el middleware lo hace.
          }
        },
        remove(name: string, options) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // idem
          }
        },
      },
    }
  )
}
