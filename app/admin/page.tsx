'use client'
import { useEffect, useState } from 'react'
import NotificacionesBell from '@/components/NotificacionesBell'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFechaHora, formatFecha, rolLabel, diasHastaControl } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'
import EscanerCodigoBarras from '@/components/EscanerCodigoBarras'
import type { Carro, Perfil, Inspeccion } from '@/lib/types'

export default function AdminPage() {
  const [tab, setTab] = useState<'resumen'|'alertas'|'carros'|'usuarios'|'informes'>('resumen')
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [hospital, setHospital] = useState<any|null>(null)
  const [escaneando, setEscaneando] = useState(false)
  const [carros, setCarros] = useState<Carro[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [pendientes, setPendientes] = useState<any[]>([])
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([])
  const [alertas, setAlertas] = useState<any[]>([])
  const [filtroAlerta, setFiltroAlerta] = useState<'todas'|'no_operativo'|'vencimiento'|'control_vencido'>('todas')
  const [filtroTipoCarro, setFiltroTipoCarro] = useState<string>('todos')
  const [loading, setLoading] = useState(true)
  const [editandoUsuario, setEditandoUsuario] = useState<any|null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || p.rol !== 'administrador') { router.push('/'); return }
    setPerfil(p)
    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
      setHospital(h)
    }
    const [{ data: c }, { data: u }, { data: pen }, { data: ins }, { data: al }] = await Promise.all([
      supabase.from('carros').select('*, servicios(nombre)').eq('activo', true).eq('hospital_id', p.hospital_id).order('codigo'),
      supabase.from('perfiles').select('*').eq('activo', true).eq('hospital_id', p.hospital_id).order('nombre'),
      supabase.from('perfiles').select('*').eq('activo', false).eq('hospital_id', p.hospital_id).order('creado_en'),
      supabase.from('inspecciones').select('*, carros(codigo,nombre), perfiles(nombre)').order('fecha', { ascending: false }).limit(10),
      supabase.from('alertas').select('*, carros(codigo,nombre,ubicacion)').eq('resuelta', false).eq('hospital_id', p.hospital_id).order('creado_en', { ascending: false })
    ])
    setCarros(c || [])
    setUsuarios(u || [])
    setPendientes(pen || [])
    setInspecciones(ins || [])
    setAlertas(al || [])
    setLoading(false)
  }

  async function marcarAlertaResuelta(id: string) {
    await supabase.from('alertas').update({ resuelta: true }).eq('id', id)
    setAlertas(prev => prev.filter(a => a.id !== id))
    toast.success('Alerta marcada como resuelta')
  }

  async function aprobarUsuario(id: string) {
    const { error } = await supabase.from('perfiles').update({ activo: true }).eq('id', id)
    if (error) { toast.error('Error al aprobar'); return }
    toast.success('Usuario aprobado')
    cargarDatos()
  }

  async function rechazarUsuario(id: string) {
    const { error } = await supabase.from('perfiles').delete().eq('id', id)
    if (error) { toast.error('Error'); return }
    toast.success('Solicitud rechazada')
    cargarDatos()
  }

  async function guardarUsuario(u: any) {
    const { error } = await supabase.from('perfiles').update({
      rol: u.rol, recibir_alertas: u.recibir_alertas, email_alertas: u.email_alertas || null,
    }).eq('id', u.id)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Usuario actualizado')
    setEditandoUsuario(null)
    cargarDatos()
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const stats = {
    total: carros.length,
    operativos: carros.filter(c => c.estado === 'operativo').length,
    condicionales: carros.filter(c => c.estado === 'condicional').length,
    no_operativos: carros.filter(c => c.estado === 'no_operativo').length,
    controles_vencidos: carros.filter(c => { const d = diasHastaControl(c.proximo_control); return d !== null && d < 0 }).length,
  }

  const alertasFiltradas = alertas.filter(a => filtroAlerta === 'todas' || a.tipo === filtroAlerta)
  const carrosFiltrados = carros.filter(c => filtroTipoCarro === 'todos' || c.tipo_carro === filtroTipoCarro)
  const tiposCarro = Array.from(new Set(carros.map(c => (c as any).tipo_carro).filter(Boolean)))
  const colorPrimario = hospital?.color_primario || '#1d4ed8'
  useHospitalTheme(hospital?.color_primario)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  // Icono plantillas reutilizable
  const IconPlantilla = () => (
    <svg className="w-4 h-4 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" strokeWidth={2}/>
      <rect x="9" y="3" width="6" height="4" rx="1" strokeWidth={2}/>
      <line x1="9" y1="12" x2="15" y2="12" strokeWidth={2}/>
      <line x1="9" y1="16" x2="13" y2="16" strokeWidth={2}/>
    </svg>
  )

  return (
    <div className="page">
      {escaneando && (
        <EscanerCodigoBarras
          onResult={(codigo) => { setEscaneando(false); router.push('/buscar?q=' + encodeURIComponent(codigo)) }}
          onClose={() => setEscaneando(false)}
        />
      )}

      {/* TOPBAR */}
      <div className="topbar" style={{borderBottom:`2px solid ${colorPrimario}20`}}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hospital?.logo_url
            ? <img src={hospital.logo_url} alt={hospital.nombre} style={{height:'28px', objectFit:'contain', flexShrink:0}}/>
            : <div style={{width:'28px', height:'28px', borderRadius:'6px', background: colorPrimario, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                  <path d="M40 68C40 68 8 50 8 28C8 18 16 10 26 10C32 10 37.5 13 40 18C42.5 13 48 10 54 10C64 10 72 18 72 28C72 50 40 68 40 68Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2.5"/>
                  <polyline points="16,40 24,40 28,30 33,52 38,24 43,48 47,40 56,40 60,35 64,40" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>}
          <div className="min-w-0">
            <div className="text-xs text-gray-400 leading-none truncate">{hospital?.nombre || 'Hospital'}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-semibold text-sm truncate">{perfil?.nombre}</span>
              <span className="badge bg-purple-100 text-purple-800 text-xs flex-shrink-0">Admin</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {perfil?.id && <NotificacionesBell usuarioId={perfil.id} />}
          <button onClick={() => router.push('/buscar')} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white active:bg-gray-50">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth={2}/><path d="m21 21-4.35-4.35" strokeWidth={2} strokeLinecap="round"/></svg>
          </button>
          <button onClick={cerrarSesion} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">Salir</button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
        {([
          ['resumen', 'Resumen'],
          ['alertas', `Alertas${alertas.length > 0 ? ` (${alertas.length})` : ''}`],
          ['carros', 'Carros'],
          ['usuarios', 'Usuarios'],
          ['informes', 'Informes'],
        ] as const).map(([t, l]) => (
          <button key={t} className={`tab-btn whitespace-nowrap ${tab===t?'active':''} ${t==='alertas' && alertas.length > 0 ? 'text-red-600' : ''}`}
            onClick={() => setTab(t as any)}>{l}</button>
        ))}
      </div>

      <div className="content">

        {/* ============ TAB RESUMEN ============ */}
        {tab === 'resumen' && <>
          <div className="card">
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" placeholder="Buscar equipo, carro, censo, serie..."
                onFocus={() => router.push('/buscar')} readOnly />
              <button onClick={() => setEscaneando(true)}
                className="flex-shrink-0 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold active:opacity-80 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7" strokeWidth={2}/><rect x="14" y="3" width="7" height="7" strokeWidth={2}/>
                  <rect x="3" y="14" width="7" height="7" strokeWidth={2}/><rect x="14" y="14" width="3" height="3" strokeWidth={2}/>
                </svg>
                Escanear
              </button>
            </div>
          </div>

          {/* Accesos rápidos — grid 3 columnas */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Nuevo carro', ruta: '/admin/nuevo-carro', color: 'bg-blue-100', icon: <svg className="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeWidth={2}/></svg> },
              { label: 'Usuarios', ruta: '/admin/usuarios', color: 'bg-purple-100', icon: <svg className="w-4 h-4 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeWidth={2}/><circle cx="12" cy="7" r="4" strokeWidth={2}/></svg> },
              { label: 'Plantillas', ruta: '/admin/plantillas', color: 'bg-indigo-100', icon: <IconPlantilla /> },
              { label: 'Servicios', ruta: '/admin/servicios', color: 'bg-teal-100', icon: <svg className="w-4 h-4 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeWidth={2}/></svg> },
              { label: 'Equipos', ruta: '/admin/equipos', color: 'bg-orange-100', icon: <svg className="w-4 h-4 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg> },
              { label: 'Informes', ruta: '/admin/informes', color: 'bg-gray-100', icon: <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeWidth={2}/><polyline points="14 2 14 8 20 8" strokeWidth={2}/></svg> },
            ].map(({ label, ruta, color, icon }) => (
              <button key={ruta} className="card flex flex-col items-center gap-1.5 cursor-pointer active:bg-gray-50 p-3 text-center"
                onClick={() => router.push(ruta)}>
                <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>{icon}</div>
                <span className="text-xs font-semibold leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="card text-center"><div className="text-2xl font-bold text-green-700">{stats.operativos}</div><div className="text-xs text-gray-500 mt-1">Operativos</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-amber-600">{stats.condicionales}</div><div className="text-xs text-gray-500 mt-1">Condicionales</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-red-700">{stats.no_operativos}</div><div className="text-xs text-gray-500 mt-1">No operativos</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-gray-700">{stats.controles_vencidos}</div><div className="text-xs text-gray-500 mt-1">Ctrl. vencidos</div></div>
          </div>

          {alertas.length > 0 && (
            <div className="card border-red-200 bg-red-50">
              <div className="flex items-center justify-between mb-2">
                <span className="section-title text-red-700">Alertas activas</span>
                <div className="flex items-center gap-2">
                  <span className="badge bg-red-100 text-red-800">{alertas.length}</span>
                  <button onClick={() => setTab('alertas')} className="text-xs text-red-600 font-semibold">Ver todas →</button>
                </div>
              </div>
              {alertas.slice(0, 3).map(a => (
                <div key={a.id} className="alert-banner mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{(a.carros as any)?.codigo} — {(a.carros as any)?.nombre}</div>
                    <div className="text-gray-600 truncate">{a.mensaje}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pendientes.length > 0 && (
            <div className="card border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <span className="section-title">Solicitudes pendientes</span>
                <span className="badge bg-blue-100 text-blue-800">{pendientes.length}</span>
              </div>
              {pendientes.map(u => (
                <div key={u.id} className="row-item">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">{u.nombre.slice(0,2).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{u.nombre}</div>
                    <div className="text-xs text-gray-400">{u.email} · {u.rol}</div>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-success" onClick={() => aprobarUsuario(u.id)}>Aprobar</button>
                    <button className="btn-danger" onClick={() => rechazarUsuario(u.id)}>Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="section-title mb-3">Últimos controles</div>
            {inspecciones.length === 0 && <div className="text-xs text-gray-400 text-center py-4">Sin controles registrados aún</div>}
            {inspecciones.map(ins => {
              const e = estadoColor(ins.resultado)
              return (
                <div key={ins.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${ins.carro_id}/resultado/${ins.id}`)}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{(ins.carros as any)?.codigo} — {ins.tipo?.replace('_',' ')}</div>
                    <div className="text-xs text-gray-400">{(ins.perfiles as any)?.nombre} · {formatFechaHora(ins.fecha)}</div>
                  </div>
                  <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
                </div>
              )
            })}
          </div>
        </>}

        {/* ============ TAB ALERTAS ============ */}
        {tab === 'alertas' && <>
          <div className="card">
            <div className="section-title mb-2">Filtrar por tipo</div>
            <div className="flex gap-1.5 flex-wrap">
              {([
                ['todas', 'Todas', 'bg-gray-100 text-gray-700'],
                ['no_operativo', 'No operativo', 'bg-red-100 text-red-700'],
                ['vencimiento', 'Vencimiento', 'bg-amber-100 text-amber-700'],
                ['control_vencido', 'Control vencido', 'bg-orange-100 text-orange-700'],
              ] as const).map(([val, label, cls]) => (
                <button key={val} onClick={() => setFiltroAlerta(val)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filtroAlerta === val ? cls + ' border-current' : 'bg-white text-gray-400 border-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {alertasFiltradas.length === 0 ? (
            <div className="card text-center py-8">
              <div className="text-2xl mb-2">✓</div>
              <div className="text-sm font-semibold text-green-700">Sin alertas activas</div>
              <div className="text-xs text-gray-400 mt-1">Todos los carros están bajo control</div>
            </div>
          ) : alertasFiltradas.map(a => {
            const colorTipo = a.tipo === 'no_operativo' ? 'border-red-300 bg-red-50' : a.tipo === 'vencimiento' ? 'border-amber-300 bg-amber-50' : 'border-orange-300 bg-orange-50'
            const badgeTipo = a.tipo === 'no_operativo' ? 'bg-red-100 text-red-700' : a.tipo === 'vencimiento' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'
            return (
              <div key={a.id} className={`card ${colorTipo}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="text-sm font-bold">
                      {a.carro_id ? `${(a.carros as any)?.codigo} — ${(a.carros as any)?.nombre}` : (a.titulo || a.tipo?.replace(/_/g, ' '))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {a.carro_id ? (a.carros as any)?.ubicacion : a.mensaje?.replace(/\[equipo:[^\]]+\]/, '').trim()}
                    </div>
                  </div>
                  <span className={`badge ${badgeTipo} flex-shrink-0`}>{a.tipo?.replace(/_/g,' ')}</span>
                </div>
                {a.carro_id && <div className="text-xs text-gray-600 mb-3">{a.mensaje}</div>}
                <div className="flex gap-2">
                  <button className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700"
                    onClick={() => {
                      if (a.carro_id) { router.push(`/carro/${a.carro_id}`) }
                      else { const m = (a.mensaje || '').match(/\[equipo:([a-f0-9-]{36})\]/); if (m) router.push(`/admin/equipos/${m[1]}`) }
                    }}>
                    {a.carro_id ? 'Ver carro' : 'Ver equipo'}
                  </button>
                  <button className="flex-1 py-2 text-xs font-semibold rounded-lg bg-green-600 text-white" onClick={() => marcarAlertaResuelta(a.id)}>
                    Marcar resuelta
                  </button>
                </div>
              </div>
            )
          })}
        </>}

        {/* ============ TAB CARROS ============ */}
        {tab === 'carros' && <>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => router.push('/admin/nuevo-carro')}>+ Nuevo carro</button>
            <button className="btn-secondary flex items-center justify-center gap-1.5" onClick={() => router.push('/admin/plantillas')}>
              <IconPlantilla /> Plantillas
            </button>
          </div>

          {tiposCarro.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setFiltroTipoCarro('todos')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipoCarro === 'todos' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>Todos</button>
              {tiposCarro.map(t => (
                <button key={t} onClick={() => setFiltroTipoCarro(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroTipoCarro === t ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-gray-400 border-gray-200'}`}>
                  {t.replace('_',' ')}
                </button>
              ))}
            </div>
          )}

          <div className="card">
            {carrosFiltrados.length === 0 && <div className="text-xs text-gray-400 text-center py-6">No hay carros creados aún</div>}
            {carrosFiltrados.map(c => {
              const e = estadoColor(c.estado)
              const dias = diasHastaControl(c.proximo_control)
              const controlVencido = dias !== null && dias < 0
              return (
                <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <span>{(c.servicios as any)?.nombre || c.ubicacion || '—'}</span>
                      {controlVencido && <span className="text-red-600 font-semibold">· Control vencido</span>}
                      {!controlVencido && c.proximo_control && <span>· Control: {formatFecha(c.proximo_control)}</span>}
                    </div>
                  </div>
                  <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
                </div>
              )
            })}
          </div>
        </>}

        {/* ============ TAB USUARIOS ============ */}
        {tab === 'usuarios' && <>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => router.push('/admin/usuarios')}>👥 Gestionar usuarios</button>
            <button className="btn-secondary" onClick={() => router.push('/admin/nuevo-usuario')}>+ Crear usuario</button>
          </div>

          <button className="btn-secondary flex items-center gap-2 w-full" onClick={() => router.push('/admin/plantillas')}>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0"><IconPlantilla /></div>
            <span className="text-sm font-semibold">⚙️ Configurar plantillas de control</span>
          </button>

          {editandoUsuario && (
            <div className="card border-blue-200 bg-blue-50">
              <div className="section-title mb-3">Editando: {editandoUsuario.nombre}</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Rol</label>
                  <select className="input" value={editandoUsuario.rol} onChange={e => setEditandoUsuario({...editandoUsuario, rol: e.target.value})}>
                    <option value="auditor">Auditor</option>
                    <option value="tecnico">Técnico de mantenimiento</option>
                    <option value="supervisor">Supervisor de calidad</option>
                    <option value="readonly">Solo lectura</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                  <div>
                    <div className="text-sm font-medium">Recibir alertas por email</div>
                    <div className="text-xs text-gray-400">Carros no operativos y vencimientos</div>
                  </div>
                  <div onClick={() => setEditandoUsuario({...editandoUsuario, recibir_alertas: !editandoUsuario.recibir_alertas})}
                    className={`w-10 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${editandoUsuario.recibir_alertas ? 'bg-blue-600' : 'bg-gray-200'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${editandoUsuario.recibir_alertas ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={() => guardarUsuario(editandoUsuario)}>Guardar</button>
                  <button className="btn-secondary flex-1" onClick={() => setEditandoUsuario(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="section-title mb-3">Usuarios activos ({usuarios.length})</div>
            {usuarios.map(u => {
              const r = rolLabel(u.rol)
              return (
                <div key={u.id} className="row-item">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${r.bg} ${r.text}`}>
                    {u.nombre.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{u.nombre}</div>
                    <div className="text-xs text-gray-400 truncate">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${r.bg} ${r.text}`}>{r.label}</span>
                    <button onClick={() => router.push(`/admin/usuarios/${u.id}`)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50">
                      Ver ficha
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>}

        {/* ============ TAB INFORMES ============ */}
        {tab === 'informes' && (
          <div className="flex flex-col gap-3">
            <div className="card bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-700 leading-relaxed">
                Informes generados con los datos de <strong>{hospital?.nombre}</strong>. Los filtros se aplican en tiempo real y puedes descargar cualquier vista como PDF.
              </p>
            </div>
            {[
              { ruta: '/admin/informes', color: 'bg-blue-100', iconColor: 'text-blue-600', titulo: 'Inventario de equipos', desc: 'Filtrar por servicio, categoría, estado, mantenimiento · PDF',
                icon: <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeWidth={2}/><polyline points="14 2 14 8 20 8" strokeWidth={2}/><line x1="16" y1="13" x2="8" y2="13" strokeWidth={2}/><line x1="16" y1="17" x2="8" y2="17" strokeWidth={2}/></svg> },
              { ruta: '/admin/informes?seccion=controles', color: 'bg-purple-100', titulo: 'Historial de controles', desc: 'Filtrar por fecha, servicio, resultado, firma · PDF',
                icon: <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/></svg> },
              { ruta: '/admin/equipos', color: 'bg-orange-100', titulo: 'Inventario de equipos (lista)', desc: 'Ver y gestionar todos los equipos del hospital',
                icon: <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg> },
              { ruta: '/admin/plantillas', color: 'bg-indigo-100', titulo: 'Plantillas de control', desc: 'Configurar qué se comprueba en cada control y cómo se genera el PDF',
                icon: <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" strokeWidth={2}/><rect x="9" y="3" width="6" height="4" rx="1" strokeWidth={2}/><line x1="9" y1="12" x2="15" y2="12" strokeWidth={2}/><line x1="9" y1="16" x2="13" y2="16" strokeWidth={2}/></svg> },
            ].map(({ ruta, color, icon, titulo, desc }) => (
              <button key={ruta} className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push(ruta)}>
                <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>{icon}</div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{titulo}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
