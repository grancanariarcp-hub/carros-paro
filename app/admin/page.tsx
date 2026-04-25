'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const ROLES_ADMIN = [
  { value: 'supervisor', label: 'Supervisor de calidad' },
  { value: 'auditor',    label: 'Auditor' },
  { value: 'tecnico',    label: 'Técnico de mantenimiento' },
  { value: 'readonly',   label: 'Solo lectura' },
]

export default function AdminUsuariosPage() {
  const [perfil, setPerfil]       = useState<any>(null)
  const [hospital, setHospital]   = useState<any>(null)
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [servicios, setServicios] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [modal, setModal]         = useState<any>(null) // null | 'nuevo' | usuario
  const [form, setForm]           = useState({
    nombre: '', email: '', rol: 'auditor', servicio_id: '', activo: true,
  })
  const [busqueda, setBusqueda]   = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) { router.push('/'); return }
    setPerfil(p)

    const { data: h } = await supabase.from('hospitales').select('*').eq('id', p.hospital_id).single()
    setHospital(h)

    const { data: u } = await supabase.from('perfiles')
      .select('*, servicios(nombre)')
      .eq('hospital_id', p.hospital_id)
      .order('creado_en', { ascending: false })
    setUsuarios(u || [])

    const { data: sv } = await supabase.from('servicios')
      .select('id, nombre').eq('hospital_id', p.hospital_id).eq('activo', true).order('nombre')
    setServicios(sv || [])

    setLoading(false)
  }

  async function crearUsuario() {
    if (!form.nombre || !form.email) { toast.error('Nombre y email son obligatorios'); return }
    setGuardando(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: form.email,
        password: Math.random().toString(36).slice(-10) + 'A1!',
        email_confirm: true,
      })
      if (authError) throw authError

      const { error: perfilError } = await supabase.from('perfiles').insert({
        id: authData.user.id,
        nombre: form.nombre,
        email: form.email,
        rol: form.rol,
        hospital_id: perfil.hospital_id,
        servicio_id: form.servicio_id || null,
        activo: form.activo,
      })
      if (perfilError) throw perfilError

      toast.success(`Usuario "${form.nombre}" creado correctamente`)
      setModal(null)
      resetForm()
      await cargarDatos()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario')
    } finally {
      setGuardando(false)
    }
  }

  async function actualizarUsuario() {
    if (!modal?.id) return
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({
      nombre: form.nombre,
      rol: form.rol,
      servicio_id: form.servicio_id || null,
      activo: form.activo,
    }).eq('id', modal.id)
    if (error) { toast.error('Error al actualizar'); setGuardando(false); return }
    toast.success('Usuario actualizado')
    setModal(null)
    await cargarDatos()
    setGuardando(false)
  }

  async function toggleActivo(u: any) {
    await supabase.from('perfiles').update({ activo: !u.activo }).eq('id', u.id)
    toast.success(u.activo ? 'Usuario desactivado' : 'Usuario activado')
    await cargarDatos()
  }

  function resetForm() {
    setForm({ nombre: '', email: '', rol: 'auditor', servicio_id: '', activo: true })
  }

  const usuariosFiltrados = usuarios.filter(u =>
    !busqueda ||
    u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const rolColor: Record<string, string> = {
    administrador: '#7c3aed', supervisor: '#1d4ed8',
    auditor: '#059669', tecnico: '#d97706', readonly: '#6b7280',
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Gestión de usuarios</span>
        <button onClick={() => { setModal('nuevo'); resetForm() }}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
          + Nuevo
        </button>
      </div>

      <div className="content">
        <div className="card bg-blue-50 border-blue-100">
          <div className="text-xs text-blue-700">
            <strong>{hospital?.nombre}</strong> · {usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? 's' : ''}
          </div>
          <div className="text-xs text-blue-500 mt-0.5">
            Como administrador puedes crear supervisores, auditores, técnicos y usuarios de solo lectura.
          </div>
        </div>

        <input className="input" placeholder="Buscar por nombre o email..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />

        <div className="card">
          {usuariosFiltrados.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">Sin usuarios</div>
          )}
          {usuariosFiltrados.map(u => (
            <div key={u.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: rolColor[u.rol] || '#6b7280' }}>
                {u.nombre?.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{u.nombre}</div>
                <div className="text-xs text-gray-400 truncate">{u.email}</div>
                <div className="text-xs text-gray-400">
                  {u.rol} {(u.servicios as any)?.nombre ? `· ${(u.servicios as any).nombre}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`badge text-xs ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {u.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => { setModal(u); setForm({ nombre: u.nombre, email: u.email, rol: u.rol, servicio_id: u.servicio_id || '', activo: u.activo }) }}
                  className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 bg-gray-50">
                  Editar
                </button>
                <button onClick={() => toggleActivo(u)}
                  className={`text-xs px-2 py-1 rounded border ${u.activo ? 'border-red-200 text-red-600 bg-red-50' : 'border-green-200 text-green-600 bg-green-50'}`}>
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base text-gray-900 mb-4">
              {modal === 'nuevo' ? 'Crear usuario' : `Editar: ${modal.nombre}`}
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre completo *</label>
                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              {modal === 'nuevo' && (
                <div>
                  <label className="label">Email *</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="label">Rol</label>
                <select className="input" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                  {ROLES_ADMIN.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Servicio asignado</label>
                <select className="input" value={form.servicio_id} onChange={e => setForm(f => ({ ...f, servicio_id: e.target.value }))}>
                  <option value="">Sin servicio asignado</option>
                  {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={form.activo} className="w-4 h-4"
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                <div>
                  <div className="text-xs font-semibold text-gray-800">Usuario activo</div>
                  <div className="text-xs text-gray-400">Si está inactivo no podrá acceder</div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={modal === 'nuevo' ? crearUsuario : actualizarUsuario}
                disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Guardando...' : modal === 'nuevo' ? 'Crear usuario' : 'Guardar'}
              </button>
              <button onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
