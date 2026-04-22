'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const ROLES = [
  { value: 'auditor', label: 'Auditor', desc: 'Realiza controles y actualiza vencimientos' },
  { value: 'tecnico', label: 'Técnico de mantenimiento', desc: 'Actualiza mantenimiento preventivo de equipos' },
  { value: 'supervisor', label: 'Supervisor de calidad', desc: 'Supervisa controles y genera informes' },
  { value: 'readonly', label: 'Solo lectura', desc: 'Ve toda la información sin poder modificar nada' },
  { value: 'administrador', label: 'Administrador', desc: 'Control total del hospital en la plataforma' },
]

export default function NuevoUsuarioPage() {
  const [form, setForm] = useState({
    nombre: '', email: '', password: '', rol: 'auditor',
    recibir_alertas: false, email_alertas: '',
  })
  const [loading, setLoading] = useState(false)
  const [estadoPlan, setEstadoPlan] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: p } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    if (!p || !['administrador', 'superadmin'].includes(p.rol)) { router.back(); return }
    setPerfil(p)

    if (p.hospital_id) {
      const { data: plan } = await supabase.rpc('estado_plan', { p_hospital_id: p.hospital_id })
      setEstadoPlan(plan)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.email || !form.password) {
      toast.error('Completa todos los campos obligatorios')
      return
    }
    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    // Verificar límite de usuarios
    if (estadoPlan && !estadoPlan.puede_crear_usuario) {
      toast.error(`Has alcanzado el límite de ${estadoPlan.max_usuarios} usuarios de tu plan. Contacta con CRITIC SL para ampliar.`)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      })
      if (error) throw error
      if (!data.user) throw new Error('No se pudo crear el usuario')

      const { error: perfilError } = await supabase.from('perfiles').insert({
        id: data.user.id,
        nombre: form.nombre,
        email: form.email,
        rol: form.rol,
        activo: true,
        hospital_id: perfil?.hospital_id || null,
        recibir_alertas: form.recibir_alertas,
        email_alertas: form.email_alertas || null,
      })
      if (perfilError) throw perfilError

      // Log de auditoría
      const { data: { user: adminUser } } = await supabase.auth.getUser()
      await supabase.from('log_auditoria').insert({
        usuario_id: adminUser?.id,
        hospital_id: perfil?.hospital_id,
        accion: 'usuario_creado',
        tabla_afectada: 'perfiles',
        registro_id: data.user.id,
        detalle: { nombre: form.nombre, email: form.email, rol: form.rol },
        resultado: 'exito',
      })

      // Notificación interna
      if (perfil?.hospital_id) {
        await supabase.from('notificaciones').insert({
          hospital_id: perfil.hospital_id,
          tipo: 'usuario_creado',
          titulo: 'Nuevo usuario creado',
          mensaje: `${form.nombre} (${ROLES.find(r => r.value === form.rol)?.label}) ha sido añadido al sistema.`,
        })
      }

      toast.success(`Usuario ${form.nombre} creado correctamente`)
      router.push('/admin')
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario')
    } finally {
      setLoading(false)
    }
  }

  const rolSeleccionado = ROLES.find(r => r.value === form.rol)

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Nuevo usuario</span>
      </div>
      <form onSubmit={handleSubmit} className="content">

        {/* Estado del plan */}
        {estadoPlan && (
          <div className={`card ${estadoPlan.puede_crear_usuario ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-200'}`}>
            <div className={`text-xs font-semibold ${estadoPlan.puede_crear_usuario ? 'text-blue-700' : 'text-red-700'}`}>
              {estadoPlan.puede_crear_usuario
                ? `Plan ${estadoPlan.plan} — ${estadoPlan.usuarios_usados} de ${estadoPlan.max_usuarios} usuarios usados`
                : `Límite alcanzado — ${estadoPlan.max_usuarios} usuarios máximo en tu plan`}
            </div>
            <div className={`text-xs mt-0.5 ${estadoPlan.puede_crear_usuario ? 'text-blue-600' : 'text-red-600'}`}>
              {estadoPlan.puede_crear_usuario
                ? `Quedan ${estadoPlan.usuarios_disponibles} usuarios disponibles`
                : 'Contacta con CRITIC SL para ampliar tu plan'}
            </div>
            {!estadoPlan.puede_crear_usuario && (
              <button type="button" className="mt-2 text-xs font-semibold text-red-700 underline"
                onClick={() => window.open('mailto:info@criticsl.com?subject=Ampliar plan', '_blank')}>
                Contactar con CRITIC SL →
              </button>
            )}
          </div>
        )}

        {/* Datos del usuario */}
        <div className="card">
          <div className="section-title mb-4">Datos del usuario</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">Nombre completo *</label>
              <input className="input" placeholder="Ej: Dr. Juan García" value={form.nombre}
                onChange={e => setForm({...form, nombre: e.target.value})} required />
            </div>
            <div>
              <label className="label">Correo electrónico *</label>
              <input className="input" type="email" placeholder="usuario@hospital.com" value={form.email}
                onChange={e => setForm({...form, email: e.target.value})} required />
            </div>
            <div>
              <label className="label">Contraseña inicial *</label>
              <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={form.password}
                onChange={e => setForm({...form, password: e.target.value})} required />
              <div className="text-xs text-gray-400 mt-1">Se recomienda que el usuario la cambie en su primer acceso</div>
            </div>
          </div>
        </div>

        {/* Rol */}
        <div className="card">
          <div className="section-title mb-3">Rol y permisos</div>
          <div className="flex flex-col gap-2">
            {ROLES.map(r => (
              <div
                key={r.value}
                onClick={() => setForm({...form, rol: r.value})}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  form.rol === r.value
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-gray-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                  form.rol === r.value ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                }`}>
                  {form.rol === r.value && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                    </div>
                  )}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${form.rol === r.value ? 'text-blue-700' : 'text-gray-700'}`}>
                    {r.label}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div className="card">
          <div className="section-title mb-3">Notificaciones por email</div>
          <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200 mb-3">
            <div>
              <div className="text-sm font-medium">Recibir alertas por email</div>
              <div className="text-xs text-gray-400">Carros no operativos, vencimientos y controles vencidos</div>
            </div>
            <div
              onClick={() => setForm({...form, recibir_alertas: !form.recibir_alertas})}
              className={`w-10 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${form.recibir_alertas ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${form.recibir_alertas ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
            </div>
          </div>
          {form.recibir_alertas && (
            <div>
              <label className="label">Email alternativo para alertas (opcional)</label>
              <input className="input" type="email"
                placeholder={form.email || 'Dejar vacío para usar el email de acceso'}
                value={form.email_alertas}
                onChange={e => setForm({...form, email_alertas: e.target.value})} />
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || (estadoPlan && !estadoPlan.puede_crear_usuario)}
        >
          {loading ? 'Creando usuario...' : 'Crear usuario'}
        </button>
      </form>
    </div>
  )
}
