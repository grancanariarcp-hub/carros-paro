'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Selector para traer servicios del catálogo global al hospital.
 *
 * El catálogo son plantillas compartidas. Al adoptar una, el hospital se queda
 * con su propia COPIA: puede renombrarla o desactivarla sin afectar a otros
 * centros, y los informes agrupados por servicio no mezclan datos.
 *
 * Lo usan tanto el administrador (en Servicios y Unidades) como el superadmin
 * (en la ficha de cada hospital). Quién puede hacerlo lo decide la función
 * copiar_servicios_a_hospital, no este componente.
 */
export default function SelectorCatalogoServicios({
  hospitalId,
  nombresQueYaTiene,
  onAnadidos,
}: {
  hospitalId: string
  /** Nombres que el hospital ya tiene, para marcarlos y no ofrecerlos. */
  nombresQueYaTiene: string[]
  onAnadidos: () => void
}) {
  const [abierto, setAbierto]   = useState(false)
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [copiando, setCopiando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (!abierto || catalogo.length) return
    supabase.from('servicios').select('id, nombre, descripcion')
      .eq('es_plantilla', true).eq('activo', true).order('nombre')
      .then(({ data }) => setCatalogo(data || []))
  }, [abierto])

  const yaTiene = new Set(nombresQueYaTiene.map(n => n.trim().toLowerCase()))

  const visibles = catalogo.filter(s =>
    !busqueda || s.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  // Cuántos quedan por adoptar: si son cero, "Añadir todos" no tiene sentido.
  const disponibles = catalogo.filter(s => !yaTiene.has(s.nombre.trim().toLowerCase()))

  async function copiar(ids: string[] | null) {
    setCopiando(true)
    const { data, error } = await supabase.rpc('copiar_servicios_a_hospital', {
      p_hospital_id: hospitalId,
      p_servicio_ids: ids,
    })
    setCopiando(false)

    if (error) { toast.error(error.message); return }
    const n = Number(data ?? 0)
    toast.success(n === 0
      ? 'Ya los tenías todos'
      : `${n} servicio${n !== 1 ? 's' : ''} añadido${n !== 1 ? 's' : ''}`)
    setElegidos(new Set())
    setAbierto(false)
    setBusqueda('')
    onAnadidos()
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="btn-secondary">
        📚 Añadir del catálogo
      </button>
    )
  }

  return (
    <div className="card" style={{ borderColor: '#c7d2fe', background: '#eef2ff' }}>
      <div className="text-sm font-bold text-indigo-900 mb-1">Catálogo de servicios</div>
      <p className="text-xs text-indigo-800 mb-3 leading-snug">
        Elige los que use tu centro. Se crea una copia propia, así que luego
        podrás renombrarla o desactivarla sin afectar a otros hospitales.
      </p>

      {catalogo.length > 12 && (
        <input
          className="input mb-2"
          placeholder="Buscar servicio…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      )}

      <div className="flex gap-1.5 flex-wrap mb-3 overflow-y-auto" style={{ maxHeight: '13rem' }}>
        {visibles.map(s => {
          const tiene = yaTiene.has(s.nombre.trim().toLowerCase())
          const marcado = elegidos.has(s.id)
          return (
            <button
              key={s.id}
              disabled={tiene}
              title={tiene ? 'Ya lo tienes' : s.descripcion || undefined}
              onClick={() => setElegidos(prev => {
                const n = new Set(prev)
                n.has(s.id) ? n.delete(s.id) : n.add(s.id)
                return n
              })}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                tiene      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-default'
                : marcado  ? 'bg-indigo-600 text-white border-indigo-600'
                           : 'bg-white text-gray-700 border-gray-200 active:bg-gray-50'
              }`}>
              {tiene ? '✓ ' : ''}{s.nombre}
            </button>
          )
        })}
        {visibles.length === 0 && (
          <div className="text-xs text-gray-400 py-2">Ningún servicio coincide.</div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => copiar(Array.from(elegidos))}
          disabled={elegidos.size === 0 || copiando} className="btn-primary">
          {copiando ? 'Añadiendo…' : `Añadir ${elegidos.size || ''}`}
        </button>
        {disponibles.length > 0 && (
          <button onClick={() => copiar(null)} disabled={copiando} className="btn-secondary">
            Añadir los {disponibles.length} que faltan
          </button>
        )}
        <button onClick={() => { setAbierto(false); setElegidos(new Set()); setBusqueda('') }}
          className="btn-secondary">
          Cancelar
        </button>
      </div>
    </div>
  )
}
