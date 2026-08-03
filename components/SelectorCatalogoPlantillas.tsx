'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Trae plantillas de carro del catálogo compartido al hospital.
 *
 * Montar una lista de comprobación desde cero son decenas de ítems y hacerlo
 * mal se paga en una parada. Al adoptarla, el hospital se queda con su COPIA:
 * puede ajustar cantidades o añadir secciones sin tocar la de otro centro.
 *
 * Quién puede adoptar lo decide copiar_plantilla_a_hospital, no este
 * componente.
 */
export default function SelectorCatalogoPlantillas({
  hospitalId,
  onAdoptada,
}: {
  hospitalId: string
  onAdoptada: () => void
}) {
  const [abierto, setAbierto]   = useState(false)
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado]   = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!abierto || catalogo.length) return
    setCargando(true)

    ;(async () => {
      const { data } = await supabase.from('plantillas')
        .select('id, nombre, descripcion')
        .eq('es_plantilla', true).eq('activo', true).is('deleted_at', null).order('nombre')

      // Cuántas secciones e ítems trae cada una: sin eso, la lista son nombres
      // sueltos y no hay forma de saber cuál sirve.
      const ids = (data || []).map(p => p.id)
      const { data: secs } = ids.length
        ? await supabase.from('plantilla_secciones').select('id, plantilla_id').in('plantilla_id', ids)
        : { data: [] as any[] }
      const { data: its } = secs?.length
        ? await supabase.from('plantilla_items').select('seccion_id').in('seccion_id', secs.map(s => s.id))
        : { data: [] as any[] }

      const porPlantilla = new Map<string, string[]>()
      for (const s of secs || []) {
        const l = porPlantilla.get(s.plantilla_id) || []
        l.push(s.id); porPlantilla.set(s.plantilla_id, l)
      }
      const porSeccion = new Map<string, number>()
      for (const i of its || []) porSeccion.set(i.seccion_id, (porSeccion.get(i.seccion_id) || 0) + 1)

      setCatalogo((data || []).map(p => {
        const s = porPlantilla.get(p.id) || []
        return { ...p, secciones: s.length, items: s.reduce((n, x) => n + (porSeccion.get(x) || 0), 0) }
      }))
      setCargando(false)
    })()
  }, [abierto])

  async function adoptar(p: any) {
    setOcupado(p.id)
    const { error } = await supabase.rpc('copiar_plantilla_a_hospital', {
      p_hospital_id: hospitalId, p_plantilla_id: p.id, p_nombre: null,
    })
    setOcupado(null)

    if (error) { toast.error(error.message); return }
    toast.success(`"${p.nombre}" añadida con su lista de comprobación`)
    setAbierto(false)
    onAdoptada()
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
      <div className="text-sm font-bold text-indigo-900 mb-1">Catálogo de plantillas</div>
      <p className="text-xs text-indigo-800 mb-3 leading-snug">
        Listas de comprobación ya preparadas. Al añadir una te quedas con tu
        propia copia: podrás ajustar cantidades y secciones sin afectar a otros
        hospitales.
      </p>

      {cargando && <div className="text-xs text-gray-400 py-2">Cargando…</div>}

      {!cargando && catalogo.length === 0 && (
        <div className="text-xs text-gray-500 py-2">
          El catálogo está vacío todavía.
        </div>
      )}

      <div className="flex flex-col gap-1.5 mb-3 overflow-y-auto" style={{ maxHeight: '15rem' }}>
        {catalogo.map(p => (
          <div key={p.id}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-800 truncate">{p.nombre}</div>
              <div className="text-gray-400" style={{ fontSize: '0.66rem' }}>
                {p.secciones === 0
                  ? 'sin secciones'
                  : `${p.secciones} sección${p.secciones !== 1 ? 'es' : ''} · ${p.items} ítem${p.items !== 1 ? 's' : ''}`}
              </div>
            </div>
            <button onClick={() => adoptar(p)} disabled={ocupado === p.id}
              className="btn-primary text-xs px-2.5 py-1 flex-shrink-0">
              {ocupado === p.id ? 'Añadiendo…' : 'Añadir'}
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => setAbierto(false)} className="btn-secondary">Cerrar</button>
    </div>
  )
}
