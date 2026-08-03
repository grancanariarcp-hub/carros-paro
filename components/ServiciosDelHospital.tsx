'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

/**
 * Servicios de un hospital, con la opción de tomarlos del catálogo.
 *
 * Los servicios sin hospital son plantillas compartidas. Al adoptarlos, el
 * hospital se queda con su propia COPIA: puede renombrarla o desactivarla sin
 * afectar a otros centros, y los informes agrupados por servicio no mezclan
 * datos de hospitales distintos.
 *
 * Hace falta porque sin servicios no se puede asignar uno a un supervisor, y
 * sin eso ni ve sus carros ni se le pueden activar las notificaciones — la
 * restricción perfiles_servicio_coherente lo exige.
 */
export default function ServiciosDelHospital({
  hospitalId,
  hospitalNombre,
}: {
  hospitalId: string
  hospitalNombre?: string
}) {
  const [propios, setPropios]     = useState<any[]>([])
  const [catalogo, setCatalogo]   = useState<any[]>([])
  const [elegidos, setElegidos]   = useState<Set<string>>(new Set())
  const [eligiendo, setEligiendo] = useState(false)
  const [cargando, setCargando]   = useState(true)
  const [copiando, setCopiando]   = useState(false)
  const supabase = createClient()

  async function cargar() {
    setCargando(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('servicios').select('id, nombre, activo')
        .eq('hospital_id', hospitalId).is('deleted_at', null).order('nombre'),
      supabase.from('servicios').select('id, nombre')
        .eq('es_plantilla', true).eq('activo', true).order('nombre'),
    ])
    setPropios(p || [])
    setCatalogo(c || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [hospitalId])

  // Lo que el hospital ya tiene, por nombre: la copia se salta los repetidos,
  // así que marcarlos evita que parezca que no ha pasado nada al pulsar.
  const yaTiene = new Set(propios.map(s => s.nombre.trim().toLowerCase()))

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
      ? 'Ya los tenía todos'
      : `${n} servicio${n !== 1 ? 's' : ''} añadido${n !== 1 ? 's' : ''}`)
    setElegidos(new Set())
    setEligiendo(false)
    await cargar()
  }

  function alternar(id: string) {
    setElegidos(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  if (cargando) {
    return <div className="text-xs text-gray-400 py-2">Cargando servicios…</div>
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
          Servicios de {hospitalNombre || 'este hospital'} ({propios.length})
        </div>
        {!eligiendo && (
          <button onClick={() => setEligiendo(true)} className="sa-btn sa-btn-sec sa-btn-mini">
            + Añadir del catálogo
          </button>
        )}
      </div>

      {propios.length === 0 && !eligiendo && (
        <div style={{ fontSize: '0.72rem', color: '#b45309', background: '#fffbeb',
                      border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.5rem' }}>
          Este hospital no tiene servicios. Sin ellos no se puede asignar servicio
          a un supervisor, y sin servicio un supervisor no ve sus carros.
        </div>
      )}

      {propios.length > 0 && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {propios.map(s => (
            <span key={s.id} style={{
              fontSize: '0.68rem', padding: '0.2rem 0.5rem', borderRadius: '4px',
              background: s.activo ? '#eef2ff' : '#f3f4f6',
              color: s.activo ? '#4338ca' : '#9ca3af',
            }}>
              {s.nombre}
            </span>
          ))}
        </div>
      )}

      {eligiendo && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '0.5rem' }}>
            Elige del catálogo. Se crea una copia propia del hospital, así que
            podrás renombrarla o desactivarla sin afectar a otros centros.
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', maxHeight: '11rem', overflowY: 'auto', marginBottom: '0.75rem' }}>
            {catalogo.map(s => {
              const tiene = yaTiene.has(s.nombre.trim().toLowerCase())
              const marcado = elegidos.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => !tiene && alternar(s.id)}
                  disabled={tiene}
                  title={tiene ? 'El hospital ya lo tiene' : undefined}
                  style={{
                    fontSize: '0.68rem', padding: '0.25rem 0.55rem', borderRadius: '4px',
                    cursor: tiene ? 'default' : 'pointer',
                    border: `1px solid ${marcado ? '#4338ca' : '#e5e7eb'}`,
                    background: tiene ? '#f3f4f6' : marcado ? '#4338ca' : 'white',
                    color: tiene ? '#9ca3af' : marcado ? 'white' : '#374151',
                  }}>
                  {tiene ? '✓ ' : ''}{s.nombre}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => copiar(Array.from(elegidos))}
              disabled={elegidos.size === 0 || copiando}
              className="sa-btn sa-btn-pri sa-btn-mini">
              {copiando ? 'Añadiendo…' : `Añadir ${elegidos.size || ''}`}
            </button>
            <button onClick={() => copiar(null)} disabled={copiando}
              className="sa-btn sa-btn-sec sa-btn-mini">
              Añadir todos
            </button>
            <button onClick={() => { setEligiendo(false); setElegidos(new Set()) }}
              className="sa-btn sa-btn-sec sa-btn-mini">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
