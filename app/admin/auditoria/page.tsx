'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import { rutaPadre } from '@/lib/navigation'
import toast from 'react-hot-toast'

/**
 * Registro de auditoría: quién hizo qué, cuándo.
 *
 * Hasta ahora log_auditoria solo se escribía; no había forma de consultarla
 * desde la app, así que en la práctica no servía para lo que existe — que es
 * poder responder "¿quién tocó esto y cuándo?" ante una inspección externa.
 *
 * El filtro por periodo es lo que la hace utilizable: sin él, una tabla que
 * crece sin parar es ilegible a los pocos meses.
 */

interface Registro {
  id: string
  usuario_id: string | null
  accion: string
  tabla_afectada: string | null
  registro_id: string | null
  detalle: any
  fecha: string
  resultado: string | null
  perfiles?: { nombre: string; email: string; rol: string } | null
}

/** Etiquetas legibles. Las acciones se guardan en clave técnica. */
const ETIQUETA: Record<string, string> = {
  control_realizado:     'Control realizado',
  inspeccion_reabierta:  'Inspección reabierta',
  inspeccion_cerrada:    'Inspección cerrada',
  reset_password:        'Contraseña restablecida',
  email_bienvenida_enviado: 'Email de bienvenida',
  INSERT: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Borrado',
}

const COLOR: Record<string, string> = {
  control_realizado:    'bg-blue-100 text-blue-800',
  inspeccion_reabierta: 'bg-amber-100 text-amber-800',
  inspeccion_cerrada:   'bg-green-100 text-green-800',
  reset_password:       'bg-purple-100 text-purple-800',
  DELETE:               'bg-red-100 text-red-800',
}

const POR_PAGINA = 50

