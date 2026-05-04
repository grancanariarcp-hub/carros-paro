'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import toast from 'react-hot-toast'

interface Perfil {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  hospital_id: string | null
  servicio_id: string | null
  creado_en: string
  aprobado_por: string | null
  recibir_alertas: boolean
  email_alertas: string | null
  codigo_empleado: string | null
  servicios?: { nombre: string } | null
  hospitales?: { nombre: string; color_primario: string } | null
}

interface Estadisticas {
  totalInspecciones: number
  inspeccionesFirmadas: number
  ultimaInspeccion: string | null
  ultimoAcceso: string | null
}

const ROL_LABEL: Record<string, string> = {
  superadmin: 'Superadmin', administrador: 'Administrador',
  calidad: 'Calidad', supervisor: 'Supervisor', auditor: 'Auditor',
  tecnico: 'Técnico', readonly: 'Solo lectura',
}

const ROL_COLOR: Record<string, string> = {
  superadmin: '#7c3aed', administrador: '#1d4ed8',
  calidad: '#0d9488', supervisor: '#0891b2', auditor: '#059669',
  tecnico: '#d97706', readonly: '#6b7280',
}

function formatFecha(f?: string | null): string {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatFechaHora(f?: string | null): string {
  if (!f) return '—'
  return new Date(f).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function FichaUsuarioPage() {
  const [usuario, setUsuario]     = useState<Perfil | null>(null)
  const [stats, setStats]         = useState<Estadisticas | null>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [perfilActual, setPerfilActual] = useState<any>(null)
  const [editando, setEditando]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState<Partial<Perfil>>({})

  const router = useRouter()
  const params = useParams()
  const usuarioId = params.id as string
  const supabase  = createClient()

  useEffect(() => { cargarDatos() }, [usuarioId])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    // calidad ve usuarios pero NO los edita (la edición se bloquea por rolesDisponibles())
    if (!p || !['administrador', 'superadmin', 'calidad', 'supervisor'].includes(p.rol)) {
      router.push('/'); return
    }
    setPerfilActual(p)

    // Cargar usuario objetivo
    const { data: u } = await supabase.from('perfiles')
      .select('*, servicios(nombre), hospitales(nombre, color_primario)')
      .eq('id', usuarioId).single()

    if (!u) { router.back(); return }
    setUsuario(u as Perfil)
    setForm({
      nombre: u.nombre,
      rol: u.rol,
      servicio_id: u.servicio_id,
      activo: u.activo,
      recibir_alertas: u.recibir_alertas,
      email_alertas: u.email_alertas,
      codigo_empleado: u.codigo_empleado,
    })

    // Cargar servicios del hospital
    if (u.hospital_id) {
      const { data: sv } = await supabase.from('servicios')
        .select('id, nombre').eq('hospital_id', u.hospital_id).eq('activo', true).order('nombre')
      setServicios(sv || [])
    }

    // Estadísticas de actividad
    const { data: inspecciones } = await supabase.from('inspecciones')
      .select('id, fecha, firma_url')
      .eq('auditor_id', usuarioId)
      .order('fecha', { ascending: false })

    const totalInspecciones   = inspecciones?.length || 0
    const inspeccionesFirmadas = inspecciones?.filter(i => i.firma_url).length || 0
    const ultimaInspeccion    = inspecciones?.[0]?.fecha || null

    setStats({ totalInspecciones, inspeccionesFirmadas, ultimaInspeccion, ultimoAcceso: null })
    setLoading(false)
  }

  async function guardar() {
    if (!form.nombre?.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({
      nombre:           form.nombre?.trim(),
      rol:              form.rol,
      servicio_id:      form.servicio_id || null,
      activo:           form.activo,
      recibir_alertas:  form.recibir_alertas,
      email_alertas:    form.email_alertas?.trim() || null,
      codigo_empleado:  form.codigo_empleado?.trim() || null,
    }).eq('id', usuarioId)

    if (error) { toast.error('Error al guardar: ' + error.message); setGuardando(false); return }
    toast.success('Usuario actualizado')
    setEditando(false)
    await cargarDatos()
    setGuardando(false)
  }

  async function toggleActivo() {
    const nuevoEstado = !usuario?.activo
    await supabase.from('perfiles').update({ activo: nuevoEstado }).eq('id', usuarioId)
    toast.success(nuevoEstado ? 'Usuario activado' : 'Usuario desactivado')
    await cargarDatos()
  }

  // Roles que puede asignar el usuario actual
  function rolesDisponibles() {
    if (perfilActual?.rol === 'superadmin') {
      return ['administrador', 'calidad', 'supervisor', 'auditor', 'tecnico', 'readonly']
    }
    if (perfilActual?.rol === 'administrador') {
      return ['calidad', 'supervisor', 'auditor', 'tecnico', 'readonly']
    }
    // 'calidad' NO gestiona usuarios — si llega aquí no debería poder cambiar roles
    return []
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando ficha...</div>
    </div>
  )

  if (!usuario) return null

  const colorRol = ROL_COLOR[usuario.rol] || '#6b7280'
  const colorHospital = (usuario.hospitales as any)?.color_primario || '#1d4ed8'

  return (
    <div className="page">
      <div className="topbar" style={{ borderBottom: `2px solid ${colorHospital}20` }}>
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center truncate">{usuario.nombre}</span>
        {!editando ? (
          <button onClick={() => setEditando(true)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">
            ✏️ Editar
          </button>
        ) : (
          <button onClick={guardar} disabled={guardando}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
            {guardando ? '...' : 'Guardar'}
          </button>
        )}
      </div>

      <div className="content">

        {/* Cabecera del usuario */}
        <div className="card">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ background: colorRol }}>
              {usuario.nombre.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-lg text-gray-900 leading-tight">{usuario.nombre}</div>
              <div className="text-sm text-gray-400 mt-0.5">{usuario.email}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="badge text-xs font-semibold border"
                  style={{ background: colorRol + '15', color: colorRol, borderColor: colorRol + '30' }}>
                  {ROL_LABEL[usuario.rol] || usuario.rol}
                </span>
                <span className={`badge text-xs border ${usuario.activo ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                  {usuario.activo ? '● Activo' : '○ Inactivo'}
                </span>
                {usuario.codigo_empleado && (
                  <span className="badge bg-gray-100 text-gray-600 text-xs border border-gray-200">
                    🆔 {usuario.codigo_empleado}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Acción rápida de activar/desactivar */}
          <button onClick={toggleActivo}
            className={`w-full py-2 text-xs font-semibold rounded-xl border transition-colors ${
              usuario.activo
                ? 'border-red-200 text-red-600 bg-red-50 active:bg-red-100'
                : 'border-green-200 text-green-600 bg-green-50 active:bg-green-100'
            }`}>
            {usuario.activo ? 'Desactivar acceso al sistema' : 'Activar acceso al sistema'}
          </button>
        </div>

        {/* Estadísticas de actividad */}
        {stats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-blue-700">{stats.totalInspecciones}</div>
              <div className="text-xs text-gray-400 mt-0.5">Controles</div>
            </div>
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-green-700">{stats.inspeccionesFirmadas}</div>
              <div className="text-xs text-gray-400 mt-0.5">Firmados</div>
            </div>
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-gray-700">
                {stats.totalInspecciones > 0
                  ? Math.round((stats.inspeccionesFirmadas / stats.totalInspecciones) * 100)
                  : 0}%
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Tasa firma</div>
            </div>
          </div>
        )}

        {/* Modo visualización */}
        {!editando && (
          <>
            <div className="card">
              <div className="section-title mb-3">Datos del usuario</div>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                <FilaDato label="Hospital" valor={(usuario.hospitales as any)?.nombre} />
                <FilaDato label="Servicio" valor={(usuario.servicios as any)?.nombre} />
                <FilaDato label="Rol" valor={ROL_LABEL[usuario.rol] || usuario.rol} />
                <FilaDato label="Estado" valor={usuario.activo ? 'Activo' : 'Inactivo'} />
                <FilaDato label="Alta en el sistema" valor={formatFecha(usuario.creado_en)} />
                <FilaDato label="Último control" valor={formatFechaHora(stats?.ultimaInspeccion)} />
              </div>
            </div>

            <div className="card">
              <div className="section-title mb-3">Acceso y notificaciones</div>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                <FilaDato label="Email principal" valor={usuario.email} />
                <FilaDato label="Email de alertas" valor={usuario.email_alertas || 'Mismo que el principal'} />
                <FilaDato label="Código de empleado (QR/barras)" valor={usuario.codigo_empleado} />
                <div>
                  <span className="text-gray-400">Recibir alertas: </span>
                  <span className={`font-semibold ${usuario.recibir_alertas ? 'text-green-700' : 'text-gray-500'}`}>
                    {usuario.recibir_alertas ? '✓ Sí' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modo edición */}
        {editando && (
          <>
            <div className="card">
              <div className="section-title mb-3">Datos del usuario</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Nombre completo *</label>
                  <input className="input" value={form.nombre || ''}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Rol</label>
                  <select className="input" value={form.rol || ''}
                    onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                    {rolesDisponibles().map(r => (
                      <option key={r} value={r}>{ROL_LABEL[r] || r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Servicio asignado</label>
                  <select className="input" value={form.servicio_id || ''}
                    onChange={e => setForm(f => ({ ...f, servicio_id: e.target.value || null }))}>
                    <option value="">Sin servicio asignado</option>
                    {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>

                <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={form.activo ?? true} className="w-4 h-4"
                    onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                  <div>
                    <div className="text-xs font-semibold text-gray-800">Usuario activo</div>
                    <div className="text-xs text-gray-400">Si está inactivo no podrá acceder al sistema</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="card">
              <div className="section-title mb-3">Acceso y notificaciones</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Email de alertas <span className="text-gray-400">(si es diferente al principal)</span></label>
                  <input className="input" type="email" placeholder={usuario.email}
                    value={form.email_alertas || ''}
                    onChange={e => setForm(f => ({ ...f, email_alertas: e.target.value }))} />
                </div>

                <label className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={form.recibir_alertas ?? false} className="w-4 h-4"
                    onChange={e => setForm(f => ({ ...f, recibir_alertas: e.target.checked }))} />
                  <div>
                    <div className="text-xs font-semibold text-blue-800">Recibir alertas por email</div>
                    <div className="text-xs text-blue-600">Carros no operativos, vencimientos y mantenimientos</div>
                  </div>
                </label>

                <div>
                  <label className="label">Código de empleado (QR / código de barras)</label>
                  <input className="input" placeholder="Código emitido por RRHH del hospital"
                    value={form.codigo_empleado || ''}
                    onChange={e => setForm(f => ({ ...f, codigo_empleado: e.target.value }))} />
                  <p className="text-xs text-gray-400 mt-1">
                    Permite al usuario identificarse escaneando su tarjeta de empleado en la pantalla de login.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={guardar} disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button onClick={() => { setEditando(false); setForm({ nombre: usuario.nombre, rol: usuario.rol, servicio_id: usuario.servicio_id, activo: usuario.activo, recibir_alertas: usuario.recibir_alertas, email_alertas: usuario.email_alertas, codigo_empleado: usuario.codigo_empleado }) }}
                className="btn-secondary">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FilaDato({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <span className="text-gray-400">{label}: </span>
      <span className="font-semibold text-gray-800">{valor || '—'}</span>
    </div>
  )
}
