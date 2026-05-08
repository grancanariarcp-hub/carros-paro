'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Editor de preferencias granulares por tipo de alerta y canal (push/email).
 * Lee `notif_tipos jsonb` del perfil. Si un tipo no aparece, se considera
 * activo en ambos canales (default true). Guarda con upsert del jsonb.
 */
const TIPOS = [
  { key: 'carro_no_operativo',          label: 'Carro no operativo',          icon: '🚨' },
  { key: 'equipo_mantenimiento_vencido', label: 'Mantenimiento vencido',      icon: '🔧' },
  { key: 'equipo_calibracion_vencida',  label: 'Calibración vencida',         icon: '📐' },
  { key: 'material_caducado',           label: 'Material caducado',           icon: '⏳' },
  { key: 'control_vencido',             label: 'Control vencido',             icon: '📅' },
] as const

type Canal = 'push' | 'email'
type Prefs = Record<string, { push?: boolean; email?: boolean }>

export default function NotifTiposEditor({
  perfilId,
  initial,
}: {
  perfilId: string
  initial: Prefs | null | undefined
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial || {})
  const [guardando, setGuardando] = useState(false)
  const supabase = createClient()

  // Si no hay entrada para un tipo, default true. Solo se guarda como false
  // si el usuario lo desmarca explícitamente.
  function activo(tipo: string, canal: Canal): boolean {
    return prefs[tipo]?.[canal] !== false
  }

  function toggle(tipo: string, canal: Canal) {
    setPrefs((p) => {
      const actual = activo(tipo, canal)
      const nuevoValor = !actual
      const tipoActual = p[tipo] || {}
      // Si vuelve a true, borramos la entrada (default es true) para limpiar
      const tipoNuevo: { push?: boolean; email?: boolean } = { ...tipoActual }
      if (nuevoValor === true) {
        delete tipoNuevo[canal]
      } else {
        tipoNuevo[canal] = false
      }
      const next = { ...p }
      if (Object.keys(tipoNuevo).length === 0) {
        delete next[tipo]
      } else {
        next[tipo] = tipoNuevo
      }
      return next
    })
  }

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase
      .from('perfiles')
      .update({ notif_tipos: prefs })
      .eq('id', perfilId)
    setGuardando(false)
    if (error) {
      toast.error('Error al guardar preferencias: ' + error.message)
      return
    }
    toast.success('Preferencias guardadas')
  }

  return (
    <div className="card">
      <div className="section-title mb-2">Tipos de alerta</div>
      <div className="text-xs text-gray-500 mb-3">
        Marca las casillas para recibir cada tipo de alerta por email o push. Por
        defecto recibes todas — desmarca solo las que quieras silenciar.
      </div>

      <div className="overflow-hidden border border-gray-100 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Tipo</th>
              <th className="px-2 py-2 font-semibold w-16">Email</th>
              <th className="px-2 py-2 font-semibold w-16">Push</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS.map((t, i) => (
              <tr key={t.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-3 py-2.5 flex items-center gap-2">
                  <span className="text-base">{t.icon}</span>
                  <span className="text-xs">{t.label}</span>
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600"
                    checked={activo(t.key, 'email')}
                    onChange={() => toggle(t.key, 'email')}
                  />
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600"
                    checked={activo(t.key, 'push')}
                    onChange={() => toggle(t.key, 'push')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={guardar}
        disabled={guardando}
        className="btn-primary w-full mt-3 text-sm">
        {guardando ? 'Guardando…' : 'Guardar preferencias'}
      </button>
    </div>
  )
}
