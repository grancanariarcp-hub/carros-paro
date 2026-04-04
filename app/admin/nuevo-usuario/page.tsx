'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function NuevoUsuarioPage() {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'auditor' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.email || !form.password) {
      toast.error('Completá todos los campos')
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
      })
      if (perfilError) throw perfilError

      toast.success('Usuario creado correctamente')
      router.push('/admin')
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <button onClick={() => router.back()} className="text-blue-700 text-sm font-medium">← Volver</button>
        <span className="font-semibold text-sm flex-1 text-right">Nuevo usuario</span>
      </div>
      <form onSubmit={handleSubmit} className="content">
        <div className="card">
          <div className="section-title mb-4">Datos del usuario</div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="label">Nombre completo *</label>
              <input className="input" placeholder="Ej: Dr. Juan Pérez" value={form.nombre}
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
            </div>
            <div>
              <label className="label">Rol</label>
              <select className="input" value={form.rol}
                onChange={e => setForm({...form, rol: e.target.value})}>
                <option value="auditor">Auditor</option>
                <option value="supervisor">Supervisor de calidad</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
          </div>
        </div>
        <div className="card bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-700">
            El usuario podrá ingresar inmediatamente con el email y contraseña que indiques. 
            Se recomienda que cambie la contraseña en su primer ingreso.
          </p>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creando usuario...' : 'Crear usuario'}
        </button>
      </form>
    </div>
  )
}
