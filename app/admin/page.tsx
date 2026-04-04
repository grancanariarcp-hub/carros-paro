'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { estadoColor, formatFechaHora, rolLabel } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Carro, Perfil, Inspeccion } from '@/lib/types'

export default function AdminPage() {
  const [tab, setTab] = useState<'resumen'|'usuarios'|'carros'|'informes'>('resumen')
  const [perfil, setPerfil] = useState<Perfil|null>(null)
  const [carros, setCarros] = useState<Carro[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [pendientes, setPendientes] = useState<any[]>([])
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([])
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

    const [{ data: c }, { data: u }, { data: pen }, { data: ins }] = await Promise.all([
      supabase.from('carros').select('*, servicios(nombre)').eq('activo', true).order('codigo'),
      supabase.from('perfiles').select('*').eq('activo', true).order('nombre'),
      supabase.from('perfiles').select('*').eq('activo', false).order('creado_en'),
      supabase.from('inspecciones').select('*, carros(codigo,nombre), perfiles(nombre)')
        .order('fecha', { ascending: false }).limit(10)
    ])
    setCarros(c || [])
    setUsuarios(u || [])
    setPendientes(pen || [])
    setInspecciones(ins || [])
    setLoading(false)
  }

  async function aprobarUsuario(id: string) {
    const { error } = await supabase.from('perfiles')
      .update({ activo: true, aprobado_por: perfil?.id }).eq('id', id)
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
      rol: u.rol,
      recibir_alertas: u.recibir_alertas,
      email_alertas: u.email_alertas || null,
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
    operativos: carros.filter(c => c.estado === 'operativo').length,
    condicionales: carros.filter(c => c.estado === 'condicional').length,
    no_operativos: carros.filter(c => c.estado === 'no_operativo').length,
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <div className="flex-1">
          <div className="text-xs text-gray-400">Bienvenido/a</div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{perfil?.nombre}</span>
            <span className="badge bg-purple-100 text-purple-800">Admin</span>
          </div>
        </div>
        <button onClick={cerrarSesion} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">Salir</button>
      </div>

      <div className="flex bg-white border-b border-gray-100">
        {(['resumen','usuarios','carros','informes'] as const).map(t => (
          <button key={t} className={`tab-btn ${tab===t?'active':''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div className="content">

        {/* TAB RESUMEN */}
        {tab === 'resumen' && <>
          <div className="grid grid-cols-3 gap-2">
            <div className="card text-center"><div className="text-2xl font-bold text-green-700">{stats.operativos}</div><div className="text-xs text-gray-500 mt-1">Operativos</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-amber-600">{stats.condicionales}</div><div className="text-xs text-gray-500 mt-1">Condicionales</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-red-700">{stats.no_operativos}</div><div className="text-xs text-gray-500 mt-1">No operativos</div></div>
          </div>

          {pendientes.length > 0 && (
            <div className="card border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <span className="section-title">Solicitudes pendientes</span>
                <span className="badge bg-blue-100 text-blue-800">{pendientes.length}</span>
              </div>
              {pendientes.map(u => (
                <div key={u.id} className="row-item">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                    {u.nombre.slice(0,2).toUpperCase()}
                  </div>
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
                <div key={ins.id} className="row-item">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {(ins.carros as any)?.codigo} — {ins.tipo?.replace('_',' ')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {(ins.perfiles as any)?.nombre} · {formatFechaHora(ins.fecha)}
                    </div>
                  </div>
                  <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
                </div>
              )
            })}
          </div>
        </>}

        {/* TAB USUARIOS */}
        {tab === 'usuarios' && <>
          <button className="btn-primary" onClick={() => router.push('/admin/nuevo-usuario')}>
            + Crear nuevo usuario
          </button>

          {editandoUsuario && (
            <div className="card border-blue-200" style={{background:'#EFF6FF'}}>
              <div className="section-title mb-3">Editando: {editandoUsuario.nombre}</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Rol</label>
                  <select className="input" value={editandoUsuario.rol}
                    onChange={e => setEditandoUsuario({...editandoUsuario, rol: e.target.value})}>
                    <option value="auditor">Auditor</option>
                    <option value="supervisor">Supervisor de calidad</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                  <div>
                    <div className="text-sm font-medium">Recibir alertas por email</div>
                    <div className="text-xs text-gray-400">Carros no operativos, vencimientos y controles vencidos</div>
                  </div>
                  <div
                    onClick={() => setEditandoUsuario({...editandoUsuario, recibir_alertas: !editandoUsuario.recibir_alertas})}
                    className={`w-10 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${editandoUsuario.recibir_alertas ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${editandoUsuario.recibir_alertas ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                  </div>
                </div>
                {editandoUsuario.recibir_alertas && (
                  <div>
                    <label className="label">Email para alertas (opcional)</label>
                    <input className="input" type="email"
                      placeholder={editandoUsuario.email}
                      value={editandoUsuario.email_alertas || ''}
                      onChange={e => setEditandoUsuario({...editandoUsuario, email_alertas: e.target.value})}
                    />
                  </div>
                )}
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
                    {u.recibir_alertas && (
                      <div className="text-xs text-blue-600 mt-0.5">✓ Recibe alertas</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${r.bg} ${r.text}`}>{r.label}</span>
                    <button
                      onClick={() => setEditandoUsuario({...u})}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50"
                    >✏️</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>}

        {/* TAB CARROS */}
        {tab === 'carros' && <>
          <button className="btn-primary" onClick={() => router.push('/admin/nuevo-carro')}>
            + Crear nuevo carro
          </button>
          <div className="card">
            {carros.length === 0 && <div className="text-xs text-gray-400 text-center py-6">No hay carros creados aún</div>}
            {carros.map(c => {
              const e = estadoColor(c.estado)
              return (
                <div key={c.id} className="row-item cursor-pointer" onClick={() => router.push(`/carro/${c.id}`)}>
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.dot}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{c.codigo} — {c.nombre}</div>
                    <div className="text-xs text-gray-400">{(c.servicios as any)?.nombre || c.ubicacion}</div>
                  </div>
                  <span className={`badge ${e.bg} ${e.text}`}>{e.label}</span>
                </div>
              )
            })}
          </div>
        </>}

        {/* TAB INFORMES */}
        {tab === 'informes' && (
          <div className="flex flex-col gap-3">
            <div className="card bg-blue-50 border-blue-100">
              <p className="text-xs text-blue-700 leading-relaxed">
                Generá informes con datos en tiempo real. Cada informe tiene código automático editable según nomenclatura ISO.
              </p>
            </div>
            <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push('/informes/controles_vencidos')}>
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2}/><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2}/><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2}/><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2}/></svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Controles vencidos</div>
                <div className="text-xs text-gray-400">Carros sin auditar con días de retraso</div>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
            </button>
            <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push('/informes/no_operativos')}>
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeWidth={2}/><line x1="12" y1="9" x2="12" y2="13" strokeWidth={2}/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2}/></svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Carros no operativos</div>
                <div className="text-xs text-gray-400">Con fallos graves y fotos de evidencia</div>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
            </button>
            <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push('/informes/vencimientos')}>
              <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth={2}/><polyline points="12 6 12 12 16 14" strokeWidth={2}/></svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Vencimientos de material</div>
                <div className="text-xs text-gray-400">Filtrado por rango de fechas y servicio</div>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
            </button>
            <button className="btn-secondary text-left flex items-center gap-3" onClick={() => router.push('/informes/historial_auditorias')}>
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeWidth={2}/><polyline points="14 2 14 8 20 8" strokeWidth={2}/></svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Historial de auditorías</div>
                <div className="text-xs text-gray-400">Con filtros por carro, auditor y resultado</div>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" strokeWidth={2}/></svg>
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
