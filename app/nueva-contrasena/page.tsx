'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

/**
 * Pantalla donde aterriza el usuario al abrir un enlace de recuperación.
 *
 * Supabase entrega la sesión de recuperación en el fragmento de la URL
 * (#access_token=...). El cliente del navegador la detecta solo, así que aquí
 * basta con esperar a que exista sesión antes de dejar cambiar la contraseña.
 */
export default function NuevaContrasenaPage() {
  const [comprobando, setComprobando] = useState(true)
  const [sesionValida, setSesionValida] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [repetida, setRepetida] = useState('')
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // El SDK procesa el fragmento por su cuenta, pero aquí lo leemos también a
    // mano y llamamos a setSession. Es el mismo patrón que usa el login por QR
    // en app/page.tsx, y no depende de cómo el SDK combine detectSessionInUrl
    // con el flowType, que es justo donde este flujo se puede torcer sin dejar
    // rastro útil.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) { setSesionValida(true); setComprobando(false) }
    })

    async function establecerSesion() {
      const fragmento = new URLSearchParams(window.location.hash.replace(/^#/, ''))

      // Supabase devuelve el motivo en el propio fragmento cuando el enlace ya
      // se usó o caducó. Mostrarlo ahorra adivinar.
      const errorEnlace = fragmento.get('error_description') || fragmento.get('error')
      if (errorEnlace) {
        setMotivo(decodeURIComponent(errorEnlace).replace(/\+/g, ' '))
        setComprobando(false)
        return
      }

      const access_token  = fragmento.get('access_token')
      const refresh_token = fragmento.get('refresh_token')

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) { setMotivo(error.message); setComprobando(false); return }
        setSesionValida(true); setComprobando(false)
        // Quitamos el token de la barra de direcciones: ya está en la sesión y
        // no debe quedar en el historial ni copiarse por error.
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      // Sin token en la URL: puede que el SDK ya lo hubiera consumido.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setSesionValida(true); setComprobando(false); return }

      setMotivo('El enlace no traía ningún token de acceso')
      setComprobando(false)
    }

    establecerSesion()
    return () => sub.subscription.unsubscribe()
  }, [])

  const problema = (() => {
    if (!password) return null
    if (password.length < 8) return 'Debe tener al menos 8 caracteres'
    if (repetida && password !== repetida) return 'Las dos contraseñas no coinciden'
    return null
  })()

  const puedeGuardar = password.length >= 8 && password === repetida && !guardando

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!puedeGuardar) return
    setGuardando(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success('Contraseña actualizada')
      // Cerramos la sesión de recuperación para que entre con su clave nueva:
      // así confirma que la recuerda antes de irse de la pantalla.
      await supabase.auth.signOut()
      router.push('/')
    } catch (err: any) {
      toast.error(err.message || 'No se pudo actualizar la contraseña')
      setGuardando(false)
    }
  }

  if (comprobando) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-sm text-gray-400">Comprobando el enlace…</div>
      </div>
    )
  }

  if (!sesionValida) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-sm w-full text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Enlace no válido o caducado</h1>
          <p className="text-sm text-gray-500 mb-4">
            Los enlaces de recuperación caducan al cabo de una hora y solo pueden
            usarse una vez. Pide a tu administrador que te genere uno nuevo.
          </p>
          {motivo && (
            <p className="text-xs text-gray-400 mb-5 font-mono break-words">
              Detalle: {motivo}
            </p>
          )}
          <button onClick={() => router.push('/')} className="btn-primary">
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="card max-w-sm w-full">
        <h1 className="text-lg font-bold text-gray-900 mb-1">Nueva contraseña</h1>
        <p className="text-sm text-gray-500 mb-5">
          Elige una contraseña que solo conozcas tú. Tu firma en los controles
          queda asociada a esta cuenta.
        </p>

        <form onSubmit={guardar} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password" type="password" className="input" value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password" autoFocus
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="label" htmlFor="repetida">Repítela</label>
            <input
              id="repetida" type="password" className="input" value={repetida}
              onChange={e => setRepetida(e.target.value)}
              autoComplete="new-password"
              placeholder="La misma otra vez"
            />
          </div>

          {problema && (
            <div className="alert-banner" role="alert">{problema}</div>
          )}

          <button type="submit" className="btn-primary" disabled={!puedeGuardar}>
            {guardando ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
