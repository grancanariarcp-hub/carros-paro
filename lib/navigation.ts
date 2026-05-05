/**
 * Helpers de navegación para que el botón "Volver" sea predecible.
 *
 * Problema con `router.back()`: depende del histórico del navegador. Si el
 * usuario entra directo a una URL (bookmark, refresh, redirect tras login),
 * `router.back()` lo saca fuera de la app o lo lleva a una página inesperada.
 *
 * Solución: navegar SIEMPRE a la ruta padre lógica según el pathname actual.
 */

/**
 * Dashboard principal del usuario según su rol.
 */
export function dashboardPath(rol?: string | null): string {
  switch (rol) {
    case 'superadmin':    return '/superadmin'
    case 'administrador': return '/admin'
    case 'calidad':       return '/admin'
    case 'supervisor':    return '/supervisor'
    case 'auditor':       return '/auditor'
    case 'tecnico':       return '/auditor'
    case 'readonly':      return '/admin'
    default:              return '/admin'  // fallback: middleware redirige según rol real
  }
}

/**
 * Ruta padre lógica de una página. Útil para el botón "Volver".
 *
 * Si el pathname está dentro de un panel concreto (/admin, /supervisor,
 * /superadmin, /auditor), el padre se calcula relativo a ese panel.
 *
 * Para rutas compartidas (/carro, /informes, /perfil, /plantillas, /buscar)
 * se usa el `rol` opcional para decidir el dashboard. Si no hay rol, se
 * usa /admin como default y el middleware redirige al panel correcto.
 *
 * Reglas:
 *   /admin/X         → /admin
 *   /admin/X/[id]    → /admin/X
 *   /admin/X/[id]/Y  → /admin/X/[id]
 *   /carro/[id]/Y    → /carro/[id]
 *   /carro/[id]      → dashboard
 *   /informes/X      → /informes
 *   /informes        → dashboard
 *   /plantillas, /buscar, /perfil → dashboard
 */
export function rutaPadre(pathname: string, rol?: string | null): string {
  const dashboard = dashboardPath(rol)
  if (!pathname || pathname === '/') return '/'

  const segs = pathname.split('/').filter(Boolean)

  // Páginas raíz que vuelven al dashboard
  if (segs.length === 1) {
    if (['plantillas', 'buscar', 'informes', 'perfil',
         'admin', 'superadmin', 'supervisor', 'auditor'].includes(segs[0])) {
      return dashboard
    }
  }

  // /informes/X → /informes
  if (segs[0] === 'informes' && segs.length >= 2) return '/informes'

  // /carro/[id]/X → /carro/[id]
  if (segs[0] === 'carro' && segs.length >= 3) return `/carro/${segs[1]}`
  // /carro/[id] → dashboard del rol
  if (segs[0] === 'carro' && segs.length === 2) return dashboard

  // /admin/...
  if (segs[0] === 'admin') {
    // Páginas índice REALES bajo /admin (las que tienen page.tsx propio).
    // Si la sub-ruta no es una de estas, el padre lógico es /admin (no
    // /admin/carro que no existe como página).
    const indicesAdmin = new Set([
      'equipos', 'usuarios', 'plantillas', 'servicios',
      'informes', 'configuracion',
    ])
    if (segs.length >= 2 && !indicesAdmin.has(segs[1])) {
      // /admin/carro/[id]/materiales, /admin/nuevo-carro, etc → /admin
      return '/admin'
    }
    // /admin/configuracion/X → /admin/configuracion
    if (segs.length >= 3 && segs[1] === 'configuracion') {
      return '/admin/configuracion'
    }
    // /admin/X/[id]/Y → /admin/X/[id]
    if (segs.length >= 4) return '/' + segs.slice(0, 3).join('/')
    // /admin/X/[id] → /admin/X
    if (segs.length === 3) return '/' + segs.slice(0, 2).join('/')
    // /admin/X → /admin
    if (segs.length === 2) return '/admin'
  }

  // /supervisor/X → /supervisor
  if (segs[0] === 'supervisor' && segs.length >= 2) return '/supervisor'

  // /superadmin/X → /superadmin
  if (segs[0] === 'superadmin' && segs.length >= 2) return '/superadmin'

  return dashboard
}
