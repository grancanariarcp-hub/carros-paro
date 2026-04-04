'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      if (perfilError || !perfil) throw new Error('Perfil no encontrado')
      if (!perfil.activo) throw new Error('Tu cuenta aún no fue aprobada. Contactá al administrador.')
      if (perfil.rol === 'administrador') router.push('/admin')
      else if (perfil.rol === 'supervisor') router.push('/supervisor')
      else router.push('/auditor')
    } catch (err: any) {
      toast.error(err.message || 'Error al ingresar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-gray-50">

      {/* Header azul */}
      <div className="bg-blue-700 px-6 pt-14 pb-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/20 mx-auto mb-4 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white leading-tight">Auditor Carros de Parada</h1>
        <p className="text-blue-200 text-xs mt-2 leading-snug px-4">
          Hospital Universitario de Gran Canaria Doctor Negrín
        </p>
        <div className="mt-4 pt-4 border-t border-blue-600">
          <p className="text-blue-300 text-xs font-medium tracking-wide">GranCanariaRCP</p>
          <p className="text-blue-400 text-xs italic mt-0.5">Dr. Lübbe</p>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex-1 px-6 py-8">
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="label">Correo electrónico</label>
            <input
              className="input"
              type="email"
              placeholder="usuario@hospital.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="btn-primary mt-2"
            disabled={loading}
          >
            {loading ? 'Ingresando...' : 'Ingresar al sistema'}
          </button>
        </form>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-xs text-blue-700 text-center font-medium mb-1">¿Necesitás acceso?</p>
          <p className="text-xs text-blue-600 text-center">
            Solicitá al administrador del sistema que cree tu cuenta.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 text-center">
        <p className="text-xs text-gray-400">
          Desarrollado por <span className="font-medium text-gray-500">GranCanariaRCP</span>
        </p>
        <p className="text-xs text-gray-300 italic mt-0.5">Dr. Lübbe</p>
      </div>

    </div>
  )
}
