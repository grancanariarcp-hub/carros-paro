'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useHospitalTheme } from '@/lib/useHospitalTheme'

const ROL_LABEL: Record<string, string> = {
  superadmin: 'Superadmin', administrador: 'Administrador',
  supervisor: 'Supervisor', auditor: 'Auditor',
  tecnico: 'Técnico', readonly: 'Solo lectura',
}

const ROL_COLOR: Record<string, string> = {
  superadmin: '#7c3aed', administrador: '#1d4ed8',
  supervisor: '#0891b2', auditor: '#059669',
  tecnico: '#d97706', readonly: '#6b7280',
}

function formatFecha(f?: string | null): string {
  if (!f) return '—'
  return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function PerfilPage() {
  const [perfil, setPerfil]     = useState<any>(null)
  const [hospital, setHospital] = useState<any>(null)
  const [servicio, setServicio] = useState<any>(null)
  const [stats, setStats]       = useState({ controles: 0, firmados: 0, ultimoControl: null as string | null })
  const [loading, setLoading]   = useState(true)
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    nombre: '', email_alertas: '', recibir_alertas: false,
  })
  const router = useRouter()
  const supabase = createClient()
  useHospitalTheme(hospital?.color_primario)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: p } = await supabase.from('perfiles')
      .select('*').eq('id', user.id).single()
    if (!p) { router.push('/'); return }
    setPerfil(p)
    setForm({
      nombre: p.nombre || '',
      email_alertas: p.email_alertas || '',
      recibir_alertas: p.recibir_alertas || false,
    })

    if (p.hospital_id) {
      const { data: h } = await supabase.from('hospitales')
        .select('*').eq('id', p.hospital_id).maybeSingle()
      setHospital(h)
    }

    if (p.servicio_id) {
      const { data: sv } = await supabase.from('servicios')
        .select('nombre').eq('id', p.servicio_id).maybeSingle()
      setServicio(sv)
    }

    // Estadísticas de actividad
    const { data: inspecciones } = await supabase.from('inspecciones')
      .select('id, fecha, firma_url')
      .eq('auditor_id', user.id)
      .order('fecha', { ascending: false })

    setStats({
      controles: inspecciones?.length || 0,
      firmados: inspecciones?.filter(i => i.firma_url).length || 0,
      ultimoControl: inspecciones?.[0]?.fecha || null,
    })

    setLoading(false)
  }

  async function guardar() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({
      nombre: form.nombre.trim(),
      email_alertas: form.email_alertas.trim() || null,
      recibir_alertas: form.recibir_alertas,
    }).eq('id', perfil.id)
    if (error) { toast.error('Error al guardar'); setGuardando(false); return }
    toast.success('Perfil actualizado')
    setEditando(false)
    await cargarDatos()
    setGuardando(false)
  }

  function volverPanel() {
    if (perfil?.rol === 'superadmin') router.push('/superadmin')
    else if (perfil?.rol === 'administrador') router.push('/admin')
    else if (perfil?.rol === 'supervisor') router.push('/supervisor')
    else router.push('/auditor')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Cargando perfil...</div>
    </div>
  )

  const colorRol = ROL_COLOR[perfil?.rol] || '#6b7280'
  const colorHospital = hospital?.color_primario || '#1d4ed8'

  return (
    <div className="page">
      <div className="topbar" style={{ borderBottom: `2px solid ${colorHospital}20` }}>
        <button onClick={volverPanel} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-center">Mi perfil</span>
        {!editando
          ? <button onClick={() => setEditando(true)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">✏️ Editar</button>
          : <button onClick={guardar} disabled={guardando} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
              {guardando ? '...' : 'Guardar'}
            </button>
        }
      </div>

      <div className="content pb-8">

        {/* Cabecera */}
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0"
              style={{ background: colorRol }}>
              {perfil?.nombre?.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-lg text-gray-900 leading-tight truncate">{perfil?.nombre}</div>
              <div className="text-sm text-gray-400 truncate">{perfil?.email}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="badge text-xs font-semibold border"
                  style={{ background: colorRol + '15', color: colorRol, borderColor: colorRol + '30' }}>
                  {ROL_LABEL[perfil?.rol] || perfil?.rol}
                </span>
                {hospital && (
                  <span className="badge bg-gray-100 text-gray-600 text-xs border border-gray-200">
                    {hospital.nombre}
                  </span>
                )}
                {servicio && (
                  <span className="badge bg-blue-50 text-blue-700 text-xs border border-blue-200">
                    {servicio.nombre}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Estadísticas */}
        {stats.controles > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-blue-700">{stats.controles}</div>
              <div className="text-xs text-gray-400 mt-0.5">Controles</div>
            </div>
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-green-700">{stats.firmados}</div>
              <div className="text-xs text-gray-400 mt-0.5">Firmados</div>
            </div>
            <div className="card text-center p-3">
              <div className="text-2xl font-bold text-gray-700">
                {stats.controles > 0 ? Math.round((stats.firmados / stats.controles) * 100) : 0}%
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Tasa firma</div>
            </div>
          </div>
        )}

        {/* Vista modo lectura */}
        {!editando && (
          <>
            <div className="card">
              <div className="section-title mb-3">Información</div>
              <div className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Nombre</span>
                  <span className="font-semibold text-gray-800">{perfil?.nombre}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Email</span>
                  <span className="font-semibold text-gray-800 truncate max-w-[60%] text-right">{perfil?.email}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Rol</span>
                  <span className="font-semibold" style={{ color: colorRol }}>{ROL_LABEL[perfil?.rol] || perfil?.rol}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Hospital</span>
                  <span className="font-semibold text-gray-800">{hospital?.nombre || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Servicio</span>
                  <span className="font-semibold text-gray-800">{servicio?.nombre || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Alta en el sistema</span>
                  <span className="font-semibold text-gray-800">{formatFecha(perfil?.creado_en)}</span>
                </div>
                {stats.ultimoControl && (
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-gray-400 text-xs">Último control</span>
                    <span className="font-semibold text-gray-800">{formatFecha(stats.ultimoControl)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="section-title mb-3">Acceso y notificaciones</div>
              <div className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Email de alertas</span>
                  <span className="font-semibold text-gray-800 text-right max-w-[60%] truncate">
                    {perfil?.email_alertas || 'Mismo que el principal'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-gray-400 text-xs">Recibir alertas</span>
                  <span className={`font-semibold ${perfil?.recibir_alertas ? 'text-green-700' : 'text-gray-400'}`}>
                    {perfil?.recibir_alertas ? '✓ Sí' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-400 text-xs">Código QR / empleado</span>
                  <span className="font-semibold text-gray-800">
                    {perfil?.codigo_empleado
                      ? <span className="flex items-center gap-1">🆔 <span className="font-mono text-xs">{perfil.codigo_empleado}</span></span>
                      : <span className="text-gray-400 text-xs">No asignado</span>}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Vista modo edición */}
        {editando && (
          <>
            <div className="card">
              <div className="section-title mb-3">Editar información</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Nombre completo *</label>
                  <input className="input" value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                  El email principal y el rol solo pueden ser modificados por el administrador.
                </div>
              </div>
            </div>

            <div className="card">
              <div className="section-title mb-3">Notificaciones</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label">Email para alertas <span className="text-gray-400">(opcional)</span></label>
                  <input className="input" type="email"
                    placeholder={perfil?.email || 'tu@email.com'}
                    value={form.email_alertas}
                    onChange={e => setForm(f => ({ ...f, email_alertas: e.target.value }))} />
                  <p className="text-xs text-gray-400 mt-1">
                    Si lo dejas vacío las alertas llegan al email principal.
                  </p>
                </div>
                <label className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={form.recibir_alertas} className="w-4 h-4 accent-blue-600"
                    onChange={e => setForm(f => ({ ...f, recibir_alertas: e.target.checked }))} />
                  <div>
                    <div className="text-xs font-semibold text-blue-800">Recibir alertas por email</div>
                    <div className="text-xs text-blue-600">Carros no operativos, vencimientos y mantenimientos</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="card bg-gray-50 border-gray-200">
              <div className="section-title mb-1">Código QR / empleado</div>
              <div className="text-xs text-gray-400 mb-2">
                El código de acceso rápido es asignado por el administrador de tu centro. Contacta con él si necesitas uno.
              </div>
              {perfil?.codigo_empleado
                ? <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-gray-200">
                    <span className="text-lg">🆔</span>
                    <span className="font-mono text-sm text-gray-700">{perfil.codigo_empleado}</span>
                    <span className="text-xs text-green-600 font-semibold ml-auto">Asignado</span>
                  </div>
                : <div className="text-xs text-gray-400 p-2.5 bg-white rounded-xl border border-gray-200">
                    Sin código asignado — contacta con tu administrador
                  </div>}
            </div>

            <div className="flex gap-2">
              <button onClick={guardar} disabled={guardando} className="btn-primary flex-1">
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button onClick={() => { setEditando(false); setForm({ nombre: perfil.nombre, email_alertas: perfil.email_alertas || '', recibir_alertas: perfil.recibir_alertas || false }) }}
                className="btn-secondary">
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* Cerrar sesión */}
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }}
          className="w-full py-3 text-sm font-semibold text-red-600 border border-red-200 rounded-2xl bg-red-50 active:bg-red-100">
          Cerrar sesión
        </button>

      </div>
    </div>
  )
}
