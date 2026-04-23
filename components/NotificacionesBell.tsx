'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Notificacion {
  id: string
  tipo: string
  titulo: string
  mensaje?: string
  leida: boolean
  accion_url?: string
  creado_en: string
}

const iconoTipo: Record<string, string> = {
  carro_no_operativo: '🚨',
  vencimiento_proximo: '⏰',
  control_vencido: '📅',
  usuario_creado: '👤',
  usuario_aprobado: '✅',
  carro_creado: '🛒',
  informe_generado: '📊',
  sistema: 'ℹ️',
}

const colorTipo: Record<string, string> = {
  carro_no_operativo: 'border-l-red-500 bg-red-50',
  vencimiento_proximo: 'border-l-amber-500 bg-amber-50',
  control_vencido: 'border-l-orange-500 bg-orange-50',
  usuario_creado: 'border-l-blue-500 bg-blue-50',
  usuario_aprobado: 'border-l-green-500 bg-green-50',
  carro_creado: 'border-l-blue-500 bg-blue-50',
  informe_generado: 'border-l-purple-500 bg-purple-50',
  sistema: 'border-l-gray-400 bg-gray-50',
}

function tiempoRelativo(fecha: string): string {
  const diff = Math.floor((new Date().getTime() - new Date(fecha).getTime()) / 1000)
  if (diff < 60) return 'Ahora mismo'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  return `Hace ${Math.floor(diff / 86400)} días`
}

export default function NotificacionesBell({ usuarioId }: { usuarioId: string }) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [abierto, setAbierto] = useState(false)
  const [loading, setLoading] = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const noLeidas = notificaciones.filter(n => !n.leida).length

  useEffect(() => {
    cargar()
    // Cerrar panel al hacer clic fuera
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [usuarioId])

  // Suscripción en tiempo real
  useEffect(() => {
    const channel = supabase
      .channel('notificaciones')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notificaciones',
        filter: `usuario_id=eq.${usuarioId}`,
      }, (payload) => {
        setNotificaciones(prev => [payload.new as Notificacion, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [usuarioId])

  async function cargar() {
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('usuario_id', usuarioId)
      .order('creado_en', { ascending: false })
      .limit(20)
    setNotificaciones(data || [])
    setLoading(false)
  }

  async function marcarLeida(id: string) {
    await supabase.from('notificaciones').update({ leida: true }).eq('id', id)
    setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
  }

  async function marcarTodasLeidas() {
    await supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', usuarioId).eq('leida', false)
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })))
  }

  async function handleNotificacion(n: Notificacion) {
    if (!n.leida) await marcarLeida(n.id)
    setAbierto(false)
    if (n.accion_url) router.push(n.accion_url)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Botón campana */}
      <button
        onClick={() => setAbierto(!abierto)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white active:bg-gray-50"
      >
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13.73 21a2 2 0 01-3.46 0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {noLeidas > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {/* Panel de notificaciones */}
      {abierto && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="font-semibold text-sm">Notificaciones</div>
            <div className="flex items-center gap-2">
              {noLeidas > 0 && (
                <button onClick={marcarTodasLeidas}
                  className="text-xs text-blue-600 font-semibold">
                  Marcar todas leídas
                </button>
              )}
              <span className="badge bg-gray-100 text-gray-600">{notificaciones.length}</span>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="text-xs text-gray-400 text-center py-8">Cargando...</div>
            )}
            {!loading && notificaciones.length === 0 && (
              <div className="text-center py-10">
                <div className="text-2xl mb-2">🔔</div>
                <div className="text-sm font-semibold text-gray-600">Sin notificaciones</div>
                <div className="text-xs text-gray-400 mt-1">Todo está en orden</div>
              </div>
            )}
            {notificaciones.map(n => (
              <div
                key={n.id}
                onClick={() => handleNotificacion(n)}
                className={`flex gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors border-l-4 ${colorTipo[n.tipo] || 'border-l-gray-300 bg-white'} ${!n.leida ? 'opacity-100' : 'opacity-60'}`}
              >
                <div className="text-lg flex-shrink-0 mt-0.5">{iconoTipo[n.tipo] || 'ℹ️'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <div className={`text-xs font-semibold leading-tight ${!n.leida ? 'text-gray-900' : 'text-gray-500'}`}>
                      {n.titulo}
                    </div>
                    {!n.leida && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>}
                  </div>
                  {n.mensaje && (
                    <div className="text-xs text-gray-500 mt-0.5 leading-tight line-clamp-2">{n.mensaje}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.creado_en)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {notificaciones.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => { setAbierto(false) }}
                className="text-xs text-gray-500 text-center w-full">
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