function hoyISO(dias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export default function AuditoriaPage() {
  const [perfil, setPerfil]   = useState<any>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [cargando, setCargando]   = useState(true)
  const [total, setTotal]         = useState(0)
  const [pagina, setPagina]       = useState(0)

  // Por defecto, la última semana: es la consulta que se hace el 90% de las
  // veces, y evita traer meses de registros al abrir la pantalla.
  const [desde, setDesde]     = useState(hoyISO(7))
  const [hasta, setHasta]     = useState(hoyISO())
  const [usuario, setUsuario] = useState('todos')
  const [accion, setAccion]   = useState('todas')

  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const cargar = useCallback(async (p: any, pag: number) => {
    setCargando(true)

    let q = supabase
      .from('log_auditoria')
      .select('*, perfiles!log_auditoria_usuario_id_fkey(nombre, email, rol)', { count: 'exact' })
      .gte('fecha', `${desde}T00:00:00`)
      // Se suma un día al "hasta" para incluir la jornada entera: si no, un
      // filtro hasta el día 5 se comería todo lo ocurrido ese mismo día.
      .lt('fecha', `${hasta}T23:59:59.999`)
      .order('fecha', { ascending: false })
      .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1)

    // El superadmin ve todos los hospitales; el resto, solo el suyo.
    if (p.rol !== 'superadmin' && p.hospital_id) q = q.eq('hospital_id', p.hospital_id)
    if (usuario !== 'todos') q = q.eq('usuario_id', usuario)
    if (accion !== 'todas')  q = q.eq('accion', accion)

    const { data, count, error } = await q
    if (error) toast.error('No se pudo cargar la auditoría: ' + error.message)

    setRegistros((data as any) || [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [desde, hasta, usuario, accion])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
      if (!p || !['superadmin', 'administrador', 'calidad'].includes(p.rol)) {
        router.push('/'); return
      }
      setPerfil(p)

      let qu = supabase.from('perfiles').select('id, nombre, rol').eq('activo', true).order('nombre')
      if (p.rol !== 'superadmin' && p.hospital_id) qu = qu.eq('hospital_id', p.hospital_id)
      const { data: us } = await qu
      setUsuarios(us || [])

      await cargar(p, 0)
    }
    init()
  }, [])

  useEffect(() => {
    if (!perfil) return
    setPagina(0)
    cargar(perfil, 0)
  }, [desde, hasta, usuario, accion])

  function irAPagina(p: number) {
    setPagina(p)
    cargar(perfil, p)
  }

  const paginas = Math.ceil(total / POR_PAGINA)
  const accionesPresentes = Array.from(new Set(registros.map(r => r.accion))).sort()

  if (!perfil) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando…</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">
          ← Volver
        </button>
        <span className="font-semibold text-sm flex-1 text-center">Auditoría</span>
      </div>

      <div className="content">

        {/* Filtros */}
        <div className="card">
          <div className="section-title mb-3">Filtrar</div>

          <div className="form-grid">
            <div>
              <label className="label" htmlFor="desde">Desde</label>
              <input id="desde" type="date" className="input" value={desde}
                onChange={e => setDesde(e.target.value)} max={hasta} />
            </div>
            <div>
              <label className="label" htmlFor="hasta">Hasta</label>
              <input id="hasta" type="date" className="input" value={hasta}
                onChange={e => setHasta(e.target.value)} min={desde} />
            </div>
            <div>
              <label className="label" htmlFor="usuario">Usuario</label>
              <select id="usuario" className="input" value={usuario}
                onChange={e => setUsuario(e.target.value)}>
                <option value="todos">Todos</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="accion">Acción</label>
              <select id="accion" className="input" value={accion}
                onChange={e => setAccion(e.target.value)}>
                <option value="todas">Todas</option>
                {Object.keys(ETIQUETA).map(a => (
                  <option key={a} value={a}>{ETIQUETA[a]}</option>
                ))}
                {accionesPresentes.filter(a => !ETIQUETA[a]).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Atajos: cubren lo que se consulta casi siempre. */}
          <div className="flex gap-2 flex-wrap mt-3">
            {[['Hoy', 0], ['7 días', 7], ['30 días', 30], ['90 días', 90]].map(([txt, d]) => (
              <button
                key={txt as string}
                onClick={() => { setDesde(hoyISO(d as number)); setHasta(hoyISO()) }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white active:bg-gray-50"
              >
                {txt}
              </button>
            ))}
          </div>
        </div>

        {/* Resultados */}
        <div className="card">
          <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
            <div className="section-title">Registros</div>
            <div className="text-xs text-gray-400">
              {cargando ? 'Buscando…' : `${total} en el periodo`}
            </div>
          </div>

          {!cargando && registros.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">
              Nada registrado con estos filtros.
            </div>
          )}

          <div className="flex flex-col">
            {registros.map(r => (
              <div key={r.id} className="row-item flex-col items-stretch gap-1 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge text-xs ${COLOR[r.accion] || 'bg-gray-100 text-gray-700'}`}>
                    {ETIQUETA[r.accion] || r.accion}
                  </span>
                  {r.tabla_afectada && (
                    <span className="text-xs text-gray-400">{r.tabla_afectada}</span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
                    {new Date(r.fecha).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="text-sm font-semibold text-gray-800">
                  {r.perfiles?.nombre || 'Usuario eliminado'}
                  {r.perfiles?.rol && (
                    <span className="text-xs font-normal text-gray-400"> · {r.perfiles.rol}</span>
                  )}
                </div>

                {/* El motivo de una reapertura es justo lo que se busca al
                    revisar: se muestra sin tener que desplegar nada. */}
                {r.detalle?.motivo && (
                  <div className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2 py-1 mt-0.5">
                    {r.detalle.motivo}
                  </div>
                )}
                {r.detalle?.destino_nombre && (
                  <div className="text-xs text-gray-500">
                    Sobre: {r.detalle.destino_nombre}
                    {r.detalle.destino_rol && ` (${r.detalle.destino_rol})`}
                  </div>
                )}
              </div>
            ))}
          </div>

          {paginas > 1 && (
            <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-100">
              <button onClick={() => irAPagina(pagina - 1)} disabled={pagina === 0}
                className="btn-secondary disabled:opacity-40">Anterior</button>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {pagina + 1} de {paginas}
              </span>
              <button onClick={() => irAPagina(pagina + 1)} disabled={pagina + 1 >= paginas}
                className="btn-secondary disabled:opacity-40">Siguiente</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
