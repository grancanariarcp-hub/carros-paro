'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  PUSH_SOPORTADO,
  permisoActual,
  suscripcionActual,
  activarPush,
  desactivarPush,
} from '@/lib/push-client'

/**
 * Botón / toggle para activar las notificaciones push del navegador.
 * Cada usuario lo activa por dispositivo (cada navegador es una suscripción).
 *
 * Estados visibles:
 *   - Navegador no soporta push -> aviso
 *   - Permiso denegado -> aviso para que lo cambie a mano
 *   - Activo en este dispositivo -> botón "Desactivar"
 *   - Inactivo -> botón "Activar"
 */
export default function PushToggle({ usuarioId }: { usuarioId: string }) {
  const [estado, setEstado] = useState<'cargando' | 'no-soportado' | 'denegado' | 'activo' | 'inactivo'>('cargando')
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => { evaluar() }, [])

  async function evaluar() {
    if (!PUSH_SOPORTADO) { setEstado('no-soportado'); return }
    const p = permisoActual()
    if (p === 'denied') { setEstado('denegado'); return }
    const sub = await suscripcionActual()
    setEstado(sub ? 'activo' : 'inactivo')
  }

  async function activar() {
    setTrabajando(true)
    const r = await activarPush(usuarioId)
    setTrabajando(false)
    if (!r.ok) {
      if (r.error === 'Permiso denegado') {
        setEstado('denegado')
        toast.error('Has denegado el permiso. Cámbialo en los ajustes del navegador.')
      } else {
        toast.error('No se pudo activar: ' + (r.error || 'error'))
      }
      return
    }
    toast.success('Notificaciones activadas en este dispositivo')
    setEstado('activo')
  }

  async function desactivar() {
    setTrabajando(true)
    await desactivarPush(usuarioId)
    setTrabajando(false)
    toast.success('Notificaciones desactivadas en este dispositivo')
    setEstado('inactivo')
  }

  if (estado === 'cargando') {
    return <div className="text-xs text-gray-400">Comprobando…</div>
  }

  if (estado === 'no-soportado') {
    return (
      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-3">
        Tu navegador no soporta notificaciones push. En iPhone necesitas iOS 16.4+ y
        haber añadido la app a la pantalla de inicio.
      </div>
    )
  }

  if (estado === 'denegado') {
    return (
      <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <div className="font-semibold mb-1">⚠️ Permiso bloqueado</div>
        Tienes las notificaciones bloqueadas para este sitio. Para activarlas, ve a
        los ajustes del navegador (candado en la barra de direcciones → Permisos →
        Notificaciones → Permitir) y vuelve a esta página.
      </div>
    )
  }

  if (estado === 'activo') {
    return (
      <div className="flex items-center justify-between gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-green-800">✓ Notificaciones activas</div>
          <div className="text-xs text-green-700">Recibirás avisos en este dispositivo cuando se cree una alerta crítica.</div>
        </div>
        <button onClick={desactivar} disabled={trabajando}
          className="text-xs font-semibold text-red-600 border border-red-200 bg-white px-3 py-2 rounded-lg disabled:opacity-50">
          {trabajando ? '…' : 'Desactivar'}
        </button>
      </div>
    )
  }

  // inactivo
  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-blue-800">🔔 Activar notificaciones push</div>
        <div className="text-xs text-blue-700">
          Aviso instantáneo en este dispositivo aunque la app esté cerrada.
        </div>
      </div>
      <button onClick={activar} disabled={trabajando}
        className="text-xs font-semibold text-white bg-blue-600 px-3 py-2 rounded-lg disabled:opacity-50">
        {trabajando ? '…' : 'Activar'}
      </button>
    </div>
  )
}
