'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { rutaPadre } from '@/lib/navigation'

export default function SupervisorUsuariosPage() {
  const [perfil, setPerfil]     = useState<any>(null)
  const [servicio, setServicio] = useState<any>(null)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [modal, setModal]       = useState<any>(null)
  const [form, setForm]         = useState({ nombre: '', email: '', activo: true })
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || p.rol !== 'supervisor') { router.push('/'); return }
    setPerfil(p)

    if (p.servicio_id) {
      const { data: sv } = await supabase.from('servicios').select('*').eq('id', p.servicio_id).single()
      setServicio(sv)
    }

    const { data: u } = await supabase.from('perfiles')
      .select('*')
      .eq('hospital_id', p.hospital_id)
      .eq('servicio_id', p.servicio_id)
      .eq('rol', 'readonly')
      .order('creado_en', { ascending: false })
    setUsuarios(u || [])
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
        rol: 'readonly',
        hospital_id: perfil.hospital_id,
        servicio_id: perfil.servicio_id,
        activo: form.activo,
      })
      if (perfilError) throw perfilError

      toast.success(`Usuario "${form.nombre}" creado`)
      setModal(null)
      setForm({ nombre: '', email: '', activo: true })
      await cargarDatos()
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario')
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActivo(u: any) {
    await supabase.from('perfiles').update({ activo: !u.activo }).eq('id', u.id)
    toast.success(u.activo ? 'Usuario desactivado' : 'Usuario activado')
    await cargarDatos()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.push(rutaPadre(pathname))} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Usuarios de solo lectura</span>
        <button onClick={() => { setModal('nuevo'); setForm({ nombre: '', email: '', activo: true }) }}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
          + Nuevo
        </button>
      </div>

      <div className="content">
        <div className="card bg-blue-50 border-blue-100">
          <div className="text-xs text-blue-700 font-semibold">{servicio?.nombre || 'Tu servicio'}</div>
          <div className="text-xs text-blue-500 mt-0.5">
            Como supervisor puedes crear usuarios de <strong>solo lectura</strong> para tu servicio.
            Pueden ver información pero no realizar controles ni editar datos.
          </div>
        </div>

        <div className="card">
          {usuarios.length === 0 && (
            <div className="text-center py-8">
              <div className="text-2xl mb-2">👤</div>
              <div className="text-sm text-gray-500">Sin usuarios de solo lectura en este servicio</div>
              <button onClick={() => setModal('nuevo')} className="btn-primary mt-3 text-xs">
                + Crear primer usuario
              </button>
            </div>
          )}
          {usuarios.map(u => (
            <div key={u.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0">
                {u.nombre?.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{u.nombre}</div>
                <div className="text-xs text-gray-400 truncate">{u.email}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`badge text-xs ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {u.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => toggleActivo(u)}
                  className={`text-xs px-2 py-1 rounded border ${u.activo ? 'border-red-200 text-red-600 bg-red-50' : 'border-green-200 text-green-600 bg-green-50'}`}>
                  {u.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base text-gray-900 mb-4">Crear usuario de solo lectura</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label">Nombre completo *</label>
                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                Se creará con rol <strong>Solo lectura</strong> asignado al servicio <strong>{servicio?.nombre}</strong>.
                Recibirá un email para establecer su contraseña.
              </div>
              <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl cursor-pointer">
                <input type="checkbox" checked={form.activo} className="w-4 h-4"
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                <div>
                  <div className="text-xs font-semibold text-gray-800">Activar inmediatamente</div>
                  <div className="text-xs text-gray-400">Si no, el usuario no podrá acceder hasta que lo actives</div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={crearUsuario} disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Creando...' : 'Crear usuario'}
              </button>
              <button onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
