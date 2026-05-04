import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware de auth SSR para ÁSTOR.
 *
 * Responsabilidades:
 *   1) Refrescar la sesión Supabase en cada request (token rotation),
 *      escribiendo las cookies actualizadas en la respuesta.
 *   2) Redirigir a `/` cualquier acceso no autenticado a rutas protegidas.
 *   3) Permitir acceso anónimo a la página de login y a sus assets.
 */

// Rutas que NO requieren autenticación
const PUBLIC_PATHS = [
  '/',                  // login
  '/_next',             // assets de Next
  '/favicon',
  '/buscar',            // si quieres dejar buscar público; ajustable
  '/api',               // las route handlers manejan su propia auth
  '/monitoring',        // tunnel de Sentry
  '/sentry-test',       // página de test (eliminar tras validar)
]

function isPublicPath(pathname: string): boolean {
  // /[slug] (login con slug de hospital) también es pública
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return true
  // Permite slugs de hospital tipo /demo-dev
  // (asume que las rutas reservadas /admin /superadmin /supervisor /auditor /perfil
  //  /informes /carro /plantillas /buscar son protegidas, todo lo demás 1 segmento es slug)
  const reservadas = ['/admin', '/superadmin', '/supervisor', '/auditor',
                      '/perfil', '/informes', '/carro', '/plantillas']
  if (reservadas.some(r => pathname === r || pathname.startsWith(r + '/'))) return false
  // Si es un solo segmento (probable slug de hospital), público
  if (pathname.split('/').filter(Boolean).length === 1) return true
  return false
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresca sesión y obtiene usuario en una sola llamada
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Acceso anónimo a rutas públicas → continuar
  if (isPublicPath(pathname)) {
    return response
  }

  // Rutas protegidas: si no hay usuario, redirige a /
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

// Aplicar el middleware a todas las rutas excepto archivos estáticos
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static (archivos estáticos)
     *   - _next/image (optimización de imágenes)
     *   - favicon.ico, robots.txt, etc.
     *   - rutas de archivos con extensión (svg, png, css, js, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf)$).*)',
  ],
}
